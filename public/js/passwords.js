// public/js/passwords.js
// -----------------------------------------------------------------------------
// Password validation + show/hide toggle
// - Full mode (emailPass/resetPassword):
//   * password + confirmPasswordInput + passwordsMatchedStatus
//   * realtime "passwords match" check + submit gating
//   * show/hide both fields
// - Login mode:
//   * only password + togglePasswordBtn present
//   * just show/hide password (no match validation)
// -----------------------------------------------------------------------------
(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", initPasswordValidation);

  function initPasswordValidation() {
    /** @type {HTMLFormElement | null} */
    const form =
      document.querySelector('form[action="/submit-emailPass"]') ||
      document.querySelector("#account-form") ||
      document.querySelector("form");

    /** @type {HTMLInputElement | null} */
    const passwordInput = document.querySelector("#password");
    /** @type {HTMLInputElement | null} */
    const confirmPasswordInput = document.querySelector(
      "#confirmPasswordInput",
    );
    /** @type {HTMLElement | null} */
    const statusDiv =
      document.querySelector("#passwordsMatchedStatus") ||
      document.querySelector("#passwords-matched-status"); // login.ejs uses kebab-case
    /** @type {HTMLElement | null} */
    const togglePasswordBtn = document.querySelector("#togglePassword");

    // If there isn't even a password input, nothing to do.
    if (!passwordInput) return;

    // -------------------------------------------------------------------------
    // Show/hide password toggle: always attach if the button exists
    // (works on login, emailPass, resetPassword)
    // -------------------------------------------------------------------------
    if (togglePasswordBtn) {
      togglePasswordBtn.addEventListener("click", () => {
        const isText = passwordInput.getAttribute("type") === "text";
        const newType = isText ? "password" : "text";

        passwordInput.setAttribute("type", newType);

        // If there is a confirm field on this page, keep it in sync
        if (confirmPasswordInput) {
          confirmPasswordInput.setAttribute("type", newType);
        }

        // Optional: toggle the eye / eye-slash icon
        const icon = togglePasswordBtn.querySelector("i");
        if (icon) {
          icon.classList.toggle("fa-eye");
          icon.classList.toggle("fa-eye-slash");
        }
      });
    }

    // -------------------------------------------------------------------------
    // If there's no confirm field OR no status div, skip match validation.
    // This is the case on the login page.
    // -------------------------------------------------------------------------
    if (!confirmPasswordInput || !statusDiv) {
      return;
    }

    // From here on, we're in "full validation" mode (emailPass/resetPassword).

    /** @type {HTMLButtonElement | null} */
    let submitBtn =
      form?.querySelector('button[type="submit"]') ||
      form?.querySelector("button.btn.btn-primary") ||
      null;

    // Screen-reader accessibility
    statusDiv.setAttribute("role", "status");
    statusDiv.setAttribute("aria-live", "polite");

    // -----------------------------------------------------------------------
    // Status UI helpers
    // -----------------------------------------------------------------------
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

    function setStatusSuccess(msg = "✅ Passwords match") {
      clearStates();
      statusDiv.classList.add("success");
      statusDiv.textContent = msg;
    }

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

    // -----------------------------------------------------------------------
    // Core logic: comparing the two password fields
    // -----------------------------------------------------------------------
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
  }
})();
