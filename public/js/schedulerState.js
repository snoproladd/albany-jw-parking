/**
 * @file schedulerState.js
 * @description Remembers the scheduler's selected convention day and the
 * volunteer pool's search, filters and sort for the browser tab, so leaving
 * the page (back / forward, reload, a menu link) and coming back restores
 * them.
 *
 * Stored in sessionStorage (one tab only, cleared when the tab closes). It
 * listens to the page's own custom events, emitted by schedulerDomEvents.js:
 *   'scheduler:dayChange'  detail: { dayId: number|null }
 *   'filter:select'        detail: { id: string, value: string }
 *
 * restoreSchedulerState() puts the saved values back. It sets the pool
 * controls first, then selects the saved day: the pool applies its filters
 * once the day's data has loaded, so nothing else needs to run. A saved
 * value that no longer exists (a removed day or position) is ignored.
 *
 * Storage can be unavailable (private mode, blocked storage); every access
 * is guarded, and the page then behaves as it did before.
 */

/** sessionStorage key (versioned, in case the shape changes). */
const STORAGE_KEY = "scheduler.state.v1";

/** The pool controls whose values are remembered, by element id. */
const POOL_CONTROL_IDS = Object.freeze([
    "vol-search",
    "vol-rank-filter",
    "vol-department-filter",
    "vol-usage-filter",
    "vol-gender-filter",
    "vol-sort-order",
]);

/**
 * @typedef {Object} SchedulerState
 * @property {number|null} dayId
 * @property {Record<string, string>} controls  Pool control values by element id.
 */

/**
 * Read the saved state, or an empty one.
 *
 * @returns {SchedulerState}
 */
function readState() {
    try {
        const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "null");
        if (parsed && typeof parsed === "object") {
            return {
                dayId: Number.isInteger(parsed.dayId) ? parsed.dayId : null,
                controls: parsed.controls && typeof parsed.controls === "object" ? parsed.controls : {},
            };
        }
    } catch {
        /* unavailable or corrupt: start empty */
    }
    return { dayId: null, controls: {} };
}

/**
 * Save the state.
 *
 * @param {SchedulerState} state
 * @returns {void}
 */
function writeState(state) {
    try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        /* unavailable or full: nothing is remembered */
    }
}

/**
 * Whether a select offers the given value.
 *
 * @param {HTMLSelectElement} select
 * @param {string} value
 * @returns {boolean}
 */
function hasOption(select, value) {
    return Array.from(select.options).some((o) => o.value === value);
}

/**
 * Start saving the day and pool controls whenever they change.
 * Call once on page load.
 *
 * @returns {void}
 */
export function initSchedulerState() {
    document.addEventListener("scheduler:dayChange", (e) => {
        const dayId = /** @type {CustomEvent} */ (e).detail?.dayId ?? null;
        const state = readState();
        state.dayId = Number.isInteger(dayId) ? dayId : null;
        writeState(state);
    });

    document.addEventListener("filter:select", (e) => {
        const { id, value } = /** @type {CustomEvent} */ (e).detail || {};
        if (!POOL_CONTROL_IDS.includes(id)) return;
        const state = readState();
        state.controls[id] = String(value ?? "");
        writeState(state);
    });
}

/**
 * Put the saved pool controls back, then select the saved day (which loads
 * it as if picked by hand).
 *
 * @returns {boolean}  True when a saved day was selected; the caller then
 *                     skips selecting today's convention day.
 */
export function restoreSchedulerState() {
    const state = readState();

    for (const id of POOL_CONTROL_IDS) {
        const value = state.controls[id];
        if (typeof value !== "string") continue;
        const el = document.getElementById(id);
        if (el instanceof HTMLSelectElement) {
            if (hasOption(el, value)) el.value = value;
        } else if (el instanceof HTMLInputElement) {
            el.value = value;
        }
    }

    const picker = document.getElementById("dayPicker");
    if (!(picker instanceof HTMLSelectElement) || state.dayId === null) return false;
    const value = String(state.dayId);
    if (!hasOption(picker, value)) return false;

    picker.value = value;
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
}
