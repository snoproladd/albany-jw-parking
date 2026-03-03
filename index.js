// =========================
// index.js - Main Server
// =========================
/**
 * ============================================================
 * REGISTRATION FLOW CONTRACT (AUTHORITATIVE)
 * ============================================================
 *
 * The volunteer registration lifecycle is DRAFT‑BASED.
 * Each step OWNS specific fields and MUST NOT overwrite
 * fields owned by earlier steps unless explicitly allowed.
 *
 * ------------------------------------------------------------
 * STEP 1: /submit-emailPass
 * ------------------------------------------------------------
 * Creates draft with:
 *   - email
 *   - passwordHash / auth fields
 *   - accountType = 'registered'
 *
 * ------------------------------------------------------------
 * STEP 1b: /submit-nonProfileInfo
 * ------------------------------------------------------------
 * Creates or updates draft with:
 *   - firstName
 *   - lastName
 *   - suffix
 *   - email
 *   - accountType = 'non-registered'
 *
 * After this step:
 *   - name fields are LOCKED (disableNameFields = true)
 *
 * ------------------------------------------------------------
 * STEP 2: /submit-volunteerInfo
 * ------------------------------------------------------------
 * Updates:
 *   - phone
 *   - smsCapable
 *
 * Conditionally updates names ONLY if name fields are editable.
 * Must NOT overwrite names for non‑profile flow.
 *
 * ------------------------------------------------------------
 * STEP 3: /submit-personalInfo
 * ------------------------------------------------------------
 * Updates:
 *   - gender
 *   - dateOfBirth
 *   - stamina
 *
 * ------------------------------------------------------------
 * STEP 4: /submit-congregation
 * ------------------------------------------------------------
 * Updates:
 *   - congregation assignment
 *   - visiting congregation details
 *
 * ------------------------------------------------------------
 * STEP 5: /submitSpiritual
 * ------------------------------------------------------------
 * Updates:
 *   - privilege flags
 *
 * ------------------------------------------------------------
 * STEP 6: /submitNotes
 * ------------------------------------------------------------
 * Updates:
 *   - notes
 *
 * ------------------------------------------------------------
 * DUPLICATE RULES (SUBMIT‑TIME ONLY)
 * ------------------------------------------------------------
 * - Email must be unique
 * - (firstName + lastName + suffix) must be unique
 * - Phone number must be unique
 *
 * Duplicate checks MUST:
 *   - be server‑side
 *   - self‑exclude by registrationId
 *   - return field‑specific errors
 *
 * ============================================================
 */

import http from "http";
import express from "express";
import path, { dirname } from "path";
import helmet from "helmet";
import { fileURLToPath } from "url";
import crypto from "crypto";
import cookieParser from "cookie-parser";
import session from "express-session";
import csurf from "csurf";

import { getConfig, getSqlPool } from "./src/config/azureConfig.js";
import { getCongregations } from "./lib/dbSync.js";
import { INCOMPATIBILITIES } from "./src/config/privilegeRules.js";

const config = await getConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const isProd = config.NODE_ENV === "production";
const PORT = process.env.PORT || config.PORT || (isProd ? 80 : 3000);
const HOST = "0.0.0.0";

// ============================================================
// Logging
// ============================================================
function log(...args) {
  console.log(`[${new Date().toISOString()}] [index.js]`, ...args);
}

function logError(...args) {
  console.error(`[${new Date().toISOString()}] [index.js]`, ...args);
}

// ============================================================
// Crypto Polyfill
// ============================================================
if (typeof globalThis.crypto === "undefined") {
  import("crypto")
    .then(({ webcrypto, default: cjsCrypto }) => {
      globalThis.crypto = webcrypto ?? cjsCrypto;
    })
    .catch(err => logError("Failed to load crypto:", err));
}

// ============================================================
// Twilio
// ============================================================
let twClient;

async function initTwilio() {
  if (!twClient) {
    const mod = await import("twilio");
    const twRoot = mod.default ?? mod;
    twClient = twRoot(
      config.TWILIO_ACCOUNT_SID,
      config.TWILIO_AUTH_TOKEN
    );
  }
  return twClient;
}

