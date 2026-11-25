/**
 * @file routes/smsWebhookRoute.js
 * @description Handles incoming Twilio SMS webhooks.
 *
 * Routing decision tree (in order):
 *  1. Validate the Twilio signature — reject spoofed requests.
 *  2. Keywords (whole message only): opt-out (STOP, QUIT, …) and opt-in
 *     (START, UNSTOP) update the volunteer's consent through
 *     handleSmsOptOutWebhook; HELP / INFO are left to Twilio's own reply.
 *  3. Unknown phone number — reply asking for name, alert overseers.
 *  3b. A number (1–9) or the answer in words ("yes", "no", "maybe", a
 *     custom choice) from a known volunteer answers only the newest
 *     invitation texted to them in the last 7 days (lib/rsvp.js
 *     matchTextReply): not yet answered, it is recorded and confirmed;
 *     already answered, they get the link to change it. Answers are only
 *     changed with the link. If another invitation is still waiting, the
 *     reply says so, and FOLLOW_UP_DELAY_MS later it is sent again as a
 *     follow-up (tracked in message_deliveries), so it becomes the newest
 *     and the next number answers it. With no recent text invitation, the
 *     message carries on below.
 *  4. Known volunteer + valid shift code + T-15 sent — existing check-in path.
 *  5. Known volunteer who receives volunteer-text alerts
 *       (alerts.receiveVolunteerTexts) — suppress freeform pipeline
 *       (prevents notification loop when alert recipients reply to alert SMS).
 *  6. Known volunteer + everything else (freeform) — AI analysis pipeline:
 *       a. Acknowledge the volunteer via TwiML reply.
 *       b. Async (post-response): analyze, append note, log to DB,
 *          create action item, notify overseers via SMS and email.
 *
 * Also POST /webhook/sms/status: Twilio's delivery status callbacks for
 * texts the app sends with a statusCallback (schedule publishes, campaign
 * texts, shift reminders, capacity alerts and meet-up alerts). Updates dbo.message_deliveries; on error 21610
 * (the number replied STOP) also sets the volunteer's sms_opted_in to 0.
 *
 * Security:
 *  - No session auth (POST from Twilio, not a browser).
 *  - No CSRF token (not a browser form).
 *  - Twilio signature validation takes the place of both.
 *  - Mounted in index.js BEFORE csrfProtection middleware.
 *
 * Demo guard:
 *  - SMS sends and emails are suppressed in the demo environment via
 *    the demoStorage AsyncLocalStorage context checked inside messaging.js.
 *  - DB writes still occur in demo so the schema can be exercised.
 */

import express from "express";
import { publicRoute } from "../middleware/publicRoute.js";
import {
  findVolunteerByPhoneOrEmail,
  findShiftBySmsCode,
  hasT15AlertBeenSent,
  getSchedulerDayForVolunteerShift,
  upsertAttendance,
  handleSmsOptOutWebhook,
  getOverseerContacts,
  getSystemActorId,
  getTextReplyInvitations,
  remindInvitation,
  recordMessageDelivery,
  logInboundSmsMessage,
  createVolunteerAction,
  resolveBlackoutHints,
  createAiBlackoutSuggestion,
  resolveSmsDepartment,
  volunteerHasPermission,
  updateMessageDeliveryStatus,
  markVolunteerSmsOptedOut,
} from "../lib/dbSync.js";
import { analyzeSms } from "../lib/smsInboundAnalyzer.js";
import {
  sendResetSms,
  sendResetEmail,
  getBaseUrl,
  sendTrackedSms,
  smsStatusCallbackUrl,
} from "../lib/messaging.js";
import { runAsDepartment, getRequestContext } from "../lib/sql.js";
import {
  matchTextReply,
  mightBeTextAnswer,
  recordAnswer,
  answerLabel,
  parseAnswerConfig,
  textReplyHint,
} from "../lib/rsvp.js";
import { getActiveYear } from "../lib/conventionYear.js";

/**
 * Convention-local date and time (America/New_York), used to find a
 * volunteer's shift today when routing an inbound SMS.
 *
 * @returns {{ today: string, nowTime: string }}  YYYY-MM-DD and HH:MM:SS
 */
function easternNow() {
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const nowTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  return { today, nowTime };
}

