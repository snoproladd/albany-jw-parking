/**
 * @file notesReport.js
 * @description Client-side controller for the Notes Report page.
 *
 * Three panels — All Notes, Actionable, Solutions Summary — are backed by
 * the /api/notes-report/* endpoints. All data is fetched on load and
 * refreshed after every mutation; panels re-render from in-memory state.
 *
 * Modals:
 *   noteDetailModal   — full note text, read history, linked action items.
 *   actionDetailModal — solution status, solution text, complete/delete.
 */

// ── State ─────────────────────────────────────────────────────────────────────

/**
 * Volunteers with notes, reads, and action counts from
 * GET /api/notes-report/volunteers.
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

/** Signed-in overseer's volunteer ID. @type {number} */
let actorId = 0;

/** Volunteer ID whose note detail modal is currently open. @type {number|null} */
let openVolunteerId = null;

/** Action ID whose detail modal is currently open. @type {number|null} */
let openActionId = null;

/** True when actionDetailModal was opened from within noteDetailModal. @type {boolean} */
let actionOpenedFromNote = false;

/** Active filter key per panel. @type {{ allNotes: string, actionable: string, solutions: string }} */
const activeFilter = { allNotes: 'all', actionable: 'all', solutions: 'all' };

/** Active search string per panel. @type {{ allNotes: string, actionable: string, solutions: string }} */
const activeSearch = { allNotes: '', actionable: '', solutions: '' };

// ── Bootstrap modal instances ─────────────────────────────────────────────────

/** @type {InstanceType<typeof bootstrap.Modal>|null} */
let noteModal = null;

/** @type {InstanceType<typeof bootstrap.Modal>|null} */
let actionModal = null;

// ── Entry point ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);

/**
 * Bootstraps the page: reads actor context, instantiates modals, wires events,
 * then fetches and renders all data.
 * @returns {Promise<void>}
 */
async function init() {
    const root = document.getElementById('notesReportRoot');
    actorId = parseInt(root.dataset.actorId, 10) || 0;

    noteModal   = new bootstrap.Modal(document.getElementById('noteDetailModal'));
    actionModal = new bootstrap.Modal(document.getElementById('actionDetailModal'));

    wireEvents();
    await loadData();
    renderAll();
}

// ── Data loading ──────────────────────────────────────────────────────────────

/**
 * Fetches volunteers and actions in parallel and updates module-level state.
 * Silently sets arrays to empty on network/server error.
 * @returns {Promise<void>}
 */
async function loadData() {
    const [vRes, aRes] = await Promise.all([
        fetch('/api/notes-report/volunteers'),
        fetch('/api/notes-report/actions'),
    ]);

    if (vRes.ok) {
        const data = await vRes.json();
        volunteers = data.volunteers || [];
    } else {
        volunteers = [];
    }

    if (aRes.ok) {
        const data = await aRes.json();
        actions = data.actions || [];
    } else {
        actions = [];
    }
}

/**
 * Reloads data from the server and re-renders all panels and badges.
 * @returns {Promise<void>}
 */
async function reload() {
    await loadData();
    renderAll();
}

// ── Render orchestration ──────────────────────────────────────────────────────

/**
 * Renders all three panels and updates tab badges.
 * Called on initial load and after any mutation.
 */
function renderAll() {
    renderAllNotes();
    renderActionable();
    renderSolutions();
    updateBadges();
}

/**
 * Updates the numeric count badge on each tab button.
 */
function updateBadges() {
    setBadge('badge-all-notes', volunteers.length);
    setBadge('badge-actionable', actions.length);
    setBadge('badge-solutions', actions.filter(a => a.solution_found === true).length);
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
        el.classList.remove('d-none');
    } else {
        el.classList.add('d-none');
    }
}

// ── All Notes panel ───────────────────────────────────────────────────────────

/**
 * Renders the All Notes panel from current filter and search state.
 * Hides the loading spinner and shows the list or empty state as appropriate.
 */
