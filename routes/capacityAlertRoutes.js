/**
 * @file routes/capacityAlertRoutes.js
 * @description Admin CRUD routes for Capacity Alerts — dynamic
 * threshold-based SMS notifications tied to parking count locations.
 *
 * Page route (ASSISTANT_ADMIN+ — accessAdminConsole):
 *   GET  /oversight/tools/capacity-alerts
 *
 * API routes (ASSISTANT_ADMIN+ — accessAdminConsole):
 *   GET    /api/capacity-alerts             All rules
 *   POST   /api/capacity-alerts             Create a rule
 *   PUT    /api/capacity-alerts/:id         Update a rule
 *   DELETE /api/capacity-alerts/:id         Delete a rule
 *   PUT    /api/capacity-alerts/bulk-active Enable/disable multiple rules
 *   GET    /api/capacity-alerts/log         Recent send history
 *   GET    /api/capacity-alerts/kill-switch Global kill switch state
 *   PUT    /api/capacity-alerts/kill-switch Flip the global kill switch
 */

import express from "express";
import { requirePermission } from "../src/config/roles.js";
import {
  getActiveLocationsForYear,
  getAllCapacityAlertRules,
  createCapacityAlertRule,
  updateCapacityAlertRule,
  deleteCapacityAlertRule,
  bulkSetCapacityAlertRulesActive,
  getCapacityAlertLog,
  getCapacityAlertKillSwitch,
  setCapacityAlertKillSwitch,
} from "../lib/dbSync.js";

/**
 * Factory: build the capacity alerts router.
 *
 * @param {{
 *   csrfProtection: import('csurf').CsrfRequestHandler,
 *   logError:       (...args: any[]) => void,
 * }} deps
 * @returns {import('express').Router}
 */
