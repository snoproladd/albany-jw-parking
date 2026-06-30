/**
 * @file alertScheduler.js
 * @description Automated shift alert scheduler and SMS sender.
 *
 * Responsibilities:
 *  - Poll every 60 seconds for burst schedules whose fire_time_utc is now.
 *  - Poll every 60 seconds for T-15 rolling alerts (shifts starting in ~15 min).
 *  - Build and send SMS alerts via Twilio for each eligible volunteer+shift pair.
 *  - Log all send attempts (sent and failed) to shift_alert_log.
 *
 * Message design:
 *  - Volunteers reply with their shift code (e.g. FRIN) to confirm attendance.
 *  - QUIT or STOP opts them out — Twilio handles these keywords automatically.
 *  - If they can't make it, the message directs them to contact oversight.
 *  - Admins can override the default template per schedule via message_override.
 *
 * Timezone note:
 *  All fire times are stored and compared in UTC. Shift start times are stored
 *  as Eastern local time strings (HH:MM:SS). August convention = EDT (UTC-4),
 *  so UTC hour = Eastern hour + EDT_OFFSET_HOURS. This offset is hardcoded for
 *  the summer convention and should be reviewed if the convention date changes.
 */

import {
  getAlertSchedules,
  getShiftsForAlertBurst,
  getT15CandidateShifts,
  getMeetingT15Candidates,
  logShiftAlerts,
} from "./dbSync.js";

import { generateRvToken } from "./rvToken.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * EDT offset in hours (UTC-4). Add to an Eastern local hour to get UTC hour.
 * August convention = Eastern Daylight Time.
 */
const EDT_OFFSET_HOURS = 4;

/**
 * Burst schedules fire if their fire_time_utc falls within the past
 * BURST_WINDOW_MINUTES. Wide enough to survive a slow tick or brief restart.
 */
const BURST_WINDOW_MINUTES = 5;

/** T-15 window: fire for shifts starting between MIN and MAX minutes from now. */
const T15_MIN_MINUTES = 14;
const T15_MAX_MINUTES = 16;

// ─── Concurrency / re-entry guards ────────────────────────────────────────────

/**
 * Mutex flag preventing concurrent tick() invocations.
 *
 * `setInterval` does not wait for the previous callback to complete. When a
 * batch of Twilio sends takes longer than the 60s tick interval, the next
 * tick fires while the first is still in flight. Without this guard, both
 * ticks query getShiftsForAlertBurst, both see the same un-logged rows
 * (because shift_alert_log is only written after the whole batch completes),
 * and both queue duplicate sends — multiplying the SMS spam by however many
 * ticks pile up inside the 5-minute burst window.
 *
 * @type {boolean}
 */
let tickInProgress = false;

/**
 * Set of burst schedule instances already fired in this Node process.
 * Key format: `${scheduleId}|${fireDateStr}`. shift_alert_log handles
 * dedupe across restarts; this set handles dedupe within the process when
 * a tick takes longer than the 60s interval. Belt-and-suspenders with the
 * tickInProgress mutex.
 *
 * @type {Set<string>}
 */
const burstFired = new Set();

// ─── Default message templates ────────────────────────────────────────────────
//
// Available placeholders:
//   {firstName}   Volunteer's first name
//   {shiftType}   Event type name  (e.g. "Ingress", "Security")
//   {shiftLabel}  Shift label      (e.g. "Shift A", "Morning")
//   {time}        Shift start time (e.g. "6:00 AM")
//   {date}        Convention date  (e.g. "Friday, August 7")
//   {code}        SMS reply code   (e.g. "FRIN")
//
// Admins set a custom template via schedule.message_override in the UI.
// Overrides support the same placeholders.

const DEFAULT_ADVANCE_TEMPLATE =
  `Albany JW Parking: Hi {firstName}, your {shiftType} shift is {date} at {time}. ` +
  `Reply {code} to confirm. Reply QUIT or STOP to opt out. ` +
  `If you can\u2019t make it, please contact your overseer.`;

