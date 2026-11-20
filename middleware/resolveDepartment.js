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
//                  lookups, invite links, webhooks). The SMS webhook picks a
//                  department itself (routes/smsWebhookRoute.js).
//   - Internal PDF render (Puppeteer over loopback, /internal/pdf/*, already
//                  protected by the PDF secret) → the department passed as
//                  ?dept=N by the publisher that started it, so the PDF
//                  shows only that department's data.
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
 * Socket addresses treated as loopback (IPv4, IPv6, IPv4-mapped IPv6).
 * @type {ReadonlySet<string>}
 */
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * The department requested by an internal Puppeteer PDF render, or null.
 * Only honoured for /internal/pdf/* paths from a loopback socket (the raw
 * socket address, not req.ip, which trusts X-Forwarded-For).
 *
 * @param {import("express").Request} req
 * @returns {number|null}
 */
function internalRenderDepartmentId(req) {
    if (!req.path.startsWith("/internal/pdf/")) return null;
    if (!LOOPBACK_ADDRESSES.has(req.socket?.remoteAddress ?? "")) return null;
    const id = Number(req.query.dept);
    return Number.isInteger(id) && id > 0 ? id : null;
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

    const renderDepartmentId = internalRenderDepartmentId(req);

    if (renderDepartmentId) {
        context.departmentId = renderDepartmentId;
        context.scope = "department";
    } else if (req.session?.userId) {
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
