/**
 * @file timeUtils.js
 * @description Shared time input utilities for EJS pages that use
 * native <input type="time"> elements backed by mssql TIME columns.
 *
 * mssql TIME columns return as Date objects anchored to the UTC epoch
 * (1970-01-01), so all conversions use UTC hours/minutes to avoid
 * local-timezone offset shifts.
 *
 * Exports:
 *  - fmtTimeInput   — ISO TIME string → "HH:MM" for input value pre-fill
 *  - bindTimeInput  — attaches blur validation to a time input by element ID
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
