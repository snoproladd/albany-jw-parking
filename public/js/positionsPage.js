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
 * - People tab picker: typing in "Find" narrows the Volunteer list to the
 *   names and emails that contain every typed word, and picks the first
 *   match, so Enter opens it. The chosen name shows "(+N more)" while
 *   other matches sit below it.
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

    // ── People picker: type to narrow the list ──────────────────────────

    const personSearch = /** @type {HTMLInputElement|null} */ (document.getElementById("posPersonSearch"));
    const personSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById("posPerson"));
    const personCount = document.getElementById("posPersonCount");
    if (personSearch && personSelect) {
        // Keep every option; rebuild the list from them on each keystroke
        // (hidden <option>s aren't reliable in every browser).
        const placeholder = personSelect.options[0];
        const allOptions = Array.from(personSelect.options).slice(1);
        /** Each option's own text, so the "(+N more)" note can be put back. */
        const baseText = new Map(allOptions.map((o) => [o, o.textContent || ""]));

        /**
         * Put every option's own text back, then add "(+N more)" to the
         * selected one when other matches sit below it.
         * @param {HTMLOptionElement[]} matches
         * @param {boolean} searching
         * @returns {void}
         */
        const labelSelected = (matches, searching) => {
            for (const [o, text] of baseText) o.textContent = text;
            const chosen = personSelect.selectedOptions[0];
            const others = matches.length - 1;
            if (searching && chosen && chosen !== placeholder && others > 0) {
                chosen.textContent = `${baseText.get(chosen)} (+${others} more)`;
            }
        };

        /**
         * Show only the people matching the typed words and select the first.
         * @returns {void}
         */
        const narrow = () => {
            const words = personSearch.value.toLowerCase().split(/\s+/).filter(Boolean);
            const current = personSelect.value;
            const matches = allOptions.filter((o) =>
                words.every((w) => (o.getAttribute("data-search") || "").includes(w)));
            personSelect.replaceChildren(placeholder, ...(words.length ? matches : allOptions));
            if (words.length && matches.length) {
                personSelect.value = matches.some((o) => o.value === current) ? current : matches[0].value;
            } else if (!words.length) {
                personSelect.value = current;
            } else {
                personSelect.value = "";
            }
            labelSelected(matches, words.length > 0);
            if (personCount) {
                personCount.textContent = words.length
                    ? `${matches.length} ${matches.length === 1 ? "match" : "matches"}`
                    : "";
            }
        };
        personSelect.addEventListener("change", () => {
            const searching = personSearch.value.trim() !== "";
            const shown = Array.from(personSelect.options).slice(1);
            labelSelected(shown, searching);
        });
        personSearch.addEventListener("input", narrow);
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
