// middleware/demoContext.js
// -----------------------------------------------------------------------------
// Purpose:
//   Detects demo hostname and wraps each request in an AsyncLocalStorage
//   context so that lib/sql.js automatically routes all queries to the demo
//   pool — without threading req through dbSync.js or route handlers.
//
//   Real app:  www.albanyjwparking.org  → dbo schema (unchanged)
//   Demo app:  demo.albanyjwparking.org → demo schema (parking_demo_login)
// -----------------------------------------------------------------------------

import { demoStorage } from "../lib/sql.js";

/**
 * The hostname that triggers demo mode.
 * Reads from DEMO_HOSTNAME env var so it can be overridden in local dev
 * (e.g. set DEMO_HOSTNAME=localhost to test demo mode locally).
 * @type {string}
 */
const DEMO_HOSTNAME = process.env.DEMO_HOSTNAME || "demo.albanyjwparking.org";

/**
 * Express middleware that detects demo hostname and wraps the request
 * pipeline in an AsyncLocalStorage context.
 *
 * When isDemo is true, getSqlPool() in lib/sql.js returns the demo pool
 * automatically for all downstream DB calls in this request.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 * @returns {void}
 */
export function demoContextMiddleware(req, res, next) {
  const isDemo = req.hostname === DEMO_HOSTNAME;
  req.isDemo = isDemo;

  if (isDemo) {
    demoStorage.run({ isDemo: true }, next);
  } else {
    next();
  }
}
