/**
 * @fileoverview tourBase.js
 * Shared Shepherd.js tour factory, button helpers, and first-visit
 * prompt system. All mini-tours in the app import from this module.
 *
 * When any tour module loads, the universal tour button in the navbar
 * is unhidden. If the user has never visited the page before (no
 * dismissal row in the DB), a one-step Shepherd prompt highlights
 * the tour button and offers to start the walkthrough.
 *
 * @module tourBase
 */

import Shepherd from "https://cdn.jsdelivr.net/npm/shepherd.js@15.2.2/dist/js/shepherd.mjs";

/* ── Unhide the universal tour button ──────────────────────────── */

const _tourItem = document.getElementById("tourTriggerItem");
if (_tourItem) _tourItem.classList.remove("d-none");

/* ── Dismissal state (fetched once, cached) ────────────────────── */

/** @type {Set<string>|null} */
let _dismissals = null;

const _dismissalsReady = fetch("/api/tours/status")
  .then((r) => (r.ok ? r.json() : { dismissed: [] }))
  .then((data) => {
    _dismissals = new Set(data.dismissed);
  })
  .catch(() => {
    _dismissals = new Set();
  });

/**
 * Persists a tour dismissal to the server and local cache.
 *
 * @param {string} tourId — tour key or '_all'
 * @returns {Promise<void>}
 */
async function _dismiss(tourId) {
  _dismissals.add(tourId);
  try {
    await fetch("/api/tours/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tourId }),
    });
  } catch {
    /* best-effort */
  }
}

/* ── First-visit prompt ────────────────────────────────────────── */

/**
 * Shows a one-step Shepherd prompt highlighting the tour button.
 *
 * @param {string}   tourId  — tour key for dismissal
 * @param {Function} buildFn — returns a configured Shepherd.Tour
 */
function _showPrompt(tourId, buildFn) {
  const prompt = new Shepherd.Tour({
    useModalOverlay: true,
    defaultStepOptions: {
      classes: "ajwp-tour-step ajwp-tour-prompt",
      modalOverlayOpeningPadding: 10,
      modalOverlayOpeningRadius: 8,
      popperOptions: {
        modifiers: [{ name: "offset", options: { offset: [0, 14] } }],
      },
    },
  });

  prompt.addStep({
    id: "tour-prompt",
    title: "New here?",
    text: "This page has a guided tour — want a quick walkthrough?",
    attachTo: { element: "#tourTriggerBtn", on: "bottom" },
    buttons: [
      {
        text: "Take the tour",
        action() {
          prompt.complete();
          _dismiss(tourId);
          buildFn().start();
        },
        classes: "ajwp-tour-btn ajwp-tour-btn--primary",
      },
      {
        text: "Maybe later",
        action() {
          prompt.cancel();
        },
        classes: "ajwp-tour-btn ajwp-tour-btn--secondary",
      },
      {
        text: "Don't show again",
        action() {
          prompt.complete();
          _dismiss(tourId);
        },
        classes: "ajwp-tour-btn ajwp-tour-btn--secondary",
      },
      {
        text: "Disable all prompts",
        action() {
          prompt.complete();
          _dismiss("_all");
        },
        classes: "ajwp-tour-btn ajwp-tour-btn--secondary",
      },
    ],
  });

  prompt.start();
}

/* ── Public API ────────────────────────────────────────────────── */

/**
 * Creates a pre-configured Shepherd.Tour instance with app-standard settings.
 *
 * @param {Object} [options={}] - Additional options merged into Shepherd.Tour config.
 * @returns {Shepherd.Tour}
 */
export function createTour(options = {}) {
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
 * Registers a tour for first-visit prompt detection.
 * Call this from each tour module's init function after wiring the
 * click handler. If the user has never dismissed this tour, a
 * one-step prompt highlights the tour button.
 *
 * @param {string}   tourId  — stable key e.g. 'scheduler', 'signs-map'
 * @param {Function} buildFn — zero-arg function that returns a Shepherd.Tour
 * @returns {Promise<void>}
 */
export async function registerTour(tourId, buildFn) {
  await _dismissalsReady;
  if (_dismissals.has("_all") || _dismissals.has(tourId)) return;
  _showPrompt(tourId, buildFn);
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
