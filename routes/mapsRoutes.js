/**
 * @file routes/mapsRoutes.js
 * @description Route for the Maps page.
 *
 * Requires the `viewMaps` permission (REGISTERED and above by default).
 * Fetches subfolder structure and file metadata from OneDrive via the
 * Microsoft Graph API and renders them as grouped tile sections.
 *
 * Route:
 *   GET /maps
 */

import express from "express";
import { requirePermission } from "../src/config/roles.js";
import { listOneDriveFolder } from "../lib/graphClient.js";

/**
 * Factory: build the maps router.
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
export function mapsRouter({ csrfProtection, logError, graphConfig }) {
  const router = express.Router();

  /**
   * GET /maps
   * Lists OneDrive subfolders as sections, files within each as tiles.
   * Requires `viewMaps` permission.
   */
  router.get(
    "/maps",
    requirePermission("viewMaps"),
    csrfProtection,
    async (req, res) => {
      const role = req.session?.userRole || "NON_REGISTERED";
      const permissions = req.session?.permissions || {};

      let sections = [];
      let loadError = null;

      try {
        sections = await listOneDriveFolder({
          ...graphConfig,
          folderPath: `${graphConfig.folderPath}/Maps`,
        });
      } catch (err) {
        logError("[GET /maps] OneDrive list error:", err);
        loadError =
          "Maps could not be loaded at this time. Please try again later.";
      }

      return res.render("maps", {
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
