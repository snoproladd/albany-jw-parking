/**
 * @fileoverview signsListTour.js
 * Shepherd.js tour for the Sign Library page (/signs).
 *
 * @module signsListTour
 */

import {
  createTour,
  navButtons,
  startButtons,
  finishButtons,
  registerTour,
} from "./tourBase.js";

/**
 * Builds and returns the Sign Library tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildSignsListTour() {
  const tour = createTour();

  const canManage = !!document.querySelector(".sign-card .btn-outline-danger");
  const hasCards = !!document.querySelector(".sign-card");

  const steps = [];

  steps.push({
    id: "sl-welcome",
    title: "Sign Library",
    text: 'The Sign Library is the catalog of every reusable sign template — things like "PARKING →" or "LOT FULL." Templates are direction-agnostic; the actual arrow direction is set per-placement on the Sign Map.',
    buttons: null,
  });

  steps.push({
    id: "sl-search",
    title: "Search",
    text: "Type any part of a sign name or description to filter the grid in real time.",
    attachTo: { element: "#signsSearchInput", on: "bottom" },
    buttons: null,
  });

  if (hasCards) {
    steps.push({
      id: "sl-card",
      title: "Sign cards",
      text: "Each card shows a live preview of the sign (text + arrow + category icon), a description, and how many placements currently use this template on the Sign Map.",
      attachTo: { element: ".sign-card", on: "right" },
      buttons: null,
    });
  }

  if (canManage) {
    steps.push({
      id: "sl-actions",
      title: "Edit and archive",
      text: "<strong>Edit</strong> opens the Sign Builder to modify the template. <strong>Archive</strong> soft-deletes the template — it stops appearing in the library and picker but existing placements are preserved.",
      attachTo: { element: ".sign-card .btn-outline-danger", on: "top" },
      buttons: null,
    });

    steps.push({
      id: "sl-new",
      title: "Create a new sign",
      text: "Click <strong>New sign</strong> to open the Sign Builder and create a template from scratch. Once saved, it becomes available for placement on the Sign Map.",
      attachTo: { element: 'a[href="/signs/builder"]', on: "bottom" },
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
 * Attaches the tour to #tourTriggerBtn on the Sign Library page.
 *
 * @returns {void}
 */
export function initSignsListTour() {
  const btn = document.getElementById("tourTriggerBtn");
  if (!btn) return;
  btn.addEventListener("click", () => buildSignsListTour().start());
  registerTour("signsList", buildSignsListTour);
}

initSignsListTour();
