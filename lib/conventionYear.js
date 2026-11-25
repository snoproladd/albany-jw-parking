/**
 * @file lib/conventionYear.js
 * @description Single source of truth for "which convention year is current".
 *
 * The active year is the one row in `convention_years` with
 * `status = 'active'`. It changes only when an ADMIN / ASSISTANT_ADMIN
 * starts a new year (rollover), never because the calendar flipped.
 * Closed years stay readable for reference but are read-only.
 *
 * Results are cached per environment (production vs demo schema) for
 * CACHE_TTL_MS. Call `invalidateYearCache()` right after a rollover so the
 * new year takes effect immediately.
 *
 * All functions are safe to call outside a request (e.g. the alert
 * scheduler); the demo/production split follows `demoStorage`, the same
 * AsyncLocalStorage flag lib/sql.js uses to pick a connection pool.
 */

import { demoStorage } from "./sql.js";
import { conventionToday, invalidateTimeZoneCache } from "./conventionTime.js";
import {
    getActiveConventionYear,
    getConventionYearRow,
} from "./dbSync.js";

// ============================================================
// Constants
// ============================================================

/** How long a resolved active year is trusted before re-querying. */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Shorter TTL used when we had to fall back to the calendar year. */
const FALLBACK_TTL_MS = 60 * 1000;

/** Month (1-12) and day on/after which admins are asked to start the next year. */
const ROLLOVER_PROMPT_MONTH = 9;
const ROLLOVER_PROMPT_DAY = 1;


// ============================================================
// Logging Helpers
// ============================================================

/**
 * @param {...any} args
 */
function logError(...args) {
    console.error(`[${new Date().toISOString()}] [lib/conventionYear.js]`, ...args);
}

// ============================================================
// Cache
// ============================================================

/**
 * Cached active year per environment.
 * @type {Map<"prod"|"demo", { year: number, expiresAt: number }>}
 */
const _cache = new Map();

/**
 * Last year actually read from the database, per environment. Unlike
 * `_cache` it is never cleared, so getActiveYearSync() keeps answering
 * correctly between invalidateYearCache() and the next database read.
 * @type {Map<"prod"|"demo", number>}
 */
const _lastKnown = new Map();

/** Default SharePoint folder pattern; `{year}` becomes the active year. */
export const DEFAULT_FOLDER_PATTERN = "{year} Convention Parking/Documents for Distribution";

/** Set once the "pattern has no {year}" warning has been logged. */
let _warnedFixedFolder = false;

/**
 * Which environment the current async context belongs to.
 * @returns {"prod"|"demo"}
 */
function envKey() {
    return demoStorage.getStore()?.isDemo ? "demo" : "prod";
}

/**
 * Drop cached active years so the next call re-reads the database.
 * Call immediately after starting a new convention year.
 *
 * @param {"prod"|"demo"|null} [env=null] - Clear one environment, or both when null.
 * @returns {void}
 */
export function invalidateYearCache(env = null) {
    if (env) {
        _cache.delete(env);
    } else {
        _cache.clear();
    }
    // A new year can have a different venue and time zone.
    invalidateTimeZoneCache(env);
}

// ============================================================
// Date Helpers
// ============================================================

/**
 * Today's date in the convention's time zone (lib/conventionTime.js), as
 * "YYYY-MM-DD". The name is kept from when the zone was always Eastern.
 *
 * @param {Date} [now=new Date()]
 * @returns {string}
 */
export function todayEasternIso(now = new Date()) {
    return conventionToday(now);
}

/**
 * Current calendar year in the convention's time zone.
 * Used only as a fallback when no active convention year exists.
 *
 * @param {Date} [now=new Date()]
 * @returns {number}
 */
function calendarYearEastern(now = new Date()) {
    return Number(todayEasternIso(now).slice(0, 4));
}

// ============================================================
// Public API
// ============================================================

/**
 * Return the active convention year for the current environment.
 *
 * Never throws: on a database error, or if no row is marked active, it
 * falls back to the convention calendar year and logs the problem, so pages
 * keep rendering.
 *
 * @returns {Promise<number>}
 */
