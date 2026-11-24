/**
 * @file lib/positionEditing.js
 * @description The rules for editing positions (multi-department phase 3d-7c).
 *
 * Pure functions, shared by the Positions page (which permissions the
 * editor shows as tickable, and why the others aren't) and the API (which
 * checks every save again).
 *
 * Granting limit (phase 3d decision 2, 3d-7 design):
 *   - Only department-scope keys go in positions. Account keys everyone has;
 *     convention keys are convention admins' alone.
 *   - Volunteer Services keys only in the Volunteer Services department.
 *   - Convention admins may add or remove any of those.
 *   - Anyone else only keys they hold themselves, and Admin-tier (tier 4)
 *     keys only if they are a department admin.
 *   - Only convention admins set or clear a position's department-admin flag;
 *     only department admins and convention admins edit a department-admin
 *     position or give a position the Admin tier.
 *
 * Prerequisites: a saved position always includes every key its keys need
 * (src/config/permissions.js withPrerequisites()).
 *
 * People tab (phase 3d-7d): planPersonSave() checks a change to one
 * person's positions and individual grants:
 *   - A position can be given or taken away only by someone who holds every
 *     permission in it; Admin-tier positions and department-admin positions
 *     only by department admins (or convention admins).
 *   - Grants follow the same limit as positions (permissionRules()).
 *   - Nobody changes their own access, except convention admins.
 *   - New grants expire at the default date (routes/positionsRoutes.js
 *     defaultGrantExpiry(): last convention day + 30 days, or later if that
 *     has passed) unless an earlier date is given; people in an Oversight-tier
 *     (3) or higher position, and department admins, get no expiry.
 */

import { PERMISSION_CATALOG, getPermission, withPrerequisites } from "../src/config/permissions.js";
import { VOLUNTEER_SERVICES_SLUG } from "./departmentAccess.js";

/**
 * @typedef {Object} Editor
 * @property {boolean} isConventionAdmin
 * @property {boolean} isDepartmentAdmin  Holds a department-admin position here.
 * @property {ReadonlySet<string>} held   Their effective permissions here.
 */

/**
 * @typedef {Object} KeyRule
 * @property {boolean} editable
 * @property {string|null} reason  Why not, when not editable.
 */

/**
 * Which catalogue keys the editor may add to or remove from a position in
 * this department, and why not for the rest.
 *
 * @param {Editor} editor
 * @param {string} departmentSlug
 * @returns {Map<string, KeyRule>}
 */
export function permissionRules(editor, departmentSlug) {
    const isVolunteerServices = departmentSlug === VOLUNTEER_SERVICES_SLUG;
    /** @type {Map<string, KeyRule>} */
    const rules = new Map();
    for (const d of PERMISSION_CATALOG) {
        /** @type {string|null} */
        let reason = null;
        if (d.scope === "account") reason = "Everyone signed in has this.";
        else if (d.scope === "convention") reason = "Convention admins only; never part of a position.";
        else if (d.volunteerServicesOnly && !isVolunteerServices) reason = "Only used in Volunteer Services.";
        else if (!editor.isConventionAdmin) {
            if (!editor.held.has(d.key)) reason = "You can only give or remove permissions you hold yourself.";
            else if (d.tier >= 4 && !editor.isDepartmentAdmin) reason = "Admin tier: department admins only.";
        }
        rules.set(d.key, { editable: reason === null, reason });
    }
    return rules;
}

/**
 * Whether the editor may edit this position at all, and why not.
 *
 * @param {Editor} editor
 * @param {{ isDepartmentAdmin: boolean }} position
 * @returns {string|null} Reason it can't be edited, or null.
 */
export function positionLockReason(editor, position) {
    if (position.isDepartmentAdmin && !editor.isConventionAdmin && !editor.isDepartmentAdmin) {
        return "Only department admins can edit a department-admin position.";
    }
    return null;
}

/**
 * @typedef {Object} PositionInput
 * @property {unknown} name
 * @property {unknown} description
 * @property {unknown} tier
 * @property {unknown} sortOrder
 * @property {unknown} isDepartmentAdmin
 * @property {unknown} permissions
 */

/**
 * @typedef {Object} SavePlan
 * @property {string[]} errors  Empty when the save may go ahead.
 * @property {string} name
 * @property {string|null} description
 * @property {number} tier
 * @property {number} sortOrder
 * @property {boolean} isDepartmentAdmin
 * @property {string[]} permissions  Full new list, prerequisites included, sorted.
 * @property {string[]} added
 * @property {string[]} removed
 */

/**
 * Check a create or edit against the rules and work out the final
 * permission list.
 *
 * @param {Object} args
 * @param {Editor} args.editor
 * @param {string} args.departmentSlug
 * @param {{ isDepartmentAdmin: boolean, tier: number|null, permissions: string[] } | null} args.existing
 *        The position as saved, or null when creating.
 * @param {PositionInput} args.input  The request body.
 * @returns {SavePlan}
 */
