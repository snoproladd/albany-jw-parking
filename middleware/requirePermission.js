/**
 * @file middleware/requirePermission.js
 * @description Route gate for permissions (multi-department phase 3d).
 *
 * One gate for both kinds of key while the site is converted:
 *
 *   - A catalogue key (src/config/permissions.js, e.g. "volunteers.view")
 *     is checked against session.effectivePermissions — the person's
 *     positions in the current department, kept fresh by
 *     middleware/permissionStamp.js.
 *   - An old key (src/config/roles.js, e.g. "viewVolunteerInfo") is checked
 *     the old way: the merged role matrix plus the per-volunteer extras.
 *     This path is removed in phase 3d-8, once every route is converted.
 *
 * With several keys, any one of them is enough:
 *
 *     router.get("/x", requireAuth, requirePermission("notes.view"), handler);
 *     router.get("/y", requireAuth, requirePermission("lessons.review", "lessons.publish"), handler);
 *
 * Keys are checked when the route is declared, so a typo stops the app at
 * startup instead of quietly refusing everyone. scripts/auditRoutes.js reads
 * these calls to build docs/ROUTE_AUDIT.md.
 */

import { PERMISSIONS, can } from "../src/config/roles.js";
import { isKnownPermission } from "../src/config/permissions.js";
import { sessionHasPermission } from "../lib/positions.js";

/**
 * Old permission keys (from the factory matrix).
 * @type {ReadonlySet<string>}
 */
const LEGACY_KEYS = new Set(Object.keys(PERMISSIONS.ADMIN ?? {}));

/**
 * True when the session holds `key`, of either kind.
 *
 * @param {Record<string, any> | undefined} session  req.session.
 * @param {string} key  Catalogue key or old key.
 * @returns {boolean}
 */
export function sessionCan(session, key) {
    if (isKnownPermission(key)) return sessionHasPermission(session, key);

    // Old key: role matrix, then the per-volunteer extras (extra_* flags).
    const role = session?.userRole || "NON_REGISTERED";
    if (can(session?.permissions || PERMISSIONS, role, key)) return true;
    return Array.isArray(session?.extraPermissions) && session.extraPermissions.includes(key);
}

/**
 * Express middleware factory: lets the request through when the session
 * holds at least one of `keys`, otherwise renders the 403 page.
 *
 * @param {...string} keys  Catalogue keys (or old keys until converted).
 * @returns {import("express").RequestHandler}
 * @throws {Error} At startup, when no key is given or a key is unknown.
 */
export function requirePermission(...keys) {
    if (keys.length === 0) {
        throw new Error("requirePermission: at least one permission key is required");
    }
    for (const key of keys) {
        if (!isKnownPermission(key) && !LEGACY_KEYS.has(key)) {
            throw new Error(`requirePermission: unknown permission key "${key}"`);
        }
    }

    return (req, res, next) => {
        if (keys.some((key) => sessionCan(req.session, key))) return next();

        return res.status(403).render("errors/403", {
            nav: res.locals.nav,
            userRole: req.session?.userRole || "NON_REGISTERED",
        });
    };
}
