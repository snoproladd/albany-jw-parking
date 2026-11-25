/**
 * @file scripts/inspectCapacityAlerts.js
 * @description Show why capacity alerts did or didn't text anyone.
 * Read-only: it sends nothing and writes nothing to the database.
 *
 * For each active department:
 *   - the global kill switch (when ON, no capacity alert sends at all);
 *   - each rule: location, threshold and the count it fires at, active,
 *     armed (a fired rule waits until the count goes back to the safe side),
 *     last fire and the 5-minute cooldown, and the positions it notifies;
 *   - who the rule would text (the app's own recipient query), and every
 *     holder of those positions it would skip, with the reasons (texts off,
 *     no phone, not active this year, registration not complete);
 *   - the latest counts recorded, the latest capacity_alert_log rows and
 *     the latest capacity-alert texts in message_deliveries with their
 *     delivery status.
 *
 *     node --env-file=.env scripts/inspectCapacityAlerts.js
 *     node --env-file=.env scripts/inspectCapacityAlerts.js --dept=1
 *     node --env-file=.env scripts/inspectCapacityAlerts.js --demo
 *
 * The report is written to logs/capacity-alerts-report.txt (git ignores
 * logs/ and *.txt); --out=<path> writes it somewhere else.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import sql from "mssql";
import { query, runAsDepartment, runAsSystem, closeSqlPool } from "../lib/sql.js";
import {
    getAllCapacityAlertRules,
    getCapacityAlertRecipients,
    getCapacityAlertKillSwitch,
    getCapacityAlertLog,
} from "../lib/dbSync.js";

const isDemo = process.argv.includes("--demo");

/**
 * Value of a `--name=value` command-line option, or null.
 *
 * @param {string} name
 * @returns {string|null}
 */
function arg(name) {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
}

const onlyDept = arg("dept") ? Number(arg("dept")) : null;

/** Where the report is written. */
const outPath = resolve(arg("out") || "logs/capacity-alerts-report.txt");

/**
 * Report lines, written to outPath at the end.
 *
 * @type {string[]}
 */
const lines = [];

/**
 * Add one line to the report.
 *
 * @param {string} [text]
 * @returns {void}
 */
function out(text = "") {
    lines.push(text);
}

/**
 * A date-time as "YYYY-MM-DD HH:MM UTC (Eastern …)", or "(never)".
 *
 * @param {Date|string|null} d
 * @returns {string}
 */
function when(d) {
    if (!d) return "(never)";
    const t = new Date(d);
    const eastern = t.toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "short", timeStyle: "short" });
    return `${t.toISOString().slice(0, 16).replace("T", " ")} UTC (${eastern} Eastern)`;
}

/**
 * True for a BIT column that is set.
 *
 * @param {unknown} v
 * @returns {boolean}
 */
function on(v) {
    return v === true || v === 1;
}

/**
 * The count a rule fires at, as evaluateCapacityAlerts works it out.
 *
 * @param {{ threshold_type: string, threshold_value: number, capacity: number|null }} rule
 * @returns {number|null}
 */
function limitFor(rule) {
    if (rule.threshold_type === "count") return rule.threshold_value;
    if (!rule.capacity) return null;
    return Math.ceil((rule.capacity * rule.threshold_value) / 100);
}

/**
 * Everyone holding one of the rule's positions in the current department,
 * with the facts that decide whether the alert texts them.
 *
 * @param {number} ruleId
 * @returns {Promise<Array<object>>}
 */
async function positionHolders(ruleId) {
    const result = await query(
        `SELECT DISTINCT v.id, v.firstName, v.lastName, v.phone, v.sms_opted_in,
                v.registration_status, m.active_current_year, p.name AS position_name
         FROM   dbo.capacity_alert_positions cap
         JOIN   dbo.positions p          ON p.id = cap.position_id
         JOIN   dbo.member_positions mp  ON mp.position_id = p.id
         LEFT JOIN dbo.department_members m
           ON   m.volunteer_id = mp.volunteer_id AND m.department_id = mp.department_id
         JOIN   dbo.volunteer_in v       ON v.id = mp.volunteer_id
         WHERE  cap.rule_id = @ruleId
           AND  mp.department_id = CAST(SESSION_CONTEXT(N'department_id') AS INT)
         ORDER BY v.lastName, v.firstName;`,
        (r) => r.input("ruleId", sql.Int, ruleId),
    );
    return result.recordset || [];
}

/**
 * Why a position holder would not get the alert.
 *
 * @param {object} h  Row from positionHolders
 * @returns {string[]}
 */
function reasons(h) {
    const r = [];
    if (!on(h.active_current_year)) r.push("not active this year in this department");
    if (h.registration_status !== "completed") r.push(`registration ${h.registration_status ?? "not started"}`);
    if (!h.phone) r.push("no phone number");
    if (!on(h.sms_opted_in)) r.push("texts off (sms_opted_in)");
    return r;
}

/**
 * Inspect one department.
 *
 * @param {number} departmentId
 * @returns {Promise<void>}
 */
