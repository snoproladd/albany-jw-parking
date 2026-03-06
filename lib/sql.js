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
    connectTimeout: 30_000,
    requestTimeout: 30_000,
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
      min: 0,
      idleTimeoutMillis: 30_000,
      acquireTimeoutMillis: 30_000,
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

      // Attach error listener to the pool for diagnostics
      connected.on("error", (err) => {
        const code = err?.code || err?.originalError?.code;
        logError("SQL pool error:", code, err?.message || err);
      });

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
 * Get (or create) a shared `mssql` ConnectionPool.
 *
 * Behavior:
 * - Reuses an existing connected pool when possible.
 * - Coalesces concurrent connection attempts into a single promise.
 *
 * @returns {Promise<import("mssql").ConnectionPool>}
 */
export async function getSqlPool() {
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
  const pool = await getSqlPool();
  const req = pool.request();

  if (typeof bindParamsFn === "function") {
    try {
      bindParamsFn(req);
    } catch (err) {
      logError("Error applying bindParamsFn:", err);
      throw err;
    }
  }

  const res = await req.query(sqlText);
  return res;
}

//#endregion