export function planPositionSave({ editor, departmentSlug, existing, input }) {
    /** @type {string[]} */
    const errors = [];

    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) errors.push("Give the position a name.");
    else if (name.length > 80) errors.push("The name can be at most 80 characters.");

    const rawDescription = typeof input.description === "string" ? input.description.trim() : "";
    if (rawDescription.length > 400) errors.push("The description can be at most 400 characters.");
    const description = rawDescription || null;

    const tier = Number(input.tier);
    if (!Number.isInteger(tier) || tier < 1 || tier > 4) errors.push("Pick a tier from 1 to 4.");

    const sortOrder = Number(input.sortOrder ?? 0);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000) {
        errors.push("The sort order must be a whole number from 0 to 100000.");
    }

    if (existing) {
        const lock = positionLockReason(editor, existing);
        if (lock) errors.push(lock);
    }

    // Department-admin flag: convention admins only.
    const wantAdmin = input.isDepartmentAdmin === true;
    const currentAdmin = existing?.isDepartmentAdmin === true;
    if (wantAdmin !== currentAdmin && !editor.isConventionAdmin) {
        errors.push("Only convention admins can change whether a position is a department admin.");
    }

    // Admin tier: department admins and convention admins only (when it changes to or from 4).
    const currentTier = existing?.tier ?? null;
    if (Number.isInteger(tier) && (tier === 4) !== (currentTier === 4)
        && !editor.isConventionAdmin && !editor.isDepartmentAdmin) {
        errors.push("Only department admins can give a position the Admin tier or take it away.");
    }

    // Permissions: known keys plus everything they need.
    const requested = Array.isArray(input.permissions)
        ? input.permissions.filter((k) => typeof k === "string")
        : null;
    if (!requested) errors.push("The permission list is missing.");

    const unknown = (requested ?? []).filter((k) => !getPermission(k));
    if (unknown.length) errors.push(`Unknown permission: ${unknown.join(", ")}.`);

    const finalSet = new Set();
    for (const k of requested ?? []) {
        if (getPermission(k)) withPrerequisites(k).forEach((p) => finalSet.add(p));
    }
    const before = new Set(existing?.permissions ?? []);
    const added = [...finalSet].filter((k) => !before.has(k)).sort();
    const removed = [...before].filter((k) => !finalSet.has(k)).sort();

    const rules = permissionRules(editor, departmentSlug);
    const refused = [...added, ...removed].filter((k) => rules.get(k)?.editable !== true);
    for (const k of refused) {
        const label = getPermission(k)?.label ?? k;
        const reason = rules.get(k)?.reason ?? "Not allowed.";
        errors.push(`${added.includes(k) ? "Can't add" : "Can't remove"} "${label}": ${reason}`);
    }

    return {
        errors,
        name,
        description,
        tier,
        sortOrder,
        isDepartmentAdmin: wantAdmin,
        permissions: [...finalSet].sort(),
        added,
        removed,
    };
}

/**
 * @typedef {Object} DeptPosition
 * @property {number} id
 * @property {string} name
 * @property {number|null} tier
 * @property {boolean} isDepartmentAdmin
 * @property {boolean} isDefault
 * @property {boolean} active
 * @property {string[]} permissions
 */

/**
 * Why the editor can't give or take away this position, or null if they can.
 *
 * @param {Editor} editor
 * @param {DeptPosition} position
 * @returns {string|null}
 */
export function positionAssignReason(editor, position) {
    if (editor.isConventionAdmin) return null;
    if (position.isDepartmentAdmin && !editor.isDepartmentAdmin) {
        return "Department-admin positions: department admins only.";
    }
    if ((position.tier ?? 1) >= 4 && !editor.isDepartmentAdmin) {
        return "Admin-tier positions: department admins only.";
    }
    const missing = position.permissions.filter((k) => !editor.held.has(k));
    if (missing.length) {
        const names = missing.slice(0, 3).map((k) => getPermission(k)?.label ?? k);
        return `You don't hold everything it gives (${names.join(", ")}${missing.length > 3 ? ", …" : ""}).`;
    }
    return null;
}

/**
 * True when holders of these positions keep individual grants past year
 * end: any Oversight-tier (3) or higher position, or a department-admin one.
 *
 * @param {DeptPosition[]} held
 * @returns {boolean}
 */
export function grantsNeverExpire(held) {
    return held.some((p) => (p.tier ?? 1) >= 3 || p.isDepartmentAdmin);
}

/**
 * Format a Date as "YYYY-MM-DD HH:MM:SS" in UTC, for SQL DATETIME2.
 *
 * @param {Date} d
 * @returns {string}
 */
