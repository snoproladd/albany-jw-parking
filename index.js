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
import { touchSqlActivity } from "./lib/sql.js";
import { demoContextMiddleware } from "./middleware/demoContext.js";
import { INCOMPATIBILITIES } from "./src/config/privilegeRules.js";
import { can, PERMISSIONS }  from "./src/config/roles.js";

const require = createRequire(import.meta.url);
const { version: APP_VERSION } = require("./package.json");

// Routers
import { createRegistrationRouter } from "./routes/registrationRoutes.js";
import apiRoutes from "./routes/apiRoutes.js";
import { loginRouter } from "./routes/accountRoutes.js";
import upgradeRoutes from "./routes/upgradeRoutes.js";

// Database helpers
import * as db from "./lib/dbSync.js";

import { oversightRouter } from "./routes/oversightRoutes.js";
import { noteAnalysisRouter } from "./routes/noteAnalysisRoutes.js";
import { blackoutRouter } from "./routes/blackoutRoutes.js";
import { smsWebhookRouter } from "./routes/smsWebhookRoute.js";
import { sitemapRouter }   from "./routes/sitemapRoutes.js";
import { mapsRouter } from "./routes/mapsRoutes.js";
import { schedulesRouter } from "./routes/schedulesRoutes.js";
import { constraintRouter }        from "./routes/constraintRoutes.js";
import { scheduleAnalysisRouter }  from "./routes/scheduleAnalysisRoutes.js";
import { signsRouter } from "./routes/signsRoutes.js";
import { countsRouter } from "./routes/countsRoutes.js";
import { systemVariablesRouter } from "./routes/systemVariablesRoutes.js";
import { lessonsLearnedRouter } from "./routes/lessonsLearnedRoutes.js";
import { getBaseUrl, resetSmsClient } from "./lib/messaging.js";
import { startAlertScheduler } from "./lib/alertScheduler.js";
import { initRvTokenSecret, verifyRvToken } from "./lib/rvToken.js";
import {
  getShiftRendezvousById,
  getShiftRendezvous,
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
let twClient = null;
/**
 * Initialize (or return cached) Twilio REST client.
 * Throws if credentials are missing so callers get a clear error
 * instead of a confusing SDK-level "username is required" failure.
 *
 * @returns {Promise<import('twilio').Twilio>}
 */
async function initTwilio() {
  if (!twClient) {
    if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN) {
      throw new Error(
        "Twilio credentials not configured — check Key Vault secrets TwilioSID and TwilioAuthToken.",
      );
    }
    const mod = await import("twilio");
    const twRoot = mod.default ?? mod;
    twClient = twRoot(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
  }
  return twClient;
}

// ============================================================
// External service watchdog
// ============================================================

/**
 * Periodically verify Twilio and SMTP connectivity.
 * Resets cached clients on failure so the next caller triggers
 * a fresh init rather than re-using a broken connection.
 *
 * Twilio: lightweight accounts.fetch() — read-only, no cost.
 * SMTP:   nodemailer transporter.verify() — opens a test connection.
 *
 * Intervals use .unref() so they don't block graceful shutdown.
 *
 * @returns {void}
 */
function startExternalServiceWatchdog() {
  // ── Twilio — every 5 minutes ──────────────────────────────
  const twilioInterval = setInterval(
    async () => {
      try {
        if (!twClient) return; // not yet initialized, skip
        await twClient.api.accounts(config.TWILIO_ACCOUNT_SID).fetch();
        log("Watchdog: Twilio OK.");
      } catch (err) {
        logError(
          "Watchdog: Twilio check failed — resetting client:",
          err.message,
        );
        twClient = undefined;
        resetSmsClient();
      }
    },
    5 * 60 * 1000,
  );
  twilioInterval.unref();

  // ── SMTP — every 10 minutes ───────────────────────────────
  const smtpInterval = setInterval(
    async () => {
      const user = config.IONOS_SMTP_USER_INFO;
      const pass = config.IONOS_SMTP_PASS;
      const host = config.IONOS_SMTP_HOST;
      const port = config.IONOS_SMTP_PORT;

      if (!user || !pass || !host) {
        logError("Watchdog: SMTP credentials not configured — skipping check.");
        return;
      }

      let transporter;
      try {
        const nodemailer =
          (await import("nodemailer")).default ?? (await import("nodemailer"));
        transporter = nodemailer.createTransport({
          host,
          port: port || 587,
          secure: false,
          auth: { user, pass },
          tls: { rejectUnauthorized: false },
        });
        await transporter.verify();
        log("Watchdog: SMTP OK.");
      } catch (err) {
        logError("Watchdog: SMTP check failed:", err.message);
      } finally {
        transporter?.close?.();
      }
    },
    10 * 60 * 1000,
  );
  smtpInterval.unref();
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

// SQL activity tracker — updates the keep-alive window on every request
// so the DB only stays warm while real users are active.
app.use((req, res, next) => {
  touchSqlActivity();
  next();
});

// Demo context — detects demo.albanyjwparking.org and wraps the request
// in an AsyncLocalStorage context so lib/sql.js routes all queries to
// the demo pool automatically. Must sit before session and routes.
app.use(demoContextMiddleware);

// Helmet CSP setup
app.use(
  helmet.contentSecurityPolicy({
    useDefaults: true,
    directives: {
      // Disable upgrade-insecure-requests in dev so local HTTP works.
      // In production Azure terminates TLS before requests reach Express,
      // so the directive isn't needed there either.
      upgradeInsecureRequests: null,
      "default-src": ["'self'"],
      "frame-src":   ["'self'", "https://www.scribblemaps.com", "https://widgets.scribblemaps.com"],
      "script-src": [
        "'self'",
        "https://cdn.jsdelivr.net",
        "https://maps.googleapis.com",
        "https://maps.gstatic.com",
        // 'wasm-unsafe-eval' is needed for the Google Maps vector renderer
        // (which uses WebAssembly for tile rendering when a mapId is set).
        // It does NOT allow general eval()/new Function() — only WebAssembly.
        "'wasm-unsafe-eval'",
        (req, res) => `'nonce-${res.locals.nonce}'`,
      ],
      "style-src": [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://fonts.googleapis.com",
      ],
      "img-src": [
        "'self'",
        "data:",
        "blob:",
        "https://maps.googleapis.com",
        "https://maps.gstatic.com",
        "https://*.googleapis.com",
        "https://*.gstatic.com",
        "https://streetviewpixels-pa.googleapis.com",
      ],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "connect-src": isProd
        ? ["'self'", "https:", "data:", "https://api.kickbox.com", "https://api.open-meteo.com"]
        : [
            "'self'",
            "data:",
            "http://localhost:3000",
            "https://api.kickbox.com",
            "https://api.open-meteo.com",
            "https://maps.googleapis.com",
            "https://maps.gstatic.com",
            "https://*.googleapis.com",
            "https://cdn.jsdelivr.net"
          ],
      "worker-src": ["'self'", "blob:"],
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

/** @type {ReturnType<typeof startAlertScheduler> | null} */
let alertScheduler = null;

(async () => {
  try {
    await getSqlPool();

    // -------------------------
    // Session middleware
    // -------------------------

    const sessionSecret =
      config.sessionSecret || process.env.SESSION_SECRET || "fallback-secret";
    initRvTokenSecret(sessionSecret);

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

      // Combine role-level logParkingCount with any per-volunteer delegation
      // so the header can show the Counts nav section for delegates whose
      // role matrix entry is false but have extra_parking_count set.
      const _perms    = s.permissions || {};
      const _extraP   = s.extraPermissions || [];
      const canLogParkingCount = !!(
        _perms[userRole]?.logParkingCount ||
        _extraP.includes('logParkingCount')
      );

      res.locals.nav = {
        isLoggedIn,
        hasDraftRegistration,
        registrationCompleted,
        showContinueRegistration,
        canUpgrade: !isLoggedIn,
        userInitials,
        userRole,
        showDraftBanner,
        canLogParkingCount,
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
    // ── Home page — dashboard for authenticated users ──────────────
    app.get("/", csrfProtection, async (req, res) => {
      // COUNTER is a narrow shared-account role scoped to /counts only.
      // Short-circuit before any dashboard queries run.
      if (req.session.userRole === "COUNTER") {
        return res.redirect("/counts");
      }

      const sessionRole  = req.session.userRole   || "NON_REGISTERED";
      const sessionPerms = req.session.permissions || PERMISSIONS;
      const canViewOversightWidgets = can(sessionPerms, sessionRole, "viewVolunteerInfo");

      const baseData = {
        csrfToken: req.csrfToken(),
        volunteer: null,
        conventionDay: null,
        shifts: [],
        oversightStructure: [],
        allDays: [],
        currentDayIndex: 0,
        canViewOversightWidgets: false,
      };

      if (!req.session.userId) {
        return res.render("index", baseData);
      }

      try {
        const year = new Date().getFullYear();
        const [volunteer, conventionDay, rawOversightStructure, allDays] =
          await Promise.all([
            db.getVolunteerById(req.session.userId),
            db.getVolunteerDashboardDay(year),
            db.getOversightStructure(),
            db.getConventionDays(year),
          ]);

        let shifts = [];
        if (conventionDay) {
          shifts = await db.getVolunteerShiftsForDay(
            req.session.userId,
            conventionDay.id,
          );
        }

        /**
         * Flatten a parent-child node list into a pre-order array with depth.
         * @param {Array<object>} nodes
         * @param {number|null}   parentId
         * @param {number}        depth
         * @param {Array<object>} out
         * @returns {Array<object>}
         */
        function flattenTree(nodes, parentId = null, depth = 0, out = []) {
          nodes
            .filter((n) => (n.parent_id ?? null) === parentId)
            .sort((a, b) => a.sort_order - b.sort_order)
            .forEach((n) => {
              out.push({ ...n, depth });
              flattenTree(nodes, n.id, depth + 1, out);
            });
          return out;
        }

        const currentDayIndex = allDays.findIndex(
          (d) => d.id === conventionDay?.id,
        );

        return res.render("index", {
          ...baseData,
          volunteer,
          conventionDay,
          shifts,
          oversightStructure: flattenTree(rawOversightStructure),
          allDays,
          currentDayIndex: currentDayIndex >= 0 ? currentDayIndex : 0,
          canViewOversightWidgets,
        });
      } catch (err) {
        logError("Home dashboard error:", err);
        return res.render("index", baseData);
      }
    });

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
          getDraftByEmail: db.getDraftByEmail,
          markDraftCompleted: db.markDraftCompleted,
          upgradeDraftEmailPass: db.upgradeDraftEmailPass,
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

    app.use("/", sitemapRouter());
    app.use(
      "/",
      signsRouter({
        csrfProtection,
        logError,
        googleMapsApiKey: config.GOOGLE_MAPS_API_KEY,
        // Adjust the default center / zoom here if MVP Arena isn't the right anchor.
        defaultMapCenter: {
          lat: 42.648638511758264,
          lng: -73.75487925266984,
          zoom: 17,
        },
        serverPort: PORT,
        graphConfig: {
          tenantId: config.GRAPH_TENANT_ID,
          clientId: config.GRAPH_CLIENT_ID,
          clientSecret: config.GRAPH_CLIENT_SECRET,
          driveUser:
            config.GRAPH_DRIVE_USER ||
            "jladd@jakeofalltradespropertyserv.onmicrosoft.com",
          folderPath:
            config.GRAPH_FOLDER_PATH ||
            "2026 Convention Parking/Documents for Distribution",
        },
      }),
    );
    app.use(
      "/",
      mapsRouter({
        csrfProtection,
        logError,
        graphConfig: {
          tenantId: config.GRAPH_TENANT_ID,
          clientId: config.GRAPH_CLIENT_ID,
          clientSecret: config.GRAPH_CLIENT_SECRET,
          driveUser:
            config.GRAPH_DRIVE_USER ||
            "jladd@jakeofalltradespropertyserv.onmicrosoft.com",
          folderPath:
            config.GRAPH_FOLDER_PATH ||
            "2026 Convention Parking/Documents for Distribution",
        },
      }),
    );
    app.use(
      "/",
      schedulesRouter({
        csrfProtection,
        logError,
        graphConfig: {
          tenantId: config.GRAPH_TENANT_ID,
          clientId: config.GRAPH_CLIENT_ID,
          clientSecret: config.GRAPH_CLIENT_SECRET,
          driveUser:
            config.GRAPH_DRIVE_USER ||
            "jladd@jakeofalltradespropertyserv.onmicrosoft.com",
          folderPath:
            config.GRAPH_FOLDER_PATH ||
            "2026 Convention Parking/Documents for Distribution",
        },
      }),
    );
app.use(
    "/webhook/sms",
    smsWebhookRouter({
        twilioAuthToken:  config.TWILIO_AUTH_TOKEN,
        twilioAccountSid: config.TWILIO_ACCOUNT_SID,
        twilioMsgSid:     config.TWILIO_MSG_SID,
        smtpConfig: {
            host: config.IONOS_SMTP_HOST,
            port: config.IONOS_SMTP_PORT,
            user: config.IONOS_SMTP_USER_INFO,
            pass: config.IONOS_SMTP_PASS,
        },
        logError,
    }),
);

app.use("/", noteAnalysisRouter({ csrfProtection, logError }));
app.use("/", constraintRouter({ csrfProtection, logError }));
app.use("/", scheduleAnalysisRouter({ csrfProtection, logError }));
app.use("/", blackoutRouter({ csrfProtection, logError }));
app.use("/", countsRouter({ csrfProtection, logError }));
app.use("/", systemVariablesRouter({ csrfProtection, logError }));
app.use(
    "/",
    lessonsLearnedRouter({
        csrfProtection,
        logError,
        serverPort: PORT,
        graphConfig: {
            tenantId:     config.GRAPH_TENANT_ID,
            clientId:     config.GRAPH_CLIENT_ID,
            clientSecret: config.GRAPH_CLIENT_SECRET,
            driveUser:
                config.GRAPH_DRIVE_USER ||
                "jladd@jakeofalltradespropertyserv.onmicrosoft.com",
            folderPath:
                (config.GRAPH_FOLDER_PATH ||
                "2026 Convention Parking/Documents for Distribution") +
                "/reports/lessons-learned",
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
    serverPort: PORT,
    graphConfig: {
      tenantId: config.GRAPH_TENANT_ID,
      clientId: config.GRAPH_CLIENT_ID,
      clientSecret: config.GRAPH_CLIENT_SECRET,
      driveUser:
        config.GRAPH_DRIVE_USER ||
        "jladd@jakeofalltradespropertyserv.onmicrosoft.com",
      folderPath:
        config.GRAPH_FOLDER_PATH ||
        "2026 Convention Parking/Documents for Distribution",
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
     // ── Public rendezvous detail (token-gated, no login) ──────────
    /**
     * GET /rv/:scheduleAssignmentId
     * Public page showing rendezvous point details + photo.
     * Access is gated by an HMAC token in the ?t= query parameter.
     */
    app.get("/rv/:saId", async (req, res) => {
      const saId = Number(req.params.saId);
      const token = String(req.query.t || "");

      if (!saId || !token || !verifyRvToken(saId, token)) {
        return res.status(403).send("Invalid or expired link.");
      }

      try {
        const rv = await getShiftRendezvous(saId);
        if (!rv) {
          return res.status(404).send("Rendezvous point not found.");
        }

        return res.render("authentication_and_accounts/rendezvousDetail", {
          rv,
          token,
          shiftLabel: `${rv.event_type_name || "Shift"} — ${rv.shift_label || ""}`,
          locationName: rv.location_name || "",
        });
      } catch (err) {
        logError("rv/:saId GET error:", err);
        return res.status(500).send("Server error.");
      }
    });

    /**
     * GET /rv/photo/:blobName
     * Unauthenticated photo proxy for the public RV detail page.
     * Validates an HMAC token passed as ?t= query param with the
     * assignment ID in ?a= to prevent enumeration.
     */
    app.get("/rv/photo/:blobName", async (req, res) => {
      const blobName = req.params.blobName;
      const saId = Number(req.query.a || 0);
      const token = String(req.query.t || "");

      if (
        !blobName?.startsWith("rv-") ||
        !saId ||
        !verifyRvToken(saId, token)
      ) {
        return res.status(403).send("Forbidden.");
      }

      try {
        const { streamSignPhotoToResponse } =
          await import("./lib/blobStorage.js");
        await streamSignPhotoToResponse(blobName, res);
      } catch (err) {
        logError("rv/photo GET error:", err);
        if (!res.headersSent) res.status(404).send("Not found.");
      }
    });
    /**
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
      const { response, response_other } = req.body || {};

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

        // Build valid options from response_config, fall back to standard
        const config = invitation.response_config
          ? JSON.parse(invitation.response_config)
          : null;
        const validOptions = config?.options ?? ["yes", "no", "maybe"];
        const allowOther = config?.allowOther ?? false;

        // Accept 'other' as a valid choice if allowOther is enabled
        const isOther = allowOther && response === "other";
        const isValid = validOptions.includes(response) || isOther;

        if (!isValid) {
          return res.redirect(
            `/invite/respond/${encodeURIComponent(token)}?error=invalid`,
          );
        }

        // For 'other' responses, store the label as the response value
        // and the free-text input in response_other
        const responseValue = isOther
          ? response_other?.trim()
            ? "other"
            : null
          : response;

        if (!responseValue) {
          return res.redirect(
            `/invite/respond/${encodeURIComponent(token)}?error=invalid`,
          );
        }

        await db.markInvitationResponded(
          token,
          responseValue,
          isOther ? response_other?.trim() || null : null,
        );
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
            // ── Shift code / CHECK handler ─────────────────────────
            // Find the volunteer by phone before doing anything.
            const smsVol = await db.findVolunteerIdByPhone(fromPhone);

            // Volunteer not in system — ignore silently
            if (!smsVol) {
              res.set("Content-Type", "text/xml");
              return res.send(
                `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
              );
            }

            // Eastern date helper (UTC-4, valid for August convention)
            const easternToday = new Date(Date.now() - 4 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 10);

            // ── CHECK = arrive / check-in ────────────────────────
            if (bodyText === "CHECK") {
              const shift = await db.getVolunteerActiveShiftToday(
                smsVol.id,
                easternToday,
              );

              if (!shift) {
                res.set("Content-Type", "text/xml");
                return res.send(
                  `<?xml version="1.0" encoding="UTF-8"?><Response>` +
                    `<Message>Albany JW Parking: We don't have you scheduled for a shift today. ` +
                    `Questions? Contact your overseer.</Message></Response>`,
                );
              }

              const checkT15 = await db.hasT15AlertBeenSent(
                smsVol.id,
                shift.shift_id,
              );
              if (!checkT15) {
                res.set("Content-Type", "text/xml");
                return res.send(
                  `<?xml version="1.0" encoding="UTF-8"?><Response>` +
                    `<Message>Albany JW Parking: Thanks! We\u2019ll check you in automatically ` +
                    `when your T-15 reminder goes out. See you soon!</Message></Response>`,
                );
              }

              const checkDayId =
                (await db.getSchedulerDayForVolunteerShift(
                  smsVol.id,
                  shift.shift_id,
                )) ?? shift.convention_day_id;
              await db.upsertAttendance({
                volunteerId: smsVol.id,
                conventionDayId: checkDayId,
                sessionId: shift.session_id,
                shiftId: shift.shift_id,
                attended: true,
                recordedBy: `sms:${fromPhone}`,
              });

              log(
                `SMS CHECK-IN: vol ${smsVol.id} shift ${shift.shift_id} day ${checkDayId}`,
              );
              res.set("Content-Type", "text/xml");
              return res.send(
                `<?xml version="1.0" encoding="UTF-8"?><Response>` +
                  `<Message>Albany JW Parking: Checked in! Thanks for being here, ` +
                  `we've recorded your attendance for ${shift.shift_label}.</Message></Response>`,
              );
            }

            // ── Shift code = confirm attendance ───────────────────
            if (/^[A-Z0-9]{2,8}$/.test(bodyText)) {
              const shift = await db.getVolunteerShiftByCode(
                smsVol.id,
                bodyText,
              );

              if (!shift) {
                // Code doesn't match any of their shifts — ignore silently
                res.set("Content-Type", "text/xml");
                return res.send(
                  `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
                );
              }

              // Confirm RSVP (no-op if already answered)
              await db.confirmShiftRsvpBySms(smsVol.id, shift.shift_id);

              // If shift is today, also mark attended
              const shiftDate = new Date(shift.convention_date)
                .toISOString()
                .slice(0, 10);

              if (shiftDate === easternToday) {
                const codeT15 = await db.hasT15AlertBeenSent(
                  smsVol.id,
                  shift.shift_id,
                );
                if (codeT15) {
                  const codeDayId =
                    (await db.getSchedulerDayForVolunteerShift(
                      smsVol.id,
                      shift.shift_id,
                    )) ?? shift.convention_day_id;
                  await db.upsertAttendance({
                    volunteerId: smsVol.id,
                    conventionDayId: codeDayId,
                    sessionId: shift.session_id,
                    shiftId: shift.shift_id,
                    attended: true,
                    recordedBy: `sms:${fromPhone}`,
                  });
                }
              }

              log(
                `SMS code confirm: vol ${smsVol.id} code ${bodyText} shift ${shift.shift_id}`,
              );
              res.set("Content-Type", "text/xml");
              return res.send(
                `<?xml version="1.0" encoding="UTF-8"?><Response>` +
                  `<Message>Albany JW Parking: Got it! You're confirmed for ` +
                  `${shift.shift_label}. See you there. Reply STOP to opt out.</Message></Response>`,
              );
            }

            // Not a keyword, not a shift code — ignore
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
    /**
     * GET /api/dashboard/shifts?dayId=N
     * Returns a volunteer's slot assignments for one convention day.
     * Used by the home page day-navigator widget.
     */
    app.get("/api/dashboard/shifts", async (req, res) => {
      if (!req.session?.userId)
        return res
          .status(401)
          .json({ success: false, error: "Not authenticated." });
      const dayId = Number(req.query.dayId);
      if (!dayId)
        return res
          .status(400)
          .json({ success: false, error: "dayId required." });
      try {
        const shifts = await db.getVolunteerShiftsForDay(
          req.session.userId,
          dayId,
        );
        return res.json({ success: true, shifts });
      } catch (err) {
        logError("dashboard shifts API error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    });

    // ── Tour dismissal API ──────────────────────────────────────

    /**
     * GET /api/tours/status
     * Returns the list of tour IDs this user has dismissed.
     * Used by tourBase.js to decide whether to show the first-visit prompt.
     */
    app.get("/api/tours/status", async (req, res) => {
      if (!req.session?.userId) return res.json({ dismissed: [] });
      try {
        const dismissed = await db.getTourDismissals(req.session.userId);
        return res.json({ dismissed });
      } catch (err) {
        logError("Tour status error:", err);
        return res.json({ dismissed: [] });
      }
    });

    /**
     * POST /api/tours/dismiss
     * Permanently dismisses a tour prompt for the logged-in user.
     * Body: { tourId: string } — the tour key, or '_all' to disable all prompts.
     */
    app.post("/api/tours/dismiss", express.json(), async (req, res) => {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not logged in" });
      }
      const { tourId } = req.body;
      if (!tourId || typeof tourId !== "string" || tourId.length > 50) {
        return res.status(400).json({ error: "Invalid tour ID" });
      }
      try {
        await db.dismissTour(req.session.userId, tourId);
        return res.json({ ok: true });
      } catch (err) {
        logError("Tour dismiss error:", err);
        return res.status(500).json({ error: "Failed" });
      }
    });

    /**
     * GET /privacy
     * Renders the Privacy Policy page (public, no auth required).
     */
    app.get("/privacy", (req, res) => {
      res.render("privacy");
    });

    /**
     * GET /terms
     * Renders the Terms of Service page (public, no auth required).
     */
    app.get("/terms", (req, res) => {
      res.render("terms");
    });

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
    startExternalServiceWatchdog();
    const alertScheduler = startAlertScheduler({
      year: new Date().getFullYear(),
      accountSid: config.TWILIO_ACCOUNT_SID,
      authToken: config.TWILIO_AUTH_TOKEN,
      messagingSid: config.TWILIO_MSG_SID,
      logError,
    });
    log("Shift alert scheduler started.");
  } catch (err) {
    logError("Failed to start server:", err);
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  }
})();

// Graceful shutdown
process.on("SIGINT", () => {
  stopDbUpdate();
  if (alertScheduler) alertScheduler.stop();
  server.close(() => process.exit(0));
});
process.on("SIGTERM", () => {
  stopDbUpdate();
  if (alertScheduler) alertScheduler.stop();
  server.close(() => process.exit(0));
});
