/**
 * @file scripts/sanitizeDemoEmails.js
 * @description Replaces every real email address in the demo database with a
 * synthetic firstName.lastName@demo.com address.
 *
 * Connects via DEMO_DB_USER / DEMO_DB_PASSWORD (the same SQL auth user the
 * demo pool uses, whose DEFAULT_SCHEMA = demo). This makes it structurally
 * impossible to touch dbo.volunteer_in — the demo user has no access to it.
 *
 * Duplicate names are resolved by appending a counter:
 *   john.smith@demo.com, john.smith2@demo.com, john.smith3@demo.com, …
 *
 * Diacritics and special characters are normalised:
 *   José → jose,  O'Brien → obrien,  Mary-Jane → maryjane
 *
 * Rows whose email is already a @demo.com address are skipped automatically
 * so the script is safe to re-run.
 *
 * Usage (from project root):
 *   node scripts/sanitizeDemoEmails.js           # dry run — prints plan only
 *   node scripts/sanitizeDemoEmails.js --apply   # writes changes to the DB
 *
 * Required env vars (already in .env for local dev):
 *   AZSQLServer / AZURE_SQL_SERVER   SQL Server FQDN
 *   AZSQLDB / AZURE_SQL_DATABASE     Database name
 *   DEMO_DB_USER                     Demo SQL auth username (parking_demo)
 *   DEMO_DB_PASSWORD                 Demo SQL auth password
 */

import sql from "mssql";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// ---------------------------------------------------------------------------
// Bootstrap .env for local runs
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
  const { default: dotenv } = await import("dotenv");
  dotenv.config({ path: join(__dirname, "..", ".env") });
} catch {
  /* env may already be set in the process */
}

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

/**
 * @param {...unknown} args
 * @returns {void}
 */
function log(...args) {
  console.log(`[${new Date().toISOString()}] [sanitizeDemoEmails]`, ...args);
}

/**
 * @param {...unknown} args
 * @returns {void}
 */
function logError(...args) {
  console.error(
    `[${new Date().toISOString()}] [sanitizeDemoEmails:ERROR]`,
    ...args,
  );
}

// ---------------------------------------------------------------------------
// Connection config
// ---------------------------------------------------------------------------

const SQL_SERVER =
  process.env.AZSQLServer ||
  process.env.AZURE_SQL_SERVER ||
  process.env.SQL_SERVER ||
  "";

const SQL_DB =
  process.env.AZSQLDB ||
  process.env.AZURE_SQL_DATABASE ||
  process.env.SQL_DATABASE ||
  "";

const DEMO_USER = process.env.DEMO_DB_USER || "parking_demo";
const DEMO_PASS = process.env.DEMO_DB_PASSWORD || "";

const missing = [
  !SQL_SERVER && "AZSQLServer",
  !SQL_DB && "AZSQLDB",
  !DEMO_PASS && "DEMO_DB_PASSWORD",
].filter(Boolean);

if (missing.length) {
  logError("Missing required env vars:", missing.join(", "));
  process.exit(1);
}

