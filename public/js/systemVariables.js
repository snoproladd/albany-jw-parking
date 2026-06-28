/**
 * @file public/js/systemVariables.js
 * @description Client logic for the System Variables management page.
 *
 * Manages two categories of system_variable_lists:
 *   - location_classification  (Location Classifications)
 *   - location_sub_type        (Sub-location Types)
 *
 * Pattern: fetch all on load → render full sections → re-render after each
 * mutation so the UI always reflects the server state.
 *
 * @module systemVariables
 */

// ── Constants ────────────────────────────────────────────────────────────────

const CAT_CLASS   = 'location_classification';
const CAT_SUBTYPE = 'location_sub_type';

// ── State ────────────────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   id:                  number,
 *   category:            string,
 *   display_name:        string,
 *   parent_id:           number | null,
 *   parent_display_name: string | null,
 *   display_order:       number,
 *   active:              boolean,
 * }} SvRow
 */

/** @type {SvRow[]} */
let classifications = [];

/** @type {SvRow[]} */
let subTypes = [];

/** ID of the row currently being edited, or null. */
let editingId = /** @type {number | null} */ (null);

// ── DOM refs ─────────────────────────────────────────────────────────────────

const classRoot   = document.getElementById('sv-classifications-root');
const subTypeRoot = document.getElementById('sv-subtypes-root');
const pageError   = document.getElementById('sv-page-error');

// ── API helpers ───────────────────────────────────────────────────────────────

/**
 * Wrapper around fetch that parses JSON and throws on non-2xx.
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
async function apiFetch(url, options = {}) {
    const res  = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

// ── Load ──────────────────────────────────────────────────────────────────────

/**
 * Fetch all system variable rows and re-render both sections.
 * @returns {Promise<void>}
 */
async function loadAll() {
    try {
        const { variables } = await apiFetch('/api/system-variables');
        classifications = variables.filter(v => v.category === CAT_CLASS);
        subTypes        = variables.filter(v => v.category === CAT_SUBTYPE);
        renderClassifications();
        renderSubTypes();
    } catch (err) {
        showPageError(`Failed to load: ${err.message}`);
    }
}

/**
 * Show a page-level error banner.
 * @param {string} msg
 */
function showPageError(msg) {
    if (!pageError) return;
    pageError.textContent = msg;
    pageError.classList.remove('d-none');
}

// ── HTML builders ─────────────────────────────────────────────────────────────

/**
 * Build an options string for the "Applies to" select.
 * @param {number | null} selectedParentId
 * @returns {string}
 */
function classificationOptions(selectedParentId) {
    const opts = classifications.map(c =>
        `<option value="${c.id}" ${c.id === selectedParentId ? 'selected' : ''}>${escHtml(c.display_name)}</option>`
    ).join('');
    return `<option value=""${selectedParentId == null ? ' selected' : ''}>(All classifications)</option>${opts}`;
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string | null | undefined} str
 * @returns {string}
 */
