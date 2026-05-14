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

// ─────────────────────────────────────────────
//  Module state
// ─────────────────────────────────────────────

/** @type {HTMLElement|null} Active context menu element. */
let _menuEl = null;

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
    menu.appendChild(_item('fa-solid fa-clock-rotate-left', 'Manage Blackouts', ['muted'], null, true));
    menu.appendChild(_item('fa-solid fa-envelope',          'Message Volunteer', ['muted'], null, true));

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
//  Today's Assignments panel
// ─────────────────────────────────────────────

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