/** @type {import('mssql').config} */
const poolConfig = {
  server: SQL_SERVER,
  database: SQL_DB,
  port: 1433,
  authentication: {
    type: "default",
    options: { userName: DEMO_USER, password: DEMO_PASS },
  },
  options: {
    encrypt: true,
    trustServerCertificate: false,
    connectTimeout: 30_000,
    requestTimeout: 30_000,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a name fragment into a safe email local-part.
 *
 * Steps:
 *  1. NFD-decompose to separate base characters from their diacritics.
 *  2. Strip all combining diacritical marks (é → e, ñ → n, etc.).
 *  3. Lowercase.
 *  4. Remove everything that isn't a–z or 0–9
 *     (apostrophes, hyphens, spaces, dots, etc.).
 *
 * Falls back to the literal string 'unknown' if the input is empty.
 *
 * @param {string | null | undefined} str
 * @returns {string}
 */
function toEmailPart(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ""); // keep only alphanumeric characters
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  sanitizeDemoEmails.js");
  console.log(`  Server   : ${SQL_SERVER}`);
  console.log(`  Database : ${SQL_DB}`);
  console.log(`  Schema   : demo  (enforced by DEMO_DB_USER default schema)`);
  console.log(
    `  Mode     : ${APPLY ? "⚠  APPLY — writing to DB" : "DRY RUN — no changes"}`,
  );
  console.log("════════════════════════════════════════════════════════════\n");

  const pool = await sql.connect(poolConfig);

  try {
    // Fetch every volunteer row, including archived, since real emails
    // may exist in any status bucket.
    const { recordset: rows } = await pool.request().query(`
            SELECT id, firstName, lastName, email
            FROM   demo.volunteer_in
            ORDER  BY lastName, firstName, id;
        `);

    log(`Found ${rows.length} volunteer row(s) in demo.volunteer_in.`);

    // -----------------------------------------------------------------
    // Build the email assignment plan
    // -----------------------------------------------------------------

    /** @type {Map<string, number>} base email → highest counter issued */
    const seenBases = new Map();

    /**
     * @type {Array<{
     *   id:       number,
     *   oldEmail: string | null,
     *   newEmail: string,
     * }>}
     */
    const plan = rows.map((row) => {
      const first = toEmailPart(row.firstName) || "unknown";
      const last = toEmailPart(row.lastName) || "unknown";
      const base = `${first}.${last}`;

      const count = (seenBases.get(base) || 0) + 1;
      seenBases.set(base, count);

      const newEmail =
        count === 1 ? `${base}@demo.com` : `${base}${count}@demo.com`;

      return {
        id: row.id,
        oldEmail: row.email || null,
        newEmail,
      };
    });

    // Split into rows that need a change vs rows already correct.
    const toUpdate = plan.filter((r) => r.oldEmail !== r.newEmail);
    const skipped = plan.filter((r) => r.oldEmail === r.newEmail);

    if (skipped.length > 0) {
      log(
        `${skipped.length} row(s) already have the correct @demo.com address — skipping.`,
      );
    }

    // -----------------------------------------------------------------
    // Print the plan
    // -----------------------------------------------------------------

    console.log(`\n${toUpdate.length} row(s) to update:\n`);

    const W_ID = 6;
    const W_OLD = 45;

    console.log(
      `  ${"ID".padEnd(W_ID)}  ${"CURRENT EMAIL".padEnd(W_OLD)}  NEW EMAIL`,
    );
    console.log(
      `  ${"─".repeat(W_ID)}  ${"─".repeat(W_OLD)}  ${"─".repeat(38)}`,
    );

    for (const { id, oldEmail, newEmail } of toUpdate) {
      console.log(
        `  ${String(id).padEnd(W_ID)}  ${(oldEmail || "(null)").padEnd(W_OLD)}  ${newEmail}`,
      );
    }

    // -----------------------------------------------------------------
    // Guard / early exit
    // -----------------------------------------------------------------

    if (!APPLY) {
      console.log("\nDry run complete — no changes written.");
      console.log("Re-run with --apply to commit the changes above.\n");
      return;
    }

    if (toUpdate.length === 0) {
      console.log("\nNothing to do — all emails are already sanitized.\n");
      return;
    }

    // -----------------------------------------------------------------
    // Apply updates one row at a time (small dataset, avoids bulk-param limits)
    // -----------------------------------------------------------------

    console.log("\nApplying updates...\n");
    let updated = 0;

    for (const { id, newEmail } of toUpdate) {
      await pool
        .request()
        .input("id", sql.Int, id)
        .input("email", sql.NVarChar(255), newEmail).query(`
                    UPDATE demo.volunteer_in
                    SET    email = @email
                    WHERE  id    = @id;
                `);
      updated++;
    }

    log(`✓  ${updated} email(s) updated in demo.volunteer_in.`);
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  logError(err.message);
  process.exit(1);
});
