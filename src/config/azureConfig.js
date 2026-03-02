// ============================================================
// azureConfig.js
// Purpose:
//   - Unified configuration + secret loading layer
//   - Pulls secrets from Azure Key Vault (DefaultAzureCredential)
//   - Falls back to local .env when running locally
//   - Provides getConfig(), getSqlPool(), query(), whoAmI(), healthProbe()
//   - Used by index.js + dbSync.js
//
// Works With:
//   - ../lib/sql.js → Actual SQL driver + pool logic
//   - index.js → Loads config once at startup
//   - dbSync.js → Uses query(), whoAmI(), healthProbe()
// ============================================================

//#region Imports
import dotenv from 'dotenv/config';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import {
  getSqlPool as _getSqlPool,
  query as _query,
  whoAmI as _whoAmI,
  healthProbe as _healthProbe
} from '../../lib/sql.js';

//#endregion

//#region Logging Helpers
function log(...args) {
  console.log(`[${new Date().toISOString()}] [azureConfig.js]`, ...args);
}
function logError(...args) {
  console.error(`[${new Date().toISOString()}] [azureConfig.js]`, ...args);
}
//#endregion

// ============================================================
// Environment + Key Vault Setup
// ============================================================

//#region Vault Setup
const vaultUrl =
  process.env.AZURE_KEY_VAULT_URL ||
  "https://ApiStorage.vault.azure.net/";

const credential = new DefaultAzureCredential();
const secretClient = new SecretClient(vaultUrl, credential);
//#endregion

// ============================================================
// Internal Config Cache
// ============================================================
let CONFIG = null;
let LOADED = false;

// Secrets to load from key vault
const SECRET_MAP = {
  KICKBOX_API_KEY: "kickboxBrowser",
  TWILIO_ACCOUNT_SID: "TwilioSID",
  TWILIO_AUTH_TOKEN: "TwilioAuthToken",
  AZSQLServer: "AZSQLServer",
  AZSQLDB: "AZSQLDB",
  AZSQLPort: "AZSQLPort",
  SESSION_SECRET: "CookieSession"
};

// ============================================================
// Helper: Load secrets from Azure Key Vault
// ============================================================
async function loadSecretsFromKeyVault() {
  log("Loading secrets from Azure Key Vault...");

  const output = {};

  for (const [envVar, kvName] of Object.entries(SECRET_MAP)) {
    try {
      const sec = await secretClient.getSecret(kvName);
      output[envVar] = sec.value;
    } catch (err) {
      logError(`KeyVault: Missing secret ${kvName}:`, err.message);
      // Not fatal — fallback to .env or undefined
      output[envVar] = process.env[envVar];
    }
  }

  return output;
}

// ============================================================
// getConfig()
//   - Loads secrets 1 time
//   - Uses KeyVault in production, .env in local
// ============================================================
export async function getConfig() {
  if (LOADED) return CONFIG;

  const isProd = process.env.NODE_ENV === "production";

  let secrets = {};

  if (isProd) {
    try {
      secrets = await loadSecretsFromKeyVault();
    } catch (err) {
      logError("KeyVault load failed, falling back to environment:", err);
      secrets = {};
    }
  }

  // Final resolved config with fallback to .env
  CONFIG = {
    NODE_ENV: process.env.NODE_ENV || "development",

    // SQL
    AZSQLServer: secrets.AZSQLServer || process.env.AZSQLServer,
    AZSQLDB: secrets.AZSQLDB || process.env.AZSQLDB,
    AZSQLPort: secrets.AZSQLPort || process.env.AZSQLPort || 1433,

    // Twilio
    TWILIO_ACCOUNT_SID:
      secrets.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN:
      secrets.TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN,

    // Kickbox
    KICKBOX_API_KEY:
      secrets.KICKBOX_API_KEY || process.env.KICKBOX_API_KEY,

    // Session
    sessionSecret:
      secrets.SESSION_SECRET || process.env.SESSION_SECRET || "fallback-secret",

    // Port
    PORT: process.env.PORT || 3000
  };

  LOADED = true;

  log("Final CONFIG:", {
    environment: CONFIG.NODE_ENV,
    server: CONFIG.AZSQLServer,
    db: CONFIG.AZSQLDB,
    port: CONFIG.AZSQLPort,
    twilioSid: !!CONFIG.TWILIO_ACCOUNT_SID,
    twilioTok: !!CONFIG.TWILIO_AUTH_TOKEN,
    kickbox: !!CONFIG.KICKBOX_API_KEY
  });

  return CONFIG;
}

// ============================================================
// Pass-through wrappers for lib/sql.js so index.js/dbSync.js
// always import them from here.
// ============================================================

export async function getSqlPool() {
  return _getSqlPool();
}

export async function query(sqlText, bindFn) {
  return _query(sqlText, bindFn);
}

export async function whoAmI() {
  return _whoAmI();
}

export async function healthProbe() {
  return _healthProbe();
}