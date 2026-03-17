// public/js/formSummary.js
// -----------------------------------------------------------------------------
// Summary page controller:
// - Handles edit/lock toggling for sections
// - Manages congregation assigned/visiting UI
// - Applies privilege rules (via shared enforcer or local fallback)
// - Orchestrates final form submission (including disabled inputs)
// - Provides a print-friendly view
// - Implements a combobox-style congregation autocomplete over a <select>
// -----------------------------------------------------------------------------

(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("summary-form");
    if (!form) return;

    initEditMode(form);
    initCongAssignedToggle(form);
    initPrivilegeRulesForSummary(form);
    initSummarySubmit(form);
    initPrintHandler();
    initCongregationCombobox();
  });

  /* =====================================================
   * EDIT MODE TOGGLING (LOCK BY DEFAULT)
   * ===================================================== */

  function initEditMode(root) {
    const buttons = root.querySelectorAll(".summary-edit-btn");

    buttons.forEach((btn) => {
      const container = btn.closest(".accordion-body");
      if (!container) return;

      container.dataset.editing = "false";
      container.classList.add("summary-locked");
      btn.textContent = "EDIT";

      btn.addEventListener("click", () => {
        const isEditing = container.dataset.editing === "true";
        const nextEditingState = !isEditing;

        // -------------------------------------------------------------
        // VALIDATION BEFORE ALLOWING SAVE
        // -------------------------------------------------------------
        if (isEditing && !nextEditingState) {
          // <<< User clicked SAVE >>>

          // EMAIL gate
          const emailInput = container.querySelector("#email");
          if (emailInput && emailInput.dataset.validEmail === "false") {
            alert("Please fix the email address before saving.");
            return; // Do NOT exit edit mode
          }

          // PHONE gate
          const phoneInput = container.querySelector("#phone");
          if (phoneInput && phoneInput.dataset.validPhone === "false") {
            alert("Please correct the phone number before saving.");
            return; // Do NOT exit edit mode
          }

          // ---------------------------------------------------------
          // AUTO-COLLAPSE THIS ACCORDION SECTION AFTER SAVE
          // ---------------------------------------------------------
          const collapseEl = container.closest(".accordion-collapse");
          if (collapseEl && typeof bootstrap !== "undefined") {
            const bsCollapse = bootstrap.Collapse.getOrCreateInstance(
              collapseEl,
              { toggle: false },
            );
            bsCollapse.hide();
          }
        }
        // -------------------------------------------------------------

        // Toggle editing state + visual lock
        container.dataset.editing = String(nextEditingState);
        container.classList.toggle("summary-locked", !nextEditingState);
        btn.textContent = nextEditingState ? "SAVE" : "EDIT";

        const rootEl = document.getElementById("formSummaryRoot");
        if (rootEl && allSectionsNotEditing(rootEl)) {
          const toast = document.getElementById("submitStatus");
          if (toast) toast.innerHTML = "";
        }
      });
    });
  }

  /* =====================================================
   * EDIT MODE MONITORING
   * ===================================================== */

  function allSectionsNotEditing(root) {
    const containers = root.querySelectorAll(".accordion-body");
    return Array.from(containers).every(
      (container) => container.dataset.editing === "false",
    );
  }

  /* =====================================================
   * EDIT MODE HIGHLIGHTING
   * ===================================================== */

  function highlightEditingSections(root) {
    const containers = root.querySelectorAll(".accordion-body");

    containers.forEach((container) => {
      const isEditing = container.dataset.editing === "true";

      if (isEditing) {
        container.classList.add("border", "border-danger");
      } else {
        container.classList.remove("border", "border-danger");
      }
    });
  }

  /* =====================================================
   * CONGREGATION ASSIGNED / VISITING TOGGLE
   * ===================================================== */

  function initCongAssignedToggle(form) {
    const assignedRadios = form.querySelectorAll('input[name="congAssigned"]');
    if (!assignedRadios.length) return;

    const assignedBlock = document.getElementById("cong-assigned-block");
    const visitingBlock = document.getElementById("cong-visiting-block");
    if (!assignedBlock && !visitingBlock) return;

    const updateCongBlocks = () => {
      const checked = form.querySelector('input[name="congAssigned"]:checked');
      if (!checked) return;

      const isAssignedYes = checked.value === "yes";

      if (assignedBlock) {
        assignedBlock.classList.toggle("d-none", !isAssignedYes);
      }
      if (visitingBlock) {
        visitingBlock.classList.toggle("d-none", isAssignedYes);
      }
    };

    assignedRadios.forEach((r) =>
      r.addEventListener("change", updateCongBlocks),
    );
    updateCongBlocks();
  }

  /* =====================================================
   * PRIVILEGE RULES HANDLING
   * ===================================================== */

  function initPrivilegeRulesForSummary(form) {
    if (typeof window.initPrivilegeEnforcer === "function") {
      window.initPrivilegeEnforcer({
        form,
        privilegeSelector: ".privilege-checkbox",
        genderSelectId: "genderRaw",
        hiddenGenderFieldId: "summary-gender",
        rulesScriptId: "privilege-rules-json",
      });
      return;
    }

    console.warn("initPrivilegeEnforcer not found. Using fallback.");
    initInlinePrivilegeRulesFallback(form);
  }

  function initInlinePrivilegeRulesFallback(form) {
    if (!window.PRIVILEGE_RULES) {
      const rulesScript = document.getElementById("privilege-rules-json");
      if (rulesScript) {
        try {
          window.PRIVILEGE_RULES = JSON.parse(rulesScript.textContent);
        } catch (err) {
          console.error("Privilege rule JSON parse failed:", err);
        }
      }
    }

    if (!window.PRIVILEGE_RULES) return;

    const rules = window.PRIVILEGE_RULES;
    const boxes = form.querySelectorAll(".privilege-checkbox");
    if (!boxes.length) return;

    const genderSelect = document.getElementById("genderRaw");
    const hiddenGender = document.getElementById("summary-gender");

    function getCurrentGender() {
      return (genderSelect?.value || hiddenGender?.value || "").toLowerCase();
    }

    function applyPrivilegeRules() {
      boxes.forEach((b) => (b.disabled = false));

      const gender = getCurrentGender();
      const selected = [...boxes].filter((b) => b.checked).map((b) => b.value);

      selected.forEach((p) => {
        (rules[p] || []).forEach((disable) => {
          const target = form.querySelector(
            `.privilege-checkbox[value="${disable}"]`,
          );
          if (target && !target.checked) {
            target.disabled = true;
          }
        });
      });

      if (rules[gender]) {
        rules[gender].forEach((disable) => {
          const target = form.querySelector(
            `.privilege-checkbox[value="${disable}"]`,
          );
          if (target && !target.checked) {
            target.disabled = true;
          }
        });
      }
    }

    boxes.forEach((b) => b.addEventListener("change", applyPrivilegeRules));
    genderSelect?.addEventListener("change", applyPrivilegeRules);
    applyPrivilegeRules();
  }

  /* =====================================================
   * SUMMARY FINAL SUBMISSION
   * ===================================================== */

  function initSummarySubmit(form) {
    const root = document.getElementById("formSummaryRoot");

    const csrf =
      document.getElementById("summary-csrf")?.value ||
      document.querySelector('input[name="_csrf"]')?.value ||
      "";

    const finalButton = document.getElementById("final-submit");
    const yesButton = document.getElementById("yesSaveBtn");
    const statusEl = document.getElementById("submitStatus");

    const confirmModalEl =
      document.getElementById("confirmSaveModal") ||
      document.getElementById("summaryConfirmModal");
    const successModalEl = document.getElementById("summarySuccessModal");

    if (!finalButton || !yesButton || !confirmModalEl || !root || !csrf) {
      return;
    }

    const confirmModal = new bootstrap.Modal(confirmModalEl);
    const successModal = successModalEl && new bootstrap.Modal(successModalEl);

    function setStatus(message, type = "warning") {
      if (!statusEl) return;
      statusEl.innerHTML = `
        <div class="alert alert-${type} alert-dismissible fade show mt-3" role="alert">
          ${message}
          <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
      `;
    }

    function clearStatus() {
      if (statusEl) statusEl.innerHTML = "";
    }

    finalButton.addEventListener("click", () => {
      clearStatus();
      if (!allSectionsNotEditing(root)) {
        highlightEditingSections(root);
        setStatus(
          "Please save all sections in the summary before finishing.",
          "warning",
        );
        return;
      }
      confirmModal.show();
    });

    yesButton.addEventListener("click", async () => {
      clearStatus();
      confirmModal.hide();

      const formData = new FormData(form);
      const body = {};
      formData.forEach((v, k) => (body[k] = v));

      try {
        const resp = await fetch("/submitSummary", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify(body),
        });

        const data = await resp.json().catch(() => ({}));

        if (!resp.ok || !data.success) {
          setStatus(
            data.message ||
              "There was a problem finalizing your registration. Please try again.",
            "danger",
          );
          return;
        }

        if (successModal) {
          successModal.show();
        }

        setTimeout(() => {
          window.location.href = "/";
        }, 5000);
      } catch (err) {
        console.error("Error submitting summary:", err);
        setStatus(
          "A server error occurred while saving your registration. Please try again.",
          "danger",
        );
      }
    });
  }

  /* =====================================================
   * PRINT LOGIC
   * ===================================================== */

  function initPrintHandler() {
    const btn = document.getElementById("print-summary");
    if (!btn) return;

    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".accordion-collapse")
        .forEach((a) => a.classList.add("show"));
      window.print();
    });
  }

  function collapseAllAccordions() {
    const accordions = document.querySelectorAll(".accordion-collapse.show");
    accordions.forEach((el) => {
      const bsCollapse = bootstrap.Collapse.getOrCreateInstance(el);
      bsCollapse.hide();
    });
  }

  window.onbeforeprint = () => {
    document.querySelectorAll(".accordion-collapse").forEach((el) => {
      const bsCollapse = bootstrap.Collapse.getOrCreateInstance(el);
      bsCollapse.show();
    });
  };

  window.onafterprint = () => {
    collapseAllAccordions();
  };

  window.matchMedia("print").addEventListener("change", (e) => {
    if (!e.matches) collapseAllAccordions();
  });

  /* =====================================================
   * CONGREGATION AUTOCOMPLETE COMBOBOX
   * ===================================================== */

  function initCongregationCombobox() {
    /** @type {HTMLSelectElement | null} */
    const select = document.getElementById("congregation");
    if (!select) return;

    const wrapper = select.parentElement;
    if (!wrapper) return;
    if (wrapper.querySelector("#congregation-combobox")) return;

    wrapper.style.position = "relative";

    const input = document.createElement("input");
    input.type = "text";
    input.id = "congregation-combobox";
    input.className = "form-control mb-1";
    input.autocomplete = "off";
    input.placeholder = "Start typing to search congregations...";
    wrapper.insertBefore(input, select);

    select.classList.add("d-none");

    const list = document.createElement("div");
    list.id = "congregation-combobox-list";
    list.className = "dropdown-menu w-100";
    wrapper.appendChild(list);

    let options = extractOptionsFromSelect(select);

    function extractOptionsFromSelect(sel) {
      return Array.from(sel.options)
        .filter((opt) => opt.value)
        .map((opt) => ({
          value: opt.value,
          label: opt.text,
        }));
    }

    function ensureOptionExists(value, label) {
      const existing = Array.from(select.options).find(
        (opt) => opt.value === value,
      );
      if (!existing) {
        const opt = document.createElement("option");
        opt.value = value;
        opt.text = label;
        select.appendChild(opt);
      }
    }

    (async function hydrateOptionsFromApi() {
      try {
        const res = await fetch("/api/congregations");
        if (!res.ok) return;
        const data = await res.json().catch(() => []);
        if (Array.isArray(data) && data.length > 0) {
          options = data.map((c) => ({
            value: c,
            label: c,
          }));
        }
      } catch (err) {
        console.error("Error fetching congregations:", err);
      }
    })();

    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption && selectedOption.value) {
      input.value = selectedOption.text;
    }

    const closeList = () => list.classList.remove("show");
    const openList = () => {
      if (list.children.length > 0) list.classList.add("show");
    };

    function escapeRegex(text) {
      return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function highlightMatch(label, query) {
      const trimmed = query.trim();
      if (!trimmed) return label;
      const safe = escapeRegex(trimmed);
      const regex = new RegExp(`(${safe})`, "gi");
      return label.replace(regex, "<strong>$1</strong>");
    }

    let currentIndex = -1;

    function renderList(filterText) {
      list.innerHTML = "";
      currentIndex = -1;

      const term = (filterText || "").trim().toLowerCase();
      if (!term) {
        closeList();
        return;
      }

      const filtered = options.filter((o) =>
        o.label.toLowerCase().includes(term),
      );

      filtered.slice(0, 30).forEach((opt) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "dropdown-item suggestion-item";
        item.innerHTML = highlightMatch(opt.label, term);

        item.addEventListener("click", () => {
          input.value = opt.label;
          ensureOptionExists(opt.value, opt.label);
          select.value = opt.value;
          closeList();
        });

        list.appendChild(item);
      });

      if (filtered.length > 0) {
        openList();
      } else {
        closeList();
      }
    }

    function updateHighlight() {
      const items = list.querySelectorAll(".suggestion-item");
      items.forEach((item, index) => {
        const isActive = index === currentIndex;
        item.classList.toggle("active", isActive);
        item.style.backgroundColor = isActive ? "#e0e0e0" : "#ffffff";
      });
    }

    let debounceId;
    function debouncedRender() {
      clearTimeout(debounceId);
      debounceId = window.setTimeout(() => {
        renderList(input.value);
      }, 300);
    }

    input.addEventListener("input", debouncedRender);
    input.addEventListener("focus", () => {
      if (input.value.trim()) {
        renderList(input.value);
      }
    });

    input.addEventListener("blur", () => {
      setTimeout(closeList, 150);
    });

    input.addEventListener("keydown", (e) => {
      const items = list.querySelectorAll(".suggestion-item");
      if (!items.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        currentIndex = (currentIndex + 1) % items.length;
        updateHighlight();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        currentIndex = (currentIndex - 1 + items.length) % items.length;
        updateHighlight();
      } else if (e.key === "Enter") {
        if (currentIndex >= 0) {
          e.preventDefault();
          const chosen = /** @type {HTMLElement} */ (items[currentIndex]);
          const valueText = chosen.textContent || "";
          input.value = valueText;
          const optMatch = options.find((o) => o.label === valueText) || {
            value: valueText,
            label: valueText,
          };
          ensureOptionExists(optMatch.value, optMatch.label);
          select.value = optMatch.value;
          closeList();
        }
      } else if (e.key === "Escape") {
        closeList();
        input.blur();
      }
    });

    document.addEventListener("click", (e) => {
      if (!wrapper.contains(e.target)) closeList();
    });
  }

  // ===================================================
  // EXPOSE FUNCTIONS
  // ===================================================
  window.allSectionsNotEditing = allSectionsNotEditing;
  window.highlightEditingSections = highlightEditingSections;
  window.initSummaryEditMode = initEditMode;
})();

