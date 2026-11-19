/**
 * @file routes/conventionYearRoutes.js
 * @description Endpoints behind the "Has the next convention year begun?"
 * prompt shown to ADMIN and ASSISTANT_ADMIN on or after September 1.
 *
 *   GET  /api/convention-year/rollover-context
 *        Data the prompt needs (active/next year, the active year's dates
 *        for reference) plus a CSRF token, since the prompt can appear on
 *        pages that were not rendered with one.
 *
 *   POST /api/convention-year/snooze
 *        "Not yet" — hide the prompt for the rest of this session.
 *
 *   POST /oversight/tools/start-year
 *        Close the active year and start the next one (see
 *        startConventionYear in lib/dbSync.js for exactly what it does).
 */

import express from "express";
import { getActiveYear, invalidateYearCache } from "../lib/conventionYear.js";
import { getConventionDays, startConventionYear } from "../lib/dbSync.js";

/** Roles allowed to see and act on the rollover prompt. */
const ROLLOVER_ROLES = new Set(["ADMIN", "ASSISTANT_ADMIN"]);

/** Most convention days that can be created in one rollover. */
const MAX_ROLLOVER_DATES = 14;

/** SQL error numbers raised on purpose by startConventionYear(). */
const ROLLOVER_CONFLICT_ERRORS = new Set([50001, 50002]);

/**
 * Validate the picked dates: ISO "YYYY-MM-DD", real calendar dates, all in
 * `year`, no duplicates, 1..MAX_ROLLOVER_DATES of them.
 *
 * @param {unknown} dates
 * @param {number} year
 * @returns {{ ok: true, dates: string[] } | { ok: false, error: string }}
 */
function validateRolloverDates(dates, year) {
    if (!Array.isArray(dates) || dates.length === 0) {
        return { ok: false, error: "Select at least one convention date." };
    }
    if (dates.length > MAX_ROLLOVER_DATES) {
        return { ok: false, error: `Select no more than ${MAX_ROLLOVER_DATES} dates.` };
    }
    const clean = new Set();
    for (const d of dates) {
        if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
            return { ok: false, error: "Invalid date format." };
        }
        const parsed = new Date(`${d}T12:00:00Z`);
        if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== d) {
            return { ok: false, error: `${d} is not a real date.` };
        }
        if (Number(d.slice(0, 4)) !== year) {
            return { ok: false, error: `${d} is not in ${year}.` };
        }
        clean.add(d);
    }
    return { ok: true, dates: [...clean].sort() };
}

/**
 * Build the convention-year router.
 *
 * @param {{
 *   csrfProtection: import("express").RequestHandler,
 *   logError?:      Function,
 * }} deps
 * @returns {import("express").Router}
 */
export function conventionYearRouter({ csrfProtection, logError }) {
    const router = express.Router();

    /**
     * JSON guard: signed in as ADMIN or ASSISTANT_ADMIN, not on the demo site.
     *
     * @param {import("express").Request}      req
     * @param {import("express").Response}     res
     * @param {import("express").NextFunction} next
     * @returns {void}
     */
    function requireRolloverRole(req, res, next) {
        if (!req.session?.userId) {
            res.status(401).json({ success: false, error: "Not signed in." });
            return;
        }
        if (!ROLLOVER_ROLES.has(req.session.userRole) || req.isDemo) {
            res.status(403).json({ success: false, error: "Not allowed." });
            return;
        }
        next();
    }

    /**
     * Format a convention_date (Date or string) as "YYYY-MM-DD".
     *
     * @param {Date|string} d
     * @returns {string}
     */
    function isoDate(d) {
        return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
    }

    /**
     * GET /api/convention-year/rollover-context
     * Returns the years involved, the active year's convention dates (shown
     * in the prompt for reference) and a fresh CSRF token.
     */
    router.get(
        "/api/convention-year/rollover-context",
        requireRolloverRole,
        csrfProtection,
        async (req, res) => {
            try {
                const activeYear = await getActiveYear();
                const days = await getConventionDays(activeYear);
                const currentDates = days
                    .filter((d) => d.convention_date)
                    .map((d) => ({ date: isoDate(d.convention_date), label: d.label }))
                    .sort((a, b) => a.date.localeCompare(b.date));

                res.json({
                    success: true,
                    activeYear,
                    nextYear: activeYear + 1,
                    currentDates,
                    csrfToken: req.csrfToken(),
                });
            } catch (err) {
                (logError || console.error)("rollover-context GET error:", err);
                res.status(500).json({ success: false, error: "Server error." });
            }
        },
    );

    /**
     * POST /api/convention-year/snooze
     * Hide the prompt for the rest of this session. Stored against the
     * active year so it reappears if the year changes underneath.
     */
    router.post(
        "/api/convention-year/snooze",
        requireRolloverRole,
        csrfProtection,
        async (req, res) => {
            try {
                req.session.rolloverSnoozedFor = await getActiveYear();
                res.json({ success: true });
            } catch (err) {
                (logError || console.error)("rollover snooze POST error:", err);
                res.status(500).json({ success: false, error: "Server error." });
            }
        },
    );

    /**
     * POST /oversight/tools/start-year
     * Body: { year, dates: string[], carryLocations, carryStructure, resetSigns }
     * `year` must be exactly the active year + 1.
     */
    router.post(
        "/oversight/tools/start-year",
        requireRolloverRole,
        csrfProtection,
        async (req, res) => {
            const body = req.body || {};
            try {
                const fromYear = await getActiveYear();
                const toYear = Number(body.year);

                if (toYear !== fromYear + 1) {
                    return res.status(400).json({
                        success: false,
                        error: `Only ${fromYear + 1} can be started right now.`,
                    });
                }

                const checked = validateRolloverDates(body.dates, toYear);
                if (!checked.ok) {
                    return res.status(400).json({ success: false, error: checked.error });
                }

                const s = req.session;
                const summary = await startConventionYear({
                    fromYear,
                    toYear,
                    dates: checked.dates,
                    carryLocations: body.carryLocations === true,
                    carryStructure: body.carryStructure === true,
                    resetSigns: body.resetSigns === true,
                    startedBy: s.userId,
                    editedBy: s.userEmail || "admin",
                });

                invalidateYearCache();
                await getActiveYear(); // re-prime so SharePoint paths switch immediately
                delete req.session.rolloverSnoozedFor;

                return res.json({ success: true, fromYear, toYear, summary });
            } catch (err) {
                if (ROLLOVER_CONFLICT_ERRORS.has(err?.number)) {
                    invalidateYearCache();
                    return res.status(409).json({ success: false, error: err.message });
                }
                (logError || console.error)("start-year POST error:", err);
                return res.status(500).json({
                    success: false,
                    error: "Starting the new year failed. Nothing was changed.",
                });
            }
        },
    );

    return router;
}
