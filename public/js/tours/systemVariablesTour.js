/**
 * @fileoverview systemVariablesTour.js
 * Shepherd.js tour for the System Variables page (/oversight/tools/system-variables).
 * Walks through Location Classifications and Sub-location Types, their row
 * actions, and the add-row forms.
 *
 * @module systemVariablesTour
 */

import {
    createTour,
    navButtons,
    startButtons,
    finishButtons,
    registerTour,
} from "./tourBase.js";

/**
 * Builds and returns the System Variables tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildSystemVariablesTour() {
    const tour = createTour();

    const classRoot = document.getElementById("sv-classifications-root");
    const subTypeRoot = document.getElementById("sv-subtypes-root");
    const hasClassRows = !!classRoot?.querySelector(".sv-active-btn");
    const hasSubTypeRows = !!subTypeRoot?.querySelector(".sv-active-btn");

    const steps = [];

    steps.push({
        id: "sv-welcome",
        title: "System Variables",
        text: "This page manages the dynamic option lists used elsewhere in the app — right now that's the dropdowns on the Locations page. Changes here take effect immediately, everywhere those lists are used.",
        buttons: null,
    });

    steps.push({
        id: "sv-classifications",
        title: "Location Classifications",
        text: "Categorizes parking locations — Parking Garage, Parking Area, Kingdom Hall, and so on. This list feeds the classification dropdown when creating or editing a location.",
        attachTo: { element: "#sv-classifications-root", on: "top" },
        buttons: null,
    });

    if (hasClassRows) {
        steps.push({
            id: "sv-class-actions",
            title: "Row actions",
            text: "The <strong>Active</strong> toggle hides an entry from selection without deleting it — existing locations using it are unaffected. The pencil edits the name in place; the trash permanently deletes it, but only if nothing currently references it.",
            attachTo: { element: "#sv-classifications-root .sv-active-btn", on: "left" },
            buttons: null,
        });
    }

    steps.push({
        id: "sv-class-add",
        title: "Adding a classification",
        text: "Type a name and click <strong>Add</strong>, or press Enter. New entries are active by default and immediately available in the dropdown.",
        attachTo: { element: "#sv-class-add-btn", on: "top" },
        buttons: null,
    });

    steps.push({
        id: "sv-subtypes",
        title: "Sub-location Types",
        text: "Labels for named positions within a location — Entrance, Floor, Column, Desk. These feed the sub-location picker when building out a location's internal layout.",
        attachTo: { element: "#sv-subtypes-root", on: "top" },
        buttons: null,
    });

    steps.push({
        id: "sv-applies-to",
        title: '"Applies to"',
        text: 'Restrict a sub-location type to one classification — for example, "Floor" might only make sense for a Parking Garage. Leave it as <strong>(All classifications)</strong> to make the type available everywhere.',
        attachTo: { element: "#sv-subtype-add-parent", on: "top" },
        buttons: null,
    });

    if (hasSubTypeRows) {
        steps.push({
            id: "sv-subtype-actions",
            title: "Same row actions apply",
            text: "Active, edit, and delete work the same way here as in Classifications. If you try to delete a type that's already assigned to a location, you'll get an error telling you to deactivate it instead.",
            attachTo: { element: "#sv-subtypes-root .sv-active-btn", on: "left" },
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
 * Attaches the tour to #tourTriggerBtn on the System Variables page.
 *
 * @returns {void}
 */
export function initSystemVariablesTour() {
    const btn = document.getElementById("tourTriggerBtn");
    if (!btn) return;
    btn.addEventListener("click", () => buildSystemVariablesTour().start());
    registerTour("systemVariables", buildSystemVariablesTour);
}

initSystemVariablesTour();
