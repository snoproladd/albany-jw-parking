/**
 * @file messaging.js
 * @description Shared email and SMS delivery helpers.
 *
 * Extracted from upgradeRoutes.js so both the public upgrade flow
 * and the admin tools can send reset/completion links without
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

        const msg = await client.messages.create({
            messagingServiceSid,
            body: `Albany JW Parking: Hi ${firstName}, your registration is incomplete. Tap to finish:\n${url}`,
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

/** @type {import('nodemailer').Transporter | undefined} */
let mailTransporter;

/**
 * Lazily initialize the Nodemailer transporter using IONOS SMTP env vars.
 *
 * @returns {import('nodemailer').Transporter}
 */
function getMailTransporter() {
  if (!mailTransporter) {
    const smtpUser = process.env.IONOS_SMTP_USER_INFO;
    const smtpPass = process.env.IONOS_SMTP_PASS;

    if (!smtpUser || !smtpPass) {
      throw new Error(
        "SMTP credentials not configured (IONOS_SMTP_USER_INFO / IONOS_SMTP_PASS)",
      );
    }

    mailTransporter = nodemailer.createTransport({
      host: process.env.IONOS_SMTP_HOST || "smtp.ionos.com",
      port: Number(process.env.IONOS_SMTP_PORT || 587),
      secure: false,
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: false },
    });
  }
  return mailTransporter;
}

export async function sendResetEmail(toEmail, url, opts = {}) {
  try {
    const transporter = getMailTransporter();
    const fromAddress = process.env.IONOS_SMTP_USER_INFO;
    const firstName = opts.firstName || "there";
    const subject =
      opts.subject ||
      "Action needed — complete your Albany JW Parking registration";

    const plainText = [
      `Hi ${firstName},`,
      ``,
      `An admin has sent you this link to complete your volunteer registration for the Albany JW Regional Convention parking team.`,
      ``,
      `Tap or click the link below to set your password and finish signing up:`,
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
            <p>An admin has sent you this link to complete your volunteer registration for the Albany JW Regional Convention parking team.</p>
            <p>Tap or click the link below to set your password and finish signing up:</p>
            <p><a href="${url}" style="font-size:16px;font-weight:bold">${url}</a></p>
            <p style="color:#888;font-size:13px">This link is unique to you — please don't share it.</p>
            <p style="color:#888;font-size:13px">If you weren't expecting this or have questions, reply to this email or contact your parking overseer.</p>
            <p>Albany JW Parking Team</p>
        `;

    await transporter.sendMail({
      from: fromAddress,
      to: toEmail,
      subject,
      text: plainText,
      html: htmlBody,
    });

    log("Email sent to:", toEmail);
    return true;
  } catch (err) {
    logError("sendResetEmail error:", err);
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
