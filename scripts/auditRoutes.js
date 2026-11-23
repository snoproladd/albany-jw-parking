/**
 * @file scripts/auditRoutes.js
 * @description Route access audit (multi-department phase 3b).
 *
 * Reads routes/*.js and index.js as text (the app is not started — Express 5
 * does not keep enough path information to inspect routes reliably at
 * runtime) and reports, for every route, how it is gated:
 *
 *   new       requirePermission() with key(s) from src/config/permissions.js
 *             (middleware/requirePermission.js; several keys = any one of them)
 *   legacy    requirePermission() with an old key from src/config/roles.js
 *             (shown with the new keys it maps to)
 *   unknown   requirePermission() with a key that is in neither list
 *   public    marked with publicRoute("reason")
 *   custom    a custom gate middleware (requireRolloverRole, ...)
 *   signedIn  requireAuth only
 *   none      no gate at all
 *
 * Writes the full table to docs/ROUTE_AUDIT.md and prints a summary.
 *
 * Usage (from the repo root):
 *     npm run audit:routes
 *     node scripts/auditRoutes.js --strict    exit 1 unless every route is "new" or "public"
 *                                             (the goal at the end of phase 3d)
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { PERMISSIONS } from "../src/config/roles.js";
import { isKnownPermission, LEGACY_PERMISSION_MAP } from "../src/config/permissions.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");

/** Old permission keys (from the factory matrix). */
const LEGACY_KEYS = new Set(Object.keys(PERMISSIONS.ADMIN ?? {}));

/** Middleware that only plumbs the request (no access decision). */
const PLUMBING = /^(csrfProtection|express\.(json|urlencoded|raw|text)\(.*\)|.*[Uu]pload\b.*|multer.*|bodyParser.*|compression.*)$/s;

/**
 * Advance past a string or template literal starting at `i`.
 *
 * @param {string} s
 * @param {number} i  Index of the opening quote.
 * @returns {number}  Index just after the closing quote.
 */
function skipString(s, i) {
    const quote = s[i];
    let j = i + 1;
    while (j < s.length) {
        const c = s[j];
        if (c === "\\") { j += 2; continue; }
        if (quote === "`" && c === "$" && s[j + 1] === "{") {
            j = skipBalanced(s, j + 1);
            continue;
        }
        if (c === quote) return j + 1;
        j++;
    }
    return j;
}

/**
 * Advance past a balanced (...), [...] or {...} group starting at `i`.
 *
 * @param {string} s
 * @param {number} i  Index of the opening bracket.
 * @returns {number}  Index just after the matching close.
 */
function skipBalanced(s, i) {
    const open = s[i];
    const close = { "(": ")", "[": "]", "{": "}" }[open];
    let depth = 0;
    let j = i;
    while (j < s.length) {
        const c = s[j];
        if (c === "'" || c === '"' || c === "`") { j = skipString(s, j); continue; }
        if (c === "/" && s[j + 1] === "/") { j = s.indexOf("\n", j); if (j === -1) return s.length; continue; }
        if (c === "/" && s[j + 1] === "*") { j = s.indexOf("*/", j + 2); if (j === -1) return s.length; j += 2; continue; }
        if (c === open) depth++;
        else if (c === close) { depth--; if (depth === 0) return j + 1; }
        j++;
    }
    return j;
}

/**
 * Split the text inside a call's parentheses into its top-level arguments.
 *
 * @param {string} inner
 * @returns {string[]}
 */
