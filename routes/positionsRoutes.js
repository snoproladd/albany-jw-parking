/**
 * @file routes/positionsRoutes.js
 * @description The read-only Positions page (multi-department phase 3d-7b).
 *
 * Shows a department's positions and what each one allows, two ways:
 *
 *   By position     each position, its tier, how many people hold it, and
 *                   its permissions grouped by catalogue category.
 *   By permission   every catalogue permission and the positions that hold
 *                   it, with the lowest-tier holder(s) highlighted.
 *
 * Routes:
 *   GET  /oversight/tools/positions[?department=<slug>]   the page
 *   POST /api/positions                     create a position          (positions.manage)
 *   PUT  /api/positions/:id                 edit a position            (positions.manage)
 *   POST /api/positions/:id/retire          retire (no holders only)   (positions.manage)
 *   POST /api/positions/:id/reactivate      bring a retired one back   (positions.manage)
 *
 * Access: positions.view (Overseer and up), positions.assign,
 * positions.manage or departments.assignPositions. The page shows the
 * department the person is working in; holders of departments.viewAllPeople
 * (Volunteer Services staff, convention admins) can pick any department.
 *
 * Editing (phase 3d-7c): holders of positions.manage edit the positions of
 * the department they are working in, within the granting limit in
 * lib/positionEditing.js; another department picked from the dropdown is
 * read-only. Every save is checked again on the server and logged in
 * permission_grant_log ("position-edit"). Assigning positions to people and
 * per-person grants come in 3d-7d.
 * Design: project doc claude/phase3d-7-person-permissions-draft.md.
 */

import express from "express";
import { requirePermission } from "../middleware/requirePermission.js";
import { getActiveDepartments } from "../lib/dbSync.js";
import { withScope } from "../lib/sql.js";
import {
    getPositionMatrix,
    getEditorContext,
    holdsPermissionWithout,
    savePosition,
    setPositionActive,
    sessionHasPermission,
} from "../lib/positions.js";
import { permissionRules, positionLockReason, planPositionSave } from "../lib/positionEditing.js";
import { canViewAllPeople, VOLUNTEER_SERVICES_SLUG } from "../lib/departmentAccess.js";
import { CATEGORIES, TIERS, PERMISSION_CATALOG, getPermission } from "../src/config/permissions.js";

/**
 * Tier labels by tier number.
 * @type {ReadonlyMap<number, string>}
 */
const TIER_LABELS = new Map(TIERS.map((t) => [t.tier, t.label]));

/**
 * @typedef {Object} PositionPermissionItem
 * @property {string} key
 * @property {string} label
 * @property {string} description
 * @property {number} tier
 * @property {string} tierLabel
 * @property {string[]} requiresLabels  Labels of its prerequisites.
 */

/**
 * @typedef {Object} PositionView
 * @property {number} id
 * @property {string} name
 * @property {string|null} description
 * @property {number|null} tier
 * @property {string} tierLabel
 * @property {boolean} isDepartmentAdmin
 * @property {boolean} isDefault
 * @property {number} memberCount
 * @property {number} permissionCount
 * @property {Array<{ id: string, label: string, items: PositionPermissionItem[] }>} groups
 */

/**
 * @typedef {Object} PermissionHolder
 * @property {string} name
 * @property {number|null} tier
 * @property {string} tierLabel
 * @property {boolean} isMinimum  Lowest tier among the holders.
 */

/**
 * @typedef {Object} PermissionView
 * @property {string} key
 * @property {string} label
 * @property {string} description
 * @property {number} tier
 * @property {string} tierLabel
 * @property {boolean} sensitive
 * @property {string[]} requiresLabels
 * @property {PermissionHolder[]} holders  In tier order.
 * @property {string|null} note  Shown instead of holders when no position can hold it.
 * @property {string} search  Lower-case text the search box matches against.
 */

/**
 * Label for a tier, or "Unset" for a position without one.
 *
 * @param {number|null|undefined} tier
 * @returns {string}
 */
function tierLabel(tier) {
    return TIER_LABELS.get(tier) ?? "Unset";
}

/**
 * Labels of a permission's prerequisites.
 *
 * @param {import("../src/config/permissions.js").PermissionDef} def
 * @returns {string[]}
 */
function requiresLabels(def) {
    return def.requires.map((k) => getPermission(k)?.label ?? k);
}

/**
 * Sort positions by tier (unset last), then by their own display order.
 *
 * @template {{ tier: number|null, sortOrder: number, name: string }} T
 * @param {T[]} positions
 * @returns {T[]} A new, sorted array.
 */
