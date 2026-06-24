/**
 * @file schedulerContextMenu.js
 * @description Right-click context menu for volunteer name pills in the scheduler.
 *
 * Context-sensitive behaviour:
 *  - Pill in pool  → View/Edit · Today's Assignments · Highlight · Copy Name · (stubs)
 *  - Pill in DZ    → Remove from Slot (top) · divider · all pool items
 *
 * All assignment data is read directly from the live grid DOM so this
 * module requires no extra API calls.
 *
 * Depends on:
 *  - schedulerDraggable.js  (unbindDraggable only — no longer needs full pool ops)
 */

import { unbindDraggable } from './schedulerDraggable.js';
import { trackAssign, untrackBlackout, getConflicts } from './schedulerConflicts.js';
import { openRendezvousPanel, dismissRendezvousPanel, getCachedRendezvous } from './rendezvous.js';
import { openNotePanel, closeNotePanel } from './schedulerNotePanel.js';

// ─────────────────────────────────────────────
//  Module state
// ─────────────────────────────────────────────

/** @type {HTMLElement|null} Active context menu element. */
let _menuEl = null;

/** @type {number|null} Currently selected convention day ID. */
let _currentDayId = null;

/** @type {HTMLElement|null} Active assignments panel element. */
let _panelEl = null;

/** @type {{ x:number, y:number }|null} Position of last right-click. */
let _lastPos = null;

/** @type {{ days: Array<object> }|null} Cached picker payload (days → sessions → shifts). */
let _pickerData = null;

// ─────────────────────────────────────────────
//  Initialisation
// ─────────────────────────────────────────────

/**
 * Wire up the contextmenu listener for the scheduler page.
 * Call once after DOMContentLoaded.
 *
 * @returns {void}
 */
export function initContextMenu() {
    document.addEventListener('contextmenu', _onContextMenu);

    // Track current day for the Manage Blackouts panel
    document.addEventListener('scheduler:dayChange', (e) => {
        _currentDayId = e.detail?.dayId || null;
    });

    // Dismiss menu (not panel) on outside click
    document.addEventListener('mousedown', (e) => {
        if (_menuEl  && !_menuEl.contains(e.target))  _dismissMenu();
        if (_panelEl && !_panelEl.contains(e.target)) _dismissPanel();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { _dismissMenu(); _dismissPanel(); dismissRendezvousPanel(); closeNotePanel(); }
    });
}

// ─────────────────────────────────────────────
//  Context menu trigger
// ─────────────────────────────────────────────

/**
 * @param {MouseEvent} e
 * @returns {void}
 */
function _onContextMenu(e) {
    // ── Shift-block right-click (not on a pill or dropzone) ──
    const block = e.target.closest('.sched-shift-block');
    if (block && !e.target.closest('.name-pill') && !e.target.closest('.scheduler-dropzone')) {
        e.preventDefault();
        _dismissMenu();
        _dismissPanel();
        _showShiftBlockMenu(block, e.clientX, e.clientY);
        return;
    }

    const pill = e.target.closest('.name-pill');
    if (!pill) { _dismissMenu(); return; }

    e.preventDefault();
    _dismissMenu();
    _dismissPanel();

    _lastPos = { x: e.clientX, y: e.clientY };

    const inDz    = pill.parentElement?.classList.contains('scheduler-dropzone');
    const volId   = Number(pill.dataset.id);
    const volName = pill.querySelector('.pill-name')?.textContent?.trim() || 'Volunteer';

    _menuEl = _buildMenu(volId, volName, pill, inDz);
    document.body.appendChild(_menuEl);
    _positionEl(_menuEl, e.clientX, e.clientY);
}

// ─────────────────────────────────────────────
//  Menu builder
// ─────────────────────────────────────────────

/**
 * @param {number}      volId
 * @param {string}      volName
 * @param {HTMLElement} pill
 * @param {boolean}     inDz
 * @returns {HTMLElement}
 */
