// public/js/formListeners.js

document.addEventListener("DOMContentLoaded", () => {
  // ============================================================
  // =============== SHARED FIELD FEEDBACK HELPERS ==============
  // ============================================================

  const csrfTokenInput = document.querySelector('input[name="_csrf"]');
  const csrfToken = csrfTokenInput?.value || "";

  function clearFieldStatus(fieldId) {
    const input = document.getElementById(fieldId);
    const status = document.getElementById(`${fieldId}-status`);

    if (input) input.classList.remove("is-invalid", "is-valid");
    if (status) status.innerHTML = "";
  }

  function setFieldError(fieldId, message) {
    const input = document.getElementById(fieldId);
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

  function setFieldSuccess(fieldId, message = "Looks good") {
    const input = document.getElementById(fieldId);
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

  function clearAllFieldStatuses(fieldIds) {
    fieldIds.forEach(clearFieldStatus);
  }

  // ============================================================
  // =============== GLOBAL FORM TOAST MESSAGE ==================
  // ============================================================

  function showFormToast(message, type = "danger") {
    
  console.log("showFormToast called with:", message, type);  // 👈 add this

    const submitStatus = document.getElementById("submit-status");
    if (!submitStatus) return;

    submitStatus.innerHTML = `
      <div class="alert alert-${type} alert-dismissible fade show mt-3" role="alert">
        <i class="bi bi-exclamation-triangle-fill me-2"></i>
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    `;
  }

  // ============================================================
  // =============== APPLY SERVER FIELD ERRORS ==================
  // ============================================================

  function applyFieldErrors(fieldErrors = {}) {
    
  console.log("applyFieldErrors:", fieldErrors);  // 👈 add

    clearAllFieldStatuses(["firstName", "lastName", "email", "phone"]);

    // name (combined)
    if (fieldErrors.name) {
      setFieldError("firstName", fieldErrors.name);
      setFieldError("lastName", fieldErrors.name);
    }

    // individual fields
    if (fieldErrors.firstName) setFieldError("firstName", fieldErrors.firstName);
    if (fieldErrors.lastName) setFieldError("lastName", fieldErrors.lastName);

    if (fieldErrors.email) setFieldError("email", fieldErrors.email);
    if (fieldErrors.phone) setFieldError("phone", fieldErrors.phone);

    // Build combined toast for phone/name duplicates when present
    const lines = [];

    if (fieldErrors.phone) {
      lines.push("Phone number already exists.");
    }

    if (fieldErrors.name) {
      lines.push(
        "Name already exists; if this is correct enter a suffix to differentiate."
      );
    }

    // Form-level error overrides combined lines
    if (fieldErrors.form) {
      lines.length = 0;
      lines.push(fieldErrors.form);
    }

    if (lines.length > 0) {
      showFormToast(lines.join("<br>"), "danger");
    }
  }

  function applySuccessState(fieldIds) {
    fieldIds.forEach((id) => setFieldSuccess(id));
  }

  // ============================================================
  // =============== PROGRESS BAR (SUBMIT STATUS) ===============
  // ============================================================

  function showProgressBar() {
    const submitStatus = document.getElementById("submit-status");
    if (!submitStatus) return;

    submitStatus.innerHTML = `
      <div class="mt-3">
        <div class="progress">
          <div
            class="progress-bar progress-bar-striped progress-bar-animated bg-success"
            role="progressbar"
            style="width: 0%"
            aria-valuemin="0"
            aria-valuemax="100"
          ></div>
        </div>
      </div>
    `;

    const bar = submitStatus.querySelector(".progress-bar");
    let width = 0;
    const interval = setInterval(() => {
      width += 10;
      bar.style.width = width + "%";
      if (width >= 100) clearInterval(interval);
    }, 100);
  }

  // ============================================================
  // =============== EMAIL / PASSWORD FORM LOGIC ================
  // ============================================================

  const emailPassForm = document.querySelector('form[action="/submit-namePass"]');
  const emailInput = document.querySelector("#email");
  const confirmInput = document.querySelector("#confirm-email");
  const emailStatus = document.querySelector("#email-status");
  const passwordInput = document.querySelector("#password");
  const confirmPasswordInput = document.querySelector("#confirm-password");

  if (emailPassForm && emailInput && confirmInput && emailStatus) {
    let submitBtn =
      emailPassForm.querySelector('button[type="submit"]') ||
      emailPassForm.querySelector("button.btn.btn-primary");

    let emailDeliverable = false;
    let emailsMatch = false;
    let emailTaken = null;
    let lastCheckedEmail = "";
    let debounceId;
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
      if (existsAbortController) existsAbortController.abort();
      existsAbortController = new AbortController();

      try {
        const url = `/api/volunteers/exists?email=${encodeURIComponent(
          normalized
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

      emailsMatch = !!email && !!confirm && emailsEqualInsensitive(email, confirm);

      const deliverableAttr = emailStatus?.dataset?.deliverable;
      if (deliverableAttr === "true") emailDeliverable = true;
      else if (deliverableAttr === "false") emailDeliverable = false;
      else {
        emailDeliverable = /\S+@\S+\.\S+/.test(email);
      }

      if (emailDeliverable && emailsMatch) {
        clearTimeout(debounceId);
        debounceId = setTimeout(() => {
          checkEmailExists(email);
        }, 300);
      }
    }

    function maybePreloadDuringPasswordTyping() {
      const email = emailInput.value.trim();
      if (emailDeliverable && emailsMatch && emailTaken === null) {
        checkEmailExists(email);
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
        maybePreloadDuringPasswordTyping
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
          "Please validate your email and ensure both entries match."
        );
        return;
      }

      if (emailTaken === null || lastCheckedEmail !== email.toLowerCase()) {
        setEmailLoading("Checking for existing account...");
        const exists = await checkEmailExists(email);
        if (exists === null) {
          setEmailError(
            "Could not verify email at this time. Please try again."
          );
          e.preventDefault();
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

  // ============================================================
  // =============== CONGREGATION FORM LOGIC ====================
  // ============================================================

  const congForm = document.querySelector('form[action="/submitCongregation"]');

  if (congForm) {
    const congGroup = congForm.querySelector("#congregation-group");
    const congEnter = congForm.querySelector("#congregationEnter");
    const congSelect = congForm.querySelector("#congregation");
    const congOtherCity = congForm.querySelector("#congregationOtherCity");
    const congOtherState = congForm.querySelector("#congregationOtherState");
    const congOtherLang = congForm.querySelector("#congregationOtherLang");
    const assignedButtons = congForm.querySelectorAll(
      'input[name="congAssigned"]'
    );

    function updateCongVisibility() {
      const selected = congForm.querySelector(
        'input[name="congAssigned"]:checked'
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

  // ============================================================
  // =============== NON-PROFILE SUBMIT (AJAX) ==================
  // ============================================================

  const nonProfileForm = document.querySelector(
    'form[action="/submit-nonProfileInfo"]'
  );

  if (nonProfileForm) {
    nonProfileForm.addEventListener("submit", async (e) => {
      e.preventDefault(); // 🚨 Prevent full-page POST

      clearAllFieldStatuses(["firstName", "lastName", "email"]);

      const payload = {
        firstName: document.getElementById("firstName")?.value.trim(),
        lastName: document.getElementById("lastName")?.value.trim(),
        suffix: document.getElementById("suffix")?.value.trim(),
        email: document.getElementById("email")?.value.trim(),
      };

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

        // ----- ERROR RESPONSES -----
        if (!resp.ok) {
          if (contentType.includes("application/json")) {
            data = await resp.json().catch(() => ({}));

            if (data.fieldErrors) {
              applyFieldErrors(data.fieldErrors); // 👈 shows toast + inline fields
              return;
            }
          }

          showFormToast("An error occurred. Please try again.");
          return;
        }

        // ----- SUCCESS -----
        if (contentType.includes("application/json")) {
          data = await resp.json().catch(() => ({}));
        }

        if (data.fieldErrors) {
          applyFieldErrors(data.fieldErrors);
          return;
        }

        // Redirect to next step
        window.location.href = "/volunteerIn?disable=true";
      } catch (err) {
        console.error("submit-nonProfileInfo error:", err);
        showFormToast("Server error. Please try again.");
        return;
      }
    });
  }

  // ============================================================
  // =============== VOLUNTEER INFO SUBMIT (AJAX) ===============
  // ============================================================

  const volunteerInfoForm = document.querySelector(
    'form[action="/submit-volunteerInfo"]'
  );

  if (volunteerInfoForm) {
    volunteerInfoForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      console.log("submit-volunteerInfo handler fired");

      clearAllFieldStatuses(["firstName", "lastName", "phone"]);

      const payload = {
        firstName: document.getElementById("firstName")?.value.trim(),
        lastName: document.getElementById("lastName")?.value.trim(),
        suffix: document.getElementById("suffix")?.value.trim(),
        phone: document.getElementById("phone").value.trim(),
        SMSCapable:
          document.querySelector('input[name="SMSCapable"]:checked')?.value ===
          "yes",
      };

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
          showFormToast(
            data.message || "An error occurred. Please try again."
          );
          return;
        }
      } catch (err) {
        console.error("submit-volunteerInfo error:", err);
        showFormToast("Server error. Please try again.");
        return;
      }

      // Field-level errors
      if (data.fieldErrors) {
        applyFieldErrors(data.fieldErrors);
        return;
      }

      // Success
      applySuccessState(["firstName", "lastName", "phone"]);
      showProgressBar();

      setTimeout(() => {
        window.location.href = "/personalInfo";
      }, 1000);
    });
  }
});