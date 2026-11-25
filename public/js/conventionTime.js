/**
 * @file conventionTime.js
 * @description Browser side of the convention time zone
 * (claude/convention-time-zone-design.md; server side: lib/conventionTime.js).
 * Loaded by views/partials/conventionTimeData.ejs from the shared header,
 * before any page script, and exposed as window.ConventionTime.
 *
 * Rules:
 *  - Shift and session times are convention clock times: shown as stored,
 *    never converted. localToUtc / minutesUntil turn one into a real moment
 *    only to compare it with now (e.g. the meet-up editor's alert window).
 *  - "Today" for convention purposes (which day to open) is the
 *    convention's today: ConventionTime.today().
 *  - Moments (sent at, created at) are stored in UTC and shown in the
 *    viewer's own time zone with its abbreviation: formatMoment().
 *
 * No fixed offsets: everything goes through Intl, so daylight saving time
 * and venues in other zones are handled.
 */
(() => {
    "use strict";

    /** Zone used when the page has no data block. */
    const DEFAULT_TIME_ZONE = "America/New_York";

    /** @type {string} */
    let timeZone = DEFAULT_TIME_ZONE;
    const dataEl = document.getElementById("convention-time-data");
    if (dataEl) {
        try {
            const parsed = JSON.parse(dataEl.textContent || "{}");
            if (typeof parsed.timeZone === "string" && parsed.timeZone) timeZone = parsed.timeZone;
        } catch (err) {
            console.error("[conventionTime] could not read convention-time-data:", err);
        }
    }
    try {
        new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    } catch {
        timeZone = DEFAULT_TIME_ZONE;
    }

    /**
     * The wall-clock parts of a moment in a zone.
     *
     * @param {Date} date
     * @param {string} tz
     * @returns {{ year: number, month: number, day: number, hour: number, minute: number, second: number }}
     */
    function zonedParts(date, tz) {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: tz, hourCycle: "h23",
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit",
        }).formatToParts(date);
        /** @type {Record<string, number>} */
        const p = {};
        for (const { type, value } of parts) {
            if (type !== "literal") p[type] = Number(value);
        }
        return { year: p.year, month: p.month, day: p.day, hour: p.hour === 24 ? 0 : p.hour, minute: p.minute, second: p.second };
    }

    /**
     * The zone's offset from UTC at a moment, in minutes.
     *
     * @param {Date} date
     * @param {string} tz
     * @returns {number}
     */
    function offsetMinutes(date, tz) {
        const p = zonedParts(date, tz);
        const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
        return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
    }

    /**
     * "YYYY-MM-DD" from a DATE value, ISO string or Date.
     *
     * @param {Date|string|null|undefined} d
     * @returns {string|null}
     */
    function normalizeDate(d) {
        if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
        const m = String(d ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : null;
    }

    /**
     * "HH:MM:SS" from "H:MM", "HH:MM[:SS]", an epoch-anchored ISO TIME string
     * ("1970-01-01T07:00:00.000Z") or a Date.
     *
     * @param {Date|string|null|undefined} t
     * @returns {string|null}
     */
    function normalizeClockTime(t) {
        if (typeof t === "string" && t.includes("T")) t = new Date(t);
        if (t instanceof Date) {
            if (Number.isNaN(t.getTime())) return null;
            return [t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
        }
        const m = String(t ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        return m ? `${m[1].padStart(2, "0")}:${m[2]}:${m[3] || "00"}` : null;
    }

    /**
     * Today's date in the convention's time zone, "YYYY-MM-DD".
     *
     * @param {Date} [now=new Date()]
     * @returns {string}
     */
    function today(now = new Date()) {
        return new Intl.DateTimeFormat("en-CA", {
            timeZone, year: "numeric", month: "2-digit", day: "2-digit",
        }).format(now);
    }

    /**
     * The real moment of a convention clock time on a convention date.
     * The repeated autumn hour takes the first; the spring gap moves forward.
     *
     * @param {Date|string} date
     * @param {Date|string} time
     * @returns {Date|null}
     */
    function localToUtc(date, time) {
        const d = normalizeDate(date);
        const t = normalizeClockTime(time);
        if (!d || !t) return null;
        const [y, mo, da] = d.split("-").map(Number);
        const [h, mi, s] = t.split(":").map(Number);
        const wall = Date.UTC(y, mo - 1, da, h, mi, s);
        const first = wall - offsetMinutes(new Date(wall), timeZone) * 60000;
        const second = wall - offsetMinutes(new Date(first), timeZone) * 60000;
        const matches = [first, second].filter((ms) => {
            const p = zonedParts(new Date(ms), timeZone);
            return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) === wall;
        });
        return new Date(matches.length ? Math.min(...matches) : Math.max(first, second));
    }

    /**
     * Minutes from now until a convention clock time on a convention date
     * (negative once passed; NaN when unreadable).
     *
     * @param {Date|string} date
     * @param {Date|string} time
     * @param {Date} [now=new Date()]
     * @returns {number}
     */
    function minutesUntil(date, time, now = new Date()) {
        const at = localToUtc(date, time);
        return at ? (at.getTime() - now.getTime()) / 60000 : NaN;
    }

    /**
     * A moment in the viewer's own time zone with its abbreviation. Styles:
     *   "datetime" (default) "Nov 25, 2026, 9:42 AM EST"
     *   "short"              "Nov 25, 9:42 AM EST"  (no year)
     *   "time"               "9:42 AM EST"
     *   "date"               "Nov 25, 2026"          (a day: no zone label)
     *
     * @param {Date|string|number|null|undefined} value
     * @param {"datetime"|"short"|"time"|"date"} [style="datetime"]
     * @returns {string}  "" when the value can't be read
     */
    function formatMoment(value, style = "datetime") {
        if (value === null || value === undefined || value === "") return "";
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        /** @type {Intl.DateTimeFormatOptions} */
        const opts = {};
        if (style === "datetime" || style === "date") Object.assign(opts, { month: "short", day: "numeric", year: "numeric" });
        if (style === "short") Object.assign(opts, { month: "short", day: "numeric" });
        if (style !== "date") Object.assign(opts, { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
        return date.toLocaleString("en-US", opts);
    }

    /**
     * Fill every <time data-moment="…"> in a container from its datetime
     * attribute (UTC ISO), in the viewer's zone. Server templates print
     * moments this way so they show in the viewer's zone, not the server's.
     *
     * @param {ParentNode} [rootNode=document]
     * @returns {void}
     */
    function formatMomentElements(rootNode = document) {
        rootNode.querySelectorAll("time[data-moment]").forEach((el) => {
            const text = formatMoment(el.getAttribute("datetime"), /** @type {any} */ (el.dataset.moment || "datetime"));
            if (text) el.textContent = text;
        });
    }

    window.ConventionTime = Object.freeze({
        get timeZone() { return timeZone; },
        today,
        localToUtc,
        minutesUntil,
        formatMoment,
        formatMomentElements,
    });

    // Templates' <time data-moment> elements, once the page is parsed.
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => formatMomentElements());
    } else {
        formatMomentElements();
    }
})();
