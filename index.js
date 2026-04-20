// index.js - Main Server
// =========================

import http from "http";
import express from "express";
import path, { dirname } from "path";
import helmet from "helmet";
import { fileURLToPath } from "url";
import crypto from "crypto";
import cookieParser from "cookie-parser";
import session from "express-session";
import csurf from "csurf";
import { RedisStore } from "connect-redis";
import { createClient } from "redis";

import { createRequire } from "module";
import { getConfig, getSqlPool } from "./src/config/azureConfig.js";
import { INCOMPATIBILITIES } from "./src/config/privilegeRules.js";

const require = createRequire(import.meta.url);
const { version: APP_VERSION } = require("./package.json");

// Routers
import { createRegistrationRouter } from "./routes/registrationRoutes.js";
import apiRoutes from "./routes/apiRoutes.js";
import { loginRouter } from "./routes/accountRoutes.js";
import upgradeRoutes from "./routes/upgradeRoutes.js";


// Database helpers
import * as db from "./lib/dbSync.js";

import {oversightRouter} from "./routes/oversightRoutes.js";
import { getBaseUrl } from "./lib/messaging.js";



// Resolve paths
const config = await getConfig();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const isProd = config.NODE_ENV === "production";
const PORT = process.env.PORT || config.PORT || (isProd ? 80 : 3000);
const HOST = "0.0.0.0";

// Logging helpers
/**
 * @param {...any} args
 */
function log(...args) {
  console.log(`[${new Date().toISOString()}] [index.js]`, ...args);
}
/**
 * @param {...any} args
 */
function logError(...args) {
  console.error(`[${new Date().toISOString()}] [index.js]`, ...args);
}

// Mask credentials in logs (redis://:password@host -> redis://:***@host)
/**
 * @param {string} url
 * @returns {string}
 */
function maskRedisUrl(url) {
  try {
    return url.replace(/:(?:[^@]*)@/, ":***@");
  } catch {
    return "<redacted>";
  }
}

// Build redis URL from either REDIS_URL (direct) or VALKEY_HOST + VALKEY_PASSWORD
/**
 * @returns {string | null}
 */
function resolveRedisUrl() {
  const valkeyHost = process.env.VALKEY_HOST;
  const valkeyPassword = process.env.VALKEY_PASSWORD;
  const valkeyPort = process.env.VALKEY_PORT || 6379;

  if (valkeyHost && valkeyPassword) {
    const encPwd = encodeURIComponent(valkeyPassword);
    return `redis://:${encPwd}@${valkeyHost}:${valkeyPort}`;
  }

  const directRedisUrl = config.REDIS_URL || process.env.REDIS_URL;
  if (directRedisUrl) return directRedisUrl;

  return null;
}

// ============================================================
// Crypto Polyfill (for environments without globalThis.crypto)
// ============================================================

if (typeof globalThis.crypto === "undefined") {
  import("crypto")
    .then(({ webcrypto, default: cjsCrypto }) => {
      // @ts-ignore
      globalThis.crypto = webcrypto ?? cjsCrypto;
    })
    .catch((err) => logError("Failed to load crypto:", err));
}

// ============================================================
// Twilio
// ============================================================

/** @type {import("twilio").Twilio | undefined} */
let twClient;

/**
 * Initialize Twilio client if necessary.
 * @returns {Promise<import("twilio").Twilio>}
 */
async function initTwilio() {
  if (!twClient) {
    const mod = await import("twilio");
    const twRoot = mod.default ?? mod;
    twClient = twRoot(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
  }
  return twClient;
}

// ============================================================
// Kickbox email verification
// ============================================================

/**
 * Verify email via Kickbox API.
 * @param {string} email
 * @param {{timeoutMs?:number}} [options]
 * @returns {Promise<any>}
 */
async function verifyEmail(email, { timeoutMs = 8000 } = {}) {
  if (!config.KICKBOX_API_KEY) throw new Error("KICKBOX_API_KEY missing");

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

    if (!resp.ok) throw new Error(`Kickbox API error ${resp.status}`);

    return await resp.json();
  } finally {
    clearTimeout(t);
  }
}

// ============================================================
// Volunteer Cache Auto-Refresh
// ============================================================

/** @type {NodeJS.Timeout | null} */
let dbUpdateInterval = null;

/**
 * Start periodic volunteer cache refresh.
 * @param {() => Promise<any>} loadFn
 * @param {import("express").Express} appInstance
 */
