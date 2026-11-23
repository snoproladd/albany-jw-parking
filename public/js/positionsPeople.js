/**
 * @file public/js/positionsPeople.js
 * @description The People tab of the Positions page (multi-department
 * phase 3d-7d): change one person's positions and individual grants.
 *
 * Reads the JSON block "people-data" (routes/positionsRoutes.js
 * buildPeopleData()) and builds, inside #posPeopleHost:
 *
 * - Positions: the person's positions as chips (remove with ×) and an
 *   "Add position" picker. Positions the editor can't give or take away are
 *   shown with the reason.
 * - New-grant settings: expiry date (default from the server: last
 *   convention day + 30 days, or later if that has passed; none for people
 *   in an Oversight-tier or higher position or a department-admin one; no
 *   earlier than tomorrow) and an optional note.
 * - Every permission in category accordions. What the person holds is
 *   highlighted, with where it comes from ("From Keyman", "Individual
 *   grant · expires …", "New grant").
 *     - Ticking something they don't hold grants it (and what it needs).
 *     - Unticking an individual grant revokes it (and what needs it).
 *     - Unticking something a position gives is a tier-down: they leave that
 *       position, move to the highest lower position (by sort order) that
 *       doesn't include it, and keep the rest of the old position as
 *       individual grants. Only the unticked permissions are really lost.
 * - A live summary of the changes, and Save (one request; the page then
 *   reloads on the People tab).
 *
 * The server checks everything again (lib/positionEditing.js
 * planPersonSave()).
 */

