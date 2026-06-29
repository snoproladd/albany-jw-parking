/**
 * @file schedulerHistory.js
 * @description Undo/redo command stack and API persistence for the
 * drag-and-drop scheduler.
 *
 * Handles all saves and deletes for shift_slot_assignments, maintains
 * an undo/redo stack, and exposes helpers to move pills between
 * dropzones and the volunteer pool without triggering new history entries.
 *
 * Depends on:
 *  - schedulerDraggable.js (makeDraggable, unbindDraggable,
 *                           onDragStart, onDragStop)
 */

import {
  makeDraggable,
  unbindDraggable,
  onDragStart,
  onDragStop,
} from "./schedulerDraggable.js";

// ─────────────────────────────────────────────
//  Module state
// ─────────────────────────────────────────────

/**
 * @typedef {{ type: 'assign'|'unassign', volunteerId: number, dz: HTMLElement, dbId: number }} HistoryCmd
 */

/** @type {HistoryCmd[]} */
let _undoStack = [];

/** @type {HistoryCmd[]} */
let _redoStack = [];

/** @type {HTMLButtonElement|null} */
let _undoBtn = null;

/** @type {HTMLButtonElement|null} */
let _redoBtn = null;

/** Convention day currently loaded — required when re-saving during undo/redo. @type {number|null} */
let _currentDayId = null;

// ─────────────────────────────────────────────
//  Initialisation
// ─────────────────────────────────────────────

/**
 * Wire the undo/redo buttons and reset stale history from a previous day.
 * Call each time a new day banner is rendered.
 *
 * @param {HTMLButtonElement} undoEl
 * @param {HTMLButtonElement} redoEl
 * @returns {void}
 */
export function initHistoryButtons(undoEl, redoEl) {
  _undoBtn = undoEl;
  _redoBtn = redoEl;
  _undoBtn.addEventListener("click", undo);
  _redoBtn.addEventListener("click", redo);
  _syncButtons();
}

/**
 * Set the active convention day ID used when saving new assignments.
 * Also clears the undo/redo history for the previous day.
 *
 * @param {number|null} dayId
 * @returns {void}
 */
export function setCurrentDay(dayId) {
  _currentDayId = dayId;
  clearHistory();
}

/**
 * Discard all undo/redo history. Call whenever the current day changes.
 *
 * @returns {void}
 */
export function clearHistory() {
  _undoStack = [];
  _redoStack = [];
  _syncButtons();
}

// ─────────────────────────────────────────────
//  Public record helpers
// ─────────────────────────────────────────────

/**
 * Save a new slot assignment to the DB and push an undo entry.
 * The pill must already be in the dropzone before this is called.
 *
 * @param {HTMLElement} pill
 * @param {HTMLElement} dz
 * @returns {Promise<void>}
 */
export async function recordAssign(pill, dz, note = null) {
  const volunteerId  = Number(pill.dataset.id);
  const assignmentId = Number(dz.dataset.assignmentId);
  const slotType     = dz.dataset.slotType;
  const slotIndex    = Number(dz.dataset.slotIndex);

  if (!assignmentId || !volunteerId || !slotType || isNaN(slotIndex)) return;

  try {
    const id = await _apiSave({
      schedule_assignment_id: assignmentId,
      convention_day_id:      _currentDayId,
      volunteer_id:           volunteerId,
      slot_type:              slotType,
      slot_index:             slotIndex,
      note,
    });
    dz.dataset.slotDbId = String(id);
    _redoStack = [];
    _undoStack.push({ type: 'assign', volunteerId, dz, dbId: id, note });
    _syncButtons();
  } catch (err) {
    console.error('[scheduler] recordAssign error:', err);
  }
}

/**
 * Delete a slot assignment from the DB and push an undo entry.
 * The pill must already be back in the pool before this is called.
 *
 * @param {HTMLElement} pill
 * @param {HTMLElement} fromDz - The dropzone the pill was removed from.
 * @returns {Promise<void>}
 */
