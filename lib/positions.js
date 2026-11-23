/**
 * @file lib/positions.js
 * @description Positions and effective permissions (multi-department phases 3c-3d).
 *
 * A person's permissions in a department are the union of the permissions
 * of the positions they hold there (src/config/permissions.js keys), their
 * unexpired individual grants there (member_permissions, phase 3d-7), and
 * the account-level permissions everyone has. Convention admins have every
 * permission.
 *
 * Until the end of phase 3d the role on department_members still exists, so
 * syncLegacyPositions() keeps member_positions in step with each member's
 * role and extra_* flags (positions with legacy_role / legacy_extra). It
 * runs whenever a session's permissions are loaded; 3d-8 removes the role
 * and makes positions the only source.
 *
 * Sessions: loadSessionPermissions() stores a person's permissions and a
 * stamp (getPermissionStamp()) in the session. middleware/permissionStamp.js
 * compares the stamp on every signed-in request and reloads when it has
 * changed, so a change applies on the person's next page load.
 *
 * Tables: scripts/migrations/positions.sql. Starting positions:
 * scripts/seedPositions.js.
 */

import sql from "mssql";
import { exec, getSchedulerCategoryAccessForVolunteer } from "./dbSync.js";
import { withScope } from "./sql.js";
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
 * SQL for "this grant is still in force" on member_permissions alias `alias`.
 *
 * @param {string} alias
 * @returns {string}
 */
const ACTIVE_GRANT_SQL = (alias) => `(${alias}.expires_at IS NULL OR ${alias}.expires_at > SYSUTCDATETIME())`;

/**
 * A person's positions and effective permissions in one department.
 *
 * Must run in system scope or in that department's scope.
 *
 * @param {number}  volunteerId
 * @param {number}  departmentId
 * @param {boolean} [isConventionAdmin]
 * @param {{ includeGrants?: boolean }} [options]  includeGrants (default true):
 *        add unexpired individual grants; verifyPositions.js turns it off to
 *        compare positions with roles only.
 * @returns {Promise<{ permissions: string[], positions: Array<{ id: number, name: string }>, grants: string[] }>}
 */
export async function getEffectivePermissions(volunteerId, departmentId, isConventionAdmin = false, options = {}) {
    const includeGrants = options.includeGrants !== false;
    const result = await exec(
        `SELECT p.id, p.name, pp.permission_key
         FROM dbo.member_positions mp
         JOIN dbo.positions p ON p.id = mp.position_id AND p.active = 1
         LEFT JOIN dbo.position_permissions pp ON pp.position_id = p.id
         WHERE mp.volunteer_id = @volunteerId
           AND mp.department_id = @departmentId
         ORDER BY p.sort_order, p.name;

         SELECT g.permission_key
         FROM dbo.member_permissions g
         WHERE @includeGrants = 1
           AND g.volunteer_id = @volunteerId
           AND g.department_id = @departmentId
           AND ${ACTIVE_GRANT_SQL("g")};`,
        (req) => {
            req.input("volunteerId", sql.Int, volunteerId);
            req.input("departmentId", sql.Int, departmentId);
            req.input("includeGrants", sql.Bit, includeGrants);
        },
    );

    const rows = result.recordsets?.[0] || result.recordset || [];
    const grants = (result.recordsets?.[1] || []).map((r) => r.permission_key);
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
    grants.forEach((k) => keys.add(k));
    if (isConventionAdmin) ALL_PERMISSIONS.forEach((k) => keys.add(k));

    return { permissions: [...keys].sort(), positions, grants };
}

/**
 * A short fingerprint of everything that decides a person's permissions in
 * one department: their role and extra_* flags (until 3d-8 removes them),
 * the convention-admin flag, the positions they hold and those positions'
 * permissions, their individual grants that are in force right now (so a
 * grant that expires changes the stamp too), plus the size of the catalogue
 * (so a deploy that adds keys reloads convention admins). If any of these
 * change, the stamp changes.
 *
 * Must run in system scope (a convention admin may work in a department
 * whose rows hide their own volunteer record).
 *
 * @param {number} volunteerId
 * @param {number} departmentId
 * @returns {Promise<{ stamp: string, isConventionAdmin: boolean }>}
 */
