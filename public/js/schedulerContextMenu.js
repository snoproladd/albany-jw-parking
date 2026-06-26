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
import { openConstraintPanel, closeConstraintPanel } from './schedulerConstraintPanel.js';
import BlackoutTimeline from './blackoutTimeline.js';

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

/** @type {((e: KeyboardEvent) => void)|null} Active ESC key handler for the blackout overlay. */
let _overlayKeyHandler = null;

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
        if (e.key === 'Escape') { _dismissMenu(); _dismissPanel(); dismissRendezvousPanel(); closeNotePanel(); closeConstraintPanel(); }
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

    const pendingConstraints = parseInt(pill.dataset.pendingConstraints || '0', 10);
    if (pendingConstraints > 0) {
        menu.appendChild(_item(
            'fa-solid fa-calendar-xmark',
            `Scheduling Constraints (${pendingConstraints})`,
            [],
            () => {
                _dismissMenu();
                openConstraintPanel({
                    volId:   volId,
                    volName: volName,
                    anchorX: _lastPos?.x ?? 0,
                    anchorY: _lastPos?.y ?? 0,
                });
            },
        ));
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
// ─────────────────────────────────────────────
//  Availability overlay (BlackoutTimeline)
// ─────────────────────────────────────────────

/**
 * Open a centered overlay containing the BlackoutTimeline component for
 * the given volunteer.  Replaces the previous floating add/remove panel.
 *
 * After the user saves, the scheduler conflict tracker for the current day
 * is updated and a `scheduler:blackoutChanged` event is dispatched so the
 * grid can refresh conflict indicators.
 *
 * @param {number} volId   - Volunteer ID.
 * @param {string} volName - Volunteer display name.
 * @returns {Promise<void>}
 */
async function _showBlackoutsPanel(volId, volName) {
    _dismissPanel();

    const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';

    // ── Overlay shell ─────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.className = 'bt-sched-overlay';

    const panel = document.createElement('div');
    panel.className = 'bt-sched-overlay-panel';

    const hdr = document.createElement('div');
    hdr.className = 'bt-sched-overlay-header';

    const ttl = document.createElement('span');
    ttl.textContent = `Availability — ${volName}`;

    const closeBtn = document.createElement('button');
    closeBtn.type      = 'button';
    closeBtn.className = 'bt-sched-overlay-close';
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    closeBtn.addEventListener('click', _dismissPanel);

    hdr.appendChild(ttl);
    hdr.appendChild(closeBtn);
    panel.appendChild(hdr);

    const body = document.createElement('div');
    body.className = 'bt-sched-overlay-body';
    body.innerHTML = `<p class="text-muted small">
        <span class="spinner-border spinner-border-sm me-2"></span>Loading…</p>`;
    panel.appendChild(body);

    overlay.appendChild(panel);

    // Click on backdrop to close
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) _dismissPanel();
    });

    // ESC to close
    _overlayKeyHandler = (e) => {
        if (e.key === 'Escape') _dismissPanel();
    };
    document.addEventListener('keydown', _overlayKeyHandler);

    document.body.appendChild(overlay);
    _panelEl = overlay;

    // ── Fetch data + mount timeline ───────────────────────────────────
    try {
        const res = await fetch(`/api/blackouts/${volId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Snapshot initial blackouts for the current day so we can diff after save
        const currentDayId    = _currentDayId;
        const oldDayBlackouts = (data.blackouts || [])
            .filter((b) => b.conventionDayId === currentDayId);

        body.innerHTML = '';

        new BlackoutTimeline(body, data, {
            /**
             * POST the full replaced blackout set, then sync conflict tracking
             * for the current day.
             *
             * Throwing from this callback causes the BlackoutTimeline component
             * to display "Save Failed — Retry" and re-enable the Save button.
             *
             * @param {Array<{conventionDayId:number, startMins:number, endMins:number}>} payload
             * @returns {Promise<void>}
             */
            onSave: async (payload) => {
                const saveRes = await fetch(`/api/blackouts/${volId}`, {
                    method:  'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrf,
                    },
                    body: JSON.stringify({ blackouts: payload }),
                });
                if (!saveRes.ok) throw new Error(`HTTP ${saveRes.status}`);

                // Untrack old current-day blackouts, track the new set
                for (const b of oldDayBlackouts) {
                    untrackBlackout(volId, b.startMins, b.endMins);
                }
                const newDayBlackouts = payload.filter((b) => b.conventionDayId === currentDayId);
                for (const b of newDayBlackouts) {
                    trackAssign(volId, b.startMins, b.endMins, null);
                }

                document.dispatchEvent(
                    new CustomEvent('scheduler:blackoutChanged', { detail: { volId } })
                );
            },
        });

    } catch (err) {
        body.innerHTML =
            '<p class="text-danger small">Failed to load availability editor.</p>';
        console.error('[schedulerContextMenu] availability overlay error:', err);
    }
}

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
function _dismissPanel() {
  _panelEl?.remove();
  _panelEl = null;
  if (_overlayKeyHandler) {
    document.removeEventListener("keydown", _overlayKeyHandler);
    _overlayKeyHandler = null;
  }
}
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
