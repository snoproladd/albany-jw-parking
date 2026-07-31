/**
 * @file public/js/lessonsLearned.js
 * @description Client-side logic for the Lessons Learned page.
 *
 * Reads session context from the #ll-meta JSON block.
 * All data is loaded via JSON API calls; the EJS template contains no
 * inline data except the meta block.
 *
 * Flow:
 *   init()
 *     └─ loadFilterOptions()   populate year select + modal year/dept selects
 *     └─ loadLessons()         render cards for current tab
 *
 * User actions trigger:
 *   handleNewLesson()          create lesson then upload queued photos
 *   handleEditOpen(id)         open edit modal pre-populated
 *   handleEditSave()           PUT update
 *   handleApprove(id)          POST approve
 *   handlePublishOpen(id)      open publish confirm modal
 *   handlePublish()            POST publish (may take seconds for PDF)
 *   handleArchive(id)          POST archive
 *   handleUnarchive(id)        POST unarchive
 *   handlePhotoAdd(id, files)  POST each photo
 *   handlePhotoDelete(id, pid) DELETE photo then refresh gallery
 *   openLightbox(src)          fullscreen photo viewer
 */

(function () {
    'use strict';

    // ─────────────────────────────────────────────
    //  Meta / state
    // ─────────────────────────────────────────────

    /** @type {{ csrfToken: string, userId: number|null, isOverseer: boolean }} */
    let meta = { csrfToken: '', userId: null, isOverseer: false };

    /** Current active tab: 'proposed' | 'accepted' | 'published' | 'archived'. */
    let currentTab = 'proposed';

    /** Currently selected year filter (null = all). */
    let currentYear = null;

    /** Cached years from API. @type {number[]} */
    let cachedYears = [];

    /** Cached departments from API. @type {Array<{id:number,display_name:string}>} */
    let cachedDepts = [];

    /**
     * The most recently fetched report record for the Published tab.
     * Null when no report has been generated for the current year.
     * Used by buildCard to add a PDF download button to published lesson cards.
     * @type {{ blob_name: string, share_url: string, lesson_count: number, pdfUrl: string } | null}
     */
    let currentReport = null;

    /**
     * Lesson ids checked for bulk publishing on the Accepted tab.
     * Cleared whenever the tab or year filter changes.
     * @type {Set<number>}
     */
    const selectedIds = new Set();

    /**
     * Active audience filter: '' (all), 'internal', or 'committee'.
     * @type {string}
     */
    let currentAudience = '';

    // ─────────────────────────────────────────────
    //  Bootstrap modal references (lazy)
    // ─────────────────────────────────────────────

    /** @returns {bootstrap.Modal} */
    function newModal()     { return bootstrap.Modal.getOrCreateInstance(document.getElementById('ll-new-modal')); }
    /** @returns {bootstrap.Modal} */
    function editModal()    { return bootstrap.Modal.getOrCreateInstance(document.getElementById('ll-edit-modal')); }
    /** @returns {bootstrap.Modal} */
    function publishModal() { return bootstrap.Modal.getOrCreateInstance(document.getElementById('ll-publish-modal')); }
    /** @returns {bootstrap.Modal} */
    function deleteModal()  { return bootstrap.Modal.getOrCreateInstance(document.getElementById('ll-delete-modal')); }

    // ─────────────────────────────────────────────
    //  Helpers
    // ─────────────────────────────────────────────

    /**
     * Fetch JSON from an API endpoint, including CSRF header on mutating methods.
     *
     * @param {string} url
     * @param {{ method?: string, body?: object }} [opts]
     * @returns {Promise<any>}
     */
    async function apiFetch(url, opts = {}) {
        const method  = (opts.method || 'GET').toUpperCase();
        const headers = { 'Accept': 'application/json' };
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
            headers['CSRF-Token']    = meta.csrfToken;
            headers['Content-Type']  = 'application/json';
        }
        const res = await fetch(url, {
            method,
            headers,
            body: opts.body ? JSON.stringify(opts.body) : undefined,
        });
        return res.json();
    }

    /**
     * Upload a single file as multipart/form-data to a lessons photo endpoint.
     *
     * @param {number} lessonId
     * @param {File}   file
     * @returns {Promise<any>}
     */
    async function uploadPhotoFile(lessonId, file) {
        const fd = new FormData();
        fd.append('photo', file);
        const res = await fetch(`/api/lessons-learned/${lessonId}/photos`, {
            method:  'POST',
            headers: { 'CSRF-Token': meta.csrfToken },
            body:    fd,
        });
        return res.json();
    }

    /**
     * Format a UTC DATETIME2 string for display.
     *
     * @param {string|null} iso
     * @returns {string}
     */
    function fmtDate(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
        });
    }

    /**
     * Truncate a string to maxLen characters, appending ellipsis if needed.
     *
     * @param {string} str
     * @param {number} maxLen
     * @returns {string}
     */
    function truncate(str, maxLen) {
        if (!str) return '';
        return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
    }

    /**
     * Escape HTML special characters for safe insertion into innerHTML.
     *
     * @param {string} str
     * @returns {string}
     */
    function esc(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Set the disabled + spinner state on a submit button.
     *
     * @param {HTMLElement} btn
     * @param {boolean}     loading
     */
    function setLoading(btn, loading) {
        btn.disabled = loading;
        btn.querySelector('.ll-submit-spinner')?.classList.toggle('d-none', !loading);
        btn.querySelector('.ll-submit-label')?.classList.toggle('opacity-50', loading);
    }

    /**
     * Show an error message in an alert element.
     *
     * @param {HTMLElement} el
     * @param {string}      msg
     */
    function showError(el, msg) {
        el.textContent = msg;
        el.classList.remove('d-none');
    }

    /**
     * Clear an error alert element.
     *
     * @param {HTMLElement} el
     */
    function clearError(el) {
        el.textContent = '';
        el.classList.add('d-none');
    }

    /**
     * Return a Bootstrap badge string for a lesson status.
     *
     * @param {'submitted'|'approved'|'published'} status
     * @param {boolean} archived
     * @returns {string}
     */
    function statusBadge(status, archived) {
        if (archived) {
            return `<span class="badge bg-secondary ll-badge-archived">Archived</span>`;
        }
        const map = {
            submitted: ['bg-secondary', 'Proposed'],
            approved:  ['bg-info text-dark', 'Accepted'],
            published: ['bg-success', 'Published'],
        };
        const [cls, label] = map[status] || ['bg-secondary', status];
        return `<span class="badge ${cls} ll-badge-${status}">${label}</span>`;
    }

    // ─────────────────────────────────────────────
    //  Populate selects
    // ─────────────────────────────────────────────

    /**
     * Populate a year <select> element from cachedYears.
     *
     * @param {HTMLSelectElement} sel
     * @param {number|null}       [selected]
     */
    function populateYearSelect(sel, selected = null) {
        const current = selected || Number(sel.value) || null;
        sel.innerHTML = '';
        if (sel.id === 'll-year-filter') {
            sel.appendChild(Object.assign(document.createElement('option'), { value: '', textContent: 'All years' }));
        }
        cachedYears.forEach((y) => {
            const opt = document.createElement('option');
            opt.value = String(y);
            opt.textContent = String(y);
            if (y === current) opt.selected = true;
            sel.appendChild(opt);
        });
    }

    /**
     * Populate a department <select> element from cachedDepts.
     * Includes a blank option and an "Other" sentinel.
     *
     * @param {HTMLSelectElement} sel
     * @param {number|null}       [selectedId]
     */
    function populateDeptSelect(sel, selectedId = null) {
        sel.innerHTML = '';
        sel.appendChild(Object.assign(document.createElement('option'), { value: '', textContent: '— Select department —' }));
        cachedDepts.forEach((d) => {
            const opt = document.createElement('option');
            opt.value = String(d.id);
            opt.textContent = d.display_name;
            if (d.id === selectedId) opt.selected = true;
            sel.appendChild(opt);
        });
        const other = document.createElement('option');
        other.value = 'other';
        other.textContent = 'Other…';
        if (selectedId === null || selectedId === 'other') other.selected = (selectedId === 'other');
        sel.appendChild(other);
    }

    // ─────────────────────────────────────────────
    //  Load filter options
    // ─────────────────────────────────────────────

    /**
     * Load years and departments from the API and populate all relevant selects.
     *
     * @returns {Promise<void>}
     */
    async function loadFilterOptions() {
        const [yearsRes, deptsRes] = await Promise.all([
            apiFetch('/api/lessons-learned/years'),
            apiFetch('/api/lessons-learned/departments'),
        ]);

        if (yearsRes.success) {
            cachedYears = yearsRes.years || [];
            populateYearSelect(document.getElementById('ll-year-filter'));
            populateYearSelect(document.getElementById('ll-new-year'));
            populateYearSelect(document.getElementById('ll-edit-year'));
        }

        if (deptsRes.success) {
            cachedDepts = deptsRes.departments || [];
            populateDeptSelect(document.getElementById('ll-new-dept'));
            populateDeptSelect(document.getElementById('ll-edit-dept'));
        }
    }

    // ─────────────────────────────────────────────
    //  Load + render lessons
    // ─────────────────────────────────────────────

    /**
     * Fetch lessons for the current tab and year filter and render them.
     *
     * @returns {Promise<void>}
     */
    async function loadLessons() {
        const container = document.getElementById('ll-cards');
        container.innerHTML = '<div class="ll-loading"><div class="spinner-border spinner-border-sm text-secondary me-2" role="status"></div>Loading…</div>';

        const params = new URLSearchParams({ tab: currentTab });
        if (currentYear) params.set('year', String(currentYear));
        if (currentAudience) params.set('audience', currentAudience);

        const data = await apiFetch(`/api/lessons-learned?${params}`);
        if (!data.success) {
            container.innerHTML = '<div class="ll-empty text-danger">Failed to load lessons.</div>';
            return;
        }

        const lessons = data.lessons || [];
        const emptyLabel = currentTab === 'accepted' ? 'accepted' : currentTab === 'published' ? 'published' : currentTab === 'archived' ? 'archived' : 'proposed';
        if (lessons.length === 0) {
            container.innerHTML = `<div class="ll-empty"><i class="fa-solid fa-inbox me-2 text-secondary"></i>No ${emptyLabel} lessons yet.</div>`;
        } else {
            container.innerHTML = '';
            lessons.forEach((l) => container.appendChild(buildCard(l)));
        }

        // Show/hide report link on accepted tab
        updateReportLink(currentYear);

        // Bulk-publish bar is only meaningful on the Accepted tab
        updateBulkBar();
    }

    /**
     * Fetch and display the report link for the given year (accepted tab).
     *
     * @param {number|null} year
     * @returns {Promise<void>}
     */
    async function updateReportLink(year) {
        const wrap = document.getElementById('ll-report-link-wrap');
        wrap.classList.add('d-none');
        wrap.innerHTML     = '';
        if (currentTab !== 'published' || !year) return;

        const data = await apiFetch(`/api/lessons-learned/report/${year}`);
        if (data.success && data.report) {
            wrap.classList.remove('d-none');
            const pdfUrl = `/lessons-learned/pdf/${year}`;
            wrap.innerHTML = `
              <a class="btn btn-sm btn-outline-success ll-report-link" href="${esc(pdfUrl)}" target="_blank" rel="noopener">
                <i class="fa-solid fa-file-pdf me-1"></i>Download ${year} Report
              </a>
              ${meta.isOverseer ? `<button class="btn btn-sm btn-outline-primary ll-batch-publish-btn ms-1" data-year="${year}" type="button">
                <i class="fa-solid fa-rotate me-1"></i>Re-generate
              </button>` : ''}`;
            // Wire batch-publish button if rendered
            wrap.querySelector('.ll-batch-publish-btn')?.addEventListener('click', () =>
                batchPublish(year)
            );
            // Cache for card builder
            currentReport = data.report;
            currentReport.pdfUrl = pdfUrl;
        } else {
            currentReport = null;
            if (meta.isOverseer) {
                wrap.classList.remove('d-none');
                wrap.innerHTML = `<button class="btn btn-sm btn-outline-primary ll-batch-publish-btn" data-year="${year}" type="button">
                  <i class="fa-solid fa-file-arrow-up me-1"></i>Generate Report
                </button>`;
                wrap.querySelector('.ll-batch-publish-btn')?.addEventListener('click', () =>
                    batchPublish(year)
                );
            }
        }
    }

    /**
     * Trigger a batch-publish (PDF regeneration) for a given year.
     * Posts to the batch-publish endpoint, refreshes the report link and
     * re-renders cards so the PDF button appears immediately.
     *
     * @param {number} year
     * @returns {Promise<void>}
     */
    async function batchPublish(year) {
        const btn = document.querySelector('.ll-batch-publish-btn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generating\u2026'; }
        try {
            const data = await apiFetch('/api/lessons-learned/batch-publish', {
                method: 'POST',
                body:   { year },
            });
            if (!data.success) throw new Error(data.message || 'Batch publish failed.');
            // Refresh the report link + card PDF buttons
            await updateReportLink(year);
            await loadLessons();
        } catch (err) {
            alert(`Report generation failed: ${err.message}`);
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate me-1"></i>Re-generate'; }
        }
    }

    // ─────────────────────────────────────────────
    //  Bulk publish (Accepted tab)
    // ─────────────────────────────────────────────

    /**
     * Show or hide the bulk-publish bar and sync its counter, select-all state,
     * and button enablement against the current selection.
     *
     * @returns {void}
     */
    function updateBulkBar() {
        const bar = document.getElementById('ll-bulk-bar');
        if (!bar) return;

        const boxes  = Array.from(document.querySelectorAll('.ll-bulk-check'));
        const active = currentTab === 'accepted' && meta.isOverseer && boxes.length > 0;

        bar.classList.toggle('d-none', !active);
        if (!active) return;

        // Drop ids that are no longer on screen (year filter changed, etc.)
        const visible = new Set(boxes.map((b) => Number(b.dataset.id)));
        selectedIds.forEach((id) => { if (!visible.has(id)) selectedIds.delete(id); });

        const count   = selectedIds.size;
        const allBox  = document.getElementById('ll-bulk-all');
        const pubBtn  = document.getElementById('ll-bulk-publish');

        document.getElementById('ll-bulk-count').textContent =
            `${count} selected`;

        allBox.checked       = count > 0 && count === boxes.length;
        allBox.indeterminate = count > 0 && count < boxes.length;
        pubBtn.disabled      = count === 0;
    }

    /**
     * Publish every checked lesson in one request, then regenerate the PDF once.
     *
     * @returns {Promise<void>}
     */
    async function handleBulkPublish() {
        const ids = Array.from(selectedIds);
        if (!ids.length) return;

        const year = currentYear
            || Number(document.querySelector('.ll-bulk-check')?.closest('.ll-card')?.dataset.year)
            || new Date().getFullYear();

        if (!confirm(`Publish ${ids.length} lesson${ids.length === 1 ? '' : 's'} and regenerate the ${year} report?`)) {
            return;
        }

        const btn = document.getElementById('ll-bulk-publish');
        btn.disabled  = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Publishing…';

        try {
            const res = await apiFetch('/api/lessons-learned/publish-selected', {
                method: 'POST',
                body:   { year, ids },
            });
            if (!res.success) throw new Error(res.message || 'Publish failed.');

            selectedIds.clear();
            await loadLessons();
        } catch (err) {
            alert(`Publish failed: ${err.message}`);
        } finally {
            btn.disabled  = false;
            btn.innerHTML = '<i class="fa-solid fa-file-arrow-up me-1"></i>Publish selected';
        }
    }

    // ─────────────────────────────────────────────
    //  Card builder
    // ─────────────────────────────────────────────

    /**
     * Build a lesson card DOM element.
     *
     * @param {object} l  Lesson row from the API.
     * @returns {HTMLElement}
     */
    function buildCard(l) {
        const isOwner      = Number(meta.userId) === l.submitted_by;
        const canEdit      = (meta.isOverseer || isOwner) && !l.archived;
        const canApprove   = meta.isOverseer && l.status === 'submitted' && !l.archived;
        const canPublish   = meta.isOverseer && l.status !== 'published' && !l.archived;
        const canArchive   = meta.isOverseer && !l.archived && l.status !== 'published';
        const canUnarchive = meta.isOverseer && !!l.archived;
        const showCheckbox = meta.isOverseer && currentTab === 'accepted'
                             && l.status === 'approved' && !l.archived;
        const canDelete    = meta.isOverseer;
        const canUnpublish = meta.isOverseer && l.status === 'published' && !l.archived;
        const canUnapprove = meta.isOverseer && l.status === 'approved'  && !l.archived;

        const dept = esc(l.department_name || l.department_other || 'General');

        const card = document.createElement('div');
        card.className = 'll-card';
        card.dataset.lessonId = String(l.id);
        card.dataset.year     = String(l.year);
        card.dataset.status   = String(l.status);

        // ── Action buttons ────────────────────────────────────────
        let actionBtns = '';
        if (canEdit) {
            actionBtns += `<button class="btn btn-sm btn-outline-secondary ll-edit-btn" data-id="${l.id}" type="button">
              <i class="fa-solid fa-pencil me-1"></i>Edit
            </button>`;
        }
        if (canApprove) {
            actionBtns += `<button class="btn btn-sm btn-outline-info ll-approve-btn" data-id="${l.id}" type="button">
              <i class="fa-solid fa-circle-check me-1"></i>Approve
            </button>`;
        }
        if (canPublish) {
            actionBtns += `<button class="btn btn-sm btn-outline-success ll-publish-btn" data-id="${l.id}" type="button">
              <i class="fa-solid fa-file-arrow-up me-1"></i>Publish
            </button>`;
        }
        if (canArchive) {
            actionBtns += `<button class="btn btn-sm btn-outline-warning ll-archive-btn" data-id="${l.id}" type="button">
              <i class="fa-solid fa-box-archive me-1"></i>Archive
            </button>`;
        }
        if (canUnarchive) {
            actionBtns += `<button class="btn btn-sm btn-outline-secondary ll-unarchive-btn" data-id="${l.id}" type="button">
              <i class="fa-solid fa-box-open me-1"></i>Unarchive
            </button>`;
        }
        if (canUnapprove) {
            actionBtns += `<button class="btn btn-sm btn-outline-secondary ll-unapprove-btn" data-id="${l.id}" type="button">
              <i class="fa-solid fa-rotate-left me-1"></i>Un-accept
            </button>`;
        }
        if (canUnpublish) {
            actionBtns += `<button class="btn btn-sm btn-outline-warning ll-unpublish-btn" data-id="${l.id}" type="button">
              <i class="fa-solid fa-rotate-left me-1"></i>Un-publish
            </button>`;
        }
        if (canDelete) {
            actionBtns += `<button class="btn btn-sm btn-outline-danger ll-delete-btn" data-id="${l.id}" type="button">
              <i class="fa-solid fa-trash me-1"></i>Delete
            </button>`;
        }
        // PDF download button on published cards when a report exists
        if (l.status === 'published' && currentReport?.pdfUrl) {
            actionBtns += `<a class="btn btn-sm btn-outline-success ll-pdf-link" href="${esc(currentReport.pdfUrl)}" target="_blank" rel="noopener">
              <i class="fa-solid fa-file-pdf me-1"></i>Report PDF
            </a>`;
        }

        card.innerHTML = `
          <div class="ll-card-summary" tabindex="0" role="button" aria-expanded="false"
               data-id="${l.id}" aria-controls="ll-detail-${l.id}">
            ${showCheckbox ? `<input type="checkbox" class="form-check-input ll-bulk-check"
                 data-id="${l.id}" aria-label="Select this lesson for publishing"
                 ${selectedIds.has(l.id) ? 'checked' : ''}>` : ''}
            <div class="ll-card-badges">
              ${statusBadge(l.status, l.archived)}
              <span class="badge bg-light text-dark border">${esc(String(l.year))}</span>
              ${l.photo_count > 0 ? `<span class="badge bg-light text-dark border"><i class="fa-solid fa-image me-1"></i>${l.photo_count}</span>` : ''}
              <span class="ll-audience-badges">
                ${l.is_internal  ? '<span class="badge bg-secondary-subtle text-secondary-emphasis border">Internal</span>' : ''}
                ${l.is_committee ? '<span class="badge bg-primary-subtle text-primary-emphasis border">Committee</span>' : ''}
              </span>
            </div>
            <div class="ll-card-body">
              <div class="ll-card-dept">${dept}</div>
              <div class="ll-card-preview">${esc(truncate(l.notes, 140))}</div>
              <div class="ll-card-meta">
                Submitted by ${esc(l.submitted_by_name)} &bull; ${fmtDate(l.submitted_at)}
                ${l.archived && l.archived_by_name ? `&bull; <span class="text-muted">Archived by ${esc(l.archived_by_name)} on ${fmtDate(l.archived_at)}</span>` : ''}
              </div>
            </div>
            ${actionBtns ? `<div class="ll-card-actions">${actionBtns}</div>` : ''}
            <i class="fa-solid fa-chevron-down ll-card-chevron"></i>
          </div>
          <div class="ll-card-detail" id="ll-detail-${l.id}">
            <div class="ll-detail-loading text-secondary small">
              <div class="spinner-border spinner-border-sm me-1" role="status"></div>Loading…
            </div>
          </div>`;

        return card;
    }

    // ─────────────────────────────────────────────
    //  Card expand / detail
    // ─────────────────────────────────────────────

    /**
     * Toggle expansion of a lesson card, loading detail on first open.
     *
     * @param {HTMLElement} summaryEl
     */
    async function toggleExpand(summaryEl) {
        const id   = Number(summaryEl.dataset.id);
        const card = summaryEl.closest('.ll-card');
        const isExpanded = card.classList.contains('ll-expanded');

        if (isExpanded) {
            card.classList.remove('ll-expanded');
            summaryEl.setAttribute('aria-expanded', 'false');
            return;
        }

        card.classList.add('ll-expanded');
        summaryEl.setAttribute('aria-expanded', 'true');

        const detail = card.querySelector('.ll-card-detail');
        if (!detail.querySelector('.ll-detail-loading')) return; // already loaded

        await renderDetail(id, detail, card);
    }

    /**
     * Load full lesson detail (notes, photos, comments, audit) into the detail panel.
     *
     * @param {number}      id
     * @param {HTMLElement} detail
     * @param {HTMLElement} card
     */
    async function renderDetail(id, detail, card) {
        const [listRes, photosRes] = await Promise.all([
            apiFetch(`/api/lessons-learned?tab=${currentTab}${currentYear ? '&year=' + currentYear : ''}`),
            apiFetch(`/api/lessons-learned/${id}/photos`),
        ]);

        const lesson  = (listRes.lessons || []).find((x) => x.id === id) || null;
        const photos  = photosRes.success ? (photosRes.photos || []) : [];
        const isOwner = Number(meta.userId) === (lesson?.submitted_by);
        const canEdit = (meta.isOverseer || isOwner) && !lesson?.archived;

        let commentsBlock = '';
        if (lesson?.overseer_comments) {
            commentsBlock = `
              <div class="ll-comments-block mb-3">
                <div class="ll-detail-label">Overseer Comments</div>
                <div class="ll-comments-text">${esc(lesson.overseer_comments)}</div>
              </div>`;
        }

        let photosBlock = buildPhotosBlock(id, photos, canEdit);

        // Audience flags — OVERSEER+ only, and never on archived lessons.
        // The sole checked box is disabled so CK_ll_audience can't be violated.
        const canFlag   = meta.isOverseer && !lesson?.archived;
        const internal  = !!lesson?.is_internal;
        const committee = !!lesson?.is_committee;
        const lockHint  = 'A lesson must be Internal, Committee, or both';

        const audienceBlock = `
          <div class="ll-audience-block mb-3">
            <div class="ll-detail-label">Audience</div>
            <div class="form-check form-check-inline">
              <input class="form-check-input ll-flag-check" type="checkbox"
                     id="ll-flag-internal-${id}" data-id="${id}" data-flag="internal"
                     ${internal ? 'checked' : ''}
                     ${!canFlag || (internal && !committee) ? 'disabled' : ''}
                     ${canFlag && internal && !committee ? `title="${lockHint}"` : ''}>
              <label class="form-check-label" for="ll-flag-internal-${id}">Internal</label>
            </div>
            <div class="form-check form-check-inline">
              <input class="form-check-input ll-flag-check" type="checkbox"
                     id="ll-flag-committee-${id}" data-id="${id}" data-flag="committee"
                     ${committee ? 'checked' : ''}
                     ${!canFlag || (committee && !internal) ? 'disabled' : ''}
                     ${canFlag && committee && !internal ? `title="${lockHint}"` : ''}>
              <label class="form-check-label" for="ll-flag-committee-${id}">Committee</label>
            </div>
          </div>`;

        let auditItems = [
            `<span><i class="fa-solid fa-user me-1"></i>Submitted by ${esc(lesson?.submitted_by_name || '—')} on ${fmtDate(lesson?.submitted_at)}</span>`,
        ];
        if (lesson?.approved_by_name) {
            auditItems.push(`<span><i class="fa-solid fa-circle-check me-1 text-info"></i>Approved by ${esc(lesson.approved_by_name)} on ${fmtDate(lesson.approved_at)}</span>`);
        }
        if (lesson?.published_by_name) {
            auditItems.push(`<span><i class="fa-solid fa-file-arrow-up me-1 text-success"></i>Published by ${esc(lesson.published_by_name)} on ${fmtDate(lesson.published_at)}</span>`);
        }
        if (lesson?.archived && lesson?.archived_by_name) {
            auditItems.push(`<span><i class="fa-solid fa-box-archive me-1 text-warning"></i>Archived by ${esc(lesson.archived_by_name)} on ${fmtDate(lesson.archived_at)}</span>`);
        }

        detail.innerHTML = `
          <div class="ll-detail-label">Lesson / Observation</div>
          <div class="ll-detail-notes mb-3">${esc(lesson?.notes || '')}</div>
          ${audienceBlock}
          ${commentsBlock}
          ${photosBlock}
          <div class="ll-audit">${auditItems.join('')}</div>`;
    }

    /**
     * Build the photo gallery HTML for a lesson's detail panel.
     *
     * @param {number}   lessonId
     * @param {object[]} photos
     * @param {boolean}  canEdit
     * @returns {string}
     */
    function buildPhotosBlock(lessonId, photos, canEdit) {
        let thumbs = '';
        photos.forEach((p) => {
            const src = `/api/lessons-learned/photos/${encodeURIComponent(p.blob_name)}`;
            thumbs += `
              <div class="ll-photo-wrap">
                <img class="ll-photo-thumb" src="${esc(src)}" alt="${esc(p.original_filename)}"
                     data-src="${esc(src)}" loading="lazy">
                ${canEdit ? `<button class="btn btn-danger btn-sm ll-photo-delete"
                  data-lesson-id="${lessonId}" data-photo-id="${p.id}" type="button"
                  aria-label="Delete photo">
                  <i class="fa-solid fa-times"></i>
                </button>` : ''}
              </div>`;
        });

        const addBtn = canEdit ? `
          <div class="ll-photo-add-wrap mt-2">
            <input type="file" class="form-control form-control-sm ll-photo-file"
                   accept="image/*" multiple data-lesson-id="${lessonId}"
                   style="max-width:260px">
            <button class="btn btn-sm btn-outline-secondary ll-photo-upload-btn"
                    data-lesson-id="${lessonId}" type="button">
              <i class="fa-solid fa-upload me-1"></i>Upload
            </button>
          </div>` : '';

        return `
          <div class="ll-detail-label">Photos <small class="text-muted fw-normal">(${photos.length})</small></div>
          <div class="ll-photos-grid mb-2" id="ll-photos-${lessonId}">${thumbs}</div>
          ${addBtn}`;
    }

    // ─────────────────────────────────────────────
    //  New lesson
    // ─────────────────────────────────────────────

    /** Open the new lesson modal. */
    function openNewModal() {
        document.getElementById('ll-new-year').value    = '';
        document.getElementById('ll-new-dept').value    = '';
        document.getElementById('ll-new-dept-other').value = '';
        document.getElementById('ll-new-notes').value   = '';
        document.getElementById('ll-new-photos').value  = '';
        document.getElementById('ll-new-dept-other-wrap').classList.add('d-none');
        clearError(document.getElementById('ll-new-error'));
        newModal().show();
    }

    /**
     * Submit the new lesson form: POST lesson, then upload any queued photos.
     *
     * @returns {Promise<void>}
     */
    async function handleNewLesson() {
        const btn    = document.getElementById('ll-new-submit');
        const errEl  = document.getElementById('ll-new-error');
        clearError(errEl);

        const year    = document.getElementById('ll-new-year').value;
        const deptSel = document.getElementById('ll-new-dept').value;
        const deptOther = document.getElementById('ll-new-dept-other').value.trim();
        const notes   = document.getElementById('ll-new-notes').value.trim();
        const files   = document.getElementById('ll-new-photos').files;

        if (!year)  { showError(errEl, 'Please select a convention year.'); return; }
        if (!notes) { showError(errEl, 'Please enter a lesson or observation.'); return; }
        if (deptSel === 'other' && !deptOther) { showError(errEl, 'Please specify the department.'); return; }

        setLoading(btn, true);
        try {
            const res = await apiFetch('/api/lessons-learned', {
                method: 'POST',
                body: {
                    year,
                    departmentId:    deptSel && deptSel !== 'other' ? deptSel : null,
                    departmentOther: deptSel === 'other' ? deptOther : null,
                    notes,
                },
            });

            if (!res.success) {
                showError(errEl, res.message || 'Failed to create lesson.');
                return;
            }

            // Upload photos — non-fatal: a failure here must not block the
            // modal close or card refresh. Collect failures and warn after.
            let photoFailCount = 0;
            if (files && files.length > 0) {
                for (const file of Array.from(files)) {
                    try {
                        await uploadPhotoFile(res.lesson.id, file);
                    } catch {
                        photoFailCount++;
                    }
                }
            }

            // Always close the modal and refresh cards regardless of photo outcome
            newModal().hide();
            await loadLessons();

            if (photoFailCount > 0) {
                // Brief inline warning — the lesson is saved, only photos failed
                const warn = document.createElement('div');
                warn.className = 'alert alert-warning alert-dismissible fade show mt-2';
                warn.setAttribute('role', 'alert');
                warn.innerHTML = `<i class="fa-solid fa-triangle-exclamation me-2"></i>
                    ${photoFailCount} photo${photoFailCount > 1 ? 's' : ''} could not be uploaded.
                    You can add them via the Edit button on the lesson.
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
                document.getElementById('ll-cards').before(warn);
                setTimeout(() => warn.remove(), 8000);
            }
        } catch {
            showError(errEl, 'An unexpected error occurred.');
        } finally {
            setLoading(btn, false);
        }
    }

    // ─────────────────────────────────────────────
    //  Edit lesson
    // ─────────────────────────────────────────────

    /**
     * Open the edit modal pre-populated with a lesson's current values.
     *
     * @param {number} id
     * @returns {Promise<void>}
     */
    async function handleEditOpen(id) {
        const params  = new URLSearchParams({ tab: currentTab });
        if (currentYear) params.set('year', String(currentYear));
        const listRes = await apiFetch(`/api/lessons-learned?${params}`);
        const lesson  = (listRes.lessons || []).find((l) => l.id === id);
        if (!lesson) return;

        document.getElementById('ll-edit-id').value          = String(id);
        document.getElementById('ll-edit-notes').value       = lesson.notes || '';
        document.getElementById('ll-edit-comments').value    = lesson.overseer_comments || '';

        const yearSel = document.getElementById('ll-edit-year');
        populateYearSelect(yearSel, lesson.year);

        const deptSel = document.getElementById('ll-edit-dept');
        const isOther = !lesson.department_id && lesson.department_other;
        populateDeptSelect(deptSel, isOther ? 'other' : lesson.department_id);
        document.getElementById('ll-edit-dept-other').value = lesson.department_other || '';
        document.getElementById('ll-edit-dept-other-wrap').classList.toggle('d-none', !isOther);
        deptSel.value = isOther ? 'other' : (lesson.department_id ? String(lesson.department_id) : '');

        document.getElementById('ll-edit-comments-wrap').classList.toggle('d-none', !meta.isOverseer);

        clearError(document.getElementById('ll-edit-error'));
        editModal().show();
    }

    /**
     * Save changes from the edit modal.
     *
     * @returns {Promise<void>}
     */
    async function handleEditSave() {
        const btn   = document.getElementById('ll-edit-submit');
        const errEl = document.getElementById('ll-edit-error');
        clearError(errEl);

        const id      = Number(document.getElementById('ll-edit-id').value);
        const year    = document.getElementById('ll-edit-year').value;
        const deptSel = document.getElementById('ll-edit-dept').value;
        const deptOther = document.getElementById('ll-edit-dept-other').value.trim();
        const notes   = document.getElementById('ll-edit-notes').value.trim();
        const comments = document.getElementById('ll-edit-comments').value;

        if (!notes) { showError(errEl, 'Lesson notes cannot be empty.'); return; }
        if (deptSel === 'other' && !deptOther) { showError(errEl, 'Please specify the department.'); return; }

        setLoading(btn, true);
        try {
            const res = await apiFetch(`/api/lessons-learned/${id}`, {
                method: 'PUT',
                body: {
                    year,
                    departmentId:     deptSel && deptSel !== 'other' ? deptSel : null,
                    departmentOther:  deptSel === 'other' ? deptOther : null,
                    notes,
                    overseerComments: comments || null,
                },
            });

            if (!res.success) { showError(errEl, 'Failed to save.'); return; }
            editModal().hide();
            await loadLessons();
        } catch {
            showError(errEl, 'An unexpected error occurred.');
        } finally {
            setLoading(btn, false);
        }
    }

    // ─────────────────────────────────────────────
    //  Approve
    // ─────────────────────────────────────────────

    /**
     * Approve a lesson (OVERSEER+ only).
     *
     * @param {number} id
     * @returns {Promise<void>}
     */
    async function handleApprove(id) {
        const btn = document.querySelector(`.ll-approve-btn[data-id="${id}"]`);
        if (btn) btn.disabled = true;
        try {
            const res = await apiFetch(`/api/lessons-learned/${id}/approve`, { method: 'POST' });
            if (res.success) {
                await loadLessons();
            } else {
                alert(res.message || 'Could not approve lesson.');
            }
        } catch {
            alert('An unexpected error occurred.');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ─────────────────────────────────────────────
    //  Publish
    // ─────────────────────────────────────────────

    /**
     * Open the publish confirmation modal for a lesson.
     *
     * @param {number} id
     */
    function handlePublishOpen(id) {
        document.getElementById('ll-publish-id').value = String(id);
        clearError(document.getElementById('ll-publish-error'));
        publishModal().show();
    }

    /**
     * Confirm and execute lesson publish (triggers PDF generation).
     *
     * @returns {Promise<void>}
     */
    async function handlePublish() {
        const btn   = document.getElementById('ll-publish-confirm');
        const errEl = document.getElementById('ll-publish-error');
        const id    = Number(document.getElementById('ll-publish-id').value);
        clearError(errEl);
        setLoading(btn, true);

        try {
            const res = await apiFetch(`/api/lessons-learned/${id}/publish`, { method: 'POST' });
            if (!res.success) {
                showError(errEl, res.message || 'Publish failed.');
                return;
            }
            publishModal().hide();
            await loadLessons();
        } catch {
            showError(errEl, 'An unexpected error occurred.');
        } finally {
            setLoading(btn, false);
        }
    }

    // ─────────────────────────────────────────────
    //  Audience flags
    // ─────────────────────────────────────────────

    /**
     * Sync checkbox and badge state for a lesson without re-rendering the
     * card, so the detail panel stays expanded after a toggle.
     *
     * @param {HTMLElement} card
     * @param {boolean}     isInternal
     * @param {boolean}     isCommittee
     * @returns {void}
     */
    function applyFlagState(card, isInternal, isCommittee) {
        const detail = card.querySelector('.ll-card-detail');
        const ib = detail?.querySelector('.ll-flag-check[data-flag="internal"]');
        const cb = detail?.querySelector('.ll-flag-check[data-flag="committee"]');

        if (ib) { ib.checked = isInternal;  ib.disabled = isInternal  && !isCommittee; }
        if (cb) { cb.checked = isCommittee; cb.disabled = isCommittee && !isInternal;  }

        const wrap = card.querySelector('.ll-audience-badges');
        if (wrap) {
            wrap.innerHTML =
                (isInternal  ? '<span class="badge bg-secondary-subtle text-secondary-emphasis border">Internal</span>' : '') +
                (isCommittee ? '<span class="badge bg-primary-subtle text-primary-emphasis border">Committee</span>' : '');
        }
    }

    /**
     * Persist an audience flag change.
     *
     * @param {number} id
     * @param {string} flag     'internal' or 'committee'
     * @param {boolean} checked New state of the toggled box.
     * @returns {Promise<void>}
     */
    async function handleFlagToggle(id, flag, checked) {
        const card   = document.querySelector(`.ll-card[data-lesson-id="${id}"]`);
        const detail = card?.querySelector('.ll-card-detail');
        const ib = detail?.querySelector('.ll-flag-check[data-flag="internal"]');
        const cb = detail?.querySelector('.ll-flag-check[data-flag="committee"]');

        const isInternal  = flag === 'internal'  ? checked : !!ib?.checked;
        const isCommittee = flag === 'committee' ? checked : !!cb?.checked;

        try {
            const res = await apiFetch(`/api/lessons-learned/${id}/flags`, {
                method: 'PATCH',
                body:   { isInternal, isCommittee },
            });
            if (res.success) {
                applyFlagState(card, res.isInternal, res.isCommittee);
            } else {
                alert(res.message || 'Could not update audience.');
                applyFlagState(card, !!ib?.defaultChecked, !!cb?.defaultChecked);
            }
        } catch {
            alert('An unexpected error occurred.');
        }
    }

    // ─────────────────────────────────────────────
    //  Revert status
    // ─────────────────────────────────────────────

    /**
     * Return a published lesson to Accepted and regenerate the year's PDF.
     * Confirmed inline because it rewrites the distributed report.
     *
     * @param {number} id
     * @returns {Promise<void>}
     */
    async function handleUnpublish(id) {
        const card = document.querySelector(`.ll-card[data-lesson-id="${id}"]`);
        const year = card?.dataset.year || '';
        if (!confirm(`Un-publish this lesson? The ${year} report will be regenerated without it and re-uploaded to blob storage and SharePoint.`)) {
            return;
        }

        const btn = document.querySelector(`.ll-unpublish-btn[data-id="${id}"]`);
        if (btn) btn.disabled = true;
        try {
            const res = await apiFetch(`/api/lessons-learned/${id}/unpublish`, { method: 'POST' });
            if (res.success) {
                await loadLessons();
            } else {
                alert(res.message || 'Could not un-publish lesson.');
            }
        } catch {
            alert('An unexpected error occurred.');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /**
     * Return an accepted lesson to Proposed.
     *
     * @param {number} id
     * @returns {Promise<void>}
     */
    async function handleUnapprove(id) {
        const btn = document.querySelector(`.ll-unapprove-btn[data-id="${id}"]`);
        if (btn) btn.disabled = true;
        try {
            const res = await apiFetch(`/api/lessons-learned/${id}/unapprove`, { method: 'POST' });
            if (res.success) {
                selectedIds.delete(id);
                await loadLessons();
            } else {
                alert(res.message || 'Could not un-accept lesson.');
            }
        } catch {
            alert('An unexpected error occurred.');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ─────────────────────────────────────────────
    //  Delete
    // ─────────────────────────────────────────────

    /**
     * Open the delete confirmation modal, tailoring the warning to the
     * lesson's current stage.
     *
     * @param {number} id
     * @returns {void}
     */
    function handleDeleteOpen(id) {
        const card   = document.querySelector(`.ll-card[data-lesson-id="${id}"]`);
        const status = card?.dataset.status || '';
        const year   = card?.dataset.year   || '';

        document.getElementById('ll-delete-note').textContent =
            status === 'published'
                ? `This lesson is part of the published ${year} report. The PDF will be regenerated and re-uploaded to blob storage and SharePoint.`
                : 'No published report will be affected.';

        document.getElementById('ll-delete-id').value = String(id);
        clearError(document.getElementById('ll-delete-error'));
        deleteModal().show();
    }

    /**
     * Confirm and execute the delete.
     *
     * @returns {Promise<void>}
     */
    async function handleDelete() {
        const btn   = document.getElementById('ll-delete-confirm');
        const errEl = document.getElementById('ll-delete-error');
        const id    = Number(document.getElementById('ll-delete-id').value);
        clearError(errEl);
        setLoading(btn, true);

        try {
            const res = await apiFetch(`/api/lessons-learned/${id}`, { method: 'DELETE' });
            if (!res.success) {
                showError(errEl, res.message || 'Delete failed.');
                return;
            }
            selectedIds.delete(id);
            deleteModal().hide();
            await loadLessons();
        } catch {
            showError(errEl, 'An unexpected error occurred.');
        } finally {
            setLoading(btn, false);
        }
    }

    // ─────────────────────────────────────────────
    //  Archive / unarchive
    // ─────────────────────────────────────────────

    /**
     * Archive a lesson (OVERSEER+ only).
     *
     * @param {number} id
     * @returns {Promise<void>}
     */
    async function handleArchive(id) {
        const btn = document.querySelector(`.ll-archive-btn[data-id="${id}"]`);
        if (btn) btn.disabled = true;
        try {
            const res = await apiFetch(`/api/lessons-learned/${id}/archive`, { method: 'POST' });
            if (res.success) {
                await loadLessons();
            } else {
                alert(res.message || 'Could not archive lesson.');
            }
        } catch {
            alert('An unexpected error occurred.');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /**
     * Unarchive a lesson (OVERSEER+ only).
     *
     * @param {number} id
     * @returns {Promise<void>}
     */
    async function handleUnarchive(id) {
        const btn = document.querySelector(`.ll-unarchive-btn[data-id="${id}"]`);
        if (btn) btn.disabled = true;
        try {
            const res = await apiFetch(`/api/lessons-learned/${id}/unarchive`, { method: 'POST' });
            if (res.success) {
                await loadLessons();
            } else {
                alert(res.message || 'Could not unarchive lesson.');
            }
        } catch {
            alert('An unexpected error occurred.');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ─────────────────────────────────────────────
    //  Photos
    // ─────────────────────────────────────────────

    /**
     * Upload one or more photos for an existing lesson and refresh the gallery.
     *
     * @param {number}   lessonId
     * @param {FileList} files
     * @returns {Promise<void>}
     */
    async function handlePhotoAdd(lessonId, files) {
        if (!files || files.length === 0) return;
        const uploadBtn = document.querySelector(`.ll-photo-upload-btn[data-lesson-id="${lessonId}"]`);
        if (uploadBtn) uploadBtn.disabled = true;

        try {
            for (const file of Array.from(files)) {
                await uploadPhotoFile(lessonId, file);
            }
            await refreshDetailPhotos(lessonId);
        } catch {
            alert('Failed to upload photo.');
        } finally {
            if (uploadBtn) uploadBtn.disabled = false;
        }
    }

    /**
     * Delete a photo and refresh the gallery.
     *
     * @param {number} lessonId
     * @param {number} photoId
     * @returns {Promise<void>}
     */
    async function handlePhotoDelete(lessonId, photoId) {
        if (!confirm('Delete this photo?')) return;
        try {
            const res = await apiFetch(
                `/api/lessons-learned/${lessonId}/photos/${photoId}`,
                { method: 'DELETE' },
            );
            if (res.success) {
                await refreshDetailPhotos(lessonId);
            } else {
                alert('Could not delete photo.');
            }
        } catch {
            alert('An unexpected error occurred.');
        }
    }

    /**
     * Refresh the photo gallery section of an expanded card without a full reload.
     *
     * @param {number} lessonId
     * @returns {Promise<void>}
     */
    async function refreshDetailPhotos(lessonId) {
        const photosRes = await apiFetch(`/api/lessons-learned/${lessonId}/photos`);
        const photos    = photosRes.success ? (photosRes.photos || []) : [];

        const params    = new URLSearchParams({ tab: currentTab });
        if (currentYear) params.set('year', String(currentYear));
        const listRes   = await apiFetch(`/api/lessons-learned?${params}`);
        const lesson    = (listRes.lessons || []).find((l) => l.id === lessonId);
        const isOwner   = Number(meta.userId) === (lesson?.submitted_by);
        const canEdit   = (meta.isOverseer || isOwner) && !lesson?.archived;

        const grid = document.getElementById(`ll-photos-${lessonId}`);
        if (grid) {
            let thumbs = '';
            photos.forEach((p) => {
                const src = `/api/lessons-learned/photos/${encodeURIComponent(p.blob_name)}`;
                thumbs += `
                  <div class="ll-photo-wrap">
                    <img class="ll-photo-thumb" src="${esc(src)}" alt="${esc(p.original_filename)}"
                         data-src="${esc(src)}" loading="lazy">
                    ${canEdit ? `<button class="btn btn-danger btn-sm ll-photo-delete"
                      data-lesson-id="${lessonId}" data-photo-id="${p.id}" type="button"
                      aria-label="Delete photo">
                      <i class="fa-solid fa-times"></i>
                    </button>` : ''}
                  </div>`;
            });
            grid.innerHTML = thumbs;

            const fileInput = document.querySelector(`.ll-photo-file[data-lesson-id="${lessonId}"]`);
            if (fileInput) fileInput.value = '';
        }
    }

    // ─────────────────────────────────────────────
    //  Lightbox
    // ─────────────────────────────────────────────

    /**
     * Open a fullscreen photo lightbox.
     *
     * @param {string} src
     */
    function openLightbox(src) {
        const lb = document.createElement('div');
        lb.className = 'll-lightbox';
        lb.innerHTML = `<img src="${esc(src)}" alt="Photo">`;
        lb.addEventListener('click', () => lb.remove());
        document.body.appendChild(lb);
    }

    // ─────────────────────────────────────────────
    //  Event delegation
    // ─────────────────────────────────────────────

    /**
     * Attach all delegated event listeners to the document.
     */
    function attachListeners() {
        // Tab switching
        document.getElementById('ll-audience-filter')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-ll-audience]');
            if (!btn) return;
            document.querySelectorAll('#ll-audience-filter [data-ll-audience]')
                .forEach((b) => b.classList.toggle('active', b === btn));
            currentAudience = btn.dataset.llAudience;
            selectedIds.clear();
            loadLessons();
        });

        document.getElementById('ll-tab-pills').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-ll-tab]');
            if (!btn) return;
            document.querySelectorAll('[data-ll-tab]').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.dataset.llTab;
            selectedIds.clear();
            loadLessons();
        });

        // Year filter
        document.getElementById('ll-year-filter').addEventListener('change', (e) => {
            currentYear = e.target.value ? Number(e.target.value) : null;
            selectedIds.clear();
            loadLessons();
        });

        // New lesson button
        document.getElementById('ll-new-btn').addEventListener('click', openNewModal);
        document.getElementById('ll-new-submit').addEventListener('click', handleNewLesson);

        // New dept — show/hide Other field
        document.getElementById('ll-new-dept').addEventListener('change', (e) => {
            document.getElementById('ll-new-dept-other-wrap').classList.toggle('d-none', e.target.value !== 'other');
        });

        // Edit dept — show/hide Other field
        document.getElementById('ll-edit-dept').addEventListener('change', (e) => {
            document.getElementById('ll-edit-dept-other-wrap').classList.toggle('d-none', e.target.value !== 'other');
        });

        // Edit submit
        document.getElementById('ll-edit-submit').addEventListener('click', handleEditSave);

        // Publish confirm
        document.getElementById('ll-publish-confirm').addEventListener('click', handlePublish);

        // Bulk publish bar (rendered for OVERSEER+ only)
        document.getElementById('ll-bulk-all')?.addEventListener('change', (e) => {
            selectedIds.clear();
            document.querySelectorAll('.ll-bulk-check').forEach((box) => {
                box.checked = e.target.checked;
                if (e.target.checked) selectedIds.add(Number(box.dataset.id));
            });
            updateBulkBar();
        });
        document.getElementById('ll-bulk-publish')?.addEventListener('click', handleBulkPublish);

        // Delete confirm (modal rendered for OVERSEER+ only)
        document.getElementById('ll-delete-confirm')?.addEventListener('click', handleDelete);

        // Audience flag toggles (change, not click — checkboxes in the detail panel)
        document.getElementById('ll-cards').addEventListener('change', async (e) => {
            const flagBox = e.target.closest('.ll-flag-check');
            if (!flagBox) return;
            await handleFlagToggle(Number(flagBox.dataset.id), flagBox.dataset.flag, flagBox.checked);
        });

        // Card list delegation
        document.getElementById('ll-cards').addEventListener('click', async (e) => {
            const summary      = e.target.closest('.ll-card-summary');
            const editBtn      = e.target.closest('.ll-edit-btn');
            const approveBtn   = e.target.closest('.ll-approve-btn');
            const publishBtn   = e.target.closest('.ll-publish-btn');
            const archiveBtn   = e.target.closest('.ll-archive-btn');
            const unarchiveBtn = e.target.closest('.ll-unarchive-btn');
            const delLessonBtn = e.target.closest('.ll-delete-btn');
            const unpublishBtn = e.target.closest('.ll-unpublish-btn');
            const unapproveBtn = e.target.closest('.ll-unapprove-btn');
            const deleteBtn    = e.target.closest('.ll-photo-delete');
            const uploadBtn    = e.target.closest('.ll-photo-upload-btn');
            const thumb        = e.target.closest('.ll-photo-thumb');
            const bulkCheck    = e.target.closest('.ll-bulk-check');

            if (bulkCheck) {
                e.stopPropagation();
                const id = Number(bulkCheck.dataset.id);
                if (bulkCheck.checked) selectedIds.add(id);
                else                   selectedIds.delete(id);
                updateBulkBar();
                return;
            }
            if (deleteBtn) {
                e.stopPropagation();
                await handlePhotoDelete(Number(deleteBtn.dataset.lessonId), Number(deleteBtn.dataset.photoId));
                return;
            }
            if (uploadBtn) {
                e.stopPropagation();
                const lessonId  = Number(uploadBtn.dataset.lessonId);
                const fileInput = document.querySelector(`.ll-photo-file[data-lesson-id="${lessonId}"]`);
                if (fileInput) await handlePhotoAdd(lessonId, fileInput.files);
                return;
            }
            if (thumb) {
                e.stopPropagation();
                openLightbox(thumb.dataset.src);
                return;
            }
            if (editBtn) {
                e.stopPropagation();
                await handleEditOpen(Number(editBtn.dataset.id));
                return;
            }
            if (approveBtn) {
                e.stopPropagation();
                await handleApprove(Number(approveBtn.dataset.id));
                return;
            }
            if (publishBtn) {
                e.stopPropagation();
                handlePublishOpen(Number(publishBtn.dataset.id));
                return;
            }
            if (archiveBtn) {
                e.stopPropagation();
                await handleArchive(Number(archiveBtn.dataset.id));
                return;
            }
            if (unarchiveBtn) {
                e.stopPropagation();
                await handleUnarchive(Number(unarchiveBtn.dataset.id));
                return;
            }
            if (delLessonBtn) {
                e.stopPropagation();
                handleDeleteOpen(Number(delLessonBtn.dataset.id));
                return;
            }
            if (unpublishBtn) {
                e.stopPropagation();
                await handleUnpublish(Number(unpublishBtn.dataset.id));
                return;
            }
            if (unapproveBtn) {
                e.stopPropagation();
                await handleUnapprove(Number(unapproveBtn.dataset.id));
                return;
            }
            if (summary) {
                await toggleExpand(summary);
            }
        });

        // Keyboard expand on card summary
        document.getElementById('ll-cards').addEventListener('keydown', async (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const summary = e.target.closest('.ll-card-summary');
            if (summary) {
                e.preventDefault();
                await toggleExpand(summary);
            }
        });
    }

    // ─────────────────────────────────────────────
    //  Init
    // ─────────────────────────────────────────────

    /**
     * Bootstrap the page: read meta, attach listeners, load initial data.
     */
    async function init() {
        const metaEl = document.getElementById('ll-meta');
        if (metaEl) {
            try { meta = JSON.parse(metaEl.textContent); } catch { /* keep defaults */ }
        }

        attachListeners();
        await loadFilterOptions();
        await loadLessons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
