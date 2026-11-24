// routes/apiRoutes.js
import express from "express";
import { publicRoute } from "../middleware/publicRoute.js";
import * as db from "../lib/dbSync.js";
import { rateLimit } from "../middleware/rateLimit.js";

const router = express.Router();

/**
 * At most 60 duplicate-email checks per IP in 15 minutes: the registration
 * form checks only after typing stops, so a person makes a handful, while
 * scripted probing for registered emails is slowed down.
 */
const existsLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  name: "volunteers-exists",
  message: "Too many checks. Please wait a few minutes and try again.",
});

/**
 * Quick existence check used by the frontend to pre-block duplicate emails.
 * Rate limited per IP (existsLimit); over the limit it answers 429.
 *
 * Mounted as: app.use('/api', router)
 * Available at: GET /api/volunteers/exists?email=...
 *
 * @route GET /api/volunteers/exists
 * @param {express.Request} req - Express request object.
 * @param {express.Response} res - Express response object.
 * @param {express.NextFunction} next - Express next middleware function.
 * @returns {Promise<void>} JSON response: { exists: boolean } or error.
 */
router.get("/volunteers/exists", publicRoute("registration: duplicate-email check"), existsLimit, async (req, res, next) => {
  try {
    const email = String(req.query?.email ?? "").trim();
    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    // Optional domain block: keep consistent with frontend behavior
    if (email.toLowerCase().endsWith("@jwpub.org")) {
      // Treat as "not taken" here; the domain is blocked elsewhere
      return res.status(200).json({ exists: false });
    }

    const exists = await db.emailExists(email);
    if (exists) {
      const draft = await db.getDraftByEmail(email);
      return res.json({ exists, isDraft: !!draft });
    }
    return res.json({ exists, isDraft: false });
  } catch (err) {
    return next(err);
  }
});

/**
 * Congregation dropdown autocomplete.
 *
 * Mounted as: app.use('/api', router)
 * Available at: GET /api/congregations
 *
 * @route GET /api/congregations
 * @param {express.Request} req - Express request object.
 * @param {express.Response} res - Express response object.
 * @returns {Promise<void>} JSON array of congregations or error.
 */
router.get("/congregations", publicRoute("registration: congregation list"), async (req, res) => {
  try {
    const congregations = await db.getCongregations();
    res.json(congregations);
  } catch (error) {
    console.error("Error fetching congregations:", error);
    res.status(500).json({ error: "Failed to load congregations" });
  }
});

export default router;
