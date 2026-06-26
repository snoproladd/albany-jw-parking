/**
 * @file notesReport.js
 * @description Client-side controller for the Notes Report page.
 *
 * Four panels:
 *   All Notes         — intake note cards + inbound SMS message cards, per-note.
 *   Actionable        — action items from GET /api/notes-report/actions.
 *   Solutions Summary — action items where solution_found = true.
 *   Dismissed         — dismissed intake notes; lazy-loads on first tab click.
 *
 * Modals:
 *   noteDetailModal  — intake note text, read history, action items, AI analysis.
 *   smsDetailModal   — raw SMS body, AI summary, resolve button.
 *   actionDetailModal — solution status, solution text, complete/delete.
 */

// ── State ─────────────────────────────────────────────────────────────────────

/**
 * Volunteers with intake notes from GET /api/notes-report/volunteers.
 * @type {Array<{
 *   id:           number,
 *   first_name:   string,
 *   last_name:    string,
 *   notes:        string,
 *   action_count: number,
 *   reads:        Array<{ read_by: number, reader_name: string, read_at: string }>,
 * }>}
 */
let volunteers = [];

/**
 * Action items from GET /api/notes-report/actions.
 * @type {Array<{
 *   id:                number,
 *   volunteer_id:      number,
 *   volunteer_name:    string,
 *   notes:             string,
 *   solution_found:    boolean|null,
 *   solution:          string|null,
 *   solution_found_at: string|null,
 *   solution_founder:  string|null,
 *   completed:         boolean|null,
 *   completed_at:      string|null,
 *   completer:         string|null,
 *   created_at:        string,
 *   creator:           string,
 * }>}
 */
let actions = [];

/**
 * Inbound SMS messages from GET /api/notes-report/sms-messages.
 * @type {Array<{
 *   id:              number,
 *   volunteer_id:    number|null,
 *   first_name:      string,
 *   last_name:       string,
 *   from_phone:      string,
 *   raw_body:        string,
 *   received_at:     string,
 *   ai_summary:      string|null,
 *   ai_category:     string|null,
 *   ai_action_items: string|null,
 *   ai_error:        string|null,
 * }>}
 */
let smsMessages = [];

/**
 * Dismissed intake notes from GET /api/notes-report/volunteers/dismissed.
 * Only populated after the Dismissed tab is first clicked.
 * @type {Array<{
 *   id:               number,
 *   first_name:       string,
 *   last_name:        string,
 *   notes:            string,
 *   note_dismissed_at: string|null,
 *   dismisser:        string|null,
 * }>}
 */
let dismissedVolunteers = [];

/**
 * Resolved inbound SMS messages for the Archived panel.
 * @type {Array}
 */
let resolvedSmsMessages = [];

/** Whether the dismissed panel has been loaded at least once. @type {boolean} */
let dismissedLoaded = false;

/** Signed-in overseer's volunteer ID. @type {number} */
let actorId = 0;

/** Volunteer ID whose note detail modal is currently open. @type {number|null} */
let openVolunteerId = null;

/** SMS message ID whose detail modal is currently open. @type {number|null} */
let openSmsId = null;

/** Action ID whose detail modal is currently open. @type {number|null} */
let openActionId = null;

/** True when actionDetailModal was opened from within noteDetailModal. @type {boolean} */
let actionOpenedFromNote = false;

/** Active filter key per panel. @type {{ allNotes: string, actionable: string, solutions: string, dismissed: string }} */
const activeFilter = {
  allNotes: "all",
  actionable: "all",
  solutions: "all",
  dismissed: "all",
};

/** Active search string per panel. @type {{ allNotes: string, actionable: string, solutions: string, dismissed: string }} */
const activeSearch = {
  allNotes: "",
  actionable: "",
  solutions: "",
  dismissed: "",
};

/**
 * Cache of AI analysis results keyed by volunteerId.
 * Null = checked server and no analysis exists yet. Absent = not yet fetched.
 * @type {Map<number, object|null>}
 */
const analyses = new Map();

/** volunteerId currently being analyzed. @type {number|null} */
let analyzingId = null;

/** True when a batch analysis run is in progress. @type {boolean} */
let batchAnalyzing = false;

// ── Bootstrap modal instances ─────────────────────────────────────────────────

/** @type {InstanceType<typeof bootstrap.Modal>|null} */
let noteModal = null;

/** @type {InstanceType<typeof bootstrap.Modal>|null} */
let smsModal = null;

/** @type {InstanceType<typeof bootstrap.Modal>|null} */
let actionModal = null;

// ── Entry point ───────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", init);

/**
 * Bootstraps the page: reads actor context, instantiates modals, wires events,
 * then fetches and renders all data.
 * @returns {Promise<void>}
 */
async function init() {
  const root = document.getElementById("notesReportRoot");
  actorId = parseInt(root.dataset.actorId, 10) || 0;

  noteModal = new bootstrap.Modal(document.getElementById("noteDetailModal"));
  smsModal = new bootstrap.Modal(document.getElementById("smsDetailModal"));
  actionModal = new bootstrap.Modal(
    document.getElementById("actionDetailModal"),
  );

  wireEvents();
  await loadData();
  renderAll();
}

// ── Data loading ──────────────────────────────────────────────────────────────

/**
 * Fetches volunteers, actions, and SMS messages in parallel.
 * Silently sets arrays to empty on network or server error.
 * @returns {Promise<void>}
 */
async function loadData() {
  const [vRes, aRes, smsRes] = await Promise.all([
    fetch("/api/notes-report/volunteers"),
    fetch("/api/notes-report/actions"),
    fetch("/api/notes-report/sms-messages"),
  ]);

  volunteers = vRes.ok ? (await vRes.json()).volunteers || [] : [];
  actions = aRes.ok ? (await aRes.json()).actions || [] : [];
  smsMessages = smsRes.ok ? (await smsRes.json()).messages || [] : [];
}

/**
 * Fetches dismissed intake notes from the server.
 * Only called on first Dismissed tab click.
 * @returns {Promise<void>}
 */
async function loadDismissed() {
    try {
        const [vRes, smsRes] = await Promise.all([
            fetch('/api/notes-report/volunteers/dismissed'),
            fetch('/api/notes-report/sms-messages/resolved'),
        ]);
        dismissedVolunteers  = vRes.ok    ? ((await vRes.json()).volunteers   || []) : [];
        resolvedSmsMessages  = smsRes.ok  ? ((await smsRes.json()).messages   || []) : [];
    } catch {
        dismissedVolunteers = [];
        resolvedSmsMessages = [];
    }
}

