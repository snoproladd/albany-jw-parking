/**
 * @fileoverview decentlyExportTour.js
 * Shepherd.js tour for the Decently Export page (/oversight/tools/decently-export).
 * Adapts to whichever of the page's two server-rendered states is
 * currently showing: no export generated yet, or one ready to download.
 *
 * @module decentlyExportTour
 */

import {
    createTour,
    navButtons,
    startButtons,
    finishButtons,
    registerTour,
} from "./tourBase.js";

/**
 * Builds and returns the Decently Export tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildDecentlyExportTour() {
    const tour = createTour();

    const hasCache = !!document.getElementById("downloadExportBtn");

    const steps = [];

    steps.push({
        id: "de-welcome",
        title: "Decently Export",
        text: "Generates a CSV of volunteers who haven't been sent to Decently yet, for the ongoing sync between this app and Decently's registration system.",
        buttons: null,
    });

    if (hasCache) {
        steps.push({
            id: "de-ready",
            title: "Ready to download",
            text: "An export is already generated and waiting — the count shown reflects how many volunteers are included.",
            attachTo: { element: "#downloadExportBtn", on: "bottom" },
            buttons: null,
        });

        steps.push({
            id: "de-download",
            title: "Download CSV",
            text: "Downloading marks every volunteer in this export as exported in the database — they won't appear in the next export unless something about their record changes again. The download link only works for your current session; log out before downloading and you'll need to regenerate.",
            attachTo: { element: "#downloadExportBtn", on: "bottom" },
            buttons: null,
        });

        steps.push({
            id: "de-regenerate",
            title: "Regenerate",
            text: "Re-runs the query for volunteers not yet exported, replacing the current pending list. Use this if volunteer records have changed since you last generated.",
            attachTo: { element: "#regenerateExportBtn", on: "bottom" },
            buttons: null,
        });
    } else {
        steps.push({
            id: "de-generate",
            title: "Generate Export",
            text: "Queries every volunteer not yet marked as exported. Nothing is marked exported at this step — you'll see the count first and get a chance to review before actually downloading.",
            attachTo: { element: "#generateExportBtn", on: "bottom" },
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
 * Attaches the tour to #tourTriggerBtn on the Decently Export page.
 *
 * @returns {void}
 */
export function initDecentlyExportTour() {
    const btn = document.getElementById("tourTriggerBtn");
    if (!btn) return;
    btn.addEventListener("click", () => buildDecentlyExportTour().start());
    registerTour("decentlyExport", buildDecentlyExportTour);
}

initDecentlyExportTour();
