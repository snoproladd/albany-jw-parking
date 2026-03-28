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

import { getConfig, getSqlPool } from "./src/config/azureConfig.js";
import { INCOMPATIBILITIES } from "./src/config/privilegeRules.js";

// Routers
import { createRegistrationRouter } from "./routes/registrationRoutes.js";
import apiRoutes from "./routes/apiRoutes.js";
import { loginRouter } from "./routes/accountRoutes.js";
import upgradeRoutes from "./routes/upgradeRoutes.js";
import sql from "mssql";


// Database helpers
import {
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
  loadVolunteerCache,
  markDraftCompleted,
  getCongregations,
  exec,
  hashPassword,
  updateUserPassword,
} from "./lib/dbSync.js";

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
      cookie: {
        secure: isProd,
        httpOnly: true,
        sameSite: "lax",
        maxAge: 5 * 60 * 1000,
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

    const csrfProtection = csurf({ cookie: true });

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
        loadVolunteerCache,
        startDbUpdate,
        stopDbUpdate,
        getCongregations,
        db: {
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
          markDraftCompleted,
        },
        INCOMPATIBILITIES,
        logError,
      }),
    );

    // Login + My Account router
    app.use("/", loginRouter({ csrfProtection, logError }));

    // Upgrade Account (email/phone → send reset link)
    app.use(
      "/",
      upgradeRoutes({
        express,
        csrfProtection,
        exec,
        sql,
        hashPassword,
        updateUserPassword,
        twilioAccountSid: config.TWILIO_ACCOUNT_SID,
        twilioAuthToken: config.TWILIO_AUTH_TOKEN,
        twilioMsgSid: config.TWILIO_MSG_SID,
      }),
    );

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
    // Health & 404
    // ========================================================

    app.get("/health", (req, res) => res.send("OK"));

    app.use((req, res) => {
      res.status(404);
      res.render("404", { url: req.originalUrl });
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
