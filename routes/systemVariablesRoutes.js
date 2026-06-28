/**
 * @file routes/systemVariablesRoutes.js
 * @description Routes for System Variables management and Location sub-location CRUD.
 *
 * System Variables page (ASSISTANT_ADMIN+ — accessAdminConsole):
 *   GET  /oversight/tools/system-variables
 *
 * System Variables API (ASSISTANT_ADMIN+ — accessAdminConsole):
 *   GET    /api/system-variables              All rows across all categories
 *   GET    /api/system-variables/:category    All rows for one category
 *   POST   /api/system-variables              Create a new entry
 *   PUT    /api/system-variables/:id          Update an entry
 *   DELETE /api/system-variables/:id          Delete (blocked if referenced)
 *
 * Sub-location management API (OVERSEER+ — manageShifts):
 *   GET    /api/locations/:locationTaskId/sub-locations           All sub-locations for a location
 *   POST   /api/locations/:locationTaskId/sub-locations           Create a sub-location
 *   PUT    /api/locations/sub-locations/:id                       Update a sub-location
 *   DELETE /api/locations/sub-locations/:id                       Delete a sub-location
 *   PUT    /api/locations/:locationTaskId/sub-locations/reorder   Bulk reorder
 *   PUT    /api/locations/:locationTaskId/classification          Set classification
 */

import express from 'express';
import { requirePermission } from '../src/config/roles.js';
import {
    getAllSystemVariables,
    getSystemVariableList,
    createSystemVariable,
    updateSystemVariable,
    checkSystemVariableRefs,
    deleteSystemVariable,
    setLocationClassification,
    getSubLocationsForLocation,
    createSubLocation,
    updateSubLocation,
    deleteSubLocation,
    reorderSubLocations,
} from '../lib/dbSync.js';

/**
 * Factory: build the system variables + sub-locations router.
 *
 * @param {{
 *   csrfProtection: import('csurf').CsrfRequestHandler,
 *   logError:       (...args: any[]) => void,
 * }} deps
 * @returns {import('express').Router}
 */
