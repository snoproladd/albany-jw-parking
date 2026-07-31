/**
 * @file schedulerConstraintPanel.js
 * @description Floating scheduling constraint panel for the scheduler page.
 *
 * Mirrors schedulerNotePanel.js in structure and positioning.
 *
 * Shows AI-suggested blackout constraints (from note analysis or inbound SMS)
 * and allows overseers to:
 *  - Review each pending suggestion with its resolved or unresolved time window.
 *  - Edit unresolved day/time fields inline before applying.
 *  - Apply a suggestion (creates a volunteer_blackout row; marks suggestion applied).
 *  - Dismiss a suggestion that is a duplicate or incorrect.
 *
 * Public API:
 *   openConstraintPanel(opts)  — open the panel
 *   closeConstraintPanel()     — close the panel programmatically
 *
 * @module schedulerConstraintPanel
 */

// ── Module state ──────────────────────────────────────────────────────────────

/** @type {HTMLElement|null} */
let _panelEl = null;

/** @type {number|null} */
let _currentVolId = null;

/** @type {{ x: number, y: number }} */
let _anchorPos = { x: 0, y: 0 };

/**
 * In-memory list of pending suggestions for the current volunteer.
 * @type {Array<object>}
 */
let _suggestions = [];

/**
 * Convention days from the API — used to build day/session selectors.
 * @type {Array<{ id: number, label: string, sessions: Array<{ id: number, label: string, startMin: number, endMin: number }> }>}
 */
let _days = [];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Opens the constraint panel for a volunteer.
 * Closes any existing panel first.
 *
 * @param {{
 *   volId:   number,
 *   volName: string,
 *   anchorX: number,
 *   anchorY: number,
 * }} opts
 * @returns {Promise<void>}
 */
export async function openConstraintPanel({
  volId,
  volName,
  anchorX,
  anchorY,
}) {
  closeConstraintPanel();

  _currentVolId = volId;
  _anchorPos = { x: anchorX, y: anchorY };

  const panel = _buildShell(volName);
  document.body.appendChild(panel);
  _panelEl = panel;
  _positionEl(panel, anchorX, anchorY);

  const outsideClick = (e) => {
    if (_panelEl && !_panelEl.contains(e.target)) {
      closeConstraintPanel();
      document.removeEventListener("mousedown", outsideClick);
    }
  };
  document.addEventListener("mousedown", outsideClick);

  await _loadAndRender(panel, volId);
}

/**
 * Closes and removes the active constraint panel, if any.
 * @returns {void}
 */
export function closeConstraintPanel() {
  _panelEl?.remove();
  _panelEl = null;
  _currentVolId = null;
  _suggestions = [];
  _days = [];
}

// ── Shell ─────────────────────────────────────────────────────────────────────

/**
 * @param {string} volName
 * @returns {HTMLElement}
 */
function _buildShell(volName) {
  const panel = document.createElement("div");
  panel.classList.add(
    "sched-assign-panel",
    "sched-note-panel",
    "sched-constraint-panel",
  );

  const hdr = document.createElement("div");
  hdr.classList.add("sched-assign-panel-header");

  const ttl = document.createElement("span");
  ttl.classList.add("sched-note-panel-title");
  ttl.innerHTML = `<i class="fa-solid fa-calendar-xmark me-1"></i>${_esc(volName)}`;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "sched-assign-panel-close";
  closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  closeBtn.addEventListener("click", closeConstraintPanel);

  hdr.appendChild(ttl);
  hdr.appendChild(closeBtn);
  panel.appendChild(hdr);

  const body = document.createElement("div");
  body.classList.add("sched-note-panel-body");
  body.innerHTML = `<p class="sched-assign-panel-empty">
        <span class="spinner-border spinner-border-sm me-1"></span>Loading…</p>`;
  panel.appendChild(body);

  return panel;
}

// ── Data + render ─────────────────────────────────────────────────────────────

/**
 * @param {HTMLElement} panel
 * @param {number}      volId
 * @returns {Promise<void>}
 */
