/**
 * @fileoverview schedulerTour.js
 * Shepherd.js mini-tour for the Scheduler page (/oversight/tools/scheduler).
 *
 * @module schedulerTour
 */

import {
  createTour,
  navButtons,
  startButtons,
  finishButtons,
} from "./tourBase.js";

/**
 * Builds the Scheduler tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildSchedulerTour() {
  const tour = createTour();
  const dayLoaded =
    document.getElementById("daySchedule") &&
    !document.getElementById("daySchedule").classList.contains("d-none");

  tour.addStep({
    id: "sc-welcome",
    title: "Scheduler",
    text: "The Scheduler is where you assign volunteers to shifts. Volunteers from the pool on the left get dragged into shift slots on the right. Start by picking a convention day.",
    buttons: startButtons(tour),
  });

  tour.addStep({
    id: "sc-day",
    title: "Select a convention day",
    text: "Choose a day here to load its shift grid. Only schedulable days appear in this list — if a day is missing, check that it's marked schedulable in Timelines.",
    attachTo: { element: "#dayPicker", on: "bottom" },
    buttons: navButtons(tour),
  });

  tour.addStep({
    id: "sc-search",
    title: "Search volunteers",
    text: "Type a name here to narrow the volunteer pool. Useful when you're looking for a specific person rather than scrolling the full list.",
    attachTo: { element: "#vol-search", on: "right" },
    buttons: navButtons(tour),
  });

  tour.addStep({
    id: "sc-filters",
    title: "Filter the pool",
    text: "Filter volunteers by rank, department, or how many times they've already been used today. Sorting by <strong>Usage (least first)</strong> is handy for spreading the load evenly.",
    attachTo: { element: "#vol-department-filter", on: "right" },
    buttons: navButtons(tour),
  });

  tour.addStep({
    id: "sc-pool",
    title: "Volunteer pool",
    text: "Active volunteers appear here as colored pills showing their name and crew badges. <strong>Drag a pill into any shift slot</strong> on the right to assign them. Drag them back out to unassign.",
    attachTo: { element: "#name-pool", on: "right" },
    buttons: navButtons(tour),
  });

  tour.addStep({
    id: "sc-grid",
    title: "The shift grid",
    text: dayLoaded
      ? "Shifts are organized by department and session. Each slot shows the location, volunteer target, and any currently assigned volunteers. Drop a volunteer pill here to fill the slot."
      : "Once you select a day, shifts appear here organized by department and session. Drop volunteer pills from the left into each slot to build out the schedule.",
    attachTo: {
      element: dayLoaded ? "#daySchedule" : "#schedulerEmpty",
      on: "left",
    },
    buttons: navButtons(tour),
  });

  tour.addStep({
    id: "sc-report",
    title: "Check your coverage",
    text: "When you're done assigning, head to the <strong>Scheduler Report</strong> (linked from the Oversight Tools menu) to see a bird's-eye view of every shift — filled counts, gaps, and a printable summary.",
    buttons: finishButtons(tour),
  });

  return tour;
}

/**
 * Attaches the tour trigger to #tourTriggerBtn on the Scheduler page.
 *
 * @returns {void}
 */
export function initSchedulerTour() {
  const btn = document.getElementById("tourTriggerBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    buildSchedulerTour().start();
  });
}

initSchedulerTour();
