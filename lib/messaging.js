/**
 * @file messaging.js
 * @description Shared email and SMS delivery helpers.
 *
 * Extracted from upgradeRoutes.js so both the public upgrade flow
 * and the Oversight Tools can send reset/completion links without
 * duplicating transport logic.
 */

import nodemailer from "nodemailer";
import twilio from "twilio";

// ============================================================
// Logging
// ============================================================

/**
 * @param {...any} args
 */
function log(...args) {
  console.log(`[${new Date().toISOString()}] [lib/messaging]`, ...args);
}

/**
 * @param {...any} args
 */
function logError(...args) {
  console.error(`[${new Date().toISOString()}] [lib/messaging]`, ...args);
}

// ============================================================
// Phone normalization
// ============================================================

/**
 * Normalize a raw phone string to E.164 format.
 * - Already starts with '+' → returned as-is
 * - 10 digits → assumes US, prefixes +1
 * - 11–15 digits → prefixes +
 * - Otherwise → throws
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeToE164(raw) {
  if (!raw) throw new Error("Missing phone number");

  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) return trimmed;

  const digits = trimmed.replace(/\D+/g, "");
  if (!digits) throw new Error("Invalid phone number: no digits found");

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length > 10 && digits.length <= 15) return `+${digits}`;

  throw new Error(`Invalid phone number length (${digits.length})`);
}

// ============================================================
// Twilio SMS
// ============================================================

/** @type {import('twilio').Twilio | undefined} */
let smsClient;

/**
 * Reset the cached Twilio SMS client.
 * Called by the external service watchdog when a health check fails,
 * so the next SMS send triggers a fresh client initialization.
 *
 * @returns {void}
 */
export function resetSmsClient() {
  smsClient = undefined;
}
/**
 * Lazily initialize the Twilio client.
 *
 * @param {string} accountSid
 * @param {string} authToken
 * @returns {import('twilio').Twilio}
 */
function getTwilioClient(accountSid, authToken) {
  if (!smsClient) {
    if (!accountSid || !authToken) {
      throw new Error("Twilio credentials missing in messaging.js");
    }
    smsClient = twilio(accountSid, authToken);
  }
  return smsClient;
}

/**
 * Send a reset/completion link via SMS.
 *
 * @param {string} toPhoneRaw
 * @param {string} url
 * @param {string} accountSid
 * @param {string} authToken
 * @param {string} messagingServiceSid
 * @param {{firstName?:string}} [opts]
 * @returns {Promise<boolean>}
 */
export async function sendResetSms(toPhoneRaw, url, accountSid, authToken, messagingServiceSid, opts = {}) {
    try {
        if (!messagingServiceSid) throw new Error('Missing messagingServiceSid');

        const to        = normalizeToE164(toPhoneRaw);
        const client    = getTwilioClient(accountSid, authToken);
        const firstName = opts.firstName || 'there';

        const body =
        opts.customBody ||
        `Albany JW Parking: Hi ${firstName}, your registration is incomplete. Tap to finish:\n${url}`;

        const msg = await client.messages.create({
        messagingServiceSid,
        body,
        to,
        });

        log('SMS sent:', msg.sid, msg.status);
        return true;
    } catch (err) {
        logError('sendResetSms error:', err);
        return false;
    }
}

// ============================================================
// Nodemailer email (IONOS SMTP)
// ============================================================


/**
 * @param {{host:string, port:number, user:string, pass:string}} smtpConfig
 * @returns {import('nodemailer').Transporter}
 */
function createMailTransporter(smtpConfig) {
        log(
          "SMTP config check — user:",
          smtpConfig.user,
          "| pass length:",
          smtpConfig.pass?.length ?? 0,
          "| pass first 3 chars:",
          smtpConfig.pass?.slice(0, 3) ?? "EMPTY",
          "| host:",
          smtpConfig.host,
          "| port:",
          smtpConfig.port,
        );
    
    return nodemailer.createTransport({
        host:   smtpConfig.host   || 'smtp.ionos.com',
        port:   smtpConfig.port   || 587,
        secure: false,
        auth:   { user: smtpConfig.user, pass: smtpConfig.pass },
        tls:    { rejectUnauthorized: false },
    });
}

/**
 * Send a reset/completion link via email.
 *
 * @param {string} toEmail
 * @param {string} url
 * @param {{
 *   host: string,
 *   port: number,
 *   user: string,
 *   pass: string,
 *   subject?: string,
 *   firstName?: string
 * }} opts
 * @returns {Promise<boolean>}
 */
export async function sendResetEmail(toEmail, url, opts = {}) {
    try {
        if (!opts.user || !opts.pass) {
            throw new Error('SMTP credentials missing — pass user and pass in opts');
        }

        const transporter = createMailTransporter(opts);
        const firstName   = opts.firstName || 'there';
        const subject     = opts.subject   || 'Action needed — complete your Albany JW Parking registration';

        // ── Custom body (Messaging Center invites) ───────────────────────
        // When opts.customBody is provided the caller has already resolved
        // merge fields and built the full message text. Use it directly
        // instead of the standard reset/resume template copy.
        if (opts.customBody) {
            const plainText = opts.customBody;
            const htmlBody  = `<p>${opts.customBody.replace(/\n/g, '<br>')}</p>`;

            await transporter.sendMail({
                from:    opts.user,
                to:      toEmail,
                subject,
                text:    plainText,
                html:    htmlBody,
            });

            log('Email sent (custom body) to:', toEmail);
            return true;
        }

        // ── Standard reset / resume template ────────────────────────────
        const bodyLine = opts.isResume
        ? `An admin has sent you this link to complete your volunteer registration for the Albany JW Regional Convention parking team.`
        : `An admin has sent you this link to reset your password for the Albany JW Regional Convention parking app.`;

        const ctaLine = opts.isResume
        ? `Tap or click the link below to set your password and finish signing up:`
        : `Tap or click the link below to reset your password:`;

        const plainText = [
        `Hi ${firstName},`,
        ``,
        bodyLine,
        ``,
        ctaLine,
        ``,
        url,
        ``,
        `This link is unique to you — please don't share it.`,
        ``,
        `If you weren't expecting this or have questions, reply to this email or contact your parking overseer.`,
        ``,
        `Albany JW Parking Team`,
        ].join("\n");

        const htmlBody = `
            <p>Hi ${firstName},</p>
            <p>${bodyLine}</p>
            <p>${ctaLine}</p>
            <p><a href="${url}" style="font-size:16px;font-weight:bold">${url}</a></p>
            <p style="color:#888;font-size:13px">This link is unique to you — please don't share it.</p>
            <p style="color:#888;font-size:13px">If you weren't expecting this or have questions, reply to this email or contact your parking overseer.</p>
            <p>Albany JW Parking Team</p>
        `;

        await transporter.sendMail({
            from:    opts.user,
            to:      toEmail,
            subject,
            text:    plainText,
            html:    htmlBody,
        });

        log('Email sent to:', toEmail);
        return true;
    } catch (err) {
        logError('sendResetEmail error:', err);
        return false;
    }
}
// ============================================================
// Base URL helper
// ============================================================

/**
 * Derive the base URL from an Express request, respecting Azure's
 * x-forwarded-proto header for TLS termination.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
export function getBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  return `${proto}://${req.get("host")}`;
}
