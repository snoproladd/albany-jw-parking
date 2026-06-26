/**
 * @file routes/scheduleAnalysisRoutes.js
 * @description REST endpoints for the schedule violation analysis feature.
 *
 * POST /api/schedule/analyze
 *   Triggers a full analysis run. Returns cached result if schedule is
 *   unchanged unless `force: true` is passed in the body.
 *
 * GET  /api/schedule/violations
 *   Returns the most recent run and its violations.
 *
 * PATCH /api/schedule/violations/:id/acknowledge
 *   Marks a violation acknowledged.
 *
 * PATCH /api/schedule/violations/:id/response
 *   Saves the overseer's response to an AI question.
 *
 * POST  /api/schedule/violations/:id/reanalyze
 *   Runs a targeted AI re-analysis on a single violation incorporating
 *   the overseer's response. Replaces ai_suggestion/ai_question in place.
 *
 * @module routes/scheduleAnalysisRoutes
 */

import express from "express";
import { requirePermission } from "../src/config/roles.js";
import {
  analyzeSchedule,
  reanalyzeViolation,
} from "../lib/scheduleAnalyzer.js";
import * as db from "../lib/dbSync.js";

/**
 * @param {{ logError: Function }} opts
 * @returns {import("express").Router}
 */
export function scheduleAnalysisRouter({ csrfProtection, logError }) {
  const router = express.Router();

  function requireAuth(req, res, next) {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated." });
    }
    next();
  }

  // ── POST /api/schedule/analyze ─────────────────────────────────────────────

  /**
   * Triggers a full analysis. Honors the schedule hash cache unless
   * body.force = true.
   *
   * Response: { runId, isNew, isUnchanged, violations, run }
   */
  router.post(
    "/api/schedule/analyze",
    requireAuth,
    requirePermission("createAssignments"),
    async (req, res) => {
      try {
        const year = new Date().getFullYear();
        const force = req.body?.force === true;
        const [result, rules] = await Promise.all([
          analyzeSchedule({ year, triggeredBy: req.session.userId, force }),
          db.getScheduleAnalysisRules({ activeOnly: true }),
        ]);
        return res.json({ success: true, ...result, rules });
      } catch (err) {
        (logError || console.error)("POST /api/schedule/analyze error:", err);
        return res.status(500).json({ error: "Analysis failed." });
      }
    },
  );

  // ── GET /api/schedule/violations ───────────────────────────────────────────

  /**
   * Returns the most recent run and its violations for the current year.
   * Response: { run, violations }
   */
  router.get(
    "/api/schedule/violations",
    requireAuth,
    requirePermission("createAssignments"),
    async (req, res) => {
      try {
        const year = new Date().getFullYear();
        const [result, rules] = await Promise.all([
          db.getLatestScheduleViolationRun(year),
          db.getScheduleAnalysisRules({ activeOnly: true }),
        ]);
        if (!result) return res.json({ run: null, violations: [], rules });
        return res.json({
          run: result,
          violations: result.violations || [],
          rules,
        });
      } catch (err) {
        (logError || console.error)("GET /api/schedule/violations error:", err);
        return res.status(500).json({ error: "Failed to fetch violations." });
      }
    },
  );

  // ── PATCH /api/schedule/violations/:id/acknowledge ─────────────────────────

  router.patch(
    "/api/schedule/violations/:id/acknowledge",
    requireAuth,
    requirePermission("createAssignments"),
    async (req, res) => {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: "Invalid ID." });
      try {
        await db.acknowledgeScheduleViolation(id, req.session.userId);
        return res.json({ ok: true });
      } catch (err) {
        (logError || console.error)(
          "PATCH violations/:id/acknowledge error:",
          err,
        );
        return res.status(500).json({ error: "Failed to acknowledge." });
      }
    },
  );

  // ── PATCH /api/schedule/violations/:id/response ────────────────────────────

  /**
   * Saves the overseer's response to an AI question.
   * Body: { response: string }
   */
  router.patch(
    "/api/schedule/violations/:id/response",
    requireAuth,
    requirePermission("createAssignments"),
    async (req, res) => {
      const id = parseInt(req.params.id, 10);
      const response = String(req.body?.response || "").trim();
      if (!id) return res.status(400).json({ error: "Invalid ID." });
      if (!response)
        return res.status(400).json({ error: "response is required." });
      try {
        await db.saveViolationOverseerResponse(id, response);
        return res.json({ ok: true });
      } catch (err) {
        (logError || console.error)(
          "PATCH violations/:id/response error:",
          err,
        );
        return res.status(500).json({ error: "Failed to save response." });
      }
    },
  );

  // ── POST /api/schedule/violations/reanalyze-by-question ───────────────────
  // Must be registered before /:id/reanalyze to prevent Express treating
  // "reanalyze-by-question" as a numeric ID parameter.

  /**
   * Re-analyzes all violations in a run that share the same ai_question,
   * incorporating the overseer's response and the current active rule set.
   * Called after an overseer adds a response as a new standing rule.
   *
   * Body: { runId: number, aiQuestion: string }
   */
  router.post(
    "/api/schedule/violations/reanalyze-by-question",
    requireAuth,
    requirePermission("createAssignments"),
    async (req, res) => {
      const runId = parseInt(req.body?.runId, 10);
      const aiQuestion = String(req.body?.aiQuestion || "").trim();
      if (!runId || !aiQuestion) {
        return res
          .status(400)
          .json({ error: "runId and aiQuestion are required." });
      }
      try {
        const siblings = await db.getViolationsByQuestion(runId, aiQuestion);
        let updated = 0;
        for (const v of siblings) {
          if (!v.overseer_response) continue;
          const result = await reanalyzeViolation({
            violationDescription: v.description,
            originalAiQuestion: v.ai_question,
            overseerResponse: v.overseer_response,
            volunteerName: v.volunteer_name ?? null,
            dayLabel: v.day_label ?? null,
          });
          await db.updateViolationAiResult(v.id, result);
          updated++;
        }
        return res.json({ ok: true, updated });
      } catch (err) {
        (logError || console.error)(
          "POST /api/schedule/violations/reanalyze-by-question error:",
          err,
        );
        return res.status(500).json({ error: "Bulk re-analysis failed." });
      }
    },
  );

  // ── POST /api/schedule/violations/:id/reanalyze ────────────────────────────

  /**
   * Targeted AI re-analysis for a single violation.
   * Requires the violation to have an overseer_response already saved.
   * Replaces ai_suggestion, ai_question, confidence in place.
   *
   * Response: { ok: true, aiSuggestion, aiQuestion, confidence }
   */
  router.post(
    "/api/schedule/violations/:id/reanalyze",
    requireAuth,
    requirePermission("createAssignments"),
    async (req, res) => {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: "Invalid ID." });
      try {
        const violation = await db.getScheduleViolationById(id);
        if (!violation)
          return res.status(404).json({ error: "Violation not found." });

        if (!violation.overseer_response) {
          return res.status(400).json({
            error: "Save an overseer response before re-analyzing.",
          });
        }

        const result = await reanalyzeViolation({
          violationDescription: violation.description,
          originalAiQuestion: violation.ai_question,
          overseerResponse: violation.overseer_response,
          volunteerName: violation.volunteer_name ?? null,
          dayLabel: violation.day_label ?? null,
        });

        await db.updateViolationAiResult(id, result);

        return res.json({ ok: true, ...result });
      } catch (err) {
        (logError || console.error)(
          "POST violations/:id/reanalyze error:",
          err,
        );
        return res.status(500).json({ error: "Re-analysis failed." });
      }
    },
  );

  // ── GET /oversight/tools/schedule-rules ───────────────────────────────────

  router.get(
    "/oversight/tools/schedule-rules",
    requireAuth,
    requirePermission("deleteVolunteer"), // ADMIN only
    csrfProtection,
    async (req, res) => {
      try {
        return res.render("authentication_and_accounts/scheduleRules", {
          csrfToken: req.csrfToken(),
        });
      } catch (err) {
        (logError || console.error)(
          "GET /oversight/tools/schedule-rules error:",
          err,
        );
        return res.status(500).send("Server error.");
      }
    },
  );

  // ── GET /api/schedule/rules ───────────────────────────────────────────────

  router.get(
    "/api/schedule/rules",
    requireAuth,
    requirePermission("deleteVolunteer"),
    async (req, res) => {
      try {
        const rules = await db.getScheduleAnalysisRules();
        return res.json({ rules });
      } catch (err) {
        (logError || console.error)("GET /api/schedule/rules error:", err);
        return res.status(500).json({ error: "Failed to fetch rules." });
      }
    },
  );

  // ── POST /api/schedule/rules ──────────────────────────────────────────────

  router.post(
    "/api/schedule/rules",
    requireAuth,
    requirePermission("deleteVolunteer"),
    async (req, res) => {
      const ruleText = String(req.body?.ruleText || "").trim();
      const sortOrder = parseInt(req.body?.sortOrder, 10) || 0;
      if (!ruleText)
        return res.status(400).json({ error: "ruleText is required." });
      try {
        const id = await db.createScheduleAnalysisRule({
          ruleText,
          sortOrder,
          createdBy: req.session.userId,
        });
        return res.json({ success: true, id });
      } catch (err) {
        (logError || console.error)("POST /api/schedule/rules error:", err);
        return res.status(500).json({ error: "Failed to create rule." });
      }
    },
  );

  // ── PATCH /api/schedule/rules/:id ─────────────────────────────────────────

  router.patch(
    "/api/schedule/rules/:id",
    requireAuth,
    requirePermission("deleteVolunteer"),
    async (req, res) => {
      const id = parseInt(req.params.id, 10);
      const ruleText =
        req.body?.ruleText != null
          ? String(req.body.ruleText).trim()
          : undefined;
      const sortOrder =
        req.body?.sortOrder != null
          ? parseInt(req.body.sortOrder, 10)
          : undefined;
      if (!id) return res.status(400).json({ error: "Invalid ID." });
      try {
        await db.updateScheduleAnalysisRule({
          id,
          ruleText,
          sortOrder,
          updatedBy: req.session.userId,
        });
        return res.json({ ok: true });
      } catch (err) {
        (logError || console.error)(
          "PATCH /api/schedule/rules/:id error:",
          err,
        );
        return res.status(500).json({ error: "Failed to update rule." });
      }
    },
  );

  // ── PATCH /api/schedule/rules/:id/toggle ──────────────────────────────────

  router.patch(
    "/api/schedule/rules/:id/toggle",
    requireAuth,
    requirePermission("deleteVolunteer"),
    async (req, res) => {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: "Invalid ID." });
      try {
        await db.toggleScheduleAnalysisRule(id);
        return res.json({ ok: true });
      } catch (err) {
        (logError || console.error)(
          "PATCH /api/schedule/rules/:id/toggle error:",
          err,
        );
        return res.status(500).json({ error: "Failed to toggle rule." });
      }
    },
  );

  // ── DELETE /api/schedule/rules/:id ───────────────────────────────────────

  router.delete(
    "/api/schedule/rules/:id",
    requireAuth,
    requirePermission("deleteVolunteer"),
    async (req, res) => {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: "Invalid ID." });
      try {
        await db.deleteScheduleAnalysisRule(id);
        return res.json({ ok: true });
      } catch (err) {
        (logError || console.error)(
          "DELETE /api/schedule/rules/:id error:",
          err,
        );
        return res.status(500).json({ error: "Failed to delete rule." });
      }
    },
  );

  return router;
}
