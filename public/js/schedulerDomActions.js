/**
 * @file schedulerDomActions.js
 * @description Volunteer pool rendering, schedule grid building, and
 * filter logic for the drag-and-drop scheduler page.
 *
 * Listens for:
 *  - 'scheduler:dayChange' (from schedulerDomEvents) → loads and renders grid
 *  - 'filter:select'       (from schedulerDomEvents) → filters pool pills
 *
 * Depends on:
 *  - schedulerDraggable.js  (makeDroppable, onDrop, onReturnToPool,
 *                            initPoolPills, setVolunteers)
 *  - schedulerTimeUtils.js  (parseTimeToMinutes, formatMinutesToTime,
 *                            getDayBounds, timeToRow, shiftCrewSize)
 */

import {
  makeDroppable,
  onDrop,
  onReturnToPool,
  initPoolPills,
  setVolunteers,
} from "./schedulerDraggable.js";

import {
  recordAssign,
  recordUnassign,
  setCurrentDay,
  clearHistory,
  initHistoryButtons,
  silentlyPlacePill,
} from "./schedulerHistory.js";

import {
  trackAssign,
  trackUnassign,
  clearAll as clearConflicts,
  assignmentCount,
  getConflicts,
} from "./schedulerConflicts.js";

import { initContextMenu } from "./schedulerContextMenu.js";

import {
  parseTimeToMinutes,
  formatMinutesToTime,
  getDayBounds,
  timeToRow,
  shiftCrewSize,
} from "./schedulerTimeUtils.js";

// ─────────────────────────────────────────────
//  Module state
// ─────────────────────────────────────────────

/**
 * Volunteer roster cached after the initial API fetch.
 * Used by filter logic and passed to the drag guard via setVolunteers().
 * @type {Array<object>}
 */
let _volunteers = [];

/** @type {Record<string, number>} */
const ROLE_LEVEL = {
  NON_REGISTERED: 0,
  REGISTERED: 1,
  KEYMAN: 2,
  OVERSEER: 3,
  ASSISTANT_ADMIN: 4,
  ADMIN: 5,
};

/**
 * Short display labels for each crew key, used on volunteer pool pill badges.
 * @type {Record<string, string>}
 */
const CREW_ABBREV = {
  lots_and_garages: "L&G",
  signs: "SGN",
  security: "SEC",
  dropoff_pickup: "D/P",
  mobile_support: "MS",
  desk: "Desk",
};

/**
 * Department column metadata — set each time a day grid is built.
 * Mutated in-place when columns are reordered or visibility changes.
 * @type {Array<{deptKey:string, deptData:object, subCols:(string|null)[], startCol:number, endCol:number}>}
 */
let _deptMeta = [];

/** Dept keys currently hidden from the grid. @type {Set<string>} */
let _hiddenDepts = new Set();

/** The live calendar grid element. @type {HTMLElement|null} */
let _gridEl = null;

/** Whether the current day has any meeting shifts. @type {boolean} */
let _hasMeetings = false;

/** Whether the meeting column is currently hidden by the user. @type {boolean} */
let _meetingHidden = false;

/** Convention day currently shown — kept in sync for loadDayAssignments. @type {number|null} */
let _currentDayId = null;

/** Short labels for the dept visibility toggle buttons. @type {Record<string,string>} */
const DEPT_ABBREV = {
  lots_and_garages: "L&G",
  signs: "Signs",
  security: "Security",
  dropoff_pickup: "D/P",
  mobile_support: "MS",
  desk: "Desk",
};

// ─────────────────────────────────────────────
//  Attendance state + badge helpers (module-level)
// ─────────────────────────────────────────────

/**
 * Attended volunteer+shift pairs for the currently loaded day.
 * Keys are "volunteerId:shiftId" strings.
 * @type {Set<string>}
 */
let _attendanceSet = new Set();

/**
 * Find or create the `.pill-badge-row` container inside a pill.
 * Module-level so both conflict and check-in badge helpers can use it.
 *
 * @param {HTMLElement} pill
 * @returns {HTMLElement}
 */
function _getBadgeRow(pill) {
  let row = pill.querySelector(".pill-badge-row");
  if (!row) {
    row = document.createElement("div");
    row.classList.add("pill-badge-row");
    pill.appendChild(row);
  }
  return row;
}

/**
 * Apply a green check-in badge to a DZ pill.
 * No-op if the badge is already present.
 *
 * @param {HTMLElement} pill
 * @returns {void}
 */
function _applyCheckinBadge(pill) {
  const row = _getBadgeRow(pill);
  if (row.querySelector(".pill-checkin-badge")) return;
  const badge = document.createElement("span");
  badge.classList.add("pill-checkin-badge");
  badge.innerHTML = '<i class="fa-solid fa-check"></i>';
  badge.title = "Checked in";
  row.appendChild(badge);
}

/**
 * Remove a check-in badge from a pill if present.
 *
 * @param {HTMLElement} pill
 * @returns {void}
 */
function _removeCheckinBadge(pill) {
  pill.querySelector(".pill-checkin-badge")?.remove();
}

/**
 * Fetch current attendance for the loaded day and update check-in badges
 * on all DZ pills. Returns the full API response so the caller can read
 * `conventionDate` for smart polling decisions.
 *
 * @returns {Promise<{success:boolean, attendance:Array, conventionDate:string|null}|null>}
 */
export async function refreshAttendanceBadges() {
  if (!_currentDayId) return null;
  try {
    const res = await fetch(`/api/scheduler/attendance/${_currentDayId}`);
    const data = await res.json();
    if (!data.success) return data;

    _attendanceSet = new Set(
      (data.attendance || []).map((a) => `${a.volunteer_id}:${a.shift_id}`),
    );

    const pills = document.querySelectorAll(
      ".scheduler-calendar .scheduler-dropzone .name-pill",
    );
    for (const pill of pills) {
      const volId = pill.dataset.id;
      const shiftId = pill.closest(".sched-shift-block")?.dataset.shiftId;
      if (!volId || !shiftId) continue;
      if (_attendanceSet.has(`${volId}:${shiftId}`)) {
        _applyCheckinBadge(pill);
      } else {
        _removeCheckinBadge(pill);
      }
    }

    return data;
  } catch (err) {
    console.error("[scheduler] refreshAttendanceBadges error:", err);
    return null;
  }
}

// ─────────────────────────────────────────────
//  Public entry point
// ─────────────────────────────────────────────

/**
 * Initialise the scheduler's data layer and DOM event listeners.
 * Call once after DOMContentLoaded.
 *
 * Kicks off the volunteer pool fetch immediately so pills are ready
 * before the user selects a day.
 *
 * @returns {Promise<void>}
 */