function sortByTier(positions) {
    const rank = (p) => (p.tier == null ? Number.MAX_SAFE_INTEGER : p.tier);
    return [...positions].sort((a, b) =>
        rank(a) - rank(b) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/**
 * Build what the page shows from a department's positions and the catalogue.
 *
 * @param {Awaited<ReturnType<typeof getPositionMatrix>>} rawPositions
 * @param {string} departmentSlug
 * @returns {{ positions: PositionView[], permissionGroups: Array<{ id: string, label: string, items: PermissionView[] }>,
 *             permissionTotal: number }}
 */
export function buildPositionsView(rawPositions, departmentSlug) {
    const sorted = sortByTier(rawPositions);
    const isVolunteerServices = departmentSlug === VOLUNTEER_SERVICES_SLUG;

    // ── By position ──────────────────────────────────────────────────────
    const positions = sorted.map((p) => {
        const held = new Set(p.permissions);
        const groups = CATEGORIES.map((c) => ({
            id: c.id,
            label: c.label,
            items: PERMISSION_CATALOG
                .filter((d) => d.category === c.id && held.has(d.key))
                .map((d) => ({
                    key: d.key,
                    label: d.label,
                    description: d.description,
                    tier: d.tier,
                    tierLabel: tierLabel(d.tier),
                    requiresLabels: requiresLabels(d),
                })),
        })).filter((g) => g.items.length > 0);

        // Keys no longer in the catalogue (removed in a deploy) still show,
        // so nothing a position holds is hidden.
        const unknown = p.permissions.filter((k) => !getPermission(k));
        if (unknown.length) {
            groups.push({
                id: "unknown",
                label: "Not in the catalogue",
                items: unknown.map((k) => ({
                    key: k, label: k, description: "This key is no longer in the catalogue.",
                    tier: 0, tierLabel: "Unknown", requiresLabels: [],
                })),
            });
        }

        return {
            id: p.id,
            name: p.name,
            description: p.description,
            tier: p.tier,
            tierLabel: tierLabel(p.tier),
            isDepartmentAdmin: p.isDepartmentAdmin,
            isDefault: p.isDefault,
            memberCount: p.memberCount,
            permissionCount: p.permissions.length,
            groups,
        };
    });

    // ── By permission ────────────────────────────────────────────────────
    const permissionGroups = CATEGORIES.map((c) => ({
        id: c.id,
        label: c.label,
        items: PERMISSION_CATALOG.filter((d) => d.category === c.id).map((d) => {
            const holders = sorted.filter((p) => p.permissions.includes(d.key));
            const tiers = holders.map((p) => p.tier).filter((t) => t != null);
            const minTier = tiers.length ? Math.min(...tiers) : null;

            /** @type {string|null} */
            let note = null;
            if (d.scope === "account") note = "Everyone signed in has this.";
            else if (d.scope === "convention") note = "Convention admins only; never given through a position.";
            else if (d.volunteerServicesOnly && !isVolunteerServices && holders.length === 0) {
                note = "Only used in Volunteer Services.";
            } else if (holders.length === 0) note = "No position holds this.";

            return {
                key: d.key,
                label: d.label,
                description: d.description,
                tier: d.tier,
                tierLabel: tierLabel(d.tier),
                sensitive: d.sensitive,
                requiresLabels: requiresLabels(d),
                holders: holders.map((p, i) => ({
                    name: p.name,
                    tier: p.tier,
                    tierLabel: tierLabel(p.tier),
                    isMinimum: minTier == null ? i === 0 : p.tier === minTier,
                })),
                note,
                search: [d.key, d.label, d.description, ...holders.map((p) => p.name)].join(" ").toLowerCase(),
            };
        }),
    })).filter((g) => g.items.length > 0);

    return {
        positions,
        permissionGroups,
        permissionTotal: permissionGroups.reduce((n, g) => n + g.items.length, 0),
    };
}

/**
 * The person's name for logs: first and last name, else their email.
 *
 * @param {Record<string, any>} session
 * @returns {string}
 */
function actorName(session) {
    const name = [session.firstName, session.lastName].filter(Boolean).join(" ").trim();
    return name || session.userEmail || `volunteer ${session.userId}`;
}

/**
 * The editor (lib/positionEditing.js Editor) for the session's department.
 *
 * @param {Record<string, any>} session
 * @returns {Promise<import("../lib/positionEditing.js").Editor & { positionIds: number[] }>}
 */
async function loadEditor(session) {
    const ctx = await getEditorContext(session.userId, session.departmentId);
    return {
        isConventionAdmin: session.isConventionAdmin === true,
        isDepartmentAdmin: ctx.isDepartmentAdmin,
        held: new Set(Array.isArray(session.effectivePermissions) ? session.effectivePermissions : []),
        positionIds: ctx.positionIds,
    };
}

/**
 * Everything the client-side editor needs, for the JSON data block on the
 * page. Only built for people who may edit.
 *
 * @param {Awaited<ReturnType<typeof getPositionMatrix>>} rawPositions  Active and retired.
 * @param {import("../lib/positionEditing.js").Editor} editor
 * @param {string} departmentSlug
 * @returns {Record<string, any>}
 */
function buildEditorData(rawPositions, editor, departmentSlug) {
    const rules = permissionRules(editor, departmentSlug);
    return {
        canSetDepartmentAdmin: editor.isConventionAdmin,
        canUseAdminTier: editor.isConventionAdmin || editor.isDepartmentAdmin,
        categories: CATEGORIES,
        tiers: TIERS.filter((t) => t.tier <= 4),
        catalogue: PERMISSION_CATALOG
            .filter((d) => d.scope === "department")
            .map((d) => ({
                key: d.key,
                label: d.label,
                description: d.description,
                category: d.category,
                tier: d.tier,
                requires: [...d.requires],
                editable: rules.get(d.key)?.editable === true,
                reason: rules.get(d.key)?.reason ?? null,
                hidden: d.volunteerServicesOnly && departmentSlug !== VOLUNTEER_SERVICES_SLUG,
            })),
        positions: rawPositions.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            tier: p.tier,
            sortOrder: p.sortOrder,
            isDepartmentAdmin: p.isDepartmentAdmin,
            isDefault: p.isDefault,
            active: p.active,
            memberCount: p.memberCount,
            permissions: p.permissions,
            lockReason: positionLockReason(editor, p),
        })),
    };
}

