/**
 * @fileoverview signsBuilderTour.js
 * Shepherd.js tour for the Sign Builder page (/signs/builder).
 *
 * @module signsBuilderTour
 */

import {
  createTour,
  navButtons,
  startButtons,
  finishButtons,
  registerTour,
} from "./tourBase.js";

/**
 * Builds and returns the Sign Builder tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildSignsBuilderTour() {
  const tour = createTour();
  const isEdit = !!document.getElementById("signsBuilderRoot")?.dataset.signId;

  const steps = [];

  steps.push({
    id: "sb-welcome",
    title: isEdit ? "Editing a sign template" : "Sign Builder",
    text: isEdit
      ? "You're editing an existing sign template. Changes apply everywhere this template is placed on the Sign Map. The live preview at the top updates as you type."
      : "The Sign Builder creates reusable sign templates. Templates are direction-agnostic — the arrow direction is set per-placement on the Sign Map. The preview at the top updates as you fill in the fields.",
    buttons: null,
  });

  steps.push({
    id: "sb-preview",
    title: "Live preview",
    text: "This is exactly how the sign will appear on map markers. The text, arrow, and category icon all update in real time as you change the fields below.",
    attachTo: { element: "#signBuilderPreview", on: "bottom" },
    buttons: null,
  });

  steps.push({
    id: "sb-text",
    title: "Sign text",
    text: 'The main text printed on the physical sign — "PARKING", "LOT FULL", "OVERFLOW", etc. Up to 100 characters. This is the only required field.',
    attachTo: { element: "#signTextInput", on: "bottom" },
    buttons: null,
  });

  steps.push({
    id: "sb-category",
    title: "Category",
    text: "Optional. Sets the icon shown on map markers: <strong>Parking</strong> (blue P), <strong>Accessible</strong> (♿), <strong>Drop-off/Pick-up</strong> (🧳), <strong>Info</strong> (ⓘ), or <strong>Warning</strong> (⚠). Leave blank for a plain sign.",
    attachTo: { element: "#signCategoryInput", on: "bottom" },
    buttons: null,
  });

  steps.push({
    id: "sb-description",
    title: "Description",
    text: "Optional notes about when or where this sign is used — visible on the Sign Library card. Useful when multiple templates have similar names.",
    attachTo: { element: "#signDescriptionInput", on: "top" },
    buttons: null,
  });

  steps.push({
    id: "sb-save",
    title: isEdit ? "Save changes" : "Create the sign",
    text: isEdit
      ? "Click <strong>Save changes</strong> to update the template and return to the Sign Library. All placements on the Sign Map will reflect the new text and category."
      : "Click <strong>Create sign</strong> to save the template and return to the Sign Library. The new template will be available for placement on the Sign Map.",
    attachTo: { element: "#signSaveBtn", on: "top" },
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
 * Attaches the tour to #tourTriggerBtn on the Sign Builder page.
 *
 * @returns {void}
 */
export function initSignsBuilderTour() {
  const btn = document.getElementById("tourTriggerBtn");
  if (!btn) return;
  btn.addEventListener("click", () => buildSignsBuilderTour().start());
  registerTour("signsBuilder", buildSignsBuilderTour);
}

initSignsBuilderTour();
