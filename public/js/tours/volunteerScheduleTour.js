/**
 * @fileoverview volunteerScheduleTour.js
 * Shepherd.js tour for the Volunteer Schedule report page, shared between
 * /my-schedule (self mode) and /oversight/tools/volunteer-schedule
 * (oversight mode).
 *
 * @module volunteerScheduleTour
 */

import {
    createTour,
    navButtons,
    startButtons,
    finishButtons,
    registerTour,
} from "./tourBase.js";

/**
 * Builds and returns the Volunteer Schedule tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildVolunteerScheduleTour() {
    const tour = createTour();

    const isOversight =
        document.querySelector('meta[name="vs-mode"]')?.content === "oversight";
    const hasVolunteer = !!document.getElementById("vs-send-btn");
    const hasAssignments = !!document.querySelector(".vs-assignment");

    const steps = [];

    steps.push({
        id: "vs-welcome",
        title: isOversight ? "Volunteer Schedule" : "My Schedule",
        text: isOversight
            ? "This is a printable, sendable schedule report for any volunteer — every assignment across all convention days, with location, role, and leader contact info."
            : "This is your personal schedule — every shift you're assigned to across all convention days, with location, role, and who's leading each one.",
        buttons: null,
    });

    if (isOversight) {
        steps.push({
            id: "vs-search",
            title: "Find a volunteer",
            text: "Type a name to search. Results appear as you type — select one to load their schedule below.",
            attachTo: { element: ".vs-search-wrap", on: "bottom" },
            buttons: null,
        });
    }

    steps.push({
        id: "vs-day-filter",
        title: "Day filter",
        text: "Narrow the report to a single convention day, or leave it on <strong>All Days</strong> to see everything at once.",
        attachTo: { element: ".vs-day-filter", on: "bottom" },
        buttons: null,
    });

    steps.push({
        id: "vs-crew-filter",
        title: "Crew filter",
        text: "Toggle department chips to show or hide assignments by crew. Chips for crews with no assignments on this schedule are grayed out and disabled.",
        attachTo: { element: ".vs-crew-filters", on: "bottom" },
        buttons: null,
    });

    steps.push({
        id: "vs-print",
        title: "Print",
        text: "Opens the browser print dialog with a print-optimized layout — useful for a physical copy at the welcome desk or in a keyman's binder.",
        attachTo: { element: "#vs-print-btn", on: "bottom" },
        buttons: null,
    });

    if (hasVolunteer) {
        steps.push({
            id: "vs-send",
            title: "Send",
            text: "Sends this schedule directly to the volunteer via SMS or email. Whichever channel they have on file is pre-selected, and either option is disabled if that contact method is missing.",
            attachTo: { element: "#vs-send-btn", on: "bottom" },
            buttons: null,
        });
    }

    if (hasAssignments) {
        steps.push({
            id: "vs-assignment",
            title: "Reading an assignment card",
            text: "Each card shows the shift label and time, a department badge, the location, and a role badge — <strong>Keyman</strong>, <strong>Keyman Asst</strong>, or <strong>Volunteer</strong>. When applicable, KM and KA contact rows show who's leading that shift, and a note icon surfaces any special instructions.",
            attachTo: { element: ".vs-assignment", on: "top" },
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
 * Attaches the tour to #tourTriggerBtn on the Volunteer Schedule page.
 *
 * @returns {void}
 */
export function initVolunteerScheduleTour() {
    const btn = document.getElementById("tourTriggerBtn");
    if (!btn) return;
    btn.addEventListener("click", () => buildVolunteerScheduleTour().start());
    registerTour("volunteerSchedule", buildVolunteerScheduleTour);
}

initVolunteerScheduleTour();
