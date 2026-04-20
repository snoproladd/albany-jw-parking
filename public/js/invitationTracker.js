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
  /** @type {HTMLButtonElement|null} */
  const editCampaignBtn = document.getElementById("itEditCampaignBtn");

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
  /**
   * Apply all active filters to the table rows, then recompute and update
   * the summary stat cards and remind button from the visible rows.
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
    let cntTotal = 0, cntYes = 0, cntNo = 0, cntMaybe = 0, cntPending = 0, cntRevoked = 0;

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
      cntTotal++;
      if (revoked)              cntRevoked++;
      else if (response === "yes")   cntYes++;
      else if (response === "no")    cntNo++;
      else if (response === "maybe") cntMaybe++;
      else if (response === "pending") cntPending++;
    });

    if (rowCount) {
      rowCount.textContent = `Showing ${visible} invitation${visible !== 1 ? "s" : ""}`;
    }

    // Update stat cards
    const statTotal   = document.getElementById("itStatTotal");
    const statYes     = document.getElementById("itStatYes");
    const statNo      = document.getElementById("itStatNo");
    const statMaybe   = document.getElementById("itStatMaybe");
    const statPending = document.getElementById("itStatPending");
    const statRevoked = document.getElementById("itStatRevoked");
    if (statTotal)   statTotal.textContent   = String(cntTotal);
    if (statYes)     statYes.textContent     = String(cntYes);
    if (statNo)      statNo.textContent      = String(cntNo);
    if (statMaybe)   statMaybe.textContent   = String(cntMaybe);
    if (statPending) statPending.textContent = String(cntPending);
    if (statRevoked) statRevoked.textContent = String(cntRevoked);

    updateAddVolunteersLink();
    updateRemindButton(cntPending);
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
  // Remind button — updates dynamically with batch filter
  // =========================================================

  /** @type {HTMLElement|null} */
  const remindWrap = document.getElementById("itRemindWrap");

  /**
   * Update the Remind button and the Pending stat card based on the current
   * filter state and the live filtered pending count.
   *
   * - If no batch is selected: disabled button that triggers the no-batch toast.
   * - If selected batch has response_needed=0: remind button hidden entirely;
   *   pending card loses its drill-down link.
   * - Otherwise: active link pre-filtered to pending invitations for that batch.
   *
   * @param {number} [livePendingCount] - Pending count from the current visible rows.
   * @returns {void}
   */
  function updateRemindButton(livePendingCount) {
    const batchVal = batchFilter?.value || "";
    const pendingCount = livePendingCount ?? Number(remindWrap?.dataset.pendingCount ?? 0);

    // Determine response_needed for selected batch
    const selectedOpt = batchVal
      ? batchFilter?.querySelector(`option[value="${batchVal}"]`)
      : null;
    const responseNeeded = !selectedOpt || selectedOpt.dataset.responseNeeded !== "0";

    // ── Pending stat card ───────────────────────────────────────────────
    const pendingWrap = document.getElementById("itStatPendingWrap");
    const pendingLabel = document.getElementById("itStatPendingLabel");
    if (pendingWrap) {
      const card = pendingWrap.querySelector(".it-stat-card");
      if (batchVal && responseNeeded && pendingCount > 0) {
        // Make the card a clickable drill-down link
        pendingWrap.style.cursor = "pointer";
        if (card) {
          card.style.cursor = "pointer";
          card.onclick = () => {
            window.location.href =
              `/oversight/tools/messaging/tracker?batchId=${batchVal}&response=pending&includeRevoked=0`;
          };
        }
        if (pendingLabel) {
          pendingLabel.innerHTML = `Pending <i class="fa-solid fa-arrow-right ms-1 it-stat-arrow"></i>`;
        }
      } else {
        if (card) { card.style.cursor = ""; card.onclick = null; }
        if (pendingLabel) pendingLabel.textContent = "Pending";
      }
    }

    // ── Remind button ───────────────────────────────────────────────────
    if (!remindWrap) return;

    if (!batchVal) {
      remindWrap.innerHTML = `
        <button type="button" class="btn btn-secondary btn-sm" id="itRemindNoBatch">
          <i class="fa-solid fa-bell me-1"></i>Remind ${pendingCount} pending
        </button>`;
      const btn = remindWrap.querySelector("#itRemindNoBatch");
      const toastEl = document.getElementById("itNoBatchToast");
      btn?.addEventListener("click", () => {
        if (toastEl) bootstrap.Toast.getOrCreateInstance(toastEl).show();
      });
      return;
    }

    if (!responseNeeded) {
      remindWrap.innerHTML = "";
      return;
    }

    remindWrap.innerHTML = `
      <a href="/oversight/tools/messaging?batchId=${batchVal}&selectPending=1"
         class="btn btn-warning btn-sm">
        <i class="fa-solid fa-bell me-1"></i>Remind ${pendingCount} pending
      </a>`;
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

  // Remind button initial state — wire toast if no batch active on load
  updateRemindButton(Number(remindWrap?.dataset.pendingCount ?? 0));

  // =========================================================
  // Edit Campaign
  // =========================================================

  /**
   * Load the full batches array embedded in the page by the server.
   * Returns an empty array if the element is absent (non-admin view).
   * @returns {Array<object>}
   */
  function getBatchesData() {
    try {
      const el = document.getElementById("it-batches-data");
      return el ? JSON.parse(el.textContent) : [];
    } catch {
      return [];
    }
  }

  /** @type {number|null} Currently open batch id in the edit modal. */
  let editingBatchId = null;

  /**
   * Show or hide the edit button based on whether a campaign is selected.
   * Removes the self-option from the parent picker to prevent cycles.
   * @returns {void}
   */
  function updateEditCampaignBtn() {
    if (!editCampaignBtn) return;
    const batchVal = batchFilter?.value || "";
    editCampaignBtn.classList.toggle("d-none", !batchVal);
  }

  /**
   * Open the edit modal pre-populated with the selected campaign's data.
   * @returns {void}
   */
  function openEditModal() {
    const batchVal = batchFilter?.value || "";
    if (!batchVal) return;

    const id = Number(batchVal);
    const batches = getBatchesData();
    const batch = batches.find((b) => b.id === id);
    if (!batch) return;

    editingBatchId = id;

    // Populate fields
    const nameEl      = document.getElementById("itEditName");
    const subjectEl   = document.getElementById("itEditSubject");
    const bodyEl      = document.getElementById("itEditBody");
    const parentEl    = document.getElementById("itEditParent");
    const parentHint  = document.getElementById("itEditParentHint");
    const respEl      = document.getElementById("itEditResponseNeeded");
    const activeEl    = document.getElementById("itEditActive");
    const errorEl     = document.getElementById("itEditError");

    if (nameEl)    nameEl.value    = batch.name || "";
    if (subjectEl) subjectEl.value = batch.message_subject || "";
    if (bodyEl)    bodyEl.value    = batch.message_body || "";
    if (respEl)    respEl.checked  = !!batch.response_needed;
    if (activeEl)  activeEl.checked = batch.active !== false && batch.active !== 0;
    if (errorEl)   errorEl.classList.add("d-none");

    // Rebuild parent picker — exclude self and any of its own children
    // (to avoid cycles: child of a child cannot become the parent)
    if (parentEl) {
      const childIds = new Set(
        batches.filter((b) => b.parent_batch_id === id).map((b) => b.id),
      );

      Array.from(parentEl.options).forEach((opt) => {
        const optId = Number(opt.value);
        opt.hidden = optId === id || childIds.has(optId);
      });

      parentEl.value = batch.parent_batch_id ? String(batch.parent_batch_id) : "";

      if (parentHint) {
        const childCount = childIds.size;
        parentHint.textContent = childCount > 0
          ? `This campaign has ${childCount} follow-up${childCount !== 1 ? "s" : ""}. They cannot be selected as a parent.`
          : "";
      }
    }

    const modalEl = document.getElementById("itEditCampaignModal");
    if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }

  editCampaignBtn?.addEventListener("click", openEditModal);

  // Also update edit button visibility when batch filter changes
  batchFilter?.addEventListener("change", updateEditCampaignBtn);
  updateEditCampaignBtn();

  /**
   * Save edited campaign via PUT /oversight/tools/messaging/batches/:id.
   * On success updates the batch filter option text and data attributes in place,
   * refreshes the page if active was toggled off (batch disappears from list),
   * otherwise closes the modal.
   * @returns {Promise<void>}
   */
  document.getElementById("itEditSaveBtn")?.addEventListener("click", async () => {
    if (!editingBatchId) return;

    const nameEl    = document.getElementById("itEditName");
    const subjectEl = document.getElementById("itEditSubject");
    const bodyEl    = document.getElementById("itEditBody");
    const parentEl  = document.getElementById("itEditParent");
    const respEl    = document.getElementById("itEditResponseNeeded");
    const activeEl  = document.getElementById("itEditActive");
    const errorEl   = document.getElementById("itEditError");
    const saveBtn   = document.getElementById("itEditSaveBtn");

    const name        = nameEl?.value.trim() || "";
    const messageSubject = subjectEl?.value.trim() || null;
    const messageBody = bodyEl?.value.trim() || "";
    const parentBatchId = Number(parentEl?.value) || null;
    const responseNeeded = respEl?.checked ?? true;
    const active      = activeEl?.checked ?? true;

    if (!name) {
      if (errorEl) { errorEl.textContent = "Name is required."; errorEl.classList.remove("d-none"); }
      return;
    }
    if (!messageBody) {
      if (errorEl) { errorEl.textContent = "Message body is required."; errorEl.classList.remove("d-none"); }
      return;
    }

    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Saving…`; }
    if (errorEl) errorEl.classList.add("d-none");

    try {
      const res = await fetch(`/oversight/tools/messaging/batches/${editingBatchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrf() },
        body: JSON.stringify({ name, messageSubject, messageBody, parentBatchId, responseNeeded, active }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        if (errorEl) { errorEl.textContent = data.error || "Save failed — please try again."; errorEl.classList.remove("d-none"); }
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk me-1"></i>Save changes`; }
        return;
      }

      // If deactivated, the batch will no longer appear — reload to resync
      if (!active) {
        window.location.reload();
        return;
      }

      // Update the option text and data attrs in the batch filter select
      const opt = batchFilter?.querySelector(`option[value="${editingBatchId}"]`);
      if (opt) {
        opt.dataset.responseNeeded = responseNeeded ? "1" : "0";
        opt.dataset.parentId       = parentBatchId ? String(parentBatchId) : "";
        const prefix = parentBatchId ? "↳ " : "";
        // Preserve the (count) suffix already in the option text
        const countMatch = opt.textContent.match(/\(\d+\)$/);
        const countSuffix = countMatch ? ` ${countMatch[0]}` : "";
        opt.textContent = `${prefix}${name}${countSuffix}`;
      }

      // Close modal
      const modalEl = document.getElementById("itEditCampaignModal");
      if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();

      // Re-run filters so response_needed changes take effect immediately
      applyFilters();

    } catch (err) {
      console.error("[invitationTracker] edit campaign save error:", err);
      if (errorEl) { errorEl.textContent = "Network error — please try again."; errorEl.classList.remove("d-none"); }
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk me-1"></i>Save changes`; }
    }
  });

  // =========================================================
  // Init
  // =========================================================

  applyEventDotColors();
  applyFilters();
});
