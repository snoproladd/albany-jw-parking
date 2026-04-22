/**
 * @file messagingCenter.js
 * @description Client-side logic for the Messaging Center oversight tool.
 *
 * Responsibilities:
 *  - Volunteer list rendering, filtering, and multi-select
 *    (checkbox, CTRL+click, SHIFT+click, Select All Visible).
 *  - Send list chip management.
 *  - Campaign mode toggle (New Campaign / Add to Existing).
 *  - Event picker (invitable shifts only, cascading day → shift).
 *  - Batch name auto-suggest.
 *  - Template CRUD.
 *  - Compose area — channel toggles, merge field insertion.
 *  - Send button gating and AJAX send POST.
 *  - Double-send warning with confirm-and-retry.
 *  - Send results log.
 */

document.addEventListener("DOMContentLoaded", () => {
  // =========================================================
  // Root guard
  // =========================================================

  /** @type {HTMLElement|null} */
  const root = document.getElementById("messagingCenterRoot");
  if (!root) return;

  // =========================================================
  // Element references
  // =========================================================

  const volunteerList = document.getElementById("mcVolunteerList");
  const chipArea = document.getElementById("mcChipArea");
  const emptyHint = document.getElementById("mcEmptyHint");
  const sendListCount = document.getElementById("mcSendListCount");
  const selectionCount = document.getElementById("mcSelectionCount");
  const visibleCount = document.getElementById("mcVisibleCount");
  const selectAllBtn = document.getElementById("mcSelectAll");
  const clearAllBtn = document.getElementById("mcClearAll");
  const clearSendListBtn = document.getElementById("mcClearSendList");
  const searchInput = document.getElementById("mcSearch");
  const sendEmailChk = document.getElementById("mcSendEmail");
  const sendSmsChk = document.getElementById("mcSendSms");
  const subjectWrap = document.getElementById("mcSubjectWrap");
  const subjectInput = document.getElementById("mcSubject");
  const bodyInput = document.getElementById("mcBody");
  const sendBtn = document.getElementById("mcSendBtn");
  const sendBtnCount = document.getElementById("mcSendBtnCount");
  const sendBtnPlural = document.getElementById("mcSendBtnPlural");
  const sendHint = document.getElementById("mcSendHint");
  const resultsCard = document.getElementById("mcResultsCard");
  const resultsBody = document.getElementById("mcResultsBody");
  const resultsDismiss = document.getElementById("mcResultsDismiss");
  const csrfTokenEl = document.getElementById("mcCsrfToken");

  // Campaign mode
  const modeNewBtn = document.getElementById("mcModeNew");
  const modeAddToBtn = document.getElementById("mcModeAddTo");
  const modeFollowupBtn = document.getElementById("mcModeFollowup");
  const campaignNameWrap = document.getElementById("mcCampaignNameWrap");
  const campaignNameInput = document.getElementById("mcCampaignName");
  const suggestNameBtn = document.getElementById("mcSuggestNameBtn");
  const existingBatchWrap = document.getElementById("mcExistingBatchWrap");
  const existingBatchSelect = document.getElementById("mcExistingBatch");
  const batchPreview = document.getElementById("mcBatchPreview");
  const batchPreviewText = document.getElementById("mcBatchPreviewText");
  const batchTrackerLink = document.getElementById("mcBatchTrackerLink");
  const parentBatchWrap = document.getElementById("mcParentBatchWrap");
  const parentBatchSelect = document.getElementById("mcParentBatch");
  const responseNeededWrap = document.getElementById("mcResponseNeededWrap");
  const responseNeededChk = document.getElementById("mcResponseNeeded");
  const eventPickerWrap = document.getElementById("mcEventPickerWrap");

  // Event picker
  const eventDaySelect = document.getElementById("mcEventDay");
  const eventShiftSelect = document.getElementById("mcEventShift");
  const eventPreview = document.getElementById("mcEventPreview");
  const eventPreviewText = document.getElementById("mcEventPreviewText");

  // Templates
  const templateList = document.getElementById("mcTemplateList");
  const templateEditor = document.getElementById("mcTemplateEditor");
  const newTemplateBtn = document.getElementById("mcNewTemplateBtn");
  const tplNameInput = document.getElementById("mcTplName");
  const tplSubjectInput = document.getElementById("mcTplSubject");
  const tplBodyInput = document.getElementById("mcTplBody");
  const tplSaveBtn = document.getElementById("mcTplSaveBtn");
  const tplCancelBtn = document.getElementById("mcTplCancelBtn");
  const tplStatus = document.getElementById("mcTplStatus");

  // =========================================================
  // State
  // =========================================================

  /** @type {Set<number>} */
  const selectedIds = new Set();

  /** @type {'new'|'add_to'|'followup'} */
  let campaignMode = "new";

  /** @type {number|null} */
  let editingTemplateId = null;

  /** @type {number} */
  let lastClickedIndex = -1;

  // =========================================================
  // Embedded data
  // =========================================================

  /**
   * @template T
   * @param {string} id
   * @returns {T}
   */
  function parseJson(id) {
    try {
      const el = document.getElementById(id);
      return el ? JSON.parse(el.textContent) : null;
    } catch {
      return null;
    }
  }

  const allVolunteers = parseJson("mc-volunteer-data") || [];
  const conventionDaysData = parseJson("mc-convention-days-data") || [];
  const preselectedBatch = parseJson("mc-preselected-batch");
  const pendingVolIds = parseJson("mc-pending-volunteer-ids");
  let templates = parseJson("mc-template-data") || [];

  // =========================================================
  // Helpers
  // =========================================================

  /** @returns {string} */
  function getCsrf() {
    return csrfTokenEl?.value || "";
  }

  /**
   * @param {number} id
   * @returns {string}
   */
  function getVolunteerName(id) {
    const v = allVolunteers.find((v) => v.id === id);
    if (!v) return String(id);
    return v.lastName + ", " + v.firstName + (v.suffix ? " " + v.suffix : "");
  }

  /** @returns {HTMLElement[]} */
  function getAllItems() {
    return Array.from(
      volunteerList?.querySelectorAll(".mc-volunteer-item") || [],
    );
  }

  /** @returns {HTMLElement[]} */
  function getVisibleItems() {
    return getAllItems().filter((li) => !li.hidden);
  }

  /**
   * Format a TIME value to h:MM AM/PM.
   * @param {string|Date|null} val
   * @returns {string}
   */
  function fmtTime(val) {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d.valueOf())) return String(val).slice(0, 5);
    const h = d.getUTCHours();
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    const ap = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${m} ${ap}`;
  }

  /**
   * Escape a string for safe HTML attribute use.
   * @param {string} str
   * @returns {string}
   */
  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /**
   * Escape a string for safe HTML text content.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // =========================================================
  // Filter logic
  // =========================================================

  let activeStatus = "all";
  let activeActive = "all";
  let activeSearch = "";

  /**
   * Apply all active filters to the volunteer list.
   * @returns {void}
   */
  function applyFilters() {
    const items = getAllItems();
    let visible = 0;

    items.forEach((li) => {
      const matchStatus =
        activeStatus === "all" || li.dataset.status === activeStatus;
      const matchActive =
        activeActive === "all" || li.dataset.active === activeActive;
      const matchSearch =
        activeSearch === "" ||
        li.dataset.name.includes(activeSearch.toLowerCase());
      const show = matchStatus && matchActive && matchSearch;
      li.hidden = !show;

      if (!show) {
        const chk = li.querySelector(".mc-checkbox");
        if (chk?.checked) {
          chk.checked = false;
          const id = Number(li.dataset.id);
          selectedIds.delete(id);
          removeChip(id);
        }
      }
      if (show) visible++;
    });

    if (visibleCount) {
      visibleCount.textContent = `${visible} volunteer${visible !== 1 ? "s" : ""}`;
    }
    updateSelectionCount();
    updateSendButton();
  }

  root.querySelectorAll(".mc-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      root
        .querySelectorAll(".mc-filter-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeStatus = btn.dataset.filterStatus || "all";
      lastClickedIndex = -1;
      applyFilters();
    });
  });

  root.querySelectorAll(".mc-active-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      root
        .querySelectorAll(".mc-active-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeActive = btn.dataset.filterActive || "all";
      lastClickedIndex = -1;
      applyFilters();
    });
  });

  searchInput?.addEventListener("input", () => {
    activeSearch = searchInput.value.trim();
    lastClickedIndex = -1;
    applyFilters();
  });

  // =========================================================
  // Selection logic
  // =========================================================

  /**
   * @param {HTMLElement} li
   * @param {boolean} selected
   * @returns {void}
   */
  function setItemSelected(li, selected) {
    const id = Number(li.dataset.id);
    const chk = li.querySelector(".mc-checkbox");
    if (selected) {
      selectedIds.add(id);
      if (chk) chk.checked = true;
      li.setAttribute("aria-selected", "true");
      li.classList.add("mc-selected");
      addChip(id);
    } else {
      selectedIds.delete(id);
      if (chk) chk.checked = false;
      li.setAttribute("aria-selected", "false");
      li.classList.remove("mc-selected");
      removeChip(id);
    }
  }

  /**
   * @param {MouseEvent} ev
   * @param {HTMLElement} li
   * @param {number} currentIndex
   * @returns {void}
   */
  function handleItemClick(ev, li, currentIndex) {
    const visible = getVisibleItems();
    if (ev.shiftKey && lastClickedIndex >= 0) {
      const from = Math.min(lastClickedIndex, currentIndex);
      const to = Math.max(lastClickedIndex, currentIndex);
      for (let i = from; i <= to; i++) setItemSelected(visible[i], true);
    } else if (ev.ctrlKey || ev.metaKey) {
      setItemSelected(li, !selectedIds.has(Number(li.dataset.id)));
    } else {
      setItemSelected(li, !selectedIds.has(Number(li.dataset.id)));
    }
    lastClickedIndex = currentIndex;
    updateSelectionCount();
    updateSendButton();
  }

  volunteerList?.addEventListener("click", (ev) => {
    const li = ev.target.closest(".mc-volunteer-item");
    if (!li || li.hidden) return;
    if (ev.target.classList.contains("mc-checkbox")) return;
    const visible = getVisibleItems();
    handleItemClick(ev, li, visible.indexOf(li));
  });

  volunteerList?.addEventListener("change", (ev) => {
    if (!ev.target.classList.contains("mc-checkbox")) return;
    const li = ev.target.closest(".mc-volunteer-item");
    if (!li) return;
    const id = Number(li.dataset.id);
    if (ev.target.checked) {
      selectedIds.add(id);
      li.setAttribute("aria-selected", "true");
      li.classList.add("mc-selected");
      addChip(id);
    } else {
      selectedIds.delete(id);
      li.setAttribute("aria-selected", "false");
      li.classList.remove("mc-selected");
      removeChip(id);
    }
    updateSelectionCount();
    updateSendButton();
  });

  selectAllBtn?.addEventListener("click", () => {
    getVisibleItems().forEach((li) => setItemSelected(li, true));
    lastClickedIndex = -1;
    updateSelectionCount();
    updateSendButton();
  });

  clearAllBtn?.addEventListener("click", () => {
    getAllItems().forEach((li) => setItemSelected(li, false));
    lastClickedIndex = -1;
    updateSelectionCount();
    updateSendButton();
  });

  /** @returns {void} */
  function updateSelectionCount() {
    if (!selectionCount) return;
    const n = selectedIds.size;
    selectionCount.textContent = `${n} selected`;
    selectionCount.className =
      n > 0 ? "badge bg-primary" : "badge bg-secondary";
  }

  // =========================================================
  // Chip area
  // =========================================================

  /** @param {number} id @returns {void} */
  function addChip(id) {
    if (document.getElementById(`mcChip_${id}`)) return;
    const name = getVolunteerName(id);
    const chip = document.createElement("span");
    chip.className = "mc-chip";
    chip.id = `mcChip_${id}`;
    chip.dataset.id = String(id);
    chip.innerHTML = `${name}<button type="button" class="mc-chip-remove" aria-label="Remove ${name}" data-id="${id}"><i class="fa-solid fa-xmark"></i></button>`;
    chipArea?.appendChild(chip);
    updateChipAreaVisibility();
    updateSendListCount();
  }

  /** @param {number} id @returns {void} */
  function removeChip(id) {
    document.getElementById(`mcChip_${id}`)?.remove();
    updateChipAreaVisibility();
    updateSendListCount();
  }

  /** @returns {void} */
function updateChipAreaVisibility() {
  if (!emptyHint) return;
  emptyHint.classList.toggle("d-none", !!chipArea?.querySelector(".mc-chip"));
}

  /** @returns {void} */
  function updateSendListCount() {
    if (sendListCount) sendListCount.textContent = String(selectedIds.size);
  }

  chipArea?.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".mc-chip-remove");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const li = volunteerList?.querySelector(`[data-id="${id}"]`);
    if (li) setItemSelected(li, false);
    updateSelectionCount();
    updateSendButton();
  });

  clearSendListBtn?.addEventListener("click", () => {
    getAllItems().forEach((li) => setItemSelected(li, false));
    lastClickedIndex = -1;
    updateSelectionCount();
    updateSendButton();
  });

  // =========================================================
  // Campaign mode toggle
  // =========================================================

  /**
   * Switch between New Campaign and Add to Existing modes.
   * @param {'new'|'add_to'} mode
   * @returns {void}
   */
  /**
   * Switch between New Campaign, Add to Existing, and Follow-up modes.
   * Controls visibility of campaign name, parent picker, response needed,
   * existing batch picker, and event picker panels.
   * @param {'new'|'add_to'|'followup'} mode
   * @returns {void}
   */
  function setCampaignMode(mode) {
    campaignMode = mode;
    const isNew = mode === "new";
    const isAddTo = mode === "add_to";
    const isFollowup = mode === "followup";

    // Button active states
    for (const [btn, active] of [
      [modeNewBtn,     isNew],
      [modeAddToBtn,   isAddTo],
      [modeFollowupBtn, isFollowup],
    ]) {
      btn?.classList.toggle("active", active);
      btn?.classList.toggle("btn-primary", active);
      btn?.classList.toggle("btn-outline-primary", !active);
    }

    // Panel visibility
    campaignNameWrap?.classList.toggle("d-none", isAddTo);
    existingBatchWrap?.classList.toggle("d-none", !isAddTo);
    parentBatchWrap?.classList.toggle("d-none", !isFollowup);
    responseNeededWrap?.classList.toggle("d-none", isAddTo);
    eventPickerWrap?.classList.toggle("d-none", isAddTo);

    if (isNew) clearInviteStatusBadges();

    // Pre-fill subject/body from selected batch
    if (isAddTo && existingBatchSelect?.value) onExistingBatchChange();

    // Auto-suggest follow-up name when parent is already selected
    if (isFollowup && parentBatchSelect?.value) onParentBatchChange();

    updateSendButton();
  }

  modeNewBtn?.addEventListener("click", () => setCampaignMode("new"));
  modeAddToBtn?.addEventListener("click", () => setCampaignMode("add_to"));
  modeFollowupBtn?.addEventListener("click", () => setCampaignMode("followup"));

  /**
   * Handle parent batch selection change in follow-up mode.
   * Auto-suggests campaign name and pre-fills subject/body from parent.
   * @returns {void}
   */
  function onParentBatchChange() {
    const opt = parentBatchSelect?.options[parentBatchSelect.selectedIndex];
    if (!opt?.value) return;

    // Auto-suggest name: "Follow-up: <parent name>"
    const parentName = opt.dataset.name || opt.textContent.trim();
    if (campaignNameInput && !campaignNameInput.value.trim()) {
      campaignNameInput.value = `Follow-up: ${parentName}`;
    }

    // Pre-fill subject/body from parent if fields are empty
    if (subjectInput && !subjectInput.value.trim()) {
      subjectInput.value = opt.dataset.subject || "";
    }
    if (bodyInput && !bodyInput.value.trim()) {
      bodyInput.value = opt.dataset.body || "";
    }

    updateSendButton();
  }

  parentBatchSelect?.addEventListener("change", onParentBatchChange);

  /**
   * Remove all invitation status badges from the volunteer list.
   * Called when switching to new campaign mode or clearing a batch.
   * @returns {void}
   */
  function clearInviteStatusBadges() {
    getAllItems().forEach((li) => {
      li.querySelectorAll(".mc-invite-status").forEach((el) => el.remove());
      li.classList.remove("mc-vol-already-invited");
    });
  }

  /**
   * Fetch invited volunteer IDs + statuses for a batch and apply
   * visual indicators to the volunteer list. Auto-selects pending
   * volunteers (unanswered, not revoked).
   *
   * @param {number} batchId
   * @returns {Promise<void>}
   */
  async function applyInviteStatusBadges(batchId) {
    clearInviteStatusBadges();

    try {
      const res  = await fetch(
        `/oversight/tools/messaging/batches/${batchId}/invited`,
        { headers: { "X-CSRF-Token": getCsrf() } }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) return;

      /** @type {Map<number, {response:string|null, responded_at:string|null, revoked:boolean}>} */
      const inviteMap = new Map(
        data.invited.map((i) => [i.volunteer_id, i])
      );

      getAllItems().forEach((li) => {
        const id  = Number(li.dataset.id);
        const inv = inviteMap.get(id);
        if (!inv) return;

        li.classList.add("mc-vol-already-invited");

        // Determine badge state
        let statusClass = "mc-invite-status--pending";
        let statusLabel = "Invited · Pending";

        if (inv.revoked) {
          statusClass = "mc-invite-status--revoked";
          statusLabel = "Invited · Revoked";
        } else if (inv.response === "yes") {
          statusClass = "mc-invite-status--yes";
          statusLabel = "Invited · Yes";
        } else if (inv.response === "no") {
          statusClass = "mc-invite-status--no";
          statusLabel = "Invited · No";
        } else if (inv.response === "maybe") {
          statusClass = "mc-invite-status--maybe";
          statusLabel = "Invited · Maybe";
        }

        // Inject badge into the row
        const badge = document.createElement("span");
        badge.className = `mc-invite-status ${statusClass}`;
        badge.textContent = statusLabel;
        li.appendChild(badge);

        // Auto-select pending volunteers (no response, not revoked)
        if (!inv.revoked && !inv.response) {
          setItemSelected(li, true);
        }
      });

      updateSelectionCount();
      updateSendButton();

    } catch (err) {
      console.error("[messagingCenter] applyInviteStatusBadges error:", err);
    }
  }

  /**
   * Handle selection of an existing batch — pre-fill subject/body,
   * show the batch preview line, and fetch + apply invitation status
   * badges to the volunteer list.
   * @returns {void}
   */
  function onExistingBatchChange() {
    if (!existingBatchSelect) return;
    const opt = existingBatchSelect.options[existingBatchSelect.selectedIndex];
    if (!opt?.value) {
      batchPreview?.classList.add("d-none");
      clearInviteStatusBadges();
      return;
    }

    // Pre-fill compose fields from batch data
    if (subjectInput && opt.dataset.subject !== undefined) {
      subjectInput.value = opt.dataset.subject || "";
    }
    if (bodyInput && opt.dataset.body !== undefined) {
      bodyInput.value = opt.dataset.body || "";
      bodyInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // Show preview + tracker link
    if (batchPreviewText) {
      batchPreviewText.textContent = opt.textContent.trim();
    }
    if (batchTrackerLink) {
      batchTrackerLink.href = `/oversight/tools/messaging/tracker?batchId=${opt.value}`;
    }
    batchPreview?.classList.remove("d-none");
    updateSendButton();

    // Fetch and apply invitation status badges
    applyInviteStatusBadges(Number(opt.value));
  }

  existingBatchSelect?.addEventListener("change", onExistingBatchChange);

  // =========================================================
  // Event picker
  // =========================================================

  /**
   * Populate the shift dropdown for a selected day.
   * @param {number|null} dayId
   * @returns {void}
   */
  function populateShiftSelect(dayId) {
    if (!eventShiftSelect) return;
    eventShiftSelect.innerHTML = '<option value="">— All shifts —</option>';

    if (!dayId) {
      eventShiftSelect.classList.add("d-none");
      return;
    }

    const day = conventionDaysData.find((d) => d.id === dayId);
    if (!day?.sessions?.length) {
      eventShiftSelect.classList.add("d-none");
      return;
    }

    day.sessions.forEach((session) => {
      if (!session.shifts?.length) return;
      const group = document.createElement("optgroup");
      group.label = `${session.label} (${fmtTime(session.start_time)}–${fmtTime(session.end_time)})`;
      session.shifts.forEach((shift) => {
        const opt = document.createElement("option");
        opt.value = String(shift.id);
        opt.dataset.sessionId = String(session.id);
        opt.dataset.sessionLabel = session.label;
        opt.dataset.eventTypeName = shift.event_type_name;
        opt.dataset.shiftStart = String(shift.start_time);
        opt.dataset.shiftEnd = String(shift.end_time);
        opt.textContent = `${shift.event_type_name} — ${fmtTime(shift.start_time)}–${fmtTime(shift.end_time)} (${shift.label})`;
        group.appendChild(opt);
      });
      eventShiftSelect.appendChild(group);
    });

    eventShiftSelect.classList.remove("d-none");
  }

  /** @returns {void} */
  function updateEventPreview() {
    if (!eventPreview || !eventPreviewText) return;
    const dayId = Number(eventDaySelect?.value) || null;
    const shiftId = Number(eventShiftSelect?.value) || null;

    if (!dayId) {
      eventPreview.classList.add("d-none");
      return;
    }

    const day = conventionDaysData.find((d) => d.id === dayId);
    if (!day) {
      eventPreview.classList.add("d-none");
      return;
    }

    const dateStr = new Date(day.convention_date).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });

    if (!shiftId) {
      eventPreviewText.textContent = `Linked to ${day.label} — ${dateStr}`;
    } else {
      const opt = eventShiftSelect?.querySelector(`option[value="${shiftId}"]`);
      if (opt) {
        eventPreviewText.textContent = `${opt.dataset.eventTypeName} shift, ${fmtTime(opt.dataset.shiftStart)}–${fmtTime(opt.dataset.shiftEnd)} · ${day.label} — ${dateStr}`;
      }
    }
    eventPreview.classList.remove("d-none");
  }

  eventDaySelect?.addEventListener("change", () => {
    const dayId = Number(eventDaySelect.value) || null;
    populateShiftSelect(dayId);
    if (eventShiftSelect) eventShiftSelect.value = "";
    updateEventPreview();
  });

  eventShiftSelect?.addEventListener("change", updateEventPreview);

  /**
   * Get the currently selected event link values.
   * @returns {{ conventionDayId: number|null, sessionId: number|null, shiftId: number|null }}
   */
  function getSelectedEvent() {
    const shiftOpt = eventShiftSelect?.options[eventShiftSelect.selectedIndex];
    return {
      conventionDayId: Number(eventDaySelect?.value) || null,
      sessionId: shiftOpt ? Number(shiftOpt.dataset.sessionId) || null : null,
      shiftId: Number(eventShiftSelect?.value) || null,
    };
  }

  // =========================================================
  // Batch name suggestion
  // =========================================================

  suggestNameBtn?.addEventListener("click", async () => {
    const { conventionDayId, shiftId } = getSelectedEvent();
    const dayOpt = eventDaySelect?.options[eventDaySelect.selectedIndex];
    const shiftOpt =
      eventShiftSelect?.options[eventShiftSelect?.selectedIndex ?? -1];

    const payload = {
      dayLabel: dayOpt?.dataset.label || null,
      conventionDate: dayOpt?.dataset.date || null,
      shiftLabel: shiftOpt?.dataset.sessionLabel || null,
      eventTypeName: shiftOpt?.dataset.eventTypeName || null,
    };

    try {
      const res = await fetch(
        "/oversight/tools/messaging/batches/suggest-name",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrf(),
          },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (data.success && campaignNameInput) {
        campaignNameInput.value = data.name;
        campaignNameInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } catch (err) {
      console.error("[messagingCenter] suggest-name error:", err);
    }
  });

  // =========================================================
  // Channel toggles
  // =========================================================

  /** @returns {void} */
function updateSubjectVisibility() {
  if (!subjectWrap) return;
  subjectWrap.classList.toggle("d-none", !sendEmailChk?.checked);
}

  sendEmailChk?.addEventListener("change", () => {
    updateSubjectVisibility();
    updateSendButton();
  });
  sendSmsChk?.addEventListener("change", updateSendButton);

  // =========================================================
  // Send button gating
  // =========================================================

  /** @returns {void} */
  function updateSendButton() {
    const hasRecipients = selectedIds.size > 0;
    const hasChannel = sendEmailChk?.checked || sendSmsChk?.checked;
    const hasBody = (bodyInput?.value.trim().length || 0) > 0;
    const hasName =
      campaignMode === "add_to"
        ? !!existingBatchSelect?.value
        : campaignMode === "followup"
          ? !!parentBatchSelect?.value && (campaignNameInput?.value.trim().length || 0) > 0
          : (campaignNameInput?.value.trim().length || 0) > 0;

    if (sendBtn)
      sendBtn.disabled = !(hasRecipients && hasChannel && hasBody && hasName);

    if (sendBtnCount) sendBtnCount.textContent = String(selectedIds.size);
    if (sendBtnPlural)
      sendBtnPlural.textContent = selectedIds.size === 1 ? "" : "s";

    if (sendHint) {
      if (!hasRecipients)
        sendHint.textContent = "Select recipients from the list.";
      else if (!hasChannel)
        sendHint.textContent = "Select at least one channel.";
      else if (!hasBody)
        sendHint.textContent = "Write a message before sending.";
      else if (!hasName)
        sendHint.textContent =
          campaignMode === "new"
            ? "Enter a campaign name."
            : "Select an existing campaign.";
      else sendHint.textContent = "";
    }
  }

  bodyInput?.addEventListener("input", updateSendButton);
  campaignNameInput?.addEventListener("input", updateSendButton);
  existingBatchSelect?.addEventListener("change", updateSendButton);

  // =========================================================
  // Merge field insertion
  // =========================================================

  /**
   * Insert a merge field at the current cursor position.
   * @param {HTMLInputElement|HTMLTextAreaElement} el
   * @param {string} field
   * @returns {void}
   */
  function insertAtCursor(el, field) {
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;
    el.value = el.value.slice(0, start) + field + el.value.slice(end);
    el.focus({ preventScroll: true });
    el.selectionStart = el.selectionEnd = start + field.length;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  root.addEventListener("click", (ev) => {
    const chip = ev.target.closest(".mc-merge-chip");
    if (!chip) return;
    const targetEl = document.getElementById(chip.dataset.target);
    if (targetEl) insertAtCursor(targetEl, chip.dataset.field);
  });

  // =========================================================
  // Send — AJAX POST
  // =========================================================

  sendBtn?.addEventListener("click", async () => {
    if (sendBtn.disabled) return;

    const recipientIds = Array.from(selectedIds);
    const subject = subjectInput?.value.trim() || "";
    const body = bodyInput?.value.trim() || "";
    const sendEmail = sendEmailChk?.checked || false;
    const sendSms = sendSmsChk?.checked || false;

    const { conventionDayId, sessionId, shiftId } = getSelectedEvent();

    const batchName =
      campaignMode === "add_to" ? null : campaignNameInput?.value.trim() || "";
    const existingBatchId =
      campaignMode === "add_to"
        ? Number(existingBatchSelect?.value) || null
        : null;
    const parentBatchId =
      campaignMode === "followup"
        ? Number(parentBatchSelect?.value) || null
        : null;
    const responseNeeded = responseNeededChk?.checked ?? true;

    const channelLabel =
      sendEmail && sendSms ? "email and SMS" : sendEmail ? "email" : "SMS";
    const modeLabel =
      campaignMode === "add_to"
        ? "to existing campaign"
        : campaignMode === "followup"
          ? "as follow-up campaign"
          : "as new campaign";

    const confirmed = confirm(
      `Send to ${recipientIds.length} recipient${recipientIds.length !== 1 ? "s" : ""} via ${channelLabel} (${modeLabel})?`,
    );
    if (!confirmed) return;

    /** Whether this send is a reminder — reuse existing tokens rather than INSERT. */
    const isReminder = campaignMode === "add_to" && (pendingVolIds?.length ?? 0) > 0;

    sendBtn.disabled = true;
    sendBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Sending…`;

    /**
     * @param {boolean} force
     * @returns {Promise<object>}
     */
    async function doSend(force) {
      const res = await fetch("/oversight/tools/messaging/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrf(),
        },
        body: JSON.stringify({
          volunteerIds: recipientIds,
          subject,
          body,
          sendEmail,
          sendSms,
          campaignMode,
          batchName,
          existingBatchId,
          parentBatchId,
          responseNeeded,
          conventionDayId,
          sessionId,
          shiftId,
          force,
          isReminder,
        }),
      });
      return res.json().catch(() => ({}));
    }

    try {
      let data = await doSend(false);

      // ── Double-send warning ──────────────────────────────────────
      if (!data.success && data.pendingWarnings?.length) {
        const names = data.pendingWarnings.map((w) => w.name).join("\n  • ");
        const proceed = confirm(
          `The following volunteers already have an unanswered invite for this event:\n\n  • ${names}\n\nSend again anyway?`,
        );
        if (!proceed) {
          sendBtn.disabled = false;
          sendBtn.innerHTML = `<i class="fa-solid fa-paper-plane me-2"></i>Send to <span id="mcSendBtnCount">${selectedIds.size}</span> recipient<span id="mcSendBtnPlural">${selectedIds.size === 1 ? "" : "s"}</span>`;
          return;
        }
        data = await doSend(true);
      }

      renderResults(data);

      // After a successful reminder, offer to overwrite the campaign's saved
      // message template with the tweaked nudge version.
      if (isReminder && data.success && data.batchId && preselectedBatch) {
        const update = confirm(
          "Reminder sent. Do you want to update this campaign\u2019s saved message with the version you just sent?"
        );
        if (update) {
          try {
            const putRes = await fetch(
              `/oversight/tools/messaging/batches/${data.batchId}`,
              {
                method: "PUT",
                headers: {
                  "Content-Type": "application/json",
                  "X-CSRF-Token": getCsrf(),
                },
                body: JSON.stringify({
                  name:            preselectedBatch.name,
                  messageSubject:  subject || null,
                  messageBody:     body,
                  parentBatchId:   preselectedBatch.parent_batch_id || null,
                  responseNeeded:  preselectedBatch.response_needed !== false,
                  active:          preselectedBatch.active !== false,
                }),
              }
            );
            const putData = await putRes.json().catch(() => ({}));
            const note = document.createElement("div");
            note.className = `alert ${putData.success ? "alert-success" : "alert-warning"} mt-2 mb-0`;
            note.innerHTML = putData.success
              ? `<i class="fa-solid fa-circle-check me-1"></i>Campaign message updated.`
              : `<i class="fa-solid fa-triangle-exclamation me-1"></i>Could not update campaign message — changes were not saved.`;
            resultsBody?.appendChild(note);
          } catch {
            // Non-fatal — send already succeeded
          }
        }
      }

    } catch (err) {
      console.error("[messagingCenter] send error:", err);
      renderResults({
        success: false,
        error: "Network error — please try again.",
      });
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = `<i class="fa-solid fa-paper-plane me-2"></i>Send to <span id="mcSendBtnCount">${selectedIds.size}</span> recipient<span id="mcSendBtnPlural">${selectedIds.size === 1 ? "" : "s"}</span>`;
    }
  });

  // =========================================================
  // Results log
  // =========================================================

  /**
   * @param {{
   *   success?: boolean,
   *   sent?: number,
   *   batchId?: number,
   *   skipped?: Array<{name:string,reason:string}>,
   *   errors?: Array<{name:string,reason:string}>,
   *   error?: string
   * }} data
   * @returns {void}
   */
  function renderResults(data) {
    if (!resultsCard || !resultsBody) return;

    if (!data.success || data.error) {
      resultsBody.innerHTML = `<div class="alert alert-danger mb-0">${data.error || "An unexpected error occurred."}</div>`;
      resultsCard.classList.remove("d-none");
      resultsCard.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    let html = `
            <div class="alert alert-success mb-3">
                <i class="fa-solid fa-circle-check me-2"></i>
                <strong>${data.sent}</strong> message${data.sent !== 1 ? "s" : ""} sent successfully.
                ${data.batchId ? `<a href="/oversight/tools/messaging/tracker?batchId=${data.batchId}" class="alert-link ms-2">View in Tracker →</a>` : ""}
            </div>`;

    if (data.skipped?.length) {
      html += `<p class="fw-semibold text-warning mb-1"><i class="fa-solid fa-triangle-exclamation me-1"></i>Skipped (${data.skipped.length}):</p><ul class="small mb-3">`;
      data.skipped.forEach(({ name, reason }) => {
        html += `<li><strong>${name}</strong> — ${reason}</li>`;
      });
      html += `</ul>`;
    }

    if (data.errors?.length) {
      html += `<p class="fw-semibold text-danger mb-1"><i class="fa-solid fa-circle-xmark me-1"></i>Errors (${data.errors.length}):</p><ul class="small mb-3">`;
      data.errors.forEach(({ name, reason }) => {
        html += `<li><strong>${name}</strong> — ${reason}</li>`;
      });
      html += `</ul>`;
    }

    resultsBody.innerHTML = html;
    resultsCard.classList.remove("d-none");
    resultsCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  resultsDismiss?.addEventListener("click", () => {
    resultsCard?.classList.add("d-none");
    if (resultsBody) resultsBody.innerHTML = "";
  });

  // =========================================================
  // Templates — render
  // =========================================================

  /** @returns {void} */
  function renderTemplateList() {
    if (!templateList) return;
    if (templates.length === 0) {
      templateList.innerHTML = `<p class="text-muted small mb-0">No saved templates yet.</p>`;
      return;
    }
    templateList.innerHTML = templates
      .map(
        (t) => `
            <div class="mc-template-row" data-template-id="${t.id}">
                <button type="button" class="mc-template-load btn btn-link btn-sm p-0 text-start"
                    data-id="${t.id}" data-name="${escapeAttr(t.name)}"
                    data-subject="${escapeAttr(t.subject || "")}" data-body="${escapeAttr(t.body)}"
                    title="Load into compose">
                    <i class="fa-regular fa-file-lines me-1"></i>${escapeHtml(t.name)}
                </button>
                <div class="mc-template-actions">
                    <button type="button" class="btn btn-link btn-sm p-0 text-secondary mc-template-edit" data-id="${t.id}">
                        <i class="fa-solid fa-pencil"></i>
                    </button>
                    <button type="button" class="btn btn-link btn-sm p-0 text-danger mc-template-delete"
                        data-id="${t.id}" data-name="${escapeAttr(t.name)}">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>`,
      )
      .join("");
  }

  // =========================================================
  // Templates — editor focus state
  // =========================================================

  /** @param {boolean} active @returns {void} */
  function setTemplateEditorFocus(active) {
    const templatesCard = document.getElementById("mcTemplatesCard");
    const mcMain = root.querySelector(".mc-main");
    mcMain?.classList.toggle("mc-template-editing", active);
    root.querySelectorAll(".mc-card").forEach((card) => {
      if (card === templatesCard) {
        card.classList.toggle("mc-card--template-active", active);
      } else {
        card.classList.toggle("mc-card--dimmed", active);
      }
    });
  }

  /** @param {object|null} tpl @returns {void} */
  function openTemplateEditor(tpl) {
    editingTemplateId = tpl?.id ?? null;
    if (tplNameInput) tplNameInput.value = tpl?.name || "";
    if (tplSubjectInput) tplSubjectInput.value = tpl?.subject || "";
    if (tplBodyInput) tplBodyInput.value = tpl?.body || "";
    if (tplStatus) tplStatus.innerHTML = "";
    templateEditor?.classList.remove("d-none");
    setTemplateEditorFocus(true);
    tplNameInput?.focus();
  }

  /** @returns {void} */
  function closeTemplateEditor() {
    editingTemplateId = null;
    if (tplNameInput) tplNameInput.value = "";
    if (tplSubjectInput) tplSubjectInput.value = "";
    if (tplBodyInput) tplBodyInput.value = "";
    if (tplStatus) tplStatus.innerHTML = "";
    templateEditor?.classList.add("d-none");
    setTemplateEditorFocus(false);
  }

  newTemplateBtn?.addEventListener("click", () => openTemplateEditor(null));
  tplCancelBtn?.addEventListener("click", closeTemplateEditor);

  // =========================================================
  // Templates — load + edit + delete delegation
  // =========================================================

  templateList?.addEventListener("click", (ev) => {
    const loadBtn = ev.target.closest(".mc-template-load");
    if (loadBtn) {
      // If the template editor is open, ignore load clicks —
      // the user is editing, not browsing.
      if (!templateEditor?.classList.contains("d-none")) return;
      if (subjectInput) subjectInput.value = loadBtn.dataset.subject || "";
      if (bodyInput) {
        bodyInput.value = loadBtn.dataset.body || "";
        bodyInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      document
        .getElementById("mcComposeCard")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const editBtn = ev.target.closest(".mc-template-edit");
    if (editBtn) {
      const tpl = templates.find((t) => t.id === Number(editBtn.dataset.id));
      if (tpl) openTemplateEditor(tpl);
      return;
    }
    const deleteBtn = ev.target.closest(".mc-template-delete");
    if (deleteBtn)
      confirmDeleteTemplate(
        Number(deleteBtn.dataset.id),
        deleteBtn.dataset.name || "this template",
      );
  });

  // =========================================================
  // Templates — save
  // =========================================================

  tplSaveBtn?.addEventListener("click", async () => {
    const name = tplNameInput?.value.trim() || "";
    const subject = tplSubjectInput?.value.trim() || "";
    const body = tplBodyInput?.value.trim() || "";

    if (!name) {
      if (tplStatus)
        tplStatus.innerHTML = `<div class="alert alert-warning py-1 small">Template name is required.</div>`;
      return;
    }
    if (!body) {
      if (tplStatus)
        tplStatus.innerHTML = `<div class="alert alert-warning py-1 small">Body is required.</div>`;
      return;
    }

    tplSaveBtn.disabled = true;
    tplSaveBtn.textContent = "Saving…";

    const isEdit = editingTemplateId !== null;
    const url = isEdit
      ? `/oversight/tools/messaging/templates/${editingTemplateId}`
      : `/oversight/tools/messaging/templates`;
    const method = isEdit ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrf(),
        },
        body: JSON.stringify({ name, subject, body }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        if (tplStatus)
          tplStatus.innerHTML = `<div class="alert alert-danger py-1 small">${data.error || "Save failed."}</div>`;
        return;
      }

      if (isEdit) {
        const idx = templates.findIndex((t) => t.id === editingTemplateId);
        if (idx >= 0)
          templates[idx] = {
            ...templates[idx],
            name,
            subject: subject || null,
            body,
          };
      } else {
        templates.push({ id: data.id, name, subject: subject || null, body });
      }

      renderTemplateList();
      closeTemplateEditor();
    } catch (err) {
      console.error("[messagingCenter] template save error:", err);
      if (tplStatus)
        tplStatus.innerHTML = `<div class="alert alert-danger py-1 small">Network error.</div>`;
    } finally {
      tplSaveBtn.disabled = false;
      tplSaveBtn.textContent = "Save template";
    }
  });

  // =========================================================
  // Templates — delete
  // =========================================================

  /**
   * @param {number} id
   * @param {string} name
   * @returns {void}
   */
  function confirmDeleteTemplate(id, name) {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return;
    fetch(`/oversight/tools/messaging/templates/${id}`, {
      method: "DELETE",
      headers: { "X-CSRF-Token": getCsrf() },
    })
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        if (!data.success) {
          alert(data.error || "Delete failed.");
          return;
        }
        templates = templates.filter((t) => t.id !== id);
        renderTemplateList();
        if (editingTemplateId === id) closeTemplateEditor();
      })
      .catch((err) => {
        console.error("[messagingCenter] template delete error:", err);
        alert("Network error — delete failed.");
      });
  }



  // =========================================================
  // Init
  // =========================================================

  applyFilters();
  updateSubjectVisibility();
  updateSendButton();
  updateChipAreaVisibility();

  // If a batch was pre-selected via ?batchId= query param,
  // switch into add-to mode and select it automatically.
  if (preselectedBatch && existingBatchSelect) {
    const opt = existingBatchSelect.querySelector(
      `option[value="${preselectedBatch.id}"]`,
    );
    if (opt) {
      existingBatchSelect.value = String(preselectedBatch.id);
      setCampaignMode("add_to");
      // onExistingBatchChange() is already invoked inside setCampaignMode
      // when isAddTo is true and a batch value is present — calling it
      // again here would double-fire applyInviteStatusBadges and duplicate
      // the invite-status badges on each volunteer row.
    }
  }

  // If pending volunteer IDs were passed (via ?selectPending=1),
  // auto-select those volunteers in the list.
  if (pendingVolIds?.length > 0) {
    const pendingSet = new Set(pendingVolIds);
    getAllItems().forEach((li) => {
      if (pendingSet.has(Number(li.dataset.id))) {
        setItemSelected(li, true);
      }
    });
    updateSelectionCount();
    updateSendButton();

    // Scroll the volunteer list to the first selected item
    const firstSelected = volunteerList?.querySelector(".mc-selected");
    if (firstSelected) {
      firstSelected.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }
});
