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
        if (e.key === 'Escape') { _dismissMenu(); _dismissPanel(); }
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

        // ── Conflict list (DZ only, when conflicts exist) ────────────
        const dzEl       = pill.parentElement;
        const dzStart    = Number(dzEl?.dataset.shiftStartMins);
        const dzEnd      = Number(dzEl?.dataset.shiftEndMins);
        if (dzStart > 0 && dzEnd > 0) {
            const conflicts = getConflicts(volId, dzStart, dzEnd, dzEl);
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
                        row.textContent = `Unavailable ${timeRange}`;
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
    menu.appendChild(_item('fa-solid fa-clock-rotate-left', 'Manage Blackouts', [], () => {
        _dismissMenu();
        _showBlackoutsPanel(volId, volName);
    }));
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
 * Convert an HH:MM string (from <input type="time">) to minutes from midnight.
 * @param {string} str
 * @returns {number}
 */
function _timeToMins(str) {
    const [h, m] = (str || '').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

/**
 * Open the Manage Blackouts panel for a volunteer on the current day.
 * Shows existing blackout windows and provides an add form.
 *
 * @param {number} volId
 * @param {string} volName
 * @returns {Promise<void>}
 */
async function _showBlackoutsPanel(volId, volName) {
    _dismissPanel();

    const dayId = _currentDayId;
    if (!dayId) return;

    const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';

    const panel = document.createElement('div');
    panel.classList.add('sched-assign-panel', 'sched-blackout-panel');

    // ── Header ───────────────────────────────────────────────────────
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

    // ── Blackout list ─────────────────────────────────────────────────
    const listEl = document.createElement('div');
    listEl.classList.add('sched-blackout-list');
    panel.appendChild(listEl);

    // ── Add form ──────────────────────────────────────────────────────
    const addSection = document.createElement('div');
    addSection.classList.add('sched-blackout-add');
    addSection.innerHTML = `
        <div class="sched-blackout-add-label">Add blackout</div>
        <div class="sched-blackout-time-row">
            <input type="time" class="sched-blackout-time-input" id="bkStart" />
            <span class="sched-blackout-sep">–</span>
            <input type="time" class="sched-blackout-time-input" id="bkEnd" />
        </div>
        <input type="text" class="sched-blackout-reason-input" id="bkReason"
               placeholder="Reason (optional)" maxlength="200" />
        <button type="button" class="sched-blackout-add-btn" id="bkAddBtn">
            <i class="fa-solid fa-plus"></i> Add
        </button>
        <div class="sched-blackout-status"></div>
    `;
    panel.appendChild(addSection);

    document.body.appendChild(panel);
    _panelEl = panel;
    if (_lastPos) _positionEl(panel, _lastPos.x, _lastPos.y);

    // ── Load + render list ────────────────────────────────────────────

    /**
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
            delBtn.title = 'Remove this blackout';
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

    // ── Add button handler ────────────────────────────────────────────

    const addBtn     = addSection.querySelector('#bkAddBtn');
    const startInput = addSection.querySelector('#bkStart');
    const endInput   = addSection.querySelector('#bkEnd');
    const reasonInput = addSection.querySelector('#bkReason');
    const statusEl   = addSection.querySelector('.sched-blackout-status');

    addBtn?.addEventListener('click', async () => {
        const startVal = /** @type {HTMLInputElement} */ (startInput)?.value;
        const endVal   = /** @type {HTMLInputElement} */ (endInput)?.value;

        if (!startVal || !endVal) {
            statusEl.textContent = 'Start and end times are required.';
            statusEl.className   = 'sched-blackout-status text-danger';
            return;
        }

        const startMins = _timeToMins(startVal);
        const endMins   = _timeToMins(endVal);

        if (endMins <= startMins) {
            statusEl.textContent = 'End must be after start.';
            statusEl.className   = 'sched-blackout-status text-danger';
            return;
        }

        addBtn.disabled      = true;
        statusEl.textContent = 'Saving…';
        statusEl.className   = 'sched-blackout-status text-muted';

        try {
            const res = await fetch('/api/scheduler/blackouts', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
                body: JSON.stringify({
                    volunteerId:     volId,
                    conventionDayId: dayId,
                    startMins,
                    endMins,
                    reason: /** @type {HTMLInputElement} */ (reasonInput)?.value.trim() || null,
                }),
            });
            const data = await res.json().catch(() => ({}));

            if (data.success) {
                trackAssign(volId, startMins, endMins, null);
                document.dispatchEvent(new CustomEvent('scheduler:blackoutChanged', { detail: { volId } }));
                /** @type {HTMLInputElement} */ (startInput).value  = '';
                /** @type {HTMLInputElement} */ (endInput).value    = '';
                /** @type {HTMLInputElement} */ (reasonInput).value = '';
                statusEl.textContent = '';
                await loadList();
            } else {
                statusEl.textContent = data.error || 'Failed to save.';
                statusEl.className   = 'sched-blackout-status text-danger';
            }
        } catch (err) {
            console.error('[contextMenu] create blackout error:', err);
            statusEl.textContent = 'Network error.';
            statusEl.className   = 'sched-blackout-status text-danger';
        } finally {
            addBtn.disabled = false;
        }
    });

    await loadList();
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
function _positionEl(el, x, y) {
    el.style.position = 'fixed';
    el.style.left     = `${x}px`;
    el.style.top      = `${y}px`;
    el.style.zIndex   = '9999';
    requestAnimationFrame(() => {
        const r  = el.getBoundingClientRect();
        if (r.right  > window.innerWidth  - 8) el.style.left = `${x - r.width}px`;
        if (r.bottom > window.innerHeight - 8) el.style.top  = `${y - r.height}px`;
    });
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
