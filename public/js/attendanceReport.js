/**
 * @file attendanceReport.js
 * @description Client-side logic for the Attendance Report page.
 *
 * Responsibilities:
 *  - Load per-day shift stats via AJAX on day selection.
 *  - Build the session/shift accordion from the response.
 *  - Lazy-load per-shift volunteer detail tables on accordion expand.
 *  - Allow attended toggle and notes edits inline (same upsert endpoint).
 *  - Update shift stat counters after any toggle change.
 */

document.addEventListener("DOMContentLoaded", () => {
  // =========================================================
  // Element references
  // =========================================================

  /** @type {HTMLSelectElement|null} */
  const daySelect = document.getElementById("arDaySelect");
  /** @type {HTMLElement|null} */
  const accordion = document.getElementById("arAccordion");
  /** @type {HTMLElement|null} */
  const loader = document.getElementById("arLoader");
  /** @type {HTMLElement|null} */
  const emptyState = document.getElementById("arEmpty");
  /** @type {HTMLElement|null} */
  /** @type {HTMLElement|null} */
  /** @type {HTMLElement|null} */
  const daySummary = document.getElementById("arDaySummary");
  /** @type {HTMLElement|null} */
  const sumAttended = document.getElementById("arSumAttended");
  /** @type {HTMLElement|null} */
  const filterBar   = document.getElementById("arFilterBar");
  /** @type {HTMLSelectElement|null} */
  const filterType  = document.getElementById("arFilterType");
  /** @type {HTMLSelectElement|null} */
  const filterRsvp  = document.getElementById("arFilterRsvp");
  /** @type {HTMLSelectElement|null} */
  const filterAtt   = document.getElementById("arFilterAttended");
  /** @type {HTMLInputElement|null} */
  const filterName  = document.getElementById("arFilterName");
  /** @type {HTMLSelectElement|null} */
  const filterGender = document.getElementById("arFilterGender");
  /** @type {HTMLButtonElement|null} */
  const filterReset = document.getElementById("arFilterReset");
  /** @type {HTMLElement|null} */
  const filterCount = document.getElementById("arFilterCount");

  // =========================================================
  // Helpers
  // =========================================================

  /** @returns {string} */
  function getCsrf() {
    return document.getElementById("arCsrfToken")?.value || "";
  }

  /**
   * Format a MSSQL TIME value (epoch-anchored Date string) to h:MM AM/PM.
   * @param {string|null} val
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
   * Escape a string for safe HTML attribute use.
   * @param {string} s
   * @returns {string}
   */
  function escAttr(s) {
    return (s || "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // =========================================================
  // Day selection → load report
  // =========================================================

  daySelect?.addEventListener("change", () => {
    const dayId = Number(daySelect.value) || 0;
    if (!dayId) {
      clearReport();
      return;
    }
    loadDayReport(dayId);
  });

  /**
   * Clear the accordion and hide day summary.
   * @returns {void}
   */
  function clearReport() {
    if (accordion) {
      accordion.innerHTML = "";
      accordion.classList.add("d-none");
    }
    if (emptyState) emptyState.classList.add("d-none");
    if (daySummary) daySummary.classList.add("d-none");
    if (filterBar)    filterBar.classList.add("d-none");
    if (filterType)   filterType.value   = "";
    if (filterRsvp)   filterRsvp.value   = "";
    if (filterAtt)    filterAtt.value    = "";
    if (filterGender) filterGender.value = "";
    if (filterName)   filterName.value   = "";
    if (filterCount)  filterCount.textContent = "";
  }

  /**
   * Fetch shift stats for a convention day and render the accordion.
   * @param {number} dayId
   * @returns {Promise<void>}
   */
  async function loadDayReport(dayId) {
    clearReport();
    if (loader) loader.classList.remove("d-none");

    try {
      const res = await fetch(
        `/oversight/tools/attendance/day-report/${dayId}`,
      );
      const data = await res.json().catch(() => ({}));

      if (!data.success) {
        showErrorToast(data.error || "Failed to load report.");
        return;
      }

      const shifts = data.shifts || [];
      if (shifts.length === 0) {
        // Day has no shifts — load day-level attendance directly
        await loadDayLevelReport(dayId);
        return;
      }

      buildAccordion(shifts, dayId);
      updateDaySummary(shifts);
      filterBar?.classList.remove("d-none");
      applyReportFilters();
    } catch (err) {
      console.error("[attendanceReport] loadDayReport error:", err);
      showErrorToast("Network error loading report.");
    } finally {
      if (loader) loader.classList.add("d-none");
    }
  }

  /**
   * Update the top-level attended summary badge.
   * @param {Array<object>} shifts
   * @returns {void}
   */
  function updateDaySummary(shifts) {
    const total = shifts.reduce((sum, s) => sum + (s.attended_count || 0), 0);
    if (sumAttended) sumAttended.textContent = String(total);
    daySummary?.classList.remove("d-none");
  }

  // =========================================================
  // Accordion builder
  // =========================================================

  /**
   * Group an array of shifts by session_id, preserving order.
   * @param {Array<object>} shifts
   * @returns {Map<number, { label: string, shifts: Array<object> }>}
   */
  function groupBySession(shifts) {
    const map = new Map();
    shifts.forEach((sh) => {
      if (!map.has(sh.session_id)) {
        map.set(sh.session_id, { label: sh.session_label, shifts: [] });
      }
      map.get(sh.session_id).shifts.push(sh);
    });
    return map;
  }

  /**
   * Render a flat volunteer table for a day with no shifts.
   * Fetches from the day-checkin endpoint and displays a single
   * non-accordion card with stats and the volunteer list.
   * @param {number} dayId
   * @returns {Promise<void>}
   */
  async function loadDayLevelReport(dayId) {
    try {
      const res = await fetch(
        `/oversight/tools/attendance/day-checkin/${dayId}`,
      );
      const data = await res.json().catch(() => ({}));

      if (!data.success) {
        emptyState?.classList.remove("d-none");
        return;
      }

      const volunteers = data.volunteers || [];

      // Day summary stats
      const invited = volunteers.filter((v) => !v.walk_in).length;
      const rsvpYes = volunteers.filter(
        (v) => !v.walk_in && v.rsvp_response === "yes",
      ).length;
      const attended = volunteers.filter((v) => v.attended).length;
      const noShow = volunteers.filter(
        (v) => !v.walk_in && !v.attended && v.rsvp_response !== "no",
      ).length;

      if (sumAttended) sumAttended.textContent = String(attended);
      daySummary?.classList.remove("d-none");

      // Render a single card instead of an accordion
      const card = document.createElement("div");
      card.className = "card shadow-sm";
      card.innerHTML = `
        <div class="card-header py-2 d-flex align-items-center justify-content-between flex-wrap gap-2">
          <span class="fw-semibold small">Full Day Attendance</span>
          <span class="d-flex gap-2 flex-wrap">
            <span class="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle">${invited} invited</span>
            <span class="badge bg-success-subtle text-success-emphasis border border-success-subtle">${rsvpYes} RSVP yes</span>
            <span class="badge bg-info-subtle text-info-emphasis border border-info-subtle" id="arDayAttendedBadge">${attended} attended</span>
            <span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle" id="arDayNoShowBadge">${noShow} no-show</span>
          </span>
        </div>
        <div class="card-body p-0">
          ${buildShiftTable(volunteers, null, dayId, null)}
        </div>`;

      // Wire data attributes for toggles — table rows need dayId
      card.querySelectorAll(".at-row").forEach((row) => {
        row.dataset.shiftId = "";
        row.dataset.dayId = String(dayId);
        row.dataset.sessionId = "";
      });

      if (accordion) {
        accordion.innerHTML = "";
        accordion.appendChild(card);
        accordion.classList.remove("d-none");
      }
      filterBar?.classList.remove("d-none");
      applyReportFilters();
    } catch (err) {
      console.error("[attendanceReport] loadDayLevelReport error:", err);
      emptyState?.classList.remove("d-none");
    }
  }

  /**
   * Build the full accordion HTML and append it to the DOM.
   * Each accordion item represents one shift. Sessions are shown
   * as non-collapsible group headers above their shifts.
   * @param {Array<object>} shifts
   * @param {number} dayId
   * @returns {void}
   */
  function buildAccordion(shifts, dayId) {
    if (!accordion) return;
    accordion.innerHTML = "";

    const sessions = groupBySession(shifts);
    let itemIndex = 0;

    sessions.forEach((sess) => {
      // Session heading
      const sessionHeading = document.createElement("div");
      sessionHeading.className = "at-report-session-header mt-3";
      sessionHeading.textContent = sess.label || "Session";
      accordion.appendChild(sessionHeading);

      sess.shifts.forEach((sh) => {
        const itemId = `arShift-${sh.shift_id}`;
        const collapseId = `arCollapse-${sh.shift_id}`;
        const isFirst = itemIndex === 0;

        const dotStyle = sh.event_type_color
          ? `style="background:${sh.event_type_color}"`
          : "";

        const item = document.createElement("div");
        item.className = "accordion-item mb-2 shadow-sm";
        item.innerHTML = `
                    <h2 class="accordion-header" id="${itemId}">
                        <button class="accordion-button ${isFirst ? "" : "collapsed"} py-2"
                                type="button"
                                data-bs-toggle="collapse"
                                data-bs-target="#${collapseId}"
                                aria-expanded="${isFirst ? "true" : "false"}"
                                aria-controls="${collapseId}">
                            <span class="d-flex align-items-center gap-2 w-100 me-2 flex-wrap">
                                ${sh.event_type_color ? `<span class="it-event-dot" ${dotStyle}></span>` : ""}
                                <span class="fw-semibold">${sh.shift_label || sh.event_type_name || "Shift"}</span>
                                <span class="text-muted small">${fmtTime(sh.shift_start)}–${fmtTime(sh.shift_end)}</span>
                                <span class="ms-auto d-flex gap-3 me-1" id="arStats-${sh.shift_id}">
                                    ${statPillHtml(sh)}
                                </span>
                            </span>
                        </button>
                    </h2>
                    <div id="${collapseId}"
                         class="accordion-collapse collapse ${isFirst ? "show" : ""}"
                         aria-labelledby="${itemId}"
                         data-shift-id="${sh.shift_id}"
                         data-day-id="${dayId}"
                         data-session-id="${sh.session_id}"
                         data-loaded="false">
                        <div class="accordion-body p-0">
                            <div class="text-center py-4 ar-shift-loader">
                                <div class="spinner-border spinner-border-sm text-primary" role="status">
                                    <span class="visually-hidden">Loading…</span>
                                </div>
                            </div>
                        </div>
                    </div>`;

        accordion.appendChild(item);
        itemIndex++;

        // Auto-load the first shift immediately
        if (isFirst) {
          loadShiftDetail(
            item.querySelector(".accordion-collapse"),
            sh.shift_id,
            dayId,
            sh.session_id,
          );
        }
      });
    });

    accordion.classList.remove("d-none");

    // Wire lazy-load on accordion expand
    accordion.addEventListener("show.bs.collapse", (ev) => {
      const panel = ev.target;
      if (panel.dataset.loaded === "true") return;
      loadShiftDetail(
        panel,
        Number(panel.dataset.shiftId),
        Number(panel.dataset.dayId),
        Number(panel.dataset.sessionId) || null,
      );
    });
  }

  /**
   * Build the stat pills HTML shown in the accordion button header.
   * @param {{ invited_count:number, rsvp_yes_count:number, attended_count:number, no_show_count:number }} sh
   * @returns {string}
   */
  function statPillHtml(sh) {
    return `
            <span class="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle" title="Invited">${sh.invited_count} invited</span>
            <span class="badge bg-success-subtle text-success-emphasis border border-success-subtle" title="RSVP Yes">${sh.rsvp_yes_count} RSVP yes</span>
            <span class="badge bg-info-subtle text-info-emphasis border border-info-subtle" title="Attended">${sh.attended_count} attended</span>
            <span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle" title="No-show">${sh.no_show_count} no-show</span>`;
  }

  // =========================================================
  // Lazy-load shift detail table
  // =========================================================

  /**
   * Fetch and render the volunteer table for a single shift panel.
   * Marks the panel as loaded to prevent duplicate fetches.
   * @param {HTMLElement} panel
   * @param {number} shiftId
   * @param {number} dayId
   * @param {number|null} sessionId
   * @returns {Promise<void>}
   */
  async function loadShiftDetail(panel, shiftId, dayId, sessionId) {
    if (!panel || panel.dataset.loaded === "true") return;
    panel.dataset.loaded = "true";

    const body = panel.querySelector(".accordion-body");
    if (!body) return;

    try {
      const res = await fetch(
        `/oversight/tools/attendance/shift-data/${shiftId}`,
      );
      const data = await res.json().catch(() => ({}));

      if (!data.success) {
        body.innerHTML = `<div class="alert alert-danger m-3">${data.error || "Failed to load."}</div>`;
        return;
      }

      body.innerHTML = buildShiftTable(
        data.volunteers || [],
        shiftId,
        dayId,
        sessionId,
      );
    } catch (err) {
      console.error("[attendanceReport] loadShiftDetail error:", err);
      body.innerHTML = `<div class="alert alert-danger m-3">Network error loading shift data.</div>`;
    }
  }

  /**
   * Build the HTML string for a shift's volunteer table.
   * @param {Array<object>} volunteers
   * @param {number} shiftId
   * @param {number} dayId
   * @param {number|null} sessionId
   * @returns {string}
   */
  function buildShiftTable(volunteers, shiftId, dayId, sessionId) {
    if (volunteers.length === 0) {
      return `<div class="at-empty-state"><i class="fa-solid fa-inbox fa-2x mb-2 d-block"></i>No volunteers for this shift.</div>`;
    }

    const rows = volunteers
      .map((v) => {
        const name = `${v.lastName}, ${v.firstName}`;
        const rowClass = v.attended
          ? "at-row--attended"
          : v.walk_in
            ? "at-row--walkin"
            : "";
        const rsvpHtml = rsvpBadgeHtml(v.rsvp_response, v.walk_in);
        const recTxt = v.recorded_at
          ? `<span class="text-muted" style="font-size:0.75rem">${new Date(v.recorded_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>`
          : `<span class="text-muted small">—</span>`;

        return `
                <tr class="at-row ${rowClass}"
                    data-volunteer-id="${v.volunteer_id}"
                    data-attended="${v.attended ? "true" : "false"}"
                    data-walk-in="${v.walk_in ? "true" : "false"}"
                    data-rsvp="${v.rsvp_response || (v.walk_in ? "na" : "pending")}"
                    data-gender="${v.gender || ""}"
                    data-name="${escAttr(`${v.lastName} ${v.firstName}`.toLowerCase())}"
                    data-shift-id="${shiftId}"
                    data-day-id="${dayId}"
                    data-session-id="${sessionId || ""}">
                    <td class="at-col-name fw-semibold">${name}</td>
                    <td class="at-col-badge">${v.walk_in ? `<span class="at-badge-walkin"><i class="fa-solid fa-person-walking-arrow-right me-1"></i>Walk-In</span>` : `<span class="text-muted small">Invited</span>`}</td>
                    <td class="at-col-rsvp">${rsvpHtml}</td>
                    <td class="at-col-attended text-center">
                        ${
                          v.attended
                            ? `<i class="fa-solid fa-circle-check text-success" title="Attended"></i>`
                            : `<i class="fa-regular fa-circle text-muted" title="Not recorded"></i>`
                        }
                    </td>
                    <td class="at-col-notes text-muted small">
                        ${v.notes ? escAttr(v.notes) : "—"}
                    </td>
                    <td class="at-col-recorded">${recTxt}</td>
                </tr>`;
      })
      .join("");

    return `
            <div class="table-responsive">
                <table class="table table-hover table-sm at-table mb-0">
                    <thead class="table-light">
                        <tr>
                            <th class="at-col-name">Volunteer</th>
                            <th class="at-col-badge">Type</th>
                            <th class="at-col-rsvp">RSVP</th>
                            <th class="at-col-attended">Attended</th>
                            <th class="at-col-notes">Notes</th>
                            <th class="at-col-recorded">Recorded</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
  }

  // =========================================================
  // Filters
  // =========================================================

  /**
   * Test whether all characters of the query appear in order
   * within the target string (subsequence match).
   * @param {string} query  - Lowercased search string.
   * @param {string} target - Lowercased name to test against.
   * @returns {boolean}
   */
  function fuzzyMatch(query, target) {
    let qi = 0;
    for (let ti = 0; ti < target.length && qi < query.length; ti++) {
      if (target[ti] === query[qi]) qi++;
    }
    return qi === query.length;
  }

  /**
   * Apply all active filters to every .at-row across the accordion.
   * Handles Type, RSVP, Attended, Gender dropdowns and fuzzy name search.
   * Updates the visible count label after each run.
   * @returns {void}
   */
  function applyReportFilters() {
    const query      = (filterName?.value || "").trim().toLowerCase();
    const typeVal    = filterType?.value   || "";
    const rsvpVal    = filterRsvp?.value   || "";
    const attVal     = filterAtt?.value    || "";
    const genderVal  = filterGender?.value || "";
    const rows       = Array.from(accordion?.querySelectorAll(".at-row") || []);
    let visible      = 0;

    rows.forEach((row) => {
      const name     = row.dataset.name     || "";
      const walkIn   = row.dataset.walkIn   === "true";
      const attended = row.dataset.attended === "true";
      const rsvp     = row.dataset.rsvp     || "";
      const gender   = row.dataset.gender   || "";

      if (typeVal === "invited" && walkIn)            { row.hidden = true; return; }
      if (typeVal === "walkin"  && !walkIn)           { row.hidden = true; return; }
      if (rsvpVal && rsvp !== rsvpVal)                { row.hidden = true; return; }
      if (attVal  === "yes"    && !attended)          { row.hidden = true; return; }
      if (attVal  === "no"     && attended)           { row.hidden = true; return; }
      if (genderVal && gender !== genderVal)          { row.hidden = true; return; }
      if (query   && !fuzzyMatch(query, name))        { row.hidden = true; return; }

      row.hidden = false;
      visible++;
    });

    const anyActive = query || typeVal || rsvpVal || attVal || genderVal;
    if (filterCount) {
      filterCount.textContent = anyActive
        ? `${visible} volunteer${visible !== 1 ? "s" : ""}`
        : "";
    }
  }

  filterName?.addEventListener("input", applyReportFilters);
  [filterType, filterRsvp, filterAtt, filterGender].forEach((el) =>
    el?.addEventListener("change", applyReportFilters)
  );
  filterReset?.addEventListener("click", () => {
    if (filterType)   filterType.value   = "";
    if (filterRsvp)   filterRsvp.value   = "";
    if (filterAtt)    filterAtt.value    = "";
    if (filterGender) filterGender.value = "";
    if (filterName)   filterName.value   = "";
    applyReportFilters();
  });

  /**
   * Build the RSVP badge HTML for a report table row.
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
});
