/**
 * @file bugReports.js
 * @description Client-side logic for the Bug Reports admin view.
 *
 * Responsibilities:
 *  - Status filter tab switching (client-side, no reload)
 *  - Expand/collapse resolution panel per report row
 *  - AJAX PUT to update status, solution, files touched, and fixed date
 *  - Inline feedback (spinner → success/error badge)
 */

document.addEventListener("DOMContentLoaded", () => {
  // =========================================================
  // Element references
  // =========================================================

  /** @type {HTMLElement|null} */
  const root = document.getElementById("bugReportsRoot");
  const csrfMeta = document.querySelector('meta[name="csrf-token"]');

  if (!root) return;

  // =========================================================
  // Helpers
  // =========================================================

  /** @returns {string} */
  function getCsrf() {
    return csrfMeta?.getAttribute("content") || "";
  }

  /**
   * @param {string} status
   * @returns {string}
   */
  function statusBadgeHtml(status) {
    const map = {
      open: "br-badge--open",
      fixed: "br-badge--fixed",
      wontfix: "br-badge--wontfix",
      duplicate: "br-badge--duplicate",
    };
    const label = {
      open: "Open",
      fixed: "Fixed",
      wontfix: "Won't Fix",
      duplicate: "Duplicate",
    };
    const cls = map[status] || "br-badge--open";
    return `<span class="br-badge ${cls}">${label[status] || status}</span>`;
  }

  // =========================================================
  // Status filter tabs (client-side show/hide)
  // =========================================================

  root.querySelectorAll(".br-filter-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      root.querySelectorAll(".br-filter-tab").forEach((t) => {
        t.classList.remove("active");
      });
      tab.classList.add("active");

      const filter = tab.dataset.filter || "all";

      root.querySelectorAll(".br-report-row").forEach((row) => {
        const status = row.dataset.status || "open";
        row.classList.toggle("d-none", filter !== "all" && status !== filter);
      });

      // Update empty state visibility
      const anyVisible = Array.from(
        root.querySelectorAll(".br-report-row"),
      ).some((r) => !r.classList.contains("d-none"));
      const emptyState = root.querySelector(".br-empty-state");
      if (emptyState) emptyState.classList.toggle("d-none", anyVisible);
    });
  });

  // =========================================================
  // Resolve panel — expand / collapse
  // =========================================================

  root.addEventListener("click", (ev) => {
    const toggleBtn = ev.target.closest(".br-resolve-toggle");
    if (!toggleBtn) return;

    const reportId = toggleBtn.dataset.id;
    const panel = root.querySelector(
      `.br-resolve-panel[data-id="${reportId}"]`,
    );
    if (!panel) return;

    const isHidden = panel.classList.toggle("d-none");
    toggleBtn.textContent = isHidden ? "Resolve / Edit" : "Close";
  });

  // =========================================================
  // Save resolution — AJAX PUT
  // =========================================================

  root.addEventListener("click", async (ev) => {
    const saveBtn = ev.target.closest(".br-save-btn");
    if (!saveBtn) return;

    const reportId = saveBtn.dataset.id;
    const panel = root.querySelector(
      `.br-resolve-panel[data-id="${reportId}"]`,
    );
    const row = root.querySelector(`.br-report-row[data-id="${reportId}"]`);
    if (!panel || !row) return;

    const statusSelect = panel.querySelector(".br-status-select");
    const solutionInput = panel.querySelector(".br-solution-input");
    const filesInput = panel.querySelector(".br-files-input");
    const fixedAtInput = panel.querySelector(".br-fixed-at-input");
    const feedbackEl = panel.querySelector(".br-save-feedback");

    const status = statusSelect?.value || "open";
    const solution = solutionInput?.value.trim() || null;
    const filesTouched = filesInput?.value.trim() || null;
    const fixedAt = fixedAtInput?.value || null;

    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Saving…`;
    if (feedbackEl) feedbackEl.innerHTML = "";

    try {
      const res = await fetch(`/oversight/tools/bug-reports/${reportId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrf(),
        },
        body: JSON.stringify({ status, solution, filesTouched, fixedAt }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Save failed.");
      }

      // Update the row's status badge inline
      const badgeCell = row.querySelector(".br-status-cell");
      if (badgeCell) badgeCell.innerHTML = statusBadgeHtml(status);

      // Update the row's data-status so client-side filtering stays accurate
      row.dataset.status = status;

      if (feedbackEl) {
        feedbackEl.innerHTML = `<span class="text-success small"><i class="fa-solid fa-circle-check me-1"></i>Saved</span>`;
      }
    } catch (err) {
      console.error("[bugReports] save error:", err);
      if (feedbackEl) {
        feedbackEl.innerHTML = `<span class="text-danger small"><i class="fa-solid fa-triangle-exclamation me-1"></i>${err.message}</span>`;
      }
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk me-1"></i>Save`;
    }
  });
  // =========================================================
  // Manual log form
  // =========================================================

  /**
   * Submit a manually-entered bug report from the admin log panel.
   * POSTs to the admin-only /oversight/tools/bug-reports/log endpoint
   * and prepends the new row to the table on success.
   * @returns {Promise<void>}
   */
  document
    .getElementById("brLogSubmitBtn")
    ?.addEventListener("click", async () => {
      const btn = document.getElementById("brLogSubmitBtn");
      const feedback = document.getElementById("brLogFeedback");
      const description =
        document.getElementById("brLogDesc")?.value.trim() || "";
      const steps = document.getElementById("brLogSteps")?.value.trim() || null;
      const pageUrl =
        document.getElementById("brLogPageUrl")?.value.trim() || null;
      const status = document.getElementById("brLogStatus")?.value || "open";
      const fixedAt = document.getElementById("brLogFixedAt")?.value || null;
      const solution =
        document.getElementById("brLogSolution")?.value.trim() || null;
      const filesTouched =
        document.getElementById("brLogFiles")?.value.trim() || null;

      if (!description) {
        if (feedback)
          feedback.innerHTML = `<span class="text-danger small">Description is required.</span>`;
        document.getElementById("brLogDesc")?.focus();
        return;
      }

      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Saving…`;
      if (feedback) feedback.innerHTML = "";

      try {
        const res = await fetch("/oversight/tools/bug-reports/log", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrf(),
          },
          body: JSON.stringify({
            description,
            steps,
            pageUrl,
            status,
            solution,
            filesTouched,
            fixedAt,
          }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success)
          throw new Error(data.error || "Save failed.");

       if (feedback) {
         feedback.innerHTML = `<span class="text-success small"><i class="fa-solid fa-circle-check me-1"></i>Saved — refreshing…</span>`;
       }

       // Short delay so the user sees the confirmation before reload
       setTimeout(() => window.location.reload(), 800);
      } catch (err) {
        console.error("[bugReports] manual log error:", err);
        if (feedback) {
          feedback.innerHTML = `<span class="text-danger small"><i class="fa-solid fa-triangle-exclamation me-1"></i>${err.message}</span>`;
        }
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-floppy-disk me-1"></i>Save report`;
      }
    });
});
