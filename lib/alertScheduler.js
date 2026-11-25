/**
 * @file alertScheduler.js
 * @description Automated shift alert scheduler and SMS sender.
 *
 * Responsibilities:
 *  - Poll every 60 seconds for burst schedules whose fire_time_utc is now.
 *  - Poll every 60 seconds for T-15 rolling alerts (shifts starting in ~15 min).
 *  - Build and send SMS alerts via Twilio for each eligible volunteer+shift pair.
 *  - Log all send attempts (sent and failed) to shift_alert_log.
 *  - Record each text in message_deliveries (source 'shift_reminder') with a
 *    Twilio status callback, so the Send Log shows whether it was delivered.
 *
 * Message design:
 *  - Volunteers reply with their shift code (e.g. FRIN) to confirm attendance.
 *  - QUIT or STOP opts them out — Twilio handles these keywords automatically.
 *  - If they can't make it, the message directs them to contact oversight.
 *  - Admins can override the default template per schedule via message_override.
 *
 * Timezone note:
 *  Burst fire times are stored and compared in UTC. Shift start times are
 *  convention clock times (HH:MM:SS) on a convention date; they become real
 *  moments through lib/conventionTime.js in the convention's time zone (set
 *  per year on System Variables), so daylight saving time and venues in
 *  other zones are handled. "Today" is the convention's today.
 */

import {
  getAlertSchedules,
  getShiftsForAlertBurst,
  getT15CandidateShifts,
  getMeetingT15Candidates,
  logShiftAlerts,
  recordMessageDelivery,
} from "./dbSync.js";
import { sendTrackedSms, backgroundSmsStatusCallbackUrl, rendezvousDetailsUrl } from "./messaging.js";
import {
  getConventionTimeZone,
  conventionToday,
  conventionLocalToUtc,
} from "./conventionTime.js";

import { demoStorage, forEachActiveDepartment } from "./sql.js";
import { getActiveYear } from "./conventionYear.js";
import { getBrand } from "./branding.js";

// ─── Constants ────────────────────────────────────────────────────────────────

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
// Available placeholders (defaults use a subset; overrides may use any):
//   {firstName}   Volunteer's first name
//   {shiftType}   Event type name  (e.g. "Ingress", "Security")
//   {shiftLabel}  Shift label      (e.g. "Shift A", "Morning")
//   {time}        Shift start time (e.g. "6:00 AM")
//   {date}        Convention date  (e.g. "Friday, August 7")
//   {code}        SMS reply code   (e.g. "FRIN") — only triggers attendance
//                 check-in when sent in reply to a T-15 alert; in earlier
//                 alerts the reply falls through to the freeform pipeline.
//   {shifts}      Aggregated bullet list of upcoming shifts — only meaningful
//                 in the all_upcoming category. Expanded by buildAggregateMessage.
//   {rendezvous}  Meet-up details + link — only meaningful in t15min.
//
// Admins set a custom template via schedule.message_override in the UI.

const DEFAULT_ADVANCE_TEMPLATE =
  `Albany JW Parking: Hi {firstName}, reminder: your {shiftType} shift is {date} ` +
  `at {time}. We'll text you 15 minutes before it starts. Can't make it? ` +
  `Contact your overseer. Reply STOP to opt out.`;

const DEFAULT_AGGREGATE_TEMPLATE =
  `Albany JW Parking: Hi {firstName}, here are your upcoming shifts:\n` +
  `{shifts}\n` +
  `We'll send a reminder 15 minutes before each. Can't make one? ` +
  `Contact your overseer. Reply STOP to opt out.`;

