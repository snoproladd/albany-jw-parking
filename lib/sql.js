// =========================
// lib/sql.js (ESM)
// Purpose:
// - Provide a shared, pooled connection to Azure SQL using the `mssql` driver
// - Support both:
//     • Local/dev via DefaultAzureCredential token-credential
//     • Azure App Service via Managed Identity (MSI) auth modes
// - Centralize retry/backoff logic and basic health/diagnostic queries
//
// Works With:
// - ./lib/dbSync.js → high-level DB helpers using `query()`
// - index.js        → calls getSqlPool() to warm up SQL pool at startup
//
// Notes:
// - Auth modes mirror what the mssql driver supports:
//     • azure-active-directory-msi-app-service
//     • token-credential (DefaultAzureCredential)
//     • azure-active-directory-access-token (fallback)
// =========================

//#region Imports & Logging

import sql from 'mssql';
import { DefaultAzureCredential } from '@azure/identity';

/**
 * General log helper.
 * Prefixes messages with ISO timestamp and file tag.
 * @param {...any} args
 */
function log(...args) {
  console.log(`[${new Date().toISOString()}] [lib/sql.js]`, ...args);
}

/**
 * Error log helper.
 * @param {...any} args
 */
function logError(...args) {
  console.error(`[${new Date().toISOString()}] [lib/sql.js]`, ...args);
}

//#endregion

//#region Azure Credential & Env Config

// Shared DefaultAzureCredential instance (supports:
// - VS Code / Azure CLI / Managed Identity / etc.)
const credential = new DefaultAzureCredential();

/**
 * Accept multiple common environment variable names so
 * local, dev, and App Service configurations all work:
 *
 * - SQL_SERVER:
 *     AZSQLServer / AZURE_SQL_SERVER / SQL_SERVER
 * - SQL_DATABASE:
 *     AZSQLDB / AZURE_SQL_DATABASE / SQL_DATABASE
 * - SQL_PORT:
 *     AZSQLPort / AZURE_SQL_PORT / SQL_PORT / default 1433
 */
const SQL_SERVER =
  process.env.AZSQLServer ||
  process.env.AZURE_SQL_SERVER ||
  process.env.SQL_SERVER ||
  '';

const SQL_DATABASE =
  process.env.AZSQLDB ||
  process.env.AZURE_SQL_DATABASE ||
  process.env.SQL_DATABASE ||
  '';

const SQL_PORT = Number(
  process.env.AZSQLPort ||
  process.env.AZURE_SQL_PORT ||
  process.env.SQL_PORT ||
  1433
);

// Flag for Azure App Service: WEBSITE_SITE_NAME is present
const IS_APP_SERVICE = !!process.env.WEBSITE_SITE_NAME;

// Optional: user‑assigned managed identity clientId
const USER_ASSIGNED_CLIENT_ID = process.env.AZURE_CLIENT_ID;

// Debug / diagnostics flags
const SQL_DEBUG = process.env.SQL_DEBUG === '1';
const SQL_FORCE_ACCESS_TOKEN = process.env.SQL_FORCE_ACCESS_TOKEN === '1';

log('Loaded SQL config:', {
  server: SQL_SERVER,
  database: SQL_DATABASE,
  port: SQL_PORT,
  isAppService: IS_APP_SERVICE,
  websiteSiteName: process.env.WEBSITE_SITE_NAME || '',
  azureClientId: USER_ASSIGNED_CLIENT_ID || ''
});

log('Env snapshot:', {
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
  AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID
});

//#endregion

//#region Sanity Checks

if (
  !SQL_SERVER ||
  typeof SQL_SERVER !== 'string' ||
  !SQL_SERVER.includes('.database.windows.net')
) {
  logError('Invalid SQL_SERVER (variants):', {
    AZSQLServer: process.env.AZSQLServer,
    AZURE_SQL_SERVER: process.env.AZURE_SQL_SERVER,
    SQL_SERVER: process.env.SQL_SERVER
  });
  throw new Error(
    `Invalid SQL server FQDN; expected like 'albanyregional.database.windows.net', got '${SQL_SERVER || ''}'`
  );
}

