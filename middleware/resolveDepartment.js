// middleware/resolveDepartment.js
// -----------------------------------------------------------------------------
// Purpose:
//   Decides which department the current request is for and records it in
//   the request context (lib/sql.js), so every query in the request sends
//   SESSION_CONTEXT(N'department_id') and SESSION_CONTEXT(N'scope') to SQL
//   Server (multi-department phase 2b).
//
//   This is the ONLY place that decides the current department. Today it
//   reads the session; moving to URL-based departments (/d/<slug>/...) later
//   means changing this function, the route mount and link building — not
//   every route.
//
// Rules (2b-1):
//   - Signed in  → scope "department"; department = req.session.departmentId,
//                  or DEFAULT_DEPARTMENT_ID until login sets it (2b-2).
//   - Signed out → scope "system", no department (registration, login
//                  lookups, invite links, webhooks). Revisited in the 2c
//                  row-level security prototype.
//
// Mount: right after the session middleware, before any route.
// Requires: demoContextMiddleware earlier in the chain (it opens the context).
// -----------------------------------------------------------------------------

import { DEFAULT_DEPARTMENT_ID, getRequestContext } from "../lib/sql.js";

/** @typedef {import("../lib/sql.js").RequestContext} RequestContext */

/**
 * Warn at most once per process when the request context is missing, so a
 * mis-ordered middleware chain shows up in the log without flooding it.
 * @type {boolean}
 */
let warnedMissingContext = false;

/**
 * Error log helper.
 * @param {...any} args
 */
function logError(...args) {
    console.error(`[${new Date().toISOString()}] [middleware/resolveDepartment:ERROR]`, ...args);
}

/**
 * Returns the department id stored in the session when it is a positive
 * integer, otherwise DEFAULT_DEPARTMENT_ID.
 *
 * @param {Record<string, any> | undefined} session
 * @returns {number}
 */
function sessionDepartmentId(session) {
    const id = session?.departmentId;
    return Number.isInteger(id) && id > 0 ? id : DEFAULT_DEPARTMENT_ID;
}

/**
 * Express middleware that fills in departmentId and scope on the request
 * context, and exposes them as req.departmentId and res.locals.departmentId.
 *
 * @param {import("express").Request & { requestContext?: RequestContext, departmentId?: number|null }} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 * @returns {void}
 */
export function resolveDepartmentMiddleware(req, res, next) {
    const context = req.requestContext ?? getRequestContext();

    if (!context) {
        if (!warnedMissingContext) {
            warnedMissingContext = true;
            logError("No request context — is demoContextMiddleware mounted before resolveDepartment?");
        }
        req.departmentId = null;
        res.locals.departmentId = null;
        next();
        return;
    }

    if (req.session?.userId) {
        context.departmentId = sessionDepartmentId(req.session);
        context.scope = "department";
    } else {
        context.departmentId = null;
        context.scope = "system";
    }

    req.departmentId = context.departmentId;
    res.locals.departmentId = context.departmentId;
    next();
}
