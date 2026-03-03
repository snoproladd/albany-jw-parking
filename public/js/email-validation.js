// public/js/email-validation.js
document.addEventListener("DOMContentLoaded", () => {
  // Elements for email/pass page
  const form =
    document.querySelector("#account-form") ||
    document.querySelector("form");
  const emailInput   = document.querySelector("#email");
  const emailStatus  = document.querySelector("#email-status");
  const confirmInput  = document.querySelector("#confirm-email");
  const confirmStatus = document.querySelector("#confirm-email-status");
  const passwordsDiv  = document.querySelector("#passwords");

  // If key elements are missing, bail out so we don't break other pages
  if (!form || !emailInput || !emailStatus || !confirmInput || !confirmStatus) {
    return;
  }

  // Accessibility
  emailStatus.setAttribute("role", "status");
  emailStatus.setAttribute("aria-live", "polite");
  confirmStatus.setAttribute("role", "status");
  confirmStatus.setAttribute("aria-live", "polite");

  // Helpers
  const clearStates = (el) => el.classList.remove("loading", "success", "error");

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
    if (!passwordsDiv) return;

    const shouldHide = !show;
    passwordsDiv.classList.toggle("d-none", shouldHide);
    passwordsDiv.hidden = shouldHide;
    passwordsDiv.setAttribute("aria-hidden", String(shouldHide));

    const interactive = passwordsDiv.querySelectorAll(
      "input, select, textarea, button"
    );
    interactive.forEach((el) => {
      el.disabled = shouldHide;
    });
  }

  // Gates & state
  let emailDeliverable = false;
  let emailsMatch      = false;
  let debounceId;

  // For duplicate-check state
  let emailTaken       = null; // true / false / null (unknown or error)
  let dupDebounceId;

  // ============================================================
  // Primary email validation (Kickbox-backed)
  // ============================================================
  async function validateEmail(email) {
    const requestedEmail = email.trim();
    setStatusLoading(emailStatus, "Checking email...");

    // Reset deliverable and dedupe flags
    emailStatus.dataset.deliverable = "false";
    emailDeliverable = false;
    emailTaken = null;

    // Block jwpub domain immediately
    if (requestedEmail.toLowerCase().endsWith("@jwpub.org")) {
      setStatusError(
        emailStatus,
        "Emails from @jwpub.org are not allowed."
      );
      setConfirmEnabled(false);
      emailsMatch = false;
      showPasswords(false);
      return;
    }

    try {
      const res = await fetch(
        `/validate-email?email=${encodeURIComponent(requestedEmail)}`
      );
      const data = await res.json().catch(() => ({}));
      const reason = data.reason || "";

      // If user changed input while this request was in-flight, ignore
      if (emailInput.value.trim() !== requestedEmail) return;

      if (!res.ok) {
        setStatusError(
          emailStatus,
          data.error || "Server error. Please try again later."
        );
        setConfirmEnabled(false);
        emailsMatch = false;
        showPasswords(false);
        return;
      }

      const result = String(data.result || "").toLowerCase();

      if (result === "deliverable") {
        emailDeliverable = true;
        emailStatus.dataset.deliverable = "true";
        setStatusSuccess(emailStatus, "✅ Valid email");
        setConfirmEnabled(true);
      } else if (result === "risky" || result === "unknown") {
        emailDeliverable = false;
        emailStatus.dataset.deliverable = "false";
        setStatusError(
          emailStatus,
          reason || "Email may be risky or unknown."
        );
        setConfirmEnabled(false);
        emailsMatch = false;
        showPasswords(false);
      } else {
        emailDeliverable = false;
        emailStatus.dataset.deliverable = "false";
        setStatusError(
          emailStatus,
          reason || "Invalid email address."
        );
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
        "Error validating email. Please try again later."
      );
      setConfirmEnabled(false);
      emailsMatch = false;
      showPasswords(false);
    }
  }

  // ============================================================
  // Duplicate email check (uses /api/volunteers/exists)
  // ============================================================
  async function checkEmailDuplicate(email) {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      emailTaken = null;
      return null;
    }

    try {
      const resp = await fetch(
        `/api/volunteers/exists?email=${encodeURIComponent(normalized)}`,
        { credentials: "include" }
      );
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        console.warn("Email duplicate check failed:", resp.status, data);
        emailTaken = null;
        // We show a soft error, and submit handler will block if still null
        setStatusError(
          emailStatus,
          data.error || "Could not verify email. Please try again."
        );
        return null;
      }

      emailTaken = !!data.exists;

      if (emailTaken) {
        setStatusError(
          emailStatus,
          "This email is already registered."
        );
      } else {
        // Email is valid AND available
        setStatusSuccess(
          emailStatus,
          "✅ Email is valid and available"
        );
      }

      return emailTaken;
    } catch (err) {
      console.error("Error checking email duplicate:", err);
      emailTaken = null;
      setStatusError(
        emailStatus,
        "Could not verify email. Please try again."
      );
      return null;
    }
  }

  // ============================================================
  // Confirm email exact match gate (toggles #passwords + triggers dedupe)
  // ============================================================
  function evaluateConfirmMatch() {
    const emailVal   = emailInput.value.trim();
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
      setStatusSuccess(confirmStatus, "✅ Emails match");
      showPasswords(true);

      // Kick off duplicate check once we have a deliverable, matching email
      clearTimeout(dupDebounceId);
      dupDebounceId = setTimeout(() => {
        if (emailDeliverable && emailsMatch) {
          checkEmailDuplicate(emailVal);
        }
      }, 300);
    } else {
      emailsMatch = false;
      setStatusError(confirmStatus, "Emails do not match.");
      showPasswords(false);
      emailTaken = null; // we no longer have a stable email to dedupe
    }
  }

  // ============================================================
  // Event wiring
  // ============================================================

  // Prevent tabbing into confirm before email is deliverable
  confirmInput.addEventListener("keydown", (e) => {
    if (e.key === "Tab" && !emailDeliverable) {
      e.preventDefault();
      emailInput.focus();
      confirmStatus.textContent = "Validate your email first.";
    }
  });

  // Primary email typing with debounce
  emailInput.addEventListener("input", () => {
    clearTimeout(debounceId);
    clearTimeout(dupDebounceId);

    const email = emailInput.value.trim();

    // Reset gates + status
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

    debounceId = setTimeout(() => {
      validateEmail(email);
    }, 500);
  });

  // Confirm-email typing (updates match + triggers dedupe)
  confirmInput.addEventListener("input", evaluateConfirmMatch);

  // Final submit guard (email only; password logic is in passwords.js)
  form.addEventListener("submit", (e) => {
    const email   = emailInput.value.trim().toLowerCase();

    // Block jwpub domain at submit too
    if (email.endsWith("@jwpub.org")) {
      e.preventDefault();
      setStatusError(
        emailStatus,
        "Emails from @jwpub.org are not allowed."
      );
      return;
    }

    evaluateConfirmMatch();

    // Require deliverable + match first
    if (!(emailDeliverable && emailsMatch)) {
      e.preventDefault();
      return;
    }

    // If we know it's taken, block
    if (emailTaken === true) {
      e.preventDefault();
      setStatusError(
        emailStatus,
        "This email is already registered."
      );
      return;
    }

    // If we couldn't verify (null), block to be safe
    if (emailTaken === null) {
      e.preventDefault();
      setStatusError(
        emailStatus,
        "Could not verify email at this time. Please try again."
      );
      return;
    }

    // If emailTaken === false, allow form submit to /submit-emailPass
    // Password matching is enforced by passwords.js.
  });
});