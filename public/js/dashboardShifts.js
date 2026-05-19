/**
 * @file dashboardShifts.js
 * @description Day-navigator for the "Your Shifts" home page widget.
 *
 * Reads all convention days from embedded JSON, wires prev/next buttons,
 * fetches shifts for the selected day via GET /api/dashboard/shifts,
 * and re-renders the shifts list without a full page reload.
 */

// ─────────────────────────────────────────────
//  Bootstrap data
// ─────────────────────────────────────────────

/**
 * @typedef {{ id: number, label: string, date: string }} ConventionDay
 * @typedef {{ shift_label: string, slot_type: string, dept_key: string, dept_name: string,
 *             start_time: string, end_time: string, location_name: string,
 *             keyman: object|null, keyman_asst: object|null }} Shift
 */

/** @type {ConventionDay[]} */
const _days = JSON.parse(
  document.getElementById("db-days-data")?.textContent || "[]",
);

const _nav = document.querySelector(".db-day-nav");
const _prevBtn = document.getElementById("dbDayPrev");
const _nextBtn = document.getElementById("dbDayNext");
const _label = document.getElementById("dbDayLabel");
const _body = document.getElementById("dbShiftsBody");

if (!_nav || !_prevBtn || !_nextBtn || !_body || _days.length === 0) {
  // No navigation or single day — nothing to wire
} else {
  let _idx = Number(_nav.dataset.currentIndex || 0);

  // ─────────────────────────────────────────────
  //  Render helpers
  // ─────────────────────────────────────────────

  /** Department display names */
  const DEPT_NAMES = {
    lots_and_garages: "Lots & Garages",
    signs: "Signs",
    security: "Security",
    dropoff_pickup: "Drop-off / Pickup",
    mobile_support: "Mobile Support",
  };

  /**
   * Format a day's date string into the header label.
   * @param {ConventionDay} day
   * @returns {string}
   */
  function _fmtDayLabel(day) {
    const dateStr = (day.date || "").slice(0, 10);
    const date = dateStr
      ? new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        })
      : "";
    return date ? `${day.label} — ${date}` : day.label;
  }

  /**
   * Render a leader row (KM or KA) for a shift.
   * @param {{ firstName: string, lastName: string, phone: string|null }} leader
   * @param {string} badgeClass
   * @param {string} badgeLabel
   * @returns {string}
   */
  function _leaderRow(leader, badgeClass, badgeLabel) {
    const phone = leader.phone
      ? `<a href="tel:${leader.phone}" class="db-leader-phone">
                 <i class="fa-solid fa-phone fa-xs me-1"></i>${leader.phone}
               </a>`
      : "";
    return `
          <div class="db-leader-row">
            <span class="db-leader-badge ${badgeClass}">${badgeLabel}</span>
            <span class="db-leader-name">${leader.firstName} ${leader.lastName}</span>
            ${phone}
          </div>`;
  }

  /**
   * Render the full shifts list HTML.
   * @param {Shift[]} shifts
   * @returns {string}
   */
  function _renderShifts(shifts) {
    if (!shifts || shifts.length === 0) {
      return `
              <div class="text-center text-muted py-5">
                <i class="fa-solid fa-calendar-xmark fa-2x d-block mb-2 text-secondary"></i>
                No shifts assigned for this convention day.
              </div>`;
    }

    return `<div class="list-group list-group-flush">
          ${shifts
            .map((shift) => {
              const roleBadge =
                shift.slot_type === "keyman"
                  ? `<span class="badge db-badge-km">KM</span>`
                  : shift.slot_type === "keyman_asst"
                    ? `<span class="badge db-badge-ka">KA</span>`
                    : "";

              const deptName = DEPT_NAMES[shift.dept_key] || shift.dept_name;
              const deptKey = (shift.dept_key || "").replace(/_/g, "-");

              const leaders =
                shift.keyman || shift.keyman_asst
                  ? `
              <div class="db-shift-leaders mt-2">
                ${shift.keyman ? _leaderRow(shift.keyman, "db-badge-km", "KM") : ""}
                ${shift.keyman_asst ? _leaderRow(shift.keyman_asst, "db-badge-ka", "KA") : ""}
              </div>`
                  : "";

              return `
              <div class="list-group-item db-shift-item">
                <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap">
                  <div class="db-shift-main">
                    <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
                      <span class="fw-semibold">${shift.shift_label}</span>
                      ${roleBadge}
                    </div>
                    <div class="text-muted small">
                      <i class="fa-solid fa-location-dot me-1"></i>${shift.location_name}
                      &nbsp;&middot;&nbsp;
                      <span class="db-dept-pill db-dept-${deptKey}">${deptName}</span>
                    </div>
                  </div>
                  <div class="db-shift-time text-end text-nowrap">
                    <i class="fa-regular fa-clock me-1 text-muted"></i>
                    ${shift.start_time} – ${shift.end_time}
                  </div>
                </div>
                ${leaders}
              </div>`;
            })
            .join("")}
        </div>`;
  }

  // ─────────────────────────────────────────────
  //  Navigation
  // ─────────────────────────────────────────────

  /**
   * Sync button disabled state and label to the current index.
   * @returns {void}
   */
  function _syncNav() {
    _prevBtn.disabled = _idx <= 0;
    _nextBtn.disabled = _idx >= _days.length - 1;
    if (_label) _label.textContent = _fmtDayLabel(_days[_idx]);
  }

  /**
   * Show a loading skeleton inside the shifts body.
   * @returns {void}
   */
  function _showLoading() {
    _body.innerHTML = `
          <div class="text-center text-muted py-5">
            <span class="spinner-border spinner-border-sm me-2"></span>Loading…
          </div>`;
  }

  /**
   * Navigate to the given index: fetch shifts and re-render.
   * @param {number} newIdx
   * @returns {Promise<void>}
   */
  async function _goTo(newIdx) {
    if (newIdx < 0 || newIdx >= _days.length) return;
    _idx = newIdx;
    _syncNav();
    _showLoading();

    try {
      const res = await fetch(`/api/dashboard/shifts?dayId=${_days[_idx].id}`);
      const data = await res.json();
      _body.innerHTML = _renderShifts(data.success ? data.shifts : []);
    } catch (err) {
      console.error("[shifts] fetch error:", err);
      _body.innerHTML = `
              <div class="text-center text-danger py-4">
                <i class="fa-solid fa-triangle-exclamation me-1"></i>
                Failed to load shifts.
              </div>`;
    }
  }

  _prevBtn.addEventListener("click", () => _goTo(_idx - 1));
  _nextBtn.addEventListener("click", () => _goTo(_idx + 1));

  // Sync initial button state (prev disabled on first day, etc.)
  _syncNav();
}
