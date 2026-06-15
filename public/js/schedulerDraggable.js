/**
 * @file schedulerDraggable.js
 * @description Drag-and-drop wrapper for the volunteer scheduler.
 * Wraps the agnostic-draggable UMD library (window.agnosticDraggable),
 * manages draggable name pills and droppable shift slots, and enforces
 * role and department drop guards.
 *
 * Depends on agnostic-draggable.js being loaded as a UMD script before
 * this module executes (i.e. before scheduler.js is imported).
 */

const { Draggable, Droppable } = window.agnosticDraggable;

import { getConflicts } from './schedulerConflicts.js';



// ─────────────────────────────────────────────
//  Module state
// ─────────────────────────────────────────────

/** Prevents double-binding the same element as a draggable. @type {WeakSet<Element>} */
const boundDraggables = new WeakSet();

/** Prevents double-binding the same element as a droppable. @type {WeakSet<Element>} */
const boundDroppables = new WeakSet();

/**
 * Volunteer roster used by drop guards. Populated via setVolunteers()
 * once /api/scheduler/volunteers resolves.
 * @type {Array<object>}
 */
let volunteers = [];

// ─────────────────────────────────────────────
//  Role oversight structure(mirrors src/config/roles.js)
// ─────────────────────────────────────────────

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
 * Minimum role level required to occupy each named slot type.
 * keyman slots require KEYMAN+; keyman_asst slots accept any role.
 * @type {Record<string, number>}
 */
const MIN_ROLE_FOR_SLOT = {
  keyman: ROLE_LEVEL.KEYMAN,
  keyman_asst: ROLE_LEVEL.NON_REGISTERED,
};

/**
 * Maps department keys to the crew flag property on a volunteer's
 * crews object. The API already uses the department key as the property
 * name, so this is an explicit pass-through for clarity.
 * @type {Record<string, string>}
 */
const DEPT_CREW_KEY = {
  lots_and_garages: "lots_and_garages",
  signs: "signs",
  security: "security",
  dropoff_pickup: "dropoff_pickup",
  mobile_support: "mobile_support",
};

// ─────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────

/**
 * Store the volunteer roster for use by drop guards.
 * Must be called after /api/scheduler/volunteers resolves.
 *
 * @param {Array<object>} data
 * @returns {void}
 */
export function setVolunteers(data) {
  volunteers = Array.isArray(data) ? data : [];
}

/**
 * Bind Draggable behaviour to an element. No-ops if already bound or null.
 *
 * @param {Element} el
 * @param {object} [options]
 * @param {object} [handlers]
 * @returns {object|undefined}
 */
export function makeDraggable(
  el,
  options = { revert: "invalid", distance: 5 },
  handlers = {},
) {
  if (!el || boundDraggables.has(el)) return;
  boundDraggables.add(el);
  return new Draggable(el, options, handlers);
}

/**
 * Bind Droppable behaviour to an element. Merges in the canDrop guard so
 * all drop zones automatically enforce role and department eligibility.
 * No-ops if already bound or null.
 *
 * @param {Element} el
 * @param {object} [options]
 * @param {object} [handlers]
 * @returns {object|undefined}
 */
export function makeDroppable(el, options = {}, handlers = {}) {
  if (!el || boundDroppables.has(el)) return;
  boundDroppables.add(el);

  const mergedOptions = {
    ...options,
    accept: (draggable) => canDrop(draggable, el),
  };

  return new Droppable(el, mergedOptions, handlers);
}

/**
 * Remove the draggable binding record for an element so it can be
 * rebound after a drop moves it to a new DOM parent.
 *
 * @param {Element} el
 * @returns {void}
 */
export function unbindDraggable(el) {
  boundDraggables.delete(el);
}

/**
 * Initialise all name pills currently inside #name-pool as draggables
 * and bind #name-pool itself as a return-to-pool droppable.
 * Called after the volunteer pool has been rendered into the DOM.
 *
 * @returns {void}
 */
