#!/usr/bin/env node
/**
 * @file tools/lighthouse/audit-all.mjs
 * @description Runs Lighthouse against every page listed on the site's own /sitemap
 * and writes one JSON report per page plus a compact summary (summary.md / summary.json).
 *
 * How it works:
 *   1. Opens a visible Chrome window on a throw-away profile (no extensions, so nothing
 *      else adds requests or contrast overlays to the results).
 *   2. Waits while you sign in yourself. The script never sees or types a password; only
 *      the browser holds the session cookie.
 *   3. Reads the links on /sitemap (already filtered to your role) and audits each one in
 *      that same signed-in Chrome.
 *
 * Usage (from this folder, after `npm install`):
 *   node audit-all.mjs                         desktop run of every sitemap page
 *   node audit-all.mjs --form-factor both      desktop and mobile
 *   node audit-all.mjs --only /oversight       only paths containing "/oversight"
 *   node audit-all.mjs --urls /maps,/schedules explicit paths instead of the sitemap
 *   node audit-all.mjs --base http://localhost:3000
 *   node audit-all.mjs --help
 *
 * Output: reports/<timestamp>/ (git-ignored).
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** GET routes that change state or end the session, so they are never audited. */
const SKIP_PATHS = new Set(["/continue-registration/auto", "/logout"]);

/** Lighthouse categories to run. */
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];

/** Score below which a non-accessibility audit is listed in the summary. */
const LIST_BELOW = 0.9;

/** Maximum failing nodes recorded per accessibility audit. */
const MAX_NODES = 8;

/**
 * Print command-line help.
 * @returns {void}
 */
function printUsage() {
    console.log(`Usage: node audit-all.mjs [options]

  --base <url>           Site origin (default http://localhost:3000)
  --form-factor <ff>     desktop | mobile | both (default desktop)
  --only <text>          Only audit paths containing this text
  --urls <a,b,c>         Comma-separated paths to audit instead of reading /sitemap
  --chrome-flags "<..>"  Extra Chrome flags, space separated
  --headless             Run Chrome headless (testing only; you cannot sign in)
  --no-login-wait        Do not pause for sign-in
  -h, --help             Show this help`);
}

/**
 * Parse command-line arguments.
 * @param {string[]} argv - Arguments after the script name.
 * @returns {{base: string, formFactor: string, only: string, urls: string[],
 *            headless: boolean, loginWait: boolean, chromeFlags: string[]}} Options.
 */
function parseArgs(argv) {
    const opts = {
        base: "http://localhost:3000",
        formFactor: "desktop",
        only: "",
        urls: [],
        headless: false,
        loginWait: true,
        chromeFlags: [],
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const value = () => {
            const next = argv[++i];
            if (next === undefined) throw new Error(`Missing value for ${arg}`);
            return next;
        };
        switch (arg) {
            case "--base":
                opts.base = value().replace(/\/+$/, "");
                break;
            case "--form-factor":
                opts.formFactor = value();
                break;
            case "--only":
                opts.only = value();
                break;
            case "--urls":
                opts.urls = value().split(",").map((s) => s.trim()).filter(Boolean);
                break;
            case "--chrome-flags":
                opts.chromeFlags = value().split(/\s+/).filter(Boolean);
                break;
            case "--headless":
                opts.headless = true;
                break;
            case "--no-login-wait":
                opts.loginWait = false;
                break;
            case "-h":
            case "--help":
                printUsage();
                process.exit(0);
                break;
            default:
                throw new Error(`Unknown option: ${arg} (try --help)`);
        }
    }
    if (!["desktop", "mobile", "both"].includes(opts.formFactor)) {
        throw new Error(`--form-factor must be desktop, mobile or both (got "${opts.formFactor}")`);
    }
    return opts;
}

/**
 * Strip a trailing slash so "/maps/" and "/maps" compare equal ("/" stays "/").
 * @param {string} p - URL pathname.
 * @returns {string} Normalised pathname.
 */
