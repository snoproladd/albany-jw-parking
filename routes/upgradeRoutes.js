// routes/upgradeRoutes.js
import crypto from "crypto";
import nodemailer from "nodemailer";
import twilio from "twilio";
import { hashPassword } from "../lib/passwordVer.js";

const RESET_RESEND_COOLDOWN_MS = 60 * 1000 * 2; // 2 minutes

/**
 * Upgrade routes: convert non-registered (or existing) records into
 * registered accounts by sending a password reset link via email or SMS.
 *
 * Main flows:
 * - GET  /upgrade                → enter phone/email
 * - POST /upgrade/find           → locate account by phone/email
 * - GET  /upgrade/name           → confirm name
 * - POST /upgrade/name
 * - GET  /upgrade/send           → choose email vs SMS
 * - POST /upgrade/send           → generate reset hash + send link
 * - GET  /upgrade/sent           → confirmation
 * - GET  /reset-password/:hash   → show reset form
 * - POST /reset-password/:hash   → set new password + clear pending flag
 *
 * @param {object} deps
 * @param {import("express")} deps.express
 * @param {import("csurf").RequestHandler} deps.csrfProtection
 * @param {typeof import("../lib/dbSync.js")} deps.db
 * @param {typeof import("../lib/dbSync.js").updateUserPassword} deps.updateUserPassword
 * @param {string} deps.twilioAccountSid
 * @param {string} deps.twilioAuthToken
 * @param {string} deps.twilioMsgSid
 */

//
// ---------- Phone normalization helper ----------
//

/**
 * Normalize a phone number to E.164 format (basic version).
 * - If it already starts with '+', assume it's valid E.164 and return as-is
 * - If it has 10 digits, assume US and prefix +1
 * - If it has 11..15 digits, assume it already includes country code and add '+'
 * - Otherwise, throw an error
 */
