/**
 * @file lib/conventionTime.js
 * @description The convention's time zone and every server-side time
 * conversion that depends on it (design: claude/convention-time-zone-design.md).
 *
 * Rules:
 *  - Shift and session times are plain convention clock times on a
 *    convention date ("2026-07-03" + "06:45"). They are never converted for
 *    display; they are converted to a real moment only to compare them with
 *    now (conventionLocalToUtc, minutesUntil).
 *  - Moments (sent at, created at) are stored in UTC. Texts, emails and PDFs
 *    built here print them in the convention zone with its abbreviation
 *    (formatMoment: "Nov 25, 9:42 AM EST"). Pages print them in the
 *    browser's own zone (public/js/conventionTime.js).
 *  - "Today" is the convention's today (conventionToday), never UTC's.
 *
 * The zone is set per convention year on System Variables
 * (convention_years.time_zone) and cached here for five minutes per
 * environment, like the active year. No fixed offsets: every conversion
 * goes through Intl, so daylight saving time is always right.
 */

import { demoStorage } from "./sql.js";
import { getActiveConventionTimeZone } from "./dbSync.js";

// ============================================================
// Constants
// ============================================================

/** Zone used until a year's zone is read (and when none is set). */
export const DEFAULT_TIME_ZONE = "America/New_York";

/** How long a read zone is trusted before the database is asked again. */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * The US time zones offered for a manual pick on System Variables, in the
 * order shown. Arizona (most of it) does not observe daylight saving time.
 *
 * @type {ReadonlyArray<{ id: string, label: string }>}
 */
export const US_TIME_ZONES = Object.freeze([
    { id: "America/New_York", label: "Eastern Time" },
    { id: "America/Chicago", label: "Central Time" },
    { id: "America/Denver", label: "Mountain Time" },
    { id: "America/Phoenix", label: "Mountain Time — Arizona (no daylight saving)" },
    { id: "America/Los_Angeles", label: "Pacific Time" },
    { id: "America/Anchorage", label: "Alaska Time" },
    { id: "Pacific/Honolulu", label: "Hawaii Time" },
]);

// ============================================================
// Logging
// ============================================================

/**
 * @param {...any} args
 * @returns {void}
 */
function logError(...args) {
    console.error(`[${new Date().toISOString()}] [lib/conventionTime.js]`, ...args);
}

// ============================================================
// Zone cache
// ============================================================

/**
 * Cached zone per environment.
 * @type {Map<"prod"|"demo", { tz: string, expiresAt: number }>}
 */
const _cache = new Map();

/**
 * Last zone read from the database per environment (never cleared), for
 * getConventionTimeZoneSync().
 * @type {Map<"prod"|"demo", string>}
 */
const _lastKnown = new Map();

/**
 * Which environment the current async context belongs to.
 *
 * @returns {"prod"|"demo"}
 */
function envKey() {
    return demoStorage.getStore()?.isDemo ? "demo" : "prod";
}

/**
 * True when `tz` is a time zone name this server's Intl understands.
 *
 * @param {unknown} tz
 * @returns {boolean}
 */
export function isValidTimeZone(tz) {
    if (typeof tz !== "string" || !tz.trim()) return false;
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
        return true;
    } catch {
        return false;
    }
}

/**
 * The active convention year's time zone for the current environment.
 * Never throws: on a read error (or before convention_time_zone.sql has
 * run) it answers the last known zone, else DEFAULT_TIME_ZONE.
 *
 * @returns {Promise<string>}
 */
export async function getConventionTimeZone() {
    const key = envKey();
    const hit = _cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.tz;

    let tz = null;
    try {
        tz = await getActiveConventionTimeZone();
    } catch (err) {
        logError(`Failed to read the convention time zone (${key}):`, err.message || err);
    }
    if (!isValidTimeZone(tz)) tz = _lastKnown.get(key) || DEFAULT_TIME_ZONE;

    _cache.set(key, { tz, expiresAt: Date.now() + CACHE_TTL_MS });
    _lastKnown.set(key, tz);
    return tz;
}

/**
 * Synchronous best answer for the zone, for code that cannot await: the
 * cached zone, else the last one read, else DEFAULT_TIME_ZONE. Await
 * getConventionTimeZone() once at startup so this is warm.
 *
 * @returns {string}
 */
export function getConventionTimeZoneSync() {
    const key = envKey();
    return _cache.get(key)?.tz ?? _lastKnown.get(key) ?? DEFAULT_TIME_ZONE;
}

/**
 * Drop the cached zone so the next call re-reads it (after it is changed
 * on System Variables, or after a year rollover).
 *
 * @param {"prod"|"demo"|null} [env=null]  One environment, or both
 * @returns {void}
 */
export function invalidateTimeZoneCache(env = null) {
    if (env) _cache.delete(env);
    else _cache.clear();
}

// ============================================================
// Conversions
// ============================================================

/**
 * The wall-clock parts of a moment in a zone.
 *
 * @param {Date} date
 * @param {string} tz
 * @returns {{ year: number, month: number, day: number,
 *             hour: number, minute: number, second: number }}
 */
export function zonedParts(date, tz) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date);
    /** @type {Record<string, number>} */
    const p = {};
    for (const { type, value } of parts) {
        if (type !== "literal") p[type] = Number(value);
    }
    return {
        year: p.year, month: p.month, day: p.day,
        hour: p.hour === 24 ? 0 : p.hour, minute: p.minute, second: p.second,
    };
}

/**
 * The zone's offset from UTC at a moment, in minutes (e.g. -300 for EST,
 * -240 for EDT).
 *
 * @param {Date} date
 * @param {string} tz
 * @returns {number}
 */
