/**
 * @file scripts/verifyPositions.js
 * @description Check that positions give every member exactly what their
 * role gives them today (multi-department phase 3c).
 *
 * For every membership: expected = today's role permissions (factory matrix
 * + saved Permission Matrix changes, lib/legacyRoleMap.js) plus the
 * permissions of their extra_* flags (Parking only); actual = the
 * permissions of the positions they hold (lib/positions.js, without the
 * account-level ones and individual grants). Prints every difference. Read-only.
 *
 *     node --env-file=.env scripts/verifyPositions.js          (dbo)
 *     node --env-file=.env scripts/verifyPositions.js --demo   (demo)
 *
 * Exit code 1 if anyone differs.
 */

import { query, runAsSystem, closeSqlPool, DEFAULT_DEPARTMENT_ID } from "../lib/sql.js";
import { getEffectivePermissions, ACCOUNT_PERMISSIONS } from "../lib/positions.js";
import { EXTRA_POSITIONS, permissionsForRole, loadMergedMatrix } from "../lib/legacyRoleMap.js";

const isDemo = process.argv.includes("--demo");

/**
 * Compare expected and actual permissions for every membership.
 *
 * @returns {Promise<number>} Number of memberships that differ.
 */
async function main() {
    const db = (await query("SELECT DB_NAME() AS name;")).recordset[0].name;
    console.log(`Database ${db}, schema ${isDemo ? "demo" : "dbo"}`);

    const { matrix } = await loadMergedMatrix(query);
    const members = (await query(
        `SELECT m.volunteer_id, m.department_id, m.role, d.slug AS department_slug,
                CAST(ISNULL(v.extra_signs_placement, 0) AS BIT) AS signs,
                CAST(ISNULL(v.extra_parking_count, 0) AS BIT)   AS counts,
                v.firstName, v.lastName
         FROM dbo.department_members m
         JOIN dbo.volunteer_in v ON v.id = m.volunteer_id
         JOIN dbo.departments d ON d.id = m.department_id
         ORDER BY m.department_id, v.lastName, v.firstName;`,
    )).recordset;

    let differ = 0;
    for (const m of members) {
        const expected = new Set(m.role ? permissionsForRole(m.role, matrix, m.department_slug) : []);
        if (m.department_id === DEFAULT_DEPARTMENT_ID) {
            for (const e of EXTRA_POSITIONS) {
                const has = e.column === "extra_signs_placement" ? m.signs : m.counts;
                if (has) e.permissions.forEach((p) => expected.add(p));
            }
        }

        // Positions only: individual grants (phase 3d-7) are on top of roles by design.
        const { permissions } = await getEffectivePermissions(m.volunteer_id, m.department_id, false, { includeGrants: false });
        const actual = new Set(permissions.filter((p) => !ACCOUNT_PERMISSIONS.includes(p)));

        const missing = [...expected].filter((p) => !actual.has(p));
        const extra = [...actual].filter((p) => !expected.has(p));
        if (missing.length || extra.length) {
            differ++;
            console.log(`  DIFF dept ${m.department_id} ${m.lastName}, ${m.firstName} (${m.volunteer_id}, ${m.role ?? "no role"})`);
            if (missing.length) console.log(`       missing: ${missing.join(", ")}`);
            if (extra.length) console.log(`       extra:   ${extra.join(", ")}`);
        }
    }

    console.log(`\n${members.length} memberships checked, ${differ} differ.`);
    console.log(differ === 0 ? "ALL MATCH" : "SOME DIFFER");
    return differ;
}

try {
    const differ = await runAsSystem(main, { isDemo });
    process.exitCode = differ === 0 ? 0 : 1;
} catch (err) {
    console.error("verifyPositions failed:", err.message);
    process.exitCode = 1;
} finally {
    await closeSqlPool();
}
