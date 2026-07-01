/**
 * @fileoverview schedulesTour.js
 * Shepherd.js tour for the Schedules page (/schedules).
 * Walks through the section grouping and file tile actions.
 *
 * @module schedulesTour
 */

import {
    createTour,
    navButtons,
    startButtons,
    finishButtons,
    registerTour,
} from "./tourBase.js";

/**
 * Builds and returns the Schedules tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildSchedulesTour() {
    const tour = createTour();

    const hasSection = !!document.querySelector(".schedules-section");
    const hasTile = !!document.querySelector(".schedules-tile");

    const steps = [];

    steps.push({
        id: "sc-welcome",
        title: "Schedules",
        text: "Published convention day shift schedules for all departments, once the Scheduler Report has been published from Oversight Tools.",
        buttons: null,
    });

    if (hasSection) {
        steps.push({
            id: "sc-section",
            title: "Sections",
            text: "Each section corresponds to a folder — schedules are grouped exactly as they're organized at the source.",
            attachTo: { element: ".schedules-section", on: "top" },
            buttons: null,
        });
    }

    if (hasTile) {
        steps.push({
            id: "sc-actions",
            title: "Viewing a schedule",
            text: "Click <strong>View / Download</strong> to open or save a schedule file directly.",
            attachTo: { element: ".schedules-tile-actions", on: "top" },
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
 * Attaches the tour to #tourTriggerBtn on the Schedules page.
 *
 * @returns {void}
 */
export function initSchedulesTour() {
    const btn = document.getElementById("tourTriggerBtn");
    if (!btn) return;
    btn.addEventListener("click", () => buildSchedulesTour().start());
    registerTour("schedules", buildSchedulesTour);
}

initSchedulesTour();
