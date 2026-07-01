/**
 * @fileoverview shiftAlertsTour.js
 * Shepherd.js tour for the Shift Alerts page (/oversight/tools/shift-alerts).
 * Walks through the Schedules/Send Log tabs, the new-schedule form (offcanvas),
 * schedule card actions, and the send log filters.
 *
 * @module shiftAlertsTour
 */

import {
    createTour,
    navButtons,
    startButtons,
    finishButtons,
    registerTour,
} from "./tourBase.js";

/**
 * Opens the new-schedule offcanvas by clicking the New Schedule button.
 * Resolves once Bootstrap reports the offcanvas fully shown.
 *
 * @returns {Promise<void>}
 */
function openShiftAlertsForm() {
    return new Promise((resolve) => {
        const btn = document.getElementById("saNewScheduleBtn");
        const el = document.getElementById("saOffcanvas");
        if (!btn || !el) {
            resolve();
            return;
        }
        if (el.classList.contains("show")) {
            resolve();
            return;
        }
        el.addEventListener("shown.bs.offcanvas", () => resolve(), { once: true });
        btn.click();
    });
}

/**
 * Closes the new-schedule offcanvas if it is currently open.
 *
 * @returns {void}
 */
function closeShiftAlertsForm() {
    const el = document.getElementById("saOffcanvas");
    if (el && el.classList.contains("show")) {
        bootstrap.Offcanvas.getInstance(el)?.hide();
    }
}

/**
 * Activates a Bootstrap tab by its trigger id. Resolves immediately if the
 * tab is already active, otherwise waits for Bootstrap's "shown.bs.tab"
 * event before resolving so subsequent DOM queries see the switched pane.
 *
 * @param {string} triggerId - id of the tab trigger button (e.g. "sa-log-tab")
 * @returns {Promise<void>}
 */
function activateTab(triggerId) {
    return new Promise((resolve) => {
        const trigger = document.getElementById(triggerId);
        if (!trigger) {
            resolve();
            return;
        }
        if (trigger.classList.contains("active")) {
            resolve();
            return;
        }
        trigger.addEventListener("shown.bs.tab", () => resolve(), { once: true });
        bootstrap.Tab.getOrCreateInstance(trigger).show();
    });
}

