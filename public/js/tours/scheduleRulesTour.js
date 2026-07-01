/**
 * @fileoverview scheduleRulesTour.js
 * Shepherd.js tour for the Schedule Analysis Rules page (/oversight/tools/schedule-rules).
 * Walks through the active rules list, per-rule actions, and the add-rule form.
 *
 * @module scheduleRulesTour
 */

import {
    createTour,
    navButtons,
    startButtons,
    finishButtons,
    registerTour,
} from "./tourBase.js";

/**
 * Builds and returns the Schedule Analysis Rules tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildScheduleRulesTour() {
    const tour = createTour();

    const hasRows = !!document.querySelector(".sar-row");

    const steps = [];

    steps.push({
        id: "sar-welcome",
        title: "Schedule Analysis Rules",
        text: "These rules are injected directly into the AI's system prompt every time a Schedule Analysis runs from the Master Conflict Grid. The AI applies them when assessing violation severity and suggesting resolutions — think of them as standing policy the AI should always follow.",
        buttons: null,
    });

    steps.push({
        id: "sar-list",
        title: "Active Rules",
        text: "Every rule you've defined is listed here, with a live count of how many are currently active. Rules can also get added directly from the Conflict Grid's violations panel when you answer an AI question — those show up here too.",
        attachTo: { element: ".sar-card", on: "bottom" },
        buttons: null,
    });

    if (hasRows) {
        steps.push({
            id: "sar-reorder",
            title: "Reordering",
            text: "Use the up/down arrows to change a rule's position. Order matters beyond display — rules are numbered <strong>Rule 1</strong>, <strong>Rule 2</strong>, and so on in the AI's prompt, and AI suggestions cite that number, so reordering changes which number a rule is referred to as.",
            attachTo: { element: ".sar-reorder-btn", on: "right" },
            buttons: null,
        });

        steps.push({
            id: "sar-toggle",
            title: "Deactivating a rule",
            text: "Click the toggle to deactivate a rule without deleting it. Inactive rules are grayed out here and excluded from the AI prompt entirely — useful for temporarily disabling a rule without losing its wording.",
            attachTo: { element: ".sar-btn--toggle", on: "top" },
            buttons: null,
        });

        steps.push({
            id: "sar-edit",
            title: "Editing a rule",
            text: "Click the pencil to edit a rule's text in place. Save or Cancel appear below the textarea — nothing else on the page is affected until you save.",
            attachTo: { element: ".sar-btn--edit", on: "top" },
            buttons: null,
        });

        steps.push({
            id: "sar-delete",
            title: "Deleting a rule",
            text: "Permanently removes the rule after a confirmation prompt. There's no undo — deactivate instead if you might want it back later.",
            attachTo: { element: ".sar-btn--delete", on: "top" },
            buttons: null,
        });
    }

    steps.push({
        id: "sar-add",
        title: "Add Rule",
        text: "Write a new rule in plain language, up to 2000 characters — the character count updates as you type. New rules are added active by default and appear at the bottom of the list, ready to apply on the next Schedule Analysis run.",
        attachTo: { element: ".sar-add-form", on: "top" },
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
 * Attaches the tour to #tourTriggerBtn on the Schedule Analysis Rules page.
 *
 * @returns {void}
 */
export function initScheduleRulesTour() {
    const btn = document.getElementById("tourTriggerBtn");
    if (!btn) return;
    btn.addEventListener("click", () => buildScheduleRulesTour().start());
    registerTour("scheduleRules", buildScheduleRulesTour);
}

initScheduleRulesTour();
