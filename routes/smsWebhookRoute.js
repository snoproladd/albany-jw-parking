/**
 * @file smsWebhookRoute.js
 * @description Handles incoming Twilio SMS webhooks for T-15 reply attendance.
 *
 * Flow:
 *  1. Validate the Twilio signature to reject spoofed requests.
 *  2. Parse From (phone) and Body (reply code) from the POST body.
 *  3. Route opt-out keywords (STOP/QUIT) to handleSmsOptOutWebhook.
 *  4. Look up the volunteer by phone and the shift by SMS code.
 *  5. Gate with hasT15AlertBeenSent — reply only counts if T-15 was sent.
 *  6. Resolve the convention_day_id and upsert an attendance row.
 *  7. Always return empty TwiML so Twilio does not retry.
 *
 * Security:
 *  - No session auth (POST from Twilio, not a browser).
 *  - No CSRF token (not a browser form).
 *  - Twilio signature validation takes the place of both.
 *  - Must be mounted in index.js BEFORE csrfProtection middleware.
 */

import express from "express";
import {
  findVolunteerByPhoneOrEmail,
  findShiftBySmsCode,
  hasT15AlertBeenSent,
  getSchedulerDayForVolunteerShift,
  upsertAttendance,
  handleSmsOptOutWebhook,
} from "../lib/dbSync.js";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validate a Twilio webhook request signature.
 *
 * @param {string} authToken
 * @param {string} signature  Value of X-Twilio-Signature header
 * @param {string} url        Full canonical URL Twilio posted to
 * @param {Record<string, string>} params  URL-decoded POST body
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

// ─── Router factory ───────────────────────────────────────────────────────────

/**
 * Build the SMS webhook Express router.
 *
 * @param {{
 *   twilioAuthToken: string,
 *   logError?: (...args: any[]) => void,
 * }} deps
 * @returns {import("express").Router}
 */
export function smsWebhookRouter({ twilioAuthToken, logError }) {
  const router = express.Router();

  // Twilio posts URL-encoded form bodies
  router.use(express.urlencoded({ extended: false }));

  /**
   * POST /webhook/sms/incoming
   * Called by Twilio when any reply arrives for an outbound number.
   */
  router.post("/incoming", async (req, res) => {
    // Always respond with empty TwiML regardless of outcome — Twilio will
    // retry indefinitely if we return a non-2xx status or no response.
    const twimlReply = () => {
      res.setHeader("Content-Type", "text/xml");
      return res.send(EMPTY_TWIML);
    };

    try {
      // ── 1. Validate Twilio signature ───────────────────────────────────────
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
          (logError || console.warn)(
            "[smsWebhook] Rejected: invalid Twilio signature url=%s",
            fullUrl,
          );
          return twimlReply();
        }
      }

      const fromRaw = String(req.body?.From || "").trim();
      const bodyRaw = String(req.body?.Body || "").trim();

      if (!fromRaw) {
        (logError || console.warn)("[smsWebhook] Missing From field");
        return twimlReply();
      }

      // ── 2. Normalize phone to last 10 digits ───────────────────────────────
      const phoneDigits = fromRaw.replace(/\D+/g, "").slice(-10);
      if (phoneDigits.length < 10) {
        (logError || console.warn)(
          "[smsWebhook] Invalid From phone: %s",
          fromRaw,
        );
        return twimlReply();
      }

      // ── 3. Normalize body — uppercase alphanumeric only ────────────────────
      const code = bodyRaw.replace(/[^A-Z0-9]/gi, "").toUpperCase();

      // ── 4. Route opt-out keywords ──────────────────────────────────────────
      if (OPT_OUT_KEYWORDS.has(code)) {
        try {
          await handleSmsOptOutWebhook(phoneDigits);
          (logError || console.info)(
            "[smsWebhook] Opt-out processed for %s",
            phoneDigits,
          );
        } catch (err) {
          (logError || console.error)("[smsWebhook] Opt-out error:", err);
        }
        return twimlReply();
      }

      if (!code) {
        (logError || console.warn)(
          "[smsWebhook] Empty body after normalization from %s",
          phoneDigits,
        );
        return twimlReply();
      }

      // ── 5. Look up volunteer by phone ──────────────────────────────────────
      const volunteer = await findVolunteerByPhoneOrEmail(phoneDigits, null);
      if (!volunteer) {
        (logError || console.warn)(
          "[smsWebhook] No volunteer for phone %s",
          phoneDigits,
        );
        return twimlReply();
      }

      // ── 6. Look up shift by SMS code ───────────────────────────────────────
      const year = new Date().getFullYear();
      const shift = await findShiftBySmsCode(code, year);
      if (!shift) {
        (logError || console.warn)(
          "[smsWebhook] No shift for code %s (vol %d)",
          code,
          volunteer.id,
        );
        return twimlReply();
      }

      // ── 7. Gate: T-15 must have been sent to this volunteer for this shift ──
      const t15Sent = await hasT15AlertBeenSent(volunteer.id, shift.shift_id);
      if (!t15Sent) {
        (logError || console.warn)(
          "[smsWebhook] T-15 not sent to vol %d for shift %d — ignoring",
          volunteer.id,
          shift.shift_id,
        );
        return twimlReply();
      }

      // ── 8. Resolve convention_day_id ───────────────────────────────────────
      const dayId = await getSchedulerDayForVolunteerShift(
        volunteer.id,
        shift.shift_id,
      );
      if (!dayId) {
        (logError || console.error)(
          "[smsWebhook] No convention_day_id for vol %d shift %d",
          volunteer.id,
          shift.shift_id,
        );
        return twimlReply();
      }

      // ── 9. Record attendance ───────────────────────────────────────────────
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

      (logError || console.info)(
        "[smsWebhook] Attendance recorded: vol %d shift %d day %d code %s",
        volunteer.id,
        shift.shift_id,
        dayId,
        code,
      );
    } catch (err) {
      (logError || console.error)("[smsWebhook] Unhandled error:", err);
    }

    return twimlReply();
  });

  return router;
}