function sqlUtc(d) {
    return d.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * @typedef {Object} PersonSavePlan
 * @property {string[]} errors
 * @property {number[]} positionsAdd
 * @property {number[]} positionsRemove
 * @property {Array<{ key: string, expiresAt: string|null, note: string|null }>} grantsAdd  expiresAt as SQL UTC text.
 * @property {string[]} grantsRemove
 * @property {Record<string, any>|null} tierDown
 * @property {string|null} note
 */

/**
 * Check a People-tab change and work out what to write.
 *
 * @param {Object} args
 * @param {Editor} args.editor
 * @param {string} args.departmentSlug
 * @param {DeptPosition[]} args.positions  The department's active positions.
 * @param {{ positionIds: number[], grants: Array<{ key: string }> }} args.person
 * @param {boolean} args.isSelf
 * @param {Date} args.defaultExpiry
 * @param {Date} [args.now]
 * @param {{ positions?: unknown, grants?: unknown, expiresOn?: unknown, note?: unknown, tierDown?: unknown }} args.input
 * @returns {PersonSavePlan}
 */
export function planPersonSave({ editor, departmentSlug, positions, person, isSelf, defaultExpiry, now = new Date(), input }) {
    /** @type {string[]} */
    const errors = [];
    const byId = new Map(positions.map((p) => [p.id, p]));

    if (isSelf && !editor.isConventionAdmin) errors.push("You can't change your own access.");

    // ── Positions ──
    const wantedIds = Array.isArray(input.positions)
        ? [...new Set(input.positions.map(Number).filter((id) => byId.has(id)))]
        : null;
    if (!wantedIds) errors.push("The position list is missing.");
    let finalIds = wantedIds ?? person.positionIds;
    if (finalIds.length === 0) {
        const def = positions.find((p) => p.isDefault);
        if (def) finalIds = [def.id];
    }
    const before = new Set(person.positionIds);
    const after = new Set(finalIds);
    const positionsAdd = finalIds.filter((id) => !before.has(id));
    const positionsRemove = person.positionIds.filter((id) => !after.has(id) && byId.has(id));
    for (const id of [...positionsAdd, ...positionsRemove]) {
        const p = byId.get(id);
        const reason = p ? positionAssignReason(editor, p) : "Unknown position.";
        if (reason) errors.push(`${positionsAdd.includes(id) ? "Can't give" : "Can't take away"} "${p?.name ?? id}": ${reason}`);
    }
    const held = finalIds.map((id) => byId.get(id)).filter(Boolean);
    const fromPositions = new Set(held.flatMap((p) => p.permissions));

    // ── Grants ──
    const rules = permissionRules(editor, departmentSlug);
    const rawGrants = Array.isArray(input.grants) ? input.grants : null;
    if (!rawGrants) errors.push("The grant list is missing.");
    const wanted = new Set((rawGrants ?? []).map((g) => (typeof g === "string" ? g : g?.key)).filter((k) => typeof k === "string"));
    const unknown = [...wanted].filter((k) => !getPermission(k));
    if (unknown.length) errors.push(`Unknown permission: ${unknown.join(", ")}.`);

    // Prerequisites of every grant must be held one way or another.
    for (const k of [...wanted]) {
        if (!getPermission(k)) continue;
        for (const r of withPrerequisites(k)) {
            if (!fromPositions.has(r)) wanted.add(r);
        }
    }

    const existing = new Set(person.grants.map((g) => g.key));
    const added = [...wanted].filter((k) => !existing.has(k) && getPermission(k)).sort();
    const removed = [...existing].filter((k) => !wanted.has(k)).sort();
    for (const k of [...added, ...removed]) {
        const rule = rules.get(k);
        if (rule?.editable !== true) {
            const label = getPermission(k)?.label ?? k;
            errors.push(`${added.includes(k) ? "Can't grant" : "Can't revoke"} "${label}": ${rule?.reason ?? "Not allowed."}`);
        }
    }

    // ── Expiry for new grants ──
    let expiresAt = grantsNeverExpire(held) ? null : defaultExpiry;
    if (typeof input.expiresOn === "string" && input.expiresOn.trim()) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.expiresOn.trim());
        const chosen = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59)) : null;
        if (!chosen || Number.isNaN(chosen.getTime())) errors.push("The expiry date isn't a valid date.");
        else if (chosen <= now) errors.push("The expiry date must be in the future.");
        else if (expiresAt && chosen > expiresAt) {
            errors.push(`New grants can't last past ${defaultExpiry.toISOString().slice(0, 10)}.`);
        } else expiresAt = chosen;
    }

    // Safety net: never write a grant that is already over.
    if (expiresAt && expiresAt <= now && added.length) {
        errors.push("The default expiry date has already passed; pick an expiry date in the future.");
    }

    const rawNote = typeof input.note === "string" ? input.note.trim() : "";
    if (rawNote.length > 400) errors.push("The note can be at most 400 characters.");
    const note = rawNote || null;

    // ── Tier-down detail (for the log only) ──
    /** @type {Record<string, any>|null} */
    let tierDown = null;
    if (input.tierDown && typeof input.tierDown === "object") {
        const t = /** @type {Record<string, unknown>} */ (input.tierDown);
        const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 80) : []);
        tierDown = {
            from: strings(t.from),
            to: typeof t.to === "string" ? t.to : null,
            kept: strings(t.kept),
            removed: strings(t.removed),
        };
    }

    return {
        errors,
        positionsAdd,
        positionsRemove,
        grantsAdd: added.map((key) => ({ key, expiresAt: expiresAt ? sqlUtc(expiresAt) : null, note })),
        grantsRemove: removed,
        tierDown,
        note,
    };
}
