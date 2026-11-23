/**
 * @file public/js/positionsPage.js
 * @description Behaviour for the read-only Positions page
 * (views/authentication_and_accounts/positions.ejs, phase 3d-7b).
 *
 * - Tabs: "By position" / "By permission" / "People" (when shown),
 *   following the WAI-ARIA tabs pattern (arrow keys, Home/End). The open tab
 *   is kept in the URL hash (#by-position / #by-permission / #people) so a
 *   link or reload opens the same one.
 * - Expand all / Collapse all for the accordions (<details>) of each tab.
 * - Search on the By permission tab: hides permissions that don't match the
 *   typed words and categories with no match, opens the categories that
 *   match, and announces the count. Clearing the search puts each category
 *   back the way it was.
 * - Shows a message left by the editor (positionsEditor.js) before it
 *   reloaded the page.
 *
 * Everything is rendered on the server; this only shows and hides it.
 */

(() => {
    "use strict";

    // ── Tabs ────────────────────────────────────────────────────────────

    /** @type {HTMLButtonElement[]} */
    const tabs = Array.from(document.querySelectorAll('.pos-tabs [role="tab"]'));

    /**
     * Show one tab's panel and hide the others.
     *
     * @param {HTMLButtonElement} tab
     * @param {{ focus?: boolean, updateHash?: boolean }} [options]
     * @returns {void}
     */
    function selectTab(tab, options = {}) {
        for (const t of tabs) {
            const selected = t === tab;
            t.classList.toggle("active", selected);
            t.setAttribute("aria-selected", String(selected));
            t.tabIndex = selected ? 0 : -1;
            const panel = document.getElementById(t.getAttribute("aria-controls") || "");
            if (panel) panel.hidden = !selected;
        }
        if (options.focus) tab.focus();
        if (options.updateHash && tab.dataset.hash) {
            history.replaceState(null, "", `${location.pathname}${location.search}#${tab.dataset.hash}`);
        }
    }

    tabs.forEach((tab, index) => {
        tab.addEventListener("click", () => selectTab(tab, { updateHash: true }));
        tab.addEventListener("keydown", (event) => {
            /** @type {number|null} */
            let next = null;
            if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
            else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = tabs.length - 1;
            if (next === null) return;
            event.preventDefault();
            selectTab(tabs[next], { focus: true, updateHash: true });
        });
    });

    const fromHash = tabs.find((t) => `#${t.dataset.hash}` === location.hash);
    if (fromHash) selectTab(fromHash);

    // ── Expand / collapse all ───────────────────────────────────────────

    document.querySelectorAll("[data-pos-expand]").forEach((button) => {
        button.addEventListener("click", () => {
            const open = button.getAttribute("data-pos-expand") === "open";
            const panel = button.closest(".pos-panel") || document;
            panel.querySelectorAll("details.pos-position, details.pos-category:not([hidden])").forEach((d) => {
                d.open = open;
            });
        });
    });

    // ── Search (By permission) ──────────────────────────────────────────

    const search = /** @type {HTMLInputElement|null} */ (document.getElementById("posSearch"));
    const count = document.getElementById("posSearchCount");
    const noMatch = document.getElementById("posNoMatch");
    const items = Array.from(document.querySelectorAll("[data-pos-search]"));
    const groups = /** @type {HTMLDetailsElement[]} */ (Array.from(document.querySelectorAll("[data-pos-group]")));

    /**
     * Which categories were open before the search started, so clearing the
     * search can put them back. Null while no search is active.
     * @type {Map<HTMLDetailsElement, boolean>|null}
     */
    let openBeforeSearch = null;

    /**
     * Hide permissions that don't contain every typed word, then hide
     * categories with no match, open the rest and update the live count.
     *
     * @returns {void}
     */
    function applySearch() {
        const words = (search?.value || "").toLowerCase().split(/\s+/).filter(Boolean);
        const searching = words.length > 0;

        if (searching && !openBeforeSearch) {
            openBeforeSearch = new Map(groups.map((g) => [g, g.open]));
        }

        let shown = 0;
        for (const item of items) {
            const text = item.getAttribute("data-pos-search") || "";
            const match = words.every((w) => text.includes(w));
            item.hidden = !match;
            if (match) shown += 1;
        }

        for (const group of groups) {
            const matches = group.querySelectorAll("[data-pos-search]:not([hidden])").length;
            const total = group.querySelectorAll("[data-pos-search]").length;
            const label = group.querySelector("[data-pos-group-count]");
            if (label) label.textContent = searching ? `${matches} of ${total}` : String(total);
            group.hidden = searching && matches === 0;
            if (searching) group.open = matches > 0;
        }

        if (!searching && openBeforeSearch) {
            for (const [group, wasOpen] of openBeforeSearch) group.open = wasOpen;
            openBeforeSearch = null;
        }

        if (count) {
            count.textContent = searching
                ? `${shown} of ${items.length} permissions`
                : `${items.length} permissions`;
        }
        if (noMatch) noMatch.classList.toggle("d-none", shown > 0);
    }

    if (search) {
        search.addEventListener("input", applySearch);
        if (search.value) applySearch();
    }

    // ── Message from the editor ─────────────────────────────────────────

    const status = document.getElementById("posStatus");
    try {
        const message = sessionStorage.getItem("positions:flash");
        if (message && status) {
            sessionStorage.removeItem("positions:flash");
            status.textContent = message;
            status.classList.remove("d-none");
            status.classList.add("alert-success");
        }
    } catch {
        // Storage can be unavailable (private mode, blocked); the message is optional.
    }
})();
