/**
 * @fileoverview countsTour.js
 * Shepherd.js tour for the Parking Counter page (/counts).
 * Two paths depending on page state: a short setup-panel walkthrough
 * before counting starts, and a short counting-panel walkthrough once
 * a session is active — kept intentionally brief given this is a
 * phone-first, high-focus field tool.
 *
 * @module countsTour
 */

import {
    createTour,
    navButtons,
    startButtons,
    finishButtons,
    registerTour,
} from "./tourBase.js";

/**
 * Builds the setup-panel tour, shown before a counting session starts.
 *
 * @returns {Shepherd.Tour}
 */
function buildSetupTour() {
    const tour = createTour();

    const hasSubLocation = !!document.getElementById("subLocationWrap");

    const steps = [];

    steps.push({
        id: "co-welcome",
        title: "Parking Counter",
        text: "A phone-first tally tool for counting cars at your assigned location. This quick setup only takes a moment — once you start counting, it's a single big button.",
        buttons: null,
    });

    steps.push({
        id: "co-day-location",
        title: "Day and location",
        text: "Today's convention day is detected automatically when possible — otherwise pick it manually. Then choose your assigned parking location from the dropdown.",
        attachTo: { element: "#locationSelect", on: "bottom" },
        buttons: null,
    });

    if (hasSubLocation) {
        steps.push({
            id: "co-sublocation",
            title: "Entrance or section",
            text: "If your location has multiple entrances or sections defined, pick the specific one you're counting — this only appears when relevant.",
            attachTo: { element: "#subLocationWrap", on: "bottom" },
            buttons: null,
        });
    }

    steps.push({
        id: "co-alarm",
        title: "Quarter-hour alarm",
        text: "Fires every 15 minutes as a reminder to confirm your count — the interval itself is fixed, but you can choose sound, vibration, both, or off. Use <strong>Test</strong> to hear it before you start, and check your volume if you pick a sound mode — the app can't read your device volume for you.",
        attachTo: { element: "#alarmModeSelect", on: "bottom" },
        buttons: null,
    });

    steps.push({
        id: "co-start",
        title: "Start Counting",
        text: "Becomes active once day, location, and (if shown) entrance are all selected. If you picked a sound alarm mode, you'll get a one-time volume check before counting begins.",
        attachTo: { element: "#startBtn", on: "top" },
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
 * Builds the counting-panel tour, shown once a session is active.
 *
 * @returns {Shepherd.Tour}
 */
function buildCountingTour() {
    const tour = createTour();

    const steps = [];

    steps.push({
        id: "co-count-welcome",
        title: "You're counting",
        text: "Tap the big button once per car. Your count is a running total that keeps climbing — it never resets on its own, so you can tap freely without worrying about losing your place.",
        buttons: null,
    });

    steps.push({
        id: "co-tap",
        title: "Tap to count",
        text: "Each tap adds one and plays a short beep. Use the &minus;1 bar just below it to correct an accidental over-tap.",
        attachTo: { element: "#tapBtn", on: "bottom" },
        buttons: null,
    });

    steps.push({
        id: "co-submit",
        title: "Submit",
        text: "Confirms your current running total as an official checkpoint — it does <strong>not</strong> reset your count, so you keep tapping right after. Submit whenever you're asked to, typically on the quarter hour.",
        attachTo: { element: "#submitBtn", on: "top" },
        buttons: null,
    });

    steps.push({
        id: "co-manual",
        title: "Manual Count Submission",
        text: "If you're also using a physical clicker or separate counter, fold that number in here instead of re-tapping it — it adds to your running total rather than replacing it. Negative values are accepted too, for correcting an overcount.",
        attachTo: { element: "#manualToggleBtn", on: "top" },
        buttons: null,
    });

    steps.push({
        id: "co-change",
        title: "Switching locations",
        text: "Use <strong>Change</strong> up top if you need to switch location or entrance — this resets your running total for the new session.",
        attachTo: { element: "#changeSetupBtn", on: "bottom" },
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
 * Builds the appropriate tour based on whether the setup panel or the
 * counting panel is currently visible.
 *
 * @returns {Shepherd.Tour}
 */
function buildCountsTour() {
    const countingPanel = document.getElementById("countingPanel");
    const isCounting = countingPanel && !countingPanel.classList.contains("d-none");
    return isCounting ? buildCountingTour() : buildSetupTour();
}

/**
 * Attaches the tour to #tourTriggerBtn on the Parking Counter page.
 *
 * @returns {void}
 */
export function initCountsTour() {
    const btn = document.getElementById("tourTriggerBtn");
    if (!btn) return;
    btn.addEventListener("click", () => buildCountsTour().start());
    registerTour("counts", buildCountsTour);
}

initCountsTour();
