/**
 * @file lib/mapsSync.js
 * @description Background + on-demand sync job that copies map resource
 * files from the SharePoint/OneDrive folder (source of truth for admins
 * uploading maps) into Azure Blob Storage, so the /maps page never has
 * to link directly to SharePoint.
 *
 * Flow (syncMapsFromOneDrive):
 *   1. List the current SharePoint folder state via listOneDriveFolder().
 *   2. For each file: if it's new or its lastModifiedDateTime has changed
 *      since the last sync, download it via downloadOneDriveFileContent()
 *      and upload it to the maps-files blob container, then upsert its
 *      row in map_files.
 *   3. Any map_files row whose source_item_id is no longer present in the
 *      SharePoint listing is deleted, along with its blob (mirrors
 *      SharePoint exactly per team decision).
 *
 * A mutex guard prevents overlapping runs, matching the pattern used by
 * lib/alertScheduler.js for its polling tick().
 *
 * @module lib/mapsSync
 */

import { listOneDriveFolder, downloadOneDriveFileContent } from "./graphClient.js";
import { uploadMapFile, deleteMapFileBlob } from "./blobStorage.js";
import {
    getMapFiles,
    upsertMapFile,
    deleteMapFilesNotInSourceIds,
} from "./dbSync.js";

/**
 * @param {...any} args
 * @returns {void}
 */
function log(...args) {
    console.log(`[${new Date().toISOString()}] [lib/mapsSync]`, ...args);
}

/**
 * @param {...any} args
 * @returns {void}
 */
function logError(...args) {
    console.error(`[${new Date().toISOString()}] [lib/mapsSync]`, ...args);
}

/** Mutex flag preventing concurrent sync runs (interval + manual button). */
let _syncInFlight = false;

/**
 * Run one full sync pass: list SharePoint, diff against map_files,
 * download/upload changed files, and remove files no longer present
 * upstream.
 *
 * @param {{
 *   graphConfig: {
 *     tenantId:     string,
 *     clientId:     string,
 *     clientSecret: string,
 *     driveUser:    string,
 *     folderPath:   string,
 *   },
 * }} opts
 * @returns {Promise<{ added: number, updated: number, removed: number, unchanged: number }>}
 * @throws {Error} if a sync is already in flight, or if listing SharePoint fails.
 */
export async function syncMapsFromOneDrive({ graphConfig }) {
    if (_syncInFlight) {
        throw new Error("A Maps sync is already in progress.");
    }
    _syncInFlight = true;

    // graphConfig.folderPath is the shared "Documents for Distribution" root
    // used by every router (schedules, signs, lessons-learned, etc.); the
    // Maps files live in its "Maps" subfolder specifically, matching the
    // convention the pre-sync mapsRoutes.js used when calling Graph directly.
    const mapsGraphConfig = {
        ...graphConfig,
        folderPath: `${graphConfig.folderPath}/Maps`,
    };

    let added = 0;
    let updated = 0;
    let removed = 0;
    let unchanged = 0;

    try {
        const sections = await listOneDriveFolder(mapsGraphConfig);

        // Build a lookup of what's already tracked, keyed by source_item_id,
        // so we can tell new vs. changed vs. unchanged apart by comparing
        // lastModifiedDateTime rather than re-downloading everything.
        const existingRows = await getMapFiles();
        /** @type {Map<string, Date|null>} */
        const existingByIdLastModified = new Map(
            existingRows.map((r) => [r.source_item_id, r.last_modified ? new Date(r.last_modified) : null]),
        );
        const seenIds = [];

        for (const section of sections) {
            for (const file of section.files) {
                seenIds.push(file.id);

                const isTracked = existingByIdLastModified.has(file.id);
                const trackedLastModified = existingByIdLastModified.get(file.id);
                const sourceLastModified = file.lastModified ? new Date(file.lastModified) : null;

                const isNew = !isTracked;
                const isChanged =
                    isTracked &&
                    sourceLastModified &&
                    (!trackedLastModified || sourceLastModified.getTime() !== trackedLastModified.getTime());

                if (isNew || isChanged) {
                    try {
                        const buffer = await downloadOneDriveFileContent(file.id, mapsGraphConfig);
                        const blobName = await uploadMapFile(
                            file.id,
                            file.name,
                            buffer,
                            file.mimeType,
                        );
                        await upsertMapFile({
                            sourceItemId: file.id,
                            folderName:   section.folderName,
                            fileName:     file.name,
                            blobName,
                            description:  file.description,
                            mimeType:     file.mimeType,
                            size:         file.size,
                            scribbleUrl:  file.scribbleUrl,
                            embedUrl:     file.embedUrl,
                            lastModified: file.lastModified,
                        });
                        if (isNew) added++;
                        else updated++;
                    } catch (err) {
                        logError(`Failed to sync file "${file.name}":`, err.message);
                    }
                } else {
                    unchanged++;
                }
            }
        }

        const deletedRows = await deleteMapFilesNotInSourceIds(seenIds);
        for (const row of deletedRows) {
            try {
                await deleteMapFileBlob(row.blob_name);
            } catch (err) {
                logError(`Failed to delete blob "${row.blob_name}":`, err.message);
            }
        }
        removed = deletedRows.length;

        log(`Sync complete: ${added} added, ${updated} updated, ${unchanged} unchanged, ${removed} removed.`);
        return { added, updated, removed, unchanged };
    } finally {
        _syncInFlight = false;
    }
}

/**
 * Start a recurring background sync on a fixed interval. Errors from an
 * individual run are logged but do not stop future ticks.
 *
 * @param {{
 *   graphConfig: {
 *     tenantId:     string,
 *     clientId:     string,
 *     clientSecret: string,
 *     driveUser:    string,
 *     folderPath:   string,
 *   },
 *   intervalMs?: number,
 * }} opts
 * @returns {{ stop: () => void }}
 */
export function startMapsSyncInterval({ graphConfig, intervalMs = 30 * 60 * 1000 }) {
    const timer = setInterval(async () => {
        try {
            await syncMapsFromOneDrive({ graphConfig });
        } catch (err) {
            logError("Scheduled sync failed:", err.message);
        }
    }, intervalMs);

    log(`Maps sync interval started (every ${Math.round(intervalMs / 60000)} min).`);

    return {
        stop() {
            clearInterval(timer);
        },
    };
}
