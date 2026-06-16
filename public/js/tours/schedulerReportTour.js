/**
 * @fileoverview schedulerReportTour.js
 * Shepherd.js mini-tour for the Scheduler Report page
 * (/oversight/tools/scheduler/report).
 *
 * @module schedulerReportTour
 */

import {
  createTour,
  navButtons,
  startButtons,
  finishButtons,
  registerTour,
} from "./tourBase.js";

/**
 * Builds the Scheduler Report tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildReportTour() {
  const tour = createTour();
  const hasReportData = !!document.querySelector(".report-dept");

  tour.addStep({
    id: "rp-welcome",
    title: "Scheduler Report",
    text: "This report shows the full schedule for a convention day — every department, shift, location, and assigned volunteer. Use it to verify coverage before the convention and to print or publish the final schedule.",
    buttons: startButtons(tour),
  });

  tour.addStep({
    id: "rp-day",
    title: "Select a day",
    text: "Switch between convention days here. The report reloads automatically when you pick a different day.",
    attachTo: { element: "#report-day-picker", on: "bottom" },
    buttons: navButtons(tour),
  });

  tour.addStep({
    id: "rp-filters",
    title: "Department filters",
    text: "Toggle individual departments on and off to focus on the section you're reviewing. Departments with no assigned volunteers are grayed out.",
    attachTo: { element: ".report-dept-filters", on: "bottom" },
    buttons: hasReportData ? navButtons(tour) : finishButtons(tour),
  });

  if (hasReportData) {
    tour.addStep({
      id: "rp-content",
      title: "Schedule content",
      text: "Departments are listed in sections, each with their shifts and locations. Volunteers are shown under their assigned location, with Keymen and Keyman Assistants labeled at the top of each spot.",
      attachTo: { element: ".report-dept", on: "top" },
      buttons: navButtons(tour),
    });
  }

  tour.addStep({
    id: "rp-print",
    title: "Print or save as PDF",
    text: "Click here to open the browser's print dialog. Choose <strong>Save as PDF</strong> to create a file you can share or keep on file.",
    attachTo: { element: "#report-print-btn", on: "bottom" },
    buttons: navButtons(tour),
  });

  tour.addStep({
    id: "rp-publish",
    title: "Publish the schedule",
    text: "Publish generates a PDF, uploads it to SharePoint, and sends an email and SMS notification to all overseers and scheduled volunteers. Use the <strong>Dry run</strong> option to upload without sending notifications.",
    attachTo: { element: "#report-publish-btn", on: "bottom" },
    buttons: finishButtons(tour),
  });

  return tour;
}

/**
 * Attaches the tour trigger to #tourTriggerBtn on the Scheduler Report page.
 *
 * @returns {void}
 */
export function initSchedulerReportTour() {
  const btn = document.getElementById("tourTriggerBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    buildReportTour().start();
  });
  registerTour("schedulerReport", buildReportTour);
}

initSchedulerReportTour();
