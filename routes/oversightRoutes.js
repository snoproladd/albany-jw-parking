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
  setPendingReset,
} from "../lib/dbSync.js";
import { verifyPassword, hashPassword } from "../lib/passwordVer.js";

import { INCOMPATIBILITIES } from "../src/config/privilegeRules.js";

import { requirePermission, canAssignRole, ROLE_HIERARCHY } from "../src/config/roles.js";

import { sendResetEmail, sendResetSms, getBaseUrl } from '../lib/messaging.js';    // ← add





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
  smtpConfig,}) {
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
   * GET /admin/roles
   * Show all volunteers and their current roles.
   * Accessible to ASSISTANT_ADMIN and ADMIN only.
   */
  router.get(
    "/admin/roles",
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
   * POST /admin/roles
   * Update a single volunteer's role.
   * Server-side canAssignRole check — actor cannot assign equal or higher roles.
   */
  router.post(
    "/admin/roles",
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
        return res.redirect("/admin/roles?error=Invalid+request");
      }

      // Enforce hierarchy — actor cannot assign their own level or above
      if (!canAssignRole(actorRole, newRole)) {
        return res.redirect(
          "/admin/roles?error=You+do+not+have+permission+to+assign+that+role",
        );
      }

      // Prevent self-role change
      if (targetId === req.session.userId) {
        return res.redirect(
          "/admin/roles?error=You+cannot+change+your+own+role",
        );
      }

      try {
        const ok = await updateVolunteerRole(targetId, newRole, editedBy);
        if (!ok) {
          return res.redirect(
            "/admin/roles?error=Volunteer+not+found+or+already+archived",
          );
        }
        return res.redirect("/admin/roles?success=1");
      } catch (err) {
        (logError || console.error)("admin/roles POST error:", err);
        return res.redirect("/admin/roles?error=Server+error");
      }
    },
  );

  // ===========================
  // ADMIN TOOLS DASHBOARD
  // ===========================

  /**
   * GET /admin/tools
   * Central dashboard for admin tools.
   * Accessible to ASSISTANT_ADMIN and ADMIN only.
   */
  router.get(
    "/admin/tools",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    (req, res) => {
      res.render("authentication_and_accounts/adminTools", {
        csrfToken: req.csrfToken(),
      });
    },
  );

  // ===========================
  // ADMIN SEND RESET TOOL
  // ===========================

  /**
   * GET /admin/tools/send-reset
   * List all volunteers with incomplete draft registrations.
   */
  router.get(
    "/admin/tools/send-reset",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      try {
        const drafts = await getIncompleteDraftVolunteers();

        return res.render("authentication_and_accounts/adminSendReset", {
          csrfToken: req.csrfToken(),
          drafts,
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
   * POST /admin/tools/send-reset
   * Generate a reset hash and send it via email or SMS to a single volunteer.
   */
  router.post(
    "/admin/tools/send-reset",
    requireAuth,
    requirePermission("accessAdminConsole"),
    csrfProtection,
    async (req, res) => {
      const { targetId, method } = req.body || {};
      const id = Number(targetId);

      if (!id || !method || !["email", "phone"].includes(method)) {
        return res.redirect(
          "/admin/tools/send-reset?error=" +
            encodeURIComponent("Invalid request."),
        );
      }

      try {
        const volunteer = await getVolunteerById(id);

        if (!volunteer || volunteer.registration_status === "archived") {
          return res.redirect(
            "/admin/tools/send-reset?error=" +
              encodeURIComponent("Volunteer not found."),
          );
        }

        if (method === "email" && !volunteer.email) {
          return res.redirect(
            "/admin/tools/send-reset?error=" +
              encodeURIComponent(
                `No email on file for ${volunteer.firstName} ${volunteer.lastName}.`,
              ),
          );
        }

        if (method === "phone" && !volunteer.phone) {
          return res.redirect(
            "/admin/tools/send-reset?error=" +
              encodeURIComponent(
                `No phone on file for ${volunteer.firstName} ${volunteer.lastName}.`,
              ),
          );
        }

        // Generate and store reset hash
        const hash = crypto.randomUUID();
        await setPendingReset(id, hash);

        const baseUrl = getBaseUrl(req);
        const resetUrl = `${baseUrl}/reset-password/${encodeURIComponent(hash)}`;

        const opts = {
          subject: "Action needed — complete your Albany JW Parking registration",
          firstName: volunteer.firstName || "there",
        };

        let ok = false;

        if (method === "email") {
ok = await sendResetEmail(volunteer.email, resetUrl, {
  ...smtpConfig,
  firstName: volunteer.firstName || "there",
  subject: "Action needed — complete your Albany JW Parking registration",
});
        } else {
          ok = await sendResetSms(
            volunteer.phone,
            resetUrl,
            twilioAccountSid,
            twilioAuthToken,
            twilioMsgSid,
            { firstName: volunteer.firstName || "there" },
          );
        }

        if (!ok) {
          return res.redirect(
            "/admin/tools/send-reset?error=" +
              encodeURIComponent("Failed to send — check server logs."),
          );
        }

        const name = [volunteer.firstName, volunteer.lastName]
          .filter(Boolean)
          .join(" ");
        return res.redirect(
          "/admin/tools/send-reset?success=" +
            encodeURIComponent(`Link sent to ${name} via ${method}.`),
        );
      } catch (err) {
        (logError || console.error)("admin/tools/send-reset POST error:", err);
        return res.redirect(
          "/admin/tools/send-reset?error=" +
            encodeURIComponent("Server error."),
        );
      }
    },
  );
  return router;
};