function _buildMenu(volId, volName, pill, inDz) {
    const menu = document.createElement('div');
    menu.classList.add('sched-ctx-menu');

    const header = document.createElement('div');
    header.classList.add('sched-ctx-header');
    header.textContent = volName;
    menu.appendChild(header);

    // ── Contact info ─────────────────────────────────────────────────
    const phone = pill.dataset.phone || '';
    const email = pill.dataset.email || '';
    if (phone || email) {
        const contact = document.createElement('div');
        contact.classList.add('sched-ctx-contact');

        if (phone) {
            const a = document.createElement('a');
            a.classList.add('sched-ctx-contact-row');
            a.href = `tel:${phone.replace(/\D/g, '')}`;
            const ico = document.createElement('i'); ico.className = 'fa-solid fa-phone';
            const txt = document.createElement('span'); txt.textContent = phone;
            a.appendChild(ico); a.appendChild(txt);
            contact.appendChild(a);
        }

        if (email) {
            const a = document.createElement('a');
            a.classList.add('sched-ctx-contact-row');
            a.href = `mailto:${email}`;
            const ico = document.createElement('i'); ico.className = 'fa-solid fa-at';
            const txt = document.createElement('span'); txt.textContent = email;
            a.appendChild(ico); a.appendChild(txt);
            contact.appendChild(a);
        }

        menu.appendChild(contact);
    }

    // ── Remove from Slot (DZ only) ───────────────────────────────────
    if (inDz) {
        menu.appendChild(_item('fa-solid fa-xmark', 'Remove from Slot', ['danger'], () => {
            _removePillFromSlot(pill);
        }));

        // ── Conflict list (DZ only) — live conflicts + saved note ─────
        const dzEl    = pill.parentElement;
        const dzStart = Number(dzEl?.dataset.shiftStartMins);
        const dzEnd   = Number(dzEl?.dataset.shiftEndMins);
        const pillNote = pill.dataset.conflictNote || '';

        if (dzStart > 0 && dzEnd > 0) {
            const conflicts = getConflicts(volId, dzStart, dzEnd, dzEl);

            // Use live conflicts if available; fall back to saved note for loaded assignments
            if (conflicts.length > 0) {
                const conflictHdr = document.createElement('div');
                conflictHdr.classList.add('sched-ctx-conflict-header');
                conflictHdr.textContent =
                    `${conflicts.length} conflict${conflicts.length !== 1 ? 's' : ''}`;
                menu.appendChild(conflictHdr);

                for (const c of conflicts) {
                    const timeRange =
                        `${_fmtMins(c.shiftStart)}\u2013${_fmtMins(c.shiftEnd)}`;
                    const row = document.createElement('div');
                    row.classList.add('sched-ctx-conflict-row');
                    if (c.dzEl === null) {
                        row.textContent = c.reason
                            ? `Unavailable ${timeRange} — ${c.reason}`
                            : `Unavailable ${timeRange}`;
                    } else {
                        const name = c.dzEl.closest('.sched-shift-block')
                            ?.querySelector('.sched-shift-header')
                            ?.textContent?.trim() || 'another shift';
                        row.innerHTML =
                            `<i class="fa-solid fa-arrow-right-arrow-left"></i>
                             <span><strong>${name}</strong> · ${timeRange}</span>`;
                    }
                    menu.appendChild(row);
                }
            } else if (pillNote || pill.dataset.blackoutNote) {
                // Loaded from DB — show saved note sections
                const shiftParts    = (pillNote || '').split('; ').filter((p) => !p.startsWith('Blackout'));
                const blackoutParts = (pill.dataset.blackoutNote || '').split('; ').filter(Boolean);

                if (shiftParts.length > 0) {
                    const hdr = document.createElement('div');
                    hdr.classList.add('sched-ctx-conflict-header');
                    hdr.textContent = 'Shift overlap';
                    menu.appendChild(hdr);
                    shiftParts.forEach((p) => {
                        const row = document.createElement('div');
                        row.classList.add('sched-ctx-conflict-row');
                        row.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><span>${p}</span>`;
                        menu.appendChild(row);
                    });
                }

          if (blackoutParts.length > 0 || pill.dataset.blackoutNote) {
            const hdr = document.createElement("div");
            hdr.classList.add("sched-ctx-conflict-header");
            hdr.textContent = "Personal constraint";
            menu.appendChild(hdr);

            // pill.dataset.blackoutNote holds the full title (time + reason)
            // blackoutParts holds the time-only segments from the DB note
            const lines = pill.dataset.blackoutNote
              ? pill.dataset.blackoutNote.split("; ")
              : blackoutParts;

            lines.forEach((p) => {
              const row = document.createElement("div");
              row.classList.add("sched-ctx-conflict-row");
              row.innerHTML = `<i class="fa-solid fa-circle-info"></i><span>${p}</span>`;
              menu.appendChild(row);
            });
          }
            }
        }

        menu.appendChild(_divider());
    }

    // ── Core actions ─────────────────────────────────────────────────
    const assignments = _getGridAssignments(volId);
    const assignCount = assignments.length;

    menu.appendChild(_item('fa-solid fa-user-pen', 'View / Edit Volunteer', [], () => {
        window.open('/editVolunteer', '_blank');
    }));

    if (pill.dataset.hasNote === '1') {
        const actorId = parseInt(document.body.dataset.actorId || '0', 10);
        menu.appendChild(_item('fa-solid fa-note-sticky', 'View Note', [], () => {
            _dismissMenu();
            openNotePanel({
                volId:   volId,
                volName: volName,
                anchorX: _lastPos?.x ?? 0,
                anchorY: _lastPos?.y ?? 0,
                actorId: actorId,
            });
        }));
    }

    menu.appendChild(_item(
        'fa-solid fa-calendar-check',
        assignCount > 0 ? `Today's Assignments (${assignCount})` : "Today's Assignments",
        [],
        () => { _dismissMenu(); _showAssignmentsPanel(volName, assignments); },
    ));

    menu.appendChild(_item('fa-solid fa-eye', 'Highlight on Grid', [], () => {
        _highlightAssignments(volId);
    }));

    menu.appendChild(_item('fa-regular fa-copy', 'Copy Name', [], () => {
        navigator.clipboard?.writeText(volName).catch(() => {});
    }));

    // ── Future stubs ─────────────────────────────────────────────────
    menu.appendChild(_divider());
    const bkItem = _item(
        'fa-solid fa-clock-rotate-left',
        'Manage Blackouts',
        _currentDayId ? [] : ['muted'],
        _currentDayId ? () => { _showBlackoutsPanel(volId, volName); } : null,
    );
    if (!_currentDayId) bkItem.title = 'Select a convention day first';
    menu.appendChild(bkItem);
    menu.appendChild(_item('fa-solid fa-envelope', 'Message Volunteer', ['muted'], null, true));

    return menu;
}

/**
 * @param {string}        icon
 * @param {string}        label
 * @param {string[]}      modifiers
 * @param {Function|null} action
 * @param {boolean}       [soon]
 * @returns {HTMLButtonElement}
 */
function _item(icon, label, modifiers, action, soon = false) {
    const btn = document.createElement('button');
    btn.classList.add('sched-ctx-item');
    modifiers.forEach((m) => btn.classList.add(`sched-ctx--${m}`));
    if (!action) btn.disabled = true;

    const ico = document.createElement('i');
    ico.className = icon;
    btn.appendChild(ico);

    const lbl = document.createElement('span');
    lbl.textContent = label;
    btn.appendChild(lbl);

    if (soon) {
        const badge = document.createElement('span');
        badge.classList.add('sched-ctx-soon');
        badge.textContent = 'soon';
        btn.appendChild(badge);
    }

    if (action) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            _dismissMenu();
            action();
        });
    }

    return btn;
}

/** @returns {HTMLElement} */
function _divider() {
    const d = document.createElement('div');
    d.classList.add('sched-ctx-divider');
    return d;
}

// ─────────────────────────────────────────────
//  Manage Blackouts panel
// ─────────────────────────────────────────────

/**
 * Fetch and cache the blackout picker payload (days → sessions → shifts).
 * Subsequent calls within the same page session return the cached result.
 *
 * @returns {Promise<{ days: Array<object> }>}
 */
async function _loadPickerData() {
    if (_pickerData) return _pickerData;
    const res  = await fetch('/api/scheduler/blackout-picker');
    const data = await res.json().catch(() => ({ days: [] }));
    _pickerData = data;
    return data;
}

/**
 * Convert an HH:MM string (from <input type="time">) to minutes from midnight.
 *
 * @param {string} str
 * @returns {number}
 */
function _timeToMins(str) {
    const [h, m] = (str || '').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

/**
 * Open the Manage Blackouts panel for a volunteer on the current day.
 * Provides four add modes — Custom, Session, Shift, and Pre-session —
 * each supporting multi-day blackout creation via day checkboxes.
 *
 * @param {number} volId   - Volunteer ID.
 * @param {string} volName - Volunteer display name.
 * @returns {Promise<void>}
 */
async function _showBlackoutsPanel(volId, volName) {
    _dismissPanel();

    const dayId = _currentDayId;
    if (!dayId) return;

    const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';

    // ── Panel shell ───────────────────────────────────────────────────
    const panel = document.createElement('div');
    panel.classList.add('sched-assign-panel', 'sched-blackout-panel');

    const hdr = document.createElement('div');
    hdr.classList.add('sched-assign-panel-header');

    const ttl = document.createElement('span');
    ttl.textContent = `Blackouts — ${volName}`;

    const closeBtn = document.createElement('button');
    closeBtn.classList.add('sched-assign-panel-close');
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    closeBtn.addEventListener('click', () => _dismissPanel());

    hdr.appendChild(ttl);
    hdr.appendChild(closeBtn);
    panel.appendChild(hdr);

    // ── Existing blackout list ────────────────────────────────────────
    const listEl = document.createElement('div');
    listEl.classList.add('sched-blackout-list');
    panel.appendChild(listEl);

    // ── Add section placeholder while picker data loads ───────────────
    const addSection = document.createElement('div');
    addSection.classList.add('sched-blackout-add');
    addSection.innerHTML = `
        <div class="sched-blackout-add-label">Add blackout</div>
        <p class="sched-assign-panel-empty">
            <span class="spinner-border spinner-border-sm me-1"></span>Loading…
        </p>`;
    panel.appendChild(addSection);

    document.body.appendChild(panel);
    _panelEl = panel;
    if (_lastPos) _positionEl(panel, _lastPos.x, _lastPos.y);

    // ── List helpers ──────────────────────────────────────────────────

    /**
     * Render the existing blackout list.
     * @param {Array<object>} blackouts
     * @returns {void}
     */
    function renderList(blackouts) {
        listEl.innerHTML = '';
        if (blackouts.length === 0) {
            const p = document.createElement('p');
            p.classList.add('sched-assign-panel-empty');
            p.textContent = 'No blackouts for this day.';
            listEl.appendChild(p);
            return;
        }
        for (const bk of blackouts) {
            const row = document.createElement('div');
            row.classList.add('sched-blackout-row');

            const info = document.createElement('div');
            info.classList.add('sched-blackout-info');

            const timeSpan = document.createElement('span');
            timeSpan.classList.add('sched-blackout-time-range');
            timeSpan.textContent = `${_fmtMins(bk.start_mins)} – ${_fmtMins(bk.end_mins)}`;
            info.appendChild(timeSpan);

            if (bk.reason) {
                const reasonSpan = document.createElement('span');
                reasonSpan.classList.add('sched-blackout-reason-text');
                reasonSpan.textContent = bk.reason;
                info.appendChild(reasonSpan);
            }

            const delBtn = document.createElement('button');
            delBtn.classList.add('sched-blackout-del-btn');
            delBtn.title     = 'Remove this blackout';
            delBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';

            delBtn.addEventListener('click', async () => {
                delBtn.disabled = true;
                try {
                    const r = await fetch(`/api/scheduler/blackouts/${bk.id}`, {
                        method:  'DELETE',
                        headers: { 'X-CSRF-Token': csrf },
                    });
                    const d = await r.json().catch(() => ({}));
                    if (d.success) {
                        untrackBlackout(volId, bk.start_mins, bk.end_mins);
                        document.dispatchEvent(new CustomEvent('scheduler:blackoutChanged', { detail: { volId } }));
                        row.remove();
                        if (!listEl.querySelector('.sched-blackout-row')) {
                            const p = document.createElement('p');
                            p.classList.add('sched-assign-panel-empty');
                            p.textContent = 'No blackouts for this day.';
                            listEl.appendChild(p);
                        }
                    }
                } catch (err) {
                    console.error('[contextMenu] delete blackout error:', err);
                    delBtn.disabled = false;
                }
            });

            row.appendChild(info);
            row.appendChild(delBtn);
            listEl.appendChild(row);
        }
    }

    /**
     * Fetch and render the blackout list for the current volunteer + day.
     * @returns {Promise<void>}
     */
    async function loadList() {
        listEl.innerHTML = `<p class="sched-assign-panel-empty">
            <span class="spinner-border spinner-border-sm me-1"></span>Loading…
        </p>`;
        try {
            const res  = await fetch(`/api/scheduler/blackouts/${dayId}?volunteerId=${volId}`);
            const data = await res.json().catch(() => ({}));
            renderList(data.blackouts || []);
        } catch {
            listEl.innerHTML = '<p class="sched-assign-panel-empty text-danger small">Failed to load.</p>';
        }
    }

    // ── Add section builder ───────────────────────────────────────────

    /**
     * Build the full add form once picker data is available.
     * @param {{ days: Array<object> }} pickerData
     * @returns {void}
     */
    function buildAddSection(pickerData) {
        const pickerDays = pickerData.days || [];
        addSection.innerHTML = '';

        const addLabel = document.createElement('div');
        addLabel.classList.add('sched-blackout-add-label');
        addLabel.textContent = 'Add blackout';
        addSection.appendChild(addLabel);

        // ── Mode radio pills ──────────────────────────────────────────
        const modeRow = document.createElement('div');
        modeRow.classList.add('sched-blackout-modes');

        [
            { key: 'custom',     label: 'Custom' },
            { key: 'session',    label: 'Session' },
            { key: 'shift',      label: 'Shift' },
            { key: 'presession', label: 'Pre-session' },
            { key: 'fullday',    label: 'Full Day' },
        ].forEach(({ key, label }) => {
            const lbl   = document.createElement('label');
            lbl.classList.add('sched-blackout-mode-pill');
            const radio = document.createElement('input');
            radio.type  = 'radio';
            radio.name  = `bk-mode-${volId}`;
            radio.value = key;
            if (key === 'custom') radio.checked = true;
            lbl.appendChild(radio);
            lbl.appendChild(document.createTextNode(label));
            modeRow.appendChild(lbl);
        });
        addSection.appendChild(modeRow);

        // ── Dynamic mode fields ───────────────────────────────────────
        const fieldsEl = document.createElement('div');
        fieldsEl.classList.add('sched-blackout-field-section');
        addSection.appendChild(fieldsEl);

        // ── Day checkboxes ────────────────────────────────────────────
        const daysWrap = document.createElement('div');
        daysWrap.classList.add('sched-blackout-days');

        const daysLbl = document.createElement('div');
        daysLbl.classList.add('sched-blackout-days-label');
        daysLbl.textContent = 'Days';
        daysWrap.appendChild(daysLbl);

        const daysRow = document.createElement('div');
        daysRow.classList.add('sched-blackout-days-row');

        // "All" toggle
        const allLbl = document.createElement('label');
        allLbl.classList.add('sched-blackout-day-pill');
        const allCb = document.createElement('input');
        allCb.type = 'checkbox';
        allLbl.appendChild(allCb);
        allLbl.appendChild(document.createTextNode('All'));
        daysRow.appendChild(allLbl);

        /** @type {HTMLInputElement[]} */
        const dayCbs = [];
        for (const d of pickerDays) {
            const lbl = document.createElement('label');
            lbl.classList.add('sched-blackout-day-pill');
            const cb  = document.createElement('input');
            cb.type          = 'checkbox';
            cb.dataset.dayId = String(d.dayId);
            cb.checked       = d.dayId === dayId;
            lbl.appendChild(cb);
            lbl.appendChild(document.createTextNode(d.dayLabel));
            daysRow.appendChild(lbl);
            dayCbs.push(cb);
        }

        allCb.addEventListener('change', () => dayCbs.forEach((cb) => { cb.checked = allCb.checked; }));
        dayCbs.forEach((cb) => {
            cb.addEventListener('change', () => { allCb.checked = dayCbs.every((c) => c.checked); });
        });
        allCb.checked = dayCbs.length > 0 && dayCbs.every((c) => c.checked);

        daysWrap.appendChild(daysRow);
        addSection.appendChild(daysWrap);

        // ── Shared reason input ───────────────────────────────────────
        const reasonInput = document.createElement('input');
        reasonInput.type        = 'text';
        reasonInput.classList.add('sched-blackout-reason-input');
        reasonInput.placeholder = 'Reason (optional)';
        reasonInput.maxLength   = 200;
        addSection.appendChild(reasonInput);

        // ── Add button + status ───────────────────────────────────────
        const addBtn = document.createElement('button');
        addBtn.type  = 'button';
        addBtn.classList.add('sched-blackout-add-btn');
        addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add';
        addSection.appendChild(addBtn);

        const statusEl = document.createElement('div');
        statusEl.classList.add('sched-blackout-status');
        addSection.appendChild(statusEl);

        // ── Mode field helpers ────────────────────────────────────────

        /**
         * Return unique session labels across all picker days.
         * @returns {string[]}
         */
        function _sessionLabels() {
            const seen = new Set();
            for (const d of pickerDays) for (const s of d.sessions) seen.add(s.sessionLabel);
            return Array.from(seen);
        }

        /**
         * Build a session <select> element populated with unique labels.
         * @returns {HTMLSelectElement}
         */
        function _buildSessionSel() {
            const sel = document.createElement('select');
            sel.classList.add('sched-blackout-select');
            const ph = document.createElement('option');
            ph.value = ''; ph.textContent = 'Select session…';
            sel.appendChild(ph);
            for (const label of _sessionLabels()) {
                const opt = document.createElement('option');
                opt.value = label; opt.textContent = label;
                sel.appendChild(opt);
            }
            return sel;
        }

        /**
         * Populate a shift <select> with unique labels for the given session.
         * @param {string}            sessionLabel
         * @param {HTMLSelectElement} shiftSel
         * @returns {void}
         */
        function _fillShiftSel(sessionLabel, shiftSel) {
            shiftSel.innerHTML = '';
            const ph = document.createElement('option');
            ph.value = ''; ph.textContent = 'Select shift…';
            shiftSel.appendChild(ph);
            const seen = new Set();
            for (const d of pickerDays) {
                const sess = d.sessions.find((s) => s.sessionLabel === sessionLabel);
                if (!sess) continue;
                for (const sh of sess.shifts) {
                    if (!seen.has(sh.shiftLabel)) {
                        seen.add(sh.shiftLabel);
                        const opt = document.createElement('option');
                        opt.value = sh.shiftLabel; opt.textContent = sh.shiftLabel;
                        shiftSel.appendChild(opt);
                    }
                }
            }
        }

        /**
         * Update the pre-session preview line.
         * Uses the current day's session data, falling back to the first available day.
         * @param {string}      sessionLabel
         * @param {HTMLElement} previewEl
         * @returns {void}
         */
        function _updatePreview(sessionLabel, previewEl) {
            if (!sessionLabel) { previewEl.textContent = ''; return; }
            const ref  = pickerDays.find((d) => d.dayId === dayId) || pickerDays[0];
            const sess = ref?.sessions.find((s) => s.sessionLabel === sessionLabel);
            if (!sess || sess.firstShiftStartMins == null) {
                previewEl.textContent = 'No shifts defined for this session.';
                return;
            }
            previewEl.textContent =
                `${_fmtMins(sess.firstShiftStartMins)} – ${_fmtMins(sess.startMins)}`;
        }

        /**
         * Render the mode-specific input fields, resetting status and reason.
         * @param {string} mode
         * @returns {void}
         */
        function renderFields(mode) {
            fieldsEl.innerHTML   = '';
            reasonInput.value    = '';
            statusEl.textContent = '';
            statusEl.className   = 'sched-blackout-status';

            if (mode === 'custom') {
                const timeRow    = document.createElement('div');
                timeRow.classList.add('sched-blackout-time-row');
                const startInput = document.createElement('input');
                startInput.type  = 'time';
                startInput.classList.add('sched-blackout-time-input');
                startInput.id    = 'bkStart';
                const sep        = document.createElement('span');
                sep.classList.add('sched-blackout-sep');
                sep.textContent  = '–';
                const endInput   = document.createElement('input');
                endInput.type    = 'time';
                endInput.classList.add('sched-blackout-time-input');
                endInput.id      = 'bkEnd';
                timeRow.appendChild(startInput);
                timeRow.appendChild(sep);
                timeRow.appendChild(endInput);
                fieldsEl.appendChild(timeRow);

            } else if (mode === 'session') {
                const sel = _buildSessionSel();
                sel.addEventListener('change', () => {
                    reasonInput.value = sel.value ? `Session: ${sel.value}` : '';
                });
                fieldsEl.appendChild(sel);

            } else if (mode === 'shift') {
                const sessionSel  = _buildSessionSel();
                const shiftSel    = document.createElement('select');
                shiftSel.classList.add('sched-blackout-select');
                shiftSel.disabled = true;
                const shiftPh     = document.createElement('option');
                shiftPh.value     = ''; shiftPh.textContent = 'Select shift…';
                shiftSel.appendChild(shiftPh);

                sessionSel.addEventListener('change', () => {
                    _fillShiftSel(sessionSel.value, shiftSel);
                    shiftSel.disabled = !sessionSel.value;
                    reasonInput.value = '';
                });
                shiftSel.addEventListener('change', () => {
                    reasonInput.value = (sessionSel.value && shiftSel.value)
                        ? `Shift: ${shiftSel.value}` : '';
                });

                fieldsEl.appendChild(sessionSel);
                fieldsEl.appendChild(shiftSel);

            } else if (mode === 'presession') {
                const sel     = _buildSessionSel();
                const preview = document.createElement('div');
                preview.classList.add('sched-blackout-preview');

                sel.addEventListener('change', () => {
                    _updatePreview(sel.value, preview);
                    reasonInput.value = sel.value ? `Pre-session: ${sel.value}` : '';
                });

                fieldsEl.appendChild(sel);
                fieldsEl.appendChild(preview);

            } else if (mode === 'fullday') {
                reasonInput.value    = 'Full day unavailable';
                const note           = document.createElement('p');
                note.classList.add('sched-blackout-preview');
                note.textContent     = 'Blocks all shifts for the selected day(s).';
                fieldsEl.appendChild(note);
            }
        }

        // Wire mode radio buttons
        modeRow.querySelectorAll('input[type="radio"]').forEach((radio) => {
            radio.addEventListener('change', () => {
                if (/** @type {HTMLInputElement} */ (radio).checked) {
                    renderFields(/** @type {HTMLInputElement} */ (radio).value);
                }
            });
        });

        renderFields('custom');

        // ── Add button handler ────────────────────────────────────────
        addBtn.addEventListener('click', async () => {
            const mode = /** @type {HTMLInputElement|null} */ (
                modeRow.querySelector(`input[name="bk-mode-${volId}"]:checked`)
            )?.value || 'custom';

            const selectedDayIds = dayCbs
                .filter((cb) => cb.checked)
                .map((cb) => Number(cb.dataset.dayId));

            if (selectedDayIds.length === 0) {
                statusEl.textContent = 'Select at least one day.';
                statusEl.className   = 'sched-blackout-status text-danger';
                return;
            }

            /** @type {Array<{ dayId: number, startMins: number, endMins: number }>} */
            const toPost = [];

            if (mode === 'custom') {
                const startInput = /** @type {HTMLInputElement|null} */ (fieldsEl.querySelector('#bkStart'));
                const endInput   = /** @type {HTMLInputElement|null} */ (fieldsEl.querySelector('#bkEnd'));
                if (!startInput?.value || !endInput?.value) {
                    statusEl.textContent = 'Start and end times are required.';
                    statusEl.className   = 'sched-blackout-status text-danger';
                    return;
                }
                const startMins = _timeToMins(startInput.value);
                const endMins   = _timeToMins(endInput.value);
                if (endMins <= startMins) {
                    statusEl.textContent = 'End must be after start.';
                    statusEl.className   = 'sched-blackout-status text-danger';
                    return;
                }
                for (const dId of selectedDayIds) toPost.push({ dayId: dId, startMins, endMins });

            } else if (mode === 'session') {
                const label = /** @type {HTMLSelectElement|null} */ (
                    fieldsEl.querySelector('select')
                )?.value || '';
                if (!label) {
                    statusEl.textContent = 'Select a session.';
                    statusEl.className   = 'sched-blackout-status text-danger';
                    return;
                }
                for (const dId of selectedDayIds) {
                    const day  = pickerDays.find((d) => d.dayId === dId);
                    const sess = day?.sessions.find((s) => s.sessionLabel === label);
                    if (sess) toPost.push({ dayId: dId, startMins: sess.startMins, endMins: sess.endMins });
                }

            } else if (mode === 'shift') {
                const [sessionSel, shiftSel] = /** @type {HTMLSelectElement[]} */ (
                    Array.from(fieldsEl.querySelectorAll('select'))
                );
                const sessLabel  = sessionSel?.value || '';
                const shiftLabel = shiftSel?.value   || '';
                if (!sessLabel || !shiftLabel) {
                    statusEl.textContent = 'Select a session and shift.';
                    statusEl.className   = 'sched-blackout-status text-danger';
                    return;
                }
                for (const dId of selectedDayIds) {
                    const day    = pickerDays.find((d) => d.dayId === dId);
                    const sess   = day?.sessions.find((s) => s.sessionLabel === sessLabel);
                    const shifts = sess?.shifts.filter((sh) => sh.shiftLabel === shiftLabel) || [];
                    for (const sh of shifts) {
                        toPost.push({ dayId: dId, startMins: sh.startMins, endMins: sh.endMins });
                    }
                }

            } else if (mode === 'presession') {
                const label = /** @type {HTMLSelectElement|null} */ (
                    fieldsEl.querySelector('select')
                )?.value || '';
                if (!label) {
                    statusEl.textContent = 'Select a session.';
                    statusEl.className   = 'sched-blackout-status text-danger';
                    return;
                }
                for (const dId of selectedDayIds) {
                    const day  = pickerDays.find((d) => d.dayId === dId);
                    const sess = day?.sessions.find((s) => s.sessionLabel === label);
                    if (sess?.firstShiftStartMins != null && sess.startMins != null) {
                        toPost.push({
                            dayId:     dId,
                            startMins: sess.firstShiftStartMins,
                            endMins:   sess.startMins,
                        });
                    }
                }

            } else if (mode === 'fullday') {
                // 0 → 1440 spans midnight-to-midnight, overlapping every possible shift.
                for (const dId of selectedDayIds) {
                    toPost.push({ dayId: dId, startMins: 0, endMins: 1440 });
                }
            }

            if (toPost.length === 0) {
                statusEl.textContent = 'No matching data for the selected days.';
                statusEl.className   = 'sched-blackout-status text-danger';
                return;
            }

            addBtn.disabled      = true;
            statusEl.textContent = 'Saving…';
            statusEl.className   = 'sched-blackout-status text-muted';

            let ok = 0, fail = 0;
            const reason = reasonInput.value.trim() || null;

            for (const { dayId: dId, startMins, endMins } of toPost) {
                try {
                    const res  = await fetch('/api/scheduler/blackouts', {
                        method:  'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
                        body:    JSON.stringify({
                            volunteerId:     volId,
                            conventionDayId: dId,
                            startMins,
                            endMins,
                            reason,
                        }),
                    });
                    const d = await res.json().catch(() => ({}));
                    if (d.success) {
                        ok++;
                        if (dId === dayId) {
                            trackAssign(volId, startMins, endMins, null);
                            document.dispatchEvent(new CustomEvent('scheduler:blackoutChanged', { detail: { volId } }));
                        }
                    } else {
                        fail++;
                    }
                } catch {
                    fail++;
                }
            }

            addBtn.disabled = false;

            if (ok > 0) {
                statusEl.textContent = `${ok} blackout${ok !== 1 ? 's' : ''} added${fail > 0 ? `, ${fail} failed` : ''}.`;
                statusEl.className   = 'sched-blackout-status text-success';
                reasonInput.value    = '';
                renderFields(mode);
                await loadList();
            } else {
                statusEl.textContent = `Failed — ${fail} error${fail !== 1 ? 's' : ''}.`;
                statusEl.className   = 'sched-blackout-status text-danger';
            }
        });

        if (_lastPos) _positionEl(panel, _lastPos.x, _lastPos.y);
    }

    // ── Parallel load: list + picker data ─────────────────────────────
    const [pickerData] = await Promise.all([
        _loadPickerData().catch(() => ({ days: [] })),
        loadList(),
    ]);
    buildAddSection(pickerData);
}

// ─────────────────────────────────────────────
//  Shift-block context menu (RV)
// ─────────────────────────────────────────────

/**
 * Build and show a context menu for a shift block with rendezvous options.
 *
 * @param {HTMLElement} block  The .sched-shift-block element.
 * @param {number}      x     Click x coordinate.
 * @param {number}      y     Click y coordinate.
 */
function _showShiftBlockMenu(block, x, y) {
    const assignmentId = Number(block.dataset.assignmentId);
    const shiftLabel = block.querySelector('.sched-shift-header')?.textContent?.trim() || 'Shift';

    // Read location name from the column header above this block
    const col = block.style.gridColumn?.split('/')[0]?.trim();
    const dept = block.dataset.department || '';
    let locationName = '';
    if (col) {
        const locHeader = document.querySelector(
            `.sched-loc-header[data-dept="${dept}"]`
        );
        if (locHeader) locationName = locHeader.textContent?.trim() || '';
    }

    // Read convention date + start time from DOM
    const dayPicker = document.getElementById('dayPicker');
    const selectedOpt = dayPicker?.selectedOptions?.[0];
    const conventionDate = selectedOpt?.dataset?.date || '';

    const dz = block.querySelector('.scheduler-dropzone');
    const startMins = Number(dz?.dataset.shiftStartMins || 0);
    const startHH = String(Math.floor(startMins / 60)).padStart(2, '0');
    const startMM = String(startMins % 60).padStart(2, '0');
    const startTime = `${startHH}:${startMM}`;

    const hasRv = !!getCachedRendezvous(assignmentId);

    const menu = document.createElement('div');
    menu.classList.add('sched-ctx-menu');

    const header = document.createElement('div');
    header.classList.add('sched-ctx-header');
    header.textContent = shiftLabel;
    menu.appendChild(header);

    if (hasRv) {
        menu.appendChild(_item('fa-solid fa-location-dot', 'View / Edit Rendezvous', [], () => {
            _openRvFromBlock(assignmentId, shiftLabel, locationName, startTime, conventionDate, x, y);
        }));
    } else if (assignmentId) {
        menu.appendChild(_item('fa-solid fa-location-crosshairs', 'Set Rendezvous', [], () => {
            _openRvFromBlock(assignmentId, shiftLabel, locationName, startTime, conventionDate, x, y);
        }));
    } else {
        menu.appendChild(_item('fa-solid fa-location-dot', 'No assignment', ['muted'], null));
    }

    _menuEl = menu;
    document.body.appendChild(menu);
    _positionEl(menu, x, y);
}

/**
 * Open the RV panel for a shift block.
 *
 * @param {number} assignmentId
 * @param {string} shiftLabel
 * @param {string} locationName
 * @param {string} startTime
 * @param {string} conventionDate
 * @param {number} x
 * @param {number} y
 */
function _openRvFromBlock(assignmentId, shiftLabel, locationName, startTime, conventionDate, x, y) {
    openRendezvousPanel({
        assignmentId,
        shiftLabel,
        locationName: locationName || 'Location',
        startTime,
        conventionDate,
        canCreate: true,
        canEdit:   true,
        canDelete: true,
        anchorX:   x,
        anchorY:   y,
        onUpdate:  (aId, rvData) => {
            // Cache is updated internally by rendezvous.js
        },
    });
}

/**
 * @typedef {{ shiftName:string, dept:string, deptName:string, startMins:number, endMins:number }} GridAssignment
 */

/**
 * @param {number} volId
 * @returns {GridAssignment[]}
 */
function _getGridAssignments(volId) {
    return Array.from(
        document.querySelectorAll(`.scheduler-calendar .name-pill[data-id="${volId}"]`),
    ).map((pill) => {
        const dz    = pill.parentElement;
        const block = dz?.closest('.sched-shift-block');
        return {
            shiftName:  block?.querySelector('.sched-shift-header')?.textContent?.trim() || '—',
            dept:       block?.dataset.department || '',
            deptName:   _deptName(block?.dataset.department),
            startMins:  Number(dz?.dataset.shiftStartMins || 0),
            endMins:    Number(dz?.dataset.shiftEndMins   || 0),
        };
    }).sort((a, b) => a.startMins - b.startMins);
}

/**
 * @param {string}           volName
 * @param {GridAssignment[]} assignments
 * @returns {void}
 */
function _showAssignmentsPanel(volName, assignments) {
    _dismissPanel();

    const panel = document.createElement('div');
    panel.classList.add('sched-assign-panel');

    const hdr = document.createElement('div');
    hdr.classList.add('sched-assign-panel-header');
    const ttl = document.createElement('span');
    ttl.textContent = `Today — ${volName}`;
    const closeBtn = document.createElement('button');
    closeBtn.classList.add('sched-assign-panel-close');
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); _dismissPanel(); });
    hdr.appendChild(ttl);
    hdr.appendChild(closeBtn);
    panel.appendChild(hdr);

    if (assignments.length === 0) {
        const empty = document.createElement('p');
        empty.classList.add('sched-assign-panel-empty');
        empty.textContent = 'No shifts assigned yet today.';
        panel.appendChild(empty);
    } else {
        const byDept = {};
        for (const a of assignments) (byDept[a.dept] = byDept[a.dept] || []).push(a);

        for (const [dept, shifts] of Object.entries(byDept)) {
            const deptBlock = document.createElement('div');
            deptBlock.classList.add('sched-assign-dept');

            const deptLbl = document.createElement('div');
            deptLbl.classList.add('sched-assign-dept-label');
            deptLbl.textContent = _deptName(dept);
            deptBlock.appendChild(deptLbl);

            for (const s of shifts) {
                const row = document.createElement('div');
                row.classList.add('sched-assign-row');

                const nameEl = document.createElement('span');
                nameEl.classList.add('sched-assign-shift');
                nameEl.textContent = s.shiftName;

                const timeEl = document.createElement('span');
                timeEl.classList.add('sched-assign-time');
                timeEl.textContent = `${_fmtMins(s.startMins)} – ${_fmtMins(s.endMins)}`;

                row.appendChild(nameEl);
                row.appendChild(timeEl);
                deptBlock.appendChild(row);
            }
            panel.appendChild(deptBlock);
        }
    }

    document.body.appendChild(panel);
    _panelEl = panel;
    if (_lastPos) _positionEl(panel, _lastPos.x, _lastPos.y);
}

