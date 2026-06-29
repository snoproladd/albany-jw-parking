/**
 * @file routes/schedulesRoutes.js
 * @description Route for the Schedules resources page.
 *
 * Requires the `viewSchedules` permission (REGISTERED and above by default).
 * Reads published schedule records from the database and renders them as
 * grouped tiles. Each tile links to the blob-stored PDF via /schedule/pdf/:blobName,
 * which requires no authentication and avoids SharePoint auth issues.
 *
 * Routes:
 *   GET /schedules
 *   GET /schedule/pdf/:blobName   (public, no auth)
 */

import express from "express";
import { requirePermission } from "../src/config/roles.js";
import { getPublishedSchedules } from "../lib/dbSync.js";
import { streamPublishedFileToResponse } from "../lib/blobStorage.js";

/**
 * Factory: build the schedules router.
 *
 * @param {{
 *   csrfProtection: import('csurf').CsrfRequestHandler,
 *   logError:       (...args: any[]) => void,
 *   graphConfig: {
 *     tenantId:     string,
 *     clientId:     string,
 *     clientSecret: string,
 *     driveUser:    string,
 *     folderPath:   string,
 *   },
 * }} deps
 * @returns {import('express').Router}
 */
export function schedulesRouter({ csrfProtection, logError, graphConfig }) {
  const router = express.Router();

  /**
   * GET /schedules
   * Lists the most recently published schedule for each convention day.
   * Data comes from schedule_publishes in the DB; download links use the
   * stored blob URL (auth-free) rather than SharePoint.
   * Requires `viewSchedules` permission.
   */
  router.get(
    "/schedules",
    requirePermission("viewSchedules"),
    csrfProtection,
    async (req, res) => {
      const role = req.session?.userRole || "NON_REGISTERED";

      let sections = [];
      let loadError = null;

      try {
        const rows = await getPublishedSchedules();

        sections = rows
          .map((r) => ({
            folderName: r.day_label,
            files: r.download_url
              ? [
                  {
                    name: r.filename || r.day_label,
                    webUrl: r.download_url,
                    mimeType: "application/pdf",
                    lastModified: r.published_at || null,
                    size: null,
                  },
                ]
              : [],
          }))
          .filter((s) => s.files.length > 0);
      } catch (err) {
        logError("[GET /schedules] DB error:", err);
        loadError =
          "Schedules could not be loaded at this time. Please try again later.";
      }

      return res.render("schedules", {
        nav: res.locals.nav,
        userRole: role,
        userPermissions: res.locals.userPermissions,
        appVersion: res.locals.appVersion,
        csrfToken: req.csrfToken(),
        sections,
        loadError,
      });
    },
  );

  /**
   * GET /schedule/pdf/:blobName
   * Public endpoint (no auth required) that streams a published schedule PDF
   * from Blob Storage. The blobName is the timestamp-prefixed name returned
   * by uploadPublishedFile(), e.g. "1719251234567-Friday_Schedule_Jul_3_2026.pdf".
   *
   * @param {string} blobName - Blob name from the published-files container.
   */
  router.get("/schedule/pdf/:blobName", async (req, res) => {
    const { blobName } = req.params;
    if (!blobName || /[/\\]/.test(blobName)) {
      return res.status(400).send("Invalid file name.");
    }
    try {
      // Strip timestamp prefix for the user-facing filename
      const displayName = blobName.replace(/^\d+-/, "");
      res.setHeader("Content-Disposition", `inline; filename="${displayName}"`);
      await streamPublishedFileToResponse(blobName, res);
    } catch (err) {
      (logError || console.error)("/schedule/pdf/:blobName error:", err);
      if (!res.headersSent) {
        res.status(404).send("File not found.");
      }
    }
  });

  return router;
}
