/**
 * @file routes/schedulesRoutes.js
 * @description Route for the Schedules resources page.
 *
 * Requires the `viewSchedules` permission (REGISTERED and above by default).
 * Fetches subfolder structure and file metadata from the OneDrive Schedules
 * folder via the Microsoft Graph API and renders them as grouped tile sections.
 *
 * Route:
 *   GET /schedules
 */

import express from "express";
import { requirePermission } from "../src/config/roles.js";
import { listOneDriveFolder } from "../lib/graphClient.js";

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
   * Lists OneDrive subfolders under the Schedules directory as sections,
   * with files within each as downloadable tiles.
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
        sections = await listOneDriveFolder({
          ...graphConfig,
          folderPath: `${graphConfig.folderPath}/Schedules`,
        });
      } catch (err) {
        logError("[GET /schedules] OneDrive list error:", err);
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

  return router;
}