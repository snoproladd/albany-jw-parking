// middleware/publicRoute.js
// -----------------------------------------------------------------------------
// Purpose (multi-department phase 3b):
//   Marks a route as deliberately public — reachable without signing in and
//   without a permission (login, registration, invitation replies, webhooks,
//   health checks...). It does nothing at runtime; scripts/auditRoutes.js
//   looks for it so every route is either gated by a permission or visibly
//   declared public. Phase 3d adds it to the existing public routes.
//
// Usage:
//   router.get("/login", publicRoute("sign-in page"), csrfProtection, handler);
// -----------------------------------------------------------------------------

/**
 * Create a no-op middleware that declares the route public.
 *
 * @param {string} reason  Why the route is public (shown in the route audit).
 * @returns {import("express").RequestHandler & { publicReason: string }}
 */
export function publicRoute(reason) {
    if (typeof reason !== "string" || reason.trim() === "") {
        throw new Error("publicRoute(reason): give a short reason the route is public.");
    }

    /**
     * @param {import("express").Request} _req
     * @param {import("express").Response} _res
     * @param {import("express").NextFunction} next
     * @returns {void}
     */
    function publicRouteMarker(_req, _res, next) {
        next();
    }

    publicRouteMarker.publicReason = reason.trim();
    return publicRouteMarker;
}
