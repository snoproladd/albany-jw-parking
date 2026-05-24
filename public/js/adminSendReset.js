/**
 * @file adminSendReset.js
 * @description Client logic for the Send Links page.
 *
 * Provides live name/email search filtering across the draft and
 * registered volunteer tables on the Send Reset Links oversight tool.
 */

document.addEventListener("DOMContentLoaded", () => {
    const tableSearch = document.getElementById("tableSearch");
    if (!tableSearch) return;

    /**
     * Filter all .searchable-row elements by whether their text content
     * contains the current search term (case-insensitive).
     */
    tableSearch.addEventListener("input", () => {
        const term = tableSearch.value.toLowerCase();
        document.querySelectorAll(".searchable-row").forEach((row) => {
            const matches = row.textContent.toLowerCase().includes(term);
            row.classList.toggle("d-none", !matches);
        });
    });
});
