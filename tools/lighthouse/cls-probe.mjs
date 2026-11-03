#!/usr/bin/env node
/**
 * @file tools/lighthouse/cls-probe.mjs
 * @description Finds out what is causing layout shift (CLS) on a page. For every shift the
 * browser reports, it prints which element moved, where it moved from and to, and which
 * network requests (API calls, fonts, background images) finished just before it.
 *
 * Lighthouse only says "this element shifted". This probe adds the missing half: the
 * before/after position of the element and the event that triggered it, so the fix
 * (reserve space, preload a font, move an element) is obvious.
 *
 * How it works:
 *   1. Opens a visible Chrome window on a throw-away profile (no extensions).
 *   2. Waits while you sign in yourself. The script never sees or types a password.
 *   3. Loads each page with the cache disabled (like Lighthouse's cold load), records every
 *      layout-shift entry plus nearby fetch/font/image completions, and waits a few seconds
 *      so late data loads are included.
 *
 * Usage (from this folder, after `npm install`):
 *   node cls-probe.mjs                                   the pages with known shift, desktop
 *   node cls-probe.mjs --urls /oversight/tools/contacts  explicit paths (comma separated)
 *   node cls-probe.mjs --viewport both                   desktop and mobile
 *   node cls-probe.mjs --base https://albanyjwparking.org
 *   node cls-probe.mjs --settle 8000                     wait longer after load (ms)
 *   node cls-probe.mjs --help
 *
 * Output: printed summary plus reports/cls-<timestamp>/<page>.<viewport>.json (git-ignored).
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

import * as chromeLauncher from "chrome-launcher";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** GET routes that change state or end the session, so they are never loaded. */
const SKIP_PATHS = new Set(["/continue-registration/auto", "/logout"]);

/** Pages that showed desktop CLS above 0.15 in the production audit. */
const DEFAULT_PATHS = [
    "/",
    "/oversight/tools/notes-report",
    "/oversight/tools/contacts",
    "/oversight/tools/shift-alerts",
    "/oversight/tools/conflict-grid",
    "/oversight/tools/capacity-alerts",
    "/oversight/tools/oversightstructure",
    "/oversight/tools/system-variables",
    "/oversight/tools/schedule-rules",
];

/** Viewports matching the Lighthouse desktop and mobile presets. */
const VIEWPORTS = {
    desktop: { width: 1350, height: 940, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
    mobile: { width: 412, height: 823, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true },
};

/** How far back (ms) a finished request counts as "nearby" a shift (data usually renders a beat after it arrives). */
const NEARBY_BEFORE_MS = 1000;

/** How far after (ms) a shift a finished request still counts as "nearby". */
const NEARBY_AFTER_MS = 60;

/**
 * Print command-line help.
 * @returns {void}
 */
function printUsage() {
    console.log(`Usage: node cls-probe.mjs [options]

  --base <url>           Site origin (default http://localhost:3000)
  --urls <a,b,c>         Comma-separated paths (default: the pages with known layout shift)
  --viewport <v>         desktop | mobile | both (default desktop)
  --settle <ms>          Wait after the load event so late data is captured (default 5000)
  --chrome-flags "<..>"  Extra Chrome flags, space separated
  --headless             Run Chrome headless (testing only; you cannot sign in)
  --no-login-wait        Do not pause for sign-in
  -h, --help             Show this help`);
}

/**
 * Parse command-line arguments.
 * @param {string[]} argv - Arguments after the script name.
 * @returns {{base: string, urls: string[], viewport: string, settle: number,
 *            chromeFlags: string[], headless: boolean, loginWait: boolean}} Options.
 * @throws {Error} On an unknown option or an invalid value.
 */
function parseArgs(argv) {
    const opts = {
        base: "http://localhost:3000",
        urls: [],
        viewport: "desktop",
        settle: 5000,
        chromeFlags: [],
        headless: false,
        loginWait: true,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const value = () => {
            i += 1;
            if (argv[i] === undefined) throw new Error(`${arg} needs a value`);
            return argv[i];
        };
        switch (arg) {
            case "--base":
                opts.base = value().replace(/\/+$/, "");
                break;
            case "--urls":
                opts.urls = value().split(",").map((s) => s.trim()).filter(Boolean);
                break;
            case "--viewport":
                opts.viewport = value();
                break;
            case "--settle":
                opts.settle = Number(value());
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
    if (!["desktop", "mobile", "both"].includes(opts.viewport)) {
        throw new Error(`--viewport must be desktop, mobile or both (got "${opts.viewport}")`);
    }
    if (!Number.isFinite(opts.settle) || opts.settle < 0) {
        throw new Error("--settle must be a number of milliseconds");
    }
    return opts;
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
 * Runs inside the page before any of its scripts. Starts recording layout shifts, paint
 * times and font loads into window.__clsProbe. Must be self-contained: it is serialised
 * and sent to the browser, so it cannot use anything from this module.
 * @returns {void}
 */
function installProbe() {
    const probe = { shifts: [], paints: {}, fonts: [] };
    window.__clsProbe = probe;

    const describe = (node) => {
        if (!node) return "(removed)";
        if (node.nodeType !== 1) return `text in ${describe(node.parentElement)}`;
        const parts = [];
        let el = node;
        for (let depth = 0; el && el.nodeType === 1 && depth < 3; depth += 1) {
            let label = el.tagName.toLowerCase();
            if (el.id) label += `#${el.id}`;
            else if (el.classList.length) label += `.${[...el.classList].slice(0, 2).join(".")}`;
            parts.unshift(label);
            if (el.id) break;
            el = el.parentElement;
        }
        return parts.join(" > ");
    };

    const rect = (r) =>
        r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null;

    try {
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                probe.shifts.push({
                    t: Math.round(entry.startTime),
                    value: entry.value,
                    recentInput: entry.hadRecentInput,
                    sources: (entry.sources || []).map((s) => ({
                        node: describe(s.node),
                        prev: rect(s.previousRect),
                        curr: rect(s.currentRect),
                    })),
                });
            }
        }).observe({ type: "layout-shift", buffered: true });

        new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) probe.paints[entry.name] = Math.round(entry.startTime);
        }).observe({ type: "paint", buffered: true });
    } catch (err) {
        probe.error = String(err);
    }

    if (document.fonts && document.fonts.addEventListener) {
        document.fonts.addEventListener("loadingdone", (event) => {
            probe.fonts.push({
                t: Math.round(performance.now()),
                faces: [...event.fontfaces].map((f) => `${f.family} ${f.style}`),
            });
        });
    }
}