const DEFAULT_T15_TEMPLATE =
  `Albany JW Parking: Hi {firstName}, your {shiftType} shift starts in 15 minutes ({time}). ` +
  `Reply {code} when you arrive. ` +
  `If you can\u2019t make it, please contact your overseer right away.` +
  `{rendezvous}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format a shift start_time value as "h:MM AM/PM".
 * Handles both mssql TIME (epoch-anchored Date) and NVarChar "HH:MM:SS" strings.
 *
 * @param {Date|string|null} val
 * @returns {string}
 */
function fmtTime(val) {
  if (!val) return "";
  let h, m;
  if (val instanceof Date) {
    h = val.getUTCHours();
    m = val.getUTCMinutes();
  } else {
    [h, m] = String(val).split(":").map(Number);
  }
  const ap = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ap}`;
}

/**
 * Format a convention_date (Date or ISO string) as "Friday, August 7".
 *
 * @param {Date|string} d
 * @returns {string}
 */
function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Convert a shift row's convention_date + start_time (Eastern local) to UTC.
 * Handles both Date and string formats for start_time.
 * Assumes EDT (UTC-4) — valid for August convention.
 *
 * @param {Date|string} conventionDate  Eastern local convention date
 * @param {Date|string} startTime       Shift start time in Eastern local
 * @returns {Date}                      UTC datetime of shift start
 */
function shiftToUtc(conventionDate, startTime) {
  const dateStr = new Date(conventionDate).toISOString().slice(0, 10);
  let h, m, s;
  if (startTime instanceof Date) {
    h = startTime.getUTCHours();
    m = startTime.getUTCMinutes();
    s = startTime.getUTCSeconds();
  } else {
    [h, m, s] = String(startTime).split(":").map(Number);
  }
  const utc = new Date(`${dateStr}T00:00:00Z`);
  utc.setUTCHours(h + EDT_OFFSET_HOURS, m, s || 0, 0);
  return utc;
}

/**
 * Return today's date in Eastern time as "YYYY-MM-DD".
 * Accounts for UTC-4: if it's 1 AM UTC, Eastern is still yesterday.
 *
 * @returns {string}
 */
function todayEastern() {
  const eastern = new Date(Date.now() - EDT_OFFSET_HOURS * 60 * 60 * 1000);
  return eastern.toISOString().slice(0, 10);
}

/**
 * Normalize a time value to an "HH:MM:SS" string suitable for splicing
 * into an ISO 8601 datetime template.
 *
 * Accepts:
 *   - Plain "HH:MM" or "HH:MM:SS" strings
 *   - Date objects (epoch-anchored, from mssql TIME columns)
 *   - ISO datetime strings from JSON-serialized mssql TIME values
 *     (e.g. "1970-01-01T23:30:00.000Z")
 *
 * Returns null when the input is unparseable so the caller can skip the
 * tick rather than feeding NaN into the comparison window.
 *
 * @param {string|Date|null} val
 * @returns {string|null}
 */
function normalizeTimePart(val) {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val.valueOf())) return null;
    return (
      String(val.getUTCHours()).padStart(2, "0") + ":" +
      String(val.getUTCMinutes()).padStart(2, "0") + ":" +
      String(val.getUTCSeconds()).padStart(2, "0")
    );
  }
  const s = String(val).trim();
  const match = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    const hh = String(parseInt(match[1], 10)).padStart(2, "0");
    return `${hh}:${match[2]}:${match[3] || "00"}`;
  }
  const d = new Date(s);
  if (isNaN(d.valueOf())) return null;
  return (
    String(d.getUTCHours()).padStart(2, "0") + ":" +
    String(d.getUTCMinutes()).padStart(2, "0") + ":" +
    String(d.getUTCSeconds()).padStart(2, "0")
  );
}

