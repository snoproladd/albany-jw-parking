/**
 * @fileoverview reportsTour.js
 * Shepherd.js tour for the Reports page (/oversight/tools/reports).
 * Walks through the tab layout, filters, and the application status table.
 *
 * @module reportsTour
 */

import {
  createTour,
  navButtons,
  startButtons,
  finishButtons,
  registerTour,
} from "./tourBase.js";

/**
 * Builds and returns the Reports tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildReportsTour() {
    const tour = createTour();

    const hasTable = !!document.getElementById('appStatusTable');
    const hasBody  = !!document.getElementById('appStatusBody');

    const steps = [];

    steps.push({
        id: 'rpt-welcome',
        title: 'Reports',
        text: 'The Reports page surfaces volunteer data that doesn\'t fit neatly elsewhere — registration completion, missing information, and status flags. Additional report types can be added as tabs over time.',
        buttons: null,
    });

    steps.push({
        id: 'rpt-tabs',
        title: 'Report tabs',
        text: 'Each tab is a different report. Currently the <strong>Application Status</strong> report is available. Future reports will appear here as additional tabs.',
        attachTo: { element: '#reportTabs', on: 'bottom' },
        buttons: null,
    });

    steps.push({
        id: 'rpt-status-filter',
        title: 'Status filter',
        text: 'Filter by registration status — <strong>Completed</strong> (all required fields filled), or <strong>Draft / Incomplete</strong> (fields still missing). The incomplete filter is the most actionable — it shows who still needs to finish their account.',
        attachTo: { element: '#statusFilter', on: 'bottom' },
        buttons: null,
    });

    steps.push({
        id: 'rpt-search',
        title: 'Search',
        text: 'Search by name or email to find a specific volunteer. Works alongside the status filter.',
        attachTo: { element: '#reportSearch', on: 'bottom' },
        buttons: null,
    });

    if (hasTable) {
        steps.push({
            id: 'rpt-table',
            title: 'Application Status table',
            text: 'Each row shows a volunteer\'s name, email, registration status badge, which fields are missing, and when their account was last updated. Click any column header to sort.',
            attachTo: { element: '#appStatusTable', on: 'top' },
            buttons: null,
        });
    }

    if (hasBody) {
        steps.push({
            id: 'rpt-missing',
            title: 'Missing fields column',
            text: 'The <strong>Missing Fields</strong> column shows exactly what\'s incomplete for each volunteer — congregation, phone number, required profile fields, etc. This is the fastest way to identify what needs follow-up without opening each account individually.',
            attachTo: { element: '#appStatusBody', on: 'top' },
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
 * Attaches the tour to #tourTriggerBtn on the Reports page.
 *
 * @returns {void}
 */
export function initReportsTour() {
    const btn = document.getElementById('tourTriggerBtn');
    if (!btn) return;
    btn.addEventListener('click', () => buildReportsTour().start());
    registerTour("reports", buildReportsTour);
}

initReportsTour();
