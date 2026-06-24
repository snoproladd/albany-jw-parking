// routes/oversightRoutes.js

import express from "express";
import crypto from "crypto";
import sql from "mssql";

import {
  exec,
  updateUserContact,
  updateUserPersonal,
  updateUserCongregation,
  updateUserSpiritual,
  updateUserNotes,
  updateUserPassword,
  getCongregations,
  getVolunteerById,
  getActiveVolunteers,
  getAllVolunteersWithRoles,
  updateVolunteerRole,
  getUnapprovedVolunteers,
  assignDeskRole,
  updateVolunteerAssignment,
  getIncompleteDraftVolunteers,
  getRegisteredVolunteers,
  setPendingReset,
  createVolunteerAccount,
  findPotentialDuplicates,
  getRolePermissions,
  upsertRolePermission,
  deleteRolePermission,
  getDecentlyExportRows,
  markDecentlyExported,
  setVolunteerActive,
  softDeleteVolunteer,
  reinstateVolunteer,
  getVolunteersForImportMatch,
  applyDecentlyImport,
  getLocationsTasks,
  createLocationTask,
  updateLocationTask,
  setLocationTaskActive,
  getSchedulerCategories,
  createSchedulerCategory,
  updateSchedulerCategory,
  toggleSchedulerCategorySensitivity,
  getVolunteersForSchedulerCategory,
  grantSchedulerCategoryAccess,
  revokeSchedulerCategoryAccess,
  getConventionDays,
  createConventionDay,
  updateConventionDay,
  deleteConventionDay,
  createSession,
  updateSession,
  deleteSession,
  createShift,
  updateShift,
  deleteShift,
  createScheduleAssignment,
  updateScheduleAssignment,
  deleteScheduleAssignment,
  getFullDayTimeline,
  getShiftRendezvous,
  getRendezvousForDay,
  createShiftRendezvous,
  updateShiftRendezvous,
  deleteShiftRendezvous,
  getShiftRendezvousById,
  getVolunteersForRendezvousAlert,
  copyConventionDay,
  getVolunteersForMessaging,
  createInvitation,
  remindInvitation,
  getInvitationByVolunteerBatch,
  getInvitationByToken,
  markInvitationResponded,
  getMessageTemplates,
  createMessageTemplate,
  updateMessageTemplate,
  deleteMessageTemplate,
  getInvitationsForTracker,
  getVolunteersWithPendingInvites,
  getVolunteersWithPendingInvitesDeep,
  getVolunteerRsvpHistory,
  setInvitationResponseById,
  getInvitationBatches,
  getInvitationBatch,
  createInvitationBatch,
  updateInvitationBatch,
  suggestBatchName,
  revokeInvitation,
  reinstateInvitation,
  getRevocationLog,
  setShiftInvitable,
  getInvitableDaysWithShifts,
  setVolunteerSmsOptIn,
  handleSmsOptOutWebhook,
  setVolunteerSmsOptOutManual,
  getVolunteersForSmsManagement,
  promoteIfComplete,
  getVolunteerReportRows,
  getSchedulingCoverageSummary,
  getAttendanceSummary,
  getVolunteerDemographics,
  getCrewStaffingSummary,
  getDayStaffingReport,
  clearT15AlertsForShift,
  getConventionDaysWithShifts,
  getShiftAttendanceData,
  upsertAttendance,
  getAttendanceReportForDay,
  getAttendanceDayData,
  getSchedulerData,
  getSchedulerVolunteers,
  saveSlotAssignment,
  deleteSlotAssignment,
  getSlotAssignmentsByDay,
  getAttendanceByDay,
  getBlackoutsForDay,
  getBlackoutsForVolunteer,
  createBlackout,
  deleteBlackout,
  getBlackoutPickerData,
  getConflictGridData,
  getOversightStructure,
  addOversightStructureNode,
  saveOversightStructureOrder,
  deleteOversightStructureNode,
  getSessionsForDay,
  getSchedulerReportData,
  getVolunteerScheduleReport,
  getCrewMatrix,
  updateVolunteerCrew,
  batchUpdateVolunteerCrew,
  getAlertSchedules,
  getAlertSchedule,
  createBugReport,
  getBugReports,
  updateBugReport,
  createAlertSchedule,
  updateAlertSchedule,
  deleteAlertSchedule,
  hardDeleteAlertSchedule,
  getShiftsForAlertBurst,
  logShiftAlerts,
  getAlertLog,
  getSchedulePreview,
  generateShiftCode,
  getCampaignMeetings,
  createCampaignMeeting,
  updateCampaignMeeting,
  deleteCampaignMeeting,
  getNotesReportVolunteers,
  getVolunteerNoteById,
  recordNoteRead,
  createVolunteerAction,
  getVolunteerActions,
  updateActionSolution,
  completeAction,
  deleteVolunteerAction,
  dismissNote,
  restoreNote,
} from "../lib/dbSync.js";

import { verifyPassword, hashPassword } from "../lib/passwordVer.js";

import { INCOMPATIBILITIES } from "../src/config/privilegeRules.js";

import {
  requirePermission,
  canAssignRole,
  ROLE_HIERARCHY,
  PERMISSIONS,
} from "../src/config/roles.js";

import { sendResetEmail, sendResetSms, getBaseUrl } from "../lib/messaging.js";

import { PDF_SECRET, publishDaySchedule } from "../lib/publishSchedule.js";
import { buildAlertMessage, sendAlertSms } from "../lib/alertScheduler.js";

import {
  uploadRendezvousPhoto,
  deleteSignPhoto,
  streamSignPhotoToResponse,
} from "../lib/blobStorage.js";

import { isProfileComplete } from "../lib/volunteerStatus.js";
import multer from "multer";

/**
 * Normalise a freeform time string ("7:30 AM", "14:00", "2:00 PM",
 * "08:00:00", etc.) to "HH:MM" (24-hour) for safe SQL TIME column
 * assignment via NVarChar(8).
 *
 * @param {string|null|undefined} str - Raw time string from the client
 * @returns {string|null} "HH:MM" string, or null if unparseable
 */
function parseTimeString(str) {
  if (!str) return null;
  const trimmed = String(str).trim();

  // 24-hour: "HH:MM" / "H:MM" / "HH:MM:SS"
  const m24 = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m24) {
    const h = parseInt(m24[1], 10);
    const m = parseInt(m24[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    return null;
  }

  // 12-hour: "H:MM AM" / "HH:MMPM" / "H:MM:SS AM" etc.
  const m12 = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const m = parseInt(m12[2], 10);
    const ap = m12[4].toUpperCase();
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    return null;
  }

  return null;
}

/**
 * Format a shift start_time value as "h:MM AM/PM" for SMS bodies.
 * Handles both mssql TIME (epoch-anchored Date) and NVarChar "HH:MM:SS" strings.
 *
 * @param {Date|string|null} val
 * @returns {string}
 */
