/**
 * @file public/js/schedules.js
 * @description Client-side logic for the /schedules page.
 *
 * Responsibilities:
 *  - Format file last-modified dates from [data-raw] ISO timestamps.
 *  - Format file sizes from [data-bytes] values into human-readable strings.
 */

/**
 * Format an ISO 8601 timestamp for display.
 * Returns a short locale date string, e.g. "Jun 21, 2026".
 *
 * @param {string} iso - ISO 8601 date string.
 * @returns {string}
 */
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a file size in bytes into a human-readable string.
 * e.g. 1536 → "1.5 KB", 2097152 → "2.0 MB"
 *
 * @param {number} bytes
 * @returns {string}
 */
function fmtBytes(bytes) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Initialise all date and size spans on the schedules page.
 *
 * @returns {void}
 */
function initSchedulesMeta() {
  document.querySelectorAll(".schedules-tile-date[data-raw]").forEach((el) => {
    const raw = el.getAttribute("data-raw");
    const formatted = fmtDate(raw);
    if (formatted) {
      el.textContent = formatted;
    } else {
      el.remove();
    }
  });

  document.querySelectorAll(".schedules-tile-size[data-bytes]").forEach((el) => {
    const bytes = parseInt(el.getAttribute("data-bytes"), 10);
    const formatted = fmtBytes(bytes);
    if (formatted) {
      el.textContent = formatted;
    } else {
      el.remove();
    }
  });
}

document.addEventListener("DOMContentLoaded", initSchedulesMeta);