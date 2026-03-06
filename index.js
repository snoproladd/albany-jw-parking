// =========================
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

import { getConfig, getSqlPool } from "./src/config/azureConfig.js";
import { INCOMPATIBILITIES } from "./src/config/privilegeRules.js";

// Routers
import { createRegistrationRouter } from "./routes/registrationRoutes.js";
import apiRoutes from "./routes/apiRoutes.js";

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
} from "./lib/dbSync.js";

const config = await getConfig();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const isProd = config.NODE_ENV === "production";
const PORT = process.env.PORT || config.PORT || (isProd ? 80 : 3000);
const HOST = "0.0.0.0";

// Logging helpers
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
    .catch((err) => logError("Failed to load crypto:", err));
}

// ============================================================
// Twilio
// ============================================================

let twClient;
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

let dbUpdateInterval = null;

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

    app.use(
      session({
        secret: config.sessionSecret || "fallback",
        resave: false,
        saveUninitialized: false,
        cookie: {
          secure: isProd,
          httpOnly: true,
          sameSite: "lax",
          maxAge: 5 * 60 * 1000, // 5 min
        },
      }),
    );

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
    // ========================================================
    // Validation Endpoints (Kickbox / Twilio)
    // ========================================================

    /**
     * Validate an email address via Kickbox.
     *
     * @route GET /validate-email
     */
    app.get("/validate-email", async (req, res) => {
      const email = (req.query.email || "").toString().trim();
      if (!email) {
        return res.status(400).json({
          valid: false,
          reason: "Please enter an email address",
        });
      }

      // Block jwpub.org at the API level too
      if (email.toLowerCase().endsWith("@jwpub.org")) {
        return res.json({
          result: "invalid",
          reason: "Domain not allowed",
        });
      }

      try {
        const result = await verifyEmail(email);
        // Kickbox returns { result: "deliverable" | "undeliverable" | "risky" | "unknown", reason: string }
        res.json({
          result: result.result,
          reason: result.reason,
        });
      } catch (err) {
        logError("Kickbox verification error:", err);
        res.status(500).json({ error: "Verification failed" });
      }
    });

    /**
     * Validate a phone number via Twilio Lookup.
     *
     * @route GET /validate-phone
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

    // ========================================================
    // Health check & 404
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