// ============================================================
// Kickbox
// ============================================================
async function verifyEmail(email, { timeoutMs = 8000 } = {}) {
  if (!config.KICKBOX_API_KEY) {
    throw new Error("KICKBOX_API_KEY missing");
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = new URL("https://api.kickbox.com/v2/verify");
    url.searchParams.set("email", email);
    url.searchParams.set("apikey", config.KICKBOX_API_KEY);

    const resp = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new Error(`Kickbox API error ${resp.status}`);
    }

    return await resp.json();
  } finally {
    clearTimeout(t);
  }
}

// ============================================================
// Volunteer Cache Lifecycle
// ============================================================
let dbUpdateInterval = null;

function startDbUpdate(loadVolunteerCacheFn, appInstance) {
  if (!dbUpdateInterval) {
    dbUpdateInterval = setInterval(async () => {
      try {
        appInstance.locals.volunteerCache =
          await loadVolunteerCacheFn();
      } catch (err) {
        logError("Cache refresh failed:", err);
      }
    }, 30_000);
  }
}

function stopDbUpdate() {
  if (dbUpdateInterval) {
    clearInterval(dbUpdateInterval);
    dbUpdateInterval = null;
  }
}


// ============================================================
// Express Middleware
// ============================================================
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ============================================================
// Server + Shutdown
// ============================================================
const server = http.createServer(app);