function escHtml(str) {
    return (str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Build the active toggle button HTML for a row.
 * @param {SvRow} row
 * @returns {string}
 */
function activeToggleHtml(row) {
    const label = row.active ? 'Active' : 'Inactive';
    const cls   = row.active ? 'success' : 'secondary';
    return `<button type="button"
                    class="btn btn-sm btn-outline-${cls} sv-active-btn"
                    data-id="${row.id}"
                    data-active="${row.active}"
                    title="Click to ${row.active ? 'deactivate' : 'activate'}">
                <i class="fa-solid fa-circle me-1"></i>${label}
            </button>`;
}

/**
 * Build the action buttons (edit + delete) HTML for a row.
 * @param {SvRow} row
 * @returns {string}
 */
function actionBtnsHtml(row) {
    return `<div class="d-flex gap-1 justify-content-end">
                <button type="button" class="btn btn-outline-primary btn-sm sv-edit-btn"
                        data-id="${row.id}" title="Edit">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button type="button" class="btn btn-outline-danger btn-sm sv-delete-btn"
                        data-id="${row.id}" title="Delete">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>`;
}

// ── Classification section ────────────────────────────────────────────────────

/**
 * Render the Location Classifications section.
 * @returns {void}
 */
function renderClassifications() {
    if (!classRoot) return;

    const rows = classifications.map(row => {
        if (row.id === editingId) return classEditRow(row);
        return `
            <tr data-id="${row.id}" class="${row.active ? '' : 'sv-row-inactive'}">
                <td class="sv-name-cell">${escHtml(row.display_name)}</td>
                <td>${activeToggleHtml(row)}</td>
                <td class="text-end">${actionBtnsHtml(row)}</td>
            </tr>`;
    }).join('');

    classRoot.innerHTML = `
        <table class="table table-hover align-middle sv-table mb-0">
            <thead class="table-light">
                <tr>
                    <th>Name</th>
                    <th>Active</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>${classAddRow()}</tfoot>
        </table>
        <div class="sv-inline-error d-none" id="sv-class-error" role="alert"></div>`;

    wireClassHandlers();
}

/**
 * Build an inline edit row for a classification.
 * @param {SvRow} row
 * @returns {string}
 */
function classEditRow(row) {
    return `
        <tr data-id="${row.id}" class="sv-editing-row">
            <td>
                <input type="text" class="form-control form-control-sm sv-edit-name"
                       value="${escHtml(row.display_name)}" maxlength="100"
                       aria-label="Classification name" />
            </td>
            <td>${activeToggleHtml(row)}</td>
            <td class="text-end">
                <div class="d-flex gap-1 justify-content-end">
                    <button type="button" class="btn btn-sm btn-primary sv-save-btn"
                            data-id="${row.id}">
                        <i class="fa-solid fa-floppy-disk me-1"></i>Save
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary sv-cancel-btn">
                        Cancel
                    </button>
                </div>
            </td>
        </tr>`;
}

/**
 * Build the "add new classification" tfoot row.
 * @returns {string}
 */
function classAddRow() {
    return `
        <tr class="sv-add-row">
            <td>
                <input type="text" class="form-control form-control-sm" id="sv-class-add-name"
                       maxlength="100" placeholder="New classification name…"
                       aria-label="New classification name" />
            </td>
            <td></td>
            <td class="text-end">
                <button type="button" class="btn btn-sm btn-success" id="sv-class-add-btn">
                    <i class="fa-solid fa-plus me-1"></i>Add
                </button>
            </td>
        </tr>`;
}

/**
 * Attach all event handlers for the classifications table.
 * @returns {void}
 */
function wireClassHandlers() {
    if (!classRoot) return;

    // Edit
    classRoot.querySelectorAll('.sv-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            editingId = Number(btn.dataset.id);
            renderClassifications();
            classRoot.querySelector('.sv-edit-name')?.focus();
        });
    });

    // Save
    classRoot.querySelectorAll('.sv-save-btn').forEach(btn => {
        btn.addEventListener('click', () => saveClassification(Number(btn.dataset.id)));
    });

    // Cancel
    classRoot.querySelectorAll('.sv-cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => { editingId = null; renderClassifications(); });
    });

    // Enter key in edit field
    classRoot.querySelector('.sv-edit-name')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') saveClassification(editingId);
        if (e.key === 'Escape') { editingId = null; renderClassifications(); }
    });

    // Active toggle
    classRoot.querySelectorAll('.sv-active-btn').forEach(btn => {
        btn.addEventListener('click', () => toggleActive(
            Number(btn.dataset.id),
            btn.dataset.active === 'true',
            CAT_CLASS
        ));
    });

    // Delete
    classRoot.querySelectorAll('.sv-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteEntry(Number(btn.dataset.id), CAT_CLASS));
    });

    // Add
    document.getElementById('sv-class-add-btn')?.addEventListener('click', () => {
        const nameEl = /** @type {HTMLInputElement} */ (
            document.getElementById('sv-class-add-name')
        );
        addEntry(CAT_CLASS, nameEl?.value ?? '', null);
    });

    document.getElementById('sv-class-add-name')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('sv-class-add-btn')?.click();
    });
}

/**
 * Save an in-progress classification edit.
 * @param {number | null} id
 * @returns {Promise<void>}
 */
async function saveClassification(id) {
    if (!id) return;
    const nameEl = /** @type {HTMLInputElement | null} */ (
        classRoot?.querySelector('.sv-edit-name')
    );
    const name = nameEl?.value.trim() ?? '';
    if (!name) { nameEl?.focus(); return; }

    const row = classifications.find(c => c.id === id);
    if (!row) return;

    await saveEntry(id, { displayName: name, parentId: null, displayOrder: row.display_order, active: row.active }, CAT_CLASS);
}

// ── Sub-type section ──────────────────────────────────────────────────────────

/**
 * Render the Sub-location Types section.
 * @returns {void}
 */
