/**
 * @fileoverview conflictGridTour.js
 * Shepherd.js tour for the Master Conflict Grid page (/oversight/tools/conflict-grid).
 * Walks through the legend, display toggles, the violations panel, the grid
 * itself, and the right-click resolution actions.
 *
 * @module conflictGridTour
 */

import {
    createTour,
    navButtons,
    startButtons,
    finishButtons,
    registerTour,
} from "./tourBase.js";

/**
 * Builds and returns the Master Conflict Grid tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildConflictGridTour() {
    const tour = createTour();

    const hasGrid = !!document.querySelector(".cg-table");
    const hasConflictCell = !!document.querySelector("td[data-cg-state]");
    const hasSearch = !!document.querySelector(".cg-search");

    const steps = [];

    steps.push({
        id: "cg-welcome",
        title: "Master Conflict Grid",
        text: "This grid cross-references every volunteer against every shift in one view, flagging double-bookings and blackout conflicts that are easy to miss shift-by-shift in the Scheduler.",
        buttons: null,
    });

    steps.push({
        id: "cg-legend",
        title: "Reading the grid",
        text: "<strong>X</strong> means assigned with no issues. <strong>PC</strong> means the volunteer is unavailable (blackout) but not assigned. <strong>X/PC</strong> means they're assigned during their own blackout. <strong>SC</strong> means they're double-booked into an overlapping shift. <strong>SC/PC</strong> is both at once. Department color swatches on the column headers help you scan by crew.",
        attachTo: { element: ".cg-legend-card", on: "bottom" },
        buttons: null,
    });

    steps.push({
        id: "cg-toggles",
        title: "Display toggles",
        text: '<strong>Show Personal Conflicts</strong> controls whether PC-only cells (blackout, not assigned) are shown — turn it off to focus purely on double-bookings. <strong>Show All Volunteers</strong> expands the grid to every volunteer; off, it only shows volunteers who have at least one assignment, which keeps the grid manageable.',
        attachTo: { element: ".cg-toggles", on: "left" },
        buttons: null,
    });

    steps.push({
        id: "cg-violations",
        title: "Schedule Analysis",
        text: "Click <strong>Run Analysis</strong> to check the current schedule for conflicts using both hard rules and AI review — the accordion auto-expands with results when it's done. Cached results return instantly if nothing's changed since the last run.",
        attachTo: { element: "#svAccordion", on: "top" },
        buttons: null,
    });

    steps.push({
        id: "cg-violations-detail",
        title: "Working through violations",
        text: "Violations are grouped by severity and surfaced as an actionable list instead of a grid. Each entry can include an AI suggestion, and some let you respond to a clarifying question and re-analyze. <strong>Acknowledge</strong> dismisses a violation without changing the schedule; the remove buttons pull a volunteer directly out of the conflicting shift. Standing rules that shape the AI's analysis are listed at the top, with a link to manage them.",
        buttons: null,
    });

    if (hasGrid) {
        steps.push({
            id: "cg-grid",
            title: "The grid",
            text: "Volunteer names are a sticky left column so they stay visible while you scroll horizontally through shifts, which are grouped by convention day. Hover any column to highlight it — useful for tracing a single shift down the full volunteer list.",
            attachTo: { element: "#cgWrapper", on: "top" },
            buttons: null,
        });
    }

    if (hasSearch) {
        steps.push({
            id: "cg-search",
            title: "Name search",
            text: "Type here to filter the grid down to matching volunteers — handy on a grid this wide.",
            attachTo: { element: ".cg-search", on: "bottom" },
            buttons: null,
        });
    }

    if (hasConflictCell) {
        steps.push({
            id: "cg-context-menu",
            title: "Resolving a conflict",
            text: "Right-click any <strong>SC</strong>, <strong>SC/PC</strong>, or <strong>X/PC</strong> cell for a context menu. It offers to remove the volunteer from the shift shown, from any other shift it conflicts with, and — for blackout-related states — to view their blackout details directly.",
            buttons: null,
        });
    }

    steps.forEach((step, i) => {
        const isFirst = i === 0;
        const isLast = i === steps.length - 1;
        step.buttons = isFirst
            ? startButtons(tour)
            : isLast
                ? finishButtons(tour)
                : navButtons(tour);
        tour.addStep(step);
    });

    return tour;
}

/**
 * Attaches the tour to #tourTriggerBtn on the Master Conflict Grid page.
 *
 * @returns {void}
 */
export function initConflictGridTour() {
    const btn = document.getElementById("tourTriggerBtn");
    if (!btn) return;
    btn.addEventListener("click", () => buildConflictGridTour().start());
    registerTour("conflictGrid", buildConflictGridTour);
}

initConflictGridTour();
