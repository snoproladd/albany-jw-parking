// routes/registrationRoutes.js
import express from "express";
import crypto from "crypto";

/**
 * Registration Router (Final Correct Version)
 *
 * This file handles ALL volunteer registration steps:
 * 1. emailPass (registered users)
 * 2. nonProfile (guest users)
 * 3. volunteerInfo (phone)
 * 4. personalInfo
 * 5. congregationInfo
 * 6. spiritualInfo
 * 7. notes
 * 8. final summary
 *
 * All flows operate on a DRAFT-based registration record:
 *  - Created in nonProfile or emailPass
 *  - Updated step-by-step
 *  - Completed in submitSummary
 */
export function createRegistrationRouter(deps) {
  const {
    csrfProtection,
    loadVolunteerCache,
    startDbUpdate,
    stopDbUpdate,
    getCongregations,
    db,
    INCOMPATIBILITIES,
    logError,
  } = deps;

  const {
    insertDraftEmailPass,
    insertDraftNameEmail,
    updateDraftNameEmail,
    updateDraftNamePhone,
    updateDraftPersonalInfo,
    updateDraftCongregationInfo,
    updateDraftSpiritualInfo,
    updateDraftNotes,
    emailExists,
    nameExists,
    phoneExists,
    getDraftByEmail,
    markDraftCompleted,
    upgradeDraftEmailPass,
    getVolunteerById,
  } = db;

  const router = express.Router();

  // ------------------------------------------------------------
  // Registration Session Guards
  // ------------------------------------------------------------

  /** Create a new registrationId if missing. */
  function requireRegistration(req, res, next) {
    if (!req.session.registrationId) {
      req.session.registrationId = crypto.randomUUID();
      req.session.disableNameFields = true;
      console.log(
        "[requireRegistration] New registrationId:",
        req.session.registrationId,
      );
    } else {
      console.log(
        "[requireRegistration] Existing registrationId:",
        req.session.registrationId,
      );
    }
    next();
  }

  /** Ensure draft exists, or redirect to start. */
  function requireDraft(req, res) {
    if (!req.session.registrationId) {
      console.warn(
        "[requireDraft] No active registration — redirecting to /email-pass",
      );
      res.redirect("/email-pass");
      return false;
    }

    loadVolunteerCache();
    startDbUpdate(loadVolunteerCache, req.app);
    return true;
  }

  router.use("/volunteerIn", requireRegistration);
  router.use("/congregationInfo", requireRegistration);
  router.use("/submit-nonProfileInfo", requireRegistration);
  router.use("/submit-volunteerInfo", requireRegistration);

  // ------------------------------------------------------------
  // GET routes
  // ------------------------------------------------------------

  router.get("/", csrfProtection, (req, res) => {
    res.render("index", { csrfToken: req.csrfToken() });
  });

  router.get("/email-pass", csrfProtection, (req, res) => {
    const pending = (req.session.emailPassSetup || "").trim().toLowerCase();
    const isUpgrade = !!pending;

    // We deliberately do NOT pass the email to the view for upgrade,
    // to avoid showing it in a visible field. For new signups, the
    // user will type the email directly.
    res.render("emailPass", {
      csrfToken: req.csrfToken(),
      email: "", // keep blank in the UI
      isUpgrade, // let the template adapt text if desired
      error: null,
    });
  });

  router.get("/nonProfile", csrfProtection, (req, res) => {
    console.log("[GET /nonProfile] session:", req.session);
    res.render("nonProfile", { csrfToken: req.csrfToken() });
  });

  router.get("/volunteerIn", csrfProtection, (req, res) => {
    const disableNameFields = req.query.disable === "true";
    req.session.disableNameFields = disableNameFields;

    const hasActiveRegistration = Boolean(req.session.registrationId);

    if (hasActiveRegistration) {
      loadVolunteerCache();
      startDbUpdate(loadVolunteerCache, req.app);
    }

    res.render("volunteerIn", {
      disableNameFields,
      hasActiveRegistration,
      csrfToken: req.csrfToken(),
    });
  });

  router.get("/personalInfo", csrfProtection, (req, res) => {
    if (!requireDraft(req, res)) return;
    res.render("personalInfo", { csrfToken: req.csrfToken() });
  });

  router.get("/congregationInfo", csrfProtection, async (req, res) => {
    if (!requireDraft(req, res)) return;
    const congregations = await getCongregations();
    res.render("congregationInfo", {
      congregations,
      csrfToken: req.csrfToken(),
    });
  });

  router.get("/spiritualInfo", csrfProtection, (req, res) => {
    if (!requireDraft(req, res)) return;
    const regId = req.session.registrationId;
    const volunteer =
      req.app.locals.volunteerCache?.byRegistrationId?.[regId] || null;

    res.render("spiritualInfo", {
      csrfToken: req.csrfToken(),
      privilegeRulesJSON: JSON.stringify(INCOMPATIBILITIES),
      gender: volunteer?.gender || null,
      volunteer,
    });
  });

  router.get("/notes", csrfProtection, (req, res) => {
    if (!requireDraft(req, res)) return;
    res.render("notes", { csrfToken: req.csrfToken() });
  });

  router.get("/volunteerSummary", csrfProtection, async (req, res) => {
    if (!requireDraft(req, res)) return;

    try {
      const registrationId = req.session.registrationId;

      // Try cache first — may be cold on fresh login resume
      let volunteer =
        req.app.locals.volunteerCache?.byRegistrationId?.[registrationId] ||
        null;

      // Cache miss — load directly from DB using userId
      if (!volunteer && req.session.userId) {
        volunteer = await getVolunteerById(req.session.userId);
      }

      if (!volunteer) {
        return res.status(404).render("404", { url: req.originalUrl });
      }

      const congregations = await getCongregations();
      const gender =
        typeof req.session.gender === "string"
          ? req.session.gender
          : volunteer.gender || null;

      res.render("formSummary", {
        volunteer,
        congregations,
        csrfToken: req.csrfToken(),
        privilegeRulesJSON: JSON.stringify(INCOMPATIBILITIES),
        gender,
        disableNameFields: !!req.session.disableNameFields,
      });
    } catch (err) {
      logError("Error rendering /volunteerSummary:", err);
      res.status(500).send("Internal Server Error");
    }
  });

  router.get("/formDone", csrfProtection, (req, res) => {
    if (!requireDraft(req, res)) return;
    res.render("formDone", { csrfToken: req.csrfToken() });
  });

  // ------------------------------------------------------------
  // POST — Non‑Profile Step (firstName + lastName + email)
  // ------------------------------------------------------------

  router.post("/submit-nonProfileInfo", csrfProtection, async (req, res) => {
    try {
      console.log("──────────────────────────────────────────");
      console.log("[POST /submit-nProfileInfo] HIT");
      console.log("[payload]", req.body);
      console.log("[session BEFORE]", req.session);

      const { firstName, lastName, suffix, email } = req.body;

      if (!firstName || !lastName || !email) {
        return res.status(400).json({
          success: false,
          fieldErrors: {
            form: "First name, last name, and email are required.",
          },
        });
      }

      const regId = req.session.registrationId;
      const errors = {};

      if (await emailExists(email, regId)) {
        // Email is taken — check if it belongs to an abandoned draft.
        // If so, issue a confirmation challenge rather than a hard error.
        const existingDraft = await getDraftByEmail(email);
        if (existingDraft) {
          const mask = (str) =>
            str ? str[0] + "*".repeat(Math.max(str.length - 1, 2)) : "";
          const maskedName = [
            mask(existingDraft.firstName),
            existingDraft.suffix ? mask(existingDraft.suffix) : null,
            mask(existingDraft.lastName),
          ]
            .filter(Boolean)
            .join(" ");

          req.session.pendingDraftRecovery = {
            registrationId: existingDraft.registration_id,
            userId: existingDraft.id,
          };

          return res.status(409).json({
            success: false,
            requiresConfirmation: true,
            maskedName,
          });
        }
        errors.email = "This email address is already registered.";
      }

      if (await nameExists(firstName, lastName, suffix, regId)) {
        errors.name = "A volunteer with this name already exists.";
      }

      if (Object.keys(errors).length > 0) {
        console.warn("[submit-nonProfileInfo] duplicate errors:", errors);
        return res.status(409).json({ success: false, fieldErrors: errors });
      }

      // UPDATE existing draft
      console.log("[submit-nonProfileInfo] Attempting updateDraftNameEmail...");
      let row = await updateDraftNameEmail(
        regId,
        firstName,
        lastName,
        suffix,
        email,
      );

      // If no update happened, INSERT new draft
      if (!row) {
        console.log(
          "[submit-nonProfileInfo] No draft updated; inserting draft...",
        );
        row = await insertDraftNameEmail(firstName, lastName, suffix, email);
        if (!row) {
          return res.status(500).json({
            success: false,
            fieldErrors: { form: "Failed to create registration." },
          });
        }
      }

      console.log("[submit-nonProfileInfo] row returned from DB:", row);

      req.session.userId = row.id;
      req.session.registrationId = row.registration_id;
      req.session.disableNameFields = true;

      req.app.locals.volunteerCache = await loadVolunteerCache();
      startDbUpdate(loadVolunteerCache, req.app);

      console.log("[session AFTER]", req.session);
      console.log("[submit-nonProfileInfo] SUCCESS (200)");
      console.log("──────────────────────────────────────────");

      return res.status(200).json({
        success: true,
        disableNameFields: true,
        hasActiveRegistration: true,
      });
    } catch (err) {
      console.error("submit-nonProfileInfo error:", err);
      return res.status(500).json({
        success: false,
        fieldErrors: { form: "Registration failed due to a server error." },
      });
    }
  });

  // ------------------------------------------------------------
  // POST — Volunteer Contact (phone)
  // ------------------------------------------------------------

  router.post("/submit-volunteerInfo", csrfProtection, async (req, res) => {
    try {
      console.log("──────────────────────────────────────────");
      console.log("[POST /submit-volunteerInfo] HIT");
      console.log("[payload]", req.body);
      console.log("[session BEFORE]", req.session);

      const { firstName, lastName, suffix, phone, SMSCapable, whatsappid } =
        req.body;
      const namesEditable = !req.session.disableNameFields;
      const regId = req.session.registrationId;

      if ((namesEditable && (!firstName || !lastName)) || !phone) {
        return res.status(400).json({
          success: false,
          fieldErrors: {
            form: "First name, last name, and phone are required.",
          },
        });
      }

      if (!regId) {
        console.error(
          "[submit-volunteerInfo] No active registration — session expired.",
        );
        return res.status(400).json({
          success: false,
          fieldErrors: { form: "No active registration. Please start again." },
        });
      }

      const errors = {};

      if (namesEditable) {
        if (await nameExists(firstName, lastName, suffix, regId)) {
          errors.name = "A volunteer with this name already exists.";
        }
      }

      if (await phoneExists(phone, regId)) {
        errors.phone = "This phone number is already registered.";
      }

      if (Object.keys(errors).length > 0) {
        console.warn("[submit-volunteerInfo] duplicate errors:", errors);
        return res.status(409).json({ success: false, fieldErrors: errors });
      }

      console.log("[submit-volunteerInfo] Performing updateDraftNamePhone...");
      const row = await updateDraftNamePhone(
        regId,
        namesEditable ? firstName : null,
        namesEditable ? lastName : null,
        namesEditable ? suffix : null,
        phone,
        SMSCapable,
        whatsappid,
      );

      if (!row) {
        console.error(
          "[submit-volunteerInfo] updateDraftNamePhone returned null",
        );
        return res.status(400).json({
          success: false,
          fieldErrors: {
            form: "Invalid or expired registration. Please restart.",
          },
        });
      }

      req.app.locals.volunteerCache = await loadVolunteerCache();

      console.log("[session AFTER]", req.session);
      console.log("[submit-volunteerInfo] SUCCESS");
      console.log("──────────────────────────────────────────");

      return res.json({ success: true });
    } catch (err) {
      console.error("submit-volunteerInfo error:", err);
      return res.status(500).json({
        success: false,
        fieldErrors: { form: "Failed to update phone information." },
      });
    }
  });

  // ------------------------------------------------------------
  // POST — Personal Info
  // ------------------------------------------------------------

  router.post("/submit-personalInfo", csrfProtection, async (req, res) => {
    try {
      const regId = req.session.registrationId;
      if (!regId) return res.redirect("/email-pass");

      const { genderRaw, dobirthRaw, staminaRaw } = req.body;

      const gender = genderRaw?.trim().toLowerCase() || null;

      let dobirth = null;
      if (dobirthRaw) {
        const parsed = new Date(dobirthRaw);
        if (isNaN(parsed.valueOf())) {
          return res.status(400).send("Invalid date of birth.");
        }
        dobirth = parsed;
      }

      let stamina = null;
      if (typeof staminaRaw === "string") {
        const num = parseInt(staminaRaw.split("-")[0].trim(), 10);
        if (!isNaN(num)) stamina = num;
      }

      await updateDraftPersonalInfo(regId, { gender, dobirth, stamina });

      req.app.locals.volunteerCache = await loadVolunteerCache();
      req.session.gender = gender;

      return res.redirect("/congregationInfo");
    } catch (err) {
      console.error("submit-personalInfo error:", err);
      return res.status(500).send("Server error.");
    }
  });

  // ------------------------------------------------------------
  // POST — Congregation Info
  // ------------------------------------------------------------

  router.post("/submitCongregation", csrfProtection, async (req, res) => {
    try {
      const regId = req.session.registrationId;
      if (!regId) return res.redirect("/email-pass");

      const {
        congAssigned,
        congregation,
        congregationOtherCity,
        congregationOtherState,
        congregationOtherLang,
        extraAttend,
      } = req.body;

      const assignedToConv = String(congAssigned).toLowerCase() === "yes";
      const attendExtra = String(extraAttend).toLowerCase() === "yes";

      let congregationValue = null;

      if (assignedToConv) {
        // 🔒 Normalize and validate congregation from dropdown
        const congregationTrimmed = (congregation || "").trim();

        // Block empty or whitespace-only values
        if (!congregationTrimmed) {
          return res.status(400).send("Congregation selection is required.");
          // (Optional: instead of .send, you could re-render the form with an error)
        }

        congregationValue = congregationTrimmed;
      } else {
        // Visiting congregation path
        const city = (congregationOtherCity || "").trim();
        const state = (congregationOtherState || "").trim().toUpperCase();
        const lang = (congregationOtherLang || "").trim().toUpperCase();

        if (!city || !state || !lang) {
          return res
            .status(400)
            .send("Visiting congregation details are required.");
        }

        congregationValue = `${city}, ${state} - ${lang}`;
      }

      await updateDraftCongregationInfo(regId, {
        assignedToConv,
        congregation: congregationValue,
        attendExtra,
      });

      req.app.locals.volunteerCache = await loadVolunteerCache();

      return res.redirect("/spiritualInfo");
    } catch (err) {
      console.error("submit-congregationInfo error:", err);
      return res.status(500).send("Failed to save congregation information.");
    }
  });

  // ------------------------------------------------------------
  // POST — Spiritual Info
  // ------------------------------------------------------------

  router.post("/submitSpiritual", csrfProtection, async (req, res) => {
    try {
      const regId = req.session.registrationId;
      if (!regId) return res.redirect("/email-pass");

      const { privileges } = req.body;
      const privilegeList = Array.isArray(privileges)
        ? privileges
        : privileges
          ? [privileges]
          : [];

      await updateDraftSpiritualInfo(regId, privilegeList);

      req.app.locals.volunteerCache = await loadVolunteerCache();

      return res.redirect("/notes");
    } catch (err) {
      console.error("submitSpiritual error:", err);
      return res.status(500).send("Failed to save spiritual information.");
    }
  });

  // ------------------------------------------------------------
  // POST — Notes
  // ------------------------------------------------------------

  router.post("/submitNotes", csrfProtection, async (req, res) => {
    try {
      const regId = req.session.registrationId;
      if (!regId) return res.redirect("/email-pass");

      const notes = (req.body.notes || "").trim();
      await updateDraftNotes(regId, notes);

      req.app.locals.volunteerCache = await loadVolunteerCache();

      return res.redirect("/volunteerSummary");
    } catch (err) {
      console.error("submitNotes error:", err);
      return res.status(500).send("Failed to save extra notes.");
    }
  });

  // ------------------------------------------------------------
  // POST — Final Submission
  // ------------------------------------------------------------

  router.post("/submitSummary", csrfProtection, async (req, res) => {
    const regId = req.session.registrationId;
    const isJson = req.is("application/json");

    try {
      if (!regId) {
        if (isJson) {
          return res.status(400).json({
            success: false,
            message: "No active registration. Please start again.",
          });
        }
        return res.redirect("/email-pass");
      }

      const ok = await markDraftCompleted(regId);
      if (!ok) {
        if (isJson) {
          return res.status(400).json({
            success: false,
            message:
              "Your registration could not be finalized. Please restart the process.",
          });
        }
        return res
          .status(400)
          .send("Your registration could not be finalized. Please restart.");
      }

      // Stop background DB updater for this app instance
      stopDbUpdate();

      // Destroy session, then respond appropriately
      req.session.destroy((err) => {
        if (err) {
          console.error("Error destroying session after summary:", err);
        }

        if (isJson) {
          // ✅ JSON response for modal+toast+client redirect
          return res.json({
            success: true,
            redirectUrl: "/", // client JS will redirect here after 5 seconds
          });
        }

        // ✅ Non-JS fallback: redirect to "formDone" page
        return res.redirect("/formDone");
      });
    } catch (err) {
      console.error("submitSummary error:", err);

      if (isJson) {
        return res.status(500).json({
          success: false,
          message: "Failed to finalize registration due to a server error.",
        });
      }

      return res.status(500).send("Failed to finalize registration.");
    }
  });

  // ------------------------------------------------------------
  // POST — EmailPass (registered users)
  // ------------------------------------------------------------

  router.post("/submit-emailPass", csrfProtection, async (req, res) => {
    const sessionEmail = (req.session.emailPassSetup || "")
      .trim()
      .toLowerCase();
    const formEmail = (req.body.email || "").trim().toLowerCase();
    const { password } = req.body || {};
    const rawPassword = password || "";

    // In upgrade flow, session email is authoritative. Otherwise use form email.
    const effectiveEmail = sessionEmail || formEmail;
    const isUpgrade = !!sessionEmail;

    if (!effectiveEmail || !rawPassword) {
      return res.status(400).render("emailPass", {
        csrfToken: req.csrfToken(),
        email: "",
        isUpgrade,
        error: "Email and password are required.",
      });
    }

    try {
      let row;

      if (isUpgrade) {
        // UPGRADE: update existing volunteer_in row
        row = await upgradeDraftEmailPass(effectiveEmail, rawPassword);

        if (!row) {
          console.error(
            "submit-emailPass upgrade: row not found or update failed",
          );
          return res.status(500).render("emailPass", {
            csrfToken: req.csrfToken(),
            email: "",
            isUpgrade,
            error: "Failed to upgrade registration. Please try again.",
          });
        }

        // Clear the upgrade flag
        req.session.emailPassSetup = null;
      } else {
        // REPLACE WITH:
        // NEW SIGNUP: pre-check for duplicate before inserting.
        // Exclude draft-status rows so a user who started registration
        // but abandoned it can retry with the same email.
        if (await emailExists(effectiveEmail, null, true)) {
          return res.status(409).render("emailPass", {
            csrfToken: req.csrfToken(),
            email: "",
            isUpgrade: false,
            error: "This email is already registered. Try logging in instead.",
          });
        }

        // Check for an abandoned non-registered draft with this email.
        // Redirect back to the form with a pending flag so emailPass.js
        // can show the identity confirmation modal.
        const existingDraft = await getDraftByEmail(effectiveEmail);
        if (existingDraft) {
          const mask = (str) =>
            str ? str[0] + "*".repeat(Math.max(str.length - 1, 2)) : "";
          const maskedName = [
            mask(existingDraft.firstName),
            existingDraft.suffix ? mask(existingDraft.suffix) : null,
            mask(existingDraft.lastName),
          ]
            .filter(Boolean)
            .join(" ");

          req.session.pendingEmailPassRecovery = {
            registrationId: existingDraft.registration_id,
            userId: existingDraft.id,
            email: effectiveEmail,
          };

          return res.redirect(
            `/email-pass?pending=1&maskedName=${encodeURIComponent(maskedName)}`,
          );
        }

        row = await insertDraftEmailPass(effectiveEmail, rawPassword);

        if (!row) {
          return res.status(500).render("emailPass", {
            csrfToken: req.csrfToken(),
            email: "",
            isUpgrade: false,
            error: "Failed to create registration. Please try again.",
          });
        }
      }

      // Shared session setup for both new signups and upgrades
      req.session.userId = row.id;
      req.session.registrationId = row.registration_id;
      req.session.formCache = { email: effectiveEmail };

      return res.redirect("/volunteerIn");
    } catch (err) {
      // SQL unique constraint violation — email registered between check and insert
      if (err?.number === 2627 || err?.number === 2601) {
        return res.status(409).render("emailPass", {
          csrfToken: req.csrfToken(),
          email: "",
          isUpgrade,
          error: "This email is already registered. Try logging in instead.",
        });
      }

      console.error("submit-emailPass error:", err);
      return res.status(500).render("emailPass", {
        csrfToken: req.csrfToken(),
        email: "",
        isUpgrade,
        error: "Something went wrong. Please try again.",
      });
    }
  });

  /**
   * POST /confirm-draft-recovery
   * Called when the user confirms "yes, that's me" on the identity modal.
   * Promotes the pending draft recovery into the active session.
   */
  /**
   * POST /confirm-emailpass-recovery
   * Called when the user confirms identity on the emailPass confirmation modal.
   * Converts the pending non-registered draft to a registered draft using
   * the supplied password, then sets up the session.
   */
  router.post("/confirm-emailpass-recovery", csrfProtection, async (req, res) => {
    const pending = req.session.pendingEmailPassRecovery;
    if (!pending) {
      return res.status(400).json({ success: false, error: "No pending recovery." });
    }

    const { password, continueAsStandard } = req.body || {};

    // User chose to continue their existing standard account without upgrading.
    if (continueAsStandard) {
      req.session.registrationId = pending.registrationId;
      req.session.userId = pending.userId;
      req.session.disableNameFields = true;
      req.session.pendingEmailPassRecovery = null;
      return res.json({ success: true });
    }

    if (!password) {
      return res.status(400).json({ success: false, error: "Password is required." });
    }

    const row = await insertDraftEmailPass(pending.email, password);
    if (!row) {
      return res.status(500).json({ success: false, error: "Failed to convert profile. Please try again." });
    }

    req.session.userId = row.id;
    req.session.registrationId = row.registration_id;
    req.session.formCache = { email: pending.email };
    req.session.pendingEmailPassRecovery = null;

    return res.json({ success: true });
  });

  router.post("/confirm-draft-recovery", csrfProtection, (req, res) => {
    const pending = req.session.pendingDraftRecovery;
    if (!pending) {
      return res
        .status(400)
        .json({ success: false, error: "No pending recovery." });
    }

    req.session.registrationId = pending.registrationId;
    req.session.userId = pending.userId;
    req.session.disableNameFields = true;
    req.session.pendingDraftRecovery = null;

    return res.json({ success: true });
  });
  /**
   * GET /create-profile
   * Landing page where volunteers choose between a Standard or Enhanced account.
   * No authentication required.
   */
  router.get("/create-profile", (req, res) => {
    res.render("registration/createProfileLaunch");
  });

  return router;
}