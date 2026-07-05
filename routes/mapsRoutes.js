/**
 * @file routes/mapsRoutes.js
 * @description Route for the Maps resources page.
 *
 * Requires the `viewMaps` permission (REGISTERED and above by default).
 * As of the maps-blob-sync migration, file metadata is read from the
 * map_files table (kept current by lib/mapsSync.js) instead of querying
 * OneDrive/SharePoint live on every request. Files are served from Azure
 * Blob Storage via /maps/file/:blobName, so the page never links directly
 * to SharePoint.
 *
 * Routes:
 *   GET  /maps                    Page (viewMaps)
 *   GET  /maps/file/:blobName     Blob proxy (viewMaps)
 *   POST /api/maps/sync           Manual sync trigger (accessAdminConsole)
 */

import express from "express";
import { requirePermission, can, PERMISSIONS } from "../src/config/roles.js";
import { getMapFiles } from "../lib/dbSync.js";
import { streamMapFileToResponse } from "../lib/blobStorage.js";
import { syncMapsFromOneDrive } from "../lib/mapsSync.js";

/**
 * Group a flat list of map_files rows into the folder-sectioned shape
 * views/maps.ejs expects, with webUrl pointing at the blob proxy route
 * instead of a SharePoint link.
 *
 * @param {Array<{
 *   folder_name:   string,
 *   file_name:     string,
 *   blob_name:     string,
 *   description:   string|null,
 *   mime_type:     string|null,
 *   size:          number|null,
 *   scribble_url:  string|null,
 *   embed_url:     string|null,
 *   last_modified: Date|null,
 * }>} rows
 * @returns {Array<{ folderName: string, files: object[] }>}
 */
function groupMapFilesIntoSections(rows) {
    /** @type {Map<string, object[]>} */
    const byFolder = new Map();

    for (const row of rows) {
        const files = byFolder.get(row.folder_name) || [];
        files.push({
            name:         row.file_name,
            description:  row.description,
            webUrl:       `/maps/file/${encodeURIComponent(row.blob_name)}`,
            mimeType:     row.mime_type,
            lastModified: row.last_modified,
            size:         row.size,
            scribbleUrl:  row.scribble_url,
            embedUrl:     row.embed_url,
        });
        byFolder.set(row.folder_name, files);
    }

    return Array.from(byFolder.entries()).map(([folderName, files]) => ({ folderName, files }));
}

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
     * Lists synced Maps resource files, grouped into folder sections.
     * Requires `viewMaps` permission.
     */
    router.get(
        "/maps",
        requirePermission("viewMaps"),
        csrfProtection,
        async (req, res) => {
            const role = req.session?.userRole || "NON_REGISTERED";
            const permissions = req.session?.permissions || PERMISSIONS;
            const canSync = can(permissions, role, "accessAdminConsole");

            let sections = [];
            let loadError = null;

            try {
                const rows = await getMapFiles();
                sections = groupMapFilesIntoSections(rows);
            } catch (err) {
                logError("[GET /maps] DB error:", err);
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
                canSync,
            });
        },
    );

    /**
     * GET /maps/file/:blobName
     * Streams a synced map file from Blob Storage. Requires `viewMaps`
     * permission, matching the page's own access gate.
     */
    router.get(
        "/maps/file/:blobName",
        requirePermission("viewMaps"),
        async (req, res) => {
            const { blobName } = req.params;
            if (!blobName || /[/\\]/.test(blobName)) {
                return res.status(400).send("Invalid file name.");
            }
            try {
                await streamMapFileToResponse(blobName, res);
            } catch (err) {
                logError("[GET /maps/file/:blobName]", err);
                if (!res.headersSent) return res.status(404).send("File not found.");
            }
        },
    );

    /**
     * POST /api/maps/sync
     * Triggers an on-demand sync from SharePoint into Blob Storage.
     * Requires `accessAdminConsole` permission.
     */
    router.post(
        "/api/maps/sync",
        requirePermission("accessAdminConsole"),
        csrfProtection,
        async (req, res) => {
            try {
                const summary = await syncMapsFromOneDrive({ graphConfig });
                return res.json({ success: true, summary });
            } catch (err) {
                logError("[POST /api/maps/sync]", err);
                return res.status(500).json({ success: false, message: err.message });
            }
        },
    );

    return router;
}
