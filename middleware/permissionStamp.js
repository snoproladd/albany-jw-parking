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
 *   res.locals.hasTools               true when the person has something on the
 *                                     Tools hub beyond what every volunteer has:
 *                                     a convention admin, or any department key of
 *                                     tier 2 or higher (phase 3d-8c). Decides the
 *                                     header's Tools menu, the hub page and its
 *                                     site map entry.
 *
 * Ends the session when the account has since been archived, deleted or
 * marked compromised (getPermissionStamp() `blocked`): a page load is sent
 * to /login, anything else gets a 401 JSON reply.
 *
 * A failure is logged (at most once a minute) and never blocks the request.
 *
 * Mount: after the session and resolveDepartmentMiddleware, before the nav
 * locals and every route.
 */

import { withScope } from "../lib/sql.js";
import { getPermissionStamp, loadSessionPermissions } from "../lib/positions.js";
import { getPermission } from "../src/config/permissions.js";

/**
 * True when these keys open something on the Tools hub that a plain
 * Volunteer (tier 1 only) doesn't have.
 *
 * @param {Iterable<string>} keys
 * @returns {boolean}
 */
export function keysGiveTools(keys) {
    for (const key of keys) {
        const def = getPermission(key);
        if (def && def.scope !== "account" && def.tier >= 2) return true;
    }
    return false;
}

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
 * End a session whose account may no longer be signed in, then answer the
 * request: a redirect to /login for a page load, a 401 JSON reply otherwise.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {number} volunteerId  For the log line.
 * @returns {void}
 */
function endBlockedSession(req, res, volunteerId) {
    console.warn(`[${new Date().toISOString()}] [middleware/permissionStamp] `
        + `signed out volunteer ${volunteerId}: account archived, deleted or compromised`);
    const wantsPage = req.method === "GET" && !req.xhr && req.accepts(["html", "json"]) === "html";
    req.session.destroy(() => {
        if (wantsPage) {
            res.redirect("/login");
        } else {
            res.status(401).json({ success: false, error: "Your session has ended. Please sign in again." });
        }
    });
}

/**
 * Reload the session's permissions when the stamp has changed, then expose
 * can() to views. Ends the session instead when the account may no longer
 * be signed in (endBlockedSession()).
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
            if (current.blocked) {
                endBlockedSession(req, res, s.userId);
                return;
            }
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
    res.locals.hasTools = Boolean(s?.isConventionAdmin) || keysGiveTools(held);
    next();
}
