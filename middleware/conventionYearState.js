/**
 * @file middleware/conventionYearState.js
 * @description Exposes the convention-year state to every rendered page as
 * `res.locals.yearState`, which drives:
 *
 *   - the "Has the next convention year begun?" prompt for ADMIN and
 *     ASSISTANT_ADMIN (views/partials/rolloverPrompt.ejs), and
 *   - the "site may not be on the current year" banner for every other
 *     signed-in user (views/partials/yearBanner.ejs).
 *
 * Both appear on or after September 1 of the active year until an admin
 * starts the next year. An admin who clicks "Not yet" is not prompted
 * again for the rest of that session. Both are suppressed on the demo
 * site: its seeded data is not tied to a real calendar, and
 * job-application reviewers should not land on a rollover prompt.
 *
 * It also flags pages opened with `?year=` for an earlier year
 * (`isPastYear`), which shows the read-only banner and loads
 * public/js/pastYearLock.js. The server-side block lives in
 * middleware/closedYearGuard.js.
 *
 * Must be mounted after the session middleware and after the middleware
 * that sets `res.locals.nav`.
 */

import {
    getActiveYear,
    needsRolloverPrompt,
    resolveViewYear,
} from "../lib/conventionYear.js";
import { isRoleAtLeast } from "../src/config/roles.js";

/** Lowest role that is asked to start the next convention year. */
const ROLLOVER_MIN_ROLE = "ASSISTANT_ADMIN";

/** Path prefixes that never render a page, so they skip the lookup. */
const SKIP_PREFIXES = ["/api/", "/webhook/", "/internal/", "/js/", "/styles/", "/vendor/", "/images/", "/fonts/"];

/**
 * @typedef {object} YearState
 * @property {number}  activeYear       - The active convention year.
 * @property {number}  nextYear         - activeYear + 1.
 * @property {boolean} showAdminPrompt  - Render the rollover prompt modal.
 * @property {boolean} showStaleBanner  - Render the "contact an admin" banner.
 * @property {number}  viewYear         - Year the page shows (`?year=` or the active year).
 * @property {boolean} isPastYear       - viewYear is earlier than the active year (read-only).
 * @property {string}  currentYearUrl   - This page without `?year=`, for "Return to <active year>".
 */

/**
 * The current URL with any `year` query parameter removed.
 *
 * @param {import("express").Request} req
 * @returns {string}
 */
function urlWithoutYear(req) {
    const url = new URL(req.originalUrl, "http://local");
    url.searchParams.delete("year");
    const qs = url.searchParams.toString();
    return qs ? `${url.pathname}?${qs}` : url.pathname;
}

/**
 * Express middleware: set `res.locals.yearState` for page renders.
 *
 * Never blocks the request: if the active year cannot be resolved the
 * prompt and banner are simply hidden.
 *
 * @param {import("express").Request}      req
 * @param {import("express").Response}     res
 * @param {import("express").NextFunction} next
 * @returns {Promise<void>}
 */
export async function conventionYearStateMiddleware(req, res, next) {
    /** @type {YearState} */
    const state = {
        activeYear: 0,
        nextYear: 0,
        showAdminPrompt: false,
        showStaleBanner: false,
        viewYear: 0,
        isPastYear: false,
        currentYearUrl: "",
    };
    res.locals.yearState = state;

    const isPage =
        req.method === "GET" &&
        !SKIP_PREFIXES.some((p) => req.path.startsWith(p));
    const userId = req.session?.userId;

    if (!isPage || !userId) return next();

    try {
        const activeYear = await getActiveYear();
        state.activeYear = activeYear;
        state.nextYear = activeYear + 1;

        if (req.query?.year !== undefined) {
            state.viewYear = resolveViewYear(req.query.year, activeYear);
            state.isPastYear = state.viewYear < activeYear;
            if (state.isPastYear) state.currentYearUrl = urlWithoutYear(req);
        } else {
            state.viewYear = activeYear;
        }

        if (!req.isDemo && needsRolloverPrompt(activeYear)) {
            const role = req.session.userRole || "REGISTERED";
            if (isRoleAtLeast(role, ROLLOVER_MIN_ROLE)) {
                state.showAdminPrompt =
                    req.session.rolloverSnoozedFor !== activeYear;
            } else if (role !== "COUNTER") {
                state.showStaleBanner = true;
            }
        }
    } catch (err) {
        console.error(
            `[${new Date().toISOString()}] [middleware/conventionYearState.js]`,
            "Failed to resolve year state:",
            err,
        );
    }

    return next();
}
