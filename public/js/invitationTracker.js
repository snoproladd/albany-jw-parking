/**
 * @file invitationTracker.js
 * @description Client-side logic for the Invitation Tracker page.
 *
 * Responsibilities:
 *  - Live filtering (campaign, day, response, revoked, name search)
 *    entirely client-side against rendered table rows.
 *  - Event dot color application (CSP-safe via data-color → JS).
 *  - Revoke / reinstate AJAX actions with inline row state update.
 *  - Row count update after filtering or actions.
 *  - Add-volunteers shortcut link — updates href dynamically to match
 *    the currently selected campaign filter.
 *  - Remind-no-batch toast.
 */

document.addEventListener("DOMContentLoaded", () => {
  // =========================================================
  // Element references
  // =========================================================

  /** @type {HTMLInputElement|null} */
  const searchInput = document.getElementById("itSearch");
  /** @type {HTMLSelectElement|null} */
  const batchFilter = document.getElementById("itBatchFilter");
  /** @type {HTMLSelectElement|null} */
  const dayFilter = document.getElementById("itDayFilter");
  /** @type {HTMLSelectElement|null} */
  const responseFilter = document.getElementById("itResponseFilter");
  /** @type {HTMLInputElement|null} */
  const revokedChk = document.getElementById("itIncludeRevoked");
  /** @type {HTMLButtonElement|null} */
  const resetBtn = document.getElementById("itResetFilters");
  /** @type {HTMLElement|null} */
  const rowCount = document.getElementById("itRowCount");
  /** @type {HTMLInputElement|null} */
  const csrfTokenEl = document.getElementById("itCsrfToken");
  /** @type {HTMLElement|null} */
  const addVolunteersWrap = document.getElementById("itAddVolunteersWrap");
  /** @type {HTMLAnchorElement|null} */
  const addVolunteersBtn = document.getElementById("itAddVolunteersBtn");

  // =========================================================
  // Helpers
  // =========================================================

  /** @returns {string} */
  function getCsrf() {
    return csrfTokenEl?.value || "";
  }

  // =========================================================
  // Event dot colors (CSP-safe)
  // =========================================================

  /**
   * Apply data-color attribute values as inline background-color.
   * @returns {void}
   */
  function applyEventDotColors() {
    document.querySelectorAll(".it-event-dot[data-color]").forEach((dot) => {
      dot.style.backgroundColor = dot.dataset.color;
    });
  }

  // =========================================================
  // Live filtering
  // =========================================================

  /**
   * Apply all active filters to the table rows.
   * Filters are read from the DOM controls on each call so this
   * function can be called from any event listener.
   * @returns {void}
   */
  function applyFilters() {
    const query = (searchInput?.value || "").trim().toLowerCase();
    const batchVal = batchFilter?.value || "";
    const dayVal = dayFilter?.value || "";
    const responseVal = responseFilter?.value || "all";
    const showRevoked = revokedChk?.checked ?? true;

    const rows = document.querySelectorAll(".it-row");
    let visible = 0;

    rows.forEach((row) => {
      const name = row.dataset.name || "";
      const batchId = row.dataset.batchId || "";
      const dayId = row.dataset.dayId || "";
      const response = row.dataset.response || "";
      const revoked = row.dataset.revoked === "true";

      // Revoked visibility
      if (revoked && !showRevoked) {
        row.hidden = true;
        return;
      }

      // Campaign filter
      if (batchVal && batchId !== batchVal) {
        row.hidden = true;
        return;
      }

      // Day filter
      if (dayVal && dayId !== dayVal) {
        row.hidden = true;
        return;
      }

      // Response filter
      if (responseVal !== "all") {
        if (responseVal === "pending" && response !== "pending") {
          row.hidden = true;
          return;
        } else if (responseVal !== "pending" && response !== responseVal) {
          row.hidden = true;
          return;
        }
      }

      // Name search
      if (query && !name.includes(query)) {
        row.hidden = true;
        return;
      }

      row.hidden = false;
      visible++;
    });

    if (rowCount) {
      rowCount.textContent = `Showing ${visible} invitation${visible !== 1 ? "s" : ""}`;
    }

    updateAddVolunteersLink();
  }

  // Wire all filter controls
  [batchFilter, dayFilter, responseFilter].forEach((el) => {
    el?.addEventListener("change", applyFilters);
  });
  revokedChk?.addEventListener("change", applyFilters);
  searchInput?.addEventListener("input", applyFilters);

  // =========================================================
  // Reset filters
  // =========================================================

  /**
   * Reset all filters to their default state and re-apply.
   * @returns {void}
   */
  resetBtn?.addEventListener("click", () => {
    if (batchFilter) batchFilter.value = "";
    if (dayFilter) dayFilter.value = "";
    if (responseFilter) responseFilter.value = "all";
    if (revokedChk) revokedChk.checked = true;
    if (searchInput) searchInput.value = "";
    applyFilters();
  });

  // =========================================================
  // Add volunteers link — updates dynamically with batch filter
  // =========================================================

  /**
   * Show / hide and update the "Add volunteers" shortcut based on
   * the currently selected campaign filter.
   * @returns {void}
   */
  function updateAddVolunteersLink() {
    const batchVal = batchFilter?.value || "";
    if (!addVolunteersWrap || !addVolunteersBtn) return;

    if (batchVal) {
      addVolunteersBtn.href = `/oversight/tools/messaging?batchId=${batchVal}`;
      addVolunteersWrap.classList.remove("d-none");
    } else {
      addVolunteersWrap.classList.add("d-none");
    }
  }

  // =========================================================
  // Revoke / Reinstate
  // =========================================================

  /**
   * Update a row's visual state after a revoke or reinstate action
   * without requiring a page reload.
   *
   * @param {HTMLElement} row
   * @param {boolean} revoked
   * @param {string} name
   * @returns {void}
   */
  function updateRowState(row, revoked, name) {
    row.dataset.revoked = revoked ? "true" : "false";
    row.dataset.response = revoked ? "revoked" : "pending";
    row.classList.toggle("it-row--revoked", revoked);

    const responseCell = row.querySelector(".it-col-response");
    if (responseCell) {
      responseCell.innerHTML = revoked
        ? `<span class="badge it-badge-revoked"><i class="fa-solid fa-ban me-1"></i>Revoked</span>`
        : `<span class="badge it-badge-pending">Pending</span>`;
    }

    const actionsCell = row.querySelector(".it-col-actions");
    if (actionsCell) {
      const id = row.dataset.id;
      actionsCell.innerHTML = revoked
        ? `<button type="button" class="btn btn-outline-success btn-sm it-reinstate-btn"
                       data-id="${id}" data-name="${name}" title="Reinstate invitation">
                       <i class="fa-solid fa-rotate-left"></i>
                   </button>`
        : `<button type="button" class="btn btn-outline-danger btn-sm it-revoke-btn"
                       data-id="${id}" data-name="${name}" title="Revoke invitation">
                       <i class="fa-solid fa-ban"></i>
                   </button>`;
      wireActionButton(actionsCell.querySelector("button"));
    }

    // Re-run filters so revoked rows obey the "show revoked" toggle
    applyFilters();
  }

  /**
   * Wire a single revoke or reinstate button.
   * @param {HTMLElement|null} btn
   * @returns {void}
   */
  function wireActionButton(btn) {
    if (!btn) return;

    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id);
      const name = btn.dataset.name || "this volunteer";
      const isRevoke = btn.classList.contains("it-revoke-btn");
      const action = isRevoke ? "revoke" : "reinstate";
      const label = isRevoke ? "Revoke" : "Reinstate";

      if (!confirm(`${label} invitation for ${name}?`)) return;

      const origHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;

      try {
        const res = await fetch(
          `/oversight/tools/messaging/invitations/${id}/${action}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": getCsrf(),
            },
            body: JSON.stringify({}),
          },
        );
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
          btn.disabled = false;
          btn.innerHTML = origHtml;
          alert(data.error || `${label} failed — please try again.`);
          return;
        }

        const row = btn.closest(".it-row");
        if (row) updateRowState(row, isRevoke, name);
      } catch (err) {
        console.error(`[invitationTracker] ${action} error:`, err);
        btn.disabled = false;
        btn.innerHTML = origHtml;
        alert("Network error — please try again.");
      }
    });
  }

  document
    .querySelectorAll(".it-revoke-btn, .it-reinstate-btn")
    .forEach(wireActionButton);

  // =========================================================
  // Remind button — no batch selected toast
  // =========================================================

  /**
   * Show a Bootstrap toast when remind is clicked with no campaign selected.
   * @returns {void}
   */
  const remindNoBatchBtn = document.getElementById("itRemindNoBatch");
  if (remindNoBatchBtn) {
    const toastEl = document.getElementById("itNoBatchToast");
    remindNoBatchBtn.addEventListener("click", () => {
      if (toastEl) bootstrap.Toast.getOrCreateInstance(toastEl).show();
    });
  }

  // =========================================================
  // Init
  // =========================================================

  applyEventDotColors();
  applyFilters();
});
