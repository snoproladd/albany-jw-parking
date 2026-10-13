// lib/branding.js
// -----------------------------------------------------------------------------
// Purpose:
//   Single source of truth for user-facing names and wording that differ
//   between the production site and the demo site.
//
//   Production (www.albanyjwparking.org)  → PROD_BRAND (unchanged wording)
//   Demo       (demo.albanyjwparking.org) → DEMO_BRAND (neutral wording)
//
//   Two mechanisms:
//     1. Named values (siteName, conventionName, …) for the handful of
//        strings that appear everywhere.
//     2. brand.text(prodText) — templates and JS keep the production wording
//        verbatim and wrap it; on the demo, DEMO_TERMS rewrites faith-specific
//        terms (longest phrase first, whole words only). On production the
//        text is returned untouched.
//
//   Server code calls getBrand() with no arguments; the demo flag is read
//   from the same AsyncLocalStorage context lib/sql.js uses for schema
//   routing. Views receive res.locals.brand and res.locals.bt (set in
//   middleware/demoContext.js). Client JS receives brand.client through the
//   #app-brand-json data island in views/partials/header.ejs and uses
//   bt() from public/js/brand.js.
// -----------------------------------------------------------------------------

import { demoStorage } from "./sql.js";

/**
 * Demo-only term substitutions as [productionText, demoText] pairs.
 * Matching is case-sensitive and whole-word; list both capitalisations
 * where needed. Order does not matter — longer phrases always win.
 * @type {ReadonlyArray<[string, string]>}
 */
const DEMO_TERMS = Object.freeze([
    ["Congregation Service Committee", "Volunteer Approval Committee"],

    ["Auxiliary Pioneer (including continuous)", "Bronze Certified"],
    ["Auxiliary Pioneer", "Bronze Certified"],
    ["Aux. Pioneer", "Bronze"],
    ["Regular Pioneer", "Silver Certified"],
    ["Reg. Pioneer", "Silver"],
    ["Special Pioneer / Missionary", "Gold Certified"],
    ["Special Pioneer", "Gold Certified"],
    ["Spec. Pioneer", "Gold"],
    ["Ministerial Servant", "Assistant Lead"],
    ["Min. Servant", "Asst. Lead"],
    ["Elder", "Team Lead"],
    ["Special Full-Time Servant", "Advanced Training"],
    ["Special Full-Time Service", "Advanced Training"],
    ["Special Full-Time", "Specialist"],
    ["School — Family", "Adv. Training"],

    ["Spiritual Information", "Volunteer Qualifications"],
    ["Spiritual Info", "Volunteer Qualifications"],
    ["Spiritual info", "Qualifications"],
    ["Spiritual privileges", "Volunteer qualifications"],
    ["spiritual privilege", "qualification"],
    ["spiritual details", "qualification details"],
    ["spiritual information", "qualification information"],
    ["organization privileges", "volunteer qualifications"],
    ["Spiritual", "Qualifications"],
    ["spiritual", "qualification"],
    ["Privileges", "Qualifications"],
    ["privileges", "qualifications"],
    ["privilege", "qualification"],
    ["Ministry", "Service Level"],

    ["home congregation", "home team"],
    ["Congregations", "Home Teams"],
    ["congregations", "home teams"],
    ["Congregation", "Home Team"],
    ["congregation", "home team"],

    ["Kingdom Hall", "Community Center"],
]);

/**
 * Build a text transformer from [from, to] pairs.
 * Uses a capture group instead of lookbehind so the same logic runs in
 * older mobile browsers (mirrored in public/js/brand.js).
 *
 * @param {ReadonlyArray<[string, string]>} terms
 * @returns {(text: string, demoOverride?: string) => string}
 */
function buildTextTransformer(terms) {
    if (!terms.length) {
        return (text) => text;
    }
    const map = new Map(terms);
    const escaped = [...map.keys()]
        .sort((a, b) => b.length - a.length)
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`(^|[^A-Za-z0-9])(${escaped.join("|")})(?=[^A-Za-z0-9]|$)`, "g");

    return (text, demoOverride) => {
        if (demoOverride !== undefined) return demoOverride;
        if (typeof text !== "string" || !text) return text;
        return text.replace(re, (_, pre, term) => pre + map.get(term));
    };
}