/**
 * Reloads volunteers, actions, and SMS messages, then re-renders all panels.
 * @returns {Promise<void>}
 */
async function reload() {
  await loadData();
  if (dismissedLoaded) await loadDismissed();
  renderAll();
}

// ── Render orchestration ──────────────────────────────────────────────────────

/**
 * Renders all panels and updates tab badges.
 * Called on initial load and after any mutation.
 */
function renderAll() {
  renderAllNotes();
  renderActionable();
  renderSolutions();
  if (dismissedLoaded) renderDismissed();
  updateBadges();
}

/**
 * Updates the numeric count badge on each tab button.
 */
function updateBadges() {
  setBadge("badge-all-notes", volunteers.length + smsMessages.length);
  setBadge("badge-actionable", actions.length);
  setBadge(
    "badge-solutions",
    actions.filter((a) => a.solution_found === true).length,
  );
  if (dismissedLoaded) setBadge("badge-dismissed", dismissedVolunteers.length);
}

/**
 * Sets the text and visibility of a tab count badge.
 * @param {string} id    - Element ID of the badge span.
 * @param {number} count - Count to display; hides the badge when zero.
 */
function setBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  if (count > 0) {
    el.textContent = count;
    el.classList.remove("d-none");
  } else {
    el.classList.add("d-none");
  }
}

// ── All Notes panel ───────────────────────────────────────────────────────────

/**
 * Renders the All Notes panel.
 * Shows inbound SMS message cards first (most recent first), then intake note
 * cards. Each section is visually separated with a small section label.
 * Filters and search apply only to intake note cards.
 */
