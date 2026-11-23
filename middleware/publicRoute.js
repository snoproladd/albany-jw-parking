// middleware/publicRoute.js
// -----------------------------------------------------------------------------
// Purpose (multi-department phase 3b):
//   Marks a route as deliberately public — reachable without signing in and
//   without a permission (login, registration, invitation replies, webhooks,
//   health checks...). It does nothing at runtime; scripts/auditRoutes.js
//   looks for it so every route is either gated by a permission or visibly
//   declared public. Phase 3d adds it to the existing public routes.
//
//   signedInRoute() (phase 3d-2) is its sibling for routes any signed-in
//   person may use without a particular permission.
//
// Usage:
//   router.get("/login", publicRoute("sign-in page"), csrfProtection, handler);
//   router.post("/account/department", requireAuth, signedInRoute("switch department"), handler);
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

/**
 * Create a no-op middleware that declares the route open to any signed-in
 * person, with no particular permission (switching department, session
 * keep-alive, tour prompts, bug reports ...). Like publicRoute() it does
 * nothing at runtime: sign-in itself is still checked by requireAuth or by
 * the handler. scripts/auditRoutes.js lists these as "anySignedIn".
 *
 * Usage:
 *   router.get("/account/departments", requireAuth, signedInRoute("department switcher"), handler);
 *
 * @param {string} reason  Why no permission is needed (shown in the route audit).
 * @returns {import("express").RequestHandler & { signedInReason: string }}
 */
export function signedInRoute(reason) {
    if (typeof reason !== "string" || reason.trim() === "") {
        throw new Error("signedInRoute(reason): give a short reason no permission is needed.");
    }

    /**
     * @param {import("express").Request} _req
     * @param {import("express").Response} _res
     * @param {import("express").NextFunction} next
     * @returns {void}
     */
    function signedInRouteMarker(_req, _res, next) {
        next();
    }

    signedInRouteMarker.signedInReason = reason.trim();
    return signedInRouteMarker;
}
