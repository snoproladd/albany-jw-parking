/**
 * @file public/js/positionsEditor.js
 * @description Editing positions on the Positions page (multi-department
 * phase 3d-7c). Loaded only for holders of positions.manage, in the
 * department they are working in.
 *
 * Reads the JSON block "positions-editor-data" (routes/positionsRoutes.js
 * buildEditorData()) and adds:
 *
 * - Edit: an inline form inside a position's accordion (name, description,
 *   tier, sort order, department-admin flag for convention admins, and the
 *   permissions grouped by category).
 * - New position: the same form above the list, optionally starting from an
 *   existing position's permissions.
 * - Retire / Reactivate, each with a second click to confirm.
 *
 * Permissions the person can't give are shown disabled with the reason.
 * Ticking a permission ticks what it needs; unticking one unticks what
 * needs it, and the form says so. A live summary shows what will be added
 * and removed and how many people it affects. The server checks every save
 * again (lib/positionEditing.js); after a save the page reloads.
 */

(() => {
    "use strict";

    const dataEl = document.getElementById("positions-editor-data");
    if (!dataEl) return;

    /**
     * @typedef {{ key: string, label: string, description: string, category: string, tier: number,
     *             requires: string[], editable: boolean, reason: string|null, hidden: boolean }} CatalogueItem
     * @typedef {{ id: number, name: string, description: string|null, tier: number|null, sortOrder: number,
     *             isDepartmentAdmin: boolean, isDefault: boolean, active: boolean, memberCount: number,
     *             permissions: string[], lockReason: string|null }} EditorPosition
     */

    /** @type {{ canSetDepartmentAdmin: boolean, canUseAdminTier: boolean,
     *           categories: Array<{ id: string, label: string }>,
     *           tiers: Array<{ tier: number, label: string }>,
     *           catalogue: CatalogueItem[], positions: EditorPosition[] }} */
    let data;
    try {
        data = JSON.parse(dataEl.textContent || "{}");
    } catch (err) {
        console.error("[positionsEditor] could not read positions-editor-data:", err);
        return;
    }

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";
    const status = document.getElementById("posStatus");

    /** @type {Map<string, CatalogueItem>} */
    const byKey = new Map(data.catalogue.map((c) => [c.key, c]));

    /** @type {Map<number, EditorPosition>} */
    const positionsById = new Map(data.positions.map((p) => [p.id, p]));

    /**
     * Direct dependents: key → keys that list it in `requires`.
     * @type {Map<string, string[]>}
     */
    const dependents = new Map();
    for (const c of data.catalogue) {
        for (const r of c.requires) {
            if (!dependents.has(r)) dependents.set(r, []);
            dependents.get(r).push(c.key);
        }
    }

    /** Running number for unique element ids. */
    let uid = 0;

    // ── Helpers ─────────────────────────────────────────────────────────

    /**
     * Create an element with attributes and children. Text is set with
     * textContent, never as HTML.
     *
     * @param {string} tag
     * @param {Record<string, string|boolean|number|undefined|null>} [attrs]
     * @param {Array<Node|string|null|undefined|false>} [children]
     * @returns {HTMLElement}
     */
    function el(tag, attrs = {}, children = []) {
        const node = document.createElement(tag);
        for (const [name, value] of Object.entries(attrs)) {
            if (value === undefined || value === null || value === false) continue;
            if (name === "text") node.textContent = String(value);
            else if (name === "className") node.className = String(value);
            else if (value === true) node.setAttribute(name, "");
            else node.setAttribute(name, String(value));
        }
        for (const child of children) {
            if (child === null || child === undefined || child === false) continue;
            node.append(child);
        }
        return node;
    }

    /**
     * Everything a key needs, directly or through other prerequisites.
     *
     * @param {string} key
     * @returns {string[]} Not including the key itself.
     */
    function prerequisitesOf(key) {
        const out = new Set();
        const visit = (k) => {
            for (const r of byKey.get(k)?.requires ?? []) {
                if (!out.has(r)) {
                    out.add(r);
                    visit(r);
                }
            }
        };
        visit(key);
        return [...out];
    }

    /**
     * Every key that needs this one, directly or through others.
     *
     * @param {string} key
     * @returns {string[]}
     */
    function dependentsOf(key) {
        const out = new Set();
        const visit = (k) => {
            for (const d of dependents.get(k) ?? []) {
                if (!out.has(d)) {
                    out.add(d);
                    visit(d);
                }
            }
        };
        visit(key);
        return [...out];
    }

    /**
     * Labels of keys, joined for a sentence.
     *
     * @param {string[]} keys
     * @returns {string}
     */
    function labels(keys) {
        return keys.map((k) => byKey.get(k)?.label ?? k).join(", ");
    }

    /**
     * Show a message in the page's status box.
     *
     * @param {string} message
     * @param {"success"|"danger"} kind
     * @returns {void}
     */
    function showStatus(message, kind) {
        if (!status) return;
        status.textContent = message;
        status.classList.remove("d-none", "alert-success", "alert-danger");
        status.classList.add(`alert-${kind}`);
    }

    /**
     * Send a JSON request with the CSRF token.
     *
     * @param {string} url
     * @param {string} method
     * @param {unknown} [body]
     * @returns {Promise<any>}
     * @throws {Error} With the server's message when the request fails.
     */
    async function api(url, method, body) {
        const res = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json", Accept: "application/json", "CSRF-Token": csrfToken },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        let payload = {};
        try {
            payload = await res.json();
        } catch {
            payload = {};
        }
        if (!res.ok || payload.success === false) {
            throw new Error(payload.error || `The server answered ${res.status}.`);
        }
        return payload;
    }

    /**
     * Leave a message for after the reload, then reload on the same tab.
     *
     * @param {string} message
     * @returns {void}
     */
    function reloadWith(message) {
        try {
            sessionStorage.setItem("positions:flash", message);
        } catch {
            // Storage unavailable: reload without the message.
        }
        location.reload();
    }

    // ── The form ────────────────────────────────────────────────────────

    /**
     * Build the edit / create form.
     *
     * @param {EditorPosition|null} position  null to create.
     * @param {() => void} onCancel
     * @returns {HTMLFormElement}
     */
    function buildForm(position, onCancel) {
        const id = ++uid;
        const isNew = position === null;
        const before = new Set(position?.permissions ?? []);
        const tierLocked = !data.canUseAdminTier && position?.tier === 4;

        const nameInput = el("input", {
            type: "text", className: "form-control form-control-sm", id: `pe${id}Name`,
            maxlength: 80, required: true, autocomplete: "off",
        });
        nameInput.value = position?.name ?? "";

        const descInput = el("textarea", {
            className: "form-control form-control-sm", id: `pe${id}Desc`, rows: 2, maxlength: 400,
        });
        descInput.value = position?.description ?? "";

        const tierSelect = el("select", { className: "form-select form-select-sm", id: `pe${id}Tier`, disabled: tierLocked });
        for (const t of data.tiers) {
            const opt = el("option", {
                value: t.tier,
                text: `${t.tier} · ${t.label}`,
                disabled: t.tier === 4 && !data.canUseAdminTier && position?.tier !== 4,
            });
            tierSelect.append(opt);
        }
        tierSelect.value = String(position?.tier ?? 1);

        const sortInput = el("input", {
            type: "number", className: "form-control form-control-sm", id: `pe${id}Sort`, min: 0, max: 100000, step: 1,
        });
        const maxSort = Math.max(0, ...data.positions.map((p) => p.sortOrder || 0));
        sortInput.value = String(position?.sortOrder ?? maxSort + 10);

        const adminInput = data.canSetDepartmentAdmin
            ? el("input", { type: "checkbox", className: "form-check-input", id: `pe${id}Admin` })
            : null;
        if (adminInput) adminInput.checked = position?.isDepartmentAdmin === true;

        // Permissions, one fieldset per category.
        /** @type {Map<string, HTMLInputElement>} */
        const boxes = new Map();
        const permissionArea = el("div", { className: "pos-edit-permissions" });
        for (const category of data.categories) {
            const items = data.catalogue.filter((c) => c.category === category.id && !c.hidden);
            if (!items.length) continue;
            const list = el("ul", { className: "list-unstyled mb-0" });
            for (const item of items) {
                const boxId = `pe${id}-${item.key.replace(/[^a-zA-Z0-9]/g, "-")}`;
                const box = /** @type {HTMLInputElement} */ (el("input", {
                    type: "checkbox", className: "form-check-input", id: boxId, value: item.key,
                    disabled: !item.editable,
                    "aria-describedby": `${boxId}-d`,
                }));
                box.checked = before.has(item.key);
                boxes.set(item.key, box);
                list.append(el("li", { className: "form-check pos-edit-perm" }, [
                    box,
                    el("label", { className: "form-check-label", for: boxId }, [
                        el("span", { className: `pos-tier pos-tier-${item.tier} me-1`, text: item.tier, title: `Tier ${item.tier}` }),
                        el("span", { className: "fw-semibold", text: item.label }),
                    ]),
                    el("span", { className: "d-block small text-muted", id: `${boxId}-d` }, [
                        item.description,
                        item.requires.length ? ` Needs: ${labels(item.requires)}.` : "",
                        item.editable ? "" : el("span", { className: "d-block fst-italic", text: item.reason || "" }),
                    ]),
                ]));
            }
            permissionArea.append(el("fieldset", { className: "pos-edit-category" }, [
                el("legend", { className: "pos-group-heading", text: category.label }),
                list,
            ]));
        }

        const note = el("p", { className: "small text-info-emphasis mb-2", "aria-live": "polite" });
        const summary = el("p", { className: "small mb-2 pos-edit-summary", "aria-live": "polite" });
        const errors = el("div", { className: "alert alert-danger py-2 small d-none", role: "alert", tabindex: -1 });

        // "Start from" (new positions only): copies the permissions you can give.
        let startFrom = null;
        if (isNew) {
            startFrom = el("select", { className: "form-select form-select-sm", id: `pe${id}From` }, [
                el("option", { value: "", text: "Nothing (empty)" }),
                ...data.positions.filter((p) => p.active).map((p) => el("option", { value: p.id, text: p.name })),
            ]);
            startFrom.addEventListener("change", () => {
                const source = positionsById.get(Number(startFrom.value));
                const wanted = new Set(source?.permissions ?? []);
                let skipped = 0;
                for (const [key, box] of boxes) {
                    if (box.disabled) {
                        if (wanted.has(key)) skipped += 1;
                        continue;
                    }
                    box.checked = wanted.has(key);
                }
                note.textContent = skipped
                    ? `${skipped} of ${source?.name}'s permissions can't be given by you and were left out.`
                    : "";
                updateSummary();
            });
        }

        /**
         * Checked keys, disabled ones included.
         * @returns {string[]}
         */
        function checkedKeys() {
            return [...boxes].filter(([, b]) => b.checked).map(([k]) => k);
        }

        /**
         * Update the "adds / removes / affects" line.
         * @returns {void}
         */
        function updateSummary() {
            const now = new Set(checkedKeys());
            const added = [...now].filter((k) => !before.has(k));
            const removed = [...before].filter((k) => !now.has(k));
            const parts = [];
            if (added.length) parts.push(`Adds: ${labels(added)}.`);
            if (removed.length) parts.push(`Removes: ${labels(removed)}.`);
            if (!isNew && (added.length || removed.length)) {
                const n = position?.memberCount ?? 0;
                parts.push(`Affects ${n} ${n === 1 ? "person" : "people"}.`);
            }
            summary.textContent = parts.length ? parts.join(" ") : (isNew ? "" : "No permission changes.");
        }

        // Ticking adds prerequisites; unticking removes dependents.
        for (const [key, box] of boxes) {
            box.addEventListener("change", () => {
                note.textContent = "";
                if (box.checked) {
                    const missing = prerequisitesOf(key).filter((k) => !boxes.get(k)?.checked);
                    const blocked = missing.filter((k) => !boxes.get(k) || boxes.get(k).disabled);
                    if (blocked.length) {
                        box.checked = false;
                        note.textContent = `"${byKey.get(key)?.label}" needs ${labels(blocked)}, which you can't give.`;
                    } else if (missing.length) {
                        missing.forEach((k) => { boxes.get(k).checked = true; });
                        note.textContent = `Also ticked (needed): ${labels(missing)}.`;
                    }
                } else {
                    const needing = dependentsOf(key).filter((k) => boxes.get(k)?.checked);
                    const blocked = needing.filter((k) => boxes.get(k).disabled);
                    if (blocked.length) {
                        box.checked = true;
                        note.textContent = `${labels(blocked)} needs "${byKey.get(key)?.label}", and you can't remove that.`;
                    } else if (needing.length) {
                        needing.forEach((k) => { boxes.get(k).checked = false; });
                        note.textContent = `Also removed (they need it): ${labels(needing)}.`;
                    }
                }
                updateSummary();
            });
        }

        const saveButton = el("button", { type: "submit", className: "btn btn-primary btn-sm" }, [
            isNew ? "Create position" : "Save changes",
        ]);
        const cancelButton = el("button", { type: "button", className: "btn btn-outline-secondary btn-sm", text: "Cancel" });
        cancelButton.addEventListener("click", onCancel);

        const form = /** @type {HTMLFormElement} */ (el("form", { className: "pos-edit-form", novalidate: true }, [
            el("h2", { className: "h6 mb-3", text: isNew ? "New position" : `Edit ${position?.name}` }),
            errors,
            el("div", { className: "row g-2 mb-2" }, [
                el("div", { className: "col-12 col-md-6" }, [
                    el("label", { className: "form-label small fw-semibold mb-1", for: `pe${id}Name`, text: "Name" }),
                    nameInput,
                ]),
                el("div", { className: "col-6 col-md-3" }, [
                    el("label", { className: "form-label small fw-semibold mb-1", for: `pe${id}Tier`, text: "Tier" }),
                    tierSelect,
                ]),
                el("div", { className: "col-6 col-md-3" }, [
                    el("label", { className: "form-label small fw-semibold mb-1", for: `pe${id}Sort`, text: "Sort order" }),
                    sortInput,
                ]),
                el("div", { className: "col-12" }, [
                    el("label", { className: "form-label small fw-semibold mb-1", for: `pe${id}Desc`, text: "Description" }),
                    descInput,
                ]),
                startFrom && el("div", { className: "col-12 col-md-6" }, [
                    el("label", { className: "form-label small fw-semibold mb-1", for: `pe${id}From`, text: "Start from" }),
                    startFrom,
                ]),
                adminInput && el("div", { className: "col-12" }, [
                    el("div", { className: "form-check" }, [
                        adminInput,
                        el("label", { className: "form-check-label small", for: `pe${id}Admin`,
                            text: "Department admin position (kept at year end; convention admins only)" }),
                    ]),
                ]),
            ]),
            permissionArea,
            note,
            summary,
            el("div", { className: "d-flex gap-2" }, [saveButton, cancelButton]),
        ]));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            errors.classList.add("d-none");
            if (!nameInput.value.trim()) {
                errors.textContent = "Give the position a name.";
                errors.classList.remove("d-none");
                nameInput.focus();
                return;
            }
            saveButton.disabled = true;
            try {
                const body = {
                    name: nameInput.value,
                    description: descInput.value,
                    tier: Number(tierSelect.value),
                    sortOrder: Number(sortInput.value || 0),
                    isDepartmentAdmin: adminInput ? adminInput.checked : position?.isDepartmentAdmin === true,
                    permissions: checkedKeys(),
                };
                if (isNew) await api("/api/positions", "POST", body);
                else await api(`/api/positions/${position.id}`, "PUT", body);
                reloadWith(isNew ? `Created "${body.name.trim()}".` : `Saved "${body.name.trim()}".`);
            } catch (err) {
                errors.textContent = err instanceof Error ? err.message : String(err);
                errors.classList.remove("d-none");
                errors.focus();
                saveButton.disabled = false;
            }
        });

        updateSummary();
        return form;
    }

    // ── Edit buttons ────────────────────────────────────────────────────

    document.querySelectorAll("[data-pos-edit]").forEach((button) => {
        const position = positionsById.get(Number(button.getAttribute("data-pos-edit")));
        if (!position) return;
        if (position.lockReason) {
            button.disabled = true;
            button.title = position.lockReason;
            return;
        }
        button.addEventListener("click", () => {
            const details = button.closest("details");
            const host = details?.querySelector(".pos-position-edit");
            const view = details?.querySelector(".pos-position-view");
            const actions = details?.querySelector(".pos-position-actions");
            if (!details || !host || !view || !actions) return;

            const close = () => {
                host.replaceChildren();
                host.hidden = true;
                view.hidden = false;
                actions.hidden = false;
                button.focus();
            };
            host.replaceChildren(buildForm(position, close));
            host.hidden = false;
            view.hidden = true;
            actions.hidden = true;
            details.open = true;
            host.querySelector("input")?.focus();
        });
    });

    // ── New position ────────────────────────────────────────────────────

    const newButton = /** @type {HTMLButtonElement|null} */ (document.getElementById("posNewButton"));
    const newHost = document.getElementById("posNewHost");
    if (newButton && newHost) {
        newButton.addEventListener("click", () => {
            const close = () => {
                newHost.replaceChildren();
                newHost.hidden = true;
                newButton.disabled = false;
                newButton.focus();
            };
            newHost.replaceChildren(buildForm(null, close));
            newHost.hidden = false;
            newButton.disabled = true;
            newHost.querySelector("input")?.focus();
        });
    }

    // ── Retire / reactivate (second click confirms) ─────────────────────

    /**
     * Wire a button that needs a second click within a few seconds.
     *
     * @param {HTMLButtonElement} button
     * @param {string} confirmText
     * @param {() => Promise<void>} action
     * @returns {void}
     */
    function confirmButton(button, confirmText, action) {
        const original = button.innerHTML;
        let armed = false;
        /** @type {number|undefined} */
        let timer;
        button.addEventListener("click", async () => {
            if (!armed) {
                armed = true;
                button.textContent = confirmText;
                timer = window.setTimeout(() => {
                    armed = false;
                    button.innerHTML = original;
                }, 4000);
                return;
            }
            window.clearTimeout(timer);
            button.disabled = true;
            try {
                await action();
            } catch (err) {
                showStatus(err instanceof Error ? err.message : String(err), "danger");
                button.disabled = false;
                armed = false;
                button.innerHTML = original;
            }
        });
    }

    document.querySelectorAll("[data-pos-retire]").forEach((button) => {
        const id = Number(button.getAttribute("data-pos-retire"));
        const position = positionsById.get(id);
        if (position?.lockReason) {
            button.disabled = true;
            button.title = position.lockReason;
            return;
        }
        confirmButton(/** @type {HTMLButtonElement} */ (button), "Click again to retire", async () => {
            await api(`/api/positions/${id}/retire`, "POST");
            reloadWith(`Retired "${position?.name ?? "position"}".`);
        });
    });

    document.querySelectorAll("[data-pos-reactivate]").forEach((button) => {
        const id = Number(button.getAttribute("data-pos-reactivate"));
        const position = positionsById.get(id);
        confirmButton(/** @type {HTMLButtonElement} */ (button), "Click again to reactivate", async () => {
            await api(`/api/positions/${id}/reactivate`, "POST");
            reloadWith(`Reactivated "${position?.name ?? "position"}".`);
        });
    });
})();
