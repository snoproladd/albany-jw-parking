/**
 * @file scripts/generateMagicLink.js
 * @description Generates a new magic-link login token for a volunteer
 * account, persists its hash to dbo.magic_login_tokens, and writes a
 * scannable QR code PNG for the resulting URL. The raw token is
 * printed to the console once and never stored anywhere -- if this
 * output is lost, the token cannot be recovered, only revoked and
 * regenerated.
 *
 * Usage:
 *   node scripts/generateMagicLink.js <email> [label]
 *
 * Example:
 *   node scripts/generateMagicLink.js count@albanyjwparking.org "Lot A Count Station"
 */

import "dotenv/config";
import QRCode from "qrcode";
import { getVolunteerByEmailNonArchived, createMagicLoginToken } from "../lib/dbSync.js";
import { generateMagicLinkToken, hashMagicLinkToken } from "../lib/magicLinkToken.js";

const APP_BASE_URL = process.env.APP_BASE_URL || "https://albanyjwparking.org";

/**
 * @returns {Promise<void>}
 */
async function main() {
    const [, , email, label] = process.argv;

    if (!email) {
        console.error("Usage: node scripts/generateMagicLink.js <email> [label]");
        process.exit(1);
    }

    const volunteer = await getVolunteerByEmailNonArchived(email);
    if (!volunteer) {
        console.error(`No non-archived volunteer found for email: ${email}`);
        process.exit(1);
    }

    const rawToken = generateMagicLinkToken();
    const tokenHash = hashMagicLinkToken(rawToken);

    await createMagicLoginToken({
        volunteerId: volunteer.id,
        tokenHash,
        label: label || null,
        expiresAt: null, // never expires until manually revoked
    });

    const magicUrl = `${APP_BASE_URL}/login/magic/${rawToken}`;
    const outputPath = `magic-link-${volunteer.id}-${Date.now()}.png`;

    await QRCode.toFile(outputPath, magicUrl, { width: 512, margin: 2 });

    console.log("");
    console.log("Magic link created. This URL will not be shown again:");
    console.log(`  ${magicUrl}`);
    console.log("");
    console.log(`QR code saved to: ${outputPath}`);
    console.log("");
}

main().catch((err) => {
    console.error("Failed to generate magic link:", err);
    process.exit(1);
});
