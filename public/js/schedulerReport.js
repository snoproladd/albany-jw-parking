/**
 * @file schedulerReport.js
 * @description UI controls for the schedule report page:
 * department visibility filters, day-picker form submission, and print.
 */

document.addEventListener('DOMContentLoaded', () => {

    /**
     * Toggle a department section's visibility when its filter checkbox changes.
     *
     * @param {Event} e
     * @returns {void}
     */
    function onFilterChange(e) {
        const deptKey = e.currentTarget.dataset.dept;
        const section = document.querySelector(`.report-dept[data-dept="${deptKey}"]`);
        if (section) section.style.display = e.currentTarget.checked ? '' : 'none';
    }

    document.querySelectorAll('.dept-filter-cb').forEach((cb) => {
        cb.addEventListener('change', onFilterChange);
    });

    /**
     * Day picker — submit the form when the select value changes.
     * Replaces the removed inline onchange="this.form.submit()".
     *
     * @returns {void}
     */
    const daySelect = document.getElementById('report-day-picker');
    daySelect?.addEventListener('change', () => daySelect.form?.submit());

    /**
     * Print / Save PDF button.
     *
     * @returns {void}
     */
    document.getElementById('report-print-btn')?.addEventListener('click', () => {
        window.print();
    });

    /**
     * Publish button — confirm modal → POST to publish route.
     * Sends CSRF token from <meta name="csrf-token">.
     *
     * @returns {void}
     */
    document.getElementById('publishConfirmBtn')?.addEventListener('click', async () => {
        const dayId  = document.getElementById('report-day-picker')?.value;
        const csrf   = document.querySelector('meta[name="csrf-token"]')?.content || '';
        const btn       = document.getElementById('publishConfirmBtn');
        const errEl     = document.getElementById('publishError');
        const okEl      = document.getElementById('publishSuccess');
        const cancelBtn = document.querySelector('#publishModal .modal-footer .btn-secondary');
        const isDry     = document.getElementById('publishDryRun')?.checked ?? false;

        if (!dayId) return;

        // Reset feedback
        errEl.classList.add('d-none');
        errEl.textContent = '';
        okEl.classList.add('d-none');
        okEl.innerHTML = '';

        // Spinner
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status"></span>${isDry ? 'Testing…' : 'Publishing…'}`;

        try {
            const res = await fetch('/oversight/tools/scheduler/publish', {
                method:  'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'csrf-token':    csrf,
                },
                body: JSON.stringify({ dayId: Number(dayId), dryRun: isDry }),
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.error || `Server error ${res.status}`);
            }

            // Success
            if (data.dryRun) {
                // Dry run: show SharePoint link + recipient preview
                const rows = (data.preview || []).map((r) =>
                    `<tr><td class="pe-3">${r.name}</td>` +
                    `<td class="pe-3 text-muted small">${r.email || '—'}</td>` +
                    `<td class="text-muted small">${r.phone || '—'}</td></tr>`
                ).join('');

                okEl.innerHTML =
                    `<strong><i class="fa-solid fa-flask me-1"></i>Dry run complete.</strong> ` +
                    `PDF uploaded: <a href="${data.sharePointUrl}" target="_blank" rel="noopener" class="alert-link">View on SharePoint</a><br>` +
                    `<span class="small">No notifications were sent. ${data.totalRecipients} recipient(s) would have been notified:</span>` +
                    (rows ? `<div class="mt-2" style="max-height:180px;overflow-y:auto"><table class="table table-sm table-borderless mb-0 small"><tbody>${rows}</tbody></table></div>` : '');
            } else {
                // Real publish
                okEl.innerHTML =
                    `<i class="fa-solid fa-circle-check me-2"></i>` +
                    `Published! <a href="${data.sharePointUrl}" target="_blank" rel="noopener" class="alert-link">View on SharePoint</a>` +
                    `<span class="text-muted ms-3 small">${data.emailSent} emails &middot; ${data.smsSent} SMS</span>`;
            }
            okEl.classList.remove('d-none');

            btn.innerHTML = data.dryRun
                ? '<i class="fa-solid fa-flask me-1"></i>Dry Run Done'
                : '<i class="fa-solid fa-circle-check me-1"></i>Published';
            btn.disabled = true;

            // Relabel Cancel → Close so the exit action is obvious
            if (cancelBtn) cancelBtn.textContent = 'Close';

            // Re-enable on next modal open
            document.getElementById('publishModal')?.addEventListener(
                'hidden.bs.modal',
                () => {
                    btn.disabled  = false;
                    btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up me-1"></i>Publish';
                    if (cancelBtn) cancelBtn.textContent = 'Cancel';
                    errEl.classList.add('d-none');
                    okEl.classList.add('d-none');
                    const dryRunCb = document.getElementById('publishDryRun');
                    if (dryRunCb) dryRunCb.checked = false;
                },
                { once: true },
            );

        } catch (err) {
            errEl.textContent = err.message;
            errEl.classList.remove('d-none');
            btn.disabled  = false;
            btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up me-1"></i>Publish';
        }
    });

});
