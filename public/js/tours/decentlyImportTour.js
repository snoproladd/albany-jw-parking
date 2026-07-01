/**
 * @fileoverview decentlyImportTour.js
 * Shepherd.js tour for the Decently Import page (/oversight/tools/decently-import).
 * Covers the upload/parse phase concretely, and describes the review and
 * apply phases narratively since they only exist after a real CSV has
 * been parsed.
 *
 * @module decentlyImportTour
 */

import {
    createTour,
    navButtons,
    startButtons,
    finishButtons,
    registerTour,
} from "./tourBase.js";

/**
 * Builds and returns the Decently Import tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildDecentlyImportTour() {
    const tour = createTour();

    const inReview = !document.getElementById("phase-review")?.classList.contains("d-none");

    const steps = [];

    steps.push({
        id: "di-welcome",
        title: "Decently Import",
        text: "Uploads an approved volunteer CSV from Decently and syncs it against this app's records — matching by name, email, and phone, then setting active/inactive status accordingly.",
        buttons: null,
    });

    steps.push({
        id: "di-upload",
        title: "Upload",
        text: "The CSV must include <strong>Name</strong>, <strong>Email</strong>, and <strong>Phone</strong> columns. Selecting a file enables the button below.",
        attachTo: { element: "#csvFileInput", on: "bottom" },
        buttons: null,
    });

    steps.push({
        id: "di-parse",
        title: "Parse & Match",
        text: "Runs the matching logic against every volunteer already in the database and moves you into the review screen — nothing is changed in the database yet at this step.",
        attachTo: { element: "#parseBtn", on: "bottom" },
        buttons: null,
    });

    if (inReview) {
        steps.push({
            id: "di-matched",
            title: "Exact Matches",
            text: "CSV rows that matched a database volunteer with high confidence. These will be marked active and logged as imported once you apply.",
            attachTo: { element: "#matchedSection", on: "top" },
            buttons: null,
        });

        steps.push({
            id: "di-fuzzy",
            title: "Close Matches",
            text: "Rows that partially matched — you choose the correct volunteer from a dropdown for each one, or pick Skip to treat it as unrecognised instead.",
            attachTo: { element: "#fuzzySection", on: "top" },
            buttons: null,
        });

        steps.push({
            id: "di-inactive",
            title: "Not in CSV",
            text: "Volunteers in the database who didn't appear anywhere in the uploaded CSV — these get marked inactive for the current year when you apply.",
            attachTo: { element: "#inactiveSection", on: "top" },
            buttons: null,
        });

        steps.push({
            id: "di-unmatched",
            title: "No DB Match Found",
            text: "CSV rows that couldn't be matched to any existing volunteer at all. After applying, you'll be offered the option to create new accounts for these.",
            attachTo: { element: "#unmatchedCsvSection", on: "top" },
            buttons: null,
        });

        steps.push({
            id: "di-apply",
            title: "Apply Import",
            text: "Commits everything above in one batch — exact and confirmed fuzzy matches go active, unmatched database volunteers go inactive. This is the one step that actually writes to the database.",
            attachTo: { element: "#applyBtn", on: "top" },
            buttons: null,
        });
    } else {
        steps.push({
            id: "di-review-concept",
            title: "The review screen",
            text: "After parsing, matches are grouped into four categories: <strong>Exact Matches</strong>, <strong>Close Matches</strong> needing your confirmation, database volunteers <strong>Not in CSV</strong> (marked inactive), and CSV rows with <strong>No DB Match</strong>. Nothing changes in the database until you click <strong>Apply Import</strong> at the bottom.",
            buttons: null,
        });
    }

    steps.push({
        id: "di-followup",
        title: "After applying",
        text: "If any CSV rows had no match, a modal offers to create accounts for them — email and phone get validated first, with invalid rows flagged. Once accounts are created, a second modal lets you send each new volunteer a welcome link to set their password.",
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
 * Attaches the tour to #tourTriggerBtn on the Decently Import page.
 *
 * @returns {void}
 */
export function initDecentlyImportTour() {
    const btn = document.getElementById("tourTriggerBtn");
    if (!btn) return;
    btn.addEventListener("click", () => buildDecentlyImportTour().start());
    registerTour("decentlyImport", buildDecentlyImportTour);
}

initDecentlyImportTour();
