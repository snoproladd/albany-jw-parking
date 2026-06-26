/**
 * @file schedulerNotePanel.js
 * @description Floating note detail panel for the scheduler page.
 *
 * Provides openNotePanel() — opens a positioned panel showing a volunteer's
 * intake note, read history, and action items. Supports creating new action
 * items inline with a silent success state.
 *
 * Mirrors the flow available in the Notes Report page but scoped to a single
 * volunteer and presented as a floating panel consistent with the scheduler's
 * blackouts/assignments panel pattern.
 *
 * Public API:
 *   openNotePanel(opts)  — open the panel
 *   closeNotePanel()     — close the panel programmatically
 */

// ── Module state ──────────────────────────────────────────────────────────────

/** @type {HTMLElement|null} Active note panel element. */
let _panelEl = null;

/** @type {number|null} Volunteer ID currently displayed. */
let _currentVolId = null;

/** @type {{ x: number, y: number }} Last anchor position for re-clamping after content load. */
let _anchorPos = { x: 0, y: 0 };

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Opens the note detail panel for a volunteer.
 * Closes any existing panel first.
 *
 * @param {{
 *   volId:   number,
 *   volName: string,
 *   anchorX: number,
 *   anchorY: number,
 *   actorId: number,
 * }} opts
 * @returns {Promise<void>}
 */
export async function openNotePanel({ volId, volName, anchorX, anchorY, actorId }) {
    closeNotePanel();

    _currentVolId = volId;
    _anchorPos    = { x: anchorX, y: anchorY };

    const panel = _buildShell(volName);
    document.body.appendChild(panel);
    _panelEl = panel;
    _positionEl(panel, anchorX, anchorY);

    // Wire dismiss-on-outside-click (one-time setup per panel)
    const _outsideClick = (e) => {
        if (_panelEl && !_panelEl.contains(e.target)) {
            closeNotePanel();
            document.removeEventListener('mousedown', _outsideClick);
        }
    };
    document.addEventListener('mousedown', _outsideClick);

    await _loadAndRender(panel, volId, actorId);
}

/**
 * Closes and removes the active note panel, if any.
 * @returns {void}
 */
export function closeNotePanel() {
    _panelEl?.remove();
    _panelEl      = null;
    _currentVolId = null;
}

// ── Panel shell ───────────────────────────────────────────────────────────────

/**
 * Builds the static panel shell with header and content placeholder.
 * Content is populated asynchronously after fetch.
 *
 * @param {string} volName
 * @returns {HTMLElement}
 */
function _buildShell(volName) {
    const panel = document.createElement('div');
    panel.classList.add('sched-assign-panel', 'sched-note-panel');

    // Header
    const hdr = document.createElement('div');
    hdr.classList.add('sched-assign-panel-header');

    const ttl = document.createElement('span');
    ttl.classList.add('sched-note-panel-title');
    ttl.innerHTML = `<i class="fa-solid fa-note-sticky me-1"></i>${_esc(volName)}`;

    const closeBtn = document.createElement('button');
    closeBtn.classList.add('sched-assign-panel-close');
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    closeBtn.addEventListener('click', () => closeNotePanel());

    hdr.appendChild(ttl);
    hdr.appendChild(closeBtn);
    panel.appendChild(hdr);

    // Loading body
    const body = document.createElement('div');
    body.classList.add('sched-note-panel-body');
    body.innerHTML = `<p class="sched-assign-panel-empty">
        <span class="spinner-border spinner-border-sm me-1"></span>Loading…
    </p>`;
    panel.appendChild(body);

    return panel;
}

// ── Data + render ─────────────────────────────────────────────────────────────

/**
 * Fetches volunteer note data, fires a read record, then renders the panel body.
 *
 * @param {HTMLElement} panel
 * @param {number}      volId
 * @param {number}      actorId
 * @returns {Promise<void>}
 */
async function _loadAndRender(panel, volId, actorId) {
    const body = panel.querySelector('.sched-note-panel-body');

    try {
        const res  = await fetch(`/api/notes-report/volunteers/${volId}`);
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.volunteer) {
            body.innerHTML = '<p class="sched-assign-panel-empty text-danger small">Failed to load note.</p>';
            return;
        }

        const v = data.volunteer;

        // Fire read record in background — non-fatal
        fetch('/api/notes-report/read', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ volunteerId: volId }),
        }).catch(() => {});

        _renderBody(body, v, volId, actorId);

        // Re-clamp now that the full content height is known
        if (_panelEl) {
            _positionEl(_panelEl, _anchorPos.x, _anchorPos.y);
        }

        // Load AI summary in background — non-fatal, panel renders fine without it
        _renderAiSummary(panel, body, volId);
    } catch {
        body.innerHTML = '<p class="sched-assign-panel-empty text-danger small">Network error.</p>';
    }
}

/**
 * Renders the panel body with note text, reads, and action items.
 *
 * @param {HTMLElement} body
 * @param {{ notes: string, reads: Array, actions: Array }} v
 * @param {number} volId
 * @param {number} actorId
 * @returns {void}
 */
