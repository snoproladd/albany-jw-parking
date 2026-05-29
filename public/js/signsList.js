/**
 * @file public/js/signsList.js
 * @description Client-side behavior for the Sign Library page.
 *
 * Responsibilities:
 *   - Live search/filter across the sign card grid
 *   - Archive (soft-delete) a sign template with confirmation
 *
 * No inline event handlers — CSP forbids them. All event wiring is
 * done here at DOMContentLoaded.
 */

(() => {
  "use strict";

  /**
   * Read the CSRF token from the meta tag.
   * @returns {string}
   */
  function getCsrfToken() {
    const el = document.querySelector('meta[name="csrf-token"]');
    return el ? el.getAttribute("content") || "" : "";
  }

  /**
   * Initialize the live-search filter over the sign grid.
   * Hides cards whose data-search attribute does not contain the query.
   */
  function initSearch() {
    const input = document.getElementById("signsSearchInput");
    const grid = document.getElementById("signsGrid");
    const noHits = document.getElementById("signsNoResults");

    if (!input || !grid) return;

    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      const cards = grid.querySelectorAll(".sign-card-col");
      let visible = 0;

      cards.forEach((card) => {
        const haystack = card.getAttribute("data-search") || "";
        const match = !q || haystack.includes(q);
        card.classList.toggle("d-none", !match);
        if (match) visible++;
      });

      if (noHits) {
        noHits.classList.toggle("d-none", visible > 0);
      }
    });
  }

  /**
   * Initialize archive buttons. Each click confirms and then sends a
   * DELETE request to /signs/:id. On success the card is removed from
   * the DOM. On error a feedback message is shown next to the button.
   */
  function initArchiveButtons() {
    const buttons = document.querySelectorAll(".sign-archive-btn");
    buttons.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const signId = btn.getAttribute("data-sign-id");
        const signText = btn.getAttribute("data-sign-text") || "this sign";

        const confirmed = window.confirm(
          `Archive "${signText}"?\n\n` +
            "Existing placements will remain in the database but the " +
            "template will be hidden from the library. This can be " +
            "reversed by an administrator.",
        );
        if (!confirmed) return;

        btn.disabled = true;
        btn.innerHTML =
          '<i class="fa-solid fa-spinner fa-spin me-1"></i>Archiving…';

        try {
          const res = await fetch(`/signs/${signId}`, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              "CSRF-Token": getCsrfToken(),
            },
          });
          const data = await res.json();

          if (data && data.success) {
            // Remove the card from the DOM
            const card = btn.closest(".sign-card-col");
            if (card) card.remove();
          } else {
            window.alert(data.error || "Failed to archive sign.");
            btn.disabled = false;
            btn.innerHTML =
              '<i class="fa-solid fa-box-archive me-1"></i>Archive';
          }
        } catch (err) {
          console.error("Archive sign error:", err);
          window.alert("Network error — could not archive sign.");
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-box-archive me-1"></i>Archive';
        }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initSearch();
    initArchiveButtons();
  });
})();
