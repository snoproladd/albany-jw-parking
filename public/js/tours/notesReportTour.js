/**
 * @fileoverview notesReportTour.js
 * Shepherd.js tour for the Notes Report page (/oversight/tools/notes-report).
 * Walks through the four tabs — All Notes, Actionable, Solutions Summary,
 * and Archived — switching tabs as needed so each step has real content
 * to attach to regardless of which tab was active when the tour started.
 *
 * @module notesReportTour
 */

import {
    createTour,
    navButtons,
    startButtons,
    finishButtons,
    registerTour,
} from "./tourBase.js";

/**
 * Activates a Bootstrap tab by its trigger id. Resolves immediately if the
 * tab is already active, otherwise waits for Bootstrap's "shown.bs.tab"
 * event before resolving so subsequent DOM queries see the switched pane.
 *
 * @param {string} triggerId - id of the tab trigger button (e.g. "tab-actionable")
 * @returns {Promise<void>}
 */
function activateTab(triggerId) {
    return new Promise((resolve) => {
        const trigger = document.getElementById(triggerId);
        if (!trigger) {
            resolve();
            return;
        }
        if (trigger.classList.contains("active")) {
            resolve();
            return;
        }
        trigger.addEventListener("shown.bs.tab", () => resolve(), { once: true });
        bootstrap.Tab.getOrCreateInstance(trigger).show();
    });
}

/**
 * Builds and returns the Notes Report tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildNotesReportTour() {
    const tour = createTour();

    const hasAnalyzeAll = !!document.getElementById("analyzeAllBtn");
    const hasCards = !!document.querySelector(".nr-card");

    const steps = [];

    steps.push({
        id: "nr-welcome",
        title: "Notes Report",
        text: "This page surfaces intake notes and inbound SMS messages that need overseer attention, organized across four tabs: <strong>All Notes</strong>, <strong>Actionable</strong>, <strong>Solutions Summary</strong>, and <strong>Archived</strong>.",
        buttons: null,
    });

    steps.push({
        id: "nr-tabs",
        title: "The four tabs",
        text: "<strong>All Notes</strong> is everything — every intake note and inbound message. <strong>Actionable</strong> narrows to items flagged for follow-up. <strong>Solutions Summary</strong> shows only items with a resolution recorded. <strong>Archived</strong> holds dismissed notes and resolved messages.",
        attachTo: { element: "#notesReportTabs", on: "bottom" },
        beforeShowPromise: () => activateTab("tab-all-notes"),
        buttons: null,
    });

    steps.push({
        id: "nr-search",
        title: "Search",
        text: "Search by volunteer name or note text — this filters both the intake note cards and inbound SMS cards shown below.",
        attachTo: { element: "#searchAllNotes", on: "bottom" },
        beforeShowPromise: () => activateTab("tab-all-notes"),
        buttons: null,
    });

    steps.push({
        id: "nr-filter",
        title: "Filter pills",
        text: "<strong>Unread by me</strong> shows only notes you haven't opened yet. <strong>No action yet</strong> shows notes with no action item created — a quick way to spot what's fallen through the cracks.",
        attachTo: { element: "#filterAllNotes", on: "bottom" },
        beforeShowPromise: () => activateTab("tab-all-notes"),
        buttons: null,
    });

    if (hasAnalyzeAll) {
        steps.push({
            id: "nr-analyze-all",
            title: "Analyze All",
            text: "Runs AI analysis on every note that doesn't already have one, in a single batch. Each analysis produces a summary, category, and suggested action items you can accept individually from inside a note's detail view.",
            attachTo: { element: "#analyzeAllBtn", on: "bottom" },
            beforeShowPromise: () => activateTab("tab-all-notes"),
            buttons: null,
        });
    }

    if (hasCards) {
        steps.push({
            id: "nr-cards",
            title: "Notes and messages",
            text: "Inbound SMS messages are listed first, followed by intake notes. Click any card to open its detail view — opening a note automatically marks it read, and you'll see who else has read it, any existing action items, and the AI Analysis section where you can run or review analysis and accept suggested actions.",
            attachTo: { element: ".nr-card", on: "top" },
            beforeShowPromise: () => activateTab("tab-all-notes"),
            buttons: null,
        });
    }

    steps.push({
        id: "nr-actionable",
        title: "Actionable",
        text: "Filter by <strong>Needs review</strong> (no decision made yet), <strong>Solution found</strong>, or <strong>No solution</strong>. Clicking a card opens the same action detail view where you mark a solution found, describe it, and later mark the action complete.",
        attachTo: { element: "#filterActionable", on: "bottom" },
        beforeShowPromise: () => activateTab("tab-actionable"),
        buttons: null,
    });

    steps.push({
        id: "nr-solutions",
        title: "Solutions Summary",
        text: "Only items with a solution on record appear here, filterable by <strong>Pending</strong> (solution found, not yet completed) or <strong>Completed</strong>. Each card shows who found the solution and who completed it, with timestamps.",
        attachTo: { element: "#filterSolutions", on: "bottom" },
        beforeShowPromise: () => activateTab("tab-solutions"),
        buttons: null,
    });

    steps.push({
        id: "nr-archived",
        title: "Archived",
        text: "Loads the first time you open this tab. Dismissed intake notes and resolved SMS messages live here — click a dismissed note to restore it back to the active list. Resolved messages are read-only.",
        attachTo: { element: "#panel-dismissed", on: "top" },
        beforeShowPromise: () => activateTab("tab-dismissed"),
        buttons: null,
    });

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
 * Attaches the tour to #tourTriggerBtn on the Notes Report page.
 *
 * @returns {void}
 */
export function initNotesReportTour() {
    const btn = document.getElementById("tourTriggerBtn");
    if (!btn) return;
    btn.addEventListener("click", () => buildNotesReportTour().start());
    registerTour("notesReport", buildNotesReportTour);
}

initNotesReportTour();
