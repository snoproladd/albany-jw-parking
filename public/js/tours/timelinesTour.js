/**
 * @fileoverview timelinesTour.js
 * Shepherd.js mini-tours for the Timelines / Event Types page.
 *
 * Three tour paths:
 *   event-types        — /oversight/tools/timelines/event-types
 *   timelines-days     — /oversight/tools/timelines (no day open)
 *   timelines-sessions — /oversight/tools/timelines?dayId=X
 *
 * Modal forms are opened programmatically during each tour so overseers
 * can see every field. CSS in tours.css ensures modals appear above
 * Shepherd's overlay (z-index 10000) while the tooltip stays above both (10001).
 *
 * @module timelinesTour
 */

import {
    createTour,
    navButtons,
    startButtons,
    finishButtons,
} from './tourBase.js';

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensures the first session accordion panel is fully open.
 * Resolves immediately if already open.
 *
 * @returns {Promise<void>}
 */
function ensureFirstSessionOpen() {
    return new Promise((resolve) => {
        const firstCollapse = document.querySelector(
            '#timelineAccordion .accordion-collapse'
        );
        if (!firstCollapse) { resolve(); return; }
        if (firstCollapse.classList.contains('show')) { resolve(); return; }
        firstCollapse.addEventListener('shown.bs.collapse', resolve, { once: true });
        bootstrap.Collapse.getOrCreateInstance(firstCollapse).show();
    });
}

/**
 * Programmatically click a trigger button that opens a modal form,
 * then wait for the modal to fully animate in before resolving.
 * Used in beforeShowPromise so Shepherd positions the tooltip correctly.
 *
 * @param {string} btnSelector - CSS selector of the trigger button
 * @param {string} modalId     - ID of the modal element
 * @returns {Promise<void>}
 */
function clickToOpenModal(btnSelector, modalId) {
    return new Promise((resolve) => {
        const btn = document.querySelector(btnSelector);
        const el  = document.getElementById(modalId);
        if (!btn || !el) { resolve(); return; }
        if (el.classList.contains('show')) { resolve(); return; }
        el.addEventListener('shown.bs.modal', () => {
            el.classList.add('tour-preview');
            resolve();
        }, { once: true });
        btn.click();
    });
}

/**
 * Close a modal if it is currently open.
 * Safe to call when the modal is already closed.
 *
 * @param {string} modalId
 */
