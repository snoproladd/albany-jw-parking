/**
 * @fileoverview attendanceReportTour.js
 * Shepherd.js tour for the Attendance Report page (/oversight/tools/attendance/report).
 * Walks through day selection, filter bar, and the shift-by-shift accordion.
 *
 * @module attendanceReportTour
 */

import {
  createTour,
  navButtons,
  startButtons,
  finishButtons,
  registerTour,
} from "./tourBase.js";

/**
 * Builds and returns the Attendance Report tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildAttendanceReportTour() {
    const tour = createTour();

    const hasFilterBar = !!document.getElementById('arFilterBar') &&
                         !document.getElementById('arFilterBar').classList.contains('d-none');
    const hasAccordion = !!document.getElementById('arAccordion') &&
                         !document.getElementById('arAccordion').classList.contains('d-none');

    const steps = [];

    steps.push({
        id: 'ar-welcome',
        title: 'Attendance Report',
        text: 'The attendance report shows a full breakdown of who attended each shift on a given convention day. It\'s a read-only view — all edits happen in the Check-In tool. Select a day to load the report.',
        buttons: null,
    });

    steps.push({
        id: 'ar-day',
        title: 'Select a convention day',
        text: 'Choose a day to load its report. The filter bar and shift accordion appear below once a day is selected. The summary stat shows total attended across all shifts for the day.',
        attachTo: { element: '#arDaySelect', on: 'bottom' },
        buttons: null,
    });

    if (hasFilterBar) {
        steps.push({
            id: 'ar-filter-bar',
            title: 'Filter bar',
            text: 'The filter bar lets you slice the report across all shifts at once. Filters apply to every shift accordion panel simultaneously — the counts inside each panel update to reflect only the matching records.',
            attachTo: { element: '#arFilterBar', on: 'bottom' },
            buttons: null,
        });

        steps.push({
            id: 'ar-filter-type',
            title: 'Type filter',
            text: 'Filter between <strong>Invited</strong> (volunteers who appeared on the shift schedule) and <strong>Walk-In</strong> (added on the day via the Check-In tool\'s walk-in button).',
            attachTo: { element: '#arFilterType', on: 'bottom' },
            buttons: null,
        });

        steps.push({
            id: 'ar-filter-rsvp',
            title: 'RSVP filter',
            text: 'Narrow by RSVP response — Yes, Maybe, No, or Pending. Useful for comparing who said Yes vs. who actually attended.',
            attachTo: { element: '#arFilterRsvp', on: 'bottom' },
            buttons: null,
        });

        steps.push({
            id: 'ar-filter-attended',
            title: 'Attended filter',
            text: 'Show only those who were recorded as attended, or only those who weren\'t. <strong>Not Recorded</strong> identifies no-shows or volunteers whose attendance wasn\'t logged.',
            attachTo: { element: '#arFilterAttended', on: 'bottom' },
            buttons: null,
        });

        steps.push({
            id: 'ar-filter-name',
            title: 'Name search',
            text: 'Search by name across all shifts at once — every matching row in every shift panel is shown.',
            attachTo: { element: '#arFilterName', on: 'bottom' },
            buttons: null,
        });
    }

    if (hasAccordion) {
        steps.push({
            id: 'ar-accordion',
            title: 'Shift accordion',
            text: 'Each shift is an expandable panel showing its volunteers, RSVP, attended status, and any notes. The panel header shows the shift name, time, and a quick count of attended vs. total. Expand any panel to see the full list.',
            attachTo: { element: '#arAccordion', on: 'top' },
            buttons: null,
        });
    } else {
        steps.push({
            id: 'ar-accordion-hint',
            title: 'Shift accordion',
            text: 'After selecting a day, each shift appears as an expandable panel showing volunteers, RSVP status, attendance, and notes. The panel header shows a quick count of attended vs. total for that shift.',
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
 * Attaches the tour to #tourTriggerBtn on the Attendance Report page.
 *
 * @returns {void}
 */
export function initAttendanceReportTour() {
    const btn = document.getElementById('tourTriggerBtn');
    if (!btn) return;
    btn.addEventListener('click', () => buildAttendanceReportTour().start());
}

initAttendanceReportTour();
