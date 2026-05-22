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
  /** @type {HTMLInputElement|null} */
  const responseRequiredChk = document.getElementById("itResponseRequiredOnly");
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
  // Batch metadata maps — built once from filter option data attributes
  // =========================================================

  /**
   * Maps batch ID string → whether response is needed (boolean).
   * Used by applyFilters to exclude info-only campaigns from the
   * pending count shown on the Remind button.
   * @type {Map<string, boolean>}
   */
  const batchResponseNeededMap = new Map(
    Array.from(batchFilter?.querySelectorAll("option[value]") || [])
      .filter((opt) => opt.value)
      .map((opt) => [opt.value, opt.dataset.responseNeeded !== "0"]),
  );

  // =========================================================
  // Batch group expansion
  // =========================================================

  /**
   * Resolve a selected batch option value to its family root id.
   *
   * If the selected option is a child batch (has data-parent-id set),
   * returns the parent id so filtering uses family_root_id correctly.
   * Also returns the count of child batches belonging to the resolved root
   * for the batch group note.
   *
   * @param {string} batchVal - The selected batch option value, or "" for all.
   * @returns {{ rootId: string, childCount: number }}
   */
  function resolveFamilyRoot(batchVal) {
    if (!batchVal) return { rootId: '', childCount: 0 };

    const selectedOpt = batchFilter?.querySelector(`option[value="${batchVal}"]`);
    const rootId = selectedOpt?.dataset.parentId || batchVal;

    const childCount = Array.from(
      batchFilter?.querySelectorAll(`option[data-parent-id="${rootId}"]`) || [],
    ).length;

    return { rootId, childCount };
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
   * Apply all active filters to the table rows, then recompute and update
   * the summary stat cards and remind button from the visible rows.
   * @returns {void}
   */
  function applyFilters() {
    const query = (searchInput?.value || "").trim().toLowerCase();
    const batchVal = batchFilter?.value || "";
    const dayVal = dayFilter?.value || "";
    const responseVal = responseFilter?.value || "all";
    const showRevoked          = revokedChk?.checked ?? true;
    const responseRequiredOnly = responseRequiredChk?.checked ?? false;

    const { rootId: familyRootVal, childCount: batchChildCount } =
      resolveFamilyRoot(batchVal);

    const rows = document.querySelectorAll(".it-row");
    let visible = 0;

    // Sets of volunteer IDs per response bucket — deduplicates volunteers
    // who have multiple historical rows from pre-reminder sends.
    const seenTotal = new Set();
    const seenYes = new Set();
    const seenNo = new Set();
    const seenMaybe = new Set();
    const seenPending = new Set();
    const seenRevoked = new Set();

    /**
     * Accumulates each volunteer's response states across all their visible
     * rows before resolving to stat card buckets. Prevents a volunteer who
     * responded to the parent campaign from also counting as pending because
     * they appear in a follow-up campaign row.
     * @type {Map<string, {yes:boolean, no:boolean, maybe:boolean, pending:boolean, revoked:boolean}>}
     */
    const volResponseAccum = new Map();

    rows.forEach((row) => {
      const name = row.dataset.name || "";
      const batchId = row.dataset.batchId || "";
      const dayId = row.dataset.dayId || "";
      const response = row.dataset.response || "";
      const revoked = row.dataset.revoked === "true";
      const volId = row.dataset.volunteerId || "";

      // Revoked visibility
      if (revoked && !showRevoked) {
        row.hidden = true;
        return;
      }

      // Campaign filter — match on family_root_id so follow-up rows are
      // included when viewing the parent, and child selection resolves to parent.
      const familyRootId = row.dataset.familyRootId || '';
      if (familyRootVal && familyRootId !== familyRootVal) {
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

      // Response required filter
      if (responseRequiredOnly && row.dataset.responseNeeded !== "true") {
        row.hidden = true;
        return;
      }

      // Name search
      if (query && !name.includes(query)) {
        row.hidden = true;
        return;
      }

      row.hidden = false;
      visible++;

      // Accumulate this row's response state for later per-volunteer resolution
      if (!volResponseAccum.has(volId)) {
        volResponseAccum.set(volId, {
          yes: false,
          no: false,
          maybe: false,
          pending: false,
          revoked: false,
        });
      }
      const accum = volResponseAccum.get(volId);
      if (revoked) accum.revoked = true;
      else if (response === "yes") accum.yes = true;
      else if (response === "no") accum.no = true;
      else if (response === "maybe") accum.maybe = true;
      else accum.pending = true;
    });

    // Resolve per-volunteer accumulated responses to stat card buckets.
    // A volunteer with any definitive response (yes/no/maybe) in any
    // visible row is NOT counted as pending — even if they also have a
    // pending row from a follow-up campaign they were re-invited to.
    for (const [vid, accum] of volResponseAccum) {
      const hasResponded = accum.yes || accum.no || accum.maybe;
      seenTotal.add(vid);
      if (accum.yes) seenYes.add(vid);
      if (accum.no) seenNo.add(vid);
      if (accum.maybe) seenMaybe.add(vid);
      if (!hasResponded && accum.pending) seenPending.add(vid);
      if (!hasResponded && accum.revoked) seenRevoked.add(vid);
    }

    const cntTotal = seenTotal.size;
    const cntYes = seenYes.size;
    const cntNo = seenNo.size;
    const cntMaybe = seenMaybe.size;
    const cntPending = seenPending.size;
    const cntRevoked = seenRevoked.size;

    /**
     * Returns true if a volunteer has responded (yes/no/maybe) in any
     * visible row — used to exclude them from the Remind count even if
     * their row in the parent batch is still marked pending.
     * @param {string} volId
     * @returns {boolean}
     */
    const hasRespondedAnywhere = (volId) => {
      const accum = volResponseAccum.get(volId);
      return !!accum && (accum.yes || accum.no || accum.maybe);
    };

    // Pending count for the Remind button — mirrors the Pending stat card.
    // Since the DB now returns one row per volunteer per family, each visible
    // pending row IS the canonical pending state — no cross-row dedup needed.
    const cntPendingParentOnly = new Set(
      Array.from(rows)
        .filter(
          (r) =>
            !r.hidden &&
            r.dataset.response === 'pending' &&
            r.dataset.volStatus === 'completed' &&
            batchResponseNeededMap.get(r.dataset.batchId) !== false,
        )
        .map((r) => r.dataset.volunteerId),
    ).size;

    if (rowCount) {
      rowCount.textContent = `Showing ${visible} invitation${visible !== 1 ? "s" : ""}`;
    }

    // Update stat cards
    const statTotal = document.getElementById("itStatTotal");
    const statYes = document.getElementById("itStatYes");
    const statNo = document.getElementById("itStatNo");
    const statMaybe = document.getElementById("itStatMaybe");
    const statPending = document.getElementById("itStatPending");
    const statRevoked = document.getElementById("itStatRevoked");
    if (statTotal) statTotal.textContent = String(cntTotal);
    if (statYes) statYes.textContent = String(cntYes);
    if (statNo) statNo.textContent = String(cntNo);
    if (statMaybe) statMaybe.textContent = String(cntMaybe);
    if (statPending) statPending.textContent = String(cntPending);
    if (statRevoked) statRevoked.textContent = String(cntRevoked);

    // Update batch group note
    const groupNote = document.getElementById("itBatchGroupNote");
    if (groupNote) {
      if (familyRootVal && batchChildCount > 0) {
        groupNote.textContent = `Includes ${batchChildCount} follow-up campaign${batchChildCount !== 1 ? 's' : ''}`;
        groupNote.classList.remove('d-none');
      } else {
        groupNote.textContent = '';
        groupNote.classList.add('d-none');
      }
    }

    updateAddVolunteersLink();
    updateRemindButton(cntPendingParentOnly);
  }

  // Wire all filter controls
  [batchFilter, dayFilter, responseFilter].forEach((el) => {
    el?.addEventListener("change", applyFilters);
  });
  revokedChk?.addEventListener("change", applyFilters);
  responseRequiredChk?.addEventListener("change", applyFilters);
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
    if (revokedChk)          revokedChk.checked = true;
    if (responseRequiredChk) responseRequiredChk.checked = false;
    if (searchInput)         searchInput.value = "";
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

    if (familyRootVal) {
      addVolunteersBtn.href = `/oversight/tools/campaigns?batchId=${familyRootVal}`;
      addVolunteersWrap.classList.remove('d-none');
    } else {
      addVolunteersWrap.classList.add('d-none');
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
    const pendingCount =
      livePendingCount ?? Number(remindWrap?.dataset.pendingCount ?? 0);

    // Determine response_needed for selected batch
    const selectedOpt = familyRootVal
      ? batchFilter?.querySelector(`option[value="${familyRootVal}"]`)
      : null;
    const responseNeeded =
      !selectedOpt || selectedOpt.dataset.responseNeeded !== '0';

    // ── Pending stat card ───────────────────────────────────────────────
    // No click behaviour — setting the response filter to "pending" hides
    // all responded rows, which breaks the volResponseAccum dedup logic
    // and causes the Remind button count to inflate back to the raw total.
    const pendingLabel = document.getElementById("itStatPendingLabel");
    if (pendingLabel) pendingLabel.textContent = "Pending";

    // ── Remind button ───────────────────────────────────────────────────
    if (!remindWrap) return;

    if (!familyRootVal) {
      remindWrap.innerHTML = '';
      return;
    }

    if (!responseNeeded) {
      remindWrap.innerHTML = '';
      return;
    }

    remindWrap.innerHTML = `
      <a href="/oversight/tools/campaigns?batchId=${familyRootVal}&selectPending=1"
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
    editCampaignBtn.classList.toggle('d-none', !batchFilter?.value);
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
    const nameEl = document.getElementById("itEditName");
    const subjectEl = document.getElementById("itEditSubject");
    const bodyEl = document.getElementById("itEditBody");
    const parentEl = document.getElementById("itEditParent");
    const parentHint = document.getElementById("itEditParentHint");
    const respEl = document.getElementById("itEditResponseNeeded");
    const activeEl = document.getElementById("itEditActive");
    const errorEl = document.getElementById("itEditError");

    if (nameEl) nameEl.value = batch.name || "";
    if (subjectEl) subjectEl.value = batch.message_subject || "";
    if (bodyEl) bodyEl.value = batch.message_body || "";
    if (respEl) respEl.checked = batch.response_needed !== false;
    if (activeEl) activeEl.checked = batch.active !== false;
    const msgTypeEl = document.getElementById("itEditMessageType");
    if (msgTypeEl) msgTypeEl.value = batch.message_type || "invitation";
    if (errorEl) errorEl.classList.add("d-none");

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

      parentEl.value = batch.parent_batch_id
        ? String(batch.parent_batch_id)
        : "";

      if (parentHint) {
        const childCount = childIds.size;
        parentHint.textContent =
          childCount > 0
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
  document
    .getElementById("itEditSaveBtn")
    ?.addEventListener("click", async () => {
      if (!editingBatchId) return;

      const nameEl = document.getElementById("itEditName");
      const subjectEl = document.getElementById("itEditSubject");
      const bodyEl = document.getElementById("itEditBody");
      const parentEl = document.getElementById("itEditParent");
      const respEl = document.getElementById("itEditResponseNeeded");
      const activeEl = document.getElementById("itEditActive");
      const errorEl = document.getElementById("itEditError");
      const saveBtn = document.getElementById("itEditSaveBtn");

      const name = nameEl?.value.trim() || "";
      const messageSubject = subjectEl?.value.trim() || null;
      const messageBody = bodyEl?.value.trim() || "";
      const parentBatchId = Number(parentEl?.value) || null;
      const responseNeeded = respEl?.checked ?? true;
      const active = activeEl?.checked ?? true;

      if (!name) {
        if (errorEl) {
          errorEl.textContent = "Name is required.";
          errorEl.classList.remove("d-none");
        }
        return;
      }
      if (!messageBody) {
        if (errorEl) {
          errorEl.textContent = "Message body is required.";
          errorEl.classList.remove("d-none");
        }
        return;
      }

      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Saving…`;
      }
      if (errorEl) errorEl.classList.add("d-none");

      try {
        const messageType =
          document.getElementById("itEditMessageType")?.value || "invitation";
        const res = await fetch(
          `/oversight/tools/messaging/batches/${editingBatchId}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": getCsrf(),
            },
            body: JSON.stringify({
              name,
              messageSubject,
              messageBody,
              parentBatchId,
              responseNeeded,
              active,
              messageType,
            }),
          },
        );
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
          if (errorEl) {
            errorEl.textContent =
              data.error || "Save failed — please try again.";
            errorEl.classList.remove("d-none");
          }
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk me-1"></i>Save changes`;
          }
          return;
        }

        // If deactivated, the batch will no longer appear — reload to resync
        if (!active) {
          window.location.reload();
          return;
        }

        // Update the option text and data attrs in the batch filter select
        const opt = batchFilter?.querySelector(
          `option[value="${editingBatchId}"]`,
        );
        if (opt) {
          opt.dataset.responseNeeded = responseNeeded ? "1" : "0";
          opt.dataset.parentId = parentBatchId ? String(parentBatchId) : "";
          const prefix = parentBatchId ? "↳ " : "";
          opt.textContent = `${prefix}${name}`;
        }

        // Sync the in-memory batches array so re-opening the edit modal
        // pre-fills with the values that were just saved, not stale page-load data.
        const batchesEl = document.getElementById("it-batches-data");
        if (batchesEl) {
          try {
            const batches = JSON.parse(batchesEl.textContent);
            const idx = batches.findIndex((b) => b.id === editingBatchId);
            if (idx !== -1) {
              batches[idx] = {
                ...batches[idx],
                name,
                message_subject: messageSubject,
                message_body: messageBody,
                parent_batch_id: parentBatchId,
                response_needed: responseNeeded,
                active,
              };
              batchesEl.textContent = JSON.stringify(batches);
            }
          } catch {
            // Non-fatal — worst case the modal pre-fills with stale data
          }
        }

        // Close modal
        const modalEl = document.getElementById("itEditCampaignModal");
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();

        // Re-run filters so response_needed changes take effect immediately
        applyFilters();
      } catch (err) {
        console.error("[invitationTracker] edit campaign save error:", err);
        if (errorEl) {
          errorEl.textContent = "Network error — please try again.";
          errorEl.classList.remove("d-none");
        }
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk me-1"></i>Save changes`;
        }
      }
    });

  // =========================================================
  // Init
  // =========================================================

  applyEventDotColors();
  applyFilters();
});
