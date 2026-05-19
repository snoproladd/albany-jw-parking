/**
 * @file schedulerConflicts.js
 * @description Per-volunteer time-conflict tracker for the scheduler.
 *
 * Maintains a map of volunteerId → active assignments (each with a DZ
 * reference and shift time window) so that overlapping drops can be
 * detected and prevented before they reach the database.
 *
 * Design note — future blackout times:
 * Blackouts are just time-range entries with no DZ element (dzEl = null).
 * When that feature is added, pre-load them via trackAssign() at day-load
 * time. hasConflict() will catch them automatically because the overlap
 * logic is purely time-based; the null dzEl is simply never excluded.
 */

/**
 * @typedef {{ dzEl: HTMLElement|null, shiftStart: number, shiftEnd: number, reason: string|null }} Assignment
 */

/** @type {Map<number, Set<Assignment>>} volunteerId → active assignments */
const _map = new Map();

// ─────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────

/**
 * Record a time-window assignment for a volunteer.
 * Called on every drop (drag, undo, redo, silent load).
 *
 * @param {number}          volunteerId
 * @param {number}          shiftStart  - minutes from midnight
 * @param {number}          shiftEnd    - minutes from midnight
 * @param {HTMLElement|null} dzEl       - the dropzone element, or null for blackouts
 * @returns {void}
 */
export function trackAssign(volunteerId, shiftStart, shiftEnd, dzEl, reason = null) {
    if (!_map.has(volunteerId)) _map.set(volunteerId, new Set());
    _map.get(volunteerId).add({ dzEl, shiftStart, shiftEnd, reason });
}

/**
 * Remove a time-window assignment identified by its dropzone element.
 * Called on every return-to-pool (drag back, undo, redo).
 *
 * @param {HTMLElement} dzEl
 * @returns {void}
 */
export function trackUnassign(dzEl) {
    for (const assignments of _map.values()) {
        for (const a of assignments) {
            if (a.dzEl === dzEl) { assignments.delete(a); return; }
        }
    }
}

/**
 * Return true if the volunteer already has an assignment whose time window
 * overlaps [shiftStart, shiftEnd).
 *
 * Pass excludeDz when checking a move within the grid (from one slot to
 * another) so the volunteer's current slot is not counted as a conflict.
 *
 * @param {number}          volunteerId
 * @param {number}          shiftStart
 * @param {number}          shiftEnd
 * @param {HTMLElement|null} [excludeDz] - DZ to skip during overlap check
 * @returns {boolean}
 */
export function hasConflict(volunteerId, shiftStart, shiftEnd, excludeDz = null) {
    const assignments = _map.get(volunteerId);
    if (!assignments || assignments.size === 0) return false;
    for (const a of assignments) {
        if (excludeDz !== null && a.dzEl === excludeDz) continue;
        // Overlap: not (a ends at/before b starts, or a starts at/after b ends)
        if (!(a.shiftEnd <= shiftStart || a.shiftStart >= shiftEnd)) return true;
    }
    return false;
}

/**
 * Return the total number of active assignments for a volunteer.
 * Used to drive the pool-pill badge count.
 *
 * @param {number} volunteerId
 * @returns {number}
 */
export function assignmentCount(volunteerId) {
    const assignments = _map.get(volunteerId);
    if (!assignments) return 0;
    let count = 0;
    for (const a of assignments) {
        if (a.dzEl !== null) count++;
    }
    return count;
}

/**
 * Clear all tracked assignments.
 * Call whenever the active convention day changes.
 *
 * @returns {void}
 */
export function clearAll() {
    _map.clear();
}

/**
 * Remove a blackout entry (dzEl === null) matching the given volunteer
 * and time range. Called when a blackout is deleted via the panel.
 *
 * @param {number} volunteerId
 * @param {number} startMins
 * @param {number} endMins
 * @returns {void}
 */
/**
 * Return all assignments that conflict with a given time window.
 * Used to populate the conflict modal before confirming a drop.
 *
 * @param {number} volunteerId
 * @param {number} shiftStart
 * @param {number} shiftEnd
 * @returns {Array<{ dzEl: HTMLElement|null, shiftStart: number, shiftEnd: number }>}
 */
/**
 * Return all assignments that overlap a given time window.
 * Pass excludeDz to skip the slot that was just filled (avoids
 * counting the new assignment as a conflict with itself).
 *
 * @param {number}          volunteerId
 * @param {number}          shiftStart
 * @param {number}          shiftEnd
 * @param {HTMLElement|null} [excludeDz]
 * @returns {Array<{ dzEl: HTMLElement|null, shiftStart: number, shiftEnd: number }>}
 */
export function getConflicts(volunteerId, shiftStart, shiftEnd, excludeDz = null) {
    const assignments = _map.get(volunteerId);
    if (!assignments || assignments.size === 0) return [];
    const out = [];
    for (const a of assignments) {
        if (excludeDz !== null && a.dzEl === excludeDz) continue;
        if (!(a.shiftEnd <= shiftStart || a.shiftStart >= shiftEnd)) {
            out.push(a);
        }
    }
    return out;
}

/**
 * Remove a blackout entry (dzEl === null) matching the given volunteer
 * and time range. Called when a blackout is deleted via the panel.
 *
 * @param {number} volunteerId
 * @param {number} startMins
 * @param {number} endMins
 * @returns {void}
 */
export function untrackBlackout(volunteerId, startMins, endMins) {
    const assignments = _map.get(volunteerId);
    if (!assignments) return;
    for (const a of assignments) {
        if (a.dzEl === null && a.shiftStart === startMins && a.shiftEnd === endMins) {
            assignments.delete(a);
            return;
        }
    }
}