/**
 * Runs inside the page after the settle wait. Returns what installProbe recorded plus
 * navigation timing and the completion times of requests that can cause a shift.
 * Must be self-contained (serialised and sent to the browser).
 * @returns {{shifts: object[], paints: object, fonts: object[], nav: object, resources: object[]}} Probe data.
 */
function collectProbe() {
    const probe = window.__clsProbe || { shifts: [], paints: {}, fonts: [] };
    const nav = performance.getEntriesByType("navigation")[0];
    const wanted = new Set(["fetch", "xmlhttprequest", "css", "img", "link"]);
    const resources = performance
        .getEntriesByType("resource")
        .filter((r) => wanted.has(r.initiatorType))
        .map((r) => ({
            url: r.name.replace(location.origin, "").slice(0, 90),
            type: r.initiatorType,
            end: Math.round(r.responseEnd),
            kb: Math.round((r.transferSize || 0) / 1024),
        }));
    return {
        shifts: probe.shifts,
        paints: probe.paints,
        fonts: probe.fonts,
        error: probe.error || null,
        nav: nav
            ? { domContentLoaded: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd) }
            : {},
        resources,
    };
}

/**
 * CLS the way Chrome and Lighthouse compute it: the worst "session window" of shifts
 * (shifts less than 1 s apart, window no longer than 5 s), ignoring shifts right after input.
 * @param {{t: number, value: number, recentInput: boolean}[]} shifts - Recorded shifts.
 * @returns {number} Largest session-window total.
 */
function sessionWindowCls(shifts) {
    let best = 0;
    let current = 0;
    let windowStart = 0;
    let last = 0;
    for (const s of shifts.filter((x) => !x.recentInput)) {
        if (current > 0 && (s.t - last > 1000 || s.t - windowStart > 5000)) {
            current = 0;
        }
        if (current === 0) windowStart = s.t;
        current += s.value;
        last = s.t;
        best = Math.max(best, current);
    }
    return best;
}

/**
 * Load one page with a cold cache, wait, and collect the probe data.
 * @param {import("puppeteer-core").Browser} browser - Connected browser.
 * @param {string} base - Site origin.
 * @param {string} p - Page path.
 * @param {"desktop"|"mobile"} viewportName - Viewport preset.
 * @param {number} settleMs - Wait after the load event (ms).
 * @returns {Promise<object>} Probe data plus path, landed path and viewport.
 */
async function probePage(browser, base, p, viewportName, settleMs) {
    const page = await browser.newPage();
    try {
        await page.setViewport(VIEWPORTS[viewportName]);
        await page.setCacheEnabled(false);
        await page.evaluateOnNewDocument(installProbe);
        await page.goto(`${base}${p}`, { waitUntil: "load", timeout: 60000 });
        await new Promise((resolve) => setTimeout(resolve, settleMs));
        const landed = new URL(page.url()).pathname;
        const data = await page.evaluate(collectProbe);
        return { path: p, landed, viewport: viewportName, ...data };
    } finally {
        await page.close();
    }
}

/**
 * Format one rectangle's vertical position and size, e.g. "y 120 h 340".
 * @param {{y: number, h: number}|null} r - Rectangle.
 * @returns {string} Short text.
 */
function fmtRect(r) {
    return r ? `y ${r.y} h ${r.h}` : "(none)";
}

/**
 * Print a readable report for one probed page.
 * @param {object} result - Result from probePage.
 * @returns {void}
 */
