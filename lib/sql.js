// lib/sql.js (ESM)
// -----------------------------------------------------------------------------
// Purpose:
//   - Provide a shared, pooled connection to Azure SQL using the `mssql` driver
//   - Support both:
//       • Local/dev via DefaultAzureCredential token-credential
//       • Azure App Service via Managed Identity (MSI)
//   - Centralize retry/backoff logic and basic health/diagnostic queries
//
// Works With:
//   - ./dbSync.js  → high-level DB helpers using `query()`
//   - ../src/config/azureConfig.js → re-exports getSqlPool/query/whoAmI/healthProbe
//   - index.js     → calls getSqlPool() to warm up SQL pool at startup
//
// Auth modes mirror what the `mssql` driver supports:
//   - azure-active-directory-msi-app-service
//   - token-credential (DefaultAzureCredential)
//   - azure-active-directory-access-token (fallback)
// -----------------------------------------------------------------------------

//#region Imports & Logging

import sql from "mssql";
import { DefaultAzureCredential } from "@azure/identity";
import { AsyncLocalStorage } from "async_hooks";

/**
 * General log helper.
 * Prefixes messages with ISO timestamp and file tag.
 * @param {...any} args
 */
function log(...args) {
  console.log(`[${new Date().toISOString()}] [lib/sql]`, ...args);
}

/**
 * Error log helper.
 * @param {...any} args
 */
function logError(...args) {
  console.error(`[${new Date().toISOString()}] [lib/sql:ERROR]`, ...args);
}

//#endregion

//#region Azure Credential & Env Config

/**
 * Shared DefaultAzureCredential instance.
 * Supports:
 *   - Managed Identity (App Service / VM)
 *   - VS Code / Azure CLI sign-in
 *   - Environment-based credentials
 */
const credential = new DefaultAzureCredential();

/**
 * SQL Server FQDN (e.g. example.database.windows.net).
 * Accepts multiple environment variable names to support local/dev/App Service:
 *
 * - AZSQLServer
 * - AZURE_SQL_SERVER
 * - SQL_SERVER
 *
 * @type {string}
 */
const SQL_SERVER =
  process.env.AZSQLServer ||
  process.env.AZURE_SQL_SERVER ||
  process.env.SQL_SERVER ||
  "";

/**
 * SQL database name.
 * Accepts:
 * - AZSQLDB
 * - AZURE_SQL_DATABASE
 * - SQL_DATABASE
 *
 * @type {string}
 */
const SQL_DATABASE =
  process.env.AZSQLDB ||
  process.env.AZURE_SQL_DATABASE ||
  process.env.SQL_DATABASE ||
  "";

/**
 * SQL port (default 1433).
 * Accepts:
 * - AZSQLPort
 * - AZURE_SQL_PORT
 * - SQL_PORT
 *
 * @type {number}
 */
const SQL_PORT = Number(
  process.env.AZSQLPort ||
    process.env.AZURE_SQL_PORT ||
    process.env.SQL_PORT ||
    1433,
);

/**
 * Flag to detect Azure App Service environment.
 * WEBSITE_SITE_NAME is typically set there.
 */
const IS_APP_SERVICE = !!process.env.WEBSITE_SITE_NAME;

/**
 * Optional user-assigned managed identity clientId.
 * If present, we configure MSI auth accordingly.
 */
const USER_ASSIGNED_CLIENT_ID = process.env.AZURE_CLIENT_ID;

/**
 * Debug / diagnostics flags:
 * - SQL_DEBUG: turns on driver-level debug logging.
 * - SQL_FORCE_ACCESS_TOKEN: forces explicit access-token auth mode.
 */
const SQL_DEBUG = process.env.SQL_DEBUG === "1";
const SQL_FORCE_ACCESS_TOKEN = process.env.SQL_FORCE_ACCESS_TOKEN === "1";