function normalisePath(p) {
    return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

/**
 * Turn a URL path into a safe file name.
 * @param {string} p - URL pathname.
 * @returns {string} File-name slug.
 */
function slugify(p) {
    return p === "/" ? "home" : p.replace(/^\/+/, "").replace(/[^a-zA-Z0-9]+/g, "_");
}

/**
 * Read the page paths from the signed-in /sitemap page.
 * @param {number} port - Chrome remote-debugging port.
 * @param {string} base - Site origin.
 * @returns {Promise<string[]>} Unique, normalised paths in sitemap order.
 * @throws {Error} When /sitemap redirects (not signed in) or lists no pages.
 */
async function discoverPaths(port, base) {
    const browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${port}`,
        defaultViewport: null,
    });
    try {
        const page = await browser.newPage();
        await page.goto(`${base}/sitemap`, { waitUntil: "networkidle2", timeout: 30000 });
        const landed = normalisePath(new URL(page.url()).pathname);
        if (landed !== "/sitemap") {
            throw new Error(`Expected /sitemap but landed on ${landed}. Are you signed in?`);
        }
        const hrefs = await page.$$eval("a.sitemap-card-link", (links) =>
            links.map((a) => a.getAttribute("href")),
        );
        await page.close();
        const unique = [...new Set(hrefs.filter((h) => h && h.startsWith("/")).map(normalisePath))];
        if (unique.length === 0) throw new Error("The sitemap page listed no links.");
        return unique;
    } finally {
        await browser.disconnect();
    }
}

/**
 * Run one Lighthouse audit in the already-open Chrome.
 * @param {string} url - Absolute URL to audit.
 * @param {"desktop"|"mobile"} formFactor - Emulation preset.
 * @param {number} port - Chrome remote-debugging port.
 * @returns {Promise<object>} The Lighthouse result (lhr).
 */
async function auditPage(url, formFactor, port) {
    const flags = { port, output: "json", logLevel: "error", onlyCategories: CATEGORIES };
    const config = formFactor === "desktop" ? desktopConfig : undefined;
    const result = await lighthouse(url, flags, config);
    if (!result || !result.lhr) throw new Error("Lighthouse returned no result");
    return result.lhr;
}

/**
 * Poll the site until it answers, so a restarting dev server does not fail an audit.
 * @param {string} base - Site origin.
 * @param {number} timeoutMs - Give up after this many milliseconds.
 * @returns {Promise<boolean>} True once the server responds.
 */
async function waitForServer(base, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${base}/login`, { redirect: "manual", signal: AbortSignal.timeout(3000) });
            if (res.status < 500) return true;
        } catch {
            /* server not up yet */
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return false;
}

/**
 * Audit a page, retrying once if Chrome could not reach the server (for example while
 * nodemon is restarting it).
 * @param {string} url - Absolute URL to audit.
 * @param {"desktop"|"mobile"} formFactor - Emulation preset.
 * @param {number} port - Chrome remote-debugging port.
 * @param {string} base - Site origin.
 * @returns {Promise<object>} The Lighthouse result (lhr).
 */
async function auditWithRetry(url, formFactor, port, base) {
    const lhr = await auditPage(url, formFactor, port);
    const code = lhr.runtimeError && lhr.runtimeError.code;
    if (code !== "CHROME_INTERSTITIAL_ERROR") return lhr;
    console.log("  ...server did not answer; waiting for it to come back");
    if (!(await waitForServer(base, 60000))) return lhr;
    return auditPage(url, formFactor, port);
}

/**
 * Whether an audit has a pass/fail style score below a threshold.
 * @param {object} audit - Lighthouse audit result.
 * @param {number} limit - Score threshold (exclusive).
 * @returns {boolean} True when the audit counts as failing.
 */
function isFailing(audit, limit) {
    const scored = audit.scoreDisplayMode === "binary" || audit.scoreDisplayMode === "numeric";
    return scored && audit.score !== null && audit.score < limit;
}

/**
 * Collapse whitespace and cap length.
 * @param {string} text - Input text.
 * @param {number} max - Maximum characters.
 * @returns {string} Shortened single-line text.
 */
