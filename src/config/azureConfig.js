// src/config/azureConfig.js
// -----------------------------------------------------------------------------
// Azure + Environment Configuration Layer
//
// Purpose:
//   - Load secrets from Azure Key Vault in production using DefaultAzureCredential
//   - Fall back to local .env values during development
//   - Provide a unified CONFIG object consumed by:
//       • index.js (server bootstrap)
//       • dbSync.js (DB utilities)
//       • lib/sql.js (SQL connection pool + queries)
//   - Expose SQL helpers (getSqlPool, query, whoAmI, healthProbe) so callers
//     never import sql.js directly.
//
// Notes:
//   - Never expose secrets to the frontend.
//   - Designed to be loaded ONCE per process.
//   - Safe to import anywhere in the backend.
//
// -----------------------------------------------------------------------------

//#region Imports
import dotenv from "dotenv/config";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import {
  getSqlPool as _getSqlPool,
  query as _query,
  whoAmI as _whoAmI,
  healthProbe as _healthProbe,
} from "../../lib/sql.js";
//#endregion

//#region Logging Helpers

/**
 * Lightweight timestamped logger for informational output.
 * @param  {...any} args
 */
function log(...args) {
  console.log(`[${new Date().toISOString()}] [azureConfig]`, ...args);
}

/**
 * Lightweight timestamped error logger.
 * @param  {...any} args
 */
function logError(...args) {
  console.error(`[${new Date().toISOString()}] [azureConfig:ERROR]`, ...args);
}

//#endregion

// ============================================================================
// Azure Key Vault Setup
// ============================================================================

/**
 * Determines which Key Vault URI to use.
 * Falls back to local development vault for safety.
 */
const vaultUrl =
  process.env.AZURE_KEY_VAULT_URL || "https://ApiStorage.vault.azure.net/";

/** Default credential chain:
 *  - Managed Identity (Azure VM / App Service / Function)
 *  - VS Code logged-in identity
 *  - Azure CLI
 *  - Environment variables (CLIENT_ID, etc.)
 */
const credential = new DefaultAzureCredential();

/** Shared Key Vault client */
const secretClient = new SecretClient(vaultUrl, credential);

// ============================================================================
// Internal CONFIG Cache
// ============================================================================
let CONFIG = null;
let LOADED = false;

/**
 * Maps environment variable names → Key Vault secret names.
 *
 * Example:
 *   SECRET_MAP.KICKBOX_API_KEY === "kickboxBrowser"
 *
 * Values in CONFIG follow these resolution rules:
 *   1. Key Vault secret
 *   2. Local environment (.env)
 *   3. Default fallback (if defined)
 */
const SECRET_MAP = Object.freeze({
  KICKBOX_API_KEY: "kickboxBrowser",
  TWILIO_ACCOUNT_SID: "TwilioSID",
  TWILIO_AUTH_TOKEN: "TwilioAuthToken",
  AZSQLServer: "AZSQLServer",
  AZSQLDB: "AZSQLDB",
  AZSQLPort: "AZSQLPort",
  SESSION_SECRET: "CookieSession",
});

// ============================================================================
// Helper: Fetch secrets from Azure Key Vault
// ============================================================================

/**
 * Loads secrets from Azure Key Vault for all keys in SECRET_MAP.
 * If Azure throws for a secret:
 *   - Logs the issue
 *   - Falls back to process.env for that specific key
 *
 * @returns {Promise<Record<string,string>>}
 */
async function loadSecretsFromKeyVault() {
  log("Fetching secrets from Azure Key Vault:", vaultUrl);

  const output = {};

  for (const [envVar, kvName] of Object.entries(SECRET_MAP)) {
    try {
      const sec = await secretClient.getSecret(kvName);
      output[envVar] = sec.value;
    } catch (err) {
      logError(
        `KeyVault: Missing or inaccessible secret "${kvName}" →`,
        err.message,
      );

      // Gracefully fallback to .env (or undefined)
      output[envVar] = process.env[envVar];
    }
  }

  return output;
}

// ============================================================================
// getConfig() — Main exported configuration loader
// ============================================================================

/**
 * Loads and returns CONFIG exactly once.
 *
 * Production flow:
 *   - Try Key Vault for all secrets
 *   - Log failures, fallback to .env
 * Development flow:
 *   - Only use .env (no Key Vault unless manually enabled)
 *
 * @returns {Promise<Record<string,any>>} CONFIG
 */
export async function getConfig() {
  if (LOADED) return CONFIG;

  const isProd = process.env.NODE_ENV === "production";
  let secrets = {};

  if (isProd) {
    try {
      secrets = await loadSecretsFromKeyVault();
    } catch (err) {
      logError("KeyVault load failed → falling back to environment:", err);
      secrets = {};
    }
  }

  // Final resolved configuration
  CONFIG = {
    NODE_ENV: process.env.NODE_ENV || "development",

    // -----------------------------------------------------------------------
    // SQL Settings
    // -----------------------------------------------------------------------
    AZSQLServer: secrets.AZSQLServer || process.env.AZSQLServer,
    AZSQLDB: secrets.AZSQLDB || process.env.AZSQLDB,
    AZSQLPort: Number(secrets.AZSQLPort || process.env.AZSQLPort || 1433),

    // -----------------------------------------------------------------------
    // Twilio
    // -----------------------------------------------------------------------
    TWILIO_ACCOUNT_SID:
      secrets.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN:
      secrets.TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN,

    // -----------------------------------------------------------------------
    // Kickbox
    // -----------------------------------------------------------------------
    KICKBOX_API_KEY: secrets.KICKBOX_API_KEY || process.env.KICKBOX_API_KEY,

    // -----------------------------------------------------------------------
    // Session / Cookies
    // -----------------------------------------------------------------------
    sessionSecret:
      secrets.SESSION_SECRET || process.env.SESSION_SECRET || "fallback-secret",

    // -----------------------------------------------------------------------
    // Runtime Port
    // -----------------------------------------------------------------------
    PORT: Number(process.env.PORT || 3000),
  };

  LOADED = true;

  // Log only safe values
  log("CONFIG loaded:", {
    environment: CONFIG.NODE_ENV,
    sqlServer: CONFIG.AZSQLServer,
    sqlDb: CONFIG.AZSQLDB,
    sqlPort: CONFIG.AZSQLPort,
    twilioConfigured: Boolean(CONFIG.TWILIO_ACCOUNT_SID),
    kickboxConfigured: Boolean(CONFIG.KICKBOX_API_KEY),
  });

  return CONFIG;
}

// ============================================================================
// SQL Helpers — pass-through re-exports from lib/sql.js
// ============================================================================

/**
 * Returns the existing global SQL connection pool,
 * or initializes a new one.
 */
export async function getSqlPool() {
  return _getSqlPool();
}

/**
 * Executes a SQL query using the pool.
 *
 * @param {string} sqlText
 * @param {(req:import("tedious").Request)=>void} [bindFn]
 */
export async function query(sqlText, bindFn) {
  return _query(sqlText, bindFn);
}

/**
 * Returns identity + DB info for debugging (SELECT CURRENT_USER, etc.)
 */
export async function whoAmI() {
  return _whoAmI();
}

/**
 * Performs a lightweight health probe query.
 */
export async function healthProbe() {
  return _healthProbe();
}