/**
 * If true, logs an environment snapshot with all SQL-related env vars.
 * Useful in dev; consider leaving false in production to reduce noise.
 */
const SQL_ENV_DEBUG = process.env.SQL_ENV_DEBUG === "1";

// Basic configuration log (safe fields only)
log("Loaded SQL config:", {
  server: SQL_SERVER,
  database: SQL_DATABASE,
  port: SQL_PORT,
  isAppService: IS_APP_SERVICE,
  websiteSiteName: process.env.WEBSITE_SITE_NAME || "",
  azureClientId: USER_ASSIGNED_CLIENT_ID || "",
});

// Optional env snapshot for deeper diagnostics
if (SQL_ENV_DEBUG || SQL_DEBUG) {
  log("Env snapshot (SQL-related):", {
    AZSQLServer: process.env.AZSQLServer,
    AZURE_SQL_SERVER: process.env.AZURE_SQL_SERVER,
    SQL_SERVER: process.env.SQL_SERVER,
    AZSQLDB: process.env.AZSQLDB,
    AZURE_SQL_DATABASE: process.env.AZURE_SQL_DATABASE,
    SQL_DATABASE: process.env.SQL_DATABASE,
    AZSQLPort: process.env.AZSQLPort,
    AZURE_SQL_PORT: process.env.AZURE_SQL_PORT,
    SQL_PORT: process.env.SQL_PORT,
    WEBSITE_SITE_NAME: process.env.WEBSITE_SITE_NAME,
    AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID,
  });
}

//#endregion

//#region Sanity Checks

if (
  !SQL_SERVER ||
  typeof SQL_SERVER !== "string" ||
  !SQL_SERVER.includes(".database.windows.net")
) {
  logError("Invalid SQL_SERVER (variants):", {
    AZSQLServer: process.env.AZSQLServer,
    AZURE_SQL_SERVER: process.env.AZURE_SQL_SERVER,
    SQL_SERVER: process.env.SQL_SERVER,
  });
  throw new Error(
    `Invalid SQL server FQDN; expected like 'albanyregional.database.windows.net', got '${
      SQL_SERVER || ""
    }'`,
  );
}

if (!SQL_DATABASE || typeof SQL_DATABASE !== "string") {
  logError("Invalid SQL_DATABASE (variants):", {
    AZSQLDB: process.env.AZSQLDB,
    AZURE_SQL_DATABASE: process.env.AZURE_SQL_DATABASE,
    SQL_DATABASE: process.env.SQL_DATABASE,
  });
  throw new Error(`Invalid SQL database; got '${SQL_DATABASE || ""}'`);
}

if (!Number.isFinite(SQL_PORT) || SQL_PORT <= 0) {
  logError("Invalid SQL_PORT (variants):", {
    AZSQLPort: process.env.AZSQLPort,
    AZURE_SQL_PORT: process.env.AZURE_SQL_PORT,
    SQL_PORT: process.env.SQL_PORT,
  });
  throw new Error(`Invalid SQL port; got '${SQL_PORT}'`);
}

//#endregion

//#region Demo Context (AsyncLocalStorage)

/**
 * AsyncLocalStorage store used to propagate demo-mode flag through
 * the request pipeline without threading `req` into every DB helper.
 *
 * Each request wrapped by demoContextMiddleware runs inside a store
 * of shape `{ isDemo: boolean }`. getSqlPool() reads this to route
 * queries to the correct pool automatically.
 *
 * @type {AsyncLocalStorage<{ isDemo: boolean }>}
 */
export const demoStorage = new AsyncLocalStorage();

//#endregion

//#region Demo Pool Config & Env

/**
 * SQL auth username for the demo DB user.
 * This user must have DEFAULT_SCHEMA = demo in Azure SQL.
 * Store as DEMO_DB_USER in App Service env / Key Vault.
 * @type {string}
 */
const DEMO_DB_USER = process.env.DEMO_DB_USER || "";

