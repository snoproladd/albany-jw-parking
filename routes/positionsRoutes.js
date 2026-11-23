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
 *   GET /oversight/tools/positions[?department=<slug>]
 *
 * Access: positions.view (Overseer and up), positions.assign,
 * positions.manage or departments.assignPositions. The page shows the
 * department the person is working in; holders of departments.viewAllPeople
 * (Volunteer Services staff, convention admins) can pick any department.
 *
 * Editing positions and assigning them comes in phase 3d-7c; per-person
 * grants in 3d-7d. Design: project doc claude/phase3d-7-person-permissions-draft.md.
 */

import express from "express";
import { requirePermission } from "../middleware/requirePermission.js";
import { getActiveDepartments } from "../lib/dbSync.js";
import { withScope } from "../lib/sql.js";
import { getPositionMatrix } from "../lib/positions.js";
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
 * Factory: build the Positions page router.
 *
 * @param {{ logError?: (...args: any[]) => void }} [deps]
 * @returns {import("express").Router}
 */
export function positionsRouter({ logError } = {}) {
    const router = express.Router();

    /**
     * GET /oversight/tools/positions
     * Read-only view of a department's positions. `?department=<slug>` picks
     * another department, for holders of departments.viewAllPeople only;
     * anyone else, or an unknown slug, gets the department they are in.
     */
    router.get(
        "/oversight/tools/positions",
        requirePermission("positions.view", "positions.assign", "positions.manage", "departments.assignPositions"),
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

                const rawPositions = await withScope("system", () => getPositionMatrix(department.id));
                const view = buildPositionsView(rawPositions, department.slug);

                return res.render("authentication_and_accounts/positions", {
                    department,
                    departments: canPickDepartment ? departments : [],
                    canPickDepartment,
                    tiers: TIERS,
                    ...view,
                });
            } catch (err) {
                (logError || console.error)("positions GET error:", err);
                return res.status(500).send("Server error");
            }
        },
    );

    return router;
}