async function inspectDepartment(departmentId) {
    const dept = (await query("SELECT name FROM dbo.departments WHERE id = @id;", (r) => r.input("id", sql.Int, departmentId))).recordset[0];
    out(`\n=== Department ${departmentId} (${dept?.name ?? "?"}) ===`);

    const ks = await getCapacityAlertKillSwitch();
    out(`Kill switch: ${ks.enabled ? `ON since ${when(ks.enabledAt)}: NO capacity alert will send until it is turned off on the Capacity Alerts page` : "off"}`);

    const rules = await getAllCapacityAlertRules();
    out(`Rules: ${rules.length}`);
    const detail = (await query(
        `SELECT id, last_sent_at FROM dbo.capacity_alert_rules;`,
    )).recordset;
    const lastSent = new Map(detail.map((d) => [d.id, d.last_sent_at]));

    for (const rule of rules) {
        const limit = limitFor(rule);
        const sentAt = lastSent.get(rule.id) || null;
        const coolUntil = sentAt ? new Date(new Date(sentAt).getTime() + 5 * 60000) : null;
        out(`\n  Rule #${rule.id}: ${rule.location_name}${rule.sub_location_name ? ` / ${rule.sub_location_name}` : " (whole location, any sub-location)"}`);
        out(`      ${rule.active ? "ACTIVE" : "INACTIVE (never fires)"}; ${rule.is_armed ? "armed (ready to fire)" : "DISARMED: already fired; re-arms when a count is back on the safe side of the limit"}`);
        out(`      fires when count ${rule.direction === "above" ? ">=" : "<="} ${limit ?? "?"} (${rule.threshold_type === "percent" ? `${rule.threshold_value}% of capacity ${rule.capacity ?? "NOT SET: a percent rule with no capacity never fires"}` : "a fixed count"})`);
        out(`      last fired: ${when(sentAt)}${coolUntil && coolUntil > new Date() ? `; cooldown until ${when(coolUntil)}` : ""}`);
        out(`      notifies positions: ${rule.position_names || "NONE (nobody is texted)"}`);

        const recipients = await getCapacityAlertRecipients(rule.id);
        out(`      WOULD TEXT: ${recipients.length ? recipients.map((p) => `${p.firstName} ${p.lastName} (#${p.id}, ${p.phone})`).join("; ") : "nobody"}`);
        const ids = new Set(recipients.map((p) => p.id));
        const skipped = (await positionHolders(rule.id)).filter((h) => !ids.has(h.id));
        if (skipped.length) {
            out("      SKIPPED:");
            for (const h of skipped) {
                out(`        - ${h.firstName} ${h.lastName} (#${h.id}, ${h.position_name}): ${reasons(h).join("; ") || "no reason found (tell Claude)"}`);
            }
        }
    }

    const counts = (await query(
        `SELECT TOP (10) pc.*, lt.name AS location_name
         FROM dbo.parking_counts pc
         JOIN dbo.locations_tasks lt ON lt.id = pc.location_task_id
         ORDER BY pc.id DESC;`,
    )).recordset;
    out("\n  Latest counts recorded (newest first):");
    if (!counts.length) out("      none");
    for (const c of counts) {
        const at = c.recorded_at ?? c.created_at ?? c.counted_at ?? null;
        out(`      #${c.id} ${c.location_name} (location ${c.location_task_id}${c.sub_location_id ? `, sub-location ${c.sub_location_id}` : ""}): ${c.count}${on(c.is_final) ? " final" : ""}${on(c.is_manual) ? " manual" : ""} at ${when(at)}`);
    }

    const log = (await getCapacityAlertLog(10));
    out("\n  Latest capacity_alert_log rows (one per firing):");
    if (!log.length) out("      none");
    for (const l of log) {
        out(`      ${when(l.sent_at)} rule #${l.rule_id} ${l.location_name}: count ${l.triggered_count}, ${l.recipient_count} texted, ${l.status}${l.error_msg ? ` (${l.error_msg})` : ""}, run ${l.run_id ?? "(none: before tracking)"}`);
    }

    const deliveries = (await query(
        `SELECT TOP (20) run_id, recipient_name, address, status, error_code, error_message, created_at, updated_at
         FROM dbo.message_deliveries
         WHERE source = N'capacity_alert'
         ORDER BY id DESC;`,
    )).recordset;
    out("\n  Latest capacity-alert texts (message_deliveries, newest first):");
    if (!deliveries.length) out("      none");
    for (const d of deliveries) {
        out(`      ${when(d.created_at)} ${d.recipient_name ?? "?"} ${d.address ?? ""}: ${d.status}${d.error_code ? ` (error ${d.error_code}${d.error_message ? `: ${d.error_message}` : ""})` : ""}; run ${d.run_id}`);
    }
}

/**
 * Run the report for each active department (or just --dept).
 *
 * @returns {Promise<void>}
 */
async function main() {
    const db = (await runAsSystem(() => query("SELECT DB_NAME() AS name;"), { isDemo })).recordset[0].name;
    out(`Database ${db}, schema ${isDemo ? "demo" : "dbo"}. Read-only: nothing is sent or changed.`);
    out(`Now: ${new Date().toISOString()} UTC`);
    out(`Callback for timed texts: ${process.env.TWILIO_STATUS_CALLBACK_BASE || process.env.APP_BASE_URL || "(none: texts are sent untracked)"}`);

    const depts = (await runAsSystem(
        () => query("SELECT id FROM dbo.departments WHERE active = 1 ORDER BY id;"),
        { isDemo },
    )).recordset.map((r) => r.id).filter((id) => !onlyDept || id === onlyDept);

    for (const id of depts) {
        await runAsDepartment(id, () => inspectDepartment(id), { isDemo });
    }
}

/**
 * Write the report file (also after a failure, so the part that ran is kept).
 *
 * @returns {void}
 */
function writeReport() {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, lines.join("\r\n") + "\r\n", "utf8");
}

// The app's libraries log every query with console.log; keep that out of
// the console while the report runs (errors still show).
const consoleLog = console.log;
console.log = () => {};
try {
    await main();
} catch (err) {
    out(`\nFAILED: ${err?.stack || err}`);
    console.error("inspectCapacityAlerts failed:", err?.message || err);
    process.exitCode = 1;
} finally {
    await closeSqlPool();
    console.log = consoleLog;
    writeReport();
    console.log(`Report written: ${outPath} (${lines.length} lines).`);
}
