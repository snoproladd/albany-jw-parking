/**
 * @fileoverview sendResetTour.js
 * Shepherd.js tour for the Send Links page (/oversight/tools/send-reset).
 * Walks through the Draft/Registered tabs, search, and the per-row
 * email/SMS send buttons with their 24-hour cooldown.
 *
 * @module sendResetTour
 */

import {
    createTour,
    navButtons,
    startButtons,
    finishButtons,
    registerTour,
} from "./tourBase.js";

/**
 * Builds and returns the Send Links tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildSendResetTour() {
    const tour = createTour();

    const visibleTable = document.querySelector(
        "#tabDraft:not(.d-none) table, #tabRegistered:not(.d-none) table",
    );
    const hasCooldownLabel = !!document.querySelector(
        "#tabDraft:not(.d-none) .fa-clock, #tabRegistered:not(.d-none) .fa-clock",
    );

    const steps = [];

    steps.push({
        id: "sr-welcome",
        title: "Send Links",
        text: "This page sends two different kinds of links depending on the tab: a <strong>resume link</strong> for incomplete draft registrations, or a <strong>password reset link</strong> for already-registered volunteers.",
        buttons: null,
    });

    steps.push({
        id: "sr-tabs",
        title: "Draft vs. Registered",
        text: "<strong>Draft Accounts</strong> lists volunteers who started registration but didn't finish — sending them a resume link lets them pick up where they left off, and shows which step they stopped on. <strong>Registered Accounts</strong> lists completed accounts — sending a link here is a standard password reset.",
        attachTo: { element: ".nav-tabs", on: "bottom" },
        buttons: null,
    });

    steps.push({
        id: "sr-search",
        title: "Search",
        text: "Filter either table by name or email as you type.",
        attachTo: { element: "#tableSearch", on: "bottom" },
        buttons: null,
    });

    if (visibleTable) {
        steps.push({
            id: "sr-table",
            title: "Sending a link",
            text: "Each row shows an <strong>Email</strong> and/or <strong>SMS</strong> button depending on what contact info is on file — click either to send that link through that channel. A volunteer with neither on file shows <strong>No contact info</strong> instead.",
            attachTo: { element: visibleTable === document.getElementById("draftTable") ? "#draftTable" : "#registeredTable", on: "top" },
            buttons: null,
        });
    }

    if (hasCooldownLabel) {
        steps.push({
            id: "sr-cooldown",
            title: "24-hour cooldown",
            text: "Once a link is sent through a channel, that button is replaced with a countdown for 24 hours — this prevents accidentally spamming the same volunteer with repeat links. The button reappears automatically once the cooldown expires.",
            attachTo: { element: ".fa-clock", on: "top" },
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
 * Attaches the tour to #tourTriggerBtn on the Send Links page.
 *
 * @returns {void}
 */
export function initSendResetTour() {
    const btn = document.getElementById("tourTriggerBtn");
    if (!btn) return;
    btn.addEventListener("click", () => buildSendResetTour().start());
    registerTour("sendReset", buildSendResetTour);
}

initSendResetTour();
