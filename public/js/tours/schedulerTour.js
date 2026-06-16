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
  registerTour,
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

  const steps = [];

  steps.push({
    id: "sc-welcome",
    title: "Scheduler",
    text: "The Scheduler is where you assign volunteers to shifts. Volunteers from the pool on the left get dragged into shift slots on the right. Start by picking a convention day.",
    buttons: null,
  });

  steps.push({
    id: "sc-day",
    title: "Select a convention day",
    text: "Choose a day here to load its shift grid. Only schedulable days appear in this list — if a day is missing, check that it's marked schedulable in Timelines.",
    attachTo: { element: "#dayPicker", on: "bottom" },
    buttons: null,
  });

  steps.push({
    id: "sc-search",
    title: "Search volunteers",
    text: "Type a name here to narrow the volunteer pool. Useful when you're looking for a specific person rather than scrolling the full list.",
    attachTo: { element: "#vol-search", on: "right" },
    buttons: null,
  });

  steps.push({
    id: "sc-filters",
    title: "Filter the pool",
    text: "Filter volunteers by rank, department, or how many times they've already been used today. Sorting by <strong>Usage (least first)</strong> is handy for spreading the load evenly.",
    attachTo: { element: "#vol-department-filter", on: "right" },
    buttons: null,
  });

  steps.push({
    id: "sc-pool",
    title: "Volunteer pool",
    text: "Active volunteers appear here as colored pills showing their name and crew badges. <strong>Drag a pill into any shift slot</strong> on the right to assign them — the pill stays in the pool so you can assign the same person to multiple non-overlapping shifts. An amber <strong>N×</strong> badge tracks how many slots they hold.",
    attachTo: { element: "#name-pool", on: "right" },
    buttons: null,
  });

  steps.push({
    id: "sc-drop-behavior",
    title: "Smart drop behavior",
    text: "Drops are smart. If you drop a pill on an <strong>occupied slot</strong> or a KM/KA slot the volunteer doesn't qualify for, it <strong>auto-routes to the first empty volunteer slot</strong> in the same shift. If the target shift overlaps an existing assignment or blackout window, a conflict modal lets you override or cancel. Security department drops bypass the modal.",
    buttons: null,
  });

  steps.push({
    id: "sc-grid",
    title: "The shift grid",
    text: dayLoaded
      ? "Shifts are organized by department and session. Drop zones are color-coded: <strong>pink</strong> = required, <strong>blue</strong> = ideal, <strong>grey</strong> = extra, with <strong>KM</strong> and <strong>KA</strong> slots for qualified roles. Short shifts show a gradient fade — <strong>hover for about a second</strong> to expand and see all slots."
      : "Once you select a day, shifts appear here organized by department and session. Drop zones are color-coded by urgency. Short shifts expand on hover to reveal all their slots.",
    attachTo: {
      element: dayLoaded ? "#daySchedule" : "#schedulerEmpty",
      on: "left",
    },
    buttons: null,
  });

  if (dayLoaded) {
    const undoBtn = document.getElementById("schedUndoBtn");
    if (undoBtn) {
      steps.push({
        id: "sc-undo-redo",
        title: "Undo and redo",
        text: "Every assignment and unassignment can be reversed. Click <strong>Undo</strong> (or <kbd>Ctrl+Z</kbd>) to step back. Click <strong>Redo</strong> (or <kbd>Ctrl+Y</kbd>) to re-apply. History clears when you switch days.",
        attachTo: { element: "#schedUndoBtn", on: "bottom" },
        buttons: null,
      });
    }

    const deptToggles = document.querySelector(".sched-dept-toggles");
    if (deptToggles) {
      steps.push({
        id: "sc-dept-toggles",
        title: "Department columns",
        text: "Click a department pill to <strong>hide</strong> that column — useful for focusing on one area. <strong>Drag</strong> a pill onto another to swap their column order. Hidden departments show a ⦸ indicator so you can bring them back.",
        attachTo: { element: ".sched-dept-toggles", on: "bottom" },
        buttons: null,
      });
    }
  }

  steps.push({
    id: "sc-context-menu",
    title: "Right-click for more",
    text: "<strong>Right-click any pill</strong> for a context menu with quick actions: remove from slot, view the volunteer's profile, see all their assignments for the day, highlight them on the grid, manage blackout windows, or copy their name.",
    buttons: null,
  });

  steps.push({
    id: "sc-report",
    title: "Check your coverage",
    text: "When you're done assigning, click the <strong>Report</strong> button in the day banner to see a printable summary of every shift — filled counts, gaps, and volunteer lists by department.",
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
  registerTour("scheduler", buildSchedulerTour);
}

initSchedulerTour();
