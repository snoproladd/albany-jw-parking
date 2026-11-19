/**
 * @file roles.js
 * @description Client-side role ordering helpers.
 *
 * Reads the #app-roles-json data island rendered by views/partials/roleData.ejs
 * (included by header.ejs), so the browser uses the same ROLE_HIERARCHY as
 * src/config/roles.js instead of keeping its own copy. The island is JSON and
 * is never executed, so this is CSP-safe.
 *
 * Usage (ES module):
 *   import { roleLevel, isRoleAtLeast } from "./roles.js";
 *   isRoleAtLeast(userRole, "KEYMAN");
 *
 * @module roles
 */

/**
 * Cached role hierarchy, lowest privilege first.
 * @type {ReadonlyArray<string>|null}
 */
let _hierarchy = null;

/**
 * Returns the role hierarchy from the page's data island.
 * Falls back to an empty list when the island is missing or unreadable, so
 * every role check fails closed rather than granting access.
 *
 * @returns {ReadonlyArray<string>}
 */
export function getRoleHierarchy() {
    if (_hierarchy) return _hierarchy;

    try {
        const el = document.getElementById("app-roles-json");
        const parsed = el ? JSON.parse(el.textContent || "[]") : [];
        _hierarchy = Object.freeze(Array.isArray(parsed) ? parsed : []);
    } catch {
        _hierarchy = Object.freeze([]);
    }

    if (_hierarchy.length === 0) {
        console.warn("[roles] #app-roles-json missing or empty — role checks will fail closed.");
    }
    return _hierarchy;
}

/**
 * Numeric privilege level of a role — its index in the hierarchy.
 *
 * @param {string|null|undefined} role
 * @returns {number} Level, or -1 for a missing or unknown role.
 */
export function roleLevel(role) {
    return getRoleHierarchy().indexOf(role ?? "");
}

/**
 * True when `role` is at or above `minRole`.
 * A missing or unknown role is never "at least" anything, and an unknown
 * `minRole` matches nobody.
 *
 * @param {string|null|undefined} role
 * @param {string} minRole
 * @returns {boolean}
 */
export function isRoleAtLeast(role, minRole) {
    const min = roleLevel(minRole);
    return min !== -1 && roleLevel(role) >= min;
}
