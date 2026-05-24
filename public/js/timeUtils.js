/**
 * @file timeUtils.js
 * @description Shared time input utilities for EJS pages that use
 * native <input type="time"> elements backed by mssql TIME columns.
 *
 * mssql TIME columns return as Date objects anchored to the UTC epoch
 * (1970-01-01), so all conversions use UTC hours/minutes to avoid
 * local-timezone offset shifts.
 *
 * EDT is UTC-4 (no DST handling needed — convention always runs in summer).
 *
 * Exports:
 *  - fmtTimeInput      — ISO TIME string → "HH:MM" for input value pre-fill
 *  - bindTimeInput     — attaches blur validation to a time input by element ID
 *  - validateTimeInput — validates a time input, returns value or null
 *  - utcToEdtCard      — UTC HH:MM string → "h:mm AM/PM" display label (EDT)
 *  - utcToEdtDisplay   — UTC HH:MM string → "HH:MM" for <input type="time"> (EDT)
 *  - localToUtc        — EDT "HH:MM" input value → UTC "HH:MM" string for storage
 */

/** EDT offset from UTC in hours (UTC-4, convention always runs in summer). */
const EDT_OFFSET_HOURS = 4;

/**
 * Convert an mssql ISO TIME string to HH:MM for use as an
 * `<input type="time">` value.
 *
 * @param {string|null} raw - ISO string or Date.toString() from mssql
 * @returns {string} e.g. "08:30", or "" if raw is falsy/invalid
 */
export function fmtTimeInput(raw) {
    if (!raw) return "";
    const d = new Date(raw);
    if (isNaN(d.valueOf())) return "";
    return (
        String(d.getUTCHours()).padStart(2, "0") +
        ":" +
        String(d.getUTCMinutes()).padStart(2, "0")
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
 * Convert a UTC "HH:MM" time string to a human-readable EDT display label
 * suitable for schedule cards (e.g. "7:00 AM").
 *
 * @param {string|null} utcHhmm - UTC time as "HH:MM" or null
 * @returns {string} e.g. "7:00 AM", or "—" if input is falsy
 */
export function utcToEdtCard(utcHhmm) {
    if (!utcHhmm) return "—";
    const [h, m] = utcHhmm.split(":").map(Number);
    let edtH = h - EDT_OFFSET_HOURS;
    if (edtH < 0) edtH += 24;
    const ap = edtH >= 12 ? "PM" : "AM";
    const display = edtH % 12 || 12;
    return `${display}:${String(m).padStart(2, "0")} ${ap}`;
}

/**
 * Convert a UTC "HH:MM" time string to an EDT "HH:MM" string suitable
 * for pre-filling an `<input type="time">` value.
 *
 * @param {string|null} utcHhmm - UTC time as "HH:MM" or null
 * @returns {string} e.g. "07:00", or "" if input is falsy
 */
export function utcToEdtDisplay(utcHhmm) {
    if (!utcHhmm) return "";
    const [h, m] = utcHhmm.split(":").map(Number);
    let edtH = h - EDT_OFFSET_HOURS;
    if (edtH < 0) edtH += 24;
    return `${String(edtH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Convert an EDT "HH:MM" string (from an `<input type="time">`) to a
 * UTC "HH:MM" string for storage in the database.
 *
 * @param {string|null} edtHhmm - Local EDT time as "HH:MM" or null
 * @returns {string} e.g. "11:00", or "" if input is falsy
 */
export function localToUtc(edtHhmm) {
    if (!edtHhmm) return "";
    const [h, m] = edtHhmm.split(":").map(Number);
    let utcH = h + EDT_OFFSET_HOURS;
    if (utcH >= 24) utcH -= 24;
    return `${String(utcH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
