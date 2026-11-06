#!/usr/bin/env node
/**
 * @file tools/lighthouse/paint-probe.mjs
 * @description Finds out why a page's first paint is sometimes late. It loads the same page
 * several times, each time with one suspect switched off or changed, and prints when the
 * first paint happened and what the browser was waiting for.
 *
 * Background: on the signed-in Home page, Lighthouse sometimes saw the screen stay white
 * until about 2.3 s and then show everything at once, even though every file had arrived by
 * 0.6 s. Other runs painted the heading at about 1 s and the background photo later. The
 * suspects are the fixed background photo and the blurred "frosted glass" panels, which make
 * the first frame expensive to draw when the photo has already arrived.
 *
 * The suspects are switched off from inside the browser (a style rule or a preload link added
 * before the page starts), so nothing in the site is changed.
 *
 * For every load it records:
 *   - first paint, first contentful paint and largest contentful paint
 *   - when the last render-blocking file (CSS, head scripts) arrived
 *   - when the background photo arrived
 *   - when the page's first animation frame ran
 *   - the longest main-thread frame before the first paint
 *   - whether the window was hidden (a hidden or covered window delays painting)
 *
 * The "wait" figure is first paint minus the arrival of the last render-blocking file. A
 * large wait means something other than the network held the first paint back.
 *
 * Variants are interleaved round by round (not all of one, then all of the next), so slow
 * moments on the machine or the server spread evenly across them.
 *
 * Usage (from this folder, after `npm install`):
 *   node paint-probe.mjs --base https://albanyjwparking.org
 *   node paint-probe.mjs --base https://albanyjwparking.org --rounds 8
 *   node paint-probe.mjs --base https://albanyjwparking.org --variants asis,no-blur,no-photo
 *   node paint-probe.mjs --help
 *
 * Keep the Chrome window visible and leave the mouse alone while it runs.
 *
 * Output: printed table plus reports/paint-<timestamp>/loads.json (git-ignored).
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

import * as chromeLauncher from "chrome-launcher";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Viewports matching the Lighthouse desktop and mobile presets. */
const VIEWPORTS = {
    desktop: { width: 1350, height: 940, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
    mobile: { width: 412, height: 823, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true },
};

/** Path of the Home page background photo. */
const PHOTO_PATH = "/images/parking-lot.jpg";

/** Style rule that turns off every blurred "frosted glass" panel. */
const BLUR_OFF_CSS =
    "*, *::before, *::after { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }";

/** Style rule that stops the background photo being pinned to the window. */
const SCROLL_BG_CSS = "body, body.db-bg { background-attachment: scroll !important; }";

/** Style rule that removes the background photo altogether. */
const NO_PHOTO_CSS = "body.db-bg { background-image: none !important; }";

/**
 * The page variants that can be compared. Each adds a style rule and/or preload links to the
 * page before it starts. "asis" changes nothing and is the baseline.
 * @type {Object<string, {label: string, css: string, preload: string[]}>}
 */
const VARIANTS = {
    asis: { label: "as deployed", css: "", preload: [] },
    "no-blur": { label: "backdrop-filter off", css: BLUR_OFF_CSS, preload: [] },
    "scroll-bg": { label: "background-attachment: scroll", css: SCROLL_BG_CSS, preload: [] },
    "no-photo": { label: "no background photo", css: NO_PHOTO_CSS, preload: [] },
    "preload-photo": { label: "photo preloaded early", css: "", preload: [PHOTO_PATH] },
    lean: { label: "no blur + scroll background", css: `${BLUR_OFF_CSS} ${SCROLL_BG_CSS}`, preload: [] },
};

/**
 * Print command-line help.
 * @returns {void}
 */
function printUsage() {
    const names = Object.entries(VARIANTS)
        .map(([name, v]) => `                         ${name.padEnd(14)} ${v.label}`)
        .join("\n");
    console.log(`Usage: node paint-probe.mjs [options]

  --base <url>           Site origin (default http://localhost:3000)
  --path <path>          Page to load (default /, the signed-in Home page)
  --viewport <v>         mobile | desktop (default mobile)
  --rounds <n>           Loads per variant (default 5)
  --warmup <n>           Extra as-deployed loads first, not counted (default 1)
  --variants <a,b,c>     Which variants to compare (default: all)
${names}
  --settle <ms>          Wait after first paint so the largest paint is captured (default 1500)
  --late <ms>            A first paint later than this counts as "late" (default 1500)
  --chrome-flags "<..>"  Extra Chrome flags, space separated
  --headless             Run Chrome headless (testing only; you cannot sign in)
  --no-login-wait        Do not pause for sign-in
  -h, --help             Show this help`);
}

/**
 * Parse command-line arguments.
 * @param {string[]} argv - Arguments after the script name.
 * @returns {{base: string, path: string, viewport: string, rounds: number, warmup: number,
 *            variants: string[], settle: number, late: number, chromeFlags: string[],
 *            headless: boolean, loginWait: boolean}} Options.
 * @throws {Error} On an unknown option or an invalid value.
 */
function parseArgs(argv) {
    const opts = {
        base: "http://localhost:3000",
        path: "/",
        viewport: "mobile",
        rounds: 5,
        warmup: 1,
        variants: Object.keys(VARIANTS),
        settle: 1500,
        late: 1500,
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
            case "--path":
                opts.path = value();
                break;
            case "--viewport":
                opts.viewport = value();
                break;
            case "--rounds":
                opts.rounds = Number(value());
                break;
            case "--warmup":
                opts.warmup = Number(value());
                break;
            case "--variants":
                opts.variants = value().split(",").map((s) => s.trim()).filter(Boolean);
                break;
            case "--settle":
                opts.settle = Number(value());
                break;
            case "--late":
                opts.late = Number(value());
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
    if (!["mobile", "desktop"].includes(opts.viewport)) {
        throw new Error(`--viewport must be mobile or desktop (got "${opts.viewport}")`);
    }
    for (const [name, v] of [["--rounds", opts.rounds], ["--warmup", opts.warmup], ["--settle", opts.settle], ["--late", opts.late]]) {
        if (!Number.isFinite(v) || v < 0) throw new Error(`${name} must be a non-negative number`);
    }
    if (opts.rounds < 1) throw new Error("--rounds must be at least 1");
    if (!opts.path.startsWith("/")) throw new Error("--path must start with /");
    const unknown = opts.variants.filter((name) => !VARIANTS[name]);
    if (unknown.length > 0) {
        throw new Error(`Unknown variant: ${unknown.join(", ")} (known: ${Object.keys(VARIANTS).join(", ")})`);
    }
    if (opts.variants.length === 0) throw new Error("--variants needs at least one variant");
    return opts;
}

/**
 * Runs inside the page before any of its scripts. Starts recording paint times, the first
 * animation frames, long frames and visibility changes into window.__paintProbe. Must be
 * self-contained: it is serialised and sent to the browser, so it cannot use anything from
 * this module.
 * @returns {void}
 */
function installProbe() {
    const probe = {
        paints: {},
        lcp: null,
        frames: [],
        longFrames: [],
        visibility: [],
        initialVisibility: document.visibilityState,
        error: null,
    };
    window.__paintProbe = probe;

    const describe = (node) => {
        if (!node || node.nodeType !== 1) return "(none)";
        let label = node.tagName.toLowerCase();
        if (node.id) label += `#${node.id}`;
        else if (node.classList.length) label += `.${[...node.classList].slice(0, 2).join(".")}`;
        return label;
    };

    try {
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) probe.paints[entry.name] = Math.round(entry.startTime);
        }).observe({ type: "paint", buffered: true });

        new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                probe.lcp = { t: Math.round(entry.startTime), el: describe(entry.element), url: entry.url || "" };
            }
        }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch (err) {
        probe.error = String(err);
    }

    try {
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (probe.longFrames.length >= 12) return;
                probe.longFrames.push({
                    start: Math.round(entry.startTime),
                    duration: Math.round(entry.duration),
                    renderStart: Math.round(entry.renderStart),
                    styleLayout: Math.round(entry.styleAndLayoutStart),
                });
            }
        }).observe({ type: "long-animation-frame", buffered: true });
    } catch {
        /* Long Animation Frames not supported: the figure is simply left out. */
    }

    const tick = (t) => {
        probe.frames.push(Math.round(t));
        if (probe.frames.length < 4) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    document.addEventListener("visibilitychange", () => {
        probe.visibility.push({ t: Math.round(performance.now()), state: document.visibilityState });
    });
}