export async function recordUnassign(pill, fromDz) {
  const dbId = Number(fromDz.dataset.slotDbId);
  if (!dbId) return;

  delete fromDz.dataset.slotDbId;

  try {
    await _apiDelete(dbId);
    _redoStack = [];
    _undoStack.push({
      type: "unassign",
      volunteerId: Number(pill.dataset.id),
      dz: fromDz,
      dbId,
    });
    _syncButtons();
  } catch (err) {
    console.error("[scheduler] recordUnassign error:", err);
  }
}

/**
 * Place a pill in a dropzone without recording any history or calling the API.
 * Used when loading existing assignments from the DB on day change.
 *
 * @param {HTMLElement} pill
 * @param {HTMLElement} dz
 * @param {number}      dbId - The existing shift_slot_assignments.id.
 * @returns {void}
 */
export function silentlyPlacePill(pill, dz, dbId, note = null) {
  _movePillToDz(pill, dz, note);
  dz.dataset.slotDbId = String(dbId);
}

// ─────────────────────────────────────────────
//  Undo / Redo
// ─────────────────────────────────────────────

/**
 * Undo the most recent assignment or unassignment.
 *
 * @returns {Promise<void>}
 */
export async function undo() {
  const cmd = _undoStack.pop();
  if (!cmd) return;

  if (cmd.type === "assign") {
    await _apiDelete(cmd.dbId);
    const pill = cmd.dz.querySelector(".name-pill");
    if (pill) _movePillToPool(pill);
    delete cmd.dz.dataset.slotDbId;
  } else {
    const pill = document.querySelector(
      `#name-pool .name-pill[data-id="${cmd.volunteerId}"]`,
    );
    if (pill) {
      try {
        const newId = await _apiSave({
          schedule_assignment_id: Number(cmd.dz.dataset.assignmentId),
          convention_day_id: _currentDayId,
          volunteer_id: cmd.volunteerId,
          slot_type: cmd.dz.dataset.slotType,
          slot_index: Number(cmd.dz.dataset.slotIndex),
        });
        cmd.dbId = newId;
        cmd.dz.dataset.slotDbId = String(newId);
        _movePillToDz(pill, cmd.dz);
      } catch (err) {
        console.error("[scheduler] undo unassign error:", err);
        _undoStack.push(cmd);
        _syncButtons();
        return;
      }
    }
  }

  _redoStack.push(cmd);
  _syncButtons();
}

/**
 * Re-apply the most recently undone command.
 *
 * @returns {Promise<void>}
 */
export async function redo() {
  const cmd = _redoStack.pop();
  if (!cmd) return;

  if (cmd.type === "assign") {
    const pill = document.querySelector(
      `#name-pool .name-pill[data-id="${cmd.volunteerId}"]`,
    );
    if (pill) {
      try {
        const newId = await _apiSave({
          schedule_assignment_id: Number(cmd.dz.dataset.assignmentId),
          convention_day_id: _currentDayId,
          volunteer_id: cmd.volunteerId,
          slot_type: cmd.dz.dataset.slotType,
          slot_index: Number(cmd.dz.dataset.slotIndex),
        });
        cmd.dbId = newId;
        cmd.dz.dataset.slotDbId = String(newId);
        _movePillToDz(pill, cmd.dz);
      } catch (err) {
        console.error("[scheduler] redo assign error:", err);
        _redoStack.push(cmd);
        _syncButtons();
        return;
      }
    }
  } else {
    await _apiDelete(cmd.dbId);
    const pill = cmd.dz.querySelector(".name-pill");
    if (pill) _movePillToPool(pill);
    delete cmd.dz.dataset.slotDbId;
  }

  _undoStack.push(cmd);
  _syncButtons();
}

// ─────────────────────────────────────────────
//  DOM pill helpers
// ─────────────────────────────────────────────