function renderSubTypes() {
    if (!subTypeRoot) return;

    const rows = subTypes.map(row => {
        if (row.id === editingId) return subTypeEditRow(row);
        const parentLabel = row.parent_display_name ?? '(All)';
        return `
            <tr data-id="${row.id}" class="${row.active ? '' : 'sv-row-inactive'}">
                <td class="sv-name-cell">${escHtml(row.display_name)}</td>
                <td>
                    <span class="badge ${row.parent_id ? 'sv-badge-parent' : 'sv-badge-all'}">
                        ${escHtml(parentLabel)}
                    </span>
                </td>
                <td>${activeToggleHtml(row)}</td>
                <td class="text-end">${actionBtnsHtml(row)}</td>
            </tr>`;
    }).join('');

    subTypeRoot.innerHTML = `
        <table class="table table-hover align-middle sv-table mb-0">
            <thead class="table-light">
                <tr>
                    <th>Name</th>
                    <th>Applies to</th>
                    <th>Active</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>${subTypeAddRow()}</tfoot>
        </table>
        <div class="sv-inline-error d-none" id="sv-subtype-error" role="alert"></div>`;

    wireSubTypeHandlers();
}

/**
 * Build an inline edit row for a sub-type.
 * @param {SvRow} row
 * @returns {string}
 */
function subTypeEditRow(row) {
    return `
        <tr data-id="${row.id}" class="sv-editing-row">
            <td>
                <input type="text" class="form-control form-control-sm sv-edit-name"
                       value="${escHtml(row.display_name)}" maxlength="100"
                       aria-label="Sub-location type name" />
            </td>
            <td>
                <select class="form-select form-select-sm sv-edit-parent" aria-label="Applies to">
                    ${classificationOptions(row.parent_id)}
                </select>
            </td>
            <td>${activeToggleHtml(row)}</td>
            <td class="text-end">
                <div class="d-flex gap-1 justify-content-end">
                    <button type="button" class="btn btn-sm btn-primary sv-save-btn"
                            data-id="${row.id}">
                        <i class="fa-solid fa-floppy-disk me-1"></i>Save
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary sv-cancel-btn">
                        Cancel
                    </button>
                </div>
            </td>
        </tr>`;
}

/**
 * Build the "add new sub-type" tfoot row.
 * @returns {string}
 */
function subTypeAddRow() {
    return `
        <tr class="sv-add-row">
            <td>
                <input type="text" class="form-control form-control-sm" id="sv-subtype-add-name"
                       maxlength="100" placeholder="New type name…"
                       aria-label="New sub-location type name" />
            </td>
            <td>
                <select class="form-select form-select-sm" id="sv-subtype-add-parent"
                        aria-label="Applies to">
                    ${classificationOptions(null)}
                </select>
            </td>
            <td></td>
            <td class="text-end">
                <button type="button" class="btn btn-sm btn-success" id="sv-subtype-add-btn">
                    <i class="fa-solid fa-plus me-1"></i>Add
                </button>
            </td>
        </tr>`;
}

/**
 * Attach all event handlers for the sub-types table.
 * @returns {void}
 */
function wireSubTypeHandlers() {
    if (!subTypeRoot) return;

    // Edit
    subTypeRoot.querySelectorAll('.sv-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            editingId = Number(btn.dataset.id);
            renderSubTypes();
            subTypeRoot.querySelector('.sv-edit-name')?.focus();
        });
    });

    // Save
    subTypeRoot.querySelectorAll('.sv-save-btn').forEach(btn => {
        btn.addEventListener('click', () => saveSubType(Number(btn.dataset.id)));
    });

    // Cancel
    subTypeRoot.querySelectorAll('.sv-cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => { editingId = null; renderSubTypes(); });
    });

    // Enter key in name field
    subTypeRoot.querySelector('.sv-edit-name')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') saveSubType(editingId);
        if (e.key === 'Escape') { editingId = null; renderSubTypes(); }
    });

    // Active toggle
    subTypeRoot.querySelectorAll('.sv-active-btn').forEach(btn => {
        btn.addEventListener('click', () => toggleActive(
            Number(btn.dataset.id),
            btn.dataset.active === 'true',
            CAT_SUBTYPE
        ));
    });

    // Delete
    subTypeRoot.querySelectorAll('.sv-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteEntry(Number(btn.dataset.id), CAT_SUBTYPE));
    });

    // Add
    document.getElementById('sv-subtype-add-btn')?.addEventListener('click', () => {
        const nameEl   = /** @type {HTMLInputElement | null} */ (document.getElementById('sv-subtype-add-name'));
        const parentEl = /** @type {HTMLSelectElement | null} */ (document.getElementById('sv-subtype-add-parent'));
        const name     = nameEl?.value.trim() ?? '';
        const parentId = parentEl?.value ? Number(parentEl.value) : null;
        addEntry(CAT_SUBTYPE, name, parentId);
    });

    document.getElementById('sv-subtype-add-name')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('sv-subtype-add-btn')?.click();
    });
}

/**
 * Save an in-progress sub-type edit.
 * @param {number | null} id
 * @returns {Promise<void>}
 */
