/**
 * @file scripts/positionsFromRoles.js
 * @description Build Parking's starting positions from today's roles
 * (multi-department phase 3c).
 *
 * Today a person's access comes from their role: the factory permission
 * matrix (src/config/roles.js) plus any changes saved from the Permission
 * Matrix page (dbo.role_permissions), plus a few rank checks in the code.
 * This script works out, for every role, which catalogue permissions
 * (src/config/permissions.js) describe exactly that access, so the switch
 * to positions gives nobody more or less than they have now.
 *
 * Read-only. Reads dbo.role_permissions (or demo.role_permissions) from the
 * database in .env and prints a side-by-side report:
 *
 *     node --env-file=.env scripts/positionsFromRoles.js           (dbo)
 *     node --env-file=.env scripts/positionsFromRoles.js --demo    (demo)
 *
 * The rules live in lib/legacyRoleMap.js and are shared with
 * scripts/seedPositions.js, so the report and the positions cannot disagree.
 */

import { query, runAsSystem, closeSqlPool } from "../lib/sql.js";
import { PERMISSIONS, ROLE_HIERARCHY } from "../src/config/roles.js";
import { PERMISSION_CATALOG, getPermission } from "../src/config/permissions.js";
import {
    ROLE_POSITIONS,
    EXTRA_POSITIONS,
    TODAY_RULES,
    permissionsForRole,
    loadMergedMatrix,
} from "../lib/legacyRoleMap.js";

/**
 * Print the side-by-side report.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const isDemo = process.argv.includes("--demo");
    const schema = isDemo ? "demo" : "dbo";

    // Every department-scoped catalogue key must have a rule (VS-only keys excepted).
    const missing = PERMISSION_CATALOG
        .filter((p) => p.scope === "department" && !p.volunteerServicesOnly && !(p.key in TODAY_RULES))
        .map((p) => p.key);
    const extra = Object.keys(TODAY_RULES).filter((k) => !getPermission(k));
    if (missing.length || extra.length) {
        throw new Error(`TODAY_RULES out of step with the catalogue. Missing: ${missing.join(", ") || "none"}; unknown: ${extra.join(", ") || "none"}`);
    }

    const db = (await query("SELECT DB_NAME() AS name;")).recordset[0].name;
    const { matrix, overrides } = await loadMergedMatrix(query);
    const counts = (await query(
        `SELECT role, COUNT(*) AS n FROM dbo.department_members WHERE department_id = 1 GROUP BY role;`,
    )).recordset;
    const extras = (await query(
        `SELECT SUM(CAST(ISNULL(extra_signs_placement, 0) AS INT)) AS signs,
                SUM(CAST(ISNULL(extra_parking_count, 0) AS INT))   AS counts
         FROM dbo.volunteer_in;`,
    )).recordset[0];


    console.log(`Database ${db}, schema ${schema}`);
    console.log("");
    console.log(`Saved Permission Matrix changes (role_permissions): ${overrides.length}`);
    for (const o of overrides) {
        const factory = PERMISSIONS[o.role_name]?.[o.permission];
        console.log(`  ${o.role_name.padEnd(16)} ${o.permission.padEnd(26)} ${factory ? "on " : "off"} -> ${o.is_granted ? "on" : "off"}`);
    }

    const notes = new Map();
    let previous = [];
    for (const rp of ROLE_POSITIONS) {
        const perms = permissionsForRole(rp.role, matrix);
        const n = counts.find((c) => c.role === rp.role)?.n ?? 0;
        const added = perms.filter((p) => !previous.includes(p));
        const removed = previous.filter((p) => !perms.includes(p));
        const sameLadder = rp.role !== "COUNTER";

        console.log("");
        console.log(`── ${rp.role} → position "${rp.position}"${rp.isDepartmentAdmin ? " (department admin)" : ""} — ${n} people, ${perms.length} permissions`);
        if (sameLadder && previous.length) {
            console.log(`   adds:    ${added.join(", ") || "(nothing)"}`);
            if (removed.length) console.log(`   LOSES vs previous role: ${removed.join(", ")}`);
        } else {
            console.log(`   has:     ${perms.join(", ") || "(nothing)"}`);
        }
        for (const p of perms) if (TODAY_RULES[p].note) notes.set(p, TODAY_RULES[p].note);
        if (sameLadder) previous = perms;
    }

    console.log("");
    console.log("── Per-person extras");
    for (const e of EXTRA_POSITIONS) {
        const n = e.column === "extra_signs_placement" ? extras.signs : extras.counts;
        console.log(`   ${e.column} → position "${e.position}" (${e.permissions.join(", ")}) — ${n ?? 0} people`);
    }

    const ungranted = PERMISSION_CATALOG
        .filter((p) => p.scope === "department" && !p.volunteerServicesOnly)
        .filter((p) => !ROLE_POSITIONS.some((rp) => permissionsForRole(rp.role, matrix).includes(p.key)))
        .map((p) => p.key);
    console.log("");
    console.log(`── Not in any Parking position: ${ungranted.join(", ") || "(none)"}`);
    console.log("   Volunteer Services only (not given to Parking): departments.runDecentlyForAll, departments.viewAllPeople, departments.sendCampaigns, departments.manageStanding");

    console.log("");
    console.log("── Judgement calls to confirm");
    for (const [k, n] of notes) console.log(`   ${k.padEnd(28)} ${n}`);
    console.log("");
    console.log(`Roles in use: ${ROLE_HIERARCHY.join(", ")}`);
}

try {
    await runAsSystem(main, { isDemo: process.argv.includes("--demo") });
} catch (err) {
    console.error("positionsFromRoles failed:", err.message);
    process.exitCode = 1;
} finally {
    await closeSqlPool();
}