const DEFAULT_T15_TEMPLATE =
  `Albany JW Parking: Hi {firstName}, your {shiftType} shift starts in 15 minutes ({time}). ` +
  `Reply {code} when you arrive. ` +
  `If you can\u2019t make it, please contact your overseer right away.` +
  `{rendezvous}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Swap the production site name in a default SMS template for the current
 * brand's (demo requests get the neutral name). Custom message_override
 * templates are left exactly as the admin wrote them.
 *
 * @param {string} template - One of the DEFAULT_*_TEMPLATE constants.
 * @returns {string}
 */
function brandTemplate(template) {
  return template.replaceAll("Albany JW Parking", getBrand().siteName);
}

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
 * Format a convention_date (Date or ISO string) as "Fri Aug 7".
 * Used by formatShiftLine to keep aggregate-alert bullets compact and
 * within the GSM-7 char budget for SMS segmentation.
 *
 * @param {Date|string} d
 * @returns {string}
 */
function fmtDateShort(d) {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The real moment a shift starts: its convention date and convention clock
 * start time, in the convention's time zone (daylight saving included).
 *
 * @param {Date|string} conventionDate  Convention date (DATE value or "YYYY-MM-DD")
 * @param {Date|string} startTime       Convention clock time (TIME value or "HH:MM[:SS]")
 * @param {string} tz                   Convention time zone
 * @returns {Date|null}                 null when either value can't be read
 */
function shiftToUtc(conventionDate, startTime, tz) {
  return conventionLocalToUtc(conventionDate, startTime, tz);
}

/**
 * Today's date in the convention's time zone, "YYYY-MM-DD".
 *
 * @returns {string}
 */
function todayEastern() {
  return conventionToday();
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
    brandTemplate(
      schedule.alert_category === "t15min"
        ? DEFAULT_T15_TEMPLATE
        : DEFAULT_ADVANCE_TEMPLATE,
    );

  // Build rendezvous text — only when RV data exists on the row
  let rvText = "";
  if (row.rv_description || row.rv_address || row.rv_floor) {
    const parts = [];
    if (row.rv_location_name) parts.push(row.rv_location_name);
    if (row.rv_description) parts.push(row.rv_description);
    if (row.rv_floor) parts.push(`Floor: ${row.rv_floor}`);
    if (row.rv_address) parts.push(row.rv_address);
    rvText = `\nMeet-up: ${parts.join(". ")}.`;

    // Append link when a photo exists (the page shows it full size)
    if (row.rv_photo && row.rv_sa_id) {
      const url = rendezvousDetailsUrl(row.rv_sa_id);
      if (url) rvText += `\nDetails: ${url}`;
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

/**
 * Group a flat array of (volunteer, shift) rows into per-volunteer arrays.
 *
 * Preserves source ordering, so if the upstream query returned rows sorted
 * by convention_date/start_time, each volunteer's shift list will also be
 * in that order.
 *
 * @param {Array<{volunteer_id:number}>} rows
 * @returns {Map<number, Array<object>>}  volunteer_id -> rows for that volunteer
 */
function groupRowsByVolunteer(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.volunteer_id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

/**
 * Render a single shift as a compact bullet line for the aggregate template.
 * Uses ASCII characters only ("- " prefix, " - " separator) so the resulting
 * SMS stays in GSM-7 encoding for cost-efficient segmentation.
 *
 * Example output: "- Fri Aug 7, 7:00 AM - Ingress"
 *
 * @param {{
 *   convention_date: Date|string,
 *   start_time:      Date|string,
 *   event_type_name: string|null,
 * }} row
 * @returns {string}
 */
function formatShiftLine(row) {
  const date = fmtDateShort(row.convention_date);
  const time = fmtTime(row.start_time);
  const type = row.event_type_name || "shift";
  return `- ${date}, ${time} - ${type}`;
}

/**
 * Build the SMS body for an aggregated all_upcoming alert covering every
 * shift one volunteer has on or after the fire_date.
 *
 * Uses schedule.message_override if set, otherwise DEFAULT_AGGREGATE_TEMPLATE.
 * The {shifts} placeholder is expanded to a newline-joined list of bullets
 * rendered by formatShiftLine. Other placeholders ({firstName}, {shiftType},
 * {time}, etc.) — if present in a custom override — are resolved from the
 * FIRST shift in volunteerRows, so an override that uses {shiftType} still
 * produces a sensible (if imprecise) result.
 *
 * @param {{ alert_category: string, message_override?: string|null }} schedule
 * @param {Array<object>} volunteerRows  Non-empty array of shift rows for one volunteer
 * @returns {string}
 */
export function buildAggregateMessage(schedule, volunteerRows) {
  const template =
    schedule.message_override || brandTemplate(DEFAULT_AGGREGATE_TEMPLATE);
  const first = volunteerRows[0];
  const shiftsBlock = volunteerRows.map(formatShiftLine).join("\n");

  return template
    .replace(/\{firstName\}/g, first.firstName || "there")
    .replace(/\{shiftType\}/g, first.event_type_name || "shift")
    .replace(/\{shiftLabel\}/g, first.shift_label || "")
    .replace(/\{time\}/g, fmtTime(first.start_time))
    .replace(/\{date\}/g, fmtDate(first.convention_date))
    .replace(/\{code\}/g, first.sms_code || "—")
    .replace(/\{shifts\}/g, shiftsBlock)
    .replace(/\{rendezvous\}/g, "");
}

// ─── Twilio sender ────────────────────────────────────────────────────────────

/**
 * Twilio statuses a just-sent text can be recorded with; anything else
 * Twilio reports at send time is recorded as 'queued'.
 *
 * @type {ReadonlySet<string>}
 */
const EARLY_SMS_STATUSES = new Set(["queued", "accepted", "sending", "sent", "delivered"]);

/**
 * Record one alert text in dbo.message_deliveries (current department).
 * Never throws: a failure to record must not stop or repeat a send.
 *
 * @param {{ source: string, runId?: string|null, volunteerId?: number|null,
 *           recipientName?: string|null }} track
 * @param {string} phone
 * @param {{ ok: boolean, sid: string|null, status: string|null,
 *           errorCode: number|null, errorMessage: string|null }} result
 * @param {string|null} statusCallback
 * @returns {Promise<void>}
 */
async function recordAlertDelivery(track, phone, result, statusCallback) {
  try {
    await recordMessageDelivery({
      source: track.source,
      runId: track.runId || null,
      volunteerId: track.volunteerId ?? null,
      recipientName: track.recipientName || null,
      channel: "sms",
      address: phone,
      providerSid: result.sid,
      status: !result.ok
        ? "failed"
        : statusCallback
          ? EARLY_SMS_STATUSES.has(result.status) ? result.status : "queued"
          : "not_tracked",
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    });
  } catch (err) {
    console.error("alertScheduler: failed to record message delivery:", err);
  }
}

/**
 * Send a single SMS via Twilio messaging service.
 *
 * Normalizes the phone number to E.164 (+1XXXXXXXXXX) using the last 10 digits.
 *
 * With `track`, the text is sent with a Twilio status callback (when the
 * app has a public address, see backgroundSmsStatusCallbackUrl) and recorded
 * in dbo.message_deliveries, failed sends included, so the Shift Alerts and
 * Capacity Alerts logs can show whether it was delivered. Recording needs a
 * department in the session context (the alert tick runs per department;
 * web requests have one).
 *
 * @param {string} phone         Recipient phone (any format, 10 significant digits)
 * @param {string} body          Message text
 * @param {string} accountSid    Twilio account SID
 * @param {string} authToken     Twilio auth token
 * @param {string} messagingSid  Twilio messaging service SID
 * @param {{
 *   source:          string,          'shift_reminder', 'capacity_alert', 'rendezvous_alert'
 *   runId?:          string|null,     groups the texts of one send
 *   volunteerId?:    number|null,
 *   recipientName?:  string|null,
 * }|null} [track]                    Record delivery; omit for an untracked text
 * @returns {Promise<string|null>}    Twilio message SID (null on demo)
 * @throws if Twilio rejects the send (the error carries Twilio's `code`)
 */
export async function sendAlertSms(
  phone,
  body,
  accountSid,
  authToken,
  messagingSid,
  track = null,
) {
  // Demo requests never send real texts (mirrors lib/messaging.js).
  if (demoStorage.getStore()?.isDemo) {
    console.log("[DEMO] sendAlertSms suppressed.");
    return null;
  }

  const to = `+1${String(phone || "").replace(/\D/g, "").slice(-10)}`;
  const statusCallback = track ? backgroundSmsStatusCallbackUrl() : null;
  const result = await sendTrackedSms({
    to,
    body,
    accountSid,
    authToken,
    messagingServiceSid: messagingSid,
    statusCallback,
  });
  if (track) await recordAlertDelivery(track, to, result, statusCallback);

  if (!result.ok) {
    const err = new Error(result.errorMessage || "SMS send failed");
    if (result.errorCode != null) err.code = result.errorCode;
    throw err;
  }
  return result.sid;
}

/**
 * The run id that groups one send of shift reminders in
 * dbo.message_deliveries: one per schedule per Eastern day
 * (`reminder:<scheduleId>:<YYYY-MM-DD>`), or `t15:<YYYY-MM-DD>` for the
 * rolling 15-minute reminders.
 *
 * @param {object|null} schedule
 * @returns {string}
 */
function reminderRunId(schedule) {
  const day = todayEastern();
  return schedule?.id ? `reminder:${schedule.id}:${day}` : `t15:${day}`;
}

/**
 * Display name for a volunteer row ("First Last"), or null.
 *
 * @param {{ firstName?: string, lastName?: string }} row
 * @returns {string|null}
 */
function rowName(row) {
  const name = `${row.firstName || ""} ${row.lastName || ""}`.trim();
  return name || null;
}

// ─── Core send loop ───────────────────────────────────────────────────────────

/**
 * Send alerts for a resolved set of volunteer+shift rows and log all results.
 *
 * For most categories (next_day, same_day, t15min) one SMS is sent per row.
 *
 * For the all_upcoming category, rows are grouped by volunteer_id and a
 * single aggregated SMS is sent per volunteer (rendered by
 * buildAggregateMessage). On success, one shift_alert_log row is written
 * per shift in the group — all sharing the same twilio_sid — so the
 * per-(schedule, shift, volunteer) dedupe in getShiftsForAlertBurst still
 * works correctly. On failure, every shift in the group is logged as
 * "failed" with the same error_msg.
 *
 * @param {Array}       rows
 * @param {object|null} schedule  Full schedule record, or null for t15min rolling
 * @param {string}      category  alert_category string
 * @param {string}      accountSid
 * @param {string}      authToken
 * @param {string}      messagingSid
 * @param {Function}    logError
 * @returns {Promise<{
 *   sent:           number,   shifts logged 'sent'
 *   failed:         number,   shifts logged 'failed'
 *   messagesSent:   number,   distinct SMS sends that succeeded
 *   messagesFailed: number,   distinct SMS sends that failed
 * }>}
 */
export async function sendRows(
  rows,
  schedule,
  category,
  accountSid,
  authToken,
  messagingSid,
  logError,
) {
  let sent = 0,
    failed = 0,
    messagesSent = 0,
    messagesFailed = 0;
  const logRows = [];
  const effectiveSchedule =
    schedule ?? { alert_category: category, message_override: null };
  const runId = reminderRunId(schedule);

  if (category === "all_upcoming") {
    // ── Aggregated path: one message per volunteer covering all their shifts
    const groups = groupRowsByVolunteer(rows);

    for (const [volunteerId, volRows] of groups) {
      const body = buildAggregateMessage(effectiveSchedule, volRows);
      const phone = volRows[0].phone;

      try {
        const sid = await sendAlertSms(
          phone,
          body,
          accountSid,
          authToken,
          messagingSid,
          {
            source: "shift_reminder",
            runId,
            volunteerId,
            recipientName: rowName(volRows[0]),
          },
        );
        for (const r of volRows) {
          logRows.push({
            schedule_id: schedule?.id || null,
            shift_id: r.shift_id,
            volunteer_id: volunteerId,
            alert_category: category,
            phone,
            twilio_sid: sid,
            status: "sent",
          });
          sent++;
        }
        messagesSent++;
      } catch (err) {
        (logError || console.error)(
          `alertScheduler aggregate send error vol ${volunteerId} (${volRows.length} shifts):`,
          err,
        );
        const errMsg = err.message?.slice(0, 500) || "Unknown error";
        for (const r of volRows) {
          logRows.push({
            schedule_id: schedule?.id || null,
            shift_id: r.shift_id,
            volunteer_id: volunteerId,
            alert_category: category,
            phone,
            twilio_sid: null,
            status: "failed",
            error_msg: errMsg,
          });
          failed++;
        }
        messagesFailed++;
      }
    }
  } else {
    // ── Per-row path: one message per (volunteer, shift) pair
    for (const row of rows) {
      const body = buildAlertMessage(effectiveSchedule, row);
      try {
        const sid = await sendAlertSms(
          row.phone,
          body,
          accountSid,
          authToken,
          messagingSid,
          {
            source: "shift_reminder",
            runId,
            volunteerId: row.volunteer_id,
            recipientName: rowName(row),
          },
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
        messagesSent++;
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
        messagesFailed++;
      }
    }
  }

  if (logRows.length) await logShiftAlerts(logRows);
  return { sent, failed, messagesSent, messagesFailed };
}

// ─── Scheduler tick ───────────────────────────────────────────────────────────

/**
 * Single scheduler tick — runs every 60 seconds.
 * Checks both burst schedules and T-15 rolling alerts.
 *
 * The convention year is resolved on every tick via getActiveYear(), so a
 * rollover takes effect without restarting the app.
 *
 * @param {{
 *   accountSid:   string,
 *   authToken:    string,
 *   messagingSid: string,
 *   logError:     Function,
 * }} deps
 * @returns {Promise<void>}
 */
async function tick(deps) {
  const { accountSid, authToken, messagingSid, logError } = deps;


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
    const year = await getActiveYear();
    const tz = await getConventionTimeZone();
    const now = new Date();
    const today = conventionToday(now, tz);

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

        const { sent, failed, messagesSent, messagesFailed } = await sendRows(
          rows,
          schedule,
          schedule.alert_category,
          accountSid,
          authToken,
          messagingSid,
          logError,
        );
        const sentDetail =
          messagesSent === sent
            ? `sent ${sent}`
            : `sent ${messagesSent} messages (${sent} shifts)`;
        const failedDetail =
          messagesFailed === failed
            ? `failed ${failed}`
            : `failed ${messagesFailed} messages (${failed} shifts)`;
        (logError || console.info)(
          `alertScheduler: schedule ${schedule.id} "${schedule.name}" ` +
            `→ ${sentDetail}, ${failedDetail}`,
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
          const shiftUtc = shiftToUtc(row.convention_date, row.start_time, tz);
          if (!shiftUtc) return false;
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
 * Fires an immediate first tick, then every 60 seconds thereafter. Each
 * tick runs once per active department (forEachActiveDepartment).
 * Uses interval.unref() so the scheduler does not prevent graceful shutdown.
 *
 * @param {{
 *   accountSid:    string,
 *   authToken:     string,
 *   messagingSid:  string,
 *   logError?:     Function,
 * }} deps
 * @returns {{ stop: () => void }}  Call stop() to cancel (useful in tests)
 */
export function startAlertScheduler(deps) {
  // One tick per active department, one after another: with row-level
  // security on, each tick only sees that department's shifts and alerts.
  const runAll = () => forEachActiveDepartment(() => tick(deps));

  const interval = setInterval(() => {
    runAll().catch((err) => {
      (deps.logError || console.error)(
        "alertScheduler: unhandled tick error:",
        err,
      );
    });
  }, 60 * 1000);

  interval.unref();

  // Immediate first tick — catches anything that fired while the server was down
  runAll().catch((err) => {
    (deps.logError || console.error)(
      "alertScheduler: initial tick error:",
      err,
    );
  });

  return { stop: () => clearInterval(interval) };
}