function renderAllNotes() {
    const filter = activeFilter.allNotes;
    const search = activeSearch.allNotes.toLowerCase();

    const rows = volunteers.filter(v => {
        if (filter === 'unread') {
            if (v.reads.some(r => r.read_by === actorId)) return false;
        }
        if (filter === 'no-action') {
            if (v.action_count > 0) return false;
        }
        if (search) {
            const haystack = `${v.first_name} ${v.last_name} ${v.notes}`.toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });

    const list    = document.getElementById('allNotesList');
    const empty   = document.getElementById('allNotesEmpty');
    const loading = document.getElementById('allNotesLoading');

    loading.classList.add('d-none');

    if (rows.length === 0) {
        list.classList.add('d-none');
        empty.classList.remove('d-none');
        return;
    }

    empty.classList.add('d-none');
    list.classList.remove('d-none');
    list.innerHTML = rows.map(v => buildNoteCard(v)).join('');

    list.querySelectorAll('.nr-card[data-volunteer-id]').forEach(card => {
        const vid = parseInt(card.dataset.volunteerId, 10);
        card.addEventListener('click', () => onNoteCardClick(vid));
        card.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onNoteCardClick(vid);
            }
        });
    });
}

/**
 * Builds the HTML string for a volunteer note card in the All Notes panel.
 * @param {{ id: number, first_name: string, last_name: string, notes: string, action_count: number, reads: Array }} v
 * @returns {string}
 */