function splitArgs(inner) {
    const args = [];
    let start = 0;
    let j = 0;
    while (j < inner.length) {
        const c = inner[j];
        if (c === "'" || c === '"' || c === "`") { j = skipString(inner, j); continue; }
        if (c === "/" && inner[j + 1] === "/") { j = inner.indexOf("\n", j); if (j === -1) break; continue; }
        if (c === "/" && inner[j + 1] === "*") { j = inner.indexOf("*/", j + 2); if (j === -1) break; j += 2; continue; }
        if (c === "(" || c === "[" || c === "{") { j = skipBalanced(inner, j); continue; }
        if (c === ",") { args.push(inner.slice(start, j)); start = j + 1; }
        j++;
    }
    args.push(inner.slice(start));
    return args
        .map((a) => a.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").trim())
        .filter((a) => a !== "");
}

/**
 * @typedef {Object} RouteEntry
 * @property {string} file
 * @property {number} line
 * @property {string} method
 * @property {string} path
 * @property {"new"|"legacy"|"unknown"|"public"|"custom"|"signedIn"|"none"} gate
 * @property {string[]} keys        Permission keys used.
 * @property {string[]} mapsTo      New keys the legacy keys map to.
 * @property {string[]} custom      Custom gate names.
 * @property {string} publicReason
 * @property {string[]} inline      Access checks found inside the handler.
 */

/**
 * Find and classify every route defined in one file.
 *
 * @param {string} file  Absolute path.
 * @returns {RouteEntry[]}
 */
function auditFile(file) {
    const src = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    const out = [];
    const callRe = /\b([A-Za-z_$][\w$]*)\.(get|post|put|patch|delete|all)\s*\(/g;

    let m;
    while ((m = callRe.exec(src)) !== null) {
        const open = m.index + m[0].length - 1;
        const end = skipBalanced(src, open);
        const args = splitArgs(src.slice(open + 1, end - 1));
        if (args.length < 2) continue;

        const first = args[0];
        if (!/^(["'`]\/|\[)/.test(first)) continue;   // not a route (req.get("X"), map.get(k) ...)

        const path = first.replace(/^["'`]|["'`]$/g, "");
        const middleware = args.slice(1, -1);
        const handler = args[args.length - 1];

        /** @type {RouteEntry} */
        const entry = {
            file: rel,
            line: src.slice(0, m.index).split("\n").length,
            method: m[2].toUpperCase(),
            path,
            gate: "none",
            keys: [],
            mapsTo: [],
            custom: [],
            publicReason: "",
            inline: [],
        };

        let signedIn = false;
        for (const mw of middleware) {
            // requirePermission("a.b") or requirePermission("a.b", "c.d", ...)
            const perm = mw.match(/^requirePermission\(\s*((?:["'`][\w.]+["'`]\s*,?\s*)+)\)$/);
            const pub = mw.match(/^publicRoute\(\s*["'`]([^"'`]*)["'`]\s*\)$/);
            if (perm) entry.keys.push(...[...perm[1].matchAll(/["'`]([\w.]+)["'`]/g)].map((k) => k[1]));
            else if (pub) entry.publicReason = pub[1];
            else if (mw === "requireAuth") signedIn = true;
            else if (!PLUMBING.test(mw)) entry.custom.push(mw.replace(/\s+/g, " ").slice(0, 60));
        }

        for (const re of [/isRoleAtLeast\(/, /roleLevel\(/, /ROLE_HIERARCHY/, /canAssignRole\(/,
            /canManageAllDepartments\(/, /canStartConventionYear\(/, /isConventionAdmin/, /userRole\s*[!=]==/]) {
            if (re.test(handler)) entry.inline.push(re.source.replace(/\\/g, "").replace(/\(\s*$/, "()"));
        }

        if (entry.keys.length > 0) {
            const unknown = entry.keys.filter((k) => !isKnownPermission(k) && !LEGACY_KEYS.has(k));
            const legacy = entry.keys.filter((k) => LEGACY_KEYS.has(k) && !isKnownPermission(k));
            if (unknown.length > 0) entry.gate = "unknown";
            else if (legacy.length > 0) {
                entry.gate = "legacy";
                entry.mapsTo = [...new Set(legacy.flatMap((k) => LEGACY_PERMISSION_MAP[k] ?? []))];
            } else entry.gate = "new";
        } else if (entry.publicReason) entry.gate = "public";
        else if (entry.custom.length > 0) entry.gate = "custom";
        else if (signedIn) entry.gate = "signedIn";

        out.push(entry);
    }
    return out;
}

/**
 * Escape a value for a Markdown table cell.
 *
 * @param {string} v
 * @returns {string}
 */
function cell(v) {
    return String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/**
 * Run the audit, write docs/ROUTE_AUDIT.md and print the summary.
 *
 * @returns {number} Process exit code.
 */
function main() {
    const files = [
        ...readdirSync(join(ROOT, "routes")).filter((f) => f.endsWith(".js")).sort().map((f) => join(ROOT, "routes", f)),
        join(ROOT, "index.js"),
    ];
    const routes = files.flatMap(auditFile);

    const order = ["unknown", "none", "signedIn", "custom", "legacy", "public", "new"];
    const counts = Object.fromEntries(order.map((g) => [g, routes.filter((r) => r.gate === g).length]));
    const unknownKeys = [...new Set(routes.filter((r) => r.gate === "unknown")
        .flatMap((r) => r.keys.filter((k) => !isKnownPermission(k) && !LEGACY_KEYS.has(k))))];
    const unmappedLegacy = [...LEGACY_KEYS].filter((k) => !(k in LEGACY_PERMISSION_MAP));

    const lines = [];
    lines.push("# Route access audit");
    lines.push("");
    lines.push(`Generated by \`npm run audit:routes\` on ${new Date().toISOString().slice(0, 10)}. Paths are as written in each file (router mount prefixes are not added).`);
    lines.push("");
    lines.push("| Gate | Routes | Meaning |");
    lines.push("|---|---|---|");
    const meaning = {
        unknown: "requirePermission() with a key that doesn't exist — fix",
        none: "no gate at all — add a permission or publicRoute()",
        signedIn: "requireAuth only — needs a permission (phase 3d)",
        custom: "custom gate middleware — convert to a permission (phase 3d)",
        legacy: "old permission key — convert to the new key(s) shown",
        public: "declared public with publicRoute()",
        new: "catalogue permission",
    };
    for (const g of order) lines.push(`| ${g} | ${counts[g]} | ${meaning[g]} |`);
    lines.push(`| **total** | **${routes.length}** | |`);
    if (unknownKeys.length) lines.push("", `**Unknown permission keys:** ${unknownKeys.join(", ")}`);
    if (unmappedLegacy.length) lines.push("", `**Old keys with no entry in LEGACY_PERMISSION_MAP:** ${unmappedLegacy.join(", ")}`);
    lines.push("");

    for (const file of [...new Set(routes.map((r) => r.file))]) {
        const rs = routes.filter((r) => r.file === file);
        lines.push(`## ${file} (${rs.length})`, "");
        lines.push("| Line | Method | Path | Gate | Keys | New keys / notes |");
        lines.push("|---|---|---|---|---|---|");
        for (const r of rs) {
            const notes = [
                r.mapsTo.length ? r.mapsTo.join(", ") : "",
                r.custom.length ? `custom: ${r.custom.join(", ")}` : "",
                r.publicReason ? `public: ${r.publicReason}` : "",
                r.inline.length ? `inline check: ${r.inline.join(", ")}` : "",
            ].filter(Boolean).join("; ");
            lines.push(`| ${r.line} | ${r.method} | \`${cell(r.path)}\` | ${r.gate} | ${cell(r.keys.join(", "))} | ${cell(notes)} |`);
        }
        lines.push("");
    }

    mkdirSync(join(ROOT, "docs"), { recursive: true });
    writeFileSync(join(ROOT, "docs", "ROUTE_AUDIT.md"), lines.join("\n"));

    console.log(`Route audit: ${routes.length} routes in ${files.length} files`);
    for (const g of order) console.log(`  ${g.padEnd(9)} ${String(counts[g]).padStart(4)}  ${meaning[g]}`);
    if (unknownKeys.length) console.log(`  Unknown keys: ${unknownKeys.join(", ")}`);
    if (unmappedLegacy.length) console.log(`  Old keys not in LEGACY_PERMISSION_MAP: ${unmappedLegacy.join(", ")}`);
    console.log("Full table: docs/ROUTE_AUDIT.md");

    if (unknownKeys.length > 0) return 1;
    if (STRICT && routes.some((r) => r.gate !== "new" && r.gate !== "public")) {
        console.log("--strict: some routes are not gated by a catalogue permission or declared public.");
        return 1;
    }
    return 0;
}

process.exitCode = main();
