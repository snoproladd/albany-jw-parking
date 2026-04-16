// routes/oversightRoutes.js



import express from "express";
import crypto from 'crypto';

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
  getVolunteersForImportMatch,
  applyDecentlyImport,
  getLocationsTasks,
  createLocationTask,
  updateLocationTask,
  setLocationTaskActive,
  getEventTypes,
  createEventType,
  updateEventType,
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
  copyConventionDay,
  getVolunteersForMessaging,
  createInvitation,
  getInvitationByToken,
  markInvitationResponded,
  getMessageTemplates,
  createMessageTemplate,
  updateMessageTemplate,
  deleteMessageTemplate,
  getInvitationsForTracker,
  getVolunteersWithPendingInvites,
  getVolunteersWithPendingInvitesDeep,
  getInvitationBatches,
  getInvitationBatch,
  createInvitationBatch,
  suggestBatchName,
  revokeInvitation,
  reinstateInvitation,
  getRevocationLog,
  setShiftInvitable,
  getInvitableDaysWithShifts,
  setVolunteerSmsOptIn,
  handleSmsOptOutWebhook,
} from "../lib/dbSync.js";
import { verifyPassword, hashPassword } from "../lib/passwordVer.js";

import { INCOMPATIBILITIES } from "../src/config/privilegeRules.js";

import { requirePermission, canAssignRole, ROLE_HIERARCHY, PERMISSIONS } from "../src/config/roles.js";