function buildNoteCard(v) {
    const readByMe  = v.reads.some(r => r.read_by === actorId);
    const readCount = v.reads.length;
    const myActions = actions.filter(a => a.volunteer_id === v.id);
    const pending   = myActions.filter(a => a.solution_found === null).length;

    const readBadge = readByMe
        ? '<span class="badge nr-badge nr-badge--read">Read by you</span>'
        : '<span class="badge nr-badge nr-badge--unread">Unread</span>';

    const readCountBadge = readCount > 0
        ? `<span class="badge nr-badge nr-badge--reads">${readCount} read${readCount !== 1 ? 's' : ''}</span>`
        : '';

    const actionBadge = myActions.length > 0
        ? `<span class="badge nr-badge nr-badge--action">${myActions.length} action${myActions.length !== 1 ? 's' : ''}</span>`
        : '';

    const pendingBadge = pending > 0
        ? `<span class="badge nr-badge nr-badge--pending">${pending} pending</span>`
        : '';

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

    const rows = actions.filter(a => {
        if (filter === 'pending'        && a.solution_found !== null)  return false;
        if (filter === 'solution-found' && a.solution_found !== true)  return false;
        if (filter === 'no-solution'    && a.solution_found !== false) return false;
        if (search) {
            const haystack = `${a.volunteer_name} ${a.solution || ''}`.toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });

    const list    = document.getElementById('actionableList');
    const empty   = document.getElementById('actionableEmpty');
    const loading = document.getElementById('actionableLoading');

    loading.classList.add('d-none');

    if (rows.length === 0) {
        list.classList.add('d-none');
        empty.classList.remove('d-none');
        return;
    }

    empty.classList.add('d-none');
    list.classList.remove('d-none');
    list.innerHTML = rows.map(a => buildActionCard(a)).join('');

    list.querySelectorAll('.nr-card[data-action-id]').forEach(card => {
        const aid = parseInt(card.dataset.actionId, 10);
        card.addEventListener('click', () => onActionCardClick(aid, false));
        card.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
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
        : '';

    const completeBadge = a.completed
        ? '<span class="badge nr-badge nr-badge--complete">Completed</span>'
        : '';

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

    const rows = actions.filter(a => {
        if (a.solution_found !== true) return false;
        if (filter === 'pending'   && a.completed === true) return false;
        if (filter === 'completed' && a.completed !== true) return false;
        if (search) {
            const haystack = `${a.volunteer_name} ${a.solution || ''}`.toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });

    const list    = document.getElementById('solutionsList');
    const empty   = document.getElementById('solutionsEmpty');
    const loading = document.getElementById('solutionsLoading');

    loading.classList.add('d-none');

    if (rows.length === 0) {
        list.classList.add('d-none');
        empty.classList.remove('d-none');
        return;
    }

    empty.classList.add('d-none');
    list.classList.remove('d-none');
    list.innerHTML = rows.map(a => buildSolutionCard(a)).join('');

    list.querySelectorAll('.nr-card[data-action-id]').forEach(card => {
        const aid = parseInt(card.dataset.actionId, 10);
        card.addEventListener('click', () => onActionCardClick(aid, false));
        card.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
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
        ? `Found by ${escHtml(a.solution_founder)}${a.solution_found_at ? ' &middot; ' + fmtDate(a.solution_found_at) : ''}`
        : '';

    const completeMeta = a.completed && a.completer
        ? `Completed by ${escHtml(a.completer)}${a.completed_at ? ' &middot; ' + fmtDate(a.completed_at) : ''}`
        : '';

    const completeBadge = a.completed
        ? '<span class="badge nr-badge nr-badge--complete">Completed</span>'
        : '<span class="badge nr-badge nr-badge--pending">Pending completion</span>';

    return `
        <div class="nr-card${a.completed ? ' nr-card--complete' : ''}"
             data-action-id="${a.id}"
             role="button"
             tabindex="0"
             aria-label="View solution for ${escHtml(a.volunteer_name)}">
            <div class="nr-card-main">
                <div class="nr-card-name">${escHtml(a.volunteer_name)}</div>
                ${a.solution ? `<div class="nr-card-solution"><i class="fa-solid fa-lightbulb me-1 text-success"></i>${escHtml(a.solution)}</div>` : ''}
                ${solvedMeta   ? `<div class="nr-card-meta-text">${solvedMeta}</div>`   : ''}
                ${completeMeta ? `<div class="nr-card-meta-text">${completeMeta}</div>` : ''}
            </div>
            <div class="nr-card-badges">
                ${completeBadge}
            </div>
        </div>
    `.trim();
}

// ── Note Detail Modal ─────────────────────────────────────────────────────────

/**
 * Handles a click on a volunteer note card.
 * Immediately shows the modal with current data, fires the read POST in the
 * background, then reloads and refreshes the modal once the read is recorded.
 * @param {number} volunteerId
 * @returns {Promise<void>}
 */
async function onNoteCardClick(volunteerId) {
    openVolunteerId = volunteerId;
    populateNoteDetail(volunteerId);
    noteModal.show();

    await fireNoteRead(volunteerId);
    await reload();

    // Only refresh if the user hasn't moved to a different note or closed the modal
    if (openVolunteerId === volunteerId) {
        populateNoteDetail(volunteerId);
    }
}

/**
 * Populates the note detail modal from in-memory state.
 * @param {number} volunteerId
 */
function populateNoteDetail(volunteerId) {
    const v = volunteers.find(x => x.id === volunteerId);
    if (!v) return;

    document.getElementById('noteDetailName').textContent = `${v.first_name} ${v.last_name}`;
    document.getElementById('noteDetailText').textContent = v.notes;

    renderNoteReads(v.reads);

    const myActions = actions.filter(a => a.volunteer_id === volunteerId);
    renderNoteActionList(myActions, volunteerId);
}

/**
 * Renders the read-by chip list inside the note detail modal.
 * @param {Array<{ read_by: number, reader_name: string, read_at: string }>} reads
 */
function renderNoteReads(reads) {
    const el = document.getElementById('noteDetailReads');

    if (!reads || reads.length === 0) {
        el.innerHTML = '<span class="text-muted small">Not yet read by anyone.</span>';
        return;
    }

    el.innerHTML = reads.map(r => {
        const isMe = r.read_by === actorId;
        return `
            <span class="nr-read-chip${isMe ? ' nr-read-chip--me' : ''}">
                <i class="fa-solid fa-eye me-1"></i>
                ${escHtml(r.reader_name)}${isMe ? ' (you)' : ''}
                <span class="nr-read-date">${fmtDate(r.read_at)}</span>
            </span>
        `.trim();
    }).join('');
}

/**
 * Renders the action item list inside the note detail modal.
 * Re-clones the create button each time to avoid stacked event listeners.
 * @param {Array} myActions  - Actions filtered to the current volunteer.
 * @param {number} volunteerId
 */
function renderNoteActionList(myActions, volunteerId) {
    const el     = document.getElementById('noteDetailActions');
    const oldBtn = document.getElementById('noteDetailCreateActionBtn');
    const newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);
    newBtn.addEventListener('click', () => onCreateAction(volunteerId));

    if (myActions.length === 0) {
        el.innerHTML = '<p class="text-muted small mb-2">No action items yet.</p>';
        return;
    }

    el.innerHTML = myActions.map(a => `
        <div class="nr-inline-action"
             data-action-id="${a.id}"
             role="button"
             tabindex="0">
            ${buildStatusBadge(a)}
            ${a.completed ? '<span class="badge nr-badge nr-badge--complete">Completed</span>' : ''}
            <span class="nr-inline-action-label">
                ${a.solution ? escHtml(truncate(a.solution, 80)) : '<em class="text-muted">No solution yet</em>'}
            </span>
            <span class="nr-inline-action-meta">
                Created ${fmtDate(a.created_at)} by ${escHtml(a.creator)}
            </span>
        </div>
    `.trim()).join('');

    el.querySelectorAll('.nr-inline-action[data-action-id]').forEach(row => {
        const aid = parseInt(row.dataset.actionId, 10);
        row.addEventListener('click', () => onActionCardClick(aid, true));
        row.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onActionCardClick(aid, true);
            }
        });
    });
}

/**
 * POSTs to record the current overseer reading a volunteer's note.
 * Non-fatal — read tracking failures are silently swallowed.
 * @param {number} volunteerId
 * @returns {Promise<void>}
 */
async function fireNoteRead(volunteerId) {
    try {
        await fetch('/api/notes-report/read', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ volunteerId }),
        });
    } catch {
        // Best-effort
    }
}

