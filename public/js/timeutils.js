/**
 * @file timeUtils.js
 * @description Shared time parsing, formatting, and input utilities.
 *
 * All time inputs in this app use free-text entry (e.g. "7:30 AM") rather
 * than the browser's native <input type="time"> picker.
 *
 * ── Timezone configuration ────────────────────────────────────────────────────
 * EDT_OFFSET_HOURS is the single value to update if the convention timezone
 * changes (e.g. moves to CST, or the convention date crosses a DST boundary).
 *
 * Current setting: EDT = UTC − 4  (valid for August summer conventions)
 */

"use strict";

// ─── Timezone configuration ───────────────────────────────────────────────────

/**
 * Convention timezone offset from UTC, in hours.
 * EDT (Eastern Daylight Time) = UTC − 4, so this is −4.
 * @type {number}
 */
export const EDT_OFFSET_HOURS = -4;

// ─── Core parse / format ──────────────────────────────────────────────────────

/**
 * Parse a free-text time string and return "HH:MM:00" in 24-hour format.
 * No timezone conversion is applied — the result is in the same timezone
 * as the input.
 *
 * Accepted formats (case-insensitive):
 *   12-hour: "7:30 AM", "7:30am", "7 AM", "7pm", "12:00 AM"
 *   24-hour: "13:30", "07:30", "13"
 *
 * @param {string | null | undefined} str
 * @returns {string | null}  "HH:MM:00", or null if unparseable or out of range.
 */
export function parseLocalTime(str) {
  if (!str) return null;
  const s = str.trim().toUpperCase();
  let h, m;

  const match12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (match12) {
    h = parseInt(match12[1], 10);
    m = match12[2] ? parseInt(match12[2], 10) : 0;
    if (match12[3] === "AM") {
      if (h === 12) h = 0;
    } else {
      if (h !== 12) h += 12;
    }
  } else {
    const match24 = s.match(/^(\d{1,2})(?::(\d{2}))?$/);
    if (!match24) return null;
    h = parseInt(match24[1], 10);
    m = match24[2] ? parseInt(match24[2], 10) : 0;
  }

  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/**
 * Format a "HH:MM" or "HH:MM:00" 24-hour string as "h:MM AM/PM".
 *
 * @param {string | null | undefined} hhmm
 * @returns {string}  "h:MM AM/PM", or "" if falsy or unparseable.
 */
export function formatTimeDisplay(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return "";
  const ap = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ap}`;
}

/**
 * Convert a raw mssql TIME ISO string to "h:MM AM/PM" for pre-filling a
 * text time input. mssql TIME columns arrive as epoch-anchored Date objects,
 * so UTC hours/minutes are used to avoid local-timezone drift.
 *
 * @param {string | null | undefined} raw  ISO string from a mssql TIME column.
 * @returns {string}  "h:MM AM/PM", or "" if falsy or unparseable.
 */
export function fmtTimeInput(raw) {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.valueOf())) return "";
  return formatTimeDisplay(
    `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
  );
}

// ─── UTC / local conversion ───────────────────────────────────────────────────

/**
 * Convert a local "HH:MM:00" time string to UTC "HH:MM:00".
 * Uses EDT_OFFSET_HOURS (local = UTC + offset, so UTC = local − offset).
 *
 * @param {string | null | undefined} localHhmm  Local (EDT) time "HH:MM:00".
 * @returns {string | null}  UTC "HH:MM:00", or null if falsy.
 */
export function localToUtc(localHhmm) {
  if (!localHhmm) return null;
  const [h, m] = localHhmm.split(":").map(Number);
  const utcH = (h - EDT_OFFSET_HOURS + 24) % 24;
  return `${String(utcH).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/**
 * Convert a UTC "HH:MM:00" string to local (EDT) "HH:MM:00".
 *
 * @param {string | null | undefined} utcHhmm  UTC "HH:MM:00".
 * @returns {string | null}  Local (EDT) "HH:MM:00", or null if falsy.
 */
export function utcToLocal(utcHhmm) {
  if (!utcHhmm) return null;
  const [h, m] = utcHhmm.split(":").map(Number);
  const localH = (h + EDT_OFFSET_HOURS + 24) % 24;
  return `${String(localH).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/**
 * Convert a stored UTC time string to "h:MM AM/PM EDT" for display on
 * schedule cards and other read-only contexts.
 *
 * @param {string | null | undefined} utcStr  "HH:MM:SS" or "HH:MM" in UTC.
 * @returns {string}  "h:MM AM/PM EDT", or "—" if falsy.
 */
export function utcToEdtCard(utcStr) {
  if (!utcStr) return "\u2014";
  const local = utcToLocal(utcStr);
  if (!local) return "\u2014";
  return `${formatTimeDisplay(local)} EDT`;
}

/**
 * Convert a stored UTC time string to "h:MM AM/PM" EDT for pre-filling
 * a form input.
 *
 * @param {string | null | undefined} utcStr  "HH:MM:SS" or "HH:MM" in UTC.
 * @returns {string}  "h:MM AM/PM" in EDT, or "" if falsy.
 */
export function utcToEdtDisplay(utcStr) {
  if (!utcStr) return "";
  const local = utcToLocal(utcStr);
  if (!local) return "";
  return formatTimeDisplay(local);
}

// ─── DOM binding ──────────────────────────────────────────────────────────────

/**
 * Attach blur/focus normalisation to a free-text time input.
 *
 * On blur — empty:      clears is-invalid.
 * On blur — parseable:  rewrites value to "h:MM AM/PM", clears is-invalid.
 * On blur — invalid:    adds is-invalid (Bootstrap CSS shows sibling
 *                       .invalid-feedback automatically).
 * On focus:             always clears is-invalid so the user can re-type.
 *
 * @param {string} inputId  DOM id of the time text input.
 */
export function bindTimeInput(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return;

  el.addEventListener("blur", () => {
    const raw = el.value.trim();
    if (!raw) {
      el.classList.remove("is-invalid");
      return;
    }
    const parsed = parseLocalTime(raw);
    if (parsed) {
      el.value = formatTimeDisplay(parsed);
      el.classList.remove("is-invalid");
    } else {
      el.classList.add("is-invalid");
    }
  });

  el.addEventListener("focus", () => el.classList.remove("is-invalid"));
}

/**
 * Programmatically validate a time input before form submission.
 * Applies is-invalid if the value is empty or unparseable, giving the user
 * a visual cue alongside any form-level error message.
 *
 * @param {string} inputId
 * @returns {string | null}  "HH:MM:00" local time if valid, null if not.
 */
export function validateTimeInput(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return null;
  const parsed = parseLocalTime(el.value.trim());
  el.classList.toggle("is-invalid", !parsed);
  return parsed;
}
