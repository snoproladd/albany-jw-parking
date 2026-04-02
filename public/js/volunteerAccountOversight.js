// public/js/volunteerAccountOversight.js
/**
 * CACHED EDIT VOLUNTEER CHANGES — FINALIZE-ONCE MODEL
 *
 * Responsibilities:
 * - Manage per-section EDIT/SAVE state for accordion sections.
 * - Cache section data on SAVE (finalize-once model).
 * - Disable volunteer switching while any section is in edit mode.
 * - Enable Finalize only when all sections are locked.
 * - Warn on unload when unsaved changes exist.
 *
 * NOTE: Password-related UI is intentionally excluded from this file.
 */
window.editVolunteerCache = window.editVolunteerCache || {};
window.__suppressBeforeUnload = window.__suppressBeforeUnload || false;

document.addEventListener("DOMContentLoaded", () => {
  /** @type {HTMLElement | null} */
  const root = document.getElementById("volunteerAccountOversightRoot");
  if (!root) return;

  /** @type {HTMLButtonElement | null} */
  const finalizeBtn = document.getElementById("finalize-changes");
  /** @type {HTMLElement | null} */
  const finalizeStatus = document.getElementById("finalize-status");

  /** @type {boolean} True after a successful finalize — suppresses beforeunload. */
  let hasFinalized = false;

  /** @type {boolean} True once any section has been saved into cache. */
  let hasCachedChanges = false;

  // ---------------------------------------------------------------------
  // Helpers (IDs, state, UI)
  // ---------------------------------------------------------------------

  /**
   * Get the currently selected target volunteer id (string).
   * @returns {string}
   */
  function getTargetUserId() {
    return (
      document.getElementById("targetUserId")?.value ||
      document.querySelector('input[name="targetUserId"]')?.value ||
      ""
    );
  }

  /**
   * Returns true when every accordion section is out of edit mode.
   * If no accordion bodies exist (no target selected), treat as locked.
   * @returns {boolean}
   */
  function allLocked() {
    const bodies = /** @type {HTMLElement[]} */ (
      Array.from(root.querySelectorAll(".accordion-body"))
    );
    if (!bodies.length) return true;
    return bodies.every((s) => s.dataset.editing === "false");
  }

  /**
   * True if any section is currently in edit mode.
   * @returns {boolean}
   */
  function anySectionEditing() {
    return !allLocked();
  }

  /**
   * Enable/disable the Finalize button based on edit state.
   * @returns {void}
   */
  function updateFinalizeState() {
    if (!finalizeBtn) return;
    finalizeBtn.disabled = !allLocked();
  }

  /**
   * Determine if the user has any unsaved changes that should trigger a leave warning.
   * @returns {boolean}
   */
  function userHasUnsavedChanges() {
    if (hasFinalized) return false;
    if (!allLocked()) return true;
    if (hasCachedChanges) return true;
    return false;
  }

  /**
   * Clear cached edits for the current target volunteer.
   * @returns {void}
   */
  function clearEditVolunteerCache() {
    window.editVolunteerCache = {};
    hasCachedChanges = false;
    hasFinalized = false;

    if (finalizeStatus) finalizeStatus.innerHTML = "";
    if (finalizeBtn) finalizeBtn.textContent = "Finalize Changes";

    updateFinalizeState();
  }

  function updateVisitingCongregationVisibility() {
    const assignedYes = document.querySelector(
      'input[name="congAssigned"][value="yes"]',
    );
    const assignedNo = document.querySelector(
      'input[name="congAssigned"][value="no"]',
    );

    const assignedBlock = document.getElementById("cong-assigned-block");
    const visitingBlock = document.getElementById("cong-visiting-block");

    if (!assignedYes || !assignedNo) return;

    if (assignedBlock) {
      assignedBlock.classList.toggle("d-none", assignedNo.checked);
    }

    if (visitingBlock) {
      visitingBlock.classList.toggle("d-none", assignedYes.checked);
    }
  }

  /**
   * Toggle the volunteer picker disabled state based on edit mode.
   * Also toggles an inline hint element if present.
   * @returns {void}
   */
  function updateVolunteerPickerState() {
    const pickerSelect = /** @type {HTMLSelectElement | null} */ (
      root.querySelector("#volunteerSelect")
    );
    if (!pickerSelect) return;

    const editing = anySectionEditing();

    pickerSelect.disabled = editing;
    pickerSelect.title = editing
      ? "Finish or save your current edits before switching volunteers."
      : "";

    const hint = document.getElementById("volunteerSelectHint");
    if (hint) {
      hint.style.display = editing ? "block" : "none";
    }
  }

  // Wire live email validation
  if (typeof window.initEmailValidation === "function") {
    window.initEmailValidation({
      inputId: "email",
      statusId: "emailStatus",
    });
  }

  // Wire live phone validation
  if (typeof window.initPhoneVerification === "function") {
    window.initPhoneVerification({
      inputId: "phone",
      statusId: "phoneStatus",
    });
  }

  /**
   * Set a section into edit or locked state.
   * - Writes dataset.editing
   * - Enables/disables inputs/selects/textareas (skips readonly)
   * - Updates the EDIT/SAVE button label and style
   *
   * @param {HTMLElement} sectionEl
   * @param {boolean} isEditing
   * @returns {void}
   */
  function setSectionEditing(sectionEl, isEditing) {
    sectionEl.dataset.editing = isEditing ? "true" : "false";

    sectionEl.querySelectorAll("input, select, textarea").forEach((el) => {
      if (el.hasAttribute("readonly")) return;
      // @ts-ignore
      el.disabled = !isEditing;
    });

    const btn = /** @type {HTMLButtonElement | null} */ (
      sectionEl.querySelector(".summary-edit-btn")
    );
    if (btn) {
      btn.textContent = isEditing ? "SAVE" : "EDIT";
      btn.classList.toggle("btn-outline-secondary", !isEditing);
      btn.classList.toggle("btn-success", isEditing);
    }
  }

  // ---------------------------------------------------------------------
  // Initialize sections (start locked) + initial UI state
  // ---------------------------------------------------------------------

  root.querySelectorAll(".accordion-body").forEach((sec) => {
    setSectionEditing(sec, false);
  });

  updateVisitingCongregationVisibility();

  // IMPORTANT: initialize button + picker states once on load
  updateFinalizeState();
  updateVolunteerPickerState();

  // ---------------------------------------------------------------------
  // Wire volunteer picker (submit on change, block while editing)
  // ---------------------------------------------------------------------

  (function wireVolunteerPicker() {
    const pickerForm = /** @type {HTMLFormElement | null} */ (
      root.querySelector('form[action="/selectVolEdit"]')
    );
    const pickerSelect = /** @type {HTMLSelectElement | null} */ (
      pickerForm?.querySelector("#volunteerSelect")
    );

    if (!pickerForm || !pickerSelect) {
      console.warn("[oversight] pickerForm or volunteerSelect not found");
      return;
    }

    // Track previous selection so cancel can restore it.
    let lastValue = pickerSelect.value;

    pickerSelect.addEventListener("focus", () => {
      lastValue = pickerSelect.value;
    });

    pickerSelect.addEventListener("change", () => {
      if (!pickerSelect.value) return;

      // If any section is currently editing, block switching.
      if (anySectionEditing()) {
        alert(
          "Please SAVE (or cancel) your edits before switching volunteers.",
        );
        pickerSelect.value = lastValue;
        return;
      }

      // If there are cached-but-unfinalized changes, confirm discard.
      if (userHasUnsavedChanges()) {
        const ok = confirm(
          "You have unsaved changes for this volunteer. Switch volunteers and discard them?",
        );
        if (!ok) {
          pickerSelect.value = lastValue;
          return;
        }
      }

      // Avoid double beforeunload prompts on intentional navigation
      window.__suppressBeforeUnload = true;

      clearEditVolunteerCache();

      updateVisitingCongregationVisibility();

      // Guaranteed submit (does not require a submit button)
      pickerForm.submit();
    });
  })();

  // ---------------------------------------------------------------------
  // beforeunload guard
  // ---------------------------------------------------------------------

  window.addEventListener("beforeunload", (event) => {
    if (window.__suppressBeforeUnload) return;
    if (!userHasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = "";
  });

  // ---------------------------------------------------------------------
  // Privilege rules init (safe even if target not selected)
  // Uses shared enforcer API exposed by privilegeEnforcer.js [1](https://jakeofalltradespropertyserv-my.sharepoint.com/personal/jladd_jakeofalltradespropertyserv_onmicrosoft_com/Documents/Microsoft%20Copilot%20Chat%20Files/parking_website.txt)
  // ---------------------------------------------------------------------

  (function initPrivilegeRulesForOversight() {
    const rulesScript = document.getElementById("privilege-rules-json");
    if (!rulesScript) return;

    const spiritualRoot =
      root.querySelector('form[action="/edit-volunteer/update/spiritual"]') ||
      root;

    if (typeof window.initPrivilegeEnforcer === "function") {
      window.initPrivilegeEnforcer({
        form: spiritualRoot,
        privilegeSelector: ".privilege-checkbox",
        genderSelectId: "genderRaw",
        hiddenGenderFieldId: "summary-gender",
        rulesScriptId: "privilege-rules-json",
      });
    }
  })();

  /**
   * Cache values for a section based on its name.
   * @param {HTMLElement} sec
   * @param {string} section
   */
  function cacheSection(sec, section) {
    switch (section) {
      case "contact":
        window.editVolunteerCache.contact = {
          email: sec.querySelector('[name="email"]')?.value?.trim(),
          phone: sec.querySelector('[name="phone"]')?.value?.trim(),
          smsCapable: sec.querySelector("#sms-yes")?.checked
            ? true
            : sec.querySelector("#sms-no")?.checked
              ? false
              : undefined,
        };
        break;

      case "personal":
        window.editVolunteerCache.personal = {
          dobirthRaw: sec.querySelector('[name="dobirthRaw"]')?.value || null,
          genderRaw: sec.querySelector('[name="genderRaw"]')?.value || null,
          staminaRaw: sec.querySelector('[name="staminaRaw"]')?.value || null,
        };
        break;

      case "congregation":
        window.editVolunteerCache.congregation = {
          congAssigned: sec.querySelector('input[name="congAssigned"]:checked')
            ?.value,
          congregation: sec.querySelector('[name="congregation"]')?.value,
          congregationOtherCity: sec.querySelector(
            '[name="congregationOtherCity"]',
          )?.value,
          congregationOtherState: sec.querySelector(
            '[name="congregationOtherState"]',
          )?.value,
          congregationOtherLang: sec.querySelector(
            '[name="congregationOtherLang"]',
          )?.value,
          extraAttend: sec.querySelector('input[name="extraAttend"]:checked')
            ?.value,
        };
        break;

      case "spiritual":
        window.editVolunteerCache.spiritual = [
          ...sec.querySelectorAll(".privilege-checkbox"),
        ]
          .filter((i) => i.checked)
          .map((i) => i.value);
        break;

      case "notes":
        window.editVolunteerCache.notes =
          sec.querySelector('textarea[name="notes"]')?.value || "";
        break;
    }
  }
  root.addEventListener("change", (ev) => {
    const target = ev.target;
    if (target instanceof HTMLInputElement && target.name === "congAssigned") {
      updateVisitingCongregationVisibility();
    }
  });
  // ---------------------------------------------------------------------
  // EDIT/SAVE click handler (single source of truth)
  // ---------------------------------------------------------------------

  root.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".summary-edit-btn");
    if (!btn) return;

    const sec = btn.closest(".accordion-body");
    if (!sec) return;

    const sectionName = btn.dataset.section;
    const isEditing = sec.dataset.editing === "true";

    if (isEditing) {
      // SAVE
      // cacheSection must exist elsewhere in your file (as you already had)
      cacheSection(sec, sectionName);
      hasCachedChanges = true;

      setSectionEditing(sec, false);
      updateVisitingCongregationVisibility();

      // Auto-collapse on save
      const collapseEl = sec.closest(".accordion-collapse");
      if (collapseEl) {
        bootstrap.Collapse.getOrCreateInstance(collapseEl, {
          toggle: false,
        }).hide();
      }
    } else {
      // EDIT
      setSectionEditing(sec, true);
      updateVisitingCongregationVisibility();
    }

    updateFinalizeState();
    updateVolunteerPickerState();
  });

  // ---------------------------------------------------------------------
  // Return Home button
  // ---------------------------------------------------------------------

  const returnHomeBtn = document.getElementById("return-home");
  if (returnHomeBtn) {
    returnHomeBtn.addEventListener("click", (e) => {
      if (userHasUnsavedChanges()) {
        const leave = confirm(
          "You have unsaved changes. Are you sure you want to leave this page?",
        );
        if (!leave) {
          e.preventDefault();
          return;
        }
      }
      window.__suppressBeforeUnload = true;
      window.location.href = "/";
    });
  }

  // ---------------------------------------------------------------------
  // Finalize handler (only if button exists)
  // ---------------------------------------------------------------------

  if (finalizeBtn && finalizeStatus) {
    finalizeBtn.addEventListener("click", async () => {
      finalizeStatus.innerHTML = "";

      if (!allLocked()) {
        finalizeStatus.innerHTML = `
                    <div class="alert alert-warning">
                        Please save all sections before finalizing.
                    </div>`;
        return;
      }

      finalizeBtn.disabled = true;
      finalizeBtn.textContent = "Saving...";

      const csrf = document.querySelector('input[name="_csrf"]')?.value || "";
      const targetUserId = getTargetUserId();

      if (!targetUserId) {
        finalizeStatus.innerHTML = `
                    <div class="alert alert-warning">
                        No volunteer selected to edit.
                    </div>`;
        finalizeBtn.disabled = false;
        finalizeBtn.textContent = "Finalize Changes";
        return;
      }

      try {
        const res = await fetch("/edit-volunteer/finalize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({
            targetUserId,
            ...window.editVolunteerCache,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
          finalizeStatus.innerHTML = `
                        <div class="alert alert-danger">
                            ${data.message || "Failed to finalize changes."}
                        </div>`;
          finalizeBtn.disabled = false;
          finalizeBtn.textContent = "Finalize Changes";
          return;
        }

        hasFinalized = true;
        hasCachedChanges = false;

        finalizeStatus.innerHTML = `
                    <div class="alert alert-success">
                        Your changes have been saved.
                    </div>`;
        finalizeBtn.textContent = "Finalize Changes";
        finalizeBtn.disabled = true;
      } catch (err) {
        console.error(err);
        finalizeStatus.innerHTML = `
                    <div class="alert alert-danger">
                        Server error. Try again.
                    </div>`;
        finalizeBtn.disabled = false;
        finalizeBtn.textContent = "Finalize Changes";
      }
    });
  }
});
