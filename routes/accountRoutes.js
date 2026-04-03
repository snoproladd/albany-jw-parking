// routes/accountRoutes.js
import express from "express";
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
  getVolunteerForContinueRegistration,
  updateSecurityAttemptCount,
  markVolunteerCompromised,
  finalizeContinueRegistration,
  getVolunteerByEmailNonArchived,
  getVolunteerById,
  loadMergedPermissions,
} from "../lib/dbSync.js";
import { verifyPassword, hashPassword } from "../lib/passwordVer.js";

import { INCOMPATIBILITIES } from "../src/config/privilegeRules.js";

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
    if (!req.session.userId) {
      if (req.method === "GET") {
        req.session.returnTo = req.originalUrl;
      }
      return res.redirect("/login");
    }
    next();
  }
  // Normalize phone like phoneVer.js "digitsOnly": strip non-digits only.
  function normalizePhone(p) {
    return (p || "").replace(/\D+/g, "");
  }

  // Determine next registration step based on last_step
  function getNextRegistrationStep(lastStep) {
    switch ((lastStep || "").trim()) {
      case "":
      case null:
      case undefined:
        case "emailPass":
        return "/volunteerIn";
      case "volunteerIn":
        return "/personalInfo";
      case "personalInfo":
        return "/congregationInfo";
      case "congregationInfo":
        return "/spiritualInfo";
      case "spiritualInfo":
        return "/notes";
      case "notes":
        return "/volunteerSummary";
      case "formSummary":
        return "/volunteerSummary";
      default:
        return "/volunteerIn";
    }
  }

  // Render the global "account disabled" page
  function renderAccountDisabled(req, res) {
    return res.render("authentication_and_accounts/accountDisabled", {
      csrfToken: req.csrfToken(),
      message:
        "Too many tries. This user account has been disabled. Please re-create either by 'Entering Info Only' or 'Signing Up'.",
      enterInfoOnlyUrl: "/nonProfile",
      signUpUrl: "/email-pass",
    });
  }

  // ===========================
  // Continue/Upgrade Routes
  // ===========================
  // Show choice when an email exists in DB but no password is stored.
  // User can choose to continue without an account or upgrade to a full account.
  // Show choice when an email exists in DB but no password is stored.
  // User can choose to continue without an account or upgrade to a full account.
  router.get("/chooseContinueOrUpgrade", csrfProtection, (req, res) => {
    const error =
      typeof req.query.error === "string" && req.query.error.trim()
        ? req.query.error.trim()
        : null;

    // Must come from a login that set pendingEmail
    if (!req.session.pendingEmail) {
      return res.redirect("/login");
    }

    res.render("authentication_and_accounts/chooseContinueOrUpgrade", {
      csrfToken: req.csrfToken(),
      error,
    });
  });

  // AUTO-RESUME: /continue-registration/auto
  router.get("/continue-registration/auto", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.redirect("/login");

      const user = await getVolunteerForContinueRegistration(userId);
      if (!user) return res.redirect("/volunteerIn");

      // Compromised accounts get the locked-out screen
      if (user.account_status === "compromised") {
        return res.render("continueRegistration", {
          csrfToken: req.csrfToken(),
          disabled: true,
          requireName: false,
          requirePhoneConfirm: false,
          firstName: "",
          lastName: "",
          suffix: "",
          digits: "",
          nameStatus: "",
          phoneStatus: "",
        });
      }

      // If no draft exists, start new registration
      if (!user.last_step || user.registration_status === "new") {
        return res.redirect("/volunteerIn");
      }

      // If registration already completed
      if (user.registration_status === "completed") {
        // if they have account, redirect home
        if (req.session.userEmail) {
          return res.redirect("/my-account");
        }
        // non-registered? Show summary page
        return res.redirect("/volunteerSummary");
      }
      // Restore the existing registration_id into session so
      // requireDraft guards on subsequent steps don't kick the
      // user back to /email-pass.
     if (user.registration_id) {
       req.session.registrationId = user.registration_id;
       req.session.disableNameFields = true;
     }

     const nextStep = getNextRegistrationStep(user.last_step);
     return res.redirect(nextStep);
    } catch (err) {
      logError("Auto-resume continue-registration failed:", err);
      return res.redirect("/volunteerIn");
    }
  });
  router.get("/continue-registration", csrfProtection, async (req, res) => {
    if (!req.session.userId) {
      return res.redirect("/login");
    }

    try {
      const user = await getVolunteerForContinueRegistration(
        req.session.userId,
      );
      if (!user) {
        return res.redirect("/login");
      }

      if (user.account_status === "compromised") {
        return renderAccountDisabled(req, res);
      }

      const requireName = !user.firstName && !user.lastName;
      const requirePhoneConfirm = !user.phone;

      return res.render("authentication_and_accounts/continueRegistration", {
        csrfToken: req.csrfToken(),
        requireName,
        requirePhoneConfirm,
        error: null,
        success: null,
      });
    } catch (err) {
      (logError || console.error)("[continue-registration GET] error:", err);
      return res.status(500).send("Server error");
    }
  });

  router.post("/continue-registration", csrfProtection, async (req, res) => {
    if (!req.session.userId) {
      return res.redirect("/login");
    }

    const {
      firstName,
      lastName,
      suffix,
      phone,
      confirmPhone,
      requireName: requireNameFlag,
      requirePhoneConfirm: requirePhoneConfirmFlag,
    } = req.body;

    const requireName = requireNameFlag === "true";
    const requirePhoneConfirm = requirePhoneConfirmFlag === "true";

    try {
      const user = await getVolunteerForContinueRegistration(
        req.session.userId,
      );
      if (!user) {
        return res.redirect("/login");
      }

      if (user.account_status === "compromised") {
        return renderAccountDisabled(req, res);
      }

      let attempts = user.security_attempt_count || 0;

      //
      // 1) NAME LOGIC
      //
      if (requireName) {
        // DB has no name yet — we are *creating* the name
        if (!firstName?.trim() || !lastName?.trim()) {
          return res.render(
            "authentication_and_accounts/continueRegistration",
            {
              csrfToken: req.csrfToken(),
              error: "Please enter your first and last name.",
              success: null,
              requireName: true,
              requirePhoneConfirm,
            },
          );
        }
        // No comparison for create
      } else {
        // DB already has a name — we must verify it
        const submittedFirst = (firstName || "").trim().toLowerCase();
        const submittedLast = (lastName || "").trim().toLowerCase();
        const submittedSuffix = (suffix || "").trim().toLowerCase();

        const dbFirst = (user.firstName || "").trim().toLowerCase();
        const dbLast = (user.lastName || "").trim().toLowerCase();
        const dbSuffix = (user.suffix || "").trim().toLowerCase();

        const firstOk = submittedFirst === dbFirst;
        const lastOk = submittedLast === dbLast;
        const suffixOk = dbSuffix ? submittedSuffix === dbSuffix : true;

        if (!firstOk || !lastOk || !suffixOk) {
          attempts += 1;

          if (attempts >= 3) {
            await markVolunteerCompromised(user.id);
            return renderAccountDisabled(req, res);
          }

          await updateSecurityAttemptCount(user.id, attempts);

          return res.render(
            "authentication_and_accounts/continueRegistration",
            {
              csrfToken: req.csrfToken(),
              error: "Name does not match our records. Please try again.",
              success: null,
              requireName: false,
              requirePhoneConfirm,
            },
          );
        }
      }

      //
      // 2) PHONE LOGIC
      //
      const normalizedPhone = normalizePhone(phone);

      if (!normalizedPhone) {
        return res.render("authentication_and_accounts/continueRegistration", {
          csrfToken: req.csrfToken(),
          error: "Please enter your phone number.",
          success: null,
          requireName,
          requirePhoneConfirm,
        });
      }

      if (requirePhoneConfirm) {
        // No phone on file — we are creating a new phone and need confirmation
        const normalizedConfirm = normalizePhone(confirmPhone);
        if (!normalizedConfirm || normalizedConfirm !== normalizedPhone) {
          return res.render(
            "authentication_and_accounts/continueRegistration",
            {
              csrfToken: req.csrfToken(),
              error: "Phone numbers do not match.",
              success: null,
              requireName,
              requirePhoneConfirm: true,
            },
          );
        }
        // OK: we'll save normalizedPhone as the new phone.
      } else {
        // DB already has a phone — verify single entry against it
        const normalizedDbPhone = normalizePhone(user.phone);

        if (normalizedPhone !== normalizedDbPhone) {
          attempts += 1;

          if (attempts >= 3) {
            await markVolunteerCompromised(user.id);
            return renderAccountDisabled(req, res);
          }

          await updateSecurityAttemptCount(user.id, attempts);

          return res.render(
            "authentication_and_accounts/continueRegistration",
            {
              csrfToken: req.csrfToken(),
              error: "Phone does not match our records.",
              success: null,
              requireName,
              requirePhoneConfirm: false,
            },
          );
        }
        // OK: phone matches DB.
      }

      //
      // 3) UPDATE DB (name/phone/last_step + reset attempts)
      //
      const nextPath = getNextRegistrationStep(user.last_step); // e.g., "/personalInfo"
      const nextStep = nextPath.startsWith("/") ? nextPath.slice(1) : nextPath;

      await finalizeContinueRegistration({
        id: user.id,
        requireName,
        requirePhoneConfirm,
        firstName: firstName || null,
        lastName: lastName || null,
        suffix: suffix || null,
        normalizedPhone,
        nextStep, // e.g., "personalInfo"
      });

      //
      // 4) Redirect to the correct next step
      //
      return res.redirect(nextPath);
    } catch (err) {
      (logError || console.error)("[continue-registration POST] error:", err);
      return res
        .status(500)
        .render("authentication_and_accounts/continueRegistration", {
          csrfToken: req.csrfToken(),
          error: "Server error. Please try again.",
          success: null,
          requireName: true,
          requirePhoneConfirm: true,
        });
    }
  });

  // Continue registration WITHOUT creating a password (non-registered path)
  router.post("/continue-without-account", csrfProtection, async (req, res) => {
    // Get the email securely from session, set in the login route
    const trimmedEmail = (req.session.pendingEmail || "").trim().toLowerCase();

    if (!trimmedEmail) {
      return res.render("authentication_and_accounts/chooseContinueOrUpgrade", {
        csrfToken: req.csrfToken(),
        error: "Your session has expired. Please sign in again.",
      });
    }

    try {
      // Use dbSync helper instead of inline SQL
      const user = await getVolunteerByEmailNonArchived(trimmedEmail);

      // No matching draft/nonregistered record
      if (!user) {
        return res.render(
          "authentication_and_accounts/chooseContinueOrUpgrade",
          {
            csrfToken: req.csrfToken(),
            error:
              "We couldn't locate your draft registration. Please start a new one.",
          },
        );
      }

      // If account was compromised, block completely
      if (user.account_status === "compromised") {
        req.session.pendingEmail = null;
        return renderAccountDisabled(req, res);
      }

      // Non-registered continuation: do NOT treat this as a logged-in account
      req.session.userId = user.id; // needed for registration editing
      req.session.userEmail = null; // ensures edits are treated as non-registered
      req.session.nonRegistered = true; // flag used by your nonProfile flow

      // This email is now "used" for this continuation; clear it from session
      req.session.pendingEmail = null;

      const nextStep = getNextRegistrationStep(user.last_step);
      return res.redirect(nextStep);
    } catch (err) {
      (logError || console.error)(
        "[accountRoutes] continue-without-account error:",
        err,
      );
      return res
        .status(500)
        .render("authentication_and_accounts/chooseContinueOrUpgrade", {
          csrfToken: req.csrfToken(),
          error: "Server error. Please try again.",
        });
    }
  });
  // ===========================================================
  // UPGRADE TO ACCOUNT (set password for an email with no password)
  // Uses email stored in session.pendingEmail (secure, not in HTML/URL)
  // ===========================================================
  router.post("/upgrade-to-account", csrfProtection, async (req, res) => {
    const pendingEmail = (req.session.pendingEmail || "").trim().toLowerCase();

    if (!pendingEmail) {
      return res.render("authentication_and_accounts/chooseContinueOrUpgrade", {
        csrfToken: req.csrfToken(),
        error: "Your session has expired. Please sign in again.",
      });
    }

    try {
      // Use dbSync helper instead of inline SQL
      const user = await getVolunteerByEmailNonArchived(pendingEmail);

      if (!user) {
        return res.render(
          "authentication_and_accounts/chooseContinueOrUpgrade",
          {
            csrfToken: req.csrfToken(),
            error:
              "We couldn't locate your draft registration. Please start again or sign up.",
          },
        );
      }

      if (user.account_status === "compromised") {
        req.session.pendingEmail = null;
        return renderAccountDisabled(req, res);
      }

      // If a password already exists, this path shouldn't be used
      if (user.passwordHash) {
        req.session.pendingEmail = null;
        return res.redirect("/login");
      }

      // Valid draft/partial account with no password:
      // Hand off to the email+password setup step (emailPass flow).
      req.session.emailPassSetup = pendingEmail;
      req.session.pendingEmail = null;

      return res.redirect("/email-pass");
    } catch (err) {
      (logError || console.error)("[upgrade-to-account] error:", err);
      return res.render("authentication_and_accounts/chooseContinueOrUpgrade", {
        csrfToken: req.csrfToken(),
        error: "Server error. Please try again.",
      });
    }
  });

  // ===========================
  // LOGIN ROUTES
  // ===========================
  router.get("/login", csrfProtection, (req, res) => {
    const loginSuccess = req.session.loginSuccess || false;
    req.session.loginSuccess = null; // clear flash flag

    res.render("authentication_and_accounts/login", {
      csrfToken: req.csrfToken(),
      error: null,
      email: "",
      loginSuccess,
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
        loginSuccess: false,
      });
    }

    try {
      const result = await exec(
        `
      SELECT TOP (1)
        id,
        email,
        firstName,
        lastName,
        passwordHash,
        passwordSalt,
        passwordIter,
        passwordAlgo,
        registration_status,
        last_step,
        account_status, 
        role
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

      // No matching account at all → invalid
      if (!user) {
        return res.status(401).render("authentication_and_accounts/login", {
          csrfToken: req.csrfToken(),
          error: "Invalid email or password.",
          email: trimmedEmail,
          loginSuccess: false,
        });
      }

      // Compromised accounts are globally locked
      if (user.account_status === "compromised") {
        return renderAccountDisabled(req, res);
      }

      // Email exists in DB but NO password stored yet → go to choose-continue-or-upgrade
      if (!user.passwordHash) {
        req.session.pendingEmail = trimmedEmail;
        return res.redirect("/chooseContinueOrUpgrade");
      }

      // Normal password verification
      const isValid = verifyPassword(rawPassword, {
        hash: user.passwordHash,
        salt: user.passwordSalt,
        iterations: user.passwordIter,
        algo: user.passwordAlgo,
      });

      if (!isValid) {
        return res.status(401).render("authentication_and_accounts/login", {
          csrfToken: req.csrfToken(),
          error: "Invalid email or password.",
          email: trimmedEmail,
          loginSuccess: false,
        });
      }
      function makeInitials(first, last) {
        const f = (first || "").trim();
        const l = (last || "").trim();
        if (!f && !l) return null;
        const fi = f ? f[0].toUpperCase() : "";
        const li = l ? l[0].toUpperCase() : "";
        return fi + li || null;
      }

      // inside POST /login, after successful password validation:
      const initials = makeInitials(user.firstName, user.lastName);
      req.session.userId = user.id;
      req.session.userEmail = user.email;
      req.session.userRole = user.role;
      req.session.userInitials = initials;
      req.session.userRole = user.role || "REGISTERED";
      req.session.permissions = await loadMergedPermissions();
      req.session.registrationStatus = user.registration_status || null;

      // Login success → clear any leftover pendingEmail
      req.session.pendingEmail = null;

      // Completed accounts go to Home
      req.session.userId = user.id;
      req.session.userEmail = user.email; // for edited_by
      req.session.loginSuccess = true;
      // Redirect to intended destination if one was captured, then clear it
      const returnTo = req.session.returnTo || null;
      req.session.returnTo = null;
      return res.redirect("/login");
    } catch (err) {
      (logError || console.error)("[accountRoutes] Login error:", err);
      return res.status(500).render("authentication_and_accounts/login", {
        csrfToken: req.csrfToken(),
        error: "An unexpected error occurred. Please try again.",
        email: trimmedEmail,
        loginSuccess: false,
      });
    }
  });

  // ===========================
  // Logout route: destroy session and redirect to home
  // ==========================
  router.post("/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/");
    });
  });

  //==========================
  // Disallow GET on logout for security reasons (avoid CSRF issues)
  // ==========================
  
  router.get("/logout", (req, res) => {
    res.status(405).send("Logout must be POST");
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
      const user = await getVolunteerById(id);

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

      const { email, phone, SMSCapable, whatsappid } = req.body;
      const smsCapable = SMSCapable === "yes";

      try {
        await updateUserContact(
          id,
          { email, phone, smsCapable, whatsappid },
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
        router.get(
          "/my-account",
          requireAuth,
          csrfProtection,
          async (req, res) => {
            const id = req.session.userId;
            const pwError = req.query.pwError === "1";
            const pwSuccess = req.query.pwSuccess === "1";

            try {
              const user = await getVolunteerById(id);

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
