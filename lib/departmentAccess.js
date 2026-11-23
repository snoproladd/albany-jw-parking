/**
 * @file lib/departmentAccess.js
 * Who may act across departments (multi-department phase 2d).
 *
 * Volunteer Services runs Decently for every department, so its staff (and
 * convention admins) can pick which department a Decently export or import
 * is for, and can see every volunteer in the People & Departments
 * directory. Phase 3 replaces this check with a permission.
 *
 * Convention-wide actions (starting the next convention year) belong to
 * convention admins only: canStartConventionYear().
 */

import { isRoleAtLeast } from "../src/config/roles.js";

/**
 * Slug of the Volunteer Services department (created by department_rls.sql).
 * @type {string}
 */
export const VOLUNTEER_SERVICES_SLUG = "volunteer-services";

/**
 * Lowest Volunteer Services role that counts as VS staff.
 * @type {string}
 */
export const VS_STAFF_MIN_ROLE = "ASSISTANT_ADMIN";

/**
 * True for convention admins, and for Volunteer Services members at
 * VS_STAFF_MIN_ROLE or above who are currently working in Volunteer
 * Services (their session role is then their Volunteer Services role).
 *
 * @param {Record<string, any> | undefined} session
 * @returns {boolean}
 */
export function canManageAllDepartments(session) {
    if (!session?.userId) return false;
    if (session.isConventionAdmin === true) return true;

    const memberships = Array.isArray(session.memberships) ? session.memberships : [];
    const vs = memberships.find((m) => m.slug === VOLUNTEER_SERVICES_SLUG);
    return Boolean(vs)
        && session.departmentId === vs.id
        && isRoleAtLeast(session.userRole, VS_STAFF_MIN_ROLE);
}

/**
 * Starting the next convention year closes the year for every department
 * (Timelines, every membership, every department's carried data), so only
 * convention admins may do it — not a department's ADMIN / ASSISTANT_ADMIN.
 *
 * @param {Record<string, any> | undefined} session
 * @returns {boolean}
 */
export function canStartConventionYear(session) {
    return Boolean(session?.userId) && session.isConventionAdmin === true;
}
