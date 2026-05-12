// public/js/privilegeEnforcer.js
// -----------------------------------------------------------------------------
// Shared privilege rules enforcer
//
// Responsibilities:
// - Centralize privilege incompatibility & gender-based restriction logic
// - Apply rules to checkbox/radio inputs representing privileges
// - Support both legacy (data-privilege + globals) and new (config-based) usage
//
// Usage (preferred, from pages like summary form):
//   window.initPrivilegeEnforcer({
//     form: HTMLFormElement,
//     privilegeSelector: ".privilege-checkbox",
//     genderSelectId: "genderRaw",            // optional
//     hiddenGenderFieldId: "summary-gender",  // optional
//     rulesScriptId: "privilege-rules-json",  // optional inline <script type="application/json">
//   });
//
// Legacy fallback (no config):
// - Uses window.PRIVILEGE_RULES and window.USER_GENDER
// - Auto-detects inputs via input[data-privilege]
// - Runs once on DOMContentLoaded
// -----------------------------------------------------------------------------

(() => {
  "use strict";

  /**
   * @typedef {Object} PrivilegeEnforcerConfig
   * @property {HTMLFormElement|Document} form
   *   The root element used for querySelector calls (form or document).
   * @property {string} privilegeSelector
   *   CSS selector to locate privilege inputs (e.g. '.privilege-checkbox' or 'input[data-privilege]').
   * @property {string} [genderSelectId]
   *   ID of a <select> element that holds the current gender (e.g. 'genderRaw').
   * @property {string} [hiddenGenderFieldId]
   *   ID of a hidden input storing gender if no visible select is present.
   * @property {string} [rulesScriptId]
   *   ID of a <script type="application/json"> node containing privilege rules, used
   *   if window.PRIVILEGE_RULES is not already defined.
   */

  /**
   * Global entry point used by pages that want to configure privilege logic.
   *
   * Example:
   *   window.initPrivilegeEnforcer({
   *     form: document.getElementById("summary-form"),
   *     privilegeSelector: ".privilege-checkbox",
   *     genderSelectId: "genderRaw",
   *     hiddenGenderFieldId: "summary-gender",
   *     rulesScriptId: "privilege-rules-json"
   *   });
   *
   * @param {PrivilegeEnforcerConfig} config
   */
  function initPrivilegeEnforcer(config) {
    const root = config.form || document;
    const selector = config.privilegeSelector || "input[data-privilege]";

    /** @type {NodeListOf<HTMLInputElement>} */
    const inputs = root.querySelectorAll(selector);
    if (!inputs.length) {
      return; // nothing to do
    }

    const rules = resolveRules(config.rulesScriptId);
    if (!rules) {
      console.warn(
        "[privilegeEnforcer] No privilege rules found. " +
          "Ensure window.PRIVILEGE_RULES or an inline JSON script is present.",
      );
      return;
    }

    /**
     * Resolves the privilege key for a given input.
     * Prefers data-privilege attribute, falls back to input.value.
     *
     * @param {HTMLInputElement} input
     * @returns {string}
     */
    function getPrivilegeKey(input) {
      return (input.dataset.privilege || input.value || "").trim();
    }

    /**
     * Resolves the current gender for rule lookup, in this order:
     *  1) Visible select (config.genderSelectId)
     *  2) Hidden field (config.hiddenGenderFieldId)
     *  3) window.USER_GENDER (legacy global)
     *
     * @returns {string} lower-cased gender key usable with rules[genderKey]
     */
    function getCurrentGender() {
      let gender = "";

      if (config.genderSelectId) {
        const select = /** @type {HTMLSelectElement | null} */ (
          document.getElementById(config.genderSelectId)
        );
        if (select && select.value) gender = select.value;
      }

      if (!gender && config.hiddenGenderFieldId) {
        const hidden = /** @type {HTMLInputElement | null} */ (
          document.getElementById(config.hiddenGenderFieldId)
        );
        if (hidden && hidden.value) gender = hidden.value;
      }

      if (!gender && typeof window.USER_GENDER !== "undefined") {
        // @ts-ignore legacy global
        gender = window.USER_GENDER || "";
      }

      return String(gender || "").toLowerCase();
    }

    /**
     * Core logic:
     * - Enable all privilege inputs
     * - Disable incompatible privileges based on currently selected ones
     * - Disable additional privileges based on gender-based rules
     */
    function recomputeDisabled() {
      // 1) Enable everything first
      inputs.forEach((input) => {
        input.disabled = false;
      });

      // 2) Collect selected privilege keys
      const selectedKeys = Array.from(inputs)
        .filter((i) => i.checked)
        .map((i) => getPrivilegeKey(i))
        .filter(Boolean);

      // 3) Apply incompatibilities for selected privileges
      selectedKeys.forEach((selKey) => {
        const incompatibleList = rules[selKey] || [];
        incompatibleList.forEach((opt) => {
          const target = /** @type {HTMLInputElement | null} */ (
            root.querySelector(
              `${selector}[data-privilege="${opt}"], ${selector}[value="${opt}"]`,
            )
          );
          if (target && !target.checked) {
            target.disabled = true;
          }
        });
      });

      // 4) Apply gender-based restrictions (if defined in rules)
      const genderKey = getCurrentGender();
      if (genderKey && rules[genderKey]) {
        const genderIncompat = rules[genderKey];
        genderIncompat.forEach((opt) => {
          const target = /** @type {HTMLInputElement | null} */ (
            root.querySelector(
              `${selector}[data-privilege="${opt}"], ${selector}[value="${opt}"]`,
            )
          );
          if (target && !target.checked) {
            target.disabled = true;
          }
        });
      }
    }

    // Wire change events on all privilege inputs
    inputs.forEach((input) => {
      input.addEventListener("change", recomputeDisabled);
    });

    // If there's a gender select, re-run when it changes
    if (config.genderSelectId) {
      const genderSelect = /** @type {HTMLSelectElement | null} */ (
        document.getElementById(config.genderSelectId)
      );
      if (genderSelect) {
        genderSelect.addEventListener("change", recomputeDisabled);
      }
    }

    // Initial state
    recomputeDisabled();
  }

  /**
   * Resolves privilege rules from:
   *  1) window.PRIVILEGE_RULES (if already set)
   *  2) Inline <script type="application/json" id="rulesScriptId">, if provided
   *
   * @param {string} [rulesScriptId]
   * @returns {Record<string, string[]> | null}
   */
  function resolveRules(rulesScriptId) {
    // @ts-ignore legacy global
    if (window.PRIVILEGE_RULES && typeof window.PRIVILEGE_RULES === "object") {
      // @ts-ignore
      return window.PRIVILEGE_RULES;
    }

    if (rulesScriptId) {
      const scriptEl = document.getElementById(rulesScriptId);
      if (scriptEl && scriptEl.textContent) {
        try {
          const parsed = JSON.parse(scriptEl.textContent);
          // @ts-ignore
          window.PRIVILEGE_RULES = parsed;
          return parsed;
        } catch (err) {
          console.error(
            "[privilegeEnforcer] Failed to parse privilege rules JSON:",
            err,
          );
          return null;
        }
      }
    }

    return null;
  }

  // Expose the initializer on window for configured usage
  // eslint-disable-next-line no-undef
  window.initPrivilegeEnforcer = initPrivilegeEnforcer;

  /* ==========================================================================
   * Legacy auto-init: data-privilege + globals
   *
   * This preserves existing behavior so older pages that only include this file
   * (and rely on window.PRIVILEGE_RULES / window.USER_GENDER) continue to work.
   * ======================================================================= */
  document.addEventListener("DOMContentLoaded", () => {
    const legacyInputs = document.querySelectorAll("input[data-privilege]");
    if (!legacyInputs.length) return;

    // If we already have rules or an inline JSON, init with default config
    const hasRules =
      // @ts-ignore
      !!window.PRIVILEGE_RULES ||
      !!document.getElementById("privilege-rules-json");

    if (!hasRules) {
      console.warn(
        "[privilegeEnforcer] Legacy auto-init found data-privilege inputs " +
          "but no rules. Skipping initialization.",
      );
      return;
    }

    initPrivilegeEnforcer({
      form: document,
      privilegeSelector: "input[data-privilege]",
      // gender from window.USER_GENDER; rules from window.PRIVILEGE_RULES or inline JSON
      rulesScriptId: "privilege-rules-json",
    });
  });
})();