export function capacityAlertRouter({ csrfProtection, logError }) {
  const router = express.Router();

  // ============================================================
  // Page route
  // ============================================================

  /**
   * GET /oversight/tools/capacity-alerts
   * Capacity Alerts management page. Requires ASSISTANT_ADMIN+ (accessAdminConsole).
   */
  router.get(
    "/oversight/tools/capacity-alerts",
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      try {
        const year = new Date().getFullYear();
        const locations = await getActiveLocationsForYear(year);
        res.render("capacityAlerts", {
          nav: res.locals.nav,
          userRole: req.session.userRole,
          userPermissions: res.locals.userPermissions,
          appVersion: res.locals.appVersion,
          csrfToken: req.csrfToken(),
          locations,
        });
      } catch (err) {
        logError("[GET /oversight/tools/capacity-alerts]", err);
        res.status(500).send("Failed to load capacity alerts page.");
      }
    },
  );

  // ============================================================
  // API routes
  // ============================================================

  /**
   * GET /api/capacity-alerts
   * Returns all capacity alert rules with location/sub-location names.
   *
   * @returns {{ rules: Array }}
   */
  router.get(
    "/api/capacity-alerts",
    requirePermission("accessAdminConsole"),
    async (req, res) => {
      try {
        const rules = await getAllCapacityAlertRules();
        res.json({ rules });
      } catch (err) {
        logError("[GET /api/capacity-alerts]", err);
        res.status(500).json({ error: "Failed to load capacity alert rules." });
      }
    },
  );

  /**
   * POST /api/capacity-alerts
   * Creates a new capacity alert rule.
   *
   * @param {{
   *   locationTaskId:   number,
   *   subLocationId:    number|null,
   *   thresholdType:    'percent'|'count',
   *   thresholdValue:   number,
   *   direction:        'above'|'below',
   *   recipientRole:    string,
   *   messageOverride?: string|null,
   * }} req.body
   * @returns {{ id: number }}
   */
  router.post(
    "/api/capacity-alerts",
    requirePermission("accessAdminConsole"),
    async (req, res) => {
      try {
        const {
          locationTaskId,
          subLocationId,
          thresholdType,
          thresholdValue,
          direction,
          recipientRole,
          messageOverride,
        } = req.body;

        if (
          !locationTaskId ||
          !thresholdType ||
          thresholdValue == null ||
          !direction ||
          !recipientRole
        ) {
          return res.status(400).json({ error: "Missing required fields." });
        }

        const { id } = await createCapacityAlertRule({
          locationTaskId: Number(locationTaskId),
          subLocationId: subLocationId != null ? Number(subLocationId) : null,
          thresholdType,
          thresholdValue: Number(thresholdValue),
          direction,
          recipientRole,
          messageOverride: messageOverride || null,
          createdBy: req.session.userId,
        });

        res.json({ id });
      } catch (err) {
        logError("[POST /api/capacity-alerts]", err);
        res.status(500).json({ error: "Failed to create rule." });
      }
    },
  );

  /**
   * PUT /api/capacity-alerts/:id
   * Updates an existing capacity alert rule. Resets is_armed to 1.
   *
   * @param {string} req.params.id
   * @returns {{ ok: true }}
   */
  router.put(
    "/api/capacity-alerts/:id",
    requirePermission("accessAdminConsole"),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        const {
          locationTaskId,
          subLocationId,
          thresholdType,
          thresholdValue,
          direction,
          recipientRole,
          messageOverride,
          active,
        } = req.body;

        if (
          !id ||
          !locationTaskId ||
          !thresholdType ||
          thresholdValue == null ||
          !direction ||
          !recipientRole
        ) {
          return res.status(400).json({ error: "Missing required fields." });
        }

        await updateCapacityAlertRule(id, {
          locationTaskId: Number(locationTaskId),
          subLocationId: subLocationId != null ? Number(subLocationId) : null,
          thresholdType,
          thresholdValue: Number(thresholdValue),
          direction,
          recipientRole,
          messageOverride: messageOverride || null,
          active: !!active,
        });

        res.json({ ok: true });
      } catch (err) {
        logError("[PUT /api/capacity-alerts/:id]", err);
        res.status(500).json({ error: "Failed to update rule." });
      }
    },
  );

  /**
   * DELETE /api/capacity-alerts/:id
   * Deletes a capacity alert rule.
   *
   * @param {string} req.params.id
   * @returns {{ ok: true }}
   */
  router.delete(
    "/api/capacity-alerts/:id",
    requirePermission("accessAdminConsole"),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (!id) {
          return res.status(400).json({ error: "id is required." });
        }
        await deleteCapacityAlertRule(id);
        res.json({ ok: true });
      } catch (err) {
        logError("[DELETE /api/capacity-alerts/:id]", err);
        res.status(500).json({ error: "Failed to delete rule." });
      }
    },
  );

  /**
   * GET /api/capacity-alerts/log
   * Returns the most recent capacity alert send attempts.
   *
   * @returns {{ log: Array }}
   */
  router.get(
    "/api/capacity-alerts/log",
    requirePermission("accessAdminConsole"),
    async (req, res) => {
      try {
        const log = await getCapacityAlertLog(100);
        res.json({ log });
      } catch (err) {
        logError("[GET /api/capacity-alerts/log]", err);
        res.status(500).json({ error: "Failed to load send history." });
      }
    },
  );

  /**
   * PUT /api/capacity-alerts/bulk-active
   * Sets the active flag on multiple rules at once, for the management
   * page's checkbox multi-select.
   *
   * @param {{ ids: number[], active: boolean }} req.body
   * @returns {{ ok: true }}
   */
  router.put(
    "/api/capacity-alerts/bulk-active",
    requirePermission("accessAdminConsole"),
    async (req, res) => {
      try {
        const { ids, active } = req.body;
        if (!Array.isArray(ids) || ids.length === 0 || typeof active !== "boolean") {
          return res.status(400).json({ error: "ids (array) and active (boolean) are required." });
        }
        await bulkSetCapacityAlertRulesActive(ids.map(Number), active);
        res.json({ ok: true });
      } catch (err) {
        logError("[PUT /api/capacity-alerts/bulk-active]", err);
        res.status(500).json({ error: "Failed to update rules." });
      }
    },
  );

  /**
   * GET /api/capacity-alerts/kill-switch
   * Returns the current state of the global kill switch.
   *
   * @returns {{ enabled: boolean, enabledBy: number|null, enabledAt: string|null }}
   */
  router.get(
    "/api/capacity-alerts/kill-switch",
    requirePermission("accessAdminConsole"),
    async (req, res) => {
      try {
        const state = await getCapacityAlertKillSwitch();
        res.json(state);
      } catch (err) {
        logError("[GET /api/capacity-alerts/kill-switch]", err);
        res.status(500).json({ error: "Failed to load kill switch state." });
      }
    },
  );

  /**
   * PUT /api/capacity-alerts/kill-switch
   * Flips the global kill switch. When enabled, evaluateCapacityAlerts()
   * sends nothing at all, regardless of individual rules' state.
   *
   * @param {{ enabled: boolean }} req.body
   * @returns {{ ok: true }}
   */
  router.put(
    "/api/capacity-alerts/kill-switch",
    requirePermission("accessAdminConsole"),
    async (req, res) => {
      try {
        const { enabled } = req.body;
        if (typeof enabled !== "boolean") {
          return res.status(400).json({ error: "enabled (boolean) is required." });
        }
        await setCapacityAlertKillSwitch(enabled, req.session.userId);
        res.json({ ok: true });
      } catch (err) {
        logError("[PUT /api/capacity-alerts/kill-switch]", err);
        res.status(500).json({ error: "Failed to update kill switch." });
      }
    },
  );

  return router;
}