/**
 * Point this request's context at one department, so everything the webhook
 * does next (logging the message, notes, actions, overseer alerts) belongs to
 * that department. The webhook starts in "system" scope (no session).
 *
 * @param {import("express").Request & { requestContext?: { departmentId: number|null, scope: string|null } }} req
 * @param {number} departmentId
 * @returns {void}
 */
function routeToDepartment(req, departmentId) {
  if (req.requestContext) {
    req.requestContext.departmentId = departmentId;
    req.requestContext.scope = "department";
  }
  console.log(`[${new Date().toISOString()}] [smsWebhook] Routed to department ${departmentId}`);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_TWIML = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

/**
 * Opt-out keywords (the Messaging Service's list). Twilio blocks the number
 * and replies itself; the webhook still arrives, so the volunteer record is
 * updated here too.
 */
const OPT_OUT_KEYWORDS = new Set([
  "STOP",
  "STOPALL",
  "QUIT",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
]);

/**
 * Opt-in keywords (the Messaging Service's list: START, UNSTOP). Twilio
 * lifts its block and replies itself; here the volunteer record gets
 * consent back. YES is not one: it answers an invitation (step 5b).
 */
const OPT_IN_KEYWORDS = new Set(["START", "UNSTOP"]);

/**
 * Help keywords. Twilio sends the help reply itself; the webhook only
 * keeps them out of the AI pipeline so oversight isn't alerted.
 */
const HELP_KEYWORDS = new Set(["HELP", "INFO"]);

/** Base URL shown in overseer alert messages. */
const DASHBOARD_URL = "albanyjwparking.org";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validate a Twilio webhook request signature.
 *
 * @param {string}                   authToken
 * @param {string}                   signature  Value of X-Twilio-Signature header
 * @param {string}                   url        Full canonical URL Twilio posted to
 * @param {Record<string, string>}   params     URL-decoded POST body
 * @returns {Promise<boolean>}
 */
async function validateTwilioSig(authToken, signature, url, params) {
  try {
    const { default: twilio } = await import("twilio");
    return twilio.validateRequest(authToken, signature, url, params);
  } catch {
    return false;
  }
}

/**
 * Escape characters that are special inside XML/TwiML text nodes.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * How long after the reply to a texted answer the follow-up (another
 * invitation still waiting) is sent, so it arrives after the reply.
 */
const FOLLOW_UP_DELAY_MS = 10_000;

/**
 * Build a TwiML response string, optionally containing reply messages.
 *
 * @param {string|string[]|null} [msg]  One reply, or several sent in order;
 *   each becomes its own <Message> element.
 * @returns {string}
 */
function buildTwiml(msg) {
  const msgs = (Array.isArray(msg) ? msg : [msg]).filter(Boolean);
  if (!msgs.length) return EMPTY_TWIML;
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    msgs.map((m) => `<Message>${escapeXml(m)}</Message>`).join("") +
    `</Response>`
  );
}

/**
 * Format a UTC Date as "M/D/YYYY h:MM AM/PM" in Eastern time.
 * Hardcoded EDT (UTC-4) offset — valid for the August convention window.
 *
 * @param {Date} [date]
 * @returns {string}
 */
