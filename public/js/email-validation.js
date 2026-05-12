// public/js/email-validation.js
// -----------------------------------------------------------------------------
// Email validation controller for the account / email step AND the nonProfile step AND My Account:
// - Kickbox-backed deliverability validation via /validate-email
// - Domain blocking (jwpub.org)
// - confirmEmail exact match gate (emailPass & nonProfile)
// - Duplicate email check via /api/volunteers/exists
// - On emailPass page: shows/hides password section once email gates are satisfied
// - On nonProfile page: provides the same live validation UX without owning submit
// - On My Account page: email-only validation; allows unchanged email; no confirm/emailPass gating
// -----------------------------------------------------------------------------

(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", initEmailValidation);

  /**
   * Initialize email validation for:
   * - Email/pass registration
   * - Non-profile registration
   * - My Account contact section
   */
  function initEmailValidation() {
    /** @type {HTMLFormElement | null} */
    const emailPassForm = document.querySelector(
      'form[action="/submit-emailPass"]',
    );
    /** @type {HTMLFormElement | null} */
    const nonProfileForm = document.querySelector(
      'form[action="/submit-nonProfileInfo"]',
    );
    /** @type {HTMLFormElement | null} */
    const myAccountContactForm = document.querySelector(
      'form[action="/my-account/update/contact"]',
    );
    const upgradeForm = document.querySelector('form[action="/upgrade/find"]');

    /** @type {HTMLFormElement | null} */
    const form =
      emailPassForm || nonProfileForm || myAccountContactForm || upgradeForm;

    /** @type {HTMLInputElement | null} */
    const emailInput = document.querySelector("#email");
    /** @type {HTMLElement | null} */
    const emailStatus = document.querySelector("#emailStatus");
    /** @type {HTMLInputElement | null} */
    const confirmInput = document.querySelector("#confirmEmail");
    /** @type {HTMLElement | null} */
    const confirmStatus = document.querySelector("#confirmEmailStatus");
    /** @type {HTMLElement | null} */
    const passwordsDiv = document.querySelector("#passwords");

    const isEmailPass = !!emailPassForm;
    const isNonProfile = !!nonProfileForm;
    const isMyAccount = !!myAccountContactForm;
    const isUpgrade = !!upgradeForm;

    // My Account: only need email + status
    if (isMyAccount) {
      if (!emailInput || !emailStatus) return;
    } else if (isUpgrade) {
      // Upgrade: only need email + status (no confirm, no passwords)
      if (!form || !emailInput || !emailStatus) return;
    } else {
      // EmailPass & NonProfile: need full stack (email + confirm + statuses)
      if (
        !form ||
        !emailInput ||
        !emailStatus ||
        !confirmInput ||
        !confirmStatus
      ) {
        return;
      }
    }

    // Accessibility
    emailStatus.setAttribute("role", "status");
    emailStatus.setAttribute("aria-live", "polite");
    if (!isMyAccount && confirmStatus) {
      confirmStatus.setAttribute("role", "status");
      confirmStatus.setAttribute("aria-live", "polite");
    }

    /* ------------------------------------------------------------------------
     * Helper functions
     * --------------------------------------------------------------------- */

    /**
     * Clear loading/success/error classes on status element.
     * @param {HTMLElement} el
     */
    const clearStates = (el) => {
      el.classList.remove("loading", "success", "error");
    };

    /**
     * Show loading spinner status.
     * @param {HTMLElement} el
     * @param {string} [text="Checking..."]
     */
    const setStatusLoading = (el, text = "Checking...") => {
      clearStates(el);
      el.classList.add("loading");
      el.innerHTML =
        '<span class="spinner-border spinner-border-sm text-secondary" role="status" aria-hidden="true"></span> ' +
        text;
    };

    /**
     * Show success text.
     * @param {HTMLElement} el
     * @param {string} [msg="✅ OK"]
     */
    const setStatusSuccess = (el, msg = "✅ OK") => {
      clearStates(el);
      el.classList.add("success");
      el.textContent = msg;
    };

    /**
     * Show error text as alert.
     * @param {HTMLElement} el
     * @param {string} [msg="Error."]
     */
    const setStatusError = (el, msg = "Error.") => {
      clearStates(el);
      el.classList.add("error");
      el.innerHTML = `
        <div class="alert alert-danger alert-dismissible fade show" role="alert">
          ❌ ${msg}
        </div>`;
    };

    /**
     * Enable or disable confirmEmail field (registration only).
     * @param {boolean} enabled
     */
    const setConfirmEnabled = (enabled) => {
      if (!confirmInput) return;
      confirmInput.disabled = !enabled;
    };

    /**
     * Show/hide password section (emailPass page only).
     * @param {boolean} show
     */
    function showPasswords(show) {
      if (!passwordsDiv) return;

      const shouldHide = !show;
      passwordsDiv.classList.toggle("d-none", shouldHide);
      passwordsDiv.hidden = shouldHide;
      passwordsDiv.setAttribute("aria-hidden", String(shouldHide));

      const interactive = passwordsDiv.querySelectorAll(
        "input, select, textarea, button",
      );
      interactive.forEach((el) => {
        /** @type {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|HTMLButtonElement} */
        (el).disabled = shouldHide;
      });
    }

    /* ------------------------------------------------------------------------
     * Shared state
     * --------------------------------------------------------------------- */

    /** @type {boolean} */
    let emailDeliverable = false;
    /** @type {boolean} */
    let emailsMatch = false;
    /** @type {number|undefined} */
    let debounceId;
    /** @type {boolean|null} */
    let emailTaken = null;
    /** @type {number|undefined} */
    let dupDebounceId;

    // Expose for nonProfile submit gating if needed
    if (!isMyAccount) {
      /** @type {any} */
      (window).__emailValidationState = {
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
    }

    /* ============================================================
     * Primary email validation (Kickbox-backed) – Registration flows
     * ============================================================ */

    /**
     * Validate email address using Kickbox (registration flows).
     * @param {string} email
     */
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
        /** @type {{result?:string,reason?:string,error?:string}} */
        const data = await res.json().catch(() => ({}));
        const reason = data.reason || "";

        // Ignore stale responses
        if (emailInput && emailInput.value.trim() !== requestedEmail) return;

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

        if (!isMyAccount) {
          evaluateConfirmMatch();
        }
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
     * Duplicate email check (/api/volunteers/exists) – Registration flows
     * ============================================================ */

    /**
     * Check whether the given email is already registered (registration flows).
     * @param {string} email
     * @returns {Promise<boolean|null>} true if taken, false if not, null on error
     */
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
        /** @type {{exists?:boolean,error?:string}} */
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

        // Drafts are not treated as taken — the submit flow handles
        // identity confirmation for returning non-registered users.
        emailTaken = !!data.exists && !data.isDraft;

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
     * Confirm email exact match gate (Registration flows)
     * ============================================================ */

    /**
     * Evaluate confirmEmail matching gates for registration.
     */
    function evaluateConfirmMatch() {
      if (!confirmInput || !confirmStatus || !emailInput) return;

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
     * My Account – email-only validation
     * ============================================================ */

    /**
     * Validate email in My Account mode (no confirm, allow unchanged).
     * @param {string} email
     */
    async function validateEmailMyAccount(email) {
      if (!emailInput || !emailStatus) return;

      const requested = email.trim().toLowerCase();
      const original = emailInput.dataset.currentEmail?.toLowerCase() || "";

      // If unchanged → valid
      if (requested === original) {
        emailInput.dataset.validEmail = "true";
        setStatusSuccess(emailStatus, "✓ Email unchanged");
        return;
      }

      // Block jwpub
      if (requested.endsWith("@jwpub.org")) {
        setStatusError(emailStatus, "Emails from @jwpub.org are not allowed.");
        emailInput.dataset.validEmail = "false";
        return;
      }

      setStatusLoading(emailStatus, "Checking email…");

      try {
        const res = await fetch(
          `/validate-email?email=${encodeURIComponent(requested)}`,
        );
        /** @type {{result?:string,reason?:string,error?:string}} */
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.result) {
          setStatusError(emailStatus, data.error || "Email validation error.");
          emailInput.dataset.validEmail = "false";
          return;
        }

        const result = String(data.result).toLowerCase();

        if (result !== "deliverable") {
          setStatusError(
            emailStatus,
            data.reason || "Email is not deliverable.",
          );
          emailInput.dataset.validEmail = "false";
          return;
        }

        // Duplicate (excluding own email)
        const dupResp = await fetch(
          `/api/volunteers/exists?email=${encodeURIComponent(requested)}`,
          { credentials: "include" },
        );
        /** @type {{exists?:boolean,error?:string}} */
        const dupData = await dupResp.json().catch(() => ({}));

        if (!dupResp.ok) {
          setStatusError(
            emailStatus,
            dupData.error || "Could not verify email.",
          );
          emailInput.dataset.validEmail = "false";
          return;
        }

        if (dupData.exists && requested !== original) {
          setStatusError(
            emailStatus,
            "Another account already uses this email.",
          );
          emailInput.dataset.validEmail = "false";
          return;
        }

        // VALID
        setStatusSuccess(emailStatus, "✓ Email looks good");
        emailInput.dataset.validEmail = "true";
      } catch (err) {
        console.error("validateEmailMyAccount error:", err);
        setStatusError(
          emailStatus,
          "Could not validate email. Please try again.",
        );
        emailInput.dataset.validEmail = "false";
      }
    }

    /* ============================================================
     * Event wiring
     * ============================================================ */

    // Prevent Tab into confirm before email is validated (registration)
    if (!isMyAccount && confirmInput && confirmStatus) {
      confirmInput.addEventListener("keydown", (e) => {
        if (e.key === "Tab" && !emailDeliverable) {
          e.preventDefault();
          emailInput?.focus();
          confirmStatus.textContent = "Validate your email first.";
        }
      });
    }

    emailInput?.addEventListener("input", () => {
      clearTimeout(debounceId);
      clearTimeout(dupDebounceId);

      const email = emailInput.value.trim();
      emailTaken = null;

      // MY ACCOUNT MODE
      if (isMyAccount) {
        if (!email) {
          emailStatus.textContent = "";
          emailInput.dataset.validEmail = "false";
          return;
        }

        debounceId = window.setTimeout(() => {
          void validateEmailMyAccount(email);
        }, 500);

        return; // skip registration logic
      }

      // REGISTRATION MODES

      if (email === "") {
        if (isUpgrade) {
          emailDeliverable = false;
          if (emailStatus) {
            emailStatus.dataset.deliverable = "false";
            clearStates(emailStatus);
            emailStatus.textContent = "";
          }
          emailsMatch = false;
          return;
        }
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

    if (!isMyAccount && confirmInput) {
      confirmInput.addEventListener("input", evaluateConfirmMatch);
    }

    /* ============================================================
     * Submit gating (registration only)
     * ============================================================ */

    if (isEmailPass && form) {
      form.addEventListener("submit", (e) => {
        const email = emailInput?.value.trim().toLowerCase() || "";

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
      });
    }
    // NonProfile: submit gating handled in initNonProfileForm()
  }
})();
