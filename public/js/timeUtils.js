/**
 * @file timeUtils.js
 * @description Shared time input utilities for EJS pages that use
 * native <input type="time"> elements backed by mssql TIME columns.
 *
 * mssql TIME columns return as Date objects anchored to the UTC epoch
 * (1970-01-01), so all conversions use UTC hours/minutes to avoid
 * local-timezone offset shifts.
 *
 * Times entered here are convention clock times and are stored as they are
 * (no zone conversion). Turning one into a real moment is the job of
 * window.ConventionTime (public/js/conventionTime.js).
 *
 * Exports:
 *  - fmtTimeInput      — ISO TIME string → "HH:MM" for input value pre-fill
 *  - bindTimeInput     — attaches blur validation to a time input by element ID
 *  - validateTimeInput — validates a time input, returns value or null
 */

/**
 * Convert an mssql ISO TIME string to HH:MM for use as an
 * `<input type="time">` value.
 *
 * @param {string|null} raw - ISO string or Date.toString() from mssql
 * @returns {string} e.g. "08:30", or "" if raw is falsy/invalid
 */
export function fmtTimeInput(raw) {
    const parsed = _extractUtcHM(raw);
    if (!parsed) return "";
    return (
        String(parsed.h).padStart(2, "0") +
        ":" +
        String(parsed.m).padStart(2, "0")
    );
}

/**
 * Bind a native `<input type="time">` so it marks itself invalid
 * visually on blur if the value is empty.
 *
 * @param {string} id - Element ID (without #)
 * @returns {void}
 */
export function bindTimeInput(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("blur", () => {
        el.classList.toggle("is-invalid", !el.value);
    });
}

/**
 * Validate a time input by ID. Marks the element invalid and focuses
 * it if empty. Returns the HH:MM string if valid, null otherwise.
 *
 * @param {string} id - Element ID (without #)
 * @returns {string|null}
 */
export function validateTimeInput(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    if (!el.value) {
        el.classList.add("is-invalid");
        el.focus();
        return null;
    }
    el.classList.remove("is-invalid");
    return el.value;
}

/**
 * Extract { h, m } from either a plain "HH:MM" / "HH:MM:SS" string or
 * an epoch-anchored ISO datetime string returned by mssql for TIME
 * columns (e.g. "1970-01-01T23:30:00.000Z").
 *
 * Returns null when the value is falsy or unparseable so callers can
 * distinguish "no value" from "garbled value" if needed.
 *
 * @param {string|Date|null} val
 * @returns {{h:number, m:number}|null}
 */
function _extractUtcHM(val) {
    if (!val) return null;
    if (val instanceof Date) {
        if (isNaN(val.valueOf())) return null;
        return { h: val.getUTCHours(), m: val.getUTCMinutes() };
    }
    const s = String(val).trim();
    // Plain "HH:MM" or "HH:MM:SS"
    const match = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (match) {
        const h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        if (!isNaN(h) && !isNaN(m)) return { h, m };
        return null;
    }
    // Anything else — try parsing as an ISO/Date string
    const d = new Date(s);
    if (isNaN(d.valueOf())) return null;
    return { h: d.getUTCHours(), m: d.getUTCMinutes() };
}
