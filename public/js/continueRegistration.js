// public/js/continueRegistration.js
// -----------------------------------------------------------------------------
// Client-side validation for continueRegistration.ejs
// - Optional name validation (when requireName = true)
// - Phone + confirmPhone validation (when requirePhoneConfirm = true)
// - Basic non-empty check for single phone entry
// - Continue button gating based on client-side validity
// -----------------------------------------------------------------------------
// NOTE: All server-side security checks (name/phone match vs DB,
//       3-strikes lockout, "compromised" status) STILL HAPPEN ON THE SERVER.
//       This script only improves UX and reduces obvious mistakes.
// -----------------------------------------------------------------------------

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", initContinueRegistration);

  function initContinueRegistration() {
    /** @type {HTMLFormElement | null} */
    const form = document.querySelector(
      "form[action='/continue-registration']",
    );
    if (!form) return;

    /** @type {HTMLButtonElement | null} */
    const submitBtn = document.querySelector("#continueReg-submit");
    if (!submitBtn) return;

    // Hidden flags from the server
    const requireNameFlag = form.querySelector("input[name='requireName']");
    const requirePhoneConfirmFlag = form.querySelector(
      "input[name='requirePhoneConfirm']",
    );

    const requireName = (requireNameFlag?.value || "").toLowerCase() === "true";
    const requirePhoneConfirm =
      (requirePhoneConfirmFlag?.value || "").toLowerCase() === "true";

    // Inputs
    /** @type {HTMLInputElement | null} */
    const firstNameInput = document.querySelector("#firstName");
    /** @type {HTMLInputElement | null} */
    const lastNameInput = document.querySelector("#lastName");
    /** @type {HTMLInputElement | null} */
    const suffixInput = document.querySelector("#suffix"); // optional

    /** @type {HTMLInputElement | null} */
    const phoneInput = document.querySelector("#phone");
    /** @type {HTMLInputElement | null} */
    const confirmPhoneInput = document.querySelector("#confirmPhone");

    /** @type {HTMLElement | null} */
    const nameStatus = document.querySelector("#nameStatus");
    /** @type {HTMLElement | null} */
    const phoneStatus = document.querySelector("#phoneStatus");

    // If key phone elements are missing, do nothing (defensive)
    if (!phoneInput || !phoneStatus) return;

    if (nameStatus) {
      nameStatus.setAttribute("role", "status");
      nameStatus.setAttribute("aria-live", "polite");
    }
    phoneStatus.setAttribute("role", "status");
    phoneStatus.setAttribute("aria-live", "polite");

    // -------------------------------------------------------------------------
    // Simple state & helper functions
    // -------------------------------------------------------------------------
    function setStatus(el, type, msg) {
      if (!el) return;
      el.classList.remove("loading", "success", "error");
      el.innerHTML = "";
      if (!type) return;

      el.classList.add(type);
      if (type === "loading") {
        el.innerHTML =
          '<span class="spinner-border spinner-border-sm text-secondary" role="status" aria-hidden="true"></span> ' +
          (msg || "Checking...");
      } else if (type === "error") {
        el.innerHTML =
          '<div class="alert alert-danger alert-dismissible fade show" role="alert">' +
          "❌ " +
          (msg || "There is a problem with your entry.") +
          '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>' +
          "</div>";
      } else if (type === "success") {
        el.textContent = msg || "✅ OK";
      }
    }

    function normalizePhone(val) {
      return (val || "").replace(/[^\d]/g, "");
    }

    // -------------------------------------------------------------------------
    // Name validation (only when requireName = true)
    // -------------------------------------------------------------------------
    function validateName() {
      if (!requireName) {
        // Name not required in this scenario; always treat as valid
        return true;
      }
      if (!nameStatus || !firstNameInput || !lastNameInput) {
        return true;
      }

      const first = firstNameInput.value.trim();
      const last = lastNameInput.value.trim();

      if (!first || !last) {
        setStatus(
          nameStatus,
          "error",
          "Please enter both your first and last name.",
        );
        return false;
      }

      // We don't compare to DB here; that's server-side only.
      setStatus(nameStatus, "success", "✅ Name looks complete.");
      return true;
    }

    // -------------------------------------------------------------------------
    // Phone validation
    // - If requirePhoneConfirm: enforce phone and confirmPhone match
    // - Else: just check non-empty (matching vs DB is server-side)
    // -------------------------------------------------------------------------
    function validatePhone() {
      const rawPhone = phoneInput.value;
      const normalized = normalizePhone(rawPhone);

      if (!normalized) {
        setStatus(phoneStatus, "error", "Please enter your phone number.");
        return false;
      }

      if (requirePhoneConfirm) {
        if (!confirmPhoneInput) {
          return false;
        }
        const rawConfirm = confirmPhoneInput.value;
        const normalizedConfirm = normalizePhone(rawConfirm);

        if (!normalizedConfirm) {
          setStatus(phoneStatus, "error", "Please confirm your phone number.");
          return false;
        }

        if (normalized !== normalizedConfirm) {
          setStatus(
            phoneStatus,
            "error",
            "Phone numbers do not match. Please check and try again.",
          );
          return false;
        }

        // Client-side match; server still does additional validation and saves.
        setStatus(phoneStatus, "success", "✅ Phone numbers match.");
        return true;
      } else {
        // Single phone entry case: just ensure non-empty here
        // The server will compare against the stored phone and apply 3-strikes.
        setStatus(phoneStatus, "success", "✅ Phone number entered.");
        return true;
      }
    }

    // -------------------------------------------------------------------------
    // Combined validator to gate submit button
    // -------------------------------------------------------------------------
    function evaluateFormValidity() {
      const nameOk = validateName();
      const phoneOk = validatePhone();

      // If either side fails, disable submit
      submitBtn.disabled = !(nameOk && phoneOk);
    }

    // Attach listeners
    if (requireName && firstNameInput && lastNameInput) {
      firstNameInput.addEventListener("input", evaluateFormValidity);
      lastNameInput.addEventListener("input", evaluateFormValidity);
      if (suffixInput) {
        suffixInput.addEventListener("input", evaluateFormValidity);
      }
    }

    phoneInput.addEventListener("input", evaluateFormValidity);
    if (requirePhoneConfirm && confirmPhoneInput) {
      confirmPhoneInput.addEventListener("input", evaluateFormValidity);
    }

    // Initial state: ensure button is disabled until we have valid input
    submitBtn.disabled = true;

    // Defensive: on submit, run validation one more time and prevent submit if invalid
    form.addEventListener("submit", (e) => {
      evaluateFormValidity();
      if (submitBtn.disabled) {
        e.preventDefault();
      }
    });
  }
})();
