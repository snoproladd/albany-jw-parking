/**
 * @file routes/smsWebhookRoute.js
 * @description Handles incoming Twilio SMS webhooks.
 *
 * Routing decision tree (in order):
 *  1. Validate the Twilio signature — reject spoofed requests.
 *  2. Route opt-out keywords (STOP/QUIT/etc.) to handleSmsOptOutWebhook.
 *  3. Unknown phone number — reply asking for name, alert overseers.
 *  4. Known volunteer + valid shift code + T-15 sent — existing check-in path.
 *  5. Known volunteer + OVERSEER role or above — suppress freeform pipeline
 *       (prevents notification loop when oversight staff reply to alert SMS).
 *  6. Known volunteer + everything else (freeform) — AI analysis pipeline:
 *       a. Acknowledge the volunteer via TwiML reply.
 *       b. Async (post-response): analyze, append note, log to DB,
 *          create action item, notify overseers via SMS and email.
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
import {
  findVolunteerByPhoneOrEmail,
  findShiftBySmsCode,
  hasT15AlertBeenSent,
  getSchedulerDayForVolunteerShift,
  upsertAttendance,
  handleSmsOptOutWebhook,
  getOverseerContacts,
  getSystemActorId,
  logInboundSmsMessage,
  createVolunteerAction,
  resolveBlackoutHints,
  createAiBlackoutSuggestion,
} from "../lib/dbSync.js";
import { analyzeSms } from "../lib/smsInboundAnalyzer.js";
import { sendResetSms, sendResetEmail } from "../lib/messaging.js";
import { ROLE_HIERARCHY } from "../src/config/roles.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_TWIML = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

/** Keywords Twilio intercepts automatically — may still arrive as webhook. */
const OPT_OUT_KEYWORDS = new Set([
  "STOP",
  "QUIT",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
]);

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
 * Build a TwiML response string, optionally containing a reply message.
 *
 * @param {string|null} [msg]  If provided, wraps in a <Message> element.
 * @returns {string}
 */
function buildTwiml(msg) {
  if (!msg) return EMPTY_TWIML;
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(msg)}</Message></Response>`;
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

  // Twilio posts URL-encoded form bodies
  router.use(express.urlencoded({ extended: false }));

  /**
   * POST /webhook/sms/incoming
   * Called by Twilio when any reply arrives for an outbound number.
   *
   * Always returns TwiML regardless of outcome — Twilio retries on non-2xx
   * or missing responses, which would cause duplicate processing.
   */
  router.post("/incoming", async (req, res) => {
    /**
     * Send a TwiML response and end the HTTP transaction.
     * Accepts an optional reply body to include in a <Message> element.
     *
     * @param {string|null} [msg]
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

      // ── 4. Route opt-out keywords ──────────────────────────────────
      if (OPT_OUT_KEYWORDS.has(code)) {
        try {
          await handleSmsOptOutWebhook(phoneDigits);
          log("[smsWebhook] Opt-out processed for %s", phoneDigits);
        } catch (err) {
          log("[smsWebhook] Opt-out error:", err);
        }
        return reply();
      }

      // ── 5. Look up volunteer by phone ──────────────────────────────
      const volunteer = await findVolunteerByPhoneOrEmail(phoneDigits, null);

      if (!volunteer) {
        // ── Unknown caller path ────────────────────────────────────
        log("[smsWebhook] Unknown phone %s — alerting overseers", phoneDigits);

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

      // ── 6. Try shift code lookup (check-in path) ───────────────────
      // SMS codes are max 8 characters (NVarChar(8) in DB). Any longer
      // normalized string cannot match a shift code — skip the DB call.
      if (code && code.length <= 8) {
        const year = new Date().getFullYear();
        const shift = await findShiftBySmsCode(code, year);

        if (shift) {
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

      // ── 7. Overseer guard — suppress freeform pipeline for oversight roles ──
      // Prevents a notification loop: when an ADMIN replies to an alert SMS
      // (which arrives over the same Twilio Messaging Service channel), their
      // reply would otherwise trigger the full freeform pipeline and notify
      // every other ADMIN about what an overseer just said.
      // The shift-code check-in path (step 6) runs before this guard and is
      // unaffected — oversight staff can still check in via SMS code normally.
      const OVERSEER_ROLE_INDEX = ROLE_HIERARCHY.indexOf("OVERSEER");
      const volunteerRoleIndex  = ROLE_HIERARCHY.indexOf(volunteer.role || "");

      if (OVERSEER_ROLE_INDEX !== -1 && volunteerRoleIndex >= OVERSEER_ROLE_INDEX) {
        log(
          "[smsWebhook] Inbound from oversight role %s (vol %d) — suppressed to prevent notification loop",
          volunteer.role,
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
            const year = new Date().getFullYear();
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

  return router;
}
