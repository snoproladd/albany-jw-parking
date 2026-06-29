/**
 * @file schedulerPublish.js
 * @description Publish modal for the volunteer scheduler page.
 *
 * Exports:
 *   createPublishButton()        — builds the toolbar button element
 *   setPublishCurrentDayId(id)   — keeps module in sync with the day picker;
 *                                  called by schedulerDomActions on dayChange
 *
 * Modal behaviour:
 *   • All convention days are shown as checkboxes; the currently-loaded
 *     day is pre-checked on open.
 *   • Last-published timestamps are fetched from GET /api/scheduler/publish-history
 *     and displayed beside each day after the modal opens.
 *   • Two notification modes:
 *       all          — every scheduled volunteer + all OVERSEER+ notified
 *       differential — OVERSEER+, all keymen/asst keymen, and only volunteers
 *                      whose crew, timeframe, or presence changed since the
 *                      last publish; removed volunteers are also alerted
 *   • One email and one SMS per volunteer regardless of how many days are
 *     selected (batched server-side to prevent message spam).
 *   • The Publish button label reflects the selected day count.
 *   • Per-day success/error icons animate in as results arrive.
 *   • Visibility gated by data-can-publish on the body element; set by the
 *     scheduler GET route for ASSISTANT_ADMIN+ only.
 */

// ─────────────────────────────────────────────
//  Module state
// ─────────────────────────────────────────────

/**
 * Convention days for the current year, read once from the JSON data
 * tag injected into scheduler.ejs by the GET /oversight/tools/scheduler route.
 *
 * @type {Array<{ id: number, label: string, convention_date: string|null }>}
 */
const _conventionDays = _readConventionDays();

/**
 * ID of the day currently loaded in the scheduler grid.
 * Kept in sync via setPublishCurrentDayId().
 *
 * @type {number|null}
 */
let _currentDayId = null;

// ─────────────────────────────────────────────
//  Bootstrap data-tag reader (run once at import)
// ─────────────────────────────────────────────

/**
 * Parse the convention days array from the embedded JSON script tag
 * (<script type="application/json" id="schedulerConventionDaysJson">).
 *
 * @returns {Array<{ id: number, label: string, convention_date: string|null }>}
 */
function _readConventionDays() {
    try {
        const el = document.getElementById('schedulerConventionDaysJson');
        return el ? JSON.parse(el.textContent) : [];
    } catch {
        return [];
    }
}

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/**
 * Read the CSRF token from the meta tag present on every authenticated page.
 *
 * @returns {string}
 */
function _csrf() {
    return document.querySelector('meta[name="csrf-token"]')?.content ?? '';
}

/**
 * HTML-escape a value for safe insertion via innerHTML.
 *
 * @param {unknown} s
 * @returns {string}
 */
function _esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Format a Date as a concise relative label ("Just now", "3h ago", etc.).
 *
 * @param {Date} d
 * @returns {string}
 */