// ─── Message builder ──────────────────────────────────────────────────────────

/**
 * Build the SMS body for a shift alert.
 *
 * Uses schedule.message_override if set, otherwise falls back to the
 * appropriate default template based on alert_category.
 *
 * @param {{ alert_category: string, message_override?: string|null }} schedule
 * @param {{
 *   firstName:       string,
 *   event_type_name: string,
 *   shift_label:     string,
 *   start_time:      Date|string,
 *   convention_date: Date|string,
 *   sms_code:        string,
 * }} row
 * @returns {string}
 */
export function buildAlertMessage(schedule, row) {
  const template =
    schedule.message_override ||
    (schedule.alert_category === "t15min"
      ? DEFAULT_T15_TEMPLATE
      : DEFAULT_ADVANCE_TEMPLATE);

  // Build rendezvous text — only when RV data exists on the row
  let rvText = "";
  if (row.rv_description || row.rv_address || row.rv_floor) {
    const parts = [];
    if (row.rv_location_name) parts.push(row.rv_location_name);
    if (row.rv_description) parts.push(row.rv_description);
    if (row.rv_floor) parts.push(`Floor: ${row.rv_floor}`);
    if (row.rv_address) parts.push(row.rv_address);
    rvText = `\nMeet-up: ${parts.join(". ")}.`;

    // Append link when a photo exists
    if (row.rv_photo && row.rv_sa_id) {
      try {
        const tok = generateRvToken(row.rv_sa_id);
        rvText += `\nDetails: https://albanyjwparking.org/rv/${row.rv_sa_id}?t=${tok}`;
      } catch { /* token secret not yet initialized — skip link */ }
    }
  }

  return template
    .replace(/\{firstName\}/g, row.firstName || "there")
    .replace(/\{shiftType\}/g, row.event_type_name || "shift")
    .replace(/\{shiftLabel\}/g, row.shift_label || "")
    .replace(/\{time\}/g, fmtTime(row.start_time))
    .replace(/\{date\}/g, fmtDate(row.convention_date))
    .replace(/\{code\}/g, row.sms_code || "—")
    .replace(/\{rendezvous\}/g, rvText);
}

// ─── Twilio sender ────────────────────────────────────────────────────────────

/**
 * Send a single SMS via Twilio messaging service.
 *
 * Normalizes the phone number to E.164 (+1XXXXXXXXXX) using the last 10 digits.
 *
 * @param {string} phone         Recipient phone (any format, 10 significant digits)
 * @param {string} body          Message text
 * @param {string} accountSid    Twilio account SID
 * @param {string} authToken     Twilio auth token
 * @param {string} messagingSid  Twilio messaging service SID
 * @returns {Promise<string>}    Twilio message SID
 * @throws if Twilio rejects the send
 */
export async function sendAlertSms(
  phone,
  body,
  accountSid,
  authToken,
  messagingSid,
) {
  const { default: twilio } = await import("twilio");
  const client = twilio(accountSid, authToken);
  const msg = await client.messages.create({
    to: `+1${phone.replace(/\D/g, "").slice(-10)}`,
    messagingServiceSid: messagingSid,
    body,
  });
  return msg.sid;
}

// ─── Core send loop ───────────────────────────────────────────────────────────

/**
 * Send alerts for a resolved set of volunteer+shift rows and log all results.
 *
 * @param {Array}    rows
 * @param {object|null} schedule  Full schedule record, or null for t15min rolling
 * @param {string}   category     alert_category string
 * @param {string}   accountSid
 * @param {string}   authToken
 * @param {string}   messagingSid
 * @param {Function} logError
 * @returns {Promise<{ sent: number, failed: number }>}
 */
