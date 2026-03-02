// =========================
// index.js - Main Server
// Purpose:
//   - Boots Express with security, sessions, and CSP
//   - Wires all page routes (GET/POST) and validation endpoints
//   - Integrates Twilio (phone validation) and Kickbox (email verification)
//   - Connects to Azure SQL via config helpers
//   - Manages an in-memory volunteer cache with periodic refresh
//
// Works With:
//   - ./src/config/azureConfig.js  → getConfig(), getSqlPool(), etc.
//   - ./lib/dbSync.js             → DB CRUD helpers and cache loaders
//   - ./routes/apiRoutes.js       → Additional API routes mounted at /api
//   - /views/*.ejs                → Server-rendered pages
//   - /public/*                   → Static assets and client-side JS
// =========================

//#region Imports & Core Setup
import http from 'http';
import express from 'express';
import path, { dirname } from 'path';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import csurf from 'csurf';

import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

import { getConfig, getSqlPool } from './src/config/azureConfig.js';
import { getCongregations } from './lib/dbSync.js';
// import apiRoutes from './routes/apiRoutes.js';

import { INCOMPATIBILITIES } from './src/config/privilegeRules.js';

const config = await getConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

const isProd = config.NODE_ENV === 'production';
const PORT = process.env.PORT || config.PORT || (isProd ? 80 : 3000);
const HOST = '0.0.0.0';
//#endregion

//#region Logging Utilities
/**
 * Log helper for normal application messages.
 * @param {...any} args - Values to log.
 */
function log(...args) {
  console.log(`[${new Date().toISOString()}] [index.js]`, ...args);
}

/**
 * Log helper for error messages.
 * @param {...any} args - Error details to log.
 */
function logError(...args) {
  console.error(`[${new Date().toISOString()}] [index.js]`, ...args);
}
//#endregion

//#region Crypto (Node Global Polyfill)
/**
 * Ensure `globalThis.crypto` is available in Node.js environment.
 * Fallbacks to Node's `crypto` or `webcrypto` implementation if needed.
 */
if (typeof globalThis.crypto === 'undefined') {
  import('crypto')
    .then(({ webcrypto, default: cjsCrypto }) => {
      globalThis.crypto = webcrypto ?? cjsCrypto;
    })
    .catch(err => logError('Failed to load Node crypto:', err));
}
//#endregion

//#region Azure Key Vault Setup
/**
 * Azure Key Vault client for retrieving secrets.
 * Vault used: ApiStorage
 */
const vaultName = 'ApiStorage';
const vaultUrl = `https://${vaultName}.vault.azure.net`;
const credential = new DefaultAzureCredential();
// (Currently not used directly here, but likely used in getConfig / elsewhere.)
//#endregion

//#region Twilio Initialization
let twClient;

/**
 * Lazily initialize and return a Twilio REST client instance.
 * Uses TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN from config.
 * @returns {Promise<any>} Twilio client instance.
 */