function printResult(result) {
    const vp = VIEWPORTS[result.viewport];
    console.log(`\n${result.path}  (${result.viewport} ${vp.width}x${vp.height})`);
    if (result.landed !== result.path.split("?")[0]) {
        console.log(`  REDIRECTED to ${result.landed} (signed out?)`);
        return;
    }
    const fcp = result.paints["first-contentful-paint"];
    console.log(
        `  first paint ${fcp ?? "?"} ms | DOMContentLoaded ${result.nav.domContentLoaded ?? "?"} ms | load ${result.nav.load ?? "?"} ms`,
    );
    const total = result.shifts.filter((s) => !s.recentInput).reduce((sum, s) => sum + s.value, 0);
    console.log(
        `  CLS (worst window) ${sessionWindowCls(result.shifts).toFixed(3)} | sum of all ${total.toFixed(3)} | ${result.shifts.length} shift(s)`,
    );
    if (result.error) console.log(`  probe error: ${result.error}`);

    for (const shift of result.shifts) {
        console.log(`  t=${shift.t} ms  value ${shift.value.toFixed(4)}${shift.recentInput ? "  (after input, ignored)" : ""}`);
        for (const src of shift.sources.slice(0, 4)) {
            const dy = src.prev && src.curr ? src.curr.y - src.prev.y : 0;
            const dh = src.prev && src.curr ? src.curr.h - src.prev.h : 0;
            console.log(
                `      ${src.node}: ${fmtRect(src.prev)} -> ${fmtRect(src.curr)}  (moved ${dy >= 0 ? "+" : ""}${dy}px, height ${dh >= 0 ? "+" : ""}${dh}px)`,
            );
        }
        const nearby = result.resources
            .filter((r) => r.end >= shift.t - NEARBY_BEFORE_MS && r.end <= shift.t + NEARBY_AFTER_MS)
            .sort((a, b) => Math.abs(shift.t - a.end) - Math.abs(shift.t - b.end))
            .slice(0, 4);
        for (const r of nearby) {
            const gap = shift.t - r.end;
            const when = gap >= 0 ? `${gap} ms before the shift` : `${-gap} ms after the shift`;
            console.log(`      nearby: ${r.type} finished ${when}  ${r.url}  (${r.kb} KB)`);
        }
        const fonts = result.fonts.filter((f) => f.t >= shift.t - NEARBY_BEFORE_MS && f.t <= shift.t + NEARBY_AFTER_MS);
        for (const f of fonts) {
            const gap = shift.t - f.t;
            const when = gap >= 0 ? `${gap} ms before the shift` : `${-gap} ms after the shift`;
            console.log(`      nearby: fonts loaded ${when}  ${f.faces.join(", ")}`);
        }
    }
    if (result.shifts.length === 0) console.log("  no layout shifts recorded");
}

/**
 * Print one line per probed page, worst first, so the pages to fix stand out.
 * @param {object[]} results - Results from probePage.
 * @returns {void}
 */
function printSummary(results) {
    const rows = results
        .filter((r) => r.landed === r.path.split("?")[0])
        .map((r) => {
            const biggest = r.shifts
                .filter((s) => !s.recentInput)
                .sort((a, b) => b.value - a.value)[0];
            const src = biggest && biggest.sources[0];
            return {
                cls: sessionWindowCls(r.shifts),
                line: `${sessionWindowCls(r.shifts).toFixed(3)}  ${r.path} (${r.viewport})  ${src ? `${src.node} moved ${src.curr.y - src.prev.y}px at ${biggest.t} ms` : "no shifts"}`,
            };
        })
        .sort((a, b) => b.cls - a.cls);
    if (rows.length === 0) return;
    console.log("\nSummary (worst first):");
    for (const row of rows) console.log(`  ${row.line}`);
}

/**
 * Entry point: launch Chrome, wait for sign-in, probe each page, write the raw data.
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

        const paths = (opts.urls.length > 0 ? opts.urls : DEFAULT_PATHS).filter((p) => !SKIP_PATHS.has(p));
        const viewports = opts.viewport === "both" ? ["desktop", "mobile"] : [opts.viewport];
        console.log(`\nProbing ${paths.length} page(s) x ${viewports.length} viewport(s), cache off, settle ${opts.settle} ms`);

        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
        const outDir = path.join(__dirname, "reports", `cls-${stamp}`);
        fs.mkdirSync(outDir, { recursive: true });

        const results = [];
        const browser = await puppeteer.connect({
            browserURL: `http://127.0.0.1:${chrome.port}`,
            defaultViewport: null,
        });
        try {
            for (const p of paths) {
                for (const vp of viewports) {
                    try {
                        const result = await probePage(browser, opts.base, p, vp, opts.settle);
                        fs.writeFileSync(path.join(outDir, `${slugify(p)}.${vp}.json`), JSON.stringify(result, null, 2));
                        results.push(result);
                        printResult(result);
                    } catch (err) {
                        console.log(`\n${p} (${vp})\n  ERROR: ${err.message}`);
                    }
                }
            }
        } finally {
            await browser.disconnect();
        }
        printSummary(results);
        console.log(`\nDone. Raw data: ${outDir}`);
    } finally {
        await stop();
    }
}

main().catch((err) => {
    console.error(`\n${err.message}`);
    process.exit(1);
});