export async function getActiveYear() {
    const key = envKey();
    const hit = _cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.year;

    try {
        const year = await getActiveConventionYear();
        if (Number.isInteger(year)) {
            _cache.set(key, { year, expiresAt: Date.now() + CACHE_TTL_MS });
            _lastKnown.set(key, year);
            return year;
        }
        logError(`No active convention year in ${key} — falling back to calendar year.`);
    } catch (err) {
        logError(`Failed to read active convention year (${key}):`, err);
    }

    const fallback = calendarYearEastern();
    _cache.set(key, { year: fallback, expiresAt: Date.now() + FALLBACK_TTL_MS });
    return fallback;
}

/**
 * Synchronous best answer for the active year, for code that cannot await
 * (e.g. a `folderPath` getter read inside the Graph publishers): the cached
 * year, else the last year read from the database, else the convention
 * calendar year. Call `await getActiveYear()` once at startup so this is
 * warm before anything publishes.
 *
 * @returns {number}
 */
export function getActiveYearSync() {
    const key = envKey();
    return _cache.get(key)?.year ?? _lastKnown.get(key) ?? calendarYearEastern();
}

/**
 * The SharePoint "Documents for Distribution" folder for the active year.
 *
 * `pattern` is GRAPH_FOLDER_PATH (App Service setting) or the default
 * "{year} Convention Parking/Documents for Distribution"; every `{year}` is
 * replaced with the active year, so each convention year gets its own
 * folder (Graph creates it on the first upload). A pattern without `{year}`
 * is used exactly as written — a warning is logged once, since it will
 * not follow the year.
 *
 * @param {string|undefined|null} pattern
 * @returns {string}
 */
export function distributionFolderPath(pattern) {
    const p = (pattern && String(pattern).trim()) || DEFAULT_FOLDER_PATTERN;
    if (!p.includes("{year}") && !_warnedFixedFolder) {
        _warnedFixedFolder = true;
        logError(
            `GRAPH_FOLDER_PATH "${p}" has no {year} placeholder — SharePoint publishing ` +
            `will keep using this one folder every year. Set it to "${DEFAULT_FOLDER_PATTERN}" ` +
            "(or remove the setting) to get a folder per convention year.",
        );
    }
    return p.replaceAll("{year}", String(getActiveYearSync()));
}

/**
 * Status of a given convention year.
 *
 * @param {number} year
 * @returns {Promise<"active"|"closed"|null>} null when the year has no row
 *   (e.g. a future year that has not been started).
 */
export async function getYearStatus(year) {
    if (!Number.isInteger(year)) return null;
    const row = await getConventionYearRow(year);
    return row?.status ?? null;
}

/**
 * True when the year exists and has been closed by a rollover.
 * Closed years are read-only.
 *
 * @param {number} year
 * @returns {Promise<boolean>}
 */
export async function isYearClosed(year) {
    return (await getYearStatus(year)) === "closed";
}

/**
 * Whether admins should be asked to start the next convention year, and
 * other users warned that the site may be on last year.
 *
 * True on or after September 1 of the active year (convention time), which also
 * covers January onward if the rollover still has not happened.
 *
 * @param {number} activeYear
 * @param {Date} [now=new Date()]
 * @returns {boolean}
 */
export function needsRolloverPrompt(activeYear, now = new Date()) {
    const mm = String(ROLLOVER_PROMPT_MONTH).padStart(2, "0");
    const dd = String(ROLLOVER_PROMPT_DAY).padStart(2, "0");
    return todayEasternIso(now) >= `${activeYear}-${mm}-${dd}`;
}

/**
 * Resolve the year a page should display: a valid `?year=` query value,
 * otherwise the active year.
 *
 * @param {unknown} queryYear - Raw `req.query.year`.
 * @param {number} activeYear
 * @returns {number}
 */
export function resolveViewYear(queryYear, activeYear) {
    const n = Number.parseInt(String(queryYear ?? ""), 10);
    return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : activeYear;
}