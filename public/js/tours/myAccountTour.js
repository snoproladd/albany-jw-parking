/**
 * @fileoverview myAccountTour.js
 * Shepherd.js tour for the My Account page (/my-account).
 * Walks through the accordion sections, the EDIT/SAVE staging pattern,
 * the read-only sections, and Finalize Changes.
 *
 * @module myAccountTour
 */

import {
    createTour,
    navButtons,
    startButtons,
    finishButtons,
    registerTour,
} from "./tourBase.js";

/**
 * Builds and returns the My Account tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildMyAccountTour() {
    const tour = createTour();

    const hasEditBtn = !!document.querySelector(".summary-edit-btn");
    const hasBlackouts = !!document.getElementById("headingBlackouts");
    const hasInvitations = !!document.getElementById("headingInvitations");

    const steps = [];

    steps.push({
        id: "ma-welcome",
        title: "My Account",
        text: "Your info is organized into accordion sections, each with its own <strong>EDIT</strong> button. Nothing reaches the server as you edit — every section you save is staged locally, and <strong>Finalize Changes</strong> at the bottom submits everything together in one request.",
        buttons: null,
    });

    steps.push({
        id: "ma-contact",
        title: "Contact",
        text: "Your name is locked here — contact overseer to change it. Email and phone are validated live when you edit them. The password change option also lives in this section, appearing once you click <strong>EDIT</strong> here.",
        attachTo: { element: "#headingContact", on: "bottom" },
        buttons: null,
    });

    if (hasEditBtn) {
        steps.push({
            id: "ma-edit-save",
            title: "EDIT becomes SAVE",
            text: "Click <strong>EDIT</strong> to unlock a section's fields. The same button becomes <strong>SAVE</strong> — click it again to stage your changes and lock the section back up, which also collapses it automatically. Some sections block the save until required fields are valid, like a working email or a complete visiting-congregation address.",
            attachTo: { element: ".summary-edit-btn", on: "left" },
            buttons: null,
        });
    }

    steps.push({
        id: "ma-other-sections",
        title: "Personal, Congregation, Spiritual, Notes",
        text: "The remaining editable sections follow the same pattern: <strong>Personal Info</strong> (birthdate, gender, stamina), <strong>Congregation Info</strong> (your assigned congregation or visiting details), <strong>Spiritual Info</strong> (privileges — some automatically disable others based on conflicting rules), and free-text <strong>Additional Notes</strong>.",
        attachTo: { element: "#accountAccordion", on: "top" },
        buttons: null,
    });

    if (hasBlackouts) {
        steps.push({
            id: "ma-blackouts",
            title: "My Availability",
            text: "Manage the dates and times you're unavailable directly from here — the same blackout timeline used by schedulers when assigning you to shifts.",
            attachTo: { element: "#headingBlackouts", on: "bottom" },
            buttons: null,
        });
    }

    if (hasInvitations) {
        steps.push({
            id: "ma-invitations",
            title: "Convention Invitations",
            text: "A read-only history of every shift invitation sent to you, your RSVP response, and when you responded — useful for checking what you've already said yes or no to.",
            attachTo: { element: "#headingInvitations", on: "bottom" },
            buttons: null,
        });
    }

    steps.push({
        id: "ma-finalize",
        title: "Finalize Changes",
        text: "Stays disabled until every section is locked — save or don't touch each one you're working on. Clicking this submits all your staged changes in a single request. Leaving the page with anything still unsaved triggers a browser warning so you don't lose your edits by accident.",
        attachTo: { element: "#finalize-changes", on: "top" },
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
 * Attaches the tour to #tourTriggerBtn on the My Account page.
 *
 * @returns {void}
 */
export function initMyAccountTour() {
    const btn = document.getElementById("tourTriggerBtn");
    if (!btn) return;
    btn.addEventListener("click", () => buildMyAccountTour().start());
    registerTour("myAccount", buildMyAccountTour);
}

initMyAccountTour();
