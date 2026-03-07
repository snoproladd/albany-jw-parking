// public/js/formSummary.js
// -----------------------------------------------------------------------------
// Summary page controller:
// - Handles edit/lock toggling for sections
// - Manages congregation assigned/visiting UI
// - Applies privilege rules (via shared enforcer or local fallback)
// - Orchestrates final form submission (including disabled inputs)
// - Provides a print-friendly view
// - Implements a combobox-style congregation autocomplete over a <select>;
// -----------------------------------------------------------------------------

(() => {
  "use strict";

  /**
   * Entry point for the summary page.
   * Runs once on DOMContentLoaded and wires up all summary-specific behavior.
   */
  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("summary-form");
    if (!form) return; // Safeguard: do nothing if this script runs on a non-summary page

    initEditMode(form);
    initCongAssignedToggle(form);
    initPrivilegeRulesForSummary(form);
    initSummarySubmit(form);      // NEW: modal + AJAX save + success redirect
    initPrintHandler();
    initCongregationCombobox();
  });

  /* =====================================================
   * EDIT MODE TOGGLING (LOCK BY DEFAULT)
   * ===================================================== */

  /**
   * Initializes the "EDIT/SAVE" toggle behavior for each summary section.
   * Sections start in a locked state (read-only, controlled via CSS).
   *
   * @param {HTMLFormElement} root - The summary form element.
   */
  function initEditMode(root) {
    const buttons = root.querySelectorAll(".summary-edit-btn");

    buttons.forEach((btn) => {
      const container = btn.closest(".accordion-body");
      if (!container) return;

      // Initial state: locked by default
      container.dataset.editing = "false";
      container.classList.add("summary-locked");
      btn.textContent = "EDIT";

      btn.addEventListener("click", () => {
        const isEditing = container.dataset.editing === "true";
        const nextEditingState = !isEditing;

        // Update the editing flag and CSS lock class
        container.dataset.editing = String(nextEditingState);
        container.classList.toggle("summary-locked", !nextEditingState);

        // Toggle button label between EDIT / SAVE
        btn.textContent = nextEditingState ? "SAVE" : "EDIT";

        // If everything is now saved, clear any submit warning toast/status
        const rootEl = document.getElementById("formSummaryRoot");
        if (rootEl && allSectionsNotEditing(rootEl)) {
          const toast = document.getElementById("submit-status");
          if (toast) toast.innerHTML = "";
        }
      });
    });
  }

  /* =====================================================
   * EDIT MODE MONITORING
   * ===================================================== */

  /**
   * Returns true if all accordion sections are in non-editing (locked) state.
   * @param {HTMLElement} root - The root container (formSummaryRoot).
   */
  function allSectionsNotEditing(root) {
    const containers = root.querySelectorAll(".accordion-body");
    return Array.from(containers).every(
      (container) => container.dataset.editing === "false",
    );
  }

  /* =====================================================
   * EDIT MODE HIGHLIGHTING
   * ===================================================== */

  /**
   * Highlights all sections still in EDIT mode by adding a red border.
   * @param {HTMLElement} root - The root container (formSummaryRoot).
   */
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
    updateCongBlocks(); // initial state
  }

  /* =====================================================
   * PRIVILEGE RULES (DELEGATE TO SHARED ENFORCER)
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

    console.warn(
      "initPrivilegeEnforcer not found. Ensure privilegeEnforcer.js is loaded on the summary page.",
    );
    initInlinePrivilegeRulesFallback(form);
  }

  function initInlinePrivilegeRulesFallback(form) {
    if (!window.PRIVILEGE_RULES) {
      const rulesScript = document.getElementById("privilege-rules-json");
      if (rulesScript) {
        try {
          window.PRIVILEGE_RULES = JSON.parse(rulesScript.textContent);
        } catch (err) {
          console.error(
            "Failed to parse privilegeRulesJSON on summary page:",
            err,
          );
        }
      }
    }

    if (!window.PRIVILEGE_RULES) return;

    /** @type {Record<string, string[]>} */
    const rules = window.PRIVILEGE_RULES;
    const boxes = form.querySelectorAll(".privilege-checkbox");
    if (!boxes.length) return;

    const genderSelect = document.getElementById("genderRaw");
    const hiddenGender = document.getElementById("summary-gender");

    function getCurrentGender() {
      return (
        (genderSelect && genderSelect.value) ||
        (hiddenGender && hiddenGender.value) ||
        ""
      ).toLowerCase();
    }

    function applyPrivilegeRules() {
      boxes.forEach((b) => {
        b.disabled = false;
      });

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
    if (genderSelect) {
      genderSelect.addEventListener("change", applyPrivilegeRules);
    }
    applyPrivilegeRules();
  }

  /* =====================================================
   * FINAL SUBMIT ORCHESTRATION (MODAL + AJAX + SUCCESS)
   * ===================================================== */

  /**
   * Wires the summary page submit behavior:
   * - "Confirm & Finish" button opens confirm modal (if all sections saved)
   * - "Yes, Save & Finish" in modal posts to /submitSummary via AJAX
   * - Shows success modal and redirects to "/" after 5 seconds
   */
  function initSummarySubmit(form) {
    const root = document.getElementById("formSummaryRoot");

    const csrf =
      document.getElementById("summary-csrf")?.value ||
      document.querySelector('input[name="_csrf"]')?.value ||
      "";

    const finalButton = document.getElementById("final-submit");
    const yesButton = document.getElementById("yesSaveBtn");
    const statusEl = document.getElementById("submit-status");

    const confirmModalEl = document.getElementById("confirmSaveModal") ||
      document.getElementById("summaryConfirmModal");
    const successModalEl = document.getElementById("summarySuccessModal");

    if (!finalButton || !yesButton || !confirmModalEl || !root || !csrf) {
      // if any essential elements are missing, don't wire this behavior
      return;
    }

    const confirmModal = new bootstrap.Modal(confirmModalEl);
    const successModal =
      successModalEl && new bootstrap.Modal(successModalEl);

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

    // "Confirm & Finish" button → check edit state, show confirm modal
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

    // "Yes, Save & Finish" button → AJAX POST to /submitSummary
    yesButton.addEventListener("click", async () => {
      clearStatus();
      confirmModal.hide();

      // Build JSON payload from form (if backend uses body-parser / JSON)
      const formData = new FormData(form);
      const body = {};
      formData.forEach((v, k) => {
        body[k] = v;
      });

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

        // Success: show success modal (if present) and redirect after 5s
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
   * LEGACY SUBMIT (NOT USED ANYMORE)
   * (Kept for reference; no longer wired because we use initSummarySubmit)
   * ===================================================== */
  // function initSubmitHandler(form) { ... }
  // function handleSubmit(form, csrf) { ... }
  // function showStatus(message, isSuccess) { ... }
  // (Left out intentionally to avoid double-submit behavior)

  /* =====================================================
   * PRINT
   * ===================================================== */

  function initPrintHandler() {
    const btn = document.getElementById("print-summary");
    if (!btn) return;

    btn.addEventListener("click", () => {
      // Ensure all content is visible when printing
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
   * CONGREGATION AUTOCOMPLETE COMBOBOX (KEEP <SELECT>)
   * ===================================================== */

  function initCongregationCombobox() {
    /** @type {HTMLSelectElement | null} */
    const select = /** @type {HTMLSelectElement | null} */ (
      document.getElementById("congregation")
    );
    if (!select) return;

    const wrapper = select.parentElement;
    if (!wrapper) return;

    // Guard against double initialization
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
        console.error(
          "Error fetching congregations from /api/congregations:",
          err,
        );
      }
    })();

    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption && selectedOption.value) {
      input.value = selectedOption.text;
    }

    const closeList = () => {
      list.classList.remove("show");
    };

    const openList = () => {
      if (list.children.length > 0) {
        list.classList.add("show");
      }
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
      if (!wrapper.contains(e.target)) {
        closeList();
      }
    });
  }

  // ===================================================
  // 🔥 EXPOSE FUNCTIONS ON window FOR OTHER SCRIPTS
  // ===================================================
  window.allSectionsNotEditing = allSectionsNotEditing;
  window.highlightEditingSections = highlightEditingSections;
  window.initSummaryEditMode = initEditMode;
})();