function renderAllNotes() {
  const filter = activeFilter.allNotes;
  const search = activeSearch.allNotes.toLowerCase();

  // SMS messages — filtered by search only (filters don't apply)
  const smsRows = smsMessages.filter((m) => {
    if (!search) return true;
    const haystack =
      `${m.first_name} ${m.last_name} ${m.raw_body}`.toLowerCase();
    return haystack.includes(search);
  });

  // Intake note cards — full filter + search logic
  const noteRows = volunteers.filter((v) => {
    if (filter === "unread" && v.reads.some((r) => r.read_by === actorId))
      return false;
    if (filter === "no-action" && v.action_count > 0) return false;
    if (search) {
      const haystack =
        `${v.first_name} ${v.last_name} ${v.notes}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const list = document.getElementById("allNotesList");
  const empty = document.getElementById("allNotesEmpty");
  const loading = document.getElementById("allNotesLoading");

  loading.classList.add("d-none");

  if (smsRows.length === 0 && noteRows.length === 0) {
    list.classList.add("d-none");
    empty.classList.remove("d-none");
    return;
  }

  empty.classList.add("d-none");
  list.classList.remove("d-none");

  let html = "";

  if (smsRows.length > 0) {
    html += `<div class="nr-section-label"><i class="fa-solid fa-message me-1"></i>Inbound Messages</div>`;
    html += smsRows.map((m) => buildSmsCard(m)).join("");
  }

  if (noteRows.length > 0) {
    html += `<div class="nr-section-label${smsRows.length > 0 ? " mt-3" : ""}"><i class="fa-solid fa-note-sticky me-1"></i>Intake Notes</div>`;
    html += noteRows.map((v) => buildNoteCard(v)).join("");
  }

  list.innerHTML = html;

  list.querySelectorAll(".nr-card[data-sms-id]").forEach((card) => {
    const mid = parseInt(card.dataset.smsId, 10);
    card.addEventListener("click", () => onSmsCardClick(mid));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSmsCardClick(mid);
      }
    });
  });

  list.querySelectorAll(".nr-card[data-volunteer-id]").forEach((card) => {
    const vid = parseInt(card.dataset.volunteerId, 10);
    card.addEventListener("click", () => onNoteCardClick(vid));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onNoteCardClick(vid);
      }
    });
  });
}

/**
 * Builds the HTML for an inbound SMS message card.
 * @param {{ id: number, first_name: string, last_name: string, raw_body: string, received_at: string, ai_category: string|null }} m
 * @returns {string}
 */
function buildSmsCard(m) {
  const categoryBadge = m.ai_category
    ? `<span class="badge nr-badge nr-badge--sms-category">${escHtml(m.ai_category.replace(/_/g, " "))}</span>`
    : "";

  const unknownBadge = !m.volunteer_id
    ? '<span class="badge nr-badge nr-badge--unread">Unknown caller</span>'
    : "";

  return `
        <div class="nr-card nr-card--sms"
             data-sms-id="${m.id}"
             role="button"
             tabindex="0"
             aria-label="View SMS from ${escHtml(m.first_name)} ${escHtml(m.last_name)}">
            <div class="nr-card-main">
                <div class="nr-card-name">
                    <i class="fa-solid fa-message me-1 text-primary"></i>
                    ${escHtml(m.first_name)} ${escHtml(m.last_name)}
                    <span class="nr-card-meta-inline">${fmtDate(m.received_at)}</span>
                </div>
                <div class="nr-card-note">${escHtml(truncate(m.raw_body, 160))}</div>
            </div>
            <div class="nr-card-badges">
                <span class="badge nr-badge nr-badge--sms">SMS</span>
                ${categoryBadge}
                ${unknownBadge}
            </div>
        </div>
    `.trim();
}

/**
 * Builds the HTML string for a volunteer intake note card.
 * @param {{ id: number, first_name: string, last_name: string, notes: string, action_count: number, reads: Array }} v
 * @returns {string}
 */
function buildNoteCard(v) {
  const readByMe = v.reads.some((r) => r.read_by === actorId);
  const readCount = v.reads.length;
  const myActions = actions.filter((a) => a.volunteer_id === v.id);
  const pending = myActions.filter((a) => a.solution_found === null).length;

  const readBadge = readByMe
    ? '<span class="badge nr-badge nr-badge--read">Read by you</span>'
    : '<span class="badge nr-badge nr-badge--unread">Unread</span>';

  const readCountBadge =
    readCount > 0
      ? `<span class="badge nr-badge nr-badge--reads">${readCount} read${readCount !== 1 ? "s" : ""}</span>`
      : "";

  const actionBadge =
    myActions.length > 0
      ? `<span class="badge nr-badge nr-badge--action">${myActions.length} action${myActions.length !== 1 ? "s" : ""}</span>`
      : "";

  const pendingBadge =
    pending > 0
      ? `<span class="badge nr-badge nr-badge--pending">${pending} pending</span>`
      : "";

  return `
        <div class="nr-card"
             data-volunteer-id="${v.id}"
             role="button"
             tabindex="0"
             aria-label="View note for ${escHtml(v.first_name)} ${escHtml(v.last_name)}">
            <div class="nr-card-main">
                <div class="nr-card-name">${escHtml(v.first_name)} ${escHtml(v.last_name)}</div>
                <div class="nr-card-note">${escHtml(truncate(v.notes, 160))}</div>
            </div>
            <div class="nr-card-badges">
                ${readBadge}
                ${readCountBadge}
                ${actionBadge}
                ${pendingBadge}
            </div>
        </div>
    `.trim();
}

// ── Actionable panel ──────────────────────────────────────────────────────────

/**
 * Renders the Actionable panel from the current actions array and filter state.
 */
function renderActionable() {
  const filter = activeFilter.actionable;
  const search = activeSearch.actionable.toLowerCase();

  const rows = actions.filter((a) => {
    if (filter === "pending" && a.solution_found !== null) return false;
    if (filter === "solution-found" && a.solution_found !== true) return false;
    if (filter === "no-solution" && a.solution_found !== false) return false;
    if (search) {
      const haystack = `${a.volunteer_name} ${a.solution || ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const list = document.getElementById("actionableList");
  const empty = document.getElementById("actionableEmpty");
  const loading = document.getElementById("actionableLoading");

  loading.classList.add("d-none");

  if (rows.length === 0) {
    list.classList.add("d-none");
    empty.classList.remove("d-none");
    return;
  }

  empty.classList.add("d-none");
  list.classList.remove("d-none");
  list.innerHTML = rows.map((a) => buildActionCard(a)).join("");

  list.querySelectorAll(".nr-card[data-action-id]").forEach((card) => {
    const aid = parseInt(card.dataset.actionId, 10);
    card.addEventListener("click", () => onActionCardClick(aid, false));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActionCardClick(aid, false);
      }
    });
  });
}

/**
 * Builds the HTML for an action item card in the Actionable panel.
 * @param {{ id: number, volunteer_name: string, notes: string, solution_found: boolean|null, solution: string|null, completed: boolean|null }} a
 * @returns {string}
 */
function buildActionCard(a) {
  const solutionLine = a.solution
    ? `<div class="nr-card-solution"><i class="fa-solid fa-lightbulb me-1 text-success"></i>${escHtml(truncate(a.solution, 100))}</div>`
    : "";

  const completeBadge = a.completed
    ? '<span class="badge nr-badge nr-badge--complete">Completed</span>'
    : "";

  return `
        <div class="nr-card"
             data-action-id="${a.id}"
             role="button"
             tabindex="0"
             aria-label="View action for ${escHtml(a.volunteer_name)}">
            <div class="nr-card-main">
                <div class="nr-card-name">${escHtml(a.volunteer_name)}</div>
                <div class="nr-card-note">${escHtml(truncate(a.notes, 120))}</div>
                ${solutionLine}
            </div>
            <div class="nr-card-badges">
                ${buildStatusBadge(a)}
                ${completeBadge}
            </div>
        </div>
    `.trim();
}

// ── Solutions Summary panel ────────────────────────────────────────────────────

/**
 * Renders the Solutions Summary panel — only actions where solution_found = true.
 */
function renderSolutions() {
  const filter = activeFilter.solutions;
  const search = activeSearch.solutions.toLowerCase();

  const rows = actions.filter((a) => {
    if (a.solution_found !== true) return false;
    if (filter === "pending" && a.completed === true) return false;
    if (filter === "completed" && a.completed !== true) return false;
    if (search) {
      const haystack = `${a.volunteer_name} ${a.solution || ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const list = document.getElementById("solutionsList");
  const empty = document.getElementById("solutionsEmpty");
  const loading = document.getElementById("solutionsLoading");

  loading.classList.add("d-none");

  if (rows.length === 0) {
    list.classList.add("d-none");
    empty.classList.remove("d-none");
    return;
  }

  empty.classList.add("d-none");
  list.classList.remove("d-none");
  list.innerHTML = rows.map((a) => buildSolutionCard(a)).join("");

  list.querySelectorAll(".nr-card[data-action-id]").forEach((card) => {
    const aid = parseInt(card.dataset.actionId, 10);
    card.addEventListener("click", () => onActionCardClick(aid, false));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActionCardClick(aid, false);
      }
    });
  });
}

/**
 * Builds the HTML for a solution summary card.
 * @param {{ id: number, volunteer_name: string, solution: string|null, solution_founder: string|null, solution_found_at: string|null, completed: boolean|null, completer: string|null, completed_at: string|null }} a
 * @returns {string}
 */
function buildSolutionCard(a) {
  const solvedMeta = a.solution_founder
    ? `Found by ${escHtml(a.solution_founder)}${a.solution_found_at ? " &middot; " + fmtDate(a.solution_found_at) : ""}`
    : "";

  const completeMeta =
    a.completed && a.completer
      ? `Completed by ${escHtml(a.completer)}${a.completed_at ? " &middot; " + fmtDate(a.completed_at) : ""}`
      : "";

  const completeBadge = a.completed
    ? '<span class="badge nr-badge nr-badge--complete">Completed</span>'
    : '<span class="badge nr-badge nr-badge--pending">Pending completion</span>';

  return `
        <div class="nr-card${a.completed ? " nr-card--complete" : ""}"
             data-action-id="${a.id}"
             role="button"
             tabindex="0"
             aria-label="View solution for ${escHtml(a.volunteer_name)}">
            <div class="nr-card-main">
                <div class="nr-card-name">${escHtml(a.volunteer_name)}</div>
                ${a.solution ? `<div class="nr-card-solution"><i class="fa-solid fa-lightbulb me-1 text-success"></i>${escHtml(a.solution)}</div>` : ""}
                ${solvedMeta ? `<div class="nr-card-meta-text">${solvedMeta}</div>` : ""}
                ${completeMeta ? `<div class="nr-card-meta-text">${completeMeta}</div>` : ""}
            </div>
            <div class="nr-card-badges">${completeBadge}</div>
        </div>
    `.trim();
}

// ── Dismissed panel ───────────────────────────────────────────────────────────

/**
 * Renders the Dismissed panel from dismissed intake notes.
 * Only called after the tab is first clicked.
 */
function renderDismissed() {
  const search = activeSearch.dismissed.toLowerCase();

  const noteRows = dismissedVolunteers.filter((v) => {
    if (!search) return true;
    const haystack = `${v.first_name} ${v.last_name} ${v.notes}`.toLowerCase();
    return haystack.includes(search);
  });

  const smsRows = resolvedSmsMessages.filter((m) => {
    if (!search) return true;
    const haystack =
      `${m.first_name} ${m.last_name} ${m.raw_body}`.toLowerCase();
    return haystack.includes(search);
  });

  const list = document.getElementById("dismissedList");
  const empty = document.getElementById("dismissedEmpty");
  const loading = document.getElementById("dismissedLoading");

  loading.classList.add("d-none");

  if (noteRows.length === 0 && smsRows.length === 0) {
    list.classList.add("d-none");
    empty.classList.remove("d-none");
    return;
  }

  empty.classList.add("d-none");
  list.classList.remove("d-none");

  let html = "";

  if (noteRows.length > 0) {
    html += `<div class="nr-section-label"><i class="fa-solid fa-note-sticky me-1"></i>Dismissed Intake Notes</div>`;
    html += noteRows.map((v) => buildDismissedCard(v)).join("");
  }

  if (smsRows.length > 0) {
    html += `<div class="nr-section-label${noteRows.length > 0 ? " mt-3" : ""}"><i class="fa-solid fa-message me-1"></i>Resolved Messages</div>`;
    html += smsRows.map((m) => buildResolvedSmsCard(m)).join("");
  }

  list.innerHTML = html;

  list.querySelectorAll(".nr-card[data-dismissed-id]").forEach((card) => {
    const vid = parseInt(card.dataset.dismissedId, 10);
    card.addEventListener("click", () => onRestoreNote(vid));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onRestoreNote(vid);
      }
    });
  });
}

/**
 * Builds a read-only card for a resolved SMS message in the Archived panel.
 * @param {{ id: number, first_name: string, last_name: string, raw_body: string, received_at: string, ai_category: string|null }} m
 * @returns {string}
 */
function buildResolvedSmsCard(m) {
  const categoryBadge = m.ai_category
    ? `<span class="badge nr-badge nr-badge--sms-category">${escHtml(m.ai_category.replace(/_/g, " "))}</span>`
    : "";

  return `
        <div class="nr-card nr-card--sms nr-card--resolved">
            <div class="nr-card-main">
                <div class="nr-card-name">
                    <i class="fa-solid fa-message me-1"></i>
                    ${escHtml(m.first_name)} ${escHtml(m.last_name)}
                    <span class="nr-card-meta-inline">${fmtDate(m.received_at)}</span>
                </div>
                <div class="nr-card-note">${escHtml(truncate(m.raw_body, 160))}</div>
            </div>
            <div class="nr-card-badges">
                <span class="badge nr-badge nr-badge--read">Resolved</span>
                ${categoryBadge}
            </div>
        </div>
    `.trim();
}

/**
 * Builds a card for a dismissed intake note.
 * @param {{ id: number, first_name: string, last_name: string, notes: string, dismisser: string|null, note_dismissed_at: string|null }} v
 * @returns {string}
 */
function buildDismissedCard(v) {
  const meta = v.dismisser
    ? `Dismissed by ${escHtml(v.dismisser)}${v.note_dismissed_at ? " &middot; " + fmtDate(v.note_dismissed_at) : ""}`
    : "";

  return `
        <div class="nr-card nr-card--dismissed"
             data-dismissed-id="${v.id}"
             role="button"
             tabindex="0"
             title="Click to restore"
             aria-label="Restore note for ${escHtml(v.first_name)} ${escHtml(v.last_name)}">
            <div class="nr-card-main">
                <div class="nr-card-name">${escHtml(v.first_name)} ${escHtml(v.last_name)}</div>
                <div class="nr-card-note">${escHtml(truncate(v.notes, 160))}</div>
                ${meta ? `<div class="nr-card-meta-text">${meta}</div>` : ""}
            </div>
            <div class="nr-card-badges">
                <span class="badge nr-badge nr-badge--dismissed">Dismissed</span>
            </div>
        </div>
    `.trim();
}

/**
 * Restores a dismissed intake note.
 * Confirms with the user, then POSTs to the restore route and reloads.
 * @param {number} volunteerId
 * @returns {Promise<void>}
 */
async function onRestoreNote(volunteerId) {
  if (!confirm("Restore this note to the active list?")) return;
  try {
    const res = await fetch("/api/notes-report/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volunteerId }),
    });
    if (!res.ok) throw new Error("Server error");
    await reload();
  } catch (err) {
    console.error("[notesReport] onRestoreNote error:", err);
  }
}

// ── SMS Detail Modal ──────────────────────────────────────────────────────────

/**
 * Opens the SMS detail modal for a given message ID.
 * @param {number} smsId
 */
function onSmsCardClick(smsId) {
  openSmsId = smsId;
  populateSmsDetail(smsId);
  smsModal.show();
}

/**
 * Populates the SMS detail modal from in-memory state.
 * @param {number} smsId
 */
function populateSmsDetail(smsId) {
  const m = smsMessages.find((x) => x.id === smsId);
  if (!m) return;

  document.getElementById("smsDetailName").textContent =
    `${m.first_name} ${m.last_name}`;
  document.getElementById("smsDetailPhone").textContent = m.from_phone || "";
  document.getElementById("smsDetailReceivedAt").textContent = fmtDatetime(
    m.received_at,
  );
  document.getElementById("smsDetailBody").textContent = m.raw_body;

  const aiEl = document.getElementById("smsDetailAiContent");

  if (m.ai_error) {
    aiEl.innerHTML = `<div class="alert alert-warning py-2 small mb-0">
            <i class="fa-solid fa-triangle-exclamation me-1"></i>Analysis error: ${escHtml(m.ai_error)}
        </div>`;
    return;
  }

  if (!m.ai_summary && !m.ai_category) {
    aiEl.innerHTML =
      '<p class="text-muted small mb-0">No AI analysis available.</p>';
    return;
  }

  let actionItems = [];
  if (m.ai_action_items) {
    try {
      actionItems = JSON.parse(m.ai_action_items);
    } catch {
      /* ignore */
    }
  }

  const categoryBadge = m.ai_category
    ? `<span class="badge nr-ai-category-badge nr-ai-category--${escHtml(m.ai_category)}">${escHtml(m.ai_category.replace(/_/g, " "))}</span>`
    : "";

  const actionRows = actionItems
    .map((item) =>
      `
        <div class="nr-ai-suggestion-row">
            <span class="nr-ai-priority nr-ai-priority--${escHtml(item.priority || "medium")}">${escHtml(item.priority || "medium")}</span>
            <span class="nr-ai-suggestion-text">${escHtml(item.description)}</span>
        </div>
    `.trim(),
    )
    .join("");

  aiEl.innerHTML = `
        ${m.ai_summary ? `<div class="nr-ai-summary mb-2">${escHtml(m.ai_summary)}</div>` : ""}
        ${categoryBadge ? `<div class="nr-ai-badges mb-2">${categoryBadge}</div>` : ""}
        ${actionRows ? `<div class="nr-ai-subsection"><p class="nr-ai-sublabel">Suggested Actions</p>${actionRows}</div>` : ""}
    `.trim();
}

/**
 * Handles the Resolve button click in the SMS detail modal.
 * POSTs to the resolve route, hides modal, and reloads.
 * @returns {Promise<void>}
 */
async function onResolveSms() {
  if (!openSmsId) return;
  try {
    const res = await fetch(
      `/api/notes-report/sms-messages/${openSmsId}/resolve`,
      {
        method: "POST",
      },
    );
    if (!res.ok) throw new Error("Server error");
    smsModal.hide();
    await reload();
  } catch (err) {
    console.error("[notesReport] onResolveSms error:", err);
  }
}

// ── Note Detail Modal ─────────────────────────────────────────────────────────

/**
 * Handles a click on an intake note card.
 * Immediately shows the modal, fires the read POST, then reloads and refreshes.
 * @param {number} volunteerId
 * @returns {Promise<void>}
 */
async function onNoteCardClick(volunteerId) {
  openVolunteerId = volunteerId;
  populateNoteDetail(volunteerId);
  noteModal.show();

  await fireNoteRead(volunteerId);
  await reload();

  if (openVolunteerId === volunteerId) {
    populateNoteDetail(volunteerId);
  }
}

/**
 * Populates the note detail modal from in-memory state.
 * @param {number} volunteerId
 */
function populateNoteDetail(volunteerId) {
  const v = volunteers.find((x) => x.id === volunteerId);
  if (!v) return;

  document.getElementById("noteDetailName").textContent =
    `${v.first_name} ${v.last_name}`;
  document.getElementById("noteDetailText").textContent = v.notes;
  document.getElementById("noteDismissBtn").classList.remove("d-none");

  renderNoteReads(v.reads);

  const myActions = actions.filter((a) => a.volunteer_id === volunteerId);
  renderNoteActionList(myActions, volunteerId);

  const oldAnalyzeBtn = document.getElementById("noteDetailAnalyzeBtn");
  if (oldAnalyzeBtn) {
    const newAnalyzeBtn = oldAnalyzeBtn.cloneNode(true);
    oldAnalyzeBtn.parentNode.replaceChild(newAnalyzeBtn, oldAnalyzeBtn);
    newAnalyzeBtn.addEventListener("click", () => triggerAnalysis(volunteerId));
  }

  renderAiSection(volunteerId);

  if (!analyses.has(volunteerId)) {
    loadAnalysis(volunteerId).then(() => {
      if (openVolunteerId === volunteerId) renderAiSection(volunteerId);
    });
  }
}

/**
 * Renders the read-by chip list inside the note detail modal.
 * @param {Array<{ read_by: number, reader_name: string, read_at: string }>} reads
 */
function renderNoteReads(reads) {
  const el = document.getElementById("noteDetailReads");

  if (!reads || reads.length === 0) {
    el.innerHTML =
      '<span class="text-muted small">Not yet read by anyone.</span>';
    return;
  }

  el.innerHTML = reads
    .map((r) => {
      const isMe = r.read_by === actorId;
      return `
            <span class="nr-read-chip${isMe ? " nr-read-chip--me" : ""}">
                <i class="fa-solid fa-eye me-1"></i>
                ${escHtml(r.reader_name)}${isMe ? " (you)" : ""}
                <span class="nr-read-date">${fmtDate(r.read_at)}</span>
            </span>
        `.trim();
    })
    .join("");
}

/**
 * Renders the action item list inside the note detail modal.
 * Re-clones the create button each time to avoid stacked listeners.
 * @param {Array} myActions  - Actions filtered to the current volunteer.
 * @param {number} volunteerId
 */
function renderNoteActionList(myActions, volunteerId) {
  const el = document.getElementById("noteDetailActions");
  const oldBtn = document.getElementById("noteDetailCreateActionBtn");
  const newBtn = oldBtn.cloneNode(true);
  oldBtn.parentNode.replaceChild(newBtn, oldBtn);
  newBtn.addEventListener("click", () => onCreateAction(volunteerId));

  if (myActions.length === 0) {
    el.innerHTML = '<p class="text-muted small mb-2">No action items yet.</p>';
    return;
  }

  el.innerHTML = myActions
    .map((a) =>
      `
        <div class="nr-inline-action"
             data-action-id="${a.id}"
             role="button"
             tabindex="0">
            ${buildStatusBadge(a)}
            ${a.completed ? '<span class="badge nr-badge nr-badge--complete">Completed</span>' : ""}
            <span class="nr-inline-action-label">
                ${a.solution ? escHtml(truncate(a.solution, 80)) : '<em class="text-muted">No solution yet</em>'}
            </span>
            <span class="nr-inline-action-meta">
                Created ${fmtDate(a.created_at)} by ${escHtml(a.creator)}
            </span>
        </div>
    `.trim(),
    )
    .join("");

  el.querySelectorAll(".nr-inline-action[data-action-id]").forEach((row) => {
    const aid = parseInt(row.dataset.actionId, 10);
    row.addEventListener("click", () => onActionCardClick(aid, true));
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActionCardClick(aid, true);
      }
    });
  });
}

/**
 * POSTs to record the current overseer reading a volunteer's note. Non-fatal.
 * @param {number} volunteerId
 * @returns {Promise<void>}
 */
async function fireNoteRead(volunteerId) {
  try {
    await fetch("/api/notes-report/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volunteerId }),
    });
  } catch {
    /* Best-effort */
  }
}

/**
 * Handles the Dismiss button in the note detail modal.
 * POSTs to the dismiss route; surfaces 409 conflicts as an alert.
 * @returns {Promise<void>}
 */
async function onDismissNote() {
  if (!openVolunteerId) return;
  try {
    const res = await fetch("/api/notes-report/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volunteerId: openVolunteerId }),
    });
    if (res.status === 409) {
      const data = await res.json();
      alert(data.error || "Cannot dismiss this note.");
      return;
    }
    if (!res.ok) throw new Error("Server error");
    noteModal.hide();
    await reload();
  } catch (err) {
    console.error("[notesReport] onDismissNote error:", err);
  }
}

// ── Action Detail Modal ────────────────────────────────────────────────────────

/**
 * Opens the action detail modal for a given action ID.
 * @param {number} actionId
 * @param {boolean} fromNote - Whether triggered from noteDetailModal.
 */
function onActionCardClick(actionId, fromNote) {
  openActionId = actionId;
  actionOpenedFromNote = fromNote;

  if (fromNote) noteModal.hide();

  populateActionDetail(actionId);
  actionModal.show();
}

/**
 * Populates the action detail modal from in-memory state.
 * @param {number} actionId
 */
function populateActionDetail(actionId) {
  const a = actions.find((x) => x.id === actionId);
  if (!a) return;

  document.getElementById("actionDetailId").value = actionId;
  document.getElementById("actionDetailVolunteerName").textContent =
    a.volunteer_name;
  document.getElementById("actionDetailNote").textContent = a.notes || "";
  document.getElementById("actionSolutionText").value = a.solution || "";

  setSolutionButtonState(a.solution_found);

  document
    .getElementById("solutionTextWrap")
    .classList.toggle("d-none", a.solution_found !== true);
  document
    .getElementById("actionCompleteBtn")
    .classList.toggle("d-none", !(a.solution_found === true && !a.completed));

  renderActionMeta(a);

  const errEl = document.getElementById("actionDetailError");
  errEl.classList.add("d-none");
  errEl.textContent = "";
}

/**
 * Renders the meta block in the action detail modal.
 * @param {{ creator: string, created_at: string, solution_founder: string|null, solution_found_at: string|null, completer: string|null, completed_at: string|null }} a
 */
function renderActionMeta(a) {
  const el = document.getElementById("actionDetailMeta");
  const lines = [];

  if (a.creator)
    lines.push(
      `Created by <strong>${escHtml(a.creator)}</strong> &middot; ${fmtDate(a.created_at)}`,
    );
  if (a.solution_founder)
    lines.push(
      `Solution by <strong>${escHtml(a.solution_founder)}</strong> &middot; ${fmtDate(a.solution_found_at)}`,
    );
  if (a.completer)
    lines.push(
      `Completed by <strong>${escHtml(a.completer)}</strong> &middot; ${fmtDate(a.completed_at)}`,
    );

  el.innerHTML = lines
    .map((l) => `<div class="nr-meta-line">${l}</div>`)
    .join("");
}

/**
 * Updates the visual active state of the solution_found toggle buttons.
 * @param {boolean|null} solutionFound
 */
function setSolutionButtonState(solutionFound) {
  document
    .getElementById("btnSolutionYes")
    .classList.toggle("active", solutionFound === true);
  document
    .getElementById("btnSolutionNo")
    .classList.toggle("active", solutionFound === false);
  document
    .getElementById("btnSolutionClear")
    .classList.toggle("active", solutionFound === null);
}

/**
 * Handles the Save button in the action detail modal.
 * @returns {Promise<void>}
 */
async function onSaveAction() {
  const actionId = parseInt(
    document.getElementById("actionDetailId").value,
    10,
  );
  if (!actionId) return;

  const btnYes = document.getElementById("btnSolutionYes");
  const btnNo = document.getElementById("btnSolutionNo");

  let solutionFound = null;
  if (btnYes.classList.contains("active")) solutionFound = true;
  if (btnNo.classList.contains("active")) solutionFound = false;

  const solution =
    solutionFound === true
      ? document.getElementById("actionSolutionText").value.trim() || null
      : null;

  const errEl = document.getElementById("actionDetailError");
  errEl.classList.add("d-none");

  try {
    const res = await fetch(`/api/notes-report/actions/${actionId}/solution`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ solutionFound, solution }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errEl.textContent = data.error || "Failed to save. Please try again.";
      errEl.classList.remove("d-none");
      return;
    }

    await reload();
    populateActionDetail(actionId);
  } catch {
    errEl.textContent = "Network error. Please try again.";
    errEl.classList.remove("d-none");
  }
}

/**
 * Handles the Mark Complete button in the action detail modal.
 * @returns {Promise<void>}
 */
async function onCompleteAction() {
  const actionId = parseInt(
    document.getElementById("actionDetailId").value,
    10,
  );
  if (!actionId) return;

  const errEl = document.getElementById("actionDetailError");
  errEl.classList.add("d-none");

  try {
    const res = await fetch(`/api/notes-report/actions/${actionId}/complete`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errEl.textContent = data.error || "Failed to complete. Please try again.";
      errEl.classList.remove("d-none");
      return;
    }

    await reload();
    populateActionDetail(actionId);
  } catch {
    errEl.textContent = "Network error. Please try again.";
    errEl.classList.remove("d-none");
  }
}

/**
 * Handles the Delete button in the action detail modal.
 * @returns {Promise<void>}
 */
async function onDeleteAction() {
  const actionId = parseInt(
    document.getElementById("actionDetailId").value,
    10,
  );
  if (!actionId) return;

  if (!confirm("Delete this action item? This cannot be undone.")) return;

  const errEl = document.getElementById("actionDetailError");
  errEl.classList.add("d-none");

  try {
    const res = await fetch(`/api/notes-report/actions/${actionId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errEl.textContent = data.error || "Failed to delete. Please try again.";
      errEl.classList.remove("d-none");
      return;
    }

    actionModal.hide();
    await reload();
  } catch {
    errEl.textContent = "Network error. Please try again.";
    errEl.classList.remove("d-none");
  }
}

/**
 * Handles the Create Action Item button inside the note detail modal.
 * @param {number} volunteerId
 * @returns {Promise<void>}
 */
async function onCreateAction(volunteerId) {
  try {
    const res = await fetch("/api/notes-report/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volunteerId }),
    });

    if (!res.ok) return;

    await reload();
    populateNoteDetail(volunteerId);
  } catch {
    /* Non-fatal */
  }
}

// ── Event wiring ──────────────────────────────────────────────────────────────

/**
 * Wires all static event listeners across all panels and modals.
 */
function wireEvents() {
  // Search inputs
  document.getElementById("searchAllNotes").addEventListener("input", (e) => {
    activeSearch.allNotes = e.target.value;
    renderAllNotes();
  });
  document.getElementById("searchActionable").addEventListener("input", (e) => {
    activeSearch.actionable = e.target.value;
    renderActionable();
  });
  document.getElementById("searchSolutions").addEventListener("input", (e) => {
    activeSearch.solutions = e.target.value;
    renderSolutions();
  });
  document.getElementById("searchDismissed").addEventListener("input", (e) => {
    activeSearch.dismissed = e.target.value;
    if (dismissedLoaded) renderDismissed();
  });

  // Filter pills — All Notes
  document.getElementById("filterAllNotes").addEventListener("click", (e) => {
    const pill = e.target.closest("[data-filter]");
    if (!pill) return;
    activeFilter.allNotes = pill.dataset.filter;
    setActivePill(document.getElementById("filterAllNotes"), pill);
    renderAllNotes();
  });

  // Filter pills — Actionable
  document.getElementById("filterActionable").addEventListener("click", (e) => {
    const pill = e.target.closest("[data-filter]");
    if (!pill) return;
    activeFilter.actionable = pill.dataset.filter;
    setActivePill(document.getElementById("filterActionable"), pill);
    renderActionable();
  });

  // Filter pills — Solutions
  document.getElementById("filterSolutions").addEventListener("click", (e) => {
    const pill = e.target.closest("[data-filter]");
    if (!pill) return;
    activeFilter.solutions = pill.dataset.filter;
    setActivePill(document.getElementById("filterSolutions"), pill);
    renderSolutions();
  });

  // Dismissed tab — lazy-load on first click
  document
    .getElementById("tab-dismissed")
    .addEventListener("click", async () => {
      if (dismissedLoaded) return;
      dismissedLoaded = true;
      await loadDismissed();
      renderDismissed();
      updateBadges();
    });

  // Analyze All batch button (ASSISTANT_ADMIN+ only)
  const analyzeAllBtn = document.getElementById("analyzeAllBtn");
  if (analyzeAllBtn) analyzeAllBtn.addEventListener("click", onBatchAnalyze);

  // Note detail modal — clear state on hide
  document
    .getElementById("noteDetailModal")
    .addEventListener("hidden.bs.modal", () => {
      openVolunteerId = null;
    });

  // SMS detail modal — clear state on hide
  document
    .getElementById("smsDetailModal")
    .addEventListener("hidden.bs.modal", () => {
      openSmsId = null;
    });

  // Action detail modal — re-open note detail if triggered from there
  document
    .getElementById("actionDetailModal")
    .addEventListener("hidden.bs.modal", async () => {
      if (actionOpenedFromNote && openVolunteerId !== null) {
        await reload();
        populateNoteDetail(openVolunteerId);
        noteModal.show();
      }
      openActionId = null;
      actionOpenedFromNote = false;
    });

  // Solution toggle buttons
  document.getElementById("btnSolutionYes").addEventListener("click", () => {
    setSolutionButtonState(true);
    document.getElementById("solutionTextWrap").classList.remove("d-none");
    document.getElementById("actionCompleteBtn").classList.add("d-none");
  });
  document.getElementById("btnSolutionNo").addEventListener("click", () => {
    setSolutionButtonState(false);
    document.getElementById("solutionTextWrap").classList.add("d-none");
    document.getElementById("actionCompleteBtn").classList.add("d-none");
  });
  document.getElementById("btnSolutionClear").addEventListener("click", () => {
    setSolutionButtonState(null);
    document.getElementById("solutionTextWrap").classList.add("d-none");
    document.getElementById("actionCompleteBtn").classList.add("d-none");
  });

  // Action and note modal buttons
  document
    .getElementById("actionSaveBtn")
    .addEventListener("click", onSaveAction);
  document
    .getElementById("actionCompleteBtn")
    .addEventListener("click", onCompleteAction);
  document
    .getElementById("actionDeleteBtn")
    .addEventListener("click", onDeleteAction);
  document
    .getElementById("noteDismissBtn")
    .addEventListener("click", onDismissNote);
  document
    .getElementById("smsResolveBtn")
    .addEventListener("click", onResolveSms);
}

// ── AI Analysis ───────────────────────────────────────────────────────────────

/**
 * Fetches the most recent AI analysis for a volunteer and caches it.
 * @param {number} volunteerId
 * @returns {Promise<void>}
 */
async function loadAnalysis(volunteerId) {
  try {
    const res = await fetch(`/api/notes/analysis/${volunteerId}`);
    if (!res.ok) return;
    const data = await res.json();
    analyses.set(volunteerId, data.data ?? null);
  } catch {
    /* Non-fatal */
  }
}

/**
 * POSTs to trigger an on-demand AI analysis for a volunteer.
 * @param {number} volunteerId
 * @returns {Promise<void>}
 */
async function triggerAnalysis(volunteerId) {
  analyzingId = volunteerId;
  if (openVolunteerId === volunteerId) renderAiSection(volunteerId);

  try {
    const res = await fetch(`/api/notes/analyze/${volunteerId}`, {
      method: "POST",
    });
    if (res.ok) {
      const data = await res.json();
      analyses.set(volunteerId, data.data ?? null);
    } else {
      const data = await res.json().catch(() => ({}));
      analyses.set(volunteerId, {
        error: data.message || "Analysis request failed.",
      });
    }
  } catch {
    analyses.set(volunteerId, { error: "Network error during analysis." });
  } finally {
    analyzingId = null;
    if (openVolunteerId === volunteerId) renderAiSection(volunteerId);
  }
}

/**
 * Renders the AI analysis section inside the note detail modal.
 * @param {number} volunteerId
 */
function renderAiSection(volunteerId) {
  const content = document.getElementById("noteDetailAiContent");
  const analyzeBtn = document.getElementById("noteDetailAnalyzeBtn");
  if (!content) return;

  const analysis = analyses.get(volunteerId);
  const isLoading = analyzingId === volunteerId;

  if (analyzeBtn) {
    analyzeBtn.disabled = isLoading;
    analyzeBtn.innerHTML = isLoading
      ? '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Analyzing…'
      : '<i class="fa-solid fa-wand-magic-sparkles me-1"></i>Analyze';
  }

  if (isLoading) {
    content.innerHTML =
      '<div class="nr-ai-loading"><span class="spinner-border spinner-border-sm text-secondary me-2" role="status"></span>Running analysis…</div>';
    return;
  }

  if (!analyses.has(volunteerId) || !analysis) {
    content.innerHTML =
      '<p class="text-muted small mb-0">Click Analyze to run AI analysis on this note.</p>';
    return;
  }

  if (analysis.error) {
    content.innerHTML = `<div class="alert alert-danger py-2 small mb-0"><i class="fa-solid fa-triangle-exclamation me-1"></i>${escHtml(analysis.error)}</div>`;
    return;
  }

  const staleWarning = analysis.isStale
    ? '<div class="nr-ai-stale"><i class="fa-solid fa-rotate me-1"></i>Note has changed since this analysis was run.</div>'
    : "";

  const categoryBadge = analysis.category
    ? `<span class="badge nr-ai-category-badge nr-ai-category--${escHtml(analysis.category)}">${escHtml(analysis.category.replace(/_/g, " "))}</span>`
    : "";

  const flagChips = (analysis.flags || [])
    .filter((f) => f !== "no_action_needed")
    .map(
      (f) => `<span class="nr-ai-flag">${escHtml(f.replace(/_/g, " "))}</span>`,
    )
    .join("");

  const actionRows = (analysis.action_items || [])
    .map((item) =>
      `
        <div class="nr-ai-suggestion-row">
            <span class="nr-ai-priority nr-ai-priority--${escHtml(item.priority || "medium")}">${escHtml(item.priority || "medium")}</span>
            <span class="nr-ai-suggestion-text">${escHtml(item.description)}</span>
            <button
                type="button"
                class="nr-ai-accept-btn"
                data-analysis-id="${analysis.id}"
                data-volunteer-id="${volunteerId}"
                data-description="${escHtml(item.description)}"
            ><i class="fa-solid fa-plus me-1"></i>Add Action</button>
        </div>
    `.trim(),
    )
    .join("");

  const blackoutRows = (analysis.suggested_blackouts || [])
    .map((b) =>
      `
        <div class="nr-ai-blackout-row">
            <span class="nr-ai-blackout-type">${escHtml(b.type)}</span>
            <span class="nr-ai-blackout-desc">${escHtml(b.description)}</span>
            ${b.dayHint ? `<span class="nr-ai-blackout-hint">${escHtml(b.dayHint)}</span>` : ""}
            ${b.timeHint ? `<span class="nr-ai-blackout-hint">${escHtml(b.timeHint)}</span>` : ""}
        </div>
    `.trim(),
    )
    .join("");

  const tokenCount =
    (analysis.prompt_tokens || 0) + (analysis.completion_tokens || 0);
  const meta = `<div class="nr-ai-meta">Analyzed ${fmtDate(analysis.analyzed_at)} by ${escHtml(analysis.analyzer_name || "—")} &middot; ${escHtml(analysis.model || "—")} &middot; ${tokenCount} tokens</div>`;

  content.innerHTML = `
        ${staleWarning}
        ${analysis.summary ? `<div class="nr-ai-summary">${escHtml(analysis.summary)}</div>` : ""}
        ${categoryBadge || flagChips ? `<div class="nr-ai-badges">${categoryBadge}${flagChips}</div>` : ""}
        ${actionRows ? `<div class="nr-ai-subsection"><p class="nr-ai-sublabel">Suggested Actions</p>${actionRows}</div>` : ""}
        ${blackoutRows ? `<div class="nr-ai-subsection"><p class="nr-ai-sublabel">Suggested Blackouts</p>${blackoutRows}</div>` : ""}
        ${meta}
    `.trim();

  content.querySelectorAll(".nr-ai-accept-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      onAcceptActionItem(
        parseInt(btn.dataset.analysisId, 10),
        parseInt(btn.dataset.volunteerId, 10),
        btn.dataset.description,
      );
    });
  });
}

