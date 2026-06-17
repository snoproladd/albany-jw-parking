/**
 * @file scripts/backfillShiftSmsCodes.js
 * @description
 *   One-time backfill: generates sms_code for every dbo.shifts row that
 *   currently has sms_code IS NULL, using the same generateShiftCode algorithm
 *   exported by lib/dbSync.js and called by the Timelines UI.
 *
 *   Format: [DAY 2][DEPT 2][n]  e.g. "FRLG1", "SASC2", "SUDO1"
 *
 *   Shifts are grouped by (convention_date, department) and numbered in
 *   start_time order within each group, starting at 1.
 *
 *   Run dry-run first (default) to preview every code that would be written.
 *   Re-run with --commit to apply.
 *
 * Usage (from project root):
 *   node scripts/backfillShiftSmsCodes.js             # dry run — no writes
 *   node scripts/backfillShiftSmsCodes.js --commit    # write to dbo.shifts
 *
 * Requirements:
 *   - .env present at project root (AZSQLServer, AZSQLDB, etc.)
 *   - Azure CLI or VS Code Azure sign-in active (DefaultAzureCredential)
 *
 * Notes:
 *   - Only rows where sms_code IS NULL are touched; the UPDATE predicate
 *     re-checks IS NULL so existing codes are never overwritten.
 *   - The demo schema is NOT affected; this script targets dbo.* only.
 *   - Safe to re-run after a partial failure: already-filled rows are skipped.
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import sql from "mssql";
import { DefaultAzureCredential } from "@azure/identity";

// ─── Bootstrap .env ────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
try {
  const { default: dotenv } = await import("dotenv");
  dotenv.config({ path: join(__dirname, "..", ".env") });
} catch {
  /* env vars may already be present in the process */
}

// ─── Configuration ──────────────────────────────────────────────────────────
const COMMIT = process.argv.includes("--commit");

const SQL_SERVER =
  process.env.AZSQLServer ||
  process.env.AZURE_SQL_SERVER ||
  process.env.SQL_SERVER ||
  "";

const SQL_DATABASE =
  process.env.AZSQLDB ||
  process.env.AZURE_SQL_DATABASE ||
  process.env.SQL_DATABASE ||
  "";

const SQL_PORT = Number(
  process.env.AZSQLPort ||
    process.env.AZURE_SQL_PORT ||
    process.env.SQL_PORT ||
    1433,
);

// ─── Logging helpers ────────────────────────────────────────────────────────
/**
 * @param {...any} args
 */
function log(...args) {
  console.log(`[${new Date().toISOString()}] [backfill]`, ...args);
}

/**
 * @param {...any} args
 */
function logError(...args) {
  console.error(`[${new Date().toISOString()}] [backfill:ERROR]`, ...args);
}

// ─── generateShiftCode ──────────────────────────────────────────────────────
// Inlined verbatim from lib/dbSync.js — keep in sync if the source changes.

/**
 * Generate an SMS reply code from shift context.
 * Source: lib/dbSync.js → export function generateShiftCode
 *
 * Format: [DAY 2][DEPT 2][n]  e.g. "FRLG1", "SASC2"
 *
 * @param {string|Date} conventionDate
 * @param {string}      department       - dbo.shifts.department value
 * @param {number}      sequenceNumber   - 1-based position within group
 * @returns {string}
 */
function generateShiftCode(conventionDate, department, sequenceNumber) {
  const DAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const d = new Date(
    typeof conventionDate === "string"
      ? conventionDate + "T12:00:00Z"
      : conventionDate,
  );
  const dayCode = DAY[d.getUTCDay()] ?? "XX";

  const dept = (department || "").toLowerCase().replace(/[_\s-]/g, "");
  let deptCode;
  if (dept.includes("lot") || dept.includes("garage")) deptCode = "LG";
  else if (dept.includes("security")) deptCode = "SC";
  else if (dept.includes("desk")) deptCode = "DK";
  else if (dept.includes("sign")) deptCode = "SN";
  else if (dept.includes("mobile")) deptCode = "MS";
  else if (dept.includes("drop") || dept.includes("pick")) deptCode = "DO";
  else deptCode = "XX";

  return (dayCode + deptCode + String(sequenceNumber)).toUpperCase();
}

// ─── DB connection ──────────────────────────────────────────────────────────