function clip(text, max) {
    const flat = String(text || "").replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Reduce a full Lighthouse result to the fields worth reading.
 * @param {object} lhr - Lighthouse result.
 * @param {string} requestedPath - Path that was requested.
 * @param {string} formFactor - "desktop" or "mobile".
 * @returns {object} Compact record for summary.json / summary.md.
 */
function summarise(lhr, requestedPath, formFactor) {
    const finalPath = normalisePath(new URL(lhr.finalDisplayedUrl || lhr.finalUrl).pathname);
    const record = {
        path: requestedPath,
        formFactor,
        finalPath,
        redirected: finalPath !== requestedPath,
        runtimeError: lhr.runtimeError ? lhr.runtimeError.message : null,
        scores: {},
        metrics: {},
        accessibilityFailures: [],
        otherFindings: [],
    };
    if (record.runtimeError || record.redirected) return record;

    for (const cat of CATEGORIES) {
        const score = lhr.categories[cat] ? lhr.categories[cat].score : null;
        record.scores[cat] = score === null ? null : Math.round(score * 100);
    }
    const audits = lhr.audits;
    record.metrics = {
        fcp: audits["first-contentful-paint"]?.displayValue ?? null,
        lcp: audits["largest-contentful-paint"]?.displayValue ?? null,
        tbt: audits["total-blocking-time"]?.displayValue ?? null,
        cls: audits["cumulative-layout-shift"]?.displayValue ?? null,
        bytes: audits["total-byte-weight"]?.displayValue ?? null,
    };

    for (const ref of lhr.categories.accessibility.auditRefs) {
        const audit = audits[ref.id];
        if (!isFailing(audit, 1)) continue;
        const items = (audit.details && audit.details.items) || [];
        record.accessibilityFailures.push({
            id: ref.id,
            title: audit.title,
            count: items.length,
            nodes: items.slice(0, MAX_NODES).map((item) => {
                const node = item.node || {};
                return {
                    selector: clip(node.selector, 120),
                    snippet: clip(node.snippet, 160),
                    message: clip((node.explanation || "").replace(/^Fix (any|all) of the following:\s*/, ""), 260),
                };
            }),
        });
    }

    for (const cat of ["best-practices", "seo", "performance"]) {
        for (const ref of lhr.categories[cat].auditRefs) {
            const audit = audits[ref.id];
            if (isFailing(audit, LIST_BELOW)) {
                record.otherFindings.push({
                    category: cat,
                    id: ref.id,
                    score: Math.round(audit.score * 100) / 100,
                    detail: clip(audit.displayValue || audit.title, 100),
                });
            }
        }
    }
    return record;
}

/**
 * Render the Markdown summary.
 * @param {object[]} records - Records from summarise().
 * @param {{base: string, version: string, startedAt: string}} meta - Run metadata.
 * @returns {string} Markdown text.
 */
function renderMarkdown(records, meta) {
    const cell = (value) => (value === null || value === undefined ? "-" : String(value));
    const lines = [
        `# Lighthouse audit - ${meta.base}`,
        "",
        `Lighthouse ${meta.version} | started ${meta.startedAt} | ${records.length} runs`,
        "",
        "| Page | Form | Perf | A11y | BP | SEO | LCP | CLS | Note |",
        "|---|---|---|---|---|---|---|---|---|",
    ];
    for (const r of records) {
        let note = "";
        if (r.runtimeError) note = `ERROR: ${clip(r.runtimeError, 80)}`;
        else if (r.redirected) note = `redirected to ${r.finalPath}`;
        lines.push(
            `| ${r.path} | ${r.formFactor} | ${cell(r.scores.performance)} | ${cell(r.scores.accessibility)} | ` +
                `${cell(r.scores["best-practices"])} | ${cell(r.scores.seo)} | ${cell(r.metrics.lcp)} | ` +
                `${cell(r.metrics.cls)} | ${note} |`,
        );
    }

    const withA11y = records.filter((r) => r.accessibilityFailures.length > 0);
    lines.push("", "## Accessibility failures", "");
    if (withA11y.length === 0) lines.push("None.");
    for (const r of withA11y) {
        lines.push(`### ${r.path} (${r.formFactor})`);
        for (const f of r.accessibilityFailures) {
            lines.push(`- **${f.id}** (${f.count}): ${f.title}`);
            for (const n of f.nodes) {
                lines.push(`    - \`${n.selector}\` ${n.message}`);
            }
        }
        lines.push("");
    }

    lines.push("## Other findings (score under 0.9)", "");
    for (const r of records.filter((x) => x.otherFindings.length > 0)) {
        lines.push(`### ${r.path} (${r.formFactor})`);
        for (const f of r.otherFindings) {
            lines.push(`- ${f.category} / ${f.id} (${f.score}): ${f.detail}`);
        }
        lines.push("");
    }
    return lines.join("\n");
}

/**
 * Entry point: launch Chrome, wait for sign-in, audit every page, write reports.
 * @returns {Promise<void>}
 */
async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const chromeFlags = ["--disable-extensions", ...opts.chromeFlags];
    if (opts.headless) chromeFlags.push("--headless=new");

    const chrome = await chromeLauncher.launch({
        startingUrl: `${opts.base}/login`,
        chromeFlags,
    });
    const stop = async () => {
        try {
            await chrome.kill();
        } catch {
            /* already closed */
        }
    };
    process.on("SIGINT", async () => {
        await stop();
        process.exit(130);
    });

    try {
        if (opts.loginWait) {
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            await rl.question("\nSign in in the Chrome window that just opened, then press Enter here to start... ");
            rl.close();
        }

        let paths = opts.urls.length > 0 ? opts.urls.map(normalisePath) : await discoverPaths(chrome.port, opts.base);
        paths = paths.filter((p) => !SKIP_PATHS.has(p) && p.includes(opts.only));
        const formFactors = opts.formFactor === "both" ? ["desktop", "mobile"] : [opts.formFactor];
        console.log(`\nAuditing ${paths.length} pages x ${formFactors.length} form factor(s)\n`);

        const startedAt = new Date();
        const stamp = startedAt.toISOString().slice(0, 16).replace(/[:T]/g, "-");
        const outDir = path.join(__dirname, "reports", stamp);
        fs.mkdirSync(outDir, { recursive: true });

        const records = [];
        let version = "unknown";
        for (const p of paths) {
            for (const ff of formFactors) {
                const label = `${p} (${ff})`;
                try {
                    const lhr = await auditWithRetry(`${opts.base}${p}`, ff, chrome.port, opts.base);
                    version = lhr.lighthouseVersion;
                    fs.writeFileSync(path.join(outDir, `${slugify(p)}.${ff}.json`), JSON.stringify(lhr));
                    const rec = summarise(lhr, p, ff);
                    records.push(rec);
                    if (rec.runtimeError) console.log(`  ERROR  ${label}: ${clip(rec.runtimeError, 100)}`);
                    else if (rec.redirected) console.log(`  SKIP   ${label}: redirected to ${rec.finalPath} (signed out?)`);
                    else {
                        const s = rec.scores;
                        console.log(
                            `  ok     ${label}  perf ${s.performance}  a11y ${s.accessibility}  bp ${s["best-practices"]}  seo ${s.seo}` +
                                (rec.accessibilityFailures.length ? `  [${rec.accessibilityFailures.length} a11y issue(s)]` : ""),
                        );
                    }
                } catch (err) {
                    records.push({
                        path: p, formFactor: ff, finalPath: p, redirected: false,
                        runtimeError: err.message, scores: {}, metrics: {},
                        accessibilityFailures: [], otherFindings: [],
                    });
                    console.log(`  ERROR  ${label}: ${clip(err.message, 100)}`);
                }
            }
        }

        const meta = { base: opts.base, version, startedAt: startedAt.toISOString() };
        fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify({ meta, records }, null, 2));
        fs.writeFileSync(path.join(outDir, "summary.md"), renderMarkdown(records, meta));
        console.log(`\nDone. Summary: ${path.join(outDir, "summary.md")}`);
    } finally {
        await stop();
    }
}

main().catch((err) => {
    console.error(`\n${err.message}`);
    process.exit(1);
});