function normalizeToE164(raw) {
  if (!raw) {
    throw new Error("Missing phone number for SMS");
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) return trimmed;

  const digits = trimmed.replace(/\D+/g, "");
  if (!digits) {
    throw new Error("Invalid phone number: no digits found");
  }

  if (digits.length === 10) {
    // Assume US
    return `+1${digits}`;
  }

  if (digits.length > 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  throw new Error(`Invalid phone number length (${digits.length}) for SMS`);
}

//
// ---------- Twilio Messaging Service client ----------
//

let smsClient;

/**
 * Lazily create Twilio client for SMS sending.
 * Uses credentials passed from index.js so it works with Azure Key Vault.
 */
function getTwilioClient(twilioAccountSid, twilioAuthToken) {
  if (!smsClient) {
    if (!twilioAccountSid || !twilioAuthToken) {
      throw new Error(
        "twilioAccountSid/twilioAuthToken missing in upgradeRoutes config.",
      );
    }
    smsClient = twilio(twilioAccountSid, twilioAuthToken);
  }
  return smsClient;
}

/**
 * Send reset link via SMS using Twilio Messaging Service SID.
 * @param {string} toPhoneRaw
 * @param {string} url
 * @param {string} twilioAccountSid
 * @param {string} twilioAuthToken
 * @param {string} twilioMsgSid
 * @returns {Promise<boolean>}
 */
async function sendResetSms(
  toPhoneRaw,
  url,
  twilioAccountSid,
  twilioAuthToken,
  twilioMsgSid,
) {
  try {
    console.log("[DEBUG] sendResetSms called");
    console.log("[DEBUG] toPhoneRaw =", toPhoneRaw);
    console.log("[DEBUG] url =", url);
    console.log("[DEBUG] twilioMsgSid =", twilioMsgSid);

    if (!twilioMsgSid) throw new Error("Missing twilioMsgSid");

    const to = normalizeToE164(toPhoneRaw);
    console.log("[DEBUG] Normalized to =", to);

    const client = getTwilioClient(twilioAccountSid, twilioAuthToken);
    console.log("[DEBUG] Twilio client created");

    const msg = await client.messages.create({
      messagingServiceSid: twilioMsgSid,
      body: "RESET LINK: " + url,
      to,
    });

    console.log("[DEBUG] Twilio created message:", msg.sid, msg.status);
    return true;
  } catch (err) {
    console.error("[DEBUG] sendResetSms ERROR:", err);
    return false;
  }
}

//
// ---------- Nodemailer (IONOS) client ----------
//

let mailTransporter;

/**
 * Lazily create Nodemailer transporter for IONOS SMTP.
 * Uses IONOS_SMTP_USER_INFO as the login + from address.
 */
function getMailTransporter() {
  if (!mailTransporter) {
    const smtpUser = process.env.IONOS_SMTP_USER_INFO;
    const smtpPass = process.env.IONOS_SMTP_PASS;

    if (!smtpUser || !smtpPass) {
      console.error(
        "[EMAIL CONFIG] Missing IONOS_SMTP_USER_INFO or IONOS_SMTP_PASS",
      );
      console.error("  IONOS_SMTP_USER_INFO =", smtpUser);
      console.error("  IONOS_SMTP_PASS is", smtpPass ? "SET" : "MISSING");
      throw new Error("SMTP credentials not configured");
    }

    mailTransporter = nodemailer.createTransport({
      host: process.env.IONOS_SMTP_HOST || "smtp.ionos.com",
      port: Number(process.env.IONOS_SMTP_PORT || 587),
      secure: false, // STARTTLS on 587
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      tls: {
        // DEV ONLY – accept self-signed / corporate proxy certs.
        // Remove this in production if you can rely on a trusted chain.
        rejectUnauthorized: false,
      },
    });
  }
  return mailTransporter;
}

/**
 * Send reset link via email using IONOS SMTP.
 * @param {string} toEmail
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function sendResetEmail(toEmail, url) {
  try {
    console.log("[DEBUG] sendResetEmail called");
    console.log("[DEBUG] toEmail =", toEmail);
    console.log("[DEBUG] url =", url);

    const transporter = getMailTransporter();
    const fromAddress = process.env.IONOS_SMTP_USER_INFO;

    const mailOptions = {
      from: fromAddress,
      to: toEmail,
      subject: "TEST from Albany JW Parking App",
      text: `This is a test email sent at ${new Date().toISOString()}.
Reset link (local dev only): ${url}`,
    };

    const info = await transporter.sendMail(mailOptions);

    console.log("[DEBUG] Email sent successfully:");
    console.log("  MessageId:", info.messageId);
    console.log("  Response:", info.response);

    return true;
  } catch (err) {
    console.error("[DEBUG] sendResetEmail ERROR:", err);
    return false;
  }
}

export default function upgradeRoutes({
  express,
  csrfProtection,
  db,
  updateUserPassword,
  twilioAccountSid,
  twilioAuthToken,
  twilioMsgSid,
}) {
  const router = express.Router();

  // --- DB helpers from dbSync (no exec/sql here) ---
  const {
    findVolunteerByPhoneOrEmail,
    findVolunteerByIdNonArchived,
    findVolunteerByResetHash,
    setPendingReset,
    clearPendingReset,
  } = db;

  //
  // ─────────────────────────────────────────────────────────────
  // Helper functions (masking, baseUrl)
  // ─────────────────────────────────────────────────────────────
  //

  function maskEmail(email) {
    if (!email) return "";
    const [local, domain] = email.split("@");
    if (!domain) return email;

    const domainParts = domain.split(".");
    const tld = domainParts.pop() || "";
    const domainHead = domainParts.join(".") || "";

    const localMasked =
      local.length <= 2 ? local[0] + "••" : local[0] + "••••" + local.slice(-1);
    const domainMasked =
      domainHead.length <= 2
        ? domainHead[0] + "••"
        : domainHead[0] + "••••" + domainHead.slice(-1);

    return `${localMasked}@${domainMasked}.${tld}`;
  }

  function maskPhone(phone) {
    if (!phone) return "";
    const digits = phone.replace(/\D+/g, "");
    if (digits.length < 4) return "****";

    const last4 = digits.slice(-4);
    return `(***) ***-${last4}`;
  }

  function getBaseUrl(req) {
    const proto = req.headers["x-forwarded-proto"] || req.protocol;
    return `${proto}://${req.get("host")}`;
  }

  //
  // ─────────────────────────────────────────────────────────────
  // Routes
  // ─────────────────────────────────────────────────────────────
  //

  // GET /upgrade  → start: enter phone/email
  router.get("/upgrade", csrfProtection, (req, res) => {
    res.render("upgrade/upgradeStart", {
      csrfToken: req.csrfToken(),
    });
  });

  // POST /upgrade/find → lookup by phone/email
  router.post("/upgrade/find", csrfProtection, async (req, res) => {
    try {
      const { phone, email } = req.body || {};
      if (!phone && !email) {
        return res.status(400).json({
          success: false,
          fieldErrors: {
            form: "Please enter an email or a phone number.",
          },
        });
      }

      const volunteer = await findVolunteerByPhoneOrEmail(phone, email);
      if (!volunteer) {
        return res.status(404).json({
          success: false,
          fieldErrors: {
            form: "We could not find any account with that email or phone.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        redirectUrl: `/upgrade/name?id=${volunteer.id}`,
      });
    } catch (err) {
      console.error("[POST /upgrade/find] error:", err);
      return res.status(500).json({
        success: false,
        fieldErrors: {
          form: "An unexpected error occurred. Please try again.",
        },
      });
    }
  });

  // GET /upgrade/name → show name confirmation form
  router.get("/upgrade/name", csrfProtection, async (req, res) => {
    try {
      const id = req.query.id;
      if (!id) return res.redirect("/upgrade");

      const volunteer = await findVolunteerByIdNonArchived(id);
      if (!volunteer) {
        return res.status(404).render("404", { url: req.originalUrl });
      }

      res.render("upgrade/upgradeName", {
        csrfToken: req.csrfToken(),
        volunteer,
      });
    } catch (err) {
      console.error("[GET /upgrade/name] error:", err);
      return res.status(500).send("Server error.");
    }
  });

  // POST /upgrade/name → verify name
  router.post("/upgrade/name", csrfProtection, async (req, res) => {
    try {
      const { id, firstName, lastName, suffix } = req.body || {};
      if (!id || !firstName || !lastName) {
        return res.status(400).json({
          success: false,
          fieldErrors: {
            form: "First and last name are required.",
          },
        });
      }

      const volunteer = await findVolunteerByIdNonArchived(id);
      if (!volunteer) {
        return res.status(404).json({
          success: false,
          fieldErrors: {
            form: "No matching account was found.",
          },
        });
      }

      const matchesFirst =
        (volunteer.firstName || "").trim().toLowerCase() ===
        firstName.trim().toLowerCase();
      const matchesLast =
        (volunteer.lastName || "").trim().toLowerCase() ===
        lastName.trim().toLowerCase();
      const matchesSuffix =
        ((volunteer.suffix || "").trim().toLowerCase() || "") ===
        ((suffix || "").trim().toLowerCase() || "");

      if (!matchesFirst || !matchesLast || !matchesSuffix) {
        return res.status(400).json({
          success: false,
          fieldErrors: {
            form: "The name entered does not match our records.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        redirectUrl: `/upgrade/send?id=${volunteer.id}`,
      });
    } catch (err) {
      console.error("[POST /upgrade/name] error:", err);
      return res.status(500).json({
        success: false,
        fieldErrors: {
          form: "Server error while verifying your name.",
        },
      });
    }
  });

  // GET /upgrade/send → choose email vs SMS
  router.get("/upgrade/send", csrfProtection, async (req, res) => {
    try {
      const id = req.query.id;
      if (!id) return res.redirect("/upgrade");

      const volunteer = await findVolunteerByIdNonArchived(id);
      if (!volunteer) {
        return res.status(404).render("404", { url: req.originalUrl });
      }

      const maskedEmail = maskEmail(volunteer.email);
      const maskedPhone = maskPhone(volunteer.phone);

      res.render("upgrade/upgradeSend", {
        csrfToken: req.csrfToken(),
        volunteer,
        maskedEmail,
        maskedPhone,
      });
    } catch (err) {
      console.error("[GET /upgrade/send] error:", err);
      return res.status(500).send("Server error.");
    }
  });

  // GET /upgrade/sent → confirmation that reset link was sent
  router.get("/upgrade/sent", csrfProtection, async (req, res) => {
    try {
      const { id, method } = req.query;
      if (!id || !method) {
        return res.redirect("/upgrade");
      }

      const volunteer = await findVolunteerByIdNonArchived(id);
      if (!volunteer) {
        return res.status(404).render("404", { url: req.originalUrl });
      }

      const maskedEmail = maskEmail(volunteer.email);
      const maskedPhone = maskPhone(volunteer.phone);

      res.render("upgrade/upgradeSent", {
        csrfToken: req.csrfToken(),
        volunteer,
        method,
        maskedEmail,
        maskedPhone,
        message: "Reset link SENT SUCCESSFULLY.",
        errorMessage: null,
      });
    } catch (err) {
      console.error("[GET /upgrade/sent] error:", err);
      return res.status(500).send("Server error.");
    }
  });

  // POST /upgrade/send → set pending flag & send link
  router.post("/upgrade/send", csrfProtection, async (req, res) => {
    try {
      const { id, method } = req.body || {};
      console.log("[DEBUG] POST /upgrade/send hit");
      console.log("[DEBUG] method:", method);
      console.log("[DEBUG] sending to volunteer ID", id);

      if (!id || !method) {
        return res.status(400).json({
          success: false,
          fieldErrors: {
            form: "Please choose how you would like to receive your link.",
          },
        });
      }

      const volunteer = await findVolunteerByIdNonArchived(id);
      if (!volunteer) {
        return res.status(404).json({
          success: false,
          fieldErrors: {
            form: "No matching account was found.",
          },
        });
      }

      const hash = crypto.randomUUID();
      await setPendingReset(volunteer.id, hash);

      const baseUrl = getBaseUrl(req);
      const resetUrl = `${baseUrl}/reset-password/${encodeURIComponent(hash)}`;

      let ok = false;

      if (method === "email") {
        if (!volunteer.email) {
          return res.status(400).json({
            success: false,
            fieldErrors: {
              form: "No email is on file for this account.",
            },
          });
        }
        ok = await sendResetEmail(volunteer.email, resetUrl);
      } else if (method === "phone") {
        if (!volunteer.phone) {
          return res.status(400).json({
            success: false,
            fieldErrors: {
              form: "No phone number is on file for this account.",
            },
          });
        }
        ok = await sendResetSms(
          volunteer.phone,
          resetUrl,
          twilioAccountSid,
          twilioAuthToken,
          twilioMsgSid,
        );
      } else {
        return res.status(400).json({
          success: false,
          fieldErrors: {
            form: "Invalid delivery method.",
          },
        });
      }

      if (!ok) {
        return res.status(502).json({
          success: false,
          fieldErrors: {
            form: "We were unable to send the reset link. Please try again.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        redirectUrl: `/upgrade/sent?id=${volunteer.id}&method=${encodeURIComponent(
          method,
        )}`,
      });
    } catch (err) {
      console.error("[POST /upgrade/send] error:", err);
      return res.status(500).json({
        success: false,
        fieldErrors: {
          form: "Failed to send reset link. Please try again.",
        },
      });
    }
  });

  // GET /reset-password/:hash → show reset form
  router.get("/reset-password/:hash", csrfProtection, async (req, res) => {
    try {
      const hash = req.params.hash;
      const volunteer = await findVolunteerByResetHash(hash);

      if (!volunteer) {
        return res.status(404).render("404", { url: req.originalUrl });
      }

      res.render("authentication_and_accounts/resetPassword", {
        csrfToken: req.csrfToken(),
        hash,
      });
    } catch (err) {
      console.error("[GET /reset-password/:hash] error:", err);
      return res.status(500).send("Server error.");
    }
  });

  // POST /reset-password/:hash → update password, clear pending flag
  router.post("/reset-password/:hash", csrfProtection, async (req, res) => {
    try {
      const hashParam = req.params.hash;
      const volunteer = await findVolunteerByResetHash(hashParam);

      if (!volunteer) {
        return res.status(404).render("404", { url: req.originalUrl });
      }

      const { password, confirmPasswordInput } = req.body || {};
      if (
        !password ||
        !confirmPasswordInput ||
        password !== confirmPasswordInput
      ) {
        return res.status(400).send("Passwords do not match or are missing.");
      }

      const pwd = hashPassword(password);
      await updateUserPassword(volunteer.id, pwd, volunteer.email || null);
      await clearPendingReset(volunteer.id);

      return res.redirect("/login?pwSuccess=1");
    } catch (err) {
      console.error("[POST /reset-password/:hash] error:", err);
      return res.status(500).send("Failed to reset password.");
    }
  });

  // TEST SMS ENDPOINT (Dev-only helper)
  router.post("/upgrade/test-sms", csrfProtection, async (req, res) => {
    try {
      const { phone } = req.body || {};

      if (!phone) {
        return res.status(400).json({
          success: false,
          error: "Missing 'phone' field.",
        });
      }

      let normalized;
      try {
        normalized = normalizeToE164(phone);
      } catch (err) {
        return res.status(400).json({
          success: false,
          error: `Invalid phone number: ${err.message}`,
        });
      }

      console.log("[DEBUG] Attempting to send SMS using SID:", twilioMsgSid);
      console.log("[DEBUG] To:", normalized);
      const client = getTwilioClient(twilioAccountSid, twilioAuthToken);

      const msg = await client.messages.create({
        messagingServiceSid: twilioMsgSid,
        body: "TEST from YOUR CONVENTION APP at " + new Date().toISOString(),
        to: normalized,
      });

      return res.json({
        success: true,
        message: "Test SMS queued successfully.",
        to: normalized,
        sid: msg.sid,
        status: msg.status,
      });
    } catch (err) {
      console.error("[POST /upgrade/test-sms] error:", err);
      return res.status(500).json({
        success: false,
        error: "Failed to send test SMS. Check server logs.",
      });
    }
  });

  return router;
}
