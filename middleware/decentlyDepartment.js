// middleware/decentlyDepartment.js
// -----------------------------------------------------------------------------
// Purpose (multi-department phase 2d):
//   Volunteer Services runs Decently for every department, one department at
//   a time. VS staff (lib/departmentAccess.js) choose the department on the
//   Decently export / import pages; the choice is kept in the session
//   (decentlyDepartmentId / decentlyDepartmentName) and these middlewares run
//   the Decently routes in that department, so every existing query (which
//   uses the session department) works unchanged.
//
//   Everyone else keeps working in their own current department.
//
// Mount: per route, after requireAuth and before the handler. Requires
// resolveDepartmentMiddleware earlier in the chain (it fills the context).
// -----------------------------------------------------------------------------

import { DEFAULT_DEPARTMENT_ID, getRequestContext } from "../lib/sql.js";
import { getActiveDepartments } from "../lib/dbSync.js";
import { canManageAllDepartments, VOLUNTEER_SERVICES_SLUG } from "../lib/departmentAccess.js";

/**
 * Picker state for the views.
 * @typedef {Object} DecentlyDepartmentState
 * @property {boolean} canPick        True for VS staff / convention admins.
 * @property {number}  departmentId   Department the Decently tools act on.
 * @property {string}  departmentName Its display name.
 * @property {Array<{ id: number, name: string }>} options  Departments to pick from (canPick only).
 */

/**
 * Error log helper.
 * @param {...any} args
 */
function logError(...args) {
    console.error(`[${new Date().toISOString()}] [middleware/decentlyDepartment:ERROR]`, ...args);
}

/**
 * Departments Decently runs for: every active department except Volunteer
 * Services itself.
 *
 * @returns {Promise<Array<{ id: number, name: string, slug: string }>>}
 */
export async function decentlyDepartmentOptions() {
    const all = await getActiveDepartments();
    return all.filter((d) => d.slug !== VOLUNTEER_SERVICES_SLUG);
}

/**
 * Run the rest of the request in the Decently department chosen by VS staff,
 * and expose the picker state as res.locals.decently. For anyone who is not
 * VS staff this changes nothing (their own department is used).
 *
 * VS staff who have not picked yet act on their current department, or on
 * department 1 when that is Volunteer Services itself.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 * @returns {Promise<void>}
 */
export async function decentlyDepartmentContext(req, res, next) {
    /** @type {DecentlyDepartmentState} */
    const state = {
        canPick: false,
        departmentId: req.session?.departmentId ?? DEFAULT_DEPARTMENT_ID,
        departmentName: req.session?.departmentName || "",
        options: [],
    };
    res.locals.decently = state;

    if (!canManageAllDepartments(req.session)) {
        next();
        return;
    }

    try {
        state.canPick = true;
        state.options = (await decentlyDepartmentOptions()).map((d) => ({ id: d.id, name: d.name }));

        const chosen = state.options.find((d) => d.id === req.session.decentlyDepartmentId)
            || state.options.find((d) => d.id === req.session.departmentId)
            || state.options.find((d) => d.id === DEFAULT_DEPARTMENT_ID)
            || state.options[0];

        if (chosen) {
            state.departmentId = chosen.id;
            state.departmentName = chosen.name;

            const context = req.requestContext ?? getRequestContext();
            if (context) {
                context.departmentId = chosen.id;
                context.scope = "department";
            }
        }
        next();
    } catch (err) {
        logError("could not resolve the Decently department:", err);
        next(err);
    }
}

/**
 * The same, but only for requests the Decently import page marks with the
 * header `X-Decently-Import: 1` — used on shared endpoints (create-volunteer)
 * so accounts created from an import land in the import's department.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 * @returns {Promise<void>}
 */
export async function decentlyDepartmentIfImport(req, res, next) {
    if (req.get("X-Decently-Import") === "1") {
        await decentlyDepartmentContext(req, res, next);
        return;
    }
    next();
}