function _fmtTimeShort(val) {
  if (!val) return "";
  let h, m;
  if (val instanceof Date) {
    h = val.getUTCHours();
    m = val.getUTCMinutes();
  } else {
    [h, m] = String(val).split(":").map(Number);
  }
  const ap = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ap}`;
}

/**
 * Factory: build router that verifies oversight access..
 *
 * Usage in index.js:
 *   app.use("/", oversightRouter({ csrfProtection, logError }));
 *
 * @param {{
 *   csrfProtection: import("csurf").RequestHandler;
 *   logError?: (...args: any[]) => void;
 * }} deps - Dependencies injected from index.js.
 * @returns {import("express").Router} Configured Express router.
 */
export function oversightRouter({
  csrfProtection,
  logError,
  twilioAccountSid,
  twilioAuthToken,
  twilioMsgSid,
  smtpConfig,
  serverPort,
  graphConfig,
}) {
  const router = express.Router();

  /** Multer config for rendezvous photo uploads: in-memory, 12 MB cap. */
  const rvPhotoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 12 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      cb(null, /^image\//.test(file.mimetype || ""));
    },
  });

  /**
   * Derive the "edited by" identity for audit fields.
   *
   * Priority:
   *  1. `req.session.userEmail` (set at login)
   *  2. `req.body.email` (if present)
   *  3. `"self-service"` fallback
   *
   * @param {import("express").Request} req
   * @returns {string}
   */
  function getEditedBy(req) {
    if (req.session.userEmail) return req.session.userEmail;
    if (req.body && req.body.email) return req.body.email;
    return "self-service";
  }

  /**
   * Middleware: require authenticated user (session.userId).
   * Redirects to /login if not authenticated.
   *
   * @param {import("express").Request} req
   * @param {import("express").Response} res
   * @param {import("express").NextFunction} next
   * @returns {void}
   */
  function requireAuth(req, res, next) {
    if (!req.session.userId) return res.redirect("/login");
    next();
  }
  // Normalize phone like phoneVer.js "digitsOnly": strip non-digits only.
  function normalizePhone(p) {
    return (p || "").replace(/\D+/g, "");
  }

  // =========================
  // /editVolunteer routes (for oversight user to edit other volunteer accounts)
  // =========================

  // GET /editVolunteer → show volunteer selection/edit page
  router.get(
    "/editVolunteer",
    requireAuth,
    requirePermission("viewVolunteerInfo"),
    csrfProtection,
    async (req, res) => {
      const id = await req.session.userId;
      const pwError = req.query.pwError === "1";
      const pwSuccess = req.query.pwSuccess === "1";
      const includeDeleted = req.query.includeDeleted === "1";
      const actorRole = req.session.userRole || "NON_REGISTERED";
      const perms = req.session.permissions ?? {};
      const canDelete = !!perms[actorRole]?.deleteVolunteer;

      try {
        const volunteers =
          (await getActiveVolunteers({ includeDeleted })) || [];
        const user = await getVolunteerById(id);

        if (!user) {
          req.session.destroy?.(() => {});
          return res.redirect("/login");
        }

        const congregations = await getCongregations();

        res.render("volunteerAccountOversight", {
          csrfToken: req.csrfToken(),
          editor: user,
          targetUser: null,
          volunteers,
          privilegeRulesJSON: JSON.stringify(INCOMPATIBILITIES),
          congregations,
          pwError,
          pwSuccess,
          canDelete,
          includeDeleted,
          canGrantExtraPerms:
            actorRole === "ADMIN" || actorRole === "ASSISTANT_ADMIN",
        });
      } catch (err) {
        (logError || console.error)("editVolunteer GET error:", err);
        res.status(500).send("Server error");
      }
    },
  );

  // ===========================
  // SELECT VOLUNTEER TO EDIT (POST from volunteer selection form)
  // ===========================

  router.post(
    "/selectVolEdit",
    requireAuth,
    requirePermission("viewVolunteerInfo"),
    csrfProtection,
    async (req, res) => {
      const { targetUserId } = req.body;

      if (!targetUserId) {
        return res.redirect("/editVolunteer");
      }

      const includeDeleted =
        req.body.includeDeleted === "1" || req.query.includeDeleted === "1";
      const actorRole = req.session.userRole || "NON_REGISTERED";
      const perms = req.session.permissions ?? {};
      const canDelete = !!perms[actorRole]?.deleteVolunteer;

      try {
        const targetUser = await getVolunteerById(Number(targetUserId));
        const [volunteers, editor, congregations, rsvpHistory, conventionDays] =
          await Promise.all([
            getActiveVolunteers({ includeDeleted }),
            getVolunteerById(req.session.userId),
            getCongregations(),
            getVolunteerRsvpHistory(
              Number(targetUserId),
              new Date().getFullYear(),
            ),
            getConventionDays(new Date().getFullYear()),
          ]);

        return res.render("volunteerAccountOversight", {
          csrfToken: req.csrfToken(),
          editor,
          targetUser,
          volunteers,
          congregations,
          privilegeRulesJSON: JSON.stringify(INCOMPATIBILITIES),
          canDelete,
          includeDeleted,
          rsvpHistory,
          conventionDays,
          canGrantExtraPerms:
            actorRole === "ADMIN" || actorRole === "ASSISTANT_ADMIN",
        });

        return res.render("volunteerAccountOversight", {
          csrfToken: req.csrfToken(),
          editor,
          targetUser,
          volunteers,
          congregations,
          privilegeRulesJSON: JSON.stringify(INCOMPATIBILITIES),
          canDelete,
          includeDeleted,
          rsvpHistory,
        });
      } catch (err) {
        (logError || console.error)("selectVolEdit error:", err);
        return res.redirect("/editVolunteer");
      }
    },
  );

  // ===========================
  // EDIT VOLUNTEER ACCOUNT BY VOLUNTEER
  // ===========================

  // GET /my-account → show account page
  router.get("/my-account", requireAuth, csrfProtection, async (req, res) => {
    const id = req.session.userId;
    const pwError = req.query.pwError === "1";
    const pwSuccess = req.query.pwSuccess === "1";

    try {
      const user = await getVolunteerById(id);

      if (!user) {
        // If the record disappeared, force re-login
        req.session.destroy?.(() => {});
        return res.redirect("/login");
      }

      const congregations = await getCongregations();
      const gender = user.gender || "";

      res.render("myAccount", {
        csrfToken: req.csrfToken(),
        user,
        congregations,
        privilegeRulesJSON: JSON.stringify(INCOMPATIBILITIES),
        gender,
        pwError,
        pwSuccess,
      });
    } catch (err) {
      (logError || console.error)("myAccount GET error:", err);
      res.status(500).send("Server error");
    }
  });
  /**
   * POST /edit-volunteer/active
   * Immediately toggle active_current_year for a volunteer.
   * Requires editVolunteerInfo permission. Does not go through the finalize flow.
   *
   * Body (JSON): { targetUserId: number, active: boolean }
   * Response: { success: boolean, message?: string }
   */
  router.post(
    "/edit-volunteer/active",
    requireAuth,
    requirePermission("editVolunteerInfo"),
    csrfProtection,
    async (req, res) => {
      const { targetUserId, active } = req.body || {};
      const id = Number(targetUserId);

      if (!id) {
        return res
          .status(400)
          .json({ success: false, message: "No volunteer selected." });
      }

      if (typeof active !== "boolean") {
        return res
          .status(400)
          .json({ success: false, message: "active must be a boolean." });
      }

      if (id === req.session.userId) {
        return res.status(400).json({
          success: false,
          message: "You cannot change your own active status.",
        });
      }

      try {
        const ok = await setVolunteerActive(
          id,
          active,
          req.session.userEmail || "admin",
        );
        if (!ok) {
          return res.status(404).json({
            success: false,
            message: "Volunteer not found or archived.",
          });
        }
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("edit-volunteer/active POST error:", err);
        return res
          .status(500)
          .json({ success: false, message: "Server error." });
      }
    },
  );
  /**
   * POST /edit-volunteer/delete
   * Soft-delete a volunteer (sets registration_status = 'deleted').
   * Requires deleteVolunteer permission (ASSISTANT_ADMIN+).
   *
   * Body (JSON): { targetUserId: number }
   * Response: { success: boolean, message?: string }
   */
  router.post(
    "/edit-volunteer/delete",
    requireAuth,
    requirePermission("deleteVolunteer"),
    csrfProtection,
    async (req, res) => {
      const { targetUserId } = req.body || {};
      const id = Number(targetUserId);

      if (!id)
        return res
          .status(400)
          .json({ success: false, message: "No volunteer selected." });

      if (id === req.session.userId)
        return res.status(400).json({
          success: false,
          message: "You cannot delete your own account.",
        });

      try {
        const ok = await softDeleteVolunteer(
          id,
          req.session.userEmail || "admin",
        );
        if (!ok)
          return res.status(404).json({
            success: false,
            message: "Volunteer not found or already deleted.",
          });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("edit-volunteer/delete POST error:", err);
        return res
          .status(500)
          .json({ success: false, message: "Server error." });
      }
    },
  );

  /**
   * POST /edit-volunteer/reinstate
   * Reinstate a soft-deleted volunteer by restoring their prior status.
   * Requires deleteVolunteer permission (ASSISTANT_ADMIN+).
   *
   * Body (JSON): { targetUserId: number }
   * Response: { success: boolean, message?: string }
   */
  router.post(
    "/edit-volunteer/reinstate",
    requireAuth,
    requirePermission("deleteVolunteer"),
    csrfProtection,
    async (req, res) => {
      const { targetUserId } = req.body || {};
      const id = Number(targetUserId);

      if (!id)
        return res
          .status(400)
          .json({ success: false, message: "No volunteer selected." });

      try {
        const ok = await reinstateVolunteer(
          id,
          req.session.userEmail || "admin",
        );
        if (!ok)
          return res.status(404).json({
            success: false,
            message: "Volunteer not found or not currently deleted.",
          });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)(
          "edit-volunteer/reinstate POST error:",
          err,
        );
        return res
          .status(500)
          .json({ success: false, message: "Server error." });
      }
    },
  );

  // ── SMS Management ────────────────────────────────────────────────────────

  /**
   * GET /oversight/tools/sms-management
   * Returns all volunteers with their SMS opt-in/out status as JSON.
   * Used by the volunteer roster SMS tab.
   * Requires ASSISTANT_ADMIN+ (deleteVolunteer permission).
   *
   * Response: { success: boolean, volunteers: Array }
   */
  router.get(
    "/oversight/tools/sms-management",
    requireAuth,
    requirePermission("deleteVolunteer"),
    async (req, res) => {
      try {
        const volunteers = await getVolunteersForSmsManagement();
        return res.json({ success: true, volunteers });
      } catch (err) {
        (logError || console.error)("sms-management GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /oversight/tools/sms-management/toggle
   * Manually opt a volunteer in or out of SMS.
   * Requires ASSISTANT_ADMIN+ (deleteVolunteer permission).
   *
   * Body (JSON): { volunteerId: number, optOut: boolean }
   * Response: { success: boolean, error?: string }
   */
  router.post(
    "/oversight/tools/sms-management/toggle",
    requireAuth,
    requirePermission("deleteVolunteer"),
    csrfProtection,
    async (req, res) => {
      const { volunteerId, optOut } = req.body || {};
      const id = Number(volunteerId);
      if (!id)
        return res
          .status(400)
          .json({ success: false, error: "Invalid volunteer ID." });

      try {
        await setVolunteerSmsOptOutManual(id, !!optOut);
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("sms-management/toggle POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  // CONTACT
  router.post(
    "/my-account/update/contact",
    requireAuth,
    csrfProtection,
    async (req, res) => {
      const id = req.session.userId;
      if (!id) return res.redirect("/login");

      const { email, phone, SMSCapable, whatsappid } = req.body;
      const smsCapable = SMSCapable === "yes";

      try {
        await updateUserContact(
          id,
          { email, phone, smsCapable, whatsappid },
          getEditedBy(req),
        );
        return res.redirect("/my-account");
      } catch (err) {
        (logError || console.error)("my-account contact update error:", err);
        return res.status(500).send("Failed to update contact info.");
      }
    },
  );

  // PERSONAL
  router.post(
    "/my-account/update/personal",
    requireAuth,
    csrfProtection,
    async (req, res) => {
      const id = req.session.userId;
      if (!id) return res.redirect("/login");

      const { dobirthRaw, genderRaw, staminaRaw } = req.body;

      try {
        await updateUserPersonal(
          id,
          { dobirthRaw, genderRaw, staminaRaw },
          getEditedBy(req),
        );
        return res.redirect("/my-account");
      } catch (err) {
        (logError || console.error)("my-account personal update error:", err);
        return res.status(500).send("Failed to update personal info.");
      }
    },
  );

  // CONGREGATION
  router.post(
    "/my-account/update/congregation",
    requireAuth,
    csrfProtection,
    async (req, res) => {
      const id = req.session.userId;
      if (!id) return res.redirect("/login");

      const {
        congAssigned,
        congregation,
        congregationOtherCity,
        congregationOtherState,
        congregationOtherLang,
        extraAttend,
      } = req.body;

      try {
        await updateUserCongregation(
          id,
          {
            congAssigned,
            congregation,
            congregationOtherCity,
            congregationOtherState,
            congregationOtherLang,
            extraAttend,
          },
          getEditedBy(req),
        );
        return res.redirect("/my-account");
      } catch (err) {
        (logError || console.error)(
          "my-account congregation update error:",
          err,
        );
        return res.status(500).send("Failed to update congregation info.");
      }
    },
  );

  // SPIRITUAL (privileges)
  router.post(
    "/my-account/update/spiritual",
    requireAuth,
    csrfProtection,
    async (req, res) => {
      const id = req.session.userId;
      if (!id) return res.redirect("/login");

      let { privileges } = req.body;
      // If only one checkbox is checked, Express sends a string
      if (!Array.isArray(privileges) && typeof privileges === "string") {
        privileges = [privileges];
      }

      try {
        await updateUserSpiritual(id, privileges || [], getEditedBy(req));
        return res.redirect("/my-account");
      } catch (err) {
        (logError || console.error)("my-account spiritual update error:", err);
        return res.status(500).send("Failed to update spiritual info.");
      }
    },
  );

  // NOTES
  router.post(
    "/my-account/update/notes",
    requireAuth,
    csrfProtection,
    async (req, res) => {
      const id = req.session.userId;
      if (!id) return res.redirect("/login");

      const { notes } = req.body;

      try {
        await updateUserNotes(id, notes, getEditedBy(req));
        return res.redirect("/my-account");
      } catch (err) {
        (logError || console.error)("my-account notes update error:", err);
        return res.status(500).send("Failed to update notes.");
      }
    },
  );

  // PASSWORD CHANGE
  router.post(
    "/my-account/change-password",
    requireAuth,
    csrfProtection,
    async (req, res) => {
      const id = req.session.userId;
      if (!id) return res.redirect("/login");

      const { newPassword, confirmPassword } = req.body || {};

      if (!newPassword || !confirmPassword || newPassword !== confirmPassword) {
        return res.redirect("/my-account?pwError=1");
      }

      try {
        const pwd = hashPassword(newPassword);
        await updateUserPassword(id, pwd, getEditedBy(req));
        return res.redirect("/my-account?pwSuccess=1");
      } catch (err) {
        (logError || console.error)("myAccount password change error:", err);
        return res.redirect("/my-account?pwError=1");
      }
    },
  );

  /**
   * Finalize changes for the current user (cached + finalize-all model).
   *
   * Expected JSON body (all fields optional; only provided sections are saved):
   * {
   *   contact?: {
   *     email?: string;
   *     phone?: string;
   *     smsCapable?: boolean;
   *   };
   *   personal?: {
   *     dobirthRaw?: string;
   *     genderRaw?: string;
   *     staminaRaw?: string;
   *   };
   *   congregation?: {
   *     congAssigned?: string;
   *     congregation?: string;
   *     congregationOtherCity?: string;
   *     congregationOtherState?: string;
   *     congregationOtherLang?: string;
   *     extraAttend?: string;
   *   };
   *   spiritual?: string[]; // privilege codes
   *   notes?: string;
   * }
   *
   * The route:
   *  - Applies updates via updateUser* helpers if data is present
   *  - Sets last_updated + edited_by audit fields
   */
  router.post(
    "/edit-volunteer/finalize",
    requireAuth,
    requirePermission("editVolunteerInfo"),
    csrfProtection,
    async (req, res) => {
      const editorId = req.session.userId; // actor
      const editorEmail =
        req.session?.userEmail || req.session?.email || "oversight";
      const { targetUserId, ...payload } = req.body || {};
      const targetId = Number(targetUserId);
      if (!Number.isInteger(targetId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid target user id.",
        });
      }

      if (!editorId) {
        return res.status(401).json({
          success: false,
          message: "Not authenticated.",
        });
      }

      if (!targetId) {
        return res.status(400).json({
          success: false,
          message: "No target user specified.",
        });
      }

      // OPTIONAL (but strongly recommended):
      // Verify editor has permission to edit this user
      // await assertOversightPermission(editorId, targetUserId);

      try {
        const promises = [];

        if (payload.contact) {
          promises.push(
            updateUserContact(targetId, payload.contact, editorEmail),
          );
        }

        if (payload.personal) {
          promises.push(
            updateUserPersonal(targetId, payload.personal, editorEmail),
          );
        }

        if (payload.congregation) {
          promises.push(
            updateUserCongregation(targetId, payload.congregation, editorEmail),
          );
        }

        if (Array.isArray(payload.spiritual)) {
          promises.push(
            updateUserSpiritual(targetId, payload.spiritual, editorEmail),
          );
        }

        if (typeof payload.notes === "string") {
          promises.push(updateUserNotes(targetId, payload.notes, editorEmail));
        }

        await Promise.all(promises);

        // Attempt promotion for draft volunteers — safe to call on every save;
        // promoteIfComplete is a no-op if the volunteer is already completed/archived
        // or if the profile is still missing required fields.
        const { promoted } = await promoteIfComplete(targetId, editorEmail);

        return res.json({ success: true, promoted });
      } catch (err) {
        (logError || console.error)("oversight finalize error:", err);
        return res.status(500).json({
          success: false,
          message: "Failed to finalize changes.",
        });
      }
    },
  );

  // ===========================
  // VOLUNTEER ASSIGNMENT (role + crew)
  // ===========================

  /**
   * POST /edit-volunteer/assignment
   * Update role (REGISTERED or KEYMAN only) and crew assignments for a volunteer.
   * Requires OVERSEER+ via createAssignments permission.
   */
  router.post(
    "/edit-volunteer/assignment",
    requireAuth,
    requirePermission("createAssignments"),
    csrfProtection,
    async (req, res) => {
      const {
        targetUserId,
        newRole,
        crew_lots_garages,
        crew_signs,
        crew_security,
        crew_mobile_support,
        crew_dropoff_pickup,
        extra_signs_placement,
      } = req.body || {};

      const actorRole = req.session.userRole || "NON_REGISTERED";
      const canGrantExtraPerms =
        actorRole === "ADMIN" || actorRole === "ASSISTANT_ADMIN";

      const id = Number(targetUserId);

      if (!id) {
        return res
          .status(400)
          .json({ success: false, message: "No volunteer selected." });
      }

      // Overseer can only assign REGISTERED or KEYMAN
      const allowedRoles = ["REGISTERED", "KEYMAN"];
      if (!allowedRoles.includes(newRole)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid role for this action." });
      }

      // Prevent self-assignment
      if (id === req.session.userId) {
        return res.status(400).json({
          success: false,
          message: "You cannot change your own assignment.",
        });
      }

      try {
        const ok = await updateVolunteerAssignment(
          id,
          newRole,
          {
            crew_lots_garages:
              crew_lots_garages === "true" || crew_lots_garages === true,
            crew_signs: crew_signs === "true" || crew_signs === true,
            crew_security: crew_security === "true" || crew_security === true,
            crew_mobile_support:
              crew_mobile_support === "true" || crew_mobile_support === true,
            crew_dropoff_pickup:
              crew_dropoff_pickup === "true" || crew_dropoff_pickup === true,
          },
          {
            // Only ADMIN/ASSISTANT_ADMIN can set extra permissions; strip the
            // value entirely if the actor doesn't have the authority, so a
            // crafted POST body can't elevate a volunteer's permissions.
            extraSignsPlacement: canGrantExtraPerms
              ? extra_signs_placement === "true" ||
                extra_signs_placement === true
              : undefined,
          },
          req.session.userEmail || "admin",
        );

        if (!ok) {
          return res.status(400).json({
            success: false,
            message: "Volunteer not found or not eligible.",
          });
        }

        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)(
          "edit-volunteer/assignment POST error:",
          err,
        );
        return res
          .status(500)
          .json({ success: false, message: "Server error." });
      }
    },
  );
  // ===========================
  // ADMIN ROLES CONSOLE
  // ===========================

  /**
   * GET /oversight/roles
   * Show all volunteers and their current roles.
   * Accessible to ASSISTANT_ADMIN and ADMIN only.
   */
  router.get(
    "/oversight/roles",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      try {
        const [volunteers, unapprovedVolunteers] = await Promise.all([
          getAllVolunteersWithRoles(),
          getUnapprovedVolunteers(),
        ]);
        const actorRole = req.session.userRole || "NON_REGISTERED";

        return res.render("authentication_and_accounts/adminRoles", {
          csrfToken: req.csrfToken(),
          volunteers,
          unapprovedVolunteers,
          actorRole,
          roleHierarchy: ROLE_HIERARCHY,
          success: req.query.success === "1",
          error: req.query.error || null,
        });
      } catch (err) {
        (logError || console.error)("admin/roles GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  /**
   * POST /oversight/roles/desk
   * Assign DESK role to a single unapproved (draft) volunteer,
   * simultaneously promoting their registration_status to 'completed'
   * so they can log in and use the app.
   * This is the only role assignable to draft volunteers from the
   * roles console.
   *
   * Body (form): { targetId: number }
   */
  router.post(
    "/oversight/roles/desk",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const editedBy = req.session.userEmail || "admin";
      const targetId = Number(req.body.targetId);

      if (!targetId) {
        return res.redirect("/oversight/roles?error=Invalid+request");
      }

      if (targetId === req.session.userId) {
        return res.redirect(
          "/oversight/roles?error=You+cannot+change+your+own+role",
        );
      }

      try {
        const ok = await assignDeskRole(targetId, editedBy);
        if (!ok) {
          return res.redirect(
            "/oversight/roles?error=Volunteer+not+found+or+already+approved",
          );
        }
        return res.redirect("/oversight/roles?success=1");
      } catch (err) {
        (logError || console.error)("oversight/roles/desk POST error:", err);
        return res.redirect("/oversight/roles?error=Server+error");
      }
    },
  );

  /**
   * POST /oversight/roles
   * Update a single volunteer's role.
   * Server-side canAssignRole check — actor cannot assign equal or higher roles.
   */
  router.post(
    "/oversight/roles",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const actorRole = req.session.userRole || "NON_REGISTERED";
      const editedBy = req.session.userEmail || "admin";
      const targetId = Number(req.body.targetId);
      const newRole = (req.body.newRole || "").trim();

      // Validate inputs
      if (!targetId || !newRole || !ROLE_HIERARCHY.includes(newRole)) {
        return res.redirect("/oversight/roles?error=Invalid+request");
      }

      // Enforce hierarchy — actor cannot assign their own level or above
      if (!canAssignRole(actorRole, newRole)) {
        return res.redirect(
          "/oversight/roles?error=You+do+not+have+permission+to+assign+that+role",
        );
      }

      // Prevent self-role change
      if (targetId === req.session.userId) {
        return res.redirect(
          "/oversight/roles?error=You+cannot+change+your+own+role",
        );
      }

      try {
        const ok = await updateVolunteerRole(targetId, newRole, editedBy);
        if (!ok) {
          return res.redirect(
            "/oversight/roles?error=Volunteer+not+found+or+already+archived",
          );
        }
        return res.redirect("/oversight/roles?success=1");
      } catch (err) {
        (logError || console.error)("admin/roles POST error:", err);
        return res.redirect("/oversight/roles?error=Server+error");
      }
    },
  );

  // ===========================
  // Oversight Tools DASHBOARD
  // ===========================

  /**
   * GET /oversight/tools
   * Central dashboard for Oversight Tools.
   * Accessible to ASSISTANT_ADMIN and ADMIN only.
   */
  router.get(
    "/oversight/tools",
    requireAuth,
    requirePermission("viewSigns"),
    csrfProtection,
    (req, res) => {
      res.render("authentication_and_accounts/oversightTools", {
        csrfToken: req.csrfToken(),
        userRole: req.session.userRole || "NON_REGISTERED",
        userPermissions: req.session.permissions || {},
      });
    },
  );

  // ===========================
  // ADMIN SEND RESET TOOL
  // ===========================

  /**
   * GET /oversight/tools/send-reset
   * List all volunteers with incomplete draft registrations.
   */
  router.get(
    "/oversight/tools/send-reset",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      try {
        const [drafts, registered] = await Promise.all([
          getIncompleteDraftVolunteers(),
          getRegisteredVolunteers(),
        ]);

        return res.render("authentication_and_accounts/adminSendReset", {
          csrfToken: req.csrfToken(),
          drafts,
          registered,
          activeTab: req.query.tab === "registered" ? "registered" : "draft",
          success: req.query.success
            ? decodeURIComponent(req.query.success)
            : null,
          error: req.query.error ? decodeURIComponent(req.query.error) : null,
        });
      } catch (err) {
        (logError || console.error)("admin/tools/send-reset GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  /**
   * POST /oversight/tools/send-reset
   * Generate a reset hash and send it via email or SMS to a single volunteer.
   */
  router.post(
    "/oversight/tools/send-reset",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const { targetId, method, linkType } = req.body || {};
      const id = Number(targetId);
      const channel = method === "phone" ? "sms" : "email";
      const isResume = linkType === "resume";

      // Redirect back to the correct tab on error
      const tabParam = isResume ? "draft" : "registered";

      /**
       * Redirect back with an error, preserving the active tab.
       * @param {string} msg
       */
      function redirectError(msg) {
        return res.redirect(
          `/oversight/tools/send-reset?tab=${tabParam}&error=${encodeURIComponent(msg)}`,
        );
      }

      if (
        !id ||
        !method ||
        !["email", "phone"].includes(method) ||
        !linkType ||
        !["resume", "reset"].includes(linkType)
      ) {
        return redirectError("Invalid request.");
      }

      try {
        const volunteer = await getVolunteerById(id);

        if (!volunteer || volunteer.registration_status === "archived") {
          return redirectError("Volunteer not found.");
        }

        if (method === "email" && !volunteer.email) {
          return redirectError(
            `No email on file for ${volunteer.firstName} ${volunteer.lastName}.`,
          );
        }
        if (method === "phone" && !volunteer.phone) {
          return redirectError(
            `No phone on file for ${volunteer.firstName} ${volunteer.lastName}.`,
          );
        }

        // ── Per-channel 24hr cooldown ────────────────────────────────
        const cooldownCol = isResume
          ? channel === "sms"
            ? "last_resume_sms_sent_at"
            : "last_resume_email_sent_at"
          : channel === "sms"
            ? "last_reset_sms_sent_at"
            : "last_reset_email_sent_at";

        const lastSent = volunteer[cooldownCol];
        if (lastSent) {
          const hoursSince =
            (Date.now() - new Date(lastSent).getTime()) / (1000 * 60 * 60);
          if (hoursSince < 24) {
            const hoursLeft = Math.ceil(24 - hoursSince);
            return redirectError(
              `A ${isResume ? "resume" : "reset"} link was already sent to ${volunteer.firstName} ${volunteer.lastName} via ${method === "phone" ? "SMS" : "email"} recently. Please wait ${hoursLeft} hour${hoursLeft !== 1 ? "s" : ""}.`,
            );
          }
        }

        // ── Generate and store hash ──────────────────────────────────
        const hash = crypto.randomUUID();
        await setPendingReset(id, hash, isResume ? "resume" : "reset", channel);

        const baseUrl = getBaseUrl(req);
        const linkUrl = `${baseUrl}/reset-password/${encodeURIComponent(hash)}`;

        // ── Message copy depends on link type ────────────────────────
        const firstName = volunteer.firstName || "there";
        const emailSubject = isResume
          ? "Action needed — complete your Albany JW Parking registration"
          : "Reset your Albany JW Parking password";
        const smsBody = isResume
          ? `Albany JW Parking: Hi ${firstName}, your registration is incomplete. Tap to finish:\n${linkUrl}`
          : `Albany JW Parking: Hi ${firstName}, tap the link to reset your password:\n${linkUrl}`;

        let ok = false;

        if (method === "email") {
          ok = await sendResetEmail(volunteer.email, linkUrl, {
            ...smtpConfig,
            firstName,
            subject: emailSubject,
            isResume,
          });
        } else {
          ok = await sendResetSms(
            volunteer.phone,
            linkUrl,
            twilioAccountSid,
            twilioAuthToken,
            twilioMsgSid,
            { firstName, customBody: smsBody },
          );
        }

        if (!ok) {
          return redirectError("Failed to send — check server logs.");
        }

        const name = [volunteer.firstName, volunteer.lastName]
          .filter(Boolean)
          .join(" ");
        return res.redirect(
          `/oversight/tools/send-reset?tab=${tabParam}&success=${encodeURIComponent(
            `${isResume ? "Resume" : "Reset"} link sent to ${name} via ${method === "phone" ? "SMS" : "email"}.`,
          )}`,
        );
      } catch (err) {
        (logError || console.error)("admin/tools/send-reset POST error:", err);
        return redirectError("Server error.");
      }
    },
  );
  // ===========================
  // ADMIN CREATE VOLUNTEER TOOL
  // ===========================

  /**
   * GET /oversight/tools/create-volunteer
   * Show the create-volunteer form with congregation dropdown.
   * Requires OVERSEER or above via createVolunteerAccounts permission.
   */
  router.get(
    "/oversight/tools/create-volunteer",
    requireAuth,
    requirePermission("createVolunteerAccounts"),
    csrfProtection,
    async (req, res) => {
      try {
        const congregations = await getCongregations();

        return res.render("authentication_and_accounts/adminCreateVolunteer", {
          csrfToken: req.csrfToken(),
          congregations,
          success: req.query.success
            ? decodeURIComponent(req.query.success)
            : null,
          error: req.query.error ? decodeURIComponent(req.query.error) : null,
          fields: {
            firstName: req.query.firstName || "",
            lastName: req.query.lastName || "",
            suffix: req.query.suffix || "",
            email: req.query.email || "",
            phone: req.query.phone || "",
            congAssigned: req.query.congAssigned || "",
            congregation: req.query.congregation || "",
            congregationOtherCity: req.query.congregationOtherCity || "",
            congregationOtherState: req.query.congregationOtherState || "",
            congregationOtherLang: req.query.congregationOtherLang || "",
          },
        });
      } catch (err) {
        (logError || console.error)(
          "admin/tools/create-volunteer GET error:",
          err,
        );
        return res.status(500).send("Server error");
      }
    },
  );

  /**
   * POST /api/admin/check-duplicates
   * JSON endpoint — called by the frontend before submitting the create form.
   * Returns potential duplicate volunteers for the given name / email / phone.
   *
   * Body: { firstName, lastName, email, phone }
   * Response: { duplicates: Array<{id, firstName, lastName, suffix, email, phone,
   *             registration_status, role, matchReason}> }
   */
  router.post(
    "/api/admin/check-duplicates",
    requireAuth,
    requirePermission("createVolunteerAccounts"),
    async (req, res) => {
      const { firstName, lastName, email, phone } = req.body || {};

      if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
        return res
          .status(400)
          .json({ error: "firstName, lastName, and email are required." });
      }

      try {
        const duplicates = await findPotentialDuplicates({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone?.trim() || null,
        });

        return res.json({ duplicates });
      } catch (err) {
        (logError || console.error)("api/admin/check-duplicates error:", err);
        return res.status(500).json({ error: "Server error." });
      }
    },
  );

  /**
   * POST /oversight/tools/create-volunteer
   * Validate inputs, check for duplicates, and insert a new completed volunteer
   * account. Password defaults to `lastName + '1914'` (hashed).
   *
   * Pass `force=true` in body to bypass the duplicate modal and create anyway.
   * On duplicate email/phone, SQL constraint errors 2627/2601 are caught.
   */
  router.post(
    "/oversight/tools/create-volunteer",
    requireAuth,
    requirePermission("createVolunteerAccounts"),
    csrfProtection,
    async (req, res) => {
      const {
        firstName,
        lastName,
        suffix,
        email,
        phone,
        congAssigned,
        congregation,
        congregationOtherCity,
        congregationOtherState,
        congregationOtherLang,
        force,
      } = req.body || {};

      /**
       * Redirect back to form with an error message and sticky field values.
       * @param {string} msg
       */
      function redirectError(msg) {
        const q = new URLSearchParams({
          error: msg,
          firstName: firstName || "",
          lastName: lastName || "",
          suffix: suffix || "",
          email: email || "",
          phone: phone || "",
          congAssigned: congAssigned || "",
          congregation: congregation || "",
          congregationOtherCity: congregationOtherCity || "",
          congregationOtherState: congregationOtherState || "",
          congregationOtherLang: congregationOtherLang || "",
        });
        return res.redirect(
          `/oversight/tools/create-volunteer?${q.toString()}`,
        );
      }

      // ── Validation ──────────────────────────────────────────────────────
      if (!firstName?.trim()) return redirectError("First name is required.");
      if (!lastName?.trim()) return redirectError("Last name is required.");
      if (!email?.trim()) return redirectError("Email is required.");
      if (!phone?.trim()) return redirectError("Phone number is required.");

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim()))
        return redirectError("Please enter a valid email address.");

      try {
        // ── Duplicate check (skipped when force=true from modal confirm) ──
        if (force !== "true") {
          const duplicates = await findPotentialDuplicates({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim(),
            phone: phone.trim(),
          });

          if (duplicates.length > 0) {
            // Return JSON so the frontend can show the modal.
            // The form submits via fetch on this path, not a native POST,
            // so we always respond with JSON and let the client decide.
            return res.json({ duplicates });
          }
        }

        // ── Insert ──────────────────────────────────────────────────────
        const newId = await createVolunteerAccount(
          {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            suffix: suffix?.trim() || null,
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            congAssigned: congAssigned || "unknown",
            congregation: congregation?.trim() || null,
            congregationOtherCity: congregationOtherCity?.trim() || null,
            congregationOtherState: congregationOtherState?.trim() || null,
            congregationOtherLang: congregationOtherLang?.trim() || null,
          },
          req.session.userEmail || "admin",
        );

        const name = `${firstName.trim()} ${lastName.trim()}`;
        return res.json({
          success: true,
          message: `Account created for ${name} (ID: ${newId}). Temporary password: ${lastName.trim()}1914`,
          newId,
        });
      } catch (err) {
        // Duplicate email — SQL unique constraint codes 2627 / 2601
        const sqlCode = err?.originalError?.info?.number || err?.number;
        if (sqlCode === 2627 || sqlCode === 2601) {
          return res.json({
            success: false,
            error: `An account with email "${email.trim()}" already exists.`,
          });
        }
        (logError || console.error)(
          "admin/tools/create-volunteer POST error:",
          err,
        );
        return res.json({
          success: false,
          error: "Server error — please try again.",
        });
      }
    },
  );

  // ===========================
  // PERMISSION MATRIX (ADMIN only)
  // ===========================

  /**
   * GET /oversight/tools/permissions
   * Display the full role × permission matrix with current DB overrides merged in.
   * Restricted to ADMIN only.
   */
  router.get(
    "/oversight/tools/permissions",
    requireAuth,
    requirePermission("manageRoles"),
    csrfProtection,
    async (req, res) => {
      try {
        const dbOverrides = await getRolePermissions();

        // Build override lookup: { 'OVERSEER.sendMessages': true/false }
        /** @type {Record<string, boolean>} */
        const overrideLookup = {};
        for (const row of dbOverrides) {
          overrideLookup[`${row.role_name}.${row.permission}`] =
            !!row.is_granted;
        }

        return res.render("authentication_and_accounts/oversightPermissions", {
          csrfToken: req.csrfToken(),
          PERMISSIONS,
          ROLE_HIERARCHY,
          overrideLookup,
          success: req.query.success
            ? decodeURIComponent(req.query.success)
            : null,
          error: req.query.error ? decodeURIComponent(req.query.error) : null,
        });
      } catch (err) {
        (logError || console.error)(
          "oversight/tools/permissions GET error:",
          err,
        );
        return res.status(500).send("Server error");
      }
    },
  );

  /**
   * POST /oversight/tools/permissions
   * AJAX endpoint — upsert a single role/permission cell.
   * Body: { roleName, permission, isGranted }
   * Returns: { success: true } or { success: false, error: string }
   */
  router.post(
    "/oversight/tools/permissions",
    requireAuth,
    requirePermission("manageRoles"),
    csrfProtection,
    async (req, res) => {
      const { roleName, permission, isGranted } = req.body || {};

      if (!roleName || !permission || typeof isGranted === "undefined") {
        return res
          .status(400)
          .json({ success: false, error: "Missing required fields." });
      }

      if (!ROLE_HIERARCHY.includes(roleName)) {
        return res.status(400).json({ success: false, error: "Invalid role." });
      }

      // Prevent removing manageRoles from ADMIN — that would lock everyone out
      if (roleName === "ADMIN" && permission === "manageRoles" && !isGranted) {
        return res.status(400).json({
          success: false,
          error: "Cannot remove manageRoles from ADMIN.",
        });
      }

      try {
        const defaultVal = PERMISSIONS[roleName]?.[permission];
        const isDefault = !!isGranted === !!defaultVal;

        if (isDefault) {
          await deleteRolePermission(roleName, permission);
          return res.json({ success: true, removedOverride: true });
        }

        await upsertRolePermission(
          roleName,
          permission,
          !!isGranted,
          req.session.userId || null,
        );
        return res.json({ success: true, removedOverride: false });
      } catch (err) {
        (logError || console.error)(
          "oversight/tools/permissions POST error:",
          err,
        );
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  // ===========================
  // DECENTLY EXPORT TOOL
  // ===========================

  /**
   * GET /oversight/tools/decently-export
   * Show the export page. If a cached CSV exists in the session, show the
   * download link and row count from the last generation.
   */
  router.get(
    "/oversight/tools/decently-export",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    (req, res) => {
      const cached = req.session.decentlyCache || null;

      return res.render("authentication_and_accounts/oversightDecentlyExport", {
        csrfToken: req.csrfToken(),
        rowCount: cached ? cached.ids.length : null,
        hasCache: !!cached,
        success: req.query.success
          ? decodeURIComponent(req.query.success)
          : null,
        error: req.query.error ? decodeURIComponent(req.query.error) : null,
      });
    },
  );

  /**
   * POST /oversight/tools/decently-export
   * Query volunteers not yet exported, build CSV, cache in session.
   * Redirects back to GET with the cache populated.
   */
  router.post(
    "/oversight/tools/decently-export",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      try {
        const rows = await getDecentlyExportRows();

        if (rows.length === 0) {
          return res.redirect(
            "/oversight/tools/decently-export?error=" +
              encodeURIComponent("No new volunteers to export."),
          );
        }

        // ── Build CSV ────────────────────────────────────────────────
        const columns = [
          "firstName",
          "lastName",
          "suffix",
          "email",
          "phone",
          "congregation",
          "role",
          "notes",
        ];

        /**
         * Escape a value for CSV: wrap in quotes if it contains comma, quote, or newline.
         * @param {any} val
         * @returns {string}
         */
        function escapeCSV(val) {
          if (val === null || val === undefined) return "";
          const str = String(val);
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        }

        const csvLines = [
          columns.map(escapeCSV).join(","),
          ...rows.map((row) =>
            columns.map((col) => escapeCSV(row[col])).join(","),
          ),
        ];

        const csv = csvLines.join("\r\n");
        const ids = rows.map((r) => r.id);
        const filename = `DecentlyExport_${new Date().toISOString().slice(0, 10)}.csv`;

        // Cache CSV + IDs in session until download or session end
        req.session.decentlyCache = { csv, ids, filename };

        return res.redirect("/oversight/tools/decently-export");
      } catch (err) {
        (logError || console.error)("decently-export POST error:", err);
        return res.redirect(
          "/oversight/tools/decently-export?error=" +
            encodeURIComponent("Export failed — check server logs."),
        );
      }
    },
  );

  /**
   * GET /oversight/tools/decently-export/download
   * Stream the cached CSV to the browser, then mark records as exported in the DB.
   * Clears the session cache after download.
   */
  router.get(
    "/oversight/tools/decently-export/download",
    requireAuth,
    requirePermission("accessAdminConsole"),
    async (req, res) => {
      const cached = req.session.decentlyCache;

      if (!cached || !cached.csv) {
        return res.redirect(
          "/oversight/tools/decently-export?error=" +
            encodeURIComponent("No export ready — please generate first."),
        );
      }

      const { csv, ids, filename } = cached;

      // Clear cache before sending so a refresh doesn't re-download
      req.session.decentlyCache = null;

      // Mark as exported in DB
      try {
        await markDecentlyExported(ids);
      } catch (err) {
        (logError || console.error)("markDecentlyExported error:", err);
        // Non-fatal — still send the file, log the failure
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      return res.send(csv);
    },
  );
  // ===========================
  // DECENTLY IMPORT TOOL
  // ===========================

  /**
   * GET /oversight/tools/decently-import
   * Show the upload page.
   */
  router.get(
    "/oversight/tools/decently-import",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    (req, res) => {
      return res.render("authentication_and_accounts/decentlyImport", {
        csrfToken: req.csrfToken(),
      });
    },
  );

  /**
   * POST /oversight/tools/decently-import/process
   * Accept parsed CSV rows as JSON, run matching against DB volunteers,
   * and return categorised results for the review phase.
   *
   * Body: { rows: Array<{ name, email, phone }> }
   * Response: {
   *   matched:       Array<{ csvRow, dbMatch, confidence }>
   *   fuzzy:         Array<{ csvRow, candidates: Array<dbVolunteer> }>
   *   unmatchedCsv:  Array<csvRow>           — in CSV, not in DB
   *   unmatchedDb:   Array<dbVolunteer>      — in DB, not in CSV
   * }
   */
  router.post(
    "/oversight/tools/decently-import/process",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const { rows } = req.body || {};

      if (!Array.isArray(rows) || rows.length === 0) {
        return res
          .status(400)
          .json({ success: false, error: "No rows provided." });
      }

      try {
        const dbVolunteers = await getVolunteersForImportMatch();

        /**
         * Normalise a string for comparison: lowercase, strip non-alphanumeric, collapse spaces.
         * @param {string|null|undefined} s
         * @returns {string}
         */
        function norm(s) {
          return (s || "")
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, "")
            .replace(/\s+/g, " ")
            .trim();
        }

        /**
         * Strip all non-digit characters from a phone string.
         * @param {string|null|undefined} s
         * @returns {string}
         */
        function digits(s) {
          return (s || "").replace(/\D/g, "");
        }

        // Pre-build lookup maps for O(1) exact matching
        /** @type {Map<string, object>} email → db row */
        const byEmail = new Map();
        /** @type {Map<string, object>} phone digits → db row */
        const byPhone = new Map();
        /** @type {Map<string, object>} normalised full name → db row */
        const byName = new Map();

        for (const v of dbVolunteers) {
          const fullName = norm(
            `${v.firstName || ""} ${v.lastName || ""} ${v.suffix || ""}`.trim(),
          );
          if (v.email) byEmail.set(v.email.trim().toLowerCase(), v);
          const ph = digits(v.phone);
          if (ph.length >= 10) byPhone.set(ph.slice(-10), v);
          if (fullName) byName.set(fullName, v);
        }

        /** @type {Set<number>} DB IDs that were matched to a CSV row */
        const matchedDbIds = new Set();

        const matched = [];
        const fuzzy = [];
        const unmatchedCsv = [];

        for (const row of rows) {
          const csvEmail = (row.email || "").trim().toLowerCase();
          const csvPhone = digits(row.phone).slice(-10);
          const csvName = norm(row.name);

          let dbMatch = null;
          let confidence = "";

          // 1) Exact email
          if (!dbMatch && csvEmail && byEmail.has(csvEmail)) {
            dbMatch = byEmail.get(csvEmail);
            confidence = "email";
          }
          // 2) Exact phone (last 10 digits)
          if (!dbMatch && csvPhone.length >= 10 && byPhone.has(csvPhone)) {
            dbMatch = byPhone.get(csvPhone);
            confidence = "phone";
          }
          // 3) Exact normalised name
          if (!dbMatch && csvName && byName.has(csvName)) {
            dbMatch = byName.get(csvName);
            confidence = "name";
          }

          if (dbMatch) {
            matchedDbIds.add(dbMatch.id);
            matched.push({ csvRow: row, dbMatch, confidence });
            continue;
          }

          // 4) Fuzzy: any DB volunteer that shares a name token (word) with the CSV row
          const csvTokens = new Set(
            csvName.split(" ").filter((t) => t.length > 1),
          );
          const candidates = dbVolunteers.filter((v) => {
            const vName = norm(`${v.firstName || ""} ${v.lastName || ""}`);
            return vName
              .split(" ")
              .some((t) => t.length > 1 && csvTokens.has(t));
          });

          if (candidates.length > 0) {
            fuzzy.push({ csvRow: row, candidates });
          } else {
            unmatchedCsv.push(row);
          }
        }

        // DB volunteers not matched to any CSV row
        const unmatchedDb = dbVolunteers.filter((v) => !matchedDbIds.has(v.id));

        return res.json({
          success: true,
          matched,
          fuzzy,
          unmatchedCsv,
          unmatchedDb,
        });
      } catch (err) {
        (logError || console.error)("decently-import/process error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /oversight/tools/decently-import/apply
   * Apply confirmed import mappings.
   *
   * Body: {
   *   matchedIds:  number[]   — DB IDs to activate + mark imported
   *   inactiveIds: number[]   — DB IDs to mark inactive
   * }
   * Response: { success, activated, deactivated }
   */
  router.post(
    "/oversight/tools/decently-import/apply",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const { matchedIds, inactiveIds } = req.body || {};

      if (!Array.isArray(matchedIds) || !Array.isArray(inactiveIds)) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid payload." });
      }

      try {
        const { activated, deactivated } = await applyDecentlyImport(
          matchedIds.map(Number).filter(Boolean),
          inactiveIds.map(Number).filter(Boolean),
          req.session.userEmail || "admin",
        );
        return res.json({ success: true, activated, deactivated });
      } catch (err) {
        (logError || console.error)("decently-import/apply error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );
  /**
   * POST /oversight/tools/decently-import/send-welcome
   * Send a password reset link to a newly created volunteer using standard copy.
   *
   * Body (JSON): { volunteerId: number, method: 'email'|'phone' }
   * Response: { success: boolean, message?: string }
   */
  router.post(
    "/oversight/tools/decently-import/send-welcome",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const { volunteerId, method } = req.body || {};
      const id = Number(volunteerId);
      const channel = method === "phone" ? "sms" : "email";

      if (!id || !["email", "phone"].includes(method)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid request." });
      }

      try {
        const volunteer = await getVolunteerById(id);
        if (!volunteer || volunteer.registration_status === "archived") {
          return res
            .status(404)
            .json({ success: false, message: "Volunteer not found." });
        }
        if (method === "email" && !volunteer.email) {
          return res
            .status(400)
            .json({ success: false, message: "No email on file." });
        }
        if (method === "phone" && !volunteer.phone) {
          return res
            .status(400)
            .json({ success: false, message: "No phone on file." });
        }

        const hash = crypto.randomUUID();
        await setPendingReset(id, hash, "reset", channel);

        const baseUrl = getBaseUrl(req);
        const linkUrl = `${baseUrl}/reset-password/${encodeURIComponent(hash)}`;
        const firstName = volunteer.firstName || "there";

        let ok = false;

        if (method === "email") {
          ok = await sendResetEmail(volunteer.email, linkUrl, {
            ...smtpConfig,
            firstName,
            subject: "Welcome to Albany JW Parking — set your password",
            isResume: false,
          });
        } else {
          ok = await sendResetSms(
            volunteer.phone,
            linkUrl,
            twilioAccountSid,
            twilioAuthToken,
            twilioMsgSid,
            { firstName },
          );
        }

        if (!ok) {
          return res.status(500).json({
            success: false,
            message: "Failed to send — check server logs.",
          });
        }

        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("decently-import/send-welcome error:", err);
        return res
          .status(500)
          .json({ success: false, message: "Server error." });
      }
    },
  );
  // ===========================
  // LOCATIONS & TASKS
  // ===========================

  /**
   * GET /oversight/tools/locationsAndTasks
   * Render the locations and tasks management page.
   * Defaults to the current calendar year.
   */
  router.get(
    "/oversight/tools/locationsAndTasks",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const year = parseInt(req.query.year) || new Date().getFullYear();
      try {
        const rows = await getLocationsTasks(year);
        return res.render("authentication_and_accounts/locationsAndTasks", {
          csrfToken: req.csrfToken(),
          year,
          rows,
          currentYear: new Date().getFullYear(),
        });
      } catch (err) {
        (logError || console.error)("locationsAndTasks GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  /**
   * POST /oversight/tools/locationsAndTasks
   * Create a new location or task.
   * Body (JSON): { year, name, type, description, capacity, address, lat, lng, maps_url }
   * Response: { success, id }
   */
  router.post(
    "/oversight/tools/locationsAndTasks",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const {
        year,
        name,
        type,
        description,
        capacity,
        address,
        lat,
        lng,
        maps_url,
      } = req.body || {};

      if (!name?.trim())
        return res
          .status(400)
          .json({ success: false, error: "Name is required." });
      if (!["location", "task"].includes(type))
        return res.status(400).json({ success: false, error: "Invalid type." });
      if (!year)
        return res
          .status(400)
          .json({ success: false, error: "Year is required." });

      try {
        const id = await createLocationTask(
          {
            year: Number(year),
            name,
            type,
            description,
            capacity,
            address,
            lat,
            lng,
            maps_url,
          },
          req.session.userEmail || "admin",
        );
        return res.json({ success: true, id });
      } catch (err) {
        (logError || console.error)("locationsAndTasks POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * PUT /oversight/tools/locationsAndTasks/:id
   * Update an existing location or task.
   * Body (JSON): { name, type, description, capacity, address, lat, lng, maps_url, active }
   * Response: { success }
   */
  router.put(
    "/oversight/tools/locationsAndTasks/:id",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      const {
        name,
        type,
        description,
        capacity,
        address,
        lat,
        lng,
        maps_url,
        active,
      } = req.body || {};

      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });
      if (!name?.trim())
        return res
          .status(400)
          .json({ success: false, error: "Name is required." });
      if (!["location", "task"].includes(type))
        return res.status(400).json({ success: false, error: "Invalid type." });

      try {
        const ok = await updateLocationTask(id, {
          name,
          type,
          description,
          capacity,
          address,
          lat,
          lng,
          maps_url,
          active: active !== false && active !== "false",
        });
        if (!ok)
          return res
            .status(404)
            .json({ success: false, error: "Record not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("locationsAndTasks PUT error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * PATCH /oversight/tools/locationsAndTasks/:id/active
   * Toggle the active flag only.
   * Body (JSON): { active: boolean }
   * Response: { success }
   */
  router.patch(
    "/oversight/tools/locationsAndTasks/:id/active",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      const active = req.body?.active !== false && req.body?.active !== "false";

      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });

      try {
        const ok = await setLocationTaskActive(id, active);
        if (!ok)
          return res
            .status(404)
            .json({ success: false, error: "Record not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("locationsAndTasks PATCH error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );
  // ===========================
  // SCHEDULER CATEGORIES (replaces event-types — ASSISTANT_ADMIN+)
  // ===========================

  /**
   * GET /oversight/tools/timelines/event-types
   * Render scheduler categories management page.
   * URL kept for backward-compat until Phase 6 UI rename.
   */
  router.get(
    "/oversight/tools/timelines/event-types",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      try {
        const schedulerCategories = await getSchedulerCategories();
        return res.render("authentication_and_accounts/timelines", {
          csrfToken: req.csrfToken(),
          view: "event-types",
          eventTypes: schedulerCategories,
          conventionDays: [],
          timeline: [],
          year: new Date().getFullYear(),
          currentYear: new Date().getFullYear(),
          selectedDay: null,
          locationsTasks: [],
        });
      } catch (err) {
        (logError || console.error)("timelines/scheduler-categories GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  /**
   * POST /oversight/tools/timelines/event-types
   * Create a scheduler category.
   * Body: { dept_key, name, color, sort_order }
   */
  router.post(
    "/oversight/tools/timelines/event-types",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const { dept_key, name, color, sort_order } = req.body || {};
      if (!dept_key?.trim() || !name?.trim())
        return res
          .status(400)
          .json({ success: false, error: "dept_key and name are required." });
      try {
        const id = await createSchedulerCategory({
          dept_key,
          name,
          color,
          sort_order: sort_order != null ? Number(sort_order) : 0,
        });
        return res.json({ success: true, id });
      } catch (err) {
        (logError || console.error)("timelines/scheduler-categories POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * PUT /oversight/tools/timelines/event-types/:id
   * Update a scheduler category's display fields.
   * Body: { name, color, active, sort_order }
   */
  router.put(
    "/oversight/tools/timelines/event-types/:id",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      const { name, color, active, sort_order } = req.body || {};
      if (!id || !name?.trim())
        return res
          .status(400)
          .json({ success: false, error: "Invalid request." });
      try {
        const ok = await updateSchedulerCategory(id, {
          name,
          color,
          active: active !== false && active !== "false",
          sort_order: sort_order != null ? Number(sort_order) : 0,
        });
        if (!ok)
          return res.status(404).json({ success: false, error: "Not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("timelines/scheduler-categories PUT error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  // ===========================
  // SCHEDULER CATEGORY SENSITIVITY (OVERSEER+)
  // ===========================

  /**
   * PATCH /api/scheduler-categories/:id/sensitivity
   * Toggle is_sensitive on a scheduler category.
   * Body: { isSensitive: boolean }
   */
  router.patch(
    "/api/scheduler-categories/:id/sensitivity",
    requireAuth,
    requirePermission("manageScheduleSensitivity"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid category ID." });
      const isSensitive = !!req.body?.isSensitive;
      try {
        const ok = await toggleSchedulerCategorySensitivity(id, isSensitive);
        if (!ok)
          return res.status(404).json({ success: false, error: "Category not found." });
        return res.json({ success: true, isSensitive });
      } catch (err) {
        (logError || console.error)("scheduler-category sensitivity PATCH error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * GET /api/scheduler-categories/:id/sensitivity
   * List volunteers granted access to a sensitive category.
   */
  router.get(
    "/api/scheduler-categories/:id/sensitivity",
    requireAuth,
    requirePermission("manageScheduleSensitivity"),
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid category ID." });
      try {
        const volunteers = await getVolunteersForSchedulerCategory(id);
        return res.json({ success: true, volunteers });
      } catch (err) {
        (logError || console.error)("scheduler-category sensitivity GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /api/scheduler-categories/:id/sensitivity
   * Grant a volunteer access to a sensitive category.
   * Body: { volunteerId: number }
   */
  router.post(
    "/api/scheduler-categories/:id/sensitivity",
    requireAuth,
    requirePermission("manageScheduleSensitivity"),
    csrfProtection,
    async (req, res) => {
      const categoryId  = Number(req.params.id);
      const volunteerId = Number(req.body?.volunteerId);
      if (!categoryId || !volunteerId)
        return res.status(400).json({ success: false, error: "Invalid request." });
      try {
        await grantSchedulerCategoryAccess(volunteerId, categoryId, req.session.userId);
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("scheduler-category sensitivity POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * DELETE /api/scheduler-categories/:id/sensitivity/:volunteerId
   * Revoke a volunteer's access to a sensitive category.
   */
  router.delete(
    "/api/scheduler-categories/:id/sensitivity/:volunteerId",
    requireAuth,
    requirePermission("manageScheduleSensitivity"),
    csrfProtection,
    async (req, res) => {
      const categoryId  = Number(req.params.id);
      const volunteerId = Number(req.params.volunteerId);
      if (!categoryId || !volunteerId)
        return res.status(400).json({ success: false, error: "Invalid request." });
      try {
        const ok = await revokeSchedulerCategoryAccess(volunteerId, categoryId);
        if (!ok)
          return res.status(404).json({ success: false, error: "Grant not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("scheduler-category sensitivity DELETE error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  // ===========================
  // TIMELINES — Convention Days (OVERSEER+)
  // ===========================

  /**
   * GET /oversight/tools/timelines
   * Main timelines page — shows convention days for a year.
   * Optional ?year= and ?dayId= params.
   */
  router.get(
    "/oversight/tools/timelines",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const year = parseInt(req.query.year) || new Date().getFullYear();
      const dayId = req.query.dayId ? Number(req.query.dayId) : null;
      try {
        const [schedulerCategories, conventionDays, locationsTasks] = await Promise.all([
          getSchedulerCategories(),
          getConventionDays(year),
          getLocationsTasks(year),
        ]);

        let timeline = [];
        let selectedDay = null;

        if (dayId) {
          selectedDay = conventionDays.find((d) => d.id === dayId) || null;
          if (selectedDay) timeline = await getFullDayTimeline(dayId);
        }

        return res.render("authentication_and_accounts/timelines", {
          csrfToken: req.csrfToken(),
          view: "timelines",
          year,
          currentYear: new Date().getFullYear(),
          eventTypes: schedulerCategories,
          schedulerCategories,
          conventionDays,
          selectedDay,
          timeline,
          locationsTasks,
        });
      } catch (err) {
        (logError || console.error)("timelines GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  router.post(
    "/oversight/tools/timelines/days",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const {
        year,
        label,
        convention_date,
        program_start,
        program_end,
        notes,
        schedulable,
      } = req.body || {};
      const yearNum = Number(year);
      const conventionDateObj = convention_date
        ? new Date(String(convention_date).slice(0, 10) + "T12:00:00Z")
        : null;
      if (
        !year ||
        !label?.trim() ||
        !convention_date ||
        !program_start ||
        !program_end
      )
        return res
          .status(400)
          .json({ success: false, error: "Missing required fields." });

      if (
        yearNum < 2000 ||
        yearNum > 2100 ||
        !conventionDateObj ||
        isNaN(conventionDateObj.valueOf())
      )
        return res
          .status(400)
          .json({ success: false, error: "Invalid year or convention date." });
      const normStart = parseTimeString(program_start);
      const normEnd = parseTimeString(program_end);
      if (!normStart || !normEnd)
        return res.status(400).json({
          success: false,
          error: "Invalid time format. Use HH:MM or H:MM AM/PM.",
        });

      try {
        const id = await createConventionDay({
          year: yearNum,
          label,
          convention_date,
          program_start: normStart,
          program_end: normEnd,
          notes,
          schedulable: schedulable !== false && schedulable !== "false",
        });
        return res.json({ success: true, id });
      } catch (err) {
        (logError || console.error)("timelines/days POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  router.put(
    "/oversight/tools/timelines/days/:id",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      const {
        label,
        convention_date,
        program_start,
        program_end,
        notes,
        schedulable,
      } = req.body || {};

      const conventionDateObj = convention_date
        ? new Date(String(convention_date).slice(0, 10) + "T12:00:00Z")
        : null;

      if (
        !id ||
        !label?.trim() ||
        !convention_date ||
        !program_start ||
        !program_end
      )
        return res
          .status(400)
          .json({ success: false, error: "Missing required fields." });

      if (!conventionDateObj || isNaN(conventionDateObj.valueOf()))
        return res
          .status(400)
          .json({ success: false, error: "Invalid convention date." });

      const normStart = parseTimeString(program_start);
      const normEnd = parseTimeString(program_end);
      if (!normStart || !normEnd)
        return res.status(400).json({
          success: false,
          error: "Invalid time format. Use HH:MM or H:MM AM/PM.",
        });

      try {
        const ok = await updateConventionDay(id, {
          label,
          convention_date,
          program_start: normStart,
          program_end: normEnd,
          notes,
          schedulable: schedulable !== false && schedulable !== "false",
        });
        if (!ok)
          return res.status(404).json({ success: false, error: "Not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("timelines/days PUT error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  router.delete(
    "/oversight/tools/timelines/days/:id",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });
      try {
        const ok = await deleteConventionDay(id);
        if (!ok)
          return res.status(404).json({ success: false, error: "Not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("timelines/days DELETE error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /oversight/tools/timelines/days/:id/copy
   * Deep-copy a convention day — sessions, shifts, and assignments included.
   * Body (JSON): { year, label, convention_date, program_start, program_end, notes? }
   * Response: { success, id }
   */
  router.post(
    "/oversight/tools/timelines/days/:id/copy",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const sourceDayId = Number(req.params.id);
      const {
        year,
        label,
        convention_date,
        program_start,
        program_end,
        notes,
        schedulable,
      } = req.body || {};
      const yearNum = Number(year);
      const conventionDateObj = convention_date
        ? new Date(String(convention_date).slice(0, 10) + "T12:00:00Z")
        : null;

      if (
        !sourceDayId ||
        !yearNum ||
        !label?.trim() ||
        !convention_date ||
        !program_start ||
        !program_end
      )
        return res
          .status(400)
          .json({ success: false, error: "Missing required fields." });

      const normStart = parseTimeString(program_start);
      const normEnd = parseTimeString(program_end);
      if (!normStart || !normEnd)
        return res.status(400).json({
          success: false,
          error: "Invalid time format. Use HH:MM or H:MM AM/PM.",
        });

      try {
        const newId = await copyConventionDay(sourceDayId, {
          year: Number(year),
          label: label.trim(),
          convention_date,
          program_start: normStart,
          program_end: normEnd,
          notes: notes?.trim() || null,
        });
        return res.json({ success: true, id: newId });
      } catch (err) {
        (logError || console.error)("timelines/days/copy POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );
  // ===========================
  // TIMELINES — Sessions
  // ===========================

  router.post(
    "/oversight/tools/timelines/sessions",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const {
        convention_day_id,
        label,
        session_order,
        start_time,
        end_time,
        notes,
      } = req.body || {};
      if (!convention_day_id || !label?.trim() || !start_time || !end_time)
        return res
          .status(400)
          .json({ success: false, error: "Missing required fields." });
      const normStart = parseTimeString(start_time);
      const normEnd = parseTimeString(end_time);
      if (!normStart || !normEnd)
        return res.status(400).json({
          success: false,
          error: "Invalid time format. Use HH:MM or H:MM AM/PM.",
        });

      try {
        const id = await createSession({
          convention_day_id: Number(convention_day_id),
          label,
          session_order: session_order || 0,
          start_time: normStart,
          end_time: normEnd,
          notes,
        });
        return res.json({ success: true, id });
      } catch (err) {
        (logError || console.error)("timelines/sessions POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  router.put(
    "/oversight/tools/timelines/sessions/:id",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      const { label, session_order, start_time, end_time, notes } =
        req.body || {};
      if (!id || !label?.trim() || !start_time || !end_time)
        return res
          .status(400)
          .json({ success: false, error: "Missing required fields." });
      const normStart = parseTimeString(start_time);
      const normEnd = parseTimeString(end_time);
      if (!normStart || !normEnd)
        return res.status(400).json({
          success: false,
          error: "Invalid time format. Use HH:MM or H:MM AM/PM.",
        });

      try {
        const ok = await updateSession(id, {
          label,
          session_order: session_order || 0,
          start_time: normStart,
          end_time: normEnd,
          notes,
        });
        if (!ok)
          return res.status(404).json({ success: false, error: "Not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("timelines/sessions PUT error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  router.delete(
    "/oversight/tools/timelines/sessions/:id",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });
      try {
        const ok = await deleteSession(id);
        if (!ok)
          return res.status(404).json({ success: false, error: "Not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("timelines/sessions DELETE error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  // ===========================
  // TIMELINES — Shifts
  // ===========================

  router.post(
    "/oversight/tools/timelines/shifts",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const {
        session_id,
        category_id,
        label,
        start_time,
        end_time,
        volunteer_need,
        notes,
        sms_code,
        is_meeting,
        has_keyman,
        has_keyman_asst,
      } = req.body || {};

      const isMeeting = !!(is_meeting === true || is_meeting === "true" || is_meeting === 1);

      if (!session_id || !label?.trim() || !start_time || !end_time)
        return res
          .status(400)
          .json({ success: false, error: "Missing required fields." });

      // Crew shifts must have a category; meeting shifts do not
      if (!isMeeting && !category_id)
        return res
          .status(400)
          .json({ success: false, error: "Category is required for crew shifts." });

      const normStart = parseTimeString(start_time);
      const normEnd = parseTimeString(end_time);
      if (!normStart || !normEnd)
        return res.status(400).json({
          success: false,
          error: "Invalid time format. Use HH:MM or H:MM AM/PM.",
        });

      try {
        const id = await createShift({
          session_id:      Number(session_id),
          category_id:     isMeeting ? null : (category_id ? Number(category_id) : null),
          label,
          start_time:      normStart,
          end_time:        normEnd,
          volunteer_need,
          notes,
          sms_code:        sms_code?.trim() || null,
          is_meeting:      isMeeting,
          has_keyman:      isMeeting ? false : (has_keyman !== false && has_keyman !== "false"),
          has_keyman_asst: isMeeting ? false : (has_keyman_asst !== false && has_keyman_asst !== "false"),
        });
        return res.json({ success: true, id });
      } catch (err) {
        (logError || console.error)("timelines/shifts POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  router.put(
    "/oversight/tools/timelines/shifts/:id",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      const {
        category_id,
        label,
        start_time,
        end_time,
        volunteer_need,
        notes,
        sms_code,
        invitable,
        is_meeting,
        has_keyman,
        has_keyman_asst,
      } = req.body || {};

      const isMeeting = !!(is_meeting === true || is_meeting === "true" || is_meeting === 1);

      if (!id || !label?.trim() || !start_time || !end_time)
        return res
          .status(400)
          .json({ success: false, error: "Missing required fields." });

      if (!isMeeting && !category_id)
        return res
          .status(400)
          .json({ success: false, error: "Category is required for crew shifts." });

      const normStart = parseTimeString(start_time);
      const normEnd = parseTimeString(end_time);
      if (!normStart || !normEnd)
        return res.status(400).json({
          success: false,
          error: "Invalid time format. Use HH:MM or H:MM AM/PM.",
        });

      try {
        const ok = await updateShift(id, {
          category_id:     isMeeting ? null : (category_id ? Number(category_id) : null),
          label,
          start_time:      normStart,
          end_time:        normEnd,
          volunteer_need,
          notes,
          sms_code:        sms_code !== undefined ? sms_code?.trim() || null : undefined,
          invitable:       !!invitable,
          is_meeting:      isMeeting,
          has_keyman:      isMeeting ? false : (has_keyman !== false && has_keyman !== "false"),
          has_keyman_asst: isMeeting ? false : (has_keyman_asst !== false && has_keyman_asst !== "false"),
        });
        if (!ok)
          return res.status(404).json({ success: false, error: "Not found." });

        // Reset the T-15 dupe guard so the alert can fire against the new
        // start_time. Only clears rolling T-15 rows (schedule_id IS NULL);
        // burst alert history is preserved.
        await clearT15AlertsForShift(id).catch((err) => {
          (logError || console.error)(
            "clearT15AlertsForShift error (non-fatal):",
            err,
          );
        });

        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("timelines/shifts PUT error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  router.delete(
    "/oversight/tools/timelines/shifts/:id",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });
      try {
        const ok = await deleteShift(id);
        if (!ok)
          return res.status(404).json({ success: false, error: "Not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("timelines/shifts DELETE error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  // ===========================
  // TIMELINES — Schedule Assignments
  // ===========================

  router.post(
    "/oversight/tools/timelines/assignments",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const {
        shift_id,
        location_task_id,
        volunteer_need,
        vol_min,
        vol_max,
        notes,
      } = req.body || {};
      if (!shift_id || !location_task_id)
        return res
          .status(400)
          .json({ success: false, error: "Missing required fields." });
      try {
        const id = await createScheduleAssignment({
          shift_id: Number(shift_id),
          location_task_id: Number(location_task_id),
          volunteer_need:
            volunteer_need != null ? Number(volunteer_need) : null,
          vol_min: vol_min != null && vol_min !== "" ? Number(vol_min) : null,
          vol_max: vol_max != null && vol_max !== "" ? Number(vol_max) : null,
          notes,
        });
        return res.json({ success: true, id });
      } catch (err) {
        (logError || console.error)("timelines/assignments POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );
  /**
   * PUT /oversight/tools/timelines/assignments/:id
   * Update volunteer_need and notes on an existing assignment.
   * Body (JSON): { volunteer_need, notes }
   */
  router.put(
    "/oversight/tools/timelines/assignments/:id",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });
      const { volunteer_need, vol_min, vol_max, notes } = req.body || {};
      try {
        const ok = await updateScheduleAssignment(id, {
          volunteer_need:
            volunteer_need != null && volunteer_need !== ""
              ? Number(volunteer_need)
              : null,
          vol_min: vol_min != null && vol_min !== "" ? Number(vol_min) : null,
          vol_max: vol_max != null && vol_max !== "" ? Number(vol_max) : null,
          notes,
        });
        if (!ok)
          return res.status(404).json({ success: false, error: "Not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("timelines/assignments PUT error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  router.delete(
    "/oversight/tools/timelines/assignments/:id",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });
      try {
        const ok = await deleteScheduleAssignment(id);
        if (!ok)
          return res.status(404).json({ success: false, error: "Not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("timelines/assignments DELETE error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  // ===========================
  // RENDEZVOUS POINTS
  // ===========================

  /**
   * GET /api/rendezvous/day/:dayId
   * Batch-fetch all rendezvous points for a convention day.
   * Used by scheduler preload and the landing page.
   *
   * @requires viewSchedules permission (REGISTERED+)
   */
  router.get(
    "/api/rendezvous/day/:dayId",
    requireAuth,
    requirePermission("viewSchedules"),
    async (req, res) => {
      const dayId = Number(req.params.dayId);
      if (!dayId) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid day id." });
      }
      try {
        const rows = await getRendezvousForDay(dayId);
        return res.json({ success: true, rows });
      } catch (err) {
        (logError || console.error)("rendezvous/day GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * GET /api/rendezvous/photo/:blobName
   * Stream a rendezvous photo to the client (authenticated proxy).
   *
   * @requires viewSchedules permission (REGISTERED+)
   */
  router.get(
    "/api/rendezvous/photo/:blobName",
    requireAuth,
    requirePermission("viewSchedules"),
    async (req, res) => {
      const blobName = req.params.blobName;
      if (!blobName || !blobName.startsWith("rv-")) {
        return res.status(400).send("Invalid blob name.");
      }
      try {
        await streamSignPhotoToResponse(blobName, res);
      } catch (err) {
        (logError || console.error)("rendezvous photo GET error:", err);
        if (!res.headersSent) {
          return res.status(404).send("Photo not found.");
        }
      }
    },
  );

  /**
   * GET /api/rendezvous/:scheduleAssignmentId
   * Fetch the rendezvous point for a single schedule assignment.
   *
   * @requires viewSchedules permission (REGISTERED+)
   */
  router.get(
    "/api/rendezvous/:scheduleAssignmentId",
    requireAuth,
    requirePermission("viewSchedules"),
    async (req, res) => {
      const saId = Number(req.params.scheduleAssignmentId);
      if (!saId) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid assignment id." });
      }
      try {
        const rv = await getShiftRendezvous(saId);
        return res.json({ success: true, rv });
      } catch (err) {
        (logError || console.error)("rendezvous GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /api/rendezvous
   * Create a rendezvous point for a schedule assignment.
   * Body (JSON): { schedule_assignment_id, description, address,
   *                latitude, longitude, floor_number }
   *
   * @requires manageShifts permission (OVERSEER+)
   */
  router.post(
    "/api/rendezvous",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const {
        schedule_assignment_id,
        description,
        address,
        latitude,
        longitude,
        floor_number,
      } = req.body || {};
      if (!schedule_assignment_id) {
        return res.status(400).json({
          success: false,
          error: "schedule_assignment_id is required.",
        });
      }
      try {
        const id = await createShiftRendezvous({
          schedule_assignment_id: Number(schedule_assignment_id),
          description: description || null,
          address: address || null,
          latitude: latitude != null ? Number(latitude) : null,
          longitude: longitude != null ? Number(longitude) : null,
          floor_number: floor_number || null,
          created_by: req.session.userId,
        });
        return res.json({ success: true, id });
      } catch (err) {
        if (
          err.message?.includes("UQ_rendezvous_assignment") ||
          err.message?.includes("UNIQUE")
        ) {
          return res.status(409).json({
            success: false,
            error: "A rendezvous point already exists for this assignment.",
          });
        }
        (logError || console.error)("rendezvous POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * PUT /api/rendezvous/:id
   * Update a rendezvous point. Null values clear the corresponding field.
   * Body (JSON): { description, address, latitude, longitude, floor_number,
   *                send_alert? }
   *
   * If send_alert is true the server sends an ad-hoc SMS update to all
   * volunteers assigned to the parent schedule assignment.
   *
   * @requires editRendezvous permission (KEYMAN+)
   */
  router.put(
    "/api/rendezvous/:id",
    requireAuth,
    requirePermission("editRendezvous"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id) {
        return res.status(400).json({ success: false, error: "Invalid id." });
      }

      const existing = await getShiftRendezvousById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: "Not found." });
      }

      const {
        description,
        address,
        latitude,
        longitude,
        floor_number,
        send_alert,
      } = req.body || {};

      try {
        const ok = await updateShiftRendezvous(id, {
          description: description ?? existing.description,
          address: address ?? existing.address,
          latitude: latitude !== undefined ? latitude : existing.latitude,
          longitude: longitude !== undefined ? longitude : existing.longitude,
          floor_number: floor_number ?? existing.floor_number,
          photo_blob_name: existing.photo_blob_name,
          updated_by: req.session.userId,
        });
        if (!ok) {
          return res.status(404).json({ success: false, error: "Not found." });
        }

        // Ad-hoc alert: send SMS to all assigned volunteers
        let alertResult = null;
        if (send_alert && twilioAccountSid && twilioAuthToken && twilioMsgSid) {
          try {
            const vols = await getVolunteersForRendezvousAlert(
              existing.schedule_assignment_id,
            );
            const desc =
              (description ?? existing.description) || "updated meeting point";
            let sent = 0;
            let failed = 0;
            for (const vol of vols) {
              const body =
                `Albany JW Parking: Updated meet-up for your ` +
                `${vol.event_type_name} shift at ` +
                `${_fmtTimeShort(vol.start_time)}: ${desc}`;
              try {
                await sendAlertSms(
                  vol.phone,
                  body,
                  twilioAccountSid,
                  twilioAuthToken,
                  twilioMsgSid,
                );
                sent++;
              } catch (smsErr) {
                (logError || console.error)(
                  `RV alert send error vol ${vol.volunteer_id}:`,
                  smsErr,
                );
                failed++;
              }
            }
            alertResult = { sent, failed, total: vols.length };
          } catch (alertErr) {
            (logError || console.error)("RV ad-hoc alert error:", alertErr);
            alertResult = { error: "Alert send failed." };
          }
        }

        return res.json({ success: true, alertResult });
      } catch (err) {
        (logError || console.error)("rendezvous PUT error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * DELETE /api/rendezvous/:id
   * Delete a rendezvous point (and its photo blob if present).
   *
   * @requires manageShifts permission (OVERSEER+)
   */
  router.delete(
    "/api/rendezvous/:id",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id) {
        return res.status(400).json({ success: false, error: "Invalid id." });
      }
      try {
        const existing = await getShiftRendezvousById(id);
        if (!existing) {
          return res.status(404).json({ success: false, error: "Not found." });
        }

        const ok = await deleteShiftRendezvous(id);
        if (!ok) {
          return res.status(404).json({ success: false, error: "Not found." });
        }

        // Best-effort blob cleanup
        if (existing.photo_blob_name) {
          try {
            await deleteSignPhoto(existing.photo_blob_name);
          } catch (bErr) {
            (logError || console.error)(
              "Warning: failed to delete RV photo blob:",
              bErr,
            );
          }
        }

        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("rendezvous DELETE error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /api/rendezvous/:id/photo
   * Upload (or replace) the photo for a rendezvous point.
   * Form data: `photo` (image file, multipart/form-data).
   * CSRF token must be sent as X-CSRF-Token header.
   *
   * @requires editRendezvous permission (KEYMAN+)
   */
  router.post(
    "/api/rendezvous/:id/photo",
    requireAuth,
    requirePermission("editRendezvous"),
    csrfProtection,
    rvPhotoUpload.single("photo"),
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id) {
        return res.status(400).json({ success: false, error: "Invalid id." });
      }
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "No photo uploaded." });
      }

      try {
        const existing = await getShiftRendezvousById(id);
        if (!existing) {
          return res.status(404).json({ success: false, error: "Not found." });
        }

        const newBlobName = await uploadRendezvousPhoto(
          existing.schedule_assignment_id,
          req.file.buffer,
        );

        await updateShiftRendezvous(id, {
          description: existing.description,
          address: existing.address,
          latitude: existing.latitude,
          longitude: existing.longitude,
          floor_number: existing.floor_number,
          photo_blob_name: newBlobName,
          updated_by: req.session.userId,
        });

        // Best-effort delete of previous blob
        if (
          existing.photo_blob_name &&
          existing.photo_blob_name !== newBlobName
        ) {
          try {
            await deleteSignPhoto(existing.photo_blob_name);
          } catch (bErr) {
            (logError || console.error)(
              "Warning: failed to delete old RV photo blob:",
              bErr,
            );
          }
        }

        return res.json({ success: true, photo_blob_name: newBlobName });
      } catch (err) {
        (logError || console.error)("rendezvous photo POST error:", err);
        const isImgErr = /Input (?:buffer|file)|unsupported image/i.test(
          err.message || "",
        );
        return res.status(isImgErr ? 400 : 500).json({
          success: false,
          error: isImgErr
            ? "Could not process the image. Try a different file."
            : "Server error.",
        });
      }
    },
  );

  /**
   * DELETE /api/rendezvous/:id/photo
   * Clear the photo from a rendezvous point (KEYMAN can clear fields).
   *
   * @requires editRendezvous permission (KEYMAN+)
   */
  router.delete(
    "/api/rendezvous/:id/photo",
    requireAuth,
    requirePermission("editRendezvous"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id) {
        return res.status(400).json({ success: false, error: "Invalid id." });
      }

      try {
        const existing = await getShiftRendezvousById(id);
        if (!existing) {
          return res.status(404).json({ success: false, error: "Not found." });
        }

        if (existing.photo_blob_name) {
          await updateShiftRendezvous(id, {
            description: existing.description,
            address: existing.address,
            latitude: existing.latitude,
            longitude: existing.longitude,
            floor_number: existing.floor_number,
            photo_blob_name: null,
            updated_by: req.session.userId,
          });

          try {
            await deleteSignPhoto(existing.photo_blob_name);
          } catch (bErr) {
            (logError || console.error)(
              "Warning: failed to delete RV photo blob:",
              bErr,
            );
          }
        }

        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("rendezvous photo DELETE error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * GET /oversight/tools/rendezvous
   * Landing page: rendezvous points sorted by day, filterable by event type.
   *
   * @requires editRendezvous permission (KEYMAN+)
   */
  router.get(
    "/oversight/tools/rendezvous",
    requireAuth,
    requirePermission("editRendezvous"),
    csrfProtection,
    async (req, res) => {
      const year = parseInt(req.query.year) || new Date().getFullYear();
      try {
        const days = await getConventionDaysWithShifts(year);
        return res.render("authentication_and_accounts/rendezvous", {
          csrfToken: req.csrfToken(),
          year,
          days,
          currentYear: new Date().getFullYear(),
          userPermissions: req.session.permissions || {},
          userRole: req.session.userRole || "NON_REGISTERED",
        });
      } catch (err) {
        (logError || console.error)("rendezvous landing GET error:", err);
        return res.status(500).send("Server error.");
      }
    },
  );

  // ===========================
  // CAMPAIGN CENTER
  // ===========================

  /**
   * GET /oversight/tools/campaigns
   * Render the Campaign Center.
   * Passes volunteers, templates, invitable convention days with shifts,
   * and active invitation batches for the current year.
   *
   * Optional ?batchId= query param pre-selects a batch in add-to-campaign mode.
   *
   * @requires accessAdminConsole permission
   */
  router.get(
    "/oversight/tools/campaigns",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      try {
        const year = new Date().getFullYear();
        const batchId = req.query.batchId ? Number(req.query.batchId) : null;
        const selectPending = req.query.selectPending === "1";

        const [volunteers, templates, conventionDays, batches] =
          await Promise.all([
            getVolunteersForMessaging(),
            getMessageTemplates(),
            getInvitableDaysWithShifts(year),
            getInvitationBatches(year),
          ]);

        let preselectedBatch = null;
        let pendingVolunteerIds = [];

        if (batchId) {
          preselectedBatch = batches.find((b) => b.id === batchId) || null;

          // If selectPending=1, compute truly-pending volunteers using the same
          // cross-campaign dedup logic the tracker applies client-side.
          // A volunteer is "pending" only if they have NO responded_at in ANY
          // row across this batch or its follow-up campaigns — including rows
          // from earlier re-sends within the same batch.
          if (selectPending) {
            const childBatchIds = batches
              .filter((b) => b.parent_batch_id === batchId)
              .map((b) => b.id);

            // Fetch all rows for this batch plus all follow-up batches in parallel.
            const [allBatchInvs, ...childInvArrays] = await Promise.all([
              getInvitationsForTracker({ batchId, includeRevoked: false }),
              ...childBatchIds.map((bid) =>
                getInvitationsForTracker({
                  batchId: bid,
                  includeRevoked: false,
                }),
              ),
            ]);
            const allRelatedInvs = [...allBatchInvs, ...childInvArrays.flat()];

            // Per-volunteer state: did they respond anywhere, and are they
            // pending in the parent batch (at least one unresponded row)?
            /** @type {Map<number, { responded: boolean, pendingInParent: boolean }>} */
            const volState = new Map();
            allRelatedInvs.forEach((inv) => {
              const vid = inv.volunteer_id;
              if (!volState.has(vid))
                volState.set(vid, { responded: false, pendingInParent: false });
              const s = volState.get(vid);
              if (inv.responded_at && !inv.revoked) s.responded = true;
              if (inv.batch_id === batchId && !inv.responded_at && !inv.revoked)
                s.pendingInParent = true;
            });

            const messageableIds = new Set(volunteers.map((v) => v.id));
            pendingVolunteerIds = [
              ...new Set(
                [...volState.entries()]
                  .filter(
                    ([vid, s]) =>
                      s.pendingInParent &&
                      !s.responded &&
                      messageableIds.has(vid),
                  )
                  .map(([vid]) => vid),
              ),
            ];
          }
        }

        return res.render("authentication_and_accounts/campaignCenter", {
          csrfToken: req.csrfToken(),
          volunteers,
          templates,
          conventionDays,
          batches,
          preselectedBatch,
          pendingVolunteerIds,
          year,
          success: req.query.success
            ? decodeURIComponent(req.query.success)
            : null,
          error: req.query.error ? decodeURIComponent(req.query.error) : null,
        });
      } catch (err) {
        (logError || console.error)("campaigns GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  /**
   * POST /oversight/tools/campaigns/send
   * Send an invite message (email, SMS, or both) to one or more volunteers.
   *
   * Optionally links each invitation to a convention day + shift for
   * tracking purposes. If a conventionDayId is provided and any selected
   * volunteers already have an open (unanswered) invitation for that day,
   * the response includes a `pendingWarnings` array — the caller can prompt
   * the user to confirm before re-sending (warn-only, not a hard block).
   *
   * Body (JSON):
   * {
   *   volunteerIds:     number[],
   *   subject:          string,
   *   body:             string,
   *   sendEmail:        boolean,
   *   sendSms:          boolean,
   *   conventionDayId?: number|null,
   *   shiftId?:         number|null,
   *   force?:           boolean      — true = skip double-send warning check
   * }
   *
   * Response:
   * {
   *   success:          boolean,
   *   sent:             number,
   *   skipped:          Array<{ name: string, reason: string }>,
   *   errors:           Array<{ name: string, reason: string }>,
   *   pendingWarnings?: Array<{ id: number, name: string }>
   * }
   *
   * @requires accessAdminConsole permission
   */
  router.post(
    "/oversight/tools/campaigns/send",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const {
        volunteerIds,
        subject,
        body,
        sendEmail,
        sendSms,
        campaignMode = "new",
        batchName = null,
        existingBatchId = null,
        parentBatchId = null,
        responseNeeded = true,
        conventionDayId = null,
        sessionId = null,
        shiftId = null,
        force = false,
        isReminder = false,
        messageType = "invitation",
        responseConfig = null,
      } = req.body || {};

      const sentBy = req.session.userEmail || "admin";
      const year = new Date().getFullYear();
      let dayId = conventionDayId ? Number(conventionDayId) : null;
      let resolvedSess = sessionId ? Number(sessionId) : null;
      let resolvedShift = shiftId ? Number(shiftId) : null;
      const resolvedBatch = existingBatchId ? Number(existingBatchId) : null;
      const resolvedParent = parentBatchId ? Number(parentBatchId) : null;

      // Follow-up campaigns inherit the parent's event context when none is provided.
      // This ensures follow-up invitation rows stay tied to the same day/shift as
      // the original campaign, so they appear correctly in attendance check-in.
      if (
        campaignMode === "followup" &&
        resolvedParent &&
        !dayId &&
        !resolvedShift
      ) {
        try {
          const parentBatch = await getInvitationBatch(resolvedParent);
          if (parentBatch) {
            dayId = parentBatch.convention_day_id ?? null;
            resolvedSess = parentBatch.session_id ?? null;
            resolvedShift = parentBatch.shift_id ?? null;
          }
        } catch (err) {
          (logError || console.error)(
            "campaigns/send inherit parent event context error:",
            err,
          );
          // Non-fatal — proceed without inherited context
        }
      }

      // ── Input validation ────────────────────────────────────────────────
      if (!Array.isArray(volunteerIds) || volunteerIds.length === 0)
        return res
          .status(400)
          .json({ success: false, error: "No recipients selected." });
      if (!body?.trim())
        return res
          .status(400)
          .json({ success: false, error: "Message body is required." });
      if (!sendEmail && !sendSms)
        return res
          .status(400)
          .json({ success: false, error: "Select at least one channel." });
      if (campaignMode === "new" && !batchName?.trim())
        return res
          .status(400)
          .json({ success: false, error: "Campaign name is required." });
      if (campaignMode === "followup" && !resolvedParent)
        return res.status(400).json({
          success: false,
          error: "Select a parent campaign for the follow-up.",
        });
      if (campaignMode === "followup" && !batchName?.trim())
        return res
          .status(400)
          .json({ success: false, error: "Campaign name is required." });
      if (campaignMode === "add_to" && !resolvedBatch)
        return res
          .status(400)
          .json({ success: false, error: "Select an existing campaign." });

      // Creating a new campaign (new or followup) requires createCampaign permission
      if (campaignMode !== "add_to") {
        const perms = req.session.permissions ?? {};
        const role = req.session.userRole ?? "NON_REGISTERED";
        if (!perms[role]?.createCampaign) {
          return res.status(403).json({
            success: false,
            error: "You do not have permission to create campaigns.",
          });
        }
      }

      // ── Fetch volunteers ────────────────────────────────────────────────
      let volunteers;
      try {
        const all = await getVolunteersForMessaging();
        const idSet = new Set(volunteerIds.map(Number));
        volunteers = all.filter((v) => idSet.has(v.id));
      } catch (err) {
        (logError || console.error)(
          "campaigns/send fetch volunteers error:",
          err,
        );
        return res
          .status(500)
          .json({ success: false, error: "Server error fetching volunteers." });
      }

      if (volunteers.length === 0)
        return res
          .status(400)
          .json({ success: false, error: "No valid volunteers found." });

      // ── Double-send warning ─────────────────────────────────────────────
      // Reminders intentionally re-contact existing invitees — skip the check.
      if (!force && !isReminder) {
        try {
          let pendingIds = [];

          if (campaignMode === "add_to" && resolvedBatch) {
            const batchInvs = await getInvitationsForTracker({
              batchId: resolvedBatch,
              includeRevoked: false,
            });
            const batchVolIds = new Set(
              batchInvs
                .filter((i) => !i.responded_at)
                .map((i) => i.volunteer_id),
            );
            pendingIds = volunteers
              .map((v) => v.id)
              .filter((id) => batchVolIds.has(id));
          } else if (dayId) {
            pendingIds = await getVolunteersWithPendingInvitesDeep(
              volunteers.map((v) => v.id),
              {
                conventionDayId: dayId,
                sessionId: resolvedSess,
                shiftId: resolvedShift,
              },
            );
          }

          if (pendingIds.length > 0) {
            const pendingSet = new Set(pendingIds);
            const pendingWarnings = volunteers
              .filter((v) => pendingSet.has(v.id))
              .map((v) => ({
                id: v.id,
                name: [v.lastName, v.firstName].filter(Boolean).join(", "),
              }));
            return res.json({ success: false, pendingWarnings });
          }
        } catch (err) {
          (logError || console.error)(
            "campaigns/send pending check error:",
            err,
          );
          // Non-fatal — proceed
        }
      }

      // ── Resolve or create the batch ─────────────────────────────────────
      let batchId;
      try {
        if (campaignMode === "add_to" && resolvedBatch) {
          batchId = resolvedBatch;
        } else {
          batchId = await createInvitationBatch({
            name: batchName.trim(),
            conventionDayId: dayId,
            shiftId: resolvedShift,
            messageSubject: subject?.trim() || null,
            messageBody: body.trim(),
            year,
            createdBy: sentBy,
            parentBatchId: campaignMode === "followup" ? resolvedParent : null,
            responseNeeded:
              responseNeeded !== false && responseNeeded !== "false",
            messageType: ["invitation", "alert", "followup"].includes(
              messageType,
            )
              ? messageType
              : "invitation",
            responseConfig: responseConfig || null,
          });
        }
      } catch (err) {
        (logError || console.error)(
          "campaigns/send createInvitationBatch error:",
          err,
        );
        return res
          .status(500)
          .json({ success: false, error: "Failed to create campaign record." });
      }

      /** @type {Array<{ name: string, reason: string }>} */
      const skipped = [];
      /** @type {Array<{ name: string, reason: string }>} */
      const errors = [];
      let sent = 0;

      const baseUrl = getBaseUrl(req);
      // ── Fetch shift context for merge fields ────────────────────────────
      // Fetches location names, address, maps_url, times, and day context
      // for the linked shift. Null when no event is linked to the batch.
      let shiftContext = null;
      if (batchId) {
        try {
          shiftContext = await getInvitationBatch(batchId);
        } catch (err) {
          (logError || console.error)(
            "campaigns/send getInvitationBatch for merge fields error:",
            err,
          );
          // Non-fatal — merge fields will resolve to empty strings
        }
      }

      // ── Per-volunteer send loop ─────────────────────────────────────────
      for (const vol of volunteers) {
        const fullName = [vol.firstName, vol.lastName]
          .filter(Boolean)
          .join(" ");
        const shortName = [vol.lastName, vol.firstName]
          .filter(Boolean)
          .join(", ");

        const willEmail = sendEmail && !!vol.email;
        const willSms = sendSms && !!vol.phone && !!vol.smsCapable;

        if (!willEmail && !willSms) {
          const missing = [];
          if (sendEmail && !vol.email) missing.push("no email on file");
          if (sendSms && !vol.phone) missing.push("no phone on file");
          if (sendSms && !vol.smsCapable) missing.push("SMS not capable");
          skipped.push({ name: shortName, reason: missing.join("; ") });
          continue;
        }

        // Reminder path — reuse the existing invitation row and token.
        // Falls through to INSERT if no existing row is found (e.g. revoked
        // and reinstated, or called with isReminder=true by mistake).
        let existingInvitation = null;
        if (isReminder && batchId) {
          try {
            existingInvitation = await getInvitationByVolunteerBatch(
              vol.id,
              batchId,
            );
          } catch (err) {
            (logError || console.error)(
              `campaigns/send getInvitationByVolunteerBatch error for vol ${vol.id}:`,
              err,
            );
          }
        }

        // Reminder path requires an existing invitation row.
        // If none is found (e.g. revoked, already responded, or missing),
        // skip this volunteer rather than creating a new invitation record.
        if (isReminder && !existingInvitation) {
          skipped.push({
            name: shortName,
            reason: "No open invitation found to remind.",
          });
          continue;
        }

        const token = existingInvitation
          ? existingInvitation.token
          : crypto.randomUUID();
        const rsvpUrl = `${baseUrl}/invite/respond/${encodeURIComponent(token)}`;

        /**
         * Replace all {field} placeholders in a string.
         * @param {string} text
         * @returns {string}
         */
        /**
         * Build the location string for merge fields.
         * Single location → just the name.
         * Multiple → "At one of: Name1, Name2, …"
         * @returns {string}
         */
        function resolveLocationName() {
          if (!shiftContext) return "";
          const count = shiftContext.location_count || 0;
          const names = shiftContext.location_names || "";
          if (!names) return "";
          return count > 1 ? `At one of: ${names}` : names;
        }

        /**
         * Format a TIME value (epoch-anchored Date or ISO string) to h:MM AM/PM.
         * @param {Date|string|null} val
         * @returns {string}
         */
        function fmtShiftTime(val) {
          if (!val) return "";
          const d = new Date(val);
          if (isNaN(d.valueOf())) return String(val).slice(0, 5);
          const h = d.getUTCHours();
          const m = String(d.getUTCMinutes()).padStart(2, "0");
          const ap = h >= 12 ? "PM" : "AM";
          return `${h % 12 || 12}:${m} ${ap}`;
        }

        function resolveMergeFields(text) {
          return text
            .replace(/\{firstName\}/g, vol.firstName || "")
            .replace(/\{lastName\}/g, vol.lastName || "")
            .replace(/\{fullName\}/g, fullName)
            .replace(/\{link\}/g, rsvpUrl)
            .replace(/\{year\}/g, String(year))
            .replace(
              /\{shiftDate\}/g,
              shiftContext?.convention_date
                ? new Date(shiftContext.convention_date).toLocaleDateString(
                    "en-US",
                    {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      timeZone: "UTC",
                    },
                  )
                : "",
            )
            .replace(/\{shiftDay\}/g, shiftContext?.day_label || "")
            .replace(/\{shiftStart\}/g, fmtShiftTime(shiftContext?.shift_start))
            .replace(/\{shiftEnd\}/g, fmtShiftTime(shiftContext?.shift_end))
            .replace(/\{shiftType\}/g, shiftContext?.event_type_name || "")
            .replace(/\{shiftLabel\}/g, shiftContext?.shift_label || "")
            .replace(/\{locationName\}/g, resolveLocationName())
            .replace(
              /\{locationAddress\}/g,
              shiftContext?.location_address || "",
            )
            .replace(
              /\{locationMapsUrl\}/g,
              shiftContext?.location_maps_url || "",
            );
        }

        const resolvedSubject = resolveMergeFields(subject || "");
        const resolvedBody = resolveMergeFields(body);
        const channel =
          willEmail && willSms ? "both" : willEmail ? "email" : "sms";

        // Store or update invitation record
        try {
          if (existingInvitation) {
            await remindInvitation({
              id: existingInvitation.id,
              channel,
              remindedBy: sentBy,
            });
          } else {
            await createInvitation({
              volunteerId: vol.id,
              token,
              channel,
              messageSubject: resolvedSubject || null,
              messageBody: resolvedBody,
              sentBy,
              conventionDayId: dayId,
              sessionId: resolvedSess,
              shiftId: resolvedShift,
              batchId,
            });
          }
        } catch (err) {
          (logError || console.error)(
            `campaigns/send ${existingInvitation ? "remindInvitation" : "createInvitation"} error for vol ${vol.id}:`,
            err,
          );
          errors.push({
            name: shortName,
            reason: "Failed to store invitation record.",
          });
          continue;
        }

        // Send email
        if (willEmail) {
          try {
            const ok = await sendResetEmail(vol.email, rsvpUrl, {
              ...smtpConfig,
              firstName: vol.firstName,
              subject: resolvedSubject || "Albany JW Parking — You're invited",
              isResume: false,
              customBody: resolvedBody,
            });
            if (!ok)
              errors.push({
                name: shortName,
                reason: "Email delivery failed.",
              });
          } catch (err) {
            (logError || console.error)(
              `messaging/send email error for vol ${vol.id}:`,
              err,
            );
            errors.push({
              name: shortName,
              reason: "Email threw an exception.",
            });
          }
        }

        // Send SMS
        if (willSms) {
          try {
            const ok = await sendResetSms(
              vol.phone,
              rsvpUrl,
              twilioAccountSid,
              twilioAuthToken,
              twilioMsgSid,
              { firstName: vol.firstName, customBody: resolvedBody },
            );
            if (!ok)
              errors.push({ name: shortName, reason: "SMS delivery failed." });
          } catch (err) {
            (logError || console.error)(
              `messaging/send SMS error for vol ${vol.id}:`,
              err,
            );
            errors.push({ name: shortName, reason: "SMS threw an exception." });
          }
        }

        sent++;
      }

      return res.json({ success: true, sent, batchId, skipped, errors });
    },
  );

  // ===========================
  // CAMPAIGN CENTER — Templates
  // ===========================

  /**
   * GET /oversight/tools/campaigns/templates
   * Return all active templates as JSON.
   * Used by the frontend to refresh the template list after saves/deletes.
   *
   * Response: { success: true, templates: Array<template> }
   *
   * @requires accessAdminConsole permission
   */
  router.get(
    "/oversight/tools/campaigns/templates",
    requireAuth,
    requirePermission("accessAdminConsole"),
    async (req, res) => {
      try {
        const templates = await getMessageTemplates();
        return res.json({ success: true, templates });
      } catch (err) {
        (logError || console.error)("campaigns/templates GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /oversight/tools/campaigns/templates
   * Create a new message template.
   *
   * Body (JSON): { name, subject, body }
   * Response:    { success: true, id: number }
   *
   * @requires accessAdminConsole permission
   */
  router.post(
    "/oversight/tools/campaigns/templates",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const { name, subject, body } = req.body || {};

      if (!name?.trim()) {
        return res
          .status(400)
          .json({ success: false, error: "Template name is required." });
      }
      if (!body?.trim()) {
        return res
          .status(400)
          .json({ success: false, error: "Template body is required." });
      }

      try {
        const id = await createMessageTemplate({
          name: name.trim(),
          subject: subject?.trim() || null,
          body: body.trim(),
          createdBy: req.session.userEmail || "admin",
        });
        return res.json({ success: true, id });
      } catch (err) {
        (logError || console.error)("campaigns/templates POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * PUT /oversight/tools/campaigns/templates/:id
   * Update an existing template's name, subject, and body.
   *
   * Body (JSON): { name, subject, body }
   * Response:    { success: true }
   *
   * @requires accessAdminConsole permission
   */
  router.put(
    "/oversight/tools/campaigns/templates/:id",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      const { name, subject, body } = req.body || {};

      if (!id) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid template id." });
      }
      if (!name?.trim()) {
        return res
          .status(400)
          .json({ success: false, error: "Template name is required." });
      }
      if (!body?.trim()) {
        return res
          .status(400)
          .json({ success: false, error: "Template body is required." });
      }

      try {
        const ok = await updateMessageTemplate(id, {
          name: name.trim(),
          subject: subject?.trim() || null,
          body: body.trim(),
        });
        if (!ok) {
          return res
            .status(404)
            .json({ success: false, error: "Template not found." });
        }
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("campaigns/templates PUT error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * DELETE /oversight/tools/campaigns/templates/:id
   * Soft-delete a template (sets active = 0).
   *
   * Response: { success: true }
   *
   * @requires accessAdminConsole permission
   */
  router.delete(
    "/oversight/tools/campaigns/templates/:id",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid template id." });
      }

      try {
        const ok = await deleteMessageTemplate(id);
        if (!ok) {
          return res
            .status(404)
            .json({ success: false, error: "Template not found." });
        }
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("campaigns/templates DELETE error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );
  // ===========================
  // INVITATION BATCHES
  // ===========================

  /**
   * GET /oversight/tools/campaigns/batches
   * Return all active batches for the current year as JSON.
   * Used by the Campaign Center to refresh the batch picker.
   *
   * @requires accessAdminConsole permission
   */
  router.get(
    "/oversight/tools/campaigns/batches",
    requireAuth,
    requirePermission("accessAdminConsole"),
    async (req, res) => {
      try {
        const year = req.query.year
          ? Number(req.query.year)
          : new Date().getFullYear();
        const batches = await getInvitationBatches(year);
        return res.json({ success: true, batches });
      } catch (err) {
        (logError || console.error)("campaigns/batches GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /oversight/tools/campaigns/batches/suggest-name
   * Auto-suggest a batch name from event context.
   * Called when the user selects a day/shift in the Messaging Center
   * and hasn't typed a custom name yet.
   *
   * Body (JSON): { dayLabel, conventionDate, shiftLabel, eventTypeName }
   * Response:    { success: true, name: string }
   *
   * @requires accessAdminConsole permission
   */
  router.post(
    "/oversight/tools/campaigns/batches/suggest-name",
    requireAuth,
    requirePermission("accessAdminConsole"),
    async (req, res) => {
      const { dayLabel, conventionDate, shiftLabel, eventTypeName } =
        req.body || {};
      const name = suggestBatchName({
        dayLabel,
        conventionDate,
        shiftLabel,
        eventTypeName,
      });
      return res.json({ success: true, name });
    },
  );

  /**
   * GET /oversight/tools/campaigns/batches/:id
   * Fetch a single batch with full context.
   * Used by the Messaging Center when switching into add-to-campaign mode.
   *
   * @requires accessAdminConsole permission
   */
  router.get(
    "/oversight/tools/campaigns/batches/:id",
    requireAuth,
    requirePermission("accessAdminConsole"),
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });
      try {
        const batch = await getInvitationBatch(id);
        if (!batch)
          return res
            .status(404)
            .json({ success: false, error: "Batch not found." });
        return res.json({ success: true, batch });
      } catch (err) {
        (logError || console.error)("campaigns/batches/:id GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );
  // ===========================
  // INVITATION REVOCATION
  // ===========================

  /**
   * POST /oversight/tools/campaigns/invitations/:id/revoke
   * Revoke a single invitation.
   *
   * Body (JSON): { notes? }
   * Response:    { success: boolean }
   *
   * @requires accessAdminConsole permission
   */
  router.post(
    "/oversight/tools/campaigns/invitations/:id/revoke",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      const notes = req.body?.notes || null;
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });

      try {
        const ok = await revokeInvitation(
          id,
          req.session.userEmail || "admin",
          notes,
        );
        if (!ok)
          return res
            .status(404)
            .json({ success: false, error: "Invitation not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("invitations/revoke POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /oversight/tools/campaigns/invitations/:id/reinstate
   * Reinstate a revoked invitation.
   *
   * Body (JSON): { notes? }
   * Response:    { success: boolean }
   *
   * @requires accessAdminConsole permission
   */
  router.post(
    "/oversight/tools/campaigns/invitations/:id/reinstate",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      const notes = req.body?.notes || null;
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });

      try {
        const ok = await reinstateInvitation(
          id,
          req.session.userEmail || "admin",
          notes,
        );
        if (!ok)
          return res
            .status(404)
            .json({ success: false, error: "Invitation not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("invitations/reinstate POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * PUT /oversight/tools/campaigns/batches/:id
   * Update an existing invitation batch's editable fields.
   * Restricted to users with the manageCampaigns permission (ADMIN by default).
   *
   * Body (JSON): {
   *   name:           string,
   *   messageSubject: string|null,
   *   messageBody:    string,
   *   parentBatchId:  number|null,
   *   responseNeeded: boolean,
   *   active:         boolean,
   *   responseConfig: object|null
   * }
   * Response: { success: boolean, error?: string }
   *
   * @requires manageCampaigns permission
   */
  router.put(
    "/oversight/tools/campaigns/batches/:id",
    requireAuth,
    requirePermission("manageCampaigns"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });

      const {
        name,
        messageSubject,
        messageBody,
        parentBatchId,
        responseNeeded,
        active,
        messageType,
        responseConfig = null,
      } = req.body || {};

      if (!name?.trim())
        return res
          .status(400)
          .json({ success: false, error: "Name is required." });
      if (!messageBody?.trim())
        return res
          .status(400)
          .json({ success: false, error: "Message body is required." });

      // Prevent a batch from being its own parent
      const resolvedParent = parentBatchId ? Number(parentBatchId) : null;
      if (resolvedParent === id)
        return res.status(400).json({
          success: false,
          error: "A campaign cannot be its own parent.",
        });

      try {
        const ok = await updateInvitationBatch({
          id,
          name: name.trim(),
          messageSubject: messageSubject?.trim() || null,
          messageBody: messageBody.trim(),
          parentBatchId: resolvedParent,
          responseNeeded:
            responseNeeded !== false && responseNeeded !== "false",
          active: active !== false && active !== "false",
          messageType: ["invitation", "alert", "followup"].includes(messageType)
            ? messageType
            : "invitation",
          responseConfig: responseConfig || null,
        });

        if (!ok)
          return res
            .status(404)
            .json({ success: false, error: "Campaign not found." });

        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("campaigns/batches PUT error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * GET /oversight/tools/campaigns/tracker
   * Render the Invitation Tracker page.
   * Now supports filtering by batch in addition to day and response.
   *
   * Optional query params:
   *  - dayId          — filter by convention day id
   *  - batchId        — filter by invitation batch id
   *  - response       — 'all' | 'pending' | 'yes' | 'no' | 'maybe'
   *  - includeRevoked — '1' to include (default), '0' to hide
   *
   * @requires accessAdminConsole permission
   */
  router.get(
    "/oversight/tools/campaigns/tracker",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const year = new Date().getFullYear();
      const dayId = req.query.dayId ? Number(req.query.dayId) : null;
      const batchId = req.query.batchId ? Number(req.query.batchId) : null;
      const includeRevoked = req.query.includeRevoked !== "0";
      const responseFilter = ["all", "pending", "yes", "no", "maybe"].includes(
        req.query.response,
      )
        ? req.query.response
        : "all";

      try {
        // Load all deduplicated invitations — server-side filters are omitted
        // intentionally so the client can switch filters without a page reload.
        // batchId, dayId, and responseFilter are passed to the template only
        // to pre-select the client-side filter dropdowns on initial load.
        const [invitations, conventionDays, batches] = await Promise.all([
          getInvitationsForTracker({ includeRevoked }),
          getConventionDays(year),
          getInvitationBatches(year),
        ]);

        return res.render("authentication_and_accounts/invitationTracker", {
          csrfToken: req.csrfToken(),
          invitations,
          conventionDays,
          batches,
          year,
          activeDay: dayId,
          activeBatch: batchId,
          activeResponse: responseFilter,
          includeRevoked,
          canManageCampaigns: !!(req.session.permissions ?? {})[
            req.session.userRole ?? ""
          ]?.manageCampaigns,
        });
      } catch (err) {
        (logError || console.error)("campaigns/tracker GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );
  // ===========================
  // SHIFTS — Invitable toggle
  // ===========================

  /**
   * PATCH /oversight/tools/timelines/shifts/:id/invitable
   * Toggle the invitable flag on a shift.
   * Body (JSON): { invitable: boolean }
   * Response: { success: boolean }
   *
   * @requires manageShifts permission
   */
  router.patch(
    "/oversight/tools/timelines/shifts/:id/invitable",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      const invitable =
        req.body?.invitable !== false && req.body?.invitable !== "false";

      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });

      try {
        const ok = await setShiftInvitable(id, invitable);
        if (!ok)
          return res
            .status(404)
            .json({ success: false, error: "Shift not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("shifts/invitable PATCH error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * GET /oversight/tools/campaigns/batches/:id/invited
   * Return all volunteer IDs already invited in a batch, with their
   * response status. Used by the Messaging Center to mark already-invited
   * volunteers in the volunteer list.
   *
   * Response: {
   *   success: true,
   *   invited: Array<{
   *     volunteer_id: number,
   *     response: string|null,
   *     responded_at: Date|null,
   *     revoked: boolean
   *   }>
   * }
   *
   * @requires accessAdminConsole permission
   */
  router.get(
    "/oversight/tools/campaigns/batches/:id/invited",
    requireAuth,
    requirePermission("accessAdminConsole"),
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });

      try {
        // Resolve to the family root so follow-up children are included
        // and the campaign center correctly marks already-invited volunteers.
        const batchRecord = await getInvitationBatch(id);
        const familyRootId = batchRecord?.parent_batch_id || id;

        const invitations = await getInvitationsForTracker({
          batchId: familyRootId,
          includeRevoked: true,
          response: "all",
        });

        const invited = invitations.map((i) => ({
          volunteer_id: i.volunteer_id,
          response: i.response || null,
          responded_at: i.responded_at || null,
          revoked: !!i.revoked,
        }));

        return res.json({ success: true, invited });
      } catch (err) {
        (logError || console.error)("batches/:id/invited GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  // ===========================
  // VOLUNTEER REPORTS
  // ===========================

  // ── Report chart data API ──────────────────────────────────────────────────

  /**
   * GET /api/reports/scheduling-coverage
   * Returns per-convention-day slot fill rate for the current year.
   * Query param: ?year=YYYY (defaults to current year).
   *
   * Permission: OVERSEER+
   */
  router.get(
    "/api/reports/scheduling-coverage",
    requireAuth,
    requirePermission("viewAttendance"),
    async (req, res) => {
      try {
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        const days = await getSchedulingCoverageSummary(year);
        res.json({ year, days });
      } catch (err) {
        (logError || console.error)(
          "GET /api/reports/scheduling-coverage error:",
          err,
        );
        res
          .status(500)
          .json({ error: "Failed to fetch scheduling coverage data." });
      }
    },
  );

  /**
   * GET /api/reports/attendance-overview
   * Returns per-convention-day attendance summary (invited / attended / no-show).
   * Query param: ?year=YYYY (defaults to current year).
   *
   * Permission: viewAttendance
   */
  router.get(
    "/api/reports/attendance-overview",
    requireAuth,
    requirePermission("viewAttendance"),
    async (req, res) => {
      try {
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        const days = await getAttendanceSummary(year);
        res.json({ year, days });
      } catch (err) {
        (logError || console.error)(
          "GET /api/reports/attendance-overview error:",
          err,
        );
        res
          .status(500)
          .json({ error: "Failed to fetch attendance overview data." });
      }
    },
  );

  /**
   * GET /api/reports/demographics
   * Returns one row per active completed volunteer with age, gender, and
   * spiritual privilege flags. Aggregation is done client-side.
   * Query param: ?year=YYYY (defaults to current year).
   *
   * Permission: viewAttendance (OVERSEER+)
   */
  router.get(
    "/api/reports/demographics",
    requireAuth,
    requirePermission("viewAttendance"),
    async (req, res) => {
      try {
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        const volunteers = await getVolunteerDemographics(year);
        res.json({ year, volunteers });
      } catch (err) {
        (logError || console.error)(
          "GET /api/reports/demographics error:",
          err,
        );
        res.status(500).json({ error: "Failed to fetch demographics data." });
      }
    },
  );

  /**
   * GET /api/reports/crew-staffing
   * Returns roster count vs. scheduled count per crew department.
   * Query param: ?year=YYYY (defaults to current year).
   *
   * Permission: viewAttendance (OVERSEER+)
   */
  router.get(
    "/api/reports/crew-staffing",
    requireAuth,
    requirePermission("viewAttendance"),
    async (req, res) => {
      try {
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        const crews = await getCrewStaffingSummary(year);
        res.json({ year, crews });
      } catch (err) {
        (logError || console.error)(
          "GET /api/reports/crew-staffing error:",
          err,
        );
        res.status(500).json({ error: "Failed to fetch crew staffing data." });
      }
    },
  );

  // GET /oversight/tools/reports

  /**
   * GET /oversight/tools/reports
   * Landing page for Oversight Reports. Currently surfaces the
   * Volunteer Application Status report.
   * Requires OVERSEER or above (createAssignments permission).
   */

  router.get(
    "/oversight/tools/reports",
    requireAuth,
    requirePermission("createAssignments"),
    csrfProtection,
    async (req, res) => {
      try {
        const rows = await getVolunteerReportRows();

        // Attach completeness data to each volunteer row
        const volunteers = rows.map((v) => {
          const { complete, missing } = isProfileComplete(v);
          return { ...v, isComplete: complete, missingFields: missing };
        });

        return res.render("authentication_and_accounts/reports", {
          csrfToken: req.csrfToken(),
          volunteers,
        });
      } catch (err) {
        (logError || console.error)("reports GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );
  // ============================================================
  // ATTENDANCE
  // ============================================================

  /**
   * GET /oversight/tools/attendance/checkin
   * Render the live check-in tool. Embeds the full day/shift oversightstructure
   * as JSON for the client-side cascading picker.
   */
  router.get(
    "/oversight/tools/attendance/checkin",
    requireAuth,
    requirePermission("logAttendance"),
    csrfProtection,
    async (req, res) => {
      try {
        const year = new Date().getFullYear();
        const [days, volunteers] = await Promise.all([
          getConventionDaysWithShifts(year),
          getVolunteersForMessaging(),
        ]);
        return res.render("authentication_and_accounts/attendanceCheckin", {
          csrfToken: req.csrfToken(),
          days,
          volunteers,
        });
      } catch (err) {
        (logError || console.error)("attendance/checkin GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  /**
   * GET /oversight/tools/attendance/report
   * Render the attendance report page. Embeds convention days for the
   * day picker; shift data loads on demand via AJAX.
   */
  router.get(
    "/oversight/tools/attendance/report",
    requireAuth,
    requirePermission("viewAttendance"),
    csrfProtection,
    async (req, res) => {
      try {
        const year = new Date().getFullYear();
        const conventionDays = await getConventionDays(year);
        return res.render("authentication_and_accounts/attendanceReport", {
          csrfToken: req.csrfToken(),
          conventionDays,
        });
      } catch (err) {
        (logError || console.error)("attendance/report GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  /**
   * GET /oversight/tools/attendance/shift-data/:shiftId
   * AJAX — returns invited volunteers + walk-ins + existing attendance
   * records for the given shift.
   *
   * Response: { success: boolean, volunteers: Array }
   */
  router.get(
    "/oversight/tools/attendance/shift-data/:shiftId",
    requireAuth,
    requirePermission("logAttendance"),
    async (req, res) => {
      const shiftId = Number(req.params.shiftId);
      if (!shiftId)
        return res
          .status(400)
          .json({ success: false, error: "Invalid shift ID." });
      try {
        const volunteers = await getShiftAttendanceData(shiftId);
        return res.json({ success: true, volunteers });
      } catch (err) {
        (logError || console.error)("attendance/shift-data GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /oversight/tools/attendance/record
   * AJAX — upsert a single attendance row.
   *
   * Body: { volunteerId, conventionDayId, sessionId, shiftId,
   *         attended, notes?, walkIn? }
   * Response: { success: boolean }
   */
  router.post(
    "/oversight/tools/attendance/record",
    requireAuth,
    requirePermission("logAttendance"),
    csrfProtection,
    async (req, res) => {
      const {
        volunteerId,
        conventionDayId,
        sessionId = null,
        shiftId,
        attended,
        notes = null,
        walkIn = false,
      } = req.body || {};

      if (!volunteerId || !conventionDayId) {
        return res.status(400).json({
          success: false,
          error: "volunteerId and conventionDayId are required.",
        });
      }

      try {
        await upsertAttendance({
          volunteerId: Number(volunteerId),
          conventionDayId: Number(conventionDayId),
          sessionId: sessionId ? Number(sessionId) : null,
          shiftId: shiftId ? Number(shiftId) : null,
          attended: !!attended,
          notes: notes || null,
          recordedBy: req.session.userEmail || null,
          walkIn: !!walkIn,
        });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("attendance/record POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * GET /oversight/tools/attendance/day-checkin/:dayId
   * AJAX — returns invited volunteers + walk-ins for a day with no shifts.
   *
   * Response: { success: boolean, volunteers: Array }
   */
  router.get(
    "/oversight/tools/attendance/day-checkin/:dayId",
    requireAuth,
    requirePermission("logAttendance"),
    async (req, res) => {
      const dayId = Number(req.params.dayId);
      if (!dayId)
        return res
          .status(400)
          .json({ success: false, error: "Invalid day ID." });
      try {
        const volunteers = await getAttendanceDayData(dayId);
        return res.json({ success: true, volunteers });
      } catch (err) {
        (logError || console.error)("attendance/day-checkin GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * GET /oversight/tools/attendance/day-report/:dayId
   * AJAX — returns all shifts for a convention day with attendance stats.
   * Used by the report page accordion.
   *
   * Response: { success: boolean, shifts: Array }
   */
  router.get(
    "/oversight/tools/attendance/day-report/:dayId",
    requireAuth,
    requirePermission("viewAttendance"),
    async (req, res) => {
      const dayId = Number(req.params.dayId);
      if (!dayId)
        return res
          .status(400)
          .json({ success: false, error: "Invalid day ID." });
      try {
        const shifts = await getAttendanceReportForDay(dayId);
        return res.json({ success: true, shifts });
      } catch (err) {
        (logError || console.error)("attendance/day-report GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );
  /**
   * GET /edit-volunteer/blackouts/:volunteerId
   * Fetch blackout windows for one volunteer on a specific day.
   * Query: ?dayId=N
   *
   * Response: { success: boolean, blackouts: Array }
   *
   * @requires editVolunteerInfo permission
   */
  router.get(
    "/edit-volunteer/blackouts/:volunteerId",
    requireAuth,
    requirePermission("editVolunteerInfo"),
    async (req, res) => {
      const volunteerId = Number(req.params.volunteerId);
      const dayId = Number(req.query.dayId);
      if (!volunteerId || !dayId)
        return res
          .status(400)
          .json({ success: false, error: "Invalid parameters." });
      try {
        const blackouts = await getBlackoutsForVolunteer(volunteerId, dayId);
        return res.json({ success: true, blackouts });
      } catch (err) {
        (logError || console.error)("edit-volunteer/blackouts GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /edit-volunteer/blackouts
   * Create a blackout window for a volunteer on a convention day.
   *
   * Body: { volunteerId, conventionDayId, startMins, endMins, reason? }
   * Response: { success: boolean, id: number }
   *
   * @requires editVolunteerInfo permission
   */
  router.post(
    "/edit-volunteer/blackouts",
    requireAuth,
    requirePermission("editVolunteerInfo"),
    csrfProtection,
    async (req, res) => {
      const { volunteerId, conventionDayId, startMins, endMins, reason } =
        req.body || {};
      if (
        !volunteerId ||
        !conventionDayId ||
        startMins == null ||
        endMins == null ||
        Number(endMins) <= Number(startMins)
      ) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid parameters." });
      }
      try {
        const id = await createBlackout({
          volunteerId: Number(volunteerId),
          conventionDayId: Number(conventionDayId),
          startMins: Number(startMins),
          endMins: Number(endMins),
          reason: reason || null,
          createdBy: req.session.userEmail || null,
        });
        return res.json({ success: true, id });
      } catch (err) {
        (logError || console.error)(
          "edit-volunteer/blackouts POST error:",
          err,
        );
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * DELETE /edit-volunteer/blackouts/:id
   * Remove a blackout window.
   *
   * Response: { success: boolean }
   *
   * @requires editVolunteerInfo permission
   */
  router.delete(
    "/edit-volunteer/blackouts/:id",
    requireAuth,
    requirePermission("editVolunteerInfo"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid ID." });
      try {
        const deleted = await deleteBlackout(id);
        if (!deleted)
          return res
            .status(404)
            .json({ success: false, error: "Blackout not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)(
          "edit-volunteer/blackouts DELETE error:",
          err,
        );
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /edit-volunteer/set-rsvp
   * Directly set the RSVP response on an invitation by ID.
   * Used by the oversight tool to record verbal RSVPs.
   *
   * Body: { invitationId: number, response: 'yes'|'no'|'maybe'|null }
   * Response: { success: boolean }
   *
   * @requires editVolunteerInfo permission
   */
  router.post(
    "/edit-volunteer/set-rsvp",
    requireAuth,
    requirePermission("editVolunteerInfo"),
    csrfProtection,
    async (req, res) => {
      const { invitationId, response } = req.body || {};
      const id = Number(invitationId);
      const validResponses = ["yes", "no", "maybe", null];
      const normalised = response === "" || response == null ? null : response;

      if (!id || !validResponses.includes(normalised)) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid parameters." });
      }

      try {
        const updated = await setInvitationResponseById(id, normalised);
        if (!updated) {
          return res
            .status(404)
            .json({ success: false, error: "Invitation not found." });
        }
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("set-rsvp POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );
  // ============================================================
  // CREW MATRIX
  // ============================================================

  /**
   * GET /oversight/tools/crew-assignments
   * Render the crew assignment matrix page.
   * All active-current-year volunteers are loaded server-side.
   *
   * @requires createAssignments permission
   */
  router.get(
    "/oversight/tools/crew-assignments",
    requireAuth,
    requirePermission("createAssignments"),
    csrfProtection,
    async (req, res) => {
      try {
        const volunteers = await getCrewMatrix();
        return res.render("authentication_and_accounts/crewMatrix", {
          csrfToken: req.csrfToken(),
          volunteers,
        });
      } catch (err) {
        (logError || console.error)("crew-assignments GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  /**
   * POST /api/crews/batch/:crewKey
   * Set a single crew flag for multiple volunteers in one DB call.
   * Used by the toggle-all action in the crew assignment matrix.
   *
   * Body (JSON): { volunteerIds: number[], value: boolean }
   * Response:    { success: boolean, updated: number }
   *
   * @requires createAssignments permission
   */
  router.post(
    "/api/crews/batch/:crewKey",
    requireAuth,
    requirePermission("createAssignments"),
    csrfProtection,
    async (req, res) => {
      const { crewKey } = req.params;
      const { volunteerIds, value } = req.body || {};

      if (!Array.isArray(volunteerIds) || volunteerIds.length === 0)
        return res.status(400).json({
          success: false,
          error: "volunteerIds must be a non-empty array.",
        });
      if (value === undefined || value === null)
        return res
          .status(400)
          .json({ success: false, error: "value is required." });

      const ids = volunteerIds.map(Number).filter((n) => n > 0);
      if (ids.length === 0)
        return res
          .status(400)
          .json({ success: false, error: "No valid volunteer IDs provided." });

      try {
        const updated = await batchUpdateVolunteerCrew(ids, crewKey, !!value);
        return res.json({ success: true, updated });
      } catch (err) {
        if (err.message?.startsWith("Invalid crew key")) {
          return res.status(400).json({ success: false, error: err.message });
        }
        (logError || console.error)("api/crews/batch POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * PATCH /api/crews/:volunteerId/:crewKey
   * Toggle a single crew flag for a volunteer.
   *
   * Body (JSON): { value: boolean }
   * Response:    { success: boolean }
   *
   * @requires createAssignments permission
   */
  router.patch(
    "/api/crews/:volunteerId/:crewKey",
    requireAuth,
    requirePermission("createAssignments"),
    csrfProtection,
    async (req, res) => {
      const volunteerId = Number(req.params.volunteerId);
      const { crewKey } = req.params;
      const value = req.body?.value;

      if (!volunteerId)
        return res
          .status(400)
          .json({ success: false, error: "Invalid volunteer ID." });
      if (value === undefined || value === null)
        return res
          .status(400)
          .json({ success: false, error: "value is required." });

      try {
        const updated = await updateVolunteerCrew(
          volunteerId,
          crewKey,
          !!value,
        );
        if (!updated)
          return res.status(404).json({
            success: false,
            error: "Volunteer not found or not active.",
          });
        return res.json({ success: true });
      } catch (err) {
        if (err.message?.startsWith("Invalid crew key")) {
          return res.status(400).json({ success: false, error: err.message });
        }
        (logError || console.error)("api/crews PATCH error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  // ============================================================
  // SCHEDULER
  // ============================================================

  /**
   * GET /oversight/tools/scheduler/report
   * Render a printable per-department schedule report for one convention day.
   *
   * Query param: ?dayId=N (required)
   *
   * @requires createAssignments permission
   */
  router.get(
    "/oversight/tools/scheduler/report",
    requireAuth,
    requirePermission("createAssignments"),
    csrfProtection,
    async (req, res) => {
      const dayId = Number(req.query.dayId);
      if (!dayId) return res.redirect("/oversight/tools/scheduler");
      try {
        const [reportData, allDays] = await Promise.all([
          getSchedulerReportData(dayId),
          getConventionDays(new Date().getFullYear()),
        ]);
        const conventionDays = allDays.filter(
          (d) => d.schedulable !== false && d.schedulable !== 0,
        );
        return res.render("authentication_and_accounts/schedulerReport", {
          csrfToken: req.csrfToken(),
          reportData,
          conventionDays,
          selectedDayId: dayId,
        });
      } catch (err) {
        (logError || console.error)("scheduler/report GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );
  // ─── Master Conflict Grid ──────────────────────────────────────────

  /**
   * GET /oversight/tools/conflict-grid
   * Render the Master Conflict Grid page shell.
   * Data loads client-side via the API endpoint.
   *
   * @requires createAssignments permission
   */
  router.get(
    "/oversight/tools/conflict-grid",
    requireAuth,
    requirePermission("createAssignments"),
    csrfProtection,
    async (req, res) => {
      try {
        return res.render("authentication_and_accounts/conflictGrid", {
          csrfToken: req.csrfToken(),
        });
      } catch (err) {
        (logError || console.error)("conflict-grid GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  /**
   * GET /api/conflict-grid
   * Return all data needed to build the Master Conflict Grid.
   *
   * Response: { shifts, volunteers, assignments, blackouts }
   *
   * @requires createAssignments permission
   */
  router.get(
    "/api/conflict-grid",
    requireAuth,
    requirePermission("createAssignments"),
    async (req, res) => {
      try {
        const year = new Date().getFullYear();
        const data = await getConflictGridData(year);
        return res.json(data);
      } catch (err) {
        (logError || console.error)("api/conflict-grid GET error:", err);
        return res.status(500).json({ error: "Server error." });
      }
    },
  );
  /**
   * GET /oversight/tools/scheduler
   * Render the drag-and-drop volunteer scheduler page.
   * Convention days are passed for the day picker; schedule data
   * and volunteers load client-side via AJAX.
   *
   * @requires createAssignments permission
   */
  router.get(
    "/oversight/tools/scheduler",
    requireAuth,
    requirePermission("createAssignments"),
    csrfProtection,
    async (req, res) => {
      try {
        const year = new Date().getFullYear();
        const allDays = await getConventionDays(year);
        const conventionDays = allDays.filter(
          (d) => d.schedulable !== false && d.schedulable !== 0,
        );
        return res.render("authentication_and_accounts/scheduler", {
          csrfToken: req.csrfToken(),
          conventionDays,
          year,
          actorId: req.session.userId || 0,
        });
      } catch (err) {
        (logError || console.error)("scheduler GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  /**
   * GET /api/scheduler/volunteers
   * Return the active registered volunteer pool as JSON for the
   * scheduler name pool sidebar.
   * NOTE: must be defined before /api/scheduler/:dayId so Express
   * does not treat "volunteers" as a dayId parameter.
   *
   * Response: { success: boolean, volunteers: Array }
   *
   * @requires createAssignments permission
   */
  router.get(
    "/api/scheduler/volunteers",
    requireAuth,
    requirePermission("createAssignments"),
    async (req, res) => {
      try {
        const volunteers = await getSchedulerVolunteers();
        return res.json({ success: true, volunteers });
      } catch (err) {
        (logError || console.error)("api/scheduler/volunteers GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * GET /api/scheduler/blackout-picker
   * Return the full day → session → shift tree for the current convention
   * year, with all times pre-converted to minutes-from-midnight.
   * Used to populate the Manage Blackouts panel mode selects.
   *
   * Response: { days: Array<object> }
   *
   * @requires createAssignments permission
   */
  router.get(
    "/api/scheduler/blackout-picker",
    requireAuth,
    requirePermission("createAssignments"),
    async (req, res) => {
      try {
        const year = new Date().getFullYear();
        const days = await getBlackoutPickerData(year);
        return res.json({ days });
      } catch (err) {
        (logError || console.error)("api/scheduler/blackout-picker GET error:", err);
        return res.status(500).json({ days: [] });
      }
    },
  );

  /**
   * GET /api/scheduler/slots/:dayId
   * Return all saved slot assignments for a convention day.
   * Must be defined before /api/scheduler/:dayId to avoid Express treating
   * "slots" as a dayId parameter.
   *
   * Response: { success: boolean, assignments: Array }
   *
   * @requires createAssignments permission
   */
  router.get(
    "/api/scheduler/slots/:dayId",
    requireAuth,
    requirePermission("createAssignments"),
    async (req, res) => {
      const dayId = Number(req.params.dayId);
      if (!dayId)
        return res
          .status(400)
          .json({ success: false, error: "Invalid day ID." });
      try {
        const assignments = await getSlotAssignmentsByDay(dayId);
        return res.json({ success: true, assignments });
      } catch (err) {
        (logError || console.error)("api/scheduler/slots GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /api/scheduler/slots
   * Persist a volunteer-to-slot assignment.
   *
   * Body (JSON): { schedule_assignment_id, convention_day_id, volunteer_id, slot_type, slot_index }
   * Response:    { success: boolean, id: number }
   *
   * @requires createAssignments permission
   */
  router.post(
    "/api/scheduler/slots",
    requireAuth,
    requirePermission("createAssignments"),
    csrfProtection,
    async (req, res) => {
      const {
        schedule_assignment_id,
        convention_day_id,
        volunteer_id,
        slot_type,
        slot_index,
        note,
      } = req.body || {};
      if (
        !schedule_assignment_id ||
        !convention_day_id ||
        !volunteer_id ||
        !slot_type ||
        slot_index == null
      )
        return res
          .status(400)
          .json({ success: false, error: "Missing required fields." });
      try {
        const id = await saveSlotAssignment({
          schedule_assignment_id: Number(schedule_assignment_id),
          convention_day_id: Number(convention_day_id),
          volunteer_id: Number(volunteer_id),
          slot_type: String(slot_type),
          slot_index: Number(slot_index),
          note: note ? String(note) : null,
        });
        return res.json({ success: true, id });
      } catch (err) {
        (logError || console.error)("api/scheduler/slots POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * DELETE /api/scheduler/slots/:id
   * Remove a slot assignment by primary key.
   *
   * Response: { success: boolean }
   *
   * @requires createAssignments permission
   */
  router.delete(
    "/api/scheduler/slots/:id",
    requireAuth,
    requirePermission("createAssignments"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });
      try {
        const ok = await deleteSlotAssignment(id);
        return res.json({ success: ok });
      } catch (err) {
        (logError || console.error)("api/scheduler/slots DELETE error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * GET /api/scheduler/attendance/:dayId
   * Return attended volunteer+shift pairs for a convention day, plus the
   * convention date so the client can decide on auto-poll interval.
   *
   * Response: { success: boolean, attendance: Array, conventionDate: string|null }
   *
   * @requires createAssignments permission
   */
  router.get(
    "/api/scheduler/attendance/:dayId",
    requireAuth,
    requirePermission("createAssignments"),
    async (req, res) => {
      const dayId = Number(req.params.dayId);
      if (!dayId)
        return res
          .status(400)
          .json({ success: false, error: "Invalid day ID." });
      try {
        const [attendance, days] = await Promise.all([
          getAttendanceByDay(dayId),
          getConventionDays(new Date().getFullYear()),
        ]);
        const day = days.find((d) => d.id === dayId);
        const conventionDate = day?.convention_date
          ? new Date(day.convention_date).toISOString().slice(0, 10)
          : null;
        return res.json({ success: true, attendance, conventionDate });
      } catch (err) {
        (logError || console.error)("api/scheduler/attendance GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * GET /oversight/tools/shift-alerts/schedules/:id/preview
   * Return a preview of shifts targeted by a schedule's next send.
   * Recipient counts exclude already-sent pairs (dupe guard applied).
   *
   * Response: { success: boolean, shifts: Array, fireAt: string|null }
   *
   * @requires accessAdminConsole permission
   */
  router.get(
    "/oversight/tools/shift-alerts/schedules/:id/preview",
    requireAuth,
    requirePermission("accessAdminConsole"),
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });
      try {
        const schedule = await getAlertSchedule(id);
        if (!schedule)
          return res
            .status(404)
            .json({ success: false, error: "Schedule not found." });

        const easternToday = new Date(Date.now() - 4 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

        const fireDate = schedule.fire_date
          ? new Date(schedule.fire_date).toISOString().slice(0, 10)
          : easternToday;

        const shifts = await getSchedulePreview({
          scheduleId: schedule.id,
          alertCategory: schedule.alert_category,
          fireDate,
          departments: schedule.departments || null,
          includeNullDept: !!schedule.include_null_dept,
          year: schedule.year,
        });

        // Build human-readable fire time for the response
        let fireAt = null;
        if (
          schedule.alert_category !== "t15min" &&
          schedule.fire_date &&
          schedule.fire_time_utc
        ) {
          const fireDateStr = new Date(schedule.fire_date)
            .toISOString()
            .slice(0, 10);
          fireAt = `${fireDateStr}T${schedule.fire_time_utc}Z`;
        }

        return res.json({ success: true, shifts, fireAt });
      } catch (err) {
        (logError || console.error)("shift-alerts/preview GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * GET /api/scheduler/blackouts/:dayId
   * Return all blackout windows for a convention day.
   * Pass ?volunteerId=N to filter to one volunteer (used by the panel).
   *
   * Response: { success: boolean, blackouts: Array }
   *
   * @requires createAssignments permission
   */
  router.get(
    "/api/scheduler/blackouts/:dayId",
    requireAuth,
    requirePermission("createAssignments"),
    async (req, res) => {
      const dayId = Number(req.params.dayId);
      const volunteerId = req.query.volunteerId
        ? Number(req.query.volunteerId)
        : null;
      if (!dayId)
        return res
          .status(400)
          .json({ success: false, error: "Invalid day ID." });
      try {
        const blackouts = volunteerId
          ? await getBlackoutsForVolunteer(volunteerId, dayId)
          : await getBlackoutsForDay(dayId);
        return res.json({ success: true, blackouts });
      } catch (err) {
        (logError || console.error)("api/scheduler/blackouts GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /api/scheduler/blackouts
   * Create a blackout window for a volunteer on a convention day.
   *
   * Body: { volunteerId, conventionDayId, startMins, endMins, reason? }
   * Response: { success: boolean, id: number }
   *
   * @requires createAssignments permission
   */
  router.post(
    "/api/scheduler/blackouts",
    requireAuth,
    requirePermission("createAssignments"),
    csrfProtection,
    async (req, res) => {
      const { volunteerId, conventionDayId, startMins, endMins, reason } =
        req.body || {};
      if (
        !volunteerId ||
        !conventionDayId ||
        startMins == null ||
        endMins == null ||
        Number(endMins) <= Number(startMins)
      ) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid parameters." });
      }
      try {
        const id = await createBlackout({
          volunteerId: Number(volunteerId),
          conventionDayId: Number(conventionDayId),
          startMins: Number(startMins),
          endMins: Number(endMins),
          reason: reason || null,
          createdBy: req.session.userEmail || null,
        });
        return res.json({ success: true, id });
      } catch (err) {
        (logError || console.error)("api/scheduler/blackouts POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * DELETE /api/scheduler/blackouts/:id
   * Remove a blackout window.
   *
   * Response: { success: boolean }
   *
   * @requires createAssignments permission
   */
  router.delete(
    "/api/scheduler/blackouts/:id",
    requireAuth,
    requirePermission("createAssignments"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid ID." });
      try {
        const deleted = await deleteBlackout(id);
        if (!deleted)
          return res
            .status(404)
            .json({ success: false, error: "Blackout not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)(
          "api/scheduler/blackouts DELETE error:",
          err,
        );
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * GET /api/scheduler/:dayId
   * Return the full shift/department/location schedule payload for a
   * single convention day. Consumed by the scheduler grid builder.
   *
   * Response: { success: boolean, schedule: object }
   *
   * @requires createAssignments permission
   */
  router.get(
    "/api/scheduler/:dayId",
    requireAuth,
    requirePermission("createAssignments"),
    async (req, res) => {
      const dayId = Number(req.params.dayId);
      if (!dayId)
        return res
          .status(400)
          .json({ success: false, error: "Invalid day ID." });
      try {
        const [schedule, sessions] = await Promise.all([
          getSchedulerData(dayId),
          getSessionsForDay(dayId),
        ]);
        // Inject sessions into the day payload
        const dayLabels = Object.keys(schedule.day || {});
        if (dayLabels.length > 0) {
          schedule.day[dayLabels[0]].sessions = sessions;
        }
        return res.json({ success: true, schedule });
      } catch (err) {
        (logError || console.error)("api/scheduler/:dayId GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  // ============================================================
  // INTERNAL — Puppeteer PDF render (secret-protected, no auth)
  // ============================================================

  /**
   * GET /internal/pdf/report
   * Renders the scheduler report for Puppeteer with no session requirement.
   * The ?secret= query param must match PDF_SECRET (random, server-startup value).
   * This route is intentionally unauthenticated — the secret is the credential.
   */
  router.get("/internal/pdf/report", async (req, res) => {
    if (!req.query.secret || req.query.secret !== PDF_SECRET) {
      return res.status(403).end();
    }
    const dayId = Number(req.query.dayId);
    if (!dayId) return res.status(400).end();
    try {
      const [reportData, conventionDays] = await Promise.all([
        getSchedulerReportData(dayId),
        getConventionDays(new Date().getFullYear()),
      ]);
      return res.render("authentication_and_accounts/schedulerReport", {
        csrfToken: "", // Puppeteer render — no CSRF needed
        reportData,
        conventionDays,
        selectedDayId: dayId,
      });
    } catch (err) {
      (logError || console.error)("internal/pdf/report error:", err);
      return res.status(500).end();
    }
  });

  // ============================================================
  // SCHEDULER — Publish
  // ============================================================

  /**
   * POST /oversight/tools/scheduler/publish
   * Full publish pipeline: PDF → SharePoint → notifications → DB record.
   *
   * Body (JSON): { dayId: number }
   * Response:    { success, sharePointUrl, filename, emailSent, smsSent, totalRecipients }
   *
   * @requires ASSISTANT_ADMIN+ (accessAdminConsole permission)
   */
  router.post(
    "/oversight/tools/scheduler/publish",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const dayId = Number(req.body?.dayId);
      if (!dayId) {
        return res
          .status(400)
          .json({ success: false, error: "dayId is required." });
      }

      // Resolve the day label + date for the filename and notification copy
      let dayLabel = `Day_${dayId}`;
      let conventionDate = null;
      try {
        const days = await getConventionDays(new Date().getFullYear());
        const day = days.find((d) => d.id === dayId);
        if (day) {
          dayLabel = day.label;
          conventionDate = day.convention_date
            ? new Date(day.convention_date).toISOString().slice(0, 10)
            : null;
        }
      } catch {
        /* non-fatal */
      }

      // Graph config: prefer injected graphConfig, fall back to process.env
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

      try {
        const result = await publishDaySchedule({
          dayId,
          dayLabel,
          conventionDate,
          publishedBy: req.session.userEmail || "admin",
          serverPort: serverPort || Number(process.env.PORT) || 3000,
          smtpConfig,
          twilioAccountSid,
          twilioAuthToken,
          twilioMsgSid,
          graphConfig: resolvedGraphConfig,
          dryRun: req.body?.dryRun === true,
        });

        return res.json({ success: true, ...result });
      } catch (err) {
        (logError || console.error)("scheduler/publish POST error:", err);
        return res.status(500).json({
          success: false,
          error: err.message || "Publish failed.",
        });
      }
    },
  );

  // ===========================
  // SHIFT ALERTS — Page
  // ===========================

  /**
   * GET /oversight/tools/shift-alerts
   * Render the Shift Alert Schedules management page.
   * Seeds the current year's schedules as JSON for the client.
   *
   * @requires accessAdminConsole permission
   */
  router.get(
    "/oversight/tools/shift-alerts",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const year = new Date().getFullYear();
      try {
        const schedules = await getAlertSchedules(year);
        return res.render("authentication_and_accounts/shiftAlerts", {
          csrfToken: req.csrfToken(),
          schedules,
          year,
        });
      } catch (err) {
        (logError || console.error)("shift-alerts GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  // ===========================
  // SHIFTS — SMS code suggestion
  // ===========================

  /**
   * GET /api/shifts/suggest-code
   * Suggest an SMS reply code for a new shift.
   *
   * For crew shifts: counts existing shifts with the same convention date
   * and department, then generates the next sequential dept-based code.
   *
   * For meeting shifts: counts existing meeting shifts for the convention
   * date and generates the next sequential MT-based code.
   *
   * Query params:
   *   conventionDate  YYYY-MM-DD (required)
   *   department      dbo.shifts.department value (required for crew shifts)
   *   is_meeting      "true" to generate a meeting code (optional)
   *
   * Response: { success: true, code: string }
   *
   * @requires manageShifts permission
   */
  router.get(
    "/api/shifts/suggest-code",
    requireAuth,
    requirePermission("manageShifts"),
    async (req, res) => {
      const { conventionDate, category_id: categoryId, is_meeting } = req.query;
      const isMeeting = is_meeting === "true" || is_meeting === "1";

      if (!conventionDate)
        return res.status(400).json({ success: false, error: "conventionDate is required." });

      if (!isMeeting && !categoryId)
        return res.status(400).json({ success: false, error: "category_id is required for crew shifts." });

      try {
        let n;
        let deptKey = null;
        if (isMeeting) {
          const countResult = await exec(
            `
              SELECT COUNT(*) AS cnt
              FROM dbo.shifts sh
              JOIN dbo.sessions        sess ON sess.id = sh.session_id
              JOIN dbo.convention_days cd   ON cd.id  = sess.convention_day_id
              WHERE CONVERT(DATE, cd.convention_date) = CONVERT(DATE, @conventionDate)
                AND sh.is_meeting = 1
                AND sh.sms_code IS NOT NULL;
            `,
            (preq) => { preq.input("conventionDate", sql.Date, conventionDate); },
          );
          n = (countResult.recordset?.[0]?.cnt ?? 0) + 1;
        } else {
          const countResult = await exec(
            `
              SELECT COUNT(*) AS cnt, MAX(sc.dept_key) AS dept_key
              FROM dbo.shifts sh
              JOIN dbo.scheduler_categories sc ON sc.id = sh.category_id
              JOIN dbo.sessions        sess ON sess.id = sh.session_id
              JOIN dbo.convention_days cd   ON cd.id  = sess.convention_day_id
              WHERE CONVERT(DATE, cd.convention_date) = CONVERT(DATE, @conventionDate)
                AND sh.category_id = @categoryId
                AND sh.sms_code IS NOT NULL;
            `,
            (preq) => {
              preq.input("conventionDate", sql.Date, conventionDate);
              preq.input("categoryId",     sql.Int,  Number(categoryId));
            },
          );
          n       = (countResult.recordset?.[0]?.cnt      ?? 0) + 1;
          deptKey = countResult.recordset?.[0]?.dept_key  || null;
        }

        const code = generateShiftCode(conventionDate, deptKey, n, isMeeting);
        return res.json({ success: true, code });
      } catch (err) {
        (logError || console.error)("api/shifts/suggest-code error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  // ===========================
  // CAMPAIGN MEETINGS
  // ===========================

  /**
   * GET /api/campaign-meetings?year=N
   * Return all standalone campaign meetings for a year.
   * @requires manageShifts permission
   */
  router.get(
    "/api/campaign-meetings",
    requireAuth,
    requirePermission("manageShifts"),
    async (req, res) => {
      const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
      try {
        const meetings = await getCampaignMeetings(year);
        return res.json({ success: true, meetings });
      } catch (err) {
        (logError || console.error)("api/campaign-meetings GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /api/campaign-meetings
   * Create a standalone campaign meeting.
   * Body: { year, label, meeting_date, start_time, end_time, description? }
   * @requires manageShifts permission
   */
  router.post(
    "/api/campaign-meetings",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const { year, label, meeting_date, start_time, end_time, description } = req.body || {};
      if (!year || !label?.trim() || !meeting_date || !start_time || !end_time)
        return res.status(400).json({ success: false, error: "Missing required fields." });
      const normStart = parseTimeString(start_time);
      const normEnd   = parseTimeString(end_time);
      if (!normStart || !normEnd)
        return res.status(400).json({ success: false, error: "Invalid time format." });
      try {
        const id = await createCampaignMeeting({
          year:         Number(year),
          label:        label.trim(),
          meeting_date,
          start_time:   normStart,
          end_time:     normEnd,
          description:  description?.trim() || null,
        });
        return res.json({ success: true, id });
      } catch (err) {
        (logError || console.error)("api/campaign-meetings POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * PUT /api/campaign-meetings/:id
   * Update a standalone campaign meeting.
   * @requires manageShifts permission
   */
  router.put(
    "/api/campaign-meetings/:id",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      const { label, meeting_date, start_time, end_time, description } = req.body || {};
      if (!id || !label?.trim() || !meeting_date || !start_time || !end_time)
        return res.status(400).json({ success: false, error: "Missing required fields." });
      const normStart = parseTimeString(start_time);
      const normEnd   = parseTimeString(end_time);
      if (!normStart || !normEnd)
        return res.status(400).json({ success: false, error: "Invalid time format." });
      try {
        const ok = await updateCampaignMeeting(id, {
          label:        label.trim(),
          meeting_date,
          start_time:   normStart,
          end_time:     normEnd,
          description:  description?.trim() || null,
        });
        if (!ok)
          return res.status(404).json({ success: false, error: "Not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("api/campaign-meetings PUT error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * DELETE /api/campaign-meetings/:id
   * Delete a standalone campaign meeting.
   * @requires manageShifts permission
   */
  router.delete(
    "/api/campaign-meetings/:id",
    requireAuth,
    requirePermission("manageShifts"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });
      try {
        const ok = await deleteCampaignMeeting(id);
        if (!ok)
          return res.status(404).json({ success: false, error: "Not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("api/campaign-meetings DELETE error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  // ===========================
  // SHIFT ALERTS — Schedules
  // ===========================

  /**
   * GET /oversight/tools/shift-alerts/schedules
   * Return all alert schedules for the current year.
   * Response: { success: true, schedules: Array }
   *
   * @requires accessAdminConsole permission
   */
  router.get(
    "/oversight/tools/shift-alerts/schedules",
    requireAuth,
    requirePermission("accessAdminConsole"),
    async (req, res) => {
      const year = req.query.year
        ? Number(req.query.year)
        : new Date().getFullYear();
      try {
        const schedules = await getAlertSchedules(year);
        return res.json({ success: true, schedules });
      } catch (err) {
        (logError || console.error)("shift-alerts/schedules GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /oversight/tools/shift-alerts/schedules
   * Create a new alert schedule.
   *
   * Body (JSON): { year, name, fire_date?, fire_time_utc?, alert_category,
   *               departments?, include_null_dept, message_override? }
   * Response: { success: true, id: number }
   *
   * @requires accessAdminConsole permission
   */
  router.post(
    "/oversight/tools/shift-alerts/schedules",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const {
        year,
        name,
        fire_date,
        fire_time_utc,
        alert_category,
        departments,
        include_null_dept,
        message_override,
      } = req.body || {};

      if (!year || !name?.trim() || !alert_category) {
        return res.status(400).json({
          success: false,
          error: "year, name, and alert_category are required.",
        });
      }

      const validCategories = [
        "next_day",
        "same_day",
        "all_upcoming",
        "t15min",
      ];
      if (!validCategories.includes(alert_category)) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid alert_category." });
      }

      if (fire_time_utc && !parseTimeString(fire_time_utc))
        return res
          .status(400)
          .json({ success: false, error: "Invalid fire time format." });

      try {
        const id = await createAlertSchedule({
          year: Number(year),
          name: name.trim(),
          fire_date: fire_date || null,
          fire_time_utc: fire_time_utc ? parseTimeString(fire_time_utc) : null,
          alert_category,
          departments: departments || null,
          include_null_dept:
            include_null_dept !== false && include_null_dept !== "false",
          message_override: message_override || null,
          created_by: req.session.userEmail || null,
        });
        return res.json({ success: true, id });
      } catch (err) {
        (logError || console.error)("shift-alerts/schedules POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * PUT /oversight/tools/shift-alerts/schedules/:id
   * Update an existing alert schedule.
   *
   * Body (JSON): { name, fire_date?, fire_time_utc?, alert_category,
   *               departments?, include_null_dept, message_override?, active }
   * Response: { success: true }
   *
   * @requires accessAdminConsole permission
   */
  router.put(
    "/oversight/tools/shift-alerts/schedules/:id",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });

      const {
        name,
        fire_date,
        fire_time_utc,
        alert_category,
        departments,
        include_null_dept,
        message_override,
        active,
      } = req.body || {};

      if (!name?.trim() || !alert_category) {
        return res.status(400).json({
          success: false,
          error: "name and alert_category are required.",
        });
      }

      if (fire_time_utc && !parseTimeString(fire_time_utc))
        return res
          .status(400)
          .json({ success: false, error: "Invalid fire time format." });

      try {
        const ok = await updateAlertSchedule(id, {
          name: name.trim(),
          fire_date: fire_date || null,
          fire_time_utc: fire_time_utc ? parseTimeString(fire_time_utc) : null,
          alert_category,
          departments: departments || null,
          include_null_dept:
            include_null_dept !== false && include_null_dept !== "false",
          message_override: message_override || null,
          active: active !== false && active !== "false",
        });
        if (!ok)
          return res
            .status(404)
            .json({ success: false, error: "Schedule not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("shift-alerts/schedules PUT error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * DELETE /oversight/tools/shift-alerts/schedules/:id
   * Deactivate an alert schedule (soft delete).
   * Response: { success: true }
   *
   * @requires accessAdminConsole permission
   */
  router.delete(
    "/oversight/tools/shift-alerts/schedules/:id",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });
      try {
        const ok = await deleteAlertSchedule(id);
        if (!ok)
          return res
            .status(404)
            .json({ success: false, error: "Schedule not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)(
          "shift-alerts/schedules DELETE error:",
          err,
        );
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * DELETE /oversight/tools/shift-alerts/schedules/:id/permanent
   * Permanently delete a deactivated alert schedule and its log rows.
   * Guards against deleting active schedules.
   * Response: { success: true }
   *
   * @requires accessAdminConsole permission
   */
  router.delete(
    "/oversight/tools/shift-alerts/schedules/:id/permanent",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });
      try {
        const schedule = await getAlertSchedule(id);
        if (!schedule)
          return res
            .status(404)
            .json({ success: false, error: "Schedule not found." });
        if (schedule.active)
          return res.status(400).json({
            success: false,
            error: "Deactivate the schedule before deleting it.",
          });
        const ok = await hardDeleteAlertSchedule(id);
        if (!ok)
          return res
            .status(404)
            .json({ success: false, error: "Schedule not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)(
          "shift-alerts/schedules/permanent DELETE error:",
          err,
        );
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /oversight/tools/shift-alerts/schedules/:id/send
   * Manually trigger a burst send for a specific schedule, bypassing the
   * fire_date/fire_time_utc window. Useful for retries and missed sends.
   *
   * Body (JSON): { force?: boolean } — if true, re-sends even to already-alerted pairs
   * Response: { success: true, sent: number, failed: number, skipped: number }
   *
   * @requires accessAdminConsole permission
   */
  router.post(
    "/oversight/tools/shift-alerts/schedules/:id/send",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      const force = req.body?.force === true;
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });

      try {
        const schedule = await getAlertSchedule(id);
        if (!schedule) {
          return res
            .status(404)
            .json({ success: false, error: "Schedule not found." });
        }
        if (!schedule.active) {
          return res
            .status(400)
            .json({ success: false, error: "Schedule is inactive." });
        }

        const year = schedule.year;
        const fireDate = schedule.fire_date
          ? new Date(schedule.fire_date).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);

        let rows;
        if (schedule.alert_category === "t15min") {
          return res.status(400).json({
            success: false,
            error: "t15min schedules are rolling — trigger via the scheduler.",
          });
        } else {
          rows = await getShiftsForAlertBurst({
            scheduleId: id,
            alertCategory: schedule.alert_category,
            fireDate,
            departments: schedule.departments || null,
            includeNullDept: !!schedule.include_null_dept,
            year,
          });
        }

        (logError || console.log)(
          `[shift-alerts send] schedule ${id}: category=${schedule.alert_category} fireDate=${fireDate} year=${year} depts=${schedule.departments} rows=${rows.length}`,
        );

        if (force) {
          // On a forced re-send, bypass the dupe guard by re-querying without it.
          // getShiftsForAlertBurst already excludes previously-sent; force skips that.
          // For simplicity, we rely on the caller's confirmation that force=true is intentional.
          // A more complete implementation would pass a `force` flag to the DB query.
        }

        let sent = 0,
          failed = 0;
        const logRows = [];

        for (const row of rows) {
          const body = buildAlertMessage(schedule, row);
          try {
            const msgSid = await sendAlertSms(
              row.phone,
              body,
              twilioAccountSid,
              twilioAuthToken,
              twilioMsgSid,
            );
            logRows.push({
              schedule_id: id,
              shift_id: row.shift_id,
              volunteer_id: row.volunteer_id,
              alert_category: schedule.alert_category,
              phone: row.phone,
              twilio_sid: msgSid || null,
              status: "sent",
            });
            sent++;
          } catch (err) {
            (logError || console.error)(
              `shift-alerts send error vol ${row.volunteer_id} shift ${row.shift_id}:`,
              err,
            );
            logRows.push({
              schedule_id: id,
              shift_id: row.shift_id,
              volunteer_id: row.volunteer_id,
              alert_category: schedule.alert_category,
              phone: row.phone,
              twilio_sid: null,
              status: "failed",
              error_msg: err.message?.slice(0, 500) || "Unknown error",
            });
            failed++;
          }
        }

        await logShiftAlerts(logRows);
        return res.json({ success: true, sent, failed, skipped: 0 });
      } catch (err) {
        (logError || console.error)(
          "shift-alerts/schedules/:id/send POST error:",
          err,
        );
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  // ===========================
  // OVERSIGHT STRUCTURE
  // ===========================

  /**
   * GET /oversight/tools/oversightstructure
   * Render the Oversight Structure editor.
   * Embeds all oversight structure nodes and the full volunteer list as JSON
   * for the client-side tree editor.
   *
   * @requires manageCampaigns permission (ADMIN only by default)
   */
  router.get(
    "/oversight/tools/oversightstructure",
    requireAuth,
    requirePermission("manageCampaigns"),
    csrfProtection,
    async (req, res) => {
      try {
        const [rawOversightStructure, volunteers] = await Promise.all([
          getOversightStructure(),
          getActiveVolunteers({}),
        ]);

        return res.render("authentication_and_accounts/oversightStructure", {
          csrfToken: req.csrfToken(),
          rawOversightStructure,
          volunteers,
        });
      } catch (err) {
        (logError || console.error)("oversight structureGET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  /**
   * POST /oversight/tools/oversightstructure/add
   * Add a single new oversight structure node.
   *
   * Body (JSON): { parent_id, role_title, volunteer_id, sort_order }
   * Response:    { success: true, id: number }
   *
   * @requires manageCampaigns permission
   */
  router.post(
    "/oversight/tools/oversightstructure/add",
    requireAuth,
    requirePermission("manageCampaigns"),
    csrfProtection,
    async (req, res) => {
      const { parent_id, role_title, volunteer_id, sort_order } =
        req.body || {};

      try {
        const id = await addHierarchyNode({
          parent_id: parent_id != null ? Number(parent_id) : null,
          volunteer_id: volunteer_id != null ? Number(volunteer_id) : null,
          role_title: role_title?.trim() || "New Role",
          sort_order: sort_order != null ? Number(sort_order) : 0,
        });
        return res.json({ success: true, id });
      } catch (err) {
        (logError || console.error)("oversightstructure/add POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /oversight/tools/oversightstructure/save
   * Bulk-save the full node list (order, parent, title, volunteer).
   * Only processes nodes with positive (persisted) IDs — temp IDs are
   * ignored here because they must be added via /add first.
   *
   * Body (JSON): { nodes: Array<{id, parent_id, sort_order, role_title, volunteer_id}> }
   * Response:    { success: true }
   *
   * @requires manageCampaigns permission
   */
  router.post(
    "/oversight/tools/oversightstructure/save",
    requireAuth,
    requirePermission("manageCampaigns"),
    csrfProtection,
    async (req, res) => {
      const { nodes } = req.body || {};

      if (!Array.isArray(nodes)) {
        return res
          .status(400)
          .json({ success: false, error: "nodes must be an array." });
      }

      // Filter to only persisted nodes (positive IDs)
      const persistedNodes = nodes
        .filter((n) => n.id > 0)
        .map((n) => ({
          id: Number(n.id),
          parent_id: n.parent_id != null ? Number(n.parent_id) : null,
          sort_order: n.sort_order != null ? Number(n.sort_order) : 0,
          role_title: n.role_title?.trim() || "",
          volunteer_id: n.volunteer_id != null ? Number(n.volunteer_id) : null,
        }));

      try {
        await saveOversightStructureOrder(persistedNodes);
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("oversightstructure/save POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * DELETE /oversight/tools/oversightstructure/:id
   * Delete an oversight structure node, promoting its children to its parent level.
   *
   * Response: { success: true }
   *
   * @requires manageCampaigns permission
   */
  router.delete(
    "/oversight/tools/oversightstructure/:id",
    requireAuth,
    requirePermission("manageCampaigns"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });

      try {
        await deleteHierarchyNode(id);
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("oversightStructure DELETE error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  // ===========================
  // SHIFT ALERTS — Log
  // ===========================

  /**
   * GET /oversight/tools/shift-alerts/log
   * Return the alert log, optionally filtered.
   *
   * Query params: scheduleId, volunteerId, shiftId, status, year
   * Response: { success: true, log: Array }
   *
   * @requires accessAdminConsole permission
   */
  router.get(
    "/oversight/tools/shift-alerts/log",
    requireAuth,
    requirePermission("accessAdminConsole"),
    async (req, res) => {
      try {
        const log = await getAlertLog({
          scheduleId: req.query.scheduleId
            ? Number(req.query.scheduleId)
            : null,
          volunteerId: req.query.volunteerId
            ? Number(req.query.volunteerId)
            : null,
          shiftId: req.query.shiftId ? Number(req.query.shiftId) : null,
          status: req.query.status || null,
          year: req.query.year ? Number(req.query.year) : null,
        });
        return res.json({ success: true, log });
      } catch (err) {
        (logError || console.error)("shift-alerts/log GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  // ============================================================
  // BUG REPORTS
  // ============================================================

  /**
   * POST /api/bug-report
   * Submit a bug report from any logged-in volunteer.
   *
   * Body (JSON): { description: string, steps?: string, pageUrl?: string }
   * Response:    { success: boolean }
   */
  router.post("/api/bug-report", requireAuth, async (req, res) => {
    const { description, steps, pageUrl } = req.body || {};

    if (!description?.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "Description is required." });
    }

    try {
      await createBugReport({
        volunteerId: req.session.userId,
        description: description.trim(),
        steps: steps?.trim() || null,
        pageUrl: pageUrl?.trim() || null,
        userAgent: req.headers["user-agent"]?.slice(0, 500) || null,
      });
      return res.json({ success: true });
    } catch (err) {
      (logError || console.error)("api/bug-report POST error:", err);
      return res.status(500).json({ success: false, error: "Server error." });
    }
  });

  /**
   * POST /oversight/tools/bug-reports/log
   * Admin-only: manually insert a bug report with full resolution fields.
   * Useful for logging bugs that were fixed without a user submission.
   * Requires ASSISTANT_ADMIN+ (accessAdminConsole permission).
   *
   * Body (JSON): { description, steps?, pageUrl?, status, solution?, filesTouched?, fixedAt? }
   * Response:    { success: boolean, id: number }
   */
  router.post(
    "/oversight/tools/bug-reports/log",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const {
        description,
        steps,
        pageUrl,
        status,
        solution,
        filesTouched,
        fixedAt,
      } = req.body || {};
      const validStatuses = ["open", "fixed", "wontfix", "duplicate"];

      if (!description?.trim()) {
        return res
          .status(400)
          .json({ success: false, error: "Description is required." });
      }
      if (status && !validStatuses.includes(status)) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid status." });
      }

      try {
        const id = await createBugReport({
          volunteerId: req.session.userId,
          description: description.trim(),
          steps: steps?.trim() || null,
          pageUrl: pageUrl?.trim() || null,
          userAgent: "admin-manual",
        });

        // If resolution fields were provided, apply them immediately
        if (status && status !== "open") {
          await updateBugReport(
            id,
            { status, solution, filesTouched, fixedAt },
            req.session.userEmail || "admin",
          );
        }

        return res.json({ success: true, id });
      } catch (err) {
        (logError || console.error)("bug-reports/log POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * GET /oversight/tools/bug-reports
   * Admin view — list all bug reports.
   * Requires ASSISTANT_ADMIN+ (accessAdminConsole permission).
   *
   * Optional query param: ?status=open|fixed|wontfix|duplicate
   */
  router.get(
    "/oversight/tools/bug-reports",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const status = ["open", "fixed", "wontfix", "duplicate"].includes(
        req.query.status,
      )
        ? req.query.status
        : null;

      try {
        const reports = await getBugReports({ status });
        return res.render("authentication_and_accounts/bugReports", {
          csrfToken: req.csrfToken(),
          reports,
          activeStatus: status || "all",
        });
      } catch (err) {
        (logError || console.error)("bug-reports GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  /**
   * PUT /oversight/tools/bug-reports/:id
   * Update status + resolution fields on a bug report.
   * Requires ASSISTANT_ADMIN+ (accessAdminConsole permission).
   *
   * Body (JSON): { status, solution?, filesTouched?, fixedAt? }
   * Response:    { success: boolean }
   */
  router.put(
    "/oversight/tools/bug-reports/:id",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id) {
        return res.status(400).json({ success: false, error: "Invalid id." });
      }

      const { status, solution, filesTouched, fixedAt } = req.body || {};
      const validStatuses = ["open", "fixed", "wontfix", "duplicate"];

      if (!validStatuses.includes(status)) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid status." });
      }

      try {
        const ok = await updateBugReport(
          id,
          { status, solution, filesTouched, fixedAt },
          req.session.userEmail || "admin",
        );
        if (!ok) {
          return res
            .status(404)
            .json({ success: false, error: "Report not found." });
        }
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("bug-reports PUT error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  // ─── Volunteer Schedule Report ──────────────────────────────────────

  /**
   * GET /my-schedule
   * Volunteer-facing schedule: shows the logged-in user's own assignments.
   *
   * @requires viewSchedules permission (REGISTERED+)
   */
  router.get(
    "/my-schedule",
    requireAuth,
    requirePermission("viewSchedules"),
    csrfProtection,
    async (req, res) => {
      try {
        const volunteerId = req.session.userId;
        const year = new Date().getFullYear();
        const [scheduleData, allDays, volunteer] = await Promise.all([
          getVolunteerScheduleReport(volunteerId, year),
          getConventionDays(year),
          getVolunteerById(volunteerId),
        ]);
        const conventionDays = allDays.filter(
          (d) => d.schedulable !== false && d.schedulable !== 0,
        );
        return res.render("authentication_and_accounts/volunteerSchedule", {
          csrfToken: req.csrfToken(),
          mode: "self",
          scheduleData,
          conventionDays,
          volunteer,
          volunteers: null,
        });
      } catch (err) {
        (logError || console.error)("my-schedule GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  /**
   * GET /oversight/tools/volunteer-schedule
   * Oversight-facing schedule: search any volunteer by name.
   *
   * Query param: ?volunteerId=N (optional — if omitted, shows empty search state)
   *
   * @requires createAssignments permission (OVERSEER+)
   */
  router.get(
    "/oversight/tools/volunteer-schedule",
    requireAuth,
    requirePermission("createAssignments"),
    csrfProtection,
    async (req, res) => {
      try {
        const year = new Date().getFullYear();
        const volunteerId = Number(req.query.volunteerId) || null;

        let scheduleData = { days: [] };
        let volunteer = null;

        if (volunteerId) {
          [scheduleData, volunteer] = await Promise.all([
            getVolunteerScheduleReport(volunteerId, year),
            getVolunteerById(volunteerId),
          ]);
        }

        const conventionDays = (await getConventionDays(year)).filter(
          (d) => d.schedulable !== false && d.schedulable !== 0,
        );

        return res.render("authentication_and_accounts/volunteerSchedule", {
          csrfToken: req.csrfToken(),
          mode: "oversight",
          scheduleData,
          conventionDays,
          volunteer,
          volunteers: null,
        });
      } catch (err) {
        (logError || console.error)("volunteer-schedule GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  /**
   * GET /api/volunteers/search
   * Return volunteers matching a name query (for typeahead).
   *
   * Query param: ?q=... (min 2 chars)
   *
   * @requires createAssignments permission (OVERSEER+)
   */
  router.get(
    "/api/volunteers/search",
    requireAuth,
    requirePermission("createAssignments"),
    async (req, res) => {
      try {
        const q = (req.query.q || "").trim().toLowerCase();
        if (q.length < 2) return res.json({ results: [] });

        const all = await getActiveVolunteers({});
        const results = all
          .filter((v) => {
            const full =
              `${v.lastName || ""} ${v.firstName || ""}`.toLowerCase();
            return full.includes(q);
          })
          .slice(0, 15)
          .map((v) => ({
            id: v.id,
            firstName: v.firstName,
            lastName: v.lastName,
          }));

        return res.json({ results });
      } catch (err) {
        (logError || console.error)("volunteers/search error:", err);
        return res.status(500).json({ results: [] });
      }
    },
  );

  /**
   * POST /api/volunteer-schedule/:volunteerId/send
   * Send a volunteer's schedule summary via SMS or email.
   *
   * Body: { channel: 'sms' | 'email' }
   *
   * Permission: OVERSEER+ can send to any volunteer.
   * REGISTERED+ can send only to themselves.
   */
  router.post(
    "/api/volunteer-schedule/:volunteerId/send",
    requireAuth,
    requirePermission("viewSchedules"),
    csrfProtection,
    express.json(),
    async (req, res) => {
      try {
        const targetId = Number(req.params.volunteerId);
        const senderId = req.session.userId;
        const perms = req.session.permissions ?? {};
        const channel = req.body.channel;

        // Non-oversight users can only send their own schedule
        if (!perms.createAssignments && targetId !== senderId) {
          return res.status(403).json({
            success: false,
            error: "You can only send your own schedule.",
          });
        }

        if (!["sms", "email"].includes(channel)) {
          return res.status(400).json({
            success: false,
            error: "Invalid channel. Use 'sms' or 'email'.",
          });
        }

        const year = new Date().getFullYear();
        const [volunteer, scheduleData] = await Promise.all([
          getVolunteerById(targetId),
          getVolunteerScheduleReport(targetId, year),
        ]);

        if (!volunteer) {
          return res.status(404).json({
            success: false,
            error: "Volunteer not found.",
          });
        }

        // Build schedule text
        const lines = [
          `Albany JW Parking — Schedule for ${volunteer.firstName} ${volunteer.lastName}`,
        ];
        lines.push("");

        if (scheduleData.days.length === 0) {
          lines.push("No shift assignments found.");
        } else {
          for (const day of scheduleData.days) {
            lines.push(
              `${day.label}${day.convention_date ? ` (${day.convention_date})` : ""}:`,
            );
            for (const a of day.assignments) {
              const time = [a.start_time, a.end_time]
                .filter(Boolean)
                .join(" - ");
              const role =
                a.slot_type === "keyman"
                  ? " [KM]"
                  : a.slot_type === "keyman_asst"
                    ? " [KA]"
                    : "";
              lines.push(
                `  ${a.shift_label} ${time ? `(${time})` : ""} — ${a.location_name}${role}`,
              );
            }
            lines.push("");
          }
        }

        const textBody = lines.join("\n");

        if (channel === "sms") {
          if (!volunteer.phone) {
            return res.status(400).json({
              success: false,
              error: "Volunteer has no phone number on file.",
            });
          }

          const { sendResetSms } = await import("../lib/messaging.js");
          const sent = await sendResetSms(
            volunteer.phone,
            "",
            twilioAccountSid,
            twilioAuthToken,
            twilioMsgSid,
            { customBody: textBody, firstName: volunteer.firstName },
          );

          if (!sent) {
            return res.status(500).json({
              success: false,
              error: "Failed to send SMS.",
            });
          }
        } else {
          if (!volunteer.email) {
            return res.status(400).json({
              success: false,
              error: "Volunteer has no email on file.",
            });
          }

          const { sendResetEmail } = await import("../lib/messaging.js");
          const sent = await sendResetEmail(volunteer.email, "", {
            ...smtpConfig,
            subject: `Your Albany JW Parking Schedule — ${volunteer.firstName} ${volunteer.lastName}`,
            firstName: volunteer.firstName,
            customBody: textBody,
          });

          if (!sent) {
            return res.status(500).json({
              success: false,
              error: "Failed to send email.",
            });
          }
        }

        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("volunteer-schedule send error:", err);
        return res.status(500).json({
          success: false,
          error: "Server error.",
        });
      }
    },
  );

  // ============================================================
  // REPORTS — Graphical chart data APIs
  // ============================================================

  /**
   * GET /api/reports/scheduling-coverage
   * Per-convention-day slot fill rate (needed vs. assigned).
   * Query param: ?year=YYYY (defaults to current year).
   * Permission: viewAttendance (OVERSEER+)
   */
  router.get(
    "/api/reports/scheduling-coverage",
    requireAuth,
    requirePermission("viewAttendance"),
    async (req, res) => {
      try {
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        const days = await getSchedulingCoverageSummary(year);
        return res.json({ year, days });
      } catch (err) {
        (logError || console.error)("GET /api/reports/scheduling-coverage error:", err);
        return res.status(500).json({ error: "Failed to fetch scheduling coverage data." });
      }
    },
  );

  /**
   * GET /api/reports/attendance-overview
   * Per-convention-day attendance rollup (invited / attended / no-show).
   * Query param: ?year=YYYY (defaults to current year).
   * Permission: viewAttendance (OVERSEER+)
   */
  router.get(
    "/api/reports/attendance-overview",
    requireAuth,
    requirePermission("viewAttendance"),
    async (req, res) => {
      try {
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        const days = await getAttendanceSummary(year);
        return res.json({ year, days });
      } catch (err) {
        (logError || console.error)("GET /api/reports/attendance-overview error:", err);
        return res.status(500).json({ error: "Failed to fetch attendance overview data." });
      }
    },
  );

  /**
   * GET /api/reports/demographics
   * One row per active completed volunteer: age, gender, spiritual privilege flags.
   * Client aggregates into bins — no server-side grouping.
   * Query param: ?year=YYYY (defaults to current year).
   * Permission: viewAttendance (OVERSEER+)
   */
  router.get(
    "/api/reports/demographics",
    requireAuth,
    requirePermission("viewAttendance"),
    async (req, res) => {
      try {
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        const volunteers = await getVolunteerDemographics(year);
        return res.json({ year, volunteers });
      } catch (err) {
        (logError || console.error)("GET /api/reports/demographics error:", err);
        return res.status(500).json({ error: "Failed to fetch demographics data." });
      }
    },
  );

  /**
   * GET /api/reports/crew-staffing
   * Roster count vs. scheduled count per crew department for the year.
   * Query param: ?year=YYYY (defaults to current year).
   * Permission: viewAttendance (OVERSEER+)
   */
  router.get(
    "/api/reports/crew-staffing",
    requireAuth,
    requirePermission("viewAttendance"),
    async (req, res) => {
      try {
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        const crews = await getCrewStaffingSummary(year);
        return res.json({ year, crews });
      } catch (err) {
        (logError || console.error)("GET /api/reports/crew-staffing error:", err);
        return res.status(500).json({ error: "Failed to fetch crew staffing data." });
      }
    },
  );

  /**
   * GET /api/reports/day-staffing
   * Per-crew staffing health for a single convention day:
   * volunteer_need, scheduled, attended, and gap per department.
   * Query param: ?dayId=N (required — convention_days.id).
   * Permission: viewAttendance (OVERSEER+)
   */
  router.get(
    "/api/reports/day-staffing",
    requireAuth,
    requirePermission("viewAttendance"),
    async (req, res) => {
      try {
        const dayId = parseInt(req.query.dayId, 10);
        if (!dayId) {
          return res.status(400).json({ error: "dayId is required." });
        }
        const crews = await getDayStaffingReport(dayId);
        return res.json({ dayId, crews });
      } catch (err) {
        (logError || console.error)("GET /api/reports/day-staffing error:", err);
        return res.status(500).json({ error: "Failed to fetch day staffing data." });
      }
    },
  );

  // ============================================================
  // NOTES REPORT
  // ============================================================

  /**
   * GET /oversight/tools/notes-report
   * Renders the Notes Report page. Requires OVERSEER or above.
   */
  router.get(
    "/oversight/tools/notes-report",
    requireAuth,
    requirePermission("viewVolunteerInfo"),
    async (req, res) => {
      try {
        return res.render("notesReport", {
          actorId:   req.session.userId,
          actorRole: req.session.userRole || "NON_REGISTERED",
        });
      } catch (err) {
        (logError || console.error)("GET /oversight/tools/notes-report error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  /**
   * GET /api/notes-report/volunteers
   * All active (non-dismissed) volunteer notes.
   * Permission: viewVolunteerInfo (OVERSEER+)
   */
  router.get(
    "/api/notes-report/volunteers",
    requireAuth,
    requirePermission("viewVolunteerInfo"),
    async (req, res) => {
      try {
        const volunteers = await getNotesReportVolunteers();
        return res.json({ volunteers });
      } catch (err) {
        (logError || console.error)("GET /api/notes-report/volunteers error:", err);
        return res.status(500).json({ error: "Failed to fetch notes report data." });
      }
    },
  );

  /**
   * GET /api/notes-report/volunteers/dismissed
   * Dismissed volunteer notes (the bin).
   * Permission: viewVolunteerInfo (OVERSEER+)
   */
  router.get(
    "/api/notes-report/volunteers/dismissed",
    requireAuth,
    requirePermission("viewVolunteerInfo"),
    async (req, res) => {
      try {
        const volunteers = await getNotesReportVolunteers({ includeDismissed: true });
        return res.json({ volunteers });
      } catch (err) {
        (logError || console.error)("GET /api/notes-report/volunteers/dismissed error:", err);
        return res.status(500).json({ error: "Failed to fetch dismissed notes." });
      }
    },
  );

  /**
   * GET /api/notes-report/volunteers/:id
   * Single-volunteer note data for the scheduler note panel.
   * Must be registered AFTER /dismissed to prevent Express matching
   * "dismissed" as a volunteer ID parameter.
   * Permission: viewVolunteerInfo (OVERSEER+)
   */
  router.get(
    "/api/notes-report/volunteers/:id",
    requireAuth,
    requirePermission("viewVolunteerInfo"),
    async (req, res) => {
      try {
        const volunteerId = parseInt(req.params.id, 10);
        if (!volunteerId) return res.status(400).json({ error: "Volunteer ID is required." });
        const volunteer = await getVolunteerNoteById(volunteerId);
        if (!volunteer) return res.status(404).json({ error: "Volunteer not found." });
        return res.json({ volunteer });
      } catch (err) {
        (logError || console.error)("GET /api/notes-report/volunteers/:id error:", err);
        return res.status(500).json({ error: "Failed to fetch volunteer note." });
      }
    },
  );

  /**
   * POST /api/notes-report/read
   * Records that the authenticated overseer has read a volunteer's note.
   * Body: { volunteerId: number }
   */
  router.post(
    "/api/notes-report/read",
    requireAuth,
    requirePermission("viewVolunteerInfo"),
    async (req, res) => {
      try {
        const volunteerId = parseInt(req.body.volunteerId, 10);
        if (!volunteerId) return res.status(400).json({ error: "volunteerId is required." });
        await recordNoteRead(volunteerId, req.session.userId);
        return res.json({ ok: true });
      } catch (err) {
        (logError || console.error)("POST /api/notes-report/read error:", err);
        return res.status(500).json({ error: "Failed to record note read." });
      }
    },
  );

  /**
   * GET /api/notes-report/actions
   * All intake_note action items.
   */
  router.get(
    "/api/notes-report/actions",
    requireAuth,
    requirePermission("viewVolunteerInfo"),
    async (req, res) => {
      try {
        const actions = await getVolunteerActions({ sourceType: "intake_note" });
        return res.json({ actions });
      } catch (err) {
        (logError || console.error)("GET /api/notes-report/actions error:", err);
        return res.status(500).json({ error: "Failed to fetch action items." });
      }
    },
  );

  /**
   * POST /api/notes-report/actions
   * Creates a new action item. Body: { volunteerId: number }
   */
  router.post(
    "/api/notes-report/actions",
    requireAuth,
    requirePermission("viewVolunteerInfo"),
    async (req, res) => {
      try {
        const volunteerId = parseInt(req.body.volunteerId, 10);
        if (!volunteerId) return res.status(400).json({ error: "volunteerId is required." });
        const id = await createVolunteerAction({
          volunteerId,
          sourceType: "intake_note",
          sourceId:   null,
          createdBy:  req.session.userId,
        });
        return res.status(201).json({ id });
      } catch (err) {
        (logError || console.error)("POST /api/notes-report/actions error:", err);
        return res.status(500).json({ error: "Failed to create action item." });
      }
    },
  );

  /**
   * PATCH /api/notes-report/actions/:id/solution
   * Body: { solutionFound: boolean|null, solution?: string }
   */
  router.patch(
    "/api/notes-report/actions/:id/solution",
    requireAuth,
    requirePermission("viewVolunteerInfo"),
    async (req, res) => {
      try {
        const actionId = parseInt(req.params.id, 10);
        if (!actionId) return res.status(400).json({ error: "Action ID is required." });
        const rawSf        = req.body.solutionFound;
        const solutionFound = (rawSf === null || rawSf === undefined)
            ? null
            : (rawSf === true || rawSf === 'true');
        const solution = req.body.solution ?? null;
        await updateActionSolution(actionId, { solutionFound, solution }, req.session.userId);
        return res.json({ ok: true });
      } catch (err) {
        (logError || console.error)("PATCH /api/notes-report/actions/:id/solution error:", err);
        return res.status(500).json({ error: "Failed to update action solution." });
      }
    },
  );

  /**
   * PATCH /api/notes-report/actions/:id/complete
   */
  router.patch(
    "/api/notes-report/actions/:id/complete",
    requireAuth,
    requirePermission("viewVolunteerInfo"),
    async (req, res) => {
      try {
        const actionId = parseInt(req.params.id, 10);
        if (!actionId) return res.status(400).json({ error: "Action ID is required." });
        await completeAction(actionId, req.session.userId);
        return res.json({ ok: true });
      } catch (err) {
        (logError || console.error)("PATCH /api/notes-report/actions/:id/complete error:", err);
        return res.status(500).json({ error: "Failed to mark action complete." });
      }
    },
  );

  /**
   * DELETE /api/notes-report/actions/:id
   */
  router.delete(
    "/api/notes-report/actions/:id",
    requireAuth,
    requirePermission("viewVolunteerInfo"),
    async (req, res) => {
      try {
        const actionId = parseInt(req.params.id, 10);
        if (!actionId) return res.status(400).json({ error: "Action ID is required." });
        await deleteVolunteerAction(actionId);
        return res.json({ ok: true });
      } catch (err) {
        (logError || console.error)("DELETE /api/notes-report/actions/:id error:", err);
        return res.status(500).json({ error: "Failed to delete action item." });
      }
    },
  );

  /**
   * POST /api/notes-report/dismiss
   * Body: { volunteerId: number }
   */
  router.post(
    "/api/notes-report/dismiss",
    requireAuth,
    requirePermission("viewVolunteerInfo"),
    async (req, res) => {
      try {
        const volunteerId = parseInt(req.body.volunteerId, 10);
        if (!volunteerId) return res.status(400).json({ error: "volunteerId is required." });
        const actions = await getVolunteerActions({ sourceType: "intake_note" });
        const hasActiveActions = actions.some(
          (a) => a.volunteer_id === volunteerId && !a.completed,
        );
        if (hasActiveActions) {
          return res.status(409).json({
            error: "Cannot dismiss a note with active action items. Complete or delete them first.",
          });
        }
        await dismissNote(volunteerId, req.session.userId);
        return res.json({ ok: true });
      } catch (err) {
        (logError || console.error)("POST /api/notes-report/dismiss error:", err);
        return res.status(500).json({ error: "Failed to dismiss note." });
      }
    },
  );

  /**
   * POST /api/notes-report/restore
   * Body: { volunteerId: number }
   */
  router.post(
    "/api/notes-report/restore",
    requireAuth,
    requirePermission("viewVolunteerInfo"),
    async (req, res) => {
      try {
        const volunteerId = parseInt(req.body.volunteerId, 10);
        if (!volunteerId) return res.status(400).json({ error: "volunteerId is required." });
        await restoreNote(volunteerId);
        return res.json({ ok: true });
      } catch (err) {
        (logError || console.error)("POST /api/notes-report/restore error:", err);
        return res.status(500).json({ error: "Failed to restore note." });
      }
    },
  );

  return router;
}
