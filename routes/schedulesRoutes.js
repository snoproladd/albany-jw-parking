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
 *   GET /schedule/pdf/:blobName   (public, no auth; 404 on the demo)
 *   GET /schedule/demo-pdf/:dayId (demo only; renders the PDF live from demo data)
 */

import express from "express";
import { requirePermission } from "../src/config/roles.js";
import { getPublishedSchedules } from "../lib/dbSync.js";
import { streamPublishedFileToResponse } from "../lib/blobStorage.js";
import { generateReportPDF } from "../lib/publishSchedule.js";

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
    if (req.isDemo) {
      // Blob storage is shared with production; never serve it on the demo.
      return res.status(404).send("File not found.");
    }
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

  /**
   * GET /schedule/demo-pdf/:dayId
   * Demo only. Demo publishes don't upload anything, so their schedule links
   * point here and the PDF is rendered on request from demo-schema data
   * (generateReportPDF adds ?demo=1 to its internal render while in a demo
   * request). Returns 404 on production.
   *
   * @param {string} dayId - convention_days.id in the demo schema.
   */
  router.get(
    "/schedule/demo-pdf/:dayId",
    requirePermission("viewSchedules"),
    async (req, res) => {
      if (!req.isDemo) return res.status(404).send("File not found.");
      const dayId = Number(req.params.dayId);
      if (!Number.isInteger(dayId) || dayId <= 0) {
        return res.status(400).send("Invalid day.");
      }
      try {
        const pdf = await generateReportPDF(dayId, Number(process.env.PORT) || 3000);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="schedule-day-${dayId}.pdf"`);
        return res.send(pdf);
      } catch (err) {
        (logError || console.error)("/schedule/demo-pdf/:dayId error:", err);
        if (!res.headersSent) res.status(500).send("Could not generate the schedule PDF.");
      }
    },
  );

  return router;
}
