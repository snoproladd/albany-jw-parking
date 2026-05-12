/**
 * @file nonProfile.js
 * @description Client-side logic for the Guest (non-registered) registration
 *   page (/nonProfile). Handles the resume-registration modal shown when a
 *   returning user is redirected back here via continue-registration/auto.
 */

/**
 * Initialise the resume-registration modal if the page was reached via
 * the continue-registration auto-resume flow (?resume=1).
 * Shows a friendly prompt so the user can skip re-entering their info.
 */
function initResumeModal() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("resume") !== "1") return;

  const modalEl = document.getElementById("resumeModal");
  if (!modalEl) return;

  const modal = new bootstrap.Modal(modalEl);
  modal.show();

  document
    .getElementById("resumeUpdateBtn")
    ?.addEventListener("click", () => modal.hide());
}

/**
 * Show the identity confirmation modal when a 409 requiresConfirmation
 * response is returned from submit-nonProfileInfo.
 * On confirmation, calls /confirm-draft-recovery and redirects to /volunteerIn.
 *
 * @param {string} maskedName - Masked name returned by the server.
 * @param {string} csrfToken - CSRF token for the recovery POST.
 */
function initConfirmIdentityModal(maskedName, csrfToken) {
  const modalEl = document.getElementById("confirmIdentityModal");
  if (!modalEl) return;

  document.getElementById("confirmIdentityName").textContent = maskedName;

  const modal = new bootstrap.Modal(modalEl);
  modal.show();

  document.getElementById("confirmIdentityYes")?.addEventListener("click", async () => {
    try {
      const res = await fetch("/confirm-draft-recovery", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        modal.hide();
        window.location.href = "/volunteerIn?disable=true";
      }
    } catch (err) {
      console.error("[confirmIdentityModal] recovery error:", err);
    }
  });

  document.getElementById("confirmIdentityNo")?.addEventListener("click", () => {
    modal.hide();
  });
}
document.addEventListener("DOMContentLoaded", initResumeModal);
// Expose for formListeners.js to call after a requiresConfirmation response
window.initConfirmIdentityModal = initConfirmIdentityModal;