/**
 * Runs inside the page before any of its scripts. Adds a style rule and/or preload links to
 * the document as soon as the root element exists, so a variant is in place before the page's
 * own stylesheets. Must be self-contained (serialised and sent to the browser).
 * @param {string} css - Style rules to add (may be empty).
 * @param {string[]} preloads - Image URLs to preload (may be empty).
 * @returns {void}
 */
function installVariant(css, preloads) {
    const apply = () => {
        const root = document.documentElement;
        if (!root) return false;
        for (const href of preloads) {
            const link = document.createElement("link");
            link.rel = "preload";
            link.as = "image";
            link.href = href;
            root.appendChild(link);
        }
        if (css) {
            const style = document.createElement("style");
            style.textContent = css;
            root.appendChild(style);
        }
        return true;
    };
    if (!apply()) {
        const observer = new MutationObserver(() => {
            if (apply()) observer.disconnect();
        });
        observer.observe(document, { childList: true });
    }
}

/**
 * Runs inside the page after the load. Returns what installProbe recorded plus navigation
 * timing and the arrival times of the files that can hold back or follow the first paint.
 * Must be self-contained (serialised and sent to the browser).
 * @returns {object} Probe data.
 */
function collectProbe() {
    const probe = window.__paintProbe || { paints: {}, lcp: null, frames: [], longFrames: [], visibility: [], error: "probe missing" };
    const nav = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    const blocking = resources.filter((r) => r.renderBlockingStatus === "blocking");
    const photo = resources.find((r) => r.name.includes("/images/parking-lot.jpg"));
    return {
        paints: probe.paints,
        lcp: probe.lcp,
        frames: probe.frames,
        longFrames: probe.longFrames,
        visibility: probe.visibility,
        initialVisibility: probe.initialVisibility || null,
        error: probe.error || null,
        dashboard: Boolean(document.body && document.body.classList.contains("db-bg")),
        domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
        load: nav ? Math.round(nav.loadEventEnd) : null,
        renderBlockingKnown: resources.some((r) => "renderBlockingStatus" in r),
        lastBlockingEnd: blocking.length > 0 ? Math.round(Math.max(...blocking.map((r) => r.responseEnd))) : null,
        blockingCount: blocking.length,
        photoEnd: photo ? Math.round(photo.responseEnd) : null,
    };
}

