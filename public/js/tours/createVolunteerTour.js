/**
 * @fileoverview createVolunteerTour.js
 * Shepherd.js tour for the Create Volunteer page (/oversight/tools/create-volunteer).
 * Walks through email/phone live validation, the congregation selector,
 * the visiting-congregation fields, and the submit/duplicate-check flow.
 *
 * @module createVolunteerTour
 */

import {
    createTour,
    navButtons,
    startButtons,
    finishButtons,
    registerTour,
} from "./tourBase.js";

/**
 * Selects "Not assigned" in the congregation dropdown to reveal the
 * visiting-congregation fields, dispatching a real change event so the
 * page's own JS handles the reveal.
 *
 * @returns {Promise<void>}
 */
function showVisitingFields() {
    return new Promise((resolve) => {
        const sel = document.getElementById("congSelect");
        if (!sel) {
            resolve();
            return;
        }
        if (sel.value === "no") {
            resolve();
            return;
        }
        sel.dataset.tourPrevValue = sel.value;
        sel.value = "no";
        sel.dispatchEvent(new Event("change"));
        setTimeout(resolve, 50);
    });
}

/**
 * Restores the congregation dropdown to whatever it was before the tour
 * changed it, re-dispatching change so the visiting fields hide again
 * if that's the correct state.
 *
 * @returns {void}
 */
function restoreCongSelect() {
    const sel = document.getElementById("congSelect");
    if (sel && sel.dataset.tourPrevValue !== undefined) {
        sel.value = sel.dataset.tourPrevValue;
        sel.dispatchEvent(new Event("change"));
        delete sel.dataset.tourPrevValue;
    }
}

/**
 * Builds and returns the Create Volunteer tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildCreateVolunteerTour() {
    const tour = createTour();

    const steps = [];

    steps.push({
        id: "cv-welcome",
        title: "Create Volunteer Account",
        text: "Manually creates a volunteer account — useful for phone registrations or walk-ins who can't complete the online form themselves. The temporary password is always <strong>LastName1914</strong> (case-sensitive), which the volunteer should change on first login.",
        buttons: null,
    });

    steps.push({
        id: "cv-email",
        title: "Email validation",
        text: "Email is checked live for deliverability as you type — a green check means it's confirmed deliverable. Addresses ending in <strong>@jwpub.org</strong> are blocked outright. The Create Account button stays disabled until this passes.",
        attachTo: { element: "#email", on: "bottom" },
        buttons: null,
    });

    steps.push({
        id: "cv-phone",
        title: "Phone validation",
        text: "The field auto-formats as you type into <strong>(555) 555-5555</strong>, and once you've entered 10 digits it's validated live against Twilio Lookup — confirming it's a real, reachable number before you can submit.",
        attachTo: { element: "#phone", on: "bottom" },
        buttons: null,
    });

    steps.push({
        id: "cv-congregation",
        title: "Congregation",
        text: "Pick from local Albany-area congregations, choose <strong>Not known</strong> if the volunteer will update it themselves later, or <strong>Not assigned</strong> for a visiting volunteer from elsewhere.",
        attachTo: { element: "#congSelect", on: "bottom" },
        buttons: null,
    });

    steps.push({
        id: "cv-visiting",
        title: "Visiting congregation details",
        text: "Selecting <strong>Not assigned</strong> reveals these fields — City, State, and Language — so you can record where a visiting volunteer is actually from.",
        attachTo: { element: "#visitingFields", on: "top" },
        beforeShowPromise: showVisitingFields,
        when: { hide: restoreCongSelect },
        buttons: null,
    });

    steps.push({
        id: "cv-submit",
        title: "Creating the account",
        text: "This stays disabled until both email and phone pass validation. On submit, the server also checks for close matches by email, phone, or name — if it finds any, a modal shows the potential duplicates so you can open and edit an existing record instead of creating a new one, or confirm <strong>Create New Anyway</strong> if it's genuinely a different person.",
        attachTo: { element: "#submitBtn", on: "top" },
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
 * Attaches the tour to #tourTriggerBtn on the Create Volunteer page.
 *
 * @returns {void}
 */
export function initCreateVolunteerTour() {
    const btn = document.getElementById("tourTriggerBtn");
    if (!btn) return;
    btn.addEventListener("click", () => buildCreateVolunteerTour().start());
    registerTour("createVolunteer", buildCreateVolunteerTour);
}

initCreateVolunteerTour();
