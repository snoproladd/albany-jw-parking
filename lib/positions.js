/**
 * @file lib/positions.js
 * @description Positions and effective permissions (multi-department phase 3c).
 *
 * A person's permissions in a department are the union of the permissions
 * of the positions they hold there (src/config/permissions.js keys), plus
 * the account-level permissions everyone has. Convention admins have every
 * permission.
 *
 * Until phase 3d the role on department_members still decides access, so
 * syncLegacyPositions() keeps member_positions in step with each member's
 * role and extra_* flags (positions with legacy_role / legacy_extra). It
 * runs at sign-in and on department switch; 3d drops the role and makes
 * positions the only source.
 *
 * Tables: scripts/migrations/positions.sql. Starting positions:
 * scripts/seedPositions.js.
 */

import sql from "mssql";
import { exec } from "./dbSync.js";
import { PERMISSION_CATALOG } from "../src/config/permissions.js";

/**
 * Permissions every signed-in person has, whatever their positions.
 * @type {ReadonlyArray<string>}
 */
export const ACCOUNT_PERMISSIONS = Object.freeze(
    PERMISSION_CATALOG.filter((p) => p.scope === "account").map((p) => p.key),
);

/**
 * Every catalogue key — what a convention admin has.
 * @type {ReadonlyArray<string>}
 */
const ALL_PERMISSIONS = Object.freeze(PERMISSION_CATALOG.map((p) => p.key));

/**
 * The legacy-managed position assignments a person (or everyone) should
 * have, from their roles and extra_* flags. Shared by syncLegacyPositions().
 *
 * Volunteer_in and department_members are read directly, so call this in
 * system scope (a person may serve in departments the current one can't see).
 */
const DESIRED_SQL = `
    DECLARE @desired TABLE (volunteer_id INT, department_id INT, position_id INT,
                            PRIMARY KEY (volunteer_id, position_id));

    INSERT INTO @desired (volunteer_id, department_id, position_id)
    SELECT m.volunteer_id, m.department_id, p.id
    FROM dbo.department_members m
    JOIN dbo.positions p
      ON p.department_id = m.department_id AND p.legacy_role = m.role AND p.active = 1
    WHERE (@volunteerId IS NULL OR m.volunteer_id = @volunteerId)
    UNION
    SELECT m.volunteer_id, m.department_id, p.id
    FROM dbo.department_members m
    JOIN dbo.volunteer_in v ON v.id = m.volunteer_id
    JOIN dbo.positions p
      ON p.department_id = m.department_id AND p.active = 1
     AND ((p.legacy_extra = 'extra_signs_placement' AND v.extra_signs_placement = 1)
       OR (p.legacy_extra = 'extra_parking_count'   AND v.extra_parking_count   = 1))
    WHERE (@volunteerId IS NULL OR m.volunteer_id = @volunteerId);
`;

/**
 * Bring member_positions in line with roles and extra_* flags, for the
 * positions that mirror them (legacy_role / legacy_extra). Positions with
 * neither (created later on the Positions page) are never touched.
 *
 * Must run in system scope (withScope("system", ...)).
 *
 * @param {number|null} [volunteerId]  One person, or null for everyone.
 * @param {string} [grantedBy]         Recorded on new rows.
 * @returns {Promise<{ added: number, removed: number }>}
 */
export async function syncLegacyPositions(volunteerId = null, grantedBy = "role sync") {
    const result = await exec(
        `${DESIRED_SQL}

        DELETE mp
        FROM dbo.member_positions mp
        JOIN dbo.positions p ON p.id = mp.position_id
        WHERE (p.legacy_role IS NOT NULL OR p.legacy_extra IS NOT NULL)
          AND (@volunteerId IS NULL OR mp.volunteer_id = @volunteerId)
          AND NOT EXISTS (SELECT 1 FROM @desired d
                          WHERE d.volunteer_id = mp.volunteer_id AND d.position_id = mp.position_id);
        DECLARE @removed INT = @@ROWCOUNT;

        INSERT INTO dbo.member_positions (volunteer_id, department_id, position_id, granted_by)
        SELECT d.volunteer_id, d.department_id, d.position_id, @grantedBy
        FROM @desired d
        WHERE NOT EXISTS (SELECT 1 FROM dbo.member_positions mp
                          WHERE mp.volunteer_id = d.volunteer_id AND mp.position_id = d.position_id);
        DECLARE @added INT = @@ROWCOUNT;

        SELECT @added AS added, @removed AS removed;`,
        (req) => {
            req.input("volunteerId", sql.Int, volunteerId);
            req.input("grantedBy", sql.NVarChar(200), grantedBy);
        },
    );
    const row = result.recordset?.[0] ?? {};
    return { added: row.added ?? 0, removed: row.removed ?? 0 };
}

/**
 * A person's positions and effective permissions in one department.
 *
 * Must run in system scope or in that department's scope.
 *
 * @param {number}  volunteerId
 * @param {number}  departmentId
 * @param {boolean} [isConventionAdmin]
 * @returns {Promise<{ permissions: string[], positions: Array<{ id: number, name: string }> }>}
 */
export async function getEffectivePermissions(volunteerId, departmentId, isConventionAdmin = false) {
    const result = await exec(
        `SELECT p.id, p.name, pp.permission_key
         FROM dbo.member_positions mp
         JOIN dbo.positions p ON p.id = mp.position_id AND p.active = 1
         LEFT JOIN dbo.position_permissions pp ON pp.position_id = p.id
         WHERE mp.volunteer_id = @volunteerId
           AND mp.department_id = @departmentId
         ORDER BY p.sort_order, p.name;`,
        (req) => {
            req.input("volunteerId", sql.Int, volunteerId);
            req.input("departmentId", sql.Int, departmentId);
        },
    );

    const rows = result.recordset || [];
    const positions = [];
    const seen = new Set();
    const keys = new Set(ACCOUNT_PERMISSIONS);
    for (const r of rows) {
        if (!seen.has(r.id)) {
            seen.add(r.id);
            positions.push({ id: r.id, name: r.name });
        }
        if (r.permission_key) keys.add(r.permission_key);
    }
    if (isConventionAdmin) ALL_PERMISSIONS.forEach((k) => keys.add(k));

    return { permissions: [...keys].sort(), positions };
}

/**
 * True when the session's effective permissions include `key`.
 * Not used for access decisions until phase 3d.
 *
 * @param {Record<string, any> | undefined} session
 * @param {string} key
 * @returns {boolean}
 */
export function sessionHasPermission(session, key) {
    return Array.isArray(session?.effectivePermissions) && session.effectivePermissions.includes(key);
}
