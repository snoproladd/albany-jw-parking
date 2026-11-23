/**
 * @file lib/legacyRoleMap.js
 * @description How today's roles become positions (multi-department phase 3c).
 *
 * Today a person's access comes from their role: the factory permission
 * matrix (src/config/roles.js), the changes saved from the Permission Matrix
 * page (dbo.role_permissions) and a few rank checks in the code. This module
 * says, for every catalogue permission (src/config/permissions.js), how it
 * is decided today, so the starting positions reproduce today's access
 * exactly ("copy exactly", decided 2026-11-23).
 *
 * Used by scripts/positionsFromRoles.js (report), scripts/seedPositions.js
 * (creates the positions) and scripts/verifyPositions.js (checks them).
 * Removed with the old roles at the end of phase 3d.
 */

import { PERMISSIONS, isRoleAtLeast } from "../src/config/roles.js";

/**
 * The Parking position each role becomes, with the department's default
 * Volunteer position for REGISTERED. NON_REGISTERED is an account state, not
 * a position; COUNTER becomes the Parking Counter position (and, later, a
 * shared account).
 *
 * @type {ReadonlyArray<{ role: string, position: string, description: string, isDepartmentAdmin?: boolean }>}
 */
export const ROLE_POSITIONS = Object.freeze([
    { role: "REGISTERED",      position: "Volunteer",       description: "Every Parking volunteer." },
    { role: "DESK",            position: "Desk",            description: "Registration desk: create accounts and check people in." },
    { role: "KEYMAN",          position: "Keyman",          description: "Leads a shift (Keyman / Captain)." },
    { role: "OVERSEER",        position: "Overseer",        description: "Oversees scheduling, volunteers and signs." },
    { role: "ASSISTANT_ADMIN", position: "Assistant Admin", description: "Runs the department's tools and publishing." },
    { role: "ADMIN",           position: "Admin",           description: "Department administrator.", isDepartmentAdmin: true },
    { role: "COUNTER",         position: "Parking Counter", description: "Records vehicle counts (shared counting accounts)." },
]);

/**
 * Per-person extras that become their own small positions.
 * @type {ReadonlyArray<{ column: string, position: string, description: string, permissions: string[] }>}
 */
export const EXTRA_POSITIONS = Object.freeze([
    { column: "extra_signs_placement", position: "Sign Placement",
      description: "Builds and places signs.", permissions: ["signs.manage", "signs.publishMap"] },
    { column: "extra_parking_count", position: "Parking Counter",
      description: "Records vehicle counts.", permissions: ["counts.log"] },
]);

/**
 * How each catalogue permission is decided TODAY, from a role and the merged
 * old matrix. Each rule mirrors the route or rank check it replaces (see the
 * route audit). `note` marks a rule that is a judgement call for sign-off.
 *
 * @type {Readonly<Record<string, { rule: (role: string, can: (k: string) => boolean) => boolean, note?: string }>>}
 */
