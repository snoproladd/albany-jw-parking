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
 * One department's positions with their permissions and how many people
 * hold each, for the Positions page (phase 3d-7b; retired positions and the
 * editor fields added in 3d-7c).
 *
 * The department is passed in rather than read from the session context,
 * because Volunteer Services staff may look at any department: run it in
 * system scope (withScope("system", ...)).
 *
 * @param {number} departmentId
 * @param {{ includeInactive?: boolean }} [options]  includeInactive: also
 *        return retired positions (active false), for the editor.
 * @returns {Promise<Array<{ id: number, name: string, description: string|null, tier: number|null,
 *                           isDepartmentAdmin: boolean, isDefault: boolean, sortOrder: number,
 *                           active: boolean, memberCount: number, permissions: string[] }>>}
 *          In display order (sort_order, then name).
 */
export async function getPositionMatrix(departmentId, options = {}) {
    const includeInactive = options.includeInactive === true;
    const result = await exec(
        `SELECT p.id, p.name, p.description, p.tier, p.is_department_admin, p.is_default, p.sort_order, p.active,
                (SELECT COUNT(DISTINCT mp.volunteer_id)
                 FROM dbo.member_positions mp
                 WHERE mp.position_id = p.id) AS member_count
         FROM dbo.positions p
         WHERE p.department_id = @departmentId
           AND (p.active = 1 OR @includeInactive = 1)
         ORDER BY p.sort_order, p.name;

         SELECT pp.position_id, pp.permission_key
         FROM dbo.position_permissions pp
         JOIN dbo.positions p ON p.id = pp.position_id
         WHERE p.department_id = @departmentId
           AND (p.active = 1 OR @includeInactive = 1);`,
        (req) => {
            req.input("departmentId", sql.Int, departmentId);
            req.input("includeInactive", sql.Bit, includeInactive);
        },
    );

    const rows = result.recordsets?.[0] || result.recordset || [];
    const links = result.recordsets?.[1] || [];

    /** @type {Map<number, string[]>} */
    const byPosition = new Map();
    for (const l of links) {
        if (!byPosition.has(l.position_id)) byPosition.set(l.position_id, []);
        byPosition.get(l.position_id).push(l.permission_key);
    }

    return rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description ?? null,
        tier: r.tier == null ? null : Number(r.tier),
        isDepartmentAdmin: r.is_department_admin === true || r.is_department_admin === 1,
        isDefault: r.is_default === true || r.is_default === 1,
        sortOrder: r.sort_order ?? 0,
        active: r.active === true || r.active === 1,
        memberCount: r.member_count ?? 0,
        permissions: (byPosition.get(r.id) ?? []).sort(),
    }));
}

/**
 * What the position editor needs to know about the person editing
 * (phase 3d-7c): whether they hold a department-admin position in the
 * department, and which positions they hold there.
 *
 * Must run in system scope or in that department's scope.
 *
 * @param {number} volunteerId
 * @param {number} departmentId
 * @returns {Promise<{ isDepartmentAdmin: boolean, positionIds: number[] }>}
 */
export async function getEditorContext(volunteerId, departmentId) {
    const result = await exec(
        `SELECT p.id, p.is_department_admin
         FROM dbo.member_positions mp
         JOIN dbo.positions p ON p.id = mp.position_id AND p.active = 1
         WHERE mp.volunteer_id = @volunteerId
           AND mp.department_id = @departmentId;`,
        (req) => {
            req.input("volunteerId", sql.Int, volunteerId);
            req.input("departmentId", sql.Int, departmentId);
        },
    );
    const rows = result.recordset || [];
    return {
        isDepartmentAdmin: rows.some((r) => r.is_department_admin === true || r.is_department_admin === 1),
        positionIds: rows.map((r) => r.id),
    };
}

/**
 * True when the person would still hold `key` in the department without
 * position `exceptPositionId`: through another active position they hold
 * or an individual grant in force. Used to stop someone removing
 * positions.manage from their own position and locking themselves out.
 *
 * Must run in system scope or in that department's scope.
 *
 * @param {number} volunteerId
 * @param {number} departmentId
 * @param {string} key
 * @param {number} exceptPositionId
 * @returns {Promise<boolean>}
 */