import { sendResetEmail, sendResetSms, getBaseUrl } from '../lib/messaging.js';   


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
}) {
  const router = express.Router();

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
      try {
        const volunteers = (await getActiveVolunteers()) || [];
        const user = await getVolunteerById(id);

        if (!user) {
          // If the record disappeared, force re-login
          req.session.destroy?.(() => {});
          return res.redirect("/login");
        }

        const congregations = await getCongregations();
        const gender = null; // populated in the edit page based on the selected volunteer, not the logged-in user

        res.render("volunteerAccountOversight", {
          csrfToken: req.csrfToken(),
          editor: user,
          targetUser: null, // populated in the edit page based on the selected volunteer
          volunteers: volunteers,
          privilegeRulesJSON: JSON.stringify(INCOMPATIBILITIES),
          congregations,
          pwError,
          pwSuccess,
        });
        // Implementation for showing volunteer selection/edit page
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

      try {
        const targetUser = await getVolunteerById(Number(targetUserId));
        const volunteers = await getActiveVolunteers();
        const editor = await getVolunteerById(req.session.userId);
        const congregations = await getCongregations();

        return res.render("volunteerAccountOversight", {
          csrfToken: req.csrfToken(),
          editor,
          targetUser,
          volunteers,
          congregations,
          privilegeRulesJSON: JSON.stringify(INCOMPATIBILITIES),
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

        return res.json({ success: true });
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
      } = req.body || {};

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
        const volunteers = await getAllVolunteersWithRoles();
        const actorRole = req.session.userRole || "NON_REGISTERED";

        return res.render("authentication_and_accounts/adminRoles", {
          csrfToken: req.csrfToken(),
          volunteers,
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
    requirePermission("editVolunteerInfo"),
    csrfProtection,
    (req, res) => {
      res.render("authentication_and_accounts/oversightTools", {
        csrfToken: req.csrfToken(),
        userRole: req.session.userRole || "NON_REGISTERED",
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
  // TIMELINES — Event Types (ASSISTANT_ADMIN+)
  // ===========================

  /**
   * GET /oversight/tools/timelines/event-types
   * Render event types management page.
   */
  router.get(
    "/oversight/tools/timelines/event-types",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      try {
        const eventTypes = await getEventTypes();
        return res.render("authentication_and_accounts/timelines", {
          csrfToken: req.csrfToken(),
          view: "event-types",
          eventTypes,
          conventionDays: [],
          timeline: [],
          year: new Date().getFullYear(),
          currentYear: new Date().getFullYear(),
          selectedDay: null,
          locationsTasks: [],
        });
      } catch (err) {
        (logError || console.error)("timelines/event-types GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  router.post(
    "/oversight/tools/timelines/event-types",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const { name, description, color } = req.body || {};
      if (!name?.trim())
        return res
          .status(400)
          .json({ success: false, error: "Name is required." });
      try {
        const id = await createEventType(
          { name, description, color },
          req.session.userEmail || "admin",
        );
        return res.json({ success: true, id });
      } catch (err) {
        (logError || console.error)("timelines/event-types POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  router.put(
    "/oversight/tools/timelines/event-types/:id",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const id = Number(req.params.id);
      const { name, description, color, active } = req.body || {};
      if (!id || !name?.trim())
        return res
          .status(400)
          .json({ success: false, error: "Invalid request." });
      try {
        const ok = await updateEventType(id, {
          name,
          description,
          color,
          active: active !== false && active !== "false",
        });
        if (!ok)
          return res.status(404).json({ success: false, error: "Not found." });
        return res.json({ success: true });
      } catch (err) {
        (logError || console.error)("timelines/event-types PUT error:", err);
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
        const [eventTypes, conventionDays, locationsTasks] = await Promise.all([
          getEventTypes(),
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
          eventTypes,
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
      try {
        const id = await createConventionDay({
          year: yearNum,
          label,
          convention_date,
          program_start,
          program_end,
          notes,
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
      const { label, convention_date, program_start, program_end, notes } =
        req.body || {};

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

      try {
        const ok = await updateConventionDay(id, {
          label,
          convention_date,
          program_start,
          program_end,
          notes,
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

      try {
        const newId = await copyConventionDay(sourceDayId, {
          year: Number(year),
          label: label.trim(),
          convention_date,
          program_start,
          program_end,
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
      try {
        const id = await createSession({
          convention_day_id: Number(convention_day_id),
          label,
          session_order: session_order || 0,
          start_time,
          end_time,
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
      try {
        const ok = await updateSession(id, {
          label,
          session_order: session_order || 0,
          start_time,
          end_time,
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
        event_type_id,
        label,
        start_time,
        end_time,
        volunteer_need,
        notes,
      } = req.body || {};
      if (
        !session_id ||
        !event_type_id ||
        !label?.trim() ||
        !start_time ||
        !end_time
      )
        return res
          .status(400)
          .json({ success: false, error: "Missing required fields." });
      try {
        const id = await createShift({
          session_id: Number(session_id),
          event_type_id: Number(event_type_id),
          label,
          start_time,
          end_time,
          volunteer_need,
          notes,
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
        event_type_id,
        label,
        start_time,
        end_time,
        volunteer_need,
        notes,
      } = req.body || {};
      if (!id || !event_type_id || !label?.trim() || !start_time || !end_time)
        return res
          .status(400)
          .json({ success: false, error: "Missing required fields." });
      try {
        const ok = await updateShift(id, {
          event_type_id: Number(event_type_id),
          label,
          start_time,
          end_time,
          volunteer_need,
          notes,
        });
        if (!ok)
          return res.status(404).json({ success: false, error: "Not found." });
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
      const { shift_id, location_task_id, volunteer_need, notes } =
        req.body || {};
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
      const { volunteer_need, notes } = req.body || {};
      try {
        const ok = await updateScheduleAssignment(id, {
          volunteer_need:
            volunteer_need != null && volunteer_need !== ""
              ? Number(volunteer_need)
              : null,
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
  // MESSAGING CENTER
  // ===========================

  /**
   * GET /oversight/tools/messaging
   * Render the Messaging Center.
   * Passes volunteers, templates, invitable convention days with shifts,
   * and active invitation batches for the current year.
   *
   * Optional ?batchId= query param pre-selects a batch in add-to-campaign mode.
   *
   * @requires accessAdminConsole permission
   */
  router.get(
    "/oversight/tools/messaging",
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

          // If selectPending=1, fetch unanswered unrevoked invitations for this batch
          // so the client can auto-select those volunteers.
          if (selectPending) {
            const pendingInvs = await getInvitationsForTracker({
              batchId,
              response: "pending",
              includeRevoked: false,
            });
            pendingVolunteerIds = pendingInvs.map((i) => i.volunteer_id);
          }
        }

        return res.render("authentication_and_accounts/messagingCenter", {
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
        (logError || console.error)("messaging GET error:", err);
        return res.status(500).send("Server error");
      }
    },
  );

  /**
   * POST /oversight/tools/messaging/send
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
    "/oversight/tools/messaging/send",
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
        conventionDayId = null,
        sessionId = null,
        shiftId = null,
        force = false,
      } = req.body || {};

      const sentBy = req.session.userEmail || "admin";
      const year = new Date().getFullYear();
      const dayId = conventionDayId ? Number(conventionDayId) : null;
      const resolvedSess = sessionId ? Number(sessionId) : null;
      const resolvedShift = shiftId ? Number(shiftId) : null;
      const resolvedBatch = existingBatchId ? Number(existingBatchId) : null;

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
      if (campaignMode === "add_to" && !resolvedBatch)
        return res
          .status(400)
          .json({ success: false, error: "Select an existing campaign." });

      // ── Fetch volunteers ────────────────────────────────────────────────
      let volunteers;
      try {
        const all = await getVolunteersForMessaging();
        const idSet = new Set(volunteerIds.map(Number));
        volunteers = all.filter((v) => idSet.has(v.id));
      } catch (err) {
        (logError || console.error)(
          "messaging/send fetch volunteers error:",
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
      if (!force) {
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
            "messaging/send pending check error:",
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
          });
        }
      } catch (err) {
        (logError || console.error)(
          "messaging/send createInvitationBatch error:",
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
          (logError || console.error)("messaging/send getInvitationBatch for merge fields error:", err);
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

        const token = crypto.randomUUID();
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

        // Store invitation
        try {
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
        } catch (err) {
          (logError || console.error)(
            `messaging/send createInvitation error for vol ${vol.id}:`,
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
  // MESSAGING CENTER — Templates
  // ===========================

  /**
   * GET /oversight/tools/messaging/templates
   * Return all active templates as JSON.
   * Used by the frontend to refresh the template list after saves/deletes.
   *
   * Response: { success: true, templates: Array<template> }
   *
   * @requires accessAdminConsole permission
   */
  router.get(
    "/oversight/tools/messaging/templates",
    requireAuth,
    requirePermission("accessAdminConsole"),
    async (req, res) => {
      try {
        const templates = await getMessageTemplates();
        return res.json({ success: true, templates });
      } catch (err) {
        (logError || console.error)("messaging/templates GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /oversight/tools/messaging/templates
   * Create a new message template.
   *
   * Body (JSON): { name, subject, body }
   * Response:    { success: true, id: number }
   *
   * @requires accessAdminConsole permission
   */
  router.post(
    "/oversight/tools/messaging/templates",
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
        (logError || console.error)("messaging/templates POST error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * PUT /oversight/tools/messaging/templates/:id
   * Update an existing template's name, subject, and body.
   *
   * Body (JSON): { name, subject, body }
   * Response:    { success: true }
   *
   * @requires accessAdminConsole permission
   */
  router.put(
    "/oversight/tools/messaging/templates/:id",
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
        (logError || console.error)("messaging/templates PUT error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * DELETE /oversight/tools/messaging/templates/:id
   * Soft-delete a template (sets active = 0).
   *
   * Response: { success: true }
   *
   * @requires accessAdminConsole permission
   */
  router.delete(
    "/oversight/tools/messaging/templates/:id",
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
        (logError || console.error)("messaging/templates DELETE error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );
  // ===========================
  // INVITATION BATCHES
  // ===========================

  /**
   * GET /oversight/tools/messaging/batches
   * Return all active batches for the current year as JSON.
   * Used by the Messaging Center to refresh the batch picker.
   *
   * @requires accessAdminConsole permission
   */
  router.get(
    "/oversight/tools/messaging/batches",
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
        (logError || console.error)("messaging/batches GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );

  /**
   * POST /oversight/tools/messaging/batches/suggest-name
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
    "/oversight/tools/messaging/batches/suggest-name",
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
   * GET /oversight/tools/messaging/batches/:id
   * Fetch a single batch with full context.
   * Used by the Messaging Center when switching into add-to-campaign mode.
   *
   * @requires accessAdminConsole permission
   */
  router.get(
    "/oversight/tools/messaging/batches/:id",
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
        (logError || console.error)("messaging/batches/:id GET error:", err);
        return res.status(500).json({ success: false, error: "Server error." });
      }
    },
  );
  // ===========================
  // INVITATION REVOCATION
  // ===========================

  /**
   * POST /oversight/tools/messaging/invitations/:id/revoke
   * Revoke a single invitation.
   *
   * Body (JSON): { notes? }
   * Response:    { success: boolean }
   *
   * @requires accessAdminConsole permission
   */
  router.post(
    "/oversight/tools/messaging/invitations/:id/revoke",
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
   * POST /oversight/tools/messaging/invitations/:id/reinstate
   * Reinstate a revoked invitation.
   *
   * Body (JSON): { notes? }
   * Response:    { success: boolean }
   *
   * @requires accessAdminConsole permission
   */
  router.post(
    "/oversight/tools/messaging/invitations/:id/reinstate",
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
   * GET /oversight/tools/messaging/tracker
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
    "/oversight/tools/messaging/tracker",
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
        const [invitations, conventionDays, batches] = await Promise.all([
          getInvitationsForTracker({
            conventionDayId: dayId,
            batchId,
            response: responseFilter,
            includeRevoked,
          }),
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
        });
      } catch (err) {
        (logError || console.error)("messaging/tracker GET error:", err);
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
   * GET /oversight/tools/messaging/batches/:id/invited
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
    "/oversight/tools/messaging/batches/:id/invited",
    requireAuth,
    requirePermission("accessAdminConsole"),
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id)
        return res.status(400).json({ success: false, error: "Invalid id." });

      try {
        const invitations = await getInvitationsForTracker({
          batchId: id,
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

  return router;
};
