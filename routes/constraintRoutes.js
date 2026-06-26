/**
 * @file routes/constraintRoutes.js
 * @description REST endpoints for AI-suggested scheduling constraints.
 *
 * GET  /api/constraints/:volunteerId
 *   Returns all pending (unapplied) blackout suggestions for a volunteer,
 *   plus the convention day+session list for building the Apply form.
 *
 * POST /api/constraints/:volunteerId/interpret
 *   Runs AI interpretation of overseer-entered free text.
 *   Returns a structured suggestion — does NOT save it to the database.
 *
 * POST /api/constraints/:volunteerId/suggestions
 *   Saves a confirmed interpreted suggestion to ai_blackout_suggestions.
 *
 * POST /api/constraints/:volunteerId/suggestions/:id/apply
 *   Applies a suggestion: creates a volunteer_blackouts row (additive) and
 *   marks the suggestion applied. Requires CSRF token.
 *
 * Access: OVERSEER+ (editVolunteerInfo permission).
 *
 * @module routes/constraintRoutes
 */

import express from "express";
import * as db from "../lib/dbSync.js";
import { requirePermission } from "../src/config/roles.js";
import {
  interpretConstraint,
  buildDayContext,
} from "../lib/constraintInterpreter.js";

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

  // ── POST /api/constraints/:volunteerId/interpret ───────────────────────────

  /**
   * Interprets overseer free text and returns a structured suggestion.
   * Does NOT save to the database — the client confirms before saving.
   *
   * Body: { text: string }
   * Response: { suggestion: { blackoutType, description, dayHint, timeHint,
   *                           startMins, endMins, error } }
   */
  router.post(
    "/api/constraints/:volunteerId/interpret",
    requireAuth,
    requirePermission("editVolunteerInfo"),
    async (req, res) => {
      const volunteerId = parseInt(req.params.volunteerId, 10);
      if (!volunteerId)
        return res.status(400).json({ error: "Invalid volunteer ID." });

      const text = String(req.body?.text || "").trim();
      if (!text) return res.status(400).json({ error: "text is required." });

      try {
        const [volunteer, days] = await Promise.all([
          db.getVolunteerById(volunteerId),
          db.getConventionDaysWithSessions(),
        ]);

        if (!volunteer)
          return res.status(404).json({ error: "Volunteer not found." });

        const dayContext = buildDayContext(days);
        const suggestion = await interpretConstraint(
          text,
          volunteer.firstName || "",
          volunteer.lastName || "",
          dayContext,
        );

        if (suggestion.error) {
          return res.status(502).json({
            error: "AI interpretation failed.",
            aiError: suggestion.error,
            suggestion: null,
          });
        }

        // Attempt day resolution if dayHint came back from the AI
        let conventionDayId = null;
        if (suggestion.dayHint) {
          const year = new Date().getFullYear();
          const resolved = await db.resolveBlackoutHints(
            suggestion.dayHint,
            suggestion.timeHint,
            suggestion.blackoutType,
            year,
          );
          conventionDayId = resolved.conventionDayId;
          // If AI already returned specific start/end, prefer those
          if (suggestion.startMins == null)
            suggestion.startMins = resolved.startMins;
          if (suggestion.endMins == null) suggestion.endMins = resolved.endMins;
        }

        return res.json({
          suggestion: {
            ...suggestion,
            conventionDayId,
          },
        });
      } catch (err) {
        (logError || console.error)(
          "POST /api/constraints/:volunteerId/interpret error:",
          err,
        );
        return res.status(500).json({ error: "Interpretation failed." });
      }
    },
  );

  // ── POST /api/constraints/:volunteerId/suggestions ─────────────────────────

  /**
   * Saves an overseer-confirmed interpreted suggestion to ai_blackout_suggestions.
   *
   * Body: { blackoutType, description, dayHint, timeHint,
   *         conventionDayId?, startMins?, endMins? }
   * Response: { success: true, id: number }
   */
  router.post(
    "/api/constraints/:volunteerId/suggestions",
    requireAuth,
    requirePermission("editVolunteerInfo"),
    async (req, res) => {
      const volunteerId = parseInt(req.params.volunteerId, 10);
      if (!volunteerId)
        return res.status(400).json({ error: "Invalid volunteer ID." });

      const {
        blackoutType,
        description,
        dayHint,
        timeHint,
        conventionDayId,
        startMins,
        endMins,
      } = req.body ?? {};

      if (!blackoutType || !description?.trim()) {
        return res
          .status(400)
          .json({ error: "blackoutType and description are required." });
      }

      try {
        const id = await db.createAiBlackoutSuggestion({
          volunteerId,
          sourceType: "overseer",
          sourceId: null,
          blackoutType,
          description: description.trim(),
          dayHint: dayHint ?? null,
          timeHint: timeHint ?? null,
          conventionDayId: conventionDayId ?? null,
          startMins: startMins ?? null,
          endMins: endMins ?? null,
        });

        return res.json({ success: true, id });
      } catch (err) {
        (logError || console.error)(
          "POST /api/constraints/:volunteerId/suggestions error:",
          err,
        );
        return res.status(500).json({ error: "Failed to save suggestion." });
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
