/**
 * @file public/js/sitemap.js
 * @description Live search for the site map page.
 *
 * Filters page cards by matching the search query against each card's
 * data-search attribute (title + description + path, lowercased).
 * Hides group sections when all their cards are filtered out.
 * Shows a no-results message when nothing matches.
 */

(function () {
  "use strict";

  /**
   * Initialize the sitemap search behaviour.
   * Runs once on DOMContentLoaded.
   *
   * @returns {void}
   */
  function initSitemapSearch() {
    const searchInput = document.getElementById("sitemapSearch");
    const noResults = document.getElementById("sitemapNoResults");
    const groups = document.querySelectorAll(".sitemap-group");

    if (!searchInput) return;

    /**
     * Filter cards based on the current search term.
     * Called on every `input` event.
     *
     * @returns {void}
     */
    function filterCards() {
      const term = searchInput.value.trim().toLowerCase();
      let totalVisible = 0;

      groups.forEach(function (group) {
        const cols = group.querySelectorAll(".sitemap-card-col");
        let visibleInGroup = 0;

        cols.forEach(function (col) {
          const haystack = col.dataset.search || "";
          const matches = term === "" || haystack.includes(term);

          col.classList.toggle("d-none", !matches);
          if (matches) visibleInGroup++;
        });

        // Hide the whole group section when no cards match
        group.classList.toggle("d-none", visibleInGroup === 0);
        totalVisible += visibleInGroup;
      });

      // Toggle the no-results banner
      if (noResults) {
        noResults.classList.toggle("d-none", totalVisible > 0 || term === "");
      }
    }

    searchInput.addEventListener("input", filterCards);
  }

  document.addEventListener("DOMContentLoaded", initSitemapSearch);
})();
