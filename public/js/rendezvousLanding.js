/**
 * @file rendezvousLanding.js
 * @description Client-side logic for the Rendezvous Points landing page.
 *
 * Loads every crew shift assignment of a day on accordion expand
 * (GET /api/rendezvous/day/:dayId/assignments), renders one card per
 * shift+location marked set (green) or missing (grey), and opens the
 * shared rendezvous editor panel on click. Filters: shift type, and
 * meet-up point (all / has a point / no point yet). The day badge shows
 * how many of the shown shifts have a point ("3/12"). Shifts with no
 * location yet cannot have a point; a note at the top of the day lists
 * them, with a link to that day on Timelines.
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

/**
 * dayId → that day's crew shifts with no location yet (from the same API).
 *
 * @type {Map<number, Array<{ shift_id: number, shift_label: string,
 *                            start_time: string, event_type_name: string|null }>>}
 */
const _dayUnlocated = new Map();

/** @type {string} Current event type filter value. */
let _eventFilter = "";

/** @type {""|"set"|"missing"} Current meet-up point filter value. */
let _pointFilter = "";

// ─────────────────────────────────────────────
//  Permission helpers
// ─────────────────────────────────────────────

/**
 * True when the signed-in person may create, edit and delete rendezvous
 * points (rendezvous.manage, phase 3d-4). Read from public/js/permissions.js,
 * which loads before this module. The server checks every change anyway.
 *
 * @returns {boolean}
 */
function _canManageRendezvous() {
    return window.AppPermissions?.can("rendezvous.manage") === true;
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
      const res = await fetch(`/api/rendezvous/day/${dayId}/assignments`);
      const data = await res.json();
      _dayData.set(dayId, data.success ? data.rows : []);
      _dayUnlocated.set(dayId, data.success && Array.isArray(data.unlocated) ? data.unlocated : []);
    } catch {
      _dayData.set(dayId, []);
      _dayUnlocated.set(dayId, []);
    }

    _loadedDays.add(dayId);
  }

  _renderDay(dayId);
}

// ─────────────────────────────────────────────
//  Render
// ─────────────────────────────────────────────

/**
 * Render the cards for a single day: every shift + location, filtered by
 * shift type and meet-up point, with the day badge showing how many of the
 * type-filtered shifts have a point.
 *
 * @param {number} dayId
 * @returns {void}
 */
