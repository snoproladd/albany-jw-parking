/**
 * @fileoverview mapsTour.js
 * Shepherd.js tour for the Maps page (/maps).
 * Walks through the section grouping, a standard file tile, and the
 * interactive-map embed variant when present.
 *
 * @module mapsTour
 */

import {
    createTour,
    navButtons,
    startButtons,
    finishButtons,
    registerTour,
} from "./tourBase.js";

/**
 * Builds and returns the Maps tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildMapsTour() {
    const tour = createTour();

    const hasSection = !!document.querySelector(".maps-section");
    const hasEmbedTile = !!document.querySelector(".maps-tile--has-embed");
    const hasTile = !!document.querySelector(".maps-tile");

    const steps = [];

    steps.push({
        id: "maps-welcome",
        title: "Maps",
        text: "Convention parking maps, pedestrian routes, sign placement guides, and other reference materials — organized into folders and kept in sync with the source files.",
        buttons: null,
    });

    if (hasSection) {
        steps.push({
            id: "maps-section",
            title: "Sections",
            text: "Each section corresponds to a folder — files are grouped exactly as they're organized at the source, so the structure here always matches.",
            attachTo: { element: ".maps-section", on: "top" },
            buttons: null,
        });
    }

    if (hasEmbedTile) {
        steps.push({
            id: "maps-embed",
            title: "Interactive maps",
            text: "Files with an interactive version show a live preview right in the tile. Click anywhere on the preview to open the full interactive map in a new tab.",
            attachTo: { element: ".maps-tile--has-embed", on: "top" },
            buttons: null,
        });
    }

    if (hasTile) {
        steps.push({
            id: "maps-actions",
            title: "Tile actions",
            text: '<strong>View / Download</strong> opens the file directly. When an interactive version exists, a second <strong>Interactive Map</strong> button opens that version specifically — useful when you want the clickable map rather than the static file.',
            attachTo: { element: ".maps-tile-actions", on: "top" },
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
 * Attaches the tour to #tourTriggerBtn on the Maps page.
 *
 * @returns {void}
 */
export function initMapsTour() {
    const btn = document.getElementById("tourTriggerBtn");
    if (!btn) return;
    btn.addEventListener("click", () => buildMapsTour().start());
    registerTour("maps", buildMapsTour);
}

initMapsTour();