// ─────────────────────────────────────────────
//  Highlight on grid
// ─────────────────────────────────────────────

/**
 * @param {number} volId
 * @returns {void}
 */
function _highlightAssignments(volId) {
    const blocks = new Set(
        Array.from(
            document.querySelectorAll(`.scheduler-calendar .name-pill[data-id="${volId}"]`),
        ).map((p) => p.closest('.sched-shift-block')).filter(Boolean),
    );
    blocks.forEach((block) => {
        block.classList.add('sched-highlight-flash');
        block.addEventListener('animationend', () => block.classList.remove('sched-highlight-flash'), { once: true });
    });
}

// ─────────────────────────────────────────────
//  Remove from slot
// ─────────────────────────────────────────────

/**
 * Remove a slot pill (clone) from its DZ, firing the full unassign pipeline
 * (conflict untrack + DB delete). The original pool pill is untouched.
 *
 * @param {HTMLElement} pill - The clone inside the DZ.
 * @returns {void}
 */
function _removePillFromSlot(pill) {
    const fromDz = pill.parentElement;
    if (!fromDz?.classList.contains('scheduler-dropzone')) return;

    // Clone — just remove it; original pool pill is still in pool
    unbindDraggable(pill);
    pill.remove();

    document.dispatchEvent(new CustomEvent('scheduler:slotUnassigned', {
        detail: { pill, fromDz, record: true },
    }));
}

