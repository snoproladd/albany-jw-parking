// routes/accountRoutes.js
import express from "express";
import crypto from "crypto";
import sql from "mssql";

import {
  exec,
  updateUserContact,
  updateUserPersonal,
  updateUserCongregation,
  updateUserSpiritual,
  updateUserNotes,
  updateUserPassword,
  getCongregations,
} from "../lib/dbSync.js";

import { INCOMPATIBILITIES } from "../src/config/privilegeRules.js";

/**
 * Verify a raw password against the stored PBKDF2 hash.
 * Mirrors the hash scheme used when creating accounts.
 *
 * @param {string} rawPassword - The plaintext password provided by the user.
 * @param {{
 *   passwordHash?: string;
 *   passwordSalt?: string;
 *   passwordIter?: number | string;
 *   passwordAlgo?: string;
 * }} row - Database row containing password metadata.
 * @returns {boolean} True if the password is valid, false otherwise.
 */
function verifyPassword(rawPassword, row) {
  const { passwordHash, passwordSalt, passwordIter, passwordAlgo } = row || {};

  if (!passwordHash || !passwordSalt || !passwordIter || !passwordAlgo) {
    return false;
  }

  if (passwordAlgo !== "pbkdf2-sha256") {
    return false;
  }

  const iterations = Number(passwordIter);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  const derived = crypto
    .pbkdf2Sync(rawPassword, passwordSalt, iterations, 32, "sha256")
    .toString("base64");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(derived, "utf8"),
      Buffer.from(passwordHash, "utf8"),
    );
  } catch {
    return false;
  }
}

/**
 * Hash a new password with PBKDF2-SHA256.
 *
 * @param {string} password - The raw password to hash.
 * @returns {{
 *   hash: string;
 *   salt: string;
 *   iterations: number;
 *   algo: string;
 * }} Object containing the hash, salt, iterations, and algorithm.
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64");
  const iterations = 310000;
  const algo = "pbkdf2-sha256";

  const hash = crypto
    .pbkdf2Sync(password, salt, iterations, 32, "sha256")
    .toString("base64");

  return { hash, salt, iterations, algo };
}

/**
 * Factory: build router that handles login + my-account.
 *
 * Usage in index.js:
 *   app.use("/", loginRouter({ csrfProtection, logError }));
 *
 * @param {{
 *   csrfProtection: import("csurf").RequestHandler;
 *   logError?: (...args: any[]) => void;
 * }} deps - Dependencies injected from index.js.
 * @returns {import("express").Router} Configured Express router.
 */
