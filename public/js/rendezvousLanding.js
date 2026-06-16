/**
 * @file rendezvousLanding.js
 * @description Client-side logic for the Rendezvous Points landing page.
 *
 * Loads RV data per day on accordion expand, renders cards per
 * shift+location with RV status badges, and opens the shared
 * rendezvous editor panel on click.
 */

import {
  preloadRendezvousForDay,
  getCachedRendezvous,
  openRendezvousPanel,
  dismissRendezvousPanel,
} from "./rendezvous.js";

// ─────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────

/** @type {Set<number>} Day IDs that have been fetched. */
const _loadedDays = new Set();

/** @type {Map<number, Array<object>>} dayId → RV rows from API. */
const _dayData = new Map();

/** @type {string} Current event type filter value. */
let _eventFilter = "";

// ─────────────────────────────────────────────
//  Permission helpers
// ─────────────────────────────────────────────

const _role = document.querySelector('meta[name="user-role"]')?.content || "";
const ROLE_ORDER = [
  "NON_REGISTERED",
  "REGISTERED",
  "DESK",
  "KEYMAN",
  "OVERSEER",
  "ASSISTANT_ADMIN",
  "ADMIN",
];

/**
 * @param {string} minRole
 * @returns {boolean}
 */
function _isAtLeast(minRole) {
  return ROLE_ORDER.indexOf(_role) >= ROLE_ORDER.indexOf(minRole);
}

// ─────────────────────────────────────────────
//  Day toggle
// ─────────────────────────────────────────────

/**
 * Toggle a day accordion open/closed. Fetches data on first open.
 *
 * @param {number} dayId
 * @returns {Promise<void>}
 */
async function _toggleDay(dayId) {
  const body = document.getElementById(`rvDay-${dayId}`);
  const btn = document.querySelector(
    `.rv-landing-day-header[data-day-id="${dayId}"]`,
  );
  if (!body || !btn) return;

  const isOpen = !body.classList.contains("d-none");
  if (isOpen) {
    body.classList.add("d-none");
    btn
      .querySelector(".rv-day-chevron")
      ?.classList.remove("rv-day-chevron--open");
    return;
  }

  // Expand
  body.classList.remove("d-none");
  btn.querySelector(".rv-day-chevron")?.classList.add("rv-day-chevron--open");

  if (!_loadedDays.has(dayId)) {
    body.innerHTML = '<p class="text-muted small p-2">Loading…</p>';
    await preloadRendezvousForDay(dayId);

    try {
      const res = await fetch(`/api/rendezvous/day/${dayId}`);
      const data = await res.json();
      _dayData.set(dayId, data.success ? data.rows : []);
    } catch {
      _dayData.set(dayId, []);
    }

    _loadedDays.add(dayId);
  }

  _renderDay(dayId);
}

// ─────────────────────────────────────────────
//  Render
// ─────────────────────────────────────────────

/**
 * Render the RV cards for a single day.
 *
 * @param {number} dayId
 */
function _renderDay(dayId) {
  const body = document.getElementById(`rvDay-${dayId}`);
  const rows = _dayData.get(dayId) || [];
  const btn = document.querySelector(
    `.rv-landing-day-header[data-day-id="${dayId}"]`,
  );

  const filtered = _eventFilter
    ? rows.filter((r) => r.event_type_name === _eventFilter)
    : rows;

  // Update count badge
  const countBadge = btn?.querySelector(".rv-day-count");
  if (countBadge) countBadge.textContent = String(filtered.length);

  if (!body) return;

  if (filtered.length === 0) {
    body.innerHTML =
      '<p class="rv-empty p-2">No rendezvous points for this day.</p>';
    return;
  }

  body.innerHTML = "";

  // Populate event filter dropdown with unique types from all days
  _updateEventFilter();

  for (const rv of filtered) {
    const card = document.createElement("div");
    card.classList.add("rv-landing-card");

    const badge = document.createElement("div");
    badge.classList.add("rv-landing-card-badge", "rv-landing-card-badge--set");
    card.appendChild(badge);

    const info = document.createElement("div");
    info.classList.add("rv-landing-card-info");

    const shift = document.createElement("div");
    shift.classList.add("rv-landing-card-shift");
    shift.textContent = `${rv.shift_label} — ${rv.event_type_name}`;
    info.appendChild(shift);

    const loc = document.createElement("div");
    loc.classList.add("rv-landing-card-loc");
    const desc = rv.description ? ` · ${rv.description}` : "";
    loc.textContent = `${rv.location_name}${desc}`;
    info.appendChild(loc);

    card.appendChild(info);

    const arrow = document.createElement("i");
    arrow.className = "fa-solid fa-chevron-right text-muted";
    card.appendChild(arrow);

    const dayBlock = document.querySelector(
      `.rv-day-block[data-day-id="${dayId}"]`,
    );
    const convDate = dayBlock?.dataset.date || "";

    // Derive start time HH:MM from rv.start_time
    let startHHMM = "";
    if (rv.start_time) {
      if (rv.start_time instanceof Date || typeof rv.start_time === "object") {
        const d = new Date(rv.start_time);
        startHHMM = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
      } else {
        startHHMM = String(rv.start_time).slice(0, 5);
      }
    }

    card.addEventListener("click", (e) => {
      openRendezvousPanel({
        assignmentId: rv.schedule_assignment_id,
        shiftLabel: rv.shift_label,
        locationName: rv.location_name,
        startTime: startHHMM,
        conventionDate: convDate,
        canCreate: _isAtLeast("OVERSEER"),
        canEdit: _isAtLeast("KEYMAN"),
        canDelete: _isAtLeast("OVERSEER"),
        anchorX: e.clientX,
        anchorY: e.clientY,
        onUpdate: () => {
          _loadedDays.delete(dayId);
          _toggleDay(dayId); // collapse
          _toggleDay(dayId); // re-expand with fresh data
        },
      });
    });

    body.appendChild(card);
  }
}

/**
 * Populate the event type filter dropdown from all loaded data.
 */
function _updateEventFilter() {
  const select = document.getElementById("rvEventFilter");
  if (!select) return;

  const types = new Set();
  for (const rows of _dayData.values()) {
    for (const r of rows) {
      if (r.event_type_name) types.add(r.event_type_name);
    }
  }

  const current = select.value;
  const opts = ['<option value="">All types</option>'];
  for (const t of [...types].sort()) {
    const sel = t === current ? " selected" : "";
    opts.push(`<option value="${t}"${sel}>${t}</option>`);
  }
  select.innerHTML = opts.join("");
}

// ─────────────────────────────────────────────
//  Init
// ─────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // Day header clicks
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".rv-landing-day-header");
    if (btn) {
      const dayId = Number(btn.dataset.dayId);
      if (dayId) _toggleDay(dayId);
    }
  });

  // Event filter
  const filterEl = document.getElementById("rvEventFilter");
  if (filterEl) {
    filterEl.addEventListener("change", () => {
      _eventFilter = filterEl.value;
      for (const dayId of _loadedDays) {
        const body = document.getElementById(`rvDay-${dayId}`);
        if (body && !body.classList.contains("d-none")) {
          _renderDay(dayId);
        }
      }
    });
  }

  // Dismiss RV panel on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") dismissRendezvousPanel();
  });
});
