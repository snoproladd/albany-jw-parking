/**
 * @fileoverview routes/blackoutRoutes.js
 * REST endpoints for the BlackoutTimeline component.
 *
 * GET  /api/blackouts/:volunteerId
 *   Returns the full timeline payload (days + sessions + existing blackouts)
 *   used to hydrate the BlackoutTimeline component.
 *
 * POST /api/blackouts/:volunteerId
 *   Replaces all blackout rows for the volunteer with the supplied array.
 *
 * Access rules — either condition grants access:
 *   • The caller has the editVolunteerInfo permission (OVERSEER+).
 *   • The caller IS the volunteer (self-service via myAccount).
 *
 * @module routes/blackoutRoutes
 */

"use strict";

import express from "express";
import * as db from "../lib/dbSync.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { sessionHasPermission } from "../lib/positions.js";

/**
 * Creates and returns the blackout Express router.
 *
 * @param {{
 *   csrfProtection: import('express').RequestHandler,
 *   logError: Function,
 * }} opts
 * @returns {import('express').Router}
 */
export function blackoutRouter({ csrfProtection, logError }) {
  const router = express.Router();

  // ── Auth helpers ──────────────────────────────────────────────────────────

  /**
   * Require an authenticated session.  Returns 401 JSON (not a redirect)
   * because all routes here are JSON APIs.
   *
   * @type {import('express').RequestHandler}
   */
  function requireAuth(req, res, next) {
    if (!req.session.userId) {
      return res
        .status(401)
        .json({ success: false, error: "Not authenticated." });
    }
    next();
  }

  /**
   * Blackout access (phase 3d-4): your own blackouts need
   * self.manageBlackouts; anyone else's need volunteers.edit or
   * scheduler.use. requirePermission() on each route lets in anyone holding
   * one of the three; this check then refuses someone who only holds
   * self.manageBlackouts but asked for another volunteer.
   * Returns 403 JSON on failure.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   * @returns {void}
   */
  function requireBlackoutTarget(req, res, next) {
    const targetId = parseInt(req.params.volunteerId, 10);
    const isSelf = req.session.userId === targetId;
    const canOthers =
      sessionHasPermission(req.session, "volunteers.edit") ||
      sessionHasPermission(req.session, "scheduler.use");

    if (isSelf ? sessionHasPermission(req.session, "self.manageBlackouts") || canOthers : canOthers) {
      return next();
    }
    return res.status(403).json({ success: false, error: "Access denied." });
  }

  // ── GET /api/blackouts/:volunteerId ───────────────────────────────────────

  /**
   * Return the full BlackoutTimeline payload for a volunteer.
   *
   * Response shape:
   * {
   *   volunteerId: number,
   *   days:        Array<{ id, label, date }>,
   *   sessions:    Record<dayId, Array<{ id, label, session_order, startMin, endMin }>>,
   *   blackouts:   Array<{ id, conventionDayId, startMins, endMins, reason }>
   * }
   */
  router.get(
    "/api/blackouts/:volunteerId",
    requireAuth,
    requirePermission("self.manageBlackouts", "volunteers.edit", "scheduler.use"),
    requireBlackoutTarget,
    async (req, res) => {
      const targetId = parseInt(req.params.volunteerId, 10);
      try {
        const [days, blackouts] = await Promise.all([
          db.getConventionDaysWithSessions(),
          db.getVolunteerBlackouts(targetId),
        ]);

        const sessionMap = {};
        for (const day of days) {
          sessionMap[day.id] = day.sessions;
        }

        return res.json({
          volunteerId: targetId,
          days: days.map(({ id, label, convention_date }) => ({
            id,
            label,
            date: convention_date,
          })),
          sessions: sessionMap,
          blackouts,
        });
      } catch (err) {
        (logError || console.error)("[blackoutRoutes] GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  // ── POST /api/blackouts/:volunteerId ──────────────────────────────────────

  /**
   * Replace all blackout rows for a volunteer.
   *
   * Body: { blackouts: Array<{ conventionDayId, startMins, endMins, reason? }> }
   * Response: { success: boolean, count: number }
   */
  router.post(
    "/api/blackouts/:volunteerId",
    requireAuth,
    requirePermission("self.manageBlackouts", "volunteers.edit", "scheduler.use"),
    requireBlackoutTarget,
    csrfProtection,
    async (req, res) => {
      const targetId = parseInt(req.params.volunteerId, 10);
      const { blackouts } = req.body || {};

      if (!Array.isArray(blackouts)) {
        return res
          .status(400)
          .json({ success: false, error: "`blackouts` must be an array." });
      }

      for (const b of blackouts) {
        if (
          !Number.isInteger(b.conventionDayId) ||
          !Number.isInteger(b.startMins) ||
          !Number.isInteger(b.endMins) ||
          b.startMins < 0 ||
          b.endMins > 1440 ||
          b.startMins >= b.endMins
        ) {
          return res
            .status(400)
            .json({
              success: false,
              error: "Invalid blackout entry.",
              entry: b,
            });
        }
      }

      try {
        const createdBy = req.session.userEmail || String(req.session.userId);
        await db.saveVolunteerBlackouts(targetId, blackouts, createdBy);
        return res.json({ success: true, count: blackouts.length });
      } catch (err) {
        (logError || console.error)("[blackoutRoutes] POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  return router;
}
