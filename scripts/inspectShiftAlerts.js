/**
 * @file scripts/inspectShiftAlerts.js
 * @description Show what the shift alert scheduler would send, and why
 * anyone is left out. Read-only: it sends nothing and writes nothing.
 *
 * For each active department, and each shift alert schedule of the active
 * convention year:
 *   - the schedule's settings, and when it fires (UTC and Eastern) compared
 *     with now: "fires in 3 h", "IN THE WINDOW NOW", or "fired / missed";
 *   - who it would text and for which shifts, using the scheduler's own
 *     query (getShiftsForAlertBurst), so the list matches a real send;
 *   - everyone else assigned to a shift in that schedule's date range, with
 *     each reason they won't be texted (texts off, reminders off, no phone,
 *     shift has no SMS code, department filter, already sent, …).
 * Then the rolling 15-minute reminders for today and tomorrow (Eastern),
 * the same way, and the convention days of the year so an empty date range
 * is easy to spot.
 *
 *     node --env-file=.env scripts/inspectShiftAlerts.js
 *     node --env-file=.env scripts/inspectShiftAlerts.js --dept=1
 *     node --env-file=.env scripts/inspectShiftAlerts.js --schedule=12
 *     node --env-file=.env scripts/inspectShiftAlerts.js --today=2026-08-07
 *     node --env-file=.env scripts/inspectShiftAlerts.js --demo
 *
 * --today pretends today (Eastern) is that date for the 15-minute section.
 *
 * The report is written to logs/shift-alerts-report.txt (git ignores both
 * logs/ and *.txt, so the names and phone numbers in it are never
 * committed); --out=<path> writes it somewhere else. Only a short summary
 * goes to the console.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import sql from "mssql";
import { query, runAsDepartment, runAsSystem, closeSqlPool } from "../lib/sql.js";
import {
    getAlertSchedules,
    getShiftsForAlertBurst,
    getT15CandidateShifts,
    getMeetingT15Candidates,
} from "../lib/dbSync.js";
import { getActiveYear } from "../lib/conventionYear.js";
import { getConventionTimeZone } from "../lib/conventionTime.js";
import { scheduleFireAt } from "../lib/alertScheduler.js";

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

/** Where the report is written. */
const outPath = resolve(arg("out") || "logs/shift-alerts-report.txt");

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

const onlyDept = arg("dept") ? Number(arg("dept")) : null;
const onlySchedule = arg("schedule") ? Number(arg("schedule")) : null;

/**
 * Today's date in Eastern time as YYYY-MM-DD (the scheduler's "today").
 *
 * @returns {string}
 */
function todayEastern() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}

const today = arg("today") || todayEastern();

/**
 * A DATE column (a midnight-UTC Date) as YYYY-MM-DD.
 *
 * @param {Date|string|null} d
 * @returns {string}
 */
function ymd(d) {
    if (!d) return "(none)";
    return new Date(d).toISOString().slice(0, 10);
}

/**
 * A TIME column (mssql gives an epoch-anchored Date) or "HH:MM:SS" string
 * as "HH:MM".
 *
 * @param {Date|string|null} t
 * @returns {string}
 */
function hhmm(t) {
    if (!t) return "(none)";
    if (t instanceof Date) {
        return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
    }
    return String(t).slice(0, 5);
}

/**
 * Add whole days to a YYYY-MM-DD date.
 *
 * @param {string} date
 * @param {number} days
 * @returns {string}
 */
