/**
 * @fileoverview permissionMatrixTour.js
 * Shepherd.js tour for the Permission Matrix page (/oversight/tools/permissions).
 * Walks through the effective-value concept, the grouped table, toggling a
 * permission, and the DB override badge.
 *
 * @module permissionMatrixTour
 */

import {
    createTour,
    navButtons,
    startButtons,
    finishButtons,
    registerTour,
} from "./tourBase.js";

/**
 * Builds and returns the Permission Matrix tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildPermissionMatrixTour() {
    const tour = createTour();

    const hasLockedToggle = !!document.querySelector(".perm-toggle[disabled]");
    const hasOverrideBadge = !!document.querySelector(".toggle-cell .badge");

    const steps = [];

    steps.push({
        id: "pm-welcome",
        title: "Permission Matrix",
        text: "This overrides the app's default role permissions at runtime — no code deploy needed. Changes here take effect the next time the affected volunteer logs in, not immediately for someone already signed in.",
        buttons: null,
    });

    steps.push({
        id: "pm-effective",
        title: "Effective values",
        text: "Every toggle shows the <strong>effective</strong> value — the factory default merged with any database override. A toggle that matches the factory default has no badge; one that's been changed shows the DB override badge next to it.",
        attachTo: { element: ".alert-info", on: "bottom" },
        buttons: null,
    });

    steps.push({
        id: "pm-table",
        title: "The table",
        text: "Permissions are grouped by category — Self, Scheduling, Maps, Volunteers, Messaging, Administration — with one column per role. Scroll horizontally to see every role; this page is built for a desktop-width screen.",
        attachTo: { element: ".perm-table", on: "top" },
        buttons: null,
    });

    steps.push({
        id: "pm-toggle",
        title: "Toggling a permission",
        text: "Click any switch to grant or revoke that permission for that role. It saves automatically — there's no separate Save button. A status badge briefly confirms Saving… then Saved.",
        attachTo: { element: ".perm-toggle", on: "top" },
        buttons: null,
    });

    if (hasOverrideBadge) {
        steps.push({
            id: "pm-override-badge",
            title: "DB override badge",
            text: 'The amber <i class="fa-solid fa-database"></i> badge marks a cell where the current value differs from the factory default — an active override. Toggling it back to the default value removes the badge automatically.',
            attachTo: { element: ".toggle-cell .badge", on: "top" },
            buttons: null,
        });
    }

    if (hasLockedToggle) {
        steps.push({
            id: "pm-locked",
            title: "One toggle is locked",
            text: "ADMIN's <strong>Manage roles</strong> permission is permanently locked on — it can't be toggled off, since removing it could lock every admin out of role management entirely.",
            attachTo: { element: ".perm-toggle[disabled]", on: "top" },
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
 * Attaches the tour to #tourTriggerBtn on the Permission Matrix page.
 *
 * @returns {void}
 */
export function initPermissionMatrixTour() {
    const btn = document.getElementById("tourTriggerBtn");
    if (!btn) return;
    btn.addEventListener("click", () => buildPermissionMatrixTour().start());
    registerTour("permissionMatrix", buildPermissionMatrixTour);
}

initPermissionMatrixTour();
