/**
 * @file routes/constraintRoutes.js
 * @description REST endpoints for AI-suggested scheduling constraints.
 *
 * GET  /api/constraints/:volunteerId
 *   Returns all pending (unapplied) blackout suggestions for a volunteer,
 *   plus the convention day+session list for building the Apply form.
 *
 * POST /api/constraints/:volunteerId/suggestions/:id/apply
 *   Applies a suggestion: creates a volunteer_blackouts row (additive) and
 *   marks the suggestion applied. Requires CSRF token.
 *
 * DELETE /api/constraints/:volunteerId/suggestions/:id
 *   Dismisses a single unapplied suggestion (duplicate or incorrect).
 *
 * Access: OVERSEER+ (editVolunteerInfo permission).
 *
 * @module routes/constraintRoutes
 */

import express from "express";
import * as db from "../lib/dbSync.js";
import { requirePermission } from "../src/config/roles.js";

/**
 * Creates and returns the constraint Express router.
 *
 * @param {{
 *   csrfProtection: import('express').RequestHandler,
 *   logError:       Function,
 * }} opts
 * @returns {import('express').Router}
 */
export function constraintRouter({ csrfProtection, logError }) {
  const router = express.Router();

  // ── Auth helpers ──────────────────────────────────────────────────────────

  /**
   * Require an authenticated session.
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

  // ── GET /api/constraints/:volunteerId ──────────────────────────────────────

  /**
   * Returns pending suggestions and convention days for the Apply form.
   *
   * Response:
   * {
   *   suggestions: Array<{ id, source_type, blackout_type, description,
   *                        day_hint, time_hint, convention_day_id, day_label,
   *                        start_mins, end_mins, created_at }>,
   *   days: Array<{ id, label, sessions: Array<{ id, label, startMin, endMin }> }>
   * }
   */
  router.get(
    "/api/constraints/:volunteerId",
    requireAuth,
    requirePermission("editVolunteerInfo"),
    async (req, res) => {
      const volunteerId = parseInt(req.params.volunteerId, 10);
      if (!volunteerId)
        return res.status(400).json({ error: "Invalid volunteer ID." });

      try {
        const [suggestions, days] = await Promise.all([
          db.getVolunteerPendingConstraints(volunteerId),
          db.getConventionDaysWithSessions(),
        ]);

        return res.json({ suggestions, days });
      } catch (err) {
        (logError || console.error)(
          "GET /api/constraints/:volunteerId error:",
          err,
        );
        return res.status(500).json({ error: "Failed to fetch constraints." });
      }
    },
  );

  // ── POST /api/constraints/:volunteerId/suggestions/:id/apply ──────────────

  /**
   * Applies a pending suggestion: creates a volunteer_blackouts row (additive)
   * and marks the suggestion applied.
   *
   * Body: { conventionDayId: number, startMins: number, endMins: number, reason?: string }
   * Response: { success: true, blackoutId: number }
   */
  router.post(
    "/api/constraints/:volunteerId/suggestions/:id/apply",
    requireAuth,
    requirePermission("editVolunteerInfo"),
    csrfProtection,
    async (req, res) => {
      const volunteerId = parseInt(req.params.volunteerId, 10);
      const suggestionId = parseInt(req.params.id, 10);
      const conventionDayId = parseInt(req.body?.conventionDayId, 10);
      const startMins = parseInt(req.body?.startMins, 10);
      const endMins = parseInt(req.body?.endMins, 10);
      const reason = String(req.body?.reason || "").trim() || null;

      if (!volunteerId || !suggestionId) {
        return res.status(400).json({ error: "Invalid IDs." });
      }
      if (!conventionDayId || isNaN(startMins) || isNaN(endMins)) {
        return res.status(400).json({
          error: "conventionDayId, startMins, and endMins are required.",
        });
      }
      if (startMins < 0 || endMins > 1440 || startMins >= endMins) {
        return res.status(400).json({ error: "Invalid time range." });
      }

      try {
        const { blackoutId } = await db.applyBlackoutSuggestion({
          suggestionId,
          volunteerId,
          conventionDayId,
          startMins,
          endMins,
          reason,
          appliedBy: req.session.userId,
        });

        return res.json({ success: true, blackoutId });
      } catch (err) {
        (logError || console.error)(
          "POST /api/constraints/:volunteerId/suggestions/:id/apply error:",
          err,
        );
        return res.status(500).json({ error: "Failed to apply suggestion." });
      }
    },
  );

  // ── DELETE /api/constraints/:volunteerId/suggestions/:id ───────────────────

    /**
     * Deletes a single unapplied blackout suggestion.
     * Used to dismiss duplicates or incorrect AI suggestions from the panel.
     * Only succeeds if the suggestion is unapplied (applied = 0 guard in dbSync).
     */
    router.delete(
        "/api/constraints/:volunteerId/suggestions/:id",
        requireAuth,
        requirePermission("editVolunteerInfo"),
        async (req, res) => {
            const id = parseInt(req.params.id, 10);
            if (!id) return res.status(400).json({ error: "Invalid suggestion ID." });
            try {
                await db.deleteBlackoutSuggestion(id);
                return res.json({ ok: true });
            } catch (err) {
                (logError || console.error)(
                    "DELETE /api/constraints/:volunteerId/suggestions/:id error:", err,
                );
                return res.status(500).json({ error: "Failed to delete suggestion." });
            }
        },
    );

    return router;
}