export async function holdsPermissionWithout(volunteerId, departmentId, key, exceptPositionId) {
    const result = await exec(
        `SELECT CASE WHEN EXISTS (
                    SELECT 1
                    FROM dbo.member_positions mp
                    JOIN dbo.positions p ON p.id = mp.position_id AND p.active = 1
                    JOIN dbo.position_permissions pp ON pp.position_id = p.id
                    WHERE mp.volunteer_id = @volunteerId AND mp.department_id = @departmentId
                      AND p.id <> @exceptPositionId AND pp.permission_key = @key)
                 OR EXISTS (
                    SELECT 1
                    FROM dbo.member_permissions g
                    WHERE g.volunteer_id = @volunteerId AND g.department_id = @departmentId
                      AND g.permission_key = @key AND ${ACTIVE_GRANT_SQL("g")})
                 THEN 1 ELSE 0 END AS holds;`,
        (req) => {
            req.input("volunteerId", sql.Int, volunteerId);
            req.input("departmentId", sql.Int, departmentId);
            req.input("key", sql.NVarChar(64), key);
            req.input("exceptPositionId", sql.Int, exceptPositionId);
        },
    );
    return result.recordset?.[0]?.holds === 1;
}

/**
 * Create or update one position and its permissions, and log it, in one
 * transaction (phase 3d-7c). The caller has already checked the change
 * (lib/positionEditing.js planPositionSave()).
 *
 * Must run in that department's scope (or system scope).
 *
 * @param {{
 *   departmentId: number,
 *   positionId: number|null,      null creates a new position
 *   name: string,
 *   description: string|null,
 *   tier: number,
 *   sortOrder: number,
 *   isDepartmentAdmin: boolean,
 *   permissions: string[],        the full new list
 *   added: string[],
 *   removed: string[],
 *   actorId: number,
 *   actorName: string,
 * }} input
 * @returns {Promise<number>} The position's id.
 * @throws {Error} With code "NAME_TAKEN" when another position in the
 *         department already has the name, or "NOT_FOUND".
 */
export async function savePosition(input) {
    const change = input.positionId == null ? "create" : "edit";
    const detail = JSON.stringify({ change, added: input.added, removed: input.removed });

    const result = await exec(
        `SET XACT_ABORT ON;

         IF EXISTS (SELECT 1 FROM dbo.positions
                    WHERE department_id = @departmentId AND name = @name
                      AND (@positionId IS NULL OR id <> @positionId))
         BEGIN
             SELECT CAST(NULL AS INT) AS id, N'NAME_TAKEN' AS error;
             RETURN;
         END

         IF @positionId IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM dbo.positions WHERE id = @positionId AND department_id = @departmentId)
         BEGIN
             SELECT CAST(NULL AS INT) AS id, N'NOT_FOUND' AS error;
             RETURN;
         END

         BEGIN TRANSACTION;

         DECLARE @id INT = @positionId;

         IF @id IS NULL
         BEGIN
             INSERT INTO dbo.positions (department_id, name, description, is_department_admin, is_default,
                                        sort_order, tier, active)
             VALUES (@departmentId, @name, @description, @isAdmin, 0, @sortOrder, @tier, 1);
             SET @id = SCOPE_IDENTITY();
         END
         ELSE
         BEGIN
             UPDATE dbo.positions
             SET name = @name,
                 description = @description,
                 is_department_admin = @isAdmin,
                 sort_order = @sortOrder,
                 tier = @tier,
                 updated_at = SYSUTCDATETIME()
             WHERE id = @id AND department_id = @departmentId;
         END

         DECLARE @keys TABLE (permission_key NVARCHAR(64) PRIMARY KEY);
         INSERT INTO @keys (permission_key)
         SELECT DISTINCT CAST([value] AS NVARCHAR(64)) FROM OPENJSON(@permissions);

         DELETE pp
         FROM dbo.position_permissions pp
         WHERE pp.position_id = @id
           AND NOT EXISTS (SELECT 1 FROM @keys k WHERE k.permission_key = pp.permission_key);

         INSERT INTO dbo.position_permissions (position_id, department_id, permission_key)
         SELECT @id, @departmentId, k.permission_key
         FROM @keys k
         WHERE NOT EXISTS (SELECT 1 FROM dbo.position_permissions pp
                           WHERE pp.position_id = @id AND pp.permission_key = k.permission_key);

         INSERT INTO dbo.permission_grant_log (department_id, volunteer_id, action, position_id, detail,
                                               actor_id, actor_name)
         VALUES (@departmentId, @actorId, N'position-edit', @id, @detail, @actorId, @actorName);

         COMMIT TRANSACTION;

         SELECT @id AS id, CAST(NULL AS NVARCHAR(20)) AS error;`,
        (req) => {
            req.input("departmentId", sql.Int, input.departmentId);
            req.input("positionId", sql.Int, input.positionId);
            req.input("name", sql.NVarChar(80), input.name);
            req.input("description", sql.NVarChar(400), input.description);
            req.input("tier", sql.TinyInt, input.tier);
            req.input("sortOrder", sql.Int, input.sortOrder);
            req.input("isAdmin", sql.Bit, input.isDepartmentAdmin);
            req.input("permissions", sql.NVarChar(sql.MAX), JSON.stringify(input.permissions));
            req.input("detail", sql.NVarChar(2000), detail);
            req.input("actorId", sql.Int, input.actorId);
            req.input("actorName", sql.NVarChar(200), input.actorName);
        },
    );

    const recordsets = result.recordsets || [result.recordset || []];
    const row = recordsets[recordsets.length - 1]?.[0] ?? {};
    if (row.error) {
        const err = new Error(row.error === "NAME_TAKEN"
            ? "Another position in this department already has that name."
            : "That position was not found in this department.");
        err.code = row.error;
        throw err;
    }
    return row.id;
}