(() => {
    "use strict";

    const dataEl = document.getElementById("people-data");
    const host = document.getElementById("posPeopleHost");
    if (!dataEl || !host) return;

    /**
     * @typedef {{ key: string, label: string, description: string, category: string, tier: number,
     *             requires: string[], editable: boolean, reason: string|null, hidden: boolean }} CatalogueItem
     * @typedef {{ id: number, name: string, tier: number|null, sortOrder: number, isDepartmentAdmin: boolean,
     *             isDefault: boolean, permissions: string[], neverExpire: boolean, assignReason: string|null }} DeptPosition
     * @typedef {{ key: string, expiresAt: string|null, note: string|null, grantedBy: string|null,
     *             grantedAt: string|null }} Grant
     */

    /** @type {{ departmentSlug: string, defaultExpiry: string, readOnlyReason: string|null,
     *           person: { id: number, name: string, positionIds: number[], grants: Grant[] },
     *           categories: Array<{ id: string, label: string }>, positions: DeptPosition[],
     *           catalogue: CatalogueItem[] }} */
    let data;
    try {
        data = JSON.parse(dataEl.textContent || "{}");
    } catch (err) {
        console.error("[positionsPeople] could not read people-data:", err);
        return;
    }

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";
    const readOnly = Boolean(data.readOnlyReason);
    const personName = data.person.name;
    const firstName = personName.split(" ")[0] || personName;

    /** @type {Map<string, CatalogueItem>} */
    const byKey = new Map(data.catalogue.map((c) => [c.key, c]));
    /** @type {Map<number, DeptPosition>} */
    const positionsById = new Map(data.positions.map((p) => [p.id, p]));

    /** @type {Map<string, string[]>} key → keys that list it in `requires` */
    const dependents = new Map();
    for (const c of data.catalogue) {
        for (const r of c.requires) {
            if (!dependents.has(r)) dependents.set(r, []);
            dependents.get(r).push(c.key);
        }
    }

    // ── State ───────────────────────────────────────────────────────────

    const originalPositions = new Set(data.person.positionIds.filter((id) => positionsById.has(id)));
    /** @type {Map<string, Grant>} */
    const originalGrants = new Map(data.person.grants.map((g) => [g.key, g]));

    /** @type {Set<number>} */
    let selected = new Set(originalPositions);
    /** @type {Map<string, Grant|null>} null value = new grant (not saved yet) */
    let grants = new Map([...originalGrants].map(([k, g]) => [k, g]));
    /** @type {{ from: string[], to: string|null, kept: string[], removed: string[] } | null} */
    let tierDown = null;
    /** True once the person edits the expiry date themselves. */
    let expiryTouched = false;

    // ── Helpers ─────────────────────────────────────────────────────────

    /**
     * Create an element with attributes and children. Text goes through
     * textContent, never HTML.
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
     * Labels of keys, for sentences.
     * @param {Iterable<string>} keys
     * @returns {string}
     */
    function labels(keys) {
        return [...keys].map((k) => byKey.get(k)?.label ?? k).join(", ");
    }

    /**
     * A date as "Mar 3, 2027".
     * @param {string} isoOrDate
     * @returns {string}
     */
    function shortDate(isoOrDate) {
        const d = new Date(isoOrDate.length === 10 ? `${isoOrDate}T12:00:00` : isoOrDate);
        return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    }

    /**
     * Everything a key needs, directly or through others (not the key).
     * @param {string} key
     * @returns {string[]}
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
     * Names of the selected positions that give a key.
     * @param {string} key
     * @returns {string[]}
     */
    function positionSources(key) {
        return [...selected]
            .map((id) => positionsById.get(id))
            .filter((p) => p && p.permissions.includes(key))
            .map((p) => p.name);
    }

    /**
     * Keys the person would hold now.
     * @returns {Set<string>}
     */
    function effective() {
        const keys = new Set(grants.keys());
        for (const id of selected) positionsById.get(id)?.permissions.forEach((k) => keys.add(k));
        return keys;
    }

    /**
     * True when the selected positions make grants never expire.
     * @returns {boolean}
     */
    function neverExpire() {
        return [...selected].some((id) => positionsById.get(id)?.neverExpire);
    }

    // ── Changes ─────────────────────────────────────────────────────────

    /**
     * Add grants for anything a grant needs that the person no longer holds
     * (after a position was removed).
     * @returns {string[]} Keys that couldn't be added (not editable).
     */
    function repairPrerequisites() {
        const blocked = [];
        let changed = true;
        while (changed) {
            changed = false;
            const held = effective();
            for (const key of [...grants.keys()]) {
                for (const r of byKey.get(key)?.requires ?? []) {
                    if (held.has(r)) continue;
                    if (byKey.get(r)?.editable) {
                        grants.set(r, null);
                        changed = true;
                    } else if (!blocked.includes(r)) {
                        blocked.push(r);
                    }
                }
            }
        }
        return blocked;
    }

    /**
     * Tick a permission the person doesn't hold: grant it and what it needs.
     * @param {string} key
     * @returns {string} Message for the note line.
     */
    function grantKey(key) {
        const held = effective();
        const missing = [key, ...prerequisitesOf(key)].filter((k) => !held.has(k));
        const blocked = missing.filter((k) => !byKey.get(k)?.editable);
        if (blocked.length) {
            return `"${byKey.get(key)?.label}" needs ${labels(blocked)}, which you can't grant.`;
        }
        missing.forEach((k) => grants.set(k, originalGrants.get(k) ?? null));
        const extra = missing.filter((k) => k !== key);
        return extra.length ? `Also granted (needed): ${labels(extra)}.` : "";
    }

    /**
     * Untick a permission. A grant is revoked; a permission from a position
     * means a tier-down.
     * @param {string} key
     * @returns {string} Message for the note line.
     */
    function removeKey(key) {
        const held = effective();
        const removed = [key, ...dependentsOf(key).filter((k) => held.has(k))];

        const fromPositionKeys = removed.filter((k) => positionSources(k).length > 0);
        if (fromPositionKeys.length === 0) {
            // Only individual grants: revoke them.
            const blocked = removed.filter((k) => !byKey.get(k)?.editable);
            if (blocked.length) return `You can't revoke ${labels(blocked)}.`;
            removed.forEach((k) => grants.delete(k));
            const extra = removed.filter((k) => k !== key);
            return extra.length ? `Also revoked (they need it): ${labels(extra)}.` : "";
        }

        // Tier-down.
        const affected = [...selected]
            .map((id) => positionsById.get(id))
            .filter((p) => p && p.permissions.some((k) => removed.includes(k)));
        const locked = affected.filter((p) => p.assignReason);
        if (locked.length) {
            return `You can't take ${firstName} out of ${locked.map((p) => p.name).join(", ")}: ${locked[0].assignReason}`;
        }

        const remaining = new Set([...selected].filter((id) => !affected.some((p) => p.id === id)));
        const highestSort = Math.max(...affected.map((p) => p.sortOrder ?? 0));
        const candidates = data.positions
            .filter((p) => !remaining.has(p.id) && !affected.some((a) => a.id === p.id))
            .filter((p) => !p.assignReason && (p.sortOrder ?? 0) < highestSort)
            .filter((p) => !p.permissions.some((k) => removed.includes(k)))
            .sort((a, b) => (b.sortOrder ?? 0) - (a.sortOrder ?? 0));
        const moveTo = candidates[0] ?? null;

        if (!moveTo && remaining.size === 0) {
            const def = data.positions.find((p) => p.isDefault);
            if (def && def.permissions.some((k) => removed.includes(k))) {
                return `Everyone keeps at least ${def.name}, which includes "${byKey.get(key)?.label}". It can't be taken from one person.`;
            }
        }

        const nextSelected = new Set(remaining);
        if (moveTo) nextSelected.add(moveTo.id);
        const stillFromPositions = new Set();
        for (const id of nextSelected) positionsById.get(id)?.permissions.forEach((k) => stillFromPositions.add(k));

        const kept = new Set();
        for (const p of affected) {
            for (const k of p.permissions) {
                if (!removed.includes(k) && !stillFromPositions.has(k) && !grants.has(k)) kept.add(k);
            }
        }
        const blocked = [...kept].filter((k) => !byKey.get(k)?.editable);
        if (blocked.length) {
            return `This would keep ${labels(blocked)} as individual grants, which you can't grant.`;
        }

        selected = nextSelected;
        removed.forEach((k) => grants.delete(k));
        kept.forEach((k) => grants.set(k, null));

        tierDown = {
            from: [...new Set([...(tierDown?.from ?? []), ...affected.map((p) => p.name)])],
            to: moveTo ? moveTo.name : (tierDown?.to ?? null),
            kept: [...new Set([...(tierDown?.kept ?? []), ...kept])],
            removed: [...new Set([...(tierDown?.removed ?? []), ...removed])],
        };

        return `${firstName} leaves ${affected.map((p) => p.name).join(" and ")}`
            + (moveTo ? ` and moves to ${moveTo.name}.` : ".")
            + (kept.size ? ` Kept as individual grants: ${labels(kept)}.` : "")
            + ` Removed: ${labels(removed)}.`;
    }

    // ── Rendering ───────────────────────────────────────────────────────

    const note = el("p", { className: "small text-info-emphasis mb-2", "aria-live": "polite" });
    const summary = el("p", { className: "small mb-2 pos-edit-summary", "aria-live": "polite" });
    const errors = el("div", { className: "alert alert-danger py-2 small d-none", role: "alert", tabindex: -1 });

    const chipList = el("ul", { className: "list-unstyled d-flex flex-wrap gap-2 mb-2", "aria-label": "Positions held" });
    const addSelect = /** @type {HTMLSelectElement} */ (el("select", {
        className: "form-select form-select-sm", id: "pplAddPosition", disabled: readOnly,
    }));
    const addButton = /** @type {HTMLButtonElement} */ (el("button", {
        type: "button", className: "btn btn-outline-primary btn-sm", text: "Add", disabled: readOnly,
    }));

    const expiryInput = /** @type {HTMLInputElement} */ (el("input", {
        type: "date", className: "form-control form-control-sm", id: "pplExpiry", disabled: readOnly,
        "aria-describedby": "pplExpiryHelp",
    }));
    const expiryHelp = el("div", { className: "form-text", id: "pplExpiryHelp" });
    const noteInput = /** @type {HTMLInputElement} */ (el("input", {
        type: "text", className: "form-control form-control-sm", id: "pplNote", maxlength: 400, disabled: readOnly,
        placeholder: "Why (optional), e.g. covering the desk on Saturday",
    }));

    /** @type {Map<string, { box: HTMLInputElement, row: HTMLElement, source: HTMLElement }>} */
    const rows = new Map();
    const accordion = el("div", { className: "pos-people-perms" });

    /** @type {HTMLDetailsElement[]} */
    const categoryDetails = [];
    for (const category of data.categories) {
        const items = data.catalogue.filter((c) => c.category === category.id && !c.hidden);
        if (!items.length) continue;
        const list = el("ul", { className: "pos-perm-list list-unstyled pos-position-body" });
        for (const item of items) {
            const boxId = `ppl-${item.key.replace(/[^a-zA-Z0-9]/g, "-")}`;
            const box = /** @type {HTMLInputElement} */ (el("input", {
                type: "checkbox", className: "form-check-input mt-1", id: boxId, value: item.key,
                "aria-describedby": `${boxId}-s`,
            }));
            const source = el("span", { className: "d-block small pos-source", id: `${boxId}-s` });
            const row = el("li", { className: "pos-perm pos-people-perm" }, [
                box,
                el("span", { className: "flex-grow-1" }, [
                    el("label", { for: boxId }, [
                        el("span", { className: `pos-tier pos-tier-${item.tier} me-1`, text: item.tier, title: `Tier ${item.tier}` }),
                        el("span", { className: "fw-semibold", text: item.label }),
                    ]),
                    el("span", { className: "d-block small text-muted", text: item.description }),
                    source,
                ]),
            ]);
            rows.set(item.key, { box, row, source });
            box.addEventListener("change", () => {
                const message = box.checked ? grantKey(item.key) : removeKey(item.key);
                const blocked = repairPrerequisites();
                note.textContent = message + (blocked.length ? ` Still needs ${labels(blocked)}.` : "");
                render();
            });
            list.append(row);
        }
        const count = el("span", { className: "pos-position-meta small text-muted" });
        const details = /** @type {HTMLDetailsElement} */ (el("details", { className: "pos-category" }, [
            el("summary", { className: "pos-position-summary" }, [
                el("h3", { className: "pos-category-name", text: category.label }),
                count,
            ]),
            list,
        ]));
        details.dataset.category = category.id;
        categoryDetails.push(details);
        accordion.append(details);
    }

    /**
     * Redraw chips, the add picker, checkboxes, expiry and the summary from
     * the current state.
     * @returns {void}
     */
    function render() {
        // Chips
        chipList.replaceChildren();
        const sortedSelected = [...selected].map((id) => positionsById.get(id)).filter(Boolean)
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        for (const p of sortedSelected) {
            const remove = el("button", {
                type: "button", className: "btn-close btn-close-sm ms-1", "aria-label": `Remove ${p.name}`,
                disabled: readOnly || Boolean(p.assignReason), title: p.assignReason || `Remove ${p.name}`,
            });
            remove.addEventListener("click", () => {
                selected.delete(p.id);
                const blocked = repairPrerequisites();
                note.textContent = `Removed from ${p.name}.` + (blocked.length ? ` Still needs ${labels(blocked)}.` : "");
                render();
            });
            chipList.append(el("li", { className: "pos-chip" }, [
                el("span", { className: `pos-tier pos-tier-${p.tier || 0} me-1`, text: p.tier || "?" }),
                p.name,
                remove,
            ]));
        }
        if (!sortedSelected.length) {
            const def = data.positions.find((p) => p.isDefault);
            chipList.append(el("li", { className: "small text-muted",
                text: def ? `No positions: ${def.name} will be given on save.` : "No positions." }));
        }

        // Add picker
        addSelect.replaceChildren(el("option", { value: "", text: "Add a position…" }));
        for (const p of data.positions) {
            if (selected.has(p.id)) continue;
            addSelect.append(el("option", {
                value: p.id,
                disabled: Boolean(p.assignReason),
                text: p.assignReason ? `${p.name} (can't: ${p.assignReason})` : p.name,
            }));
        }

        // Permissions
        const held = effective();
        for (const [key, { box, row, source }] of rows) {
            const item = byKey.get(key);
            const fromPos = positionSources(key);
            const grant = grants.get(key);
            const isGrant = grants.has(key);
            box.checked = held.has(key);
            row.classList.toggle("pos-held", held.has(key));

            const parts = [];
            if (fromPos.length) parts.push(`From ${fromPos.join(", ")}`);
            if (isGrant && grant) {
                parts.push(grant.expiresAt ? `Individual grant · expires ${shortDate(grant.expiresAt)}` : "Individual grant · no expiry");
            } else if (isGrant) {
                parts.push("New grant");
            } else if (originalGrants.has(key)) {
                parts.push("Grant will be revoked");
            }
            if (!item.editable) parts.push(item.reason || "");
            source.textContent = parts.filter(Boolean).join(" · ");

            box.disabled = readOnly || (!item.editable && !fromPos.length);
        }
        for (const details of categoryDetails) {
            const keys = data.catalogue.filter((c) => c.category === details.dataset.category && !c.hidden).map((c) => c.key);
            const n = keys.filter((k) => held.has(k)).length;
            const counter = details.querySelector(".pos-position-meta");
            if (counter) counter.textContent = `${n} of ${keys.length}`;
        }

        // Expiry
        const never = neverExpire();
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        expiryInput.min = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
        expiryInput.max = never ? "" : data.defaultExpiry;
        if (!expiryTouched) expiryInput.value = never ? "" : data.defaultExpiry;
        expiryHelp.textContent = never
            ? "No expiry by default: Oversight-tier and department-admin positions keep their grants. Pick a date to end new grants sooner."
            : `New grants end ${shortDate(data.defaultExpiry)} unless you pick an earlier date.`;

        // Summary
        const added = [...selected].filter((id) => !originalPositions.has(id)).map((id) => positionsById.get(id)?.name);
        const dropped = [...originalPositions].filter((id) => !selected.has(id)).map((id) => positionsById.get(id)?.name);
        const granted = [...grants.keys()].filter((k) => !originalGrants.has(k));
        const revoked = [...originalGrants.keys()].filter((k) => !grants.has(k));
        const out = [];
        if (added.length) out.push(`Gives: ${added.join(", ")}.`);
        if (dropped.length) out.push(`Takes away: ${dropped.join(", ")}.`);
        if (granted.length) out.push(`Grants: ${labels(granted)}.`);
        if (revoked.length) out.push(`Revokes: ${labels(revoked)}.`);
        if (tierDown?.removed.length) out.push(`Loses: ${labels(tierDown.removed)}.`);
        summary.textContent = out.length ? out.join(" ") : "No changes yet.";
        saveButton.disabled = readOnly || out.length === 0;
    }

    addButton.addEventListener("click", () => {
        const id = Number(addSelect.value);
        const p = positionsById.get(id);
        if (!p || p.assignReason) return;
        selected.add(id);
        note.textContent = `Gives ${p.name}.`;
        render();
        addSelect.focus();
    });

    expiryInput.addEventListener("change", () => {
        expiryTouched = true;
    });

    const saveButton = /** @type {HTMLButtonElement} */ (el("button", {
        type: "submit", className: "btn btn-primary btn-sm", text: "Save changes",
    }));
    const resetButton = el("button", { type: "button", className: "btn btn-outline-secondary btn-sm", text: "Undo all", disabled: readOnly });
    resetButton.addEventListener("click", () => {
        selected = new Set(originalPositions);
        grants = new Map([...originalGrants].map(([k, g]) => [k, g]));
        tierDown = null;
        expiryTouched = false;
        note.textContent = "Changes undone.";
        render();
    });

    const form = /** @type {HTMLFormElement} */ (el("form", { className: "pos-people-form", novalidate: true }, [
        errors,
        el("h3", { className: "pos-group-heading", text: "Positions" }),
        chipList,
        el("div", { className: "row g-2 align-items-end mb-3" }, [
            el("div", { className: "col-12 col-sm-8 col-md-6" }, [
                el("label", { className: "visually-hidden", for: "pplAddPosition", text: "Add a position" }),
                addSelect,
            ]),
            el("div", { className: "col-auto" }, [addButton]),
        ]),
        el("h3", { className: "pos-group-heading", text: "New individual grants" }),
        el("div", { className: "row g-2 mb-3" }, [
            el("div", { className: "col-12 col-sm-5 col-md-4" }, [
                el("label", { className: "form-label small fw-semibold mb-1", for: "pplExpiry", text: "Expires on" }),
                expiryInput,
            ]),
            el("div", { className: "col-12 col-sm-7 col-md-8" }, [
                el("label", { className: "form-label small fw-semibold mb-1", for: "pplNote", text: "Note" }),
                noteInput,
            ]),
            el("div", { className: "col-12" }, [expiryHelp]),
        ]),
        el("div", { className: "d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2" }, [
            el("h3", { className: "pos-group-heading m-0", text: "Permissions" }),
            el("span", { className: "small text-muted", text: "Highlighted: what they hold now." }),
        ]),
        accordion,
        note,
        summary,
        el("div", { className: "d-flex gap-2" }, [saveButton, resetButton]),
    ]));

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (readOnly) return;
        errors.classList.add("d-none");
        saveButton.disabled = true;
        try {
            const body = {
                departmentSlug: data.departmentSlug,
                positions: [...selected],
                grants: [...grants.keys()],
                expiresOn: expiryTouched ? expiryInput.value : "",
                note: noteInput.value,
                tierDown,
            };
            const res = await fetch(`/api/positions/people/${data.person.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", Accept: "application/json", "CSRF-Token": csrfToken },
                body: JSON.stringify(body),
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
            try {
                sessionStorage.setItem("positions:flash", `Saved ${personName}'s access.`);
            } catch {
                // Storage unavailable: reload without the message.
            }
            location.reload();
        } catch (err) {
            errors.textContent = err instanceof Error ? err.message : String(err);
            errors.classList.remove("d-none");
            errors.focus();
            saveButton.disabled = false;
        }
    });

    // Open the categories where the person holds something.
    host.replaceChildren(form);
    render();
    const heldNow = effective();
    for (const details of categoryDetails) {
        details.open = data.catalogue.some((c) => c.category === details.dataset.category && heldNow.has(c.key));
    }
})();