function addDays(date, days) {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/**
 * Describe when a burst schedule fires relative to now, the way the
 * scheduler tick decides (scheduleFireAt; it sends only within 5 minutes
 * after the time).
 *
 * @param {object} s   Schedule row
 * @param {string} tz  Convention time zone (IANA name)
 * @returns {string}
 */
function fireStatus(s, tz) {
    if (!s.fire_date || (!s.fire_time_local && !s.fire_time_utc)) {
        return "no fire date/time set: never fires on its own";
    }
    const fireUtc = scheduleFireAt(s, tz);
    if (!fireUtc) return "fire time unreadable: never fires on its own";
    // dateStyle/timeStyle can't be combined with timeZoneName ("Invalid
    // option"), so the fields are spelled out.
    const local = fireUtc.toLocaleString("en-US", {
        timeZone: tz, month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", timeZoneName: "short",
    });
    const mins = Math.round((fireUtc.getTime() - Date.now()) / 60000);
    let when;
    if (mins > 0) {
        when = mins >= 120 ? `fires in ${Math.round(mins / 60)} h` : `fires in ${mins} min`;
    } else if (mins >= -5) {
        when = "IN THE 5-MINUTE WINDOW NOW";
    } else {
        when = `time passed ${Math.round(-mins / 60)} h ago (fired, or missed if the server was off)`;
    }
    const stored = s.fire_time_local
        ? `${ymd(s.fire_date)} ${hhmm(s.fire_time_local)} convention time`
        : `${ymd(s.fire_date)} ${hhmm(s.fire_time_utc)} UTC (old column; run shift_alert_fire_time_local.sql)`;
    return `${stored} = ${local}; ${when}`;
}

/**
 * The convention dates a burst category covers for a fire date.
 *
 * @param {string} category
 * @param {string} fireDate  YYYY-MM-DD
 * @returns {{ from: string, to: string|null, text: string }}
 */
function categoryRange(category, fireDate) {
    if (category === "next_day") {
        const d = addDays(fireDate, 1);
        return { from: d, to: d, text: `shifts on ${d} (day after the fire date)` };
    }
    if (category === "same_day") return { from: fireDate, to: fireDate, text: `shifts on ${fireDate}` };
    return { from: fireDate, to: null, text: `shifts on ${fireDate} and later` };
}

/**
 * Everyone assigned to a crew or meeting shift between two dates (current
 * department), with the facts that decide whether they get a reminder.
 *
 * @param {number} year
 * @param {string} from  YYYY-MM-DD
 * @param {string|null} to  YYYY-MM-DD, or null for no end
 * @param {number|null} scheduleId  for "already sent" (null: 15-minute reminders)
 * @returns {Promise<Array<object>>}
 */
async function assignmentsInRange(year, from, to, scheduleId) {
    const result = await query(
        `SELECT DISTINCT
                vi.id AS volunteer_id, vi.firstName, vi.lastName, vi.phone,
                vi.sms_opted_in, vi.sms_shift_alerts_opt_in, vi.smsCapable,
                sh.id AS shift_id, sh.label AS shift_label, sh.start_time, sh.sms_code, sh.is_meeting,
                cd.convention_date, sc.dept_key, sc.name AS event_type_name,
                CASE WHEN EXISTS (
                    SELECT 1 FROM dbo.shift_alert_log sal
                    WHERE sal.shift_id = sh.id AND sal.volunteer_id = vi.id AND sal.status = 'sent'
                      AND ((@scheduleId IS NULL AND sal.schedule_id IS NULL AND sal.alert_category = 't15min')
                        OR sal.schedule_id = @scheduleId)
                ) THEN 1 ELSE 0 END AS already_sent
         FROM dbo.shifts sh
         JOIN dbo.sessions               sess ON sess.id = sh.session_id
         JOIN dbo.convention_days        cd   ON cd.id = sess.convention_day_id
         LEFT JOIN dbo.scheduler_categories sc ON sc.id = sh.category_id
         JOIN dbo.schedule_assignments   sa   ON sa.shift_id = sh.id
         JOIN dbo.shift_slot_assignments ssa  ON ssa.schedule_assignment_id = sa.id
         JOIN dbo.volunteer_in           vi   ON vi.id = ssa.volunteer_id
         WHERE cd.year = @year
           AND cd.convention_date >= @from
           AND (@to IS NULL OR cd.convention_date <= @to)
         ORDER BY cd.convention_date, sh.start_time, vi.lastName, vi.firstName;`,
        (req) => {
            req.input("year", sql.Int, year);
            req.input("from", sql.Date, from);
            req.input("to", sql.Date, to);
            req.input("scheduleId", sql.Int, scheduleId);
        },
    );
    return result.recordset || [];
}

/**
 * Why one assignment row would not get a reminder (empty: it would).
 *
 * @param {object} r  Row from assignmentsInRange
 * @param {{ departments: string|null, includeNullDept: boolean }|null} filter
 *        The schedule's department filter (null for 15-minute reminders)
 * @returns {string[]}
 */
function reasonsLeftOut(r, filter) {
    const out = [];
    if (r.sms_opted_in !== true && r.sms_opted_in !== 1) out.push("texts off (sms_opted_in)");
    if (r.sms_shift_alerts_opt_in !== true && r.sms_shift_alerts_opt_in !== 1) out.push("shift reminders off in My Account (sms_shift_alerts_opt_in)");
    if (r.smsCapable !== true && r.smsCapable !== 1) out.push("phone not marked text-capable (smsCapable)");
    if (!r.phone) out.push("no phone number");
    if (!r.sms_code) out.push("shift has no SMS code (sms_code)");
    if (filter && (r.is_meeting === true || r.is_meeting === 1)) out.push("meeting shift (scheduled reminders skip meetings)");
    if (filter && filter.departments) {
        let list = [];
        try { list = JSON.parse(filter.departments); } catch { list = []; }
        if (r.dept_key == null) {
            if (!filter.includeNullDept) out.push("shift has no event type/department and the schedule leaves those out");
        } else if (!list.includes(r.dept_key)) {
            out.push(`event type department "${r.dept_key}" not in the schedule's list ${filter.departments}`);
        }
    }
    if (r.already_sent === 1 || r.already_sent === true) out.push("already sent for this schedule");
    return out;
}

/**
 * Print the people a send would reach, one line per person with their shifts.
 *
 * @param {Array<object>} rows  Rows from the scheduler's own query
 * @returns {void}
 */
function printWouldSend(rows) {
    if (!rows.length) {
        out("      WOULD TEXT: nobody");
        return;
    }
    /** @type {Map<number, { name: string, phone: string, shifts: string[] }>} */
    const people = new Map();
    for (const r of rows) {
        const p = people.get(r.volunteer_id) ?? { name: `${r.firstName} ${r.lastName}`, phone: r.phone, shifts: [] };
        p.shifts.push(`${ymd(r.convention_date)} ${hhmm(r.start_time)} ${r.event_type_name ?? ""} ${r.shift_label ?? ""} [${r.sms_code}]`.replace(/\s+/g, " ").trim());
        people.set(r.volunteer_id, p);
    }
    out(`      WOULD TEXT: ${people.size} ${people.size === 1 ? "person" : "people"} (${rows.length} shift lines)`);
    for (const [id, p] of people) {
        out(`        - ${p.name} (#${id}, ${p.phone})`);
        for (const s of p.shifts) out(`            ${s}`);
    }
}

/**
 * Print everyone in range who would be left out, with the reasons.
 *
 * @param {Array<object>} all  Rows from assignmentsInRange
 * @param {Array<object>} sending  Rows the scheduler would send
 * @param {{ departments: string|null, includeNullDept: boolean }|null} filter
 * @returns {void}
 */
function printLeftOut(all, sending, filter) {
    const sendKeys = new Set(sending.map((r) => `${r.shift_id}|${r.volunteer_id}`));
    const left = all.filter((r) => !sendKeys.has(`${r.shift_id}|${r.volunteer_id}`));
    if (!all.length) {
        out("      NOBODY IS ASSIGNED to a shift in this date range.");
        return;
    }
    if (!left.length) {
        out("      Left out: nobody");
        return;
    }
    out(`      LEFT OUT: ${left.length} shift lines`);
    for (const r of left) {
        const reasons = reasonsLeftOut(r, filter);
        out(`        - ${r.firstName} ${r.lastName} (#${r.volunteer_id}) ${ymd(r.convention_date)} ${hhmm(r.start_time)} ${r.shift_label ?? ""}: ${reasons.length ? reasons.join("; ") : "no reason found (the scheduler's query differs; tell Claude)"}`);
    }
}

/**
 * Inspect one department.
 *
 * @param {number} departmentId
 * @returns {Promise<void>}
 */
async function inspectDepartment(departmentId) {
    const dept = (await query("SELECT name FROM dbo.departments WHERE id = @id;", (r) => r.input("id", sql.Int, departmentId))).recordset[0];
    const year = await getActiveYear();
    const tz = await getConventionTimeZone();
    out(`\n=== Department ${departmentId} (${dept?.name ?? "?"}), convention year ${year} ===`);

    const days = (await query(
        `SELECT convention_date, label FROM dbo.convention_days WHERE year = @year ORDER BY convention_date;`,
        (r) => r.input("year", sql.Int, year),
    )).recordset;
    out(`Convention days in ${year}: ${days.length ? days.map((d) => `${ymd(d.convention_date)} (${d.label ?? ""})`).join(", ") : "NONE"}`);

    const schedules = (await getAlertSchedules(year)).filter((s) => !onlySchedule || s.id === onlySchedule);
    out(`Schedules: ${schedules.length}`);

    for (const s of schedules) {
        out(`\n  #${s.id} "${s.name}"  ${s.active ? "ACTIVE" : "INACTIVE (never sends)"}  category ${s.alert_category}`);
        out(`      departments filter: ${s.departments || "(all)"}; shifts with no department: ${s.include_null_dept ? "included" : "left out"}`);
        if (s.alert_category === "t15min") {
            out("      rolling 15-minute reminders: see the section below");
            continue;
        }
        out(`      ${fireStatus(s, tz)}`);
        const fireDate = s.fire_date ? ymd(s.fire_date) : new Date().toISOString().slice(0, 10);
        const range = categoryRange(s.alert_category, fireDate);
        out(`      covers: ${range.text}`);

        const sending = await getShiftsForAlertBurst({
            scheduleId: s.id,
            alertCategory: s.alert_category,
            fireDate,
            departments: s.departments || null,
            includeNullDept: !!s.include_null_dept,
            year,
        });
        printWouldSend(sending);
        const all = await assignmentsInRange(year, range.from, range.to, s.id);
        printLeftOut(all, sending, { departments: s.departments || null, includeNullDept: !!s.include_null_dept });
    }

    out(`\n  15-minute reminders for ${today} and ${addDays(today, 1)} (Eastern)`);
    const hasT15 = schedules.some((s) => s.alert_category === "t15min" && s.active);
    out(`      an active t15min schedule exists: ${hasT15 ? "yes" : "NO (the tick may still send; check the schedule list on the page)"}`);
    const [crew, meetings] = await Promise.all([
        getT15CandidateShifts(year, today),
        getMeetingT15Candidates(year, today),
    ]);
    printWouldSend([...crew, ...meetings]);
    const all = await assignmentsInRange(year, today, addDays(today, 1), null);
    printLeftOut(all.filter((r) => !(r.is_meeting === true || r.is_meeting === 1)), crew, null);
    out("      (each is texted only when its shift starts 14-16 minutes from now)");
}

/**
 * Run the report for each active department (or just --dept).
 *
 * @returns {Promise<void>}
 */
async function main() {
    const db = (await runAsSystem(() => query("SELECT DB_NAME() AS name;"), { isDemo })).recordset[0].name;
    out(`Database ${db}, schema ${isDemo ? "demo" : "dbo"}. Read-only: nothing is sent or changed.`);
    out(`Now: ${new Date().toISOString()} UTC; today (Eastern) for 15-minute reminders: ${today}`);
    out(`Callback for timed texts: ${process.env.TWILIO_STATUS_CALLBACK_BASE || process.env.APP_BASE_URL || "(none: timed texts are sent untracked)"}`);

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
    console.error("inspectShiftAlerts failed:", err?.message || err);
    process.exitCode = 1;
} finally {
    await closeSqlPool();
    console.log = consoleLog;
    writeReport();
    const would = lines.filter((l) => l.includes("WOULD TEXT:")).length;
    console.log(`Report written: ${outPath} (${lines.length} lines, ${would} send sections).`);
}
