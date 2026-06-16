/**
 * @fileoverview crewMatrixTour.js
 * Shepherd.js tour for the Crew Assignments page (/oversight/tools/crew-assignments).
 * Walks through the search/filter bar, the matrix table, toggles, and auto-save behavior.
 *
 * @module crewMatrixTour
 */

import {
  createTour,
  navButtons,
  startButtons,
  finishButtons,
  registerTour,
} from "./tourBase.js";

/**
 * Builds and returns the Crew Assignments tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildCrewMatrixTour() {
    const tour = createTour();

    const hasTable      = !!document.getElementById('crewTable');
    const hasToggleAll  = !!document.querySelector('.crew-toggle-all-btn');
    const hasToggle     = !!document.querySelector('.crew-toggle');

    const steps = [];

    steps.push({
        id: 'cm-welcome',
        title: 'Crew Assignments',
        text: 'Crew assignments control which parking departments a volunteer can be scheduled in. A volunteer must be assigned to a crew before the Scheduler will show them in that department\'s pool. Changes save automatically.',
        buttons: null,
    });

    steps.push({
        id: 'cm-search',
        title: 'Name search',
        text: 'Type any part of a volunteer\'s name to filter the matrix. Useful for quickly finding one person in a large list.',
        attachTo: { element: '#crewSearch', on: 'bottom' },
        buttons: null,
    });

    steps.push({
        id: 'cm-role-filter',
        title: 'Role filter',
        text: 'Filter by volunteer role to focus on a specific group — for example, show only Keymans to assign them to all relevant crews at once.',
        attachTo: { element: '#crewRoleFilter', on: 'bottom' },
        buttons: null,
    });

    steps.push({
        id: 'cm-crew-filter',
        title: 'Crew filter',
        text: 'Filter by crew assignment. <strong>None assigned</strong> is especially useful — it shows volunteers who have no crew yet, so you can quickly identify anyone who\'d be invisible to the Scheduler.',
        attachTo: { element: '#crewCrewFilter', on: 'bottom' },
        buttons: null,
    });

    if (hasTable) {
        steps.push({
            id: 'cm-table',
            title: 'The crew matrix',
            text: 'Each row is a volunteer. Each column is a parking crew: <strong>L&amp;G</strong> (Lots &amp; Garages), <strong>Signs</strong>, <strong>Security</strong>, <strong>D/P</strong> (Drop-off/Pickup), and <strong>MS</strong> (Mobile Support). Toggle each switch to assign or unassign.',
            attachTo: { element: '#crewTable', on: 'top' },
            buttons: null,
        });
    }

    if (hasToggleAll) {
        steps.push({
            id: 'cm-toggle-all',
            title: 'Toggle all visible',
            text: 'Each column header has a small toggle-all button. It flips the assignment for every <strong>currently visible</strong> volunteer in that crew — handy after filtering to a specific group.',
            attachTo: { element: '.crew-toggle-all-btn', on: 'bottom' },
            buttons: null,
        });
    }

    if (hasToggle) {
        steps.push({
            id: 'cm-toggle',
            title: 'Individual toggles',
            text: 'Each switch saves the moment you flip it — no Save button needed. The status toast at the top of the table briefly confirms each save. If a save fails, the toast shows an error and the toggle reverts.',
            attachTo: { element: '.crew-toggle', on: 'left' },
            buttons: null,
        });
    }

    steps.push({
        id: 'cm-toast',
        title: 'Auto-save confirmation',
        text: 'This bar shows a brief confirmation after each toggle saves. It\'s intentionally subtle — it appears and fades so it doesn\'t interrupt your workflow when assigning many volunteers at once.',
        attachTo: { element: '#crewToast', on: 'bottom' },
        buttons: null,
    });

    steps.forEach((step, i) => {
        const isFirst = i === 0;
        const isLast  = i === steps.length - 1;
        step.buttons = isFirst ? startButtons(tour) : isLast ? finishButtons(tour) : navButtons(tour);
        tour.addStep(step);
    });

    return tour;
}

/**
 * Attaches the tour to #tourTriggerBtn on the Crew Assignments page.
 *
 * @returns {void}
 */
export function initCrewMatrixTour() {
    const btn = document.getElementById('tourTriggerBtn');
    if (!btn) return;
    btn.addEventListener('click', () => buildCrewMatrixTour().start());
    registerTour("crewMatrix", buildCrewMatrixTour);
}

initCrewMatrixTour();