function _renderBody(body, v, volId, actorId) {
    body.innerHTML = '';

    // ── Note text ─────────────────────────────────────────────────────
    const noteSection = document.createElement('div');
    noteSection.classList.add('sched-note-section');

    const noteLabel = document.createElement('div');
    noteLabel.classList.add('sched-note-label');
    noteLabel.textContent = 'Intake Note';
    noteSection.appendChild(noteLabel);

    const noteText = document.createElement('div');
    noteText.classList.add('sched-note-text');
    noteText.textContent = v.notes || '—';
    noteSection.appendChild(noteText);

    body.appendChild(noteSection);

    // ── Read by ───────────────────────────────────────────────────────
    const readSection = document.createElement('div');
    readSection.classList.add('sched-note-section');

    const readLabel = document.createElement('div');
    readLabel.classList.add('sched-note-label');
    readLabel.textContent = 'Read by';
    readSection.appendChild(readLabel);

    const reads = v.reads || [];
    if (reads.length === 0) {
        const none = document.createElement('p');
        none.classList.add('sched-note-meta');
        none.textContent = 'Not yet read by anyone.';
        readSection.appendChild(none);
    } else {
        const chipsWrap = document.createElement('div');
        chipsWrap.classList.add('sched-note-chips');
        reads.forEach((r) => {
            const chip = document.createElement('span');
            chip.classList.add('sched-note-chip');
            if (r.read_by === actorId) chip.classList.add('sched-note-chip--me');
            chip.textContent = r.reader_name + (r.read_by === actorId ? ' (you)' : '');
            chipsWrap.appendChild(chip);
        });
        readSection.appendChild(chipsWrap);
    }

    body.appendChild(readSection);

    // ── Action items ──────────────────────────────────────────────────
    const actionSection = document.createElement('div');
    actionSection.classList.add('sched-note-section');

    const actionLabel = document.createElement('div');
    actionLabel.classList.add('sched-note-label');
    actionLabel.textContent = 'Action Items';
    actionSection.appendChild(actionLabel);

    const actionList = document.createElement('div');
    actionList.classList.add('sched-note-action-list');
    actionSection.appendChild(actionList);

    _renderActionList(actionList, v.actions || []);

    // Create Action button
    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.classList.add('sched-note-create-btn');
    createBtn.innerHTML = '<i class="fa-solid fa-plus me-1"></i>Create Action Item';
    createBtn.addEventListener('click', () => _onCreateAction(createBtn, actionList, volId));
    actionSection.appendChild(createBtn);

    // Link to Notes Report
    const link = document.createElement('a');
    link.href   = '/oversight/tools/notes-report';
    link.target = '_blank';
    link.rel    = 'noopener noreferrer';
    link.classList.add('sched-note-report-link');
    link.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square me-1"></i>Manage in Notes Report';
    actionSection.appendChild(link);

    body.appendChild(actionSection);
}

/**
 * Renders the action item list into the given container.
 *
 * @param {HTMLElement} container
 * @param {Array<{ id: number, solution_found: boolean|null, solution: string|null, completed: boolean|null, creator: string, created_at: string }>} actions
 * @returns {void}
 */
function _renderActionList(container, actions) {
    container.innerHTML = '';

    if (actions.length === 0) {
        const none = document.createElement('p');
        none.classList.add('sched-note-meta');
        none.textContent = 'No action items yet.';
        container.appendChild(none);
        return;
    }

    actions.forEach((a) => {
        const row = document.createElement('div');
        row.classList.add('sched-note-action-row');

        const badge = document.createElement('span');
        badge.classList.add('sched-note-action-badge');
        if (a.solution_found === true)  { badge.classList.add('sched-note-action-badge--found');    badge.textContent = 'Solution found'; }
        else if (a.solution_found === false) { badge.classList.add('sched-note-action-badge--none'); badge.textContent = 'No solution'; }
        else                            { badge.classList.add('sched-note-action-badge--pending');  badge.textContent = 'Pending'; }

        const completedBadge = a.completed
            ? (() => { const b = document.createElement('span'); b.classList.add('sched-note-action-badge', 'sched-note-action-badge--complete'); b.textContent = 'Completed'; return b; })()
            : null;

        const meta = document.createElement('span');
        meta.classList.add('sched-note-meta');
        meta.textContent = `${_esc(a.creator)} · ${_fmtDate(a.created_at)}`;

        row.appendChild(badge);
        if (completedBadge) row.appendChild(completedBadge);
        row.appendChild(meta);
        container.appendChild(row);
    });
}

// ── Action creation ───────────────────────────────────────────────────────────

/**
 * Handles the Create Action Item button.
 * POSTs silently and shows a brief success/error state in the button.
 *
 * @param {HTMLButtonElement} btn
 * @param {HTMLElement}       actionList
 * @param {number}            volId
 * @returns {Promise<void>}
 */
