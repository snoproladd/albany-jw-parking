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
 * Until the end of phase 3d the role on department_members still exists.
 * Up to 3d-7c, syncLegacyPositions() rebuilt each person's positions from
 * their role on every page load. From 3d-7d positions are assigned on the
 * Positions page's People tab, which writes the role back
 * (legacyRoleFor()); the page load only makes sure every member holds a
 * position (ensureDefaultPosition()). The old role tools still call
 * syncLegacyPositions() for the person they change, until 3d-7e retires
 * them; 3d-8 removes the role.
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
 * Give a person the default position in every department where they are a
 * member, have finished registering (role other than NON_REGISTERED), are
 * not archived or deleted (3d-7f: archived counting accounts stay empty)
 * and hold no active position (phase 3d-7d). Replaces the page-load role sync:
 * new members (Decently import, registration) start as the department's
 * Volunteer, and nobody is left with no position at all.
 *
 * Must run in system scope (withScope("system", ...)).
 *
 * @param {number} volunteerId
 * @param {string} [grantedBy]  Recorded on the new rows.
 * @returns {Promise<number>} How many positions were added.
 */
export async function ensureDefaultPosition(volunteerId, grantedBy = "default position") {
    const result = await exec(
        `INSERT INTO dbo.member_positions (volunteer_id, department_id, position_id, granted_by)
         SELECT m.volunteer_id, m.department_id, p.id, @grantedBy
         FROM dbo.department_members m
         JOIN dbo.volunteer_in v
           ON v.id = m.volunteer_id AND v.registration_status NOT IN ('archived', 'deleted')
         JOIN dbo.positions p
           ON p.department_id = m.department_id AND p.is_default = 1 AND p.active = 1
         WHERE m.volunteer_id = @volunteerId
           AND ISNULL(m.role, N'NON_REGISTERED') <> N'NON_REGISTERED'
           AND NOT EXISTS (SELECT 1
                           FROM dbo.member_positions mp
                           JOIN dbo.positions hp ON hp.id = mp.position_id AND hp.active = 1
                           WHERE mp.volunteer_id = m.volunteer_id AND mp.department_id = m.department_id);
         SELECT @@ROWCOUNT AS added;`,
        (req) => {
            req.input("volunteerId", sql.Int, volunteerId);
            req.input("grantedBy", sql.NVarChar(200), grantedBy);
        },
    );
    return result.recordset?.[0]?.added ?? 0;
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
 * department into the session: gives them the department's default
 * position first if they hold none (ensureDefaultPosition()), then stores session.effectivePermissions, session.positions
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
 * @param {string} [reason]              Recorded as granted_by on a default position it adds.
 * @returns {Promise<void>}
 */
export async function loadSessionPermissions(session, reason = "sign-in") {
    const volunteerId = session.userId;
    const departmentId = session.departmentId;
    try {
        await withScope("system", async () => {
            await ensureDefaultPosition(volunteerId, reason);
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
 *                           active: boolean, memberCount: number, permissions: string[],
 *                           legacyRole: string|null, legacyExtra: string|null }>>}
 *          In display order (sort_order, then name).
 */
export async function getPositionMatrix(departmentId, options = {}) {
    const includeInactive = options.includeInactive === true;
    const result = await exec(
        `SELECT p.id, p.name, p.description, p.tier, p.is_department_admin, p.is_default, p.sort_order, p.active,
                p.legacy_role, p.legacy_extra,
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
        legacyRole: r.legacy_role ?? null,
        legacyExtra: r.legacy_extra ?? null,
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
 * The members of a department, for the People tab's picker (phase 3d-7d).
 * Archived accounts are left out.
 *
 * Must run in system scope (withScope("system", ...)).
 *
 * @param {number} departmentId
 * @returns {Promise<Array<{ id: number, firstName: string|null, lastName: string|null, email: string|null,
 *                           positions: string }>>}  positions: names, comma-separated.
 */
export async function getDepartmentMembers(departmentId) {
    const result = await exec(
        `SELECT v.id, v.firstName, v.lastName, v.email,
                STUFF((SELECT N', ' + p.name
                       FROM dbo.member_positions mp
                       JOIN dbo.positions p ON p.id = mp.position_id AND p.active = 1
                       WHERE mp.volunteer_id = m.volunteer_id AND mp.department_id = m.department_id
                       ORDER BY p.sort_order, p.name
                       FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 2, N'') AS positions
         FROM dbo.department_members m
         JOIN dbo.volunteer_in v ON v.id = m.volunteer_id
         WHERE m.department_id = @departmentId
           AND v.registration_status <> 'archived'
         ORDER BY v.lastName, v.firstName, v.id;`,
        (req) => {
            req.input("departmentId", sql.Int, departmentId);
        },
    );
    return (result.recordset || []).map((r) => ({
        id: r.id,
        firstName: r.firstName ?? null,
        lastName: r.lastName ?? null,
        email: r.email ?? null,
        positions: r.positions ?? "",
    }));
}

/**
 * @typedef {Object} PersonGrant
 * @property {string} key
 * @property {string|null} expiresAt  ISO timestamp, or null for no expiry.
 * @property {string|null} note
 * @property {string|null} grantedBy
 * @property {string|null} grantedAt  ISO timestamp.
 */

/**
 * One member's access in a department, for the People tab (phase 3d-7d):
 * their membership, the positions they hold, their individual grants in
 * force, and their last changes from permission_grant_log.
 *
 * Must run in system scope (withScope("system", ...)).
 *
 * @param {number} volunteerId
 * @param {number} departmentId
 * @returns {Promise<null | { id: number, firstName: string|null, lastName: string|null, email: string|null,
 *                            role: string|null, positionIds: number[], grants: PersonGrant[],
 *                            history: Array<{ action: string, permissionKey: string|null, positionName: string|null,
 *                                             detail: string|null, note: string|null, actorName: string|null,
 *                                             createdAt: string }> }>}
 *          null when they are not a member of the department.
 */
export async function getPersonAccess(volunteerId, departmentId) {
    const result = await exec(
        `SELECT v.id, v.firstName, v.lastName, v.email, m.role
         FROM dbo.department_members m
         JOIN dbo.volunteer_in v ON v.id = m.volunteer_id
         WHERE m.volunteer_id = @volunteerId AND m.department_id = @departmentId;

         SELECT mp.position_id
         FROM dbo.member_positions mp
         JOIN dbo.positions p ON p.id = mp.position_id AND p.active = 1
         WHERE mp.volunteer_id = @volunteerId AND mp.department_id = @departmentId;

         SELECT g.permission_key, g.expires_at, g.note, g.granted_by, g.granted_at
         FROM dbo.member_permissions g
         WHERE g.volunteer_id = @volunteerId AND g.department_id = @departmentId
           AND ${ACTIVE_GRANT_SQL("g")}
         ORDER BY g.permission_key;

         SELECT TOP (15) l.action, l.permission_key, p.name AS position_name, l.detail, l.note,
                l.actor_name, l.created_at
         FROM dbo.permission_grant_log l
         LEFT JOIN dbo.positions p ON p.id = l.position_id
         WHERE l.volunteer_id = @volunteerId AND l.department_id = @departmentId
           AND l.action <> N'position-edit'
         ORDER BY l.created_at DESC, l.id DESC;`,
        (req) => {
            req.input("volunteerId", sql.Int, volunteerId);
            req.input("departmentId", sql.Int, departmentId);
        },
    );
    const [members = [], positions = [], grants = [], history = []] = result.recordsets || [];
    const m = members[0];
    if (!m) return null;

    /**
     * @param {Date|string|null|undefined} d
     * @returns {string|null}
     */
    const iso = (d) => (d ? new Date(d).toISOString() : null);

    return {
        id: m.id,
        firstName: m.firstName ?? null,
        lastName: m.lastName ?? null,
        email: m.email ?? null,
        role: m.role ?? null,
        positionIds: positions.map((r) => r.position_id),
        grants: grants.map((g) => ({
            key: g.permission_key,
            expiresAt: iso(g.expires_at),
            note: g.note ?? null,
            grantedBy: g.granted_by ?? null,
            grantedAt: iso(g.granted_at),
        })),
        history: history.map((h) => ({
            action: h.action,
            permissionKey: h.permission_key ?? null,
            positionName: h.position_name ?? null,
            detail: h.detail ?? null,
            note: h.note ?? null,
            actorName: h.actor_name ?? null,
            createdAt: iso(h.created_at),
        })),
    };
}

/**
 * Apply a People-tab change in one transaction (phase 3d-7d): positions
 * added and removed, grants added and revoked, the role and extra_* flags
 * written back, and one log row per change (plus one "tier-down" row with
 * its details when the change was a tier-down). The caller has checked
 * everything (lib/positionEditing.js planPersonSave()).
 *
 * Runs with an explicit department, so call it in system scope: Volunteer
 * Services staff may change another department.
 *
 * @param {{
 *   departmentId: number,
 *   volunteerId: number,
 *   positionsAdd: number[],
 *   positionsRemove: number[],
 *   grantsAdd: Array<{ key: string, expiresAt: string|null, note: string|null }>,
 *   grantsRemove: string[],
 *   tierDown: Record<string, any> | null,   logged as the "tier-down" detail
 *   role: string|null,                      new department_members.role, or null to leave it
 *   extras: { extra_signs_placement?: boolean, extra_parking_count?: boolean },
 *   note: string|null,
 *   actorId: number,
 *   actorName: string,
 * }} input
 * @returns {Promise<void>}
 */
export async function savePersonAccess(input) {
    const extras = input.extras ?? {};
    await exec(
        `SET XACT_ABORT ON;
         BEGIN TRANSACTION;

         DECLARE @addPositions TABLE (position_id INT PRIMARY KEY);
         INSERT INTO @addPositions SELECT DISTINCT CAST([value] AS INT) FROM OPENJSON(@positionsAdd);
         DECLARE @removePositions TABLE (position_id INT PRIMARY KEY);
         INSERT INTO @removePositions SELECT DISTINCT CAST([value] AS INT) FROM OPENJSON(@positionsRemove);
         DECLARE @addGrants TABLE (permission_key NVARCHAR(64) PRIMARY KEY, expires_at DATETIME2(3) NULL, note NVARCHAR(400) NULL);
         INSERT INTO @addGrants
         SELECT [key], expiresAt, note
         FROM OPENJSON(@grantsAdd) WITH ([key] NVARCHAR(64) '$.key', expiresAt DATETIME2(3) '$.expiresAt',
                                         note NVARCHAR(400) '$.note');
         DECLARE @removeGrants TABLE (permission_key NVARCHAR(64) PRIMARY KEY);
         INSERT INTO @removeGrants SELECT DISTINCT CAST([value] AS NVARCHAR(64)) FROM OPENJSON(@grantsRemove);

         -- Positions
         DELETE mp
         FROM dbo.member_positions mp
         JOIN @removePositions r ON r.position_id = mp.position_id
         WHERE mp.volunteer_id = @volunteerId AND mp.department_id = @departmentId;

         INSERT INTO dbo.permission_grant_log (department_id, volunteer_id, action, position_id, note, actor_id, actor_name)
         SELECT @departmentId, @volunteerId, N'position-remove', r.position_id, @note, @actorId, @actorName
         FROM @removePositions r;

         INSERT INTO dbo.member_positions (volunteer_id, department_id, position_id, granted_by)
         SELECT @volunteerId, @departmentId, a.position_id, @actorName
         FROM @addPositions a
         JOIN dbo.positions p ON p.id = a.position_id AND p.department_id = @departmentId AND p.active = 1
         WHERE NOT EXISTS (SELECT 1 FROM dbo.member_positions mp
                           WHERE mp.volunteer_id = @volunteerId AND mp.position_id = a.position_id);

         INSERT INTO dbo.permission_grant_log (department_id, volunteer_id, action, position_id, note, actor_id, actor_name)
         SELECT @departmentId, @volunteerId, N'position-add', a.position_id, @note, @actorId, @actorName
         FROM @addPositions a;

         -- Grants (a re-grant replaces the old row, e.g. with a new expiry)
         DELETE g
         FROM dbo.member_permissions g
         WHERE g.volunteer_id = @volunteerId AND g.department_id = @departmentId
           AND (g.permission_key IN (SELECT permission_key FROM @removeGrants)
             OR g.permission_key IN (SELECT permission_key FROM @addGrants));

         INSERT INTO dbo.permission_grant_log (department_id, volunteer_id, action, permission_key, note, actor_id, actor_name)
         SELECT @departmentId, @volunteerId, N'revoke', r.permission_key, @note, @actorId, @actorName
         FROM @removeGrants r;

         INSERT INTO dbo.member_permissions (volunteer_id, department_id, permission_key, granted_by_id, granted_by,
                                             expires_at, note)
         SELECT @volunteerId, @departmentId, a.permission_key, @actorId, @actorName, a.expires_at,
                COALESCE(a.note, @note)
         FROM @addGrants a;

         INSERT INTO dbo.permission_grant_log (department_id, volunteer_id, action, permission_key, detail, note,
                                               actor_id, actor_name)
         SELECT @departmentId, @volunteerId, N'grant', a.permission_key,
                CASE WHEN a.expires_at IS NULL THEN NULL
                     ELSE CONCAT(N'{"expiresAt":"', CONVERT(NVARCHAR(30), a.expires_at, 127), N'"}') END,
                COALESCE(a.note, @note), @actorId, @actorName
         FROM @addGrants a;

         IF @tierDown IS NOT NULL
             INSERT INTO dbo.permission_grant_log (department_id, volunteer_id, action, detail, note, actor_id, actor_name)
             VALUES (@departmentId, @volunteerId, N'tier-down', @tierDown, @note, @actorId, @actorName);

         -- Write the role and extra_* flags back while they still exist (removed in 3d-8).
         IF @role IS NOT NULL
             UPDATE dbo.department_members
             SET role = @role
             WHERE volunteer_id = @volunteerId AND department_id = @departmentId;

         IF @extraSigns IS NOT NULL OR @extraCount IS NOT NULL
             UPDATE dbo.volunteer_in
             SET extra_signs_placement = COALESCE(@extraSigns, extra_signs_placement),
                 extra_parking_count   = COALESCE(@extraCount, extra_parking_count)
             WHERE id = @volunteerId;

         COMMIT TRANSACTION;`,
        (req) => {
            req.input("departmentId", sql.Int, input.departmentId);
            req.input("volunteerId", sql.Int, input.volunteerId);
            req.input("positionsAdd", sql.NVarChar(sql.MAX), JSON.stringify(input.positionsAdd));
            req.input("positionsRemove", sql.NVarChar(sql.MAX), JSON.stringify(input.positionsRemove));
            req.input("grantsAdd", sql.NVarChar(sql.MAX), JSON.stringify(input.grantsAdd));
            req.input("grantsRemove", sql.NVarChar(sql.MAX), JSON.stringify(input.grantsRemove));
            req.input("tierDown", sql.NVarChar(2000), input.tierDown ? JSON.stringify(input.tierDown).slice(0, 2000) : null);
            req.input("role", sql.NVarChar(40), input.role);
            req.input("extraSigns", sql.Bit, typeof extras.extra_signs_placement === "boolean" ? extras.extra_signs_placement : null);
            req.input("extraCount", sql.Bit, typeof extras.extra_parking_count === "boolean" ? extras.extra_parking_count : null);
            req.input("note", sql.NVarChar(400), input.note);
            req.input("actorId", sql.Int, input.actorId);
            req.input("actorName", sql.NVarChar(200), input.actorName);
        },
    );
}

/**
 * @typedef {Object} RolloverItem
 * @property {"position"|"grant"} type
 * @property {number} [positionId]
 * @property {string} [key]
 * @property {string} label       Position name or permission label.
 * @property {number|null} tier
 * @property {boolean} keepByDefault  True for department admins' items.
 */

/**
 * What the year rollover may carry over (phase 3d-7f): for every
 * department, each person holding an Oversight-tier (3) or higher position
 * or a department-admin position, with those positions and their individual
 * grants in force. Department admins' items are kept by default. Lower
 * positions and everyone else's grants always reset, so they aren't listed.
 * Also counts the shared counting accounts the rollover will archive.
 *
 * Must run in system or convention scope (every department).
 *
 * @returns {Promise<{ departments: Array<{ id: number, name: string,
 *                     people: Array<{ volunteerId: number, name: string, items: RolloverItem[] }> }>,
 *                     countingAccounts: number }>}
 */
export async function getRolloverAccessCandidates() {
    const result = await exec(
        `SELECT d.id AS department_id, d.name AS department_name, v.id AS volunteer_id,
                v.firstName, v.lastName, p.id AS position_id, p.name AS position_name, p.tier,
                p.is_department_admin, p.sort_order
         FROM dbo.member_positions mp
         JOIN dbo.positions p ON p.id = mp.position_id AND p.active = 1
         JOIN dbo.departments d ON d.id = mp.department_id
         JOIN dbo.volunteer_in v ON v.id = mp.volunteer_id
         WHERE (p.tier >= 3 OR p.is_department_admin = 1)
           AND v.registration_status NOT IN ('archived', 'deleted')
         ORDER BY d.id, v.lastName, v.firstName, v.id, p.sort_order;

         SELECT g.department_id, g.volunteer_id, g.permission_key
         FROM dbo.member_permissions g
         WHERE ${ACTIVE_GRANT_SQL("g")}
         ORDER BY g.permission_key;

         SELECT COUNT(*) AS counting_accounts
         FROM dbo.volunteer_in v
         WHERE ISNULL(v.is_convention_admin, 0) = 0
           AND v.registration_status <> 'archived'
           AND EXISTS (SELECT 1 FROM dbo.member_positions mp
                       JOIN dbo.positions p ON p.id = mp.position_id AND p.active = 1
                       JOIN dbo.position_permissions pp ON pp.position_id = p.id
                       WHERE mp.volunteer_id = v.id AND pp.permission_key = N'counts.log')
           AND NOT EXISTS (SELECT 1 FROM dbo.member_positions mp
                           JOIN dbo.positions p ON p.id = mp.position_id AND p.active = 1
                           JOIN dbo.position_permissions pp ON pp.position_id = p.id
                           WHERE mp.volunteer_id = v.id AND pp.permission_key = N'self.viewSchedule');`,
    );
    const [rows = [], grants = [], counts = []] = result.recordsets || [];

    /** @type {Map<number, { id: number, name: string, people: Map<number, any> }>} */
    const departments = new Map();
    for (const r of rows) {
        if (!departments.has(r.department_id)) {
            departments.set(r.department_id, { id: r.department_id, name: r.department_name, people: new Map() });
        }
        const dept = departments.get(r.department_id);
        if (!dept.people.has(r.volunteer_id)) {
            const name = [r.lastName, r.firstName].filter(Boolean).join(", ") || `Volunteer ${r.volunteer_id}`;
            dept.people.set(r.volunteer_id, { volunteerId: r.volunteer_id, name, isAdmin: false, items: [] });
        }
        const person = dept.people.get(r.volunteer_id);
        const isAdmin = r.is_department_admin === true || r.is_department_admin === 1;
        if (isAdmin) person.isAdmin = true;
        person.items.push({
            type: "position",
            positionId: r.position_id,
            label: r.position_name,
            tier: r.tier == null ? null : Number(r.tier),
            keepByDefault: false,
        });
    }
    for (const g of grants) {
        const person = departments.get(g.department_id)?.people.get(g.volunteer_id);
        if (!person) continue;
        const def = PERMISSION_CATALOG.find((p) => p.key === g.permission_key);
        person.items.push({
            type: "grant",
            key: g.permission_key,
            label: def?.label ?? g.permission_key,
            tier: def?.tier ?? null,
            keepByDefault: false,
        });
    }

    return {
        departments: [...departments.values()].map((d) => ({
            id: d.id,
            name: d.name,
            people: [...d.people.values()].map((p) => ({
                volunteerId: p.volunteerId,
                name: p.name,
                isDepartmentAdmin: p.isAdmin,
                items: p.items.map((item) => ({ ...item, keepByDefault: p.isAdmin })),
            })),
        })),
        countingAccounts: counts[0]?.counting_accounts ?? 0,
    };
}

/**
 * Log and remove individual grants that have expired (phase 3d-7d). They
 * already stopped counting the moment they expired (ACTIVE_GRANT_SQL); this
 * records "expire" in permission_grant_log and tidies the table. Run by a
 * background timer in index.js, once per schema.
 *
 * Must run in system scope.
 *
 * @returns {Promise<number>} How many grants were removed.
 */
export async function expireGrants() {
    const result = await exec(
        `SET XACT_ABORT ON;
         BEGIN TRANSACTION;
         DECLARE @expired TABLE (volunteer_id INT, department_id INT, permission_key NVARCHAR(64), expires_at DATETIME2(3));

         DELETE g
         OUTPUT deleted.volunteer_id, deleted.department_id, deleted.permission_key, deleted.expires_at
           INTO @expired
         FROM dbo.member_permissions g
         WHERE g.expires_at IS NOT NULL AND g.expires_at <= SYSUTCDATETIME();

         INSERT INTO dbo.permission_grant_log (department_id, volunteer_id, action, permission_key, detail, actor_name)
         SELECT department_id, volunteer_id, N'expire', permission_key,
                CONCAT(N'{"expiresAt":"', CONVERT(NVARCHAR(30), expires_at, 127), N'"}'), N'system'
         FROM @expired;
         COMMIT TRANSACTION;

         SELECT COUNT(*) AS removed FROM @expired;`,
    );
    return result.recordset?.[0]?.removed ?? 0;
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