if (!SQL_DATABASE || typeof SQL_DATABASE !== 'string') {
  logError('Invalid SQL_DATABASE (variants):', {
    AZSQLDB: process.env.AZSQLDB,
    AZURE_SQL_DATABASE: process.env.AZURE_SQL_DATABASE,
    SQL_DATABASE: process.env.SQL_DATABASE
  });
  throw new Error(
    `Invalid SQL database; got '${SQL_DATABASE || ''}'`
  );
}

if (!Number.isFinite(SQL_PORT) || SQL_PORT <= 0) {
  logError('Invalid SQL_PORT (variants):', {
    AZSQLPort: process.env.AZSQLPort,
    AZURE_SQL_PORT: process.env.AZURE_SQL_PORT,
    SQL_PORT: process.env.SQL_PORT
  });
  throw new Error(`Invalid SQL port; got '${SQL_PORT}'`);
}

//#endregion

//#region Token Helper (Optional Fallback)

/**
 * Acquire an explicit access token for Azure SQL using DefaultAzureCredential.
 * This is mainly used when SQL_FORCE_ACCESS_TOKEN=1, to force
 * an `azure-active-directory-access-token` auth mode.
 *
 * @returns {Promise<string>} A bearer token for https://database.windows.net/.default
 */
async function getSqlAccessToken() {
  log('Requesting Azure SQL access token (DefaultAzureCredential)...');
  const tok = await credential.getToken(
    'https://database.windows.net/.default'
  );
  const token = tok?.token;

  if (!token) {
    throw new Error(
      'No access token returned for https://database.windows.net/.default'
    );
  }

  log('Received Azure SQL access token.');
  return token;
}

//#endregion

//#region Build Config (MSI vs Local Token-Credential)

/**
 * Build the `mssql` ConnectionPool config object based on environment:
 *
 * - App Service:
 *   Uses `azure-active-directory-msi-app-service`
 *   (system- or user-assigned managed identity).
 *
 * - Local (default):
 *   Uses `token-credential` with DefaultAzureCredential.
 *
 * - Fallback (SQL_FORCE_ACCESS_TOKEN=1):
 *   Uses `azure-active-directory-access-token` with an explicit token.
 *
 * Includes basic timeouts & optional driver-level debug flags.
 *
 * @returns {Promise<import('mssql').config>}
 */
async function buildConfig() {
  let authentication;
  let authExplain;

  if (IS_APP_SERVICE) {
    // App Service: MSI-based auth
    authentication = {
      type: 'azure-active-directory-msi-app-service',
      options: USER_ASSIGNED_CLIENT_ID ? { clientId: USER_ASSIGNED_CLIENT_ID } : {}
    };

    authExplain = USER_ASSIGNED_CLIENT_ID
      ? 'Using App Service user-assigned MSI (clientId supplied).'
      : 'Using App Service system-assigned MSI.';
  } else if (!SQL_FORCE_ACCESS_TOKEN) {
    // Local/dev: token-credential with DefaultAzureCredential
    authentication = {
      type: 'token-credential',
      options: { credential } // NOTE: must be `credential`, not `tokenCredential`
    };

    authExplain = 'Using token-credential (DefaultAzureCredential) locally.';
  } else {
    // Fallback: explicit access-token mode
    const token = await getSqlAccessToken();

    authentication = {
      type: 'azure-active-directory-access-token',
      options: { token }
    };

    authExplain =
      'Using explicit azure-active-directory-access-token fallback.';
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
            token: false
          }
        }
      : {})
  };

  log('Auth mode selected:', {
    type: authentication.type,
    optionKeys: Object.keys(authentication.options || {})
  });
  log('Auth rationale:', authExplain);

  return {
    server: SQL_SERVER,
    database: SQL_DATABASE,
    port: SQL_PORT,
    options,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30_000,
      acquireTimeoutMillis: 30_000
    },
    authentication
  };
}

//#endregion

//#region Connection Pool & Retry Logic

// Transient error codes that may benefit from retry
const TRANSIENT_CODES = new Set(['ESOCKET', 'ECONNRESET', 'ETIMEDOUT', 'ETIME']);

/** @type {import('mssql').ConnectionPool | null} */
let _pool = null;

/** @type {Promise<import('mssql').ConnectionPool> | null} */
let _connectingPromise = null;

