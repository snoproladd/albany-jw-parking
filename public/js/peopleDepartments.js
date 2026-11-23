/**
 * @file peopleDepartments.js
 * Search and department filter for the People & Departments directory
 * (views/authentication_and_accounts/peopleDepartments.ejs, multi-department
 * phase 2d). Rows are rendered by the server; this only shows and hides them.
 */
(() => {
    'use strict';

    const search  = document.getElementById('pdSearch');
    const dept    = document.getElementById('pdDepartment');
    const count   = document.getElementById('pdCount');
    const empty   = document.getElementById('pdEmpty');
    const rows    = Array.from(document.querySelectorAll('#pdTable tbody tr.pd-row'));
    if (!search || !dept || !count) return;

    /**
     * Does a row belong to the chosen department filter?
     *
     * @param {HTMLTableRowElement} row
     * @param {string} filter  "" (all), "none" (unassigned) or a department id.
     * @returns {boolean}
     */
    function matchesDepartment(row, filter) {
        const ids = (row.dataset.depts || '').split(',').filter(Boolean);
        if (filter === '') return true;
        if (filter === 'none') return ids.length === 0;
        return ids.includes(filter);
    }

    /**
     * Apply the search text and department filter to every row and update
     * the visible count.
     *
     * @returns {void}
     */
    function applyFilters() {
        const words  = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const filter = dept.value;
        let shown = 0;

        for (const row of rows) {
            const text = row.dataset.search || '';
            const visible = matchesDepartment(row, filter)
                && words.every((w) => text.includes(w.replace(/[^\w@.+-]/g, '')));
            row.hidden = !visible;
            if (visible) shown++;
        }

        count.textContent = `${shown} ${shown === 1 ? 'person' : 'people'}`;
        if (empty) empty.hidden = shown !== 0;
    }

    search.addEventListener('input', applyFilters);
    dept.addEventListener('change', applyFilters);
})();
