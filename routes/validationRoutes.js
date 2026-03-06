// routes/validationRoutes.js
import express from "express";

/**
 * Create and configure validation routes (phone/email).
 *
 * @param {Object} deps
 * @param {Function} deps.initTwilio
 * @param {Function} deps.verifyEmail
 * @param {Function} deps.logError
 * @returns {express.Router}
 */
export function createValidationRouter(deps) {
  const { initTwilio, verifyEmail, logError } = deps;
  const router = express.Router();

  /**
   * Validate a phone number via Twilio Lookup.
   *
   * @route GET /validate-phone
   */
  router.get("/validate-phone", async (req, res) => {
    try {
      const raw = (req.query.phone || "").toString();
      const digits = raw.replace(/\D+/g, "");
      if (!digits) {
        return res.status(400).json({ error: "Phone number required" });
      }

      const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
      const tw = await initTwilio();
      const lookup = await tw.lookups.v2
        .phoneNumbers(e164)
        .fetch({ type: ["carrier"] });

      return res.json({
        valid: true,
        normalized: e164,
        carrierType: lookup?.carrier?.type || "",
      });
    } catch (err) {
      if (err.status === 404) {
        return res.json({
          valid: false,
          validation_errors: "Invalid or unrecognized phone number.",
        });
      }
      logError("Twilio Lookup error:", err);
      res.status(500).json({ error: "Lookup failed" });
    }
  });

  /**
   * Validate an email address via Kickbox.
   *
   * @route GET /validate-email
   */
  router.get("/validate-email", async (req, res) => {
    const email = (req.query.email || "").toString().trim();
    if (!email) {
      return res.status(400).json({
        valid: false,
        reason: "Please enter an email address",
      });
    }
    if (email.toLowerCase().endsWith("@jwpub.org")) {
      return res.json({
        result: "invalid",
        reason: "Domain not allowed",
      });
    }
    try {
      const result = await verifyEmail(email);
      res.json({
        result: result.result,
        reason: result.reason,
      });
    } catch (err) {
      logError("Kickbox verification error:", err);
      res.status(500).json({ error: "Verification failed" });
    }
  });

  return router;
};

