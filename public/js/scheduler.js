/**
 * @file scheduler.js
 * @description Entry point for the volunteer scheduler page.
 * Wires together the event bus, data/DOM actions, drag-and-drop
 * initialisation, and the smart attendance badge poller.
 *
 * Polling strategy:
 *  - Convention day is today  → auto-poll every 30 seconds
 *  - Convention day is future → manual refresh only (Check-ins button)
 *  - No day selected          → no polling
 */

import { initDomEvents } from "./schedulerDomEvents.js";
import { initDomActions, refreshAttendanceBadges } from "./schedulerDomActions.js";
import { preloadRendezvousForDay, clearRendezvousCache } from "./rendezvous.js";

// ─────────────────────────────────────────────
//  Attendance poller
// ─────────────────────────────────────────────

/** @type {ReturnType<typeof setInterval>|null} */
let _pollHandle = null;

/**
 * Cancel any running attendance poll.
 * @returns {void}
 */
function _stopPoller() {
  if (_pollHandle !== null) {
    clearInterval(_pollHandle);
    _pollHandle = null;
  }
}

/**
 * Compare an ISO date string (YYYY-MM-DD) to today's local calendar date.
 *
 * @param {string|null} isoDate  e.g. "2026-08-07"
 * @returns {boolean}
 */
function _isToday(isoDate) {
  if (!isoDate) return false;
  const d = new Date();
  const today = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
  return isoDate.slice(0, 10) === today;
}

// Cancel the poller whenever the user switches days
document.addEventListener("scheduler:dayChange", () => _stopPoller());

// Preload rendezvous data when day changes
document.addEventListener("scheduler:dayChange", (e) => {
  const dayId = (e).detail?.dayId;
  if (dayId) {
    preloadRendezvousForDay(dayId);
  } else {
    clearRendezvousCache();
  }
});

/**
 * After attendance data loads for the first time on a day, decide whether
 * to start auto-polling. If today is the convention day, poll every 30 s;
 * otherwise rely on the manual Check-ins button.
 */
document.addEventListener("scheduler:attendanceReady", (e) => {
  const { conventionDate } = (e).detail || {};
  _stopPoller();
  if (_isToday(conventionDate)) {
    _pollHandle = setInterval(
      () => refreshAttendanceBadges(),
      30_000,
    );
  }
});

// ─────────────────────────────────────────────
//  Init
// ─────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  initDomEvents();
  await initDomActions();
});