export function systemVariablesRouter({ csrfProtection, logError }) {
    const router = express.Router();

    // ============================================================
    // Page route
    // ============================================================

    /**
     * GET /oversight/tools/system-variables
     * System Variables management page. Requires ASSISTANT_ADMIN+ (accessAdminConsole).
     */
    router.get(
        '/oversight/tools/system-variables',
        requirePermission('accessAdminConsole'),
        csrfProtection,
        (req, res) => {
            res.render('systemVariables', {
                nav:             res.locals.nav,
                userRole:        req.session.userRole,
                userPermissions: res.locals.userPermissions,
                appVersion:      res.locals.appVersion,
                csrfToken:       req.csrfToken(),
            });
        }
    );

    // ============================================================
    // System Variables API
    // ============================================================

    /**
     * GET /api/system-variables
     * Returns all system variable rows across all categories.
     * Used to hydrate the System Variables management page on load.
     *
     * @returns {{ variables: SystemVariableRow[] }}
     */
    router.get(
        '/api/system-variables',
        requirePermission('accessAdminConsole'),
        async (req, res) => {
            try {
                const variables = await getAllSystemVariables();
                res.json({ variables });
            } catch (err) {
                logError('[GET /api/system-variables]', err);
                res.status(500).json({ error: 'Failed to load system variables.' });
            }
        }
    );

    /**
     * GET /api/system-variables/:category
     * Returns all rows for a single category.
     * Used by dropdowns on the Locations page (classifications + sub-types).
     *
     * @returns {{ variables: SystemVariableRow[] }}
     */
    router.get(
        '/api/system-variables/:category',
        requirePermission('manageShifts'),
        async (req, res) => {
            try {
                const variables = await getSystemVariableList(req.params.category);
                res.json({ variables });
            } catch (err) {
                logError('[GET /api/system-variables/:category]', err);
                res.status(500).json({ error: 'Failed to load system variable list.' });
            }
        }
    );

    /**
     * POST /api/system-variables
     * Create a new system variable entry. Active by default.
     *
     * @param {{ category: string, displayName: string, parentId?: number|null, displayOrder?: number }} req.body
     * @returns {{ id: number, variable: SystemVariableRow }}
     */
    router.post(
        '/api/system-variables',
        requirePermission('accessAdminConsole'),
        async (req, res) => {
            try {
                const { category, displayName, parentId, displayOrder } = req.body;

                if (!category || !displayName?.trim()) {
                    return res.status(400).json({ error: 'category and displayName are required.' });
                }

                const id = await createSystemVariable({
                    category,
                    displayName,
                    parentId:     parentId ?? null,
                    displayOrder: displayOrder ?? 0,
                });

                // Return the full row so the client can update its list without a reload.
                const [variable] = (await getSystemVariableList(category))
                    .filter(v => v.id === id);

                res.status(201).json({ id, variable });
            } catch (err) {
                logError('[POST /api/system-variables]', err);
                res.status(500).json({ error: 'Failed to create system variable.' });
            }
        }
    );

    /**
     * PUT /api/system-variables/:id
     * Update an existing system variable entry.
     *
     * @param {{ displayName: string, parentId?: number|null, displayOrder?: number, active: boolean }} req.body
     * @returns {{ ok: true }}
     */
    router.put(
        '/api/system-variables/:id',
        requirePermission('accessAdminConsole'),
        async (req, res) => {
            try {
                const id = Number(req.params.id);
                const { displayName, parentId, displayOrder, active } = req.body;

                if (!id || !displayName?.trim()) {
                    return res.status(400).json({ error: 'id and displayName are required.' });
                }

                await updateSystemVariable(id, {
                    displayName,
                    parentId:     parentId ?? null,
                    displayOrder: displayOrder ?? 0,
                    active:       !!active,
                });

                res.json({ ok: true });
            } catch (err) {
                logError('[PUT /api/system-variables/:id]', err);
                res.status(500).json({ error: 'Failed to update system variable.' });
            }
        }
    );

    /**
     * DELETE /api/system-variables/:id
     * Delete a system variable entry.
     * Blocked with 409 if the entry is referenced by locations, sub-locations,
     * or active child entries in the same table.
     *
     * @returns {{ ok: true, rowsDeleted: number }}
     */
    router.delete(
        '/api/system-variables/:id',
        requirePermission('accessAdminConsole'),
        async (req, res) => {
            try {
                const id = Number(req.params.id);
                if (!id) return res.status(400).json({ error: 'id is required.' });

                const refs = await checkSystemVariableRefs(id);

                if (refs.locCount > 0 || refs.subCount > 0 || refs.childCount > 0) {
                    return res.status(409).json({
                        error:      'Cannot delete — this value is still in use.',
                        locCount:   refs.locCount,
                        subCount:   refs.subCount,
                        childCount: refs.childCount,
                    });
                }

                const deleted = await deleteSystemVariable(id);
                res.json({ ok: true, rowsDeleted: deleted ? 1 : 0 });
            } catch (err) {
                logError('[DELETE /api/system-variables/:id]', err);
                res.status(500).json({ error: 'Failed to delete system variable.' });
            }
        }
    );

    // ============================================================
    // Location Classification API
    // ============================================================

    /**
     * PUT /api/locations/:locationTaskId/classification
     * Set or clear the classification on a location.
     * Requires manageShifts (OVERSEER+). Changing classification never
     * touches existing sub-locations — admin cleans up manually if needed.
     *
     * @param {{ classificationId: number|null }} req.body
     * @returns {{ ok: true }}
     */
    router.put(
        '/api/locations/:locationTaskId/classification',
        requirePermission('manageShifts'),
        async (req, res) => {
            try {
                const locationTaskId   = Number(req.params.locationTaskId);
                const { classificationId } = req.body;

                if (!locationTaskId) {
                    return res.status(400).json({ error: 'locationTaskId is required.' });
                }

                await setLocationClassification(
                    locationTaskId,
                    classificationId != null ? Number(classificationId) : null
                );

                res.json({ ok: true });
            } catch (err) {
                logError('[PUT /api/locations/:locationTaskId/classification]', err);
                res.status(500).json({ error: 'Failed to update classification.' });
            }
        }
    );

    // ============================================================
    // Sub-location management API
    // ============================================================

    /**
     * GET /api/locations/:locationTaskId/sub-locations
     * Returns all sub-locations (active and inactive) for the Locations management UI.
     *
     * @returns {{ subLocations: SubLocationRow[] }}
     */
    router.get(
        '/api/locations/:locationTaskId/sub-locations',
        requirePermission('manageShifts'),
        async (req, res) => {
            try {
                const locationTaskId = Number(req.params.locationTaskId);
                if (!locationTaskId) {
                    return res.status(400).json({ error: 'locationTaskId is required.' });
                }
                const subLocations = await getSubLocationsForLocation(locationTaskId);
                res.json({ subLocations });
            } catch (err) {
                logError('[GET /api/locations/:locationTaskId/sub-locations]', err);
                res.status(500).json({ error: 'Failed to load sub-locations.' });
            }
        }
    );

    /**
     * POST /api/locations/:locationTaskId/sub-locations
     * Create a new sub-location for a location.
     *
     * @param {{ name: string, subTypeId?: number|null, displayOrder?: number }} req.body
     * @returns {{ id: number, subLocation: SubLocationRow }}
     */
    router.post(
        '/api/locations/:locationTaskId/sub-locations',
        requirePermission('manageShifts'),
        async (req, res) => {
            try {
                const locationTaskId = Number(req.params.locationTaskId);
                const { name, subTypeId, displayOrder } = req.body;

                if (!locationTaskId || !name?.trim()) {
                    return res.status(400).json({ error: 'locationTaskId and name are required.' });
                }

                const id = await createSubLocation({
                    locationTaskId,
                    name,
                    subTypeId:    subTypeId    ?? null,
                    displayOrder: displayOrder ?? 0,
                });

                const subLocations = await getSubLocationsForLocation(locationTaskId);
                const subLocation  = subLocations.find(s => s.id === id) ?? null;

                res.status(201).json({ id, subLocation });
            } catch (err) {
                logError('[POST /api/locations/:locationTaskId/sub-locations]', err);
                res.status(500).json({ error: 'Failed to create sub-location.' });
            }
        }
    );

    /**
     * PUT /api/locations/sub-locations/:id
     * Update a sub-location's name, type, order, or active flag.
     *
     * @param {{ name: string, subTypeId?: number|null, displayOrder?: number, active: boolean }} req.body
     * @returns {{ ok: true }}
     */
    router.put(
        '/api/locations/sub-locations/:id',
        requirePermission('manageShifts'),
        async (req, res) => {
            try {
                const id = Number(req.params.id);
                const { name, subTypeId, displayOrder, active } = req.body;

                if (!id || !name?.trim()) {
                    return res.status(400).json({ error: 'id and name are required.' });
                }

                await updateSubLocation(id, {
                    name,
                    subTypeId:    subTypeId    ?? null,
                    displayOrder: displayOrder ?? 0,
                    active:       !!active,
                });

                res.json({ ok: true });
            } catch (err) {
                logError('[PUT /api/locations/sub-locations/:id]', err);
                res.status(500).json({ error: 'Failed to update sub-location.' });
            }
        }
    );

    /**
     * DELETE /api/locations/sub-locations/:id
     * Delete a sub-location. Count records that referenced it have their
     * sub_location_id set to NULL via the FK's ON DELETE SET NULL — no data loss.
     *
     * @returns {{ ok: true }}
     */
    router.delete(
        '/api/locations/sub-locations/:id',
        requirePermission('manageShifts'),
        async (req, res) => {
            try {
                const id = Number(req.params.id);
                if (!id) return res.status(400).json({ error: 'id is required.' });

                await deleteSubLocation(id);
                res.json({ ok: true });
            } catch (err) {
                logError('[DELETE /api/locations/sub-locations/:id]', err);
                res.status(500).json({ error: 'Failed to delete sub-location.' });
            }
        }
    );

    /**
     * PUT /api/locations/:locationTaskId/sub-locations/reorder
     * Bulk-update display_order for a location's sub-locations.
     *
     * @param {{ orderedIds: number[] }} req.body  IDs in the desired display order
     * @returns {{ ok: true }}
     */
    router.put(
        '/api/locations/:locationTaskId/sub-locations/reorder',
        requirePermission('manageShifts'),
        async (req, res) => {
            try {
                const locationTaskId = Number(req.params.locationTaskId);
                const { orderedIds } = req.body;

                if (!locationTaskId || !Array.isArray(orderedIds) || !orderedIds.length) {
                    return res.status(400).json({ error: 'locationTaskId and orderedIds[] are required.' });
                }

                await reorderSubLocations(locationTaskId, orderedIds.map(Number));
                res.json({ ok: true });
            } catch (err) {
                logError('[PUT /api/locations/:locationTaskId/sub-locations/reorder]', err);
                res.status(500).json({ error: 'Failed to reorder sub-locations.' });
            }
        }
    );

    return router;
}
