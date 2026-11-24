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
import { demoStorage } from "./sql.js";
import { getBrand } from "./branding.js";

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
    if (demoStorage.getStore()?.isDemo) {
        log('[DEMO] sendResetSms suppressed.');
        return false;
    }
    try {
        if (!messagingServiceSid) throw new Error('Missing messagingServiceSid');

        const to        = normalizeToE164(toPhoneRaw);
        const client    = getTwilioClient(accountSid, authToken);
        const firstName = opts.firstName || 'there';

        const body =
        opts.customBody ||
        `${getBrand().siteName}: Hi ${firstName}, your registration is incomplete. Tap to finish:\n${url}`;

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

/**
 * Send an SMS and report what Twilio said, for callers that track delivery
 * (dbo.message_deliveries). With a statusCallback URL, Twilio later posts
 * each status change for the message there (routes/smsWebhookRoute.js
 * POST /webhook/sms/status).
 *
 * Never throws. A refusal at send time (for example error 21610, the number
 * replied STOP, when not sending through a Messaging Service) comes back as
 * ok false with Twilio's error code.
 *
 * @param {{
 *   to: string,                       raw or E.164 phone number
 *   body: string,
 *   accountSid: string,
 *   authToken: string,
 *   messagingServiceSid: string,
 *   statusCallback?: string|null,     public https URL, or null for no tracking
 * }} opts
 * @returns {Promise<{ ok: boolean, sid: string|null, status: string|null,
 *                     errorCode: number|null, errorMessage: string|null }>}
 */
export async function sendTrackedSms({ to, body, accountSid, authToken, messagingServiceSid, statusCallback = null }) {
    if (demoStorage.getStore()?.isDemo) {
        log('[DEMO] sendTrackedSms suppressed.');
        return { ok: false, sid: null, status: null, errorCode: null, errorMessage: 'Demo: texts are not sent.' };
    }
    try {
        if (!messagingServiceSid) throw new Error('Missing messagingServiceSid');
        const client = getTwilioClient(accountSid, authToken);
        const msg = await client.messages.create({
            messagingServiceSid,
            body,
            to: normalizeToE164(to),
            ...(statusCallback ? { statusCallback } : {}),
        });
        log('SMS sent:', msg.sid, msg.status);
        return { ok: true, sid: msg.sid, status: msg.status || null, errorCode: null, errorMessage: null };
    } catch (err) {
        logError('sendTrackedSms error:', err);
        const code = Number(err?.code);
        return {
            ok: false,
            sid: null,
            status: null,
            errorCode: Number.isFinite(code) ? code : null,
            errorMessage: err?.message ? String(err.message).slice(0, 400) : 'Send failed',
        };
    }
}

/**
 * Plain-language reason for a Twilio SMS error code, for people reading a
 * delivery report. Unknown codes fall back to "error <code>".
 *
 * @param {number|null|undefined} code
 * @returns {string}
 */
export function describeSmsError(code) {
    /** @type {Record<number, string>} */
    const reasons = {
        21211: 'not a valid phone number',
        21408: 'texting that region is not enabled',
        21610: 'opted out (replied STOP)',
        21614: 'not a mobile number',
        30003: 'phone unreachable (off or out of service)',
        30004: 'blocked by the recipient',
        30005: 'unknown or inactive number',
        30006: 'landline or carrier can\'t receive texts',
        30007: 'filtered by the carrier as spam',
        30008: 'unknown carrier error',
        30034: 'sender number not registered for texting',
    };
    if (code == null) return 'not delivered';
    return reasons[code] || `error ${code}`;
}

// ============================================================
// Nodemailer email (IONOS SMTP)
// ============================================================


/**
 * Pooled SMTP transporter, reused across sends so a Campaign Center burst
 * opens the connection and authenticates once instead of once per message.
 * Rebuilt when the SMTP settings change or after resetMailTransporter().
 *
 * @type {import('nodemailer').Transporter | undefined}
 */
let mailTransporter;

/**
 * The SMTP settings the cached transporter was built with.
 *
 * @type {string | undefined}
 */
let mailTransporterKey;

/**
 * Close and discard the cached SMTP transporter.
 * Called by the external service watchdog when an SMTP check fails,
 * so the next email send opens a fresh pool.
 *
 * @returns {void}
 */
export function resetMailTransporter() {
    mailTransporter?.close();
    mailTransporter = undefined;
    mailTransporterKey = undefined;
}

/**
 * Return the cached pooled transporter, creating it on first use or when
 * the SMTP settings differ from the ones it was built with.
 *
 * @param {{host?:string, port?:number, user:string, pass:string}} smtpConfig
 * @returns {import('nodemailer').Transporter}
 */
function getMailTransporter(smtpConfig) {
    const host = smtpConfig.host || "smtp.ionos.com";
    const port = smtpConfig.port || 587;
    const key  = [host, port, smtpConfig.user, smtpConfig.pass].join("\u0000");

    if (mailTransporter && mailTransporterKey === key) return mailTransporter;

    resetMailTransporter();
    log("Creating pooled SMTP transporter — host:", host, "| port:", port, "| user:", smtpConfig.user);

    mailTransporter = nodemailer.createTransport({
        pool:           true,
        maxConnections: 3,
        maxMessages:    100,
        host,
        port,
        secure:         false,
        auth:           { user: smtpConfig.user, pass: smtpConfig.pass },
        tls:            { rejectUnauthorized: false },
    });
    mailTransporterKey = key;

    return mailTransporter;
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
    if (demoStorage.getStore()?.isDemo) {
        log('[DEMO] sendResetEmail suppressed.');
        return false;
    }
    try {
        if (!opts.user || !opts.pass) {
            throw new Error('SMTP credentials missing — pass user and pass in opts');
        }

        const transporter = getMailTransporter(opts);
        const firstName   = opts.firstName || 'there';
        const subject     = opts.subject   || `Action needed — complete your ${getBrand().siteName} registration`;

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
        ? `An admin has sent you this link to complete your volunteer registration for the ${getBrand().conventionShortName} parking team.`
        : `An admin has sent you this link to reset your password for the ${getBrand().conventionShortName} parking app.`;

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
        getBrand().teamSignature,
        ].join("\n");

        const htmlBody = `
            <p>Hi ${firstName},</p>
            <p>${bodyLine}</p>
            <p>${ctaLine}</p>
            <p><a href="${url}" style="font-size:16px;font-weight:bold">${url}</a></p>
            <p style="color:#888;font-size:13px">This link is unique to you — please don't share it.</p>
            <p style="color:#888;font-size:13px">If you weren't expecting this or have questions, reply to this email or contact your parking overseer.</p>
            <p>${getBrand().teamSignature}</p>
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
