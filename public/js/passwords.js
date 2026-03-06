// public/js/passwords.js
// -----------------------------------------------------------------------------
// Password match validation for the email+password step:
// - Real-time debounced comparison of #password and #confirm-password
// - Accessible status output in #passwords-matched-status
// - Submit button gating (disabled until passwords match)
// - Show/hide password toggle
// - Final submit guard (defensive check)
// -----------------------------------------------------------------------------

(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    initPasswordValidation();
  });

  /**
   * Initializes the password matching logic.
   * If key elements are missing (e.g., running on another page),
   * this becomes a safe no-op.
   */
  function initPasswordValidation() {
    // Elements
    const form = /** @type {HTMLFormElement | null} */ (
      document.querySelector('form[action="/submit-emailPass"]') ||
        document.querySelector("#account-form") ||
        document.querySelector("form")
    );
    const passwordInput = /** @type {HTMLInputElement | null} */ (
      document.querySelector("#password")
    );
    const confirmPasswordInput = /** @type {HTMLInputElement | null} */ (
      document.querySelector("#confirm-password")
    );
    const statusDiv = /** @type {HTMLElement | null} */ (
      document.querySelector("#passwords-matched-status")
    );
    const togglePasswordBtn = /** @type {HTMLElement | null} */ (
      document.querySelector("#togglePassword")
    );

    // Try to find the submit button, fallback to primary button
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
     * Status UI helpers (consistent with email-validation.js)
     * --------------------------------------------------------------------- */

    /**
     * Clears loading/success/error classes and wipes status content.
     */
    function clearStates() {
      statusDiv.classList.remove("loading", "success", "error");
      statusDiv.innerHTML = "";
    }

    /**
     * Shows a "loading" status while user is typing.
     */
    function setStatusLoading() {
      clearStates();
      statusDiv.classList.add("loading");
      statusDiv.innerHTML =
        '<span class="spinner-border spinner-border-sm text-secondary" role="status" aria-hidden="true"></span> Checking...';
    }

    /**
     * Shows a success state for matching passwords.
     *
     * @param {string} [msg="✅ Passwords match"] - Success message
     */
    function setStatusSuccess(msg = "✅ Passwords match") {
      clearStates();
      statusDiv.classList.add("success");
      statusDiv.textContent = msg;
    }

    /**
     * Shows an error for mismatched passwords.
     *
     * @param {string} [msg="Passwords do not match."] - Error text
     */
    function setStatusError(msg = "Passwords do not match.") {
      clearStates();
      statusDiv.classList.add("error");
      statusDiv.innerHTML = `
        <div class="alert alert-danger alert-dismissible fade show" role="alert">
          ❌ ${msg}
          <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>`;
    }

    /**
     * Enables or disables the submit button if present.
     *
     * @param {boolean} enabled
     */
    function setSubmitEnabled(enabled) {
      if (submitBtn) submitBtn.disabled = !enabled;
    }

    /* ------------------------------------------------------------------------
     * Core logic: comparing the two password fields
     * --------------------------------------------------------------------- */

    /**
     * Checks if password and confirm-password match.
     * - Updates UI status
     * - Enables submit only on match
     */
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

    /**
     * Debounced wrapper for comparePasswords().
     * Shows a "Checking..." spinner while waiting for user to pause typing.
     */
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
     * Show/hide password toggle
     * --------------------------------------------------------------------- */

    if (togglePasswordBtn) {
      togglePasswordBtn.addEventListener("click", () => {
        const isText = passwordInput.getAttribute("type") === "text";
        const newType = isText ? "password" : "text";
        passwordInput.setAttribute("type", newType);
        confirmPasswordInput.setAttribute("type", newType);

        // Update icon classes (Font Awesome expected)
        const icon = togglePasswordBtn.querySelector("i");
        if (icon) {
          icon.classList.toggle("fa-eye", isText);
          icon.classList.toggle("fa-eye-slash", !isText);
        }
      });
    }

    /* ------------------------------------------------------------------------
     * Submit guard: defensive check in case JS fired late or was bypassed
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