function fmtEastern(date = new Date()) {
  const eastern = new Date(date.getTime() - 4 * 60 * 60 * 1000);
  const mo = eastern.getUTCMonth() + 1;
  const d = eastern.getUTCDate();
  const yr = eastern.getUTCFullYear();
  let h = eastern.getUTCHours();
  const m = String(eastern.getUTCMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${mo}/${d}/${yr} ${h}:${m} ${ap}`;
}

// ─── Router factory ───────────────────────────────────────────────────────────

/**
 * Build the SMS webhook Express router.
 *
 * @param {{
 *   twilioAuthToken:  string,
 *   twilioAccountSid: string,
 *   twilioMsgSid:     string,
 *   smtpConfig: {
 *     host: string,
 *     port: number,
 *     user: string,
 *     pass: string,
 *   },
 *   logError?: (...args: any[]) => void,
 * }} deps
 * @returns {import("express").Router}
 */
export function smsWebhookRouter({
  twilioAuthToken,
  twilioAccountSid,
  twilioMsgSid,
  smtpConfig,
  logError,
}) {
  const log = logError || console.error;
  const router = express.Router();

  /** Messaging settings for answer-change alerts (lib/rsvp.js). */
  const alertSenders = { twilioAccountSid, twilioAuthToken, twilioMsgSid, smtpConfig };

  // Twilio posts URL-encoded form bodies
  router.use(express.urlencoded({ extended: false }));

  /**
   * POST /webhook/sms/incoming
   * Called by Twilio when any reply arrives for an outbound number.
   *
   * Always returns TwiML regardless of outcome — Twilio retries on non-2xx
   * or missing responses, which would cause duplicate processing.
   */
  router.post("/incoming", publicRoute("Twilio inbound SMS (signature checked in handler)"), async (req, res) => {
    /**
     * Send a TwiML response and end the HTTP transaction.
     * Accepts an optional reply body (or several, sent in order).
     *
     * @param {string|string[]|null} [msg]
     */
    const reply = (msg = null) => {
      res.setHeader("Content-Type", "text/xml");
      res.send(buildTwiml(msg));
    };

    try {
      // ── 1. Validate Twilio signature ───────────────────────────────
      const twilioSig = String(req.headers["x-twilio-signature"] || "");
      const proto = String(
        req.headers["x-forwarded-proto"] || req.protocol || "https",
      );
      const host = String(
        req.headers["x-forwarded-host"] || req.headers["host"] || "",
      );
      const fullUrl = `${proto}://${host}${req.originalUrl}`;

      if (twilioAuthToken) {
        const valid = await validateTwilioSig(
          twilioAuthToken,
          twilioSig,
          fullUrl,
          req.body || {},
        );
        if (!valid) {
          log(
            "[smsWebhook] Rejected: invalid Twilio signature url=%s",
            fullUrl,
          );
          return reply();
        }
      }

      const fromRaw = String(req.body?.From || "").trim();
      const bodyRaw = String(req.body?.Body || "").trim();

      if (!fromRaw) {
        log("[smsWebhook] Missing From field");
        return reply();
      }

      // ── 2. Normalize phone to last 10 digits ───────────────────────
      const phoneDigits = fromRaw.replace(/\D+/g, "").slice(-10);
      if (phoneDigits.length < 10) {
        log("[smsWebhook] Invalid From phone: %s", fromRaw);
        return reply();
      }

      // ── 3. Normalize body — uppercase alphanumeric only (for code lookup)
      const code = bodyRaw.replace(/[^A-Z0-9]/gi, "").toUpperCase();

      // ── 4. Route opt-out, opt-in and help keywords ─────────────────
      // Twilio answers these itself (the replies set on the Messaging
      // Service), so the webhook sends no reply of its own. Only the whole
      // message counts as a keyword ("STOP", not "please stop").
      const keyword = bodyRaw.trim().toUpperCase();
      if (OPT_OUT_KEYWORDS.has(keyword) || OPT_IN_KEYWORDS.has(keyword)) {
        try {
          const optVolunteer = await findVolunteerByPhoneOrEmail(phoneDigits, null);
          await handleSmsOptOutWebhook({
            phone: phoneDigits,
            eventType: OPT_OUT_KEYWORDS.has(keyword) ? "STOP" : "UNSTOP",
            rawPayload: JSON.stringify(req.body || {}),
            volunteerId: optVolunteer?.id ?? null,
          });
          log(`[smsWebhook] ${keyword} processed for ${phoneDigits} (volunteer ${optVolunteer?.id ?? "not found"})`);
        } catch (err) {
          log("[smsWebhook] Opt-out / opt-in error:", err);
        }
        return reply();
      }
      if (HELP_KEYWORDS.has(keyword)) {
        log(`[smsWebhook] ${keyword} from ${phoneDigits} (Twilio replies)`);
        return reply();
      }

      // ── 5. Look up volunteer by phone ──────────────────────────────
      const volunteer = await findVolunteerByPhoneOrEmail(phoneDigits, null);

      if (!volunteer) {
        // ── Unknown caller path ────────────────────────────────────
        log("[smsWebhook] Unknown phone %s — alerting overseers", phoneDigits);

        // Unknown callers go to Volunteer Services (routing rule 4).
        routeToDepartment(
          req,
          await resolveSmsDepartment({ volunteerId: null, ...easternNow() }),
        );

        reply(
          "Albany JW Parking: We received your message but couldn't find you " +
            "in our records. Could you share your full name so we can assist you?",
        );

        // Fire-and-forget — response already sent
        setImmediate(async () => {
          try {
            await logInboundSmsMessage({
              volunteerId: null,
              fromPhone: fromRaw,
              rawBody: bodyRaw || "(empty)",
              aiSummary: null,
              aiCategory: null,
              aiActionItems: null,
              aiRawResponse: null,
              aiError: null,
              promptTokens: null,
              completionTokens: null,
            });

            const overseers = await getOverseerContacts();
            const smsBody =
              `Albany JW Parking Alert: Unknown caller ${fromRaw} texted: ` +
              `"${bodyRaw}". Check the dashboard at ${DASHBOARD_URL}.`;

            const emailSubject = `Inbound SMS from unknown caller (${fromRaw})`;
            const emailBody =
              `Albany JW Parking received an inbound SMS from an unknown number.\n\n` +
              `From: ${fromRaw}\n` +
              `Message: "${bodyRaw}"\n\n` +
              `The caller was asked to provide their name. ` +
              `Please monitor the messages dashboard for their reply.`;

            for (const overseer of overseers) {
              // Don't notify an overseer about a message from their own phone.
              const overseerDigits = (overseer.phone || "").replace(/\D+/g, "").slice(-10);
              if (overseerDigits && overseerDigits === phoneDigits) {
                log("[smsWebhook] Skipping self-notify for overseer vol %d", overseer.id);
                continue;
              }

              if (overseer.smsCapable && overseer.phone) {
                await sendResetSms(
                  overseer.phone,
                  "",
                  twilioAccountSid,
                  twilioAuthToken,
                  twilioMsgSid,
                  { customBody: smsBody },
                ).catch((err) => log("[smsWebhook] Overseer SMS error:", err));
              }
              if (overseer.email) {
                await sendResetEmail(overseer.email, "", {
                  ...smtpConfig,
                  subject: emailSubject,
                  customBody: emailBody,
                }).catch((err) =>
                  log("[smsWebhook] Overseer email error:", err),
                );
              }
            }
          } catch (err) {
            log("[smsWebhook] Unknown-caller post-reply error:", err);
          }
        });

        return;
      }

      // ── 5b. A texted first answer to an invitation (1, 2, 3 … or the
      // answer in words: "yes", "no", "maybe", a custom choice) ──────
      // Only answers the newest invitation texted in the last week.
      // Changing an answer is done with the link. Another invitation still
      // waiting is sent again as a follow-up, so it becomes the newest
      // (lib/rsvp.js matchTextReply). Words that aren't an answer carry on
      // as an ordinary message.
      if (mightBeTextAnswer(bodyRaw)) {
        const match = matchTextReply(bodyRaw, await getTextReplyInvitations(volunteer.id));
        const linkFor = (inv) => `${getBaseUrl(req)}/invite/respond/${encodeURIComponent(inv.token)}`;
        const deptOf = (inv) => inv.department_name || "Convention";

        /**
         * "You have 1 more invitation waiting for your answer. We'll send it
         * in a moment." — added to the reply when another is waiting.
         *
         * @param {number} waiting
         * @returns {string}
         */
        const waitingNote = (waiting) =>
          waiting > 0
            ? `\n\nYou have ${waiting === 1 ? "1 more invitation" : `${waiting} more invitations`} ` +
              `waiting for your answer. We'll send ${waiting === 1 ? "it" : "the next one"} in a moment.`
            : "";

        /**
         * Send the waiting invitation again as a follow-up, FOLLOW_UP_DELAY_MS
         * after the reply: a follow-up heading, the invitation as first sent,
         * its link and the reply line. It is marked as texted now (a
         * reminder by "text reply") so the next number answers it, and the
         * text is tracked in message_deliveries under its department.
         *
         * @param {object|null} next - From matchTextReply.
         * @returns {void}
         */
        const sendFollowUp = (next) => {
          if (!next || !fromRaw) return;
          const link = linkFor(next);
          const body = String(next.message_body || "").trim();
          const hint = textReplyHint(parseAnswerConfig(next.response_config));
          const text = [
            `${deptOf(next)} — Follow-up: an invitation still waiting for your answer`,
            next.batch_name,
            body,
            body.includes(link) ? "" : `Answer here: ${link}`,
            hint,
          ].filter(Boolean).join("\n\n");
          const statusCallback = smsStatusCallbackUrl(req);
          const isDemo = getRequestContext()?.isDemo === true;
          const name = [volunteer.firstName, volunteer.lastName].filter(Boolean).join(" ");

          setTimeout(() => {
            runAsDepartment(next.department_id, async () => {
              const result = await sendTrackedSms({
                to: fromRaw,
                body: text,
                accountSid: twilioAccountSid,
                authToken: twilioAuthToken,
                messagingServiceSid: twilioMsgSid,
                statusCallback,
              });
              if (result.ok) {
                await remindInvitation({ id: next.id, channel: "sms", remindedBy: "text reply" });
              }
              await recordMessageDelivery({
                source: "campaign",
                runId: null,
                volunteerId: volunteer.id,
                recipientName: name || null,
                channel: "sms",
                address: fromRaw,
                providerSid: result.sid,
                status: !result.ok
                  ? "failed"
                  : statusCallback
                    ? ["queued", "accepted", "sending", "sent", "delivered"].includes(result.status)
                      ? result.status
                      : "queued"
                    : "not_tracked",
                errorCode: result.errorCode,
                errorMessage: result.errorMessage,
              });
              log(`[smsWebhook] texted answer: follow-up for invitation ${next.id} to vol ${volunteer.id} ${result.ok ? "sent" : "failed"}`);
            }, { isDemo }).catch((err) => log("[smsWebhook] texted answer follow-up error:", err));
          }, FOLLOW_UP_DELAY_MS);
        };

        if (match.kind === "answered") {
          const inv = match.invitation;
          sendFollowUp(match.next);
          return reply(
            `${deptOf(inv)}: You've already answered ${inv.batch_name}. To change your answer, use your link: ${linkFor(inv)}` +
              waitingNote(match.waiting),
          );
        }
        if (match.kind === "unknown") {
          const inv = match.invitation;
          return reply(`${deptOf(inv)}: Please reply with a number from 1 to ${match.count} to answer ${inv.batch_name}.`);
        }
        if (match.kind === "one") {
          const inv = match.invitation;
          const result = await recordAnswer({
            invitation: inv,
            response: match.response,
            source: "text",
            senders: alertSenders,
          });
          if (!result.found) {
            log(`[smsWebhook] texted answer: invitation ${inv.id} not updated`);
            return reply(`${deptOf(inv)}: Sorry, we couldn't save your answer. Please use the link in the invitation.`);
          }
          log(`[smsWebhook] texted answer: vol ${volunteer.id} invitation ${inv.id} = ${match.response}`);
          sendFollowUp(match.next);
          return reply(
            `${deptOf(inv)}: Thanks, ${volunteer.firstName || "there"}! We've recorded "${answerLabel(match.response)}" ` +
              `for ${inv.batch_name}. To change it later, use your link: ${linkFor(inv)}` +
              waitingNote(match.waiting),
          );
        }
      }

      /** Whether a department has been chosen for this message yet. */
      let routed = false;

      // ── 6. Try shift code lookup (check-in path) ───────────────────
      // SMS codes are max 8 characters (NVarChar(8) in DB). Any longer
      // normalized string cannot match a shift code — skip the DB call.
      if (code && code.length <= 8) {
        const year = await getActiveYear();
        const shift = await findShiftBySmsCode(code, year);

        if (shift) {
          // A shift code belongs to that shift's department (routing rule 1).
          routeToDepartment(
            req,
            await resolveSmsDepartment({
              volunteerId: volunteer.id,
              shiftId: shift.shift_id,
              ...easternNow(),
            }),
          );
          routed = true;

          const t15Sent = await hasT15AlertBeenSent(
            volunteer.id,
            shift.shift_id,
          );

          if (t15Sent) {
            // ── Existing check-in flow — unchanged ─────────────
            const dayId = await getSchedulerDayForVolunteerShift(
              volunteer.id,
              shift.shift_id,
            );

            if (!dayId) {
              log(
                "[smsWebhook] No convention_day_id for vol %d shift %d",
                volunteer.id,
                shift.shift_id,
              );
              return reply();
            }

            await upsertAttendance({
              volunteerId: volunteer.id,
              conventionDayId: dayId,
              sessionId: null,
              shiftId: shift.shift_id,
              attended: true,
              notes: "T-15 SMS reply",
              recordedBy: "sms-webhook",
              walkIn: false,
            });

            log(
              "[smsWebhook] Attendance recorded: vol %d shift %d day %d code %s",
              volunteer.id,
              shift.shift_id,
              dayId,
              code,
            );

            return reply();
          }

          // Code matched but T-15 not sent — fall through to freeform
          log(
            "[smsWebhook] Code %s matched shift %d but T-15 not sent for vol %d — treating as freeform",
            code,
            shift.shift_id,
            volunteer.id,
          );
        }
      }

      // ── 7. Alert-recipient guard — suppress freeform pipeline ──
      // Prevents a notification loop: when an alert recipient replies to an alert SMS
      // (which arrives over the same Twilio Messaging Service channel), their
      // reply would otherwise trigger the full freeform pipeline and notify
      // every other recipient about what they just said.
      // The shift-code check-in path (step 6) runs before this guard and is
      // unaffected — oversight staff can still check in via SMS code normally.
      //
      // First choose the department (routing rules 2–4) unless a shift code
      // already did; the permission that matters is the one in that department.
      if (!routed) {
        routeToDepartment(
          req,
          await resolveSmsDepartment({ volunteerId: volunteer.id, ...easternNow() }),
        );
        routed = true;
      }
      // Texts from people who themselves receive these alerts
      // (alerts.receiveVolunteerTexts in the routed department) are not
      // forwarded — that would loop (phase 3d-5; was Overseer and up).
      if (await volunteerHasPermission(volunteer.id, "alerts.receiveVolunteerTexts")) {
        log(
          "[smsWebhook] Inbound from an alert recipient (vol %d) — suppressed to prevent notification loop",
          volunteer.id,
        );
        return reply();
      }

      // ── 8. Freeform message path ───────────────────────────────────
      const firstName = volunteer.firstName || volunteer.first_name || "there";
      const lastName = volunteer.lastName || volunteer.last_name || "";

      log(
        "[smsWebhook] Freeform message from vol %d (%s %s): %s",
        volunteer.id,
        firstName,
        lastName,
        bodyRaw,
      );

      // Acknowledge the volunteer immediately so TwiML is returned fast
      reply(
        `Albany JW Parking: Thanks ${firstName}, your message was received. ` +
          `Our team will follow up with you.`,
      );

      // Fire-and-forget AI pipeline
      setImmediate(async () => {
        try {
          // a. AI analysis
          const analysis = await analyzeSms(
            bodyRaw,
            firstName,
            lastName,
            volunteer.id,
          );

          // c. Log to inbound_sms_messages
          const smsLogId = await logInboundSmsMessage({
            volunteerId: volunteer.id,
            fromPhone: fromRaw,
            rawBody: bodyRaw,
            aiSummary: analysis.summary,
            aiCategory: analysis.category,
            aiActionItems: analysis.actionItems.length
              ? JSON.stringify(analysis.actionItems)
              : null,
            aiRawResponse: analysis.rawResponse,
            aiError: analysis.error,
            promptTokens: analysis.promptTokens,
            completionTokens: analysis.completionTokens,
          });

          // d. Create action item (system-attributed)
          const systemActorId = await getSystemActorId();
          await createVolunteerAction({
            volunteerId: volunteer.id,
            sourceType: "inbound_sms",
            sourceId: smsLogId,
            createdBy: systemActorId,
          });

          // e. Persist AI-suggested blackouts as pending scheduling constraints.
          if (
            Array.isArray(analysis.suggestedBlackouts) &&
            analysis.suggestedBlackouts.length > 0
          ) {
            const year = await getActiveYear();
            for (const b of analysis.suggestedBlackouts) {
              try {
                const resolved = await resolveBlackoutHints(
                  b.dayHint,
                  b.timeHint,
                  b.type,
                  year,
                );
                await createAiBlackoutSuggestion({
                  volunteerId: volunteer.id,
                  sourceType: "inbound_sms",
                  sourceId: smsLogId,
                  blackoutType: b.type || "Custom",
                  description: b.description || "",
                  dayHint: b.dayHint || null,
                  timeHint: b.timeHint || null,
                  conventionDayId: resolved.conventionDayId,
                  startMins: resolved.startMins,
                  endMins: resolved.endMins,
                });
              } catch (sugErr) {
                log("[smsWebhook] createAiBlackoutSuggestion error:", sugErr);
              }
            }
          }

          // f. Notify overseers
          const overseers = await getOverseerContacts();

          const smsAlert =
            `Albany JW Parking: ${firstName} ${lastName} texted: ` +
            `"${bodyRaw}". ` +
            (analysis.summary ? `AI: ${analysis.summary} ` : "") +
            `Review at ${DASHBOARD_URL}.`;

          const emailSubject = `Inbound SMS from ${firstName} ${lastName}`;

          const actionLines = analysis.actionItems.length
            ? "\nSuggested actions:\n" +
              analysis.actionItems.map((a) => `  • ${a.description}`).join("\n")
            : "";

          const emailBody =
            `Albany JW Parking received an inbound SMS from a volunteer.\n\n` +
            `Volunteer: ${firstName} ${lastName}\n` +
            `Message: "${bodyRaw}"\n\n` +
            (analysis.summary ? `AI summary: ${analysis.summary}\n` : "") +
            (analysis.category ? `Category: ${analysis.category}\n` : "") +
            actionLines +
            `\nReview at https://${DASHBOARD_URL}`;

          for (const overseer of overseers) {
            // Don't notify an overseer about a message from their own phone.
            const overseerDigits = (overseer.phone || "").replace(/\D+/g, "").slice(-10);
            if (overseerDigits && overseerDigits === phoneDigits) {
              log("[smsWebhook] Skipping self-notify for overseer vol %d", overseer.id);
              continue;
            }

            if (overseer.smsCapable && overseer.phone) {
              await sendResetSms(
                overseer.phone,
                "",
                twilioAccountSid,
                twilioAuthToken,
                twilioMsgSid,
                { customBody: smsAlert },
              ).catch((err) => log("[smsWebhook] Overseer SMS error:", err));
            }
            if (overseer.email) {
              await sendResetEmail(overseer.email, "", {
                ...smtpConfig,
                subject: emailSubject,
                customBody: emailBody,
              }).catch((err) => log("[smsWebhook] Overseer email error:", err));
            }
          }

          log(
            "[smsWebhook] Freeform pipeline complete: vol %d smsLogId %d action created",
            volunteer.id,
            smsLogId,
          );
        } catch (err) {
          log(
            "[smsWebhook] Freeform post-reply error for vol %d:",
            volunteer.id,
            err,
          );
        }
      });
    } catch (err) {
      log("[smsWebhook] Unhandled error:", err);
      // Ensure Twilio always gets a response even on catastrophic failure
      if (!res.headersSent) {
        res.setHeader("Content-Type", "text/xml");
        res.send(EMPTY_TWIML);
      }
    }
  });

  /**
   * POST /webhook/sms/status
   * Twilio delivery status callback for a text sent with statusCallback:
   * MessageSid, MessageStatus (queued, sent, delivered, undelivered, failed,
   * ...), and ErrorCode when it failed. Updates the message_deliveries row;
   * on 21610 (opted out) also turns off the volunteer's sms_opted_in.
   *
   * Always answers 204: Twilio retries on errors, and a bad or unknown
   * callback is not worth a retry. Runs signed out, i.e. in system scope.
   */
  router.post("/status", publicRoute("Twilio delivery status callback (signature checked in handler)"), async (req, res) => {
    try {
      const twilioSig = String(req.headers["x-twilio-signature"] || "");
      const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https");
      const host = String(req.headers["x-forwarded-host"] || req.headers["host"] || "");
      const fullUrl = `${proto}://${host}${req.originalUrl}`;

      if (twilioAuthToken) {
        const valid = await validateTwilioSig(twilioAuthToken, twilioSig, fullUrl, req.body || {});
        if (!valid) {
          log("[smsWebhook] Status callback rejected: invalid Twilio signature url=%s", fullUrl);
          return res.status(204).end();
        }
      }

      const sid = String(req.body?.MessageSid || req.body?.SmsSid || "").trim();
      const status = String(req.body?.MessageStatus || req.body?.SmsStatus || "").trim().toLowerCase();
      const code = Number(req.body?.ErrorCode);
      const errorCode = Number.isFinite(code) && code > 0 ? code : null;
      const errorMessage = req.body?.ErrorMessage ? String(req.body.ErrorMessage) : null;
      if (!sid || !status) return res.status(204).end();

      const row = await updateMessageDeliveryStatus({ sid, status, errorCode, errorMessage });

      if (row?.volunteerId && errorCode === 21610) {
        await markVolunteerSmsOptedOut(row.volunteerId);
        log(`[smsWebhook] Volunteer ${row.volunteerId} marked opted out of texts (Twilio 21610).`);
      }
      return res.status(204).end();
    } catch (err) {
      log("[smsWebhook] Status callback error:", err);
      return res.status(204).end();
    }
  });

  return router;
}