/**
 * Builds and returns the Shift Alerts tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildShiftAlertsTour() {
    const tour = createTour();

    const hasCards = !!document.querySelector(".sa-schedule-card");
    const hasSendBtn = !!document.querySelector('[data-action="send"]');
    const hasDeleteBtn = !!document.querySelector('[data-action="delete"]');

    const steps = [];

    steps.push({
        id: "sa-welcome",
        title: "Shift Alerts",
        text: "Shift Alerts sends automated SMS reminders to scheduled volunteers. There are two kinds: timed <strong>burst</strong> alerts (Next Day, Same Day, All Upcoming) that fire once at a scheduled time, and the <strong>T-15 Rolling</strong> alert that fires automatically 15 minutes before every shift.",
        buttons: null,
    });

    steps.push({
        id: "sa-tabs",
        title: "Schedules and Send Log",
        text: "This page has two tabs. <strong>Schedules</strong> manages your alert configurations. <strong>Send Log</strong> shows a record of every SMS actually sent, with delivery status.",
        attachTo: { element: "#saTab", on: "bottom" },
        buttons: null,
    });

    steps.push({
        id: "sa-new",
        title: "New Schedule",
        text: "Click here to create a schedule. Click <strong>Next</strong> and the tour will open the form for you.",
        attachTo: { element: "#saNewScheduleBtn", on: "bottom" },
        beforeShowPromise: () => activateTab("sa-schedules-tab"),
        buttons: null,
    });

    steps.push({
        id: "sa-category",
        title: "Name and category",
        text: 'Give the schedule a descriptive <strong>Name</strong>, then pick a <strong>Category</strong>. <strong>Next Day</strong> and <strong>Same Day</strong> target shifts relative to the fire date. <strong>All Upcoming</strong> sends one message listing every remaining shift. <strong>T-15 Rolling</strong> ignores the fire date entirely and fires per-shift automatically.',
        attachTo: { element: "#saFormCategory", on: "left" },
        beforeShowPromise: () => activateTab("sa-schedules-tab").then(openShiftAlertsForm),
        buttons: null,
    });

    steps.push({
        id: "sa-fire-time",
        title: "Fire date and time",
        text: "Set when the burst alert goes out, in Eastern time — it's converted to UTC automatically. This row hides itself for T-15 Rolling schedules since those fire relative to each shift instead of a fixed time.",
        attachTo: { element: "#saFireDateWrap", on: "top" },
        beforeShowPromise: () => activateTab("sa-schedules-tab").then(openShiftAlertsForm),
        buttons: null,
    });

    steps.push({
        id: "sa-departments",
        title: "Departments",
        text: "Limit the alert to specific departments, or leave all unchecked to include everyone. <strong>Include volunteers with no department set</strong> is checked by default — uncheck it if you only want to reach volunteers with a department explicitly assigned.",
        attachTo: { element: ".sa-dept-check", on: "top" },
        beforeShowPromise: () => activateTab("sa-schedules-tab").then(openShiftAlertsForm),
        buttons: null,
    });

    steps.push({
        id: "sa-override",
        title: "Message override",
        text: "Leave this blank to use the default template for the selected category, or write a custom message using the placeholder tokens shown below. The preview updates live as you type, and a warning appears here if your override is missing a placeholder the category needs.",
        attachTo: { element: "#saFormOverride", on: "top" },
        beforeShowPromise: () => activateTab("sa-schedules-tab").then(openShiftAlertsForm),
        when: { hide: closeShiftAlertsForm },
        buttons: null,
    });

    if (hasCards) {
        steps.push({
            id: "sa-cards",
            title: "Schedule cards",
            text: "Each card shows the schedule's category, fire time, departments, and active status. Click <strong>Next Alert Preview</strong> at the bottom of a card to see exactly which volunteers and shifts the next send will reach.",
            attachTo: { element: ".sa-schedule-card", on: "top" },
            beforeShowPromise: () => activateTab("sa-schedules-tab"),
            buttons: null,
        });

        if (hasSendBtn) {
            steps.push({
                id: "sa-send-now",
                title: "Send Now",
                text: "Manually fires a burst alert immediately, skipping the scheduled time. Volunteers already alerted for this send are automatically excluded — this won't double-text anyone. Not available for T-15 Rolling schedules since those fire per-shift.",
                attachTo: { element: '[data-action="send"]', on: "left" },
                beforeShowPromise: () => activateTab("sa-schedules-tab"),
                buttons: null,
            });
        }

        steps.push({
            id: "sa-toggle",
            title: "Deactivate and Reactivate",
            text: "Deactivating a schedule stops it from firing without deleting it or its history — the card grays out and a <strong>Reactivate</strong> button takes its place. Only deactivated schedules can be permanently deleted.",
            attachTo: { element: '[data-action="toggle"]', on: "left" },
            beforeShowPromise: () => activateTab("sa-schedules-tab"),
            buttons: null,
        });

        if (hasDeleteBtn) {
            steps.push({
                id: "sa-delete",
                title: "Delete",
                text: "Permanently removes a deactivated schedule and every log entry tied to it. This cannot be undone — deactivate first if you might want the history later.",
                attachTo: { element: '[data-action="delete"]', on: "left" },
                beforeShowPromise: () => activateTab("sa-schedules-tab"),
                buttons: null,
            });
        }
    }

    steps.push({
        id: "sa-log-tab",
        title: "Send Log",
        text: "Switch to this tab to see every message actually sent, filterable by status and by schedule. Each row shows the volunteer, shift, day, category, delivery status, and the Twilio message SID for troubleshooting.",
        attachTo: { element: "#sa-log-tab", on: "bottom" },
        beforeShowPromise: () => activateTab("sa-log-tab"),
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
 * Attaches the tour to #tourTriggerBtn on the Shift Alerts page.
 *
 * @returns {void}
 */
export function initShiftAlertsTour() {
    const btn = document.getElementById("tourTriggerBtn");
    if (!btn) return;
    btn.addEventListener("click", () => buildShiftAlertsTour().start());
    registerTour("shiftAlerts", buildShiftAlertsTour);
}

initShiftAlertsTour();
