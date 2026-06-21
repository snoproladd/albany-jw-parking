/**
 * @file scripts/devSms.js
 * @description Starts an ngrok tunnel and points the Twilio Messaging Service
 *              inbound webhook to the local dev server. Reverts the webhook
 *              to production automatically on exit (Ctrl+C).
 *
 * Usage: npm run dev:sms
 *
 * Requires the ngrok CLI to be installed and authenticated.
 */

import "dotenv/config";
import { spawn, execSync } from "child_process";
import twilio from "twilio";

const MESSAGING_SERVICE_SID = "MG93cbbb4e3111600112cc65d469df9fa0";
const NGROK_DOMAIN = "debunk-chamber-confined.ngrok-free.dev";
const PROD_URL =
  "https://albanyjwparking.azurewebsites.net/webhook/sms/incoming";
const DEV_URL = `https://${NGROK_DOMAIN}/webhook/sms/incoming`;
const LOCAL_PORT = 3000;

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;

/**
 * Kills any process currently listening on the given port.
 * Silently no-ops if the port is already free.
 * @param {number} port
 * @returns {void}
 */
function killPort(port) {
    try {
        const out = execSync(
            `netstat -ano | findstr :${port} | findstr LISTENING`,
            { shell: true, encoding: 'utf8' }
        );
        const pids = [...new Set(
            out.trim().split('\n')
               .map((l) => l.trim().split(/\s+/).at(-1))
               .filter(Boolean)
        )];
        for (const pid of pids) {
            execSync(`taskkill /PID ${pid} /F`, { shell: true });
            console.log(`Killed existing process on port ${port} (PID ${pid})`);
        }
    } catch {
        // Port already free — nothing to do
    }
}

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
  console.error(
    "Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in environment.",
  );
  process.exit(1);
}

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

/**
 * Updates the Twilio Messaging Service inbound webhook.
 * @param {string} primary  - Primary inbound request URL.
 * @param {string} fallback - Fallback URL (empty string to clear).
 * @returns {Promise<void>}
 */
async function setWebhook(primary, fallback) {
  await client.messaging.v1.services(MESSAGING_SERVICE_SID).update({
    inboundRequestUrl: primary,
    fallbackUrl: fallback,
  });
}

/**
 * Reverts Twilio to production webhook and exits cleanly.
 * @param {import('child_process').ChildProcess} ngrokProc - The ngrok process to kill.
 * @returns {Promise<void>}
 */
async function cleanup(ngrokProc) {
  console.log("\nShutting down...");
  ngrokProc.kill();
  try {
    await setWebhook(PROD_URL, "");
    console.log("✓ Twilio webhook reverted to prod.");
  } catch (err) {
    console.error("Failed to revert Twilio webhook:", err.message);
    console.error("Run `npm run webhook:prod` manually to restore.");
  }
  process.exit(0);
}

// Kill anything already on the port before starting
killPort(LOCAL_PORT);

// Kill anything already on the port before starting
killPort(LOCAL_PORT);

// Start ngrok tunnel
console.log(`Starting ngrok tunnel on port ${LOCAL_PORT}...`);
const ngrokProc = spawn(
  "ngrok",
  ["http", `--domain=${NGROK_DOMAIN}`, String(LOCAL_PORT)],
  {
    stdio: "inherit",
  },
);

ngrokProc.on("error", (err) => {
  console.error(
    "Failed to start ngrok (is the CLI installed and in PATH?):",
    err.message,
  );
  process.exit(1);
});

// Give ngrok a moment to establish the tunnel before switching Twilio
await new Promise((resolve) => setTimeout(resolve, 2000));

try {
  await setWebhook(DEV_URL, PROD_URL);
  console.log(`✓ Twilio webhook → dev:  ${DEV_URL}`);
  console.log(`  (fallback → prod: ${PROD_URL})`);
  console.log("\nPress Ctrl+C to stop ngrok and revert webhook to prod.\n");
} catch (err) {
  console.error("Failed to update Twilio webhook:", err.message);
  ngrokProc.kill();
  process.exit(1);
}

process.on("SIGINT", () => cleanup(ngrokProc));
process.on("SIGTERM", () => cleanup(ngrokProc));