/**
 * Attempt to connect to Azure SQL with retry/backoff on transient errors.
 *
 * @param {number} [maxAttempts=4] - Max connection attempts
 * @returns {Promise<import('mssql').ConnectionPool>}
 */
async function connectWithRetry(maxAttempts = 4) {
  let attempt = 0;
  let lastErr = null;

  while (attempt < maxAttempts) {
    attempt += 1;

    try {
      const config = await buildConfig();

      log(`Connecting to SQL (attempt ${attempt}) with:`, {
        server: SQL_SERVER,
        database: SQL_DATABASE,
        port: SQL_PORT,
        authType: config.authentication?.type
      });

      const pool = new sql.ConnectionPool(config);
      const connected = await pool.connect();

      // Attach error listener to the pool for diagnostics
      connected.on('error', (err) => {
        const code = err?.code || err?.originalError?.code;
        logError('SQL pool error:', code, err?.message || err);
      });

      log('SQL pool connected.');
      return connected;
    } catch (err) {
      lastErr = err;
      const code = err?.code || err?.originalError?.code;
      const message = err?.message || String(err);

      logError(`Connect attempt ${attempt} failed:`, code, message);

      const isTransient =
        TRANSIENT_CODES.has(code) || /socket hang up/i.test(message);

      if (!isTransient) break;

      const delay = Math.min(5000 * attempt, 15_000);
      log(`Backoff ${delay}ms before retry...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // If we exhausted attempts, surface the last error
  throw lastErr;
}

//#endregion

//#region Public API: Pool Management

/**
 * Get (or create) a shared mssql ConnectionPool.
 * - Reuses an existing connected pool when possible
 * - Coalesces concurrent connection attempts into a single promise
 *
 * @returns {Promise<import('mssql').ConnectionPool>}
 */
export async function getSqlPool() {
  log('getSqlPool called...');

  if (_pool && _pool.connected) {
    log('SQL pool already connected.');
    return _pool;
  }

  if (_connectingPromise) {
    log('Awaiting existing connection attempt...');
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
      logError('Error connecting to SQL:', err);
      throw err;
    });

  return _connectingPromise;
}

/**
 * Close the shared SQL ConnectionPool, if present.
 * Safe to call during graceful shutdown.
 *
 * @returns {Promise<void>}
 */
export async function closeSqlPool() {
  if (_pool) {
    try {
      await _pool.close();
      log('SQL pool closed.');
    } catch (err) {
      logError('Error closing SQL pool:', err);
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
 * - Verifies the DB is reachable via current auth mode
 *
 * @returns {Promise<Array<any>>} First principal row (or rows) from sys.database_principals
 */
export async function healthProbe() {
  log('Running healthProbe...');
  const pool = await getSqlPool();
  const result = await pool
    .request()
    .query(
      'SELECT TOP (1) name FROM sys.database_principals ORDER BY principal_id;'
    );

  log('healthProbe result:', result.recordset);
  return result.recordset;
}

/**
 * Return the current login & db-user as seen by SQL Server.
 *
 * @returns {Promise<{login: string, dbuser: string}>}
 */
export async function whoAmI() {
  log('Running whoAmI...');
  const pool = await getSqlPool();
  const result = await pool
    .request()
    .query('SELECT SUSER_SNAME() AS login, USER_NAME() AS dbuser;');

  const row = result.recordset?.[0] || {};
  log('whoAmI result:', row);
  return row;
}

//#endregion

//#region Query Helper

/**
 * Execute a parameterized T‑SQL query using the shared pool.
 *
 * @template T
 * @param {string} sqlText - The T‑SQL statement to execute.
 * @param {(req: import('mssql').Request) => void} [bindParamsFn]
 *        Optional callback to bind input parameters on the Request.
 * @returns {Promise<import('mssql').IResult<T>>}
 */
export async function query(sqlText, bindParamsFn) {
  const pool = await getSqlPool();
  const req = pool.request();

  if (typeof bindParamsFn === 'function') {
    try {
      bindParamsFn(req);
    } catch (err) {
      logError('Error applying bindParamsFn:', err);
      throw err;
    }
  }

  const res = await req.query(sqlText);
  return res;
}

//#endregion