function _relDate(d) {
    const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
    if (mins < 2)   return 'Just now';
    if (mins < 60)  return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs  < 24)  return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30)  return days === 1 ? '1 day ago' : `${days} days ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─────────────────────────────────────────────
//  Public exports
// ─────────────────────────────────────────────

/**
 * Keep the module's currentDayId in sync with the scheduler day picker.
 * Called by schedulerDomActions every time scheduler:dayChange fires.
 *
 * @param {number|null} dayId
 * @returns {void}
 */
export function setPublishCurrentDayId(dayId) {
    _currentDayId = dayId ? Number(dayId) : null;
}

/**
 * Wire an existing button element to open the publish modal on click.
 * Used by the scheduler report page to reuse this modal with its own toolbar button.
 *
 * @param {HTMLButtonElement|null} buttonEl
 * @returns {void}
 */
export function attachPublishTrigger(buttonEl) {
    if (!buttonEl) return;
    buttonEl.addEventListener('click', _onPublishClick);
}

/**
 * Build the "Publish" toolbar button element for the scheduler day banner.
 * The button opens the publish options modal on click.
 *
 * @returns {HTMLButtonElement}
 */
export function createPublishButton() {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.id        = 'schedPublishBtn';
    btn.className = 'sched-history-btn sched-publish-btn';
    btn.title     = 'Publish schedule and notify volunteers';

    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-paper-plane';
    btn.appendChild(icon);
    btn.appendChild(document.createTextNode('\u00a0Publish'));

    btn.addEventListener('click', _onPublishClick);
    return btn;
}

// ─────────────────────────────────────────────
//  Click handler
// ─────────────────────────────────────────────

/**
 * Handle the Publish toolbar button click.
 * Builds and shows the modal, then loads publish history in the background.
 *
 * @returns {Promise<void>}
 */
async function _onPublishClick() {
    if (!_conventionDays.length) {
        alert('No convention days are configured. Add days in Timelines first.');
        return;
    }

    const modal = _buildModal();
    document.body.appendChild(modal.el);

    modal.el.addEventListener('hidden.bs.modal', () => modal.el.remove(), { once: true });
    bootstrap.Modal.getOrCreateInstance(modal.el).show();

    // Load last-published timestamps after the modal is visible
    _loadPublishHistory(modal).catch(() => { /* non-fatal */ });
}

// ─────────────────────────────────────────────
//  Modal builder
// ─────────────────────────────────────────────

/**
 * @typedef {{
 *   row:      HTMLLabelElement,
 *   metaEl:   HTMLSpanElement,
 *   statusEl: HTMLSpanElement,
 * }} DayRowEntry
 */

/**
 * @typedef {{
 *   el:          HTMLDivElement,
 *   dayRows:     Map<number, DayRowEntry>,
 *   modeAll:     HTMLInputElement,
 *   modeDiff:    HTMLInputElement,
 *   publishBtn:  HTMLButtonElement,
 *   cancelBtn:   HTMLButtonElement,
 *   summaryEl:   HTMLDivElement,
 * }} PublishModal
 */

/**
 * Construct the full publish modal DOM and wire its internal events.
 *
 * @returns {PublishModal}
 */
function _buildModal() {
    // ── Shell ────────────────────────────────────────────────
    const el = document.createElement('div');
    el.className = 'modal fade';
    el.setAttribute('tabindex', '-1');
    el.setAttribute('aria-labelledby', 'schedPubModalTitle');

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog modal-dialog-centered';
    el.appendChild(dialog);

    const content = document.createElement('div');
    content.className = 'modal-content';
    dialog.appendChild(content);

    // ── Header ───────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'modal-header';
    content.appendChild(header);

    const title = document.createElement('h5');
    title.className = 'modal-title';
    title.id = 'schedPubModalTitle';
    title.innerHTML = '<i class="fa-solid fa-paper-plane me-2"></i>Publish Schedule';
    header.appendChild(title);

    const closeX = document.createElement('button');
    closeX.type = 'button';
    closeX.className = 'btn-close';
    closeX.dataset.bsDismiss = 'modal';
    header.appendChild(closeX);

    // ── Body ─────────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'modal-body';
    content.appendChild(body);

    // Section: day selection
    const daySection = document.createElement('div');
    daySection.className = 'sched-pub-section';
    body.appendChild(daySection);

    const dayLabel = document.createElement('div');
    dayLabel.className = 'sched-pub-section-label';
    dayLabel.textContent = 'Days to publish';
    daySection.appendChild(dayLabel);

    const dayList = document.createElement('div');
    dayList.className = 'sched-pub-day-list';
    daySection.appendChild(dayList);

    /** @type {Map<number, DayRowEntry>} */
    const dayRows = new Map();

    for (const day of _conventionDays) {
        const row = document.createElement('label');
        row.className = 'sched-pub-day-row';
        row.htmlFor   = `sched-pub-day-${day.id}`;

        const cb = document.createElement('input');
        cb.type      = 'checkbox';
        cb.id        = `sched-pub-day-${day.id}`;
        cb.value     = String(day.id);
        cb.className = 'sched-pub-day-cb form-check-input flex-shrink-0';
        if (day.id === _currentDayId) cb.checked = true;
        row.appendChild(cb);

        const labelWrap = document.createElement('span');
        labelWrap.className = 'sched-pub-day-label-wrap';

        const nameEl = document.createElement('span');
        nameEl.className  = 'sched-pub-day-name';
        nameEl.textContent = day.label;
        labelWrap.appendChild(nameEl);

        const metaEl = document.createElement('span');
        metaEl.className  = 'sched-pub-day-meta';
        metaEl.textContent = 'Checking\u2026';
        labelWrap.appendChild(metaEl);

        row.appendChild(labelWrap);

        const statusEl = document.createElement('span');
        statusEl.className = 'sched-pub-day-status';
        row.appendChild(statusEl);

        dayList.appendChild(row);
        dayRows.set(day.id, { row, metaEl, statusEl });

        cb.addEventListener('change', () => _syncPublishBtn(dayRows, publishBtn));
    }

    // Section: notification mode
    const modeSection = document.createElement('div');
    modeSection.className = 'sched-pub-section border-top';
    body.appendChild(modeSection);

    const modeSectionLabel = document.createElement('div');
    modeSectionLabel.className  = 'sched-pub-section-label';
    modeSectionLabel.textContent = 'Notification mode';
    modeSection.appendChild(modeSectionLabel);

    const modeWrap = document.createElement('div');
    modeWrap.className = 'sched-pub-mode-wrap';
    modeSection.appendChild(modeWrap);

    const { label: allLabel, input: modeAll }   = _radio('sched-pub-mode', 'all',          'Alert All');
    const { label: diffLabel, input: modeDiff }  = _radio('sched-pub-mode', 'differential', 'Differential');
    modeAll.checked = true;

    modeWrap.appendChild(allLabel);
    modeWrap.appendChild(diffLabel);

    const modeDesc = document.createElement('p');
    modeDesc.className  = 'sched-pub-mode-desc';
    modeDesc.textContent = _modeDesc('all');
    modeSection.appendChild(modeDesc);

    modeAll.addEventListener('change',  () => { modeDesc.textContent = _modeDesc('all'); });
    modeDiff.addEventListener('change', () => { modeDesc.textContent = _modeDesc('differential'); });

    // Section: options (dry run / admin only)
    const optSection = document.createElement('div');
    optSection.className = 'sched-pub-section border-top';
    body.appendChild(optSection);

    const optLabel = document.createElement('div');
    optLabel.className = 'sched-pub-section-label';
    optLabel.textContent = 'Options';
    optSection.appendChild(optLabel);

    const dryRunLabel = document.createElement('label');
    dryRunLabel.className = 'sched-pub-option-row';
    dryRunLabel.htmlFor   = 'sched-pub-dry-run';
    const dryRunEl = document.createElement('input');
    dryRunEl.type      = 'checkbox';
    dryRunEl.id        = 'sched-pub-dry-run';
    dryRunEl.className = 'form-check-input';
    dryRunLabel.appendChild(dryRunEl);
    const dryRunText = document.createElement('span');
    dryRunText.className = 'sched-pub-option-text';
    dryRunText.innerHTML = '<strong>Dry run</strong> \u2014 generate &amp; upload PDF only; skip all notifications';
    dryRunLabel.appendChild(dryRunText);
    optSection.appendChild(dryRunLabel);

    const adminOnlyLabel = document.createElement('label');
    adminOnlyLabel.className = 'sched-pub-option-row';
    adminOnlyLabel.htmlFor   = 'sched-pub-admin-only';
    const adminOnlyEl = document.createElement('input');
    adminOnlyEl.type      = 'checkbox';
    adminOnlyEl.id        = 'sched-pub-admin-only';
    adminOnlyEl.className = 'form-check-input';
    adminOnlyLabel.appendChild(adminOnlyEl);
    const adminOnlyText = document.createElement('span');
    adminOnlyText.className = 'sched-pub-option-text';
    adminOnlyText.innerHTML = '<strong>Admin only</strong> \u2014 notify ADMIN+ users only, not scheduled volunteers';
    adminOnlyLabel.appendChild(adminOnlyText);
    optSection.appendChild(adminOnlyLabel);

    dryRunEl.addEventListener('change', () => {
        adminOnlyEl.disabled = dryRunEl.checked;
        if (dryRunEl.checked) adminOnlyEl.checked = false;
        // Relabel the publish button to reflect dry-run mode
        const n = _checkedIds(dayRows).length;
        if (n > 0) {
            const icon  = dryRunEl.checked ? 'fa-flask' : 'fa-eye';
            const label = dryRunEl.checked ? 'Dry Run'  : 'Preview';
            publishBtn.innerHTML =
                `<i class="fa-solid ${icon} me-1"></i>${label} (${n} ${n === 1 ? 'day' : 'days'})`;
        }
    });

    // Step 2: recipient preview (hidden until Preview is clicked)
    const step2El = document.createElement('div');
    step2El.className = 'sched-pub-step2 d-none';
    body.appendChild(step2El);

    // Summary (shown after publish completes)
    const summaryEl = document.createElement('div');
    summaryEl.className = 'sched-pub-summary d-none';
    body.appendChild(summaryEl);

    // ── Footer ───────────────────────────────────────────────
    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    content.appendChild(footer);

    const cancelBtn = document.createElement('button');
    cancelBtn.type      = 'button';
    cancelBtn.className = 'btn btn-secondary btn-sm';
    cancelBtn.dataset.bsDismiss = 'modal';
    cancelBtn.textContent = 'Cancel';
    footer.appendChild(cancelBtn);

    const backBtn = document.createElement('button');
    backBtn.type      = 'button';
    backBtn.className = 'btn btn-secondary btn-sm d-none';
    backBtn.innerHTML = '<i class="fa-solid fa-chevron-left me-1"></i>Back';
    footer.appendChild(backBtn);

    const publishBtn = document.createElement('button');
    publishBtn.type      = 'button';
    publishBtn.className = 'btn btn-primary btn-sm';
    publishBtn.id        = 'schedPubSubmitBtn';
    footer.appendChild(publishBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.type      = 'button';
    confirmBtn.className = 'btn btn-success btn-sm d-none';
    confirmBtn.id        = 'schedPubConfirmBtn';
    footer.appendChild(confirmBtn);

    _syncPublishBtn(dayRows, publishBtn);

    /**
     * Restore the step-1 configuration view and re-enable controls.
     *
     * @returns {void}
     */
    function _showStep1() {
        daySection.classList.remove('d-none');
        modeSection.classList.remove('d-none');
        optSection.classList.remove('d-none');
        step2El.classList.add('d-none');
        summaryEl.classList.add('d-none');
        cancelBtn.classList.remove('d-none');
        backBtn.classList.add('d-none');
        publishBtn.classList.remove('d-none');
        confirmBtn.classList.add('d-none');
        el.querySelectorAll('input').forEach((i) => { i.disabled = false; });
        if (dryRunEl?.checked) adminOnlyEl.disabled = true;
        _syncPublishBtn(dayRows, publishBtn);
    }

    /**
     * Populate and display the step-2 recipient confirmation view.
     *
     * @param {Array<{ name: string, role: string|null, hasEmail: boolean, hasPhone: boolean, days: string[] }>} preview
     * @returns {void}
     */
    function _showStep2(preview) {
        step2El.innerHTML = '';

        const countEl = document.createElement('div');
        countEl.className = 'sched-pub-section-label sched-pub-step2-heading';
        countEl.textContent =
            `${preview.length} recipient${preview.length !== 1 ? 's' : ''} will be notified`;
        step2El.appendChild(countEl);

        const list = document.createElement('div');
        list.className = 'sched-pub-recipient-list';

        for (const r of preview) {
            const row = document.createElement('div');
            row.className = 'sched-pub-recipient-row';

            const nameEl = document.createElement('span');
            nameEl.className   = 'sched-pub-recipient-name';
            nameEl.textContent = r.name;
            row.appendChild(nameEl);

            const chEl = document.createElement('span');
            chEl.className = 'sched-pub-recipient-channels';
            if (r.hasEmail) chEl.innerHTML += '<i class="fa-solid fa-envelope" title="Email"></i>';
            if (r.hasPhone) chEl.innerHTML +=
                '<i class="fa-solid fa-mobile-screen-button ms-1" title="SMS"></i>';
            row.appendChild(chEl);

            list.appendChild(row);
        }
        step2El.appendChild(list);

        daySection.classList.add('d-none');
        modeSection.classList.add('d-none');
        optSection.classList.add('d-none');
        step2El.classList.remove('d-none');
        cancelBtn.classList.add('d-none');
        backBtn.classList.remove('d-none');
        publishBtn.classList.add('d-none');
        confirmBtn.classList.remove('d-none');

        const isDry = dryRunEl?.checked ?? false;
        confirmBtn.innerHTML = isDry
            ? `<i class="fa-solid fa-flask me-1"></i>Confirm Test (${preview.length})`
            : `<i class="fa-solid fa-paper-plane me-1"></i>Confirm & Send (${preview.length})`;
    }

    backBtn.addEventListener('click', _showStep1);

    publishBtn.addEventListener('click', () =>
        _fetchPreview({ el, dayRows, modeAll, dryRunEl, adminOnlyEl, publishBtn, summaryEl, onPreview: _showStep2 })
    );

    confirmBtn.addEventListener('click', () => {
        // Restore step-1 sections so per-day status icons are visible during publish
        daySection.classList.remove('d-none');
        modeSection.classList.remove('d-none');
        optSection.classList.remove('d-none');
        step2El.classList.add('d-none');
        cancelBtn.classList.remove('d-none');
        backBtn.classList.add('d-none');
        publishBtn.classList.remove('d-none');
        confirmBtn.classList.add('d-none');
        _doPublish({ el, dayRows, modeAll, publishBtn, cancelBtn, summaryEl, dryRunEl, adminOnlyEl });
    });

    return { el, dayRows, modeAll, modeDiff, publishBtn, cancelBtn, summaryEl };
}

/**
 * Build a radio input + wrapper label pair.
 *
 * @param {string} name   - Radio group name.
 * @param {string} value  - Input value.
 * @param {string} text   - Visible label text.
 * @returns {{ label: HTMLLabelElement, input: HTMLInputElement }}
 */
function _radio(name, value, text) {
    const id    = `${name}-${value}`;
    const label = document.createElement('label');
    label.className = 'sched-pub-mode-option';
    label.htmlFor   = id;

    const input = document.createElement('input');
    input.type      = 'radio';
    input.name      = name;
    input.id        = id;
    input.value     = value;
    input.className = 'form-check-input';

    label.appendChild(input);
    label.appendChild(document.createTextNode('\u00a0' + text));
    return { label, input };
}

/**
 * Return the description text for a notification mode.
 *
 * @param {'all'|'differential'} mode
 * @returns {string}
 */
function _modeDesc(mode) {
    if (mode === 'differential') {
        return (
            'Overseers and all keymen are always notified. ' +
            'Other volunteers receive a message only if their crew assignment, ' +
            'shift time, or scheduled presence changed since the last publish. ' +
            'Volunteers removed from the schedule are also alerted.'
        );
    }
    return (
        'All volunteers scheduled for the selected days, plus all overseers, ' +
        'will receive a notification.'
    );
}

/**
 * Update the Publish button label and disabled state to reflect the
 * current checkbox selection.
 *
 * @param {Map<number, DayRowEntry>} dayRows
 * @param {HTMLButtonElement}        publishBtn
 * @returns {void}
 */
function _syncPublishBtn(dayRows, publishBtn) {
    const n = _checkedIds(dayRows).length;
    publishBtn.disabled = n === 0;
    publishBtn.innerHTML = n
        ? `<i class="fa-solid fa-eye me-1"></i>Preview (${n} ${n === 1 ? 'day' : 'days'})`
        : '<i class="fa-solid fa-eye me-1"></i>Preview';
}

/**
 * Return the array of currently-checked day IDs.
 *
 * @param {Map<number, DayRowEntry>} dayRows
 * @returns {number[]}
 */
function _checkedIds(dayRows) {
    const ids = [];
    for (const [dayId, { row }] of dayRows) {
        const cb = row.querySelector('input[type="checkbox"]');
        if (cb?.checked) ids.push(dayId);
    }
    return ids;
}

// ─────────────────────────────────────────────
//  Publish history loader
// ─────────────────────────────────────────────

/**
 * Fetch the most-recent publish date for each convention day from
 * GET /api/scheduler/publish-history and update the modal meta labels.
 *
 * @param {PublishModal} modal
 * @returns {Promise<void>}
 */
async function _loadPublishHistory(modal) {
    const res  = await fetch('/api/scheduler/publish-history');
    const data = await res.json();

    if (!data.success) return;

    // Update days that have a history entry
    for (const [key, entry] of Object.entries(data.history || {})) {
        const dayEntry = modal.dayRows.get(Number(key));
        if (!dayEntry) continue;
        dayEntry.metaEl.textContent = entry?.publishedAt
            ? `Last: ${_relDate(new Date(entry.publishedAt))}`
            : 'Last: Never published';
    }

    // Clear any remaining "Checking…" labels
    for (const { metaEl } of modal.dayRows.values()) {
        if (metaEl.textContent === 'Checking\u2026') {
            metaEl.textContent = 'Last: Never published';
        }
    }
}

// ─────────────────────────────────────────────
//  Recipient preview fetcher
// ─────────────────────────────────────────────

/**
 * Fetch the prospective recipient list without generating PDFs or sending
 * anything. Calls onPreview with the result to transition to step 2.
 *
 * @param {{
 *   el:          HTMLDivElement,
 *   dayRows:     Map<number, DayRowEntry>,
 *   modeAll:     HTMLInputElement,
 *   dryRunEl:    HTMLInputElement|null,
 *   adminOnlyEl: HTMLInputElement|null,
 *   publishBtn:  HTMLButtonElement,
 *   summaryEl:   HTMLDivElement,
 *   onPreview:   function(Array): void,
 * }} opts
 * @returns {Promise<void>}
 */
async function _fetchPreview({ el, dayRows, modeAll, dryRunEl, adminOnlyEl, publishBtn, summaryEl, onPreview }) {
    const dayIds    = _checkedIds(dayRows);
    const alertMode = modeAll.checked ? 'all' : 'differential';
    const adminOnly = adminOnlyEl?.checked ?? false;

    if (!dayIds.length) return;

    publishBtn.disabled = true;
    publishBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Checking…';
    el.querySelectorAll('input').forEach((i) => { i.disabled = true; });

    const params = new URLSearchParams({
        dayIds:    dayIds.join(','),
        alertMode,
        adminOnly: String(adminOnly),
    });

    try {
        const res  = await fetch(`/api/scheduler/publish-recipients?${params}`, {
            headers: { 'X-CSRF-Token': _csrf() },
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || `Server error (${res.status})`);
        onPreview(data.preview || []);
    } catch (err) {
        el.querySelectorAll('input').forEach((i) => { i.disabled = false; });
        publishBtn.disabled = false;
        _syncPublishBtn(dayRows, publishBtn);
        summaryEl.classList.remove('d-none');
        summaryEl.innerHTML =
            `<div class="sched-pub-summary-err">` +
            `<i class="fa-solid fa-triangle-exclamation me-1"></i>` +
            `Preview failed: ${_esc(err.message)}` +
            `</div>`;
    }
}

// ─────────────────────────────────────────────
//  Publish submit
// ─────────────────────────────────────────────

/**
 * Execute the publish pipeline via POST /oversight/tools/scheduler/publish.
 * Disables controls, shows per-day status icons, then renders a summary.
 *
 * @param {{
 *   el:         HTMLDivElement,
 *   dayRows:    Map<number, DayRowEntry>,
 *   modeAll:    HTMLInputElement,
 *   publishBtn: HTMLButtonElement,
 *   cancelBtn:  HTMLButtonElement,
 *   summaryEl:  HTMLDivElement,
 * }} opts
 * @returns {Promise<void>}
 */
async function _doPublish({ el, dayRows, modeAll, publishBtn, cancelBtn, summaryEl, dryRunEl, adminOnlyEl }) {
    const dayIds    = _checkedIds(dayRows);
    const alertMode = modeAll.checked ? 'all' : 'differential';
    const dryRun    = dryRunEl?.checked  ?? false;
    const adminOnly = adminOnlyEl?.checked ?? false;

    if (!dayIds.length) return;

    // ── Lock controls ────────────────────────────────────────
    publishBtn.disabled = true;
    cancelBtn.disabled  = true;
    el.querySelectorAll('.sched-pub-day-cb, input[type="radio"]').forEach(
        (input) => { /** @type {HTMLInputElement} */ (input).disabled = true; }
    );

    publishBtn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-1"></span>Publishing\u2026';

    // Show pending spinners on selected rows
    for (const dayId of dayIds) {
        const entry = dayRows.get(dayId);
        if (entry) {
            entry.statusEl.innerHTML =
                '<span class="spinner-border spinner-border-sm sched-pub-spinner"></span>';
        }
    }

    // ── API call ─────────────────────────────────────────────
    let totalEmail = 0, totalSms = 0, errorDays = [];

    try {
        const res  = await fetch('/oversight/tools/scheduler/publish', {
            method:  'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': _csrf(),
            },
            body: JSON.stringify({ dayIds, alertMode, dryRun, adminOnly }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            throw new Error(data.error || `Server error (${res.status})`);
        }

        // Per-day status icons
        for (const dr of data.days || []) {
            const entry = dayRows.get(dr.dayId);
            if (!entry) continue;
            if (dr.error) {
                entry.statusEl.innerHTML =
                    `<span class="sched-pub-status-err" title="${_esc(dr.error)}">` +
                    '<i class="fa-solid fa-circle-xmark"></i></span>';
                errorDays.push(dr.dayLabel || String(dr.dayId));
            } else {
                entry.statusEl.innerHTML =
                    '<span class="sched-pub-status-ok">' +
                    '<i class="fa-solid fa-circle-check"></i></span>';
            }
        }

        totalEmail = data.totalEmailSent ?? 0;
        totalSms   = data.totalSmsSent   ?? 0;

    } catch (err) {
        // Blanket failure — mark all selected days as errored
        for (const dayId of dayIds) {
            const entry = dayRows.get(dayId);
            if (entry) {
                entry.statusEl.innerHTML =
                    `<span class="sched-pub-status-err" title="${_esc(err.message)}">` +
                    '<i class="fa-solid fa-circle-xmark"></i></span>';
            }
        }
        errorDays = dayIds.map((id) => {
            const day = _conventionDays.find((d) => d.id === id);
            return day?.label ?? String(id);
        });
    }

    // ── Summary ──────────────────────────────────────────────
    summaryEl.classList.remove('d-none');

    if (errorDays.length) {
        summaryEl.innerHTML =
            `<div class="sched-pub-summary-err">` +
            `<i class="fa-solid fa-triangle-exclamation me-1"></i>` +
            `Failed: ${errorDays.map(_esc).join(', ')}` +
            `</div>`;
    } else if (dryRun) {
        summaryEl.innerHTML =
            `<div class="sched-pub-summary-ok">` +
            `<i class="fa-solid fa-flask me-1"></i>` +
            `Dry run complete \u2014 PDF generated and uploaded. No notifications sent.` +
            `</div>`;
    } else {
        const qualifier = adminOnly ? ' (admin only)' : '';
        summaryEl.innerHTML =
            `<div class="sched-pub-summary-ok">` +
            `<i class="fa-solid fa-circle-check me-1"></i>` +
            `Published${qualifier}. Sent ${totalEmail} email${totalEmail !== 1 ? 's' : ''} ` +
            `and ${totalSms} SMS.` +
            `</div>`;
    }

    // ── Swap footer to "Done" ────────────────────────────────
    publishBtn.remove();
    cancelBtn.textContent = 'Done';
    cancelBtn.disabled    = false;
    cancelBtn.className   = 'btn btn-primary btn-sm';
}
