/**
 * @file scripts/seedPositions.js
 * @description Create each department's starting positions from today's
 * roles, and give every member the matching positions
 * (multi-department phase 3c).
 *
 * For each department: one position per role (Volunteer, Desk, Keyman,
 * Overseer, Assistant Admin, Admin, Parking Counter) with exactly the
 * permissions that role has today — the factory matrix plus the changes
 * saved on the Permission Matrix page (lib/legacyRoleMap.js). The Parking
 * department also gets Sign Placement (extra_signs_placement) and its
 * Parking Counter position covers extra_parking_count.
 *
 * Existing positions are left alone unless --refresh is given (so changes
 * made later on the Positions page are not overwritten). Member positions
 * are always brought in step with roles (lib/positions.js).
 *
 * Run after scripts/migrations/positions.sql, from the repo root:
 *     node --env-file=.env scripts/seedPositions.js                  dbo, every active department
 *     node --env-file=.env scripts/seedPositions.js --demo           demo schema
 *     node --env-file=.env scripts/seedPositions.js --department=3   one department
 *     node --env-file=.env scripts/seedPositions.js --refresh        also reset the starting positions' permissions
 *
 * Prints the database first. Safe to re-run.
 */

import sql from "mssql";
import { query, runAsSystem, closeSqlPool, DEFAULT_DEPARTMENT_ID } from "../lib/sql.js";
import { exec } from "../lib/dbSync.js";
import { syncLegacyPositions } from "../lib/positions.js";
import {
    ROLE_POSITIONS,
    EXTRA_POSITIONS,
    permissionsForRole,
    loadMergedMatrix,
} from "../lib/legacyRoleMap.js";

const args = process.argv.slice(2);
const isDemo = args.includes("--demo");
const refresh = args.includes("--refresh");
const onlyDept = Number(args.find((a) => a.startsWith("--department="))?.split("=")[1]) || null;

/**
 * Find or create one position; fill its permissions when new (or --refresh).
 *
 * @param {number} departmentId
 * @param {{ name: string, description: string, isDepartmentAdmin?: boolean, isDefault?: boolean,
 *           legacyRole?: string|null, legacyExtra?: string|null, sortOrder: number, tier: number }} p
 * @param {string[]} permissions
 * @returns {Promise<{ id: number, created: boolean, permissionsSet: boolean }>}
 */
async function upsertPosition(departmentId, p, permissions) {
    const found = await exec(
        `SELECT id FROM dbo.positions WHERE department_id = @d AND name = @name;`,
        (req) => {
            req.input("d", sql.Int, departmentId);
            req.input("name", sql.NVarChar(80), p.name);
        },
    );

    let id = found.recordset?.[0]?.id;
    const created = !id;
    if (created) {
        const ins = await exec(
            `INSERT INTO dbo.positions
                 (department_id, name, description, is_department_admin, is_default,
                  legacy_role, legacy_extra, sort_order, tier)
             OUTPUT inserted.id
             VALUES (@d, @name, @description, @admin, @default, @role, @extra, @sort, @tier);`,
            (req) => {
                req.input("d", sql.Int, departmentId);
                req.input("name", sql.NVarChar(80), p.name);
                req.input("description", sql.NVarChar(400), p.description);
                req.input("admin", sql.Bit, p.isDepartmentAdmin === true);
                req.input("default", sql.Bit, p.isDefault === true);
                req.input("role", sql.NVarChar(40), p.legacyRole ?? null);
                req.input("extra", sql.NVarChar(60), p.legacyExtra ?? null);
                req.input("sort", sql.Int, p.sortOrder);
                req.input("tier", sql.TinyInt, p.tier);
            },
        );
        id = ins.recordset[0].id;
    } else {
        // Keep the legacy links current (e.g. Parking Counter also covering
        // extra_parking_count); --refresh also resets the tier (phase 3d-7).
        await exec(
            `UPDATE dbo.positions
             SET legacy_role  = COALESCE(@role, legacy_role),
                 legacy_extra = COALESCE(@extra, legacy_extra),
                 tier         = IIF(@refresh = 1, @tier, tier)
             WHERE id = @id;`,
            (req) => {
                req.input("id", sql.Int, id);
                req.input("role", sql.NVarChar(40), p.legacyRole ?? null);
                req.input("extra", sql.NVarChar(60), p.legacyExtra ?? null);
                req.input("refresh", sql.Bit, refresh);
                req.input("tier", sql.TinyInt, p.tier);
            },
        );
    }

    const permissionsSet = created || refresh;
    if (permissionsSet) {
        await exec(
            `DELETE FROM dbo.position_permissions WHERE position_id = @id;
             INSERT INTO dbo.position_permissions (position_id, department_id, permission_key)
             SELECT @id, @d, value FROM OPENJSON(@keys);`,
            (req) => {
                req.input("id", sql.Int, id);
                req.input("d", sql.Int, departmentId);
                req.input("keys", sql.NVarChar(sql.MAX), JSON.stringify(permissions));
            },
        );
    }
    return { id, created, permissionsSet };
}

/**
 * Seed every target department, then sync member positions.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const db = (await query("SELECT DB_NAME() AS name;")).recordset[0].name;
    console.log(`Database ${db}, schema ${isDemo ? "demo" : "dbo"}${refresh ? " (refresh)" : ""}`);

    const { matrix, overrides } = await loadMergedMatrix(query);
    console.log(`Permission Matrix changes included: ${overrides.length}`);

    const departments = (await query(
        "SELECT id, name, slug FROM dbo.departments WHERE active = 1 ORDER BY id;",
    )).recordset.filter((d) => !onlyDept || d.id === onlyDept);

    for (const dept of departments) {
        console.log(`\n${dept.name} (department ${dept.id})`);
        const withExtras = dept.id === DEFAULT_DEPARTMENT_ID;
        let sort = 10;

        for (const rp of ROLE_POSITIONS) {
            const coversCounts = withExtras && rp.role === "COUNTER";
            const perms = permissionsForRole(rp.role, matrix, dept.slug);
            const r = await upsertPosition(dept.id, {
                name: rp.position,
                description: rp.description,
                isDepartmentAdmin: rp.isDepartmentAdmin,
                isDefault: rp.role === "REGISTERED",
                legacyRole: rp.role,
                legacyExtra: coversCounts ? "extra_parking_count" : null,
                sortOrder: sort,
                tier: rp.tier,
            }, perms);
            sort += 10;
            console.log(`  ${r.created ? "created " : "exists  "} ${rp.position.padEnd(16)} ${r.permissionsSet ? `${perms.length} permissions set` : "permissions unchanged"}`);
        }

        if (withExtras) {
            for (const e of EXTRA_POSITIONS.filter((x) => x.position !== "Parking Counter")) {
                const r = await upsertPosition(dept.id, {
                    name: e.position,
                    description: e.description,
                    legacyExtra: e.column,
                    sortOrder: sort,
                    tier: e.tier,
                }, e.permissions);
                sort += 10;
                console.log(`  ${r.created ? "created " : "exists  "} ${e.position.padEnd(16)} ${r.permissionsSet ? `${e.permissions.length} permissions set` : "permissions unchanged"}`);
            }
        }
    }

    const { added, removed } = await syncLegacyPositions(null, "seedPositions");
    console.log(`\nMember positions: ${added} added, ${removed} removed.`);
}

try {
    await runAsSystem(main, { isDemo });
} catch (err) {
    console.error("seedPositions failed:", err.message);
    process.exitCode = 1;
} finally {
    await closeSqlPool();
}