async function sendRows(
  rows,
  schedule,
  category,
  accountSid,
  authToken,
  messagingSid,
  logError,
) {
  let sent = 0,
    failed = 0;
  const logRows = [];

  for (const row of rows) {
    const body = buildAlertMessage(
      schedule ?? { alert_category: category, message_override: null },
      row,
    );
    try {
      const sid = await sendAlertSms(
        row.phone,
        body,
        accountSid,
        authToken,
        messagingSid,
      );
      logRows.push({
        schedule_id: schedule?.id || null,
        shift_id: row.shift_id,
        volunteer_id: row.volunteer_id,
        alert_category: category,
        phone: row.phone,
        twilio_sid: sid,
        status: "sent",
      });
      sent++;
    } catch (err) {
      (logError || console.error)(
        `alertScheduler send error vol ${row.volunteer_id} shift ${row.shift_id}:`,
        err,
      );
      logRows.push({
        schedule_id: schedule?.id || null,
        shift_id: row.shift_id,
        volunteer_id: row.volunteer_id,
        alert_category: category,
        phone: row.phone,
        twilio_sid: null,
        status: "failed",
        error_msg: err.message?.slice(0, 500) || "Unknown error",
      });
      failed++;
    }
  }

  if (logRows.length) await logShiftAlerts(logRows);
  return { sent, failed };
}

// ─── Scheduler tick ───────────────────────────────────────────────────────────

/**
 * Single scheduler tick — runs every 60 seconds.
 * Checks both burst schedules and T-15 rolling alerts.
 *
 * @param {{
 *   year:         number,
 *   accountSid:   string,
 *   authToken:    string,
 *   messagingSid: string,
 *   logError:     Function,
 * }} deps
 * @returns {Promise<void>}
 */
