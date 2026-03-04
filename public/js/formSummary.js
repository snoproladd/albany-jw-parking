// public/js/formSummary.js

/**
 * formSummary.js
 *
 * In-place editing + orchestration:
 *  - The accordion sections on the summary page are live inputs.
 *  - On "Confirm & Finish", we POST each step to its original
 *    /submit-* route via fetch(), preserving all backend rules.
 *  - If all steps succeed, we then submit the form normally
 *    to /submitSummary so the server can finalize + redirect.
 *  - Section-level errors are shown inline when possible.
 */

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("#summary-form");
  const statusEl = document.querySelector("#summary-status");
  const finalSubmit = document.querySelector("#final-submit");
  const printBtn = document.querySelector("#print-summary");
  const csrfToken = document.querySelector("#summary-csrf")?.value || "";

  // Map section -> accordion collapse id
  const SECTION_COLLAPSE_IDS = {
    contact: "collapseContact",
    personal: "collapsePersonal",
    congregation: "collapseCong",
    spiritual: "collapseSpiritual",
  };

  // ========== Status Helpers ==========

  function clearStatus() {
    if (!statusEl) return;
    statusEl.classList.remove("loading", "success", "error");
    statusEl.innerHTML = "";
  }

  function setStatusLoading(msg) {
    if (!statusEl) return;
    clearStatus();
    statusEl.classList.add("loading");
    statusEl.innerHTML = `
      <span
        class="spinner-border spinner-border-sm text-secondary"
        role="status"
        aria-hidden="true"
      ></span>
      ${msg}
    `;
  }

  function setStatusError(msg) {
    if (!statusEl) return;
    clearStatus();
    statusEl.classList.add("error");
    statusEl.innerHTML = `
      <div class="alert alert-danger alert-dismissible fade show" role="alert">
        ❌ ${msg}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
      </div>
    `;
  }

  function setStatusSuccess(msg) {
    if (!statusEl) return;
    clearStatus();
    statusEl.classList.add("success");
    statusEl.textContent = msg;
  }
  // ================================
  // Sync Assigned vs Visiting UI
  // ================================

  function syncCongUI() {
    const assignedYes = document.querySelector("#congAssigned-yes");
    const assignedNo = document.querySelector("#congAssigned-no");

    const assignedBlock = document.querySelector("#cong-assigned-block");
    const visitingBlock = document.querySelector("#cong-visiting-block");

    const isAssigned =
      assignedYes && assignedYes.checked
        ? true
        : assignedNo && assignedNo.checked
          ? false
          : null;

    if (isAssigned === true) {
      // Assigned congregation mode
      assignedBlock.classList.remove("d-none");
      visitingBlock.classList.add("d-none");
    } else if (isAssigned === false) {
      // Visiting congregation mode
      visitingBlock.classList.remove("d-none");
      assignedBlock.classList.add("d-none");
    }
  }

  // Attach listeners to the radios
  document
    .querySelectorAll('input[name="congAssigned"]')
    .forEach((el) => el.addEventListener("change", syncCongUI));

  // Run on page load so default state matches existing DB data
  syncCongUI();

  // ========== Section Error Helpers ==========

  function clearSectionErrors() {
    // Contact
    const contactPhoneErr = document.querySelector("#contact-phone-error");
    const contactSmsErr = document.querySelector("#contact-sms-error");
    if (contactPhoneErr) {
      contactPhoneErr.classList.add("d-none");
      contactPhoneErr.textContent = "";
    }
    if (contactSmsErr) {
      contactSmsErr.classList.add("d-none");
      contactSmsErr.textContent = "";
    }

    // Personal
    const personalErr = document.querySelector("#personal-error");
    if (personalErr) {
      personalErr.classList.add("d-none");
      personalErr.textContent = "";
    }

    // Congregation
    const congErr = document.querySelector("#cong-error");
    if (congErr) {
      congErr.classList.add("d-none");
      congErr.textContent = "";
    }

    // Spiritual
    const spiritualErr = document.querySelector("#spiritual-error");
    if (spiritualErr) {
      spiritualErr.classList.add("d-none");
      spiritualErr.textContent = "";
    }
  }

  function showSectionError(section, msg, fieldKey) {
    if (!msg) return;

    switch (section) {
      case "contact": {
        // Map some known field keys to specific areas
        const phoneErr = document.querySelector("#contact-phone-error");
        const smsErr = document.querySelector("#contact-sms-error");

        if (fieldKey === "phone" && phoneErr) {
          phoneErr.textContent = msg;
          phoneErr.classList.remove("d-none");
        } else if (fieldKey === "SMSCapable" && smsErr) {
          smsErr.textContent = msg;
          smsErr.classList.remove("d-none");
        } else if (phoneErr) {
          // Fallback to phone area if we don't know which field it is
          phoneErr.textContent = msg;
          phoneErr.classList.remove("d-none");
        }
        break;
      }

      case "personal": {
        const el = document.querySelector("#personal-error");
        if (el) {
          el.textContent = msg;
          el.classList.remove("d-none");
        }
        break;
      }

      case "congregation": {
        const el = document.querySelector("#cong-error");
        if (el) {
          el.textContent = msg;
          el.classList.remove("d-none");
        }
        break;
      }

      case "spiritual": {
        const el = document.querySelector("#spiritual-error");
        if (el) {
          el.textContent = msg;
          el.classList.remove("d-none");
        }
        break;
      }
    }
  }

  // ========== Fetch Helper ==========

  async function postFormSection(url, data, sectionName) {
    const fd = new FormData();

    // Append data fields
    Object.entries(data).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (Array.isArray(value)) {
        value.forEach((v) => fd.append(key, v));
      } else {
        fd.append(key, value);
      }
    });

    // CSRF
    if (csrfToken) {
      fd.append("_csrf", csrfToken);
    }

    const resp = await fetch(url, {
      method: "POST",
      body: fd,
      headers: {
        "X-Requested-With": "XMLHttpRequest", // allows backend to distinguish, if desired
      },
    });

    if (resp.ok) {
      // Could be JSON or HTML (redirect target). We don't care on success.
      return { success: true };
    }

    // Try to get useful error info
    let text;
    let json;
    const contentType = resp.headers.get("content-type") || "";

    try {
      if (contentType.includes("application/json")) {
        json = await resp.json();
      } else {
        text = await resp.text();
      }
    } catch {
      // If parsing fails, leave text/json undefined and just use a generic error.
    }

    const errors = [];

    if (json) {
      // Our JSON error shape from some routes: { success: false, fieldErrors: {...} }
      if (json.fieldErrors && typeof json.fieldErrors === "object") {
        for (const [field, msg] of Object.entries(json.fieldErrors)) {
          if (!msg) continue;
          errors.push({ field, message: msg });
        }
      } else if (json.error) {
        errors.push({ field: null, message: json.error });
      }
    } else if (text) {
      errors.push({ field: null, message: text });
    } else {
      errors.push({
        field: null,
        message: "An unknown error occurred while saving this section.",
      });
    }

    // Show the first error in the relevant section area
    if (errors.length > 0) {
      const first = errors[0];
      showSectionError(sectionName, first.message, first.field);
    }

    return {
      success: false,
      errors,
    };
  }

  // ========== Build Payloads for Each Section ==========

  function getContactPayload() {
    const firstName = document.querySelector("#firstName")?.value.trim() || "";
    const lastName = document.querySelector("#lastName")?.value.trim() || "";
    const suffix = document.querySelector("#suffix")?.value.trim() || "";
    const phone = document.querySelector("#phone")?.value.trim() || "";
    const sms = document.querySelector(
      'input[name="SMSCapable"]:checked',
    )?.value;

    return {
      firstName,
      lastName,
      suffix,
      phone,
      SMSCapable: sms || "",
    };
  }

  function getPersonalPayload() {
    const dob = document.querySelector("#dobirthRaw")?.value || "";
    const gender = document.querySelector("#genderRaw")?.value || "";
    const stamina = document.querySelector("#staminaRaw")?.value || "";

    return {
      genderRaw: gender,
      dobirthRaw: dob,
      staminaRaw: stamina,
    };
  }

  function getCongregationPayload() {
    const congAssignedVal = document.querySelector(
      'input[name="congAssigned"]:checked',
    )?.value;
    const congregation = document.querySelector("#congregation")?.value || "";
    const city =
      document.querySelector("#congregationOtherCity")?.value.trim() || "";
    const state =
      document.querySelector("#congregationOtherState")?.value.trim() || "";
    const lang =
      document.querySelector("#congregationOtherLang")?.value.trim() || "";
    const extraAttendVal = document.querySelector(
      'input[name="extraAttend"]:checked',
    )?.value;

    return {
      congAssigned: congAssignedVal || "",
      congregation,
      congregationOtherCity: city,
      congregationOtherState: state,
      congregationOtherLang: lang,
      extraAttend: extraAttendVal || "",
    };
  }

  function getSpiritualPayload() {
    const privChecks = Array.from(
      document.querySelectorAll('input[name="privileges"]:checked'),
    );
    const privileges = privChecks.map((cb) => cb.value);

    return {
      privileges,
    };
  }

  // ========== Edit Buttons: Expand & Focus ==========

  document
    .querySelectorAll(".summary-edit-btn")
    .forEach((btn /** @type HTMLButtonElement */) => {
      btn.addEventListener("click", () => {
        const section = btn.dataset.section;
        if (!section) return;

        const collapseId = SECTION_COLLAPSE_IDS[section];
        const collapseEl = collapseId
          ? document.getElementById(collapseId)
          : null;
        if (collapseEl && window.bootstrap && window.bootstrap.Collapse) {
          const inst = window.bootstrap.Collapse.getOrCreateInstance(
            collapseEl,
            { toggle: false },
          );
          inst.show();
        } else if (collapseEl) {
          // Fallback: manually add "show" class if Bootstrap isn't available
          collapseEl.classList.add("show");
        }

        // Focus first input/select/textarea in that section
        const targetInput = collapseEl?.querySelector(
          "input, select, textarea",
        );
        if (targetInput && typeof targetInput.focus === "function") {
          targetInput.focus();
        }
      });
    });

  // ========== Print Button ==========

  if (printBtn) {
    printBtn.addEventListener("click", () => {
      window.print();
    });
  }

  // ========== Final Submit Orchestration ==========

  if (form && finalSubmit) {
    const originalHandler = async (evt) => {
      evt.preventDefault();

      clearStatus();
      clearSectionErrors();
      finalSubmit.disabled = true;

      try {
        // 1) Contact (volunteer info)
        setStatusLoading("Saving contact information...");
        let result = await postFormSection(
          "/submit-volunteerInfo",
          getContactPayload(),
          "contact",
        );
        if (!result.success) {
          setStatusError("Please fix the errors in the Contact section.");
          finalSubmit.disabled = false;
          return;
        }

        // 2) Personal
        setStatusLoading("Saving personal information...");
        result = await postFormSection(
          "/submit-personalInfo",
          getPersonalPayload(),
          "personal",
        );
        if (!result.success) {
          setStatusError("Please fix the errors in the Personal Info section.");
          finalSubmit.disabled = false;
          return;
        }

        // 3) Congregation
        setStatusLoading("Saving congregation information...");
        result = await postFormSection(
          "/submitCongregation",
          getCongregationPayload(),
          "congregation",
        );
        if (!result.success) {
          setStatusError(
            "Please fix the errors in the Congregation Info section.",
          );
          finalSubmit.disabled = false;
          return;
        }

        // 4) Spiritual
        setStatusLoading("Saving spiritual information...");
        result = await postFormSection(
          "/submitSpiritual",
          getSpiritualPayload(),
          "spiritual",
        );
        if (!result.success) {
          setStatusError(
            "Please fix the errors in the Spiritual Info section.",
          );
          finalSubmit.disabled = false;
          return;
        }

        // If we reach here, all step routes succeeded
        setStatusLoading("Finalizing your registration...");

        // Allow the form to submit normally to /submitSummary
        form.removeEventListener("submit", originalHandler);
        form.submit();
      } catch (err) {
        console.error("Summary submit orchestration error:", err);
        setStatusError(
          "A server error occurred while saving your information. Please try again.",
        );
        finalSubmit.disabled = false;
      }
    };

    form.addEventListener("submit", originalHandler);
  }
});
