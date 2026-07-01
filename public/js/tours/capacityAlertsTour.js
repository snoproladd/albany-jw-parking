/**
 * @fileoverview capacityAlertsTour.js
 * Shepherd.js tour for the Capacity Alerts page (/oversight/tools/capacity-alerts).
 * Walks through the New Rule form (modal), the rules table, and the send log.
 *
 * @module capacityAlertsTour
 */

import {
    createTour,
    navButtons,
    startButtons,
    finishButtons,
    registerTour,
} from "./tourBase.js";

/**
 * Opens the rule editor modal by clicking the New Rule button.
 * Resolves once Bootstrap reports the modal fully shown.
 *
 * @returns {Promise<void>}
 */
function openCapacityRuleForm() {
    return new Promise((resolve) => {
        const btn = document.getElementById("ca-new-rule-btn");
        const el = document.getElementById("ca-rule-modal");
        if (!btn || !el) {
            resolve();
            return;
        }
        if (el.classList.contains("show")) {
            resolve();
            return;
        }
        el.addEventListener("shown.bs.modal", () => resolve(), { once: true });
        btn.click();
    });
}

/**
 * Closes the rule editor modal if it is currently open.
 *
 * @returns {void}
 */
function closeCapacityRuleForm() {
    const el = document.getElementById("ca-rule-modal");
    if (el && el.classList.contains("show")) {
        bootstrap.Modal.getInstance(el)?.hide();
    }
}

/**
 * Builds and returns the Capacity Alerts tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildCapacityAlertsTour() {
    const tour = createTour();

    const hasRules = !!document.querySelector(".ca-edit-btn");

    const steps = [];

    steps.push({
        id: "ca-welcome",
        title: "Capacity Alerts",
        text: "Capacity Alerts sends an SMS to the selected role tier the moment a location's parking count crosses a threshold. Once a rule fires, it re-arms automatically only after the count returns to the safe side — so you won't get spammed while a lot hovers near the line.",
        buttons: null,
    });

    steps.push({
        id: "ca-new-rule",
        title: "New Rule",
        text: "Click here to create a rule. Click <strong>Next</strong> and the tour will open the form for you.",
        attachTo: { element: "#ca-new-rule-btn", on: "bottom" },
        buttons: null,
    });

    steps.push({
        id: "ca-location",
        title: "Location and sub-location",
        text: "Pick the location this rule watches. If that location has sub-locations defined, you can optionally scope the rule to just one of them — leave it as <strong>Whole location</strong> to watch the combined count instead.",
        attachTo: { element: "#ca-location", on: "right" },
        beforeShowPromise: openCapacityRuleForm,
        buttons: null,
    });

    steps.push({
        id: "ca-threshold",
        title: "Threshold",
        text: "Choose <strong>% of capacity</strong> to set a threshold relative to the location's defined capacity, or <strong>Raw count</strong> to use an exact vehicle number regardless of capacity.",
        attachTo: { element: "#ca-threshold-type", on: "right" },
        buttons: null,
    });

    steps.push({
        id: "ca-direction",
        title: "Direction",
        text: "<strong>Rising to/above</strong> fires when the count climbs to or past the threshold — useful for a \"lot is filling up\" warning. <strong>Dropping to/below</strong> fires when the count falls back to or under it — useful for an \"all clear\" or reopening notice.",
        attachTo: { element: "#ca-direction", on: "right" },
        buttons: null,
    });

    steps.push({
        id: "ca-notify",
        title: "Notify",
        text: "Choose the minimum role tier that should receive this alert. The message goes to every active volunteer at or above the selected role — <strong>Admin only</strong> is the narrowest option, <strong>Overseer and above</strong> the widest.",
        attachTo: { element: "#ca-recipient-role", on: "right" },
        buttons: null,
    });

    steps.push({
        id: "ca-override",
        title: "Custom message and Active",
        text: "Leave the message blank to use the default alert text, or write your own. Uncheck <strong>Active</strong> to save a rule without it firing yet — useful for setting up rules ahead of the convention before you're ready to arm them.",
        attachTo: { element: "#ca-message-override", on: "top" },
        when: { hide: closeCapacityRuleForm },
        buttons: null,
    });

    if (hasRules) {
        steps.push({
            id: "ca-rules-table",
            title: "Rules table",
            text: "Every rule is listed here with its location, threshold, direction, and recipients. The <strong>Status</strong> column shows <strong>Armed</strong> (ready to fire), <strong>Waiting to re-arm</strong> (already fired, waiting for the count to return to the safe side), or <strong>Inactive</strong>.",
            attachTo: { element: "#ca-rules-table", on: "top" },
            buttons: null,
        });

        steps.push({
            id: "ca-edit",
            title: "Editing a rule",
            text: "Click <strong>Edit</strong> on any row to open the same form pre-filled with that rule's settings, including a <strong>Delete</strong> button in edit mode.",
            attachTo: { element: ".ca-edit-btn", on: "left" },
            buttons: null,
        });
    }

    steps.push({
        id: "ca-log",
        title: "Recent Sends",
        text: "This log shows every capacity alert actually sent — when, which location, the count that triggered it, how many recipients, and delivery status. Use it to confirm a rule fired as expected.",
        attachTo: { element: "#ca-log-table", on: "top" },
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
 * Attaches the tour to #tourTriggerBtn on the Capacity Alerts page.
 *
 * @returns {void}
 */
export function initCapacityAlertsTour() {
    const btn = document.getElementById("tourTriggerBtn");
    if (!btn) return;
    btn.addEventListener("click", () => buildCapacityAlertsTour().start());
    registerTour("capacityAlerts", buildCapacityAlertsTour);
}

initCapacityAlertsTour();
