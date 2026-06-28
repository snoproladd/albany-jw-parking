/**
 * @file routes/countsRoutes.js
 * @description Routes for the Parking Counter feature (2.63.0).
 *
 * Page routes:
 *   GET  /counts              Phone-first tally page (logParkingCount)
 *   GET  /counts/report       Oversight time-series chart (viewAttendance)
 *
 * API routes (no CSRF — called via fetch, no CSRF token sent by client):
 *   GET  /api/counts/locations    Active locations with capacity for current year
 *   GET  /api/counts/days         All convention days for current year
 *   GET  /api/counts/today        Auto-detect today's convention day
 *   POST /api/counts/heartbeat    60-second running count update
 *   POST /api/counts/submit       Final count submission (resets client tally)
 *   POST /api/counts/manual-submit  Manual count submission
 *   DELETE /api/counts/location/:id  Reset counts for a location (accessAdminConsole)
 */

import express from "express";
import { requirePermission, can, PERMISSIONS } from "../src/config/roles.js";
import {
  getActiveLocationsForYear,
  getConventionDays,
  getTodayConventionDay,
  insertParkingCount,
  getParkingCountReportData,
  deleteLocationCounts,
  getActiveSubLocationsForLocation,
} from "../lib/dbSync.js";

/**
 * Factory: build the counts router.
 *
 * @param {{
 *   csrfProtection: import('csurf').CsrfRequestHandler,
 *   logError:       (...args: any[]) => void,
 * }} deps
 * @returns {import('express').Router}
 */
