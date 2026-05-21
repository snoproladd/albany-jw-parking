/**
 * @file shiftAlerts.js
 * @description Client-side controller for the Shift Alerts management page.
 *
 * Responsibilities:
 *  - Render alert schedule cards from server-seeded JSON data.
 *  - Drive the create/edit offcanvas form with live SMS preview.
 *  - Handle create (POST), update (PUT), and deactivate (DELETE) operations.
 *  - Trigger manual burst sends (POST /:id/send) with result toasts.
 *  - Load and display the send log with optional status/schedule filters.
 */

"use strict";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Human-readable labels for each alert category slug.
 * @type {Record<string, string>}
 */
const CAT_LABELS = {
  next_day: "Next Day",
  same_day: "Same Day",
  all_upcoming: "All Upcoming",
  t15min: "T\u201115 Rolling",
};

/**
 * CSS class suffix for each category badge.
 * @type {Record<string, string>}
 */
const CAT_BADGE_CLASS = {
  next_day: "sa-badge-next-day",
  same_day: "sa-badge-same-day",
  all_upcoming: "sa-badge-all-upcoming",
  t15min: "sa-badge-t15min",
};

/**
 * Human-readable labels for department keys.
 * @type {Record<string, string>}
 */
const DEPT_LABELS = {
  lots_and_garages: "Lots & Garages",
  signs: "Signs",
  security: "Security",
  mobile_support: "Mobile Support",
  dropoff_pickup: "Drop-off / Pickup",
};

/** Default template for advance (burst) alerts. */
const DEFAULT_ADVANCE_TPL =
  `Albany JW Parking: Hi {firstName}, your {shiftType} shift is {date} at {time}. ` +
  `Reply {code} to confirm. Reply STOP to opt out. ` +
  `If you can\u2019t make it, please contact your overseer.`;

/** Default template for T-15 rolling alerts. */
const DEFAULT_T15_TPL =
  `Albany JW Parking: Hi {firstName}, your {shiftType} shift starts in 15 minutes ({time}). ` +
  `Reply {code} when you arrive. ` +
  `If you can\u2019t make it, please contact your overseer right away.`;

// ─── Module state ─────────────────────────────────────────────────────────────

/** @type {Array<object>} Current in-memory schedule list. */
let schedules = [];

/** @type {number} Convention year for all API calls. */
let saYear = new Date().getFullYear();

/** @type {import('bootstrap').Offcanvas | null} */
let offcanvas = null;

/** @type {boolean} Whether the log tab has been loaded at least once. */
let logLoaded = false;

// ─── Utility helpers ──────────────────────────────────────────────────────────

/**
 * Return the CSRF token from the page's <meta name="csrf-token"> tag.
 *
 * @returns {string}
 */
function getCsrf() {
  return document.querySelector('meta[name="csrf-token"]')?.content ?? "";
}

/**
 * Show a transient Bootstrap toast notification.
 *
 * @param {string} message   HTML-safe message text.
 * @param {'success'|'danger'|'warning'|'info'} [type]  Bootstrap color variant.
 */