async function _loadAndRender(panel, volId) {
  const body = panel.querySelector(".sched-note-panel-body");

  try {
    const res = await fetch(`/api/constraints/${volId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (_currentVolId !== volId || !panel.isConnected) return;

    _suggestions = data.suggestions || [];
    _days = data.days || [];

    _renderBody(body, volId);

    if (_panelEl) _positionEl(_panelEl, _anchorPos.x, _anchorPos.y);
  } catch {
    body.innerHTML =
      '<p class="sched-assign-panel-empty text-danger small">Failed to load constraints.</p>';
  }
}

/**
 * @param {HTMLElement} body
 * @param {number}      volId
 * @returns {void}
 */
function _renderBody(body, volId) {
  body.innerHTML = "";

  // ── Pending suggestions ───────────────────────────────────────────
  const sugSection = document.createElement("div");
  sugSection.classList.add("sched-note-section");

  const sugLabel = document.createElement("div");
  sugLabel.classList.add("sched-note-label");
  sugLabel.textContent = "Pending Constraints";
  sugSection.appendChild(sugLabel);

  if (_suggestions.length === 0) {
    const none = document.createElement("p");
    none.classList.add("sched-note-meta");
    none.textContent = "No pending scheduling constraints.";
    sugSection.appendChild(none);
  } else {
    _suggestions.forEach((s) => {
      const card = _buildSuggestionCard(s, volId);
      sugSection.appendChild(card);
    });
  }

  body.appendChild(sugSection);

  // ── Notes Report link ─────────────────────────────────────────────
  const link = document.createElement("a");
  link.href = "/oversight/tools/notes-report";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "sched-note-report-link";
  link.innerHTML =
    '<i class="fa-solid fa-arrow-up-right-from-square me-1"></i>Manage in Notes Report';
  body.appendChild(link);
}

// ── Suggestion card ───────────────────────────────────────────────────────────

/**
 * Builds one pending suggestion card with resolved or inline-edit fields.
 *
 * @param {object} s     - Suggestion row from the API.
 * @param {number} volId
 * @returns {HTMLElement}
 */
function _buildSuggestionCard(s, volId) {
  const card = document.createElement("div");
  card.classList.add("sched-constraint-card");
  card.dataset.suggestionId = String(s.id);

  // Source badge
  const sourceBadge = document.createElement("span");
  sourceBadge.classList.add("sched-constraint-source");
  sourceBadge.textContent =
    s.source_type === "inbound_sms"
      ? "SMS"
      : s.source_type === "intake_note"
        ? "Note"
        : "Overseer";
  card.appendChild(sourceBadge);

  // Description
  const desc = document.createElement("div");
  desc.classList.add("sched-constraint-desc");
  desc.textContent = s.description;
  card.appendChild(desc);

  // Time section — resolved or form
  const timeSection = document.createElement("div");
  timeSection.classList.add("sched-constraint-time");

  const isResolved =
    s.convention_day_id && s.start_mins != null && s.end_mins != null;

  if (isResolved) {
    // Show resolved values
    const resolved = document.createElement("div");
    resolved.classList.add("sched-constraint-resolved");
    resolved.innerHTML =
      `<i class="fa-solid fa-calendar-day me-1"></i><strong>${_esc(s.day_label || s.day_hint || "—")}</strong>` +
      ` &nbsp;·&nbsp; ${_fmtMins(s.start_mins)} – ${_fmtMins(s.end_mins)}` +
      ` &nbsp;<span class="sched-constraint-type-badge">${_esc(s.blackout_type)}</span>`;
    timeSection.appendChild(resolved);
  } else {
    // Inline edit form
    timeSection.appendChild(_buildEditForm(s));
  }

  card.appendChild(timeSection);

  // Error placeholder
  const errEl = document.createElement("div");
  errEl.classList.add("sched-constraint-error", "d-none");
  card.appendChild(errEl);

  // Button row
  const btnRow = document.createElement("div");
  btnRow.classList.add("sched-constraint-card-btns");

  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.className = "sched-constraint-apply-btn";
  applyBtn.innerHTML = '<i class="fa-solid fa-check me-1"></i>Apply Blackout';
  if (!isResolved)
    applyBtn.classList.add("sched-constraint-apply-btn--needs-form");
  applyBtn.addEventListener("click", () =>
    _onApply(card, s, volId, isResolved),
  );

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "sched-constraint-remove-btn";
  removeBtn.title = "Remove this suggestion";
  removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  removeBtn.addEventListener("click", () => _onRemove(card, s, volId));

  btnRow.appendChild(applyBtn);
  btnRow.appendChild(removeBtn);
  card.appendChild(btnRow);

  return card;
}

/**
 * Builds the inline edit form for an unresolved suggestion.
 *
 * @param {object} s - Suggestion row.
 * @returns {HTMLElement}
 */
function _buildEditForm(s) {
  const form = document.createElement("div");
  form.classList.add("sched-constraint-form");

  // Day selector
  const dayLabel = document.createElement("label");
  dayLabel.classList.add("sched-constraint-form-label");
  dayLabel.textContent = "Day";

  const daySelect = document.createElement("select");
  daySelect.className = "sched-constraint-select";
  daySelect.dataset.field = "conventionDayId";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select day…";
  daySelect.appendChild(placeholder);

  _days.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = String(d.id);
    opt.textContent = d.label;
    if (d.id === s.convention_day_id) opt.selected = true;
    daySelect.appendChild(opt);
  });

  form.appendChild(dayLabel);
  form.appendChild(daySelect);

  // Start / End time inputs
  const timeRow = document.createElement("div");
  timeRow.classList.add("sched-constraint-time-row");

  const startLabel = document.createElement("label");
  startLabel.classList.add("sched-constraint-form-label");
  startLabel.textContent = "Start";

  const startInput = document.createElement("input");
  startInput.type = "time";
  startInput.className = "sched-constraint-time-input";
  startInput.dataset.field = "startMins";
  if (s.start_mins != null) startInput.value = _minsToTimeInput(s.start_mins);

  const endLabel = document.createElement("label");
  endLabel.classList.add("sched-constraint-form-label");
  endLabel.textContent = "End";

  const endInput = document.createElement("input");
  endInput.type = "time";
  endInput.className = "sched-constraint-time-input";
  endInput.dataset.field = "endMins";
  if (s.end_mins != null) endInput.value = _minsToTimeInput(s.end_mins);

  timeRow.appendChild(startLabel);
  timeRow.appendChild(startInput);
  timeRow.appendChild(endLabel);
  timeRow.appendChild(endInput);
  form.appendChild(timeRow);

  return form;
}

// ── Remove handler ────────────────────────────────────────────────────────────

/**
 * Dismisses a suggestion without applying it.
 * Calls the DELETE endpoint, removes the card, and updates the pill badge.
 *
 * @param {HTMLElement} card
 * @param {object}      s     - Suggestion row.
 * @param {number}      volId
 * @returns {Promise<void>}
 */
async function _onRemove(card, s, volId) {
    try {
        const res = await fetch(`/api/constraints/${volId}/suggestions/${s.id}`, {
            method: "DELETE",
        });
        if (!res.ok) return;

        _suggestions = _suggestions.filter((x) => x.id !== s.id);
        card.remove();
        _updatePillBadge(volId, _suggestions.length);
    } catch (err) {
        console.error("[schedulerConstraintPanel] _onRemove error:", err);
    }
}

// ── Apply handler ─────────────────────────────────────────────────────────────

/**
 * Handles the Apply button click on a suggestion card.
 *
 * @param {HTMLElement} card
 * @param {object}      s          - Original suggestion data.
 * @param {number}      volId
 * @param {boolean}     isResolved - Whether day+start+end were pre-resolved.
 * @returns {Promise<void>}
 */
async function _onApply(card, s, volId, isResolved) {
  const errEl = card.querySelector(".sched-constraint-error");
  const applyBtn = card.querySelector(".sched-constraint-apply-btn");

  errEl.classList.add("d-none");
  errEl.textContent = "";

  // Collect values — either from resolved suggestion or from inline form
  let conventionDayId = s.convention_day_id;
  let startMins = s.start_mins;
  let endMins = s.end_mins;

  if (!isResolved) {
    const daySelect = card.querySelector('[data-field="conventionDayId"]');
    const startInput = card.querySelector('[data-field="startMins"]');
    const endInput = card.querySelector('[data-field="endMins"]');

    conventionDayId = parseInt(daySelect?.value || "0", 10) || null;
    startMins = startInput?.value ? _timeInputToMins(startInput.value) : null;
    endMins = endInput?.value ? _timeInputToMins(endInput.value) : null;
  }

  if (!conventionDayId || startMins == null || endMins == null) {
    errEl.textContent = "Please select a day and enter start and end times.";
    errEl.classList.remove("d-none");
    return;
  }

  if (startMins >= endMins) {
    errEl.textContent = "End time must be after start time.";
    errEl.classList.remove("d-none");
    return;
  }

  applyBtn.disabled = true;
  applyBtn.innerHTML =
    '<span class="spinner-border spinner-border-sm me-1"></span>Applying…';

  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || "";

  try {
    const res = await fetch(
      `/api/constraints/${volId}/suggestions/${s.id}/apply`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({ conventionDayId, startMins, endMins }),
      },
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errEl.textContent = data.error || "Failed to apply. Please try again.";
      errEl.classList.remove("d-none");
      applyBtn.disabled = false;
      applyBtn.innerHTML =
        '<i class="fa-solid fa-check me-1"></i>Apply Blackout';
      return;
    }

    // Success — animate card out
    card.classList.add("sched-constraint-card--applied");
    applyBtn.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i>Applied';

    // Remove from in-memory list and update pill badge
    _suggestions = _suggestions.filter((x) => x.id !== s.id);
    _updatePillBadge(volId, _suggestions.length);

    // Dispatch so conflict tracker updates for the new blackout
    document.dispatchEvent(
      new CustomEvent("scheduler:blackoutChanged", { detail: { volId } }),
    );

    setTimeout(() => card.remove(), 600);
  } catch {
    errEl.textContent = "Network error. Please try again.";
    errEl.classList.remove("d-none");
    applyBtn.disabled = false;
    applyBtn.innerHTML = '<i class="fa-solid fa-check me-1"></i>Apply Blackout';
  }
}

// ── Badge update ──────────────────────────────────────────────────────────────

/**
 * Updates the pending-constraint badge on all name pills for this volunteer
 * without requiring a full scheduler reload.
 *
 * @param {number} volId
 * @param {number} newCount
 * @returns {void}
 */
function _updatePillBadge(volId, newCount) {
  document
    .querySelectorAll(`.name-pill[data-id="${volId}"]`)
    .forEach((pill) => {
      pill.dataset.pendingConstraints = String(newCount);
      const badge = pill.querySelector(".pill-constraint-badge");
      if (newCount > 0) {
        if (badge) {
          badge.textContent = `${newCount} CONSTRAINT${newCount !== 1 ? "S" : ""}`;
        }
      } else if (badge) {
        badge.remove();
      }
    });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Positions the panel near a click coordinate, clamping to viewport.
 * @param {HTMLElement} el
 * @param {number}      x
 * @param {number}      y
 */
function _positionEl(el, x, y) {
  el.style.position = "fixed";
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.zIndex = "9999";
  requestAnimationFrame(() => {
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) el.style.left = `${x - r.width}px`;
    if (r.bottom > window.innerHeight - 8) el.style.top = `${y - r.height}px`;
  });
}

/**
 * @param {string|null|undefined} str
 * @returns {string}
 */
function _esc(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Formats minutes-from-midnight to "h:MM AM/PM".
 * @param {number|null} mins
 * @returns {string}
 */
function _fmtMins(mins) {
  if (mins == null) return "—";
  const h = Math.floor(mins / 60),
    m = mins % 60,
    ap = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ap}`;
}

/**
 * Converts minutes-from-midnight to "HH:MM" for <input type="time">.
 * @param {number} mins
 * @returns {string}
 */
function _minsToTimeInput(mins) {
  const h = Math.floor(mins / 60),
    m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Converts an "HH:MM" time input string to minutes-from-midnight.
 * @param {string} val
 * @returns {number}
 */
function _timeInputToMins(val) {
  const [h, m] = val.split(":").map(Number);
  return h * 60 + (m || 0);
}
