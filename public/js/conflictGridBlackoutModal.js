/**
 * @file conflictGridBlackoutModal.js
 * @description Exposes window.showBlackoutModal for use by the non-module
 * conflictGrid.js and scheduleViolationsPanel.js (IIFE).
 *
 * Fetches the standard /api/blackouts/:volunteerId payload and mounts the
 * existing BlackoutTimeline component in read-only mode inside a Bootstrap
 * modal — no custom rendering code needed.
 *
 * @module conflictGridBlackoutModal
 */

import BlackoutTimeline from "./blackoutTimeline.js";

const MODAL_ID = "cgBlackoutModal";
const MOUNT_ID = "cgBlackoutMount";
const NAME_ID = "cgBlackoutVolName";

document.addEventListener("DOMContentLoaded", () => {
  const modalEl = document.getElementById(MODAL_ID);
  if (!modalEl) return;

  /** @type {BlackoutTimeline|null} Active instance, destroyed on modal close. */
  let _instance = null;

  // Clean up when the modal hides so the next open starts fresh.
  modalEl.addEventListener("hidden.bs.modal", () => {
    const mount = document.getElementById(MOUNT_ID);
    if (mount) mount.innerHTML = "";
    _instance = null;
  });

  /**
   * Opens the read-only availability modal for a volunteer.
   * Called by conflictGrid.js (context menu) and scheduleViolationsPanel.js
   * (violation action buttons) via window.showBlackoutModal.
   *
   * @param {number} volId
   * @param {string} volName
   * @returns {Promise<void>}
   */
  window.showBlackoutModal = async function showBlackoutModal(volId, volName) {
    const nameEl = document.getElementById(NAME_ID);
    const mount = document.getElementById(MOUNT_ID);
    if (!mount) return;

    if (nameEl) nameEl.textContent = `${volName} — Availability`;

    mount.innerHTML =
      '<p class="text-muted small text-center py-4">' +
      '<span class="spinner-border spinner-border-sm me-2"></span>Loading…</p>';

    bootstrap.Modal.getOrCreateInstance(modalEl).show();

    try {
      const res = await fetch(`/api/blackouts/${volId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      mount.innerHTML = "";
      _instance = new BlackoutTimeline(mount, data, { readOnly: true });
    } catch (err) {
      console.error("[conflictGridBlackoutModal] error:", err);
      mount.innerHTML =
        '<p class="text-danger small mt-2">' +
        '<i class="fa-solid fa-triangle-exclamation me-1"></i>' +
        "Failed to load availability. Please try again.</p>";
    }
  };
});
