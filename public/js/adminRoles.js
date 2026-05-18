/**
 * @file adminRoles.js
 * @description Client logic for the Role Management oversight page.
 *
 * Responsibilities:
 *  - Wire each approved-volunteer row's role select → hidden input →
 *    enable/disable Save button.
 *  - Live name/email search filter for the approved volunteer table.
 *  - Toggle expand/collapse for the unapproved volunteers section.
 *  - Live search filter for the unapproved volunteers section.
 */

document.addEventListener("DOMContentLoaded", () => {
  // =========================================================
  // Approved volunteers — role select wiring
  // =========================================================

  /**
   * Wire a single role row's select to its hidden input and Save button.
   *
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
  // Approved volunteers — live search filter
  // =========================================================

  /**
   * Filter approved role rows by name or email using classList (CSP-safe).
   *
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

  // =========================================================
  // Unapproved volunteers — collapse toggle
  // =========================================================

  const toggleBtn = document.getElementById("unapprovedToggle");
  const unapprovedPanel = document.getElementById("unapprovedSection");
  const chevron = toggleBtn?.querySelector(".unapproved-chevron");

  /**
   * Open or close the unapproved volunteers panel and rotate the chevron.
   *
   * @returns {void}
   */
  function toggleUnapproved() {
    if (!unapprovedPanel || !toggleBtn) return;

    const isOpen = !unapprovedPanel.classList.contains("d-none");

    unapprovedPanel.classList.toggle("d-none", isOpen);
    toggleBtn.setAttribute("aria-expanded", String(!isOpen));

    if (chevron) {
      chevron.style.transform = isOpen ? "" : "rotate(180deg)";
    }
  }

  toggleBtn?.addEventListener("click", toggleUnapproved);

  // =========================================================
  // Unapproved volunteers — live search filter
  // =========================================================

  /**
   * Filter unapproved volunteer rows by name or email using classList (CSP-safe).
   *
   * @returns {void}
   */
  function applyUnapprovedSearch() {
    const term = (document.getElementById("unapprovedSearch")?.value || "")
      .trim()
      .toLowerCase();

    document.querySelectorAll(".unapproved-row").forEach((row) => {
      const matches = !term || row.textContent.toLowerCase().includes(term);
      row.classList.toggle("d-none", !matches);
    });
  }

  document
    .getElementById("unapprovedSearch")
    ?.addEventListener("input", applyUnapprovedSearch);
});
