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
    initSubmitHandler(form);
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
      });
    });
  }

  /* =====================================================
   * CONGREGATION ASSIGNED / VISITING TOGGLE
   * ===================================================== */

  /**
   * Wires up the "Congregation assigned" radios to toggle visibility
   * between assigned and visiting blocks.
   *
   * @param {HTMLFormElement} form - The summary form element.
   */
  function initCongAssignedToggle(form) {
    const assignedRadios = form.querySelectorAll('input[name="congAssigned"]');
    if (!assignedRadios.length) return;

    const assignedBlock = document.getElementById("cong-assigned-block");
    const visitingBlock = document.getElementById("cong-visiting-block");
    if (!assignedBlock && !visitingBlock) return;

    /**
     * Updates which block is visible based on the selected radio.
     * "yes" => show assigned block, hide visiting block.
     * anything else => hide assigned block, show visiting block.
     */
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
    // Apply correct visibility on initial load
    updateCongBlocks();
  }

  /* =====================================================
   * PRIVILEGE RULES (DELEGATE TO SHARED ENFORCER)
   * ===================================================== */

  /**
   * Initializes privilege rule enforcement on the summary page.
   *
   * Preference:
   * 1. Use a shared helper window.initPrivilegeEnforcer from privilegeEnforcer.js
   * 2. Fallback to local inline privilege rules if helper is not present
   *
   * @param {HTMLFormElement} form - The summary form element.
   */
  function initPrivilegeRulesForSummary(form) {
    // Preferred path: use shared enforcer if available
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

    // Fallback path: use legacy inline logic
    console.warn(
      "initPrivilegeEnforcer not found. " +
        "Ensure privilegeEnforcer.js is loaded on the summary page.",
    );
    initInlinePrivilegeRulesFallback(form);
  }

  /**
   * Fallback implementation of privilege rules.
   * This logic mirrors the existing behavior until the shared enforcer
   * is fully wired across all pages.
   *
   * @param {HTMLFormElement} form - The summary form element.
   */
  function initInlinePrivilegeRulesFallback(form) {
    // Ensure window.PRIVILEGE_RULES is populated from inline JSON if needed
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
    // eslint-disable-next-line no-undef
    const rules = window.PRIVILEGE_RULES;
    const boxes = form.querySelectorAll(".privilege-checkbox");
    if (!boxes.length) return;

    const genderSelect = document.getElementById("genderRaw");
    const hiddenGender = document.getElementById("summary-gender");

    /**
     * Resolves the current gender value from either:
     * - visible select (#genderRaw), or
     * - hidden input (#summary-gender)
     *
     * @returns {string} lower-cased gender key used in rules mapping.
     */
    function getCurrentGender() {
      return (
        (genderSelect && genderSelect.value) ||
        (hiddenGender && hiddenGender.value) ||
        ""
      ).toLowerCase();
    }

    /**
     * Applies privilege rules:
     * 1. Re-enables all checkboxes
     * 2. Disables incompatible privileges based on currently selected privileges
     * 3. Disables gender-restricted privileges based on current gender
     */
    function applyPrivilegeRules() {
      // Start by enabling everything, then selectively disable
      boxes.forEach((b) => {
        b.disabled = false;
      });

      const gender = getCurrentGender();

      // 1) Incompatibilities based on selected privileges
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

      // 2) Gender-based restrictions
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

    // Re-apply rules when any privilege checkbox changes
    boxes.forEach((b) => b.addEventListener("change", applyPrivilegeRules));

    // Re-apply when gender changes on this page
    if (genderSelect) {
      genderSelect.addEventListener("change", applyPrivilegeRules);
    }

    // Initial application on page load
    applyPrivilegeRules();
  }

  /* =====================================================
   * FINAL SUBMIT ORCHESTRATION
   * ===================================================== */

  /**
   * Wires the submit handler for the summary form, including
   * CSRF handling and network error reporting.
   *
   * @param {HTMLFormElement} form - The summary form element.
   */
  function initSubmitHandler(form) {
    const csrf = document.getElementById("summary-csrf")?.value;
    if (!csrf) {
      console.warn("CSRF token (#summary-csrf) not found for summary form.");
      return;
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      handleSubmit(form, csrf);
    });
  }

  /**
   * Handles the form submission:
   * - Temporarily enables disabled fields so their values are included in FormData
   * - Performs a POST to /submitSummary with CSRF header
   * - Shows error messages on failure, redirects to /confirmation on success
   *
   * @param {HTMLFormElement} form - The summary form element.
   * @param {string} csrf - CSRF token value.
   * @returns {Promise<void>}
   */
  async function handleSubmit(form, csrf) {
    // Temporarily enable all disabled fields so their values are included
    /** @type {HTMLElement[]} */
    const temporarilyEnabled = [];
    form
      .querySelectorAll("input:disabled, select:disabled, textarea:disabled")
      .forEach((el) => {
        el.disabled = false;
        temporarilyEnabled.push(el);
      });

    const payload = new FormData(form);

    // Restore disabled state once payload is prepared
    temporarilyEnabled.forEach((el) => {
      el.disabled = true;
    });

    let res;
    try {
      res = await fetch("/submitSummary", {
        method: "POST",
        headers: { "X-CSRF-Token": csrf },
        body: payload,
      });
    } catch (err) {
      console.error("Network error submitting summary:", err);
      showStatus(
        "A network error occurred while saving your information. Please try again.",
        false,
      );
      return;
    }

    if (!res.ok) {
      // Optionally: parse JSON error details here if backend provides them
      showStatus(
        "There was a problem saving your information. Please review highlighted sections.",
        false,
      );
      return;
    }

    // On success, navigate to confirmation page
    window.location.href = "/confirmation";
  }

  /**
   * Updates the status message area on the summary page.
   *
   * @param {string} message - Text to display to the user.
   * @param {boolean} isSuccess - Whether this represents a success or error state.
   */
  function showStatus(message, isSuccess) {
    const statusEl = document.getElementById("summary-status");
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.classList.toggle("success", !!isSuccess);
    statusEl.classList.toggle("error", !isSuccess);
  }

  /* =====================================================
   * PRINT
   * ===================================================== */

  /**
   * Initializes the print handler by expanding all accordions
   * and calling window.print() when the print button is clicked.
   */
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
  // Utility to collapse all accordion items
  function collapseAllAccordions() {
    const accordions = document.querySelectorAll(".accordion-collapse.show");
    accordions.forEach((el) => {
      const bsCollapse = bootstrap.Collapse.getOrCreateInstance(el);
      bsCollapse.hide();
    });
  }

  // Expand all for printing, then collapse afterward
  window.onbeforeprint = () => {
    document.querySelectorAll(".accordion-collapse").forEach((el) => {
      const bsCollapse = bootstrap.Collapse.getOrCreateInstance(el);
      bsCollapse.show();
    });
  };

  window.onafterprint = () => {
    collapseAllAccordions();
  };

  // Extra safety fallback for WebKit
  window.matchMedia("print").addEventListener("change", (e) => {
    if (!e.matches) collapseAllAccordions();
  });

  /* =====================================================
   * CONGREGATION AUTOCOMPLETE COMBOBOX (KEEP <SELECT>)
   * ===================================================== */

  /**
   * Initializes a combobox-style autocomplete for the congregation field.
   *
   * - Keeps <select id="congregation"> as the actual submitted value
   * - Creates a text input (#congregation-combobox) for searching
   * - Uses a Bootstrap .dropdown-menu (#congregation-combobox-list) for suggestions
   * - Populates options from:
   *     1) /api/congregations (primary)
   *     2) Fallback to existing <option> tags in the select
   * - Supports:
   *     - Highlighting matched text
   *     - Keyboard navigation (ArrowUp / ArrowDown / Enter / Escape)
   */
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

    // Make the wrapper the positioning context for the dropdown
    wrapper.style.position = "relative";

    // Create the visible text input
    const input = document.createElement("input");
    input.type = "text";
    input.id = "congregation-combobox";
    input.className = "form-control mb-1";
    input.autocomplete = "off";
    input.placeholder = "Start typing to search congregations...";

    // Insert the combo box input BEFORE the select
    wrapper.insertBefore(input, select);

    // Hide the original select but keep it in the DOM so it submits normally
    select.classList.add("d-none");

    // Create the dropdown container for suggestions
    const list = document.createElement("div");
    list.id = "congregation-combobox-list";
    list.className = "dropdown-menu w-100";
    wrapper.appendChild(list);

    /**
     * All congregations available from the select element.
     * Each option is normalized to { value, label }.
     * @type {{ value: string; label: string }[]}
     */
    let options = extractOptionsFromSelect(select);

    function extractOptionsFromSelect(sel) {
      return Array.from(sel.options)
        .filter((opt) => opt.value) // skip placeholder
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

    // Fetch congregations from /api/congregations and replace options if successful
    (async function hydrateOptionsFromApi() {
      try {
        const res = await fetch("/api/congregations");
        if (!res.ok) return; // fallback to existing options

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

    // Initialize input with currently selected congregation (if any)
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

    // Input events
    input.addEventListener("input", debouncedRender);
    input.addEventListener("focus", () => {
      if (input.value.trim()) {
        renderList(input.value);
      }
    });

    input.addEventListener("blur", () => {
      // Slight delay so clicks on the list still register
      setTimeout(closeList, 150);
    });

    // Keyboard navigation for the dropdown
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

    // Click outside to close (list lives in wrapper)
    document.addEventListener("click", (e) => {
      if (!wrapper.contains(e.target)) {
        closeList();
      }
    });
  }
  // Utility to collapse all accordion items
  function collapseAllAccordions() {
    const accordions = document.querySelectorAll(".accordion-collapse.show");
    accordions.forEach((el) => {
      const bsCollapse = bootstrap.Collapse.getOrCreateInstance(el);
      bsCollapse.hide();
    });
  }

  // Expand all for printing, then collapse afterward
  window.onbeforeprint = () => {
    document.querySelectorAll(".accordion-collapse").forEach((el) => {
      const bsCollapse = bootstrap.Collapse.getOrCreateInstance(el);
      bsCollapse.show();
    });
  };

  window.onafterprint = () => {
    collapseAllAccordions();
  };

  // Extra safety fallback for WebKit
  window.matchMedia("print").addEventListener("change", (e) => {
    if (!e.matches) collapseAllAccordions();
  });
})();