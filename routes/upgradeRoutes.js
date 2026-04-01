// routes/upgradeRoutes.js
import crypto from "crypto";
import { hashPassword } from "../lib/passwordVer.js";
import {
  sendResetEmail,
  sendResetSms,
  getBaseUrl,
  normalizeToE164,
} from "../lib/messaging.js";

const RESET_RESEND_COOLDOWN_MS = 60 * 1000 * 2; // 2 minutes

/**
 * Upgrade routes: convert non-registered (or existing) records into
 * registered accounts by sending a password reset link via email or SMS.
 *
 * Send helpers (sendResetEmail, sendResetSms, getBaseUrl, normalizeToE164)
 * are imported from lib/messaging.js and shared with oversightRoutes.js.
 *
 * Main flows:
 * - GET  /upgrade                → enter phone/email
 * - POST /upgrade/find           → locate account by phone/email
 * - GET  /upgrade/name           → confirm name
 * - POST /upgrade/name           → verify name
 * - GET  /upgrade/send           → choose email vs SMS
 * - POST /upgrade/send           → generate reset hash + send link
 * - GET  /upgrade/sent           → confirmation page
 * - GET  /reset-password/:hash   → show reset form
 * - POST /reset-password/:hash   → set new password + clear pending flag
 * - POST /upgrade/test-sms       → dev-only SMS test endpoint
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

  // ─────────────────────────────────────────────────────────────
  // Masking helpers (display only — not shared)
  // ─────────────────────────────────────────────────────────────

  /**
   * Mask an email address for display, e.g. j••••e@g••••l.com
   * @param {string} email
   * @returns {string}
   */
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

  /**
   * Mask a phone number for display, e.g. (***) ***-1234
   * @param {string} phone
   * @returns {string}
   */
  function maskPhone(phone) {
    if (!phone) return "";
    const digits = phone.replace(/\D+/g, "");
    if (digits.length < 4) return "****";
    return `(***) ***-${digits.slice(-4)}`;
  }

  // ─────────────────────────────────────────────────────────────
  // Routes
  // ─────────────────────────────────────────────────────────────

  // GET /upgrade → start: enter phone/email
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
          fieldErrors: { form: "Please enter an email or a phone number." },
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
      if (!volunteer)
        return res.status(404).render("404", { url: req.originalUrl });

      res.render("upgrade/upgradeName", {
        csrfToken: req.csrfToken(),
        volunteer,
      });
    } catch (err) {
      console.error("[GET /upgrade/name] error:", err);
      return res.status(500).send("Server error.");
    }
  });

  // POST /upgrade/name → verify name against DB record
  router.post("/upgrade/name", csrfProtection, async (req, res) => {
    try {
      const { id, firstName, lastName, suffix } = req.body || {};
      if (!id || !firstName || !lastName) {
        return res.status(400).json({
          success: false,
          fieldErrors: { form: "First and last name are required." },
        });
      }

      const volunteer = await findVolunteerByIdNonArchived(id);
      if (!volunteer) {
        return res.status(404).json({
          success: false,
          fieldErrors: { form: "No matching account was found." },
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
          fieldErrors: { form: "The name entered does not match our records." },
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
        fieldErrors: { form: "Server error while verifying your name." },
      });
    }
  });

  // GET /upgrade/send → choose email vs SMS
  router.get("/upgrade/send", csrfProtection, async (req, res) => {
    try {
      const id = req.query.id;
      if (!id) return res.redirect("/upgrade");

      const volunteer = await findVolunteerByIdNonArchived(id);
      if (!volunteer)
        return res.status(404).render("404", { url: req.originalUrl });

      res.render("upgrade/upgradeSend", {
        csrfToken: req.csrfToken(),
        volunteer,
        maskedEmail: maskEmail(volunteer.email),
        maskedPhone: maskPhone(volunteer.phone),
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
      if (!id || !method) return res.redirect("/upgrade");

      const volunteer = await findVolunteerByIdNonArchived(id);
      if (!volunteer)
        return res.status(404).render("404", { url: req.originalUrl });

      res.render("upgrade/upgradeSent", {
        csrfToken: req.csrfToken(),
        volunteer,
        method,
        maskedEmail: maskEmail(volunteer.email),
        maskedPhone: maskPhone(volunteer.phone),
        message: "Reset link sent successfully.",
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
          fieldErrors: { form: "No matching account was found." },
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
            fieldErrors: { form: "No email is on file for this account." },
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
          fieldErrors: { form: "Invalid delivery method." },
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
        redirectUrl: `/upgrade/sent?id=${volunteer.id}&method=${encodeURIComponent(method)}`,
      });
    } catch (err) {
      console.error("[POST /upgrade/send] error:", err);
      return res.status(500).json({
        success: false,
        fieldErrors: { form: "Failed to send reset link. Please try again." },
      });
    }
  });

  // GET /reset-password/:hash → show password reset form
  router.get("/reset-password/:hash", csrfProtection, async (req, res) => {
    try {
      const volunteer = await findVolunteerByResetHash(req.params.hash);
      if (!volunteer)
        return res.status(404).render("404", { url: req.originalUrl });

      res.render("authentication_and_accounts/resetPassword", {
        csrfToken: req.csrfToken(),
        hash: req.params.hash,
      });
    } catch (err) {
      console.error("[GET /reset-password/:hash] error:", err);
      return res.status(500).send("Server error.");
    }
  });

  // POST /reset-password/:hash → set new password and clear pending flag
  router.post("/reset-password/:hash", csrfProtection, async (req, res) => {
    try {
      const volunteer = await findVolunteerByResetHash(req.params.hash);
      if (!volunteer)
        return res.status(404).render("404", { url: req.originalUrl });

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

  // POST /upgrade/test-sms → dev-only SMS test endpoint
  router.post("/upgrade/test-sms", csrfProtection, async (req, res) => {
    try {
      const { phone } = req.body || {};

      if (!phone) {
        return res
          .status(400)
          .json({ success: false, error: "Missing 'phone' field." });
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

      const ok = await sendResetSms(
        normalized,
        "https://example.com/test",
        twilioAccountSid,
        twilioAuthToken,
        twilioMsgSid,
      );

      if (!ok) {
        return res
          .status(500)
          .json({
            success: false,
            error: "Failed to send test SMS. Check server logs.",
          });
      }

      return res.json({
        success: true,
        message: "Test SMS queued successfully.",
        to: normalized,
      });
    } catch (err) {
      console.error("[POST /upgrade/test-sms] error:", err);
      return res
        .status(500)
        .json({
          success: false,
          error: "Failed to send test SMS. Check server logs.",
        });
    }
  });

  return router;
}