async function tick(deps) {
  const { year, accountSid, authToken, messagingSid, logError } = deps;

  // Mutex: skip this tick entirely if the previous one is still running.
  // This is the primary defence against concurrent sends — without it, a
  // single slow Twilio batch can cause every subsequent tick to also fire
  // (because shift_alert_log hasn't been written yet), multiplying sends.
  if (tickInProgress) {
    (logError || console.warn)(
      "alertScheduler: previous tick still in flight, skipping this run.",
    );
    return;
  }
  tickInProgress = true;

  try {
    const now = new Date();
    const today = todayEastern();

    // ── 1. Burst schedules ───────────────────────────────────────────────────
    let schedules;
    try {
      schedules = await getAlertSchedules(year);
    } catch (err) {
      (logError || console.error)(
        "alertScheduler: failed to load schedules:",
        err,
      );
      return;
    }

    const burstWindowMs = BURST_WINDOW_MINUTES * 60 * 1000;

    for (const schedule of schedules) {
      if (!schedule.active) continue;
      if (schedule.alert_category === "t15min") continue;
      if (!schedule.fire_date || !schedule.fire_time_utc) continue;

      const fireDateStr = new Date(schedule.fire_date)
        .toISOString()
        .slice(0, 10);
      const fireTimeStr = normalizeTimePart(schedule.fire_time_utc);
      if (!fireTimeStr) {
        (logError || console.error)(
          `alertScheduler: schedule ${schedule.id} has unparseable fire_time_utc, skipping:`,
          schedule.fire_time_utc,
        );
        continue;
      }
      const fireUtc = new Date(`${fireDateStr}T${fireTimeStr}Z`);
      const msAgo = now - fireUtc;

      // Only fire if scheduled time is within the past BURST_WINDOW_MINUTES.
      // Guard against NaN: a malformed/invalid fire instant produces NaN
      // comparisons which are always false, which would otherwise let the
      // burst fire on every 60-second tick indefinitely.
      if (!Number.isFinite(msAgo) || msAgo < 0 || msAgo > burstWindowMs) {
        continue;
      }

      // Within-process idempotency: skip burst instances we've already
      // dispatched. shift_alert_log handles dedupe across restarts; this
      // Set handles dedupe within a single process even if the log INSERT
      // is delayed. With the tickInProgress mutex above, overlap is no
      // longer possible — this is a second layer of defence.
      const burstKey = `${schedule.id}|${fireDateStr}`;
      if (burstFired.has(burstKey)) continue;

      try {
        const rows = await getShiftsForAlertBurst({
          scheduleId: schedule.id,
          alertCategory: schedule.alert_category,
          fireDate: fireDateStr,
          departments: schedule.departments || null,
          includeNullDept: !!schedule.include_null_dept,
          year,
        });

        // Even when there are no eligible rows (all already logged), mark
        // the burst as fired so subsequent ticks within the window skip
        // the DB roundtrip entirely.
        if (!rows.length) {
          burstFired.add(burstKey);
          continue;
        }

        // Mark fired BEFORE the send. If sendRows throws partway, the
        // partial state is in shift_alert_log and we deliberately do NOT
        // auto-retry within this process — manual investigation is safer
        // than risking another round of duplicate spam.
        burstFired.add(burstKey);

        const { sent, failed } = await sendRows(
          rows,
          schedule,
          schedule.alert_category,
          accountSid,
          authToken,
          messagingSid,
          logError,
        );
        (logError || console.info)(
          `alertScheduler: schedule ${schedule.id} "${schedule.name}" ` +
            `→ sent ${sent}, failed ${failed}`,
        );
      } catch (err) {
        (logError || console.error)(
          `alertScheduler: error processing schedule ${schedule.id}:`,
          err,
        );
      }
    }

    // ── 2. T-15 rolling ─────────────────────────────────────────────────────
    // Crew shifts and meeting shifts are queried separately then merged.
    // Meeting alerts go to all day volunteers not scheduled during the meeting.
    // The tickInProgress mutex above is the dedupe story for T-15 — each
    // (shift, volunteer) pair is gated by shift_alert_log on the SQL side,
    // and ticks can no longer overlap, so the log always wins the race.
    try {
      const [crewCandidates, meetingCandidates] = await Promise.all([
        getT15CandidateShifts(year, today),
        getMeetingT15Candidates(year, today),
      ]);

      const t15Rows = [...crewCandidates, ...meetingCandidates].filter(
        (row) => {
          const shiftUtc = shiftToUtc(row.convention_date, row.start_time);
          const minutesUntil = (shiftUtc - now) / (60 * 1000);
          return (
            minutesUntil >= T15_MIN_MINUTES && minutesUntil <= T15_MAX_MINUTES
          );
        },
      );

      if (t15Rows.length) {
        const { sent, failed } = await sendRows(
          t15Rows,
          null,
          "t15min",
          accountSid,
          authToken,
          messagingSid,
          logError,
        );
        (logError || console.info)(
          `alertScheduler: T-15 → sent ${sent}, failed ${failed}`,
        );
      }
    } catch (err) {
      (logError || console.error)("alertScheduler: T-15 check error:", err);
    }
  } finally {
    // Always release the mutex, even if an error was thrown above.
    tickInProgress = false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the alert scheduler. Call once at app startup after Twilio is ready.
 *
 * Fires an immediate first tick, then every 60 seconds thereafter.
 * Uses interval.unref() so the scheduler does not prevent graceful shutdown.
 *
 * @param {{
 *   year:          number,
 *   accountSid:    string,
 *   authToken:     string,
 *   messagingSid:  string,
 *   logError?:     Function,
 * }} deps
 * @returns {{ stop: () => void }}  Call stop() to cancel (useful in tests)
 */
export function startAlertScheduler(deps) {
  const interval = setInterval(() => {
    tick(deps).catch((err) => {
      (deps.logError || console.error)(
        "alertScheduler: unhandled tick error:",
        err,
      );
    });
  }, 60 * 1000);

  interval.unref();

  // Immediate first tick — catches anything that fired while the server was down
  tick(deps).catch((err) => {
    (deps.logError || console.error)(
      "alertScheduler: initial tick error:",
      err,
    );
  });

  return { stop: () => clearInterval(interval) };
}