/**
 * Retire (active false) or reactivate a position, and log it (phase 3d-7c).
 * A position anyone holds can't be retired, nor can the default Volunteer
 * position. Retired positions keep their permissions and can come back.
 *
 * Must run in that department's scope (or system scope).
 *
 * @param {{ departmentId: number, positionId: number, active: boolean,
 *           actorId: number, actorName: string }} input
 * @returns {Promise<void>}
 * @throws {Error} With code "NOT_FOUND", "IS_DEFAULT" or "HAS_MEMBERS".
 */
export async function setPositionActive(input) {
    const detail = JSON.stringify({ change: input.active ? "reactivate" : "retire" });
    const result = await exec(
        `SET XACT_ABORT ON;

         DECLARE @isDefault BIT, @members INT;
         SELECT @isDefault = p.is_default,
                @members = (SELECT COUNT(*) FROM dbo.member_positions mp WHERE mp.position_id = p.id)
         FROM dbo.positions p
         WHERE p.id = @positionId AND p.department_id = @departmentId;

         IF @isDefault IS NULL
             SELECT N'NOT_FOUND' AS error;
         ELSE IF @active = 0 AND @isDefault = 1
             SELECT N'IS_DEFAULT' AS error;
         ELSE IF @active = 0 AND @members > 0
             SELECT N'HAS_MEMBERS' AS error;
         ELSE
         BEGIN
             BEGIN TRANSACTION;
             UPDATE dbo.positions
             SET active = @active, updated_at = SYSUTCDATETIME()
             WHERE id = @positionId AND department_id = @departmentId;

             INSERT INTO dbo.permission_grant_log (department_id, volunteer_id, action, position_id, detail,
                                                   actor_id, actor_name)
             VALUES (@departmentId, @actorId, N'position-edit', @positionId, @detail, @actorId, @actorName);
             COMMIT TRANSACTION;
             SELECT CAST(NULL AS NVARCHAR(20)) AS error;
         END`,
        (req) => {
            req.input("departmentId", sql.Int, input.departmentId);
            req.input("positionId", sql.Int, input.positionId);
            req.input("active", sql.Bit, input.active);
            req.input("detail", sql.NVarChar(2000), detail);
            req.input("actorId", sql.Int, input.actorId);
            req.input("actorName", sql.NVarChar(200), input.actorName);
        },
    );

    const error = result.recordset?.[0]?.error;
    if (error) {
        const messages = {
            NOT_FOUND: "That position was not found in this department.",
            IS_DEFAULT: "The default Volunteer position can't be retired.",
            HAS_MEMBERS: "People still hold this position. Move them to another position first.",
        };
        const err = new Error(messages[error] || "Could not change the position.");
        err.code = error;
        throw err;
    }
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
