// public/js/conflictGrid.js
/**
 * @file Master Conflict Grid — client-side logic.
 *
 * Fetches shift, assignment, and blackout data from /api/conflict-grid,
 * computes per-cell conflict status, and renders a scrollable grid with
 * sticky name column and day/shift header rows.
 *
 * Cell states:
 *   X     — assigned, no issues
 *   PC    — not assigned, blackout overlaps this shift (informational)
 *   X/PC  — assigned during a blackout (warning)
 *   SC    — assigned, overlaps another assigned shift (double-booked)
 *   SC/PC — assigned, double-booked AND during a blackout
 */

document.addEventListener("DOMContentLoaded", () => {
  const wrapper = document.getElementById("cgWrapper");
  const loading = document.getElementById("cgLoading");
  const togglePC = document.getElementById("togglePC");
  const toggleAll = document.getElementById("toggleUnassigned");
  const pcLabel = document.getElementById("togglePCLabel");
  const volLabel = document.getElementById("toggleVolLabel");

  if (!wrapper) return;

  /**
   * Update the PC toggle label to reflect current state.
   * @returns {void}
   */
  function syncPCLabel() {
    if (!pcLabel) return;
    pcLabel.textContent = togglePC?.checked
      ? "Show Personal Conflicts"
      : "Shift Conflicts Only";
  }

  /**
   * Update the volunteers toggle label to reflect current state.
   * @returns {void}
   */
  function syncVolLabel() {
    if (!volLabel) return;
    volLabel.textContent = toggleAll?.checked
      ? "Volunteers with Assignments Only"
      : "Show All Volunteers";
  }

  /** Short department labels for disambiguation. */
  const DEPT_ABBR = {
    lots_and_garages: "L&G",
    signs: "Signs",
    security: "Sec",
    dropoff_pickup: "D/P",
    mobile_support: "MS",
    desk: "Desk",
  };

  /** @type {object|null} Raw API response, cached for re-renders. */
  let rawData = null;

  // ── Fetch & initial render ──────────────────────────────────────

  function fetchAndRender(silent = false) {
    if (!silent) {
      loading?.classList.remove("d-none");
      wrapper?.classList.add("d-none");
    }
    fetch("/api/conflict-grid")
      .then((r) => r.json())
      .then((data) => {
        rawData = data;
        window.cgData = data;
        render();
        loading?.classList.add("d-none");
        wrapper.classList.remove("d-none");
      })
      .catch((err) => {
        console.error("[conflictGrid] fetch error:", err);
        if (loading) {
          loading.innerHTML =
            '<p class="text-danger">Failed to load conflict grid.</p>';
        }
      });
  }

  /** Allow the violations panel to refresh the grid after an action. */
  window.cgRefresh = () => fetchAndRender(true);

  fetchAndRender();

  togglePC?.addEventListener("change", () => {
    syncPCLabel();
    render();
  });
  toggleAll?.addEventListener("change", () => {
    syncVolLabel();
    render();
  });

  // ── Context menu ────────────────────────────────────────────────

  const ctxMenu = (() => {
    const el = document.createElement("div");
    el.id = "cgCtxMenu";
    el.className = "cg-ctx-menu d-none";
    document.body.appendChild(el);
    return el;
  })();

  function dismissCtxMenu() {
    ctxMenu.classList.add("d-none");
  }
  document.addEventListener("click", dismissCtxMenu);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") dismissCtxMenu();
  });

  /**
   * @param {number}      x
   * @param {number}      y
   * @param {HTMLElement} cell
   */
  function showCtxMenu(x, y, cell) {
    const state = cell.dataset.cgState;
    const volId = Number(cell.dataset.volId);
    const volName = cell.dataset.volName;
    const shiftId = Number(cell.dataset.shiftId);
    const shiftLabel = cell.dataset.shiftLabel;
    const dayLabel = cell.dataset.dayLabel || "";
    const scShifts = cell.dataset.scShifts
      ? JSON.parse(cell.dataset.scShifts)
      : [];

    ctxMenu.innerHTML = "";

    const addItem = (icon, html, onClick) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cg-ctx-item";
      btn.innerHTML = `<i class="${icon} cg-ctx-icon"></i>${html}`;
      btn.addEventListener("click", () => {
        dismissCtxMenu();
        onClick();
      });
      ctxMenu.appendChild(btn);
    };

    const addDivider = () => {
      const hr = document.createElement("hr");
      hr.className = "cg-ctx-divider";
      ctxMenu.appendChild(hr);
    };

    // Remove from THIS shift (all SC and X/PC states).
    if (state === "sc" || state === "scpc" || state === "xpc") {
      addItem(
        "fa-solid fa-user-minus",
        `Remove from ${dayLabel ? `<span class="text-muted">${dayLabel}</span> ` : ""}<strong>"${shiftLabel}"</strong>`,
        () => ctxRemove(volId, volName, shiftId, dayLabel, shiftLabel),
      );
    }

    // Also offer removing from each conflicting shift.
    for (const sc of scShifts) {
      addItem(
        "fa-solid fa-user-minus",
        `Remove from ${dayLabel ? `<span class="text-muted">${dayLabel}</span> ` : ""}<strong>"${sc.label}"</strong>`,
        () => ctxRemove(volId, volName, sc.id, dayLabel, sc.label),
      );
    }

    // View blackout (X/PC and SC/PC).
    if (state === "xpc" || state === "scpc") {
      if (ctxMenu.children.length) addDivider();
      addItem("fa-solid fa-calendar-xmark", "View Volunteer Blackouts", () =>
        window.showBlackoutModal?.(volId, volName),
      );
    }

    if (!ctxMenu.children.length) return;

    ctxMenu.classList.remove("d-none");
    const vw = window.innerWidth,
      mw = ctxMenu.offsetWidth || 240;
    const vh = window.innerHeight,
      mh = ctxMenu.offsetHeight || 120;
    ctxMenu.style.left = `${Math.min(x + 2, vw - mw - 8)}px`;
    ctxMenu.style.top = `${Math.min(y + 2, vh - mh - 8)}px`;
  }

  /**
   * @param {number} volId
   * @param {string} volName
   * @param {number} shiftId
   * @param {string} dayLabel
   * @param {string} shiftLabel
   */
  function ctxRemove(volId, volName, shiftId, dayLabel, shiftLabel) {
    const where = dayLabel
      ? `${dayLabel} — "${shiftLabel}"`
      : `"${shiftLabel}"`;
    if (!confirm(`Remove ${volName} from ${where}?`)) return;
    fetch("/api/conflict-grid/assignment", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volunteerId: volId, shiftId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) {
          alert("Failed to remove assignment. Please try again.");
          return;
        }
        window.cgRefresh();
      })
      .catch(() => alert("Network error. Please try again."));
  }

  // ── Helpers ─────────────────────────────────────────────────────
  /**
   * Check whether two time ranges overlap (exclusive endpoints).
   *
   * @param {number} aStart
   * @param {number} aEnd
   * @param {number} bStart
   * @param {number} bEnd
   * @returns {boolean}
   */
  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  /**
   * Format minutes-from-midnight as "h:MM AM/PM".
   *
   * @param {number} mins
   * @returns {string}
   */
  function fmtMins(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const ap = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ap}`;
  }

  /**
   * Build a Set of shift labels that appear for more than one department
   * on the same convention day. Used to decide whether to prefix the
   * department abbreviation in the column header.
   *
   * @param {Array} shifts
   * @returns {Set<string>} Keys in the form "dayId-label"
   */
  function findAmbiguousLabels(shifts) {
    /** @type {Map<string, Set<string>>} "dayId-label" → Set of departments */
    const seen = new Map();
    for (const sh of shifts) {
      const key = `${sh.day_id}-${sh.shift_label}`;
      if (!seen.has(key)) seen.set(key, new Set());
      seen.get(key).add(sh.department);
    }
    const ambiguous = new Set();
    for (const [key, depts] of seen) {
      if (depts.size > 1) ambiguous.add(key);
    }
    return ambiguous;
  }

  // ── Render ──────────────────────────────────────────────────────

  /**
   * Build and inject the conflict grid table from cached raw data.
   *
   * @returns {void}
   */
  function render() {
    if (!rawData) return;

    const { shifts, volunteers, assignments, blackouts } = rawData;
    const showPC = togglePC?.checked !== false;
    const showAll = toggleAll?.checked === true;

    // Build lookup: Set<"volId-shiftId">
    const assignSet = new Set();
    for (const a of assignments) {
      assignSet.add(`${a.volunteer_id}-${a.shift_id}`);
    }

    // Determine which volunteers to show
    let visibleVols = volunteers;
    if (!showAll) {
      const assignedIds = new Set(assignments.map((a) => a.volunteer_id));
      visibleVols = volunteers.filter((v) => assignedIds.has(v.id));
    }

    // Build lookup: volunteer → array of assigned shift objects
    /** @type {Map<number, Array<{shift_id:number, day_id:number, start_mins:number, end_mins:number}>>} */
    const volShiftMap = new Map();
    for (const a of assignments) {
      const sh = shifts.find((s) => s.shift_id === a.shift_id);
      if (!sh) continue;
      if (!volShiftMap.has(a.volunteer_id)) {
        volShiftMap.set(a.volunteer_id, []);
      }
      volShiftMap.get(a.volunteer_id).push({
        shift_id: sh.shift_id,
        day_id: sh.day_id,
        start_mins: sh.start_mins,
        end_mins: sh.end_mins,
      });
    }

    // Build lookup: volunteer+day → blackout ranges
    /** @type {Map<string, Array<{start_mins:number, end_mins:number}>>} */
    const bkMap = new Map();
    for (const bk of blackouts) {
      const key = `${bk.volunteer_id}-${bk.day_id}`;
      if (!bkMap.has(key)) bkMap.set(key, []);
      bkMap.get(key).push({
        start_mins: bk.start_mins,
        end_mins: bk.end_mins,
      });
    }

    // Find ambiguous shift labels (same label, different dept, same day)
    const ambiguous = findAmbiguousLabels(shifts);

    // Group shifts by day
    /** @type {Map<number, {label:string, shifts:typeof shifts}>} */
    const dayGroups = new Map();
    for (const sh of shifts) {
      if (!dayGroups.has(sh.day_id)) {
        dayGroups.set(sh.day_id, { label: sh.day_label, shifts: [] });
      }
      dayGroups.get(sh.day_id).shifts.push(sh);
    }

    // ── Build table ──

    const table = document.createElement("table");
    table.classList.add("cg-table");

    // Header row 1: day grouping
    const theadDayTr = document.createElement("tr");
    theadDayTr.classList.add("cg-day-row");
    const cornerTh = document.createElement("th");
    cornerTh.classList.add("cg-corner");
    cornerTh.rowSpan = 2;
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search name\u2026";
    searchInput.classList.add("cg-search");
    cornerTh.appendChild(searchInput);
    theadDayTr.appendChild(cornerTh);

    let dayIdx = 0;
    for (const [, group] of dayGroups) {
      const th = document.createElement("th");
      th.colSpan = group.shifts.length;
      th.classList.add("cg-day-header", `cg-day-header-${dayIdx}`);
      th.textContent = group.label;
      theadDayTr.appendChild(th);
      dayIdx++;
    }

    // Header row 2: shift labels (department-colored)
    const theadShiftTr = document.createElement("tr");
    theadShiftTr.classList.add("cg-shift-row");

    let isFirstDay = true;
    let colIdx = 0;
    for (const [, group] of dayGroups) {
      let isFirstInDay = true;
      for (const sh of group.shifts) {
        const th = document.createElement("th");
        th.classList.add("cg-shift-header");
        th.dataset.col = colIdx;

        // Day boundary divider (skip the very first column)
        if (isFirstInDay && !isFirstDay) {
          th.classList.add("cg-day-start");
        }
        isFirstInDay = false;

        // Department color class
        if (sh.department) {
          th.classList.add(`cg-dept-${sh.department}`);
        }

        // Build display label — prefix with dept abbreviation if ambiguous
        const labelKey = `${sh.day_id}-${sh.shift_label}`;
        let displayLabel = sh.shift_label;
        if (ambiguous.has(labelKey) && DEPT_ABBR[sh.department]) {
          displayLabel = `${DEPT_ABBR[sh.department]}: ${sh.shift_label}`;
        }

        const span = document.createElement("span");
        span.classList.add("cg-shift-text");
        span.textContent = displayLabel;
        th.appendChild(span);
        th.title = [
          sh.shift_label,
          DEPT_ABBR[sh.department] || sh.department || "",
          `${fmtMins(sh.start_mins)} – ${fmtMins(sh.end_mins)}`,
        ].join("\n");

        theadShiftTr.appendChild(th);
        colIdx++;
      }
      isFirstDay = false;
    }

    const thead = document.createElement("thead");
    thead.appendChild(theadDayTr);
    thead.appendChild(theadShiftTr);
    table.appendChild(thead);

    // ── Body rows ──

    const tbody = document.createElement("tbody");

    for (const vol of visibleVols) {
      const tr = document.createElement("tr");

      // Name cell (sticky)
      const nameTd = document.createElement("td");
      nameTd.classList.add("cg-name");
      nameTd.textContent = `${vol.lastName}, ${vol.firstName}`;
      tr.appendChild(nameTd);

      const myShifts = volShiftMap.get(vol.id) || [];

      let isFirstDayBody = true;
      let bodyDayIdx = 0;
      let bodyColIdx = 0;
      for (const [, group] of dayGroups) {
        let isFirstInDayBody = true;
        for (const sh of group.shifts) {
          const td = document.createElement("td");
          td.classList.add("cg-cell", `cg-day-${bodyDayIdx}`);
          td.dataset.col = bodyColIdx;

          if (isFirstInDayBody && !isFirstDayBody) {
            td.classList.add("cg-day-start");
          }
          isFirstInDayBody = false;

          const isAssigned = assignSet.has(`${vol.id}-${sh.shift_id}`);

          // Personal conflict: any blackout on this day overlaps this shift
          const bkKey = `${vol.id}-${sh.day_id}`;
          const volBks = bkMap.get(bkKey) || [];
          const hasPC = volBks.some((bk) =>
            overlaps(sh.start_mins, sh.end_mins, bk.start_mins, bk.end_mins),
          );

          // Shift conflict: assigned to another shift on same day that overlaps.
          const scShifts = [];
          if (isAssigned) {
            for (const other of myShifts) {
              if (
                other.shift_id !== sh.shift_id &&
                other.day_id === sh.day_id &&
                overlaps(
                  sh.start_mins,
                  sh.end_mins,
                  other.start_mins,
                  other.end_mins,
                )
              ) {
                scShifts.push(other);
              }
            }
          }
          const scCount = scShifts.length;
          const hasSC = scCount > 0;

          // ── Determine cell content, class, and action state ──
          let cgState = "";
          if (isAssigned && hasSC && hasPC) {
            td.textContent = "SC/PC";
            td.classList.add("cg-cell-scpc");
            td.title = `Shift conflict (${scCount} overlap${scCount > 1 ? "s" : ""}) + blackout`;
            cgState = "scpc";
          } else if (isAssigned && hasSC) {
            td.textContent = "SC";
            td.classList.add("cg-cell-sc");
            td.title = `Shift conflict — ${scCount} overlapping assignment${scCount > 1 ? "s" : ""}`;
            cgState = "sc";
          } else if (isAssigned && hasPC) {
            td.textContent = "X/PC";
            td.classList.add("cg-cell-xpc");
            td.title = "Assigned during blackout";
            cgState = "xpc";
          } else if (isAssigned) {
            td.textContent = "X";
            td.classList.add("cg-cell-assigned");
          } else if (hasPC && showPC) {
            td.textContent = "PC";
            td.classList.add("cg-cell-pc");
            td.title = "Blackout — volunteer unavailable";
          }

          if (cgState) {
            td.dataset.cgState = cgState;
            td.dataset.volId = String(vol.id);
            td.dataset.volName = `${vol.firstName} ${vol.lastName}`;
            td.dataset.shiftId = String(sh.shift_id);
            td.dataset.shiftLabel = sh.shift_label;
            td.dataset.dayId = String(sh.day_id);
            td.dataset.dayLabel = sh.day_label || group.label || "";
            td.dataset.startMins = String(sh.start_mins);
            td.dataset.endMins = String(sh.end_mins);
            if (scShifts.length) {
              td.dataset.scShifts = JSON.stringify(
                scShifts.map((s) => ({ id: s.shift_id, label: s.shift_label })),
              );
            }
          }

          tr.appendChild(td);
          bodyColIdx++;
        }
        isFirstDayBody = false;
        bodyDayIdx++;
      }

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);

    wrapper.innerHTML = "";
    wrapper.appendChild(table);

    // ── Column hover highlight ──
    /** @type {number|null} Currently highlighted column index. */
    let activeCol = null;

    /**
     * Toggle the highlight class on every cell in a column.
     *
     * @param {number} col   - Column index to target.
     * @param {boolean} on   - True to add, false to remove.
     * @returns {void}
     */
    function highlightCol(col, on) {
      const cells = table.querySelectorAll(`[data-col="${col}"]`);
      for (const c of cells) {
        c.classList.toggle("cg-col-highlight", on);
      }
    }

    table.addEventListener("mouseover", (e) => {
      const cell = e.target.closest("[data-col]");
      if (!cell) return;
      const col = Number(cell.dataset.col);
      if (col === activeCol) return;
      if (activeCol !== null) highlightCol(activeCol, false);
      activeCol = col;
      highlightCol(col, true);
    });

    table.addEventListener("mouseleave", () => {
      if (activeCol !== null) highlightCol(activeCol, false);
      activeCol = null;
    });

    // ── Name search filter ──
    const searchEl = table.querySelector(".cg-search");
    if (searchEl) {
      searchEl.addEventListener("input", () => {
        const q = searchEl.value.trim().toLowerCase();
        const rows = tbody.querySelectorAll("tr");
        for (const row of rows) {
          const name = row.querySelector(".cg-name");
          if (!name) continue;
          const match = !q || name.textContent.toLowerCase().includes(q);
          row.classList.toggle("d-none", !match);
        }
      });
    }

    // ── Context menu trigger ──
    table.addEventListener("contextmenu", (e) => {
      const cell = e.target.closest("td[data-cg-state]");
      if (!cell) return;
      e.preventDefault();
      showCtxMenu(e.clientX, e.clientY, cell);
    });
  }
});