/**
 * Move a pill into a dropzone, rebinding it as a draggable.
 *
 * @param {HTMLElement} pill
 * @param {HTMLElement} dz
 * @returns {void}
 */
function _movePillToDz(poolPill, dz, note = null) {
  // Pool pill stays in pool — clone goes into the dropzone
  const clone = _clonePillForDz(poolPill);
  if (note) clone.dataset.conflictNote = note;
  _resetPillTransform(clone);
  dz.appendChild(clone);
  makeDraggable(
    clone,
    {
      revert: "invalid",
      distance: 5,
      helper: "clone",
      appendTo: "body",
      cursorAt: { left: 20, top: 15 },
    },
    { "drag:start": onDragStart, "drag:stop": onDragStop },
  );
  document.dispatchEvent(
    new CustomEvent('scheduler:slotAssigned', {
      detail: { pill: clone, dz, record: false, note },
    }),
  );
}

/**
 * Move a pill back to the volunteer pool, rebinding it as a draggable.
 *
 * @param {HTMLElement} pill
 * @returns {void}
 */
function _movePillToPool(slotPill) {
  // Capture the DZ before removing from DOM
  const fromDz = slotPill.parentElement?.classList.contains('scheduler-dropzone')
      ? slotPill.parentElement
      : null;
  // Slot pill is a clone — just remove it; original pool pill is still in pool
  unbindDraggable(slotPill);
  slotPill.remove();
  document.dispatchEvent(
    new CustomEvent("scheduler:slotUnassigned", {
      detail: { pill: slotPill, fromDz, record: false },
    }),
  );
}

// ─────────────────────────────────────────────
//  API helpers
// ─────────────────────────────────────────────

/**
 * POST /api/scheduler/slots — persist a slot assignment.
 *
 * @param {object} data
 * @returns {Promise<number>} The new row id.
 */
async function _apiSave(data) {
  const res = await fetch('/api/scheduler/slots', {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'csrf-token':   _getCsrf(),
    },
    body: JSON.stringify(data),  // note is included when present in data
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Save failed");
  return json.id;
}

/**
 * DELETE /api/scheduler/slots/:id — remove a slot assignment.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
async function _apiDelete(id) {
  const res = await fetch(`/api/scheduler/slots/${id}`, {
    method: "DELETE",
    headers: { "csrf-token": _getCsrf() },
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Delete failed");
}

/**
 * Read the CSRF token from the page meta tag.
 *
 * @returns {string}
 */
function _getCsrf() {
  return document.querySelector('meta[name="csrf-token"]')?.content || "";
}

/**
 * Clear agnostic-draggable position overrides from a pill after a move.
 *
 * @param {HTMLElement} pill
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
 * Clone a pool pill for placement in a dropzone.
 * Removes the in-pool class and any badge so the slot copy starts clean.
 *
 * @param {HTMLElement} poolPill
 * @returns {HTMLElement}
 */
function _clonePillForDz(poolPill) {
  const clone = poolPill.cloneNode(true);
  clone.classList.remove('in-pool');
  clone.style.display = ''; // Clear any filter-applied display from pool pill
  clone.querySelector('.pill-assign-badge')?.remove();
  const nameEl = clone.querySelector('.pill-name');
  if (nameEl) {
    const suffix = clone.dataset.suffix || '';
    const parts  = nameEl.textContent.trim().split(' ');
    if (parts.length >= 2) {
      const abbreviated = `${parts[0].charAt(0)}. ${parts.slice(1).join(' ')}`;
      nameEl.textContent = suffix ? `${abbreviated} ${suffix}` : abbreviated;
    }
  }
  return clone;
}

// ─────────────────────────────────────────────
//  Button state
// ─────────────────────────────────────────────

/**
 * Enable or disable the undo/redo buttons to reflect stack state.
 *
 * @returns {void}
 */
function _syncButtons() {
  if (_undoBtn) _undoBtn.disabled = _undoStack.length === 0;
  if (_redoBtn) _redoBtn.disabled = _redoStack.length === 0;
}
