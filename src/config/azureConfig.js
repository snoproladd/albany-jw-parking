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
//   - Expose SQL helpers (getSqlPool, query, whoAmI, healthProbe)
// -----------------------------------------------------------------------------

// ============================================================================
// 1. Load .env (Dev only, no-op in production)
// ============================================================================
import "dotenv/config";  // <-- This loads .env before anything else

// ============================================================================
// 2. Imports
// ============================================================================
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import {
  getSqlPool as _getSqlPool,
  query as _query,
  whoAmI as _whoAmI,
  healthProbe as _healthProbe,
} from "../../lib/sql.js";

// ============================================================================
// Logging Helpers
// ============================================================================
function log(...args) {
  console.log(`[${new Date().toISOString()}] [azureConfig]`, ...args);
}

function logError(...args) {
  console.error(`[${new Date().toISOString()}] [azureConfig:ERROR]`, ...args);
}

// ============================================================================
// Azure Key Vault Setup
// ============================================================================
const vaultUrl =
  process.env.AZURE_KEY_VAULT_URL || "https://ApiStorage.vault.azure.net/";

const credential = new DefaultAzureCredential();
const secretClient = new SecretClient(vaultUrl, credential);

// ============================================================================
// Secret Mapping
// ============================================================================
const SECRET_MAP = Object.freeze({
  KICKBOX_API_KEY: "kickboxBrowser",
  TWILIO_ACCOUNT_SID: "TwilioSID",
  TWILIO_AUTH_TOKEN: "TwilioAuthToken",
  TWILIO_MSG_SID: "TwilioMsgSID",
  AZSQLServer: "AZSQLServer",
  AZSQLDB: "AZSQLDB",
  AZSQLPort: "AZSQLPort",
  SESSION_SECRET: "CookieSession",
  IONOS_SMTP_HOST: "IonosSMTPHost",
  IONOS_SMTP_PORT: "IonosSMTPPort",
  IONOS_SMTP_USER_INFO: "IonosSMTPUserInfo",
  IONOS_SMTP_PASS: "IonosSMTPPass",
});

// ============================================================================
// Load Secrets from Key Vault
// ============================================================================
async function loadSecretsFromKeyVault() {
  log("Fetching secrets from Azure Key Vault:", vaultUrl);

  const output = {};

  await Promise.all(
    Object.entries(SECRET_MAP).map(async ([envVar, kvName]) => {
      try {
        const sec = await secretClient.getSecret(kvName);
        output[envVar] = sec.value;
      } catch (err) {
        logError(
          `KeyVault: Missing or inaccessible secret "${kvName}" →`,
          err.message,
        );
        output[envVar] = process.env[envVar];
      }
    }),
  );

  return output;
}

// ============================================================================
// CONFIG Cache
// ============================================================================
let CONFIG = null;
let LOADED = false;

// ============================================================================
// getConfig()
// ============================================================================
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

  CONFIG = {
    NODE_ENV: process.env.NODE_ENV || "development",

    // SQL CONFIG
    AZSQLServer: secrets.AZSQLServer || process.env.AZSQLServer,
    AZSQLDB: secrets.AZSQLDB || process.env.AZSQLDB,
    AZSQLPort: Number(secrets.AZSQLPort || process.env.AZSQLPort || 1433),

    // Twilio
    TWILIO_ACCOUNT_SID:
      secrets.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN:
      secrets.TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN,
    TWILIO_MSG_SID:
      secrets.TWILIO_MSG_SID || process.env.TWILIO_MSG_SID,

    // Kickbox
    KICKBOX_API_KEY: secrets.KICKBOX_API_KEY || process.env.KICKBOX_API_KEY,

    // IONOS SMTP
    IONOS_SMTP_HOST: secrets.IONOS_SMTP_HOST || process.env.IONOS_SMTP_HOST,
    IONOS_SMTP_PORT: Number(
      secrets.IONOS_SMTP_PORT || process.env.IONOS_SMTP_PORT || 587,
    ),
    IONOS_SMTP_USER_INFO: secrets.IONOS_SMTP_USER_INFO || process.env.IONOS_SMTP_USER_INFO,
    IONOS_SMTP_PASS: secrets.IONOS_SMTP_PASS || process.env.IONOS_SMTP_PASS,

    // Sessions
    sessionSecret:
      secrets.SESSION_SECRET || process.env.SESSION_SECRET || "fallback-secret",

    // Port
    PORT: Number(process.env.PORT || 3000),
  };

  LOADED = true;

  // Safe log
  log("CONFIG loaded:", {
    environment: CONFIG.NODE_ENV,
    sqlServer: CONFIG.AZSQLServer,
    sqlDb: CONFIG.AZSQLDB,
    sqlPort: CONFIG.AZSQLPort,
    twilioConfigured: Boolean(CONFIG.TWILIO_ACCOUNT_SID),
    twilioMsgConfigured: Boolean(CONFIG.TWILIO_MSG_SID),
    kickboxConfigured: Boolean(CONFIG.KICKBOX_API_KEY),
    ionosSmtpConfigured: Boolean(CONFIG.IONOS_SMTP_HOST && CONFIG.IONOS_SMTP_USER_INFO),
  });

  return CONFIG;
}

// ============================================================================
// SQL Helper Re-Exports
// ============================================================================
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