// public/js/email-validation.js
// -----------------------------------------------------------------------------
// Email validation controller for the account / email step AND the nonProfile step:
// - Kickbox-backed deliverability validation via /validate-email
// - Domain blocking (jwpub.org)
// - Confirm-email exact match gate
// - Duplicate email check via /api/volunteers/exists
// - On emailPass page: shows/hides password section once email gates are satisfied
// - On nonProfile page: provides the same live validation UX without owning submit
// -----------------------------------------------------------------------------

(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", initEmailValidation);

  function initEmailValidation() {
    // Detect which form we are on
    /** @type {HTMLFormElement | null} */
    const emailPassForm = /** @type {HTMLFormElement | null} */ (
      document.querySelector('form[action="/submit-emailPass"]')
    );
    /** @type {HTMLFormElement | null} */
    const nonProfileForm = /** @type {HTMLFormElement | null} */ (
      document.querySelector('form[action="/submit-nonProfileInfo"]')
    );

    /** @type {HTMLFormElement | null} */
    const form = emailPassForm || nonProfileForm;

    const emailInput = /** @type {HTMLInputElement | null} */ (
      document.querySelector("#email")
    );
    const emailStatus = /** @type {HTMLElement | null} */ (
      document.querySelector("#email-status")
    );
    const confirmInput = /** @type {HTMLInputElement | null} */ (
      document.querySelector("#confirm-email")
    );
    const confirmStatus = /** @type {HTMLElement | null} */ (
      document.querySelector("#confirm-email-status")
    );
    const passwordsDiv = /** @type {HTMLElement | null} */ (
      document.querySelector("#passwords")
    );

    // If key elements missing, do nothing
    if (
      !form ||
      !emailInput ||
      !emailStatus ||
      !confirmInput ||
      !confirmStatus
    ) {
      return;
    }

    const isEmailPass = !!emailPassForm;
    const isNonProfile = !!nonProfileForm;

    // Accessibility
    emailStatus.setAttribute("role", "status");
    emailStatus.setAttribute("aria-live", "polite");
    confirmStatus.setAttribute("role", "status");
    confirmStatus.setAttribute("aria-live", "polite");

    /* ------------------------------------------------------------------------
     * Helper functions
     * --------------------------------------------------------------------- */

    const clearStates = (el) => {
      el.classList.remove("loading", "success", "error");
    };

    const setStatusLoading = (el, text = "Checking...") => {
      clearStates(el);
      el.classList.add("loading");
      el.innerHTML =
        '<span class="spinner-border spinner-border-sm text-secondary" role="status" aria-hidden="true"></span> ' +
        text;
    };

    const setStatusSuccess = (el, msg = "✅ OK") => {
      clearStates(el);
      el.classList.add("success");
      el.textContent = msg;
    };

    const setStatusError = (el, msg = "Error.") => {
      clearStates(el);
      el.classList.add("error");
      el.innerHTML = `
        <div class="alert alert-danger alert-dismissible fade show" role="alert">
          ❌ ${msg}
          <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>`;
    };

    const setConfirmEnabled = (enabled) => {
      confirmInput.disabled = !enabled;
    };

    function showPasswords(show) {
      // Only relevant on emailPass page; on nonProfile, passwordsDiv is usually null
      if (!passwordsDiv) return;

      const shouldHide = !show;
      passwordsDiv.classList.toggle("d-none", shouldHide);
      passwordsDiv.hidden = shouldHide;
      passwordsDiv.setAttribute("aria-hidden", String(shouldHide));

      const interactive = passwordsDiv.querySelectorAll(
        "input, select, textarea, button",
      );
      interactive.forEach((el) => {
        /** @type {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement} */ (
          el
        ).disabled = shouldHide;
      });
    }

    /* ------------------------------------------------------------------------
     * Shared state
     * --------------------------------------------------------------------- */

    /** @type {boolean} */
    let emailDeliverable = false;
    /** @type {boolean} */
    let emailsMatch = false;
    /** @type {number | undefined} */
    let debounceId;
    /** @type {boolean | null} */
    let emailTaken = null;
    /** @type {number | undefined} */
    let dupDebounceId;

    // Expose for nonProfile submit gating if needed
    window.__emailValidationState = {
      get emailDeliverable() {
        return emailDeliverable;
      },
      get emailsMatch() {
        return emailsMatch;
      },
      get emailTaken() {
        return emailTaken;
      },
    };

    /* ============================================================
     * Primary email validation (Kickbox-backed)
     * ============================================================ */

    async function validateEmail(email) {
      const requestedEmail = email.trim();
      setStatusLoading(emailStatus, "Checking email...");

      emailStatus.dataset.deliverable = "false";
      emailDeliverable = false;
      emailTaken = null;

      // Block jwpub immediately
      if (requestedEmail.toLowerCase().endsWith("@jwpub.org")) {
        setStatusError(emailStatus, "Emails from @jwpub.org are not allowed.");
        setConfirmEnabled(false);
        emailsMatch = false;
        showPasswords(false);
        return;
      }

      try {
        const res = await fetch(
          `/validate-email?email=${encodeURIComponent(requestedEmail)}`,
        );
        console.log(res)
        const data = await res.json().catch(() => ({}));
        const reason = data.reason || "";

        // Ignore stale responses
        if (emailInput.value.trim() !== requestedEmail) return;

        if (!res.ok) {
          setStatusError(
            emailStatus,
            data.error || "Server error. Please try again later.",
          );
          setConfirmEnabled(false);
          emailsMatch = false;
          showPasswords(false);
          return;
        }

        const result = String(data.result || "").toLowerCase();

        if (result === "deliverable") {
          emailDeliverable = true;
          window.dispatchEvent(new Event("emailValidationUpdated"));
          emailStatus.dataset.deliverable = "true";
          setStatusSuccess(emailStatus, "✅ Valid email");
          setConfirmEnabled(true);
        } else if (result === "risky" || result === "unknown") {
          emailDeliverable = false;
          emailStatus.dataset.deliverable = "false";
          setStatusError(
            emailStatus,
            reason || "Email may be risky or unknown.",
          );
          setConfirmEnabled(false);
          emailsMatch = false;
          showPasswords(false);
        } else {
          emailDeliverable = false;
          emailStatus.dataset.deliverable = "false";
          setStatusError(emailStatus, reason || "Invalid email address.");
          setConfirmEnabled(false);
          emailsMatch = false;
          showPasswords(false);
        }

        evaluateConfirmMatch();
      } catch (err) {
        console.error("validateEmail error:", err);
        emailDeliverable = false;
        emailStatus.dataset.deliverable = "false";
        setStatusError(
          emailStatus,
          "Error validating email. Please try again later.",
        );
        setConfirmEnabled(false);
        emailsMatch = false;
        showPasswords(false);
      }
    }

    /* ============================================================
     * Duplicate email check (/api/volunteers/exists)
     * ============================================================ */

    async function checkEmailDuplicate(email) {
      const normalized = email.trim().toLowerCase();
      if (!normalized) {
        emailTaken = null;
        return null;
      }

      try {
        const resp = await fetch(
          `/api/volunteers/exists?email=${encodeURIComponent(normalized)}`,
          { credentials: "include" },
        );
        const data = await resp.json().catch(() => ({}));

        if (!resp.ok) {
          console.warn("Email duplicate check failed:", resp.status, data);
          emailTaken = null;
          setStatusError(
            emailStatus,
            data.error || "Could not verify email. Please try again.",
          );
          return null;
        }

        emailTaken = !!data.exists;

        if (emailTaken) {
          setStatusError(emailStatus, "This email is already registered.");
        } else {
          setStatusSuccess(emailStatus, "✅ Email is valid and available");
          window.dispatchEvent(new Event("emailValidationUpdated"));
        }

        return emailTaken;
      } catch (err) {
        console.error("Error checking email duplicate:", err);
        emailTaken = null;
        setStatusError(
          emailStatus,
          "Could not verify email. Please try again.",
        );
        return null;
      }
    }

    /* ============================================================
     * Confirm email exact match gate
     * ============================================================ */

    function evaluateConfirmMatch() {
      const emailVal = emailInput.value.trim();
      const confirmVal = confirmInput.value.trim();

      if (!emailDeliverable) {
        emailsMatch = false;
        clearStates(confirmStatus);
        confirmStatus.textContent = "Validate your email first.";
        showPasswords(false);
        return;
      }

      if (!confirmVal) {
        emailsMatch = false;
        clearStates(confirmStatus);
        confirmStatus.textContent = "Please repeat your email.";
        showPasswords(false);
        return;
      }

      if (confirmVal.toLowerCase() === emailVal.toLowerCase()) {
        emailsMatch = true;
        window.dispatchEvent(new Event("emailValidationUpdated"));
        setStatusSuccess(confirmStatus, "✅ Emails match");
        showPasswords(true);

        clearTimeout(dupDebounceId);
        dupDebounceId = window.setTimeout(() => {
          if (emailDeliverable && emailsMatch) {
            void checkEmailDuplicate(emailVal);
          }
        }, 300);
      } else {
        emailsMatch = false;
        setStatusError(confirmStatus, "Emails do not match.");
        showPasswords(false);
        emailTaken = null;
      }
    }

    /* ============================================================
     * Event wiring
     * ============================================================ */

    // Prevent Tab into confirm before email is validated
    confirmInput.addEventListener("keydown", (e) => {
      if (e.key === "Tab" && !emailDeliverable) {
        e.preventDefault();
        emailInput.focus();
        confirmStatus.textContent = "Validate your email first.";
      }
    });

    emailInput.addEventListener("input", () => {
      clearTimeout(debounceId);
      clearTimeout(dupDebounceId);

      const email = emailInput.value.trim();
      emailTaken = null;

      if (email === "") {
        emailDeliverable = false;
        emailStatus.dataset.deliverable = "false";
        setConfirmEnabled(false);
        clearStates(emailStatus);
        emailStatus.textContent = "Please enter an email address.";
        emailsMatch = false;
        showPasswords(false);
        return;
      }

      if (email.length < 5) {
        emailDeliverable = false;
        emailStatus.dataset.deliverable = "false";
        setConfirmEnabled(false);
        clearStates(emailStatus);
        emailStatus.textContent = "";
        emailsMatch = false;
        showPasswords(false);
        return;
      }

      debounceId = window.setTimeout(() => {
        void validateEmail(email);
      }, 500);
    });

    confirmInput.addEventListener("input", evaluateConfirmMatch);

    /* ============================================================
     * Submit gating
     *  - EmailPass page: block submit until all gates satisfied
     *  - NonProfile page: DO NOT block; AJAX handler owns submit
     * ============================================================ */

    if (isEmailPass) {
      form.addEventListener("submit", (e) => {
        const email = emailInput.value.trim().toLowerCase();

        // Block jwpub at submit too
        if (email.endsWith("@jwpub.org")) {
          e.preventDefault();
          setStatusError(
            emailStatus,
            "Emails from @jwpub.org are not allowed.",
          );
          return;
        }

        evaluateConfirmMatch();

        if (!(emailDeliverable && emailsMatch)) {
          e.preventDefault();
          return;
        }

        if (emailTaken === true) {
          e.preventDefault();
          setStatusError(emailStatus, "This email is already registered.");
          return;
        }

        if (emailTaken === null) {
          e.preventDefault();
          setStatusError(
            emailStatus,
            "Could not verify email at this time. Please try again.",
          );
          return;
        }

        // If emailTaken === false AND all gates OK:
        // allow native submit to /submit-emailPass (passwords.js enforces password constraints).
      });
    }
    // if isNonProfile: no submit handler here; initNonProfileForm() handles AJAX submit
  }
})();
