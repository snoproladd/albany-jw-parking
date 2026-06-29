/**
 * @file schedulerReport.js
 * @description UI controls for the schedule report page:
 * department visibility filters, day-picker form submission, print,
 * and publish (delegated to schedulerPublish.js modal).
 */

import {
  attachPublishTrigger,
  setPublishCurrentDayId,
} from "./schedulerPublish.js";

document.addEventListener("DOMContentLoaded", () => {
  /**
   * Toggle a department section's visibility when its filter checkbox changes.
   *
   * @param {Event} e
   * @returns {void}
   */
  function onFilterChange(e) {
    const deptKey = e.currentTarget.dataset.dept;
    const section = document.querySelector(
      `.report-dept[data-dept="${deptKey}"]`,
    );
    if (section) section.style.display = e.currentTarget.checked ? "" : "none";
  }

  document.querySelectorAll(".dept-filter-cb").forEach((cb) => {
    cb.addEventListener("change", onFilterChange);
  });

  /**
   * Day picker — submit the form when the select value changes.
   *
   * @returns {void}
   */
  const daySelect = document.getElementById("report-day-picker");
  daySelect?.addEventListener("change", () => daySelect.form?.submit());

  /**
   * Print / Save PDF button.
   *
   * @returns {void}
   */
  document.getElementById("report-print-btn")?.addEventListener("click", () => {
    window.print();
  });

  /**
   * Publish button — delegate to the shared schedulerPublish.js modal.
   * Pre-selects the currently-viewed day and gates on canPublish.
   */
  const selectedDayId = Number(document.body.dataset.selectedDayId) || null;
  if (selectedDayId) setPublishCurrentDayId(selectedDayId);

  if (document.body.dataset.canPublish === "true") {
    attachPublishTrigger(document.getElementById("report-publish-btn"));
  } else {
    document.getElementById("report-publish-btn")?.classList.add("d-none");
  }
});