// ── Action Detail Modal ────────────────────────────────────────────────────────

/**
 * Opens the action detail modal for a given action ID.
 * If opened from within the note detail modal, hides that modal first and
 * re-opens it (with refreshed data) when the action modal closes.
 * @param {number} actionId
 * @param {boolean} fromNote - Whether this was triggered from noteDetailModal.
 */
function onActionCardClick(actionId, fromNote) {
    openActionId         = actionId;
    actionOpenedFromNote = fromNote;

    if (fromNote) {
        noteModal.hide();
    }

    populateActionDetail(actionId);
    actionModal.show();
}

/**
 * Populates the action detail modal from in-memory state.
 * @param {number} actionId
 */
function populateActionDetail(actionId) {
    const a = actions.find(x => x.id === actionId);
    if (!a) return;

    document.getElementById('actionDetailId').value              = actionId;
    document.getElementById('actionDetailVolunteerName').textContent = a.volunteer_name;
    document.getElementById('actionDetailNote').textContent      = a.notes || '';
    document.getElementById('actionSolutionText').value          = a.solution || '';

    setSolutionButtonState(a.solution_found);

    // Show solution textarea only when a solution has been found
    const textWrap = document.getElementById('solutionTextWrap');
    textWrap.classList.toggle('d-none', a.solution_found !== true);

    // Show complete button only when solution found and not yet completed
    const completeBtn = document.getElementById('actionCompleteBtn');
    completeBtn.classList.toggle('d-none', !(a.solution_found === true && !a.completed));

    renderActionMeta(a);

    const errEl = document.getElementById('actionDetailError');
    errEl.classList.add('d-none');
    errEl.textContent = '';
}

/**
 * Renders the meta information block in the action detail modal.
 * @param {{ creator: string, created_at: string, solution_founder: string|null, solution_found_at: string|null, completer: string|null, completed_at: string|null }} a
 */
function renderActionMeta(a) {
    const el    = document.getElementById('actionDetailMeta');
    const lines = [];

    if (a.creator)          lines.push(`Created by <strong>${escHtml(a.creator)}</strong> &middot; ${fmtDate(a.created_at)}`);
    if (a.solution_founder) lines.push(`Solution by <strong>${escHtml(a.solution_founder)}</strong> &middot; ${fmtDate(a.solution_found_at)}`);
    if (a.completer)        lines.push(`Completed by <strong>${escHtml(a.completer)}</strong> &middot; ${fmtDate(a.completed_at)}`);

    el.innerHTML = lines.map(l => `<div class="nr-meta-line">${l}</div>`).join('');
}

/**
 * Updates the visual active state of the solution_found toggle buttons.
 * @param {boolean|null} solutionFound
 */