function closeTourModal(modalId) {
    const el = document.getElementById(modalId);
    if (el && el.classList.contains('show')) {
        el.classList.remove('tour-preview');
        bootstrap.Modal.getInstance(el)?.hide();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Types tour
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tour for the Event Types view.
 *
 * @returns {Shepherd.Tour}
 */
function buildEventTypesTour() {
    const tour     = createTour();
    const hasTypes = !!document.querySelector('table.table-hover.align-middle');

    tour.addStep({
        id: 'et-welcome',
        title: 'Event types — the first step',
        text: 'Event types are the categories every shift belongs to — things like "Gate Duty" or "Parking Assist." Create them here first. The color you assign will appear as a badge on every shift that uses the type throughout Timelines and the Scheduler.',
        buttons: startButtons(tour),
    });

    tour.addStep({
        id: 'et-add',
        title: 'Add an event type',
        text: 'This button opens the add form. Click <strong>Next</strong> and the tour will open it for you.',
        attachTo: { element: '#etAddBtn', on: 'bottom' },
        buttons: navButtons(tour),
    });

    tour.addStep({
        id: 'et-form',
        title: 'Event type form',
        text: 'Give it a short <strong>Name</strong> (required), an optional description, and a <strong>Color</strong>. When editing an existing type, an <strong>Active</strong> toggle appears — deactivate types no longer in use rather than deleting them to preserve history.',
        attachTo: { element: '#etFormPanel .modal-dialog', on: 'right' },
        beforeShowPromise() { return clickToOpenModal('#etAddBtn', 'etFormPanel'); },
        when: { hide() { closeTourModal('etFormPanel'); } },
        buttons: hasTypes ? navButtons(tour) : finishButtons(tour),
    });

    if (hasTypes) {
        tour.addStep({
            id: 'et-table',
            title: 'Your event types',
            text: 'Each row shows the color swatch, name, description, and active status. Inactive types are hidden from the shift builder but their history is preserved.',
            attachTo: { element: 'table.table-hover.align-middle', on: 'top' },
            buttons: navButtons(tour),
        });

        tour.addStep({
            id: 'et-edit',
            title: 'Edit an event type',
            text: 'The pen icon on any row opens the same form in edit mode, pre-filled with that type\'s data. Changes apply immediately across all shifts using that type.',
            attachTo: { element: '.et-edit-btn', on: 'left' },
            buttons: finishButtons(tour),
        });
    }

    return tour;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timelines — days tour (no day open)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tour for the Timelines view when no day is currently open.
 *
 * @returns {Shepherd.Tour}
 */
function buildTimelinesDaysTour() {
    const tour    = createTour();
    const hasDays = !!document.querySelector('#daysList .card');

    tour.addStep({
        id: 'tl-welcome',
        title: 'Building the timeline',
        text: 'The timeline has three tiers. At the top are <strong>Convention Days</strong>. Inside each day are <strong>Sessions</strong> (time blocks). Inside each session are <strong>Shifts</strong> (volunteer slots). Everything here feeds directly into the Scheduler.',
        buttons: startButtons(tour),
    });

    tour.addStep({
        id: 'tl-year',
        title: 'Convention year',
        text: 'All days, sessions, and shifts are tied to this year. Confirm the correct year is selected before adding anything.',
        attachTo: { element: '#yearPicker', on: 'bottom' },
        buttons: navButtons(tour),
    });

    tour.addStep({
        id: 'tl-add-day',
        title: 'Add a convention day',
        text: 'Click here to add each day of the convention. Click <strong>Next</strong> and the tour will open the form.',
        attachTo: { element: '#addDayBtn', on: 'bottom' },
        buttons: navButtons(tour),
    });

    tour.addStep({
        id: 'tl-day-form',
        title: 'Convention day form',
        text: 'Set a short <strong>Label</strong> (e.g. "Friday"), the <strong>Date</strong>, and the program start and end times. <strong>Schedulable</strong> controls whether this day appears in the Scheduler — uncheck it for meeting-only days that don\'t need volunteer shifts.',
        attachTo: { element: '#dayFormPanel .modal-dialog', on: 'right' },
        beforeShowPromise() { return clickToOpenModal('#addDayBtn', 'dayFormPanel'); },
        when: { hide() { closeTourModal('dayFormPanel'); } },
        buttons: hasDays ? navButtons(tour) : finishButtons(tour),
    });

    if (hasDays) {
        tour.addStep({
            id: 'tl-day-card',
            title: 'Convention day cards',
            text: 'Each day shows its label, date, and program times. The <strong>pen icon</strong> edits the day. The <strong>copy icon</strong> duplicates the entire day to a new date — sessions, shifts, and location assignments all come along.',
            attachTo: { element: '#daysList .card', on: 'bottom' },
            buttons: navButtons(tour),
        });

        tour.addStep({
            id: 'tl-manage',
            title: 'Open a day to continue',
            text: 'Click <strong>Manage Sessions &amp; Shifts</strong> on any day to open its sessions panel below. Open a day and start the tour again — the next tour covers sessions, shifts, and all the forms.',
            attachTo: { element: '#daysList .btn.btn-warning.w-100', on: 'top' },
            buttons: finishButtons(tour),
        });
    }

    return tour;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timelines — sessions + shifts tour (day open)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Comprehensive tour for the sessions and shifts tier.
 * Opens each form modal in sequence so the overseer can see every field.
 *
 * @returns {Shepherd.Tour}
 */
function buildTimelinesSessionsTour() {
    const tour = createTour();

    const hasAccordion  = !!document.getElementById('timelineAccordion');
    const hasShiftBtn   = !!document.querySelector('.add-shift-btn');
    const hasShiftCard  = !!document.querySelector('.shift-card');
    const hasInvitable  = !!document.querySelector('.shift-invitable-btn');
    const hasAssignBtn  = !!document.querySelector('.add-assignment-btn');
    const hasAssignment = !!document.querySelector('.assignment-badge');

    const steps = [];

    // ── Welcome ──────────────────────────────────────────────────────────────

    steps.push({
        id: 'tls-welcome',
        title: 'Tier 2: Sessions and shifts',
        text: 'You\'ve opened a convention day. Sessions are the time blocks; shifts are the volunteer slots inside each block. The tour will open each form automatically so you can see every field — nothing will be saved.',
        buttons: null,
    });

    // ── Sessions ─────────────────────────────────────────────────────────────

    steps.push({
        id: 'tls-add-session',
        title: 'Add a session',
        text: 'Sessions are the named time blocks of the day — "Morning A", "Afternoon B", etc. Click <strong>Next</strong> and the tour will open the form.',
        attachTo: { element: '#addSessionBtn', on: 'bottom' },
        buttons: null,
    });

    steps.push({
        id: 'tls-session-form',
        title: 'Session form',
        text: 'Set a <strong>Label</strong> (suggestions in the dropdown, or type your own), a <strong>Sort Order</strong> for display sequence, and start and end times. Editing an existing session opens the same form pre-filled — the <strong>Delete Session</strong> button also appears, which removes all shifts inside it.',
        attachTo: { element: '#sessionFormPanel .modal-dialog', on: 'right' },
        beforeShowPromise() { return clickToOpenModal('#addSessionBtn', 'sessionFormPanel'); },
        when: { hide() { closeTourModal('sessionFormPanel'); } },
        buttons: null,
    });

    // ── Sessions accordion ────────────────────────────────────────────────────

    if (hasAccordion) {
        steps.push({
            id: 'tls-accordion',
            title: 'Sessions accordion',
            text: 'Each session is an expandable panel. The header shows the name, time range, and how many shifts it contains. The first session is expanded by default after a page load.',
            attachTo: { element: '#timelineAccordion .accordion-header', on: 'top' },
            beforeShowPromise: ensureFirstSessionOpen,
            buttons: null,
        });
    }

    // ── Shifts ────────────────────────────────────────────────────────────────

    if (hasShiftBtn) {
        steps.push({
            id: 'tls-add-shift',
            title: 'Add a shift',
            text: 'Inside each session, shifts are the volunteer slots. Click <strong>Next</strong> to see the full shift form.',
            attachTo: { element: '.add-shift-btn', on: 'bottom' },
            beforeShowPromise: ensureFirstSessionOpen,
            buttons: null,
        });

        steps.push({
            id: 'tls-shift-form',
            title: 'Shift form',
            text: '<strong>Event Type</strong> sets the badge color and category. <strong>Scheduler Dept</strong> is critical — it controls which column this shift appears in on the Scheduler page. <strong>SMS Code</strong> is the short code volunteers text back to confirm their assignment. Toggle <strong>Invitable</strong> to make this shift available in Campaign Center messaging.',
            attachTo: { element: '#shiftFormPanel .modal-dialog', on: 'right' },
            beforeShowPromise() { return clickToOpenModal('.add-shift-btn', 'shiftFormPanel'); },
            when: { hide() { closeTourModal('shiftFormPanel'); } },
            buttons: null,
        });
    }

    // ── Shift cards ───────────────────────────────────────────────────────────

    if (hasShiftCard) {
        steps.push({
            id: 'tls-shift-card',
            title: 'Shift cards',
            text: 'Each shift appears as a card with its event type badge, label, and time range. The badge color matches the event type. The three icons at the top right are: <strong>invitable toggle</strong> (envelope), <strong>edit shift</strong> (pen), and <strong>assign location</strong> (chain).',
            attachTo: { element: '.shift-card', on: 'top' },
            beforeShowPromise: ensureFirstSessionOpen,
            buttons: null,
        });
    }

    // ── Invitable toggle ──────────────────────────────────────────────────────

    if (hasInvitable) {
        steps.push({
            id: 'tls-invitable',
            title: 'Invitable toggle',
            text: 'This envelope button flips the invitable flag without opening the full edit form. <strong>Yellow</strong> = invitable — the shift will appear in Campaign Center when building invitation messages. Toggle it directly here for quick changes.',
            attachTo: { element: '.shift-invitable-btn', on: 'left' },
            beforeShowPromise: ensureFirstSessionOpen,
            buttons: null,
        });
    }

    // ── Assign location ───────────────────────────────────────────────────────

    if (hasAssignBtn) {
        steps.push({
            id: 'tls-add-assign',
            title: 'Assign a location',
            text: 'The chain icon links a specific parking location to this shift. Click <strong>Next</strong> to see the assign form.',
            attachTo: { element: '.add-assignment-btn', on: 'left' },
            beforeShowPromise: ensureFirstSessionOpen,
            buttons: null,
        });

        steps.push({
            id: 'tls-assign-form',
            title: 'Assign location form',
            text: 'Select the location from the dropdown. Set three volunteer counts: <strong>Min</strong> (acceptable minimum), <strong>Target</strong> (ideal staffing), and <strong>Max</strong> (upper limit). These numbers appear in the Scheduler Report as your coverage targets for each spot. A shift can have multiple location assignments.',
            attachTo: { element: '#assignFormPanel .modal-dialog', on: 'right' },
            beforeShowPromise() { return clickToOpenModal('.add-assignment-btn', 'assignFormPanel'); },
            when: { hide() { closeTourModal('assignFormPanel'); } },
            buttons: null,
        });
    }

    // ── Assignment badges ─────────────────────────────────────────────────────

    if (hasAssignment) {
        steps.push({
            id: 'tls-assignment-badge',
            title: 'Location assignment badges',
            text: 'Each assigned location appears as a badge on the shift card showing <strong>(min / target / max)</strong>. Click the pen icon on a badge to edit the counts, or the × to remove the assignment.',
            attachTo: { element: '.assignment-badge', on: 'bottom' },
            beforeShowPromise: ensureFirstSessionOpen,
            buttons: null,
        });
    }

    // ── Wire buttons ──────────────────────────────────────────────────────────

    steps.forEach((step, i) => {
        const isFirst = i === 0;
        const isLast  = i === steps.length - 1;
        step.buttons = isFirst
            ? startButtons(tour)
            : isLast
            ? finishButtons(tour)
            : navButtons(tour);
        tour.addStep(step);
    });

    return tour;
}

// ─────────────────────────────────────────────────────────────────────────────
// View detection + init
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects which timeline view is currently rendered.
 *
 * @returns {'event-types'|'timelines-sessions'|'timelines-days'}
 */
function detectView() {
    if (document.getElementById('etAddBtn')) return 'event-types';
    if (document.getElementById('addSessionBtn')) return 'timelines-sessions';
    return 'timelines-days';
}

/**
 * Attaches the tour trigger to #tourTriggerBtn on the Timelines / Event Types page.
 *
 * @returns {void}
 */
export function initTimelinesTour() {
    const btn = document.getElementById('tourTriggerBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
        const view = detectView();
        const tour =
            view === 'event-types'        ? buildEventTypesTour() :
            view === 'timelines-sessions'  ? buildTimelinesSessionsTour() :
                                             buildTimelinesDaysTour();
        tour.start();
    });
}

initTimelinesTour();
