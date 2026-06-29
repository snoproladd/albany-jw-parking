/**
 * @file public/js/lessonsLearnedResources.js
 * @description Client logic for the Lessons Learned resources page (/lessons-learned).
 *
 * Handles the Batch Publish / Re-generate button for ASSISTANT_ADMIN+ users.
 * Displays progress inline and reloads the page after a successful generation.
 *
 * @module lessonsLearnedResources
 */

const csrfToken  = document.querySelector('meta[name="csrf-token"]')?.content || '';
const batchBtn   = document.getElementById('batchPublishBtn');
const statusEl   = document.getElementById('batchStatus');
const reportBody = document.getElementById('reportBody');

if (!batchBtn) {
    // Non-admin view — nothing to wire up.
} else {
    batchBtn.addEventListener('click', async () => {
        const year = Number(batchBtn.dataset.year);
        if (!year) return;

        batchBtn.disabled = true;
        const origLabel   = batchBtn.innerHTML;
        batchBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Generating\u2026';

        if (statusEl) {
            statusEl.className = 'mt-3 alert alert-info';
            statusEl.textContent = 'Generating consolidated PDF\u2026 this may take 10\u201320 seconds.';
        }

        try {
            const res  = await fetch('/api/lessons-learned/batch-publish', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body:    JSON.stringify({ year }),
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.message || `HTTP ${res.status}`);
            }

            if (statusEl) {
                statusEl.className = 'mt-3 alert alert-success';
                statusEl.textContent = `\u2713 Report generated (${data.report.lessonCount} lesson${data.report.lessonCount !== 1 ? 's' : ''}). Reloading\u2026`;
            }

            // Reload the page so the download link and metadata refresh
            setTimeout(() => window.location.reload(), 1200);
        } catch (err) {
            if (statusEl) {
                statusEl.className = 'mt-3 alert alert-danger';
                statusEl.textContent = `Generation failed: ${err.message}`;
            }
            batchBtn.disabled = false;
            batchBtn.innerHTML = origLabel;
        }
    });
}