async function initTwilio() {
  if (!twClient) {
    log('Initializing Twilio...');
    const mod = await import('twilio');
    const twRoot = mod.default ?? mod;
    twClient = twRoot(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
    log('Twilio client initialized.');
  }
  return twClient;
}
//#endregion

//#region Email Verification (Kickbox)
/**
 * Verify an email address using the Kickbox API.
 *
 * @param {string} email - The email address to verify.
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=8000] - Request timeout in milliseconds.
 * @returns {Promise<Object>} Kickbox verification response.
 * @throws {Error} When API key is missing, request fails, or times out.
 */
async function verifyEmail(email, { timeoutMs = 8000 } = {}) {
  if (!config.KICKBOX_API_KEY) {
    throw new Error('KICKBOX_API_KEY missing');
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = new URL('https://api.kickbox.com/v2/verify');
    url.searchParams.set('email', email);
    url.searchParams.set('apikey', config.KICKBOX_API_KEY);

    const resp = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new Error(`Kickbox API error ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json();
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Kickbox API request timed out');
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}
//#endregion

//#region Volunteer Cache & DB Interval
let dbUpdateInterval = null;

/**
 * Start periodic database-backed volunteer cache updates.
 *
 * @param {Function} loadVolunteerCacheFn - Function that loads the volunteer cache from DB.
 * @param {import('express').Express} appInstance - Express app instance to store cache on `locals`.
 */
function startDbUpdate(loadVolunteerCacheFn, appInstance) {
  if (!dbUpdateInterval) {
    dbUpdateInterval = setInterval(async () => {
      try {
        const cache = await loadVolunteerCacheFn();
        appInstance.locals.volunteerCache = cache;
        log('Volunteer cache refreshed.');
      } catch (err) {
        logError('Failed to refresh volunteer cache:', err);
      }
    }, 30_000);
    log('DB update interval started.');
  }
}

/**
 * Stop the periodic volunteer cache update interval.
 */
function stopDbUpdate() {
  if (dbUpdateInterval) {
    clearInterval(dbUpdateInterval);
    dbUpdateInterval = null;
    log('DB update interval stopped.');
  }
}
//#endregion

/**
 * Require an active draft registration and start cache lifecycle.
 *
 * - Redirects to /email-pass if no draft exists
 * - Starts volunteer cache + DB refresh interval
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {boolean} true if draft exists and request may continue
 */
function requireDraft(req, res) {
  if (!req.session.registrationId) {
    res.redirect("/email-pass");
    return false;
  }

  loadVolunteerCache();
  startDbUpdate(loadVolunteerCache, app);
  return true;
}

//#region Early Middleware (Pre-Security / Static / JSON)
/**
 * Host redirect middleware.
 * - Redirects plain `albanyjwparking.org` to `https://www.albanyjwparking.org`.
 */
app.use((req, res, next) => {
  const h = (req.hostname || "").toLowerCase();
  if (h === "albanyjwparking.org") {
    return res.redirect(301, "https://www.albanyjwparking.org" + req.originalUrl);
  }
  next();
});

/**
 * Cookie parser & request body parsers (JSON + urlencoded).
 */
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Static asset serving from `/public`.
 */
app.use(express.static(path.join(__dirname, 'public')));

/**
 * View engine configuration for EJS templates.
 */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
//#endregion

//#region HTTP Server & Graceful Shutdown
const server = http.createServer(app);

/**
 * Handle graceful shutdown for SIGTERM/SIGINT.
 * @param {string} signal - The signal name triggering shutdown.
 */
function shutdown(signal) {
  log(`Received ${signal}. Closing server...`);
  stopDbUpdate();
  server.close(err => {
    if (err) {
      logError('Error during server close:', err);
      process.exit(1);
    }
    log('Server closed. Exiting.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
//#endregion

//#region Startup Sequence (Main Async IIFE)
(async () => {
  try {
    // =========================
    // DB Helpers & Routes Import
    // =========================
    //#region DB Imports & Helpers
    /**
     * Database-backed API routes and helpers.
     * These are loaded after configuration and DB connections are ready.
     */
    const dbRoutes = (await import("./routes/apiRoutes.js")).default;
    const {
      exec,
      insertDraftEmailPass,
      insertDraftNameEmail,
      loadVolunteerCache,
      updateDraftPersonalInfo,
      updateDraftCongregationInfo,
      updateDraftNameEmail,
      updateDraftSpiritualInfo,
    } = await import("./lib/dbSync.js");

    await getSqlPool();
    //#endregion

    // =========================
    // Session & Security Middleware
    // =========================
    //#region Session & Security Middleware
    /**
     * Session management middleware.
     * - Persists user session via cookies.
     * - Used to track `userId` through registration steps.
     */
    app.use(
      session({
        secret: config.sessionSecret || "fallback-secret",
        resave: false,
        saveUninitialized: false,
        cookie: {
          secure: isProd,
          httpOnly: true,
          sameSite: "lax",
          maxAge: 5 * 60 * 1000,
        },
      }),
    );

    /**
     * CSRF protection using csurf with cookie-based tokens.
     */
    const csrfProtection = csurf({ cookie: true });

    /**
     * Per-request CSP nonce generator used by helmet's contentSecurityPolicy.
     */
    app.use((req, res, next) => {
      res.locals.nonce = crypto.randomBytes(16).toString("base64");
      next();
    });

    /**
     * Content Security Policy configuration using helmet.
     * Restricts script, style, image, font, and connect sources.
     */
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
            ? [
              "'self'",
              "https:",
              "https://*.azurewebsites.net",
              "https://albanyjwparking.org",
              "https://api.kickbox.com",
            ]
            : [
              "'self'",
              "http://localhost:3000",
              "https://api.kickbox.com",
              "https://cdn.jsdelivr.net",
            ],
        },
      }),
    );
    //#endregion

    // =========================
    // API Routes (DB-backed)
    // =========================
    //#region API Routes Mount
    /**
     * Mount DB-backed API routes under `/api`.
     */
    app.use("/api", dbRoutes);
    //#endregion

    // =========================
    // GET Routes
    // =========================
    //#region GET Routes
    /**
     * @route GET /health
     * @description Simple health check endpoint.
     * @returns {string} "OK"
     */
    app.get("/health", (req, res) => res.send("OK"));

    /**
     * @route GET /
     * @description Render the main index page with CSRF token.
     */
    app.get("/", csrfProtection, (req, res) =>
      res.render("index", { csrfToken: req.csrfToken() }),
    );

    /**
     * Render the email + password registration page.
     *
     * This page starts the registration flow but does not
     * create any database records on its own.
     *
     * @route GET /email-pass
     * @returns {void} Renders emailPass.ejs with CSRF token
     */
    app.get('/email-pass', csrfProtection, (req, res) => {
      res.render('emailPass', {
        csrfToken: req.csrfToken()
      });
    });

    /**
     * @route GET /nonProfile
     * @description
     *  Renders the non-profile registration page.
     *  Also starts DB update interval and loads volunteer cache.
     */
    app.get("/nonProfile", csrfProtection, (req, res) => {
      res.render("nonProfile", { csrfToken: req.csrfToken() });
    });

    /**
     * @route GET /congregationInfo
     * @description
     *  Renders the congregation information page.
     *  Requires an active draft registration.
     *  Populates the view with the list of congregations from the DB.
     */
    app.get("/congregationInfo", csrfProtection, async (req, res) => {
      try {
        if (!requireDraft(req, res)) return;

        const congregations = await getCongregations();

        res.render("congregationInfo", {
          congregations,
          csrfToken: req.csrfToken(),
        });
      } catch (error) {
        console.error("Error rendering congregationInfo:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    /**
     * @route GET /spiritualInfo
     * @description
     *  Renders the spiritual info page (privileges, etc.).
     *  Requires an active draft registration.
     *  Loads volunteer cache and starts DB update interval.
     */
    app.get("/spiritualInfo", csrfProtection, (req, res) => {
      if (!requireDraft(req, res)) return;

      const registrationId = req.session.registrationId;
      const volunteer =
        app.locals.volunteerCache?.byRegistrationId?.[registrationId] || null;

      res.render("spiritualInfo", {
        csrfToken: req.csrfToken(),
        privilegeRulesJSON: JSON.stringify(INCOMPATIBILITIES),
        gender: volunteer?.gender || null,
      });
    });

    /**
     * @route GET /volunteerIn
     * @description
     *  Main volunteer registration/landing page.
     *  Can disable name fields based on `disable=true` query param.
     *  Supports both draft-registered and guest entry.
     */
    app.get("/volunteerIn", csrfProtection, (req, res) => {
      const disableNameFields = req.query.disable === "true";
      const hasActiveRegistration = Boolean(req.session.registrationId);

      if (hasActiveRegistration) {
        loadVolunteerCache();
        startDbUpdate(loadVolunteerCache, app);
      }

      res.render("volunteerIn", {
        disableNameFields,
        csrfToken: req.csrfToken(),
      });
    });

    /**
     * @route GET /personalInfo
     * @description
     *  Collects personal contact and address information.
     *  Requires an active draft registration.
     */
    app.get("/personalInfo", csrfProtection, (req, res) => {
      if (!requireDraft(req, res)) return;

      res.render("personalInfo", {
        csrfToken: req.csrfToken(),
      });
    });

    /**
     * @route GET /notes
     * @description
     *  Renders the personal info page (privileges, etc.).
     *  Also starts DB update interval and loads volunteer cache.
     */
    app.get("/notes", csrfProtection, (req, res) => {
      if (!requireDraft(req, res)) return;

      res.render("notes", { csrfToken: req.csrfToken() });
    });

    /**
     * @route GET /formSummary
     * @description
     *  Renders the summary of all data entered with links to change.
     *  Also starts DB update interval and loads volunteer cache.
     */
    app.get("/formSummary", csrfProtection, (req, res) => {
      if (!requireDraft(req, res)) return;

      res.render("formSummary", { csrfToken: req.csrfToken() });
    });

    /**
     * @route GET /formDone
     * @description
     *  Renders the form complete page.
     */
    app.get("/formDone", csrfProtection, (req, res) => {
      if (!requireDraft(req, res)) return;

      res.render("formDone", { csrfToken: req.csrfToken() });
    });

    /**
     * @route GET /db-test
     * @description
     *  Test endpoint to confirm DB connection and context.
     *  Returns DB name, login, and DB user.
     */
    app.get("/db-test", async (req, res) => {
      try {
        const tsql =
          "SELECT DB_NAME() AS db, SUSER_SNAME() AS login, USER_NAME() AS dbuser;";
        const result = await exec(tsql, () => {});
        res.json({ success: true, result });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });
    //#endregion

    // =========================
    // POST Routes
    // =========================
    //#region POST Routes
    /**
     * @route POST /submit-volunteerInfo
     * @description
     *  Creates or updates a draft volunteer registration using
     *  name and email (guest entry path).
     *
     *  - Promotes guest user into a draft registration
     *  - Anchors session to registration_id
     *  - Disables name fields for subsequent steps
     */
    app.post("/submit-volunteerInfo", csrfProtection, async (req, res) => {
      const { firstName, lastName, suffix, email } = req.body;

      if (!firstName || !lastName || !email) {
        return res.status(400).send("First name, last name, and email are required.");
      }

      try {
        let row;

        // ✅ CASE 1: No registration yet → create draft
        if (!req.session.registrationId) {
          row = await insertDraftNameEmail(
            firstName,
            lastName,
            suffix,
            email
          );

          if (!row) {
            return res.status(409).send("Email already registered.");
          }

          req.session.userId = row.id;
          req.session.registrationId = row.registration_id;
        }
        // ✅ CASE 2: Existing draft → update it
        else {
          row = await updateDraftNameEmail(
            req.session.registrationId,
            firstName,
            lastName,
            suffix,
            email
          );
        }

        // ✅ UX-only flags
        req.session.disableNameFields = true;

        // ✅ DO NOT refresh cache here
        // Cache is started by GET /volunteerIn if registration exists

        return res.redirect("/volunteerIn?disable=true");

      } catch (err) {
        console.error("submit-volunteerInfo error:", err);
        return res.status(500).send("Registration failed.");
      }
    });

    /**
     * @route POST /submit-congregationInfo
     * @description
     *  Saves congregation-related information for a draft registration.
     *
     *  Supports:
     *   - Assigned congregation (dropdown)
     *   - Visiting congregation (city/state/language)
     *   - Additional convention attendance
     */
    app.post("/submit-congregationInfo", csrfProtection, async (req, res) => {
      try {
        const registrationId = req.session.registrationId;
        if (!registrationId) {
          return res.redirect("/email-pass");
        }

        // Raw form values
        const {
          congAssigned,              // "yes" | "no"
          congregation,              // dropdown value
          congregationOtherCity,
          congregationOtherState,
          congregationOtherLang,
          extraAttend                // "yes" | "no"
        } = req.body;

        // Normalize assigned flag
        const assignedToConv = String(congAssigned).toLowerCase() === "yes";

        // Normalize extra attend flag
        const attendExtra =
          String(extraAttend).toLowerCase() === "yes";

        // Normalize congregation value
        let congregationValue = null;

        if (assignedToConv) {
          // Assigned to convention: must come from dropdown
          if (!congregation) {
            return res.status(400).send("Congregation selection is required.");
          }
          congregationValue = congregation;
        } else {
          // Visiting from another congregation: compose string
          const city = (congregationOtherCity || "").trim();
          const state = (congregationOtherState || "").trim().toUpperCase();
          const lang = (congregationOtherLang || "").trim().toUpperCase();

          if (!city || !state || !lang) {
            return res.status(400).send("Visiting congregation details are required.");
          }

          congregationValue = `${city}, ${state} - ${lang}`;
        }

        // Persist to DB (draft update)
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

    /**
     * @route POST /submit-spiritualInfo
     * @description
     *  Saves spiritual privileges/roles for a draft registration.
     *  Accepts single or multiple `privileges` values.
     *  Advances last_step to 'spiritualInfo'.
     */
    app.post("/submit-spiritualInfo", csrfProtection, async (req, res) => {
      try {
        const registrationId = req.session.registrationId;
        if (!registrationId) {
          return res.redirect("/email-pass");
        }

        const { privileges } = req.body;

        // Normalize privileges to array
        const privilegeList = Array.isArray(privileges)
          ? privileges
          : privileges
            ? [privileges]
            : [];

        // Persist to DB (draft update)
        await updateDraftSpiritualInfo(registrationId, privilegeList);

        return res.redirect("/notes");

      } catch (err) {
        console.error("submit-spiritualInfo error:", err);
        return res.status(500).send("Failed to save spiritual information.");
      }
    });

    /**
     * @route POST /submit-personalInfo
     * @description
     *  Saves personal information for a draft volunteer registration.
     *  Normalizes gender, DOB, and stamina.
     *  Advances last_step to 'personalInfo'.
     */
    app.post("/submit-personalInfo", csrfProtection, async (req, res) => {
      try {
        const registrationId = req.session.registrationId;
        if (!registrationId) {
          return res.redirect("/email-pass");
        }

        // Extract raw form values
        const { genderRaw, dobirthRaw, staminaRaw } = req.body;

        // Normalize gender
        const gender = genderRaw?.trim().toLowerCase() || null;

        // Normalize DOB
        let dobirth = null;
        if (dobirthRaw) {
          const parsed = new Date(dobirthRaw);
          if (isNaN(parsed.valueOf())) {
            return res.status(400).send("Invalid date of birth.");
          }
          dobirth = parsed;
        }

        // Normalize stamina
        let stamina = null;
        if (typeof staminaRaw === "string") {
          const num = parseInt(staminaRaw.split("-")[0].trim(), 10);
          if (!isNaN(num)) stamina = num;
        }

        // Save to database (draft update)
        await updateDraftPersonalInfo(registrationId, {
          gender,
          dateOfBirth: dobirth,
          stamina
        });

        // Optional UX-only session hint (DB is authoritative)
        req.session.gender = gender;

        return res.redirect("/congregationInfo");

      } catch (err) {
        console.error("submit-personalInfo error:", err);
        return res.status(500).send("Server error.");
      }
    });

    /**
     * Handle initial registration submission (email + password).
     *
     * - Creates a new draft volunteer record
     * - Anchors the session to registration_id
     * - Advances flow to the next step (volunteerIn)
     *
     * @route POST /submit-emailPass
     * @param {string} req.body.email - User email address
     * @param {string} req.body.password - Raw password
     * @returns {void} Redirects to /volunteerIn on success
     */
    app.post('/submit-emailPass', csrfProtection, async (req, res) => {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).send('Email and password are required.');
      }

      try {
        const row = await insertDraftEmailPass(email, password);
        if (!row) {
          return res.status(500).send('Failed to create registration.');
        }

        // Anchor session to durable registration
        req.session.userId = row.id;
        req.session.registrationId = row.registration_id;

        // Optional UX-only cache
        req.session.formCache = { email };

        return res.redirect('/volunteerIn');

      } catch (err) {
        console.error('submit-emailPass error:', err);
        return res.status(500).send('Registration failed.');
      }
    });
    //#endregion

    // =========================
    // Validation & Utility Endpoints
    // =========================
    //#region Validation Endpoints
    /**
     * @route GET /validate-phone
     * @description
     *  Validates a phone number via Twilio Lookup API.
     *  Normalizes to E.164 format and returns SMS capability status.
     *
     * @query {string} phone - Phone number in any format.
     */
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

        const carrierType = lookup?.carrier?.type || "";
        const SMSCapableRaw = req.body?.SMSCapable; // safe optional chaining
        const SMSCapable = SMSCapableRaw === "yes"; // true if yes, false otherwise

        return res.status(200).json({
          valid: true,
          normalized: e164,
          SMSCapable,
          carrierType,
        });
      } catch (err) {
        if (err.status === 404) {
          return res.status(200).json({
            valid: false,
            validation_errors: "Invalid or unrecognized phone number.",
          });
        }
        logError("Twilio Lookup error:", err);
        return res.status(500).json({ error: "Lookup failed" });
      }
    });

    /**
     * @route GET /validate-email
     * @description
     *  Validates an email address with Kickbox.
     *  Rejects emails with `@jwpub.org` domain.
     *
     * @query {string} email - Email address to validate.
     */
    app.get("/validate-email", async (req, res) => {
      const email = (req.query.email || "").toString().trim();
      if (!email) {
        return res
          .status(400)
          .json({ valid: false, reason: "Please enter an email address" });
      }

      if (email.toLowerCase().endsWith("@jwpub.org")) {
        return res.json({ result: "invalid", reason: "Domain not allowed" });
      }

      try {
        const result = await verifyEmail(email);
        res.json({ result: result.result, reason: result.reason });
      } catch (err) {
        logError("Kickbox verification error:", err);
        res.status(500).json({ error: "Verification failed" });
      }
    });
    //#endregion

    // =========================
    // 404 Handler
    // =========================
    //#region 404 Handler
    /**
     * Catch-all 404 handler for unmatched routes.
     * Renders a custom 404 page with the requested URL.
     */
    app.use((req, res) => {
      res.status(404);
      res.render("404", { url: req.originalUrl });
    });
    //#endregion

    // =========================
    // Server Start & Final Init
    // =========================
    //#region Server Start & Init
    /**
     * Start HTTP server and initialize Twilio + SQL pool.
     */
    server.listen(PORT, HOST, () =>
      log(`✅ Server running on http://${HOST}:${PORT}`),
    );

    await initTwilio();
    log("Twilio initialized.");

    await getSqlPool();
    log("✅ SQL pool initialized.");
    //#endregion
  } catch (err) {
    logError('❌ Failed to start server:', err);
    process.exit(1);
  }
})();
//#endregion
