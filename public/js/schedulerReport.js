/**
 * @file schedulerReport.js
 * @description Department filter controls for the schedule report page.
 */

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
});
