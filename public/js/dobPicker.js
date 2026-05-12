/**
 * @file dobPicker.js
 * @description Shared date-of-birth picker widget.
 *
 * Replaces the native <input type="date"> with three coordinated
 * <select> dropdowns (Month / Day / Year). On change, the selected
 * values are assembled into a YYYY-MM-DD string and written to a
 * hidden <input id="dobirthRaw"> that the server reads unchanged.
 *
 * Day options are regenerated whenever month or year changes so that
 * February correctly shows 28 or 29 days depending on the year.
 *
 * If a pre-existing value is present on the hidden input (or on a
 * data-current attribute on #dobPicker), all three dropdowns are
 * pre-selected on initialisation.
 */

document.addEventListener("DOMContentLoaded", initDobPicker);

/**
 * Initialise the DOB picker if the widget markup is present on the page.
 * Safe to call on pages where the widget is absent — exits silently.
 * @returns {void}
 */
function initDobPicker() {
  const picker = document.getElementById("dobPicker");
  const hidden = document.getElementById("dobirthRaw");
  const selMonth = document.getElementById("dobMonth");
  const selDay = document.getElementById("dobDay");
  const selYear = document.getElementById("dobYear");

  if (!picker || !hidden || !selMonth || !selDay || !selYear) return;

  // ── Populate year dropdown ────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 110;

  for (let y = currentYear - 10; y >= minYear; y--) {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = String(y);
    selYear.appendChild(opt);
  }

  // ── Day population ────────────────────────────────────────────────

  /**
   * Return the number of days in a given month/year.
   * @param {number} month - 1-based month number
   * @param {number} year  - full 4-digit year (0 = unknown)
   * @returns {number}
   */
  function daysInMonth(month, year) {
    if (!month) return 31;
    // Day 0 of next month = last day of this month
    return new Date(year || 2000, month, 0).getDate();
  }

  /**
   * Rebuild the day dropdown based on the currently selected month/year.
   * Preserves the previously selected day value if it is still valid.
   * @returns {void}
   */
  function rebuildDays() {
    const month = Number(selMonth.value) || 0;
    const year = Number(selYear.value) || 0;
    const prevDay = selDay.value;
    const maxDays = daysInMonth(month, year);

    // Clear all options except the placeholder
    while (selDay.options.length > 1) selDay.remove(1);

    for (let d = 1; d <= maxDays; d++) {
      const opt = document.createElement("option");
      opt.value = String(d).padStart(2, "0");
      opt.textContent = String(d);
      selDay.appendChild(opt);
    }

    // Restore previously selected day if still valid
    if (prevDay && Number(prevDay) <= maxDays) {
      selDay.value = prevDay;
    }
  }

  // ── Assemble hidden value ─────────────────────────────────────────

  /**
   * Write the assembled YYYY-MM-DD string to the hidden input.
   * Clears the value if any part is missing.
   * @returns {void}
   */
  function assembleValue() {
    const m = selMonth.value;
    const d = selDay.value;
    const y = selYear.value;

    hidden.value = m && d && y ? `${y}-${m}-${d}` : "";
  }

  // ── Pre-fill from existing value ──────────────────────────────────

  /**
   * Pre-select all three dropdowns from a YYYY-MM-DD string.
   * @param {string} iso - date string e.g. "1985-04-23"
   * @returns {void}
   */
  function prefill(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    const [y, m, d] = iso.split("-");
    selYear.value = y;
    selMonth.value = m;
    rebuildDays();
    selDay.value = d;
    assembleValue();
  }

  // ── Event wiring ──────────────────────────────────────────────────

  selMonth.addEventListener("change", () => {
    rebuildDays();
    assembleValue();
  });

  selYear.addEventListener("change", () => {
    rebuildDays();
    assembleValue();
  });

  selDay.addEventListener("change", assembleValue);

  // ── Initialise ────────────────────────────────────────────────────

  rebuildDays();

  // Accept pre-existing value from either the hidden input or data-current
  const existing = (hidden.value || picker.dataset.current || "").trim();
  if (existing) prefill(existing);
}
