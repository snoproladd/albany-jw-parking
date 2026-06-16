/**
 * @file roles.js
 * @description RBAC role hierarchy and permission matrix.
 *
 * roles.js acts as the factory-default permission set.
 * The DB table role_permissions stores only overrides (deltas).
 * At login, loadMergedPermissions() merges DB overrides on top
 * of these defaults and stores the result in the session.
 */

/**
 * Role hierarchy — index = privilege level (higher = more access).
 * Used by canAssignRole() to enforce promotion rules.
 * @type {string[]}
 */
export const ROLE_HIERARCHY = [
  "NON_REGISTERED",
  "REGISTERED",
  "DESK",
  "KEYMAN",
  "OVERSEER",
  "ASSISTANT_ADMIN",
  "ADMIN",
];

/**
 * Factory-default permission matrix.
 * Each key is a permission string checked via can().
 * DB overrides are merged on top at login — do not read this
 * object directly in middleware; use the merged session copy.
 * @type {Record<string, Record<string, boolean>>}
 */
export const PERMISSIONS = {
  NON_REGISTERED: {
    submitInfo: true,
    viewSchedules: false,
    viewMaps: false,
    printMaps: false,
    printSchedules: false,
    viewVolunteerInfo: false,
    editVolunteerInfo: false,
    createAssignments: false,
    manageShifts: false,
    uploadMaps: false,
    sendMessages: false,
    printUserData: false,
    editSelf: true,
    manageRoles: false,
    accessAdminConsole: false,
    createVolunteerAccounts: false,
    createCampaign: false,
    manageCampaigns: false,
    deleteVolunteer: false,
    logAttendance: false,
    viewAttendance: false,
    viewSigns: false,
    manageSigns: false,
    editRendezvous: false,
  },
  REGISTERED: {
    submitInfo: true,
    viewSchedules: true,
    viewMaps: true,
    printMaps: false,
    printSchedules: false,
    viewVolunteerInfo: false,
    editVolunteerInfo: false,
    createAssignments: false,
    manageShifts: false,
    uploadMaps: false,
    sendMessages: false,
    printUserData: false,
    editSelf: true,
    manageRoles: false,
    accessAdminConsole: false,
    createVolunteerAccounts: false,
    createCampaign: false,
    manageCampaigns: false,
    deleteVolunteer: false,
    logAttendance: false,
    viewAttendance: false,
    viewSigns: true,
    manageSigns: false,
    editRendezvous: false,
  },
  DESK: {
    submitInfo: true,
    viewSchedules: true,
    viewMaps: true,
    printMaps: false,
    printSchedules: false,
    viewVolunteerInfo: false,
    editVolunteerInfo: false,
    createAssignments: false,
    manageShifts: false,
    uploadMaps: false,
    sendMessages: false,
    printUserData: false,
    editSelf: true,
    manageRoles: false,
    accessAdminConsole: false,
    createVolunteerAccounts: true,
    createCampaign: false,
    manageCampaigns: false,
    deleteVolunteer: false,
    logAttendance: true,
    viewAttendance: true,
    viewSigns: true,
    manageSigns: false,
    editRendezvous: false,
  },
  KEYMAN: {
    submitInfo: true,
    viewSchedules: true,
    viewMaps: true,
    printMaps: true,
    printSchedules: true,
    viewVolunteerInfo: true,
    editVolunteerInfo: false,
    createAssignments: false,
    manageShifts: false,
    uploadMaps: false,
    sendMessages: false,
    printUserData: false,
    editSelf: true,
    manageRoles: false,
    accessAdminConsole: false,
    createVolunteerAccounts: false,
    createCampaign: false,
    manageCampaigns: false,
    deleteVolunteer: false,
    logAttendance: true,
    viewAttendance: true,
    viewSigns: true,
    manageSigns: false,
    editRendezvous: true,
  },
  OVERSEER: {
    submitInfo: true,
    viewSchedules: true,
    viewMaps: true,
    printMaps: true,
    printSchedules: true,
    viewVolunteerInfo: true,
    editVolunteerInfo: true,
    createAssignments: true,
    manageShifts: true,
    uploadMaps: true,
    sendMessages: true,
    printUserData: true,
    editSelf: true,
    manageRoles: false,
    accessAdminConsole: false,
    createVolunteerAccounts: true,
    createCampaign: true,
    manageCampaigns: false,
    deleteVolunteer: false,
    logAttendance: true,
    viewAttendance: true,
    viewSigns: true,
    manageSigns: true,
    editRendezvous: true,
  },
  ASSISTANT_ADMIN: {
    submitInfo: true,
    viewSchedules: true,
    viewMaps: true,
    printMaps: true,
    printSchedules: true,
    viewVolunteerInfo: true,
    editVolunteerInfo: true,
    createAssignments: true,
    manageShifts: true,
    uploadMaps: true,
    sendMessages: true,
    printUserData: true,
    editSelf: true,
    manageRoles: true,
    accessAdminConsole: true,
    createVolunteerAccounts: true,
    createCampaign: true,
    manageCampaigns: false,
    deleteVolunteer: true,
    logAttendance: true,
    viewAttendance: true,
    viewSigns: true,
    manageSigns: true,
    editRendezvous: true,
  },
  ADMIN: {
    submitInfo: true,
    viewSchedules: true,
    viewMaps: true,
    printMaps: true,
    printSchedules: true,
    viewVolunteerInfo: true,
    editVolunteerInfo: true,
    createAssignments: true,
    manageShifts: true,
    uploadMaps: true,
    sendMessages: true,
    printUserData: true,
    editSelf: true,
    manageRoles: true,
    accessAdminConsole: true,
    createVolunteerAccounts: true,
    createCampaign: true,
    manageCampaigns: true,
    deleteVolunteer: true,
    logAttendance: true,
    viewAttendance: true,
    viewSigns: true,
    manageSigns: true,
    editRendezvous: true,
  },
};