function setSolutionButtonState(solutionFound) {
    document.getElementById('btnSolutionYes').classList.toggle('active', solutionFound === true);
    document.getElementById('btnSolutionNo').classList.toggle('active',  solutionFound === false);
    document.getElementById('btnSolutionClear').classList.toggle('active', solutionFound === null);
}

/**
 * Handles the Save button in the action detail modal.
 * Reads the solution toggle state and text field, then PATCHes the server.
 * @returns {Promise<void>}
 */
async function onSaveAction() {
    const actionId = parseInt(document.getElementById('actionDetailId').value, 10);
    if (!actionId) return;

    const btnYes = document.getElementById('btnSolutionYes');
    const btnNo  = document.getElementById('btnSolutionNo');

    let solutionFound = null;
    if (btnYes.classList.contains('active')) solutionFound = true;
    if (btnNo.classList.contains('active'))  solutionFound = false;

    const solution = solutionFound === true
        ? (document.getElementById('actionSolutionText').value.trim() || null)
        : null;

    const errEl = document.getElementById('actionDetailError');
    errEl.classList.add('d-none');

    try {
        const res = await fetch(`/api/notes-report/actions/${actionId}/solution`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ solutionFound, solution }),
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            errEl.textContent = data.error || 'Failed to save. Please try again.';
            errEl.classList.remove('d-none');
            return;
        }

        await reload();
        populateActionDetail(actionId);
    } catch {
        errEl.textContent = 'Network error. Please try again.';
        errEl.classList.remove('d-none');
    }
}

/**
 * Handles the Mark Complete button in the action detail modal.
 * @returns {Promise<void>}
 */
async function onCompleteAction() {
    const actionId = parseInt(document.getElementById('actionDetailId').value, 10);
    if (!actionId) return;

    const errEl = document.getElementById('actionDetailError');
    errEl.classList.add('d-none');

    try {
        const res = await fetch(`/api/notes-report/actions/${actionId}/complete`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            errEl.textContent = data.error || 'Failed to complete. Please try again.';
            errEl.classList.remove('d-none');
            return;
        }

        await reload();
        populateActionDetail(actionId);
    } catch {
        errEl.textContent = 'Network error. Please try again.';
        errEl.classList.remove('d-none');
    }
}

/**
 * Handles the Delete button in the action detail modal.
 * Closes the modal on success.
 * @returns {Promise<void>}
 */
async function onDeleteAction() {
    const actionId = parseInt(document.getElementById('actionDetailId').value, 10);
    if (!actionId) return;

    if (!confirm('Delete this action item? This cannot be undone.')) return;

    const errEl = document.getElementById('actionDetailError');
    errEl.classList.add('d-none');

    try {
        const res = await fetch(`/api/notes-report/actions/${actionId}`, {
            method: 'DELETE',
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            errEl.textContent = data.error || 'Failed to delete. Please try again.';
            errEl.classList.remove('d-none');
            return;
        }

        actionModal.hide();
        await reload();
    } catch {
        errEl.textContent = 'Network error. Please try again.';
        errEl.classList.remove('d-none');
    }
}

/**
 * Handles the Create Action Item button inside the note detail modal.
 * POSTs a new action item, reloads data, and refreshes the modal's action list.
 * @param {number} volunteerId
 * @returns {Promise<void>}
 */
async function onCreateAction(volunteerId) {
    try {
        const res = await fetch('/api/notes-report/actions', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ volunteerId }),
        });

        if (!res.ok) return;

        await reload();
        populateNoteDetail(volunteerId);
    } catch {
        // Non-fatal — user can retry
    }
}

// ── Event wiring ──────────────────────────────────────────────────────────────

/**
 * Wires all static event listeners: search inputs, filter pills,
 * modal lifecycle events, and action modal buttons.
 */