export async function initDomActions() {
  document.addEventListener("scheduler:dayChange", (e) =>
    _onDayChange(e.detail),
  );
  document.addEventListener("filter:select", (e) => _onFilterSelect(e.detail));

  // Horizontal-scroll listener — toggle right time mirror column
  const _mainEl = document.querySelector(".scheduler-main");
  if (_mainEl) {
    _mainEl.addEventListener("scroll", () => {
      const outer = _mainEl.querySelector(".scheduler-calendar-outer");
      if (!outer || !_gridEl) return;
      const wasScrolled = outer.classList.contains("is-scrolled");
      const isScrolled = _mainEl.scrollLeft > 0;
      if (isScrolled !== wasScrolled) {
        outer.classList.toggle("is-scrolled", isScrolled);
        const cols = _gridEl.style.gridTemplateColumns.split(" ");
        cols[cols.length - 1] = isScrolled ? "60px" : "0px";
        _gridEl.style.gridTemplateColumns = cols.join(" ");
      }
      _updateScrollPeeks();
    });
  }

  // Persist + track assignment on drop.
  // Conflict logic:
  //   - Non-security shift conflicts: blocked in canDrop (shouldn't reach here)
  //   - Security dept + shift conflicts: modal with Place Anyway
  //   - Any dept + blackout conflicts: modal with Place Anyway
  //   - Place Anyway: auto-note saved to DB, badge applied to pill
  //   - Silent load (record=false): apply saved note badge if present
  document.addEventListener("scheduler:slotAssigned", async (e) => {
    const {
      pill,
      dz,
      record,
      note: loadedNote,
      fromDz: priorDz = null,
    } = e.detail;
    const volId = Number(pill.dataset.id);
    const shiftStart = Number(dz.dataset.shiftStartMins);
    const shiftEnd = Number(dz.dataset.shiftEndMins);
    const dept = dz.closest("[data-department]")?.dataset.department;
    const isSecurity = dept === "security";

    // Track assignment
    if (shiftStart > 0 && shiftEnd > 0) {
      trackAssign(volId, shiftStart, shiftEnd, dz);
      _updatePillBadge(volId);
    }

    // Silent load — just track the assignment. All badge application is
    // deferred to _recheckConflictBadges which runs after every pill is
    // placed, guaranteeing both sides of any conflict are tracked first.
    if (!record) {
      _updatePoolCount();
      _applyVolunteerFilters();
      return;
    }
    // Clear any stale conflict badge from a previous slot on this clone
    // Clear any stale badges from a previous slot on this clone
    pill.querySelector(".pill-badge-row")?.remove();
    delete pill.dataset.conflictCount;
    delete pill.dataset.conflictNote;
    delete pill.dataset.blackoutNote;

    // Live drop — check conflicts (exclude the slot just filled)
    const conflicts =
      shiftStart > 0 && shiftEnd > 0
        ? getConflicts(volId, shiftStart, shiftEnd, dz)
        : [];

    const blackoutConflicts = conflicts.filter((c) => c.dzEl === null);
    const shiftConflicts = conflicts.filter((c) => c.dzEl !== null);

    let noteToSave = null;

    const needsModal =
      blackoutConflicts.length > 0 || (isSecurity && shiftConflicts.length > 0);

    if (needsModal) {
      const conflictsForModal = [
        ...blackoutConflicts,
        ...(isSecurity ? shiftConflicts : []),
      ];
      const volName =
        pill.querySelector(".pill-name")?.textContent?.trim() ||
        "This volunteer";
      const shiftLabel =
        dz
          .closest(".sched-shift-block")
          ?.querySelector(".sched-shift-header")
          ?.textContent?.trim() || "this shift";

      const placeAnyway = await _showConflictModal(
        conflictsForModal,
        volName,
        shiftLabel,
      );

      if (!placeAnyway) {
        trackUnassign(dz);
        if (priorDz) {
          // DZ→DZ move cancelled — restore pill to original slot, no DB changes
          priorDz.appendChild(pill);
          trackAssign(
            volId,
            Number(priorDz.dataset.shiftStartMins),
            Number(priorDz.dataset.shiftEndMins),
            priorDz,
          );
        } else {
          if (!pill.classList.contains("in-pool")) pill.remove();
        }
        _updatePillBadge(volId);
        _updatePoolCount();
        _applyVolunteerFilters();
        return;
      }

      noteToSave = _generateConflictNote(conflictsForModal);
      pill.dataset.conflictNote = noteToSave;
      // Badges for all affected pills handled by _recheckConflictBadges below —
      // this ensures the FIRST pill (already placed) also gets its badge updated.
    } else if (!isSecurity && shiftConflicts.length > 0) {
      // Shift conflict slipped through canDrop — remove as bug guard
      trackUnassign(dz);
      _updatePillBadge(volId);
      if (!pill.classList.contains("in-pool")) pill.remove();
      _updatePoolCount();
      _applyVolunteerFilters();
      return;
    }

    _updatePoolCount();
    _applyVolunteerFilters();
    // Recheck ALL DZ pills for this volunteer — updates both the newly dropped
    // pill AND any existing pills now in conflict with it
    _recheckConflictBadges(volId);
    if (record) {
      // For DZ→DZ moves: delete the old slot first, then insert the new one
      if (priorDz) await recordUnassign(pill, priorDz);
      recordAssign(pill, dz, noteToSave);
    }
  });

  // Remove + untrack on return to pool
  document.addEventListener("scheduler:slotUnassigned", (e) => {
    const { pill, fromDz, record } = e.detail;
    const volId = Number(pill.dataset.id);
    if (fromDz) {
      trackUnassign(fromDz);
      _updatePillBadge(volId);
      // Recheck remaining DZ pills — a removal may resolve or create conflicts
      _recheckConflictBadges(volId);
    }
    _applyVolunteerFilters();
    if (record && fromDz) recordUnassign(pill, fromDz);
  });

  // Keyboard shortcuts: Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;
    if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      document.getElementById("schedUndoBtn")?.click();
    }
    if (
      (e.key === "y" && (e.ctrlKey || e.metaKey)) ||
      (e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey)
    ) {
      e.preventDefault();
      document.getElementById("schedRedoBtn")?.click();
    }
  });

  // ─────────────────────────────────────────────
  //  Conflict modal
  // ─────────────────────────────────────────────

  /**
   * Format minutes-from-midnight as "h:MM AM/PM".
   * @param {number} mins
   * @returns {string}
   */
  function _fmtConflictTime(mins) {
    const h = Math.floor(mins / 60),
      m = mins % 60,
      ap = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ap}`;
  }

  /**
   * Generate a human-readable note string from a list of conflict entries.
   * Blackout entries (dzEl === null) describe unavailable windows;
   * shift entries describe overlapping assignments.
   *
   * @param {Array<{ dzEl: HTMLElement|null, shiftStart: number, shiftEnd: number }>} conflicts
   * @returns {string}
   */
  function _generateConflictNote(conflicts) {
    return conflicts
      .map((c) => {
        const t = `${_fmtConflictTime(c.shiftStart)}–${_fmtConflictTime(c.shiftEnd)}`;
        if (c.dzEl === null) return `Unavailable from ${t}`;
        const name =
          c.dzEl
            .closest(".sched-shift-block")
            ?.querySelector(".sched-shift-header")
            ?.textContent?.trim() || "another shift";
        return `Overlap: ${name} (${t})`;
      })
      .join("; ");
  }

  /**
   * Find or create the `.pill-badge-row` container inside a pill.
   * Delegates to the module-level helper.
   *
   * @param {HTMLElement} pill
   * @returns {HTMLElement}
   */
  // Note: _getBadgeRow is defined at module level above initDomActions.

  function _applyConflictBadge(pill, title) {
    const row = _getBadgeRow(pill);
    let badge = row.querySelector(".pill-conflict-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.classList.add("pill-conflict-badge");
      badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
      row.appendChild(badge);
    }
    badge.title = title;
  }

  function _applyNoteBadge(pill, note) {
    pill.dataset.blackoutNote = note;
    const row = _getBadgeRow(pill);
    let badge = row.querySelector(".pill-note-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.classList.add("pill-note-badge");
      badge.innerHTML = '<i class="fa-solid fa-circle-info"></i>';
      row.appendChild(badge);
    }
    badge.title = note;
  }

  /**
   * Show a Bootstrap modal describing a scheduling conflict and return a
   * Promise that resolves to true (place anyway) or false (return to pool).
   *
   * @param {Array<{ dzEl: HTMLElement|null, shiftStart: number, shiftEnd: number }>} conflicts
   * @param {string} volName
   * @param {string} shiftLabel
   * @returns {Promise<boolean>}
   */
  function _showConflictModal(conflicts, volName, shiftLabel) {
    return new Promise((resolve) => {
      let resolved = false;

      /**
       * @param {boolean} val
       * @returns {void}
       */
      function resolveOnce(val) {
        if (resolved) return;
        resolved = true;
        resolve(val);
      }

      const items = conflicts
        .map((c) => {
          const timeRange = `${_fmtConflictTime(c.shiftStart)} – ${_fmtConflictTime(c.shiftEnd)}`;
          if (c.dzEl === null) {
            const reasonSuffix = c.reason ? ` — ${c.reason}` : "";
            return `Marked unavailable from ${timeRange}${reasonSuffix}`;
          }
          const name =
            c.dzEl
              .closest(".sched-shift-block")
              ?.querySelector(".sched-shift-header")
              ?.textContent?.trim() || "another shift";
          return `Already assigned to <strong>${name}</strong> (${timeRange})`;
        })
        .map((txt) => `<li>${txt}</li>`)
        .join("");

      const modalEl = document.createElement("div");
      modalEl.className = "modal fade";
      modalEl.setAttribute("tabindex", "-1");
      modalEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="fa-solid fa-triangle-exclamation text-warning me-2"></i>Scheduling Conflict
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <p class="mb-2">
              <strong>${volName}</strong> has a conflict with
              <strong>${shiftLabel}</strong>:
            </p>
            <ul class="mb-0 small">${items}</ul>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="sched-conflict-cancel">
              Return to Pool
            </button>
            <button type="button" class="btn btn-warning" id="sched-conflict-place">
              Place Anyway
            </button>
          </div>
        </div>
      </div>`;

      document.body.appendChild(modalEl);
      const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);

      modalEl
        .querySelector("#sched-conflict-cancel")
        ?.addEventListener("click", () => {
          bsModal.hide();
          resolveOnce(false);
        });

      modalEl
        .querySelector("#sched-conflict-place")
        ?.addEventListener("click", () => {
          bsModal.hide();
          resolveOnce(true);
        });

      modalEl.addEventListener("hidden.bs.modal", () => {
        modalEl.remove();
        resolveOnce(false); // dismiss = cancel
      });

      bsModal.show();
    });
  }

  // ─────────────────────────────────────────────
  //  State machine
  // ─────────────────────────────────────────────

  /**
   * IDs of the four mutually exclusive display panels in the main area.
   * Exactly one is visible at a time.
   * @type {Record<string, string>}
   */
  const PANELS = {
    empty: "schedulerEmpty",
    loading: "schedulerLoading",
    nodata: "schedulerNoData",
    grid: "daySchedule",
  };

  /**
   * Show one display panel and hide the other three.
   *
   * @param {'empty'|'loading'|'nodata'|'grid'} state
   * @returns {void}
   */
  function _setState(state) {
    for (const [key, id] of Object.entries(PANELS)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.classList.toggle("d-none", key !== state);
    }
  }

  // ─────────────────────────────────────────────
  //  Volunteer pool
  // ─────────────────────────────────────────────

  /**
   * Fetch the volunteer roster from the API, render pills into #name-pool,
   * and initialise drag behaviour.
   *
   * @returns {Promise<void>}
   */
  async function _loadVolunteers() {
    try {
      const res = await fetch("/api/scheduler/volunteers");
      const data = await res.json();

      if (!data.success) {
        console.error("[scheduler] volunteers API error:", data.error);
        _setPoolMessage("Failed to load volunteers.");
        return;
      }

      _volunteers = data.volunteers || [];
      setVolunteers(_volunteers);
      _renderVolunteerPool(_volunteers);
      initPoolPills();
    } catch (err) {
      console.error("[scheduler] volunteers fetch error:", err);
      _setPoolMessage("Failed to load volunteers.");
    }
  }

  /**
   * Replace the loading message in #name-pool with name pill elements.
   *
   * @param {Array<object>} volunteers
   * @returns {void}
   */
  function _renderVolunteerPool(volunteers) {
    const pool = document.getElementById("name-pool");
    if (!pool) return;

    document.getElementById("poolLoadingMsg")?.remove();

    if (volunteers.length === 0) {
      _setPoolMessage("No active registered volunteers found.");
      return;
    }

    for (const v of volunteers) {
      const pill = document.createElement("div");
      pill.classList.add("name-pill", "in-pool");
      pill.dataset.id = String(v.id);
      pill.dataset.role = v.role || "REGISTERED";
      pill.dataset.phone = v.phone || "";
      pill.dataset.email = v.email || "";
      pill.dataset.suffix = v.suffix || "";
      pill.dataset.gender = v.gender || "";

      // Name row
      const nameSpan = document.createElement("span");
      nameSpan.classList.add("pill-name");
      nameSpan.textContent = `${v.firstName} ${v.lastName}`;
      pill.appendChild(nameSpan);

      // Crew badge row — one badge per assigned crew
      const crewsDiv = document.createElement("div");
      crewsDiv.classList.add("pill-crews");

      for (const [key, assigned] of Object.entries(v.crews || {})) {
        if (!assigned) continue;
        const badge = document.createElement("span");
        badge.classList.add("crew-badge", `crew-${key.replace(/_/g, "-")}`);
        badge.textContent = CREW_ABBREV[key] || key;
        crewsDiv.appendChild(badge);
      }

      pill.appendChild(crewsDiv);
      pool.appendChild(pill);
    }

    _updatePoolCount();
  }

  /**
   * Insert a plain text message into #name-pool (replaces loading spinner).
   *
   * @param {string} msg
   * @returns {void}
   */
  function _setPoolMessage(msg) {
    const pool = document.getElementById("name-pool");
    if (!pool) return;
    document.getElementById("poolLoadingMsg")?.remove();
    const p = document.createElement("p");
    p.classList.add(
      "text-muted",
      "small",
      "text-center",
      "px-2",
      "py-3",
      "mb-0",
    );
    p.textContent = msg;
    pool.appendChild(p);
  }

  /**
   * Refresh the pool count badge to reflect currently visible in-pool pills.
   *
   * @returns {void}
   */
  function _updatePoolCount() {
    const pills = document.querySelectorAll("#name-pool .name-pill.in-pool");
    let count = 0;
    for (const pill of pills) {
      if (pill.style.display !== "none") count++;
    }
    const badge = document.getElementById("poolCount");
    if (badge) badge.textContent = String(count);
  }

  // ─────────────────────────────────────────────
  //  Volunteer filter logic
  // ─────────────────────────────────────────────

  /**
   * Handle a filter:select event from the pool filter dropdowns.
   *
   * @param {{ id: string, value: string }} detail
   * @returns {void}
   */
  function _onFilterSelect({ id, value }) {
    if (
      id === "vol-rank-filter" ||
      id === "vol-department-filter" ||
      id === "vol-usage-filter" ||
      id === "vol-gender-filter" ||
      id === "vol-sort-order" ||
      id === "vol-search"
    ) {
      _applyVolunteerFilters();
    }
  }

  /**
   * Department key order used when sorting by crew assignment.
   * @type {string[]}
   */
  const DEPT_SORT_ORDER = [
    "lots_and_garages",
    "signs",
    "security",
    "dropoff_pickup",
    "mobile_support",
    "desk",
  ];

  /**
   * Read all filter/search/sort controls, show/hide in-pool pills, then
   * reorder them in the DOM to match the selected sort criterion.
   *
   * @returns {void}
   */
  function _applyVolunteerFilters() {
    const rankValue   = document.getElementById("vol-rank-filter")?.value   ?? "";
    const deptValue   = document.getElementById("vol-department-filter")?.value ?? "";
    const usageValue  = document.getElementById("vol-usage-filter")?.value  ?? "";
    const genderValue = document.getElementById("vol-gender-filter")?.value ?? "";
    const searchTerm  = (document.getElementById("vol-search")?.value ?? "")
      .trim()
      .toLowerCase();
    const sortOrder =
      document.getElementById("vol-sort-order")?.value ?? "lastName";

    const pool = document.getElementById("name-pool");
    const pills = Array.from(
      document.querySelectorAll("#name-pool .name-pill.in-pool"),
    );

    // ── Pass 1: mark each pill visible or hidden ───────────────────────
    for (const pill of pills) {
      const id = Number(pill.dataset.id);
      const v = _volunteers.find((x) => x.id === id);
      if (!v) {
        pill.style.display = "none";
        continue;
      }

      const show =
        _matchesRank(v, rankValue) &&
        _matchesDept(v, deptValue) &&
        _matchesUsage(v, usageValue) &&
        _matchesGender(v, genderValue) &&
        _matchesSearch(v, searchTerm);

      pill.style.display = show ? "" : "none";
    }

    // ── Pass 2: sort and reorder in DOM ────────────────────────────────
    const sorted = [...pills].sort((a, b) => {
      const aHidden = a.style.display === "none";
      const bHidden = b.style.display === "none";

      // Hidden pills always go to the end
      if (aHidden && !bHidden) return 1;
      if (!aHidden && bHidden) return -1;

      const va = _volunteers.find((v) => v.id === Number(a.dataset.id));
      const vb = _volunteers.find((v) => v.id === Number(b.dataset.id));
      if (!va || !vb) return 0;

      if (sortOrder === "rank") {
        const diff = (ROLE_LEVEL[vb.role] ?? 0) - (ROLE_LEVEL[va.role] ?? 0);
        if (diff !== 0) return diff;
      }

      if (sortOrder === "department") {
        const idxA = DEPT_SORT_ORDER.findIndex((k) => va.crews?.[k]);
        const idxB = DEPT_SORT_ORDER.findIndex((k) => vb.crews?.[k]);
        const orderA = idxA === -1 ? 99 : idxA;
        const orderB = idxB === -1 ? 99 : idxB;
        if (orderA !== orderB) return orderA - orderB;
      }

      if (sortOrder === "usage") {
        const diff = assignmentCount(va.id) - assignmentCount(vb.id);
        if (diff !== 0) return diff;
      }

      // Default / tiebreaker: lastName then firstName
      return (
        va.lastName.localeCompare(vb.lastName) ||
        va.firstName.localeCompare(vb.firstName)
      );
    });

    if (pool) {
      for (const pill of sorted) {
        pool.appendChild(pill);
      }
    }

    _updatePoolCount();
  }

  /**
   * @param {object} v         - Volunteer row.
   * @param {string} rankValue - Filter select value ('', '1', '2', '3').
   * @returns {boolean}
   */
  function _matchesRank(v, rankValue) {
    if (!rankValue) return true;
    const level =
      ROLE_LEVEL[
        String(v.role || "")
          .trim()
          .toUpperCase()
      ] ?? -1;
    if (rankValue === "1") return level === ROLE_LEVEL.REGISTERED;
    if (rankValue === "2") return level === ROLE_LEVEL.KEYMAN;
    if (rankValue === "3") return level >= ROLE_LEVEL.OVERSEER;
    return true;
  }

  /**
   * @param {object} v          - Volunteer row.
   * @param {string} deptValue  - Department key or '' for any.
   * @returns {boolean}
   */
  function _matchesDept(v, deptValue) {
    if (!deptValue) return true;
    return Boolean(v.crews?.[deptValue]);
  }

  /**
   * @param {object} v          - Volunteer row.
   * @param {string} usageValue - '' | '0' | '1' | '2' | '3'.
   * @returns {boolean}
   */
  function _matchesUsage(v, usageValue) {
    if (!usageValue) return true;
    const count = assignmentCount(v.id);
    if (usageValue === "0") return count === 0;
    if (usageValue === "1") return count === 1;
    if (usageValue === "2") return count === 2;
    if (usageValue === "3") return count >= 3;
    return true;
  }

  /**
   * @param {object} v          - Volunteer row.
   * @param {string} searchTerm - Lowercase trimmed search string.
   * @returns {boolean}
   */
  function _matchesSearch(v, searchTerm) {
    if (!searchTerm) return true;
    const full = `${v.firstName} ${v.lastName}`.toLowerCase();
    const reverse = `${v.lastName} ${v.firstName}`.toLowerCase();
    return full.includes(searchTerm) || reverse.includes(searchTerm);
  }

  /**
   * @param {object} v           - Volunteer row.
   * @param {string} genderValue - '' for any, 'male' or 'female' to restrict.
   * @returns {boolean}
   */
  function _matchesGender(v, genderValue) {
    if (!genderValue) return true;
    return (v.gender || "") === genderValue;
  }

  // ─────────────────────────────────────────────
  //  Schedule loading
  // ─────────────────────────────────────────────

  /**
   * Handle a scheduler:dayChange event from the day picker.
   *
   * @param {{ dayId: number|null }} detail
   * @returns {Promise<void>}
   */
  async function _onDayChange({ dayId }) {
    if (!dayId) {
      _setState("empty");
      setCurrentDay(null);
      return;
    }

    _currentDayId = Number(dayId);
    setCurrentDay(_currentDayId);
    clearConflicts();
    _setState("loading");

    try {
      const res = await fetch(`/api/scheduler/${dayId}`);
      const data = await res.json();

      if (!data.success) {
        console.error("[scheduler] schedule API error:", data.error);
        _setState("nodata");
        return;
      }

      const schedule = data.schedule || {};
      const dayLabels = Object.keys(schedule.day || {});

      if (dayLabels.length === 0) {
        _setState("nodata");
        return;
      }

      const dayLabel = dayLabels[0];
      const dayData = schedule.day[dayLabel];

      const _hasDeptShifts = Object.keys(dayData.department || {}).length > 0;
      const _hasMeetingShifts = (dayData.meetings?.length || 0) > 0;
      if (!dayData || (!_hasDeptShifts && !_hasMeetingShifts)) {
        _setState("nodata");
        return;
      }

      _buildCalendarGrid(dayData, dayLabel);
      _initShiftExpand();
      _setState("grid");

      // Load blackouts FIRST so conflict checks during assignment load are accurate
      await _loadDayBlackouts(_currentDayId);
      // Then load saved slot assignments — badges are applied using live conflict state
      await _loadDayAssignments(_currentDayId);
    } catch (err) {
      console.error("[scheduler] schedule fetch error:", err);
      _setState("nodata");
    }
  }

  /**
   * Update scroll peek indicators showing the next off-screen dept.
   *
   * @returns {void}
   */
  function _updateScrollPeeks() {
    const mainEl = document.getElementById("schedulerMain");
    const peekL = document.getElementById("schedPeekLeft");
    const peekR = document.getElementById("schedPeekRight");
    if (!mainEl || !peekL || !peekR || !_gridEl) return;

    const headers = [
      ..._gridEl.querySelectorAll(
        ".sched-dept-header:not([style*='display: none'])",
      ),
    ];
    if (!headers.length) {
      peekL.classList.add("d-none");
      peekR.classList.add("d-none");
      return;
    }

    const viewLeft = mainEl.scrollLeft;
    const viewRight = viewLeft + mainEl.clientWidth;

    let leftDept = null;
    let rightDept = null;

    for (const h of headers) {
      const rect = h.getBoundingClientRect();
      const mainRect = mainEl.getBoundingClientRect();
      const elLeft = rect.left - mainRect.left + viewLeft;
      const elRight = elLeft + rect.width;

      if (elRight < viewLeft + 60) {
        leftDept = h.textContent.trim();
      }
      if (elLeft > viewRight - 60 && !rightDept) {
        rightDept = h.textContent.trim();
      }
    }

    if (leftDept) {
      peekL.querySelector(".sched-peek-label").textContent = leftDept;
      peekL.classList.remove("d-none");
    } else {
      peekL.classList.add("d-none");
    }

    if (rightDept) {
      peekR.querySelector(".sched-peek-label").textContent = rightDept;
      peekR.classList.remove("d-none");
    } else {
      peekR.classList.add("d-none");
    }
  }
  // ─────────────────────────────────────────────
  //  Calendar grid builder
  // ─────────────────────────────────────────────

  /**
   * Build the full calendar grid for one convention day and inject it into
   * #daySchedule, replacing any previously rendered grid.
   *
   * Layout: CSS grid with a time-label column, then one sub-column per unique
   * location per department. Departments with multiple locations (e.g. Security
   * at MVP + OGS) get a spanning dept-name header above individual location
   * sub-headers. Two header rows (30px dept + 20px location) sit above the
   * 22px 15-minute-resolution slot rows.
   *
   * Also resets _deptMeta, _hiddenDepts, and _gridEl so that the toggle
   * and reorder handlers always reflect the current day's layout.
   *
   * @param {object} dayData  - The day object from the scheduler API payload.
   * @param {string} dayLabel - Display label for the day (e.g. "Friday").
   * @returns {void}
   */
  function _buildCalendarGrid(dayData, dayLabel) {
    const container = document.getElementById("daySchedule");
    if (!container) return;
    container.replaceChildren();

    const { earliest, latest: shiftLatest } = getDayBounds(dayData);
    // Ensure the grid extends at least 3 hours past the last session
    const sessionLatest = (dayData.sessions || []).reduce((max, s) => {
      const end = parseTimeToMinutes(s.end_time);
      return end !== null && end > max ? end : max;
    }, -Infinity);
    const latest = Math.max(shiftLatest, sessionLatest + 90);
    const totalRows = Math.round((latest - earliest) / 15);

    // ── Step 1: sub-column structure per department ────────────────────────
    const deptMeta = Object.entries(dayData.department).map(
      ([deptKey, deptData]) => {
        const seen = [];
        for (const shift of Object.values(deptData.shift)) {
          for (const loc of Object.values(shift.location)) {
            if (loc.name && !seen.includes(loc.name)) seen.push(loc.name);
          }
        }
        const subCols = seen.length > 0 ? seen : [null];
        return { deptKey, deptData, subCols, startCol: 2, endCol: 2 };
      },
    );

    // ── Step 1.5: meeting column ───────────────────────────────────────
    // When meetings exist, col 2 is reserved for them.
    // Crew dept columns start at col 2 (no meetings) or col 3 (with meetings).
    const hasMeetings = (dayData.meetings?.length || 0) > 0;
    const crewColOffset = hasMeetings ? 3 : 2;
    _hasMeetings = hasMeetings;
    _meetingHidden = false;

    // ── Step 2: compute column indices ──────────────────────────────────
    let cursor = crewColOffset;
    for (const meta of deptMeta) {
      meta.startCol = cursor;
      meta.endCol = cursor + meta.subCols.length;
      cursor = meta.endCol;
    }

    // ── Step 3: store module-level state ──────────────────────────────
    _deptMeta = deptMeta;
    _hiddenDepts = new Set();

    // ── Step 4: build DOM ───────────────────────────────────────────────
    const subColCount = deptMeta.reduce((s, d) => s + d.subCols.length, 0);
    const rightTimeCol = subColCount + crewColOffset;
    const colMin =
      getComputedStyle(container).getPropertyValue("--sched-col-min").trim() ||
      "120px";
    const crewCols = Array(subColCount).fill(`minmax(${colMin}, 1fr)`).join(" ");
    const colTemplate = hasMeetings
      ? `60px 140px ${crewCols} 0px`
      : `60px ${crewCols} 0px`;
    const rowTemplate = `30px 20px repeat(${totalRows}, 22px)`;

    const wrap = document.createElement("div");
    wrap.classList.add("scheduler-calendar-outer");
    wrap.appendChild(_buildDayBanner(dayLabel));

    const grid = document.createElement("div");
    grid.classList.add("scheduler-calendar");
    grid.style.gridTemplateRows = rowTemplate;
    grid.style.gridTemplateColumns = colTemplate;
    _gridEl = grid;

    _buildTimeBands(dayData.sessions || [], earliest, latest, grid);

    // Time labels (col 1, rows 3+)
    for (let mins = earliest; mins < latest; mins += 60) {
      const label = document.createElement("div");
      label.classList.add("sched-time-label");
      label.textContent = formatMinutesToTime(mins);
      label.style.gridRow = `${timeToRow(mins, earliest) + 3} / span 4`;
      label.style.gridColumn = "1";
      grid.appendChild(label);
    }

    // Sticky corner cells (rows 1–2, col 1 — left)
    const cornerDept = document.createElement("div");
    cornerDept.classList.add("sched-time-corner");
    cornerDept.style.gridRow = "1";
    cornerDept.style.gridColumn = "1";
    grid.appendChild(cornerDept);

    const cornerLoc = document.createElement("div");
    cornerLoc.classList.add("sched-time-corner", "sched-time-corner--loc");
    cornerLoc.style.gridRow = "2";
    cornerLoc.style.gridColumn = "1";
    grid.appendChild(cornerLoc);

    // Right time mirror column (last col)
    const cornerDeptR = document.createElement("div");
    cornerDeptR.classList.add("sched-time-corner-right");
    cornerDeptR.style.gridRow = "1";
    cornerDeptR.style.gridColumn = String(rightTimeCol);
    grid.appendChild(cornerDeptR);

    const cornerLocR = document.createElement("div");
    cornerLocR.classList.add(
      "sched-time-corner-right",
      "sched-time-corner-right--loc",
    );
    cornerLocR.style.gridRow = "2";
    cornerLocR.style.gridColumn = String(rightTimeCol);
    grid.appendChild(cornerLocR);

    for (let mins = earliest; mins < latest; mins += 60) {
      const rLabel = document.createElement("div");
      rLabel.classList.add("sched-time-label-right");
      rLabel.textContent = formatMinutesToTime(mins);
      rLabel.style.gridRow = `${timeToRow(mins, earliest) + 3} / span 4`;
      rLabel.style.gridColumn = String(rightTimeCol);
      grid.appendChild(rLabel);
    }

    // Meeting column — header + shift blocks + background track
    if (hasMeetings) {
      // Header spans both header rows (row 1 + row 2)
      const meetingHeader = document.createElement("div");
      meetingHeader.classList.add("sched-dept-header", "sched-dept-header--meeting");
      meetingHeader.textContent = "Meetings";
      meetingHeader.style.gridRow = "1";
      meetingHeader.style.gridColumn = "2";
      grid.appendChild(meetingHeader);

      // Row 2 sub-header placeholder — keeps meeting column aligned with crew headers
      const meetingSubHeader = document.createElement("div");
      meetingSubHeader.classList.add("sched-loc-header", "sched-loc-header--meeting");
      meetingSubHeader.style.gridRow = "2";
      meetingSubHeader.style.gridColumn = "2";
      grid.appendChild(meetingSubHeader);

      // One block per meeting shift, positioned on the time axis
      for (const meeting of dayData.meetings) {
        const startMins = parseTimeToMinutes(meeting.schedule.start_time);
        const endMins   = parseTimeToMinutes(meeting.schedule.end_time);
        if (startMins === null || endMins === null) continue;

        const startRow = timeToRow(startMins, earliest) + 3;
        const endRow   = timeToRow(endMins,   earliest) + 3;

        const block = document.createElement("div");
        block.classList.add("sched-shift-block", "sched-shift-block--meeting");
        block.style.gridRow    = `${startRow} / ${endRow}`;
        block.style.gridColumn = "2";

        const header = document.createElement("div");
        header.classList.add("sched-shift-header");
        header.textContent = meeting.shift_name;
        block.appendChild(header);

        const time = document.createElement("div");
        time.classList.add("sched-shift-time");
        time.textContent = `${meeting.schedule.start_time} – ${meeting.schedule.end_time}`;
        block.appendChild(time);

        if (meeting.sms_code) {
          const code = document.createElement("div");
          code.classList.add("sched-meeting-code");
          code.textContent = meeting.sms_code;
          block.appendChild(code);
        }

        grid.appendChild(block);
      }

      // Background track for the meeting column
      const meetingTrack = document.createElement("div");
      meetingTrack.classList.add("sched-col-track", "sched-col-track--meeting");
      meetingTrack.style.gridColumn = "2";
      meetingTrack.style.gridRow    = `1 / ${totalRows + 3}`;
      grid.appendChild(meetingTrack);
    }

    // Department columns
    for (const { deptKey, deptData, subCols, startCol, endCol } of deptMeta) {
      // Row 1: dept header spanning sub-columns
      const deptHeader = document.createElement("div");
      deptHeader.classList.add("sched-dept-header");
      deptHeader.dataset.dept = deptKey;
      deptHeader.textContent = deptData.dpt_name;
      deptHeader.style.gridRow = "1";
      deptHeader.style.gridColumn = `${startCol} / ${endCol}`;
      grid.appendChild(deptHeader);

      // Row 2: location sub-headers
      subCols.forEach((locName, i) => {
        const locHeader = document.createElement("div");
        locHeader.classList.add("sched-loc-header");
        locHeader.dataset.dept = deptKey;
        locHeader.textContent = locName || "";
        locHeader.style.gridRow = "2";
        locHeader.style.gridColumn = String(startCol + i);
        grid.appendChild(locHeader);
      });

      // Shift blocks
      for (const shift of Object.values(deptData.shift)) {
        const startMins = parseTimeToMinutes(shift.schedule.start_time);
        const endMins = parseTimeToMinutes(shift.schedule.end_time);
        if (startMins === null || endMins === null) continue;

        const startRow = timeToRow(startMins, earliest) + 3;
        const endRow = timeToRow(endMins, earliest) + 3;
        const isMS = deptKey === "mobile_support";
        const locValues = Object.values(shift.location);

        if (subCols[0] === null || locValues.every((l) => !l.name)) {
          // No named locations — single block spanning all dept sub-columns
          const aggMin = locValues.reduce((s, l) => s + (l.vol_min || 0), 0);
          const aggIdeal = locValues.reduce(
            (s, l) => s + (l.vol_ideal || 0),
            0,
          );
          const aggMax = locValues.reduce(
            (s, l) => s + (l.vol_max || aggIdeal),
            0,
          );

          const block = _makeShiftBlockEl(
            shift,
            deptKey,
            startRow,
            endRow,
            `${startCol} / ${endCol}`,
          );
          block.dataset.subcol = "all";
          block.dataset.assignmentId = String(locValues[0]?.id ?? "");
          _appendDropzones(
            block,
            isMS,
            aggMin,
            aggIdeal,
            aggMax,
            locValues[0]?.id ?? null,
            startMins,
            endMins,
          );
          grid.appendChild(block);
        } else {
          // Named locations — one block per location in its own sub-column
          for (const loc of locValues) {
            if (!loc.name) continue;
            const subIdx = subCols.indexOf(loc.name);
            if (subIdx === -1) continue;

            const min = loc.vol_min || 0;
            const ideal = loc.vol_ideal || 0;
            const max = loc.vol_max || ideal;

            const block = _makeShiftBlockEl(
              shift,
              deptKey,
              startRow,
              endRow,
              String(startCol + subIdx),
            );
            block.dataset.subcol = String(subIdx);
            block.dataset.assignmentId = String(loc.id ?? "");
            _appendDropzones(
              block,
              isMS,
              min,
              ideal,
              max,
              loc.id ?? null,
              startMins,
              endMins,
            );
            grid.appendChild(block);
          }
        }
      }
    }

    // ── Column tracks — continuous vertical dividers behind shift blocks ──
    let _firstDept = true;
    for (const { deptKey, subCols, startCol } of deptMeta) {
      subCols.forEach((_, i) => {
        const track = document.createElement("div");
        track.classList.add("sched-col-track");
        track.dataset.dept = deptKey;
        track.dataset.locIdx = String(i);
        track.style.gridColumn = String(startCol + i);
        if (i === 0 && !_firstDept) {
          track.classList.add("sched-col-track--dept");
          track.style.gridRow = `1 / ${totalRows + 3}`;
        } else {
          track.style.gridRow = `3 / ${totalRows + 3}`;
          if (i > 0) {
            track.classList.add("sched-col-track--loc");
          }
        }
        grid.appendChild(track);
      });
      _firstDept = false;
    }

    wrap.appendChild(grid);
    container.appendChild(wrap);
  }

  // ─────────────────────────────────────────────
  //  Shift expand-on-hover
  // ─────────────────────────────────────────────

  /**
   * Measure the full content height a shift block needs, including any
   * content clipped by the grid-row constraint.
   *
   * @param {HTMLElement} block
   * @returns {number}
   */
  function _getBlockContentHeight(block) {
    const header = block.querySelector(".sched-shift-header");
    const time = block.querySelector(".sched-shift-time");
    const dzArea = block.querySelector(".sched-dropzone-area");
    if (!dzArea) return block.clientHeight;
    return (
      (header?.offsetHeight || 0) +
      (time?.offsetHeight || 0) +
      dzArea.scrollHeight +
      8
    );
  }

  /**
   * Initialise hover-to-expand behaviour on all truncated shift blocks.
   * Blocks whose content exceeds their grid-row height receive a
   * gradient fade indicator and expand after a 1 200 ms hover delay,
   * floating above adjacent shifts via z-index.
   *
   * Called once per day change immediately after _buildCalendarGrid.
   *
   * @returns {void}
   */
  function _initShiftExpand() {
    const blocks = _gridEl?.querySelectorAll(".sched-shift-block") || [];
    let expandedBlock = null;

    for (const block of blocks) {
      const needed = _getBlockContentHeight(block);
      if (needed <= block.clientHeight + 2) continue;

      block.classList.add("sched-shift-truncated");
      let timer = null;

      block.addEventListener("mouseenter", () => {
        timer = setTimeout(() => {
          const contentH = _getBlockContentHeight(block);
          const gridH = block.clientHeight;

          // Re-check: if content actually fits now, clear the
          // truncated flag and skip — avoids shrinking tall blocks
          // that have fewer DZs than grid rows.
          if (contentH <= gridH + 2) {
            block.classList.remove("sched-shift-truncated");
            return;
          }

          if (expandedBlock && expandedBlock !== block) {
            _collapseBlock(expandedBlock);
          }
          block.classList.remove("sched-shift-truncated");

          const extra = contentH - gridH;
          const rect = block.getBoundingClientRect();

          if (
            rect.bottom + extra > window.innerHeight &&
            rect.top - extra >= 0
          ) {
            block.classList.add("sched-shift-expanded-up");
          } else {
            // Never shrink below the grid-given height
            block.style.height = Math.max(gridH, contentH) + "px";
            block.classList.add("sched-shift-expanded");
          }
          expandedBlock = block;
        }, 750);
      });

      block.addEventListener("mouseleave", () => {
        clearTimeout(timer);
        if (
          block.classList.contains("sched-shift-expanded") ||
          block.classList.contains("sched-shift-expanded-up")
        ) {
          _collapseBlock(block);
          expandedBlock = null;
        }
      });
    }
  }

  /**
   * Collapse an expanded shift block back to its grid-row size.
   * Restores the truncated indicator if the block still overflows.
   *
   * @param {HTMLElement} block
   * @returns {void}
   */
  function _collapseBlock(block) {
    block.style.height = "";
    block.classList.remove("sched-shift-expanded", "sched-shift-expanded-up");
    const needed = _getBlockContentHeight(block);
    if (needed > block.clientHeight + 2) {
      block.classList.add("sched-shift-truncated");
    }
  }

  // ─────────────────────────────────────────────
  //  Time band builder
  // ─────────────────────────────────────────────

  /**
   * Build and prepend horizontal time-period background bands into the grid.
   * Bands are inserted as the first children so they render behind all other
   * grid elements (shift blocks, headers, time labels).
   *
   * The largest gap between sessions is treated as "lunch". Sessions before
   * that gap are "morning"; sessions after are "afternoon". Each session is
   * split visually at its midpoint. Pre-session and post-session rows get a
   * neutral tint.
   *
   * @param {Array<{id:number, label:string, start_time:string, end_time:string}>} sessions
   * @param {number}      earliest  - Earliest minute offset for the grid (row 3).
   * @param {number}      latest    - Latest minute offset.
   * @param {HTMLElement} grid      - The .scheduler-calendar grid element.
   * @returns {void}
   */
  function _buildTimeBands(sessions, earliest, latest, grid) {
    if (!sessions || sessions.length === 0) return;

    /**
     * Map a session label to its CSS band class using keywords.
     * @param {string} label
     * @returns {string|null}
     */
    function classify(label) {
      const l = label.toLowerCase();
      if (l.includes("pre")) return "sched-band--pre";
      if (l.includes("post")) return "sched-band--post";
      if (l.includes("morning")) return "sched-band--morning";
      if (l.includes("lunch") || l.includes("intermission"))
        return "sched-band--lunch";
      if (l.includes("afternoon")) return "sched-band--afternoon";
      return null;
    }

    const sorted = sessions
      .map((s) => ({
        ...s,
        startMins: parseTimeToMinutes(s.start_time),
        endMins: parseTimeToMinutes(s.end_time),
      }))
      .filter((s) => s.startMins !== null && s.endMins !== null)
      .sort((a, b) => a.startMins - b.startMins);

    if (sorted.length === 0) return;

    // Label-based classification; gap-based fallback for unrecognised labels
    const classified = sorted.map((s) => ({
      ...s,
      bandCls: classify(s.label),
    }));
    if (classified.some((s) => s.bandCls === null)) {
      let lunchIdx = -1,
        maxGap = 0;
      for (let i = 0; i < sorted.length - 1; i++) {
        const gap = sorted[i + 1].startMins - sorted[i].endMins;
        if (gap > maxGap) {
          maxGap = gap;
          lunchIdx = i;
        }
      }
      classified.forEach((s, i) => {
        if (s.bandCls === null)
          s.bandCls =
            lunchIdx >= 0 && i > lunchIdx
              ? "sched-band--afternoon"
              : "sched-band--morning";
      });
    }

    const toRow = (mins) =>
      timeToRow(Math.max(earliest, Math.min(latest, mins)), earliest) + 3;

    // Sorted by start time — earlier bands render first (lower DOM order = further back),
    // so later overlapping bands (e.g. morning over pre-session) paint on top.
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < classified.length; i++) {
      const s = classified[i];
      const startRow = toRow(s.startMins);
      const endRow = toRow(s.endMins);
      if (endRow <= startRow) continue;

      const el = document.createElement("div");
      el.classList.add("sched-time-band", s.bandCls);
      el.style.gridRow = `${startRow} / ${endRow}`;
      el.style.gridColumn = "1 / -1";
      fragment.appendChild(el);

      // Divider at the boundary between two contiguous same-class sessions
      // (e.g. Morning A → Morning B = song-and-announcements break)
      if (i < classified.length - 1) {
        const next = classified[i + 1];
        const gap = next.startMins - s.endMins;
        if (gap <= 0 && s.bandCls === next.bandCls) {
          const divRow = toRow(next.startMins);
          if (divRow > startRow) {
            const div = document.createElement("div");
            div.classList.add("sched-time-band", "sched-band-divider");
            div.style.gridRow = `${divRow} / ${divRow + 1}`;
            div.style.gridColumn = "1 / -1";
            fragment.appendChild(div);
          }
        }
      }
    }

    grid.insertBefore(fragment, grid.firstChild);
  }

  // ─────────────────────────────────────────────
  //  Day banner & dept toggle buttons
  // ─────────────────────────────────────────────

  /**
   * Build the day banner containing the day label and one toggle button
   * per department. Buttons are clickable (show/hide) and draggable (reorder)
   * via pointer events — no HTML5 drag API, which conflicts with
   * agnostic-draggable.
   * Must be called after _deptMeta is populated.
   *
   * @param {string} dayLabel
   * @returns {HTMLElement}
   */
  function _buildDayBanner(dayLabel) {
    const banner = document.createElement("div");
    banner.classList.add("scheduler-day-banner");

    const label = document.createElement("span");
    label.classList.add("sched-banner-label");
    label.textContent = dayLabel;
    banner.appendChild(label);

    // Undo / Redo buttons
    const historyBtns = document.createElement("div");
    historyBtns.classList.add("sched-history-btns");

    const undoBtn = document.createElement("button");
    undoBtn.type = "button";
    undoBtn.id = "schedUndoBtn";
    undoBtn.classList.add("sched-history-btn");
    undoBtn.disabled = true;
    undoBtn.title = "Undo last assignment (Ctrl+Z)";
    const undoIcon = document.createElement("i");
    undoIcon.className = "fa-solid fa-rotate-left";
    undoBtn.appendChild(undoIcon);
    undoBtn.appendChild(document.createTextNode("\u00a0Undo"));

    const redoBtn = document.createElement("button");
    redoBtn.type = "button";
    redoBtn.id = "schedRedoBtn";
    redoBtn.classList.add("sched-history-btn");
    redoBtn.disabled = true;
    redoBtn.title = "Redo (Ctrl+Y)";
    const redoIcon = document.createElement("i");
    redoIcon.className = "fa-solid fa-rotate-right";
    redoBtn.appendChild(redoIcon);
    redoBtn.appendChild(document.createTextNode("\u00a0Redo"));

    historyBtns.appendChild(undoBtn);
    historyBtns.appendChild(redoBtn);
    banner.appendChild(historyBtns);

    initHistoryButtons(undoBtn, redoBtn);

    // Report link
    const reportLink = document.createElement("a");
    reportLink.href = `/oversight/tools/scheduler/report?dayId=${_currentDayId}`;
    reportLink.target = "_blank";
    reportLink.classList.add("sched-history-btn");
    reportLink.title = "Open printable report in new tab";
    const reportIcon = document.createElement("i");
    reportIcon.className = "fa-solid fa-print";
    reportLink.appendChild(reportIcon);
    reportLink.appendChild(document.createTextNode("\u00a0Report"));
    historyBtns.appendChild(reportLink);

    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.id = "schedRefreshAttendanceBtn";
    refreshBtn.classList.add("sched-history-btn");
    refreshBtn.title = "Manually refresh check-in badges";
    const refreshIcon = document.createElement("i");
    refreshIcon.className = "fa-solid fa-rotate";
    refreshBtn.appendChild(refreshIcon);
    refreshBtn.appendChild(document.createTextNode("\u00a0Check-ins"));
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      await refreshAttendanceBadges();
      refreshBtn.disabled = false;
    });
    historyBtns.appendChild(refreshBtn);

    const togglesWrap = document.createElement("div");
    togglesWrap.classList.add("sched-dept-toggles-wrap");

    const togglesLabel = document.createElement("span");
    togglesLabel.classList.add("sched-dept-toggles-label");
    togglesLabel.textContent = "Columns:";
    togglesWrap.appendChild(togglesLabel);

    const toggles = document.createElement("div");
    toggles.classList.add("sched-dept-toggles");
    toggles.id = "deptToggles";

    // Meeting toggle — always leftmost, not draggable/reorderable
    if (_hasMeetings) {
      const mtgBtn = document.createElement("button");
      mtgBtn.type = "button";
      mtgBtn.classList.add("sched-dept-toggle", "sched-dept-toggle--meeting");
      mtgBtn.title = "Meetings — click to hide/show";
      mtgBtn.textContent = "Meetings";
      mtgBtn.addEventListener("click", () => _toggleMeetingVisibility(mtgBtn));
      toggles.appendChild(mtgBtn);
    }

    for (const { deptKey, deptData } of _deptMeta) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.classList.add(
        "sched-dept-toggle",
        `sched-dept-toggle--${deptKey.replace(/_/g, "-")}`,
      );
      btn.dataset.dept = deptKey;
      btn.title = `${deptData.dpt_name} — click to hide/show · drag to reorder`;
      btn.textContent = DEPT_ABBREV[deptKey] || deptData.dpt_name;

      btn.addEventListener("pointerdown", _onTogglePointerDown);
      btn.addEventListener("pointermove", _onTogglePointerMove);
      btn.addEventListener("pointerup", _onTogglePointerUp);
      btn.addEventListener("pointercancel", _onTogglePointerCancel);

      toggles.appendChild(btn);
    }

    togglesWrap.appendChild(toggles);
    banner.appendChild(togglesWrap);
    return banner;
  }

  // ─────────────────────────────────────────────
  //  Toggle pointer-event handlers (click + drag in one)
  // ─────────────────────────────────────────────

  /**
   * Active pointer-drag state for toggle button reordering.
   * @type {{ deptKey:string, btn:HTMLElement, startX:number, startY:number, isDragging:boolean }|null}
   */
  let _toggleDragState = null;

  /** @param {PointerEvent} e @returns {void} */
  function _onTogglePointerDown(e) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    _toggleDragState = {
      deptKey: e.currentTarget.dataset.dept,
      btn: e.currentTarget,
      startX: e.clientX,
      startY: e.clientY,
      isDragging: false,
    };
  }

  /** @param {PointerEvent} e @returns {void} */
  function _onTogglePointerMove(e) {
    if (!_toggleDragState) return;
    const dx = e.clientX - _toggleDragState.startX;
    const dy = e.clientY - _toggleDragState.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (!_toggleDragState.isDragging && dist > 8) {
      _toggleDragState.isDragging = true;
      _toggleDragState.btn.classList.add("dragging");
    }

    if (_toggleDragState.isDragging) {
      // Highlight whichever toggle button the pointer is over
      document
        .querySelectorAll(".sched-dept-toggle.drag-over")
        .forEach((b) => b.classList.remove("drag-over"));
      const target = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest(".sched-dept-toggle[data-dept]");
      if (target && target !== _toggleDragState.btn) {
        target.classList.add("drag-over");
      }
    }
  }

  /** @param {PointerEvent} e @returns {void} */
  function _onTogglePointerUp(e) {
    if (!_toggleDragState) return;

    const { deptKey, btn, isDragging } = _toggleDragState;
    _toggleDragState = null;

    btn.classList.remove("dragging");
    document
      .querySelectorAll(".sched-dept-toggle.drag-over")
      .forEach((b) => b.classList.remove("drag-over"));

    if (isDragging) {
      const targetBtn = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest(".sched-dept-toggle[data-dept]");
      const targetDept = targetBtn?.dataset.dept;
      if (targetDept && targetDept !== deptKey) {
        _doToggleReorder(deptKey, targetDept, btn, targetBtn);
      }
    } else {
      _toggleDeptVisibility(deptKey, btn);
    }
  }

  /** @param {PointerEvent} e @returns {void} */
  function _onTogglePointerCancel(e) {
    if (!_toggleDragState) return;
    _toggleDragState.btn.classList.remove("dragging");
    document
      .querySelectorAll(".sched-dept-toggle.drag-over")
      .forEach((b) => b.classList.remove("drag-over"));
    _toggleDragState = null;
  }

  // ─────────────────────────────────────────────
  //  Toggle actions (visibility + reorder)
  // ─────────────────────────────────────────────

  /**
   * Toggle the meeting column visibility.
   *
   * @param {HTMLElement} btn
   * @returns {void}
   */
  function _toggleMeetingVisibility(btn) {
    _meetingHidden = !_meetingHidden;
    btn.classList.toggle("dept-hidden", _meetingHidden);
    _applyColumnLayout();
  }

  /**
   * Toggle a department's column visibility.
   *
   * @param {string}      deptKey
   * @param {HTMLElement} btn
   * @returns {void}
   */
  function _toggleDeptVisibility(deptKey, btn) {
    if (_hiddenDepts.has(deptKey)) {
      _hiddenDepts.delete(deptKey);
    } else {
      _hiddenDepts.add(deptKey);
    }
    btn.classList.toggle("dept-hidden", _hiddenDepts.has(deptKey));
    _applyColumnLayout();
  }

  /**
   * Swap two department columns by swapping their positions in _deptMeta
   * and mirroring the swap in the toggle button DOM order.
   *
   * @param {string}      srcDept
   * @param {string}      tgtDept
   * @param {HTMLElement} srcBtn
   * @param {HTMLElement} tgtBtn
   * @returns {void}
   */
  function _doToggleReorder(srcDept, tgtDept, srcBtn, tgtBtn) {
    const srcIdx = _deptMeta.findIndex((d) => d.deptKey === srcDept);
    const tgtIdx = _deptMeta.findIndex((d) => d.deptKey === tgtDept);
    if (srcIdx === -1 || tgtIdx === -1) return;

    // Swap in data array
    [_deptMeta[srcIdx], _deptMeta[tgtIdx]] = [
      _deptMeta[tgtIdx],
      _deptMeta[srcIdx],
    ];

    // Swap DOM positions via placeholder
    const placeholder = document.createElement("span");
    tgtBtn.after(placeholder);
    srcBtn.before(tgtBtn);
    placeholder.replaceWith(srcBtn);

    _applyColumnLayout();
  }

  // ─────────────────────────────────────────────
  //  Column layout application
  // ─────────────────────────────────────────────

  /**
   * Recompute column indices after a reorder or visibility change, then
   * update the grid's CSS column template and all affected cell positions.
   * Hidden departments collapse to 0px so they occupy no visible space.
   *
   * @returns {void}
   */
  function _applyColumnLayout() {
    if (!_gridEl) return;

    // Recompute startCol/endCol — crew cols start at 2 or 3 depending on meeting col
    const crewOffset = _hasMeetings ? 3 : 2;
    let cursor = crewOffset;
    for (const meta of _deptMeta) {
      meta.startCol = cursor;
      meta.endCol = cursor + meta.subCols.length;
      cursor = meta.endCol;
    }

    // Rebuild column template (hidden cols collapse to 0px)
    const cols = ["60px"];
    if (_hasMeetings) cols.push(_meetingHidden ? "0px" : "140px");
    const colMin =
      getComputedStyle(_gridEl).getPropertyValue("--sched-col-min").trim() ||
      "120px";
    for (const { deptKey, subCols } of _deptMeta) {
      const hidden = _hiddenDepts.has(deptKey);
      cols.push(
        ...subCols.map(() => (hidden ? "0px" : `minmax(${colMin}, 1fr)`)),
      );
    }
    const isScrolled = _gridEl
      .closest(".scheduler-calendar-outer")
      ?.classList.contains("is-scrolled");
    cols.push(isScrolled ? "60px" : "0px");
    _gridEl.style.gridTemplateColumns = cols.join(" ");

    // Show/hide all meeting column elements together
    if (_hasMeetings) {
      const display = _meetingHidden ? "none" : "";
      _gridEl
        .querySelectorAll(
          ".sched-dept-header--meeting, .sched-loc-header--meeting, " +
          ".sched-shift-block--meeting, .sched-col-track--meeting",
        )
        .forEach((el) => { el.style.display = display; });
    }

    // Update every cell's gridColumn for each dept
    for (const { deptKey, subCols, startCol, endCol } of _deptMeta) {
      const hidden = _hiddenDepts.has(deptKey);

      // Dept header (row 1)
      const dh = _gridEl.querySelector(
        `.sched-dept-header[data-dept="${deptKey}"]`,
      );
      if (dh) {
        dh.style.gridColumn = `${startCol} / ${endCol}`;
        dh.style.display = hidden ? "none" : "";
      }

      // Location sub-headers (row 2)
      _gridEl
        .querySelectorAll(`.sched-loc-header[data-dept="${deptKey}"]`)
        .forEach((el, i) => {
          el.style.gridColumn = String(startCol + i);
          el.style.display = hidden ? "none" : "";
        });

      // Shift blocks
      _gridEl
        .querySelectorAll(`.sched-shift-block[data-department="${deptKey}"]`)
        .forEach((block) => {
          const subcol = block.dataset.subcol;
          block.style.gridColumn =
            subcol === "all"
              ? `${startCol} / ${endCol}`
              : String(startCol + Number(subcol));
          block.style.display = hidden ? "none" : "";
        });

      // Column tracks
      _gridEl
        .querySelectorAll(`.sched-col-track[data-dept="${deptKey}"]`)
        .forEach((track) => {
          track.style.gridColumn = String(
            startCol + Number(track.dataset.locIdx),
          );
          track.style.display = hidden ? "none" : "";
        });
    }
  }

  // ─────────────────────────────────────────────
  //  DOM helpers
  // ─────────────────────────────────────────────

  /**
   * Create a positioned shift block element with a shift-name header.
   * Dropzones are NOT appended here — call _appendDropzones() separately.
   *
   * @param {object} shift
   * @param {string} deptKey
   * @param {number} startRow
   * @param {number} endRow
   * @param {string} gridColumn
   * @returns {HTMLElement}
   */
  function _makeShiftBlockEl(shift, deptKey, startRow, endRow, gridColumn) {
    const block = document.createElement("div");
    block.classList.add("sched-shift-block");
    block.dataset.department = deptKey;
    block.dataset.shiftId = String(shift.id);
    block.style.gridRow = `${startRow} / ${endRow}`;
    block.style.gridColumn = gridColumn;

    const header = document.createElement("div");
    header.classList.add("sched-shift-header");
    header.textContent = shift.shift_name;
    block.appendChild(header);

    const s = shift.schedule?.start_time;
    const e = shift.schedule?.end_time;
    if (s || e) {
      const time = document.createElement("div");
      time.classList.add("sched-shift-time");
      time.textContent = s && e ? `${s} – ${e}` : s || e;
      block.appendChild(time);
    }

    return block;
  }

  /**
   * Build and append a dropzone area into a shift block.
   * KM/KA leadership slots are prepended (except for mobile_support),
   * followed by regular volunteer slots color-coded by min/ideal/max tier.
   *
   * @param {HTMLElement} block
   * @param {boolean}     isMS         - True for mobile_support (skip KM/KA slots).
   * @param {number}      min
   * @param {number}      ideal
   * @param {number}      max
   * @param {number|null} assignmentId  - The schedule_assignments.id for persistence.
   * @param {number}      shiftStartMins - Shift start in minutes from midnight.
   * @param {number}      shiftEndMins   - Shift end in minutes from midnight.
   * @returns {void}
   */
  function _appendDropzones(
    block,
    isMS,
    min,
    ideal,
    max,
    assignmentId,
    shiftStartMins,
    shiftEndMins,
  ) {
    const dzArea = document.createElement("div");
    dzArea.classList.add("sched-dropzone-area");

    if (!isMS) {
      const kmDz = _makeDropzoneEl(
        "keyman",
        "dz-keyman",
        assignmentId,
        "keyman",
        0,
        shiftStartMins,
        shiftEndMins,
      );
      dzArea.appendChild(kmDz);
      makeDroppable(kmDz, {}, { "droppable:drop": onDrop });

      const kaDz = _makeDropzoneEl(
        "keyman_asst",
        "dz-keyman-asst",
        assignmentId,
        "keyman_asst",
        0,
        shiftStartMins,
        shiftEndMins,
      );
      dzArea.appendChild(kaDz);
      makeDroppable(kaDz, {}, { "droppable:drop": onDrop });
    }

    if (max === 0) {
      const hint = document.createElement("p");
      hint.classList.add("sched-no-slots-hint");
      hint.textContent = "No slots defined";
      dzArea.appendChild(hint);
    } else {
      for (let i = 0; i < max; i++) {
        let dzClass;
        if (i < min) dzClass = "dz-required";
        else if (i < ideal) dzClass = "dz-ideal";
        else dzClass = "dz-extra";

        const dz = _makeDropzoneEl(
          null,
          dzClass,
          assignmentId,
          "volunteer",
          i,
          shiftStartMins,
          shiftEndMins,
        );
        dzArea.appendChild(dz);
        makeDroppable(dz, {}, { "droppable:drop": onDrop });
      }
    }

    block.appendChild(dzArea);
  }

  /**
   * Create a single drop zone element.
   *
   * @param {string|null} role         - data-role value, or null for regular slots.
   * @param {string}      dzClass      - CSS modifier class.
   * @param {number|null} assignmentId - schedule_assignments.id for this slot group.
   * @param {string|null} slotType     - 'keyman' | 'keyman_asst' | 'volunteer'.
   * @param {number|null} slotIndex    - 0-based position within the slot type.
   * @param {number|null} [shiftStartMins] - Shift start minutes (for conflict detection).
   * @param {number|null} [shiftEndMins]   - Shift end minutes (for conflict detection).
   * @returns {HTMLElement}
   */
  function _makeDropzoneEl(
    role,
    dzClass,
    assignmentId,
    slotType,
    slotIndex,
    shiftStartMins,
    shiftEndMins,
  ) {
    const dz = document.createElement("div");
    dz.classList.add("scheduler-dropzone", dzClass);
    if (role) dz.dataset.role = role;
    if (assignmentId != null) dz.dataset.assignmentId = String(assignmentId);
    if (slotType) dz.dataset.slotType = slotType;
    if (slotIndex != null) dz.dataset.slotIndex = String(slotIndex);
    if (shiftStartMins != null)
      dz.dataset.shiftStartMins = String(shiftStartMins);
    if (shiftEndMins != null) dz.dataset.shiftEndMins = String(shiftEndMins);
    return dz;
  }

  // ─────────────────────────────────────────────
  //  Pool pill assignment badge
  // ─────────────────────────────────────────────

  /**
   * Add or update a small badge on a pool pill showing how many shifts
   * the volunteer is currently assigned to. Removes the badge when count
   * reaches zero. The badge is hidden by CSS when the pill is inside a DZ.
   *
   * @param {number} volunteerId
   * @returns {void}
   */
  function _updatePillBadge(volunteerId) {
    const pill = document.querySelector(
      `#name-pool .name-pill[data-id="${volunteerId}"]`,
    );
    if (!pill) return;
    const count = assignmentCount(volunteerId);
    let badge = pill.querySelector(".pill-assign-badge");
    if (count === 0) {
      badge?.remove();
    } else {
      if (!badge) {
        badge = document.createElement("span");
        badge.classList.add("pill-assign-badge");
        pill.appendChild(badge);
      }
      badge.textContent = `${count}\u00d7`;
      badge.title = `Assigned to ${count} shift${count !== 1 ? "s" : ""} today`;
    }
  }

  function _recheckConflictBadges(volId) {
    const pills = document.querySelectorAll(
      `.scheduler-calendar .name-pill[data-id="${volId}"]`,
    );
    pills.forEach((pill) => {
      const dz = pill.parentElement;
      if (!dz?.classList.contains("scheduler-dropzone")) return;
      const dzStart = Number(dz.dataset.shiftStartMins);
      const dzEnd = Number(dz.dataset.shiftEndMins);
      if (!dzStart || !dzEnd) return;

      pill.querySelector(".pill-badge-row")?.remove();
      delete pill.dataset.conflictCount;

      const conflicts = getConflicts(volId, dzStart, dzEnd, dz);
      const shiftConflicts = conflicts.filter((c) => c.dzEl !== null);
      const blackoutConflicts = conflicts.filter((c) => c.dzEl === null);

      if (shiftConflicts.length > 0) {
        pill.dataset.conflictCount = String(shiftConflicts.length);
        _applyConflictBadge(pill, _generateConflictNote(shiftConflicts));
      }
      if (blackoutConflicts.length > 0) {
        const noteTitle = blackoutConflicts
          .map((c) => {
            const t = `${_fmtConflictTime(c.shiftStart)}–${_fmtConflictTime(c.shiftEnd)}`;
            return c.reason
              ? `Unavailable ${t} — ${c.reason}`
              : `Unavailable ${t}`;
          })
          .join("; ");
        _applyNoteBadge(pill, noteTitle);
      } else {
        // No live blackout conflicts — clear stale blackout data so the
        // badge does not reappear from a deleted blackout's saved note.
        delete pill.dataset.blackoutNote;
      }

      // Fallback: no live conflicts but pill has a stored DB note.
      // Only re-apply shift-conflict portions — blackout portions are
      // stale if the blackout was deleted.
      if (conflicts.length === 0) {
        const savedNote = pill.dataset.conflictNote || "";
        if (savedNote) {
          const shiftParts = savedNote
            .split("; ")
            .filter((p) => !p.startsWith("Unavailable"));
          if (shiftParts.length > 0) {
            _applyConflictBadge(pill, shiftParts.join("; "));
          }
        }
      }
    });
  }

  // ─────────────────────────────────────────────
  //  Day assignments loader
  // ─────────────────────────────────────────────

  /**
   * Fetch any previously saved slot assignments for the given day from the
   * DB and silently pre-populate the grid dropzones. No history is recorded
   * and no API calls are made (the data already exists in the DB).
   *
   * @param {number} dayId
   * @returns {Promise<void>}
   */
  /**
   * Fetch all blackout windows for the given day and register them in the
   * conflict tracker as phantom assignments (dzEl = null). This prevents the
   * scheduler from dropping a volunteer into a slot that overlaps their blackout.
   *
   * @param {number} dayId
   * @returns {Promise<void>}
   */
  async function _loadDayBlackouts(dayId) {
    try {
      const res = await fetch(`/api/scheduler/blackouts/${dayId}`);
      const data = await res.json();
      if (!data.success || !data.blackouts?.length) return;
      for (const bk of data.blackouts) {
        trackAssign(
          bk.volunteer_id,
          bk.start_mins,
          bk.end_mins,
          null,
          bk.reason || null,
        );
      }
    } catch (err) {
      console.error("[scheduler] _loadDayBlackouts error:", err);
    }
  }

  async function _loadDayAssignments(dayId) {
    try {
      const res = await fetch(`/api/scheduler/slots/${dayId}`);
      const data = await res.json();
      if (!data.success || !data.assignments?.length) return;

      const loadedVolIds = new Set();

      for (const a of data.assignments) {
        const dz = _gridEl?.querySelector(
          `.scheduler-dropzone[data-assignment-id="${a.schedule_assignment_id}"][data-slot-type="${a.slot_type}"][data-slot-index="${a.slot_index}"]`,
        );
        if (!dz) continue;

        const pill = document.querySelector(
          `#name-pool .name-pill[data-id="${a.volunteer_id}"]`,
        );
        if (!pill) continue;

        silentlyPlacePill(pill, dz, a.id, a.note || null);
        loadedVolIds.add(a.volunteer_id);
      }

      // After all pills are placed and tracked, recheck every loaded volunteer.
      // This ensures the first-placed pill also gets a badge when a later-placed
      // pill creates a bidirectional conflict.
      for (const volId of loadedVolIds) {
        _recheckConflictBadges(volId);
      }

      _updatePoolCount();

      // Fetch attendance and apply check-in badges. Dispatch the result so
      // scheduler.js can set up the smart attendance poller.
      const attendanceData = await refreshAttendanceBadges();
      document.dispatchEvent(
        new CustomEvent("scheduler:attendanceReady", {
          detail: {
            dayId,
            conventionDate: attendanceData?.conventionDate ?? null,
          },
        }),
      );
    } catch (err) {
      console.error("[scheduler] _loadDayAssignments error:", err);
    }
  }
  // Re-check and update conflict badges on all DZ pills for a volunteer.
  // Fired when a blackout is added or removed via the panel.
  document.addEventListener("scheduler:blackoutChanged", (e) => {
    const { volId } = e.detail || {};
    if (volId) _recheckConflictBadges(Number(volId));
  });
  await _loadVolunteers();
  initContextMenu();
}
