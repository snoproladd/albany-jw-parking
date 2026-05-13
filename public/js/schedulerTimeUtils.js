/**
 * @file schedulerTimeUtils.js
 * @description Time parsing, formatting, and grid-layout utilities for the
 * volunteer scheduler. Merged from gridTest's timeUtils.js and shiftUtils.js.
 *
 * All time strings produced by the server follow the format "h:mm AM/PM"
 * (e.g. "5:30 AM"). Parsing uses a case-insensitive regex that also tolerates
 * the no-space variant "5:30AM" for resilience.
 */

// ─────────────────────────────────────────────
//  Time string ↔ minutes helpers
// ─────────────────────────────────────────────

/**
 * Parse a time string such as "9:30 AM" or "5:30AM" into total minutes
 * elapsed since midnight (e.g. "9:30 AM" → 570).
 *
 * @param {string} timeStr
 * @returns {number|null} Minutes from midnight, or null if unparseable.
 */
export function parseTimeToMinutes(timeStr) {
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  return hours * 60 + mins;
}

/**
 * Convert total minutes from midnight back to a display string such as
 * "9:30 AM".
 *
 * @param {number} minutes - Total minutes from midnight.
 * @returns {string}
 */
export function formatMinutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${String(mins).padStart(2, "0")} ${period}`;
}

// ─────────────────────────────────────────────
//  Day bounds
// ─────────────────────────────────────────────

/**
 * Scan every shift in a day payload and return the earliest start and
 * latest end times in minutes from midnight.
 *
 * Expects the nested structure returned by GET /api/scheduler/:dayId:
 * ```
 * dayData.department[deptKey].shift[shiftKey].schedule.{start_time, end_time}
 * ```
 *
 * @param {object} dayData - The value of `schedule.day["<label>"]`.
 * @returns {{ earliest: number, latest: number }}
 */
export function getDayBounds(dayData) {
  let earliest = Infinity;
  let latest = -Infinity;

  for (const dept of Object.values(dayData.department)) {
    for (const shift of Object.values(dept.shift)) {
      const start = parseTimeToMinutes(shift.schedule.start_time);
      const end = parseTimeToMinutes(shift.schedule.end_time);
      if (start !== null && start < earliest) earliest = start;
      if (end !== null && end > latest) latest = end;
    }
  }

  return { earliest, latest };
}

// ─────────────────────────────────────────────
//  Grid row mapping
// ─────────────────────────────────────────────

/**
 * Convert an absolute time (in minutes from midnight) to a CSS grid row
 * number relative to the day's start. The grid uses 15-minute row resolution.
 *
 * @param {number} minutes  - Absolute minutes from midnight.
 * @param {number} earliest - The day's earliest start time in minutes.
 * @returns {number} Zero-based row index (add 1 for 1-indexed CSS grid).
 */
export function timeToRow(minutes, earliest) {
  return Math.round((minutes - earliest) / 15);
}

// ─────────────────────────────────────────────
//  Shift crew-size aggregation
// ─────────────────────────────────────────────

/**
 * Calculate the total volunteer count across all locations in a shift at a
 * given staffing level.
 *
 * Handles two location shapes from the API:
 * - Flat (single location): `{ vol_min, vol_ideal, vol_max, … }`
 * - Keyed (multiple locations): `{ loc_1: { vol_min, … }, loc_2: { … } }`
 *
 * @param {object} shift - A shift object from the scheduler payload.
 * @param {'vol_min'|'vol_ideal'|'vol_max'} [level='vol_ideal']
 * @returns {number}
 */
export function shiftCrewSize(shift, level = "vol_ideal") {
  const locs = shift.location;

  // Flat single-location: level key sits directly on the object
  if (locs[level] !== undefined) return locs[level] ?? 0;

  // Keyed multi-location: sum across loc_1, loc_2, …
  return Object.values(locs).reduce((sum, loc) => sum + (loc[level] ?? 0), 0);
}