function startDbUpdate(loadFn, appInstance) {
  if (!dbUpdateInterval) {
    dbUpdateInterval = setInterval(async () => {
      try {
        appInstance.locals.volunteerCache = await loadFn();
      } catch (err) {
        logError("Cache refresh failed:", err);
      }
    }, 30_000);
  }
}

/**
 * Stop periodic volunteer cache refresh.
 */
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
app.set("views", [
  path.join(__dirname, "views"),
  path.join(__dirname, "views/registration"),
  path.join(__dirname, "views/partials"),
  path.join(__dirname, "views/errors"),
  path.join(__dirname, "views/authentication_and_accounts"),
  path.join(__dirname, "views/upgrade"), 
]);

// CSP nonce middleware
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString("base64");
  next();
});

// Helmet CSP setup
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
        ? ["'self'", "https:", "https://api.kickbox.com"]
        : ["'self'", "http://localhost:3000", "https://api.kickbox.com"],
    },
  }),
);

// When behind Azure App Service (TLS termination), trust proxy
if (isProd) {
  app.set("trust proxy", 1);
}

// ============================================================
// Startup wrapper
// ============================================================

const server = http.createServer(app);

(async () => {
  try {
    await getSqlPool();

    // -------------------------
    // Session middleware
    // -------------------------

    const sessionSecret =
      config.sessionSecret || process.env.SESSION_SECRET || "fallback-secret";

    /** @type {session.SessionOptions} */
    const sessionOptions = {
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true, // Reset maxAge on every response
      cookie: {
        secure: isProd,
        httpOnly: true,
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
      },
    };

    if (isProd) {
      const redisUrl = resolveRedisUrl();
      if (!redisUrl) {
        logError(
          "Redis config missing. Set either REDIS_URL or (VALKEY_HOST and VALKEY_PASSWORD).",
          {
            hasREDIS_URL: Boolean(config.REDIS_URL || process.env.REDIS_URL),
            hasVALKEY_HOST: Boolean(process.env.VALKEY_HOST),
            hasVALKEY_PASSWORD: Boolean(process.env.VALKEY_PASSWORD),
          },
        );
        // eslint-disable-next-line no-process-exit
        process.exit(1);
      }

      log("Connecting to Redis/Valkey at:", maskRedisUrl(redisUrl));

      const redisClient = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 8000,
          keepAlive: 5000,
        },
      });

      redisClient.on("error", (err) => {
        logError("Redis Client Error:", err);
      });

      await redisClient.connect();
      log("Redis client connected.");

      sessionOptions.store = new RedisStore({
        client: redisClient,
        prefix: "sess:",
      });
      log("Redis session store initialized.");
    }

    app.use(session(sessionOptions));
    // Store the intended destination for post-login redirect.
    // Only captures GET requests to non-auth, non-static paths.
    app.use((req, res, next) => {
      const isGet = req.method === "GET";
      const isLoginPage = req.path === "/login";
      const isLogoutPage = req.path === "/logout";
      const isStatic =
        req.path.startsWith("/vendor") ||
        req.path.startsWith("/styles") ||
        req.path.startsWith("/js") ||
        req.path.startsWith("/images") ||
        req.path.startsWith("/api") ||
        req.path === "/health" ||
        req.path === "/favicon.ico";
      const isAuthed = !!req.session?.userId;

      if (isGet && !isLoginPage && !isLogoutPage && !isStatic && !isAuthed) {
        req.session.returnTo = req.originalUrl;
      }

      next();
    });

    // Derive navigation state from the session for use in views
    app.use((req, res, next) => {
      // e.g., "/", "/volunteerIn", "/my-account"
      res.locals.currentPath = req.path;

      const s = req.session || {};

      // Logged-in
      const isLoggedIn = !!s.userId;

      // Detect draft or partial registration
      const hasDraftRegistration =
        !!s.registrationId || !!s.pendingEmail || s.last_step !== undefined;

      // Detect completed registration if stored
      const registrationCompleted = s.registration_status === "completed";

      // Continue Registration is only shown if NOT completed
      const showContinueRegistration =
        hasDraftRegistration && !registrationCompleted;

      const userInitials = s.userInitials || null;
      const userRole = s.userRole || "REGISTERED";
      const registrationStatus = s.registrationStatus || null;
      const showDraftBanner = isLoggedIn && registrationStatus === "draft";

      res.locals.userRole = userRole;
      res.locals.userPermissions = s.permissions || {};
      res.locals.appVersion = APP_VERSION;

      res.locals.nav = {
        isLoggedIn,
        hasDraftRegistration,
        registrationCompleted,
        showContinueRegistration,
        canUpgrade: !isLoggedIn,
        userInitials,
        userRole,
        showDraftBanner,
      };

      next();
    });

    const csrfProtection = csurf({ cookie: true });

    /**
     * Prevent browsers from caching authenticated pages.
     * Without this, hitting the back button after logout restores the cached
     * page from bfcache, bypassing session checks entirely.
     */
    app.use((req, res, next) => {
      if (req.session?.userId) {
        res.setHeader(
          "Cache-Control",
          "no-store, no-cache, must-revalidate, private",
        );
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
      next();
    });

    // ========================================================
    // Mount Routers
    // ========================================================

    // API
    app.use("/api", apiRoutes);

    // Registration router (FULL FLOW)
    app.use(
      "/",
      createRegistrationRouter({
        csrfProtection,
        loadVolunteerCache: db.loadVolunteerCache,
        startDbUpdate,
        stopDbUpdate,
        getCongregations: db.getCongregations,
        db: {
          insertDraftEmailPass: db.insertDraftEmailPass,
          insertDraftNameEmail: db.insertDraftNameEmail,
          updateDraftNameEmail: db.updateDraftNameEmail,
          updateDraftNamePhone: db.updateDraftNamePhone,
          updateDraftPersonalInfo: db.updateDraftPersonalInfo,
          updateDraftCongregationInfo: db.updateDraftCongregationInfo,
          updateDraftSpiritualInfo: db.updateDraftSpiritualInfo,
          updateDraftNotes: db.updateDraftNotes,
          emailExists: db.emailExists,
          nameExists: db.nameExists,
          phoneExists: db.phoneExists,
          markDraftCompleted: db.markDraftCompleted,
          getVolunteerById: db.getVolunteerById,
        },
        INCOMPATIBILITIES,
        logError,
      }),
    );

    /**
     * Prevent browsers from caching authenticated pages.
     * Without this, hitting the back button after logout restores the cached
     * page from bfcache, bypassing session checks entirely.
     */
    app.use((req, res, next) => {
      if (req.session?.userId) {
        res.setHeader(
          "Cache-Control",
          "no-store, no-cache, must-revalidate, private",
        );
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
      next();
    });

    // Login + My Account router
    app.use("/", loginRouter({ csrfProtection, logError }));

    // Upgrade Account (email/phone → send reset link)
    app.use(
      "/",
      upgradeRoutes({
        express,
        csrfProtection,
        db,
        updateUserPassword: db.updateUserPassword,
        twilioAccountSid: config.TWILIO_ACCOUNT_SID,
        twilioAuthToken: config.TWILIO_AUTH_TOKEN,
        twilioMsgSid: config.TWILIO_MSG_SID,
        smtpConfig: {
          host: config.IONOS_SMTP_HOST,
          port: config.IONOS_SMTP_PORT,
          user: config.IONOS_SMTP_USER,
          pass: config.IONOS_SMTP_PASS,
        },
      }),
    );

    app.use(
      "/",
      oversightRouter({
        csrfProtection,
        logError,
        twilioAccountSid: config.TWILIO_ACCOUNT_SID,
        twilioAuthToken: config.TWILIO_AUTH_TOKEN,
        twilioMsgSid: config.TWILIO_MSG_SID,
        smtpConfig: {
          host: config.IONOS_SMTP_HOST,
          port: config.IONOS_SMTP_PORT,
          user: config.IONOS_SMTP_USER_INFO,
          pass: config.IONOS_SMTP_PASS,
        },
      }),
    );
    /**
     * GET /api/session/touch
     * Lightweight endpoint called by sessionKeepAlive.js to reset the
     * rolling session timer while the user is active. Returns 401 when
     * no session exists so the client knows to redirect to login.
     */
    app.get("/api/session/touch", (req, res) => {
      if (!req.session?.userId) {
        return res.status(401).json({ ok: false, reason: "unauthenticated" });
      }
      // touching req.session marks it dirty so rolling re-saves it
      req.session.lastTouched = Date.now();
      return res.json({ ok: true });
    });
    // ========================================================
    // Validation Endpoints (Kickbox / Twilio)
    // ========================================================

    app.get("/validate-email", async (req, res) => {
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

    app.get("/validate-phone", async (req, res) => {
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
        // @ts-ignore Twilio errors often have status
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
    // ========================================================
    // Public RSVP — Invite Response
    // No authentication required; token is the credential.
    // ========================================================

    /**
     * GET /invite/respond/:token
     * Show the RSVP response page for an invite link.
     */
    app.get("/invite/respond/:token", csrfProtection, async (req, res) => {
      const { token } = req.params;
      try {
        const invitation = await db.getInvitationByToken(token);
        if (!invitation) {
          return res.status(404).render("404", { url: req.originalUrl });
        }
        return res.render("authentication_and_accounts/inviteRespond", {
          csrfToken: req.csrfToken(),
          invitation,
          alreadyResponded: !!invitation.responded_at && !invitation.revoked,
          responded: req.query.responded === "1",
          error: req.query.error || null,
        });
      } catch (err) {
        logError("invite/respond GET error:", err);
        return res.status(500).send("Server error");
      }
    });

    /**
     * POST /invite/respond/:token
     * Record a volunteer's RSVP response.
     * Revoked invitations cannot be responded to.
     */
    app.post("/invite/respond/:token", csrfProtection, async (req, res) => {
      const { token } = req.params;
      const { response } = req.body || {};

      const valid = ["yes", "no", "maybe"];
      if (!valid.includes(response)) {
        return res.redirect(
          `/invite/respond/${encodeURIComponent(token)}?error=invalid`,
        );
      }

      try {
        const invitation = await db.getInvitationByToken(token);
        if (!invitation) {
          return res.status(404).render("404", { url: req.originalUrl });
        }
        if (invitation.revoked) {
          return res.redirect(`/invite/respond/${encodeURIComponent(token)}`);
        }
        if (invitation.responded_at) {
          return res.redirect(
            `/invite/respond/${encodeURIComponent(token)}?responded=1`,
          );
        }
        await db.markInvitationResponded(token, response);
        return res.redirect(
          `/invite/respond/${encodeURIComponent(token)}?responded=1`,
        );
      } catch (err) {
        logError("invite/respond POST error:", err);
        return res.status(500).send("Server error");
      }
    });

    // ========================================================
    // Twilio SMS Webhook — Opt-out handling
    // Receives STOP / UNSTOP / HELP messages from Twilio.
    // Twilio sends application/x-www-form-urlencoded POST.
    // Validated via X-Twilio-Signature — no CSRF or session needed.
    // ========================================================

    /**
     * POST /api/sms/webhook
     * Handle inbound SMS events from Twilio (STOP, UNSTOP, HELP).
     * Twilio delivers these as URL-encoded form POST, not JSON.
     *
     * Validation: We check the X-Twilio-Signature header using the
     * Twilio auth token to confirm the request genuinely came from Twilio.
     * Invalid signatures are rejected with 403.
     */
    app.post(
      "/api/sms/webhook",
      express.urlencoded({ extended: false }),
      async (req, res) => {
        try {
          // ── Signature validation ───────────────────────────────────
          const twilioSignature = req.headers["x-twilio-signature"] || "";
          const webhookUrl = `${getBaseUrl(req)}/api/sms/webhook`;

          // Build the Twilio client to access the validator
          const twilio = await import("twilio");
          const twRoot = twilio.default ?? twilio;
          const isValid = twRoot.validateRequest(
            config.TWILIO_AUTH_TOKEN,
            twilioSignature,
            webhookUrl,
            req.body || {},
          );

          if (!isValid) {
            logError("SMS webhook: invalid Twilio signature — rejected");
            return res.status(403).send("Forbidden");
          }

          // ── Extract fields from Twilio payload ─────────────────────
          // Twilio sends: From, To, Body, MessageSid, etc.
          const fromPhone = (req.body.From || "").trim();
          const bodyText = (req.body.Body || "").trim().toUpperCase();
          const rawPayload = JSON.stringify(req.body);

          // ── Classify the event ─────────────────────────────────────
          // STOP keywords: STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT
          // UNSTOP keywords: START, YES, UNSTOP
          // HELP keywords: HELP, INFO
          let eventType = null;

          const stopWords = [
            "STOP",
            "STOPALL",
            "UNSUBSCRIBE",
            "CANCEL",
            "END",
            "QUIT",
          ];
          const unstopWords = ["START", "YES", "UNSTOP"];
          const helpWords = ["HELP", "INFO"];

          if (stopWords.includes(bodyText)) eventType = "STOP";
          else if (unstopWords.includes(bodyText)) eventType = "UNSTOP";
          else if (helpWords.includes(bodyText)) eventType = "HELP";

          if (!eventType) {
            // Not an opt-out keyword — acknowledge and ignore
            res.set("Content-Type", "text/xml");
            return res.send(
              `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
            );
          }

          // ── Process the event ──────────────────────────────────────
          await db.handleSmsOptOutWebhook({
            phone: fromPhone,
            eventType,
            rawPayload,
          });

          log(`SMS webhook: ${eventType} from ${fromPhone}`);

          // Twilio expects a TwiML response — empty is fine for opt-out
          res.set("Content-Type", "text/xml");
          return res.send(
            `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
          );
        } catch (err) {
          logError("SMS webhook error:", err);
          // Still return 200 so Twilio doesn't retry indefinitely
          res.set("Content-Type", "text/xml");
          return res.send(
            `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
          );
        }
      },
    );
    // ========================================================
    // Public — SMS opt-in stamp (called from RSVP page)
    // ========================================================

    /**
     * POST /invite/opt-in/:token
     * Stamp SMS opt-in on a volunteer when they submit their RSVP.
     * Public route — no session auth, invitation token is the credential.
     * Fire-and-forget from the client — always returns 200.
     */
    app.post("/invite/opt-in/:token", csrfProtection, async (req, res) => {
      const { token } = req.params;
      try {
        const invitation = await db.getInvitationByToken(token);
        if (invitation?.volunteer_id) {
          await db.setVolunteerSmsOptIn(invitation.volunteer_id, "rsvp");
        }
      } catch (err) {
        logError("invite/opt-in POST error:", err);
      }
      return res.json({ success: true });
    });

    // ========================================================
    // Health & 404
    // ========================================================

    app.get("/health", (req, res) => res.send("OK"));

    app.use((req, res) => {
      res.status(404);
      res.render("404", { url: req.originalUrl });
    });

    // ========================================================
    // Global Error Handler
    // Must be registered after all routes and the 404 handler.
    // Four-argument signature is required for Express to treat
    // this as an error-handling middleware.
    // ========================================================

    /**
     * Global error handler.
     * Handles CSRF token expiry with a user-friendly re-render.
     * All other errors are logged and surfaced as a 500.
     * @param {any} err
     * @param {import("express").Request} req
     * @param {import("express").Response} res
     * @param {import("express").NextFunction} next
     */
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
      if (err.code === "EBADCSRFTOKEN") {
        logError("CSRF token invalid or expired:", req.method, req.path);

        // Re-render whichever page the user was on with a clear message.
        // We attempt to match the originating path to avoid dumping them
        // on a random error page. Falls back to a plain 403 if the view
        // can't be inferred.
        const path = req.path;

        if (path.startsWith("/submit-emailPass") || path === "/email-pass") {
          return res.status(403).render("emailPass", {
            csrfToken: req.csrfToken(),
            email: "",
            isUpgrade: !!req.session?.emailPassSetup,
            error: "Your session expired. Please try again.",
          });
        }

        if (
          path.startsWith("/submit-nonProfileInfo") ||
          path === "/nonProfile"
        ) {
          return res.status(403).render("nonProfile", {
            csrfToken: req.csrfToken(),
            error: "Your session expired. Please try again.",
          });
        }

        if (
          path.startsWith("/submit-volunteerInfo") ||
          path === "/volunteerIn"
        ) {
          return res.status(403).render("volunteerIn", {
            csrfToken: req.csrfToken(),
            disableNameFields: !!req.session?.disableNameFields,
            hasActiveRegistration: !!req.session?.registrationId,
            error: "Your session expired. Please try again.",
          });
        }

        // Fallback for any other CSRF-protected route
        return res.status(403).render("404", {
          url: req.originalUrl,
          error: "Your session expired. Please go back and try again.",
        });
      }

      // All other errors
      logError("Unhandled error:", err);
      res.status(500).send("An unexpected error occurred. Please try again.");
    });

    // ========================================================
    // Start Server
    // ========================================================

    server.listen(PORT, HOST, () =>
      log(`Server running at http://${HOST}:${PORT}`),
    );

    await initTwilio();
  } catch (err) {
    logError("Failed to start server:", err);
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  }
})();

// Graceful shutdown
process.on("SIGINT", () => {
  stopDbUpdate();
  server.close(() => process.exit(0));
});
process.on("SIGTERM", () => {
  stopDbUpdate();
  server.close(() => process.exit(0));
});
