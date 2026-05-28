/**
 * @fileoverview tourBase.js
 * Shared Shepherd.js tour factory and button helpers.
 * All mini-tours in the app import from this module.
 *
 * Requires window.Shepherd to be available (shepherd.min.js must be loaded
 * as a plain <script> before any tour module runs).
 *
 * @module tourBase
 */

/**
 * Creates a pre-configured Shepherd.Tour instance with app-standard settings.
 *
 * @param {Object} [options={}] - Additional options merged into Shepherd.Tour config.
 * @returns {Shepherd.Tour}
 */
import Shepherd from 'https://cdn.jsdelivr.net/npm/shepherd.js@15.2.2/dist/js/shepherd.mjs';export function createTour(options = {}) {
  return new Shepherd.Tour({
    useModalOverlay: true,
    defaultStepOptions: {
      classes: "ajwp-tour-step",
      scrollTo: { behavior: "smooth", block: "center" },
      cancelIcon: { enabled: true },
      modalOverlayOpeningPadding: 8,
      modalOverlayOpeningRadius: 6,
      popperOptions: {
        modifiers: [{ name: "offset", options: { offset: [0, 12] } }],
      },
    },
    ...options,
  });
}

/**
 * Back + Next button pair for mid-tour steps.
 *
 * @param {Shepherd.Tour} tour
 * @returns {Object[]}
 */
export function navButtons(tour) {
  return [
    {
      text: "← Back",
      action: tour.back.bind(tour),
      classes: "ajwp-tour-btn ajwp-tour-btn--secondary",
    },
    {
      text: "Next →",
      action: tour.next.bind(tour),
      classes: "ajwp-tour-btn ajwp-tour-btn--primary",
    },
  ];
}

/**
 * Single start button for the first step (no Back).
 *
 * @param {Shepherd.Tour} tour
 * @returns {Object[]}
 */
export function startButtons(tour) {
  return [
    {
      text: "Let's go →",
      action: tour.next.bind(tour),
      classes: "ajwp-tour-btn ajwp-tour-btn--primary",
    },
  ];
}

/**
 * Back + Done button pair for the final step.
 *
 * @param {Shepherd.Tour} tour
 * @returns {Object[]}
 */
export function finishButtons(tour) {
  return [
    {
      text: "← Back",
      action: tour.back.bind(tour),
      classes: "ajwp-tour-btn ajwp-tour-btn--secondary",
    },
    {
      text: "Done ✓",
      action: tour.complete.bind(tour),
      classes: "ajwp-tour-btn ajwp-tour-btn--primary",
    },
  ];
}

/**
 * Single "Got it" button — for terminal steps that don't need a Back.
 *
 * @param {Shepherd.Tour} tour
 * @returns {Object[]}
 */
export function gotItButtons(tour) {
  return [
    {
      text: "Got it",
      action: tour.complete.bind(tour),
      classes: "ajwp-tour-btn ajwp-tour-btn--primary",
    },
  ];
}
