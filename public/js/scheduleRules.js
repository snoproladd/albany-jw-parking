/**
 * @file scheduleRules.js
 * @description Client-side controller for the Schedule Analysis Rules admin page.
 *
 * Loads rules from GET /api/schedule/rules, renders them as a sortable list,
 * and handles add/edit/toggle/delete/reorder via the rules CRUD API.
 */

// ── State ─────────────────────────────────────────────────────────────────────

/** @type {Array<{ id: number, rule_text: string, sort_order: number, active: boolean }>} */
let _rules = [];

const _csrf = document.querySelector('meta[name="csrf-token"]')?.content || "";

// ── Entry point ───────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  _load();
  _wireAddForm();
});

// ── Data ──────────────────────────────────────────────────────────────────────

async function _load() {
  try {
    const res = await fetch("/api/schedule/rules");
    const data = await res.json();
    _rules = data.rules || [];
    _render();
  } catch {
    document.getElementById("sarLoading")?.classList.add("d-none");
    document.getElementById("sarError")?.classList.remove("d-none");
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function _render() {
  const loading = document.getElementById("sarLoading");
  const empty = document.getElementById("sarEmpty");
  const list = document.getElementById("sarList");
  const count = document.getElementById("sarActiveCount");

  loading?.classList.add("d-none");

  const activeCount = _rules.filter((r) => r.active).length;
  if (count) count.textContent = activeCount + " active";

  if (_rules.length === 0) {
    list?.classList.add("d-none");
    empty?.classList.remove("d-none");
    return;
  }

  empty?.classList.add("d-none");
  list?.classList.remove("d-none");

  list.innerHTML = "";
  _rules.forEach((rule, index) => {
    list.appendChild(_buildRow(rule, index));
  });
}

/**
 * @param {{ id: number, rule_text: string, sort_order: number, active: boolean }} rule
 * @param {number} index
 * @returns {HTMLElement}
 */
function _buildRow(rule, index) {
  const row = document.createElement("div");
  row.className = "sar-row" + (rule.active ? "" : " sar-row--inactive");
  row.dataset.id = String(rule.id);

  // ── View mode ──────────────────────────────────────────────────────────
  const viewEl = document.createElement("div");
  viewEl.className = "sar-row-view";

  const reorderCol = document.createElement("div");
  reorderCol.className = "sar-reorder";
  const upBtn = document.createElement("button");
  upBtn.type = "button";
  upBtn.className = "sar-reorder-btn";
  upBtn.title = "Move up";
  upBtn.disabled = index === 0;
  upBtn.innerHTML = '<i class="fa-solid fa-chevron-up"></i>';
  upBtn.addEventListener("click", () => _onMoveUp(rule.id));

  const dnBtn = document.createElement("button");
  dnBtn.type = "button";
  dnBtn.className = "sar-reorder-btn";
  dnBtn.title = "Move down";
  dnBtn.disabled = index === _rules.length - 1;
  dnBtn.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
  dnBtn.addEventListener("click", () => _onMoveDown(rule.id));

  reorderCol.appendChild(upBtn);
  reorderCol.appendChild(dnBtn);

  const textEl = document.createElement("div");
  textEl.className =
    "sar-rule-text" + (rule.active ? "" : " sar-rule-text--inactive");
  textEl.textContent = rule.rule_text;

  const actions = document.createElement("div");
  actions.className = "sar-row-actions";

  // Toggle active
  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "sar-btn sar-btn--toggle";
  toggleBtn.title = rule.active ? "Deactivate" : "Activate";
  toggleBtn.innerHTML = rule.active
    ? '<i class="fa-solid fa-toggle-on text-success"></i>'
    : '<i class="fa-solid fa-toggle-off text-secondary"></i>';
  toggleBtn.addEventListener("click", () => _onToggle(rule.id));

  // Edit
  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "sar-btn sar-btn--edit";
  editBtn.title = "Edit";
  editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
  editBtn.addEventListener("click", () => _startEdit(row, rule));

  // Delete
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "sar-btn sar-btn--delete";
  deleteBtn.title = "Delete";
  deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
  deleteBtn.addEventListener("click", () => _onDelete(rule.id));

  actions.appendChild(toggleBtn);
  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);

  viewEl.appendChild(reorderCol);
  viewEl.appendChild(textEl);
  viewEl.appendChild(actions);

  // ── Edit mode (hidden initially) ───────────────────────────────────────
  const editEl = document.createElement("div");
  editEl.className = "sar-row-edit d-none";

  const editTextarea = document.createElement("textarea");
  editTextarea.className = "sar-textarea";
  editTextarea.rows = 3;
  editTextarea.value = rule.rule_text;

  const editFooter = document.createElement("div");
  editFooter.className = "sar-edit-footer";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "sar-btn sar-btn--save";
  saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk me-1"></i>Save';
  saveBtn.addEventListener("click", () =>
    _onSaveEdit(rule.id, editTextarea, row),
  );

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "sar-btn sar-btn--cancel";
  cancelBtn.innerHTML = '<i class="fa-solid fa-xmark me-1"></i>Cancel';
  cancelBtn.addEventListener("click", () => _cancelEdit(row));

  const editErrEl = document.createElement("span");
  editErrEl.className = "sar-inline-error d-none";

  editFooter.appendChild(saveBtn);
  editFooter.appendChild(cancelBtn);
  editFooter.appendChild(editErrEl);

  editEl.appendChild(editTextarea);
  editEl.appendChild(editFooter);

  row.appendChild(viewEl);
  row.appendChild(editEl);

  return row;
}

// ── Edit helpers ──────────────────────────────────────────────────────────────

function _startEdit(row, rule) {
  row.querySelector(".sar-row-view")?.classList.add("d-none");
  row.querySelector(".sar-row-edit")?.classList.remove("d-none");
  row.querySelector("textarea")?.focus();
}

function _cancelEdit(row) {
  row.querySelector(".sar-row-view")?.classList.remove("d-none");
  row.querySelector(".sar-row-edit")?.classList.add("d-none");
}

// ── API actions ───────────────────────────────────────────────────────────────

async function _onToggle(id) {
  try {
    const res = await fetch(`/api/schedule/rules/${id}/toggle`, {
      method: "PATCH",
    });
    if (!res.ok) return;
    const rule = _rules.find((r) => r.id === id);
    if (rule) rule.active = !rule.active;
    _render();
  } catch (err) {
    console.error("[scheduleRules] toggle error:", err);
  }
}

async function _onDelete(id) {
  if (!confirm("Delete this rule? This cannot be undone.")) return;
  try {
    const res = await fetch(`/api/schedule/rules/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    _rules = _rules.filter((r) => r.id !== id);
    _render();
  } catch (err) {
    console.error("[scheduleRules] delete error:", err);
  }
}

async function _onSaveEdit(id, textarea, row) {
  const text = textarea.value.trim();
  const errEl = row.querySelector(".sar-inline-error");
  const saveBtn = row.querySelector(".sar-btn--save");

  if (!text) {
    if (errEl) {
      errEl.textContent = "Rule text cannot be empty.";
      errEl.classList.remove("d-none");
    }
    return;
  }

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-1"></span>Saving…';
  }

  try {
    const res = await fetch(`/api/schedule/rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ruleText: text }),
    });
    if (!res.ok) throw new Error("Save failed.");
    const rule = _rules.find((r) => r.id === id);
    if (rule) rule.rule_text = text;
    _render();
  } catch {
    if (errEl) {
      errEl.textContent = "Save failed. Please try again.";
      errEl.classList.remove("d-none");
    }
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk me-1"></i>Save';
    }
  }
}