function shutdown() {
  stopDbUpdate();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ============================================================
// Startup (SINGLE SCOPE)
// ============================================================
(async () => {
  try {
    const dbRoutes = (await import("./routes/apiRoutes.js")).default;
    const {
      insertDraftEmailPass,
      insertDraftNameEmail,
      updateDraftNameEmail,
      updateDraftNamePhone,
      updateDraftPersonalInfo,
      updateDraftCongregationInfo,
      updateDraftSpiritualInfo,
      loadVolunteerCache,
      updateDraftNotes,
      emailExists,
      nameExists,
      phoneExists
    } = await import("./lib/dbSync.js");

    await getSqlPool();

    app.use(
      session({
        secret: config.sessionSecret || "fallback",
        resave: false,
        saveUninitialized: false,
        cookie: {
          secure: isProd,
          httpOnly: true,
          sameSite: "lax",
          maxAge: 5 * 60 * 1000,
        },
      })
    );

    const csrfProtection = csurf({ cookie: true });

    app.use((req, res, next) => {
      res.locals.nonce = crypto.randomBytes(16).toString("base64");
      next();
    });

    app.use(
      helmet.contentSecurityPolicy({
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "script-src": [
            "'self'",
            "https://cdn.jsdelivr.net",
            (req, res) => `'nonce-${res.locals.nonce}'`,
          ],
          "style-src": [
            "'self'",
            "https://cdn.jsdelivr.net",
            "https://fonts.googleapis.com",
            (req, res) => `'nonce-${res.locals.nonce}'`,
          ],
          "img-src": ["'self'", "data:"],
          "font-src": ["'self'", "https://fonts.gstatic.com"],
          "connect-src": isProd
            ? ["'self'", "https:", "https://api.kickbox.com","https://cdn.jsdelivr.net"]
            : ["'self'", "http://localhost:3000", "https://api.kickbox.com","https://cdn.jsdelivr.net"],
        },
      })
    );

  function requireRegistration(req, res, next) {
  if (!req.session.registrationId) {
    // Create new one for guest or expired flow
    req.session.registrationId = crypto.randomUUID();
    req.session.disableNameFields = true; // Guest path only
  }
  next();
  }
  app.use("/volunteerIn", requireRegistration);
  app.use("/congregationInfo", requireRegistration);
  app.use("/submit-nonProfileInfo", requireRegistration);
  app.use("/submit-volunteerInfo", requireRegistration);
  function requireDraft(req, res) {
    if (!req.session.registrationId) {
      res.redirect("/email-pass");
      return false;
    }
    loadVolunteerCache();
    startDbUpdate(loadVolunteerCache, app);
    return true;
  }

    // ========================================================
    // API Routes
    // ========================================================
    app.use("/api", dbRoutes);

    // ========================================================
    // GET Routes
    // ========================================================
    app.get("/health", (req, res) => res.send("OK"));

    app.get("/", csrfProtection, (req, res) =>
      res.render("index", { csrfToken: req.csrfToken() })
    );

    app.get("/email-pass", csrfProtection, (req, res) =>
      res.render("emailPass", { csrfToken: req.csrfToken() })
    );

    app.get("/nonProfile", csrfProtection, (req, res) =>
      res.render("nonProfile", { csrfToken: req.csrfToken() })
    );

    app.get("/congregationInfo", csrfProtection, async (req, res) => {
      if (!requireDraft(req, res)) return;
      const congregations = await getCongregations();
      res.render("congregationInfo", {
        congregations,
        csrfToken: req.csrfToken()
      });
    });

    app.get("/spiritualInfo", csrfProtection, (req, res) => {
      if (!requireDraft(req, res)) return;
      const regId = req.session.registrationId;
      const volunteer = app.locals.volunteerCache?.byRegistrationId?.[regId] || null;
      res.render("spiritualInfo", {
        csrfToken: req.csrfToken(),
        privilegeRulesJSON: JSON.stringify(INCOMPATIBILITIES),
        gender: volunteer?.gender || null,
      });
    });

    app.get("/volunteerIn", csrfProtection, (req, res) => {
      // Option A logic: name editability determined by query param
      const disableNameFields = req.query.disable === "true";

      // Save this for the POST route
      req.session.disableNameFields = disableNameFields;

      const hasActiveRegistration = Boolean(req.session.registrationId);

      if (hasActiveRegistration) {
        loadVolunteerCache();
        startDbUpdate(loadVolunteerCache, app);
      }

      res.render("volunteerIn", {
        disableNameFields,
        hasActiveRegistration,
        csrfToken: req.csrfToken(),
      });
    });

    app.get("/personalInfo", csrfProtection, (req, res) => {
      if (!requireDraft(req, res)) return;
      res.render("personalInfo", { csrfToken: req.csrfToken() });
    });

    app.get("/notes", csrfProtection, (req, res) => {
      if (!requireDraft(req, res)) return;
      res.render("notes", { csrfToken: req.csrfToken() });
    });

    app.get("/volunteerSummary", csrfProtection, (req, res) => {
      if (!requireDraft(req, res)) return;
      res.render("volunteerSummary", { csrfToken: req.csrfToken() });
    });

    app.get("/formDone", csrfProtection, (req, res) => {
      if (!requireDraft(req, res)) return;
      res.render("formDone", { csrfToken: req.csrfToken() });
    });

    // ========================================================
    // POST Routes
    // ========================================================
    
app.post("/submit-nonProfileInfo", csrfProtection, async (req, res) => {
  try {
    const { firstName, lastName, suffix, email } = req.body;

    // ------------------------------------------------------------
    // Basic required-field validation
    // ------------------------------------------------------------
    if (!firstName || !lastName || !email) {
      return res.status(400).json({
        success: false,
        fieldErrors: {
          form: "First name, last name, and email are required."
        }
      });
    }

    const registrationId = req.session.registrationId || null;
    const errors = {};

    // ------------------------------------------------------------
    // Duplicate detection (submit-time only, self-excluding)
    // ------------------------------------------------------------
    if (await emailExists(email, registrationId)) {
      errors.email = "This email address is already registered.";
    }

    if (await nameExists(firstName, lastName, suffix, registrationId)) {
      errors.name = "A volunteer with this name already exists.";
    }

    if (Object.keys(errors).length > 0) {
      return res.status(409).json({
        success: false,
        fieldErrors: errors
      });
    }

    // ------------------------------------------------------------
    // Create or update draft (SAFE, guest-compatible)
    // ------------------------------------------------------------
    let row = null;

    if (registrationId) {
      // Try updating existing draft
      row = await updateDraftNameEmail(
        registrationId,
        firstName,
        lastName,
        suffix,
        email
      );

      // ❗ Critical fix: If no row exists for this ID → stale session
      if (!row) {
        return res.status(400).json({
          success: false,
          fieldErrors: {
            form: "Your session expired. Please restart the registration."
          }
        });
      }
    } else {
      // Create new draft (first-time non-profile entry)
      row = await insertDraftNameEmail(
        firstName,
        lastName,
        suffix,
        email
      );

      if (!row) {
        return res.status(500).json({
          success: false,
          fieldErrors: {
            form: "Failed to create registration."
          }
        });
      }

      req.session.userId = row.id;
      req.session.registrationId = row.registration_id;
    }

    // ------------------------------------------------------------
    // Lock name fields for later steps
    // ------------------------------------------------------------
    req.session.disableNameFields = true;

    // ------------------------------------------------------------
    // Render next page: /volunteerIn (Option A rules apply)
    // ------------------------------------------------------------
    loadVolunteerCache();
    startDbUpdate(loadVolunteerCache, app);

    return res.render("volunteerIn", {
      disableNameFields: true,       // Option A - name fields locked AFTER nonProfile
      hasActiveRegistration: true,
      csrfToken: req.csrfToken(),
    });

  } catch (err) {
    console.error("submit-nonProfileInfo error:", err);
    return res.status(500).json({
      success: false,
      fieldErrors: {
        form: "Registration failed due to a server error."
      }
    });
  }
});

app.post("/submitNotes", csrfProtection, async (req, res) => {
  try {
    const registrationId = req.session.registrationId;
    if (!registrationId) {
      return res.redirect("/email-pass");
    }

    const notes = (req.body.notes || "").trim();
    await updateDraftNotes(registrationId, notes);

    return res.redirect("/volunteerSummary");
  } catch (err) {
    console.error("submitNotes error:", err);
    return res.status(500).send("Failed to save extra notes.");
  }
});


    app.post("/submitCongregation", csrfProtection, async (req, res) => {
      try {
        const registrationId = req.session.registrationId;
        if (!registrationId) {
          return res.redirect("/email-pass");
        }

        const {
          congAssigned,
          congregation,
          congregationOtherCity,
          congregationOtherState,
          congregationOtherLang,
          extraAttend
        } = req.body;

        const assignedToConv = String(congAssigned).toLowerCase() === "yes";
        const attendExtra = String(extraAttend).toLowerCase() === "yes";

        let congregationValue = null;

        if (assignedToConv) {
          if (!congregation) {
            return res.status(400).send("Congregation selection is required.");
          }
          congregationValue = congregation;
        } else {
          const city = (congregationOtherCity || "").trim();
          const state = (congregationOtherState || "").trim().toUpperCase();
          const lang = (congregationOtherLang || "").trim().toUpperCase();

          if (!city || !state || !lang) {
            return res.status(400).send("Visiting congregation details are required.");
          }

          congregationValue = `${city}, ${state} - ${lang}`;
        }

        await updateDraftCongregationInfo(registrationId, {
          assignedToConv,
          congregation: congregationValue,
          attendExtra
        });

        return res.redirect("/spiritualInfo");
      } catch (err) {
        console.error("submit-congregationInfo error:", err);
        return res.status(500).send("Failed to save congregation information.");
      }
    });

    app.post("/submitSpiritual", csrfProtection, async (req, res) => {
      try {
        const registrationId = req.session.registrationId;
        if (!registrationId) {
          return res.redirect("/email-pass");
        }

        const { privileges } = req.body;

        const privilegeList = Array.isArray(privileges)
          ? privileges
          : privileges
            ? [privileges]
            : [];

        await updateDraftSpiritualInfo(registrationId, privilegeList);

        return res.redirect("/notes");
      } catch (err) {
        console.error("submitSpiritualInfo error:", err);
        return res.status(500).send("Failed to save spiritual information.");
      }
    });

app.post("/submit-volunteerInfo", csrfProtection, async (req, res) => {
  try {
    const { firstName, lastName, suffix, phone, SMSCapable } = req.body;

    // Option A: editability determined by GET /volunteerIn
    const namesEditable = !req.session.disableNameFields;
    const registrationId = req.session.registrationId;

    // ------------------------------------------------------------
    // Required-field validation
    // ------------------------------------------------------------
    if ((namesEditable && (!firstName || !lastName)) || !phone) {
      return res.status(400).json({
        success: false,
        fieldErrors: {
          form: "First name, last name, and phone are required."
        }
      });
    }

    if (!registrationId) {
      return res.status(400).json({
        success: false,
        fieldErrors: {
          form: "No active registration. Please start again."
        }
      });
    }

    // ------------------------------------------------------------
    // Duplicate detection (submit-time only, self-excluding)
    // ------------------------------------------------------------
    const errors = {};

    if (namesEditable) {
      if (await nameExists(firstName, lastName, suffix, registrationId)) {
        errors.name = "A volunteer with this name already exists.";
      }
    }

    if (await phoneExists(phone, registrationId)) {
      errors.phone = "This phone number is already registered.";
    }

    if (Object.keys(errors).length > 0) {
      return res.status(409).json({
        success: false,
        fieldErrors: errors
      });
    }

    // ------------------------------------------------------------
    // Persist data (Option A logic)
    // ------------------------------------------------------------
    const row = await updateDraftNamePhone(
      registrationId,
      namesEditable ? firstName : null,
      namesEditable ? lastName : null,
      namesEditable ? suffix : null,
      phone,
      SMSCapable
    );

    if (!row) {
      return res.status(400).json({
        success: false,
        fieldErrors: {
          form: "Invalid or expired registration. Please restart."
        }
      });
    }

    // Success
    return res.json({ success: true });

  } catch (err) {
    console.error("submit-volunteerInfo error:", err);
    return res.status(500).json({
      success: false,
      fieldErrors: {
        form: "Failed to update phone information."
      }
    });
  }
});
app.post("/submit-personalInfo", csrfProtection, async (req, res) => {
  try {
    const registrationId = req.session.registrationId;
    if (!registrationId) {
      return res.redirect("/email-pass");
    }

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

    await updateDraftPersonalInfo(registrationId, {
      gender,
      dobirth: dobirth,
      stamina
    });

    req.session.gender = gender;

    return res.redirect("/congregationInfo");
  } catch (err) {
    console.error("submit-personalInfo error:", err);
    return res.status(500).send("Server error.");
  }
});
app.post("/submit-emailPass", csrfProtection, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).send("Email and password are required.");
  }

  try {
    const row = await insertDraftEmailPass(email, password);
    if (!row) {
      return res.status(500).send("Failed to create registration.");
    }

    req.session.userId = row.id;
    req.session.registrationId = row.registration_id;
    req.session.formCache = { email };

    return res.redirect("/volunteerIn");
  } catch (err) {
    console.error("submit-emailPass error:", err);
    return res.status(500).send("Registration failed.");
  }
});

    // ========================================================
    // Validation Endpoints
    // ========================================================
    app.get("/validate-phone", async (req, res) => {
      try {
        const raw = (req.query.phone || "").toString();
        const digits = raw.replace(/\D+/g, "");
        if (!digits) {
          return res.status(400).json({ error: "Phone number required" });
        }

        const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
        const tw = await initTwilio();
        const lookup = await tw.lookups.v2.phoneNumbers(e164).fetch({
          type: ["carrier"],
        });

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

    app.get("/validate-email", async (req, res) => {
      const email = (req.query.email || "").toString().trim();
      if (!email) {
        return res.status(400).json({
          valid: false,
          reason: "Please enter an email address"
        });
      }
      if (email.toLowerCase().endsWith("@jwpub.org")) {
        return res.json({
          result: "invalid",
          reason: "Domain not allowed"
        });
      }
      try {
        const result = await verifyEmail(email);
        res.json({
          result: result.result,
          reason: result.reason
        });
      } catch (err) {
        logError("Kickbox verification error:", err);
        res.status(500).json({ error: "Verification failed" });
      }
    });

    // ========================================================
    // 404
    // ========================================================
    app.use((req, res) => {
      res.status(404);
      res.render("404", { url: req.originalUrl });
    });

    // ========================================================
    // Start Server
    // ========================================================
    server.listen(PORT, HOST, () =>
      log(`✅ Server running on http://${HOST}:${PORT}`)
    );

    await initTwilio();

  } catch (err) {
    logError("❌ Failed to start server:", err);
    process.exit(1);
  }
})();
