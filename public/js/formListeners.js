// public/js/formListeners.js
// -----------------------------------------------------------------------------
// Global form listeners for the registration flow and My Account:
// - Shared field feedback helpers (valid/invalid states)
// - Global form toast messaging
// - Server-side field error application
// - Email/password step: email uniqueness + domain rules
// - Congregation step: assigned vs visiting branch logic
// - Non-profile info submit (AJAX)
// - Volunteer info submit (AJAX)
// - Summary submit (requires all sections saved, then shows modal)
// - My Account: section save confirmation + email/phone validation gating
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
  <div class="alert alert-${type} alert-dismissible fade show mt-3" role="alert">
    <i class="bi bi-exclamation-triangle-fill me-2"></i>
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
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

    /** @type {string[]} */
    const lines = [];
    if (fieldErrors.phone) lines.push("Phone number already exists.");
    if (fieldErrors.name)
      lines.push("Name already exists; try adding a suffix.");

    if (fieldErrors.form) {
      lines.length = 0;
      lines.push(fieldErrors.form);
    }

    if (fieldErrors.form) {
      showFormToast(fieldErrors.form, "danger");
    }
  }

  /* ============================================================
   * =============== DOMContentLoaded ENTRYPOINT ================
   * ============================================================ */

  document.addEventListener("DOMContentLoaded", () => {
    /** @type {HTMLInputElement | null} */
    const csrfTokenInput = document.querySelector('input[name="_csrf"]');
    const csrfToken = csrfTokenInput?.value || "";

    initEmailPasswordForm();
    initCongregationForm();
    initNonProfileForm(csrfToken);
    initVolunteerInfoForm(csrfToken);
    initSummarySubmit();
  });

  /* ============================================================
   * =============== EMAIL / PASSWORD FORM LOGIC ================
   * ============================================================ */

  function initEmailPasswordForm() {
    /**
     * NOTE: updated from legacy /submit-namePass to /submit-emailPass
     * so this now targets the emailPass.ejs form.
     */
    /** @type {HTMLFormElement | null} */
    const emailPassForm = document.querySelector(
      'form[action="/submit-emailPass"]',
    );
    /** @type {HTMLInputElement | null} */
    const emailInput = document.querySelector("#email");
    /** @type {HTMLInputElement | null} */
    const confirmInput = document.querySelector("#confirmEmail");
    /** @type {HTMLElement | null} */
    const emailStatus = document.querySelector("#emailStatus");
    /** @type {HTMLInputElement | null} */
    const passwordInput = document.querySelector("#password");
    /** @type {HTMLInputElement | null} */
    const confirmPasswordInput = document.querySelector("#confirmPassword");

    if (!emailPassForm || !emailInput || !confirmInput || !emailStatus) return;

    /** @type {HTMLButtonElement | null} */
    let submitBtn =
      emailPassForm.querySelector('button[type="submit"]') ||
      emailPassForm.querySelector("button.btn.btn-primary");

    /** @type {boolean} */
    let emailDeliverable = false;
    /** @type {boolean} */
    let emailsMatch = false;
    /** @type {boolean|null} */
    let emailTaken = null;
    /** @type {string} */
    let lastCheckedEmail = "";
    /** @type {number|undefined} */
    let debounceId;
    /** @type {AbortController|null} */
    let existsAbortController = null;

    function clearEmailStatus() {
      emailStatus.classList.remove("loading", "success", "error");
      emailStatus.innerHTML = "";
    }

    /**
     * @param {string} [msg="Checking..."]
     */
    function setEmailLoading(msg = "Checking...") {
      clearEmailStatus();
      emailStatus.classList.add("loading");
      emailStatus.textContent = msg;
    }

    /**
     * @param {string} [msg="OK"]
     */
    function setEmailSuccess(msg = "OK") {
      clearEmailStatus();
      emailStatus.classList.add("success");
      emailStatus.textContent = msg;
    }

    /**
     * @param {string} [msg="Error."]
     */
    function setEmailError(msg = "Error.") {
      clearEmailStatus();
      emailStatus.classList.add("error");
      emailStatus.textContent = msg;
    }

    /**
     * Check if an email already exists in the system.
     * @param {string} email
     * @returns {Promise<boolean|null>} true = taken, false = not taken, null = unknown
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
        /** @type {{exists?:boolean}} */
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
     * @param {string} email
     * @returns {boolean}
     */
    function isEmailBlocked(email) {
      return String(email).trim().toLowerCase().endsWith("@jwpub.org");
    }

    /**
     * @param {string} a
     * @param {string} b
     * @returns {boolean}
     */
    function emailsEqual(a, b) {
      return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
    }

    function reevaluateEmailGates() {
      const email = emailInput.value.trim();
      const confirm = confirmInput.value.trim();

      if (isEmailBlocked(email)) {
        emailDeliverable = false;
        emailsMatch = false;
        emailTaken = null;
        setEmailError("Emails from @jwpub.org are not allowed.");
        return;
      }

      emailsMatch = !!email && !!confirm && emailsEqual(email, confirm);

      const deliverableAttr = emailStatus.dataset?.deliverable;
      if (deliverableAttr === "true") {
        emailDeliverable = true;
      } else if (deliverableAttr === "false") {
        emailDeliverable = false;
      } else {
        emailDeliverable = /\S+@\S+\.\S+/.test(email);
      }

      if (emailDeliverable && emailsMatch) {
        if (debounceId) clearTimeout(debounceId);
        debounceId = window.setTimeout(() => void checkEmailExists(email), 300);
      }
    }

    function maybePreloadDuringPasswordTyping() {
      const email = emailInput.value.trim();
      if (emailDeliverable && emailsMatch && emailTaken === null) {
        void checkEmailExists(email);
      }
    }

    emailInput.addEventListener("input", reevaluateEmailGates);
    confirmInput.addEventListener("input", reevaluateEmailGates);
    if (passwordInput)
      passwordInput.addEventListener("input", maybePreloadDuringPasswordTyping);
    if (confirmPasswordInput)
      confirmPasswordInput.addEventListener(
        "input",
        maybePreloadDuringPasswordTyping,
      );

    emailPassForm.addEventListener("submit", async (e) => {
      const email = emailInput.value.trim();
      const confirm = confirmInput.value.trim();

      if (isEmailBlocked(email)) {
        e.preventDefault();
        setEmailError("Emails from @jwpub.org are not allowed.");
        return;
      }

      emailsMatch = emailsEqual(email, confirm);
      if (!(emailDeliverable && emailsMatch)) {
        e.preventDefault();
        setEmailError(
          "Please validate your email and ensure both entries match.",
        );
        return;
      }

      if (emailTaken === null || lastCheckedEmail !== email.toLowerCase()) {
        e.preventDefault();
        setEmailLoading("Checking for existing account...");
        const exists = await checkEmailExists(email);
        if (exists === null) {
          setEmailError("Could not verify email. Try again.");
          return;
        }
        if (!exists) {
          emailTaken = false;
          setEmailSuccess("Email OK. Submitting...");
          emailPassForm.submit();
          return;
        }
      }

      if (emailTaken) {
        e.preventDefault();
        setEmailError("This email is already registered.");
        return;
      }

      setEmailSuccess("Email OK. Submitting...");
    });
  }

  /* ============================================================
   * =============== CONGREGATION FORM LOGIC ====================
   * ============================================================ */

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
   * Initialize non-profile AJAX submit.
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

    window.addEventListener("emailValidationUpdated", updateNextButtonState);

    if (emailInput) emailInput.addEventListener("input", updateNextButtonState);
    if (confirmInput)
      confirmInput.addEventListener("input", updateNextButtonState);

    nonProfileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
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
   * Initialize volunteer info AJAX submit.
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

    volunteerInfoForm.addEventListener("submit", async (e) => {
      e.preventDefault();

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

      const payload = {
        firstName: firstName?.value.trim(),
        lastName: lastName?.value.trim(),
        suffix: suffix?.value.trim(),
        phone: phoneInput ? phoneInput.value.trim() : "",
        SMSCapable: smsRadio?.value === "yes",
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

      if (data.fieldErrors) {
        applyFieldErrors(data.fieldErrors);
        return;
      }

      applySuccessState(["firstName", "lastName", "phone"]);
      window.location.href = "/personalInfo";
    });
  }

  /* ============================================================
   * =============== SUMMARY SUBMIT + MODAL LOGIC ===============
   * ============================================================ */

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

  // ---------------------------------------------------------------------------
  // ENTRY-PAGE ENHANCEMENTS:
  //  - Sticky submit outside <form> -> submit #account-form
  //  - Auto-scroll focused sections into view on mobile entry pages
  // ---------------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    const body = document.body;
    const isEntryPage = body.classList.contains("entry-body");

    // 1) Sticky submit: button in .sticky-action submits #account-form
    const externalsubmitBtn = document.querySelector(
      ".sticky-action button[type='submit']",
    );
    const form = document.getElementById("account-form");

    if (externalsubmitBtn && form) {
      externalsubmitBtn.addEventListener("click", (e) => {
        e.preventDefault();
        form.requestSubmit(); // triggers validation + submit handlers
      });
    }

    // 2) Auto-scroll only for mobile entry pages
    const isMobile = window.innerWidth <= 768;
    if (!isMobile || !isEntryPage) return;

    const SECTION_STATUS_MAP = {
      // emailPass sections:
      emailsSection: ["emailStatus", "confirmEmailStatus"],
      passwords: ["passwordStatus", "passwordsMatchedStatus"],

      //congregationInfo sections:
      congAssigned: ["congAssignedStatus"],
      congregationGroup: ["congregationStatus"],
      congregationEnter: [
        "congregationOtherCityStatus",
        "congregationOtherStateStatus",
        "congregationOtherLangStatus",
      ],
      extraAttend: ["extraAttendStatus"],

      //personalInfo sections:
      genderSection: ["genderStatus"],
      dobSection: ["dobStatus"],
      staminaSection: ["staminaStatus"],

      //spiritualInfo sections:
      privilegesSection: ["privilegesStatus"],

      //nonProfileInfo and volunteerIn sections:
      namesSection: ["firstNameStatus", "lastNameStatus"],
      emailsSection: ["emailStatus", "confirmEmailStatus"],
      phoneSection: ["phoneStatus", "confirmPhoneStatus"],

      //notes sections:
      notesSection: ["notesStatus"]
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
      const offset = 16;

      const delta = sectionRect.top - bodyRect.top - offset;

      cardBody.scrollBy({
        top: delta,
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
  });
})();
