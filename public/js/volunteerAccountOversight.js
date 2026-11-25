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

  /**
   * Each section's values as last stored in the database (at page load, then
   * after every successful finalize), as JSON keyed by section name. A page
   * has unsaved changes only when a section's current values differ from
   * these, so opening a section and saving it unchanged, or finalizing,
   * leaves nothing to warn about.
   * @type {Record<string, string>}
   */
  let savedValues = {};

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
    return editableSections().some(
      ({ sec, name }) =>
        name in savedValues && sectionValuesJson(sec, name) !== savedValues[name],
    );
  }

  /**
   * Every editable section: its .accordion-body and its name, taken from the
   * section's EDIT / SAVE button (data-section).
   *
   * @returns {Array<{ sec: HTMLElement, name: string }>}
   */
  function editableSections() {
    return Array.from(root.querySelectorAll(".summary-edit-btn[data-section]"))
      .map((btn) => ({
        sec: /** @type {HTMLElement|null} */ (btn.closest(".accordion-body")),
        name: /** @type {HTMLElement} */ (btn).dataset.section || "",
      }))
      .filter((s) => s.sec && s.name);
  }

  /**
   * A section's current values as JSON, read the same way they are cached
   * for finalize (cacheSection), without touching the cache.
   *
   * @param {HTMLElement} sec - The section's .accordion-body.
   * @param {string} name - Section name (data-section).
   * @returns {string}
   */
  function sectionValuesJson(sec, name) {
    const cache = window.editVolunteerCache;
    const had = Object.prototype.hasOwnProperty.call(cache, name);
    const previous = cache[name];
    cacheSection(sec, name);
    const json = JSON.stringify(cache[name] ?? null);
    if (had) cache[name] = previous;
    else delete cache[name];
    return json;
  }

  /**
   * Record every section's current values as the saved state.
   * @returns {void}
   */
  function rememberSavedValues() {
    savedValues = {};
    editableSections().forEach(({ sec, name }) => {
      savedValues[name] = sectionValuesJson(sec, name);
    });
  }

  /**
   * Clear cached edits for the current target volunteer.
   * @returns {void}
   */
  function clearEditVolunteerCache() {
    window.editVolunteerCache = {};

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
    /** @type {string} */
    let activeGender = "all";

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
        const matchGender =
          activeGender === "all" || (opt.dataset.gender || "") === activeGender;
        const show = matchStatus && matchApproval && matchGender;

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

    root.querySelectorAll(".gender-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        root
          .querySelectorAll(".gender-filter-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        activeGender = btn.dataset.filterGender || "all";
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

  // Coming back with the browser's Back / Forward restores this page as it
  // was, including a suppress flag set when it was left on purpose; clear
  // it so the guard works again for changes made from here.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) window.__suppressBeforeUnload = false;
  });

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

  // Baseline for the unsaved-changes guard, taken once every script that
  // adjusts fields on load (privilege rules, phone and date formatting) has run.
  rememberSavedValues();

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
        // Crews only: positions are changed on the Positions page (phase 3d-7e).
        window.editVolunteerCache.assignment = {
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
      // SAVE — cache it for finalize only if it actually changed
      cacheSection(sec, sectionName);
      if (
        JSON.stringify(window.editVolunteerCache[sectionName] ?? null) ===
        savedValues[sectionName]
      ) {
        delete window.editVolunteerCache[sectionName];
      }

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

        // What's on screen is now what's stored: nothing left to warn about
        window.editVolunteerCache = {};
        rememberSavedValues();

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

  /**
   * Update the Active toggle, its label and the Status header badge.
   *
   * @param {boolean} active
   * @returns {void}
   */
  function setActiveUi(active) {
    const toggle = /** @type {HTMLInputElement | null} */ (
      document.getElementById("activeToggle")
    );
    const label = document.getElementById("activeToggleLabel");
    if (toggle) toggle.checked = active;
    if (label) label.textContent = active ? "Active this year" : "Inactive this year";

    const headerBadge = document.querySelector(
      "#statusAccordionItem .accordion-button .badge",
    );
    if (headerBadge) {
      headerBadge.textContent = active ? "Active" : "Inactive";
      headerBadge.className = active
        ? "badge bg-success ms-2"
        : "badge bg-secondary ms-2";
    }
  }

  /**
   * Show or hide the "not approved for parking" state in the Status panel.
   *
   * @param {boolean} disapproved
   * @param {string}  [meta] - "Marked by … on …." text when marking.
   * @returns {void}
   */
  function setDisapprovedUi(disapproved, meta) {
    const panel = document.getElementById("disapprovalPanel");
    if (!panel) return;
    panel.dataset.disapproved = disapproved ? "1" : "0";
    document.getElementById("disapprovedNotice")?.classList.toggle("d-none", !disapproved);
    document.getElementById("disapprovedHeaderBadge")?.classList.toggle("d-none", !disapproved);
    document.getElementById("disapproveHelp")?.classList.toggle("d-none", disapproved);
    document.getElementById("disapproveBtn")?.classList.toggle("d-none", disapproved);
    document.getElementById("clearDisapprovalBtn")?.classList.toggle("d-none", !disapproved);
    document.getElementById("reactivateConfirm")?.classList.add("d-none");
    const metaEl = document.getElementById("disapprovedMeta");
    if (metaEl && meta !== undefined) metaEl.textContent = meta;
  }

  /**
   * Show a short status message next to a control, clearing it after 3s.
   *
   * @param {HTMLElement|null} el
   * @param {string} text
   * @param {"muted"|"success"|"danger"} tone
   * @returns {void}
   */
  function flashStatus(el, text, tone) {
    if (!el) return;
    el.textContent = text;
    el.className = `small text-${tone}${el.id === "disapprovalStatus" ? " ms-2" : ""}`;
    if (tone !== "muted") {
      setTimeout(() => {
        if (el.textContent === text) el.textContent = "";
      }, 3000);
    }
  }

  /**
   * POST JSON to an edit-volunteer endpoint with the page's CSRF token.
   *
   * @param {string} url
   * @param {object} body
   * @returns {Promise<{ ok: boolean, status: number, data: any }>}
   */
  async function postVolunteerJson(url, body) {
    const csrf = document.querySelector('input[name="_csrf"]')?.value || "";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && !!data.success, status: res.status, data };
  }

  function initActiveToggle() {
    const toggle = /** @type {HTMLInputElement | null} */ (
      document.getElementById("activeToggle")
    );
    const status = document.getElementById("activeToggleStatus");
    const confirmBox = document.getElementById("reactivateConfirm");

    if (!toggle) return;

    /**
     * Save the Active state; `confirmReactivate` clears a parking
     * "not approved" mark when turning Active on.
     *
     * @param {boolean} active
     * @param {boolean} confirmReactivate
     * @returns {Promise<void>}
     */
    async function saveActive(active, confirmReactivate) {
      const targetUserId = getTargetUserId();
      if (!targetUserId) {
        setActiveUi(!active);
        return;
      }

      flashStatus(status, "Saving…", "muted");

      try {
        const { ok, status: code, data } = await postVolunteerJson(
          "/edit-volunteer/active",
          { targetUserId, active, confirmReactivate },
        );

        if (code === 409 && data.needsConfirm) {
          // Not approved for parking this year — ask before reactivating.
          setActiveUi(false);
          if (status) status.textContent = "";
          confirmBox?.classList.remove("d-none");
          return;
        }

        if (!ok) {
          setActiveUi(!active);
          flashStatus(status, data.message || "Failed to save.", "danger");
          return;
        }

        setActiveUi(active);
        if (active) setDisapprovedUi(false, "");
        flashStatus(status, active ? "Marked active." : "Marked inactive.", "success");
      } catch (err) {
        console.error("[oversight] activeToggle error:", err);
        setActiveUi(!active);
        flashStatus(status, "Server error.", "danger");
      }
    }

    toggle.addEventListener("change", () => {
      const active = toggle.checked;
      const panel = document.getElementById("disapprovalPanel");
      if (active && panel?.dataset.disapproved === "1") {
        // Ask first; the server would refuse without confirmation anyway.
        setActiveUi(false);
        confirmBox?.classList.remove("d-none");
        return;
      }
      saveActive(active, false);
    });

    document.getElementById("reactivateConfirmBtn")?.addEventListener("click", () => {
      confirmBox?.classList.add("d-none");
      saveActive(true, true);
    });

    document.getElementById("reactivateCancelBtn")?.addEventListener("click", () => {
      confirmBox?.classList.add("d-none");
    });
  }

  /**
   * "Not approved for parking" mark / clear buttons in the Status panel.
   *
   * @returns {void}
   */
  function initDisapproval() {
    const panel = document.getElementById("disapprovalPanel");
    if (!panel) return;
    const status = document.getElementById("disapprovalStatus");
    const year = panel.dataset.activeYear;

    /**
     * @param {boolean} disapproved
     * @returns {Promise<void>}
     */
    async function save(disapproved) {
      const targetUserId = getTargetUserId();
      if (!targetUserId) return;
      flashStatus(status, "Saving…", "muted");
      try {
        const { ok, data } = await postVolunteerJson("/edit-volunteer/disapprove", {
          targetUserId,
          disapproved,
        });
        if (!ok) {
          flashStatus(status, data.message || "Failed to save.", "danger");
          return;
        }
        if (disapproved) {
          const when = new Date(data.at).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric",
          });
          setDisapprovedUi(true, `Marked by ${data.by} on ${when}.`);
          setActiveUi(false);
          flashStatus(status, `Marked not approved for ${year}.`, "success");
        } else {
          setDisapprovedUi(false, "");
          flashStatus(status, "Cleared — still inactive.", "success");
        }
      } catch (err) {
        console.error("[oversight] disapproval error:", err);
        flashStatus(status, "Server error.", "danger");
      }
    }

    document.getElementById("disapproveBtn")?.addEventListener("click", () => save(true));
    document.getElementById("clearDisapprovalBtn")?.addEventListener("click", () => save(false));
  }
  // ---------------------------------------------------------------------
  // Convention Invitations — set an answer (saved at once)
  // ---------------------------------------------------------------------

  /**
   * Initialise the Convention Invitations panel. Each invitation shows its
   * campaign's own answers, plus Other (when allowed) and No answer.
   * Clicking an answer saves it at once (not through finalize); Other
   * opens a text box with its own Save. Saved with source 'oversight'
   * (POST /edit-volunteer/set-rsvp).
   * @returns {void}
   */
  function initRsvpPanel() {
    const panel = root.querySelector("#collapseInvitations");
    if (!panel) return;

    /** @returns {string} */
    function getCsrf() {
      return document.querySelector('input[name="_csrf"]')?.value || "";
    }

    /**
     * Show which answer is saved: the filled button is the current one.
     * @param {HTMLElement} box - The .rsvp-answer element.
     * @param {string} active - Answer value ("" for no answer).
     * @returns {void}
     */
    function syncButtons(box, active) {
      box.querySelectorAll(".rsvp-btn").forEach((btn) => {
        const el = /** @type {HTMLElement} */ (btn);
        const tone = el.dataset.tone || "primary";
        const on = (el.dataset.response ?? "") === active;
        el.classList.toggle(`btn-${tone}`, on);
        el.classList.toggle(`btn-outline-${tone}`, !on);
        el.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }

    /**
     * Show a short status under the answer.
     * @param {HTMLElement} box
     * @param {string} text
     * @param {"muted"|"success"|"danger"} tone
     * @returns {void}
     */
    function setStatus(box, text, tone) {
      const el = box.querySelector(".rsvp-status");
      if (!el) return;
      el.textContent = text;
      el.className = `rsvp-status mt-1 text-${tone}`;
    }

    /**
     * Save an answer for the invitation in `box`.
     * @param {HTMLElement} box
     * @param {string} response - Answer value; "" clears it.
     * @param {string|null} responseOther - Words for "other".
     * @returns {Promise<void>}
     */
    async function save(box, response, responseOther) {
      const invitationId = Number(box.dataset.invitationId);
      if (!invitationId) return;
      const controls = box.querySelectorAll("button, input");
      controls.forEach((c) => { /** @type {HTMLButtonElement} */ (c).disabled = true; });
      setStatus(box, "Saving…", "muted");

      try {
        const res = await fetch("/edit-volunteer/set-rsvp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrf(),
          },
          body: JSON.stringify({ invitationId, response, responseOther }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          setStatus(box, data.error || "Save failed.", "danger");
          return;
        }
        syncButtons(box, response);
        if (response !== "other") box.querySelector(".rsvp-other")?.classList.add("d-none");
        setStatus(box, "Saved.", "success");
        setTimeout(() => setStatus(box, "", "muted"), 2500);
      } catch (err) {
        console.error("[oversight] set-rsvp error:", err);
        setStatus(box, "Network error.", "danger");
      } finally {
        controls.forEach((c) => { /** @type {HTMLButtonElement} */ (c).disabled = false; });
      }
    }

    panel.addEventListener("click", (ev) => {
      const target = ev.target instanceof Element ? ev.target : null;
      const box = /** @type {HTMLElement|null} */ (target?.closest(".rsvp-answer"));
      if (!target || !box) return;

      const otherSave = target.closest(".rsvp-other-save");
      if (otherSave) {
        const input = /** @type {HTMLInputElement|null} */ (box.querySelector(".rsvp-other-input"));
        const words = (input?.value || "").trim();
        if (!words) {
          setStatus(box, "Type the answer for Other.", "danger");
          input?.focus();
          return;
        }
        save(box, "other", words);
        return;
      }

      const btn = /** @type {HTMLElement|null} */ (target.closest(".rsvp-btn"));
      if (!btn) return;
      const response = btn.dataset.response ?? "";
      if (btn.getAttribute("aria-pressed") === "true" && response !== "other") return;

      // Other needs words first: open the box rather than saving
      if (response === "other") {
        const wrap = box.querySelector(".rsvp-other");
        wrap?.classList.remove("d-none");
        /** @type {HTMLInputElement|null} */ (wrap?.querySelector("input"))?.focus();
        return;
      }
      save(box, response, null);
    });

    // Enter in the Other box saves it
    panel.addEventListener("keydown", (ev) => {
      const input = ev.target instanceof HTMLInputElement && ev.target.classList.contains("rsvp-other-input") ? ev.target : null;
      if (!input || ev.key !== "Enter") return;
      ev.preventDefault();
      /** @type {HTMLButtonElement|null} */ (input.closest(".rsvp-other")?.querySelector(".rsvp-other-save"))?.click();
    });
  }
  // ─────────────────────────────────────────────────────────────────────────
  //  Blackout Windows panel
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Convert an HH:MM string from <input type="time"> to minutes from midnight.
   * @param {string} str
   * @returns {number}
   */
  function _bkTimeToMins(str) {
    const [h, m] = (str || "").split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  /**
   * Format minutes from midnight as "h:MM AM/PM".
   * @param {number} mins
   * @returns {string}
   */
  function _bkFmtMins(mins) {
    const h = Math.floor(mins / 60),
      m = mins % 60,
      ap = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ap}`;
  }

  /**
   * Initialise the Blackout Windows accordion section.
   * Wires the day picker, fetches blackouts via AJAX, and handles add/delete.
   *
   * @returns {void}
   */
  function initBlackoutsPanel() {
    const daySelect = document.getElementById("bkDaySelect");
    const listEl = document.getElementById("bkList");
    const addForm = document.getElementById("bkAddForm");
    const startInput = document.getElementById("bkStart");
    const endInput = document.getElementById("bkEnd");
    const reasonInput = document.getElementById("bkReason");
    const addBtn = document.getElementById("bkAddBtn");
    const statusEl = document.getElementById("bkFormStatus");

    if (!daySelect || !listEl) return;

    /** @returns {string} */
    function getCsrf() {
      return document.querySelector('input[name="_csrf"]')?.value || "";
    }

    /** @returns {number} */
    function getVolId() {
      return Number(document.getElementById("targetUserId")?.value || 0);
    }

    /**
     * Render a list of blackout rows into the list container.
     * @param {Array<{id:number, start_mins:number, end_mins:number, reason:string|null}>} blackouts
     * @param {number} dayId
     * @returns {void}
     */
    function renderList(blackouts, dayId) {
      listEl.innerHTML = "";
      if (blackouts.length === 0) {
        const p = document.createElement("p");
        p.classList.add("text-muted", "small", "mb-0");
        p.textContent = "No blackouts for this day.";
        listEl.appendChild(p);
        return;
      }

      const table = document.createElement("table");
      table.classList.add("table", "table-sm", "table-hover", "small", "mb-0");
      table.innerHTML = `
        <thead class="table-light">
          <tr><th>Time range</th><th>Reason</th><th></th></tr>
        </thead>`;
      const tbody = document.createElement("tbody");

      for (const bk of blackouts) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="text-nowrap fw-semibold">${_bkFmtMins(bk.start_mins)} – ${_bkFmtMins(bk.end_mins)}</td>
          <td class="text-muted">${bk.reason || "—"}</td>
          <td class="text-end">
            <button type="button" class="btn btn-outline-danger btn-sm bk-del-btn"
              data-id="${bk.id}" data-start="${bk.start_mins}" data-end="${bk.end_mins}">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </td>`;
        tbody.appendChild(tr);
      }

      table.appendChild(tbody);
      listEl.appendChild(table);

      // Wire delete buttons
      tbody.querySelectorAll(".bk-del-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          try {
            const res = await fetch(
              `/edit-volunteer/blackouts/${btn.dataset.id}`,
              {
                method: "DELETE",
                headers: { "X-CSRF-Token": getCsrf() },
              },
            );
            const data = await res.json().catch(() => ({}));
            if (data.success) {
              await loadList(dayId);
            }
          } catch (err) {
            console.error("[blackouts] delete error:", err);
            btn.disabled = false;
          }
        });
      });
    }

    /**
     * Fetch and render blackouts for the given day and current volunteer.
     * @param {number} dayId
     * @returns {Promise<void>}
     */
    async function loadList(dayId) {
      const volId = getVolId();
      if (!volId || !dayId) return;

      listEl.innerHTML =
        '<p class="text-muted small"><span class="spinner-border spinner-border-sm me-1"></span>Loading…</p>';
      try {
        const res = await fetch(
          `/edit-volunteer/blackouts/${volId}?dayId=${dayId}`,
        );
        const data = await res.json().catch(() => ({}));
        renderList(data.blackouts || [], dayId);
      } catch {
        listEl.innerHTML =
          '<p class="text-danger small">Failed to load blackouts.</p>';
      }
    }

    // Day picker change
    daySelect.addEventListener("change", async () => {
      const dayId = Number(daySelect.value);
      if (!dayId) {
        listEl.innerHTML = "";
        addForm?.classList.add("d-none");
        return;
      }
      addForm?.classList.remove("d-none");
      await loadList(dayId);
    });

    // Add button
    addBtn?.addEventListener("click", async () => {
      const dayId = Number(daySelect.value);
      const volId = getVolId();
      const startVal = /** @type {HTMLInputElement} */ (startInput)?.value;
      const endVal = /** @type {HTMLInputElement} */ (endInput)?.value;

      if (!startVal || !endVal) {
        if (statusEl) {
          statusEl.textContent = "Start and end times are required.";
          statusEl.className = "small text-danger";
        }
        return;
      }

      const startMins = _bkTimeToMins(startVal);
      const endMins = _bkTimeToMins(endVal);

      if (endMins <= startMins) {
        if (statusEl) {
          statusEl.textContent = "End must be after start.";
          statusEl.className = "small text-danger";
        }
        return;
      }

      if (statusEl) {
        statusEl.textContent = "Saving…";
        statusEl.className = "small text-muted";
      }
      addBtn.disabled = true;

      try {
        const res = await fetch("/edit-volunteer/blackouts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrf(),
          },
          body: JSON.stringify({
            volunteerId: volId,
            conventionDayId: dayId,
            startMins,
            endMins,
            reason:
              /** @type {HTMLInputElement} */ (reasonInput)?.value.trim() ||
              null,
          }),
        });
        const data = await res.json().catch(() => ({}));

        if (data.success) {
          /** @type {HTMLInputElement} */ (startInput).value = "";
          /** @type {HTMLInputElement} */ (endInput).value = "";
          /** @type {HTMLInputElement} */ (reasonInput).value = "";
          if (statusEl) {
            statusEl.textContent = "";
          }
          await loadList(dayId);
        } else {
          if (statusEl) {
            statusEl.textContent = data.error || "Failed to save.";
            statusEl.className = "small text-danger";
          }
        }
      } catch (err) {
        console.error("[blackouts] create error:", err);
        if (statusEl) {
          statusEl.textContent = "Network error.";
          statusEl.className = "small text-danger";
        }
      } finally {
        addBtn.disabled = false;
      }
    });
  }
  initDeleteReinstateActions();
  initActiveToggle();
  initDisapproval();
  initRsvpPanel();
  initBlackoutsPanel();
  initCollapseGuard();
  initSmsTab();
});

