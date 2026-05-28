/**
 * @fileoverview attendanceCheckinTour.js
 * Shepherd.js tour for the Attendance Check-In page (/oversight/tools/attendance/checkin).
 * Walks through shift selection, stat cards, the volunteer table, and walk-in recording.
 *
 * @module attendanceCheckinTour
 */

import { createTour, navButtons, startButtons, finishButtons } from './tourBase.js';

/**
 * Builds and returns the Attendance Check-In tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildAttendanceCheckinTour() {
    const tour = createTour();

    const hasStatsRow  = !!document.getElementById('atStatsRow');
    const hasTableCard = !!document.getElementById('atTableCard');
    const hasTable     = !!document.getElementById('atTable');
    const hasWalkIn    = !!document.getElementById('atWalkInBtn');

    const steps = [];

    steps.push({
        id: 'at-welcome',
        title: 'Attendance Check-In',
        text: 'This tool is used on convention day to record which volunteers showed up. Select a shift, then mark arrivals directly in the table. Everything saves automatically as you go — no submit button needed.',
        buttons: null,
    });

    steps.push({
        id: 'at-day',
        title: 'Select a convention day',
        text: 'Start by choosing the day. The shift dropdown populates based on your selection — only shifts with scheduled volunteers appear.',
        attachTo: { element: '#atDaySelect', on: 'bottom' },
        buttons: null,
    });

    steps.push({
        id: 'at-shift',
        title: 'Select a shift',
        text: 'Choose the specific shift you\'re checking in. The volunteer table, stat cards, and walk-in button all activate once a shift is selected.',
        attachTo: { element: '#atShiftSelect', on: 'bottom' },
        buttons: null,
    });

    if (hasStatsRow) {
        steps.push({
            id: 'at-stats',
            title: 'Live stats',
            text: 'These four cards update in real time as you mark attendance. <strong>Invited</strong> is the total scheduled. <strong>RSVP Yes</strong> shows who confirmed. <strong>Attended</strong> and <strong>No-Show</strong> update as you check people in.',
            attachTo: { element: '#atStatsRow', on: 'bottom' },
            buttons: null,
        });
    }

    if (hasTableCard) {
        steps.push({
            id: 'at-table-card',
            title: 'Volunteer table',
            text: 'Every volunteer scheduled for this shift appears here with their RSVP status. The <strong>Attended</strong> column has a toggle for each person — flip it when they arrive.',
            attachTo: { element: '#atTableCard', on: 'top' },
            buttons: null,
        });
    }

    steps.push({
        id: 'at-search',
        title: 'Find a volunteer',
        text: 'Type any part of a name to filter the table instantly. Useful at a busy check-in desk when you need to find someone quickly.',
        attachTo: { element: '#atSearch', on: 'bottom' },
        buttons: null,
    });

    if (hasWalkIn) {
        steps.push({
            id: 'at-walkin',
            title: 'Walk-ins',
            text: 'If a volunteer shows up who wasn\'t on the original shift list, click <strong>Walk-In</strong>. Search for them by name, then add them — they\'ll appear in the table tagged as a walk-in and counted in the stats.',
            attachTo: { element: '#atWalkInBtn', on: 'left' },
            buttons: null,
        });
    }

    if (hasTable) {
        steps.push({
            id: 'at-table-rows',
            title: 'Recording attendance',
            text: 'Toggle the <strong>Attended</strong> switch for each volunteer as they arrive. You can also add notes directly in the Notes column — useful for recording late arrivals or special circumstances. All changes save instantly.',
            attachTo: { element: '#atTable', on: 'top' },
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
 * Attaches the tour to #tourTriggerBtn on the Attendance Check-In page.
 *
 * @returns {void}
 */
export function initAttendanceCheckinTour() {
    const btn = document.getElementById('tourTriggerBtn');
    if (!btn) return;
    btn.addEventListener('click', () => buildAttendanceCheckinTour().start());
}

initAttendanceCheckinTour();