export const TODAY_RULES = Object.freeze({
    "self.viewSchedule":          { rule: (r, can) => can("viewSchedules") },
    "self.manageBlackouts":       { rule: (r) => isRoleAtLeast(r, "REGISTERED"),
                                    note: "today: any signed-in volunteer (requireAuth), counting accounts excluded" },
    "schedules.view":             { rule: (r, can) => can("viewSchedules") },
    "maps.view":                  { rule: (r, can) => can("viewMaps") },
    "signs.view":                 { rule: (r, can) => can("viewSigns") },

    "volunteers.view":            { rule: (r, can) => can("viewVolunteerInfo") },
    "volunteers.edit":            { rule: (r, can) => can("editVolunteerInfo") },
    "volunteers.markNotApproved": { rule: (r, can) => can("editVolunteerInfo") },
    "volunteers.create":          { rule: (r, can) => can("createVolunteerAccounts") },
    "volunteers.archive":         { rule: (r, can) => can("deleteVolunteer") },
    "volunteers.sendSignInLinks": { rule: (r, can) => can("accessAdminConsole") },
    "volunteers.viewReports":     { rule: (r, can) => can("createAssignments"),
                                    note: "Application Status page is createAssignments; its demographics API is viewAttendance" },
    "volunteers.exportData":      { rule: (r, can) => can("printUserData"),
                                    note: "printUserData gates nothing today" },

    "standing.flag":              { rule: (r) => isRoleAtLeast(r, "OVERSEER"), note: "new — Overseer and up (decided)" },
    "standing.viewDepartmentFlags": { rule: (r) => isRoleAtLeast(r, "OVERSEER"), note: "new — Overseer and up" },

    "notes.view":                 { rule: (r, can) => can("viewVolunteerInfo") },
    "notes.act":                  { rule: (r, can) => can("viewVolunteerInfo") },
    "notes.analyze":              { rule: (r, can) => can("viewVolunteerInfo") },
    "notes.analyzeAll":           { rule: (r, can) => can("deleteVolunteer") && isRoleAtLeast(r, "ASSISTANT_ADMIN") },
    "sms.manageOptOuts":          { rule: (r, can) => can("deleteVolunteer") },

    "shifts.manage":              { rule: (r, can) => can("manageShifts") },
    "locations.manage":           { rule: (r, can) => can("manageShifts") },
    "rendezvous.manage":          { rule: (r, can) => can("editRendezvous") },
    "eventTypes.manage":          { rule: (r) => isRoleAtLeast(r, "OVERSEER"),
                                    note: "new in 3d-4 — Overseer and up (decided); today the page is accessAdminConsole" },
    "events.manage":              { rule: (r, can) => can("manageShifts"), note: "today: campaign meetings (manageShifts)" },

    "scheduler.use":              { rule: (r, can) => can("createAssignments") },
    "scheduler.analyze":          { rule: (r, can) => can("createAssignments") },
    "scheduler.manageRules":      { rule: (r, can) => can("deleteVolunteer") },
    "scheduler.publish":          { rule: (r) => isRoleAtLeast(r, "ASSISTANT_ADMIN"),
                                    note: "3d-5: Assistant Admin and Admin only for now (publishing needs work before release)" },
    "schedules.sendToVolunteer":  { rule: (r, can) => can("createAssignments"),
                                    note: "route is gated by viewSchedules, but the button is only on the volunteer schedule page (createAssignments) — mapped to that" },
    "crews.assign":               { rule: (r, can) => can("createAssignments") },
    "crews.viewRestricted":       { rule: (r) => isRoleAtLeast(r, "OVERSEER") },
    "crews.manageRestricted":     { rule: (r, can) => can("manageScheduleSensitivity") },
    "shifts.lead":                { rule: (r) => isRoleAtLeast(r, "KEYMAN") },
    "constraints.review":         { rule: (r, can) => can("editVolunteerInfo") },

    "alerts.manageShiftAlerts":   { rule: (r, can) => can("accessAdminConsole") },
    "alerts.manageCapacityAlerts":{ rule: (r, can) => can("accessAdminConsole") },
    "alerts.receiveCapacityAlerts": { rule: (r) => isRoleAtLeast(r, "OVERSEER"),
                                    note: "today each capacity rule has its own minimum role (default Overseer)" },
    "alerts.receivePublishNotices": { rule: (r) => isRoleAtLeast(r, "OVERSEER") },
    "alerts.receiveVolunteerTexts": { rule: (r) => isRoleAtLeast(r, "OVERSEER"),
                                    note: "3d-5: widened from Admins only (getOverseerContacts) to Overseer and up (decided)" },

    "campaigns.send":             { rule: (r, can) => can("accessAdminConsole") },
    "campaigns.edit":             { rule: (r, can) => can("manageCampaigns") },

    "attendance.checkIn":         { rule: (r, can) => can("logAttendance") },
    "attendance.viewReports":     { rule: (r, can) => can("viewAttendance") },
    "counts.log":                 { rule: (r, can) => can("logParkingCount") },
    "counts.viewReport":          { rule: (r, can) => can("viewAttendance") },
    "counts.manageLocations":     { rule: (r, can) => can("accessAdminConsole") },

    "signs.manage":               { rule: (r, can) => can("manageSigns") },
    "signs.publishMap":           { rule: (r, can) => can("manageSigns") },
    "maps.sync":                  { rule: (r, can) => can("accessAdminConsole") },

    "lessons.submit":             { rule: (r) => isRoleAtLeast(r, "KEYMAN") },
    "lessons.viewAll":            { rule: (r) => isRoleAtLeast(r, "OVERSEER") },
    "lessons.review":             { rule: (r, can) => can("editVolunteerInfo") && isRoleAtLeast(r, "OVERSEER") },
    "lessons.publish":            { rule: (r, can) => can("editVolunteerInfo") && isRoleAtLeast(r, "OVERSEER"),
                                    note: "publish routes are editVolunteerInfo on a page that needs Overseer; report admin view is Assistant Admin+" },

    "positions.assign":           { rule: (r, can) => can("accessAdminConsole") && can("manageRoles") },
    "positions.manage":           { rule: (r, can) => can("manageRoles") && isRoleAtLeast(r, "ADMIN"),
                                    note: "Permission Matrix route is manageRoles; the menu shows it to Admin only" },
    "structure.manage":           { rule: (r, can) => can("manageCampaigns") },
    "decently.run":               { rule: (r, can) => can("accessAdminConsole") },
    "systemVariables.manage":     { rule: (r, can) => can("accessAdminConsole") },
    "bugReports.manage":          { rule: (r, can) => can("accessAdminConsole") },
});

/**
 * Merge dbo.role_permissions overrides onto the factory matrix (the same
 * merge loadMergedPermissions() does at login).
 *
 * @param {Array<{ role_name: string, permission: string, is_granted: boolean }>} overrides
 * @returns {Record<string, Record<string, boolean>>}
 */
export function mergeMatrix(overrides) {
    const merged = structuredClone(PERMISSIONS);
    for (const o of overrides) {
        if (merged[o.role_name]) merged[o.role_name][o.permission] = !!o.is_granted;
    }
    return merged;
}

/**
 * Catalogue permissions a role has today.
 *
 * @param {string} role
 * @param {Record<string, Record<string, boolean>>} matrix
 * @returns {string[]}
 */
export function permissionsForRole(role, matrix) {
    const can = (k) => matrix?.[role]?.[k] === true;
    return Object.entries(TODAY_RULES)
        .filter(([, r]) => r.rule(role, can))
        .map(([key]) => key);
}

/**
 * Read dbo.role_permissions and merge it onto the factory matrix.
 *
 * @param {(sqlText: string) => Promise<{ recordset: any[] }>} queryFn  lib/sql.js query().
 * @returns {Promise<{ matrix: Record<string, Record<string, boolean>>,
 *                     overrides: Array<{ role_name: string, permission: string, is_granted: boolean }> }>}
 */
export async function loadMergedMatrix(queryFn) {
    const overrides = (await queryFn(
        "SELECT role_name, permission, is_granted FROM dbo.role_permissions ORDER BY role_name, permission;",
    )).recordset;
    return { matrix: mergeMatrix(overrides), overrides };
}
