// middleware/demoContext.js
// -----------------------------------------------------------------------------
// Purpose:
//   Detects demo hostname and wraps every request in an AsyncLocalStorage
//   request context (lib/sql.js) so that queries are routed to the demo pool
//   automatically — without threading req through dbSync.js or route
//   handlers. The context starts with no department and the "system" scope;
//   middleware/resolveDepartment.js fills in the department once the session
//   is loaded (multi-department phase 2b).
//
//   Also exposes the resolved brand (lib/branding.js) to every view as
//   res.locals.brand, plus res.locals.bt (brand.text) for wrapping
//   production wording that is rewritten on the demo.
//
//   Real app:  www.albanyjwparking.org  → dbo schema (unchanged)
//   Demo app:  demo.albanyjwparking.org → demo schema (parking_demo_login)
//
//   Internal PDF renders: Puppeteer loads /internal/pdf/* over loopback
//   (127.0.0.1), which never matches the demo hostname. When a PDF is
//   generated during a demo request, the generator appends ?demo=1 and this
//   middleware honours it — but only for /internal/pdf/* paths and only from
//   a loopback socket, so external callers can't use it.
// -----------------------------------------------------------------------------

import { demoStorage } from "../lib/sql.js";

/** @typedef {import("../lib/sql.js").RequestContext} RequestContext */
import { getBrand } from "../lib/branding.js";

/**
 * The hostname that triggers demo mode.
 * Reads from DEMO_HOSTNAME env var so it can be overridden in local dev
 * (e.g. set DEMO_HOSTNAME=localhost to test demo mode locally).
 * @type {string}
 */
const DEMO_HOSTNAME = process.env.DEMO_HOSTNAME || "demo.albanyjwparking.org";

/**
 * Socket addresses treated as loopback (IPv4, IPv6, IPv4-mapped IPv6).
 * @type {ReadonlySet<string>}
 */
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * True when this is a Puppeteer render of an internal PDF page that was
 * started from a demo request (see the ?demo=1 note above). Uses the raw
 * socket address rather than req.ip, which honours X-Forwarded-For.
 *
 * @param {import("express").Request} req
 * @returns {boolean}
 */
function isDemoInternalRender(req) {
    return (
        req.path.startsWith("/internal/pdf/") &&
        req.query.demo === "1" &&
        LOOPBACK_ADDRESSES.has(req.socket?.remoteAddress ?? "")
    );
}

/**
 * Express middleware that detects demo hostname, exposes the matching
 * brand to views, and wraps the request pipeline in an AsyncLocalStorage
 * request context — for every request, demo or not.
 *
 * When isDemo is true, getSqlPool() in lib/sql.js returns the demo pool
 * and getBrand() in lib/branding.js returns the demo brand automatically
 * for all downstream calls in this request.
 *
 * The context object is also attached as req.requestContext so later
 * middleware (resolveDepartment) can fill it in directly.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 * @returns {void}
 */
export function demoContextMiddleware(req, res, next) {
    const isDemo = req.hostname === DEMO_HOSTNAME || isDemoInternalRender(req);
    req.isDemo = isDemo;
    res.locals.brand = getBrand(isDemo);
    res.locals.bt = res.locals.brand.text;

    /** @type {RequestContext} */
    const context = { isDemo, departmentId: null, scope: "system" };
    req.requestContext = context;
    demoStorage.run(context, next);
}