function wireEvents() {
    // Search inputs
    document.getElementById('searchAllNotes').addEventListener('input', e => {
        activeSearch.allNotes = e.target.value;
        renderAllNotes();
    });
    document.getElementById('searchActionable').addEventListener('input', e => {
        activeSearch.actionable = e.target.value;
        renderActionable();
    });
    document.getElementById('searchSolutions').addEventListener('input', e => {
        activeSearch.solutions = e.target.value;
        renderSolutions();
    });

    // Filter pills — All Notes
    document.getElementById('filterAllNotes').addEventListener('click', e => {
        const pill = e.target.closest('[data-filter]');
        if (!pill) return;
        activeFilter.allNotes = pill.dataset.filter;
        setActivePill(document.getElementById('filterAllNotes'), pill);
        renderAllNotes();
    });

    // Filter pills — Actionable
    document.getElementById('filterActionable').addEventListener('click', e => {
        const pill = e.target.closest('[data-filter]');
        if (!pill) return;
        activeFilter.actionable = pill.dataset.filter;
        setActivePill(document.getElementById('filterActionable'), pill);
        renderActionable();
    });

    // Filter pills — Solutions
    document.getElementById('filterSolutions').addEventListener('click', e => {
        const pill = e.target.closest('[data-filter]');
        if (!pill) return;
        activeFilter.solutions = pill.dataset.filter;
        setActivePill(document.getElementById('filterSolutions'), pill);
        renderSolutions();
    });

    // Note detail modal — clear state on hide
    document.getElementById('noteDetailModal').addEventListener('hidden.bs.modal', () => {
        openVolunteerId = null;
    });

    // Action detail modal — re-open note detail if it was the origin
    document.getElementById('actionDetailModal').addEventListener('hidden.bs.modal', async () => {
        if (actionOpenedFromNote && openVolunteerId !== null) {
            await reload();
            populateNoteDetail(openVolunteerId);
            noteModal.show();
        }
        openActionId         = null;
        actionOpenedFromNote = false;
    });

    // Solution toggle buttons
    document.getElementById('btnSolutionYes').addEventListener('click', () => {
        setSolutionButtonState(true);
        document.getElementById('solutionTextWrap').classList.remove('d-none');
        document.getElementById('actionCompleteBtn').classList.add('d-none');
    });
    document.getElementById('btnSolutionNo').addEventListener('click', () => {
        setSolutionButtonState(false);
        document.getElementById('solutionTextWrap').classList.add('d-none');
        document.getElementById('actionCompleteBtn').classList.add('d-none');
    });
    document.getElementById('btnSolutionClear').addEventListener('click', () => {
        setSolutionButtonState(null);
        document.getElementById('solutionTextWrap').classList.add('d-none');
        document.getElementById('actionCompleteBtn').classList.add('d-none');
    });

    // Action modal buttons
    document.getElementById('actionSaveBtn').addEventListener('click', onSaveAction);
    document.getElementById('actionCompleteBtn').addEventListener('click', onCompleteAction);
    document.getElementById('actionDeleteBtn').addEventListener('click', onDeleteAction);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Returns the status badge HTML for an action item based on solution_found value.
 * @param {{ solution_found: boolean|null }} a
 * @returns {string}
 */
function buildStatusBadge(a) {
    if (a.solution_found === true)  return '<span class="badge nr-badge nr-badge--solution-found">Solution found</span>';
    if (a.solution_found === false) return '<span class="badge nr-badge nr-badge--no-solution">No solution</span>';
    return '<span class="badge nr-badge nr-badge--pending">Needs review</span>';
}

/**
 * Sets the active pill in a pill group and deactivates all others.
 * @param {HTMLElement} container  - The pill group wrapper element.
 * @param {HTMLElement} activePill - The pill that was selected.
 */
function setActivePill(container, activePill) {
    container.querySelectorAll('.nr-pill').forEach(p => p.classList.remove('nr-pill--active'));
    activePill.classList.add('nr-pill--active');
}

/**
 * Escapes a string for safe insertion as HTML text.
 * @param {string|null|undefined} str
 * @returns {string}
 */
function escHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#x27;');
}

/**
 * Truncates a string to a maximum length, appending an ellipsis if trimmed.
 * @param {string|null|undefined} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

/**
 * Formats an ISO datetime string to a short, readable local date.
 * Returns '—' for null or unparseable input.
 * @param {string|null|undefined} iso
 * @returns {string}
 */
function fmtDate(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString('en-US', {
            month: 'short',
            day:   'numeric',
            year:  'numeric',
        });
    } catch {
        return iso;
    }
}