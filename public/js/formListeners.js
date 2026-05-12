// public/js/formListeners.js
// -----------------------------------------------------------------------------
// Global form listeners for the registration flow and My Account:
// - Shared field feedback helpers (valid/invalid states)
// - Global form toast messaging
// - Server-side field error application
// - Non-profile info submit (AJAX)
// - Volunteer info submit (AJAX, incl. WhatsApp ID)
// - Congregation step: assigned vs visiting branch logic
// - Summary submit (requires all sections saved, then shows modal)
// - Entry pages: sticky submit + auto-scroll on mobile
// - Native form submit gate (personalInfo, congregationInfo, spiritualInfo, notes)
// -----------------------------------------------------------------------------

(() => {
  "use strict";

  /* ============================================================
   * =============== SHARED FIELD FEEDBACK HELPERS ==============
   * ============================================================ */

  /**
   * Clear validation feedback for a specific field.
   * @param {string} fieldId
   */
  function clearFieldStatus(fieldId) {
    /** @type {HTMLElement | null} */
    const input = document.getElementById(fieldId);
    /** @type {HTMLElement | null} */
    const status = document.getElementById(`${fieldId}-status`);
    if (input) input.classList.remove("is-invalid", "is-valid");
    if (status) status.innerHTML = "";
  }

  /**
   * Mark a field as invalid with a message.
   * @param {string} fieldId
   * @param {string} message
   */
  function setFieldError(fieldId, message) {
    /** @type {HTMLElement | null} */
    const input = document.getElementById(fieldId);
    /** @type {HTMLElement | null} */
    const status = document.getElementById(`${fieldId}-status`);
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
   * Mark a field as valid with an optional message.
   * @param {string} fieldId
   * @param {string} [message="Looks good"]
   */
  function setFieldSuccess(fieldId, message = "Looks good") {
    /** @type {HTMLElement | null} */
    const input = document.getElementById(fieldId);
    /** @type {HTMLElement | null} */
    const status = document.getElementById(`${fieldId}-status`);
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
   * Clear status for multiple fields.
   * @param {string[]} fieldIds
   */
  function clearAllFieldStatuses(fieldIds) {
    fieldIds.forEach(clearFieldStatus);
  }

  /**
   * Apply success state to multiple fields.
   * @param {string[]} fieldIds
   */
  function applySuccessState(fieldIds) {
    fieldIds.forEach((id) => setFieldSuccess(id));
  }

  /* ============================================================
   * =============== GLOBAL FORM TOAST MESSAGE ==================
   * ============================================================ */

  /**
   * Show a global toast message in #submitStatus.
   * @param {string} message
   * @param {"danger"|"warning"|"success"} [type="danger"]
   */
  function showFormToast(message, type = "danger") {
    /** @type {HTMLElement | null} */
    const submitStatus = document.getElementById("submitStatus");
    if (!submitStatus) return;
    submitStatus.innerHTML = `
  <div class="alert alert-${type} fade show mt-3" role="alert">
    <i class="bi bi-exclamation-triangle-fill me-2"></i>
    ${message}
  </div>`;
  }

  /* ============================================================
   * =============== APPLY SERVER FIELD ERRORS ==================
   * ============================================================ */

  /**
   * Apply server-side fieldErrors object to inputs & toast.
   * @param {Record<string,string>} [fieldErrors={}]
   */
  function applyFieldErrors(fieldErrors = {}) {
    clearAllFieldStatuses(["firstName", "lastName", "email", "phone"]);
    if (fieldErrors.name) {
      setFieldError("firstName", fieldErrors.name);
      setFieldError("lastName", fieldErrors.name);
    }
    if (fieldErrors.firstName)
      setFieldError("firstName", fieldErrors.firstName);
    if (fieldErrors.lastName) setFieldError("lastName", fieldErrors.lastName);
    if (fieldErrors.email) setFieldError("email", fieldErrors.email);
    if (fieldErrors.phone) setFieldError("phone", fieldErrors.phone);
    if (fieldErrors.form) showFormToast(fieldErrors.form, "danger");
  }

  /* ============================================================
   * =============== EMAIL / PASSWORD FORM LOGIC ================
   * ============================================================ */

  /**
   * Initialize email/password form submit gate (emailPass.ejs).
   * Prevents double-submits while letting email-validation.js and
   * passwords.js control whether the submit is allowed.
   */
  function initEmailPasswordForm() {
    /** @type {HTMLFormElement | null} */
    const emailPassForm = document.querySelector(
      'form[action="/submit-emailPass"]',
    );
    if (!emailPassForm) return;

    /** @type {HTMLButtonElement | null} */
    const stickySubmitBtn =
      document.querySelector(
        "#emailPassCard .sticky-action button[type='submit']",
      ) || emailPassForm.querySelector('button[type="submit"]');

    let isSubmitting = false;

    emailPassForm.addEventListener("submit", (e) => {
      if (isSubmitting) {
        e.preventDefault();
        return;
      }
      setTimeout(() => {
        if (e.defaultPrevented) return;
        isSubmitting = true;
        if (stickySubmitBtn) stickySubmitBtn.disabled = true;
      }, 0);
    });
  }

  /* ============================================================
   * =============== CONGREGATION FORM LOGIC ====================
   * ============================================================ */

  /**
   * Initialize congregation assigned vs visiting branch logic.
   */
  function initCongregationForm() {
    /** @type {HTMLFormElement | null} */
    const congForm = document.querySelector(
      'form[action="/submitCongregation"]',
    );
    if (!congForm) return;

    /** @type {HTMLElement | null} */
    const congGroup = congForm.querySelector("#congregation-group");
    /** @type {HTMLElement | null} */
    const congEnter = congForm.querySelector("#congregationEnter");
    /** @type {HTMLSelectElement | null} */
    const congSelect = congForm.querySelector("#congregation");
    /** @type {HTMLInputElement | null} */
    const congOtherCity = congForm.querySelector("#congregationOtherCity");
    /** @type {HTMLInputElement | null} */
    const congOtherState = congForm.querySelector("#congregationOtherState");
    /** @type {HTMLInputElement | null} */
    const congOtherLang = congForm.querySelector("#congregationOtherLang");
    /** @type {NodeListOf<HTMLInputElement>} */
    const assignedButtons = congForm.querySelectorAll(
      'input[name="congAssigned"]',
    );

    if (!congGroup || !congEnter || !assignedButtons.length) return;

    function updateCongVisibility() {
      /** @type {HTMLInputElement | null} */
      const selected = congForm.querySelector(
        'input[name="congAssigned"]:checked',
      );
      if (!selected) return;
      if (selected.value === "yes") {
        congGroup.classList.remove("d-none");
        if (congSelect) congSelect.required = true;
        congEnter.classList.add("d-none");
        if (congOtherCity) congOtherCity.required = false;
        if (congOtherState) congOtherState.required = false;
        if (congOtherLang) congOtherLang.required = false;
      } else {
        congGroup.classList.add("d-none");
        if (congSelect) congSelect.required = false;
        congEnter.classList.remove("d-none");
        if (congOtherCity) congOtherCity.required = true;
        if (congOtherState) congOtherState.required = true;
        if (congOtherLang) congOtherLang.required = true;
      }
    }

    assignedButtons.forEach((radio) => {
      radio.addEventListener("change", updateCongVisibility);
    });
    updateCongVisibility();
  }

  /* ============================================================
   * =============== NON-PROFILE SUBMIT (AJAX) ==================
   * ============================================================ */

  /**
   * Initialize non-profile AJAX submit (firstName + lastName + email).
   * @param {string} csrfToken
   */
  function initNonProfileForm(csrfToken) {
    /** @type {HTMLFormElement | null} */
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

    /** @type {HTMLButtonElement | null} */
    const nextBtn = document.getElementById("nonProfile-next");
    /** @type {HTMLElement | null} */
    const nextStatus = document.getElementById("nonProfile-next-status");
    /** @type {HTMLInputElement | null} */
    const emailInput = document.getElementById("email");
    /** @type {HTMLInputElement | null} */
    const confirmInput = document.getElementById("confirmEmail");

    if (nextBtn) nextBtn.disabled = true;
    if (nextStatus)
      nextStatus.textContent = "Complete email validation to continue.";

    function updateNextButtonState() {
      /** @type {any} */
      const state = window.__emailValidationState;
      if (!state || !nextBtn || !emailInput || !confirmInput) return;

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
      if (nextStatus) nextStatus.textContent = message;
    }

    window.addEventListener("emailValidationUpdated", updateNextButtonState);
    if (emailInput) emailInput.addEventListener("input", updateNextButtonState);
    if (confirmInput)
      confirmInput.addEventListener("input", updateNextButtonState);

    let isSubmitting = false;

    nonProfileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (isSubmitting) return;
      isSubmitting = true;
      if (nextBtn) nextBtn.disabled = true;

      clearAllFieldStatuses(["firstName", "lastName", "email"]);

      /** @type {HTMLInputElement | null} */
      const firstName = document.getElementById("firstName");
      /** @type {HTMLInputElement | null} */
      const lastName = document.getElementById("lastName");
      /** @type {HTMLInputElement | null} */
      const suffix = document.getElementById("suffix");

      const payload = {
        firstName: firstName?.value.trim(),
        lastName: lastName?.value.trim(),
        suffix: suffix?.value.trim(),
        email: emailInput?.value.trim(),
      };

      /** @type {any} */
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

        if (!resp.ok) {
          if (contentType.includes("application/json")) {
            data = await resp.json().catch(() => ({}));
            if (data.requiresConfirmation && data.maskedName) {
              // Expired session — found an abandoned draft matching this email.
              // Show the identity confirmation modal rather than an error.
              isSubmitting = false;
              if (nextBtn) nextBtn.disabled = false;
              window.initConfirmIdentityModal?.(data.maskedName, csrfToken);
              return;
            }
            if (data.fieldErrors) {
              applyFieldErrors(data.fieldErrors);
              updateNextButtonState();
              isSubmitting = false;
              if (nextBtn) nextBtn.disabled = false;
              return;
            }
          }
          showFormToast("An error occurred. Please try again.");
          updateNextButtonState();
          isSubmitting = false;
          if (nextBtn) nextBtn.disabled = false;
          return;
        }

        if (contentType.includes("application/json")) {
          data = await resp.json().catch(() => ({}));
        }

        if (data.fieldErrors) {
          applyFieldErrors(data.fieldErrors);
          updateNextButtonState();
          isSubmitting = false;
          if (nextBtn) nextBtn.disabled = false;
          return;
        }

        window.location.href = "/volunteerIn?disable=true";
      } catch (err) {
        console.error("submit-nonProfileInfo error:", err);
        showFormToast("Server error. Please try again.");
        updateNextButtonState();
        isSubmitting = false;
        if (nextBtn) nextBtn.disabled = false;
      }
    });
  }

  /* ============================================================
   * =============== VOLUNTEER INFO SUBMIT (AJAX) ===============
   * ============================================================ */

  /**
   * Initialize volunteer info AJAX submit.
   * Handles: first/last/suffix/phone/SMSCapable + WhatsApp ID.
   * @param {string} csrfToken
   */
  function initVolunteerInfoForm(csrfToken) {
    /** @type {HTMLFormElement | null} */
    const volunteerInfoForm = document.querySelector(
      'form[action="/submit-volunteerInfo"]',
    );
    if (!volunteerInfoForm) return;

    if (!csrfToken) {
      console.warn(
        "CSRF token not found for /submit-volunteerInfo; AJAX disabled.",
      );
      return;
    }

    /** @type {HTMLButtonElement | null} */
    const submitBtn =
      document.querySelector(".sticky-action button[type='submit']") ||
      volunteerInfoForm.querySelector('button[type="submit"]');

    let isSubmitting = false;

    volunteerInfoForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (isSubmitting) return;
      isSubmitting = true;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.originalText = submitBtn.textContent?.trim() || "";
        submitBtn.textContent = "Please wait…";
      }

      clearAllFieldStatuses(["firstName", "lastName", "phone"]);

      /** @type {HTMLInputElement | null} */
      const phoneInput = document.getElementById("phone");
      /** @type {HTMLInputElement | null} */
      const firstName = document.getElementById("firstName");
      /** @type {HTMLInputElement | null} */
      const lastName = document.getElementById("lastName");
      /** @type {HTMLInputElement | null} */
      const suffix = document.getElementById("suffix");
      /** @type {HTMLInputElement | null} */
      const smsRadio = document.querySelector(
        'input[name="SMSCapable"]:checked',
      );
      /** @type {HTMLInputElement | null} */
      const whatsappInput = document.getElementById("whatsappid");

      const payload = {
        firstName: firstName?.value.trim(),
        lastName: lastName?.value.trim(),
        suffix: suffix?.value.trim(),
        phone: phoneInput ? phoneInput.value.trim() : "",
        SMSCapable: smsRadio?.value === "yes",
        whatsappid: whatsappInput?.value.trim() || "",
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
          } else {
            showFormToast(
              data.message || "An error occurred. Please try again.",
            );
          }
          isSubmitting = false;
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = submitBtn.dataset.originalText || "Submit";
          }
          return;
        }
      } catch (err) {
        console.error("submit-volunteerInfo error:", err);
        showFormToast("Server error. Please try again.");
        isSubmitting = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = submitBtn.dataset.originalText || "Submit";
        }
        return;
      }

      if (data.fieldErrors) {
        applyFieldErrors(data.fieldErrors);
        isSubmitting = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = submitBtn.dataset.originalText || "Submit";
        }
        return;
      }

      applySuccessState(["firstName", "lastName", "phone"]);
      window.location.href = "/personalInfo";
    });
  }

  /* ============================================================
   * =============== UPGRADE FLOW: START (FIND) ==================
   * ============================================================ */

  /**
   * Initialize the upgrade start form (enter phone/email).
   * @param {string} csrfToken
   */
  function initUpgradeStartForm(csrfToken) {
    /** @type {HTMLFormElement | null} */
    const form = document.querySelector('form[action="/upgrade/find"]');
    if (!form) return;

    /** @type {HTMLButtonElement | null} */
    const submitBtn = document.getElementById("upgradeStart-submit");
    /** @type {HTMLElement | null} */
    const submitStatus = document.getElementById("submitStatus");
    /** @type {HTMLInputElement | null} */
    const phoneInput = document.getElementById("phone");
    /** @type {HTMLInputElement | null} */
    const emailInput = document.getElementById("email");
    /** @type {HTMLInputElement | null} */
    const confirmInput = document.getElementById("confirmEmail");

    let isSubmitting = false;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (isSubmitting) return;
      isSubmitting = true;
      if (submitBtn) submitBtn.disabled = true;
      if (submitStatus) submitStatus.innerHTML = "";

      clearAllFieldStatuses(["phone", "email"]);

      const phoneVal = phoneInput?.value.trim() || "";
      const emailVal = emailInput?.value.trim() || "";
      const confirmVal = confirmInput?.value.trim() || "";

      if (!phoneVal && !emailVal) {
        showFormToast(
          "Please enter at least an email address or a phone number.",
          "warning",
        );
        isSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      /** @type {any} */
      let data = {};

      try {
        const resp = await fetch("/upgrade/find", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
          body: JSON.stringify({
            phone: phoneVal,
            email: emailVal,
            confirmEmail: confirmVal,
          }),
        });

        const contentType = resp.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          data = await resp.json().catch(() => ({}));
        }

        if (!resp.ok || data.success === false) {
          if (data.fieldErrors) {
            applyFieldErrors(data.fieldErrors);
          } else {
            showFormToast(
              data.message ||
                "We could not find any account with that email or phone.",
              "danger",
            );
          }
          isSubmitting = false;
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
        } else {
          showFormToast(
            "Unexpected response from server. Please try again.",
            "danger",
          );
          isSubmitting = false;
          if (submitBtn) submitBtn.disabled = false;
        }
      } catch (err) {
        console.error("upgradeStart submit error:", err);
        showFormToast("Server error. Please try again.", "danger");
        isSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  /* ============================================================
   * =============== UPGRADE FLOW: NAME CHECK ====================
   * ============================================================ */

  /**
   * Initialize upgrade name-confirmation form.
   * @param {string} csrfToken
   */
  function initUpgradeNameForm(csrfToken) {
    /** @type {HTMLFormElement | null} */
    const form = document.querySelector('form[action="/upgrade/name"]');
    if (!form) return;

    /** @type {HTMLButtonElement | null} */
    const submitBtn = document.getElementById("upgradeName-submit");
    /** @type {HTMLElement | null} */
    const submitStatus = document.getElementById("submitStatus");
    /** @type {HTMLInputElement | null} */
    const idInput = form.querySelector('input[name="id"]');
    /** @type {HTMLInputElement | null} */
    const firstName = document.getElementById("firstName");
    /** @type {HTMLInputElement | null} */
    const lastName = document.getElementById("lastName");
    /** @type {HTMLInputElement | null} */
    const suffix = document.getElementById("suffix");

    let isSubmitting = false;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (isSubmitting) return;
      isSubmitting = true;
      if (submitBtn) submitBtn.disabled = true;
      if (submitStatus) submitStatus.innerHTML = "";

      clearAllFieldStatuses(["firstName", "lastName"]);

      const payload = {
        id: idInput?.value,
        firstName: firstName?.value.trim(),
        lastName: lastName?.value.trim(),
        suffix: suffix?.value.trim(),
      };

      if (!payload.firstName || !payload.lastName) {
        showFormToast("First and last name are required.", "warning");
        isSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      /** @type {any} */
      let data = {};

      try {
        const resp = await fetch("/upgrade/name", {
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

        if (!resp.ok || data.success === false) {
          if (data.fieldErrors) {
            applyFieldErrors(data.fieldErrors);
          } else {
            showFormToast(
              data.message ||
                "The name entered does not match our records. Please try again.",
              "danger",
            );
          }
          isSubmitting = false;
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
        } else {
          showFormToast(
            "Unexpected response from server. Please try again.",
            "danger",
          );
          isSubmitting = false;
          if (submitBtn) submitBtn.disabled = false;
        }
      } catch (err) {
        console.error("upgradeName submit error:", err);
        showFormToast("Server error. Please try again.", "danger");
        isSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  /* ============================================================
   * =============== UPGRADE FLOW: SEND LINK =====================
   * ============================================================ */

  /**
   * Initialize upgrade send-link form (choose email vs phone).
   * @param {string} csrfToken
   */
  function initUpgradeSendForm(csrfToken) {
    /** @type {HTMLFormElement | null} */
    const form = document.querySelector('form[action="/upgrade/send"]');
    if (!form) return;

    /** @type {HTMLButtonElement | null} */
    const submitBtn = document.getElementById("upgradeSend-submit");
    /** @type {HTMLElement | null} */
    const submitStatus = document.getElementById("submitStatus");
    /** @type {HTMLInputElement | null} */
    const idInput = form.querySelector('input[name="id"]');
    /** @type {HTMLElement | null} */
    const methodStatus = document.getElementById("method-status");
    /** @type {HTMLElement | null} */
    const methodSection = document.getElementById("methodSection");

    function scrollToMethodSection() {
      if (!methodSection) return;
      methodSection.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    let isSubmitting = false;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (isSubmitting) return;
      isSubmitting = true;
      if (submitBtn) submitBtn.disabled = true;
      if (submitStatus) submitStatus.innerHTML = "";
      if (methodStatus) methodStatus.textContent = "";

      /** @type {HTMLInputElement | null} */
      const methodRadio = form.querySelector('input[name="method"]:checked');

      if (!methodRadio) {
        const msg =
          "Please choose how you would like to receive your reset link.";
        if (methodStatus) methodStatus.textContent = msg;
        showFormToast(msg, "warning");
        scrollToMethodSection();
        isSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      /** @type {any} */
      let data = {};

      try {
        const resp = await fetch("/upgrade/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
          body: JSON.stringify({
            id: idInput?.value,
            method: methodRadio.value,
          }),
        });

        const contentType = resp.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          data = await resp.json().catch(() => ({}));
        }

        if (!resp.ok || data.success === false) {
          if (data.fieldErrors) {
            applyFieldErrors(data.fieldErrors);
            if (data.fieldErrors.form && methodStatus) {
              methodStatus.textContent = data.fieldErrors.form;
            }
          } else {
            const msg =
              data.message || "Failed to send reset link. Please try again.";
            showFormToast(msg, "danger");
            if (methodStatus) methodStatus.textContent = msg;
          }
          scrollToMethodSection();
          isSubmitting = false;
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
        } else {
          window.location.href = "/upgrade/sent";
        }
      } catch (err) {
        console.error("upgradeSend submit error:", err);
        const msg = "Server error. Please try again.";
        showFormToast(msg, "danger");
        if (methodStatus) methodStatus.textContent = msg;
        scrollToMethodSection();
        isSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  /* ============================================================
   * =============== SUMMARY SUBMIT + MODAL LOGIC ===============
   * ============================================================ */

  /**
   * Initialize summary final-submit button and confirmation modal.
   */
  function initSummarySubmit() {
    /** @type {HTMLElement | null} */
    const root = document.getElementById("formSummaryRoot");
    if (!root) return;

    /** @type {HTMLButtonElement | null} */
    const submitSummaryBtn = document.getElementById("final-submit");
    if (!submitSummaryBtn) return;

    /** @type {HTMLElement | null} */
    const confirmModalElement = document.getElementById("confirmSaveModal");
    if (!confirmModalElement) return;
    // eslint-disable-next-line no-undef
    const confirmModal = new bootstrap.Modal(confirmModalElement);

    /** @type {HTMLButtonElement | null} */
    const yesSaveBtn = document.getElementById("yesSaveBtn");
    /** @type {HTMLFormElement | null} */
    const summaryForm = document.getElementById("summary-form");

    submitSummaryBtn.addEventListener("click", () => {
      if (
        typeof window.allSectionsNotEditing === "function" &&
        window.allSectionsNotEditing(root)
      ) {
        confirmModal.show();
      } else {
        if (typeof window.highlightEditingSections === "function") {
          window.highlightEditingSections(root);
        }
        showFormToast(
          "Please save all sections in the summary before submitting.",
          "warning",
        );
      }
    });

    if (yesSaveBtn && summaryForm) {
      yesSaveBtn.addEventListener("click", () => {
        confirmModal.hide();
        summaryForm.submit();
      });
    }
  }

  /* ============================================================
   * =============== NATIVE FORM SUBMIT GATE ====================
   * Covers all pages that do a standard form POST + redirect
   * (personalInfo, congregationInfo, spiritualInfo, notes).
   * Prevents double-submits from impatient clicks or the sticky
   * button's requestSubmit() firing twice.
   * ============================================================ */

  /**
   * Initialize a double-submit gate for native (non-AJAX) form pages.
   * Skips forms already handled by their own AJAX init functions.
   * @returns {void}
   */
  function initNativeFormGate() {
    /** @type {HTMLFormElement | null} */
    const form =
      document.getElementById("account-form") || document.querySelector("form");

    if (!form) return;

    // Skip forms that have dedicated AJAX handlers — they manage their own gates.
    const action = form.getAttribute("action") || "";
    const ajaxActions = [
      "/submit-emailPass",
      "/submit-nonProfileInfo",
      "/submit-volunteerInfo",
      "/upgrade/find",
      "/upgrade/name",
      "/upgrade/send",
    ];
    if (ajaxActions.includes(action)) return;

    /** @type {HTMLButtonElement | null} */
    const submitBtn =
      form.querySelector('button[type="submit"]') ||
      document.querySelector(".sticky-action button[type='submit']");

    if (!submitBtn) return;

    form.addEventListener("submit", (e) => {
      if (e.defaultPrevented) return;
      if (form.dataset.submitting === "true") {
        e.preventDefault();
        return;
      }
      form.dataset.submitting = "true";
      submitBtn.disabled = true;
      submitBtn.dataset.originalText = submitBtn.textContent?.trim() || "";
      submitBtn.textContent = "Please wait…";
    });

    // Reset gate on bfcache restore (browser back button).
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) {
        form.dataset.submitting = "false";
        submitBtn.disabled = false;
        if (submitBtn.dataset.originalText) {
          submitBtn.textContent = submitBtn.dataset.originalText;
        }
      }
    });
  }

  /* ============================================================
   * =============== ENTRY-PAGE ENHANCEMENTS ====================
   * ============================================================ */

  /**
   * Wire sticky submit button and auto-scroll focused fields on mobile.
   * If the sticky button is already inside a <form>, type="submit" fires
   * natively — no extra wiring needed. If it's outside, wire it to the
   * nearest available form via requestSubmit().
   */
  function initEntryPageEnhancements() {
    const body = document.body;
    const isEntryPage = body.classList.contains("entry-body");

    /** @type {HTMLButtonElement | null} */
    const stickyBtn = document.querySelector(
      ".sticky-action button[type='submit']",
    );

    if (stickyBtn) {
      /** @type {HTMLFormElement | null} */
      const containingForm = stickyBtn.closest("form");

      if (!containingForm) {
        // Button is external to any form — wire it to the first form on the page.
        /** @type {HTMLFormElement | null} */
        const targetForm =
          document.getElementById("account-form") ||
          document.querySelector("form");

        if (targetForm) {
          stickyBtn.addEventListener("click", (e) => {
            e.preventDefault();
            targetForm.requestSubmit();
          });
        }
      }
      // If containingForm is non-null, type="submit" handles it natively.
    }

    // Auto-scroll only for mobile entry pages.
    const isMobile = window.innerWidth <= 768;
    if (!isMobile || !isEntryPage) return;

    const SECTION_STATUS_MAP = {
      emailsSection: ["emailStatus", "confirmEmailStatus"],
      passwords: ["passwordStatus", "passwordsMatchedStatus"],
      congAssigned: ["congAssignedStatus"],
      congregationGroup: ["congregationStatus"],
      congregationEnter: [
        "congregationOtherCityStatus",
        "congregationOtherStateStatus",
        "congregationOtherLangStatus",
      ],
      extraAttend: ["extraAttendStatus"],
      genderSection: ["genderStatus"],
      dobSection: ["dobStatus"],
      staminaSection: ["staminaStatus"],
      privilegesSection: ["privilegesStatus"],
      namesSection: ["firstNameStatus", "lastNameStatus"],
      phoneSection: ["phoneStatus", "confirmPhoneStatus"],
      notesSection: ["notesStatus"],
    };

    function updateSectionStatuses(section) {
      const entryCard = section.closest(".entry-card");
      if (!entryCard) return;
      const statusContainer = entryCard.querySelector("#section-status");
      if (!statusContainer) return;
      const allStatusDivs = statusContainer.querySelectorAll(".status");
      allStatusDivs.forEach((div) => div.classList.remove("show-status"));
      const idsToShow = SECTION_STATUS_MAP[section.id];
      if (!idsToShow) return;
      idsToShow.forEach((id) => {
        const el = statusContainer.querySelector("#" + id);
        if (el) el.classList.add("show-status");
      });
    }

    function scrollFieldIntoView(el) {
      const section = el.closest(".scroll-section");
      if (!section) return;
      const cardBody = section.closest(".card-body");
      if (!cardBody) return;
      updateSectionStatuses(section);
      const bodyRect = cardBody.getBoundingClientRect();
      const sectionRect = section.getBoundingClientRect();
      cardBody.scrollBy({
        top: sectionRect.top - bodyRect.top - 16,
        left: 0,
        behavior: "smooth",
      });
    }

    document.addEventListener(
      "focusin",
      (event) => {
        const target = event.target;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLSelectElement ||
          target instanceof HTMLTextAreaElement
        ) {
          scrollFieldIntoView(target);
        }
      },
      { capture: false },
    );
  }

  /* ============================================================
   * =============== DOMContentLoaded ENTRYPOINT ================
   * ============================================================ */

  document.addEventListener("DOMContentLoaded", () => {
    /** @type {HTMLInputElement | null} */
    const csrfTokenInput = document.querySelector('input[name="_csrf"]');
    const csrfToken = csrfTokenInput?.value || "";

    if (typeof initEmailPasswordForm === "function") initEmailPasswordForm();
    if (typeof initCongregationForm === "function") initCongregationForm();
    if (typeof initNonProfileForm === "function") initNonProfileForm(csrfToken);
    if (typeof initVolunteerInfoForm === "function")
      initVolunteerInfoForm(csrfToken);
    if (typeof initSummarySubmit === "function") initSummarySubmit();
    if (typeof initUpgradeStartForm === "function")
      initUpgradeStartForm(csrfToken);
    if (typeof initUpgradeNameForm === "function")
      initUpgradeNameForm(csrfToken);
    if (typeof initUpgradeSendForm === "function")
      initUpgradeSendForm(csrfToken);

    // Must run after AJAX inits — skips forms they already handle.
    initNativeFormGate();
    initEntryPageEnhancements();
  });
})();