function _renderDay(dayId) {
  const body = document.getElementById(`rvDay-${dayId}`);
  const rows = _dayData.get(dayId) || [];
  const btn = document.querySelector(
    `.rv-landing-day-header[data-day-id="${dayId}"]`,
  );
  const canManage = _canManageRendezvous();

  const ofType = _eventFilter
    ? rows.filter((r) => r.event_type_name === _eventFilter)
    : rows;
  const withPoint = ofType.filter((r) => r.has_rv).length;
  const filtered = ofType.filter((r) =>
    _pointFilter === "set" ? r.has_rv : _pointFilter === "missing" ? !r.has_rv : true,
  );

  // Day badge: shifts with a point / shifts shown by the type filter
  const countBadge = btn?.querySelector(".rv-day-count");
  if (countBadge) {
    countBadge.textContent = `${withPoint}/${ofType.length}`;
    countBadge.title = `${withPoint} of ${ofType.length} shifts have a meet-up point`;
    countBadge.classList.toggle("bg-primary", withPoint === ofType.length);
    countBadge.classList.toggle("bg-warning", withPoint < ofType.length);
    countBadge.classList.toggle("text-dark", withPoint < ofType.length);
  }

  if (!body) return;

  // Populate event filter dropdown with unique types from all days
  _updateEventFilter();

  const unlocatedNote = _pointFilter === "set" ? null : _unlocatedNote(dayId);

  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.classList.add("rv-empty", "p-2");
    empty.textContent = rows.length === 0
      ? "No shifts are scheduled at a location on this day."
      : _pointFilter === "missing"
        ? "Every shift shown has a meet-up point."
        : _pointFilter === "set"
          ? "No shift shown has a meet-up point yet."
          : "No shifts of this type on this day.";
    body.replaceChildren(empty);
    if (unlocatedNote) body.prepend(unlocatedNote);
    return;
  }

  body.replaceChildren();
  if (unlocatedNote) body.appendChild(unlocatedNote);

  for (const rv of filtered) {
    const clickable = rv.has_rv || canManage;
    const card = document.createElement(clickable ? "button" : "div");
    if (clickable) card.type = "button";
    card.classList.add("rv-landing-card");
    if (!clickable) card.classList.add("rv-landing-card--static");

    const badge = document.createElement("div");
    badge.classList.add(
      "rv-landing-card-badge",
      rv.has_rv ? "rv-landing-card-badge--set" : "rv-landing-card-badge--unset",
    );
    card.appendChild(badge);

    const info = document.createElement("div");
    info.classList.add("rv-landing-card-info");

    const shift = document.createElement("div");
    shift.classList.add("rv-landing-card-shift");
    shift.textContent = `${rv.shift_label} — ${rv.event_type_name || "Shift"}`;
    info.appendChild(shift);

    const loc = document.createElement("div");
    loc.classList.add("rv-landing-card-loc");
    const where = rv.location_name || "No location";
    loc.textContent = rv.has_rv
      ? `${where}${rv.description ? ` · ${rv.description}` : ""}`
      : `${where} · No meet-up point yet`;
    info.appendChild(loc);

    card.appendChild(info);

    if (clickable) {
      const icon = document.createElement("i");
      icon.className = rv.has_rv
        ? "fa-solid fa-chevron-right text-muted"
        : "fa-solid fa-plus text-muted";
      icon.setAttribute("aria-hidden", "true");
      card.appendChild(icon);
      card.setAttribute(
        "aria-label",
        `${rv.has_rv ? "Open" : "Add"} meet-up point: ${rv.shift_label}, ${where}`,
      );
    }

    if (!clickable) {
      body.appendChild(card);
      continue;
    }

    const dayBlock = document.querySelector(
      `.rv-day-block[data-day-id="${dayId}"]`,
    );
    const convDate = dayBlock?.dataset.date || "";

    // Derive start time HH:MM from rv.start_time. After the JSON round-trip
    // from the API, this always arrives as a string — either an
    // epoch-anchored ISO timestamp from a mssql TIME column
    // ("1970-01-01T07:00:00.000Z") or a plain "HH:MM:SS" string.
    let startHHMM = "";
    if (rv.start_time) {
      const raw = String(rv.start_time);
      if (raw.includes("T")) {
        const d = new Date(raw);
        startHHMM = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
      } else {
        startHHMM = raw.slice(0, 5);
      }
    }

    card.addEventListener("click", (e) => {
      openRendezvousPanel({
        assignmentId: rv.schedule_assignment_id,
        shiftLabel: rv.shift_label,
        locationName: where,
        startTime: startHHMM,
        conventionDate: convDate,
        canCreate: canManage,
        canEdit: canManage,
        canDelete: canManage,
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
 * Note for the top of a day: its crew shifts (of the chosen type) that have
 * no location yet, so they cannot have a meet-up point, with a link to that
 * day on Timelines where locations are added. Null when there are none.
 *
 * @param {number} dayId
 * @returns {HTMLElement|null}
 */
function _unlocatedNote(dayId) {
  const all = _dayUnlocated.get(dayId) || [];
  const shifts = _eventFilter
    ? all.filter((s) => s.event_type_name === _eventFilter)
    : all;
  if (!shifts.length) return null;

  const note = document.createElement("div");
  note.classList.add("rv-unlocated");

  const icon = document.createElement("i");
  icon.className = "fa-solid fa-circle-info me-1";
  icon.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  const n = shifts.length;
  const names = shifts
    .map((s) => `${_hhmm(s.start_time)} ${s.shift_label}${s.event_type_name ? ` (${s.event_type_name})` : ""}`.trim())
    .join(", ");
  text.textContent =
    `${n} shift${n !== 1 ? "s have" : " has"} no location yet, so ${n !== 1 ? "they" : "it"} can't have a meet-up point: ${names}. `;

  const link = document.createElement("a");
  link.href = `/oversight/tools/timelines?dayId=${encodeURIComponent(dayId)}`;
  link.textContent = "Add locations on Timelines";

  note.append(icon, text, link);
  return note;
}

/**
 * A TIME value from the API (an epoch-anchored ISO string or "HH:MM:SS")
 * as "HH:MM", or "" when missing.
 *
 * @param {string|null|undefined} raw
 * @returns {string}
 */
function _hhmm(raw) {
  if (!raw) return "";
  const s = String(raw);
  if (s.includes("T")) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  }
  return s.slice(0, 5);
}

/**
 * Populate the event type filter dropdown from all loaded data, keeping the
 * current choice. Built with option elements (type names are data).
 *
 * @returns {void}
 */
function _updateEventFilter() {
  const select = /** @type {HTMLSelectElement|null} */ (
    document.getElementById("rvEventFilter")
  );
  if (!select) return;

  const types = new Set();
  for (const rows of _dayData.values()) {
    for (const r of rows) {
      if (r.event_type_name) types.add(r.event_type_name);
    }
  }

  const current = select.value;
  const options = [new Option("All types", "")];
  for (const t of [...types].sort()) {
    options.push(new Option(t, t, false, t === current));
  }
  select.replaceChildren(...options);
}

/**
 * Re-render every open, loaded day (after a filter changes).
 *
 * @returns {void}
 */
function _rerenderOpenDays() {
  for (const dayId of _loadedDays) {
    const body = document.getElementById(`rvDay-${dayId}`);
    if (body && !body.classList.contains("d-none")) {
      _renderDay(dayId);
    }
  }
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
      _rerenderOpenDays();
    });
  }

  // Meet-up point filter (all / has a point / no point yet)
  const pointEl = document.getElementById("rvPointFilter");
  if (pointEl) {
    pointEl.addEventListener("change", () => {
      const v = pointEl.value;
      _pointFilter = v === "set" || v === "missing" ? v : "";
      _rerenderOpenDays();
    });
  }

  // Dismiss RV panel on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") dismissRendezvousPanel();
  });
});