/**
 * Pause for a number of milliseconds.
 * @param {number} ms - Delay.
 * @returns {Promise<void>} Resolves after the delay.
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Load the page once with a cold cache, wait for the first contentful paint plus a short
 * settle, and collect the probe data with a few derived figures.
 * @param {import("puppeteer-core").Browser} browser - Connected browser.
 * @param {string} base - Site origin.
 * @param {string} p - Page path.
 * @param {"desktop"|"mobile"} viewportName - Viewport preset.
 * @param {string} variantName - Key of VARIANTS.
 * @param {number} settleMs - Wait after the first contentful paint (ms).
 * @returns {Promise<object>} Probe data, derived figures, and the landed path.
 */
async function probeLoad(browser, base, p, viewportName, variantName, settleMs) {
    const variant = VARIANTS[variantName];
    const page = await browser.newPage();
    try {
        await page.setViewport(VIEWPORTS[viewportName]);
        await page.setCacheEnabled(false);
        await page.bringToFront();
        await page.evaluateOnNewDocument(installProbe);
        if (variant.css || variant.preload.length > 0) {
            await page.evaluateOnNewDocument(installVariant, variant.css, variant.preload);
        }
        await page.goto(`${base}${p}`, { waitUntil: "load", timeout: 60000 });
        let painted = true;
        try {
            await page.waitForFunction(
                () => Boolean(window.__paintProbe && window.__paintProbe.paints["first-contentful-paint"]),
                { timeout: 15000 },
            );
        } catch {
            painted = false;
        }
        await sleep(settleMs);
        const landed = new URL(page.url()).pathname;
        const data = await page.evaluate(collectProbe);

        const firstPaint = data.paints["first-paint"] ?? null;
        const fcp = data.paints["first-contentful-paint"] ?? null;
        const longest = data.longFrames
            .filter((f) => fcp === null || f.start <= fcp)
            .reduce((max, f) => Math.max(max, f.duration), 0);
        return {
            ...data,
            lcpDetail: data.lcp,
            variant: variantName,
            path: p,
            landed,
            viewport: viewportName,
            painted,
            firstPaint,
            fcp,
            lcp: data.lcp ? data.lcp.t : null,
            wait: fcp !== null && data.lastBlockingEnd !== null ? fcp - data.lastBlockingEnd : null,
            photoBeforePaint: data.photoEnd !== null && fcp !== null ? data.photoEnd < fcp : null,
            firstFrame: data.frames.length > 0 ? data.frames[0] : null,
            longestFrame: longest,
            windowHidden: data.initialVisibility !== "visible" || data.visibility.length > 0,
        };
    } finally {
        await page.close();
    }
}

