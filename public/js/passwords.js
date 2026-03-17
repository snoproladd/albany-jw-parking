// public/js/passwords.js
// -----------------------------------------------------------------------------
// Password match validation for the email+password step:
// - Real-time debounced comparison of #password and #confirmPasswordInput
// - Accessible status output in #passwords-matched-status
// - Submit button gating (disabled until passwords match)
// - Show/hide password toggle (main password only)
// - Final submit guard (defensive check)
// -----------------------------------------------------------------------------

(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    initPasswordValidation();
  });

  function initPasswordValidation() {
    // Elements
    /** @type {HTMLFormElement | null} */
    const form =
      document.querySelector('form[action="/submit-emailPass"]') ||
      document.querySelector("#account-form") ||
      document.querySelector("form");

    /** @type {HTMLInputElement | null} */
    const passwordInput = document.querySelector("#password");
    /** @type {HTMLInputElement | null} */
    const confirmPasswordInput = document.querySelector("#confirmPasswordInput");
    /** @type {HTMLElement | null} */
    const statusDiv = document.querySelector("#passwords-matched-status");
    /** @type {HTMLElement | null} */
    const togglePasswordBtn = document.querySelector("#togglePassword");

    // Try to find the submit button, fallback to primary button
    /** @type {HTMLButtonElement | null} */
    let submitBtn =
      form?.querySelector('button[type="submit"]') ||
      form?.querySelector("button.btn.btn-primary") ||
      null;

    // If the three required elements are missing, abort safely
    if (!passwordInput || !confirmPasswordInput || !statusDiv) return;

    // Screen-reader accessibility
    statusDiv.setAttribute("role", "status");
    statusDiv.setAttribute("aria-live", "polite");

    /* ------------------------------------------------------------------------
     * Status UI helpers
     * --------------------------------------------------------------------- */

    function clearStates() {
      statusDiv.classList.remove("loading", "success", "error");
      statusDiv.innerHTML = "";
    }

    function setStatusLoading() {
      clearStates();
      statusDiv.classList.add("loading");
      statusDiv.innerHTML = `
        <span class="spinner-border spinner-border-sm text-secondary"
              role="status" aria-hidden="true"></span>
        Checking...`;
    }

    /**
     * @param {string} [msg="✅ Passwords match"]
     */
    function setStatusSuccess(msg = "✅ Passwords match") {
      clearStates();
      statusDiv.classList.add("success");
      statusDiv.textContent = msg;
    }

    /**
     * @param {string} [msg="Passwords do not match."]
     */
    function setStatusError(msg = "Passwords do not match.") {
      clearStates();
      statusDiv.classList.add("error");
      statusDiv.innerHTML = `
        <div class="alert alert-danger alert-dismissible fade show" role="alert">
          ❌ ${msg}
          <button type="button" class="btn-close" data-bs-dismiss="alert"
                  aria-label="Close"></button>
        </div>`;
    }

    function setSubmitEnabled(enabled) {
      if (submitBtn) submitBtn.disabled = !enabled;
    }

    /* ------------------------------------------------------------------------
     * Core logic: comparing the two password fields
     * --------------------------------------------------------------------- */

    function comparePasswords() {
      const pwd = passwordInput.value.trim();
      const conf = confirmPasswordInput.value.trim();

      // No input: reset state, disable submit
      if (pwd === "" && conf === "") {
        clearStates();
        setSubmitEnabled(false);
        return;
      }

      // Confirm empty but password typed: show nothing yet
      if (pwd !== "" && conf === "") {
        clearStates();
        setSubmitEnabled(false);
        return;
      }

      // Matching passwords
      if (pwd === conf) {
        setStatusSuccess("✅ Passwords match");
        setSubmitEnabled(true);
      } else {
        setStatusError("Passwords do not match.");
        setSubmitEnabled(false);
      }
    }

    /** @type {number | undefined} */
    let debounceId;

    function debouncedCompare() {
      clearTimeout(debounceId);
      setStatusLoading();
      debounceId = window.setTimeout(() => {
        comparePasswords();
      }, 500);
    }

    // Attach realtime listeners to both fields
    passwordInput.addEventListener("input", debouncedCompare);
    confirmPasswordInput.addEventListener("input", debouncedCompare);

    // Disable submit initially until match occurs
    setSubmitEnabled(false);

    /* ------------------------------------------------------------------------
     * Show/hide password toggle (main field only)
     * --------------------------------------------------------------------- */

    if (togglePasswordBtn) {
      togglePasswordBtn.addEventListener("click", () => {
        const isText = passwordInput.getAttribute("type") === "text";
        const newType = isText ? "password" : "text";
        passwordInput.setAttribute("type", newType);

        // Update icon classes (Font Awesome)
        const icon = togglePasswordBtn.querySelector("i");
        if (icon) {
          icon.classList.toggle("fa-eye", isText);
          icon.classList.toggle("fa-eye-slash", !isText);
        }
      });
    }

    /* ------------------------------------------------------------------------
     * Submit guard: defensive check
     * --------------------------------------------------------------------- */
    if (form) {
      form.addEventListener("submit", (e) => {
        const pwd = passwordInput.value.trim();
        const conf = confirmPasswordInput.value.trim();

        if (pwd === "" || conf === "") {
          e.preventDefault();
          setStatusError("Please complete both password fields.");
          setSubmitEnabled(false);
          return;
        }

        if (pwd !== conf) {
          e.preventDefault();
          setStatusError("Passwords do not match.");
          setSubmitEnabled(false);
          return;
        }
        // If matching, allow native submit
      });
    }
  }
})();
