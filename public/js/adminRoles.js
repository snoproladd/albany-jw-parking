/**
 * @file adminRoles.js
 * @description Client logic for the Role Management oversight page.
 *
 * Responsibilities:
 *  - Wire each row's role select → hidden input → enable/disable Save button.
 *  - Live name/email search filter using classList instead of inline styles
 *    to avoid CSP inline-style violations.
 */

document.addEventListener("DOMContentLoaded", () => {
  // =========================================================
  // Role select → hidden input → Save button
  // =========================================================

  /**
   * Wire a single role row's select to its hidden input and Save button.
   * @param {HTMLElement} row
   * @returns {void}
   */
  function wireRoleRow(row) {
    /** @type {HTMLSelectElement|null} */
    const select = row.querySelector(".role-select");
    /** @type {HTMLInputElement|null} */
    const input = row.querySelector(".role-input");
    /** @type {HTMLButtonElement|null} */
    const saveBtn = row.querySelector(".role-save-btn");

    if (!select || !input || !saveBtn) return;

    select.addEventListener("change", () => {
      input.value = select.value;
      saveBtn.disabled = !select.value;
    });
  }

  document.querySelectorAll(".role-row").forEach(wireRoleRow);

  // =========================================================
  // Live search filter
  // =========================================================

  /**
   * Filter role rows by name or email using classList (CSP-safe).
   * @returns {void}
   */
  function applyRoleSearch() {
    const term = (document.getElementById("roleSearch")?.value || "")
      .trim()
      .toLowerCase();

    document.querySelectorAll(".role-row").forEach((row) => {
      const matches = !term || row.textContent.toLowerCase().includes(term);
      row.classList.toggle("d-none", !matches);
    });
  }

  document
    .getElementById("roleSearch")
    ?.addEventListener("input", applyRoleSearch);

 
  });