// ─────────────────────────────────────────────────────────────────────────────
// SMS Management tab
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @file volunteerAccountOversight.js (SMS section)
 * @description SMS opt-in/out management tab.
 *
 * Fetches all volunteers with SMS status via GET /oversight/tools/sms-management,
 * renders them in a filterable table, and allows manual opt-in/opt-out toggling
 * via POST /oversight/tools/sms-management/toggle.
 */

/**
 * Initialise the SMS management tab.
 * Loads data when the tab is first shown, wires filter/search/toggle handlers.
 * @returns {void}
 */
function initSmsTab() {
  const smsTab      = document.getElementById("vao-sms-tab");
  const tableBody   = document.getElementById("smsTableBody");
  const table       = document.getElementById("smsTable");
  const loading     = document.getElementById("smsLoading");
  const noResults   = document.getElementById("smsNoResults");
  const searchInput = document.getElementById("smsSearch");

  if (!smsTab || !tableBody) return;

  /** @type {Array<object>} Full volunteer list from server */
  let allVolunteers = [];
  /** @type {string} Current SMS filter value */
  let activeFilter = "all";
  /** @type {boolean} Whether data has been loaded yet */
  let loaded = false;

  /**
   * Get the CSRF token from the hidden input.
   * @returns {string}
   */
  function getCsrf() {
    return document.querySelector('input[name="_csrf"]')?.value || "";
  }

  /**
   * Derive the SMS status label for a volunteer row.
   * @param {{ sms_opted_in: boolean, sms_opted_out: boolean, smsCapable: boolean }} v
   * @returns {'opted_in'|'opted_out'|'never'}
   */
  function smsStatus(v) {
    if (v.sms_opted_out) return "opted_out";
    if (v.sms_opted_in)  return "opted_in";
    return "never";
  }

  /**
   * Format a date value as a short locale string, or return '—'.
   * @param {string|null} val
   * @returns {string}
   */
  function fmtDate(val) {
    if (!val) return "—";
    return new Date(val).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  }

  /**
   * Render the table based on current filter + search text.
   * @returns {void}
   */
  function renderTable() {
    const search = (searchInput?.value || "").toLowerCase().trim();
    const filtered = allVolunteers.filter((v) => {
      const status = smsStatus(v);
      const matchesFilter = activeFilter === "all" || status === activeFilter;
      const fullName = `${v.lastName} ${v.firstName}`.toLowerCase();
      const matchesSearch = !search || fullName.includes(search);
      return matchesFilter && matchesSearch;
    });

    tableBody.innerHTML = "";

    if (filtered.length === 0) {
      table?.classList.add("d-none");
      noResults?.classList.remove("d-none");
      return;
    }

    table?.classList.remove("d-none");
    noResults?.classList.add("d-none");

    filtered.forEach((v) => {
      const status  = smsStatus(v);
      const isOut   = status === "opted_out";
      const isIn    = status === "opted_in";

      const statusBadge = isOut
        ? `<span class="badge bg-danger">Opted Out</span>`
        : isIn
          ? `<span class="badge bg-success">Opted In</span>`
          : `<span class="badge bg-secondary">Never</span>`;

      const actionBtn = isOut
        ? `<button class="btn btn-sm btn-outline-success sms-toggle-btn"
              data-vol-id="${v.id}" data-opt-out="false">
              <i class="fa-solid fa-rotate-left me-1"></i>Re-opt In
           </button>`
        : `<button class="btn btn-sm btn-outline-danger sms-toggle-btn"
              data-vol-id="${v.id}" data-opt-out="true">
              <i class="fa-solid fa-ban me-1"></i>Opt Out
           </button>`;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="fw-semibold">${v.lastName}, ${v.firstName}${v.suffix ? " " + v.suffix : ""}</td>
        <td class="text-muted small">${v.phone || "—"}</td>
        <td>${v.smsCapable ? '<i class="fa-solid fa-check text-success"></i>' : '<span class="text-muted">—</span>'}</td>
        <td>${statusBadge}</td>
        <td class="text-muted small">${fmtDate(v.sms_opted_in_at)}${v.sms_opted_in_source ? " <span class='text-muted'>(" + v.sms_opted_in_source + ")</span>" : ""}</td>
        <td class="text-muted small">${fmtDate(v.sms_opted_out_at)}</td>
        <td class="text-end">${actionBtn}</td>
      `;
      tableBody.appendChild(tr);
    });

    // Wire toggle buttons
    tableBody.querySelectorAll(".sms-toggle-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const volId  = Number(btn.dataset.volId);
        const optOut = btn.dataset.optOut === "true";
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;

        try {
          const res = await fetch("/oversight/tools/sms-management/toggle", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": getCsrf(),
            },
            body: JSON.stringify({ volunteerId: volId, optOut }),
          });
          const data = await res.json();
          if (!data.success) throw new Error(data.error || "Failed");

          // Update local data and re-render
          const vol = allVolunteers.find((v) => v.id === volId);
          if (vol) {
            if (optOut) {
              vol.sms_opted_out    = true;
              vol.sms_opted_out_at = new Date().toISOString();
              vol.sms_opted_in     = false;
            } else {
              vol.sms_opted_out    = false;
              vol.sms_opted_out_at = null;
              vol.sms_opted_in     = true;
              vol.sms_opted_in_at  = new Date().toISOString();
              vol.sms_opted_in_source = "admin";
            }
          }
          renderTable();
        } catch (err) {
          console.error("[smsTab] toggle error:", err);
          btn.disabled = false;
          btn.textContent = "Error — retry";
        }
      });
    });
  }

  /**
   * Fetch volunteer SMS data from the server.
   * Called once when the tab is first activated.
   * @returns {Promise<void>}
   */
  async function loadData() {
    try {
      const res  = await fetch("/oversight/tools/sms-management");
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Load failed");
      allVolunteers = data.volunteers;
      loading?.classList.add("d-none");
      renderTable();
    } catch (err) {
      console.error("[smsTab] load error:", err);
      if (loading) {
        loading.textContent = "Failed to load SMS data.";
        loading.classList.add("text-danger");
      }
    }
  }

  // Load on first tab show
  smsTab.addEventListener("shown.bs.tab", () => {
    if (!loaded) {
      loaded = true;
      loadData();
    }
  });

  // Filter buttons
  document.querySelectorAll(".sms-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".sms-filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.dataset.smsFilter;
      renderTable();
    });
  });

  // Search
  searchInput?.addEventListener("input", () => renderTable());

  // Auto-activate SMS tab if ?tab=sms in URL
  if (new URLSearchParams(window.location.search).get("tab") === "sms") {
    smsTab.click();
  }
}
