/**
 * @fileoverview oversightStructureTour.js
 * Shepherd.js tour for the Oversight Structure page (/oversight/tools/oversightstructure).
 * Walks through the tree editor, row fields, row actions, and saving.
 *
 * @module oversightStructureTour
 */

import {
    createTour,
    navButtons,
    startButtons,
    finishButtons,
    registerTour,
} from "./tourBase.js";

/**
 * Builds and returns the Oversight Structure tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildOversightStructureTour() {
    const tour = createTour();

    const hasRows = !!document.querySelector(".ch-row");

    const steps = [];

    steps.push({
        id: "os-welcome",
        title: "Oversight Structure",
        text: "This builds the reporting-structure tree shown on volunteers' home pages — who oversees what, and who's assigned to each role. It's an indent-based tree editor: no drag-and-drop, just buttons to move, indent, and outdent rows.",
        buttons: null,
    });

    steps.push({
        id: "os-add-root",
        title: "Add root node",
        text: "Adds a new top-level role — a node with no parent. Use this for the highest tiers of the structure, like an overall coordinator.",
        attachTo: { element: "#chAddRootBtn", on: "bottom" },
        buttons: null,
    });

    steps.push({
        id: "os-save",
        title: "Save order",
        text: "Nothing persists until you click this. Every edit — titles, assignments, reordering, indenting — stays local until you save, so feel free to restructure freely before committing.",
        attachTo: { element: "#chSaveBtn", on: "bottom" },
        buttons: null,
    });

    if (hasRows) {
        steps.push({
            id: "os-row",
            title: "A row",
            text: "Each row has a <strong>Role title</strong> you can type directly, and a dropdown to assign a volunteer to that role — or leave it <strong>— Unassigned —</strong>. Indentation shows the hierarchy: a row's depth is how many levels it sits below root.",
            attachTo: { element: ".ch-row", on: "bottom" },
            buttons: null,
        });

        steps.push({
            id: "os-actions",
            title: "Row actions",
            text: "↑ and ↓ reorder among siblings at the same level. → (Indent) makes a row a child of the row above it. ← (Outdent) promotes it back up a level. The plus icon adds a child directly under this row, and the trash deletes it — any children it has are promoted up to its own level rather than deleted with it.",
            attachTo: { element: ".ch-row-actions", on: "top" },
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
 * Attaches the tour to #tourTriggerBtn on the Oversight Structure page.
 *
 * @returns {void}
 */
export function initOversightStructureTour() {
    const btn = document.getElementById("tourTriggerBtn");
    if (!btn) return;
    btn.addEventListener("click", () => buildOversightStructureTour().start());
    registerTour("oversightStructure", buildOversightStructureTour);
}

initOversightStructureTour();