async function saveSubType(id) {
    if (!id) return;
    const nameEl   = /** @type {HTMLInputElement | null} */ (subTypeRoot?.querySelector('.sv-edit-name'));
    const parentEl = /** @type {HTMLSelectElement | null} */ (subTypeRoot?.querySelector('.sv-edit-parent'));
    const name     = nameEl?.value.trim() ?? '';
    if (!name) { nameEl?.focus(); return; }

    const parentId = parentEl?.value ? Number(parentEl.value) : null;
    const row = subTypes.find(s => s.id === id);
    if (!row) return;

    await saveEntry(id, { displayName: name, parentId, displayOrder: row.display_order, active: row.active }, CAT_SUBTYPE);
}

// ── Shared CRUD operations ────────────────────────────────────────────────────

/**
 * Add a new entry via POST, reload, and re-render.
 * @param {string} category
 * @param {string} name
 * @param {number | null} parentId
 * @returns {Promise<void>}
 */
async function addEntry(category, name, parentId) {
    const errorId = category === CAT_CLASS ? 'sv-class-error' : 'sv-subtype-error';
    if (!name) {
        showSectionError(errorId, 'Please enter a name.');
        return;
    }
    try {
        hideSectionError(errorId);
        await apiFetch('/api/system-variables', {
            method: 'POST',
            body:   JSON.stringify({ category, displayName: name, parentId }),
        });
        await loadAll();
    } catch (err) {
        showSectionError(errorId, `Failed to add: ${err.message}`);
    }
}

/**
 * Save an edited entry via PUT, reload, and re-render.
 * @param {number} id
 * @param {{ displayName: string, parentId: number|null, displayOrder: number, active: boolean }} data
 * @param {string} category
 * @returns {Promise<void>}
 */
async function saveEntry(id, data, category) {
    const errorId = category === CAT_CLASS ? 'sv-class-error' : 'sv-subtype-error';
    try {
        hideSectionError(errorId);
        await apiFetch(`/api/system-variables/${id}`, {
            method: 'PUT',
            body:   JSON.stringify(data),
        });
        editingId = null;
        await loadAll();
    } catch (err) {
        showSectionError(errorId, `Failed to save: ${err.message}`);
    }
}

/**
 * Toggle the active flag on an entry via PUT, reload, and re-render.
 * @param {number}  id
 * @param {boolean} currentActive
 * @param {string}  category
 * @returns {Promise<void>}
 */
async function toggleActive(id, currentActive, category) {
    const rows    = category === CAT_CLASS ? classifications : subTypes;
    const row     = rows.find(r => r.id === id);
    const errorId = category === CAT_CLASS ? 'sv-class-error' : 'sv-subtype-error';
    if (!row) return;
    try {
        hideSectionError(errorId);
        await apiFetch(`/api/system-variables/${id}`, {
            method: 'PUT',
            body:   JSON.stringify({
                displayName:  row.display_name,
                parentId:     row.parent_id,
                displayOrder: row.display_order,
                active:       !currentActive,
            }),
        });
        await loadAll();
    } catch (err) {
        showSectionError(errorId, `Failed to update: ${err.message}`);
    }
}

/**
 * Delete an entry via DELETE. Shows a blocking error if the entry is referenced.
 * @param {number} id
 * @param {string} category
 * @returns {Promise<void>}
 */
async function deleteEntry(id, category) {
    const errorId = category === CAT_CLASS ? 'sv-class-error' : 'sv-subtype-error';
    const rows    = category === CAT_CLASS ? classifications : subTypes;
    const row     = rows.find(r => r.id === id);
    if (!row) return;

    if (!confirm(`Delete "${row.display_name}"? This cannot be undone.`)) return;

    try {
        hideSectionError(errorId);
        await apiFetch(`/api/system-variables/${id}`, { method: 'DELETE' });
        await loadAll();
    } catch (err) {
        // 409 = referenced; surface a helpful message
        const msg = err.message.includes('in use')
            ? `Cannot delete "${row.display_name}" — it is still assigned to locations or sub-locations. Deactivate it instead.`
            : `Failed to delete: ${err.message}`;
        showSectionError(errorId, msg);
    }
}

// ── Inline error helpers ──────────────────────────────────────────────────────

/**
 * Show an error message below the given section's table.
 * @param {string} elementId
 * @param {string} msg
 */
function showSectionError(elementId, msg) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('d-none');
}

/**
 * Hide the section-level error element.
 * @param {string} elementId
 */
function hideSectionError(elementId) {
    document.getElementById(elementId)?.classList.add('d-none');
}

// ── Init ──────────────────────────────────────────────────────────────────────

loadAll();
