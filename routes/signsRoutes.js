/**
 * @file routes/signsRoutes.js
 * @description Routes for the Sign Library and Sign Builder.
 *
 * Signs are reusable templates (text + optional arrow direction). Each
 * template can be placed in multiple geographic locations as a
 * sign_placement (Phase 2 adds the map UI for placements).
 *
 * Permissions:
 *   - viewSigns:   REGISTERED, KEYMAN, OVERSEER, ASSISTANT_ADMIN, ADMIN
 *   - manageSigns: OVERSEER, ASSISTANT_ADMIN, ADMIN
 *
 * Routes (this phase):
 *   GET    /signs                          — Sign Library (list templates)
 *   GET    /signs/builder                  — Sign Builder (create form)
 *   GET    /signs/builder/:id              — Sign Builder (edit existing)
 *   POST   /signs                          — Create a new template (JSON)
 *   PUT    /signs/:id                      — Update a template (JSON)
 *   DELETE /signs/:id                      — Archive a template (JSON)
 *
 * Placement endpoints (used in Phase 2):
 *   GET    /signs/:id/placements           — List placements for a sign
 *   POST   /signs/:id/placements           — Create a placement
 *   PUT    /signs/placements/:placementId  — Update a placement
 *   PATCH  /signs/placements/:placementId/status — Update placement status
 *   DELETE /signs/placements/:placementId  — Delete a placement
 */

import express from "express";
import { requirePermission } from "../src/config/roles.js";
import {
  getSigns,
  getSignById,
  createSign,
  updateSign,
  archiveSign,
  getSignPlacements,
  createSignPlacement,
  updateSignPlacement,
  updateSignPlacementStatus,
  deleteSignPlacement,
} from "../lib/dbSync.js";

/** Valid arrow direction tokens accepted by the sign builder. */
const VALID_ARROWS = [
    "up", "down", "left", "right",
    "up-left", "up-right", "down-left", "down-right",
    "up-then-left", "up-then-right", "destination",
];

/** Valid placement statuses. */
const VALID_STATUSES = ["planned", "installed", "removed"];

/**
 * Normalise an arrow direction value from the client.
 * Accepts null/empty string for "no arrow". Throws if value is non-empty
 * but not in the allowed set.
 *
 * @param {any} val
 * @returns {string|null}
 */
function normaliseArrow(val) {
  if (val === null || val === undefined || val === "") return null;
  const v = String(val).trim().toLowerCase();
  if (!VALID_ARROWS.includes(v)) {
    throw new Error(`Invalid arrow direction: ${v}`);
  }
  return v;
}

/**
 * Factory: build the signs router.
 *
 * @param {{
 *   csrfProtection: import('csurf').RequestHandler,
 *   logError?:      (...args: any[]) => void,
 * }} deps
 * @returns {import('express').Router}
 */