function showToast(message, type = "success") {
  const container = document.getElementById("saToastContainer");
  if (!container) return;

  const el = document.createElement("div");
  el.className = `toast align-items-center text-bg-${type} border-0`;
  el.setAttribute("role", "alert");
  el.setAttribute("aria-live", "assertive");
  el.setAttribute("aria-atomic", "true");
  el.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto"
                    data-bs-dismiss="toast" aria-label="Close"></button>
        </div>`;

  container.appendChild(el);
  const bsToast = new bootstrap.Toast(el, { delay: 4500 });
  bsToast.show();
  el.addEventListener("hidden.bs.toast", () => el.remove());
}

/**
 * Escape a string for safe insertion into HTML.
 *
 * @param {string} str
 * @returns {string}
 */
function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Format an ISO date string as a short readable date in UTC.
 * Example: "2026-08-07" → "Fri, Aug 7, 2026"
 *
 * @param {string | null | undefined} iso
 * @returns {string}
 */
function fmtDate(iso) {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

import {
  utcToEdtCard,
  utcToEdtDisplay,
  localToUtc,
  bindTimeInput,
  validateTimeInput,
} from './timeUtils.js';

/**
 * Parse a JSON-encoded departments string into an array of keys.
 *
 * @param {string | null | undefined} raw
 * @returns {string[]}
 */
function parseDepts(raw) {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ─── Schedule card rendering ──────────────────────────────────────────────────

/**
 * Build the HTML string for a single schedule card.
 *
 * @param {object} s  Schedule row object from the server.
 * @returns {string}  HTML to inject into the card list container.
 */
function buildScheduleCard(s) {
  const catClass = CAT_BADGE_CLASS[s.alert_category] ?? "";
  const catLabel = CAT_LABELS[s.alert_category] ?? s.alert_category;
  const isT15 = s.alert_category === "t15min";

  const fireDisplay = isT15
    ? '<span class="text-muted fst-italic">auto-rolling</span>'
    : `${fmtDate(s.fire_date)} at ${utcToEdtCard(s.fire_time_utc)}`;

  const depts = parseDepts(s.departments);
  const deptHtml = depts.length
    ? depts
        .map(
          (d) =>
            `<span class="sa-dept-chip">${escHtml(DEPT_LABELS[d] ?? d)}</span>`,
        )
        .join(" ")
    : '<span class="text-muted" style="font-size:.8rem">All departments</span>';

  const activeBadge = s.active
    ? '<span class="badge text-bg-success">Active</span>'
    : '<span class="badge text-bg-secondary">Inactive</span>';

  const sendBtn =
    s.active && !isT15
      ? `<button class="btn btn-outline-primary btn-sm"
                   data-action="send" data-id="${s.id}">
               <i class="fa-solid fa-paper-plane me-1"></i>Send Now
           </button>`
      : "";

  const toggleLabel = s.active ? "Deactivate" : "Reactivate";
  const toggleIcon = s.active ? "fa-ban" : "fa-circle-check";
  const toggleClass = s.active ? "btn-outline-danger" : "btn-outline-success";

  const deleteBtn = !s.active
    ? `<button class="btn btn-outline-danger btn-sm"
                   data-action="delete" data-id="${s.id}">
               <i class="fa-solid fa-trash me-1"></i>Delete
           </button>`
    : "";

  return `
        <div class="sa-schedule-card mb-3${s.active ? "" : " sa-schedule-card--inactive"}"
             data-id="${s.id}">
            <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap">
                <div class="flex-grow-1 min-w-0">
                    <div class="sa-schedule-title">${escHtml(s.name)}</div>
                    <div class="sa-schedule-meta d-flex flex-wrap align-items-center gap-2 mt-1">
                        <span class="sa-cat-badge ${catClass}">${catLabel}</span>
                        ${activeBadge}
                        <span>${fireDisplay}</span>
                    </div>
                    <div class="d-flex flex-wrap gap-1 mt-2">${deptHtml}</div>
                    ${
                      s.include_null_dept
                        ? '<div class="form-text mt-1"><i class="fa-solid fa-circle-info fa-xs me-1"></i>Includes volunteers with no dept.</div>'
                        : ""
                    }
                    ${
                      s.message_override
                        ? '<div class="form-text mt-1"><i class="fa-solid fa-pen fa-xs me-1"></i>Custom message override active.</div>'
                        : ""
                    }
                </div>
                <div class="d-flex flex-column gap-1 flex-shrink-0" style="min-width:110px">
                    ${sendBtn}
                    <button class="btn btn-outline-secondary btn-sm"
                            data-action="edit" data-id="${s.id}">
                        <i class="fa-solid fa-pencil me-1"></i>Edit
                    </button>
                    <button class="btn ${toggleClass} btn-sm"
                            data-action="toggle"
                            data-id="${s.id}"
                            data-active="${s.active ? "1" : "0"}">
                        <i class="fa-solid ${toggleIcon} me-1"></i>${toggleLabel}
                    </button>
                    ${deleteBtn}
                </div>
            </div>
        </div>`;
}

/**
 * Re-render the full schedule card list from the in-memory `schedules` array.
 */
function renderSchedules() {
  const container = document.getElementById("saScheduleList");
  if (!container) return;

  if (!schedules.length) {
    container.innerHTML = `
            <div class="sa-empty">
                <div class="sa-empty-icon"><i class="fa-solid fa-bell-slash"></i></div>
                <div>No alert schedules yet for ${saYear}.</div>
                <div class="mt-2 text-muted" style="font-size:.85rem">
                    Click <strong>New Schedule</strong> to create one.
                </div>
            </div>`;
    return;
  }

  container.innerHTML = schedules.map(buildScheduleCard).join("");
}

// ─── Offcanvas form ───────────────────────────────────────────────────────────

/**
 * Reset the offcanvas form and optionally populate it from an existing schedule.
 * Opens the offcanvas after populating.
 *
 * @param {object | null} schedule  Existing schedule to edit, or null for new.
 */
function openForm(schedule) {
  const titleEl = document.getElementById("saOffcanvasLabel");
  const idEl = document.getElementById("saFormId");

  if (schedule) {
    titleEl.textContent = "Edit Schedule";
    idEl.value = String(schedule.id);

    document.getElementById("saFormName").value = schedule.name ?? "";
    document.getElementById("saFormCategory").value =
      schedule.alert_category ?? "next_day";
    document.getElementById("saFormFireDate").value = schedule.fire_date
      ? new Date(schedule.fire_date).toISOString().slice(0, 10)
      : "";
    document.getElementById("saFormFireTime").value = utcToEdtDisplay(
      schedule.fire_time_utc,
    );
    document.getElementById("saFormIncludeNull").checked =
      !!schedule.include_null_dept;
    document.getElementById("saFormActive").checked = !!schedule.active;
    document.getElementById("saFormOverride").value =
      schedule.message_override ?? "";
    document.getElementById("saActiveWrap").classList.remove("d-none");

    const depts = parseDepts(schedule.departments);
    document.querySelectorAll(".sa-dept-check").forEach((cb) => {
      cb.checked = depts.includes(cb.value);
    });
  } else {
    titleEl.textContent = "New Schedule";
    idEl.value = "";

    document.getElementById("saFormName").value = "";
    document.getElementById("saFormCategory").value = "next_day";
    document.getElementById("saFormFireDate").value = "";
    document.getElementById("saFormFireTime").value = "";
    document.getElementById("saFormIncludeNull").checked = true;
    document.getElementById("saFormActive").checked = true;
    document.getElementById("saFormOverride").value = "";
    document.getElementById("saActiveWrap").classList.add("d-none");

    document.querySelectorAll(".sa-dept-check").forEach((cb) => {
      cb.checked = false;
    });
  }

  syncFireDateVisibility();
  updatePreview();
  offcanvas.show();
}

/**
 * Show or hide the fire date/time row based on the selected category.
 * The t15min category fires automatically and requires no scheduled time.
 */
function syncFireDateVisibility() {
  const cat = document.getElementById("saFormCategory")?.value;
  const wrap = document.getElementById("saFireDateWrap");
  if (!wrap) return;
  wrap.classList.toggle("d-none", cat === "t15min");
}

/**
 * Rebuild the live SMS preview using the current form state.
 * Uses the override text if present, otherwise the appropriate default template.
 */
function updatePreview() {
  const cat = document.getElementById("saFormCategory")?.value ?? "next_day";
  const override = (
    document.getElementById("saFormOverride")?.value ?? ""
  ).trim();
  const preview = document.getElementById("saPreviewBox");
  if (!preview) return;

  const tpl = override
    ? override
    : cat === "t15min"
      ? DEFAULT_T15_TPL
      : DEFAULT_ADVANCE_TPL;

  const rendered = tpl
    .replace(/\{firstName\}/g, "Jordan")
    .replace(/\{shiftType\}/g, "Ingress")
    .replace(/\{shiftLabel\}/g, "Shift A")
    .replace(/\{time\}/g, "7:00 AM")
    .replace(/\{date\}/g, "Friday, August 7")
    .replace(/\{code\}/g, "FRIN");

  preview.textContent = rendered;
  preview.classList.toggle("sa-msg-preview--custom", !!override);
}

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * Collect form state and POST (create) or PUT (update) a schedule.
 * On success: closes the offcanvas, shows a toast, and reloads the list.
 */
async function saveSchedule() {
  const id = document.getElementById("saFormId").value;
  const name = document.getElementById("saFormName").value.trim();
  const category = document.getElementById("saFormCategory").value;
  const fireDate = document.getElementById("saFormFireDate").value;
  const fireTime = document.getElementById("saFormFireTime").value;
  const override = document.getElementById("saFormOverride").value.trim();
  const inclNull = document.getElementById("saFormIncludeNull").checked;
  const active = document.getElementById("saFormActive").checked;

  const checkedDepts = [
    ...document.querySelectorAll(".sa-dept-check:checked"),
  ].map((cb) => cb.value);

  if (!name) {
    showToast("Name is required.", "warning");
    return;
  }

  const parsedEdtTime = category !== "t15min" ? validateTimeInput("saFormFireTime") : null;

  if (category !== "t15min" && !fireDate) {
    showToast("Fire date is required for this category.", "warning");
    return;
  }
  if (category !== "t15min" && !parsedEdtTime) {
    showToast("Please correct the highlighted time field.", "warning");
    return;
  }

  const payload = {
    name,
    alert_category: category,
    fire_date: category !== "t15min" ? fireDate : null,
    fire_time_utc: parsedEdtTime ? localToUtc(parsedEdtTime) : null,
    departments: checkedDepts.length ? JSON.stringify(checkedDepts) : null,
    include_null_dept: inclNull,
    message_override: override || null,
    active,
    year: saYear,
  };

  const btn = document.getElementById("saFormSaveBtn");
  btn.disabled = true;

  try {
    const isNew = !id;
    const url = isNew
      ? "/oversight/tools/shift-alerts/schedules"
      : `/oversight/tools/shift-alerts/schedules/${id}`;
    const method = isNew ? "POST" : "PUT";

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "CSRF-Token": getCsrf(),
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!data.success) {
      showToast(data.error ?? "Save failed.", "danger");
      return;
    }

    offcanvas.hide();
    showToast(isNew ? "Schedule created." : "Schedule updated.");
    await reloadSchedules();
  } catch (err) {
    showToast("Network error \u2014 please try again.", "danger");
    console.error("saveSchedule error:", err);
  } finally {
    btn.disabled = false;
  }
}

/**
 * Toggle a schedule between active and inactive.
 * Deactivating calls DELETE (soft delete); reactivating calls PUT with active: true.
 *
 * @param {number}  id              Schedule primary key.
 * @param {boolean} currentlyActive Whether the schedule is currently active.
 */
async function toggleSchedule(id, currentlyActive) {
  const verb = currentlyActive ? "Deactivate" : "Reactivate";
  if (!confirm(`${verb} this alert schedule?`)) return;

  try {
    if (currentlyActive) {
      const res = await fetch(`/oversight/tools/shift-alerts/schedules/${id}`, {
        method: "DELETE",
        headers: { "CSRF-Token": getCsrf() },
      });
      const data = await res.json();
      if (!data.success) {
        showToast(data.error ?? "Failed.", "danger");
        return;
      }
      showToast("Schedule deactivated.");
    } else {
      const schedule = schedules.find((s) => s.id === id);
      if (!schedule) {
        showToast("Schedule not found.", "danger");
        return;
      }

      const res = await fetch(`/oversight/tools/shift-alerts/schedules/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": getCsrf(),
        },
        body: JSON.stringify({ ...schedule, active: true }),
      });
      const data = await res.json();
      if (!data.success) {
        showToast(data.error ?? "Failed.", "danger");
        return;
      }
      showToast("Schedule reactivated.");
    }

    await reloadSchedules();
  } catch (err) {
    showToast("Network error \u2014 please try again.", "danger");
    console.error("toggleSchedule error:", err);
  }
}

