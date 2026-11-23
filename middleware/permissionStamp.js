/**
 * @file middleware/permissionStamp.js
 * @description Keeps a signed-in person's permissions fresh, and gives views
 * a can() helper (multi-department phase 3d).
 *
 * On every signed-in request one small query (lib/positions.js
 * getPermissionStamp()) fingerprints what decides the person's permissions
 * in the current department. When it differs from the stamp stored at the
 * last load, the permissions are reloaded before the route runs, so a
 * change made by someone else applies on the person's next page load.
 * Nothing that changes positions or roles has to notify the session, and
 * it works with more than one app instance.
 *
 * Also sets, for every request:
 *   res.locals.can(key)               true when the session holds the catalogue key
 *   res.locals.effectivePermissions   the session's catalogue keys (for
 *                                     views/partials/permissionsData.ejs)
 *
 * A failure is logged (at most once a minute) and never blocks the request.
 *
 * Mount: after the session and resolveDepartmentMiddleware, before the nav
 * locals and every route.
 */

import { withScope } from "../lib/sql.js";
import { getPermissionStamp, loadSessionPermissions } from "../lib/positions.js";

/**
 * Time of the last logged failure, to keep a broken database from flooding
 * the log with one line per request.
 * @type {number}
 */
let lastErrorLoggedAt = 0;

/**
 * Error log helper, throttled to one line a minute.
 * @param {...any} args
 */
function logError(...args) {
    const now = Date.now();
    if (now - lastErrorLoggedAt < 60_000) return;
    lastErrorLoggedAt = now;
    console.error(`[${new Date().toISOString()}] [middleware/permissionStamp:ERROR]`, ...args);
}

/**
 * Reload the session's permissions when the stamp has changed, then expose
 * can() to views.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 * @returns {Promise<void>}
 */
export async function permissionStampMiddleware(req, res, next) {
    const s = req.session;

    if (s?.userId && s.departmentId) {
        try {
            const current = await withScope("system", () =>
                getPermissionStamp(s.userId, s.departmentId),
            );
            if (current.stamp !== s.permissionStamp) {
                s.isConventionAdmin = current.isConventionAdmin;
                await loadSessionPermissions(s, "page load");
            }
        } catch (err) {
            logError(`could not refresh permissions for volunteer ${s.userId}:`, err);
        }
    }

    const held = new Set(Array.isArray(s?.effectivePermissions) ? s.effectivePermissions : []);
    res.locals.can = (key) => held.has(key);
    res.locals.effectivePermissions = [...held];
    next();
}
