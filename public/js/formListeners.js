// public/js/formListeners.js
// -----------------------------------------------------------------------------
// Global form listeners for the registration flow:
// - Shared field feedback helpers (valid/invalid states)
// - Global form toast messaging
// - Server-side field error application
// - Email/password step: email uniqueness + domain rules
// - Congregation step: assigned vs visiting branch logic
// - Non-profile info submit (AJAX)
// - Volunteer info submit (AJAX)
// -----------------------------------------------------------------------------

(() => {
  "use strict";

  /* ============================================================
   * =============== SHARED FIELD FEEDBACK HELPERS ==============
   * ============================================================ */

  /**
   * Clears validation classes and status content for a specific field.
   *
   * @param {string} fieldId - The ID of the form control (e.g. "firstName").
   */
  function clearFieldStatus(fieldId) {
    const input = /** @type {HTMLElement | null} */ (
      document.getElementById(fieldId)
    );
    const status = /** @type {HTMLElement | null} */ (
      document.getElementById(`${fieldId}-status`)
    );

    if (input) input.classList.remove("is-invalid", "is-valid");
    if (status) status.innerHTML = "";
  }

  /**
   * Marks a specific field as invalid and renders an error message
   * in its associated status element.
   *
   * Expects a companion element with ID `${fieldId}-status`.
   *
   * @param {string} fieldId - The ID of the form control (e.g. "email").
   * @param {string} message - Error message to display to the user.
   */
  function setFieldError(fieldId, message) {
    const input = /** @type {HTMLElement | null} */ (
      document.getElementById(fieldId)
    );
    const status = /** @type {HTMLElement | null} */ (
      document.getElementById(`${fieldId}-status`)
    );

    if (input) {
      input.classList.remove("is-valid");
      input.classList.add("is-invalid");
    }

    if (status) {
      status.innerHTML = `
        <div class="invalid-feedback d-block">
          <i class="bi bi-exclamation-circle-fill me-1"></i>
          ${message}
        </div>`;
    }
  }

  /**
   * Marks a specific field as valid and renders a success message
   * in its associated status element.
   *
   * @param {string} fieldId - The ID of the form control (e.g. "phone").
   * @param {string} [message="Looks good"] - Optional success message.
   */
  function setFieldSuccess(fieldId, message = "Looks good") {
    const input = /** @type {HTMLElement | null} */ (
      document.getElementById(fieldId)
    );
    const status = /** @type {HTMLElement | null} */ (
      document.getElementById(`${fieldId}-status`)
    );

    if (input) {
      input.classList.remove("is-invalid");
      input.classList.add("is-valid");
    }

    if (status) {
      status.innerHTML = `
        <div class="valid-feedback d-block">
          <i class="bi bi-check-circle-fill me-1"></i>
          ${message}
        </div>`;
    }
  }

  /**
   * Clears validation state for a list of field IDs.
   *
   * @param {string[]} fieldIds - Array of input IDs to reset.
   */
  function clearAllFieldStatuses(fieldIds) {
    fieldIds.forEach(clearFieldStatus);
  }

  /**
   * Applies a "success" state to a list of field IDs.
   *
   * @param {string[]} fieldIds - Array of input IDs to mark as valid.
   */
  function applySuccessState(fieldIds) {
    fieldIds.forEach((id) => setFieldSuccess(id));
  }

  /* ============================================================
   * =============== GLOBAL FORM TOAST MESSAGE ==================
   * ============================================================ */

  /**
   * Shows a Bootstrap alert-style toast in the #submit-status container.
   * Used for form-wide messages (e.g., duplicate name/phone, server issues).
   *
   * @param {string} message - HTML-safe string to display in the toast body.
   * @param {"primary"|"secondary"|"success"|"danger"|"warning"|"info"|"light"|"dark"} [type="danger"]
   *  Bootstrap contextual color class (alert-${type}).
   */
  function showFormToast(message, type = "danger") {
    const submitStatus = /** @type {HTMLElement | null} */ (
      document.getElementById("submit-status")
    );
    if (!submitStatus) return;

    submitStatus.innerHTML = `
      <div class="alert alert-${type} alert-dismissible fade show mt-3" role="alert">
        <i class="bi bi-exclamation-triangle-fill me-2"></i>
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    `;
  }

  /* ============================================================
   * =============== APPLY SERVER FIELD ERRORS ==================
   * ============================================================ */

  /**
   * Applies server-returned fieldErrors to the relevant inputs,
   * including:
   * - inline field messages via setFieldError
   * - a combined form-level toast for duplicate name/phone or form errors
   *
   * Expected shape:
   * {
   *   name?: string;        // combined name error
   *   firstName?: string;
   *   lastName?: string;
   *   email?: string;
   *   phone?: string;
   *   form?: string;        // form-level error message
   * }
   *
   * @param {Record<string, string>} [fieldErrors={}] - Field error messages from the server.
   */
  function applyFieldErrors(fieldErrors = {}) {
    // Reset standard identity fields before re-applying errors
    clearAllFieldStatuses(["firstName", "lastName", "email", "phone"]);

    // Combined name error (applied to both first and last name)
    if (fieldErrors.name) {
      setFieldError("firstName", fieldErrors.name);
      setFieldError("lastName", fieldErrors.name);
    }

    // Individual field errors
    if (fieldErrors.firstName)
      setFieldError("firstName", fieldErrors.firstName);
    if (fieldErrors.lastName) setFieldError("lastName", fieldErrors.lastName);
    if (fieldErrors.email) setFieldError("email", fieldErrors.email);
    if (fieldErrors.phone) setFieldError("phone", fieldErrors.phone);

    // Build combined toast for duplicates or form-level issues
    const lines = [];

    if (fieldErrors.phone) {
      lines.push("Phone number already exists.");
    }

    if (fieldErrors.name) {
      lines.push(
        "Name already exists; if this is correct enter a suffix to differentiate.",
      );
    }

    // Form-level error overrides combined lines
    if (fieldErrors.form) {
      lines.length = 0;
      lines.push(fieldErrors.form);
    }

    if (lines.length > 0) {
      // Use <br> to preserve line breaks within the alert
      showFormToast(lines.join("<br>"), "danger");
    }
  }

  /* ============================================================
   * =============== DOMContentLoaded ENTRYPOINT ================
   * ============================================================ */

  document.addEventListener("DOMContentLoaded", () => {
    const csrfTokenInput = /** @type {HTMLInputElement | null} */ (
      document.querySelector('input[name="_csrf"]')
    );
    const csrfToken = csrfTokenInput?.value || "";

    initEmailPasswordForm();
    initCongregationForm();
    initNonProfileForm(csrfToken);
    initVolunteerInfoForm(csrfToken);
  });

  /* ============================================================
   * =============== EMAIL / PASSWORD FORM LOGIC ================
   * ============================================================ */

  /**
   * Initializes live email validation and uniqueness checks for the
   * email/password step.
   *
   * - Blocks @jwpub.org domain
   * - Ensures email/confirm-email match (case-insensitive)
   * - Uses /api/volunteers/exists to check uniqueness with debounce
   * - Integrates with password typing to pre-warm uniqueness check
   */
  function initEmailPasswordForm() {
    const emailPassForm = /** @type {HTMLFormElement | null} */ (
      document.querySelector('form[action="/submit-namePass"]')
    );
    const emailInput = /** @type {HTMLInputElement | null} */ (
      document.querySelector("#email")
    );
    const confirmInput = /** @type {HTMLInputElement | null} */ (
      document.querySelector("#confirm-email")
    );
    const emailStatus = /** @type {HTMLElement | null} */ (
      document.querySelector("#email-status")
    );
    const passwordInput = /** @type {HTMLInputElement | null} */ (
      document.querySelector("#password")
    );
    const confirmPasswordInput = /** @type {HTMLInputElement | null} */ (
      document.querySelector("#confirm-password")
    );

    if (!emailPassForm || !emailInput || !confirmInput || !emailStatus) {
      // This script may run on pages where the email/password form is absent.
      return;
    }

    /** @type {HTMLButtonElement | null} */
    let submitBtn =
      emailPassForm.querySelector('button[type="submit"]') ||
      emailPassForm.querySelector("button.btn.btn-primary");

    // Internal state for gating submission
    let emailDeliverable = false;
    let emailsMatch = false;
    /** @type {boolean | null} */
    let emailTaken = null;
    let lastCheckedEmail = "";
    /** @type {number | undefined} */
    let debounceId;
    /** @type {AbortController | null} */
    let existsAbortController = null;

    /**
     * Clears status classes and text for the email-status element.
     */
    function clearEmailStatus() {
      emailStatus.classList.remove("loading", "success", "error");
      emailStatus.innerHTML = "";
    }

    /**
     * Sets the email-status element to a loading state with text.
     *
     * @param {string} [msg="Checking..."] - Loading message.
     */
    function setEmailLoading(msg = "Checking...") {
      clearEmailStatus();
      emailStatus.classList.add("loading");
      emailStatus.textContent = msg;
    }

    /**
     * Sets the email-status element to a success state with text.
     *
     * @param {string} [msg="OK"] - Success message.
     */
    function setEmailSuccess(msg = "OK") {
      clearEmailStatus();
      emailStatus.classList.add("success");
      emailStatus.textContent = msg;
    }

    /**
     * Sets the email-status element to an error state with text.
     *
     * @param {string} [msg="Error."] - Error message.
     */
    function setEmailError(msg = "Error.") {
      clearEmailStatus();
      emailStatus.classList.add("error");
      emailStatus.textContent = msg;
    }

    /**
     * Checks whether the given email already exists by calling:
     *   GET /api/volunteers/exists?email=<email>
     *
     * Uses an AbortController to cancel stale requests when typing quickly.
     * Caches the last checked email + result to avoid duplicate calls.
     *
     * @param {string} email - Email address to check for existence.
     * @returns {Promise<boolean | null>} - true if taken, false if not,
     *   null on network / unexpected errors.
     */
    async function checkEmailExists(email) {
      const normalized = email.trim().toLowerCase();
      if (!normalized) {
        emailTaken = null;
        return false;
      }
      if (lastCheckedEmail === normalized && emailTaken !== null) {
        return emailTaken;
      }

      if (existsAbortController) {
        existsAbortController.abort();
      }
      existsAbortController = new AbortController();

      try {
        const url = `/api/volunteers/exists?email=${encodeURIComponent(
          normalized,
        )}`;
        const res = await fetch(url, { signal: existsAbortController.signal });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          emailTaken = null;
          lastCheckedEmail = normalized;
          return null;
        }

        emailTaken = !!data.exists;
        lastCheckedEmail = normalized;
        return emailTaken;
      } catch {
        emailTaken = null;
        lastCheckedEmail = normalized;
        return null;
      }
    }

    /**
     * Returns true if the email domain is blocked.
     * Currently blocks @jwpub.org addresses.
     *
     * @param {string} email
     * @returns {boolean}
     */
    function isEmailBlockedByDomain(email) {
      return String(email).trim().toLowerCase().endsWith("@jwpub.org");
    }

    /**
     * Case-insensitive comparison of two email addresses.
     *
     * @param {string} a
     * @param {string} b
     * @returns {boolean}
     */
    function emailsEqualInsensitive(a, b) {
      return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
    }

    /**
     * Re-evaluates whether the email gates are satisfied:
     * - emailDeliverable (rough regex or external deliverability flag)
     * - emailsMatch (email === confirm-email, case-insensitive)
     * - triggers uniqueness check with debounce when both conditions are met
     */
    function reevaluateEmailGates() {
      const email = emailInput.value.trim();
      const confirm = confirmInput.value.trim();

      if (isEmailBlockedByDomain(email)) {
        emailDeliverable = false;
        emailsMatch = false;
        emailTaken = null;
        setEmailError("Emails from @jwpub.org are not allowed.");
        return;
      }

      emailsMatch =
        !!email && !!confirm && emailsEqualInsensitive(email, confirm);

      const deliverableAttr = emailStatus?.dataset?.deliverable;
      if (deliverableAttr === "true") {
        emailDeliverable = true;
      } else if (deliverableAttr === "false") {
        emailDeliverable = false;
      } else {
        // Fallback: basic email pattern check
        emailDeliverable = /\S+@\S+\.\S+/.test(email);
      }

      // If email looks valid and matches confirm, debounce the uniqueness check
      if (emailDeliverable && emailsMatch) {
        if (debounceId) clearTimeout(debounceId);
        debounceId = window.setTimeout(() => {
          void checkEmailExists(email);
        }, 300);
      }
    }

    /**
     * Preloads the email uniqueness check while the user is typing a password
     * so the final submit feels more responsive.
     */
    function maybePreloadDuringPasswordTyping() {
      const email = emailInput.value.trim();
      if (emailDeliverable && emailsMatch && emailTaken === null) {
        void checkEmailExists(email);
      }
    }

    // Wire up listeners
    emailInput.addEventListener("input", reevaluateEmailGates);
    confirmInput.addEventListener("input", reevaluateEmailGates);

    if (passwordInput) {
      passwordInput.addEventListener("input", maybePreloadDuringPasswordTyping);
    }
    if (confirmPasswordInput) {
      confirmPasswordInput.addEventListener(
        "input",
        maybePreloadDuringPasswordTyping,
      );
    }

    // Final submit gate
    emailPassForm.addEventListener("submit", async (e) => {
      const email = emailInput.value.trim();
      const confirm = confirmInput.value.trim();

      if (isEmailBlockedByDomain(email)) {
        e.preventDefault();
        setEmailError("Emails from @jwpub.org are not allowed.");
        return;
      }

      emailsMatch = emailsEqualInsensitive(email, confirm);
      if (!(emailDeliverable && emailsMatch)) {
        e.preventDefault();
        setEmailError(
          "Please validate your email and ensure both entries match.",
        );
        return;
      }

      // Ensure we have a fresh uniqueness result
      if (emailTaken === null || lastCheckedEmail !== email.toLowerCase()) {
        e.preventDefault();
        setEmailLoading("Checking for existing account...");
        const exists = await checkEmailExists(email);
        if (exists === null) {
          setEmailError(
            "Could not verify email at this time. Please try again.",
          );
          return;
        }

        // After uniqueness check, if still OK, submit manually
        if (!exists) {
          emailTaken = false;
          setEmailSuccess("Email OK. Submitting...");
          emailPassForm.submit();
          return;
        }

        // If it exists, fall through to error branch below
      }

      if (emailTaken) {
        e.preventDefault();
        setEmailError("This email is already registered.");
        return;
      }

      setEmailSuccess("Email OK. Submitting...");
      // Allow native submission if not prevented above
    });
  }

  /* ============================================================
   * =============== CONGREGATION FORM LOGIC ====================
   * ============================================================ */

  /**
   * Initializes congregation form visibility and required-field toggling.
   *
   * - If congAssigned === "yes": show congregation select, hide manual entry
   * - If congAssigned === "no": hide select, show manual entry fields
   */
  function initCongregationForm() {
    const congForm = /** @type {HTMLFormElement | null} */ (
      document.querySelector('form[action="/submitCongregation"]')
    );
    if (!congForm) return;

    const congGroup = /** @type {HTMLElement | null} */ (
      congForm.querySelector("#congregation-group")
    );
    const congEnter = /** @type {HTMLElement | null} */ (
      congForm.querySelector("#congregationEnter")
    );
    const congSelect = /** @type {HTMLSelectElement | null} */ (
      congForm.querySelector("#congregation")
    );
    const congOtherCity = /** @type {HTMLInputElement | null} */ (
      congForm.querySelector("#congregationOtherCity")
    );
    const congOtherState = /** @type {HTMLInputElement | null} */ (
      congForm.querySelector("#congregationOtherState")
    );
    const congOtherLang = /** @type {HTMLInputElement | null} */ (
      congForm.querySelector("#congregationOtherLang")
    );
    const assignedButtons = congForm.querySelectorAll(
      'input[name="congAssigned"]',
    );

    if (!congGroup || !congEnter || !assignedButtons.length) return;

    /**
     * Updates visibility and required attributes based on congAssigned value.
     */
    function updateCongVisibility() {
      const selected = /** @type {HTMLInputElement | null} */ (
        congForm.querySelector('input[name="congAssigned"]:checked')
      );
      if (!selected) return;

      if (selected.value === "yes") {
        // Assigned to a known congregation
        congGroup.classList.remove("d-none");
        if (congSelect) congSelect.required = true;

        congEnter.classList.add("d-none");
        if (congOtherCity) {
          congOtherCity.required = false;
          congOtherCity.value = "";
        }
        if (congOtherState) {
          congOtherState.required = false;
          congOtherState.value = "";
        }
        if (congOtherLang) {
          congOtherLang.required = false;
          congOtherLang.value = "";
        }
      } else if (selected.value === "no") {
        // Visiting / not assigned: require manual congregation info
        congGroup.classList.add("d-none");
        if (congSelect) {
          congSelect.required = false;
          congSelect.value = "";
        }

        congEnter.classList.remove("d-none");
        if (congOtherCity) congOtherCity.required = true;
        if (congOtherState) congOtherState.required = true;
        if (congOtherLang) congOtherLang.required = true;
      }
    }

    assignedButtons.forEach((radio) => {
      radio.addEventListener("change", updateCongVisibility);
    });

    // Ensure correct initial state on page load
    updateCongVisibility();
  }

  /* ============================================================
   * =============== NON-PROFILE SUBMIT (AJAX) ==================
   * ============================================================ */

  /**
   * Initializes AJAX submission for the "non-profile" name/email step.
   *
   * - Sends JSON payload to /submit-nonProfileInfo
   * - Uses CSRF header
   * - Applies fieldErrors via applyFieldErrors
   * - Shows form-level toast on generic errors
   *
   * @param {string} csrfToken - Anti-CSRF token to send in request headers.
   */
  
function initNonProfileForm(csrfToken) {
  const nonProfileForm = document.querySelector(
    'form[action="/submit-nonProfileInfo"]',
  );
  if (!nonProfileForm) return;

  if (!csrfToken) {
    console.warn(
      "CSRF token missing for /submit-nonProfileInfo; AJAX disabled",
    );
    return;
  }

  const nextBtn = document.getElementById("nonProfile-next");
  const nextStatus = document.getElementById("nonProfile-next-status");
  const emailInput = document.getElementById("email");
  const confirmInput = document.getElementById("confirm-email");

  // Initialize disabled state
  if (nextBtn) nextBtn.disabled = true;
  if (nextStatus)
    nextStatus.textContent = "Complete email validation to continue.";

  function updateNextButtonState() {
    const state = window.__emailValidationState;
    if (!state || !nextBtn || !nextStatus || !emailInput || !confirmInput)
      return;

    const emailVal = emailInput.value.trim();
    const confirmVal = confirmInput.value.trim();

    let ok = false;
    let message = "Complete email validation to continue.";

    if (!emailVal || !confirmVal) {
      message = "Enter and confirm your email address.";
    } else if (!state.emailDeliverable) {
      message = "Please enter a valid email address.";
    } else if (!state.emailsMatch) {
      message = "Emails must match exactly.";
    } else if (state.emailTaken === true) {
      message = "This email is already registered.";
    } else if (state.emailTaken === null) {
      message = "Checking email availability...";
    } else {
      ok = true;
      message = "Email looks good. You can continue.";
    }

    nextBtn.disabled = !ok;
    nextStatus.textContent = message;
  }

  // 🔥 CRITICAL FIX:
  // Let email-validation.js notify us whenever it updates validation state
  window.addEventListener("emailValidationUpdated", updateNextButtonState);

  // Also update on direct typing
  emailInput?.addEventListener("input", updateNextButtonState);
  confirmInput?.addEventListener("input", updateNextButtonState);

  // Patch submit handler...
  nonProfileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAllFieldStatuses(["firstName", "lastName", "email"]);

    const payload = {
      firstName: document.getElementById("firstName")?.value.trim(),
      lastName: document.getElementById("lastName")?.value.trim(),
      suffix: document.getElementById("suffix")?.value.trim(),
      email: document.getElementById("email")?.value.trim(),
    };

    console.log("[initNonProfileForm] Submitting payload:", payload);

    let data = {};

    try {
      const resp = await fetch("/submit-nonProfileInfo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const contentType = resp.headers.get("content-type") || "";
      console.log(
        "[initNonProfileForm] Response:",
        resp.status,
        resp.statusText,
        contentType,
      );

      if (!resp.ok) {
        if (contentType.includes("application/json")) {
          data = await resp.json().catch(() => ({}));
          if (data.fieldErrors) {
            applyFieldErrors(data.fieldErrors);
            updateNextButtonState();
            return;
          }
        }
        showFormToast("An error occurred. Please try again.");
        updateNextButtonState();
        return;
      }

      if (contentType.includes("application/json")) {
        data = await resp.json().catch(() => ({}));
      }

      if (data.fieldErrors) {
        applyFieldErrors(data.fieldErrors);
        updateNextButtonState();
        return;
      }

      window.location.href = "/volunteerIn?disable=true";
    } catch (err) {
      console.error("submit-nonProfileInfo error:", err);
      showFormToast("Server error. Please try again.");
      updateNextButtonState();
    }
  });
}


  /* ============================================================
   * =============== VOLUNTEER INFO SUBMIT (AJAX) ===============
   * ============================================================ */

  /**
   * Initializes AJAX submission for the volunteer info step.
   *
   * - Sends JSON payload to /submit-volunteerInfo
   * - Includes phone + SMS capability
   * - Applies fieldErrors via applyFieldErrors
   * - Uses global toast for generic errors
   *
   * @param {string} csrfToken - Anti-CSRF token to send in request headers.
   */
  function initVolunteerInfoForm(csrfToken) {
    const volunteerInfoForm = /** @type {HTMLFormElement | null} */ (
      document.querySelector('form[action="/submit-volunteerInfo"]')
    );
    if (!volunteerInfoForm) return;

    if (!csrfToken) {
      console.warn(
        "CSRF token not found for /submit-volunteerInfo; AJAX submit disabled.",
      );
      return;
    }

    volunteerInfoForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      clearAllFieldStatuses(["firstName", "lastName", "phone"]);

      const phoneInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("phone")
      );

      const payload = {
        firstName: document.getElementById("firstName")?.value.trim(),
        lastName: document.getElementById("lastName")?.value.trim(),
        suffix: document.getElementById("suffix")?.value.trim(),
        phone: phoneInput ? phoneInput.value.trim() : "",
        SMSCapable:
          document.querySelector('input[name="SMSCapable"]:checked')?.value ===
          "yes",
      };

      /** @type {any} */
      let data = {};

      try {
        const resp = await fetch("/submit-volunteerInfo", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
          body: JSON.stringify(payload),
        });

        const contentType = resp.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          data = await resp.json().catch(() => ({}));
        }

        if (!resp.ok) {
          if (data.fieldErrors) {
            applyFieldErrors(data.fieldErrors);
            return;
          }
          showFormToast(data.message || "An error occurred. Please try again.");
          return;
        }
      } catch (err) {
        console.error("submit-volunteerInfo error:", err);
        showFormToast("Server error. Please try again.");
        return;
      }

      // Field-level errors (success-path JSON with validation issues)
      if (data.fieldErrors) {
        applyFieldErrors(data.fieldErrors);
        return;
      }

      // Success: mark fields as valid and move to next step
      applySuccessState(["firstName", "lastName", "phone"]);
      window.location.href = "/personalInfo";
    });
  }
})();
