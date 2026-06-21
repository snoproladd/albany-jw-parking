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

import {
  openRendezvousPanel,
  dismissRendezvousPanel,
} from './rendezvous.js';

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
   * Open a form modal. Focuses an optional element after animation completes.
   * @param {HTMLElement} panel
   * @param {HTMLElement|null} [focusEl]
   */
  function openPanel(panel, focusEl = null) {
    if (focusEl) {
      panel.addEventListener('shown.bs.modal', () => focusEl.focus(), { once: true });
    }
    bootstrap.Modal.getOrCreateInstance(panel).show();
  }

  /**
   * Close a form modal.
   * @param {HTMLElement} panel
   */
  function closePanel(panel) {
    bootstrap.Modal.getOrCreateInstance(panel).hide();
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCHEDULER CATEGORIES VIEW
  // ══════════════════════════════════════════════════════════════════════

  const etFormPanel = document.getElementById("etFormPanel");
  if (etFormPanel) {
    const etFormTitle    = document.getElementById("etFormTitle");
    const etFormStatus   = document.getElementById("etFormStatus");
    const etEditId       = document.getElementById("etEditId");
    const etDeptKey      = document.getElementById("etDeptKey");
    const etDeptKeyWrap  = document.getElementById("etDeptKeyWrap");
    const etName         = document.getElementById("etName");
    const etColor        = document.getElementById("etColor");
    const etSortOrder    = document.getElementById("etSortOrder");
    const etActive       = document.getElementById("etActive");
    const etActiveWrap   = document.getElementById("etActiveWrap");
    const etSaveBtn      = document.getElementById("etSaveBtn");
    const etCancelBtn    = document.getElementById("etCancelBtn");
    const etFormClose    = document.getElementById("etFormClose");
    const etAddBtn       = document.getElementById("etAddBtn");

    /** Reset category form to blank add state. */
    function resetEtForm() {
      etEditId.value      = "";
      etDeptKey.value     = "";
      etName.value        = "";
      etColor.value       = "#6c757d";
      etSortOrder.value   = "0";
      etActive.checked    = true;
      etDeptKeyWrap.classList.remove("d-none");
      etActiveWrap.classList.add("d-none");
      etFormStatus.innerHTML = "";
      etFormTitle.textContent = "Add Category";
    }

    etAddBtn.addEventListener("click", () => {
      resetEtForm();
      openPanel(etFormPanel, etName);
    });

    document.querySelectorAll(".et-edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tr = btn.closest("tr");
        etEditId.value    = tr.dataset.etId;
        etName.value      = tr.dataset.etName     || "";
        etColor.value     = tr.dataset.etColor    || "#6c757d";
        etSortOrder.value = tr.dataset.etSortOrder ?? "0";
        etActive.checked  = tr.dataset.etActive   !== "false";
        etDeptKeyWrap.classList.add("d-none");
        etActiveWrap.classList.remove("d-none");
        etFormTitle.textContent = `Edit — ${tr.dataset.etName}`;
        etFormStatus.innerHTML  = "";
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

        const id     = etEditId.value ? Number(etEditId.value) : null;
        const method = id ? "PUT" : "POST";
        const url    = id
          ? `/oversight/tools/timelines/event-types/${id}`
          : "/oversight/tools/timelines/event-types";

        const body = id
          ? {
              name,
              color:      etColor.value     || null,
              sort_order: Number(etSortOrder.value) || 0,
              active:     etActive.checked,
            }
          : {
              dept_key:   etDeptKey.value.trim(),
              name,
              color:      etColor.value     || null,
              sort_order: Number(etSortOrder.value) || 0,
            };

        if (!id && !body.dept_key) {
          showAlert(etFormStatus, "Machine key is required.");
          return;
        }

        try {
          await apiFetch(url, method, body);
          window.location.reload();
        } catch (err) {
          showAlert(etFormStatus, err.message);
        }
      }),
    );
  }

  // ── Sensitivity Toggle ────────────────────────────────────────────────

  const etSensitivityStatus = document.getElementById("etSensitivityStatus");

  /**
   * Wire sensitivity toggle buttons. Each click PATCHes the flag and
   * reloads so EJS re-renders the correct button state and access icon.
   */
  document.querySelectorAll(".et-sensitivity-btn").forEach((btn) => {
    btn.addEventListener("click", () =>
      withSpinner(btn, async () => {
        const id          = Number(btn.dataset.id);
        const isSensitive = btn.dataset.sensitive !== "true";
        try {
          await apiFetch(
            `/api/scheduler-categories/${id}/sensitivity`,
            "PATCH",
            { isSensitive },
          );
          window.location.reload();
        } catch (err) {
          if (etSensitivityStatus) showAlert(etSensitivityStatus, err.message);
        }
      }),
    );
  });

  // ── Access Management Panel ───────────────────────────────────────────

  const etAccessPanel = document.getElementById("etAccessPanel");
  if (etAccessPanel) {
    const etAccessTitle       = document.getElementById("etAccessTitle");
    const etAccessSearch      = document.getElementById("etAccessSearch");
    const etAccessDropdown    = document.getElementById("etAccessDropdown");
    const etAccessGrantBtn    = document.getElementById("etAccessGrantBtn");
    const etAccessGranteeList = document.getElementById("etAccessGranteeList");
    const etAccessEmpty       = document.getElementById("etAccessEmpty");
    const etAccessStatus      = document.getElementById("etAccessStatus");

    /** @type {number|null} */
    let activeEventTypeId = null;
    /** @type {{id:number, firstName:string, lastName:string}|null} */
    let selectedVolunteer = null;
    /** @type {ReturnType<typeof setTimeout>|null} */
    let searchTimeout = null;

    /** Clear the volunteer search field and dropdown back to empty state. */
    function resetSearch() {
      etAccessSearch.value = "";
      etAccessDropdown.innerHTML = "";
      etAccessDropdown.classList.remove("is-open");
      selectedVolunteer        = null;
      etAccessGrantBtn.disabled = true;
    }

    /**
     * Fetch and render current grantees for the active category.
     * @returns {Promise<void>}
     */
    async function loadGrantees() {
      try {
        const data = await fetch(
          `/api/scheduler-categories/${activeEventTypeId}/sensitivity`,
        ).then((r) => r.json());
        renderGrantees(data.volunteers || []);
      } catch {
        renderGrantees([]);
      }
    }

    /**
     * Render the list of volunteers currently granted access.
     * @param {Array<{volunteer_id:number, full_name:string}>} list
     */
    function renderGrantees(list) {
      Array.from(etAccessGranteeList.querySelectorAll(".et-grantee-row")).forEach(
        (el) => el.remove(),
      );
      if (!list.length) {
        etAccessEmpty.classList.remove("d-none");
        return;
      }
      etAccessEmpty.classList.add("d-none");
      list.forEach((v) => {
        const row = document.createElement("div");
        row.className = "et-grantee-row d-flex align-items-center justify-content-between";
        row.dataset.vid = v.volunteer_id;

        const nameSpan = document.createElement("span");
        nameSpan.className   = "small";
        nameSpan.textContent = v.full_name;

        const revokeBtn = document.createElement("button");
        revokeBtn.type      = "button";
        revokeBtn.className = "btn btn-outline-danger btn-sm";
        revokeBtn.dataset.vid = v.volunteer_id;
        revokeBtn.innerHTML = `<i class="fa-solid fa-xmark me-1"></i>Revoke`;

        revokeBtn.addEventListener("click", () =>
          withSpinner(revokeBtn, async () => {
            try {
              await apiFetch(
                `/api/scheduler-categories/${activeEventTypeId}/sensitivity/${v.volunteer_id}`,
                "DELETE",
              );
              await loadGrantees();
            } catch (err) {
              showAlert(etAccessStatus, err.message);
            }
          }),
        );

        row.appendChild(nameSpan);
        row.appendChild(revokeBtn);
        etAccessGranteeList.appendChild(row);
      });
    }

    document.querySelectorAll(".et-access-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeEventTypeId          = Number(btn.dataset.id);
        etAccessTitle.textContent  = `Schedule Access — ${btn.dataset.name}`;
        etAccessStatus.innerHTML   = "";
        resetSearch();
        loadGrantees();
        openPanel(etAccessPanel, etAccessSearch);
      });
    });

    // Volunteer typeahead search
    etAccessSearch.addEventListener("input", () => {
      clearTimeout(searchTimeout);
      selectedVolunteer        = null;
      etAccessGrantBtn.disabled = true;

      const q = etAccessSearch.value.trim();
      if (q.length < 2) {
        etAccessDropdown.innerHTML = "";
        etAccessDropdown.classList.remove("is-open");
        return;
      }

      searchTimeout = setTimeout(async () => {
        try {
          const data = await fetch(
            `/api/volunteers/search?q=${encodeURIComponent(q)}`,
          ).then((r) => r.json());

          etAccessDropdown.innerHTML = "";
          if (!data.results?.length) {
            etAccessDropdown.classList.remove("is-open");
            return;
          }

          data.results.forEach((v) => {
            const item = document.createElement("div");
            item.className   = "et-access-dropdown-item";
            item.textContent = `${v.lastName}, ${v.firstName}`;
            item.addEventListener("click", () => {
              selectedVolunteer        = v;
              etAccessSearch.value     = `${v.lastName}, ${v.firstName}`;
              etAccessDropdown.innerHTML = "";
              etAccessDropdown.classList.remove("is-open");
              etAccessGrantBtn.disabled = false;
            });
            etAccessDropdown.appendChild(item);
          });
          etAccessDropdown.classList.add("is-open");
        } catch {
          etAccessDropdown.classList.remove("is-open");
        }
      }, 300);
    });

    document.addEventListener("click", (e) => {
      if (
        !etAccessSearch.contains(e.target) &&
        !etAccessDropdown.contains(e.target)
      ) {
        etAccessDropdown.classList.remove("is-open");
      }
    });

    etAccessGrantBtn.addEventListener("click", () =>
      withSpinner(etAccessGrantBtn, async () => {
        if (!selectedVolunteer) return;
        const grantName = `${selectedVolunteer.lastName}, ${selectedVolunteer.firstName}`;
        try {
          await apiFetch(
            `/api/scheduler-categories/${activeEventTypeId}/sensitivity`,
            "POST",
            { volunteerId: selectedVolunteer.id },
          );
          resetSearch();
          showAlert(etAccessStatus, `Access granted to ${grantName}.`, "success");
          await loadGrantees();
        } catch (err) {
          showAlert(etAccessStatus, err.message);
        }
      }),
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // TIMELINES VIEW
  // ══════════════════════════════════════════════════════════════════════

  const yearPicker = document.getElementById("yearPicker");

  // Submit the year-picker form on change so no inline onchange is needed.
  yearPicker?.addEventListener("change", () => yearPicker.closest("form").submit());

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
    const daySchedulable = document.getElementById("daySchedulable");

    function resetDayForm() {
      dayEditId.value = "";
      dayLabel.value = "";
      dayDate.value = "";
      dayStart.value = "";
      dayEnd.value = "";
      dayNotes.value = "";
      if (daySchedulable) daySchedulable.checked = true;
      dayDeleteBtn.classList.add("d-none");
      dayFormTitle.textContent = "Add Convention Day";
      dayFormStatus.innerHTML = "";
    }

    addDayBtn.addEventListener("click", () => {
      resetDayForm();
      openPanel(dayFormPanel, dayLabel);
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
        if (daySchedulable) daySchedulable.checked = btn.dataset.schedulable !== "false";
        dayFormTitle.textContent = `Edit — ${btn.dataset.label || "Convention Day"}`;
        dayDeleteBtn.classList.remove("d-none");
        dayFormStatus.innerHTML = "";
        openPanel(dayFormPanel, dayLabel);
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
            schedulable: daySchedulable ? daySchedulable.checked : true,
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
        !confirm("Delete this convention day and ALL its sessions, shifts, assignments, alert history, attendance, and invitations?")
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
        openPanel(copyDayFormPanel, copyDayDate);
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
      openPanel(sessionFormPanel, sessionLabel);
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
      if (!id || !confirm("Delete this session and ALL its shifts, assignments, alert history, attendance, and invitations?")) return;
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
    const shiftIsMeeting = document.getElementById("shiftIsMeeting");
    const shiftDeptGroup = document.getElementById("shiftDeptGroup");
    const shiftLabel = document.getElementById("shiftLabel");
    const shiftStart = document.getElementById("shiftStart");
    const shiftEnd = document.getElementById("shiftEnd");
    const shiftSmsCode = document.getElementById("shiftSmsCode");
    const shiftSmsCodeHint = document.getElementById("shiftSmsCodeHint");
    const shiftInvitable = document.getElementById("shiftInvitable");
    const shiftNotes = document.getElementById("shiftNotes");
    const shiftSaveBtn = document.getElementById("shiftSaveBtn");
    const shiftCancelBtn = document.getElementById("shiftCancelBtn");
    const shiftDeleteBtn = document.getElementById("shiftDeleteBtn");
    const shiftFormClose = document.getElementById("shiftFormClose");
    const shiftHasKeyman = document.getElementById("shiftHasKeyman");
    const shiftHasKeymanAsst = document.getElementById("shiftHasKeymanAsst");
    const shiftKeymanGroup = document.getElementById("shiftKeymanGroup");

    /** Convention date (YYYY-MM-DD) for the currently open add-shift form. */
    let shiftContextDate = "";

    /**
     * True when the SMS code field's current value was placed by auto-suggest.
     * Cleared on any manual keystroke so the user's input is never overwritten.
     * @type {boolean}
     */
    let codeAutoSuggested = false;

    /**
     * Fetch a suggested SMS code from the server and populate the code field
     * when the user has not already typed their own value.
     *
     * Runs only in add mode (shiftEditId empty). Skips when:
     *  - No department is selected
     *  - No convention date is stored for this form session
     *  - The field already contains a manually-entered value
     *
     * @returns {Promise<void>}
     */
    /**
     * Fetch a suggested SMS code from the server and populate the code field
     * when the user has not already typed their own value.
     *
     * Handles two paths:
     *  - Meeting shifts: passes is_meeting=true; no department needed.
     *  - Crew shifts:    passes department; bails if none selected.
     *
     * Runs only in add mode (shiftEditId empty).
     *
     * @returns {Promise<void>}
     */
    async function refreshSmsCodeSuggestion() {
      if (shiftEditId.value) return;
      if (!shiftContextDate) return;

      // Don't overwrite a value the user typed themselves
      if (!codeAutoSuggested && shiftSmsCode.value.trim() !== "") return;

      const isMeeting = shiftIsMeeting?.checked || false;
      const deptVal = document.getElementById("shiftDepartment")?.value || "";

      if (!isMeeting && !deptVal) return;

      try {
        const params = new URLSearchParams({ conventionDate: shiftContextDate });
        if (isMeeting) {
          params.set("is_meeting", "true");
        } else {
          params.set("category_id", deptVal);
        }
        const res = await fetch(`/api/shifts/suggest-code?${params}`);
        const data = await res.json();
        if (data.success && data.code) {
          shiftSmsCode.value = data.code;
          codeAutoSuggested = true;
          shiftSmsCodeHint?.classList.remove("d-none");
        }
      } catch {
        // Silent — suggestion is best-effort
      }
    }

    // Re-suggest when department changes (add mode only)
    document.getElementById("shiftDepartment")?.addEventListener("change", () => {
      if (!shiftEditId.value) refreshSmsCodeSuggestion();
    });

    // Meeting toggle — show/hide dept group, KM/KA group, and re-suggest
    shiftIsMeeting?.addEventListener("change", () => {
      const isMeeting = shiftIsMeeting.checked;
      shiftDeptGroup?.classList.toggle("d-none", isMeeting);
      shiftKeymanGroup?.classList.toggle("d-none", isMeeting);
      if (!shiftEditId.value) {
        codeAutoSuggested = false;
        shiftSmsCode.value = "";
        shiftSmsCodeHint?.classList.add("d-none");
        refreshSmsCodeSuggestion();
      }
    });

    // User typing in the code field takes ownership — stop auto-suggesting
    shiftSmsCode.addEventListener("input", () => {
      codeAutoSuggested = false;
      shiftSmsCodeHint?.classList.add("d-none");
    });

    /**
     * When the Keyman toggle changes, enforce the KA-requires-KM rule:
     * disabling KM also disables and unchecks KA.
     */
    shiftHasKeyman?.addEventListener("change", () => {
      if (!shiftHasKeyman.checked) {
        if (shiftHasKeymanAsst) {
          shiftHasKeymanAsst.checked = false;
          shiftHasKeymanAsst.disabled = true;
        }
      } else {
        if (shiftHasKeymanAsst) shiftHasKeymanAsst.disabled = false;
      }
    });

    /**
     * Reset the shift form to a clean add-mode state.
     */
    function resetShiftForm() {
      shiftEditId.value = "";
      shiftSessionId.value = "";
      if (shiftIsMeeting) shiftIsMeeting.checked = false;
      shiftDeptGroup?.classList.remove("d-none");
      shiftLabel.value = "";
      shiftStart.value = "";
      shiftEnd.value = "";
      shiftSmsCode.value = "";
      shiftNotes.value = "";
      shiftInvitable.checked = false;
      if (shiftHasKeyman) shiftHasKeyman.checked = true;
      if (shiftHasKeymanAsst) {
        shiftHasKeymanAsst.checked = true;
        shiftHasKeymanAsst.disabled = false;
      }
      shiftKeymanGroup?.classList.remove("d-none");
      codeAutoSuggested = false;
      shiftSmsCodeHint?.classList.add("d-none");
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
        shiftContextDate = btn.dataset.conventionDate || "";
        openPanel(shiftFormPanel, shiftLabel);
        // Fire suggestion immediately if a department is already selected
        // (covers browser state restoration / repeated opens).
        refreshSmsCodeSuggestion();
      });
    });

    document.querySelectorAll(".shift-edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const isMtg = btn.dataset.isMeeting === "true";
        shiftEditId.value = btn.dataset.id;
        shiftSessionId.value = btn.dataset.sessionId;
        if (shiftIsMeeting) shiftIsMeeting.checked = isMtg;
        shiftDeptGroup?.classList.toggle("d-none", isMtg);
        shiftLabel.value = btn.dataset.label || "";
        shiftStart.value = btn.dataset.start || "";
        shiftEnd.value = btn.dataset.end || "";
        shiftSmsCode.value = btn.dataset.smsCode || "";
        shiftNotes.value = btn.dataset.notes || "";
        shiftInvitable.checked = btn.dataset.invitable === "true";
        const hasKm = btn.dataset.hasKeyman !== "false";
        if (shiftHasKeyman) shiftHasKeyman.checked = hasKm;
        if (shiftHasKeymanAsst) {
          shiftHasKeymanAsst.checked = btn.dataset.hasKeymanAsst !== "false";
          shiftHasKeymanAsst.disabled = !hasKm;
        }
        shiftKeymanGroup?.classList.toggle("d-none", isMtg);
        codeAutoSuggested = false;
        shiftSmsCodeHint?.classList.add("d-none");
        const shiftDeptSel = document.getElementById("shiftDepartment");
        if (shiftDeptSel) shiftDeptSel.value = btn.dataset.categoryId || "";
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
        const isMeeting = shiftIsMeeting?.checked || false;
        const deptVal = document.getElementById("shiftDepartment")?.value || "";

        if (!shiftLabel.value.trim() || !shiftStart.value || !shiftEnd.value) {
          showAlert(shiftFormStatus, "Label, start, and end are required.");
          return;
        }
        if (!isMeeting && !deptVal) {
          showAlert(shiftFormStatus, "Department is required for crew shifts.");
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
            session_id:    Number(shiftSessionId.value),
            label:         shiftLabel.value.trim(),
            start_time:    parsedShiftStart,
            end_time:      parsedShiftEnd,
            volunteer_need: null,
            category_id:   isMeeting ? null : (Number(deptVal) || null),
            sms_code:      shiftSmsCode.value.trim().toUpperCase() || null,
            notes:         shiftNotes.value.trim() || null,
            invitable:       shiftInvitable.checked,
            is_meeting:      isMeeting,
            has_keyman:      isMeeting ? false : (shiftHasKeyman?.checked ?? true),
            has_keyman_asst: isMeeting ? false : (shiftHasKeymanAsst?.checked ?? true),
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
        !confirm("Delete this shift and ALL its assignments, alert history, attendance, and invitations?")
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
        openPanel(assignFormPanel, assignLocTask);
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
        openPanel(assignFormPanel, assignVolNeed || assignNotes);
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

  // ── Rendezvous point buttons ──────────────────────────────────────
  document.querySelectorAll(".rv-assignment-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const assignmentId = Number(btn.dataset.assignmentId);
      const locationName = btn.dataset.locationName || "Location";
      const shiftLabel = btn.dataset.shiftLabel || "Shift";
      const convDate = btn.dataset.conventionDate || "";

      // Parse start time — mssql TIME comes as ISO epoch string
      let startTime = "";
      const raw = btn.dataset.startTime;
      if (raw) {
        const d = new Date(raw);
        if (!isNaN(d.valueOf())) {
          startTime = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
        } else {
          startTime = String(raw).slice(0, 5);
        }
      }

      openRendezvousPanel({
        assignmentId,
        shiftLabel,
        locationName,
        startTime,
        conventionDate: convDate,
        canCreate: true,
        canEdit: true,
        canDelete: true,
        anchorX: e.clientX,
        anchorY: e.clientY,
      });
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") dismissRendezvousPanel();
  });
});