/**
 * SQL auth password for the demo DB user.
 * Store as DEMO_DB_PASSWORD in App Service env / Key Vault.
 * @type {string}
 */
const DEMO_DB_PASSWORD = process.env.DEMO_DB_PASSWORD || "";

/**
 * Builds the mssql config for the demo pool.
 * Uses SQL auth (username + password) rather than MSI, because
 * the demo user needs DEFAULT_SCHEMA = demo — a separate SQL login
 * is the cleanest way to achieve that without touching the real pool.
 *
 * @returns {import("mssql").config}
 */
function buildDemoConfig() {
    return {
        server: SQL_SERVER,
        database: SQL_DATABASE,
        port: SQL_PORT,
        options: {
            encrypt: true,
            trustServerCertificate: false,
            connectTimeout: 60_000,
            requestTimeout: 60_000,
            enableArithAbort: true,
        },
        pool: {
            max: 5,
            min: 1,
            idleTimeoutMillis: 60_000,
            acquireTimeoutMillis: 60_000,
            createTimeoutMillis: 60_000,
        },
        authentication: {
            type: "default",
            options: {
                userName: DEMO_DB_USER,
                password: DEMO_DB_PASSWORD,
            },
        },
    };
}

//#endregion

//#region Demo Pool Management

/** @type {import("mssql").ConnectionPool | null} */
let _demoPool = null;

/** @type {Promise<import("mssql").ConnectionPool> | null} */
let _demoConnectingPromise = null;

/**
 * Connect to the demo pool with retry/backoff.
 * Mirrors connectWithRetry but uses SQL auth and a smaller pool.
 *
 * @param {number} [maxAttempts=4]
 * @returns {Promise<import("mssql").ConnectionPool>}
 */
