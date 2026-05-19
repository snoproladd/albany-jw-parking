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
      Array.from(root.querySelectorAll(".accordion-body")).filter(
        (s) => s.dataset.section !== "status",
      )
    );
    if (!bodies.length) return true;
    return bodies.every((s) => s.dataset.editing !== "true");
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

  /**
   * Show or hide the assigned vs visiting congregation blocks based on
   * the current state of the congAssigned radio buttons.
   * @returns {void}
   */
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
    if (sec.dataset.section === "status") return;
    setSectionEditing(sec, false);
  });

  updateVisitingCongregationVisibility();
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

    let lastValue = pickerSelect.value;

    pickerSelect.addEventListener("focus", () => {
      lastValue = pickerSelect.value;
    });

    pickerSelect.addEventListener("change", () => {
      if (!pickerSelect.value) return;

      if (anySectionEditing()) {
        alert(
          "Please SAVE (or cancel) your edits before switching volunteers.",
        );
        pickerSelect.value = lastValue;
        return;
      }

      if (userHasUnsavedChanges()) {
        const ok = confirm(
          "You have unsaved changes for this volunteer. Switch volunteers and discard them?",
        );
        if (!ok) {
          pickerSelect.value = lastValue;
          return;
        }
      }

      window.__suppressBeforeUnload = true;
      clearEditVolunteerCache();
      updateVisitingCongregationVisibility();
      pickerForm.submit();
    });
  })();

  // ---------------------------------------------------------------------
  // Volunteer filter (status + active buttons)
  // ---------------------------------------------------------------------

  /**
   * Initialise the filter button panel above the volunteer select.
   * @returns {void}
   */
  (function initVolunteerFilter() {
    const select = /** @type {HTMLSelectElement | null} */ (
      root.querySelector("#volunteerSelect")
    );
    const countEl = document.getElementById("volunteerFilterCount");
    if (!select) return;

    /** @type {string} */
    let activeStatus = "all";
    /** @type {string} */
    let activeApproval = "all";

    /**
     * Apply current filter state to the select options.
     * @returns {void}
     */
    function applyFilter() {
      let visible = 0;
      let currentStillVisible = false;
      const currentVal = select.value;

      Array.from(select.options).forEach((opt) => {
        if (!opt.value) return;

        const matchStatus =
          activeStatus === "all" || opt.dataset.status === activeStatus;
        const matchApproval =
          activeApproval === "all" || opt.dataset.active === activeApproval;
        const show = matchStatus && matchApproval;

        opt.hidden = !show;
        opt.disabled = !show;

        if (show) {
          visible++;
          if (opt.value === currentVal) currentStillVisible = true;
        }
      });

      if (currentVal && !currentStillVisible) {
        select.value = "";
      }

      if (countEl) {
        countEl.textContent = `${visible} volunteer${visible !== 1 ? "s" : ""}`;
      }
    }

    root.querySelectorAll(".status-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        root
          .querySelectorAll(".status-filter-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        activeStatus = btn.dataset.filterStatus || "all";
        applyFilter();
      });
    });

    root.querySelectorAll(".active-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        root
          .querySelectorAll(".active-filter-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        activeApproval = btn.dataset.filterActive || "all";
        applyFilter();
      });
    });

    applyFilter();

    // "Show deleted" checkbox — reloads page with includeDeleted param
    // since deleted volunteers come from the server, not client-side filtering.
    const deletedChk = /** @type {HTMLInputElement|null} */ (
      document.getElementById("includeDeletedChk")
    );
    const pickerFormForDeleted = /** @type {HTMLFormElement|null} */ (
      root.querySelector('form[action="/selectVolEdit"]')
    );
    deletedChk?.addEventListener("change", () => {
      if (!pickerFormForDeleted) return;
      const hiddenInput = /** @type {HTMLInputElement|null} */ (
        pickerFormForDeleted.querySelector('input[name="includeDeleted"]')
      );
      if (hiddenInput) hiddenInput.value = deletedChk.checked ? "1" : "0";
      // Clear selected volunteer and reload list
      const sel = /** @type {HTMLSelectElement|null} */ (
        pickerFormForDeleted.querySelector("#volunteerSelect")
      );
      if (sel) sel.value = "";
      window.__suppressBeforeUnload = true;
      pickerFormForDeleted.submit();
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
  // Privilege rules init
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

  // ---------------------------------------------------------------------
  // Collapse guard — prevent opening/closing while a section is in edit mode
  // ---------------------------------------------------------------------

  /**
   * Intercept Bootstrap's collapse show/hide events on the accordion.
   *
   * hide.bs.collapse — if the panel being closed is still in edit mode,
   *   cancel the collapse and flash its SAVE button.
   *
   * show.bs.collapse — if any OTHER panel is currently in edit mode,
   *   cancel the open and flash that panel's SAVE button.
   *
   * Both events fire on the .accordion-collapse element itself.
   * The .accordion-body is a direct child of that element.
   *
   * @returns {void}
   */
  function initCollapseGuard() {
    const accordion = root.querySelector("#accountAccordion");
    if (!accordion) return;

    /**
     * Briefly flash the SAVE button on a section body.
     * @param {HTMLElement} body
     * @returns {void}
     */
    function flashSaveBtn(body) {
      const saveBtn = /** @type {HTMLButtonElement | null} */ (
        body.querySelector(".summary-edit-btn")
      );
      if (!saveBtn) return;

      saveBtn.classList.add("btn-warning", "shake-once");
      saveBtn.classList.remove("btn-success");
      setTimeout(() => {
        saveBtn.classList.remove("btn-warning", "shake-once");
        saveBtn.classList.add("btn-success");
      }, 1200);
    }

    accordion.addEventListener("hide.bs.collapse", (ev) => {
      const collapseEl = /** @type {HTMLElement} */ (ev.target);
      const body = collapseEl.querySelector(":scope > .accordion-body");
      if (!body || body.dataset.editing !== "true") return;

      ev.preventDefault();
      flashSaveBtn(/** @type {HTMLElement} */ (body));
    });

    accordion.addEventListener("show.bs.collapse", (ev) => {
      const collapseEl = /** @type {HTMLElement} */ (ev.target);
      const editingBody = Array.from(
        accordion.querySelectorAll(".accordion-body"),
      ).find((body) => {
        const parentCollapse = body.closest(".accordion-collapse");
        return parentCollapse !== collapseEl && body.dataset.editing === "true";
      });

      if (!editingBody) return;

      ev.preventDefault();
      flashSaveBtn(/** @type {HTMLElement} */ (editingBody));
    });
  }

  // ---------------------------------------------------------------------
  // Cache section values
  // ---------------------------------------------------------------------

  /**
   * Cache the current form values for a section by name.
   * @param {HTMLElement} sec
   * @param {string} section
   * @returns {void}
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

      case "assignment":
        window.editVolunteerCache.assignment = {
          newRole: sec.querySelector('[name="newRole"]')?.value || "REGISTERED",
          crew_lots_garages:
            sec.querySelector('[name="crew_lots_garages"]')?.checked || false,
          crew_signs:
            sec.querySelector('[name="crew_signs"]')?.checked || false,
          crew_security:
            sec.querySelector('[name="crew_security"]')?.checked || false,
          crew_mobile_support:
            sec.querySelector('[name="crew_mobile_support"]')?.checked || false,
          crew_dropoff_pickup:
            sec.querySelector('[name="crew_dropoff_pickup"]')?.checked || false,
        };
        break;
    }
  }

  // ---------------------------------------------------------------------
  // congAssigned radio change → update visibility
  // ---------------------------------------------------------------------

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
  // Finalize handler
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
        const { assignment, ...coreCache } = window.editVolunteerCache;

        const fetchPromises = [
          fetch("/edit-volunteer/finalize", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrf,
            },
            body: JSON.stringify({ targetUserId, ...coreCache }),
          }),
        ];

        if (assignment) {
          fetchPromises.push(
            fetch("/edit-volunteer/assignment", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": csrf,
              },
              body: JSON.stringify({ targetUserId, ...assignment }),
            }),
          );
        }

        const [res, assignRes] = await Promise.all(fetchPromises);

        const data = await res.json().catch(() => ({}));
        const assignData = assignRes
          ? await assignRes.json().catch(() => ({}))
          : { success: true };

        if (!res.ok || !data.success) {
          finalizeStatus.innerHTML = `
                        <div class="alert alert-danger">
                            ${data.message || "Failed to finalize changes."}
                        </div>`;
          finalizeBtn.disabled = false;
          finalizeBtn.textContent = "Finalize Changes";
          return;
        }

        if (assignment && (!assignRes?.ok || !assignData.success)) {
          finalizeStatus.innerHTML = `
                        <div class="alert alert-danger">
                            ${assignData.message || "Failed to save assignment changes."}
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

  // ---------------------------------------------------------------------
  // Active / inactive toggle (immediate AJAX)
  // ---------------------------------------------------------------------

  /**
   * Initialise the active_current_year toggle switch.
   * Fires a standalone POST immediately on change — does not go through finalize.
   * @returns {void}
   */
  /**
   * Wire the delete and reinstate buttons in the danger zone panel.
   * Delete opens a confirmation modal; reinstate confirms inline then POSTs.
   * Both reload the page on success to resync the volunteer list.
   * @returns {void}
   */
  function initDeleteReinstateActions() {
    const deleteBtn = document.getElementById("deleteVolunteerBtn");
    const reinstateBtn = document.getElementById("reinstateVolunteerBtn");
    const modalEl = document.getElementById("deleteVolunteerModal");
    const modalNameEl = document.getElementById("deleteModalName");
    const modalErrEl = document.getElementById("deleteModalError");
    const confirmBtn = document.getElementById("deleteModalConfirmBtn");
    const statusEl = document.getElementById("deleteActionStatus");

    /** @returns {string} */
    function getCsrf() {
      return document.querySelector('input[name="_csrf"]')?.value || "";
    }

    // ── Delete button → open modal ──────────────────────────────────────
    deleteBtn?.addEventListener("click", () => {
      const name = deleteBtn.dataset.name || "this volunteer";
      if (modalNameEl) modalNameEl.textContent = name;
      if (modalErrEl) modalErrEl.classList.add("d-none");
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<i class="fa-solid fa-trash me-1"></i>Delete`;
      }
      if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    });

    // ── Modal confirm → POST delete ────────────────────────────────────
    confirmBtn?.addEventListener("click", async () => {
      const targetUserId = getTargetUserId();
      if (!targetUserId) return;

      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Deleting…`;
      if (modalErrEl) modalErrEl.classList.add("d-none");

      try {
        const res = await fetch("/edit-volunteer/delete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrf(),
          },
          body: JSON.stringify({ targetUserId }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
          if (modalErrEl) {
            modalErrEl.textContent =
              data.message || "Delete failed — please try again.";
            modalErrEl.classList.remove("d-none");
          }
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = `<i class="fa-solid fa-trash me-1"></i>Delete`;
          return;
        }

        // Close modal then reload so the volunteer list resyncs
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();
        window.__suppressBeforeUnload = true;
        window.location.reload();
      } catch (err) {
        console.error("[oversight] delete error:", err);
        if (modalErrEl) {
          modalErrEl.textContent = "Network error — please try again.";
          modalErrEl.classList.remove("d-none");
        }
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<i class="fa-solid fa-trash me-1"></i>Delete`;
      }
    });

    // ── Reinstate button → confirm inline → POST ───────────────────────
    reinstateBtn?.addEventListener("click", async () => {
      const targetUserId = getTargetUserId();
      if (!targetUserId) return;

      if (
        !confirm(
          "Reinstate this volunteer? Their previous status will be restored.",
        )
      )
        return;

      reinstateBtn.disabled = true;
      reinstateBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Reinstating…`;
      if (statusEl) {
        statusEl.textContent = "";
        statusEl.classList.add("d-none");
      }

      try {
        const res = await fetch("/edit-volunteer/reinstate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrf(),
          },
          body: JSON.stringify({ targetUserId }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
          if (statusEl) {
            statusEl.textContent =
              data.message || "Reinstate failed — please try again.";
            statusEl.className = "mt-2 small text-danger";
            statusEl.classList.remove("d-none");
          }
          reinstateBtn.disabled = false;
          reinstateBtn.innerHTML = `<i class="fa-solid fa-rotate-left me-1"></i>Reinstate volunteer`;
          return;
        }

        window.__suppressBeforeUnload = true;
        window.location.reload();
      } catch (err) {
        console.error("[oversight] reinstate error:", err);
        if (statusEl) {
          statusEl.textContent = "Network error — please try again.";
          statusEl.className = "mt-2 small text-danger";
          statusEl.classList.remove("d-none");
        }
        reinstateBtn.disabled = false;
        reinstateBtn.innerHTML = `<i class="fa-solid fa-rotate-left me-1"></i>Reinstate volunteer`;
      }
    });
  }

  function initActiveToggle() {
    const toggle = /** @type {HTMLInputElement | null} */ (
      document.getElementById("activeToggle")
    );
    const label = document.getElementById("activeToggleLabel");
    const status = document.getElementById("activeToggleStatus");

    if (!toggle) return;

    toggle.addEventListener("change", async () => {
      const active = toggle.checked;
      const targetUserId = getTargetUserId();
      const csrf = document.querySelector('input[name="_csrf"]')?.value || "";

      if (!targetUserId) {
        toggle.checked = !active;
        return;
      }

      if (status) {
        status.textContent = "Saving…";
        status.className = "small text-muted";
      }

      try {
        const res = await fetch("/edit-volunteer/active", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({ targetUserId, active }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
          toggle.checked = !active;
          if (status) {
            status.textContent = data.message || "Failed to save.";
            status.className = "small text-danger";
          }
          return;
        }

        if (label)
          label.textContent = active
            ? "Active this year"
            : "Inactive this year";
        if (status) {
          status.textContent = active ? "Marked active." : "Marked inactive.";
          status.className = "small text-success";
        }

        const headerBadge = document.querySelector(
          "#statusAccordionItem .accordion-button .badge",
        );
        if (headerBadge) {
          headerBadge.textContent = active ? "Active" : "Inactive";
          headerBadge.className = active
            ? "badge bg-success ms-2"
            : "badge bg-secondary ms-2";
        }

        setTimeout(() => {
          if (status) status.textContent = "";
        }, 3000);
      } catch (err) {
        console.error("[oversight] activeToggle error:", err);
        toggle.checked = !active;
        if (status) {
          status.textContent = "Server error.";
          status.className = "small text-danger";
        }
      }
    });
  }
  // ---------------------------------------------------------------------
  // RSVP panel — immediate AJAX toggle
  // ---------------------------------------------------------------------

  /**
   * Initialise the Convention Invitations RSVP toggle buttons.
   * Each button group represents one invitation. Clicking a button
   * PATCHes the response immediately — does not go through finalize.
   * Clicking the already-active button clears back to Pending.
   * @returns {void}
   */
  function initRsvpPanel() {
    const accordion = root.querySelector("#accountAccordion");
    if (!accordion) return;

    /** @returns {string} */
    function getCsrf() {
      return document.querySelector('input[name="_csrf"]')?.value || "";
    }

    /**
     * Update button visual states within a toggle group.
     * @param {HTMLElement} group
     * @param {string|null} activeResponse
     * @returns {void}
     */
    function syncGroupButtons(group, activeResponse) {
      const map = {
        yes: ["btn-success", "btn-outline-success"],
        no: ["btn-danger", "btn-outline-danger"],
        maybe: ["btn-warning", "btn-outline-warning"],
        "": ["btn-secondary", "btn-outline-secondary"],
      };

      group.querySelectorAll(".rsvp-btn").forEach((btn) => {
        const resp = btn.dataset.response ?? "";
        const [active, inactive] = map[resp] ?? [
          "btn-secondary",
          "btn-outline-secondary",
        ];
        const isActive = (activeResponse ?? "") === resp;
        btn.classList.toggle(active, isActive);
        btn.classList.toggle(inactive, !isActive);
      });
    }

    accordion.addEventListener("click", async (ev) => {
      const btn = ev.target.closest(".rsvp-btn");
      if (!btn) return;

      const group = btn.closest(".rsvp-toggle-group");
      if (!group) return;

      const invitationId = Number(group.dataset.invitationId);
      if (!invitationId) return;

      const statusEl = group.nextElementSibling;

      // Clicking the already-active button clears to pending
      const currentActive = group.querySelector(
        ".btn-success, .btn-danger, .btn-warning, .btn-secondary:not(.btn-outline-secondary)",
      );
      const clickedResponse = btn.dataset.response;
      const newResponse = currentActive === btn ? "" : clickedResponse;

      // Disable group while saving
      group.querySelectorAll(".rsvp-btn").forEach((b) => {
        b.disabled = true;
      });
      if (statusEl) {
        statusEl.textContent = "Saving…";
        statusEl.className = "rsvp-status mt-1 text-muted";
        statusEl.style.fontSize = "0.72rem";
      }

      try {
        const res = await fetch("/edit-volunteer/set-rsvp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrf(),
          },
          body: JSON.stringify({ invitationId, response: newResponse }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
          if (statusEl) {
            statusEl.textContent = data.error || "Save failed.";
            statusEl.className = "rsvp-status mt-1 text-danger";
            statusEl.style.fontSize = "0.72rem";
          }
        } else {
          syncGroupButtons(group, newResponse);
          if (statusEl) {
            statusEl.textContent = "Saved.";
            statusEl.className = "rsvp-status mt-1 text-success";
            statusEl.style.fontSize = "0.72rem";
            setTimeout(() => {
              statusEl.textContent = "";
            }, 2500);
          }
        }
      } catch (err) {
        console.error("[oversight] set-rsvp error:", err);
        if (statusEl) {
          statusEl.textContent = "Network error.";
          statusEl.className = "rsvp-status mt-1 text-danger";
          statusEl.style.fontSize = "0.72rem";
        }
      } finally {
        group.querySelectorAll(".rsvp-btn").forEach((b) => {
          b.disabled = false;
        });
      }
    });
  }
  initDeleteReinstateActions();
  initActiveToggle();
  initRsvpPanel();
  initCollapseGuard();
});