/**
 * Check if a role has a specific permission.
 * Use the merged permissions object from session, not PERMISSIONS directly.
 *
 * @param {Record<string, Record<string, boolean>>} permissions - Merged permissions from session.
 * @param {string} role - The role to check.
 * @param {string} permission - The permission key to check.
 * @returns {boolean}
 */
export function can(permissions, role, permission) {
  return permissions?.[role]?.[permission] ?? false;
}

/**
 * Check if actorRole is allowed to assign targetRole to another user.
 * Rules:
 *  - Actor must have manageRoles permission.
 *  - Actor can only assign roles strictly below their own level.
 *  - ASSISTANT_ADMIN cannot touch ADMIN accounts.
 *
 * @param {string} actorRole
 * @param {string} targetRole
 * @returns {boolean}
 */
export function canAssignRole(actorRole, targetRole) {
  if (!PERMISSIONS[actorRole]?.manageRoles) return false;
  const actorLevel = ROLE_HIERARCHY.indexOf(actorRole);
  const targetLevel = ROLE_HIERARCHY.indexOf(targetRole);
  return actorLevel > targetLevel;
}

/**
 * Load DB overrides and merge onto the PERMISSIONS defaults.
 * Call once at login and store the result in req.session.permissions.
 * Middleware should read from session, not call this on every request.
 *
 * @param {import('mssql').ConnectionPool} pool
 * @returns {Promise<Record<string, Record<string, boolean>>>}
 */
export async function loadMergedPermissions(pool) {
  const result = await pool.request().query(`
        SELECT role_name, permission, is_granted
        FROM dbo.role_permissions
    `);

  const merged = structuredClone(PERMISSIONS);

  for (const { role_name, permission, is_granted } of result.recordset) {
    if (merged[role_name]) {
      merged[role_name][permission] = !!is_granted;
    }
  }

  return merged;
}

/**
 * Express middleware factory — blocks requests where the session role
 * lacks the specified permission.
 * Reads merged permissions from req.session.permissions (set at login).
 * Falls back to PERMISSIONS defaults if session copy is missing.
 *
 * @param {string} permission - Permission key to require.
 * @returns {import('express').RequestHandler}
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    const role = req.session.userRole || "NON_REGISTERED";
    const permissions = req.session.permissions || PERMISSIONS;

    if (can(permissions, role, permission)) {
      return next();
    }

    // Delegated extra permissions granted per-volunteer by ADMIN/ASSISTANT_ADMIN.
    // Stored as a string array on the session at login. Each entry is a
    // permission key that overrides the role-matrix result for that key only.
    const extra = Array.isArray(req.session.extraPermissions)
      ? req.session.extraPermissions
      : [];
    if (extra.includes(permission)) {
      return next();
    }

    return res.status(403).render("errors/403", {
      nav: res.locals.nav,
      userRole: role,
    });
  };
}
