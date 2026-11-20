/**
 * @file departmentSwitcher.js
 * Navbar department switcher (multi-department phase 2c-3).
 *
 * When the menu opens for the first time it loads the departments the
 * person may switch to (GET /account/departments, which also returns a CSRF
 * token). Choosing one posts to /account/department and reloads the page,
 * so everything on it is redrawn for the new department.
 *
 * Markup: views/partials/departmentSwitcher.ejs. Styles:
 * public/styles/departmentSwitcher.css.
 */
(() => {
    'use strict';

    const root   = document.getElementById('deptSwitcher');
    const toggle = document.getElementById('deptSwitcherToggle');
    const menu   = document.getElementById('deptSwitcherMenu');
    if (!root || !toggle || !menu) return;

    /** @type {boolean} */
    let loaded = false;
    /** @type {boolean} */
    let loading = false;
    /** @type {string} */
    let csrfToken = '';

    /**
     * Replace the menu with a single status line.
     *
     * @param {string} text
     * @param {boolean} [isError]
     * @returns {void}
     */
    function showStatus(text, isError = false) {
        menu.replaceChildren();
        const li   = document.createElement('li');
        const span = document.createElement('span');
        span.className = 'dropdown-item-text dept-switcher-status' + (isError ? ' text-danger' : '');
        span.textContent = text;
        li.appendChild(span);
        menu.appendChild(li);
    }

    /**
     * Draw one menu item per department; the current one is marked with a
     * check (it stays enabled so it keeps the menu's normal colors; clicking
     * it does nothing).
     *
     * @param {Array<{ id: number, name: string }>} departments
     * @param {number} currentId
     * @returns {void}
     */
    function render(departments, currentId) {
        menu.replaceChildren();

        const header = document.createElement('li');
        const h = document.createElement('h6');
        h.className = 'dropdown-header';
        h.textContent = 'Switch department';
        header.appendChild(h);
        menu.appendChild(header);

        for (const dept of departments) {
            const li  = document.createElement('li');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dropdown-item dept-switcher-item';
            btn.dataset.deptId = String(dept.id);

            const icon = document.createElement('i');
            icon.setAttribute('aria-hidden', 'true');
            icon.className = dept.id === currentId
                ? 'fa-solid fa-check me-2 dept-switcher-check'
                : 'fa-solid fa-check me-2 dept-switcher-check invisible';
            btn.appendChild(icon);
            btn.appendChild(document.createTextNode(dept.name));

            if (dept.id === currentId) {
                btn.classList.add('dept-switcher-current');
                btn.setAttribute('aria-current', 'true');
            }
            li.appendChild(btn);
            menu.appendChild(li);
        }
    }

    /**
     * Load the department list once, when the menu first opens.
     *
     * @returns {Promise<void>}
     */
    async function load() {
        if (loaded || loading) return;
        loading = true;
        try {
            const res  = await fetch('/account/departments', {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                showStatus(data.message || 'Could not load departments.', true);
                return;
            }
            csrfToken = data.csrfToken || '';
            render(data.departments || [], data.currentId);
            loaded = true;
        } catch (err) {
            console.error('[departmentSwitcher] load failed', err);
            showStatus('Could not load departments.', true);
        } finally {
            loading = false;
        }
    }

    /**
     * Switch to a department, then reload the page.
     *
     * @param {number} departmentId
     * @returns {Promise<void>}
     */
    async function switchTo(departmentId) {
        menu.querySelectorAll('button.dept-switcher-item').forEach((b) => { b.disabled = true; });
        try {
            const res  = await fetch('/account/department', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'CSRF-Token': csrfToken,
                },
                credentials: 'same-origin',
                body: JSON.stringify({ departmentId }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                loaded = false;
                showStatus(data.message || 'Could not switch department.', true);
                return;
            }
            window.location.reload();
        } catch (err) {
            console.error('[departmentSwitcher] switch failed', err);
            loaded = false;
            showStatus('Could not switch department.', true);
        }
    }

    // Bootstrap fires show.bs.dropdown on the toggle before the menu opens
    toggle.addEventListener('show.bs.dropdown', () => { load(); });

    menu.addEventListener('click', (event) => {
        const btn = event.target.closest('button.dept-switcher-item');
        if (!btn || btn.disabled) return;
        event.preventDefault();
        if (btn.classList.contains('dept-switcher-current')) return;
        switchTo(Number(btn.dataset.deptId));
    });
})();
