/**
 * @file timelines.js
 * @description Client logic for the Timelines and Event Types pages.
 *
 * Handles two views rendered by the same EJS template:
 *  - event-types: CRUD for event type definitions
 *  - timelines:   CRUD for convention days, sessions, shifts,
 *                 and schedule assignments (shift → location/task)
 *
 * All mutations reload the page after success so the server-rendered
 * state stays canonical. Forms open inline above their respective tables.
 */

/**
 * Format a raw mssql TIME value (ISO string or Date) as h:mm AM/PM.
 * mssql TIME columns come back as Date objects anchored to UTC epoch,
 * so we read UTC hours/minutes to avoid local timezone offset shifts.
 *
 * @param {string|null} raw - ISO string or raw Date .toString() value
 * @returns {string}
 */
function fmtTime(raw) {
  if (!raw) return "—";
  const d = new Date(raw);
  if (isNaN(d.valueOf())) return raw;
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * Format a raw mssql DATE value as "Thu, Jul 2".
 * Uses UTC date parts to avoid timezone-driven day shifts.
 *
 * @param {string|null} raw - ISO date string e.g. "2026-07-04"
 * @returns {string}
 */
function fmtDate(raw) {
  if (!raw) return "—";
  const d = new Date(raw);
  if (isNaN(d.valueOf())) return raw;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

import {
  fmtTimeInput,
  bindTimeInput,
  validateTimeInput,
} from './timeUtils.js';

document.addEventListener("DOMContentLoaded", () => {
  const csrfToken =
    document.querySelector('meta[name="csrf-token"]')?.content || "";

  /** sessionStorage key used to reopen the last-edited accordion after reload. */
  const LAST_ACCORDION_KEY = "timelines_last_session_id";

  /**
   * If a last-edited session ID is stored, collapse the default-open accordion
   * and open the stored one instead, then clear the stored value.
   */
  function restoreLastAccordion() {
    const stored = sessionStorage.getItem(LAST_ACCORDION_KEY);
    if (!stored) return;
    sessionStorage.removeItem(LAST_ACCORDION_KEY);

    const targetCollapse = document.getElementById(
      `session-collapse-${stored}`,
    );
    if (!targetCollapse) return;

    // Collapse whichever panel Bootstrap opened by default (has 'show' without being our target)
    document
      .querySelectorAll("#timelineAccordion .accordion-collapse.show")
      .forEach((el) => {
        if (el !== targetCollapse) {
          const bsCollapse = bootstrap.Collapse.getOrCreateInstance(el, {
            toggle: false,
          });
          bsCollapse.hide();
          // Also flip the button state
          const btn = document.querySelector(`[data-bs-target="#${el.id}"]`);
          if (btn) btn.classList.add("collapsed");
        }
      });

    // Open the target
    const bsTarget = bootstrap.Collapse.getOrCreateInstance(targetCollapse, {
      toggle: false,
    });
    bsTarget.show();
    const targetBtn = document.querySelector(
      `[data-bs-target="#session-collapse-${stored}"]`,
    );
    if (targetBtn) targetBtn.classList.remove("collapsed");

    targetCollapse.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  restoreLastAccordion();
  // ── Helpers ──────────────────────────────────────────────────────────
  /**
   * Persist the given session ID to sessionStorage so the next page load
   * (after a reload) reopens that accordion.
   * @param {string|number} sessionId
   */
  function storeLastAccordion(sessionId) {
    if (sessionId)
      sessionStorage.setItem(LAST_ACCORDION_KEY, String(sessionId));
  }
  /**
   * Render an inline status alert.
   * @param {HTMLElement} el
   * @param {string} msg
   * @param {'danger'|'success'|'warning'} [type]
   */
  function showAlert(el, msg, type = "danger") {
    const icon = type === "success" ? "circle-check" : "triangle-exclamation";
    el.innerHTML = `
            <div class="alert alert-${type} alert-dismissible fade show py-2" role="alert">
                <i class="fa-solid fa-${icon} me-2"></i>${msg}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>`;
  }

  /**
   * Generic AJAX wrapper — returns parsed JSON or throws.
   * @param {string} url
   * @param {'POST'|'PUT'|'DELETE'|'PATCH'} method
   * @param {object} [body]
   * @returns {Promise<object>}
   */
  async function apiFetch(url, method, body) {
    const resp = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.success)
      throw new Error(data.error || "Request failed.");
    return data;
  }

  /**
   * Show a spinner on a button while an async op runs, then restore it.
   * @param {HTMLButtonElement} btn
   * @param {() => Promise<void>} fn
   */
  async function withSpinner(btn, fn) {
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Saving…`;
    try {
      await fn();
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  }

  // ── Panel helpers ─────────────────────────────────────────────────────

  /**
   * Open a form panel and scroll it into view.
   * @param {HTMLElement} panel
   */
  function openPanel(panel) {
    panel.classList.remove("d-none");
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** Close a form panel. @param {HTMLElement} panel */
  function closePanel(panel) {
    panel.classList.add("d-none");
  }

  // ══════════════════════════════════════════════════════════════════════
  // EVENT TYPES VIEW
  // ══════════════════════════════════════════════════════════════════════

  const etFormPanel = document.getElementById("etFormPanel");
  if (etFormPanel) {
    const etFormTitle = document.getElementById("etFormTitle");
    const etFormStatus = document.getElementById("etFormStatus");
    const etEditId = document.getElementById("etEditId");
    const etName = document.getElementById("etName");
    const etDescription = document.getElementById("etDescription");
    const etColor = document.getElementById("etColor");
    const etActive = document.getElementById("etActive");
    const etActiveWrap = document.getElementById("etActiveWrap");
    const etSaveBtn = document.getElementById("etSaveBtn");
    const etCancelBtn = document.getElementById("etCancelBtn");
    const etFormClose = document.getElementById("etFormClose");
    const etAddBtn = document.getElementById("etAddBtn");

    /** Reset event type form to blank add state. */
    function resetEtForm() {
      etEditId.value = "";
      etName.value = "";
      etDescription.value = "";
      etColor.value = "#6c757d";
      etActive.checked = true;
      etActiveWrap.classList.add("d-none");
      etFormStatus.innerHTML = "";
      etFormTitle.textContent = "Add Event Type";
    }

    etAddBtn.addEventListener("click", () => {
      resetEtForm();
      openPanel(etFormPanel);
      etName.focus();
    });

    document.querySelectorAll(".et-edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tr = btn.closest("tr");
        etEditId.value = tr.dataset.etId;
        etName.value = tr.dataset.etName || "";
        etDescription.value = tr.dataset.etDescription || "";
        etColor.value = tr.dataset.etColor || "#6c757d";
        etActive.checked = tr.dataset.etActive !== "false";
        etActiveWrap.classList.remove("d-none");
        etFormTitle.textContent = `Edit — ${tr.dataset.etName}`;
        etFormStatus.innerHTML = "";
        openPanel(etFormPanel);
      });
    });

    [etCancelBtn, etFormClose].forEach((el) =>
      el.addEventListener("click", () => closePanel(etFormPanel)),
    );

    etSaveBtn.addEventListener("click", () =>
      withSpinner(etSaveBtn, async () => {
        const name = etName.value.trim();
        if (!name) {
          showAlert(etFormStatus, "Name is required.");
          return;
        }

        const id = etEditId.value ? Number(etEditId.value) : null;
        const method = id ? "PUT" : "POST";
        const url = id
          ? `/oversight/tools/timelines/event-types/${id}`
          : "/oversight/tools/timelines/event-types";

        const body = {
          name,
          description: etDescription.value.trim() || null,
          color: etColor.value || null,
          active: etActive.checked,
        };

        try {
          await apiFetch(url, method, body);
          window.location.reload();
        } catch (err) {
          showAlert(etFormStatus, err.message);
        }
      }),
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // TIMELINES VIEW
  // ══════════════════════════════════════════════════════════════════════

  const yearPicker = document.getElementById("yearPicker");

  // ── Convention Days ───────────────────────────────────────────────────

  const dayFormPanel = document.getElementById("dayFormPanel");
  if (dayFormPanel) {
    const dayFormTitle = document.getElementById("dayFormTitle");
    const dayFormStatus = document.getElementById("dayFormStatus");
    const dayEditId = document.getElementById("dayEditId");
    const dayLabel = document.getElementById("dayLabel");
    const dayDate = document.getElementById("dayDate");
    const dayStart = document.getElementById("dayStart");
    const dayEnd = document.getElementById("dayEnd");
    const dayNotes = document.getElementById("dayNotes");
    const daySaveBtn = document.getElementById("daySaveBtn");
    const dayCancelBtn = document.getElementById("dayCancelBtn");
    const dayDeleteBtn = document.getElementById("dayDeleteBtn");
    const dayFormClose = document.getElementById("dayFormClose");
    const addDayBtn = document.getElementById("addDayBtn");

    /** Reset day form. */
    function resetDayForm() {
      dayEditId.value = "";
      dayLabel.value = "";
      dayDate.value = "";
      dayStart.value = "";
      dayEnd.value = "";
      dayNotes.value = "";
      dayDeleteBtn.classList.add("d-none");
      dayFormTitle.textContent = "Add Convention Day";
      dayFormStatus.innerHTML = "";
    }

    addDayBtn.addEventListener("click", () => {
      resetDayForm();
      openPanel(dayFormPanel);
      dayLabel.focus();
    });

    bindTimeInput("dayStart");
    bindTimeInput("dayEnd");

    document.querySelectorAll(".day-edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        dayEditId.value = btn.dataset.id;
        dayLabel.value = btn.dataset.label || "";
        dayDate.value = btn.dataset.date || "";
        dayStart.value = btn.dataset.start || "";
        dayEnd.value = btn.dataset.end || "";
        dayNotes.value = btn.dataset.notes || "";
        dayFormTitle.textContent = `Edit — ${btn.dataset.label || "Convention Day"}`;
        dayDeleteBtn.classList.remove("d-none");
        dayFormStatus.innerHTML = "";
        openPanel(dayFormPanel);
        dayLabel.focus();
      });
    });

    [dayCancelBtn, dayFormClose].forEach((el) =>
      el.addEventListener("click", () => closePanel(dayFormPanel)),
    );

    daySaveBtn.addEventListener("click", () =>
      withSpinner(daySaveBtn, async () => {
        if (
          !dayLabel.value.trim() ||
          !dayDate.value ||
          !dayStart.value ||
          !dayEnd.value
        ) {
          showAlert(
            dayFormStatus,
            "Label, date, program start, and end are required.",
          );
          return;
        }
        const id = dayEditId.value ? Number(dayEditId.value) : null;
        const year = Number(yearPicker?.value || new Date().getFullYear());
        if (year < 2000 || year > 2100) {
          showAlert(dayFormStatus, "Please select a valid year (2000–2100).");
          return;
        }
        const dayDateYear = new Date(
          dayDate.value + "T00:00:00Z",
        ).getUTCFullYear();
        if (dayDateYear < 2000 || dayDateYear > 2100) {
          showAlert(
            dayFormStatus,
            "Convention date is out of range. Please check the date.",
          );
          return;
        }
        const method = id ? "PUT" : "POST";
        const url = id
          ? `/oversight/tools/timelines/days/${id}`
          : "/oversight/tools/timelines/days";

        const parsedDayStart = validateTimeInput("dayStart");
        const parsedDayEnd   = validateTimeInput("dayEnd");
        if (!parsedDayStart || !parsedDayEnd) {
          showAlert(dayFormStatus, "Please correct the highlighted time fields.");
          return;
        }

        try {
          await apiFetch(url, method, {
            year,
            label: dayLabel.value.trim(),
            convention_date: dayDate.value,
            program_start: parsedDayStart,
            program_end: parsedDayEnd,
            notes: dayNotes.value.trim() || null,
          });
          window.location.reload();
        } catch (err) {
          showAlert(dayFormStatus, err.message);
        }
      }),
    );

    dayDeleteBtn.addEventListener("click", async () => {
      const id = Number(dayEditId.value);
      if (
        !id ||
        !confirm("Delete this convention day and all its sessions and shifts?")
      )
        return;
      try {
        await apiFetch(`/oversight/tools/timelines/days/${id}`, "DELETE");
        window.location.reload();
      } catch (err) {
        showAlert(dayFormStatus, err.message);
      }
    });
  }

  // ── Copy Day ──────────────────────────────────────────────────────────

  const copyDayFormPanel = document.getElementById("copyDayFormPanel");
  if (copyDayFormPanel) {
    const copyDayFormTitle = document.getElementById("copyDayFormTitle");
    const copyDayFormStatus = document.getElementById("copyDayFormStatus");
    const copySourceDayId = document.getElementById("copySourceDayId");
    const copyDayLabel = document.getElementById("copyDayLabel");
    const copyDayDate = document.getElementById("copyDayDate");
    const copyDayStart = document.getElementById("copyDayStart");
    const copyDayEnd = document.getElementById("copyDayEnd");
    const copyDayNotes = document.getElementById("copyDayNotes");
    const copyDaySaveBtn = document.getElementById("copyDaySaveBtn");
    const copyDayCancelBtn = document.getElementById("copyDayCancelBtn");
    const copyDayFormClose = document.getElementById("copyDayFormClose");

    document.querySelectorAll(".day-copy-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        copySourceDayId.value = btn.dataset.id;
        copyDayLabel.value = btn.dataset.label || "";
        copyDayDate.value = "";
        copyDayStart.value = btn.dataset.start || "";
        copyDayEnd.value = btn.dataset.end || "";
        copyDayNotes.value = "";
        copyDayFormStatus.innerHTML = "";
        copyDayFormTitle.textContent = `Copy — ${btn.dataset.label}`;
        openPanel(copyDayFormPanel);
        copyDayDate.focus();
      });
    });

    [copyDayCancelBtn, copyDayFormClose].forEach((el) =>
      el.addEventListener("click", () => closePanel(copyDayFormPanel)),
    );

    bindTimeInput("copyDayStart");
    bindTimeInput("copyDayEnd");

    copyDaySaveBtn.addEventListener("click", () =>
      withSpinner(copyDaySaveBtn, async () => {
        if (
          !copyDayLabel.value.trim() ||
          !copyDayDate.value ||
          !copyDayStart.value ||
          !copyDayEnd.value
        ) {
          showAlert(
            copyDayFormStatus,
            "Label, date, program start, and end are required.",
          );
          return;
        }

        const year = Number(yearPicker?.value || new Date().getFullYear());
        if (year < 2000 || year > 2100) {
          showAlert(
            copyDayFormStatus,
            "Please select a valid year (2000–2100).",
          );
          return;
        }
        const parsedCopyStart = validateTimeInput("copyDayStart");
        const parsedCopyEnd   = validateTimeInput("copyDayEnd");
        if (!parsedCopyStart || !parsedCopyEnd) {
          showAlert(copyDayFormStatus, "Please correct the highlighted time fields.");
          return;
        }

        try {
          await apiFetch(
            `/oversight/tools/timelines/days/${copySourceDayId.value}/copy`,
            "POST",
            {
              year,
              label: copyDayLabel.value.trim(),
              convention_date: copyDayDate.value,
              program_start: parsedCopyStart,
              program_end: parsedCopyEnd,
              notes: copyDayNotes.value.trim() || null,
            },
          );
          window.location.reload();
        } catch (err) {
          showAlert(copyDayFormStatus, err.message);
        }
      }),
    );
  }
  // ── Sessions ──────────────────────────────────────────────────────────

  const sessionFormPanel = document.getElementById("sessionFormPanel");
  if (sessionFormPanel) {
    const sessionFormTitle = document.getElementById("sessionFormTitle");
    const sessionFormStatus = document.getElementById("sessionFormStatus");
    const sessionEditId = document.getElementById("sessionEditId");
    const sessionDayId = document.getElementById("sessionDayId");
    const sessionLabel = document.getElementById("sessionLabel");
    const sessionOrder = document.getElementById("sessionOrder");
    const sessionStart = document.getElementById("sessionStart");
    const sessionEnd = document.getElementById("sessionEnd");
    const sessionNotes = document.getElementById("sessionNotes");
    const sessionSaveBtn = document.getElementById("sessionSaveBtn");
    const sessionCancelBtn = document.getElementById("sessionCancelBtn");
    const sessionDeleteBtn = document.getElementById("sessionDeleteBtn");
    const sessionFormClose = document.getElementById("sessionFormClose");

    /** Reset session form. */
    function resetSessionForm() {
      sessionEditId.value = "";
      sessionLabel.value = "";
      sessionOrder.value = "";
      sessionStart.value = "";
      sessionEnd.value = "";
      sessionNotes.value = "";
      sessionDeleteBtn.classList.add("d-none");
      sessionFormTitle.textContent = "Add Session";
      sessionFormStatus.innerHTML = "";
    }

    document.getElementById("addSessionBtn")?.addEventListener("click", () => {
      resetSessionForm();
      openPanel(sessionFormPanel);
      sessionLabel.focus();
    });

    document.querySelectorAll(".session-edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        sessionEditId.value = btn.dataset.id;
        sessionLabel.value = btn.dataset.label || "";
        sessionOrder.value = btn.dataset.order || "";
        sessionStart.value = btn.dataset.start || "";
        sessionEnd.value = btn.dataset.end || "";
        sessionNotes.value = btn.dataset.notes || "";
        sessionDeleteBtn.classList.remove("d-none");
        sessionFormTitle.textContent = `Edit — ${btn.dataset.label}`;
        sessionFormStatus.innerHTML = "";
        openPanel(sessionFormPanel);
      });
    });

    [sessionCancelBtn, sessionFormClose].forEach((el) =>
      el.addEventListener("click", () => closePanel(sessionFormPanel)),
    );

    bindTimeInput("sessionStart");
    bindTimeInput("sessionEnd");

    sessionSaveBtn.addEventListener("click", () =>
      withSpinner(sessionSaveBtn, async () => {
        if (
          !sessionLabel.value.trim() ||
          !sessionStart.value ||
          !sessionEnd.value
        ) {
          showAlert(sessionFormStatus, "Label, start, and end are required.");
          return;
        }
        const id = sessionEditId.value ? Number(sessionEditId.value) : null;
        const method = id ? "PUT" : "POST";
        const url = id
          ? `/oversight/tools/timelines/sessions/${id}`
          : "/oversight/tools/timelines/sessions";

        const parsedSessionStart = validateTimeInput("sessionStart");
        const parsedSessionEnd   = validateTimeInput("sessionEnd");
        if (!parsedSessionStart || !parsedSessionEnd) {
          showAlert(sessionFormStatus, "Please correct the highlighted time fields.");
          return;
        }

        try {
          await apiFetch(url, method, {
            convention_day_id: Number(sessionDayId.value),
            label: sessionLabel.value.trim(),
            session_order: sessionOrder.value ? Number(sessionOrder.value) : 0,
            start_time: parsedSessionStart,
            end_time: parsedSessionEnd,
            notes: sessionNotes.value.trim() || null,
          });
          if (id) storeLastAccordion(id);
          window.location.reload();
        } catch (err) {
          showAlert(sessionFormStatus, err.message);
        }
      }),
    );

    sessionDeleteBtn.addEventListener("click", async () => {
      const id = Number(sessionEditId.value);
      if (!id || !confirm("Delete this session and all its shifts?")) return;
      try {
        await apiFetch(`/oversight/tools/timelines/sessions/${id}`, "DELETE");
        window.location.reload();
      } catch (err) {
        showAlert(sessionFormStatus, err.message);
      }
    });
  }

  // ── Shifts ────────────────────────────────────────────────────────────

  const shiftFormPanel = document.getElementById("shiftFormPanel");
  if (shiftFormPanel) {
    const shiftFormTitle = document.getElementById("shiftFormTitle");
    const shiftFormStatus = document.getElementById("shiftFormStatus");
    const shiftEditId = document.getElementById("shiftEditId");
    const shiftSessionId = document.getElementById("shiftSessionId");
    const shiftEventType = document.getElementById("shiftEventType");
    const shiftLabel = document.getElementById("shiftLabel");
    const shiftStart = document.getElementById("shiftStart");
    const shiftEnd = document.getElementById("shiftEnd");
    const shiftSmsCode = document.getElementById("shiftSmsCode");
    const shiftInvitable = document.getElementById("shiftInvitable");
    const shiftNotes = document.getElementById("shiftNotes");
    const shiftSaveBtn = document.getElementById("shiftSaveBtn");
    const shiftCancelBtn = document.getElementById("shiftCancelBtn");
    const shiftDeleteBtn = document.getElementById("shiftDeleteBtn");
    const shiftFormClose = document.getElementById("shiftFormClose");

    /** Reset shift form. */
    function resetShiftForm() {
      shiftEditId.value = "";
      shiftSessionId.value = "";
      shiftEventType.value = "";
      shiftLabel.value = "";
      shiftStart.value = "";
      shiftEnd.value = "";
      shiftSmsCode.value = "";
      shiftNotes.value = "";
      shiftInvitable.checked = false;
      const shiftDepartment = document.getElementById("shiftDepartment");
      if (shiftDepartment) shiftDepartment.value = "";
      shiftDeleteBtn.classList.add("d-none");
      shiftFormTitle.textContent = "Add Shift";
      shiftFormStatus.innerHTML = "";
    }

    document.querySelectorAll(".add-shift-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        resetShiftForm();
        shiftSessionId.value = btn.dataset.sessionId;
        openPanel(shiftFormPanel);
        shiftEventType.focus();
      });
    });

    document.querySelectorAll(".shift-edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        shiftEditId.value = btn.dataset.id;
        shiftSessionId.value = btn.dataset.sessionId;
        shiftEventType.value = btn.dataset.eventTypeId;
        shiftLabel.value = btn.dataset.label || "";
        shiftStart.value = btn.dataset.start || "";
        shiftEnd.value = btn.dataset.end || "";
        shiftSmsCode.value = btn.dataset.smsCode || "";
        shiftNotes.value = btn.dataset.notes || "";
        shiftInvitable.checked = btn.dataset.invitable === "true";
        const shiftDeptSel = document.getElementById("shiftDepartment");
        if (shiftDeptSel) shiftDeptSel.value = btn.dataset.department || "";
        shiftDeleteBtn.classList.remove("d-none");
        shiftFormTitle.textContent = `Edit Shift — ${btn.dataset.label}`;
        shiftFormStatus.innerHTML = "";
        openPanel(shiftFormPanel);
      });
    });

    [shiftCancelBtn, shiftFormClose].forEach((el) =>
      el.addEventListener("click", () => closePanel(shiftFormPanel)),
    );

    bindTimeInput("shiftStart");
    bindTimeInput("shiftEnd");

    shiftSaveBtn.addEventListener("click", () =>
      withSpinner(shiftSaveBtn, async () => {
        if (
          !shiftEventType.value ||
          !shiftLabel.value.trim() ||
          !shiftStart.value ||
          !shiftEnd.value ||
          !document.getElementById("shiftDepartment")?.value
        ) {
          showAlert(
            shiftFormStatus,
            "Event type, label, department, start, and end are required.",
          );
          return;
        }
        const id = shiftEditId.value ? Number(shiftEditId.value) : null;
        const method = id ? "PUT" : "POST";
        const url = id
          ? `/oversight/tools/timelines/shifts/${id}`
          : "/oversight/tools/timelines/shifts";

        const parsedShiftStart = validateTimeInput("shiftStart");
        const parsedShiftEnd   = validateTimeInput("shiftEnd");
        if (!parsedShiftStart || !parsedShiftEnd) {
          showAlert(shiftFormStatus, "Please correct the highlighted time fields.");
          return;
        }

        try {
          await apiFetch(url, method, {
            session_id: Number(shiftSessionId.value),
            event_type_id: Number(shiftEventType.value),
            label: shiftLabel.value.trim(),
            start_time: parsedShiftStart,
            end_time: parsedShiftEnd,
            volunteer_need: null,
            department: document.getElementById("shiftDepartment")?.value || null,
            sms_code: shiftSmsCode.value.trim().toUpperCase() || null,
            notes: shiftNotes.value.trim() || null,
            invitable: shiftInvitable.checked,
          });
          window.location.reload();
        } catch (err) {
          showAlert(shiftFormStatus, err.message);
        }
      }),
    );

    shiftDeleteBtn.addEventListener("click", async () => {
      const id = Number(shiftEditId.value);
      if (
        !id ||
        !confirm("Delete this shift and its location/task assignments?")
      )
        return;
      try {
        await apiFetch(`/oversight/tools/timelines/shifts/${id}`, "DELETE");
        storeLastAccordion(shiftSessionId.value);
        window.location.reload();
      } catch (err) {
        showAlert(shiftFormStatus, err.message);
      }
    });
  }

  // ── Schedule Assignments ──────────────────────────────────────────────

  const assignFormPanel = document.getElementById("assignFormPanel");
  if (assignFormPanel) {
    let assignContextSessionId = "";
    const assignFormTitle = document.getElementById("assignFormTitle");
    const assignFormStatus = document.getElementById("assignFormStatus");
    const assignShiftId = document.getElementById("assignShiftId");
    const assignEditId = document.getElementById("assignEditId");
    const assignLocTask = document.getElementById("assignLocationTask");
    const assignLocationNote = document.getElementById("assignLocationNote");
    const assignNotes = document.getElementById("assignNotes");
    const assignSaveBtn = document.getElementById("assignSaveBtn");
    const assignSaveBtnLabel = document.getElementById("assignSaveBtnLabel");
    const assignCancelBtn = document.getElementById("assignCancelBtn");
    const assignFormClose = document.getElementById("assignFormClose");
    const assignVolNeed = document.getElementById("assignVolNeed");
    const assignVolMin = document.getElementById("assignVolMin");
    const assignVolMax = document.getElementById("assignVolMax");

    document.querySelectorAll(".add-assignment-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        assignEditId.value = "";
        assignShiftId.value = btn.dataset.shiftId;
        assignContextSessionId =
          btn.closest(".accordion-item")?.id?.replace("session-block-", "") ||
          "";
        assignLocTask.disabled = false;
        assignLocTask.value = "";
        assignLocationNote.classList.add("d-none");
        if (assignVolMin) assignVolMin.value = "";
        if (assignVolNeed) assignVolNeed.value = "";
        if (assignVolMax) assignVolMax.value = "";
        assignNotes.value = "";
        assignFormStatus.innerHTML = "";
        assignFormTitle.textContent = `Assign to: ${btn.dataset.shiftLabel}`;
        assignSaveBtnLabel.textContent = "Assign";
        openPanel(assignFormPanel);
        assignLocTask.focus();
      });
    });

    document.querySelectorAll(".edit-assignment-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        assignEditId.value = btn.dataset.assignmentId;
        assignContextSessionId =
          btn.closest(".accordion-item")?.id?.replace("session-block-", "") ||
          "";
        assignShiftId.value = "";
        assignLocTask.disabled = true;
        assignLocationNote.classList.remove("d-none");
        if (assignVolMin) assignVolMin.value = btn.dataset.volMin || "";
        if (assignVolNeed)
          assignVolNeed.value = btn.dataset.volunteerNeed || "";
        if (assignVolMax) assignVolMax.value = btn.dataset.volMax || "";
        assignNotes.value = btn.dataset.notes || "";
        assignFormStatus.innerHTML = "";
        assignFormTitle.textContent = `Edit — ${btn.dataset.locationName}${btn.dataset.shiftLabel ? ` (${btn.dataset.shiftLabel})` : ""}`;
        assignSaveBtnLabel.textContent = "Save";
        openPanel(assignFormPanel);
        if (assignVolNeed) assignVolNeed.focus();
        else assignNotes.focus();
      });
    });

    [assignCancelBtn, assignFormClose].forEach((el) =>
      el.addEventListener("click", () => closePanel(assignFormPanel)),
    );

    assignSaveBtn.addEventListener("click", () =>
      withSpinner(assignSaveBtn, async () => {
        const editId = assignEditId.value ? Number(assignEditId.value) : null;

        if (editId) {
          // Edit mode — update volunteer_need, vol_min, vol_max and notes
          try {
            await apiFetch(
              `/oversight/tools/timelines/assignments/${editId}`,
              "PUT",
              {
                volunteer_need:
                  assignVolNeed?.value !== ""
                    ? Number(assignVolNeed?.value)
                    : null,
                vol_min:
                  assignVolMin?.value !== ""
                    ? Number(assignVolMin?.value)
                    : null,
                vol_max:
                  assignVolMax?.value !== ""
                    ? Number(assignVolMax?.value)
                    : null,
                notes: assignNotes.value.trim() || null,
              },
            );
            storeLastAccordion(assignContextSessionId);
            window.location.reload();
          } catch (err) {
            showAlert(assignFormStatus, err.message);
          }
          return;
        }

        // Create mode — one POST per selected location
        const selected = Array.from(assignLocTask.selectedOptions).map((o) =>
          Number(o.value),
        );
        if (selected.length === 0) {
          showAlert(assignFormStatus, "Please select at least one location.");
          return;
        }
        try {
          await Promise.all(
            selected.map((locationTaskId) =>
              apiFetch("/oversight/tools/timelines/assignments", "POST", {
                shift_id: Number(assignShiftId.value),
                location_task_id: locationTaskId,
                volunteer_need:
                  assignVolNeed?.value !== ""
                    ? Number(assignVolNeed?.value)
                    : null,
                vol_min:
                  assignVolMin?.value !== ""
                    ? Number(assignVolMin?.value)
                    : null,
                vol_max:
                  assignVolMax?.value !== ""
                    ? Number(assignVolMax?.value)
                    : null,
                notes: assignNotes.value.trim() || null,
              }),
            ),
          );
          storeLastAccordion(assignContextSessionId);
          window.location.reload();
        } catch (err) {
          showAlert(assignFormStatus, err.message);
        }
      }),
    );

    // Remove assignment badges inline
    document.querySelectorAll(".remove-assignment-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.assignmentId);
        if (!id || !confirm("Remove this location/task from the shift?"))
          return;
        const sessionIdForRestore =
          btn.closest(".accordion-item")?.id?.replace("session-block-", "") ||
          "";
        try {
          await apiFetch(
            `/oversight/tools/timelines/assignments/${id}`,
            "DELETE",
          );
          storeLastAccordion(sessionIdForRestore);
          window.location.reload();
        } catch (err) {
          console.error("[timelines] remove assignment error:", err);
          alert("Failed to remove assignment — please try again.");
        }
      });
    });
  }
  // ── Shift invitable toggle ────────────────────────────────────────────

  /**
   * Wire the invitable toggle buttons on shift cards.
   * Fires a PATCH to flip the flag, then reloads to reflect the new state.
   * Stores the parent session accordion so it reopens after reload.
   */
  document.querySelectorAll(".shift-invitable-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id);
      const current = btn.dataset.invitable === "true";
      const invitable = !current;

      const sessionId =
        btn.closest(".accordion-item")?.id?.replace("session-block-", "") || "";

      try {
        await apiFetch(
          `/oversight/tools/timelines/shifts/${id}/invitable`,
          "PATCH",
          { invitable },
        );
        storeLastAccordion(sessionId);
        window.location.reload();
      } catch (err) {
        console.error("[timelines] invitable toggle error:", err);
        alert("Failed to update invitable status — please try again.");
      }
    });
  });
  // Apply color swatches — inline style attributes are blocked by CSP,
  // so background color is set via JS from data-color attributes.
  document.querySelectorAll(".et-color-swatch").forEach((el) => {
    el.style.backgroundColor = el.dataset.color || "#6c757d";
  });

  // Apply shift card border colors from data-shift-color attributes.
  document.querySelectorAll(".shift-card").forEach((el) => {
    el.style.setProperty(
      "--shift-border-color",
      el.dataset.shiftColor || "#6c757d",
    );
  });

  // Apply shift badge background colors from data-badge-color attributes.
  document.querySelectorAll(".shift-badge").forEach((el) => {
    el.style.setProperty("--badge-color", el.dataset.badgeColor || "#6c757d");
  });
  // ── Date / time display formatting ───────────────────────────────────
  // EJS emits raw mssql values into data-raw attributes.
  // We format them here to keep all JS out of the template.

  document.querySelectorAll(".fmt-time").forEach((el) => {
    el.textContent = fmtTime(el.dataset.raw);
  });

  document.querySelectorAll(".fmt-date").forEach((el) => {
    el.textContent = fmtDate(el.dataset.raw);
  });

  // Fix <input type="time"> pre-fill values on edit buttons.
  // data-start / data-end are ISO strings from mssql — convert to HH:MM.
  document.querySelectorAll("[data-start]").forEach((el) => {
    el.dataset.start = fmtTimeInput(el.dataset.start);
  });
  document.querySelectorAll("[data-end]").forEach((el) => {
    el.dataset.end = fmtTimeInput(el.dataset.end);
  });
});