export function initPoolPills() {
  document.querySelectorAll("#name-pool .name-pill").forEach((pill) => {
    makeDraggable(
      pill,
      {
        revert: "invalid",
        distance: 5,
        helper: "clone",
        appendTo: "body",
        cursorAt: { left: 20, top: 15 },
      },
      {
        "drag:start": onDragStart,
        "drag:stop": onDragStop,
      },
    );
  });

  makeDroppable(
    document.getElementById("name-pool"),
    {},
    { "droppable:drop": onReturnToPool },
  );
}

// ─────────────────────────────────────────────
//  Drag event handlers
// ─────────────────────────────────────────────

/**
 * Fired when a drag begins. Sizes the clone helper to match the pill
 * and applies the dragging visual state.
 *
 * @param {object} event - agnostic-draggable drag:start event.
 * @returns {void}
 */
export function onDragStart(event) {
  const pill = event.source;
  const helper = event.helper;

  if (helper !== pill) {
    helper.style.width = `${pill.offsetWidth}px`;
    helper.classList.add("pill-drag-helper");

  }

  pill.classList.add("pill-dragging");
}

/**
 * Fired when a drag ends regardless of outcome.
 *
 * @param {object} event - agnostic-draggable drag:stop event.
 * @returns {void}
 */
export function onDragStop(event) {
  event.source.classList.remove("pill-dragging");
}

/**
 * Fired when a pill is accepted by a shift slot dropzone.
 * Moves the pill into the slot, clears library-applied inline styles,
 * then destroys and rebinds the draggable so it can be moved again.
 *
 * @param {object} event - agnostic-draggable droppable:drop event.
 * @returns {void}
 */
export function onDrop(event) {
  const pill = event.draggable.element;
  const dz   = _resolveDropTarget(pill, event.droppable.element);

  if (pill.classList.contains('in-pool')) {
    // ── Pool pill → DZ: leave original in pool, place a clone in the slot ──
    const clone = _clonePill(pill);
    dz.appendChild(clone);
    _resetPillTransform(clone);

    makeDraggable(
      clone,
      { revert: 'invalid', distance: 5, helper: 'clone', appendTo: 'body', cursorAt: { left: 20, top: 15 } },
      { 'drag:start': onDragStart, 'drag:stop': onDragStop },
    );

    document.dispatchEvent(new CustomEvent('scheduler:slotAssigned', {
      detail: { pill: clone, dz, record: true },
    }));
  } else {
    // ── Slot pill (clone) → different DZ: move the clone ─────────────
    const fromDz = pill.parentElement?.classList.contains('scheduler-dropzone')
      ? pill.parentElement : null;

    pill.classList.remove('pill-dragging');
    dz.appendChild(pill);
    _resetPillTransform(pill);

    event.draggable.destroy();
    unbindDraggable(pill);

    makeDraggable(
      pill,
      { revert: 'invalid', distance: 5, helper: 'clone', appendTo: 'body', cursorAt: { left: 20, top: 15 } },
      { 'drag:start': onDragStart, 'drag:stop': onDragStop },
    );

    // Delay the DB delete until after the conflict modal resolves.
    // slotAssigned handler coordinates both unassign + assign in one
    // atomic sequence once the user makes a decision.
    if (fromDz) {
      document.dispatchEvent(new CustomEvent('scheduler:slotUnassigned', {
        detail: { pill, fromDz, record: false },
      }));
    }
    document.dispatchEvent(new CustomEvent('scheduler:slotAssigned', {
      detail: { pill, dz, record: true, fromDz: fromDz || null },
    }));
  }
}

/**
 * Fired when a pill is dropped back onto #name-pool.
 * Returns the pill to the pool and restores the in-pool visual state.
 *
 * @param {object} event - agnostic-draggable droppable:drop event.
 * @returns {void}
 */
