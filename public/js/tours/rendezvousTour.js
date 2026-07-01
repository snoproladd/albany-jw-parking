/**
 * @fileoverview rendezvousTour.js
 * Shepherd.js tour for the Rendezvous Points page (/oversight/tools/rendezvous).
 * Walks through the event-type filter, day accordions, rendezvous cards, and
 * the floating editor panel.
 *
 * @module rendezvousTour
 */

import {
    createTour,
    navButtons,
    startButtons,
    finishButtons,
    registerTour,
} from "./tourBase.js";

/**
 * Expands the first day accordion by clicking its header, then polls for
 * its content to finish loading (cards or the empty-state message) so the
 * next step has something to attach to. Resolves after a 3s timeout
 * regardless, to avoid stalling the tour if the fetch is slow.
 *
 * @returns {Promise<void>}
 */
function openFirstRendezvousDay() {
    return new Promise((resolve) => {
        const header = document.querySelector(".rv-landing-day-header");
        const dayId = header?.dataset.dayId;
        const body = dayId ? document.getElementById(`rvDay-${dayId}`) : null;
        if (!header || !body) {
            resolve();
            return;
        }
        if (!body.classList.contains("d-none") && body.children.length) {
            resolve();
            return;
        }
        header.click();
        const start = Date.now();
        const poll = setInterval(() => {
            const loaded = body.querySelector(".rv-landing-card, .rv-empty");
            if (loaded || Date.now() - start > 3000) {
                clearInterval(poll);
                resolve();
            }
        }, 100);
    });
}

/**
 * Builds and returns the Rendezvous Points tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildRendezvousTour() {
    const tour = createTour();

    const steps = [];

    steps.push({
        id: "rv-welcome",
        title: "Rendezvous Points",
        text: "A rendezvous point is the exact meet-up spot for one volunteer's shift assignment — description, address, floor, a GPS pin, and an optional photo. It's sent automatically with that volunteer's T-15 shift alert SMS, so they know exactly where to go without guessing.",
        buttons: null,
    });

    steps.push({
        id: "rv-filter",
        title: "Filter by shift type",
        text: "Narrow the list to one event type — useful when you're only setting up rendezvous points for a specific department like Security or Ingress.",
        attachTo: { element: "#rvEventFilter", on: "bottom" },
        buttons: null,
    });

    steps.push({
        id: "rv-days",
        title: "Convention days",
        text: "Click a day to expand it. Every scheduled shift assignment for that day loads on first click, and the badge on the header updates with a live count once it's loaded.",
        attachTo: { element: "#rvDaysContainer", on: "top" },
        beforeShowPromise: openFirstRendezvousDay,
        buttons: null,
    });

    steps.push({
        id: "rv-cards",
        title: "Rendezvous cards",
        text: "Each card is one shift-and-location pairing. Click a card to open the editor panel where you can view or set that meet-up's details.",
        buttons: null,
    });

    steps.push({
        id: "rv-panel",
        title: "The editor panel",
        text: "Fields cover <strong>Description</strong>, <strong>Address</strong>, <strong>Floor</strong>, and <strong>GPS coordinates</strong> — the GPS button captures your current device location directly into the lat/lng fields. You can attach a photo, and clear it later if needed. Creating a point requires <strong>Overseer+</strong>, editing requires <strong>Keyman+</strong>, and deleting requires <strong>Overseer+</strong>.",
        buttons: null,
    });

    steps.push({
        id: "rv-guard",
        title: "The T-15 time guard",
        text: "Editing locks entirely once a shift is well underway. In the window right before a shift starts, saving a change triggers a confirmation and sends an update alert SMS to every volunteer already assigned — so nobody misses a last-minute change to where they're meeting.",
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
 * Attaches the tour to #tourTriggerBtn on the Rendezvous Points page.
 *
 * @returns {void}
 */
export function initRendezvousTour() {
    const btn = document.getElementById("tourTriggerBtn");
    if (!btn) return;
    btn.addEventListener("click", () => buildRendezvousTour().start());
    registerTour("rendezvous", buildRendezvousTour);
}

initRendezvousTour();