export function countsRouter({ csrfProtection, logError }) {
  const router = express.Router();

  // ============================================================
  // Page routes
  // ============================================================

  /**
   * GET /counts
   * Phone-first parking tally page.
   * Requires logParkingCount (OVERSEER+ by default, or delegated via
   * the extra_parking_count flag on volunteer_in).
   */
  router.get(
    "/counts",
    requirePermission("logParkingCount"),
    (req, res) => {
      res.render("counts", {
        nav: res.locals.nav,
        userRole: req.session.userRole,
        userPermissions: res.locals.userPermissions,
        appVersion: res.locals.appVersion,
      });
    },
  );

  /**
   * GET /counts/report
   * Redirects to the Garage Capacity tab on the Reports page.
   * The count report content now lives at /oversight/tools/reports?tab=garage-capacity.
   */
  router.get(
    "/counts/report",
    requirePermission("viewAttendance"),
    (req, res) => {
      res.redirect(301, "/oversight/tools/reports?tab=garage-capacity");
    },
  );

  // ============================================================
  // API routes — no csrfProtection (fetch callers do not send tokens)
  // ============================================================

  /**
   * GET /api/counts/locations
   * Returns active locations that have a capacity value set, for the
   * current year. Used to populate the location picker on the tally page.
   *
   * @returns {{ locations: Array<{ id: number, name: string, capacity: number }> }}
   */
  router.get(
    "/api/counts/locations",
    requirePermission("logParkingCount"),
    async (req, res) => {
      try {
        const year = new Date().getFullYear();
        const locations = await getActiveLocationsForYear(year);
        res.json({ locations });
      } catch (err) {
        logError("[GET /api/counts/locations]", err);
        res.status(500).json({ error: "Failed to load locations." });
      }
    },
  );

  /**
   * GET /api/counts/days
   * Returns all convention days for the current year, ordered by date.
   * Used for the manual day picker when auto-detect finds no match.
   *
   * @returns {{ days: Array<{ id: number, label: string, convention_date: string }> }}
   */
  router.get(
    "/api/counts/days",
    requirePermission("logParkingCount"),
    async (req, res) => {
      try {
        const year = new Date().getFullYear();
        const days = await getConventionDays(year);
        res.json({ days });
      } catch (err) {
        logError("[GET /api/counts/days]", err);
        res.status(500).json({ error: "Failed to load convention days." });
      }
    },
  );

  /**
   * GET /api/counts/today
   * Matches today's date (UTC) against convention_days.
   * Returns { day: {...} } when today is a convention day,
   * or { day: null } when it is not.
   *
   * Note: uses UTC date — auto-detect is reliable during convention
   * hours (9 AM+ Eastern) when UTC and Eastern dates always match.
   *
   * @returns {{ day: { id: number, label: string } | null }}
   */
  router.get(
    "/api/counts/today",
    requirePermission("logParkingCount"),
    async (req, res) => {
      try {
        const year = new Date().getFullYear();
        const todayIso = new Date().toISOString().slice(0, 10);
        const day = await getTodayConventionDay(year, todayIso);
        res.json({ day });
      } catch (err) {
        logError("[GET /api/counts/today]", err);
        res.status(500).json({ error: "Failed to detect convention day." });
      }
    },
  );

  /**
   * POST /api/counts/heartbeat
   * Inserts a running count record (is_final = false).
   * Called every 60 seconds by the tally page to keep the DB current.
   *
   * @param {{ locationTaskId: number, conventionDayId: number, count: number }} req.body
   * @returns {{ ok: true }}
   */
  router.post(
    "/api/counts/heartbeat",
    requirePermission("logParkingCount"),
    async (req, res) => {
      try {
        const { locationTaskId, conventionDayId, count, subLocationId } = req.body;

        if (!locationTaskId || !conventionDayId || count == null) {
          return res.status(400).json({ error: "Missing required fields." });
        }

        await insertParkingCount({
          volunteerId:     req.session.userId,
          locationTaskId:  Number(locationTaskId),
          conventionDayId: Number(conventionDayId),
          count:           Number(count),
          isFinal:         false,
          subLocationId:   subLocationId != null ? Number(subLocationId) : null,
        });

        res.json({ ok: true });
      } catch (err) {
        logError("[POST /api/counts/heartbeat]", err);
        res.status(500).json({ error: "Failed to record heartbeat." });
      }
    },
  );

  /**
   * POST /api/counts/submit
   * Inserts a final count record (is_final = true).
   * Called when the volunteer taps Submit. The client resets its local
   * tally to zero and increments its session total after a 200 response.
   *
   * @param {{ locationTaskId: number, conventionDayId: number, count: number }} req.body
   * @returns {{ ok: true }}
   */
  router.post(
    "/api/counts/submit",
    requirePermission("logParkingCount"),
    async (req, res) => {
      try {
        const { locationTaskId, conventionDayId, count, subLocationId } = req.body;

        if (!locationTaskId || !conventionDayId || count == null) {
          return res.status(400).json({ error: "Missing required fields." });
        }

        await insertParkingCount({
          volunteerId:     req.session.userId,
          locationTaskId:  Number(locationTaskId),
          conventionDayId: Number(conventionDayId),
          count:           Number(count),
          isFinal:         true,
          subLocationId:   subLocationId != null ? Number(subLocationId) : null,
        });

        res.json({ ok: true });
      } catch (err) {
        logError("[POST /api/counts/submit]", err);
        res.status(500).json({ error: "Failed to submit count." });
      }
    },
  );

  /**
   * POST /api/counts/manual-submit
   * Records a count entered by the volunteer via other means (is_manual = true).
   * Stored as a final record and does not affect the tap-counter session total.
   *
   * @param {{ locationTaskId: number, conventionDayId: number, count: number }} req.body
   * @returns {{ ok: true }}
   */
  router.post(
    "/api/counts/manual-submit",
    requirePermission("logParkingCount"),
    async (req, res) => {
      try {
        const { locationTaskId, conventionDayId, count } = req.body;

        if (!locationTaskId || !conventionDayId || count == null) {
          return res.status(400).json({ error: "Missing required fields." });
        }

        await insertParkingCount({
          volunteerId:     req.session.userId,
          locationTaskId:  Number(locationTaskId),
          conventionDayId: Number(conventionDayId),
          count:           Number(count),
          isFinal:         true,
          isManual:        true,
          subLocationId:   req.body.subLocationId != null ? Number(req.body.subLocationId) : null,
        });

        res.json({ ok: true });
      } catch (err) {
        logError("[POST /api/counts/manual-submit]", err);
        res.status(500).json({ error: "Failed to submit manual count." });
      }
    },
  );

  /**
   * GET /api/counts/report-data
   * Returns parking count rows bucketed into 15-minute intervals
   * for the oversight Chart.js time-series report.
   *
   * @param {string} req.query.dayId  convention_days.id
   * @returns {{ rows: Array<{
   *   location_task_id: number,
   *   location_name:    string,
   *   capacity:         number | null,
   *   bucket:           string,
   *   total_count:      number,
   * }> }}
   */
  router.get(
    "/api/counts/report-data",
    requirePermission("viewAttendance"),
    async (req, res) => {
      try {
        const dayId = Number(req.query.dayId);

        if (!dayId || !Number.isFinite(dayId)) {
          return res
            .status(400)
            .json({ error: "dayId query parameter is required." });
        }

        const rows = await getParkingCountReportData(dayId);
        res.json({ rows });
      } catch (err) {
        logError("[GET /api/counts/report-data]", err);
        res.status(500).json({ error: "Failed to load report data." });
      }
    },
  );

  /**
   * DELETE /api/counts/location/:locationTaskId?dayId=<id>
   * Hard-deletes all parking_counts for a location on a given convention day.
   * Restricted to ASSISTANT_ADMIN+ via accessAdminConsole permission.
   *
   * @param {string} req.params.locationTaskId  locations_tasks.id
   * @param {string} req.query.dayId            convention_days.id
   * @returns {{ ok: true, rowsDeleted: number }}
   */
  router.delete(
    "/api/counts/location/:locationTaskId",
    requirePermission("accessAdminConsole"),
    async (req, res) => {
      try {
        const locationTaskId  = Number(req.params.locationTaskId);
        const conventionDayId = Number(req.query.dayId);

        if (!locationTaskId || !conventionDayId) {
          return res
            .status(400)
            .json({ error: "locationTaskId and dayId are required." });
        }

        const result = await deleteLocationCounts(locationTaskId, conventionDayId);
        res.json({ ok: true, rowsDeleted: result.rowsDeleted });
      } catch (err) {
        logError("[DELETE /api/counts/location/:locationTaskId]", err);
        res.status(500).json({ error: "Failed to reset counts." });
      }
    },
  );

  /**
   * GET /api/counts/sub-locations?locationTaskId=X
   * Returns active sub-locations for the given location.
   * An empty array means no sub-locations are configured; the tally
   * page hides the picker and proceeds without a sub-location.
   *
   * @param {string} req.query.locationTaskId  locations_tasks.id
   * @returns {{ subLocations: Array<{ id: number, name: string, sub_type_name: string|null }> }}
   */
  router.get(
    "/api/counts/sub-locations",
    requirePermission("logParkingCount"),
    async (req, res) => {
      try {
        const locationTaskId = Number(req.query.locationTaskId);
        if (!locationTaskId) {
          return res.status(400).json({ error: "locationTaskId is required." });
        }
        const subLocations = await getActiveSubLocationsForLocation(locationTaskId);
        res.json({ subLocations });
      } catch (err) {
        logError("[GET /api/counts/sub-locations]", err);
        res.status(500).json({ error: "Failed to load sub-locations." });
      }
    },
  );

  return router;
}