async function _onMoveUp(id) {
  const idx = _rules.findIndex((r) => r.id === id);
  if (idx <= 0) return;
  await _swap(idx, idx - 1);
}

async function _onMoveDown(id) {
  const idx = _rules.findIndex((r) => r.id === id);
  if (idx < 0 || idx >= _rules.length - 1) return;
  await _swap(idx, idx + 1);
}

async function _swap(i, j) {
  const a = _rules[i],
    b = _rules[j];
  const newOrderA = b.sort_order,
    newOrderB = a.sort_order;

  try {
    await Promise.all([
      fetch(`/api/schedule/rules/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: newOrderA }),
      }),
      fetch(`/api/schedule/rules/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: newOrderB }),
      }),
    ]);
    a.sort_order = newOrderA;
    b.sort_order = newOrderB;
    _rules.sort((x, y) => x.sort_order - y.sort_order);
    _render();
  } catch (err) {
    console.error("[scheduleRules] reorder error:", err);
  }
}

// ── Add form ──────────────────────────────────────────────────────────────────

function _wireAddForm() {
  const textarea = document.getElementById("sarNewRuleText");
  const addBtn = document.getElementById("sarAddBtn");
  const charCount = document.getElementById("sarCharCount");
  const errEl = document.getElementById("sarAddError");

  textarea?.addEventListener("input", () => {
    const len = textarea.value.length;
    if (charCount) charCount.textContent = `${len} / 2000`;
  });

  addBtn?.addEventListener("click", async () => {
    const text = textarea?.value.trim();
    errEl?.classList.add("d-none");

    if (!text) {
      if (errEl) {
        errEl.textContent = "Rule text cannot be empty.";
        errEl.classList.remove("d-none");
      }
      textarea?.focus();
      return;
    }

    addBtn.disabled = true;
    addBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-1"></span>Adding…';

    try {
      const nextOrder =
        _rules.length > 0
          ? Math.max(..._rules.map((r) => r.sort_order)) + 10
          : 10;

      const res = await fetch("/api/schedule/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleText: text, sortOrder: nextOrder }),
      });

      if (!res.ok) throw new Error("Add failed.");
      const data = await res.json();

      _rules.push({
        id: data.id,
        rule_text: text,
        sort_order: nextOrder,
        active: true,
      });

      if (textarea) textarea.value = "";
      if (charCount) charCount.textContent = "0 / 2000";

      // Collapse empty state if showing
      document.getElementById("sarEmpty")?.classList.add("d-none");
      _render();
    } catch {
      if (errEl) {
        errEl.textContent = "Failed to add rule. Please try again.";
        errEl.classList.remove("d-none");
      }
    } finally {
      addBtn.disabled = false;
      addBtn.innerHTML = '<i class="fa-solid fa-plus me-1"></i>Add Rule';
    }
  });
}