/**
 * Build and return a connected mssql ConnectionPool using
 * DefaultAzureCredential token auth — the same strategy used by lib/sql.js.
 *
 * @returns {Promise<import('mssql').ConnectionPool>}
 */
async function connectPool() {
  if (!SQL_SERVER || !SQL_DATABASE) {
    throw new Error(
      "Missing SQL env vars. Set AZSQLServer and AZSQLDB in .env.",
    );
  }

  const credential = new DefaultAzureCredential();
  const tokenResponse = await credential.getToken(
    "https://database.windows.net/.default",
  );

  const pool = new sql.ConnectionPool({
    server: SQL_SERVER,
    database: SQL_DATABASE,
    port: SQL_PORT,
    options: {
      encrypt: true,
      trustServerCertificate: false,
      enableArithAbort: true,
    },
    authentication: {
      type: "azure-active-directory-access-token",
      options: { token: tokenResponse.token },
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30_000,
    },
  });

  await pool.connect();
  return pool;
}

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Fetch all shifts where sms_code IS NULL, with their convention date,
 * department, and start_time for grouping and ordering.
 *
 * Results are ordered so that (convention_date, department, start_time) groups
 * are contiguous — the main loop relies on this to assign sequential numbers.
 *
 * @param {import('mssql').ConnectionPool} pool
 * @returns {Promise<Array<{
 *   shift_id:        number,
 *   shift_label:     string,
 *   department:      string|null,
 *   convention_date: Date,
 *   start_time:      Date,
 *   event_type_name: string,
 * }>>}
 */
async function fetchNullCodeShifts(pool) {
  const result = await pool.request().query(`
        SELECT
            sh.id              AS shift_id,
            sh.label           AS shift_label,
            sh.department,
            sh.start_time,
            cd.convention_date,
            et.name            AS event_type_name
        FROM dbo.shifts sh
        JOIN dbo.sessions        sess ON sess.id = sh.session_id
        JOIN dbo.convention_days cd   ON cd.id  = sess.convention_day_id
        JOIN dbo.event_types     et   ON et.id  = sh.event_type_id
        WHERE sh.sms_code IS NULL
        ORDER BY cd.convention_date, sh.department, sh.start_time, sh.id;
    `);
  return result.recordset || [];
}

/**
 * Write a generated sms_code to a single shift row.
 * The WHERE clause re-checks sms_code IS NULL so a concurrent fill
 * or a re-run never overwrites a code set between the SELECT and UPDATE.
 *
 * @param {import('mssql').ConnectionPool} pool
 * @param {number} shiftId
 * @param {string} code
 * @returns {Promise<number>} rowsAffected (0 or 1)
 */
async function applyCode(pool, shiftId, code) {
  const req = pool.request();
  req.input("shiftId", sql.Int, shiftId);
  req.input("code", sql.NVarChar(8), code);
  const result = await req.query(`
        UPDATE dbo.shifts
        SET sms_code = @code
        WHERE id = @shiftId
          AND sms_code IS NULL;
    `);
  return result.rowsAffected?.[0] ?? 0;
}

// ─── Main ───────────────────────────────────────────────────────────────────

/**
 * Entry point. Connects to the DB, assigns sequence numbers to each
 * (convention_date, department) group by start_time order, prints a preview
 * table, then either stops (dry run) or applies all updates (--commit).
 *
 * @returns {Promise<void>}
 */
