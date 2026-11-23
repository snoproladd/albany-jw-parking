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