/**
 * Factory: build the Positions page router.
 *
 * @param {{ csrfProtection: import("express").RequestHandler, logError?: (...args: any[]) => void }} deps
 * @returns {import("express").Router}
 */
export function positionsRouter({ csrfProtection, logError }) {
    const router = express.Router();
    const log = logError || console.error;

    /**
     * GET /oversight/tools/positions
     * A department's positions. `?department=<slug>` picks another
     * department, for holders of departments.viewAllPeople only; anyone
     * else, or an unknown slug, gets the department they are in. Holders of
     * positions.manage can edit the department they are working in.
     */
    router.get(
        "/oversight/tools/positions",
        requirePermission("positions.view", "positions.assign", "positions.manage", "departments.assignPositions"),
        csrfProtection,
        async (req, res) => {
            try {
                const departments = await getActiveDepartments();
                const canPickDepartment = canViewAllPeople(req.session);

                let department = departments.find((d) => d.id === req.session.departmentId) ?? null;
                if (canPickDepartment && typeof req.query.department === "string") {
                    department = departments.find((d) => d.slug === req.query.department) ?? department;
                }
                if (!department) {
                    return res.status(404).send("Department not found");
                }

                const canEdit = sessionHasPermission(req.session, "positions.manage")
                    && department.id === req.session.departmentId;

                const rawPositions = await withScope("system", () =>
                    getPositionMatrix(department.id, { includeInactive: canEdit }));
                const active = rawPositions.filter((p) => p.active);
                const view = buildPositionsView(active, department.slug);

                let editorData = null;
                if (canEdit) {
                    const editor = await withScope("system", () => loadEditor(req.session));
                    editorData = buildEditorData(rawPositions, editor, department.slug);
                }

                return res.render("authentication_and_accounts/positions", {
                    department,
                    departments: canPickDepartment ? departments : [],
                    canPickDepartment,
                    canEdit,
                    editorData,
                    retired: rawPositions.filter((p) => !p.active),
                    tiers: TIERS,
                    csrfToken: req.csrfToken(),
                    ...view,
                });
            } catch (err) {
                log("positions GET error:", err);
                return res.status(500).send("Server error");
            }
        },
    );

    /**
     * Create (positionId null) or edit a position in the session's
     * department, after checking the granting limit and the self-lockout.
     *
     * @param {import("express").Request} req
     * @param {import("express").Response} res
     * @param {number|null} positionId
     * @returns {Promise<void>}
     */
    async function handleSave(req, res, positionId) {
        try {
            const departmentId = req.session.departmentId;
            const departments = await getActiveDepartments();
            const department = departments.find((d) => d.id === departmentId);
            if (!department) {
                res.status(400).json({ success: false, error: "No department selected." });
                return;
            }

            const editor = await loadEditor(req.session);
            let existing = null;
            if (positionId != null) {
                const all = await getPositionMatrix(departmentId, { includeInactive: true });
                existing = all.find((p) => p.id === positionId) ?? null;
                if (!existing) {
                    res.status(404).json({ success: false, error: "That position was not found in this department." });
                    return;
                }
            }

            const plan = planPositionSave({
                editor,
                departmentSlug: department.slug,
                existing,
                input: req.body ?? {},
            });

            // Don't let someone take positions.manage away from themselves.
            if (existing && !editor.isConventionAdmin && plan.removed.includes("positions.manage")
                && editor.positionIds.includes(existing.id)
                && !(await holdsPermissionWithout(req.session.userId, departmentId, "positions.manage", existing.id))) {
                plan.errors.push("You can't remove \"Manage positions\" from your own position: you would lose access to this page.");
            }

            if (plan.errors.length) {
                res.status(400).json({ success: false, error: plan.errors.join(" "), errors: plan.errors });
                return;
            }

            const id = await savePosition({
                departmentId,
                positionId,
                name: plan.name,
                description: plan.description,
                tier: plan.tier,
                sortOrder: plan.sortOrder,
                isDepartmentAdmin: plan.isDepartmentAdmin,
                permissions: plan.permissions,
                added: plan.added,
                removed: plan.removed,
                actorId: req.session.userId,
                actorName: actorName(req.session),
            });
            res.json({ success: true, id, added: plan.added, removed: plan.removed });
        } catch (err) {
            if (err.code === "NAME_TAKEN" || err.code === "NOT_FOUND") {
                res.status(err.code === "NOT_FOUND" ? 404 : 409).json({ success: false, error: err.message });
                return;
            }
            log("positions save error:", err);
            res.status(500).json({ success: false, error: "Server error" });
        }
    }

    /**
     * Retire or reactivate a position in the session's department.
     *
     * @param {import("express").Request} req
     * @param {import("express").Response} res
     * @param {boolean} active
     * @returns {Promise<void>}
     */
    async function handleActive(req, res, active) {
        try {
            const positionId = Number(req.params.id);
            if (!Number.isInteger(positionId)) {
                res.status(400).json({ success: false, error: "Invalid position." });
                return;
            }
            const editor = await loadEditor(req.session);
            const all = await getPositionMatrix(req.session.departmentId, { includeInactive: true });
            const position = all.find((p) => p.id === positionId);
            if (!position) {
                res.status(404).json({ success: false, error: "That position was not found in this department." });
                return;
            }
            const lock = positionLockReason(editor, position);
            if (lock) {
                res.status(403).json({ success: false, error: lock });
                return;
            }
            await setPositionActive({
                departmentId: req.session.departmentId,
                positionId,
                active,
                actorId: req.session.userId,
                actorName: actorName(req.session),
            });
            res.json({ success: true });
        } catch (err) {
            if (["NOT_FOUND", "IS_DEFAULT", "HAS_MEMBERS"].includes(err.code)) {
                res.status(err.code === "NOT_FOUND" ? 404 : 409).json({ success: false, error: err.message });
                return;
            }
            log("positions retire/reactivate error:", err);
            res.status(500).json({ success: false, error: "Server error" });
        }
    }

    /**
     * POST /api/positions
     * Create a position in the session's department.
     * Body: { name, description?, tier, sortOrder, isDepartmentAdmin?, permissions: string[] }
     */
    router.post(
        "/api/positions",
        requirePermission("positions.manage"),
        csrfProtection,
        (req, res) => handleSave(req, res, null),
    );

    /**
     * PUT /api/positions/:id
     * Edit a position in the session's department. Body as for create;
     * `permissions` is the full new list.
     */
    router.put(
        "/api/positions/:id",
        requirePermission("positions.manage"),
        csrfProtection,
        (req, res) => {
            const id = Number(req.params.id);
            if (!Number.isInteger(id)) {
                res.status(400).json({ success: false, error: "Invalid position." });
                return undefined;
            }
            return handleSave(req, res, id);
        },
    );

    /**
     * POST /api/positions/:id/retire
     * Retire a position nobody holds (not the default Volunteer position).
     */
    router.post(
        "/api/positions/:id/retire",
        requirePermission("positions.manage"),
        csrfProtection,
        (req, res) => handleActive(req, res, false),
    );

    /**
     * POST /api/positions/:id/reactivate
     * Bring a retired position back.
     */
    router.post(
        "/api/positions/:id/reactivate",
        requirePermission("positions.manage"),
        csrfProtection,
        (req, res) => handleActive(req, res, true),
    );

    return router;
}
