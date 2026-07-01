/**
 * @fileoverview volunteersTour.js
 * Shepherd.js mini-tour for the Volunteer Account Oversight page (/editVolunteer).
 *
 * Two tour paths depending on page state:
 *   Full tour (8 steps)     — launched when a volunteer profile is already loaded.
 *   Selector tour (4 steps) — launched when no volunteer is selected yet; walks
 *                             through the dropdown and filters, then prompts selection.
 *
 * Auto-initializes on module load. Attach to the page via:
 *   <script src="/vendor/shepherd/shepherd.min.js"></script>
 *   <script type="module" src="/js/tours/volunteersTour.js"></script>
 *
 * @module volunteersTour
 */

import {
  createTour,
  navButtons,
  startButtons,
  finishButtons,
  gotItButtons,
  registerTour,
} from "./tourBase.js";

// ─────────────────────────────────────────────────────────────────────────────
// Full tour — requires a volunteer to be selected
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the full 8-step tour shown when a volunteer profile is loaded.
 *
 * @returns {Shepherd.Tour}
 */
function buildFullTour() {
  const tour = createTour();

  tour.addStep({
    id: "welcome",
    title: "Volunteer Account Oversight",
    text: "This quick tour walks you through managing a volunteer's profile — activating them, setting their role and crew, updating their contact info, and saving your changes.",
    buttons: startButtons(tour),
  });

  tour.addStep({
    id: "selector",
    title: "Select a volunteer",
    text: "Use this dropdown to load any volunteer's profile. You can scroll the list or type a name to search.",
    attachTo: { element: "#volunteerSelect", on: "bottom" },
    buttons: navButtons(tour),
  });

  tour.addStep({
    id: "filter",
    title: "Filter the list",
    text: "Use <strong>All</strong>, <strong>Active</strong>, or <strong>Inactive</strong> to narrow the dropdown. Inactive volunteers haven't been enabled for this convention year yet.",
    attachTo: { element: '[aria-label="Active filter"]', on: "bottom" },
    buttons: navButtons(tour),
  });

  tour.addStep({
    id: "status",
    title: "Activate or deactivate",
    text: "Open the <strong>Status</strong> section to toggle whether this volunteer is active for the current year. A volunteer must be active before they can appear in scheduling or receive campaign messages.",
    attachTo: {
      element: 'button[data-bs-target="#collapseStatus"]',
      on: "bottom",
    },
    buttons: navButtons(tour),
  });

  tour.addStep({
    id: "assignment",
    title: "Role and crew",
    text: "Open <strong>Assignment &amp; Role</strong> to set the volunteer's app role (Registered or Keyman for overseers) and which parking crews they're assigned to. Crew assignments affect scheduling and reports.",
    attachTo: {
      element: 'button[data-bs-target="#collapseAssignment"]',
      on: "bottom",
    },
    buttons: navButtons(tour),
  });

  tour.addStep({
    id: "contact",
    title: "Contact information",
    text: "The <strong>Contact</strong> section holds the volunteer's phone number and email — the app uses these for SMS and email campaigns. Each section has an <strong>EDIT</strong> button; click it to unlock the fields before making changes.",
    attachTo: {
      element: 'button[data-bs-target="#collapseContact"]',
      on: "bottom",
    },
    buttons: navButtons(tour),
  });

  tour.addStep({
    id: "finalize",
    title: "Save your changes",
    text: "After making edits, click <strong>Finalize Changes</strong> to save everything. The button is grayed out until you've made a change — don't switch volunteers without clicking it first.",
    attachTo: { element: "#finalize-changes", on: "top" },
    buttons: navButtons(tour),
  });

  tour.addStep({
    id: "sms-tab",
    title: "SMS Management tab",
    text: "Switch to this tab to see every volunteer's SMS opt-in status and to manually adjust it — useful if someone isn't receiving text messages.",
    attachTo: { element: "#vao-sms-tab", on: "bottom" },
    buttons: finishButtons(tour),
  });

  return tour;
}

// ─────────────────────────────────────────────────────────────────────────────
// Selector tour — no volunteer loaded yet
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the short 4-step tour shown when no volunteer is selected yet.
 *
 * @returns {Shepherd.Tour}
 */
function buildSelectorTour() {
  const tour = createTour();

  tour.addStep({
    id: "welcome-no-vol",
    title: "Volunteer Account Oversight",
    text: "This page lets you manage any volunteer's profile. Start by selecting a volunteer from the dropdown — once you do, the full tour becomes available.",
    buttons: startButtons(tour),
  });

  tour.addStep({
    id: "selector-no-vol",
    title: "Select a volunteer first",
    text: "Click this dropdown and choose any volunteer from the list. You can scroll or type a name to search.",
    attachTo: { element: "#volunteerSelect", on: "bottom" },
    buttons: navButtons(tour),
  });

  tour.addStep({
    id: "filter-no-vol",
    title: "Filter the list",
    text: "Use <strong>All</strong>, <strong>Active</strong>, or <strong>Inactive</strong> to narrow the dropdown before selecting.",
    attachTo: { element: '[aria-label="Active filter"]', on: "bottom" },
    buttons: navButtons(tour),
  });

  tour.addStep({
    id: "prompt-select",
    title: "Ready when you are",
    text: "Select any volunteer from the dropdown above, then click <strong>Take a tour</strong> again to walk through their full profile.",
    buttons: gotItButtons(tour),
  });

  return tour;
}

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attaches the tour trigger to #tourTriggerBtn.
 * Detects whether a volunteer is already loaded and launches the appropriate tour.
 *
 * @returns {void}
 */
export function initVolunteersTour() {
  const btn = document.getElementById("tourTriggerBtn");
  if (!btn) return;

  /**
   * Builds the appropriate tour based on whether a volunteer
   * profile is currently loaded on the page.
   *
   * @returns {Shepherd.Tour}
   */
  const buildFn = () => {
    const volunteerLoaded = !!document.getElementById("accountAccordion");
    return volunteerLoaded ? buildFullTour() : buildSelectorTour();
  };

  btn.addEventListener("click", () => {
    buildFn().start();
  });
  registerTour("volunteers", buildFn);
}

initVolunteersTour();