// ─────────────────────────────────────────────
//  Dismiss helpers
// ─────────────────────────────────────────────

function _dismissMenu()  { _menuEl?.remove();  _menuEl  = null; }
function _dismissPanel() { _panelEl?.remove(); _panelEl = null; }

// ─────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────

/**
 * @param {HTMLElement} el
 * @param {number}      x
 * @param {number}      y
 */
/**
 * Position a floating panel near a click coordinate, clamping to viewport.
 * Double rAF ensures the browser has completed layout with actual content
 * before measuring — single rAF fires before dynamic content is painted.
 *
 * @param {HTMLElement} el
 * @param {number}      x
 * @param {number}      y
 * @returns {void}
 */
function _positionEl(el, x, y) {
    el.style.position = 'fixed';
    el.style.left     = `${x}px`;
    el.style.top      = `${y}px`;
    el.style.zIndex   = '9999';
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const r  = el.getBoundingClientRect();
        if (r.right  > window.innerWidth  - 8) el.style.left = `${x - r.width}px`;
        if (r.bottom > window.innerHeight - 8) el.style.top  = `${Math.max(8, y - r.height)}px`;
    }));
}

/** @param {number} mins @returns {string} */
function _fmtMins(mins) {
    if (!mins && mins !== 0) return '—';
    const h = Math.floor(mins / 60), m = mins % 60, ap = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`;
}

const DEPT_DISPLAY = {
    lots_and_garages: 'Lots & Garages',
    signs:            'Signs',
    security:         'Security',
    dropoff_pickup:   'Drop-off / Pickup',
    mobile_support:   'Mobile Support',
};

/** @param {string|undefined} key @returns {string} */
function _deptName(key) { return DEPT_DISPLAY[key ?? ''] || key || 'Unknown Dept'; }