/**
 * Build the load order: variants are interleaved round by round, and the starting variant
 * rotates each round so no variant always loads first or last.
 * @param {string[]} names - Variant names.
 * @param {number} rounds - Loads per variant.
 * @returns {{round: number, variant: string}[]} Ordered plan.
 */
function planLoads(names, rounds) {
    const plan = [];
    for (let r = 0; r < rounds; r += 1) {
        for (let i = 0; i < names.length; i += 1) {
            plan.push({ round: r + 1, variant: names[(i + r) % names.length] });
        }
    }
    return plan;
}

/**
 * Median of a list of numbers.
 * @param {number[]} values - Numbers (not empty).
 * @returns {number} The median.
 */
function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Format a number for a table cell, or "-" when it is missing.
 * @param {number|null|undefined} n - Number.
 * @returns {string} Text.
 */
function num(n) {
    return n === null || n === undefined ? "-" : String(Math.round(n));
}

/**
 * Print one line describing a single load.
 * @param {string} tag - Label such as "warm-up" or "r2".
 * @param {object} r - Result from probeLoad.
 * @returns {void}
 */
function printLoad(tag, r) {
    const notes = [];
    if (r.landed !== r.path.split("?")[0]) notes.push(`REDIRECTED to ${r.landed} (signed out?)`);
    if (!r.painted) notes.push("no paint within 15 s");
    if (r.windowHidden) notes.push("WINDOW WAS HIDDEN");
    if (r.error) notes.push(`probe error: ${r.error}`);
    console.log(
        `  ${tag.padEnd(8)} ${r.variant.padEnd(14)} first paint ${num(r.fcp).padStart(5)} | LCP ${num(r.lcp).padStart(5)}` +
            ` | last blocking file ${num(r.lastBlockingEnd).padStart(5)} | wait ${num(r.wait).padStart(5)}` +
            ` | photo ${num(r.photoEnd).padStart(5)} | 1st frame ${num(r.firstFrame).padStart(5)}` +
            ` | longest frame ${num(r.longestFrame).padStart(4)}${notes.length ? `  <-- ${notes.join("; ")}` : ""}`,
    );
}

/**
 * Print the comparison table: one row per variant, with medians over its counted loads.
 * @param {object[]} results - Counted results (warm-up excluded).
 * @param {string[]} names - Variant names in display order.
 * @param {number} lateMs - First paint later than this counts as late.
 * @returns {void}
 */
