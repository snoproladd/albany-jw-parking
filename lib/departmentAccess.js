/**
 * @file lib/departmentAccess.js
 * Who may act across departments, and on the whole convention.
 *
 * Multi-department phase 2d introduced these as role checks; phase 3d-6
 * moved them onto catalogue permissions (src/config/permissions.js), read
 * from the session's positions in the department the person is working in:
 *
 *   departments.runDecentlyForAll  pick which department a Decently export
 *                                  or import is for
 *   departments.viewAllPeople      see every volunteer in People & Departments
 *   convention.startYear           start the next convention year
 *
 * Volunteer Services' Assistant Admin and Admin positions hold the first two
 * (lib/legacyRoleMap.js DEPARTMENT_RULES), so, as before, they only apply
 * while working in Volunteer Services. Convention admins hold every key.
 */

import { sessionHasPermission } from "./positions.js";

/**
 * Slug of the Volunteer Services department (created by department_rls.sql).
 * @type {string}
 */
export const VOLUNTEER_SERVICES_SLUG = "volunteer-services";

/**
 * True when the person may pick which department the Decently tools act on.
 *
 * @param {Record<string, any> | undefined} session
 * @returns {boolean}
 */
export function canRunDecentlyForAll(session) {
    return Boolean(session?.userId) && sessionHasPermission(session, "departments.runDecentlyForAll");
}

/**
 * True when the person may see every volunteer in People & Departments.
 *
 * @param {Record<string, any> | undefined} session
 * @returns {boolean}
 */
export function canViewAllPeople(session) {
    return Boolean(session?.userId) && sessionHasPermission(session, "departments.viewAllPeople");
}

/**
 * Starting the next convention year closes the year for every department
 * (Timelines, every membership, every department's carried data), so only
 * holders of convention.startYear — convention admins — may do it.
 *
 * @param {Record<string, any> | undefined} session
 * @returns {boolean}
 */
export function canStartConventionYear(session) {
    return Boolean(session?.userId) && sessionHasPermission(session, "convention.startYear");
}