export function zoneOffsetMinutes(date, tz) {
    const p = zonedParts(date, tz);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/**
 * Today's date in the convention zone, "YYYY-MM-DD".
 *
 * @param {Date} [now=new Date()]
 * @param {string} [tz=getConventionTimeZoneSync()]
 * @returns {string}
 */
export function conventionToday(now = new Date(), tz = getConventionTimeZoneSync()) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now);
}

/**
 * The current convention clock time, "HH:MM" (24-hour).
 *
 * @param {Date} [now=new Date()]
 * @param {string} [tz=getConventionTimeZoneSync()]
 * @returns {string}
 */
export function conventionNowHhmm(now = new Date(), tz = getConventionTimeZoneSync()) {
    const p = zonedParts(now, tz);
    return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/**
 * Normalize a time of day to "HH:MM:SS": accepts "H:MM", "HH:MM",
 * "HH:MM:SS", or an mssql TIME value (a Date on 1970-01-01 UTC).
 *
 * @param {Date|string|null|undefined} t
 * @returns {string|null}
 */
export function normalizeClockTime(t) {
    if (t instanceof Date) {
        if (Number.isNaN(t.getTime())) return null;
        return [t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds()]
            .map((n) => String(n).padStart(2, "0")).join(":");
    }
    const m = String(t ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    return `${m[1].padStart(2, "0")}:${m[2]}:${m[3] || "00"}`;
}

/**
 * Normalize a date to "YYYY-MM-DD": accepts that string, or a DATE value
 * (a Date at midnight UTC).
 *
 * @param {Date|string|null|undefined} d
 * @returns {string|null}
 */
export function normalizeDate(d) {
    if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    const m = String(d ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
}

/**
 * The real moment of a convention clock time on a convention date, e.g.
 * ("2026-11-25", "11:00") in America/New_York → 2026-11-25T16:00:00Z.
 * Daylight saving is handled: in the hour that repeats in autumn the first
 * one is used, and a time in the spring gap moves forward an hour.
 *
 * @param {Date|string} date   Convention date (DATE value or "YYYY-MM-DD")
 * @param {Date|string} time   Clock time (TIME value or "HH:MM[:SS]")
 * @param {string} [tz=getConventionTimeZoneSync()]
 * @returns {Date|null}  null when the date or time can't be read
 */
export function conventionLocalToUtc(date, time, tz = getConventionTimeZoneSync()) {
    const d = normalizeDate(date);
    const t = normalizeClockTime(time);
    if (!d || !t) return null;
    const [y, mo, da] = d.split("-").map(Number);
    const [h, mi, s] = t.split(":").map(Number);
    const wall = Date.UTC(y, mo - 1, da, h, mi, s);

    // Two candidates: the wall time shifted by the zone's offset at two
    // nearby moments. Keep the one that reads back as the same wall time
    // (both do in the repeated autumn hour: take the earlier). Neither does
    // in the spring gap: take the later, i.e. move forward.
    const first = wall - zoneOffsetMinutes(new Date(wall), tz) * 60000;
    const second = wall - zoneOffsetMinutes(new Date(first), tz) * 60000;
    const matches = [first, second].filter((ms) => {
        const p = zonedParts(new Date(ms), tz);
        return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) === wall;
    });
    return new Date(matches.length ? Math.min(...matches) : Math.max(first, second));
}

/**
 * Minutes from now until a convention clock time on a convention date
 * (negative once it has passed).
 *
 * @param {Date|string} date
 * @param {Date|string} time
 * @param {Date} [now=new Date()]
 * @param {string} [tz=getConventionTimeZoneSync()]
 * @returns {number}  NaN when the date or time can't be read
 */
export function minutesUntil(date, time, now = new Date(), tz = getConventionTimeZoneSync()) {
    const at = conventionLocalToUtc(date, time, tz);
    return at ? (at.getTime() - now.getTime()) / 60000 : NaN;
}

// ============================================================
// Formatting (texts, emails, PDFs)
// ============================================================

/**
 * A moment in the convention zone, labelled with the zone's abbreviation,
 * for texts, emails and PDFs. Styles:
 *   "datetime" (default) "Nov 25, 2026, 9:42 AM EST"
 *   "time"               "9:42 AM EST"
 *   "date"               "Nov 25, 2026"  (no zone label: a date)
 *
 * @param {Date|string|number|null|undefined} moment
 * @param {"datetime"|"time"|"date"} [style="datetime"]
 * @param {string} [tz=getConventionTimeZoneSync()]
 * @returns {string}  "" when the moment can't be read
 */
export function formatMoment(moment, style = "datetime", tz = getConventionTimeZoneSync()) {
    if (moment === null || moment === undefined || moment === "") return "";
    const date = moment instanceof Date ? moment : new Date(moment);
    if (Number.isNaN(date.getTime())) return "";

    /** @type {Intl.DateTimeFormatOptions} */
    const opts = { timeZone: tz };
    if (style !== "time") Object.assign(opts, { month: "short", day: "numeric", year: "numeric" });
    if (style !== "date") Object.assign(opts, { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    return new Intl.DateTimeFormat("en-US", opts).format(date);
}

/**
 * Describe a zone for people: its name and what it is right now, e.g.
 * "Eastern Standard Time (EST, UTC−5)".
 *
 * @param {string} tz
 * @param {Date} [now=new Date()]
 * @returns {string}
 */
export function describeTimeZone(tz, now = new Date()) {
    /**
     * @param {"long"|"short"|"shortOffset"} timeZoneName
     * @returns {string}
     */
    const part = (timeZoneName) =>
        new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName })
            .formatToParts(now).find((p) => p.type === "timeZoneName")?.value || "";
    const offset = part("shortOffset").replace("GMT", "UTC").replace("-", "−") || "UTC";
    return `${part("long")} (${part("short")}, ${offset === "UTC" ? "UTC+0" : offset})`;
}
