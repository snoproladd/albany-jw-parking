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
// - Summary submit (requires all sections saved, then shows modal)
// -----------------------------------------------------------------------------

(() => {
  "use strict";

  /* ============================================================
   * =============== SHARED FIELD FEEDBACK HELPERS ==============
   * ============================================================ */

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

  function clearAllFieldStatuses(fieldIds) {
    fieldIds.forEach(clearFieldStatus);
  }

  function applySuccessState(fieldIds) {
    fieldIds.forEach((id) => setFieldSuccess(id));
  }

  /* ============================================================
   * =============== GLOBAL FORM TOAST MESSAGE ==================
   * ============================================================ */

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

    const lines = [];

    if (fieldErrors.phone) {
      lines.push("Phone number already exists.");
    }

    if (fieldErrors.name) {
      lines.push(
        "Name already exists; if this is correct enter a suffix to differentiate.",
      );
    }

    if (fieldErrors.form) {
      lines.length = 0;
      lines.push(fieldErrors.form);
    }

    if (lines.length > 0) {
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
    initSummarySubmit();
  });

  /* ============================================================
   * =============== EMAIL / PASSWORD FORM LOGIC ================
   * ============================================================ */

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
      return;
    }

    /** @type {HTMLButtonElement | null} */
    let submitBtn =
      emailPassForm.querySelector('button[type="submit"]') ||
      emailPassForm.querySelector("button.btn.btn-primary");

    let emailDeliverable = false;
    let emailsMatch = false;
    /** @type {boolean | null} */
    let emailTaken = null;
    let lastCheckedEmail = "";
    /** @type {number | undefined} */
    let debounceId;
    /** @type {AbortController | null} */
    let existsAbortController = null;

    function clearEmailStatus() {
      emailStatus.classList.remove("loading", "success", "error");
      emailStatus.innerHTML = "";
    }

    function setEmailLoading(msg = "Checking...") {
      clearEmailStatus();
      emailStatus.classList.add("loading");
      emailStatus.textContent = msg;
    }

    function setEmailSuccess(msg = "OK") {
      clearEmailStatus();
      emailStatus.classList.add("success");
      emailStatus.textContent = msg;
    }

    function setEmailError(msg = "Error.") {
      clearEmailStatus();
      emailStatus.classList.add("error");
      emailStatus.textContent = msg;
    }

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

    function isEmailBlockedByDomain(email) {
      return String(email).trim().toLowerCase().endsWith("@jwpub.org");
    }

    function emailsEqualInsensitive(a, b) {
      return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
    }

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
        emailDeliverable = /\S+@\S+\.\S+/.test(email);
      }

      if (emailDeliverable && emailsMatch) {
        if (debounceId) clearTimeout(debounceId);
        debounceId = window.setTimeout(() => {
          void checkEmailExists(email);
        }, 300);
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

    if (passwordInput) {
      passwordInput.addEventListener("input", maybePreloadDuringPasswordTyping);
    }
    if (confirmPasswordInput) {
      confirmPasswordInput.addEventListener(
        "input",
        maybePreloadDuringPasswordTyping,
      );
    }

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

    function updateCongVisibility() {
      const selected = /** @type {HTMLInputElement | null} */ (
        congForm.querySelector('input[name="congAssigned"]:checked')
      );
      if (!selected) return;

      if (selected.value === "yes") {
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

    updateCongVisibility();
  }

  /* ============================================================
   * =============== NON-PROFILE SUBMIT (AJAX) ==================
   * ============================================================ */

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

    window.addEventListener("emailValidationUpdated", updateNextButtonState);

    emailInput?.addEventListener("input", updateNextButtonState);
    confirmInput?.addEventListener("input", updateNextButtonState);

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
  const root = document.getElementById("formSummaryRoot");
  if (!root) return;

  // 👈 Correct button that exists in your EJS
  const submitSummaryBtn = document.getElementById("final-submit");
  if (!submitSummaryBtn) return;

  const confirmModalElement = document.getElementById("confirmSaveModal");
  if (!confirmModalElement) return;
  const confirmModal = new bootstrap.Modal(confirmModalElement);

  const yesSaveBtn = document.getElementById("yesSaveBtn");
  const summaryForm = document.getElementById("summary-form");

  submitSummaryBtn.addEventListener("click", () => {
    // Functions you exposed from formSummary.js
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
        "warning"
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
})();