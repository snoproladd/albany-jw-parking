// public/js/brand.js
// -----------------------------------------------------------------------------
// Purpose:
//   Client-side access to the production/demo wording produced by
//   lib/branding.js. Reads the #app-brand-json data island rendered by
//   views/partials/header.ejs, so no inline script is needed (CSP-safe).
//
//   Usage (ES module):
//     import { getClientBrand, bt } from "/js/brand.js";
//     bt("Regular Pioneer");               // prod: unchanged, demo: "Silver Certified"
//     bt("Congregation", "Leadership");    // demo: exact override
// -----------------------------------------------------------------------------

/**
 * Browser-safe brand labels (mirror of ClientBrand in lib/branding.js).
 * @typedef {Object} ClientBrand
 * @property {boolean} isDemo
 * @property {string}  siteName
 * @property {string}  congregation
 * @property {string}  congregationPlural
 * @property {Array<[string, string]>} terms - Demo term pairs (empty on production).
 */

/**
 * Production fallback used when the data island is missing (e.g. a page
 * that does not include the header partial) or fails to parse.
 * @type {ClientBrand}
 */
const FALLBACK_BRAND = Object.freeze({
    isDemo: false,
    siteName: "Albany JW Parking",
    congregation: "Congregation",
    congregationPlural: "Congregations",
    terms: [],
});

/** @type {ClientBrand|null} */
let _cached = null;

/** @type {((text: string) => string)|null} */
let _transform = null;

/**
 * Read and cache the brand labels from #app-brand-json.
 * @returns {ClientBrand}
 */
export function getClientBrand() {
    if (_cached) return _cached;
    const el = document.getElementById("app-brand-json");
    try {
        _cached = el ? JSON.parse(el.textContent) : FALLBACK_BRAND;
    } catch (err) {
        console.warn("[brand] Failed to parse #app-brand-json:", err);
        _cached = FALLBACK_BRAND;
    }
    return _cached;
}

/**
 * Build (once) the term rewriter from the brand's term pairs.
 * Mirrors buildTextTransformer() in lib/branding.js.
 * @returns {(text: string) => string}
 */
function getTransform() {
    if (_transform) return _transform;
    const terms = getClientBrand().terms || [];
    if (!terms.length) {
        _transform = (text) => text;
        return _transform;
    }
    const map = new Map(terms);
    const escaped = [...map.keys()]
        .sort((a, b) => b.length - a.length)
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`(^|[^A-Za-z0-9])(${escaped.join("|")})(?=[^A-Za-z0-9]|$)`, "g");
    _transform = (text) => text.replace(re, (_, pre, term) => pre + map.get(term));
    return _transform;
}

/**
 * Brand text: returns production wording unchanged, or the demo rewrite.
 *
 * @param {string} text - Production wording.
 * @param {string} [demoOverride] - Exact demo text to use instead of term rewriting.
 * @returns {string}
 */
export function bt(text, demoOverride) {
    if (getClientBrand().isDemo && demoOverride !== undefined) return demoOverride;
    if (typeof text !== "string" || !text) return text;
    return getTransform()(text);
}
