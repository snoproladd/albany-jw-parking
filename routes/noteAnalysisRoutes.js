/**
 * @file routes/noteAnalysisRoutes.js
 * @description Routes for AI-powered volunteer intake note analysis.
 *
 * Provides endpoints to trigger analysis for individual volunteers or in
 * batch, retrieve cached results, and accept AI-suggested action items into
 * volunteer_actions for overseer follow-through.
 *
 * Route permission levels:
 *  - GET  analysis/:volunteerId        — viewVolunteerInfo (OVERSEER+)
 *  - POST analyze/batch                — deleteVolunteer   (ASSISTANT_ADMIN+)
 *  - POST analyze/:volunteerId         — viewVolunteerInfo (OVERSEER+)
 *  - POST analysis/:id/accept-action   — editVolunteerInfo (OVERSEER+)
 *
 * @module routes/noteAnalysisRoutes
 */

import express from "express";
import * as db from "../lib/dbSync.js";
import { analyzeNote, computeNoteHash } from "../lib/noteAnalyzer.js";
import { requirePermission } from "../src/config/roles.js";

/** Milliseconds a cached analysis is considered fresh (note hash unchanged). */
const ANALYSIS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Delay between calls in a batch run to avoid rate-limit spikes. */
const BATCH_DELAY_MS = 500;

/**
 * Pause execution for the given number of milliseconds.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates and returns the note analysis Express router.
 *
 * @param {{
 *   csrfProtection: import('express').RequestHandler,
 *   logError: Function,
 * }} opts
 * @returns {import('express').Router}
 */
