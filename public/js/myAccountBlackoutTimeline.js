/**
 * @fileoverview myAccountBlackoutTimeline.js
 * Mounts the BlackoutTimeline component inside the My Account
 * "My Availability" accordion panel.
 *
 * Load is deferred until the accordion first opens to avoid an unnecessary
 * API call when the user never visits that section.
 *
 * @module myAccountBlackoutTimeline
 */

"use strict";

import BlackoutTimeline from "./blackoutTimeline.js";

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("bt-myaccount");
  if (!container) return;

  const volunteerId = Number(container.dataset.volunteerId);
  if (!volunteerId) return;

  const accordionEl = document.getElementById("collapseBlackouts");
  if (!accordionEl) return;

  let initialized = false;

  accordionEl.addEventListener("show.bs.collapse", async () => {
    if (initialized) return;
    initialized = true;
    await _mount(container, volunteerId);
  });
});

/**
 * Fetch blackout data and mount the BlackoutTimeline component.
 *
 * @param {HTMLElement} container  The target mount element.
 * @param {number}      volunteerId
 * @returns {Promise<void>}
 */
async function _mount(container, volunteerId) {
  container.innerHTML = `
        <p class="text-muted small">
            <span class="spinner-border spinner-border-sm me-2"></span>Loading…
        </p>`;

  try {
    const res = await fetch(`/api/blackouts/${volunteerId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    container.innerHTML = "";
    new BlackoutTimeline(container, data, { mobile: true });
  } catch (err) {
    container.innerHTML =
      '<p class="text-danger small mt-2">Failed to load availability editor. Please refresh and try again.</p>';
    console.error("[myAccountBlackoutTimeline] mount error:", err);
  }
}
