/**
 * @file attendanceCheckin.js
 * @description Client-side logic for the Attendance Check-In tool.
 *
 * Responsibilities:
 *  - Cascade day → shift picker from embedded JSON.
 *  - Load shift volunteer list via AJAX on shift selection.
 *  - Render the volunteer table with attended toggles and notes inputs.
 *  - AJAX upsert on toggle change or notes blur.
 *  - Update stat cards from the current table state.
 *  - Walk-in modal — search all volunteers, add to shift with attended=true.
 */

document.addEventListener("DOMContentLoaded", () => {
  // =========================================================
  // Embedded data
  // =========================================================

  /**
   * Parse a JSON blob embedded in a <script type="application/json"> tag.
   * @param {string} id
   * @returns {any}
   */
  function parseJson(id) {
    try {
      const el = document.getElementById(id);
      return el ? JSON.parse(el.textContent) : null;
    } catch {
      return null;
    }
  }

  /** @type {Array<object>} Full day/session/shift hierarchy. */
  const daysData = parseJson("at-days-data") || [];

  /** @type {Array<{id:number, firstName:string, lastName:string}>} */
  const allVolunteers = parseJson("at-volunteers-data") || [];

  // =========================================================
  // Element references
  // =========================================================

  /** @type {HTMLSelectElement|null} */
  const daySelect = document.getElementById("atDaySelect");
  /** @type {HTMLSelectElement|null} */
  const shiftSelect = document.getElementById("atShiftSelect");
  /** @type {HTMLElement|null} */
  const shiftMeta = document.getElementById("atShiftMeta");
  /** @type {HTMLElement|null} */
  const statsRow = document.getElementById("atStatsRow");
  /** @type {HTMLElement|null} */
  const tableCard = document.getElementById("atTableCard");
  /** @type {HTMLElement|null} */
  const tableBody = document.getElementById("atTableBody");
  /** @type {HTMLElement|null} */
  const tableLoader = document.getElementById("atTableLoader");
  /** @type {HTMLElement|null} */
  const tableWrap = document.getElementById("atTableWrap");
  /** @type {HTMLElement|null} */
  const tableTitle = document.getElementById("atTableTitle");
  /** @type {HTMLElement|null} */
  const rowCount = document.getElementById("atRowCount");
  /** @type {HTMLButtonElement|null} */
  const walkInBtn = document.getElementById("atWalkInBtn");

  // =========================================================
  // State
  // =========================================================

  /**
   * Context for the currently selected shift.
   * @type {{ shiftId: number, conventionDayId: number, sessionId: number|null }|null}
   */
  let currentShift = null;

  /**
   * IDs of volunteers already in the table (invited + walk-ins).
   * Used to prevent duplicate walk-in adds.
   * @type {Set<number>}
   */
  let presentVolIds = new Set();

  // =========================================================
  // Helpers
  // =========================================================

  /** @returns {string} */
  function getCsrf() {
    return document.getElementById("atCsrfToken")?.value || "";
  }

  /**
   * Format a MSSQL TIME value (epoch-anchored Date or ISO string) to h:MM AM/PM.
   * @param {string|Date|null} val
   * @returns {string}
   */
  function fmtTime(val) {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d.valueOf())) return "";
    const h = d.getUTCHours();
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    const ap = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${m} ${ap}`;
  }

  /**
   * Show a brief error toast with a custom message.
   * @param {string} [msg]
   * @returns {void}
   */
  function showErrorToast(msg) {
    const toastEl = document.getElementById("atErrorToast");
    const toastBody = document.getElementById("atErrorToastBody");
    if (toastBody)
      toastBody.innerHTML = `<i class="fa-solid fa-triangle-exclamation me-2"></i>${msg || "Save failed — please try again."}`;
    if (toastEl) bootstrap.Toast.getOrCreateInstance(toastEl).show();
  }

  // =========================================================
  // Day → shift cascade
  // =========================================================

  /**
   * Populate the shift picker for the selected day.
   * Sessions appear as <optgroup> labels; shifts as <option> children.
   * @returns {void}
   */
  function populateShiftPicker() {
    if (!shiftSelect) return;

    const dayId = Number(daySelect?.value) || 0;
    shiftSelect.innerHTML = '<option value="">— Select a shift —</option>';
    shiftSelect.disabled = !dayId;

    if (!dayId) {
      currentShift = null;
      hideShiftContent();
      return;
    }

    const day = daysData.find((d) => d.id === dayId);
    if (!day) return;

    // Check if this day has any shifts at all
    const hasShifts = day.sessions?.some((s) => s.shifts?.length > 0);
    if (!hasShifts) {
      const opt = document.createElement("option");
      opt.value             = "day-only";
      opt.dataset.dayId     = String(day.id);
      opt.dataset.sessionId = "";
      opt.dataset.isDayOnly = "true";
      opt.textContent       = "Full Day";
      shiftSelect.appendChild(opt);

      // Auto-select and load — there's no other choice for this day
      shiftSelect.value = "day-only";
      shiftSelect.dispatchEvent(new Event("change"));
      return;
    }

    day.sessions.forEach((sess) => {
      if (!sess.shifts?.length) return;
      const group = document.createElement("optgroup");
      group.label = sess.label || `Session ${sess.id}`;

      sess.shifts.forEach((sh) => {
        const opt = document.createElement("option");
        opt.value = String(sh.id);
        opt.dataset.dayId = String(day.id);
        opt.dataset.sessionId = String(sess.id);
        opt.textContent = `${sh.label || sh.event_type_name || "Shift"} · ${fmtTime(sh.start_time)}–${fmtTime(sh.end_time)}`;
        group.appendChild(opt);
      });

      shiftSelect.appendChild(group);
    });
  }

  daySelect?.addEventListener("change", () => {
    hideShiftContent();
    populateShiftPicker();

  });

  // =========================================================
  // Shift selection → load volunteers
  // =========================================================

  /**
   * Hide stat cards and table, clear current shift state.
   * @returns {void}
   */
  function hideShiftContent() {
    statsRow?.classList.add("d-none");
    tableCard?.classList.add("d-none");
    if (shiftMeta) {
      shiftMeta.textContent = "";
      shiftMeta.classList.add("d-none");
    }
    currentShift = null;
    presentVolIds = new Set();
  }

  shiftSelect?.addEventListener("change", () => {
    const val = shiftSelect.value;
    if (!val) {
      hideShiftContent();
      return;
    }

    const opt =
      shiftSelect.querySelector(`option[value="${CSS.escape(val)}"]`) ||
      shiftSelect.options[shiftSelect.selectedIndex];

    if (val === "day-only") {
      currentShift = {
        shiftId: null,
        conventionDayId: Number(opt?.dataset.dayId || 0),
        sessionId: null,
        isDayOnly: true,
      };
    } else {
      const shiftId = Number(val) || 0;
      if (!shiftId) {
        hideShiftContent();
        return;
      }
      currentShift = {
        shiftId,
        conventionDayId: Number(opt?.dataset.dayId || 0),
        sessionId: Number(opt?.dataset.sessionId || 0) || null,
        isDayOnly: false,
      };
    }

    loadShiftVolunteers();
  });

  /**
   * Fetch volunteer + attendance data for the current shift and render.
   * @returns {Promise<void>}
   */
  async function loadShiftVolunteers() {
    if (!currentShift) return;

    // Show skeleton
    tableCard?.classList.remove("d-none");
    statsRow?.classList.add("d-none");
    if (tableLoader) tableLoader.classList.remove("d-none");
    if (tableWrap) tableWrap.classList.add("d-none");
    if (tableBody) tableBody.innerHTML = "";

    try {
      const url = currentShift.isDayOnly
        ? `/oversight/tools/attendance/day-checkin/${currentShift.conventionDayId}`
        : `/oversight/tools/attendance/shift-data/${currentShift.shiftId}`;
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));

      if (!data.success) {
        showErrorToast(data.error || "Failed to load volunteers.");
        tableCard?.classList.add("d-none");
        return;
      }

      renderTable(data.volunteers || []);
    } catch (err) {
      console.error("[attendanceCheckin] loadShiftVolunteers error:", err);
      showErrorToast("Network error loading volunteers.");
      tableCard?.classList.add("d-none");
    } finally {
      if (tableLoader) tableLoader.classList.add("d-none");
      if (tableWrap) tableWrap.classList.remove("d-none");
    }
  }

  // =========================================================
  // Table rendering
  // =========================================================

  /**
   * Build the RSVP badge HTML for a given response value.
   * @param {string|null} response
   * @param {boolean} walkIn
   * @returns {string}
   */
  function rsvpBadgeHtml(response, walkIn) {
    if (walkIn) return `<span class="at-badge-na">N/A</span>`;
    switch (response) {
      case "yes":
        return `<span class="at-badge-yes"><i class="fa-solid fa-circle-check me-1"></i>Yes</span>`;
      case "no":
        return `<span class="at-badge-no"><i class="fa-solid fa-circle-xmark me-1"></i>No</span>`;
      case "maybe":
        return `<span class="at-badge-maybe"><i class="fa-solid fa-circle-question me-1"></i>Maybe</span>`;
      default:
        return `<span class="at-badge-pending">Pending</span>`;
    }
  }

  /**
   * Escape a string for safe use as an HTML attribute value.
   * @param {string} s
   * @returns {string}
   */
  function escAttr(s) {
    return (s || "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /**
   * Render the volunteer table from a flat array of attendance records.
   * @param {Array<object>} volunteers
   * @returns {void}
   */
  function renderTable(volunteers) {
    if (!tableBody) return;

    presentVolIds = new Set(volunteers.map((v) => v.volunteer_id));

    if (volunteers.length === 0) {
      tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="at-empty-state">
                        <i class="fa-solid fa-inbox fa-2x mb-2 d-block"></i>
                        No volunteers invited to this shift yet.
                    </td>
                </tr>`;
      updateStats(volunteers);
      updateHeader(volunteers, 0);
      statsRow?.classList.remove("d-none");
      return;
    }

    tableBody.innerHTML = volunteers
      .map((v) => {
        const name = `${v.lastName}, ${v.firstName}`;
        const rowClass = v.attended
          ? "at-row--attended"
          : v.walk_in
            ? "at-row--walkin"
            : "";
        const typeBadge = v.walk_in
          ? `<span class="at-badge-walkin"><i class="fa-solid fa-person-walking-arrow-right me-1"></i>Walk-In</span>`
          : `<span class="text-muted small">Invited</span>`;
        const recordedTxt = v.recorded_at
          ? `<span class="text-muted" style="font-size:0.75rem">${new Date(v.recorded_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${escAttr(v.recorded_by || "")}</span>`
          : `<span class="text-muted small">—</span>`;

        return `
                <tr class="at-row ${rowClass}"
                    data-volunteer-id="${v.volunteer_id}"
                    data-attended="${v.attended ? "true" : "false"}"
                    data-walk-in="${v.walk_in ? "true" : "false"}">
                    <td class="at-col-name fw-semibold">${name}</td>
                    <td class="at-col-badge">${typeBadge}</td>
                    <td class="at-col-rsvp">${rsvpBadgeHtml(v.rsvp_response, v.walk_in)}</td>
                    <td class="at-col-attended">
                        <div class="form-check form-switch d-flex justify-content-center mb-0">
                            <input class="form-check-input at-attended-toggle" type="checkbox"
                                   role="switch"
                                   data-volunteer-id="${v.volunteer_id}"
                                   ${v.attended ? "checked" : ""}
                                   aria-label="Attended" />
                        </div>
                    </td>
                    <td class="at-col-notes">
                        <input type="text"
                               class="at-notes-input"
                               data-volunteer-id="${v.volunteer_id}"
                               value="${escAttr(v.notes || "")}"
                               placeholder="Add note…"
                               maxlength="999" />
                    </td>
                    <td class="at-col-recorded">${recordedTxt}</td>
                </tr>`;
      })
      .join("");

    updateStats(volunteers);
    updateHeader(volunteers, volunteers.length);
    statsRow?.classList.remove("d-none");
  }

  // =========================================================
  // Stats + header
  // =========================================================

  /**
   * Recompute and update the four stat cards from the current volunteer array.
   * Called after initial render and after any toggle change.
   * @returns {void}
   */
  function updateStatsFromRows() {
    const rows = Array.from(tableBody?.querySelectorAll(".at-row") || []);
    const invited = rows.filter((r) => r.dataset.walkIn !== "true").length;
    const rsvpYes = Array.from(
      tableBody?.querySelectorAll(".at-badge-yes") || [],
    ).length;
    const attended = rows.filter((r) => r.dataset.attended === "true").length;
    const noShow = rows.filter(
      (r) =>
        r.dataset.walkIn !== "true" &&
        r.dataset.attended !== "true" &&
        !r.querySelector(".at-badge-no"),
    ).length;

    const el = (id) => document.getElementById(id);
    if (el("atStatInvited")) el("atStatInvited").textContent = String(invited);
    if (el("atStatRsvp")) el("atStatRsvp").textContent = String(rsvpYes);
    if (el("atStatAttended"))
      el("atStatAttended").textContent = String(attended);
    if (el("atStatNoShow")) el("atStatNoShow").textContent = String(noShow);
  }

  /**
   * Update stat cards from a volunteers array (initial render path).
   * @param {Array<object>} volunteers
   * @returns {void}
   */
  function updateStats(volunteers) {
    const invited = volunteers.filter((v) => !v.walk_in).length;
    const rsvpYes = volunteers.filter(
      (v) => !v.walk_in && v.rsvp_response === "yes",
    ).length;
    const attended = volunteers.filter((v) => v.attended).length;
    const noShow = volunteers.filter(
      (v) => !v.walk_in && !v.attended && v.rsvp_response !== "no",
    ).length;

    const el = (id) => document.getElementById(id);
    if (el("atStatInvited")) el("atStatInvited").textContent = String(invited);
    if (el("atStatRsvp")) el("atStatRsvp").textContent = String(rsvpYes);
    if (el("atStatAttended"))
      el("atStatAttended").textContent = String(attended);
    if (el("atStatNoShow")) el("atStatNoShow").textContent = String(noShow);
  }

  /**
   * Update the table card header title and row count.
   * @param {Array<object>} volunteers
   * @param {number} count
   * @returns {void}
   */
  function updateHeader(volunteers, count) {
    const opt = shiftSelect?.options[shiftSelect.selectedIndex];
    if (tableTitle)
      tableTitle.textContent = opt?.textContent?.trim() || "Volunteers";
    if (rowCount)
      rowCount.textContent = `${count} volunteer${count !== 1 ? "s" : ""}`;
    if (shiftMeta) {
      shiftMeta.textContent = opt?.textContent?.trim() || "";
      shiftMeta.classList.remove("d-none");
    }
  }

  // =========================================================
  // Attended toggle
  // =========================================================

  /**
   * Send an upsert attendance request for a single volunteer.
   * @param {number} volunteerId
   * @param {boolean} attended
   * @param {string|null} notes
   * @param {boolean} walkIn
   * @returns {Promise<boolean>} True on success.
   */
  async function saveAttendance(volunteerId, attended, notes, walkIn) {
    if (!currentShift) return false;
    try {
      const res = await fetch("/oversight/tools/attendance/record", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrf(),
        },
        body: JSON.stringify({
          volunteerId,
          conventionDayId: currentShift.conventionDayId,
          sessionId: currentShift.sessionId,
          shiftId: currentShift.shiftId,
          attended,
          notes: notes || null,
          walkIn: !!walkIn,
        }),
      });
      const data = await res.json().catch(() => ({}));
      return !!data.success;
    } catch (err) {
      console.error("[attendanceCheckin] saveAttendance error:", err);
      return false;
    }
  }

  /**
   * Handle the attended toggle switch change.
   * Updates row class, data attribute, and fires AJAX save.
   * @param {Event} ev
   * @returns {Promise<void>}
   */
  async function onToggleChange(ev) {
    const toggle = ev.target;
    if (!toggle.classList.contains("at-attended-toggle")) return;

    const row = toggle.closest(".at-row");
    const volId = Number(toggle.dataset.volunteerId);
    const attended = toggle.checked;
    const walkIn = row?.dataset.walkIn === "true";
    const notes = row?.querySelector(".at-notes-input")?.value || null;

    toggle.disabled = true;
    const ok = await saveAttendance(volId, attended, notes, walkIn);
    toggle.disabled = false;

    if (!ok) {
      toggle.checked = !attended; // revert
      showErrorToast();
      return;
    }

    if (row) {
      row.dataset.attended = attended ? "true" : "false";
      row.classList.toggle("at-row--attended", attended);
      if (!walkIn) row.classList.toggle("at-row--walkin", false);
    }

    updateStatsFromRows();
  }

  tableBody?.addEventListener("change", onToggleChange);

  // =========================================================
  // Notes — save on blur
  // =========================================================

  /**
   * Handle notes input blur — save the current value if it changed.
   * @param {Event} ev
   * @returns {Promise<void>}
   */
  async function onNotesBlur(ev) {
    const input = ev.target;
    if (!input.classList.contains("at-notes-input")) return;

    const row = input.closest(".at-row");
    const volId = Number(input.dataset.volunteerId);
    const attended = row?.dataset.attended === "true";
    const walkIn = row?.dataset.walkIn === "true";
    const notes = input.value.trim() || null;

    input.classList.add("at-notes--saving");
    const ok = await saveAttendance(volId, attended, notes, walkIn);
    input.classList.remove("at-notes--saving");

    if (!ok) showErrorToast("Failed to save note.");
  }

  tableBody?.addEventListener("focusout", onNotesBlur);

  // =========================================================
  // Walk-in modal
  // =========================================================

  /** @type {bootstrap.Modal|null} */
  let walkInModal = null;

  walkInBtn?.addEventListener("click", () => {
    const modalEl = document.getElementById("atWalkInModal");
    if (!modalEl) return;
    walkInModal = bootstrap.Modal.getOrCreateInstance(modalEl);

    // Reset state
    const searchEl = document.getElementById("atWalkInSearch");
    const listEl = document.getElementById("atWalkInList");
    const errorEl = document.getElementById("atWalkInError");
    if (searchEl) searchEl.value = "";
    if (listEl)
      listEl.innerHTML =
        '<p class="text-muted small mb-0">Start typing to search volunteers.</p>';
    if (errorEl) errorEl.classList.add("d-none");

    walkInModal.show();

    // Focus search after modal shown
    modalEl.addEventListener("shown.bs.modal", () => searchEl?.focus(), {
      once: true,
    });
  });

  document.getElementById("atWalkInSearch")?.addEventListener("input", (ev) => {
    const query = ev.target.value.trim().toLowerCase();
    const listEl = document.getElementById("atWalkInList");
    if (!listEl) return;

    if (query.length < 1) {
      listEl.innerHTML =
        '<p class="text-muted small mb-0">Start typing to search volunteers.</p>';
      return;
    }

    const matches = allVolunteers
      .filter((v) => {
        const full = `${v.lastName} ${v.firstName}`.toLowerCase();
        return full.includes(query) && !presentVolIds.has(v.id);
      })
      .slice(0, 20);

    if (matches.length === 0) {
      listEl.innerHTML =
        '<p class="text-muted small mb-0">No matching volunteers found.</p>';
      return;
    }

    listEl.innerHTML = matches
      .map(
        (v) => `
            <button type="button"
                    class="btn btn-outline-secondary btn-sm w-100 text-start mb-1 at-walkin-pick"
                    data-id="${v.id}"
                    data-name="${escAttr(`${v.lastName}, ${v.firstName}`)}">
                ${v.lastName}, ${v.firstName}
            </button>`,
      )
      .join("");
  });

  document
    .getElementById("atWalkInList")
    ?.addEventListener("click", async (ev) => {
      const btn = ev.target.closest(".at-walkin-pick");
      if (!btn) return;

      const volId = Number(btn.dataset.id);
      const name = btn.dataset.name || "this volunteer";
      const errorEl = document.getElementById("atWalkInError");

      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${name}`;

      const ok = await saveAttendance(volId, true, null, true);

      if (!ok) {
        btn.disabled = false;
        btn.textContent = name;
        if (errorEl) {
          errorEl.textContent = "Failed to add walk-in — please try again.";
          errorEl.classList.remove("d-none");
        }
        return;
      }

      // Close modal and reload the shift list to include the new walk-in
      walkInModal?.hide();
      await loadShiftVolunteers();
    });
});