export function noteAnalysisRouter({ csrfProtection, logError }) {
  const router = express.Router();

  /**
   * Middleware: require an authenticated session.
   * Returns 401 JSON (not a redirect) since all routes here are JSON APIs.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  function requireAuth(req, res, next) {
    if (!req.session.userId) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated." });
    }
    next();
  }

  // ─── GET /api/notes/analysis/:volunteerId ─────────────────────────────────

  /**
   * Returns the most recent AI analysis for a volunteer, or null if none
   * exists. Includes an isStale flag when the live note has changed since
   * the snapshot was taken.
   */
  router.get(
    "/api/notes/analysis/:volunteerId",
    requireAuth,
    requirePermission("viewVolunteerInfo"),
    async (req, res) => {
      const volunteerId = Number(req.params.volunteerId);
      if (!Number.isInteger(volunteerId) || volunteerId <= 0) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid volunteer ID." });
      }

      try {
        const [analysis, volunteer] = await Promise.all([
          db.getVolunteerNoteAnalysis(volunteerId),
          db.getVolunteerById(volunteerId),
        ]);

        if (!analysis) {
          return res.json({ success: true, data: null });
        }

        const currentHash = computeNoteHash(volunteer?.notes ?? "");
        const isStale = currentHash !== analysis.note_hash;

        return res.json({ success: true, data: { ...analysis, isStale } });
      } catch (err) {
        logError("GET /api/notes/analysis/:volunteerId", err);
        return res
          .status(500)
          .json({ success: false, message: "Failed to retrieve analysis." });
      }
    },
  );

  // ─── POST /api/notes/analyze/batch ───────────────────────────────────────
  // MUST be registered before /:volunteerId to prevent "batch" matching as a
  // volunteerId parameter.

  /**
   * Analyzes all volunteers with non-empty notes that are either unanalyzed
   * or stale (note has changed since last analysis). Restricted to
   * ASSISTANT_ADMIN+ (deleteVolunteer permission) due to cost and scope.
   * Runs sequentially with a short delay between calls.
   */
  router.post(
    "/api/notes/analyze/batch",
    requireAuth,
    requirePermission("deleteVolunteer"),
    async (req, res) => {
      const analyzedBy = req.session.userId;

      try {
        const volunteers = await db.getVolunteersWithUnanalyzedNotes();

        if (volunteers.length === 0) {
          return res.json({
            success: true,
            data: { analyzed: 0, failed: 0, total: 0 },
          });
        }

        let analyzed = 0;
        let failed = 0;

        for (const volunteer of volunteers) {
          try {
            const result = await analyzeNote(
              volunteer.id,
              volunteer.first_name,
              volunteer.last_name,
              volunteer.notes,
            );

            const analysisId = await db.insertNoteAnalysis({
              volunteerId: volunteer.id,
              noteTextSnapshot: volunteer.notes,
              noteHash: volunteer.current_hash,
              analyzedBy,
              model: "gpt-4o",
              promptTokens: result.promptTokens,
              completionTokens: result.completionTokens,
              summary: result.summary,
              category: result.category,
              actionItems: result.actionItems,
              suggestedBlackouts: result.suggestedBlackouts,
              flags: result.flags,
              rawResponse: result.rawResponse,
              error: result.error,
            });

            // Persist AI-suggested blackouts as pending scheduling constraints.
            if (Array.isArray(result.suggestedBlackouts) && result.suggestedBlackouts.length > 0) {
              const year = new Date().getFullYear();
              await db.clearUnappliedIntakeNoteSuggestions(volunteerId);
              for (const b of result.suggestedBlackouts) {
                try {
                  const resolved = await db.resolveBlackoutHints(b.dayHint, b.timeHint, b.type, year);
                  await db.createAiBlackoutSuggestion({
                    volunteerId:     volunteer.id,
                    sourceType:      "intake_note",
                    sourceId:        analysisId,
                    blackoutType:    b.type        || "Custom",
                    description:     b.description || "",
                    dayHint:         b.dayHint     || null,
                    timeHint:        b.timeHint    || null,
                    conventionDayId: resolved.conventionDayId,
                    startMins:       resolved.startMins,
                    endMins:         resolved.endMins,
                  });
                } catch (sugErr) {
                  logError(`createAiBlackoutSuggestion (batch, vol ${volunteer.id}):`, sugErr);
                }
              }
            }

            analyzed++;
          } catch (err) {
            logError(`Batch analyze — volunteer ${volunteer.id}`, err);
            failed++;
          }

          await sleep(BATCH_DELAY_MS);
        }

        return res.json({
          success: true,
          data: { analyzed, failed, total: volunteers.length },
        });
      } catch (err) {
        logError("POST /api/notes/analyze/batch", err);
        return res
          .status(500)
          .json({ success: false, message: "Batch analysis failed." });
      }
    },
  );

  // ─── POST /api/notes/analyze/:volunteerId ─────────────────────────────────

  /**
   * Triggers on-demand AI analysis for a single volunteer's note.
   * Returns a cached result if the note hash matches and the analysis is
   * less than 24 hours old, without making a new API call.
   */
  router.post(
    "/api/notes/analyze/:volunteerId",
    requireAuth,
    requirePermission("viewVolunteerInfo"),
    async (req, res) => {
      const volunteerId = Number(req.params.volunteerId);
      const analyzedBy = req.session.userId;

      if (!Number.isInteger(volunteerId) || volunteerId <= 0) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid volunteer ID." });
      }

      try {
        const volunteer = await db.getVolunteerById(volunteerId);
        if (!volunteer) {
          return res
            .status(404)
            .json({ success: false, message: "Volunteer not found." });
        }

        const noteText = volunteer.notes ?? "";
        const currentHash = computeNoteHash(noteText);

        if (!noteText.trim()) {
          return res.status(400).json({
            success: false,
            message: "This volunteer has no note to analyze.",
          });
        }

        // Return cached result when note is unchanged and analysis is fresh.
        const existing = await db.getVolunteerNoteAnalysis(volunteerId);
        if (existing && existing.note_hash === currentHash) {
          const ageMs = Date.now() - new Date(existing.analyzed_at).getTime();
          if (ageMs < ANALYSIS_CACHE_TTL_MS) {
            return res.json({
              success: true,
              data: { ...existing, isStale: false, cached: true },
            });
          }
        }

        const result = await analyzeNote(
          volunteerId,
          volunteer.firstName,
          volunteer.lastName,
          noteText,
        );

        await db.insertNoteAnalysis({
          volunteerId,
          noteTextSnapshot: noteText,
          noteHash: currentHash,
          analyzedBy,
          model: "gpt-4o",
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          summary: result.summary,
          category: result.category,
          actionItems: result.actionItems,
          suggestedBlackouts: result.suggestedBlackouts,
          flags: result.flags,
          rawResponse: result.rawResponse,
          error: result.error,
        });

        const saved     = await db.getVolunteerNoteAnalysis(volunteerId);
        const analysisId = saved?.id;

        // Persist AI-suggested blackouts as pending scheduling constraints.
        if (analysisId && Array.isArray(result.suggestedBlackouts) && result.suggestedBlackouts.length > 0) {
          const year = new Date().getFullYear();
          await db.clearUnappliedIntakeNoteSuggestions(volunteerId);
          for (const b of result.suggestedBlackouts) {
            try {
              const resolved = await db.resolveBlackoutHints(b.dayHint, b.timeHint, b.type, year);
              await db.createAiBlackoutSuggestion({
                volunteerId,
                sourceType:      "intake_note",
                sourceId:        analysisId,
                blackoutType:    b.type        || "Custom",
                description:     b.description || "",
                dayHint:         b.dayHint     || null,
                timeHint:        b.timeHint    || null,
                conventionDayId: resolved.conventionDayId,
                startMins:       resolved.startMins,
                endMins:         resolved.endMins,
              });
            } catch (sugErr) {
              logError("createAiBlackoutSuggestion (single analyze):", sugErr);
            }
          }
        }

        return res.json({
          success: true,
          data: { ...saved, isStale: false, cached: false },
        });
      } catch (err) {
        logError("POST /api/notes/analyze/:volunteerId", err);
        return res
          .status(500)
          .json({ success: false, message: "Analysis failed." });
      }
    },
  );

  // ─── POST /api/notes/analysis/:analysisId/accept-action ──────────────────

  /**
   * Accepts one AI-suggested action item and saves it to volunteer_actions
   * with source_type='ai_analysis'. The client passes the volunteerId and
   * the action description text to persist.
   */
  router.post(
    "/api/notes/analysis/:analysisId/accept-action",
    requireAuth,
    requirePermission("editVolunteerInfo"),
    async (req, res) => {
      const analysisId = Number(req.params.analysisId);
      const createdBy = req.session.userId;
      const { volunteerId, description } = req.body ?? {};

      if (!Number.isInteger(analysisId) || analysisId <= 0) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid analysis ID." });
      }
      if (!volunteerId || !description?.trim()) {
        return res.status(400).json({
          success: false,
          message: "volunteerId and description are required.",
        });
      }

      try {
        const actionId = await db.insertAiActionItem(
          Number(volunteerId),
          description.trim(),
          analysisId,
          createdBy,
        );
        return res.json({ success: true, data: { actionId } });
      } catch (err) {
        logError("POST /api/notes/analysis/:analysisId/accept-action", err);
        return res
          .status(500)
          .json({ success: false, message: "Failed to save action item." });
      }
    },
  );

  return router;
}
