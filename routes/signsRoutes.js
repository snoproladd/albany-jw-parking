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
 * Location endpoints:
 *   POST   /signs/locations                          — Create a location
 *   PUT    /signs/locations/:locationId               — Update a location
 *   DELETE /signs/locations/:locationId               — Delete a location
 *
 * Attachment endpoints:
 *   POST   /signs/locations/:locationId/attachments          — Attach a sign
 *   PUT    /signs/attachments/:attachmentId                  — Update attachment
 *   PATCH  /signs/attachments/:attachmentId/status           — Update status
 *   DELETE /signs/attachments/:attachmentId                  — Remove attachment
 *   PUT    /signs/locations/:locationId/attachments/reorder  — Reorder stack
 *
 * Photo endpoints:
 *   POST   /signs/locations/:locationId/photo   — Upload photo
 *   GET    /signs/locations/:locationId/photo    — Stream photo
 *   DELETE /signs/locations/:locationId/photo    — Delete photo
 *
 * Traffic arrow endpoints:
 *   POST   /signs/arrows                                 — Create arrow
 *   PUT    /signs/arrows/:arrowId                        — Update arrow
 *   DELETE /signs/arrows/:arrowId                        — Delete arrow
 *   POST   /signs/arrows/:arrowId/links                  — Link attachment
 *   DELETE /signs/arrows/:arrowId/links/:attachmentId    — Unlink attachment
 */

import express from "express";
import multer from "multer";
import { requirePermission } from "../src/config/roles.js";
import {
  getSigns,
  getSignById,
  createSign,
  updateSign,
  archiveSign,
  getSignLocations,
  getSignLocationById,
  createSignLocation,
  updateSignLocation,
  deleteSignLocation,
  setSignLocationPhoto,
  clearSignLocationPhoto,
  createSignAttachment,
  updateSignAttachment,
  updateSignAttachmentStatus,
  deleteSignAttachment,
  reorderSignAttachments,
  getTrafficArrows,
  createTrafficArrow,
  updateTrafficArrow,
  deleteTrafficArrow,
  createTrafficArrowLink,
  deleteTrafficArrowLink,
  setTrafficArrowSvState,
} from "../lib/dbSync.js";
import {
  uploadSignPhoto,
  streamSignPhotoToResponse,
  deleteSignPhoto,
} from "../lib/blobStorage.js";
import { getMapOverlays } from "../src/config/mapOverlays.js";
import { PDF_SECRET } from "../lib/publishSchedule.js";
import { publishSignMap } from "../lib/publishSignMap.js";

/** Multer config: in-memory upload limited to 12 MB. */
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    // 12 MB cap — modern phone photos are 5-10 MB. After sharp processing
    // the stored blob will be ~200-500 KB regardless of input size.
    fileSize: 12 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    // Accept jpeg, png, webp, heic, gif, avif, tiff — anything sharp handles.
    // We don't validate by extension; mimetype is checked here, and sharp
    // will throw on actually-bad bytes which we catch in the route.
    const ok = /^image\//.test(file.mimetype || "");
    if (!ok) {
      return cb(new Error("Only image uploads are allowed."));
    }
    cb(null, true);
  },
});

/** Valid arrow direction tokens accepted by the sign builder. */
const VALID_ARROWS = [
  "up",
  "down",
  "left",
  "right",
  "up-left",
  "up-right",
  "down-left",
  "down-right",
  "up-then-left",
  "up-then-right",
  "destination",
];

/** Valid placement statuses. */
const VALID_STATUSES = ["planned", "installed", "removed"];

/** Valid mount types for a placement. Null means "not specified". */
const VALID_MOUNT_TYPES = ["pole", "cone", "a-frame", "existing-structure"];

/** Valid marker color keys for placements. Null means "default (status)". */
const VALID_MARKER_COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
];

/**
 * Normalise a marker color key. Null/empty = "default". Throws if
 * the value is non-empty but not in the allowed palette.
 *
 * @param {any} val
 * @returns {string|null}
 */
function normaliseMarkerColor(val) {
  if (val === null || val === undefined || val === "") return null;
  const v = String(val).trim().toLowerCase();
  if (!VALID_MARKER_COLORS.includes(v)) {
    throw new Error(`Invalid marker color: ${v}`);
  }
  return v;
}

