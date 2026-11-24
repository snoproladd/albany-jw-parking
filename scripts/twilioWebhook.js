/**
 * @file scripts/twilioWebhook.js
 * @description CLI utility to toggle the Twilio Messaging Service inbound webhook
 *              between the production and local dev (ngrok) URLs.
 *
 * Usage:
 *   node scripts/twilioWebhook.js prod
 *   node scripts/twilioWebhook.js dev
 *
 * Or via npm:
 *   npm run webhook:prod
 *   npm run webhook:dev
 *
 * Delivery status callbacks (publish texts) are set per message, not here:
 * the app uses TWILIO_STATUS_CALLBACK_BASE, else its own address. In dev
 * mode this prints the .env line that points them at ngrok too.
 */

import "dotenv/config";
import twilio from "twilio";

const MESSAGING_SERVICE_SID = "MG93cbbb4e3111600112cc65d469df9fa0";


const PROD_URL = 'https://albanyjwparking.azurewebsites.net/webhook/sms/incoming';

const URLS = {
    prod: { inboundRequestUrl: PROD_URL, fallbackUrl: '' },
    dev:  { inboundRequestUrl: 'https://debunk-chamber-confined.ngrok-free.dev/webhook/sms/incoming', fallbackUrl: PROD_URL },
};

const mode = process.argv[2];

if (!URLS[mode]) {
  console.error("Usage: node scripts/twilioWebhook.js <prod|dev>");
  process.exit(1);
}

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
  console.error(
    "Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in environment.",
  );
  process.exit(1);
}

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

try {
await client.messaging.v1.services(MESSAGING_SERVICE_SID).update({
        inboundRequestUrl: URLS[mode].inboundRequestUrl,
        fallbackUrl:       URLS[mode].fallbackUrl,
    });
  console.log(`✓ Twilio inbound webhook → [${mode}]: ${URLS[mode].inboundRequestUrl   }`);
  if (mode === "dev") {
    const base = new URL(URLS.dev.inboundRequestUrl).origin;
    console.log(`  For delivery tracking of texts sent locally, put this in .env and restart:`);
    console.log(`  TWILIO_STATUS_CALLBACK_BASE=${base}`);
  } else {
    console.log("  Remove TWILIO_STATUS_CALLBACK_BASE from your local .env if you set it for dev.");
  }
} catch (err) {
  console.error("Twilio API error:", err.message);
  process.exit(1);
}