/**
 * Permanently delete a deactivated schedule and all its log rows.
 *
 * @param {number} id  Schedule primary key.
 */
async function deleteSchedule(id) {
  const schedule = schedules.find((s) => s.id === id);
  if (!schedule) return;

  if (!confirm(`Permanently delete "${schedule.name}"?\n\nThis will also delete all send log entries for this schedule and cannot be undone.`)) return;

  try {
    const res = await fetch(`/oversight/tools/shift-alerts/schedules/${id}/permanent`, {
      method: "DELETE",
      headers: { "CSRF-Token": getCsrf() },
    });
    const data = await res.json();
    if (!data.success) {
      showToast(data.error ?? "Delete failed.", "danger");
      return;
    }
    showToast("Schedule permanently deleted.");
    await reloadSchedules();
  } catch (err) {
    showToast("Network error \u2014 please try again.", "danger");
    console.error("deleteSchedule error:", err);
  }
}

/**
 * Manually trigger an immediate burst send for a schedule.
 * Skips the dupe guard (force: false) so already-sent pairs are still excluded.
 *
 * @param {number} id  Schedule primary key.
 */
async function sendNow(id) {
  const schedule = schedules.find((s) => s.id === id);
  if (!schedule) return;

  if (
    !confirm(
      `Send "${schedule.name}" now?\n\n` +
        `This will dispatch SMS immediately to all eligible volunteers ` +
        `who haven't already received this alert.`,
    )
  )
    return;

  const btn = document.querySelector(`[data-action="send"][data-id="${id}"]`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-1"></span>Sending\u2026';
  }

  try {
    const res = await fetch(
      `/oversight/tools/shift-alerts/schedules/${id}/send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": getCsrf(),
        },
        body: JSON.stringify({ force: false }),
      },
    );
    const data = await res.json();

    if (!data.success) {
      showToast(data.error ?? "Send failed.", "danger");
      return;
    }

    showToast(
      `Sent: <strong>${data.sent}</strong> &nbsp;|&nbsp; Failed: <strong>${data.failed}</strong>`,
      data.failed > 0 ? "warning" : "success",
    );
  } catch (err) {
    showToast("Network error \u2014 please try again.", "danger");
    console.error("sendNow error:", err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-paper-plane me-1"></i>Send Now';
    }
  }
}

/**
 * Fetch the schedule list from the server and refresh both the card list
 * and the log filter dropdown.
 */
async function reloadSchedules() {
  try {
    const res = await fetch(
      `/oversight/tools/shift-alerts/schedules?year=${saYear}`,
    );
    const data = await res.json();
    if (data.success) {
      schedules = data.schedules;
      renderSchedules();
      populateLogScheduleFilter();
    }
  } catch (err) {
    console.error("reloadSchedules error:", err);
  }
}

// ─── Log tab ──────────────────────────────────────────────────────────────────

/**
 * Rebuild the schedule options in the log tab's schedule filter dropdown.
 * Preserves the currently selected value if it still exists.
 */
function populateLogScheduleFilter() {
  const sel = document.getElementById("saLogScheduleFilter");
  if (!sel) return;

  const current = sel.value;
  while (sel.options.length > 1) sel.remove(1);

  schedules.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = String(s.id);
    opt.textContent = s.name;
    sel.appendChild(opt);
  });

  sel.value = current;
}

/**
 * Fetch the send log from the server using the current filter values
 * and render the results table.
 */
async function loadLog() {
  const wrap = document.getElementById("saLogTableWrap");
  const statusVal = document.getElementById("saLogStatusFilter")?.value ?? "";
  const scheduleVal =
    document.getElementById("saLogScheduleFilter")?.value ?? "";

  if (!wrap) return;

  wrap.innerHTML = `
        <div class="text-center py-4 text-secondary">
            <span class="spinner-border spinner-border-sm me-2"></span>Loading\u2026
        </div>`;

  const params = new URLSearchParams({ year: saYear });
  if (statusVal) params.set("status", statusVal);
  if (scheduleVal) params.set("scheduleId", scheduleVal);

  try {
    const res = await fetch(`/oversight/tools/shift-alerts/log?${params}`);
    const data = await res.json();

    if (!data.success) {
      wrap.innerHTML = `<div class="alert alert-danger">Failed to load log.</div>`;
      return;
    }

    renderLogTable(data.log, wrap);
    logLoaded = true;
  } catch (err) {
    wrap.innerHTML = `<div class="alert alert-danger">Network error loading log.</div>`;
    console.error("loadLog error:", err);
  }
}

/**
 * Build and insert the send log HTML table into the given container.
 *
 * @param {Array<object>} rows       Log rows from the server.
 * @param {HTMLElement}   container  Element to populate.
 */
function renderLogTable(rows, container) {
  if (!rows.length) {
    container.innerHTML = `
            <div class="sa-empty">
                <div class="sa-empty-icon"><i class="fa-solid fa-inbox"></i></div>
                <div>No log entries match the current filters.</div>
            </div>`;
    return;
  }

  const rowsHtml = rows
    .map((r) => {
      const statusBadge =
        r.status === "sent"
          ? '<span class="sa-badge-sent"><i class="fa-solid fa-check me-1"></i>Sent</span>'
          : '<span class="sa-badge-failed"><i class="fa-solid fa-xmark me-1"></i>Failed</span>';

      const sentAt = r.sent_at
        ? new Date(r.sent_at).toLocaleString("en-US", {
            dateStyle: "short",
            timeStyle: "short",
          })
        : "\u2014";

      const catLabel = CAT_LABELS[r.alert_category] ?? r.alert_category;

      return `
            <tr>
                <td class="text-nowrap">${escHtml(sentAt)}</td>
                <td>${escHtml(`${r.firstName} ${r.lastName}`)}</td>
                <td>${escHtml(r.shift_label ?? "\u2014")}</td>
                <td>${escHtml(r.day_label ?? "\u2014")}</td>
                <td>${escHtml(catLabel)}</td>
                <td>${statusBadge}</td>
                <td class="text-muted" style="font-size:.75rem">
                    ${r.twilio_sid ? escHtml(r.twilio_sid) : "\u2014"}
                </td>
            </tr>`;
    })
    .join("");

  container.innerHTML = `
        <div class="table-responsive">
            <table class="table table-sm sa-log-table">
                <thead>
                    <tr>
                        <th>Sent At</th>
                        <th>Volunteer</th>
                        <th>Shift</th>
                        <th>Day</th>
                        <th>Category</th>
                        <th>Status</th>
                        <th>Twilio SID</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
        <p class="text-secondary mt-1 mb-0" style="font-size:.8rem">
            ${rows.length} ${rows.length === 1 ? "entry" : "entries"}
        </p>`;
}

// ─── Event listeners ──────────────────────────────────────────────────────────

/**
 * Attach all page-level DOM event listeners.
 * Uses event delegation on the card list and direct listeners elsewhere.
 */
function bindEvents() {
  // New schedule button → open blank form
  document
    .getElementById("saNewScheduleBtn")
    ?.addEventListener("click", () => openForm(null));

  // Save button inside the offcanvas
  document
    .getElementById("saFormSaveBtn")
    ?.addEventListener("click", saveSchedule);

  // Category select → toggle fire-date row visibility + refresh preview
  document.getElementById("saFormCategory")?.addEventListener("change", () => {
    syncFireDateVisibility();
    updatePreview();
  });

  // Override textarea → refresh preview on every keystroke
  document
    .getElementById("saFormOverride")
    ?.addEventListener("input", updatePreview);

  // Delegated clicks on the schedule card list
  document.getElementById("saScheduleList")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const id = Number(btn.dataset.id);
    const action = btn.dataset.action;

    if (action === "edit") {
      const s = schedules.find((s) => s.id === id);
      if (s) openForm(s);
    } else if (action === "toggle") {
      const active = btn.dataset.active === "1";
      toggleSchedule(id, active);
    } else if (action === "send") {
      sendNow(id);
    } else if (action === "delete") {
      deleteSchedule(id);
    }
  });

  // Log tab → lazy-load on first activation
  document
    .getElementById("sa-log-tab")
    ?.addEventListener("shown.bs.tab", () => {
      if (!logLoaded) loadLog();
    });

  // Refresh button in the log tab
  document
    .getElementById("saLogRefreshBtn")
    ?.addEventListener("click", loadLog);

  // Filter dropdowns in the log tab → reload on change
  ["saLogStatusFilter", "saLogScheduleFilter"].forEach((elId) => {
    document.getElementById(elId)?.addEventListener("change", loadLog);
  });
}

// ─── Initialisation ───────────────────────────────────────────────────────────

/**
 * Bootstrap the page: read seed data, initialise Bootstrap components,
 * render the initial schedule list, and attach all event handlers.
 */
function init() {
  // Read server-seeded JSON blobs
  try {
    const schedulesEl = document.getElementById("sa-schedules-data");
    const yearEl = document.getElementById("sa-year-data");
    if (schedulesEl) schedules = JSON.parse(schedulesEl.textContent) ?? [];
    if (yearEl) saYear = JSON.parse(yearEl.textContent) ?? saYear;
  } catch (err) {
    console.error("shiftAlerts: failed to parse seed data:", err);
  }

  // Initialise Bootstrap offcanvas instance
  const ocEl = document.getElementById("saOffcanvas");
  if (ocEl) offcanvas = new bootstrap.Offcanvas(ocEl);

  // Initial render and filter population
  renderSchedules();
  populateLogScheduleFilter();
  updatePreview();

  // Bind all event listeners
  bindEvents();

  // Blur normalisation for the fire time input
  bindTimeInput("saFormFireTime");
}

document.addEventListener("DOMContentLoaded", init);
