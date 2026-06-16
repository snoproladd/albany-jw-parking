/**
 * @file crewMatrix.js
 * @description Client logic for the Crew Assignment matrix page.
 *
 * Responsibilities:
 *  - Wire each crew toggle switch to an immediate AJAX PATCH save.
 *  - Toggle-all button per crew column (affects only visible rows).
 *  - Live name search, role filter, and crew assignment filter.
 *  - Show an inline toast on save success or failure.
 */

document.addEventListener("DOMContentLoaded", () => {
  const csrfToken =
    document.querySelector('meta[name="csrf-token"]')?.content || "";

  /** Ordered list of crew keys matching column order. */
  const CREW_KEYS = [
    "lots_and_garages",
    "signs",
    "security",
    "dropoff_pickup",
    "mobile_support",
    "desk",
  ];

  // ─────────────────────────────────────────────
  //  Toast
  // ─────────────────────────────────────────────

  /** @type {number|null} */
  let _toastTimer = null;

  /**
   * Show the save-status toast briefly then auto-hide.
   *
   * @param {string}            msg
   * @param {'success'|'error'} type
   * @returns {void}
   */
  function showToast(msg, type = "success") {
    const toast = document.getElementById("crewToast");
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `crew-toast crew-toast--${type}`;
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => toast.classList.add("d-none"), 2200);
  }

  // ─────────────────────────────────────────────
  //  AJAX save
  // ─────────────────────────────────────────────

  /**
   * PATCH a single crew flag for a volunteer.
   * Throws on network error or non-success response.
   *
   * @param {string|number} volunteerId
   * @param {string}        crewKey
   * @param {boolean}       value
   * @returns {Promise<void>}
   */
  async function saveCrewToggle(volunteerId, crewKey, value) {
    const res = await fetch(`/api/crews/${volunteerId}/${crewKey}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({ value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.error || "Save failed.");
  }

  // ─────────────────────────────────────────────
  //  Individual toggle
  // ─────────────────────────────────────────────

  /**
   * Handle a single crew toggle change. Saves immediately and reverts on
   * failure. Updates the toggle-all button state and re-runs filters after
   * each change so crew-filter results stay accurate.
   *
   * @param {Event} event
   * @returns {Promise<void>}
   */
  async function onToggleChange(event) {
    const toggle = /** @type {HTMLInputElement} */ (event.target);
    const row = toggle.closest(".crew-row");
    const volunteerId = row?.dataset.id;
    const crewKey = toggle.dataset.crew;
    const value = toggle.checked;

    if (!volunteerId || !crewKey) return;
    toggle.disabled = true;

    try {
      await saveCrewToggle(volunteerId, crewKey, value);
      showToast("Saved.", "success");
    } catch (err) {
      toggle.checked = !value;
      showToast(err.message || "Save failed — please try again.", "error");
      console.error("[crewMatrix] toggle save error:", err);
    } finally {
      toggle.disabled = false;
      _updateToggleAllBtn(crewKey);
      _applyFilters();
    }
  }

  document.querySelectorAll(".crew-toggle").forEach((t) => {
    t.addEventListener("change", onToggleChange);
  });

  // ─────────────────────────────────────────────
  //  Toggle-all per column
  // ─────────────────────────────────────────────

  /**
   * Handle a toggle-all button click for a crew column.
   *
   * Reads visible rows only. If any visible toggle in the column is
   * unchecked, checks all; if all are already checked, unchecks all.
   * Fires saves in parallel and reverts individual toggles that fail.
   *
   * @param {Event} event
   * @returns {Promise<void>}
   */
  /**
   * Handle a toggle-all button click for a crew column.
   *
   * Collects all visible rows that need to change, fires a single batch
   * PATCH to the server, then updates the DOM on success.
   * Reverts all affected toggles if the request fails.
   *
   * @param {Event} event
   * @returns {Promise<void>}
   */
  async function onToggleAllClick(event) {
    const btn     = /** @type {HTMLButtonElement} */ (event.currentTarget);
    const crewKey = btn.dataset.crew;
    if (!crewKey) return;

    const visibleRows = Array.from(
      document.querySelectorAll(".crew-row:not(.d-none)"),
    );
    if (visibleRows.length === 0) return;

    const toggles = visibleRows
      .map((row) => row.querySelector(`.crew-toggle[data-crew="${crewKey}"]`))
      .filter((t) => t !== null);

    if (toggles.length === 0) return;

    const targetValue = toggles.some((t) => !t.checked);
    const toChange    = toggles.filter((t) => t.checked !== targetValue);
    if (toChange.length === 0) return;

    const volunteerIds = toChange
      .map((t) => Number(t.closest(".crew-row")?.dataset.id))
      .filter((id) => id > 0);

    if (volunteerIds.length === 0) return;

    // Disable button and show spinner while saving
    btn.disabled = true;
    const icon = btn.querySelector("i");
    if (icon) icon.className = "fa-solid fa-spinner fa-spin";
    toChange.forEach((t) => { t.disabled = true; });

    try {
      const res  = await fetch(`/api/crews/batch/${crewKey}`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ volunteerIds, value: targetValue }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Batch save failed.');
      }

      // Apply DOM changes only after confirmed server success
      toChange.forEach((t) => { t.checked = targetValue; });
      showToast(`${toChange.length} volunteer${toChange.length !== 1 ? 's' : ''} updated.`, 'success');

    } catch (err) {
      showToast(err.message || 'Save failed — please try again.', 'error');
      console.error('[crewMatrix] toggle-all batch error:', err);
    } finally {
      toChange.forEach((t) => { t.disabled = false; });
      btn.disabled = false;
      _updateToggleAllBtn(crewKey);
      _applyFilters();
    }
  }

  document.querySelectorAll(".crew-toggle-all-btn").forEach((btn) => {
    btn.addEventListener("click", onToggleAllClick);
  });

  // ─────────────────────────────────────────────
  //  Toggle-all button state
  // ─────────────────────────────────────────────

  /**
   * Update the icon on a toggle-all button to reflect the current state
   * of visible rows in its column:
   *  - all checked   → solid square-check
   *  - none checked  → regular square (empty)
   *  - mixed         → solid square-minus
   *
   * @param {string} crewKey
   * @returns {void}
   */
  function _updateToggleAllBtn(crewKey) {
    const btn = document.querySelector(
      `.crew-toggle-all-btn[data-crew="${crewKey}"]`,
    );
    if (!btn) return;

    const visibleRows = Array.from(
      document.querySelectorAll(".crew-row:not(.d-none)"),
    );
    const toggles = visibleRows
      .map((row) => row.querySelector(`.crew-toggle[data-crew="${crewKey}"]`))
      .filter((t) => t !== null);

    const icon = btn.querySelector("i");
    if (!icon || toggles.length === 0) return;

    const checkedCount = toggles.filter((t) => t.checked).length;

    if (checkedCount === 0) {
      icon.className = "fa-regular fa-square";
      btn.title = "Check all visible";
    } else if (checkedCount === toggles.length) {
      icon.className = "fa-solid fa-square-check";
      btn.title = "Uncheck all visible";
    } else {
      icon.className = "fa-solid fa-square-minus";
      btn.title = "Check all visible";
    }
  }

  /**
   * Refresh all five toggle-all buttons.
   * Called after filters change so buttons reflect the new visible set.
   *
   * @returns {void}
   */
  function _updateAllToggleAllBtns() {
    CREW_KEYS.forEach(_updateToggleAllBtn);
  }

  // Initialise button states on page load
  _updateAllToggleAllBtns();

  // ─────────────────────────────────────────────
  //  Filters
  // ─────────────────────────────────────────────

  /**
   * Apply name search, role filter, and crew filter to table rows.
   * All three filters use AND logic between them.
   * Role and crew filters use OR logic within their own selections.
   *
   * @returns {void}
   */
  function _applyFilters() {
    const term = (document.getElementById("crewSearch")?.value || "")
      .trim()
      .toLowerCase();

const selectedRoles = Array.from(
            document.querySelectorAll('#crewRoleFilter .crew-filter-btn.active'),
        ).map((b) => b.dataset.value || '');

        const selectedCrewFilters = Array.from(
            document.querySelectorAll('#crewCrewFilter .crew-filter-btn.active'),
        ).map((b) => b.dataset.value || '');

    let visible = 0;

    document.querySelectorAll(".crew-row").forEach((row) => {
      const nameMatch = !term || (row.dataset.name || "").includes(term);
      const roleMatch =
        selectedRoles.length === 0 ||
        selectedRoles.includes(row.dataset.role || "");
      const crewMatch = _matchesCrewFilter(row, selectedCrewFilters);

      const show = nameMatch && roleMatch && crewMatch;
      row.classList.toggle("d-none", !show);
      if (show) visible++;
    });

    const countEl = document.getElementById("crewRowCount");
    if (countEl) {
      countEl.textContent = `${visible} volunteer${visible !== 1 ? "s" : ""}`;
    }

    _updateAllToggleAllBtns();
  }

  /**
   * Check whether a row passes the active crew filter selections.
   * Reads current checkbox states so it stays accurate after toggle changes.
   * OR logic: row passes if it matches ANY selected filter option.
   *
   * @param {HTMLElement} row
   * @param {string[]}    selectedFilters
   * @returns {boolean}
   */
  function _matchesCrewFilter(row, selectedFilters) {
    if (selectedFilters.length === 0) return true;

    const assignedCrews = new Set();
    row.querySelectorAll(".crew-toggle").forEach((t) => {
      if (t.checked) assignedCrews.add(t.dataset.crew);
    });

    for (const filter of selectedFilters) {
      if (filter === "no_crews" && assignedCrews.size === 0) return true;
      if (filter !== "no_crews" && assignedCrews.has(filter)) return true;
    }

    return false;
  }

document.getElementById("crewSearch")?.addEventListener("input", _applyFilters);

// Toggle-button group click handler — shared by both filter groups
document.querySelectorAll(".crew-filter-btngroup").forEach((group) => {
  group.addEventListener("click", (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest(
      ".crew-filter-btn",
    );
    if (!btn) return;
    btn.classList.toggle("active");
    _applyFilters();
  });
});
});
