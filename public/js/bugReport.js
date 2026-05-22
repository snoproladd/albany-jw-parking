/**
 * @file bugReport.js
 * @description Handles the "Report a Bug" modal available on every
 * authenticated page. Captures the current page URL automatically,
 * validates the form, and submits via AJAX.
 *
 * Loaded conditionally in footer.ejs for logged-in users only.
 * Depends on Bootstrap Modal being available globally.
 */

document.addEventListener("DOMContentLoaded", () => {
  // =========================================================
  // Element references
  // =========================================================

  const modal = document.getElementById("bugReportModal");
  const form = document.getElementById("bugReportForm");
  const descInput = document.getElementById("bugReportDesc");
  const stepsInput = document.getElementById("bugReportSteps");
  const pageUrlDisplay = document.getElementById("bugReportPageUrl");
  const submitBtn = document.getElementById("bugReportSubmitBtn");
  const successPanel = document.getElementById("bugReportSuccess");
  const formPanel = document.getElementById("bugReportFormPanel");
  const modalFooter = document.getElementById("bugReportFooter");

  const errorAlert = document.getElementById("bugReportError");
  const csrfMeta = document.querySelector('meta[name="csrf-token"]');

  if (!modal) return;

  // =========================================================
  // Helpers
  // =========================================================

  /** @returns {void} */
  function resetModal() {
    if (descInput) descInput.value = "";
    if (stepsInput) stepsInput.value = "";
    if (errorAlert) errorAlert.classList.add("d-none");
    if (successPanel) successPanel.classList.add("d-none");
    if (formPanel) formPanel.classList.remove("d-none");
    if (submitBtn) submitBtn.disabled = false;
    if (descInput) descInput.classList.remove("is-invalid");
  }

  // =========================================================
  // Populate page URL when modal opens
  // =========================================================

  modal.addEventListener("show.bs.modal", () => {
    resetModal();
    if (pageUrlDisplay) {
      pageUrlDisplay.textContent =
        window.location.pathname + window.location.search;
    }
  });

  // =========================================================
  // Form submission
  // =========================================================

  submitBtn?.addEventListener("click", async () => {
    const description = descInput?.value.trim() || "";
    const steps = stepsInput?.value.trim() || "";
    const pageUrl = window.location.pathname + window.location.search;

    // Validate
    if (!description) {
      descInput?.classList.add("is-invalid");
      descInput?.focus();
      return;
    }
    descInput?.classList.remove("is-invalid");

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Submitting…`;

    if (errorAlert) errorAlert.classList.add("d-none");

    try {
      const res = await fetch("/api/bug-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ description, steps: steps || null, pageUrl }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Submission failed.");
      }

      // Reset button before showing success state
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane me-2"></i>Submit report`;

      // Show success state
      if (formPanel) formPanel.classList.add("d-none");
      if (modalFooter) modalFooter.classList.add("d-none");
      if (successPanel) successPanel.classList.remove("d-none");
    } catch (err) {
      console.error("[bugReport] submit error:", err);
      if (errorAlert) {
        errorAlert.textContent =
          err.message || "Something went wrong — please try again.";
        errorAlert.classList.remove("d-none");
      }
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane me-2"></i>Submit report`;
    }
  });

  // =========================================================
  // Keyboard shortcut — Ctrl/Cmd + Shift + B
  // =========================================================

  document.addEventListener("keydown", (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key === "B") {
      ev.preventDefault();
      const bsModal = bootstrap.Modal.getOrCreateInstance(modal);
      bsModal.show();
    }
  });
});
