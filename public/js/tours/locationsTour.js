/**
 * @fileoverview locationsTour.js
 * Shepherd.js tour for the Locations page (/oversight/tools/locationsAndTasks).
 * Walks through year selection, the add form (inline card), the locations table,
 * and editing an existing location.
 *
 * Note: The add/edit form (#formPanel) is an inline card, not a Bootstrap modal.
 * The tour opens it programmatically by clicking #addBtn so the Shepherd overlay
 * creates a visible cutout around the form. The Save button is not disabled during
 * the tour since the tour-preview CSS only applies to Bootstrap modals.
 *
 * @module locationsTour
 */

import { createTour, navButtons, startButtons, finishButtons } from './tourBase.js';

/**
 * Opens the add-location inline form by clicking the add button.
 * Resolves after a short delay to allow the DOM to update.
 *
 * @returns {Promise<void>}
 */
function openLocationsForm() {
    return new Promise((resolve) => {
        const panel = document.getElementById('formPanel');
        if (!panel) { resolve(); return; }
        if (!panel.classList.contains('d-none')) { resolve(); return; }
        document.getElementById('addBtn')?.click();
        setTimeout(resolve, 80);
    });
}

/**
 * Closes the inline form by clicking the cancel button if it is open.
 */
function closeLocationsForm() {
    const panel = document.getElementById('formPanel');
    if (panel && !panel.classList.contains('d-none')) {
        document.getElementById('cancelBtn')?.click();
    }
}

/**
 * Builds and returns the Locations tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildLocationsTour() {
    const tour = createTour();

    const hasTable = !!document.getElementById('locationsTable');
    const hasRows  = !!document.querySelector('.edit-btn');

    const steps = [];

    steps.push({
        id: 'loc-welcome',
        title: 'Locations',
        text: 'Locations are the named parking spots volunteers are assigned to — Lot A, Mobile Security, Drop-off Zone, etc. They\'re defined per year and used when building shift assignments in Timelines.',
        buttons: null,
    });

    steps.push({
        id: 'loc-year',
        title: 'Convention year',
        text: 'Locations are year-specific. Changing the year shows only locations defined for that year — you\'ll need to add locations again for a new year, or copy them manually.',
        attachTo: { element: '#yearPicker', on: 'bottom' },
        buttons: null,
    });

    steps.push({
        id: 'loc-add',
        title: 'Add a location',
        text: 'Click here to open the add form. Click <strong>Next</strong> and the tour will open it for you.',
        attachTo: { element: '#addBtn', on: 'bottom' },
        buttons: null,
    });

    steps.push({
        id: 'loc-form',
        title: 'Location form',
        text: '<strong>Name</strong> is required — keep it short and recognizable (e.g. "Lot A"). <strong>Capacity</strong> is optional but useful for Scheduler planning. <strong>Address</strong> and <strong>Google Maps URL</strong> populate the <strong>{locationAddress}</strong> and <strong>{locationMapsUrl}</strong> merge fields in Campaign Center messages.',
        attachTo: { element: '#formPanel', on: 'right' },
        beforeShowPromise: openLocationsForm,
        when: { hide: closeLocationsForm },
        buttons: null,
    });

    if (hasTable) {
        steps.push({
            id: 'loc-table',
            title: 'Locations table',
            text: 'All locations for the selected year are listed here with their capacity, address, map link, and active status. Inactive locations are grayed out and hidden from the shift assignment picker in Timelines.',
            attachTo: { element: '#locationsTable', on: 'top' },
            buttons: null,
        });
    }

    if (hasRows) {
        steps.push({
            id: 'loc-edit',
            title: 'Editing a location',
            text: 'The pen icon opens the same form pre-filled with that location\'s data. The <strong>Active</strong> toggle appears in edit mode — deactivate a location instead of deleting it to preserve assignment history.',
            attachTo: { element: '.edit-btn', on: 'left' },
            buttons: null,
        });
    }

    steps.forEach((step, i) => {
        const isFirst = i === 0;
        const isLast  = i === steps.length - 1;
        step.buttons = isFirst ? startButtons(tour) : isLast ? finishButtons(tour) : navButtons(tour);
        tour.addStep(step);
    });

    return tour;
}

/**
 * Attaches the tour to #tourTriggerBtn on the Locations page.
 *
 * @returns {void}
 */
export function initLocationsTour() {
    const btn = document.getElementById('tourTriggerBtn');
    if (!btn) return;
    btn.addEventListener('click', () => buildLocationsTour().start());
}

initLocationsTour();