document.addEventListener("DOMContentLoaded", () => {
  const finalizeBtn = /** @type {HTMLButtonElement | null} */ (
    document.getElementById("finalize-changes")
  );
  const finalizeStatus = /** @type {HTMLElement | null} */ (
    document.getElementById("finalize-status")
  );
  const root = /** @type {HTMLElement | null} */ (
    document.getElementById("formSummaryRoot")
  );

  if (!finalizeBtn || !root || !finalizeStatus) return;

  /**
   * Update the enabled/disabled state of the "Finalize Changes" button.
   *
   * The button is enabled only when **no** accordion section is in edit mode.
   * This relies on `allSectionsNotEditing`, which checks `data-editing`
   * on each `.accordion-body` inside `root`.
   *
   * @returns {void}
   */
  function updateFinalizeState() {
    finalizeBtn.disabled = !window.allSectionsNotEditing(root);
  }

  // Run once on load
  updateFinalizeState();

  /**
   * Handle clicks inside the summary root.
   * When an edit/save button is clicked, we wait briefly for the
   * UI to update (`data-editing`, button text), then recalc state.
   */
  root.addEventListener("click", (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.classList.contains("summary-edit-btn")) {
      // Give the click handler a tick to flip data-editing, then update.
      window.setTimeout(updateFinalizeState, 20);
    }
  });

  /**
   * POST the finalize request to the server.
   *
   * @async
   * @returns {Promise<void>}
   */
  async function handleFinalizeClick() {
    finalizeStatus.innerHTML = "";

    // Guard: all sections must be out of edit mode
    if (!window.allSectionsNotEditing(root)) {
      finalizeStatus.innerHTML = `
        <div class="alert alert-warning">
          Please save all sections before finalizing your changes.
        </div>
      `;
      return;
    }

    finalizeBtn.disabled = true;
    finalizeBtn.textContent = "Saving...";

    const csrfInput = /** @type {HTMLInputElement | null} */ (
      document.querySelector('input[name="_csrf"]')
    );
    const csrfToken = csrfInput?.value || "";

    try {
      const response = await fetch("/my-account/finalize", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({}), // no body needed now, uses session user
      });

      /** @type {{ success?: boolean; message?: string }} */
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        finalizeStatus.innerHTML = `
          <div class="alert alert-danger">
            ${data.message || "There was a problem saving your changes."}
          </div>
        `;
        finalizeBtn.textContent = "Finalize Changes";
        finalizeBtn.disabled = false;
        return;
      }

      finalizeStatus.innerHTML = `
        <div class="alert alert-success">
          Your changes have been finalized successfully.
        </div>
      `;
      finalizeBtn.textContent = "Saved ✓";
    } catch (error) {
      console.error("Error finalizing changes:", error);
      finalizeStatus.innerHTML = `
        <div class="alert alert-danger">
          A server error occurred while finalizing your changes. Please try again.
        </div>
      `;
      finalizeBtn.textContent = "Finalize Changes";
      finalizeBtn.disabled = false;
    }
  }

  finalizeBtn.addEventListener("click", () => {
    void handleFinalizeClick();
  });
});