async function connectDemoWithRetry(maxAttempts = 4) {
    let attempt = 0;
    /** @type {any} */
    let lastErr = null;

    while (attempt < maxAttempts) {
        attempt += 1;

        try {
            const config = buildDemoConfig();

            log(`[DEMO] Connecting (attempt ${attempt})...`);

            const pool = new sql.ConnectionPool(config);
            const connected = await pool.connect();

            connected.on("error", (err) => {
                logError("[DEMO] Pool error:", err?.message || err);
                if (_demoPool === connected) {
                    _demoPool = null;
                }
            });

            log("[DEMO] Pool connected.");
            return connected;
        } catch (err) {
            lastErr = err;
            const code = err?.code || err?.originalError?.code;
            const message = err?.message || String(err);

            logError(`[DEMO] Connect attempt ${attempt} failed:`, code, message);

            const isTransient =
                TRANSIENT_CODES.has(code) || /socket hang up/i.test(message);

            if (!isTransient) break;

            const delay = Math.min(5_000 * attempt, 15_000);
            log(`[DEMO] Backoff ${delay}ms before retry...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    throw lastErr;
}

/**
 * Get (or create) the demo ConnectionPool.
 * Lazily initialized on first demo request — not warmed up at startup.
 *
 * @returns {Promise<import("mssql").ConnectionPool>}
 */
async function getDemoSqlPool() {
    if (_demoPool && _demoPool.connected) {
        return _demoPool;
    }

    if (_demoConnectingPromise) {
        return _demoConnectingPromise;
    }

    if (!DEMO_DB_USER || !DEMO_DB_PASSWORD) {
        throw new Error(
            "Demo pool requested but DEMO_DB_USER / DEMO_DB_PASSWORD env vars are not set.",
        );
    }

    _demoConnectingPromise = connectDemoWithRetry(4)
        .then((pool) => {
            _demoPool = pool;
            _demoConnectingPromise = null;
            return _demoPool;
        })
        .catch((err) => {
            _demoConnectingPromise = null;
            logError("[DEMO] Error connecting:", err);
            throw err;
        });

    return _demoConnectingPromise;
}

//#endregion

//#region Token Helper (Optional Fallback)

/**
 * Acquire an explicit access token for Azure SQL using DefaultAzureCredential.
 *
 * Used when SQL_FORCE_ACCESS_TOKEN=1 to force the
 * `azure-active-directory-access-token` auth mode.
 *
 * @returns {Promise<string>} A bearer token for https://database.windows.net/.default
 */
async function getSqlAccessToken() {
  log("Requesting Azure SQL access token (DefaultAzureCredential)...");
  const tok = await credential.getToken(
    "https://database.windows.net/.default",
  );
  const token = tok?.token;

  if (!token) {
    throw new Error(
      "No access token returned for https://database.windows.net/.default",
    );
  }

  log("Received Azure SQL access token.");
  return token;
}

//#endregion

//#region Build Config (MSI vs Local Token-Credential)

/**
 * Builds the `mssql` ConnectionPool config object based on environment:
 *
 * - Azure App Service:
 *     Uses `azure-active-directory-msi-app-service`
 *     (system- or user-assigned managed identity).
 *
 * - Local/dev (default):
 *     Uses `token-credential` with DefaultAzureCredential.
 *
 * - Fallback (SQL_FORCE_ACCESS_TOKEN=1):
 *     Uses `azure-active-directory-access-token` with explicit token.
 *
 * Also applies:
 *   - Encrypt + trustServerCertificate=false
 *   - Sensible connection & request timeouts
 *   - Optional driver-level debug flags
 *
 * @returns {Promise<import("mssql").config>}
 */
async function buildConfig() {
  /** @type {{type:string, options?:Record<string, any>}} */
  let authentication;
  let authExplain;

  if (IS_APP_SERVICE) {
    // App Service: MSI-based auth
    authentication = {
      type: "azure-active-directory-msi-app-service",
      options: USER_ASSIGNED_CLIENT_ID
        ? { clientId: USER_ASSIGNED_CLIENT_ID }
        : {},
    };

    authExplain = USER_ASSIGNED_CLIENT_ID
      ? "Using App Service user-assigned MSI (clientId supplied)."
      : "Using App Service system-assigned MSI.";
  } else if (!SQL_FORCE_ACCESS_TOKEN) {
    // Local/dev: token-credential with DefaultAzureCredential
    authentication = {
      type: "token-credential",
      // NOTE: must be `credential`, *not* `tokenCredential`
      options: { credential },
    };

    authExplain = "Using token-credential (DefaultAzureCredential) locally.";
  } else {
    // Fallback: explicit access-token mode
    const token = await getSqlAccessToken();

    authentication = {
      type: "azure-active-directory-access-token",
      options: { token },
    };

    authExplain =
      "Using explicit azure-active-directory-access-token fallback.";
  }

  const options = {
    encrypt: true,
    trustServerCertificate: false,
    connectTimeout: 60_000,
    requestTimeout: 60_000,
    enableArithAbort: true,
    ...(SQL_DEBUG
      ? {
          debug: {
            packet: true,
            data: false,
            payload: false,
            token: false,
          },
        }
      : {}),
  };

  log("Auth mode selected:", {
    type: authentication.type,
    optionKeys: Object.keys(authentication.options || {}),
  });
  log("Auth rationale:", authExplain);

  /** @type {import("mssql").config} */
  const config = {
    server: SQL_SERVER,
    database: SQL_DATABASE,
    port: SQL_PORT,
    options,
    pool: {
      max: 10,
      min: 2,
      idleTimeoutMillis: 60_000,
      acquireTimeoutMillis: 60_000,
      createTimeoutMillis: 60_000,
      destroyTimeoutMillis: 5_000,
      reapIntervalMillis: 1_000,
      createRetryIntervalMillis: 200,
    },
    authentication,
  };

  return config;
}

//#endregion

//#region Connection Pool & Retry Logic

/**
 * Transient error codes that may benefit from retry/backoff.
 * This is not exhaustive but covers common network-related issues.
 */
const TRANSIENT_CODES = new Set([
  "ESOCKET",
  "ECONNRESET",
  "ETIMEDOUT",
  "ETIME",
]);

/** @type {import("mssql").ConnectionPool | null} */
let _pool = null;

/** @type {Promise<import("mssql").ConnectionPool> | null} */
let _connectingPromise = null;

/**
 * Timestamp (ms) of the last real user activity.
 * Updated via touchSqlActivity() from Express middleware on every request.
 * The keep-alive interval uses this to avoid pinging when no users are active.
 * @type {number}
 */
let _lastActivityAt = 0;

/**
 * Attempt to connect to Azure SQL with retry/backoff on transient errors.
 *
 * @param {number} [maxAttempts=4] - Max connection attempts.
 * @returns {Promise<import("mssql").ConnectionPool>}
 */
async function connectWithRetry(maxAttempts = 4) {
    let attempt = 0;
    /** @type {any} */
    let lastErr = null;

    while (attempt < maxAttempts) {
        attempt += 1;

        try {
            const config = await buildConfig();

            log(`Connecting to SQL (attempt ${attempt}) with:`, {
                server: SQL_SERVER,
                database: SQL_DATABASE,
                port: SQL_PORT,
                authType: config.authentication?.type,
            });

            const pool = new sql.ConnectionPool(config);
            const connected = await pool.connect();

            // Null out the shared pool reference on error so the next
            // query triggers a fresh reconnect instead of reusing a pool
            // whose underlying TCP connections have been silently dropped
            // by Azure SQL (~4 min idle kill).
            connected.on("error", (err) => {
                const code = err?.code || err?.originalError?.code;
                logError("SQL pool error:", code, err?.message || err);
                if (_pool === connected) {
                    log("Clearing stale pool reference after error.");
                    _pool = null;
                }
            });

            // Keep-alive: ping every 3 minutes, but only when a real user
            // has been active in the last 10 minutes. This allows the DB to
            // auto-pause during off-hours / off-season on Serverless tier
            // while still keeping connections warm during active use.
            // Self-cancels if this pool is superseded or if the ping fails.
            const KEEP_ALIVE_INTERVAL_MS = 3 * 60 * 1_000;
            const ACTIVITY_WINDOW_MS = 10 * 60 * 1_000;

            const keepAliveInterval = setInterval(async () => {
                if (_pool !== connected) {
                    clearInterval(keepAliveInterval);
                    return;
                }
                const idleMs = Date.now() - _lastActivityAt;
                if (idleMs > ACTIVITY_WINDOW_MS) {
                    log("Keep-alive skipped — no user activity in last 10 min.");
                    return;
                }
                try {
                    await connected.request().query("SELECT 1 AS keepalive;");
                    log("Keep-alive ping OK.");
                } catch (err) {
                    logError("Keep-alive ping failed:", err?.message || err);
                    clearInterval(keepAliveInterval);
                    if (_pool === connected) {
                        _pool = null;
                    }
                }
            }, KEEP_ALIVE_INTERVAL_MS);

            // Don't prevent graceful shutdown just for a ping timer.
            keepAliveInterval.unref();

            log("SQL pool connected.");
            return connected;
        } catch (err) {
            lastErr = err;
            const code = err?.code || err?.originalError?.code;
            const message = err?.message || String(err);

            logError(`Connect attempt ${attempt} failed:`, code, message);

            const isTransient =
                TRANSIENT_CODES.has(code) || /socket hang up/i.test(message);

            if (!isTransient) break;

            const delay = Math.min(5_000 * attempt, 15_000);
            log(`Backoff ${delay}ms before retry...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    // If we exhausted attempts, surface the last error
    throw lastErr;
}

//#endregion

//#region Public API: Pool Management

/**
 * Record the current time as the last user activity timestamp.
 * Call this from Express middleware on every authenticated request.
 * The keep-alive ping checks this to decide whether to fire,
 * allowing the DB to auto-pause when no users are active.
 *
 * @returns {void}
 */
export function touchSqlActivity() {
    _lastActivityAt = Date.now();
}

/**
 * Get (or create) a shared `mssql` ConnectionPool.
 *
 * Behavior:
 * - Reuses an existing connected pool when possible.
 * - Coalesces concurrent connection attempts into a single promise.
 *
 * @returns {Promise<import("mssql").ConnectionPool>}
 */
export async function getSqlPool() {
    const isDemo = demoStorage.getStore()?.isDemo ?? false;

    if (isDemo) {
        log("getSqlPool → routing to demo pool.");
        return getDemoSqlPool();
    }

    log("getSqlPool called...");

    if (_pool && _pool.connected) {
        log("SQL pool already connected.");
        return _pool;
    }

  if (_connectingPromise) {
    log("Awaiting existing connection attempt...");
    return _connectingPromise;
  }

  _connectingPromise = connectWithRetry(4)
    .then((pool) => {
      _pool = pool;
      _connectingPromise = null;
      return _pool;
    })
    .catch((err) => {
      _connectingPromise = null;
      logError("Error connecting to SQL:", err);
      throw err;
    });

  return _connectingPromise;
}

/**
 * Close the shared SQL ConnectionPool, if present.
 * Safe to call during graceful shutdown or test teardown.
 *
 * @returns {Promise<void>}
 */
export async function closeSqlPool() {
  if (_pool) {
    try {
      await _pool.close();
      log("SQL pool closed.");
    } catch (err) {
      logError("Error closing SQL pool:", err);
    } finally {
      _pool = null;
    }
  }
}

//#endregion

//#region Diagnostics / Health Checks

/**
 * Lightweight health probe:
 * - Runs a simple query against sys.database_principals
 * - Verifies the DB is reachable via the current auth mode
 *
 * @returns {Promise<any[]>} First rows from sys.database_principals.
 */
export async function healthProbe() {
  log("Running healthProbe...");
  const pool = await getSqlPool();
  const result = await pool
    .request()
    .query(
      "SELECT TOP (1) name FROM sys.database_principals ORDER BY principal_id;",
    );

  log("healthProbe result:", result.recordset);
  return result.recordset;
}

/**
 * Returns the current login & db-user as seen by SQL Server.
 *
 * @returns {Promise<{login: string, dbuser: string}>}
 */
export async function whoAmI() {
  log("Running whoAmI...");
  const pool = await getSqlPool();
  const result = await pool
    .request()
    .query("SELECT SUSER_SNAME() AS login, USER_NAME() AS dbuser;");

  const row = result.recordset?.[0] || {};
  log("whoAmI result:", row);
  return row;
}

//#endregion

//#region Query Helper

/**
 * Execute a parameterized T‑SQL query using the shared pool.
 *
 * @template T
 * @param {string} sqlText - The T‑SQL statement to execute.
 * @param {(req: import("mssql").Request) => void} [bindParamsFn]
 *        Optional callback to bind input parameters on the Request.
 * @returns {Promise<import("mssql").IResult<T>>}
 */
export async function query(sqlText, bindParamsFn) {
    const isDemo = demoStorage.getStore()?.isDemo ?? false;
    const pool   = await getSqlPool();

    // In demo context, redirect all explicit dbo.* references to demo.*
    // so dbSync.js queries hit the demo schema without any changes there.
    const effectiveSql = isDemo
        ? sqlText.replace(/\bdbo\./gi, "demo.")
        : sqlText;

    const req = pool.request();

    if (typeof bindParamsFn === "function") {
        try {
            bindParamsFn(req);
        } catch (err) {
            logError("Error applying bindParamsFn:", err);
            throw err;
        }
    }

    const res = await req.query(effectiveSql);
    return res;
}

//#endregion