/**
 * Accepts an AI-suggested action item and saves it to volunteer_actions.
 * @param {number} analysisId
 * @param {number} volunteerId
 * @param {string} description
 * @returns {Promise<void>}
 */
async function onAcceptActionItem(analysisId, volunteerId, description) {
  try {
    const res = await fetch(`/api/notes/analysis/${analysisId}/accept-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volunteerId, description }),
    });
    if (!res.ok) return;
    await reload();
    if (openVolunteerId === volunteerId) populateNoteDetail(volunteerId);
  } catch {
    /* Non-fatal */
  }
}

/**
 * Triggers a batch AI analysis run. Clears local cache on completion.
 * @returns {Promise<void>}
 */
async function onBatchAnalyze() {
  const btn = document.getElementById("analyzeAllBtn");
  if (!btn || batchAnalyzing) return;

  batchAnalyzing = true;
  btn.disabled = true;
  btn.innerHTML =
    '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Analyzing…';

  try {
    const res = await fetch("/api/notes/analyze/batch", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      const { analyzed = 0, failed = 0, total = 0 } = data.data || {};
      btn.title = `Last run: ${analyzed} analyzed, ${failed} failed of ${total} total`;
      analyses.clear();
    }
  } catch {
    /* Non-fatal */
  } finally {
    batchAnalyzing = false;
    btn.disabled = false;
    btn.innerHTML =
      '<i class="fa-solid fa-wand-magic-sparkles me-1"></i>Analyze All';
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Returns the status badge HTML for an action item.
 * @param {{ solution_found: boolean|null }} a
 * @returns {string}
 */
function buildStatusBadge(a) {
  if (a.solution_found === true)
    return '<span class="badge nr-badge nr-badge--solution-found">Solution found</span>';
  if (a.solution_found === false)
    return '<span class="badge nr-badge nr-badge--no-solution">No solution</span>';
  return '<span class="badge nr-badge nr-badge--pending">Needs review</span>';
}

/**
 * Sets the active pill in a group and deactivates all others.
 * @param {HTMLElement} container
 * @param {HTMLElement} activePill
 */
function setActivePill(container, activePill) {
  container
    .querySelectorAll(".nr-pill")
    .forEach((p) => p.classList.remove("nr-pill--active"));
  activePill.classList.add("nr-pill--active");
}

/**
 * Escapes a string for safe HTML text insertion.
 * @param {string|null|undefined} str
 * @returns {string}
 */
function escHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Truncates a string to a maximum length, appending an ellipsis if trimmed.
 * @param {string|null|undefined} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(str, maxLen) {
  if (!str) return "";
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
}

/**
 * Formats an ISO datetime string to a short local date (e.g. Jun 26, 2026).
 * @param {string|null|undefined} iso
 * @returns {string}
 */
function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Formats an ISO datetime string to date + time (e.g. Jun 26, 2026 3:14 PM).
 * @param {string|null|undefined} iso
 * @returns {string}
 */
function fmtDatetime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