export function onReturnToPool(event) {
  const pill = event.draggable.element;

  if (pill.classList.contains('in-pool')) {
    // ── Pool pill dropped back on pool — just re-settle it ────────────
    pill.classList.remove('pill-dragging');
    _resetPillTransform(pill);
    event.draggable.destroy();
    unbindDraggable(pill);
    makeDraggable(
      pill,
      { revert: 'invalid', distance: 5, helper: 'clone', appendTo: 'body', cursorAt: { left: 20, top: 15 } },
      { 'drag:start': onDragStart, 'drag:stop': onDragStop },
    );
    return;
  }

  // ── Slot pill (clone) dropped on pool — remove the clone ─────────
  const fromDz = pill.parentElement?.classList.contains('scheduler-dropzone')
    ? pill.parentElement : null;

  event.draggable.destroy();
  unbindDraggable(pill);
  pill.remove();

  document.dispatchEvent(new CustomEvent('scheduler:slotUnassigned', {
    detail: { pill, fromDz, record: fromDz !== null },
  }));
}

// ─────────────────────────────────────────────
//  Drop guards
// ─────────────────────────────────────────────

/**
 * Determine whether a dragged pill may be dropped on a given drop zone.
 * Two independent checks run in order — either can veto the drop:
 *
 * 1. **Role check** — if the drop zone has `data-role`, the volunteer's
 *    role must meet the minimum level defined in MIN_ROLE_FOR_SLOT.
 * 2. **Department check** — if the drop zone is inside a
 *    `[data-department]` container, the volunteer must have the
 *    matching crew flag set to true.
 *
 * @param {Element} pill - The draggable source element.
 * @param {Element} dz   - The candidate droppable element.
 * @returns {boolean}
 */
function canDrop(pill, dz) {
  const targetDz = _resolveDropTarget(pill, dz);

  // ── Occupied check — if redirect failed the target is still full ────────
  if (
    targetDz.classList.contains("scheduler-dropzone") &&
    targetDz.querySelector(".name-pill")
  )
    return false;

  // ── Shift-conflict check — hard block non-security shift-to-shift overlaps ──
  // Blackout conflicts (dzEl === null) are allowed through and handled post-drop.
  // Security dept is exempt — overlapping coverage shifts are by design.
  const dzStart = Number(targetDz.dataset.shiftStartMins);
  const dzEnd = Number(targetDz.dataset.shiftEndMins);
  if (dzStart > 0 && dzEnd > 0) {
    const targetDept = targetDz.closest("[data-department]")?.dataset.department;
    if (targetDept !== "security") {
      const volId = Number(pill.dataset.id);
      const fromDz = pill.classList.contains("in-pool")
        ? null
        : pill.parentElement;
      const shiftConflicts = getConflicts(volId, dzStart, dzEnd, fromDz).filter(
        (c) => c.dzEl !== null,
      );
      if (shiftConflicts.length > 0) return false;
    }
  }

  // ── Role check ──────────────────────────────────────────────────────
  const slotRole = targetDz.dataset.role;
  if (slotRole) {
    const minLevel = MIN_ROLE_FOR_SLOT[slotRole] ?? 0;
    const volLevel =
      ROLE_LEVEL[String(pill.dataset.role || "").toUpperCase()] ?? 0;
    if (volLevel < minLevel) return false;
  }

  // ── Department check ─────────────────────────────────────────────────
  const dept = targetDz.closest("[data-department]")?.dataset.department;
  if (!dept) return true;

  const crewKey = DEPT_CREW_KEY[dept];
  if (!crewKey) return true;

  const volId = Number(pill.dataset.id);
  const volRow = volunteers.find((v) => v.id === volId);

  return Boolean(volRow?.crews?.[crewKey]);
}

// ─────────────────────────────────────────────
//  Auto-routing helpers
// ─────────────────────────────────────────────

/**
 * Find the first empty volunteer drop zone in the same shift as the
 * given DZ.  Walks sibling `.scheduler-dropzone[data-slot-type="volunteer"]`
 * elements and returns the first one with no `.name-pill` child.
 *
 * @param {Element} anyDz - Any drop zone inside the target shift.
 * @returns {Element|null} The first available volunteer DZ, or null.
 */