export async function getPermissionStamp(volunteerId, departmentId) {
    const result = await exec(
        `SELECT
             CAST(ISNULL(v.is_convention_admin, 0) AS INT) AS ca,
             CAST(ISNULL(v.extra_signs_placement, 0) AS INT) AS es,
             CAST(ISNULL(v.extra_parking_count, 0) AS INT)   AS ec,
             (SELECT m.role
              FROM dbo.department_members m
              WHERE m.volunteer_id = @volunteerId AND m.department_id = @departmentId) AS r,
             (SELECT CHECKSUM_AGG(CHECKSUM(p.id, p.active, pp.permission_key))
              FROM dbo.member_positions mp
              JOIN dbo.positions p ON p.id = mp.position_id
              LEFT JOIN dbo.position_permissions pp ON pp.position_id = p.id
              WHERE mp.volunteer_id = @volunteerId AND mp.department_id = @departmentId) AS p,
             (SELECT COUNT(*)
              FROM dbo.member_positions mp
              JOIN dbo.position_permissions pp ON pp.position_id = mp.position_id
              WHERE mp.volunteer_id = @volunteerId AND mp.department_id = @departmentId) AS n,
             (SELECT CHECKSUM_AGG(CHECKSUM(g.permission_key, g.expires_at))
              FROM dbo.member_permissions g
              WHERE g.volunteer_id = @volunteerId AND g.department_id = @departmentId
                AND ${ACTIVE_GRANT_SQL("g")}) AS gc,
             (SELECT COUNT(*)
              FROM dbo.member_permissions g
              WHERE g.volunteer_id = @volunteerId AND g.department_id = @departmentId
                AND ${ACTIVE_GRANT_SQL("g")}) AS gn
         FROM dbo.volunteer_in v
         WHERE v.id = @volunteerId;`,
        (req) => {
            req.input("volunteerId", sql.Int, volunteerId);
            req.input("departmentId", sql.Int, departmentId);
        },
    );
    const row = result.recordset?.[0];
    if (!row) return { stamp: "missing", isConventionAdmin: false };
    return {
        stamp: [row.ca, row.es, row.ec, row.r ?? "-", row.p ?? 0, row.n ?? 0, row.gc ?? 0, row.gn ?? 0,
            ALL_PERMISSIONS.length].join(":"),
        isConventionAdmin: row.ca === 1,
    };
}

/**
 * Load a signed-in person's permissions for the session's current
 * department into the session: brings their positions in step with their
 * role first, then stores session.effectivePermissions, session.positions
 * and session.permissionStamp. Runs in system scope itself.
 *
 * Also stores session.sensitiveCategories: null (see every restricted
 * scheduler category) for people with crews.viewRestricted, otherwise the
 * category ids they were given access to. (Nothing applies this filter yet;
 * see the phase 3d plan's TODOs.)
 *
 * Uses session.userId, session.departmentId and session.isConventionAdmin.
 * On failure the person is left with no permissions and a null stamp, so
 * the next request tries again; the error is re-thrown for the caller to log.
 *
 * @param {Record<string, any>} session  req.session.
 * @param {string} [reason]              Recorded as granted_by on synced rows.
 * @returns {Promise<void>}
 */
export async function loadSessionPermissions(session, reason = "sign-in") {
    const volunteerId = session.userId;
    const departmentId = session.departmentId;
    try {
        await withScope("system", async () => {
            await syncLegacyPositions(volunteerId, reason);
            const { permissions, positions } = await getEffectivePermissions(
                volunteerId,
                departmentId,
                session.isConventionAdmin === true,
            );
            const sensitiveCategories = permissions.includes("crews.viewRestricted")
                ? null
                : await getSchedulerCategoryAccessForVolunteer(volunteerId);
            const { stamp } = await getPermissionStamp(volunteerId, departmentId);
            session.effectivePermissions = permissions;
            session.positions = positions;
            session.sensitiveCategories = sensitiveCategories;
            session.permissionStamp = stamp;
        });
    } catch (err) {
        session.effectivePermissions = [];
        session.positions = [];
        session.sensitiveCategories = [];
        session.permissionStamp = null;
        throw err;
    }
}

/**
 * The current department's active positions, in display order. For pickers
 * such as the capacity alerts page (phase 3d-5). Runs in the request's
 * department scope, so row-level security limits it to that department.
 *
 * @returns {Promise<Array<{ id: number, name: string, description: string|null, sort_order: number }>>}
 */
export async function listDepartmentPositions() {
    const result = await exec(
        `SELECT id, name, description, sort_order
         FROM   dbo.positions
         WHERE  active = 1
           AND  department_id = CAST(SESSION_CONTEXT(N'department_id') AS INT)
         ORDER BY sort_order, name;`,
    );
    return result.recordset || [];
}

/**
 * True for a shared counting account: it can log vehicle counts but holds
 * no volunteer basics (no own schedule). Replaces the old userRole ===
 * "COUNTER" checks (phase 3d-6). A volunteer who also counts is not one.
 *
 * @param {Record<string, any> | undefined} session
 * @returns {boolean}
 */
export function isCountingAccount(session) {
    return sessionHasPermission(session, "counts.log")
        && !sessionHasPermission(session, "self.viewSchedule");
}

/**
 * True when the session's effective permissions include `key`.
 * Used by middleware/requirePermission.js for catalogue keys.
 *
 * @param {Record<string, any> | undefined} session
 * @param {string} key
 * @returns {boolean}
 */
export function sessionHasPermission(session, key) {
    return Array.isArray(session?.effectivePermissions) && session.effectivePermissions.includes(key);
}
