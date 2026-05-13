/**
 * @file schedulerDomEvents.js
 * @description Delegated event bindings for the volunteer scheduler page.
 * Translates raw DOM events into typed custom events on document so that
 * other modules (schedulerDomActions, schedulerDraggable) can react without
 * coupling directly to DOM elements.
 *
 * Custom events emitted:
 *  - 'scheduler:dayChange'  — convention day picker changed
 *                             detail: { dayId: number|null }
 *  - 'filter:select'        — a volunteer pool filter changed
 *                             detail: { id: string, value: string }
 */

// ─────────────────────────────────────────────
//  Public entry point
// ─────────────────────────────────────────────

/**
 * Initialise all delegated event listeners for the scheduler page.
 * Call once after DOMContentLoaded.
 *
 * @returns {void}
 */
export function initDomEvents() {
    document.addEventListener('change', _onChange);
    document.addEventListener('input',  _onInput);
    document.addEventListener('click',  _onClick);
}

// ─────────────────────────────────────────────
//  Handlers
// ─────────────────────────────────────────────

/**
 * Delegated change handler. Routes to the appropriate emitter based on
 * the element's id or data-action attribute.
 *
 * @param {Event} event
 * @returns {void}
 */
function _onChange(event) {
  const target = /** @type {HTMLElement} */ (event.target);
  if (!target) return;

  // Convention day picker
  if (target.id === "dayPicker") {
    const dayId = target.value ? Number(target.value) : null;
    _emit("scheduler:dayChange", { dayId });
    return;
  }

  // Volunteer pool filters
  if (target.dataset.action === "filter") {
    _emit("filter:select", { id: target.id, value: target.value });
    return;
  }
}

/**
 * Delegated input handler. Handles live-search on the volunteer pool.
 *
 * @param {Event} event
 * @returns {void}
 */
function _onInput(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    if (!target) return;

    if (target.dataset.action === 'search') {
        _emit('filter:select', { id: target.id, value: target.value });
    }
}

/**
 * Delegated click handler. Reserved for future scheduler toolbar actions.
 *
 * @param {Event} event
 * @returns {void}
 */
function _onClick(event) {
  const target = /** @type {HTMLElement} */ (event.target);
  if (!target) return;

  // Future: save-schedule button, clear-day button, etc.
}

// ─────────────────────────────────────────────
//  Internal helpers
// ─────────────────────────────────────────────

/**
 * Dispatch a bubbling CustomEvent on document.
 *
 * @param {string} type   - Event type string.
 * @param {object} detail - Payload attached to event.detail.
 * @returns {void}
 */
function _emit(type, detail) {
  document.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
}