/**
 * Normalise a mount type from the client. Accepts null/empty for "not set".
 * Throws if value is non-empty but not in the allowed set.
 *
 * @param {any} val
 * @returns {string|null}
 */
function normaliseMountType(val) {
  if (val === null || val === undefined || val === "") return null;
  const v = String(val).trim().toLowerCase();
  if (!VALID_MOUNT_TYPES.includes(v)) {
    throw new Error(`Invalid mount type: ${v}`);
  }
  return v;
}

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
 *   csrfProtection:    import('csurf').RequestHandler,
 *   logError?:         (...args: any[]) => void,
 *   googleMapsApiKey?: string,
 *   defaultMapCenter?: { lat: number, lng: number, zoom: number },
 * }} deps
 * @returns {import('express').Router}
 */
export function signsRouter({
  csrfProtection,
  logError,
  googleMapsApiKey,
  defaultMapCenter = { lat: 42.6485, lng: -73.749, zoom: 17 },
  serverPort,
  graphConfig,
}) {
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
  // SIGN MAP (place + view placements on a satellite map)
  // ===========================

  /**
   * GET /signs/map
   * Render the sign map page — Google Maps satellite view showing all
   * non-archived placements as custom overlays. OVERSEER+ can click to
   * place new signs, drag to reposition, and edit/delete via panel.
   * Requires viewSigns permission to view; manage actions are gated
   * client-side by manageSigns (server-side checks remain in the CRUD
   * routes regardless).
   */
  router.get(
    "/signs/map",
    requireAuth,
    requirePermission("viewSigns"),
    csrfProtection,
    async (req, res) => {
      try {
        const [signs, locations, arrows] = await Promise.all([
          getSigns(),
          getSignLocations(),
          getTrafficArrows(),
        ]);

        if (!googleMapsApiKey) {
          log("signs/map: GOOGLE_MAPS_API_KEY is not configured.");
        }

        return res.render("authentication_and_accounts/signsMap", {
          csrfToken: req.csrfToken(),
          signs,
          locations,
          arrows,
          placements: [],
          googleMapsApiKey: googleMapsApiKey || "",
          defaultMapCenter,
          mapOverlays: getMapOverlays(),
        });
      } catch (err) {
        log("signs/map GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  // ===========================
  // SIGN MAP — PRINT VIEW
  // ===========================

  /**
   * GET /signs/map/print
   * Render a print-optimized view of the sign placement map.
   * Uses the same Google Maps JS API but with a stripped-down UI
   * tuned for paper output. Markers always render at full detail
   * with a print-specific CSS class for slightly reduced sizing
   * and text wrapping.
   *
   * Requires viewSigns permission.
   */
  router.get(
    "/signs/map/print",
    requireAuth,
    requirePermission("viewSigns"),
    csrfProtection,
    async (req, res) => {
      try {
        const [signs, locations, arrows] = await Promise.all([
          getSigns(),
          getSignLocations(),
          getTrafficArrows(),
        ]);

        if (!googleMapsApiKey) {
          log("signs/map/print: GOOGLE_MAPS_API_KEY is not configured.");
        }

        return res.render("authentication_and_accounts/signsMapPrint", {
          csrfToken: req.csrfToken(),
          signs,
          locations,
          arrows,
          googleMapsApiKey: googleMapsApiKey || "",
          defaultMapCenter,
          mapOverlays: getMapOverlays(),
        });
      } catch (err) {
        log("signs/map/print GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  // ===========================
  // SIGN MAP — INTERNAL PDF RENDER
  // ===========================

  /**
   * GET /internal/pdf/signs-map
   * Renders the print view for Puppeteer with no session requirement.
   * The ?secret= query param must match PDF_SECRET.
   * Accepts optional filter params: ?status=, ?template=, ?mapType=
   */
  router.get("/internal/pdf/signs-map", async (req, res) => {
    if (!req.query.secret || req.query.secret !== PDF_SECRET) {
      return res.status(403).end();
    }
    try {
      const [signs, locations] = await Promise.all([
        getSigns(),
        getSignLocations(),
      ]);

      return res.render("authentication_and_accounts/signsMapPrint", {
        csrfToken: "",
        signs,
        locations,
        googleMapsApiKey: googleMapsApiKey || "",
        defaultMapCenter,
        mapOverlays: getMapOverlays(),
        // Pass a flag so the template knows this is an internal render
        internalRender: true,
      });
    } catch (err) {
      log("internal/pdf/signs-map error:", err);
      return res.status(500).end();
    }
  });

  // ===========================
  // SIGN MAP — PUBLISH
  // ===========================

  /**
   * POST /signs/map/publish
   * Generate a PDF snapshot of the sign map and upload to
   * Blob Storage + SharePoint.
   *
   * Body (JSON): { status?, template?, mapType? }
   * Response:    { success, blobName, sharePointUrl, filename }
   *
   * @requires manageSigns permission
   */
  router.post(
    "/signs/map/publish",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      try {
        const resolvedGraphConfig = graphConfig ?? {
          tenantId: process.env.GRAPH_TENANT_ID,
          clientId: process.env.GRAPH_CLIENT_ID,
          clientSecret: process.env.GRAPH_CLIENT_SECRET,
          driveUser:
            process.env.GRAPH_DRIVE_USER ||
            "jladd@jakeofalltradespropertyserv.onmicrosoft.com",
          folderPath:
            process.env.GRAPH_FOLDER_PATH ||
            "2026 Convention Parking/Documents for Distribution",
        };

        const result = await publishSignMap({
          serverPort: serverPort || Number(process.env.PORT) || 3000,
          publishedBy: req.session.userEmail || "admin",
          filters: {
            status: req.body?.status || undefined,
            template: req.body?.template || undefined,
            mapType: req.body?.mapType || undefined,
          },
          graphConfig: resolvedGraphConfig,
        });

        return res.json({ success: true, ...result });
      } catch (err) {
        log("signs/map/publish POST error:", err);
        return res.status(500).json({
          success: false,
          error: err.message || "Publish failed.",
        });
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
      const {
        signText,
        arrowDirection,
        abbreviation,
        signCategory,
        description,
      } = req.body || {};

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

      // Abbreviation override is optional. Empty string is treated as
      // "no override" so the server-side heuristic kicks in on read.
      // Max 6 chars matches the DB column width.
      const abbr = (abbreviation || "").trim().toUpperCase();
      if (abbr.length > 6) {
        return res.status(400).json({
          success: false,
          error: "Abbreviation must be 6 characters or fewer.",
        });
      }

      try {
        const validCategories = ['parking', 'accessible', 'dropoff', 'info', 'warning'];
        const cat = validCategories.includes(signCategory) ? signCategory : null;

        const id = await createSign(
          {
            signText: signText.trim(),
            arrowDirection: arrow,
            abbreviation: abbr || null,
            signCategory: cat,
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
      const { signText, arrowDirection, abbreviation, signCategory, description } =
        req.body || {};

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

      // Abbreviation override is optional; empty string clears any prior
      // override and reverts to the heuristic-computed default on read.
      const abbr = (abbreviation || "").trim().toUpperCase();
      if (abbr.length > 6) {
        return res.status(400).json({
          success: false,
          error: "Abbreviation must be 6 characters or fewer.",
        });
      }

      const validCategories = ['parking', 'accessible', 'dropoff', 'info', 'warning'];
      const cat = validCategories.includes(signCategory) ? signCategory : null;

      try {
        const ok = await updateSign(id, {
          signText: signText.trim(),
          arrowDirection: arrow,
          abbreviation: abbr || null,
          signCategory: cat,
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
  // SIGN LOCATIONS (physical mounting points)
  // ===========================

  /**
   * POST /signs/locations
   * Create a new sign location (empty — no attachments yet).
   *
   * Body (JSON): { latitude, longitude, mountType?, frontBearing?,
   *                markerColor?, locationNotes? }
   * Response:    { success: true, id: number }
   *
   * @requires manageSigns permission
   */
  router.post(
    "/signs/locations",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const {
        latitude, longitude, mountType, frontBearing,
        markerColor, locationNotes,
      } = req.body || {};

      const lat = Number(latitude);
      const lng = Number(longitude);
      if (
        !Number.isFinite(lat) || !Number.isFinite(lng) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180
      ) {
        return res.status(400).json({
          success: false,
          error: "Valid latitude and longitude are required.",
        });
      }

      let mountTypeValue;
      try { mountTypeValue = normaliseMountType(mountType); }
      catch (e) { return res.status(400).json({ success: false, error: e.message }); }

      let markerColorValue;
      try { markerColorValue = normaliseMarkerColor(markerColor); }
      catch (e) { return res.status(400).json({ success: false, error: e.message }); }

      let fb = null;
      if (frontBearing !== undefined && frontBearing !== null && frontBearing !== "") {
        fb = Number(frontBearing);
        if (!Number.isFinite(fb) || fb < 0 || fb > 360) {
          return res.status(400).json({
            success: false,
            error: "frontBearing must be between 0 and 360.",
          });
        }
      }

      try {
        const id = await createSignLocation(
          {
            latitude: lat,
            longitude: lng,
            mountType: mountTypeValue,
            frontBearing: fb,
            markerColor: markerColorValue,
            locationNotes: locationNotes?.trim() || null,
          },
          req.session.userEmail || "admin",
        );
        return res.json({ success: true, id });
      } catch (err) {
        log("signs/locations POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * PUT /signs/locations/:locationId
   * Update a location's metadata (coords, mount type, notes, color).
   *
   * @requires manageSigns permission
   */
  router.put(
    "/signs/locations/:locationId",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const locationId = Number(req.params.locationId);
      const {
        latitude, longitude, mountType, frontBearing,
        markerColor, locationNotes,
      } = req.body || {};

      if (!locationId) {
        return res.status(400).json({ success: false, error: "Invalid location id." });
      }

      const lat = Number(latitude);
      const lng = Number(longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({
          success: false,
          error: "Valid latitude and longitude are required.",
        });
      }

      let mountTypeValue;
      try { mountTypeValue = normaliseMountType(mountType); }
      catch (e) { return res.status(400).json({ success: false, error: e.message }); }

      let markerColorValue;
      try { markerColorValue = normaliseMarkerColor(markerColor); }
      catch (e) { return res.status(400).json({ success: false, error: e.message }); }

      let fb = null;
      if (frontBearing !== undefined && frontBearing !== null && frontBearing !== "") {
        fb = Number(frontBearing);
        if (!Number.isFinite(fb) || fb < 0 || fb > 360) {
          return res.status(400).json({
            success: false,
            error: "frontBearing must be between 0 and 360.",
          });
        }
      }

      try {
        const ok = await updateSignLocation(locationId, {
          latitude: lat,
          longitude: lng,
          mountType: mountTypeValue,
          frontBearing: fb,
          markerColor: markerColorValue,
          locationNotes: locationNotes?.trim() || null,
        });
        if (!ok) {
          return res.status(404).json({ success: false, error: "Location not found." });
        }
        return res.json({ success: true });
      } catch (err) {
        log("signs/locations PUT error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * DELETE /signs/locations/:locationId
   * Delete a location. Cascade deletes its attachments and
   * any traffic-arrow links.
   *
   * @requires manageSigns permission
   */
  router.delete(
    "/signs/locations/:locationId",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const locationId = Number(req.params.locationId);
      if (!locationId) {
        return res.status(400).json({ success: false, error: "Invalid location id." });
      }

      try {
        // Best-effort photo cleanup before the row goes away.
        const existing = await getSignLocationById(locationId);
        if (existing?.photo_url) {
          try { await deleteSignPhoto(existing.photo_url); }
          catch (err) { log("Warning: failed to delete photo blob on location delete:", err); }
        }

        const ok = await deleteSignLocation(locationId);
        if (!ok) {
          return res.status(404).json({ success: false, error: "Location not found." });
        }
        return res.json({ success: true });
      } catch (err) {
        log("signs/locations DELETE error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  // ===========================
  // SIGN ATTACHMENTS (signs mounted on a location)
  // ===========================

  /**
   * POST /signs/locations/:locationId/attachments
   * Attach a sign template to a location.
   *
   * Body (JSON): { signId, face?, sortOrder?, arrowDirection?, status? }
   * Response:    { success: true, id: number }
   *
   * @requires manageSigns permission
   */
  router.post(
    "/signs/locations/:locationId/attachments",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const locationId = Number(req.params.locationId);
      const { signId, face, sortOrder, arrowDirection, status } = req.body || {};

      if (!locationId) {
        return res.status(400).json({ success: false, error: "Invalid location id." });
      }
      if (!signId) {
        return res.status(400).json({ success: false, error: "signId is required." });
      }

      // Validate face
      const faceValue = face ? String(face).trim().toLowerCase() : null;
      if (faceValue && !["front", "back"].includes(faceValue)) {
        return res.status(400).json({ success: false, error: "face must be 'front' or 'back'." });
      }

      let arrowValue;
      try { arrowValue = normaliseArrow(arrowDirection); }
      catch (e) { return res.status(400).json({ success: false, error: e.message }); }

      const statusValue = status || "planned";
      if (!VALID_STATUSES.includes(statusValue)) {
        return res.status(400).json({ success: false, error: "Invalid status." });
      }

      try {
        const id = await createSignAttachment(
          {
            locationId,
            signId: Number(signId),
            face: faceValue,
            sortOrder: Number(sortOrder) || 0,
            arrowDirection: arrowValue,
            status: statusValue,
          },
          req.session.userEmail || "admin",
        );
        return res.json({ success: true, id });
      } catch (err) {
        log("signs/locations/:id/attachments POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * PUT /signs/attachments/:attachmentId
   * Update an attachment's face, arrow direction, or sort order.
   *
   * @requires manageSigns permission
   */
  router.put(
    "/signs/attachments/:attachmentId",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const attachmentId = Number(req.params.attachmentId);
      const { face, sortOrder, arrowDirection } = req.body || {};

      if (!attachmentId) {
        return res.status(400).json({ success: false, error: "Invalid attachment id." });
      }

      const faceValue = face ? String(face).trim().toLowerCase() : null;
      if (faceValue && !["front", "back"].includes(faceValue)) {
        return res.status(400).json({ success: false, error: "face must be 'front' or 'back'." });
      }

      let arrowValue;
      try { arrowValue = normaliseArrow(arrowDirection); }
      catch (e) { return res.status(400).json({ success: false, error: e.message }); }

      try {
        const ok = await updateSignAttachment(attachmentId, {
          face: faceValue,
          sortOrder: Number(sortOrder) || 0,
          arrowDirection: arrowValue,
        });
        if (!ok) {
          return res.status(404).json({ success: false, error: "Attachment not found." });
        }
        return res.json({ success: true });
      } catch (err) {
        log("signs/attachments PUT error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * PATCH /signs/attachments/:attachmentId/status
   * Update only the status; DB layer adjusts installed_by / installed_at /
   * removed_at automatically.
   *
   * Body (JSON): { status: 'planned'|'installed'|'removed' }
   *
   * @requires manageSigns permission
   */
  router.patch(
    "/signs/attachments/:attachmentId/status",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const attachmentId = Number(req.params.attachmentId);
      const { status } = req.body || {};

      if (!attachmentId) {
        return res.status(400).json({ success: false, error: "Invalid attachment id." });
      }
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, error: "Invalid status." });
      }

      try {
        const ok = await updateSignAttachmentStatus(
          attachmentId,
          status,
          req.session.userEmail || "admin",
        );
        if (!ok) {
          return res.status(404).json({ success: false, error: "Attachment not found." });
        }
        return res.json({ success: true });
      } catch (err) {
        log("signs/attachments/:id/status PATCH error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * DELETE /signs/attachments/:attachmentId
   * Remove a sign attachment from its location.
   *
   * @requires manageSigns permission
   */
  router.delete(
    "/signs/attachments/:attachmentId",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const attachmentId = Number(req.params.attachmentId);
      if (!attachmentId) {
        return res.status(400).json({ success: false, error: "Invalid attachment id." });
      }

      try {
        const ok = await deleteSignAttachment(attachmentId);
        if (!ok) {
          return res.status(404).json({ success: false, error: "Attachment not found." });
        }
        return res.json({ success: true });
      } catch (err) {
        log("signs/attachments DELETE error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * PUT /signs/locations/:locationId/attachments/reorder
   * Reorder the attachments on a location via drag-and-drop.
   *
   * Body (JSON): { orderedIds: [3, 1, 2] }  — attachment IDs in display order
   *
   * @requires manageSigns permission
   */
  router.put(
    "/signs/locations/:locationId/attachments/reorder",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const locationId = Number(req.params.locationId);
      const { orderedIds } = req.body || {};

      if (!locationId) {
        return res.status(400).json({ success: false, error: "Invalid location id." });
      }
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: "orderedIds must be a non-empty array of attachment IDs.",
        });
      }

      try {
        await reorderSignAttachments(locationId, orderedIds.map(Number));
        return res.json({ success: true });
      } catch (err) {
        log("signs/locations/:id/attachments/reorder PUT error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  // ===========================
  // LOCATION PHOTOS
  // ===========================

  /**
   * POST /signs/locations/:locationId/photo
   * Upload (or replace) the photo for a location.
   *
   * Form data: `photo` (image file, multipart/form-data)
   * Response:  { success: true, photo_url: string }
   *
   * @requires manageSigns permission
   */
  router.post(
    "/signs/locations/:locationId/photo",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    photoUpload.single("photo"),
    async (req, res) => {
      const locationId = Number(req.params.locationId);
      if (!locationId) {
        return res.status(400).json({ success: false, error: "Invalid location id." });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No photo file uploaded." });
      }

      try {
        const existing = await getSignLocationById(locationId);
        if (!existing) {
          return res.status(404).json({ success: false, error: "Location not found." });
        }

        const actorName = [req.session.firstName, req.session.lastName]
          .filter(Boolean)
          .join(" ") || null;
        const newBlobName = await uploadSignPhoto(locationId, req.file.buffer);
        await setSignLocationPhoto(locationId, newBlobName, actorName);

        // Best-effort delete of the previous blob.
        if (existing.photo_url && existing.photo_url !== newBlobName) {
          try { await deleteSignPhoto(existing.photo_url); }
          catch (err) { log("Warning: failed to delete old photo blob:", err); }
        }

        return res.json({
          success: true,
          photo_url: newBlobName,
          photo_taken_by: actorName,
          photo_taken_at: new Date().toISOString(),
        });
      } catch (err) {
        log("signs/locations/:id/photo POST error:", err);
        const isImgErr = /Input (?:buffer|file)|unsupported image format/i.test(
          err.message || "",
        );
        return res.status(isImgErr ? 400 : 500).json({
          success: false,
          error: isImgErr
            ? "Could not process the uploaded image. Try a different file."
            : "Server error.",
        });
      }
    },
  );

  /**
   * GET /signs/locations/:locationId/photo
   * Stream the location's photo bytes to the client.
   *
   * @requires viewSigns permission
   */
  router.get(
    "/signs/locations/:locationId/photo",
    requireAuth,
    requirePermission("viewSigns"),
    async (req, res) => {
      const locationId = Number(req.params.locationId);
      if (!locationId) {
        return res.status(400).send("Invalid location id.");
      }

      try {
        const location = await getSignLocationById(locationId);
        if (!location) {
          return res.status(404).send("Location not found.");
        }
        if (!location.photo_url) {
          return res.status(404).send("No photo for this location.");
        }

        await streamSignPhotoToResponse(location.photo_url, res);
      } catch (err) {
        log("signs/locations/:id/photo GET error:", err);
        if (!res.headersSent) {
          return res.status(500).send("Server error.");
        }
      }
    },
  );

  /**
   * DELETE /signs/locations/:locationId/photo
   * Remove the location's photo (blob + DB column).
   *
   * @requires manageSigns permission
   */
  router.delete(
    "/signs/locations/:locationId/photo",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const locationId = Number(req.params.locationId);
      if (!locationId) {
        return res.status(400).json({ success: false, error: "Invalid location id." });
      }

      try {
        const location = await getSignLocationById(locationId);
        if (!location) {
          return res.status(404).json({ success: false, error: "Location not found." });
        }
        if (!location.photo_url) {
          return res.json({ success: true });
        }

        try { await deleteSignPhoto(location.photo_url); }
        catch (err) { log("Warning: failed to delete photo blob:", err); }
        await clearSignLocationPhoto(locationId);

        return res.json({ success: true });
      } catch (err) {
        log("signs/locations/:id/photo DELETE error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /signs/locations/:locationId/street-view-photo
   * Capture the current Street View panorama as the location photo.
   *
   * The client sends the panorama camera state (panoId, heading, pitch,
   * fov).  The server fetches the corresponding static image from the
   * Google Street View Static API, uploads it to blob storage, and
   * persists the camera state so the panorama can be restored later.
   *
   * Body (JSON): { panoId, heading, pitch, fov }
   * Response:    { success, photo_url, sv_pano_id, sv_heading,
   *               sv_pitch, sv_fov, photo_taken_by, photo_taken_at }
   *
   * @requires manageSigns permission
   */
  router.post(
    "/signs/locations/:locationId/street-view-photo",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const locationId = Number(req.params.locationId);
      if (!locationId) {
        return res.status(400).json({ success: false, error: "Invalid location id." });
      }

      const { panoId, heading, pitch, fov } = req.body || {};
      if (!panoId || heading == null || pitch == null || fov == null) {
        return res.status(400).json({
          success: false,
          error: "Missing Street View state (panoId, heading, pitch, fov).",
        });
      }

      if (!googleMapsApiKey) {
        return res.status(500).json({
          success: false,
          error: "Google Maps API key is not configured.",
        });
      }

      try {
        const existing = await getSignLocationById(locationId);
        if (!existing) {
          return res.status(404).json({ success: false, error: "Location not found." });
        }

        // Fetch the static Street View image from Google.
        const svUrl =
          `https://maps.googleapis.com/maps/api/streetview` +
          `?size=640x480` +
          `&pano=${encodeURIComponent(panoId)}` +
          `&heading=${Number(heading)}` +
          `&pitch=${Number(pitch)}` +
          `&fov=${Number(fov)}` +
          `&key=${encodeURIComponent(googleMapsApiKey)}`;

        const svRes = await fetch(svUrl);
        if (!svRes.ok) {
          log("Street View Static API error:", svRes.status, await svRes.text());
          return res.status(502).json({
            success: false,
            error: "Failed to fetch Street View image from Google.",
          });
        }

        const buffer = Buffer.from(await svRes.arrayBuffer());
        const actorName = [req.session.firstName, req.session.lastName]
          .filter(Boolean)
          .join(" ") || null;

        const newBlobName = await uploadSignPhoto(locationId, buffer);
        const svState = {
          panoId: String(panoId),
          heading: Number(heading),
          pitch: Number(pitch),
          fov: Number(fov),
        };
        await setSignLocationPhoto(locationId, newBlobName, actorName, svState);

        // Best-effort delete of the previous blob.
        if (existing.photo_url && existing.photo_url !== newBlobName) {
          try { await deleteSignPhoto(existing.photo_url); }
          catch (err) { log("Warning: failed to delete old photo blob:", err); }
        }

        return res.json({
          success: true,
          photo_url: newBlobName,
          sv_pano_id: svState.panoId,
          sv_heading: svState.heading,
          sv_pitch: svState.pitch,
          sv_fov: svState.fov,
          photo_taken_by: actorName,
          photo_taken_at: new Date().toISOString(),
        });
      } catch (err) {
        log("signs/locations/:id/street-view-photo POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

// ═══════════════════════════════════════════════════════════════
  //  TRAFFIC ARROWS
  // ═══════════════════════════════════════════════════════════════

  /**
   * POST /signs/arrows
   * Create a new traffic arrow. Requires manageSigns.
   */
  router.post(
    "/signs/arrows",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      try {
        const lat = parseFloat(req.body.latitude);
        const lng = parseFloat(req.body.longitude);
        const bearing = parseFloat(req.body.bearing);
        if (isNaN(lat) || isNaN(lng) || isNaN(bearing)) {
          return res.status(400).json({ success: false, error: "Invalid coordinates or bearing." });
        }
        const label = req.body.label ? String(req.body.label).trim().slice(0, 100) : null;
        const color = req.body.color ? String(req.body.color).trim().toLowerCase() : null;

        const arrowId = await createTrafficArrow(
          { latitude: lat, longitude: lng, bearing, label, color },
          req.session.userEmail || "admin",
        );

        return res.json({ success: true, arrowId });
      } catch (err) {
        log("signs/arrows POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * PUT /signs/arrows/:arrowId
   * Update a traffic arrow's position, bearing, label, or color.
   */
  router.put(
    "/signs/arrows/:arrowId",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const arrowId = Number(req.params.arrowId);
      if (!arrowId) {
        return res.status(400).json({ success: false, error: "Invalid arrow id." });
      }

      try {
        const lat = parseFloat(req.body.latitude);
        const lng = parseFloat(req.body.longitude);
        const bearing = parseFloat(req.body.bearing);
        if (isNaN(lat) || isNaN(lng) || isNaN(bearing)) {
          return res.status(400).json({ success: false, error: "Invalid coordinates or bearing." });
        }
        const label = req.body.label ? String(req.body.label).trim().slice(0, 100) : null;
        const color = req.body.color ? String(req.body.color).trim().toLowerCase() : null;

        const ok = await updateTrafficArrow(arrowId, {
          latitude: lat, longitude: lng, bearing, label, color,
        });

        if (!ok) {
          return res.status(404).json({ success: false, error: "Arrow not found." });
        }
        return res.json({ success: true });
      } catch (err) {
        log("signs/arrows PUT error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * DELETE /signs/arrows/:arrowId
   * Delete a traffic arrow and its links.
   */
  router.delete(
    "/signs/arrows/:arrowId",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const arrowId = Number(req.params.arrowId);
      if (!arrowId) {
        return res.status(400).json({ success: false, error: "Invalid arrow id." });
      }

      try {
        const ok = await deleteTrafficArrow(arrowId);
        if (!ok) {
          return res.status(404).json({ success: false, error: "Arrow not found." });
        }
        return res.json({ success: true });
      } catch (err) {
        log("signs/arrows DELETE error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /signs/arrows/:arrowId/links
   * Link an attachment to a traffic arrow.
   */
  router.post(
    "/signs/arrows/:arrowId/links",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const arrowId = Number(req.params.arrowId);
      const attachmentId = Number(req.body.attachmentId);
      if (!arrowId || !attachmentId) {
        return res.status(400).json({ success: false, error: "Invalid arrow or attachment id." });
      }

      try {
        const linkId = await createTrafficArrowLink(arrowId, attachmentId);
        return res.json({ success: true, linkId });
      } catch (err) {
        log("signs/arrows/:id/links POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * DELETE /signs/arrows/:arrowId/links/:attachmentId
   * Unlink an attachment from a traffic arrow.
   */
  router.delete(
    "/signs/arrows/:arrowId/links/:attachmentId",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const arrowId = Number(req.params.arrowId);
      const attachmentId = Number(req.params.attachmentId);
      if (!arrowId || !attachmentId) {
        return res.status(400).json({ success: false, error: "Invalid arrow or attachment id." });
      }

      try {
        const ok = await deleteTrafficArrowLink(arrowId, attachmentId);
        if (!ok) {
          return res.status(404).json({ success: false, error: "Link not found." });
        }
        return res.json({ success: true });
      } catch (err) {
        log("signs/arrows/:id/links DELETE error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * PATCH /signs/arrows/:arrowId/street-view-state
   * Persist the Street View camera state on a traffic arrow.
   *
   * Saves the panorama position so the view is restored when Street
   * View is next opened from this arrow.  Does not capture a photo —
   * only stores the four camera fields.
   *
   * Body (JSON): { panoId, heading, pitch, fov }
   * Response:    { success, sv_pano_id, sv_heading, sv_pitch, sv_fov }
   *
   * @requires manageSigns permission
   */
  router.patch(
    "/signs/arrows/:arrowId/street-view-state",
    requireAuth,
    requirePermission("manageSigns"),
    csrfProtection,
    async (req, res) => {
      const arrowId = Number(req.params.arrowId);
      if (!arrowId) {
        return res.status(400).json({ success: false, error: "Invalid arrow id." });
      }

      const { panoId, heading, pitch, fov } = req.body || {};
      if (!panoId || heading == null || pitch == null || fov == null) {
        return res.status(400).json({
          success: false,
          error: "Missing Street View state (panoId, heading, pitch, fov).",
        });
      }

      try {
        const svState = {
          panoId: String(panoId),
          heading: Number(heading),
          pitch: Number(pitch),
          fov: Number(fov),
        };
        await setTrafficArrowSvState(arrowId, svState);

        return res.json({
          success: true,
          sv_pano_id: svState.panoId,
          sv_heading: svState.heading,
          sv_pitch: svState.pitch,
          sv_fov: svState.fov,
        });
      } catch (err) {
        log("signs/arrows/:id/street-view-state PATCH error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  return router;
}