/**
 * Labels that are safe to ship to the browser.
 * @typedef {Object} ClientBrand
 * @property {boolean} isDemo
 * @property {string}  siteName
 * @property {string}  congregation       - Singular noun ("Congregation").
 * @property {string}  congregationPlural - Plural noun ("Congregations").
 * @property {ReadonlyArray<[string, string]>} terms - Demo term pairs
 *   (empty on production) consumed by bt() in public/js/brand.js.
 */

/**
 * Full brand definition used on the server.
 * @typedef {Object} Brand
 * @property {boolean}     isDemo
 * @property {string}      siteName            - Header brand and <title> suffix.
 * @property {string}      teamSignature       - Email / SMS sign-off.
 * @property {string}      conventionName      - Long event name (hero banners).
 * @property {string}      conventionShortName - Event name used in sentences.
 * @property {string}      conventionLabel     - Short event label ("Albany JW Convention").
 * @property {string}      aiOrgDescription    - Org description for AI prompts.
 * @property {boolean}     showFaithDisclaimer - Render the JW.org disclaimer.
 * @property {string|null} demoNotice          - Footer notice on demo only.
 * @property {string}      venueExample        - Example venue name in hints.
 * @property {(text: string, demoOverride?: string) => string} text -
 *   Returns production text unchanged, or the demo rewrite. Pass
 *   demoOverride to supply an exact demo string instead of term rewriting.
 * @property {ClientBrand} client              - Browser-safe subset.
 */

/** @type {Readonly<Brand>} */
const PROD_BRAND = Object.freeze({
    isDemo: false,
    siteName: "Albany JW Parking",
    teamSignature: "Albany JW Parking Team",
    conventionName: "Albany Regional Convention of Jehovah's Witnesses",
    conventionShortName: "Albany JW Regional Convention",
    conventionLabel: "Albany JW Convention",
    aiOrgDescription: "a Jehovah's Witnesses regional convention",
    showFaithDisclaimer: true,
    demoNotice: null,
    venueExample: "Kingdom Hall",
    text: (text) => text,
    client: Object.freeze({
        isDemo: false,
        siteName: "Albany JW Parking",
        congregation: "Congregation",
        congregationPlural: "Congregations",
        terms: Object.freeze([]),
    }),
});

const demoText = buildTextTransformer(DEMO_TERMS);

/** @type {Readonly<Brand>} */
const DEMO_BRAND = Object.freeze({
    isDemo: true,
    siteName: "Volunteer Parking Coordinator",
    teamSignature: "Volunteer Parking Coordinator Team",
    conventionName: "Albany Summer Convention",
    conventionShortName: "Albany Summer Convention",
    conventionLabel: "Albany Summer Convention",
    aiOrgDescription: "a large regional summer convention",
    showFaithDisclaimer: false,
    demoNotice: "Demo environment — all names and data are fictional.",
    venueExample: "Community Center",
    text: (text, demoOverride) => demoText(text, demoOverride),
    client: Object.freeze({
        isDemo: true,
        siteName: "Volunteer Parking Coordinator",
        congregation: "Home Team",
        congregationPlural: "Home Teams",
        terms: DEMO_TERMS,
    }),
});

/**
 * Resolve the brand for the current request.
 *
 * When called without an argument, the demo flag is read from the
 * AsyncLocalStorage context established by demoContextMiddleware, so
 * lib/ and route code can call getBrand() without access to req.
 * Outside a request (startup, intervals) this resolves to PROD_BRAND.
 *
 * @param {boolean} [isDemo] - Explicit override; omit to auto-detect.
 * @returns {Readonly<Brand>}
 */
export function getBrand(isDemo = demoStorage.getStore()?.isDemo ?? false) {
    return isDemo ? DEMO_BRAND : PROD_BRAND;
}