async function _onCreateAction(btn, actionList, volId) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Creating…';

    try {
        const res  = await fetch('/api/notes-report/actions', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ volunteerId: volId }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            btn.innerHTML = '<i class="fa-solid fa-xmark me-1"></i>Failed — try again';
            btn.disabled  = false;
            return;
        }

        // Append new action to list inline
        const newAction = {
            id:             data.id,
            solution_found: null,
            solution:       null,
            completed:      null,
            creator:        'You',
            created_at:     new Date().toISOString(),
        };

        // Remove "no actions" placeholder if present
        actionList.querySelector('.sched-note-meta')?.remove();
        _renderActionList(actionList, [
            ...Array.from(actionList.querySelectorAll('.sched-note-action-row')).map(() => null),
            newAction,
        ].filter(Boolean));

        // Re-fetch and re-render the action list for accuracy
        const refreshRes  = await fetch(`/api/notes-report/volunteers/${volId}`);
        const refreshData = await refreshRes.json().catch(() => ({}));
        if (refreshRes.ok && refreshData.volunteer) {
            _renderActionList(actionList, refreshData.volunteer.actions || []);
        }

        btn.innerHTML = '<i class="fa-solid fa-check me-1"></i>Created';
        setTimeout(() => {
            if (btn.isConnected) {
                btn.innerHTML = '<i class="fa-solid fa-plus me-1"></i>Create Action Item';
                btn.disabled  = false;
            }
        }, 2000);
    } catch {
        btn.innerHTML = '<i class="fa-solid fa-xmark me-1"></i>Network error';
        btn.disabled  = false;
    }
}

// ── AI Summary ────────────────────────────────────────────────────────────────

/**
 * Fetches the most recent AI analysis for a volunteer and inserts a compact
 * read-only summary section between "Read by" and "Action Items."
 * Silently no-ops if no analysis exists, the analysis failed, or the panel
 * has been closed or switched to a different volunteer before the fetch returns.
 *
 * @param {HTMLElement} panel - The panel root element (used for isConnected check).
 * @param {HTMLElement} body  - The panel body element to insert into.
 * @param {number}      volId
 * @returns {Promise<void>}
 */
async function _renderAiSummary(panel, body, volId) {
    try {
        const res = await fetch(`/api/notes/analysis/${volId}`);
        if (!res.ok) return;

        const data     = await res.json().catch(() => ({}));
        const analysis = data.data;

        // Guard: panel closed, switched volunteer, or no usable result
        if (_currentVolId !== volId || !panel.isConnected) return;
        if (!analysis || analysis.error || !analysis.summary) return;

        const section = document.createElement('div');
        section.classList.add('sched-note-section', 'sched-note-ai-section');

        // Label
        const label = document.createElement('div');
        label.classList.add('sched-note-label');
        label.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles me-1"></i>AI Summary';
        section.appendChild(label);

        // Summary text
        const summary = document.createElement('div');
        summary.classList.add('sched-note-ai-summary');
        summary.textContent = analysis.summary;
        section.appendChild(summary);

        // Flag chips (skip no_action_needed — not useful in this context)
        const flags = (analysis.flags || []).filter(f => f !== 'no_action_needed');
        if (flags.length > 0) {
            const chipsWrap = document.createElement('div');
            chipsWrap.classList.add('sched-note-chips');
            flags.forEach(f => {
                const chip = document.createElement('span');
                chip.classList.add('sched-note-ai-flag');
                chip.textContent = f.replace(/_/g, ' ');
                chipsWrap.appendChild(chip);
            });
            section.appendChild(chipsWrap);
        }

        // Stale warning
        if (analysis.isStale) {
            const stale = document.createElement('div');
            stale.classList.add('sched-note-ai-stale');
            stale.innerHTML = '<i class="fa-solid fa-rotate me-1"></i>Note changed since analysis';
            section.appendChild(stale);
        }

        // Insert before the action items section (last .sched-note-section in body)
        const sections    = body.querySelectorAll(':scope > .sched-note-section');
        const lastSection = sections[sections.length - 1];
        if (lastSection) {
            body.insertBefore(section, lastSection);
        } else {
            body.appendChild(section);
        }

        // Re-clamp — content height has grown
        if (_panelEl === panel) {
            _positionEl(panel, _anchorPos.x, _anchorPos.y);
        }
    } catch {
        // Non-fatal — panel renders without AI section
    }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Positions a panel element near a click coordinate, clamping to viewport.
 * @param {HTMLElement} el
 * @param {number}      x
 * @param {number}      y
 */
function _positionEl(el, x, y) {
    el.style.position = 'fixed';
    el.style.left     = `${x}px`;
    el.style.top      = `${y}px`;
    el.style.zIndex   = '9999';
    requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        if (r.right  > window.innerWidth  - 8) el.style.left = `${x - r.width}px`;
        if (r.bottom > window.innerHeight - 8) el.style.top  = `${y - r.height}px`;
    });
}

/**
 * Escapes a string for safe DOM text insertion.
 * @param {string|null|undefined} str
 * @returns {string}
 */
function _esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Formats an ISO datetime string to a short readable date.
 * @param {string|null|undefined} iso
 * @returns {string}
 */
function _fmtDate(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
        return iso;
    }
}