function _findNextEmptyVolunteerDz(anyDz) {
  const area = anyDz.closest(".sched-dropzone-area");
  if (!area) return null;
  const dzs = area.querySelectorAll(
    '.scheduler-dropzone[data-slot-type="volunteer"]',
  );
  for (const dz of dzs) {
    if (!dz.querySelector(".name-pill")) return dz;
  }
  return null;
}

/**
 * Determine the actual target DZ for a drop.  Returns the original DZ
 * unchanged when it is empty and the volunteer qualifies for it.
 *
 * Redirects to the first empty volunteer DZ in the same shift when:
 *  - the hovered DZ already contains a pill, **or**
 *  - the hovered DZ is a KM/KA slot the volunteer's role cannot fill.
 *
 * Falls back to the original DZ if no empty volunteer slot exists
 * (subsequent canDrop checks will reject it).
 *
 * @param {Element} pill - The dragged pill element.
 * @param {Element} dz   - The hovered droppable element.
 * @returns {Element}    The resolved target DZ.
 */
function _resolveDropTarget(pill, dz) {
  if (!dz.classList.contains("scheduler-dropzone")) return dz;

  const isOccupied = Boolean(dz.querySelector(".name-pill"));

  let roleBlocked = false;
  if (!isOccupied) {
    const slotRole = dz.dataset.role;
    if (slotRole) {
      const minLevel = MIN_ROLE_FOR_SLOT[slotRole] ?? 0;
      const volLevel =
        ROLE_LEVEL[String(pill.dataset.role || "").toUpperCase()] ?? 0;
      roleBlocked = volLevel < minLevel;
    }
  }

  if (isOccupied || roleBlocked) {
    return _findNextEmptyVolunteerDz(dz) || dz;
  }
  return dz;
}

// ─────────────────────────────────────────────
//  Internal helpers
// ─────────────────────────────────────────────
/**
 * Shorten the first name on a DZ pill clone to an initial + period.
 * Keeps last name in full so the slot is still readable at a glance.
 * e.g. "Jonathan Smith" → "J. Smith"
 *
 * @param {HTMLElement} pill
 * @returns {void}
 */
/**
 * Shorten the displayed name on a DZ pill clone.
 * - If the volunteer has a suffix: abbreviate first name to initial
 *   and append the suffix — e.g. "Jonathan Smith Jr."  → "J. Smith Jr."
 * - If no suffix: show the full first name — no abbreviation needed.
 *
 * @param {HTMLElement} pill
 * @returns {void}
 */
function _abbreviatePillName(pill) {
  const nameEl = pill.querySelector('.pill-name');
  if (!nameEl) return;
  const suffix = pill.dataset.suffix || '';
  const parts  = nameEl.textContent.trim().split(' ');
  if (parts.length < 2) return;
  const abbreviated = `${parts[0].charAt(0)}. ${parts.slice(1).join(' ')}`;
  nameEl.textContent = suffix ? `${abbreviated} ${suffix}` : abbreviated;
}
/**
 * Clear the inline position and transform styles that agnostic-draggable
 * applies during a drag so the pill renders naturally in its new parent.
 *
 * @param {Element} pill
 * @returns {void}
 */
function _resetPillTransform(pill) {
  pill.style.position = "";
  pill.style.left = "";
  pill.style.top = "";
  pill.style.transform = "";
  pill.style.width = "";
}

/**
 * Create a lightweight clone of a pool pill suitable for placing in a DZ.
 * Strips the in-pool class and any existing assignment badge so DZ pills
 * start clean.
 *
 * @param {HTMLElement} poolPill
 * @returns {HTMLElement}
 */
function _clonePill(poolPill) {
  const clone = poolPill.cloneNode(true);
  clone.classList.remove('in-pool');
  clone.classList.remove('pill-dragging');
  clone.querySelector('.pill-assign-badge')?.remove();
  _abbreviatePillName(clone);
  return clone;
}
