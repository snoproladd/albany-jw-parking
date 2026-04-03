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
  getIncompleteDraftVolunteers,
  getRegisteredVolunteers,
  setPendingReset,
  createVolunteerAccount,
  findPotentialDuplicates,
  getRolePermissions,
  upsertRolePermission,
  deleteRolePermission,
  getDecentlyExportRows,
  markDecentlyExported
} from "../lib/dbSync.js";
import { verifyPassword, hashPassword } from "../lib/passwordVer.js";

import { INCOMPATIBILITIES } from "../src/config/privilegeRules.js";

import { requirePermission, canAssignRole, ROLE_HIERARCHY, PERMISSIONS } from "../src/config/roles.js";

import { sendResetEmail, sendResetSms, getBaseUrl } from '../lib/messaging.js';   

import { PROCEDURES, findProcedure } from "../src/config/procedures.js";





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
        console.log("Volunteers passed to router", volunteers);

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
  return router;
};
