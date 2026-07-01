/**
 * @fileoverview lessonsLearnedTour.js
 * Shepherd.js tour for the Lessons Learned page (/oversight/tools/lessons-learned).
 * Walks through the workflow tabs, year filter, the New Lesson form, card
 * actions, and the Published-tab report link.
 *
 * @module lessonsLearnedTour
 */

import {
    createTour,
    navButtons,
    startButtons,
    finishButtons,
    registerTour,
} from "./tourBase.js";

/**
 * Opens the New Lesson modal by clicking the trigger button.
 * Resolves once Bootstrap reports the modal fully shown.
 *
 * @returns {Promise<void>}
 */
function openNewLessonForm() {
    return new Promise((resolve) => {
        const btn = document.getElementById("ll-new-btn");
        const el = document.getElementById("ll-new-modal");
        if (!btn || !el) {
            resolve();
            return;
        }
        if (el.classList.contains("show")) {
            resolve();
            return;
        }
        el.addEventListener("shown.bs.modal", () => resolve(), { once: true });
        btn.click();
    });
}

/**
 * Closes the New Lesson modal if it is currently open.
 *
 * @returns {void}
 */
function closeNewLessonForm() {
    const el = document.getElementById("ll-new-modal");
    if (el && el.classList.contains("show")) {
        bootstrap.Modal.getInstance(el)?.hide();
    }
}

/**
 * Switches to the Published tab by clicking its pill, then waits briefly
 * for the async lesson/report fetch to settle so the report link area
 * reflects real state.
 *
 * @returns {Promise<void>}
 */
function switchToPublishedTab() {
    return new Promise((resolve) => {
        const tab = document.getElementById("ll-tab-published");
        if (!tab) {
            resolve();
            return;
        }
        if (tab.classList.contains("active")) {
            resolve();
            return;
        }
        tab.click();
        setTimeout(resolve, 500);
    });
}

/**
 * Builds and returns the Lessons Learned tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildLessonsLearnedTour() {
    const tour = createTour();

    const hasArchivedTab = !!document.getElementById("ll-tab-archived");
    const hasCards = !!document.querySelector(".ll-card");

    const steps = [];

    steps.push({
        id: "ll-welcome",
        title: "Lessons Learned",
        text: "This page collects lessons and observations from convention operations, moving each through a three-stage workflow: <strong>Proposed</strong> → <strong>Accepted</strong> → <strong>Published</strong>. Published lessons feed into a consolidated PDF report for convention oversight.",
        buttons: null,
    });

    steps.push({
        id: "ll-tabs",
        title: "Workflow tabs",
        text: hasArchivedTab
            ? "<strong>Proposed</strong> holds new submissions awaiting review. <strong>Accepted</strong> means an overseer has approved it. <strong>Published</strong> means it's included in the current PDF report. <strong>Archived</strong> (overseer-only) holds lessons pulled out of the active flow."
            : "<strong>Proposed</strong> holds new submissions awaiting review. <strong>Accepted</strong> means an overseer has approved it. <strong>Published</strong> means it's included in the current PDF report.",
        attachTo: { element: "#ll-tab-pills", on: "bottom" },
        buttons: null,
    });

    steps.push({
        id: "ll-year-filter",
        title: "Year filter",
        text: "Lessons are tied to a specific convention year. Narrow to one year, or leave it on <strong>All years</strong> to see everything at once.",
        attachTo: { element: "#ll-year-filter", on: "bottom" },
        buttons: null,
    });

    steps.push({
        id: "ll-new-btn",
        title: "New Lesson",
        text: "Click here to submit a lesson. Click <strong>Next</strong> and the tour will open the form for you.",
        attachTo: { element: "#ll-new-btn", on: "bottom" },
        buttons: null,
    });

    steps.push({
        id: "ll-new-form",
        title: "Submitting a lesson",
        text: 'Pick the <strong>Convention Year</strong> and optionally a <strong>Department</strong> — choose "Other…" to type a custom one. Describe what happened and any recommendations in the main field, and attach photos if they help tell the story. New submissions start in the Proposed tab.',
        attachTo: { element: "#ll-new-modal .modal-dialog", on: "right" },
        beforeShowPromise: openNewLessonForm,
        when: { hide: closeNewLessonForm },
        buttons: null,
    });

    if (hasCards) {
        steps.push({
            id: "ll-cards",
            title: "Lesson cards",
            text: "Each card shows the department, a preview of the notes, and who submitted it. Click a card to expand it — you'll see the full text, photo gallery, and an audit trail of who submitted, approved, published, or archived it.",
            attachTo: { element: ".ll-card", on: "top" },
            buttons: null,
        });

        steps.push({
            id: "ll-actions",
            title: "Card actions",
            text: "Buttons appear based on your role and the lesson's current status: <strong>Edit</strong> (submitter or overseer), <strong>Approve</strong> moves it to Accepted, <strong>Publish</strong> moves it to Published and regenerates the year's PDF, and <strong>Archive</strong>/<strong>Unarchive</strong> pulls it out of or back into the active flow.",
            attachTo: { element: ".ll-card-actions", on: "bottom" },
            buttons: null,
        });
    }

    steps.push({
        id: "ll-report-link",
        title: "The published report",
        text: "On the Published tab, this area shows a download link for the current year's consolidated PDF. Overseers see a <strong>Generate</strong> or <strong>Re-generate</strong> button here too — publishing an individual lesson also regenerates this report automatically.",
        attachTo: { element: "#ll-report-link-wrap", on: "bottom" },
        beforeShowPromise: switchToPublishedTab,
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
 * Attaches the tour to #tourTriggerBtn on the Lessons Learned page.
 *
 * @returns {void}
 */
export function initLessonsLearnedTour() {
    const btn = document.getElementById("tourTriggerBtn");
    if (!btn) return;
    btn.addEventListener("click", () => buildLessonsLearnedTour().start());
    registerTour("lessonsLearned", buildLessonsLearnedTour);
}

initLessonsLearnedTour();