export function signsRouter({ csrfProtection, logError }) {
  const router = express.Router();
  const log = logError || console.error;

  /**
   * Middleware: require authenticated user.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  function requireAuth(req, res, next) {
    if (!req.session.userId) return res.redirect("/login");
    next();
  }

  // ===========================
  // SIGN LIBRARY (LIST)
  // ===========================

  /**
   * GET /signs
   * Render the Sign Library page — all active templates with placement counts.
   * Requires viewSigns permission.
   */
  router.get(
    "/signs",
    requireAuth,
    requirePermission("viewSigns"),
    csrfProtection,
    async (req, res) => {
      try {
        const signs = await getSigns();
        return res.render("authentication_and_accounts/signsList", {
          csrfToken: req.csrfToken(),
          signs,
        });
      } catch (err) {
        log("signs GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  // ===========================
  // SIGN BUILDER (CREATE / EDIT)
  // ===========================

  /**
   * GET /signs/builder
   * Render the Sign Builder with an empty form.
   * Requires manageSigns permission.
   */
  router.get(
    "/signs/builder",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    (req, res) => {
      return res.render("authentication_and_accounts/signsBuilder", {
        csrfToken: req.csrfToken(),
        sign: null,
      });
    },
  );

  /**
   * GET /signs/builder/:id
   * Render the Sign Builder pre-loaded with an existing sign for editing.
   * Requires manageSigns permission.
   */
  router.get(
    "/signs/builder/:id",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id) return res.redirect("/signs/builder");

      try {
        const sign = await getSignById(id);
        if (!sign) {
          return res.redirect("/signs");
        }
        return res.render("authentication_and_accounts/signsBuilder", {
          csrfToken: req.csrfToken(),
          sign,
        });
      } catch (err) {
        log("signs/builder/:id GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  // ===========================
  // SIGN TEMPLATE CRUD (JSON)
  // ===========================

  /**
   * POST /signs
   * Create a new sign template.
   *
   * Body (JSON): { signText, arrowDirection?, description? }
   * Response:    { success: true, id: number } | { success: false, error: string }
   *
   * @requires manageSigns permission
   */
  router.post(
    "/signs",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const { signText, arrowDirection, description } = req.body || {};

      if (!signText?.trim()) {
        return res.status(400).json({
          success: false,
          error: "Sign text is required.",
        });
      }
      if (signText.trim().length > 100) {
        return res.status(400).json({
          success: false,
          error: "Sign text must be 100 characters or fewer.",
        });
      }

      let arrow;
      try {
        arrow = normaliseArrow(arrowDirection);
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: e.message,
        });
      }

      try {
        const id = await createSign(
          {
            signText: signText.trim(),
            arrowDirection: arrow,
            description: description?.trim() || null,
          },
          req.session.userEmail || "admin",
        );
        return res.json({ success: true, id });
      } catch (err) {
        log("signs POST error:", err);
        return res.status(500).json({
          success: false,
          error: "Server error.",
        });
      }
    },
  );

  /**
   * PUT /signs/:id
   * Update an existing sign template.
   *
   * Body (JSON): { signText, arrowDirection?, description? }
   * Response:    { success: boolean, error?: string }
   *
   * @requires manageSigns permission
   */
  router.put(
    "/signs/:id",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      const { signText, arrowDirection, description } = req.body || {};

      if (!id) {
        return res.status(400).json({
          success: false,
          error: "Invalid sign id.",
        });
      }
      if (!signText?.trim()) {
        return res.status(400).json({
          success: false,
          error: "Sign text is required.",
        });
      }
      if (signText.trim().length > 100) {
        return res.status(400).json({
          success: false,
          error: "Sign text must be 100 characters or fewer.",
        });
      }

      let arrow;
      try {
        arrow = normaliseArrow(arrowDirection);
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: e.message,
        });
      }

      try {
        const ok = await updateSign(id, {
          signText: signText.trim(),
          arrowDirection: arrow,
          description: description?.trim() || null,
        });
        if (!ok) {
          return res.status(404).json({
            success: false,
            error: "Sign not found.",
          });
        }
        return res.json({ success: true });
      } catch (err) {
        log("signs PUT error:", err);
        return res.status(500).json({
          success: false,
          error: "Server error.",
        });
      }
    },
  );

  /**
   * DELETE /signs/:id
   * Archive a sign template (soft delete — placements survive).
   * Response: { success: boolean }
   *
   * @requires manageSigns permission
   */
  router.delete(
    "/signs/:id",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id) {
        return res.status(400).json({
          success: false,
          error: "Invalid sign id.",
        });
      }

      try {
        const ok = await archiveSign(id);
        if (!ok) {
          return res.status(404).json({
            success: false,
            error: "Sign not found.",
          });
        }
        return res.json({ success: true });
      } catch (err) {
        log("signs DELETE error:", err);
        return res.status(500).json({
          success: false,
          error: "Server error.",
        });
      }
    },
  );

  // ===========================
  // SIGN PLACEMENTS (used in Phase 2)
  // Routes are wired now so the map UI can call them without a
  // separate routing change in the next phase.
  // ===========================

  /**
   * GET /signs/:id/placements
   * List all placements for a single sign template (JSON).
   * @requires viewSigns permission
   */
  router.get(
    "/signs/:id/placements",
    requireAuth,
    requirePermission("viewSigns"),
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id) {
        return res.status(400).json({
          success: false,
          error: "Invalid sign id.",
        });
      }
      try {
        const placements = await getSignPlacements({ signId: id });
        return res.json({ success: true, placements });
      } catch (err) {
        log("signs/:id/placements GET error:", err);
        return res.status(500).json({
          success: false,
          error: "Server error.",
        });
      }
    },
  );

  /**
   * POST /signs/:id/placements
   * Create a new placement under a sign template.
   *
   * Body (JSON): { latitude, longitude, heading?, locationNotes?, status? }
   * Response:    { success: true, id: number }
   *
   * @requires manageSigns permission
   */
  router.post(
    "/signs/:id/placements",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const signId = Number(req.params.id);
      const { latitude, longitude, heading, locationNotes, status } =
        req.body || {};

      if (!signId) {
        return res.status(400).json({
          success: false,
          error: "Invalid sign id.",
        });
      }

      const lat = Number(latitude);
      const lng = Number(longitude);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        return res.status(400).json({
          success: false,
          error:
            "latitude and longitude are required and must be valid coordinates.",
        });
      }

      let hd = null;
      if (heading !== undefined && heading !== null && heading !== "") {
        hd = Number(heading);
        if (!Number.isFinite(hd) || hd < 0 || hd > 360) {
          return res.status(400).json({
            success: false,
            error: "heading must be between 0 and 360.",
          });
        }
      }

      const statusValue = status || "planned";
      if (!VALID_STATUSES.includes(statusValue)) {
        return res.status(400).json({
          success: false,
          error: "Invalid status.",
        });
      }

      try {
        const id = await createSignPlacement(
          {
            signId,
            latitude: lat,
            longitude: lng,
            heading: hd,
            locationNotes: locationNotes?.trim() || null,
            status: statusValue,
          },
          req.session.userEmail || "admin",
        );
        return res.json({ success: true, id });
      } catch (err) {
        log("signs/:id/placements POST error:", err);
        return res.status(500).json({
          success: false,
          error: "Server error.",
        });
      }
    },
  );

  /**
   * PUT /signs/placements/:placementId
   * Update an existing placement's coordinates / heading / notes.
   * Use the PATCH /status route for status changes.
   *
   * Body (JSON): { latitude, longitude, heading?, locationNotes? }
   * Response:    { success: boolean }
   *
   * @requires manageSigns permission
   */
  router.put(
    "/signs/placements/:placementId",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const placementId = Number(req.params.placementId);
      const { latitude, longitude, heading, locationNotes } = req.body || {};

      if (!placementId) {
        return res.status(400).json({
          success: false,
          error: "Invalid placement id.",
        });
      }

      const lat = Number(latitude);
      const lng = Number(longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({
          success: false,
          error: "Valid latitude and longitude are required.",
        });
      }

      let hd = null;
      if (heading !== undefined && heading !== null && heading !== "") {
        hd = Number(heading);
        if (!Number.isFinite(hd) || hd < 0 || hd > 360) {
          return res.status(400).json({
            success: false,
            error: "heading must be between 0 and 360.",
          });
        }
      }

      try {
        const ok = await updateSignPlacement(placementId, {
          latitude: lat,
          longitude: lng,
          heading: hd,
          locationNotes: locationNotes?.trim() || null,
        });
        if (!ok) {
          return res.status(404).json({
            success: false,
            error: "Placement not found.",
          });
        }
        return res.json({ success: true });
      } catch (err) {
        log("signs/placements PUT error:", err);
        return res.status(500).json({
          success: false,
          error: "Server error.",
        });
      }
    },
  );

  /**
   * PATCH /signs/placements/:placementId/status
   * Update only the status field; the DB layer adjusts installed_by / installed_at /
   * removed_at automatically based on the destination status.
   *
   * Body (JSON): { status: 'planned'|'installed'|'removed' }
   * Response:    { success: boolean }
   *
   * @requires manageSigns permission
   */
  router.patch(
    "/signs/placements/:placementId/status",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const placementId = Number(req.params.placementId);
      const { status } = req.body || {};

      if (!placementId) {
        return res.status(400).json({
          success: false,
          error: "Invalid placement id.",
        });
      }
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          error: "Invalid status.",
        });
      }

      try {
        const ok = await updateSignPlacementStatus(
          placementId,
          status,
          req.session.userEmail || "admin",
        );
        if (!ok) {
          return res.status(404).json({
            success: false,
            error: "Placement not found.",
          });
        }
        return res.json({ success: true });
      } catch (err) {
        log("signs/placements/:id/status PATCH error:", err);
        return res.status(500).json({
          success: false,
          error: "Server error.",
        });
      }
    },
  );

  /**
   * DELETE /signs/placements/:placementId
   * Permanently remove a placement.
   * Response: { success: boolean }
   *
   * @requires manageSigns permission
   */
  router.delete(
    "/signs/placements/:placementId",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const placementId = Number(req.params.placementId);
      if (!placementId) {
        return res.status(400).json({
          success: false,
          error: "Invalid placement id.",
        });
      }

      try {
        const ok = await deleteSignPlacement(placementId);
        if (!ok) {
          return res.status(404).json({
            success: false,
            error: "Placement not found.",
          });
        }
        return res.json({ success: true });
      } catch (err) {
        log("signs/placements DELETE error:", err);
        return res.status(500).json({
          success: false,
          error: "Server error.",
        });
      }
    },
  );

  return router;
}
