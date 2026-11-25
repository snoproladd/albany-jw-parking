/**
 * @file campaignCenter.js
 * @description Client-side logic for the Campaign Center oversight tool.
 *
 * Responsibilities:
 *  - Volunteer list rendering, filtering (status, active, gender, role, crew,
 *    name search), and multi-select (checkbox, CTRL+click, SHIFT+click, Select All Visible).
 *  - Send list chip management.
 *  - The page's five steps:
 *    1. What is being sent: New invitation, Add people, Reminder, Follow-up
 *       or Announcement (PURPOSES), with the campaign name, campaign or
 *       parent picker, and answer settings each one needs.
 *    2. Event (invitable shifts, day → shift), or the picked campaign's.
 *    3. Who gets it (the send list chips).
 *    4. Message: template dropdown and manager, channels, merge fields
 *       (event fields only with an event), text length and segments.
 *    5. Review: the first recipient's filled-in message (POST
 *       /oversight/tools/campaigns/preview), per-channel counts, and Send.
 *  - Double-send warning with confirm-and-retry; send results log.
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
  const roleFilter  = /** @type {HTMLSelectElement|null} */ (document.getElementById("mcRoleFilter"));
  const crewFilter  = /** @type {HTMLSelectElement|null} */ (document.getElementById("mcCrewFilter"));
  const sendEmailChk = /** @type {HTMLInputElement|null} */ (document.getElementById("mcSendEmail"));
  const sendSmsChk = /** @type {HTMLInputElement|null} */ (document.getElementById("mcSendSms"));
  const subjectWrap = document.getElementById("mcSubjectWrap");
  const subjectInput = /** @type {HTMLInputElement|null} */ (document.getElementById("mcSubject"));
  const bodyInput = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("mcBody"));
  const sendBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById("mcSendBtn"));
  const sendHint = document.getElementById("mcSendHint");
  const resultsCard = document.getElementById("mcResultsCard");
  const resultsBody = document.getElementById("mcResultsBody");
  const resultsDismiss = document.getElementById("mcResultsDismiss");
  const csrfTokenEl = document.getElementById("mcCsrfToken");

  // Step 1 — purpose and campaign settings
  const purposeBtns = Array.from(root.querySelectorAll(".mc-purpose[data-purpose]"));
  const campaignNameWrap = document.getElementById("mcCampaignNameWrap");
  const campaignNameInput = /** @type {HTMLInputElement|null} */ (document.getElementById("mcCampaignName"));
  const suggestNameBtn = document.getElementById("mcSuggestNameBtn");
  const existingBatchWrap = document.getElementById("mcExistingBatchWrap");
  const existingBatchSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById("mcExistingBatch"));
  const batchPreview = document.getElementById("mcBatchPreview");
  const batchPreviewText = document.getElementById("mcBatchPreviewText");
  const batchTrackerLink = /** @type {HTMLAnchorElement|null} */ (document.getElementById("mcBatchTrackerLink"));
  const parentBatchWrap = document.getElementById("mcParentBatchWrap");
  const parentBatchSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById("mcParentBatch"));
  const responseNeededWrap = document.getElementById("mcResponseNeededWrap");
  const responseNeededChk = /** @type {HTMLInputElement|null} */ (document.getElementById("mcResponseNeeded"));
  const recruitmentChk = /** @type {HTMLInputElement|null} */ (document.getElementById("mcIsRecruitment"));
  const responseConfigWrap = document.getElementById("mcResponseConfigWrap");
  const responseTypeSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById("mcResponseType"));
  const responseStandardWrap = document.getElementById("mcResponseStandardWrap");
  const responsePollWrap = document.getElementById("mcResponsePollWrap");
  const responseOptionsWrap = document.getElementById("mcResponseOptionsWrap");
  const respondByInput = /** @type {HTMLInputElement|null} */ (document.getElementById("mcRespondBy"));

  // Step 2 — event
  const eventPickerWrap = document.getElementById("mcEventPickerWrap");
  const eventInheritedNote = document.getElementById("mcEventInherited");
  const eventDaySelect = /** @type {HTMLSelectElement|null} */ (document.getElementById("mcEventDay"));
  const eventShiftSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById("mcEventShift"));
  const eventPreview = document.getElementById("mcEventPreview");
  const eventPreviewText = document.getElementById("mcEventPreviewText");

  // Step 3 — recipients
  const whoNote = document.getElementById("mcWhoNote");

  // Step 4 — templates and message
  const templateSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById("mcTemplateSelect"));
  const manageTemplatesBtn = document.getElementById("mcManageTemplatesBtn");
  const templateManager = document.getElementById("mcTemplatesCard");
  const templateList = document.getElementById("mcTemplateList");
  const templateEditor = document.getElementById("mcTemplateEditor");
  const newTemplateBtn = document.getElementById("mcNewTemplateBtn");
  const tplNameInput = /** @type {HTMLInputElement|null} */ (document.getElementById("mcTplName"));
  const tplSubjectInput = /** @type {HTMLInputElement|null} */ (document.getElementById("mcTplSubject"));
  const tplBodyInput = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("mcTplBody"));
  const tplSaveBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById("mcTplSaveBtn"));
  const tplCancelBtn = document.getElementById("mcTplCancelBtn");
  const tplStatus = document.getElementById("mcTplStatus");
  const smsCounter = document.getElementById("mcSmsCounter");

  // Step 5 — review
  const previewEl = document.getElementById("mcPreview");
  const previewLabel = document.getElementById("mcPreviewLabel");
  const reviewCounts = document.getElementById("mcReviewCounts");

  // =========================================================
  // State
  // =========================================================

  /** @type {Set<number>} */
  const selectedIds = new Set();

  /**
   * What is being sent (step 1).
   * @typedef {'invite'|'add'|'remind'|'followup'|'announce'} Purpose
   */

  /** @type {Purpose} */
  let purpose = "invite";

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
  let activeGender = "all";
  let activeRole   = "all";
  let activeCrew   = "";
  let activeSearch = "";


  /**
   * Apply all active filters to the volunteer list.
   * Filters: status, active, gender, position, crew, name search.
   * Position (phase 3d-8c; was role): "pos:<name>" matches people holding
   * that position (data-positions is "|A|B|"); "tier3" matches Overseer and
   * up (data-tier 3 or higher).
   * All filters use AND logic. Selections persist across filter changes.
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
      const matchGender =
        activeGender === "all" || (li.dataset.gender || "") === activeGender;
      const matchRole =
        activeRole === "all" ||
        (activeRole === "tier3"
          ? Number(li.dataset.tier || 0) >= 3
          : activeRole.startsWith("pos:") &&
            (li.dataset.positions || "").includes(`|${activeRole.slice(4)}|`));
      const matchCrew =
        !activeCrew ||
        (li.dataset.crews || "").split(",").includes(activeCrew);
      const matchSearch =
        activeSearch === "" ||
        li.dataset.name.includes(activeSearch.toLowerCase());
      const show =
        matchStatus && matchActive && matchGender && matchRole && matchCrew && matchSearch;
      li.hidden = !show;

      // Filtering only affects visibility — selections persist across filter
      // changes so typing in the search box doesn't drop already-chosen recipients.
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

  root.querySelectorAll(".mc-gender-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      root
        .querySelectorAll(".mc-gender-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeGender = btn.dataset.filterGender || "all";
      lastClickedIndex = -1;
      applyFilters();
    });
  });

  roleFilter?.addEventListener("change", () => {
    activeRole = roleFilter.value || "all";
    lastClickedIndex = -1;
    applyFilters();
  });

  crewFilter?.addEventListener("change", () => {
    activeCrew = crewFilter.value || "";
    lastClickedIndex = -1;
    applyFilters();
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
    chip.innerHTML = `${escapeHtml(name)}<button type="button" class="mc-chip-remove" aria-label="Remove ${escapeAttr(name)}" data-id="${id}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`;
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
  // Confirmation modal helper
  // =========================================================

  /**
   * Show a small confirmation modal and resolve true if the user clicks
   * Continue, false if they cancel or dismiss.
   *
   * @param {string} title
   * @param {string} body
   * @returns {Promise<boolean>}
   */
  function confirmAction(title, body) {
    return new Promise((resolve) => {
      const modalEl  = document.getElementById("mcConfirmModal");
      const titleEl  = document.getElementById("mcConfirmTitle");
      const bodyEl   = document.getElementById("mcConfirmBody");
      const okBtn    = document.getElementById("mcConfirmOkBtn");

      if (!modalEl) { resolve(true); return; }

      if (titleEl) titleEl.textContent = title;
      if (bodyEl)  bodyEl.textContent  = body;

      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

      /** @returns {void} */
      function cleanup() {
        okBtn?.removeEventListener("click", onOk);
        modalEl.removeEventListener("hide.bs.modal", onHide);
      }

      /** @returns {void} */
      function onOk() {
        cleanup();
        modal.hide();
        resolve(true);
      }

      /** @returns {void} */
      function onHide() {
        cleanup();
        resolve(false);
      }

      okBtn?.addEventListener("click", onOk);
      modalEl.addEventListener("hide.bs.modal", onHide, { once: true });
      modal.show();
    });
  }

  // =========================================================
  // Step 1 — what is being sent
  // =========================================================

  /**
   * How each choice in step 1 behaves.
   *
   * mode: the send route's campaignMode. type: the message type saved on a
   * new campaign (null = the picked campaign's own type). picker: which
   * campaign list step 1 shows. response: whether the "Response needed"
   * settings show. event: "pick" (choose in step 2), "campaign" (the picked
   * campaign's) or "parent" (the parent campaign's).
   *
   * @type {Record<Purpose, {
   *   mode: 'new'|'add_to'|'followup',
   *   type: 'invitation'|'alert'|'followup'|null,
   *   name: boolean,
   *   picker: 'existing'|'parent'|null,
   *   response: boolean,
   *   responseDefault: boolean,
   *   event: 'pick'|'campaign'|'parent',
   *   link: boolean,
   * }>}
   */
  const PURPOSES = {
    invite:   { mode: "new",      type: "invitation", name: true,  picker: null,       response: true,  responseDefault: true,  event: "pick",     link: true },
    add:      { mode: "add_to",   type: null,         name: false, picker: "existing", response: false, responseDefault: true,  event: "campaign", link: true },
    remind:   { mode: "add_to",   type: null,         name: false, picker: "existing", response: false, responseDefault: true,  event: "campaign", link: true },
    followup: { mode: "followup", type: "followup",   name: true,  picker: "parent",   response: true,  responseDefault: true,  event: "parent",   link: true },
    announce: { mode: "new",      type: "alert",      name: true,  picker: null,       response: false, responseDefault: false, event: "pick",     link: false },
  };

  /** Every campaign of the year, as the server embedded it. */
  const batchesData = parseJson("mc-batches-data") || [];

  /** Whether the page was opened from the tracker's "Remind pending". */
  const selectPending = parseJson("mc-select-pending") === true;

  /**
   * The message last filled in from a campaign, so picking another campaign
   * replaces it but never overwrites a message someone typed.
   * @type {{ subject: string, body: string }|null}
   */
  let autoFilled = null;

  /** @returns {HTMLOptionElement|null} The campaign picked for Add people / Reminder. */
  function existingOption() {
    const opt = existingBatchSelect?.options[existingBatchSelect.selectedIndex];
    return opt?.value ? opt : null;
  }

  /** @returns {HTMLOptionElement|null} The parent picked for a Follow-up. */
  function parentOption() {
    const opt = parentBatchSelect?.options[parentBatchSelect.selectedIndex];
    return opt?.value ? opt : null;
  }

  /**
   * The message type of this send: the purpose's own, or for Add people and
   * Reminder the picked campaign's.
   * @returns {'invitation'|'alert'|'followup'}
   */
  function currentMessageType() {
    const cfg = PURPOSES[purpose];
    if (cfg.type) return cfg.type;
    const t = existingOption()?.dataset.type;
    return t === "alert" || t === "followup" ? t : "invitation";
  }

  /**
   * The campaign whose saved event and details apply: the picked campaign
   * (Add people, Reminder) or the parent (Follow-up).
   * @returns {number|null}
   */
  function contextBatchId() {
    const cfg = PURPOSES[purpose];
    if (cfg.picker === "existing") return Number(existingOption()?.value) || null;
    if (cfg.picker === "parent") return Number(parentOption()?.value) || null;
    return null;
  }

  /**
   * A recruitment campaign must ask for a response: disable (and clear)
   * the Recruitment checkbox whenever "Response needed" is off.
   * @returns {void}
   */
  function syncRecruitmentState() {
    if (!recruitmentChk) return;
    const allowed = responseNeededChk?.checked ?? true;
    recruitmentChk.disabled = !allowed;
    if (!allowed) recruitmentChk.checked = false;
  }

  /**
   * Show the answer settings that go with the chosen response type.
   * @returns {void}
   */
  function syncResponseTypeUI() {
    const type = responseTypeSelect?.value || "standard";
    responseStandardWrap?.classList.toggle("d-none", type !== "standard");
    responsePollWrap?.classList.toggle("d-none", type !== "poll");
    responseOptionsWrap?.classList.toggle("d-none", type === "standard");
  }

  /**
   * Show or hide the answer settings for the current purpose and the
   * "Response needed" box.
   * @returns {void}
   */
  function syncResponseVisibility() {
    const cfg = PURPOSES[purpose];
    responseNeededWrap?.classList.toggle("d-none", !cfg.response);
    responseConfigWrap?.classList.toggle("d-none", !cfg.response || !(responseNeededChk?.checked ?? true));
  }

  /**
   * Switch what is being sent and update step 1's fields, step 2 and the
   * merge fields to match.
   *
   * @param {Purpose} next
   * @returns {void}
   */
  function setPurpose(next) {
    if (!PURPOSES[next]) return;
    const changed = next !== purpose;
    purpose = next;
    const cfg = PURPOSES[next];

    purposeBtns.forEach((btn) => {
      const on = btn.dataset.purpose === next;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", String(on));
    });

    campaignNameWrap?.classList.toggle("d-none", !cfg.name);
    existingBatchWrap?.classList.toggle("d-none", cfg.picker !== "existing");
    parentBatchWrap?.classList.toggle("d-none", cfg.picker !== "parent");

    if (changed && responseNeededChk) responseNeededChk.checked = cfg.responseDefault;
    syncRecruitmentState();
    syncResponseVisibility();

    clearInviteStatusBadges();
    if (cfg.picker === "existing" && existingOption()) onExistingBatchChange();
    if (cfg.picker === "parent" && parentOption()) onParentBatchChange();

    updateEventStep();
    updateSendButton();
  }

  purposeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!(btn instanceof HTMLButtonElement) || btn.disabled) return;
      setPurpose(/** @type {Purpose} */ (btn.dataset.purpose));
    });
  });

  responseNeededChk?.addEventListener("change", () => {
    syncRecruitmentState();
    syncResponseVisibility();
    updateSendButton();
  });
  responseTypeSelect?.addEventListener("change", syncResponseTypeUI);
  respondByInput?.addEventListener("change", updateSendButton);

  /**
   * Fill the message in from a campaign's saved text, unless someone has
   * written their own.
   *
   * @param {HTMLOptionElement} opt - A campaign option with data-subject / data-body.
   * @returns {void}
   */
  function fillMessageFrom(opt) {
    const body = bodyInput?.value.trim() || "";
    const subject = subjectInput?.value.trim() || "";
    const untouched = !body || (autoFilled && autoFilled.body === body && autoFilled.subject === subject);
    if (!untouched) return;
    autoFilled = { subject: opt.dataset.subject || "", body: opt.dataset.body || "" };
    if (subjectInput) subjectInput.value = autoFilled.subject;
    if (bodyInput) bodyInput.value = autoFilled.body;
  }

  /**
   * A Follow-up parent was picked: suggest a name and show who answered the
   * parent. The follow-up's message is written fresh.
   * @returns {void}
   */
  function onParentBatchChange() {
    const opt = parentOption();
    if (!opt) {
      clearInviteStatusBadges();
      updateEventStep();
      updateSendButton();
      return;
    }
    const parentName = opt.dataset.name || opt.textContent.trim();
    if (campaignNameInput && !campaignNameInput.value.trim()) {
      campaignNameInput.value = `Follow-up: ${parentName}`;
    }
    applyInviteStatusBadges(Number(opt.value), false);
    updateEventStep();
    updateSendButton();
  }

  parentBatchSelect?.addEventListener("change", onParentBatchChange);

  /**
   * Remove all invitation status badges from the volunteer list.
   * @returns {void}
   */
  function clearInviteStatusBadges() {
    getAllItems().forEach((li) => {
      li.querySelectorAll(".mc-invite-status").forEach((el) => el.remove());
      li.classList.remove("mc-vol-already-invited");
    });
  }

  /**
   * Show each volunteer's status in a campaign (Invited · Yes / No / Maybe /
   * Pending / Revoked) on the volunteer list. For a Reminder, also select
   * exactly the people still to answer.
   *
   * @param {number} batchId
   * @param {boolean} selectPendingPeople - Replace the selection with the
   *   campaign's pending people (Reminder).
   * @returns {Promise<void>}
   */
  async function applyInviteStatusBadges(batchId, selectPendingPeople) {
    clearInviteStatusBadges();
    try {
      const res = await fetch(`/oversight/tools/campaigns/batches/${batchId}/invited`, {
        headers: { "X-CSRF-Token": getCsrf() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) return;
      // The choice may have changed while this was loading
      if (contextBatchId() !== batchId) return;

      /** @type {Map<number, {response:string|null, revoked:boolean}>} */
      const inviteMap = new Map(data.invited.map((i) => [i.volunteer_id, i]));

      // Pending people: the server's list when the tracker sent us here for
      // this campaign (it also counts answers to follow-ups), otherwise
      // everyone invited who hasn't answered and isn't revoked.
      const serverPending =
        selectPendingPeople && preselectedBatch?.id === batchId && Array.isArray(pendingVolIds)
          ? new Set(pendingVolIds)
          : null;

      if (selectPendingPeople) {
        getAllItems().forEach((li) => setItemSelected(li, false));
      }

      getAllItems().forEach((li) => {
        const id = Number(li.dataset.id);
        const inv = inviteMap.get(id);
        if (!inv) return;
        li.classList.add("mc-vol-already-invited");

        let statusClass = "mc-invite-status--pending";
        let statusLabel = "Invited · Pending";
        if (inv.revoked) {
          statusClass = "mc-invite-status--revoked";
          statusLabel = "Invited · Revoked";
        } else if (inv.response === "yes" || inv.response === "no" || inv.response === "maybe") {
          statusClass = `mc-invite-status--${inv.response}`;
          statusLabel = `Invited · ${inv.response[0].toUpperCase()}${inv.response.slice(1)}`;
        } else if (inv.response) {
          statusClass = "mc-invite-status--yes";
          statusLabel = "Invited · Answered";
        }
        const badge = document.createElement("span");
        badge.className = `mc-invite-status ${statusClass}`;
        badge.textContent = statusLabel;
        li.appendChild(badge);

        if (selectPendingPeople) {
          const pending = serverPending ? serverPending.has(id) : !inv.revoked && !inv.response;
          if (pending) setItemSelected(li, true);
        }
      });

      updateSelectionCount();
      updateSendButton();
      if (selectPendingPeople) {
        volunteerList?.querySelector(".mc-selected")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    } catch (err) {
      console.error("[campaignCenter] applyInviteStatusBadges error:", err);
    }
  }

  /**
   * A campaign was picked for Add people or Reminder: fill in its message,
   * show its summary and statuses, and for a Reminder select its pending
   * people.
   * @returns {void}
   */
  function onExistingBatchChange() {
    const opt = existingOption();
    if (!opt) {
      batchPreview?.classList.add("d-none");
      clearInviteStatusBadges();
      updateEventStep();
      updateSendButton();
      return;
    }

    fillMessageFrom(opt);

    if (batchPreviewText) batchPreviewText.textContent = opt.textContent.trim().replace(/\s+/g, " ");
    if (batchTrackerLink) batchTrackerLink.href = `/oversight/tools/campaigns/tracker?batchId=${opt.value}`;

    const origMsgPreview = document.getElementById("mcOrigMsgPreview");
    const origMsgSubject = document.getElementById("mcOrigMsgSubject");
    const origMsgBody = document.getElementById("mcOrigMsgBody");
    const toggleOrigBtn = document.getElementById("mcToggleOrigMsg");
    if (origMsgSubject) {
      const subjectVal = opt.dataset.subject || "";
      origMsgSubject.textContent = subjectVal ? `Subject: ${subjectVal}` : "";
      origMsgSubject.classList.toggle("d-none", !subjectVal);
    }
    if (origMsgBody) origMsgBody.textContent = opt.dataset.body || "(no message body saved)";
    origMsgPreview?.classList.add("d-none");
    if (toggleOrigBtn) toggleOrigBtn.textContent = "View saved message";
    batchPreview?.classList.remove("d-none");

    applyInviteStatusBadges(Number(opt.value), purpose === "remind");
    updateEventStep();
    updateSendButton();
  }

  existingBatchSelect?.addEventListener("change", onExistingBatchChange);

  document.getElementById("mcToggleOrigMsg")?.addEventListener("click", () => {
    const panel = document.getElementById("mcOrigMsgPreview");
    const btn = document.getElementById("mcToggleOrigMsg");
    if (!panel || !btn) return;
    const nowHidden = panel.classList.toggle("d-none");
    btn.textContent = nowHidden ? "View saved message" : "Hide saved message";
  });

  // =========================================================
  // Step 2 — event
  // =========================================================

  /**
   * Populate the shift dropdown for a selected day.
   * @param {number|null} dayId
   * @returns {void}
   */
  function populateShiftSelect(dayId) {
    if (!eventShiftSelect) return;
    eventShiftSelect.innerHTML = '<option value="">— All shifts —</option>';
    const day = dayId ? conventionDaysData.find((d) => d.id === dayId) : null;
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

  /**
   * "Friday — Friday, July 3" for a convention day id.
   * @param {number|null} dayId
   * @returns {string}
   */
  function dayText(dayId) {
    const day = dayId ? conventionDaysData.find((d) => d.id === dayId) : null;
    if (!day) return "";
    const dateStr = new Date(day.convention_date).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
    });
    return `${day.label} — ${dateStr}`;
  }

  /** @returns {void} */
  function updateEventPreview() {
    if (!eventPreview || !eventPreviewText) return;
    const dayId = Number(eventDaySelect?.value) || null;
    const shiftId = Number(eventShiftSelect?.value) || null;
    const day = dayText(dayId);
    if (!day) {
      eventPreview.classList.add("d-none");
      return;
    }
    const opt = shiftId ? eventShiftSelect?.querySelector(`option[value="${shiftId}"]`) : null;
    eventPreviewText.textContent = opt
      ? `${opt.dataset.eventTypeName} shift, ${fmtTime(opt.dataset.shiftStart)}–${fmtTime(opt.dataset.shiftEnd)} · ${day}`
      : `Linked to ${day}`;
    eventPreview.classList.remove("d-none");
  }

  /**
   * Whether this send has an event, so the shift and location merge fields
   * mean something.
   * @returns {boolean}
   */
  function hasEvent() {
    const cfg = PURPOSES[purpose];
    if (cfg.event === "pick") return !!eventDaySelect?.value;
    const opt = cfg.picker === "parent" ? parentOption() : existingOption();
    return !!opt?.dataset.dayId;
  }

  /**
   * Show the event pickers, or say which campaign's event is used, and
   * show the shift merge fields only when there is an event.
   * @returns {void}
   */
  function updateEventStep() {
    const cfg = PURPOSES[purpose];
    const pick = cfg.event === "pick";
    eventPickerWrap?.classList.toggle("d-none", !pick);
    if (eventInheritedNote) {
      let text = "";
      if (!pick) {
        const opt = cfg.picker === "parent" ? parentOption() : existingOption();
        const whose = cfg.picker === "parent" ? "the campaign it follows up" : "the campaign";
        if (!opt) text = `Uses the event of ${whose} — pick it in step 1.`;
        else if (opt.dataset.dayId) text = `Uses the event of ${whose}: ${dayText(Number(opt.dataset.dayId)) || "linked day"}.`;
        else text = `${cfg.picker === "parent" ? "The campaign it follows up" : "This campaign"} has no linked event.`;
      }
      eventInheritedNote.textContent = text;
      eventInheritedNote.classList.toggle("d-none", pick);
    }

    const withEvent = hasEvent();
    root.querySelectorAll('.mc-event-chip[data-target="mcBody"]').forEach((chip) => {
      chip.classList.toggle("d-none", !withEvent);
    });
    root.querySelectorAll('.mc-link-chip[data-target="mcBody"]').forEach((chip) => {
      chip.classList.toggle("d-none", !PURPOSES[purpose].link || currentMessageType() === "alert");
    });
  }

  eventDaySelect?.addEventListener("change", () => {
    populateShiftSelect(Number(eventDaySelect.value) || null);
    if (eventShiftSelect) eventShiftSelect.value = "";
    updateEventPreview();
    updateEventStep();
    updateSendButton();
  });

  eventShiftSelect?.addEventListener("change", () => {
    updateEventPreview();
    updateSendButton();
  });

  /**
   * The event picked in step 2 (new campaigns only).
   * @returns {{ conventionDayId: number|null, sessionId: number|null, shiftId: number|null }}
   */
  function getSelectedEvent() {
    if (PURPOSES[purpose].event !== "pick") return { conventionDayId: null, sessionId: null, shiftId: null };
    const shiftOpt = eventShiftSelect?.options[eventShiftSelect.selectedIndex];
    return {
      conventionDayId: Number(eventDaySelect?.value) || null,
      sessionId: shiftOpt ? Number(shiftOpt.dataset.sessionId) || null : null,
      shiftId: Number(eventShiftSelect?.value) || null,
    };
  }

  suggestNameBtn?.addEventListener("click", async () => {
    const dayOpt = eventDaySelect?.options[eventDaySelect.selectedIndex];
    const shiftOpt = eventShiftSelect?.options[eventShiftSelect?.selectedIndex ?? -1];
    try {
      const res = await fetch("/oversight/tools/campaigns/batches/suggest-name", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrf() },
        body: JSON.stringify({
          dayLabel: dayOpt?.dataset.label || null,
          conventionDate: dayOpt?.dataset.date || null,
          shiftLabel: shiftOpt?.dataset.sessionLabel || null,
          eventTypeName: shiftOpt?.dataset.eventTypeName || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && campaignNameInput) {
        campaignNameInput.value = data.name;
        updateSendButton();
      }
    } catch (err) {
      console.error("[campaignCenter] suggest-name error:", err);
    }
  });

  // =========================================================
  // Step 4 — channels, merge fields, text length
  // =========================================================

  /** @returns {void} */
  function updateSubjectVisibility() {
    subjectWrap?.classList.toggle("d-none", !sendEmailChk?.checked);
  }

  sendEmailChk?.addEventListener("change", () => {
    updateSubjectVisibility();
    updateSendButton();
  });
  sendSmsChk?.addEventListener("change", updateSendButton);

  /**
   * Insert a merge field at the cursor.
   * @param {HTMLInputElement|HTMLTextAreaElement} el
   * @param {string} field
   * @returns {void}
   */
  function insertAtCursor(el, field) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + field + el.value.slice(end);
    el.focus({ preventScroll: true });
    el.selectionStart = el.selectionEnd = start + field.length;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  root.addEventListener("click", (ev) => {
    const chip = ev.target instanceof Element ? ev.target.closest(".mc-merge-chip") : null;
    if (!(chip instanceof HTMLElement)) return;
    const targetEl = document.getElementById(chip.dataset.target || "");
    if (targetEl instanceof HTMLInputElement || targetEl instanceof HTMLTextAreaElement) {
      insertAtCursor(targetEl, chip.dataset.field || "");
    }
  });

  /** Characters a text can carry at 160 per segment (GSM 03.38). */
  const GSM_BASIC = new Set(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
  );
  /** GSM characters that take two places. */
  const GSM_EXTENDED = new Set("^{}\\[~]|€\f");

  /**
   * How a text message will be split into segments.
   *
   * @param {string} text
   * @returns {{ length: number, segments: number, unicode: boolean, special: string[] }}
   *   special: up to three characters that forced 70-character segments.
   */
  function smsSegments(text) {
    let units = 0;
    /** @type {Set<string>} */
    const special = new Set();
    for (const ch of text) {
      if (GSM_BASIC.has(ch)) units += 1;
      else if (GSM_EXTENDED.has(ch)) units += 2;
      else special.add(ch);
    }
    if (special.size) {
      const length = text.length; // UTF-16 code units, as carriers count them
      return { length, segments: length <= 70 ? 1 : Math.ceil(length / 67), unicode: true, special: [...special].slice(0, 3) };
    }
    return { length: units, segments: units <= 160 ? 1 : Math.ceil(units / 153), unicode: false, special: [] };
  }

  /**
   * Show the text length and segment count under the message, measured on
   * the filled-in preview when there is one.
   * @returns {void}
   */
  function updateSmsCounter() {
    if (!smsCounter) return;
    const text = lastPreview?.smsBody ?? bodyInput?.value ?? "";
    const show = !!sendSmsChk?.checked && text.trim().length > 0;
    smsCounter.classList.toggle("d-none", !show);
    if (!show) return;
    const s = smsSegments(text);
    const parts = [
      `Text: ${s.length} characters · ${s.segments === 1 ? "1 text" : `${s.segments} texts (long messages are split)`}`,
    ];
    if (lastPreview) parts.push(`measured for ${lastPreview.name}`);
    let html = parts.join(" · ");
    if (s.unicode) {
      html += ` · <span class="text-warning-emphasis">contains ${s.special.map((c) => `“${escapeHtml(c)}”`).join(" ")}, so each text holds 70 characters instead of 160</span>`;
    }
    smsCounter.innerHTML = html;
    smsCounter.classList.toggle("text-warning-emphasis", s.segments > 3);
  }

  // =========================================================
  // Step 1 / 4 — templates dropdown and manager
  // =========================================================

  /** Rebuild the "Start from a template" dropdown. @returns {void} */
  function renderTemplateSelect() {
    if (!templateSelect) return;
    templateSelect.innerHTML =
      '<option value="">Start from a template…</option>' +
      templates.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");
  }

  /**
   * Put a template's subject and message into the compose fields, asking
   * first when that would replace a message someone wrote.
   *
   * @param {{ subject?: string|null, body: string, name: string }} tpl
   * @returns {Promise<void>}
   */
  async function loadTemplate(tpl) {
    const current = bodyInput?.value.trim() || "";
    if (current && current !== tpl.body.trim() && !(autoFilled && autoFilled.body === current)) {
      const ok = await confirmAction("Replace your message?", `Load "${tpl.name}" in place of the message you've written?`);
      if (!ok) return;
    }
    if (subjectInput) subjectInput.value = tpl.subject || "";
    if (bodyInput) bodyInput.value = tpl.body;
    autoFilled = null;
    updateSendButton();
  }

  templateSelect?.addEventListener("change", () => {
    const tpl = templates.find((t) => t.id === Number(templateSelect.value));
    templateSelect.value = "";
    if (tpl) loadTemplate(tpl);
  });

  manageTemplatesBtn?.addEventListener("click", () => {
    const opening = templateManager?.classList.contains("d-none") ?? false;
    templateManager?.classList.toggle("d-none", !opening);
    manageTemplatesBtn.setAttribute("aria-expanded", String(opening));
    manageTemplatesBtn.textContent = opening ? "Hide templates" : "Manage templates";
    if (!opening) closeTemplateEditor();
  });

  // =========================================================
  // Step 3 / 5 — who gets what, preview, Send
  // =========================================================

  /**
   * What each selected person will get on the chosen channels.
   * @returns {{ email: number, text: number, reached: number,
   *   noText: number, skipped: string[] }}
   */
  function reviewTally() {
    const sendEmail = !!sendEmailChk?.checked;
    const sendSms = !!sendSmsChk?.checked;
    const tally = { email: 0, text: 0, reached: 0, noText: 0, skipped: /** @type {string[]} */ ([]) };
    selectedIds.forEach((id) => {
      const li = volunteerList?.querySelector(`.mc-volunteer-item[data-id="${id}"]`);
      const hasEmail = li?.dataset.hasEmail === "true";
      const canText = li?.dataset.smsOptedIn === "1";
      const email = sendEmail && hasEmail;
      const text = sendSms && canText;
      if (email) tally.email++;
      if (text) tally.text++;
      if (sendSms && !canText && email) tally.noText++;
      if (email || text) tally.reached++;
      else tally.skipped.push(getVolunteerName(id));
    });
    return tally;
  }

  /**
   * Fill in step 5's counts and step 3's note.
   * @param {ReturnType<typeof reviewTally>} t
   * @returns {void}
   */
  function renderReview(t) {
    if (whoNote) {
      whoNote.textContent =
        purpose === "remind"
          ? "Reminders go to people who were sent this campaign and haven't answered; anyone who has answered since is skipped."
          : "";
      whoNote.classList.toggle("d-none", !whoNote.textContent);
    }
    if (!reviewCounts) return;
    const rows = [];
    if (sendEmailChk?.checked) rows.push(["Email", `${t.email} ${t.email === 1 ? "person" : "people"}`]);
    if (sendSmsChk?.checked) {
      rows.push([
        "Text",
        `${t.text} ${t.text === 1 ? "person" : "people"}${t.noText ? ` · ${t.noText} can't be texted (no consent or no text-capable phone) and get the email only` : ""}`,
      ]);
    }
    if (t.skipped.length) {
      const names = t.skipped.slice(0, 5).join("; ") + (t.skipped.length > 5 ? `; and ${t.skipped.length - 5} more` : "");
      rows.push(["Skipped", `${t.skipped.length} · nothing to send them on the chosen channels: ${names}`]);
    }
    reviewCounts.innerHTML = rows
      .map(([k, v]) => `<div class="mc-review-row"><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`)
      .join("");
  }

  /** @type {{ name: string, subject: string, body: string, smsBody: string, smsReplyLine: string }|null} */
  let lastPreview = null;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let previewTimer;
  let previewSeq = 0;

  /**
   * Refresh the preview shortly after the last change (debounced).
   * @returns {void}
   */
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(loadPreview, 400);
  }

  /**
   * Ask the server for the first selected person's filled-in message and
   * show it in step 5.
   * @returns {Promise<void>}
   */
  async function loadPreview() {
    const firstId = selectedIds.values().next().value;
    const body = bodyInput?.value.trim() || "";
    if (!previewEl) return;
    if (!firstId || !body) {
      lastPreview = null;
      if (previewLabel) previewLabel.textContent = "Preview";
      previewEl.innerHTML = '<span class="text-muted">Pick recipients and write a message to see it here.</span>';
      updateSmsCounter();
      return;
    }
    const seq = ++previewSeq;
    const { conventionDayId, shiftId } = getSelectedEvent();
    try {
      const res = await fetch("/oversight/tools/campaigns/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrf() },
        body: JSON.stringify({
          volunteerId: firstId,
          subject: subjectInput?.value.trim() || "",
          body,
          batchId: contextBatchId(),
          conventionDayId,
          shiftId,
          respondBy: PURPOSES[purpose].response && responseNeededChk?.checked ? respondByInput?.value || null : null,
          // New campaigns: the answer settings on the form (they set the
          // "Reply 1 for Yes, …" line texts get)
          ...(PURPOSES[purpose].response
            ? {
                responseNeeded: currentMessageType() !== "alert" && !!responseNeededChk?.checked,
                responseConfig: buildResponseConfig(!!responseNeededChk?.checked),
              }
            : purpose === "announce"
              ? { responseNeeded: false }
              : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (seq !== previewSeq) return;
      if (!res.ok || !data.success) throw new Error(data.error || "Preview failed");
      const v = allVolunteers.find((p) => p.id === firstId);
      const name = v ? `${v.firstName} ${v.lastName}`.trim() : getVolunteerName(firstId);
      lastPreview = { name, subject: data.subject, body: data.body, smsBody: data.smsBody || data.body, smsReplyLine: data.smsReplyLine || "" };
      if (previewLabel) previewLabel.textContent = `Preview for ${name}`;
      previewEl.innerHTML =
        (sendEmailChk?.checked && data.subject ? `<div class="mc-preview-subject">${escapeHtml(data.subject)}</div>` : "") +
        `<div class="mc-preview-body">${escapeHtml(data.body)}</div>` +
        (sendSmsChk?.checked && data.smsReplyLine
          ? `<div class="mc-preview-sms-line"><i class="fa-solid fa-comment-sms me-1" aria-hidden="true"></i>Texts also end with: ${escapeHtml(data.smsReplyLine)}</div>`
          : "");
    } catch (err) {
      if (seq !== previewSeq) return;
      console.error("[campaignCenter] preview error:", err);
      lastPreview = null;
      previewEl.innerHTML = '<span class="text-muted">The preview couldn\'t be loaded; the message will still be filled in when sent.</span>';
    }
    updateSmsCounter();
  }

  /**
   * Check everything a send needs, update the Send button, the hint, the
   * review counts, and schedule a fresh preview. Called after any change.
   * @returns {void}
   */
  function updateSendButton() {
    const cfg = PURPOSES[purpose];
    const t = reviewTally();
    const hasRecipients = selectedIds.size > 0;
    const hasChannel = !!(sendEmailChk?.checked || sendSmsChk?.checked);
    const hasBody = (bodyInput?.value.trim().length || 0) > 0;
    const hasName = !cfg.name || (campaignNameInput?.value.trim().length || 0) > 0;
    const hasCampaign =
      cfg.picker === "existing" ? !!existingOption()
        : cfg.picker === "parent" ? !!parentOption()
          : true;

    let hint = "";
    if (!hasCampaign) hint = cfg.picker === "parent" ? "Pick the campaign this follows up (step 1)." : "Pick a campaign (step 1).";
    else if (!hasName) hint = "Enter a campaign name (step 1).";
    else if (!hasRecipients) hint = "Select recipients from the list (step 3).";
    else if (!hasChannel) hint = "Choose Email, Text or both (step 4).";
    else if (!hasBody) hint = "Write a message (step 4).";
    else if (t.reached === 0) hint = "No one selected can be reached on the chosen channels.";

    if (sendBtn) {
      sendBtn.disabled = !!hint;
      if (!sendBtn.dataset.busy) {
        sendBtn.innerHTML = `<i class="fa-solid fa-paper-plane me-2" aria-hidden="true"></i>Send to <span id="mcSendBtnCount">${t.reached}</span> <span id="mcSendBtnPlural">${t.reached === 1 ? "person" : "people"}</span>`;
      }
    }
    if (sendHint) sendHint.textContent = hint;

    renderReview(t);
    updateSmsCounter();
    schedulePreview();
  }

  bodyInput?.addEventListener("input", updateSendButton);
  subjectInput?.addEventListener("input", updateSendButton);
  campaignNameInput?.addEventListener("input", updateSendButton);

  // =========================================================
  // Send — AJAX POST
  // =========================================================

  /**
   * The answer settings as saved on a new campaign, or null for the default
   * (Yes / No / Maybe) or when no answer is needed.
   * @param {boolean} responseNeeded
   * @returns {object|null}
   */
  function buildResponseConfig(responseNeeded) {
    if (!responseNeeded) return null;
    const type = responseTypeSelect?.value || "standard";
    const allowOther = /** @type {HTMLInputElement|null} */ (document.getElementById("mcAllowOther"))?.checked ?? false;
    const checked = (id) => /** @type {HTMLInputElement|null} */ (document.getElementById(id))?.checked;
    const lines = () => (/** @type {HTMLTextAreaElement|null} */ (document.getElementById("mcResponseOptions"))?.value || "")
      .split("\n").map((x) => x.trim()).filter(Boolean);

    if (type === "standard") {
      const options = [];
      if (checked("mcOptYes")) options.push("yes");
      if (checked("mcOptNo")) options.push("no");
      if (checked("mcOptMaybe")) options.push("maybe");
      if (options.length === 3 && !allowOther) return null;
      return { type: "standard", options, allowOther };
    }
    if (type === "poll") {
      const question = /** @type {HTMLInputElement|null} */ (document.getElementById("mcPollQuestion"))?.value.trim() || "";
      return { type: "poll", question, options: lines(), allowOther };
    }
    return { type: "custom", options: lines(), allowOther };
  }

  /**
   * Show the Send button as working, or put it back.
   * @param {boolean} busy
   * @returns {void}
   */
  function setSending(busy) {
    if (!sendBtn) return;
    if (busy) {
      sendBtn.dataset.busy = "1";
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Sending…';
    } else {
      delete sendBtn.dataset.busy;
      updateSendButton();
    }
  }

  sendBtn?.addEventListener("click", async () => {
    if (sendBtn.disabled) return;
    const cfg = PURPOSES[purpose];
    const messageType = currentMessageType();
    const recipientIds = Array.from(selectedIds);
    const subject = subjectInput?.value.trim() || "";
    const body = bodyInput?.value.trim() || "";
    const sendEmail = !!sendEmailChk?.checked;
    const sendSms = !!sendSmsChk?.checked;
    const { conventionDayId, sessionId, shiftId } = getSelectedEvent();
    const responseNeeded = cfg.response ? (responseNeededChk?.checked ?? true) : cfg.responseDefault;
    const isRecruitment = cfg.response && responseNeeded && !!recruitmentChk?.checked;
    const batchId = contextBatchId();

    if (messageType === "alert" && body.includes("{link}")) {
      const ok = await confirmAction(
        "RSVP link in an announcement?",
        "You've included {link} in an announcement, which doesn't ask for a reply. Send anyway?",
      );
      if (!ok) return;
    }

    setSending(true);

    /**
     * @param {boolean} force - Skip the "already invited" check.
     * @returns {Promise<object>}
     */
    async function doSend(force) {
      const res = await fetch("/oversight/tools/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrf() },
        body: JSON.stringify({
          volunteerIds: recipientIds,
          subject,
          body,
          sendEmail,
          sendSms,
          campaignMode: cfg.mode,
          batchName: cfg.name ? campaignNameInput?.value.trim() || "" : null,
          existingBatchId: cfg.picker === "existing" ? batchId : null,
          parentBatchId: cfg.picker === "parent" ? batchId : null,
          responseNeeded,
          conventionDayId,
          sessionId,
          shiftId,
          force,
          isReminder: purpose === "remind",
          messageType,
          responseConfig: cfg.response ? buildResponseConfig(responseNeeded) : null,
          isRecruitment,
          respondBy: cfg.response && responseNeeded ? respondByInput?.value || null : null,
        }),
      });
      return res.json().catch(() => ({}));
    }

    try {
      let data = await doSend(false);

      if (!data.success && data.pendingWarnings?.length) {
        const names = data.pendingWarnings.map((w) => w.name).join(", ");
        const proceed = await confirmAction(
          "Already invited",
          `These volunteers already have an unanswered invite for this event: ${names}. Send again anyway?`,
        );
        if (!proceed) return;
        data = await doSend(true);
      }

      renderResults(data);
      if (data.success && data.runId) followSendDelivery(data.runId);

      // Add people / Reminder with an edited message: offer to save it as
      // the campaign's message for later sends (each send keeps its own text
      // in the tracker either way).
      const saved = cfg.picker === "existing" ? batchesData.find((b) => b.id === batchId) : null;
      if (data.success && saved && ((saved.message_body || "").trim() !== body || (saved.message_subject || "").trim() !== subject)) {
        offerToSaveMessage(saved, subject, body);
      }
    } catch (err) {
      console.error("[campaignCenter] send error:", err);
      renderResults({ success: false, error: "Network error — please try again." });
    } finally {
      setSending(false);
    }
  });

  /**
   * After a send with a changed message, offer to make it the campaign's
   * saved message.
   *
   * @param {object} batch - The campaign record from mc-batches-data.
   * @param {string} subject
   * @param {string} body
   * @returns {void}
   */
  function offerToSaveMessage(batch, subject, body) {
    const prompt = document.createElement("div");
    prompt.className = "d-flex align-items-center gap-2 flex-wrap mt-2";
    prompt.innerHTML = `
      <span class="small text-muted">Save the message you just sent as this campaign's message?</span>
      <button type="button" class="btn btn-outline-secondary btn-sm" id="mcUpdateMsgBtn">
        <i class="fa-solid fa-floppy-disk me-1" aria-hidden="true"></i>Save message
      </button>`;
    resultsBody?.appendChild(prompt);

    document.getElementById("mcUpdateMsgBtn")?.addEventListener("click", async (ev) => {
      const btn = /** @type {HTMLButtonElement} */ (ev.currentTarget);
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Saving…';
      let ok = false;
      try {
        const res = await fetch(`/oversight/tools/campaigns/batches/${batch.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrf() },
          body: JSON.stringify({
            name: batch.name,
            messageSubject: subject || null,
            messageBody: body,
            parentBatchId: batch.parent_batch_id || null,
            responseNeeded: batch.response_needed !== false,
            active: batch.active !== false,
            messageType: batch.message_type || "invitation",
          }),
        });
        ok = !!(await res.json().catch(() => ({}))).success;
      } catch {
        ok = false;
      }
      if (ok) {
        batch.message_subject = subject || null;
        batch.message_body = body;
        const opt = existingBatchSelect?.querySelector(`option[value="${batch.id}"]`);
        if (opt instanceof HTMLOptionElement) {
          opt.dataset.subject = subject;
          opt.dataset.body = body;
        }
      }
      prompt.outerHTML = `<div class="alert ${ok ? "alert-success" : "alert-warning"} mt-2 mb-0">${ok ? "Campaign message saved." : "Couldn't save the campaign message."}</div>`;
    });
  }

  // =========================================================
  // Results log
  // =========================================================

  /**
   * @param {{
   *   success?: boolean,
   *   sent?: number,
   *   batchId?: number,
   *   runId?: string|null,
   *   skipped?: Array<{name:string,reason:string}>,
   *   emailOnly?: Array<{name:string,reason:string}>,
   *   errors?: Array<{name:string,reason:string}>,
   *   error?: string
   * }} data
   * @returns {void}
   */
  function renderResults(data) {
    if (!resultsCard || !resultsBody) return;
    deliveryWatch++; // stop following any earlier send's delivery

    if (!data.success || data.error) {
      resultsBody.innerHTML = `<div class="alert alert-danger mb-0">${escapeHtml(data.error || "An unexpected error occurred.")}</div>`;
      resultsCard.classList.remove("d-none");
      resultsCard.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    let html = `
            <div class="alert alert-success mb-3">
                <i class="fa-solid fa-circle-check me-2"></i>
                Sent to <strong>${data.sent}</strong> ${data.sent === 1 ? "person" : "people"}.
                ${data.batchId ? `<a href="/oversight/tools/campaigns/tracker?batchId=${data.batchId}" class="alert-link ms-2">View in Tracker →</a>` : ""}
            </div>`;

    if (data.runId) {
      html += `<div class="mc-delivery" id="mcDeliveryStatus" role="status" aria-live="polite">
                <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Checking delivery…
            </div>`;
    }

    if (data.skipped?.length) {
      html += `<p class="fw-semibold text-warning mb-1"><i class="fa-solid fa-triangle-exclamation me-1"></i>Skipped (${data.skipped.length}):</p><ul class="small mb-3">`;
      data.skipped.forEach(({ name, reason }) => {
        html += `<li><strong>${escapeHtml(name)}</strong> — ${escapeHtml(reason)}</li>`;
      });
      html += `</ul>`;
    }

    if (data.emailOnly?.length) {
      html += `<p class="fw-semibold text-secondary mb-1"><i class="fa-solid fa-comment-slash me-1"></i>Email only, no text (${data.emailOnly.length}):</p><ul class="small mb-3">`;
      data.emailOnly.forEach(({ name, reason }) => {
        html += `<li><strong>${escapeHtml(name)}</strong> — ${escapeHtml(reason)}</li>`;
      });
      html += `</ul>`;
    }

    if (data.errors?.length) {
      html += `<p class="fw-semibold text-danger mb-1"><i class="fa-solid fa-circle-xmark me-1"></i>Errors (${data.errors.length}):</p><ul class="small mb-3">`;
      data.errors.forEach(({ name, reason }) => {
        html += `<li><strong>${escapeHtml(name)}</strong> — ${escapeHtml(reason)}</li>`;
      });
      html += `</ul>`;
    }

    resultsBody.innerHTML = html;
    resultsCard.classList.remove("d-none");
    resultsCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // =========================================================
  // Delivery (live, after a send)
  // =========================================================

  /** Milliseconds between delivery checks. */
  const DELIVERY_POLL_MS = 4000;

  /** Checks before giving up (4 s × 30 = 2 minutes). */
  const DELIVERY_POLL_LIMIT = 30;

  /**
   * Bumped by each new result and by Dismiss, so an older send's checks
   * stop on their own.
   */
  let deliveryWatch = 0;

  /**
   * Follow a send's delivery: every few seconds ask
   * GET /oversight/tools/campaigns/send-delivery/:runId and write the result
   * into the results card. Stops when no text is pending, after
   * DELIVERY_POLL_LIMIT checks, or when another send or Dismiss replaces
   * the card.
   *
   * @param {string} runId - The send's run id from the send response.
   * @returns {void}
   */
  function followSendDelivery(runId) {
    const watch = deliveryWatch;
    let checks = 0;

    /**
     * One delivery check; schedules the next while texts are pending.
     *
     * @returns {Promise<void>}
     */
    const check = async () => {
      if (watch !== deliveryWatch) return;
      checks++;
      let delivery = null;
      try {
        const res = await fetch(`/oversight/tools/campaigns/send-delivery/${encodeURIComponent(runId)}`);
        const data = await res.json().catch(() => ({}));
        if (data.success) delivery = data.delivery;
      } catch {
        /* try again on the next check */
      }
      if (watch !== deliveryWatch) return;
      const statusEl = document.getElementById("mcDeliveryStatus");
      if (!statusEl) return;
      const pending = delivery ? delivery.sms.pending : 1;
      const more = pending > 0 && checks < DELIVERY_POLL_LIMIT;
      if (delivery) renderDelivery(statusEl, delivery, more);
      if (more) {
        setTimeout(check, DELIVERY_POLL_MS);
      } else if (!delivery) {
        statusEl.textContent = "Delivery couldn't be checked. The Invitation Tracker shows it for each send.";
      }
    };
    setTimeout(check, DELIVERY_POLL_MS);
  }

  /**
   * Write a send's delivery into the results card: one line for texts, one
   * for emails, then anyone it did not reach and why. Built with DOM nodes
   * (names and reasons are never treated as HTML).
   *
   * @param {HTMLElement} statusEl
   * @param {{ sms: { delivered: number, pending: number, failed: number, untracked: number },
   *           email: { sent: number, failed: number },
   *           failures: Array<{ name: string, channel: string, reason: string }> }} d
   * @param {boolean} stillChecking - Whether another check is coming.
   * @returns {void}
   */
  function renderDelivery(statusEl, d, stillChecking) {
    const lines = [];
    const smsTotal = d.sms.delivered + d.sms.pending + d.sms.failed + d.sms.untracked;
    if (smsTotal) {
      const parts = [`${d.sms.delivered} of ${smsTotal} delivered`];
      if (d.sms.pending) parts.push(`${d.sms.pending} pending`);
      if (d.sms.failed) parts.push(`${d.sms.failed} not delivered`);
      if (d.sms.untracked) parts.push(`${d.sms.untracked} not tracked`);
      lines.push(`Texts: ${parts.join(", ")}.`);
    }
    const emailTotal = d.email.sent + d.email.failed;
    if (emailTotal) {
      lines.push(`Emails: ${d.email.sent} of ${emailTotal} sent${d.email.failed ? `, ${d.email.failed} failed` : ""}.`);
    }
    if (!lines.length) lines.push("Nothing to track yet.");

    statusEl.replaceChildren();
    const variant = d.failures.length ? "warning" : d.sms.pending > 0 ? "pending" : "done";
    statusEl.className = `mc-delivery mc-delivery--${variant}`;

    const head = document.createElement("div");
    if (stillChecking) {
      const spin = document.createElement("span");
      spin.className = "spinner-border spinner-border-sm me-2";
      spin.setAttribute("aria-hidden", "true");
      head.appendChild(spin);
    }
    head.appendChild(document.createTextNode(lines.join(" ")));
    statusEl.appendChild(head);

    if (d.failures.length) {
      const list = document.createElement("ul");
      list.className = "mc-delivery-list";
      for (const f of d.failures) {
        const li = document.createElement("li");
        li.textContent = `${f.name} (${f.channel === "email" ? "email" : "text"}): ${f.reason}`;
        list.appendChild(li);
      }
      statusEl.appendChild(list);
    }
  }

  resultsDismiss?.addEventListener("click", () => {
    deliveryWatch++;
    resultsCard?.classList.add("d-none");
    if (resultsBody) resultsBody.innerHTML = "";
  });

  // =========================================================
  // Templates — render
  // =========================================================

  /** @returns {void} */
  function renderTemplateList() {
    renderTemplateSelect();
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
                    <button type="button" class="btn btn-link btn-sm p-0 text-secondary mc-template-edit" data-id="${t.id}" aria-label="Edit template ${escapeAttr(t.name)}">
                        <i class="fa-solid fa-pencil"></i>
                    </button>
                    <button type="button" class="btn btn-link btn-sm p-0 text-danger mc-template-delete"
                        aria-label="Delete template ${escapeAttr(t.name)}"
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
    // The template manager sits inside step 4: keep that step bright and
    // dim the others while a template is being edited.
    const templatesCard = templateManager?.closest(".mc-card");
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
      const tpl = templates.find((t) => t.id === Number(loadBtn.dataset.id));
      if (tpl) loadTemplate(tpl);
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
      ? `/oversight/tools/campaigns/templates/${editingTemplateId}`
      : `/oversight/tools/campaigns/templates`;
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
      console.error("[campaignCenter] template save error:", err);
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
   * @returns {Promise<void>}
   */
  async function confirmDeleteTemplate(id, name) {
    const ok = await confirmAction("Delete template?", `Delete template "${name}"? This cannot be undone.`);
    if (!ok) return;
    fetch(`/oversight/tools/campaigns/templates/${id}`, {
      method: "DELETE",
      headers: { "X-CSRF-Token": getCsrf() },
    })
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        if (!data.success) {
          if (tplStatus) tplStatus.innerHTML = `<div class="alert alert-danger py-1 small">${escapeHtml(data.error || "Delete failed.")}</div>`;
          return;
        }
        templates = templates.filter((t) => t.id !== id);
        renderTemplateList();
        if (editingTemplateId === id) closeTemplateEditor();
      })
      .catch((err) => {
        console.error("[campaignCenter] template delete error:", err);
        if (tplStatus) tplStatus.innerHTML = `<div class="alert alert-danger py-1 small">Network error — delete failed.</div>`;
      });
  }



  // =========================================================
  // Init
  // =========================================================

  applyFilters();
  updateSubjectVisibility();
  syncResponseTypeUI();
  updateChipAreaVisibility();

  // Opened from the tracker (?batchId=): "Remind pending" opens a Reminder
  // with that campaign's pending people selected; "Add people" opens Add
  // people. Otherwise start on New invitation.
  const preselectedOpt = preselectedBatch
    ? existingBatchSelect?.querySelector(`option[value="${preselectedBatch.id}"]`)
    : null;
  if (preselectedOpt && existingBatchSelect) {
    existingBatchSelect.value = String(preselectedBatch.id);
    setPurpose(selectPending ? "remind" : "add");
  } else {
    setPurpose("invite");
  }
});
