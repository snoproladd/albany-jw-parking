/**
 * @file navDropdown.js
 * @description Oversight Tools nav dropdown — collapse chevron sync.
 *
 * Bootstrap handles the actual collapse/expand via data-bs-toggle.
 * This file keeps the chevron rotation in sync with collapse state
 * for panels that start expanded (class="collapse show") since
 * Bootstrap only sets aria-expanded on the trigger element after
 * a user interaction, not on initial render.
 */
document.addEventListener("DOMContentLoaded", () => {
  /**
   * Sync chevron rotation for all ot-nav-category buttons.
   * Bootstrap sets aria-expanded on the button after each toggle.
   * @returns {void}
   */
  function syncChevrons() {
    document.querySelectorAll(".ot-nav-category").forEach((btn) => {
      const targetId = btn.dataset.bsTarget?.replace("#", "");
      if (!targetId) return;
      const panel = document.getElementById(targetId);
      const chevron = btn.querySelector(".ot-nav-chevron");
      if (!panel || !chevron) return;
      const isOpen = panel.classList.contains("show");
      btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  }

  // Sync on page load
  syncChevrons();

  // Keep in sync after every Bootstrap collapse event
  document.addEventListener("shown.bs.collapse", syncChevrons);
  document.addEventListener("hidden.bs.collapse", syncChevrons);
});