export function loginRouter({ csrfProtection, logError }) {
  const router = express.Router();

  /**
   * Derive the "edited by" identity for audit fields.
   *
   * Priority:
   *  1. `req.session.userEmail` (set at login)
   *  2. `req.body.email` (if present)
   *  3. `"self-service"` fallback
   *
   * @param {import("express").Request} req
   * @returns {string}
   */
  function getEditedBy(req) {
    if (req.session.userEmail) return req.session.userEmail;
    if (req.body && req.body.email) return req.body.email;
    return "self-service";
  }

  /**
   * Middleware: require authenticated user (session.userId).
   * Redirects to /login if not authenticated.
   *
   * @param {import("express").Request} req
   * @param {import("express").Response} res
   * @param {import("express").NextFunction} next
   * @returns {void}
   */
  function requireAuth(req, res, next) {
    if (!req.session.userId) return res.redirect("/login");
    next();
  }

  // ===========================
  // LOGIN ROUTES
  // ===========================
  router.get("/login", csrfProtection, (req, res) => {
    // Already logged in? Optional redirect:
    // if (req.session.userId) return res.redirect("/my-account");

    res.render("authentication_and_accounts/login", {
      csrfToken: req.csrfToken(),
      error: null,
      email: "",
    });
  });

  router.post("/login", csrfProtection, async (req, res) => {
    const { email, password } = req.body || {};
    const trimmedEmail = (email || "").trim().toLowerCase();
    const rawPassword = password || "";

    if (!trimmedEmail || !rawPassword) {
      return res.status(400).render("authentication_and_accounts/login", {
        csrfToken: req.csrfToken(),
        error: "Please enter both email and password.",
        email: trimmedEmail,
      });
    }

    try {
      const result = await exec(
        `
        SELECT TOP (1)
          id,
          email,
          passwordHash,
          passwordSalt,
          passwordIter,
          passwordAlgo
        FROM dbo.volunteer_in
        WHERE LOWER(email) = @email
          AND accountType = 'registered'
          AND registration_status <> 'archived';
        `,
        (reqSql) => {
          reqSql.input("email", sql.NVarChar(255), trimmedEmail);
        },
      );

      const user = result.recordset?.[0];

      if (!user || !verifyPassword(rawPassword, user)) {
        return res.status(401).render("authentication_and_accounts/login", {
          csrfToken: req.csrfToken(),
          error: "Invalid email or password.",
          email: trimmedEmail,
        });
      }

      // Success – store user session for My Account
      req.session.userId = user.id;
      req.session.userEmail = user.email; // for edited_by
      return res.redirect("/my-account");
    } catch (err) {
      (logError || console.error)("[accountRoutes] Login error:", err);
      return res.status(500).render("authentication_and_accounts/login", {
        csrfToken: req.csrfToken(),
        error: "An unexpected error occurred. Please try again.",
        email: trimmedEmail,
      });
    }
  });

  // ===========================
  // MY ACCOUNT ROUTES
  // ===========================

  // GET /my-account → show account page
  router.get("/my-account", requireAuth, csrfProtection, async (req, res) => {
    const id = req.session.userId;
    const pwError = req.query.pwError === "1";
    const pwSuccess = req.query.pwSuccess === "1";

    try {
      const result = await exec(
        `
        SELECT TOP (1) *
        FROM dbo.volunteer_in
        WHERE id = @id;
        `,
        (reqSql) => {
          reqSql.input("id", sql.Int, id);
        },
      );

      const user = result.recordset?.[0];

      if (!user) {
        // If the record disappeared, force re-login
        req.session.destroy?.(() => {});
        return res.redirect("/login");
      }

      const congregations = await getCongregations();
      const gender = user.gender || "";

      res.render("myAccount", {
        csrfToken: req.csrfToken(),
        user,
        congregations,
        privilegeRulesJSON: JSON.stringify(INCOMPATIBILITIES),
        gender,
        pwError,
        pwSuccess,
      });
    } catch (err) {
      (logError || console.error)("myAccount GET error:", err);
      res.status(500).send("Server error");
    }
  });

  // CONTACT
  router.post(
    "/my-account/update/contact",
    requireAuth,
    csrfProtection,
    async (req, res) => {
      const id = req.session.userId;
      if (!id) return res.redirect("/login");

      const { email, phone, SMSCapable } = req.body;
      const smsCapable = SMSCapable === "yes";

      try {
        await updateUserContact(
          id,
          { email, phone, smsCapable },
          getEditedBy(req),
        );
        return res.redirect("/my-account");
      } catch (err) {
        (logError || console.error)("my-account contact update error:", err);
        return res.status(500).send("Failed to update contact info.");
      }
    },
  );

  // PERSONAL
  router.post(
    "/my-account/update/personal",
    requireAuth,
    csrfProtection,
    async (req, res) => {
      const id = req.session.userId;
      if (!id) return res.redirect("/login");

      const { dobirthRaw, genderRaw, staminaRaw } = req.body;

      try {
        await updateUserPersonal(
          id,
          { dobirthRaw, genderRaw, staminaRaw },
          getEditedBy(req),
        );
        return res.redirect("/my-account");
      } catch (err) {
        (logError || console.error)("my-account personal update error:", err);
        return res.status(500).send("Failed to update personal info.");
      }
    },
  );

  // CONGREGATION
  router.post(
    "/my-account/update/congregation",
    requireAuth,
    csrfProtection,
    async (req, res) => {
      const id = req.session.userId;
      if (!id) return res.redirect("/login");

      const {
        congAssigned,
        congregation,
        congregationOtherCity,
        congregationOtherState,
        congregationOtherLang,
        extraAttend,
      } = req.body;

      try {
        await updateUserCongregation(
          id,
          {
            congAssigned,
            congregation,
            congregationOtherCity,
            congregationOtherState,
            congregationOtherLang,
            extraAttend,
          },
          getEditedBy(req),
        );
        return res.redirect("/my-account");
      } catch (err) {
        (logError || console.error)(
          "my-account congregation update error:",
          err,
        );
        return res.status(500).send("Failed to update congregation info.");
      }
    },
  );

  // SPIRITUAL (privileges)
  router.post(
    "/my-account/update/spiritual",
    requireAuth,
    csrfProtection,
    async (req, res) => {
      const id = req.session.userId;
      if (!id) return res.redirect("/login");

      let { privileges } = req.body;
      // If only one checkbox is checked, Express sends a string
      if (!Array.isArray(privileges) && typeof privileges === "string") {
        privileges = [privileges];
      }

      try {
        await updateUserSpiritual(id, privileges || [], getEditedBy(req));
        return res.redirect("/my-account");
      } catch (err) {
        (logError || console.error)("my-account spiritual update error:", err);
        return res.status(500).send("Failed to update spiritual info.");
      }
    },
  );

  // NOTES
  router.post(
    "/my-account/update/notes",
    requireAuth,
    csrfProtection,
    async (req, res) => {
      const id = req.session.userId;
      if (!id) return res.redirect("/login");

      const { notes } = req.body;

      try {
        await updateUserNotes(id, notes, getEditedBy(req));
        return res.redirect("/my-account");
      } catch (err) {
        (logError || console.error)("my-account notes update error:", err);
        return res.status(500).send("Failed to update notes.");
      }
    },
  );

  // PASSWORD CHANGE
  router.post(
    "/my-account/change-password",
    requireAuth,
    csrfProtection,
    async (req, res) => {
      const id = req.session.userId;
      if (!id) return res.redirect("/login");

      const { newPassword, confirmPassword } = req.body || {};

      if (!newPassword || !confirmPassword || newPassword !== confirmPassword) {
        return res.redirect("/my-account?pwError=1");
      }

      try {
        const pwd = hashPassword(newPassword);
        await updateUserPassword(id, pwd, getEditedBy(req));
        return res.redirect("/my-account?pwSuccess=1");
      } catch (err) {
        (logError || console.error)("myAccount password change error:", err);
        return res.redirect("/my-account?pwError=1");
      }
    },
  );

  /**
   * Finalize changes for the current user (cached + finalize-all model).
   *
   * Expected JSON body (all fields optional; only provided sections are saved):
   * {
   *   contact?: {
   *     email?: string;
   *     phone?: string;
   *     smsCapable?: boolean;
   *   };
   *   personal?: {
   *     dobirthRaw?: string;
   *     genderRaw?: string;
   *     staminaRaw?: string;
   *   };
   *   congregation?: {
   *     congAssigned?: string;
   *     congregation?: string;
   *     congregationOtherCity?: string;
   *     congregationOtherState?: string;
   *     congregationOtherLang?: string;
   *     extraAttend?: string;
   *   };
   *   spiritual?: string[]; // privilege codes
   *   notes?: string;
   * }
   *
   * The route:
   *  - Applies updates via updateUser* helpers if data is present
   *  - Sets last_updated + edited_by audit fields
   */
  router.post(
    "/my-account/finalize",
    requireAuth,
    csrfProtection,
    async (req, res) => {
      const id = req.session.userId;
      if (!id) {
        return res.status(401).json({
          success: false,
          message: "Not authenticated.",
        });
      }

      /** @type {{
       *  contact?: { email?: string; phone?: string; smsCapable?: boolean };
       *  personal?: { dobirthRaw?: string; genderRaw?: string; staminaRaw?: string };
       *  congregation?: {
       *    congAssigned?: string;
       *    congregation?: string;
       *    congregationOtherCity?: string;
       *    congregationOtherState?: string;
       *    congregationOtherLang?: string;
       *    extraAttend?: string;
       *  };
       *  spiritual?: string[];
       *  notes?: string;
       * }} */
      const payload = req.body || {};

      const editedBy = getEditedBy(req);

      try {
        const promises = [];

        if (payload.contact) {
          promises.push(
            updateUserContact(
              id,
              {
                email: payload.contact.email,
                phone: payload.contact.phone,
                smsCapable: payload.contact.smsCapable,
              },
              editedBy,
            ),
          );
        }

        if (payload.personal) {
          promises.push(
            updateUserPersonal(
              id,
              {
                dobirthRaw: payload.personal.dobirthRaw,
                genderRaw: payload.personal.genderRaw,
                staminaRaw: payload.personal.staminaRaw,
              },
              editedBy,
            ),
          );
        }

        if (payload.congregation) {
          promises.push(
            updateUserCongregation(
              id,
              {
                congAssigned: payload.congregation.congAssigned,
                congregation: payload.congregation.congregation,
                congregationOtherCity:
                  payload.congregation.congregationOtherCity,
                congregationOtherState:
                  payload.congregation.congregationOtherState,
                congregationOtherLang:
                  payload.congregation.congregationOtherLang,
                extraAttend: payload.congregation.extraAttend,
              },
              editedBy,
            ),
          );
        }

        if (payload.spiritual) {
          promises.push(
            updateUserSpiritual(
              id,
              Array.isArray(payload.spiritual)
                ? payload.spiritual
                : [payload.spiritual],
              editedBy,
            ),
          );
        }

        if (typeof payload.notes === "string") {
          promises.push(updateUserNotes(id, payload.notes, editedBy));
        }

        // Apply all section updates
        await Promise.all(promises);

        // Audit fields (if you want to keep an explicit final stamp)
        await exec(
          `
        UPDATE dbo.volunteer_in
        SET last_updated = SYSUTCDATETIME(),
            edited_by    = @editedBy
        WHERE id = @id;
      `,
          (reqSql) => {
            reqSql.input("id", sql.Int, id);
            reqSql.input("editedBy", sql.NVarChar(50), editedBy);
          },
        );

        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("my-account finalize error:", err);
        return res.status(500).json({
          success: false,
          message: "Failed to finalize changes.",
        });
      }
    },
  );

  return router;
}