async function main() {
  console.log("");
  console.log("━".repeat(72));
  console.log(
    `  backfillShiftSmsCodes — mode: ${COMMIT ? "⚡ COMMIT" : "🔍 DRY RUN"}`,
  );
  console.log("━".repeat(72));
  console.log("");

  log("Connecting to SQL...");
  const pool = await connectPool();
  log(`Connected to ${SQL_SERVER} / ${SQL_DATABASE}`);

  const rows = await fetchNullCodeShifts(pool);

  if (rows.length === 0) {
    console.log("\n✓ No shifts with sms_code IS NULL — nothing to do.\n");
    await pool.close();
    return;
  }

  // ── Assign sequence numbers within each (convention_date, department) group
  // Rows arrive pre-sorted by (convention_date, department, start_time, id).
  // We walk them in order, resetting the counter each time the group key changes.

  /**
   * @typedef {{ shift_id: number, shift_label: string, department: string, event_type_name: string, date: string, code: string }} Assignment
   * @type {Assignment[]}
   */
  const assignments = [];

  let lastGroupKey = "";
  let seq = 0;

  for (const row of rows) {
    const date = new Date(row.convention_date).toISOString().slice(0, 10);
    const dept = row.department || "";
    const groupKey = `${date}|${dept}`;

    if (groupKey !== lastGroupKey) {
      seq = 1;
      lastGroupKey = groupKey;
    } else {
      seq++;
    }

    assignments.push({
      shift_id: row.shift_id,
      shift_label: row.shift_label || "",
      department: dept,
      event_type_name: row.event_type_name || "",
      date,
      code: generateShiftCode(date, dept, seq),
    });
  }

  // ── Collision check ─────────────────────────────────────────────────────
  // Within the NULL-code set, collisions cannot occur because each
  // (date, dept) group has a unique ascending counter. However, a suffixed
  // code could theoretically coincide with a code in a *different* group if
  // that group has only one shift and produces a 4-char base that happens to
  // match another group's suffixed code. Check and flag defensively.

  /** @type {Map<string, number>} final code → shift_id */
  const finalCodes = new Map();
  /** @type {Array<{ code: string, shift_id: number, conflictsWith: number }>} */
  const stillClashing = [];

  for (const a of assignments) {
    if (finalCodes.has(a.code)) {
      stillClashing.push({
        code: a.code,
        shift_id: a.shift_id,
        conflictsWith: finalCodes.get(a.code),
      });
    } else {
      finalCodes.set(a.code, a.shift_id);
    }
  }

  // ── Preview table ───────────────────────────────────────────────────────

  console.log(`Found ${assignments.length} shift(s) with sms_code IS NULL:\n`);
  console.log(
    "shift_id".padEnd(11) +
      "code".padEnd(9) +
      "department".padEnd(20) +
      "event_type".padEnd(18) +
      "date",
  );
  console.log("─".repeat(72));

  let lastDate = "";
  for (const a of assignments) {
    // Print a blank separator line between convention days for readability
    if (a.date !== lastDate && lastDate !== "") console.log("");
    lastDate = a.date;

    const clashFlag = stillClashing.some(
      (d) => d.shift_id === a.shift_id || d.conflictsWith === a.shift_id,
    )
      ? "  ⚠ CLASH"
      : "";

    console.log(
      String(a.shift_id).padEnd(11) +
        a.code.padEnd(9) +
        a.department.padEnd(20) +
        a.event_type_name.padEnd(18) +
        a.date +
        clashFlag,
    );
  }

  console.log("─".repeat(72));

  // ── Collision warnings ──────────────────────────────────────────────────

  if (stillClashing.length > 0) {
    console.log(
      `\n⚠  ${stillClashing.length} code(s) clash — resolve manually before committing:\n`,
    );
    for (const d of stillClashing) {
      console.log(
        `   code=${d.code.padEnd(9)}  shift_id=${String(d.shift_id).padEnd(6)}  conflicts with shift_id=${d.conflictsWith}`,
      );
    }
    console.log("");
  }

  // ── Dry-run exit ────────────────────────────────────────────────────────

  if (!COMMIT) {
    console.log(
      `\n🔍  Dry run complete — no rows written.\n` +
        `    Re-run with --commit to apply ${assignments.length} update(s).\n`,
    );
    await pool.close();
    return;
  }

  // ── Apply updates ───────────────────────────────────────────────────────

  console.log("\nApplying updates...\n");

  let applied = 0;
  let skipped = 0;

  for (const a of assignments) {
    try {
      const affected = await applyCode(pool, a.shift_id, a.code);
      if (affected === 0) {
        log(
          `shift ${a.shift_id}: skipped (already filled by concurrent process)`,
        );
        skipped++;
      } else {
        applied++;
      }
    } catch (err) {
      logError(`shift ${a.shift_id}: UPDATE failed —`, err.message);
      skipped++;
    }
  }

  console.log("─".repeat(72));
  console.log(
    `\n✓  Done.  Applied: ${applied}   Skipped/errored: ${skipped}\n`,
  );

  await pool.close();
}

main().catch((err) => {
  logError("Fatal error:", err);
  process.exit(1);
});