function printSummary(results, names, lateMs) {
    console.log(`\nSummary (medians; times in ms; "late" = first paint after ${lateMs} ms):`);
    console.log(
        `  ${"variant".padEnd(14)} ${"loads".padStart(5)} ${"first paint".padStart(11)} ${"(min-max)".padEnd(13)}` +
            ` ${"LCP".padStart(6)} ${"wait".padStart(6)} ${"late".padStart(5)} ${"photo first".padStart(12)}  what it changes`,
    );
    for (const name of names) {
        const rows = results.filter((r) => r.variant === name && r.fcp !== null);
        if (rows.length === 0) {
            console.log(`  ${name.padEnd(14)} ${"0".padStart(5)}  (no usable loads)`);
            continue;
        }
        const fcps = rows.map((r) => r.fcp);
        const lcps = rows.filter((r) => r.lcp !== null).map((r) => r.lcp);
        const waits = rows.filter((r) => r.wait !== null).map((r) => r.wait);
        const late = rows.filter((r) => r.fcp > lateMs).length;
        const photoFirst = rows.filter((r) => r.photoBeforePaint).length;
        console.log(
            `  ${name.padEnd(14)} ${String(rows.length).padStart(5)} ${num(median(fcps)).padStart(11)}` +
                ` ${`(${num(Math.min(...fcps))}-${num(Math.max(...fcps))})`.padEnd(13)}` +
                ` ${num(lcps.length ? median(lcps) : null).padStart(6)} ${num(waits.length ? median(waits) : null).padStart(6)}` +
                ` ${`${late}/${rows.length}`.padStart(5)} ${`${photoFirst}/${rows.length}`.padStart(12)}  ${VARIANTS[name].label}`,
        );
    }
    console.log(`
How to read it:
  - "wait" is first paint minus the arrival of the last render-blocking file. Near zero means
    the network set the first paint. A big wait means something else held it back.
  - "photo first" counts the loads where the background photo arrived before the first paint.
    If the late loads are the ones where it did, the photo's cost is the suspect.
  - If a variant is consistently earlier than "asis", what it switches off is the cause.
  - "1st frame" is when the page's first animation frame ran. If that is early but the first
    paint is late, the delay is in drawing the frame (the graphics side), not in the page's code.
  - The warm-up load is a cold start (first page in a fresh Chrome: graphics shaders compile,
    caches are empty). If only that load is slow and the rest are fast, Chrome was starting up,
    not the site, and a returning visitor will not see it.
  - Any "WINDOW WAS HIDDEN" line means Chrome treated the window as hidden or covered; discard it.`);
}

/**
 * Entry point: launch Chrome, wait for sign-in, run the warm-up and the interleaved loads,
 * print the table and write the raw data.
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
            await rl.question("\nSign in in the Chrome window that just opened, then press Enter here to start (keep that window visible)... ");
            rl.close();
        }

        const plan = planLoads(opts.variants, opts.rounds);
        console.log(
            `\nLoading ${opts.path} (${opts.viewport}) ${plan.length} time(s) across ${opts.variants.length} variant(s), ` +
                `plus ${opts.warmup} warm-up load(s); cache off.`,
        );

        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
        const outDir = path.join(__dirname, "reports", `paint-${stamp}`);
        fs.mkdirSync(outDir, { recursive: true });

        const all = [];
        const counted = [];
        const browser = await puppeteer.connect({
            browserURL: `http://127.0.0.1:${chrome.port}`,
            defaultViewport: null,
        });
        try {
            const jobs = [
                ...Array.from({ length: opts.warmup }, (_, i) => ({ tag: `warm-up${i + 1}`, variant: "asis", counted: false })),
                ...plan.map((j) => ({ tag: `r${j.round}`, variant: j.variant, counted: true })),
            ];
            let warned = false;
            for (const job of jobs) {
                try {
                    const result = await probeLoad(browser, opts.base, opts.path, opts.viewport, job.variant, opts.settle);
                    result.counted = job.counted;
                    result.tag = job.tag;
                    all.push(result);
                    if (job.counted) counted.push(result);
                    printLoad(job.tag, result);
                    if (!warned && !result.dashboard) {
                        warned = true;
                        console.log("  NOTE: this page does not have the signed-in Home layout (body.db-bg), so the style variants will not change it.");
                    }
                } catch (err) {
                    console.log(`  ${job.tag.padEnd(8)} ${job.variant.padEnd(14)} ERROR: ${err.message}`);
                }
            }
        } finally {
            await browser.disconnect();
        }
        fs.writeFileSync(path.join(outDir, "loads.json"), JSON.stringify(all, null, 2));
        printSummary(counted.filter((r) => !r.windowHidden), opts.variants, opts.late);
        const hidden = counted.filter((r) => r.windowHidden).length;
        if (hidden > 0) console.log(`\n${hidden} load(s) with a hidden window were left out of the table.`);
        console.log(`\nDone. Raw data: ${outDir}`);
    } finally {
        await stop();
    }
}

main().catch((err) => {
    console.error(`\n${err.message}`);
    process.exit(1);
});
