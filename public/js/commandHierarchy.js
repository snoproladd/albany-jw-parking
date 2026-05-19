/**
 * @file commandHierarchy.js
 * @description Admin tree editor for the chain-of-command hierarchy.
 *
 * Reads a flat node list from embedded JSON, renders a draggable
 * indent-based tree, and persists changes via the hierarchy API.
 *
 * Node shape:
 *   { id, parent_id, role_title, sort_order, volunteer_id, firstName, lastName }
 *
 * State: the authoritative state is _nodes (a flat array). The tree is
 * re-rendered from _nodes after every mutation.
 */

// ─────────────────────────────────────────────
//  Bootstrap data
// ─────────────────────────────────────────────

/** @type {Array<{id:number, name:string}>} */
const _volunteers = JSON.parse(
  document.getElementById("ch-volunteers-data")?.textContent || "[]",
);

/** @type {Array<{id:number,parent_id:number|null,role_title:string,sort_order:number,volunteer_id:number|null,firstName:string,lastName:string}>} */
let _nodes = JSON.parse(
  document.getElementById("ch-hierarchy-data")?.textContent || "[]",
);

let _nextTempId = -1; // negative IDs for unsaved nodes

// ─────────────────────────────────────────────
//  DOM refs
// ─────────────────────────────────────────────

const _treeEl = /** @type {HTMLElement} */ (document.getElementById("chTree"));
const _saveBtn = document.getElementById("chSaveBtn");
const _addRootBtn = document.getElementById("chAddRootBtn");
const _saveStatus = document.getElementById("chSaveStatus");

/** @returns {string} */
function _csrf() {
  return document.getElementById("ch-csrf")?.value || "";
}

// ─────────────────────────────────────────────
//  Tree helpers
// ─────────────────────────────────────────────

/**
 * Produce a pre-order flat list from _nodes with depth annotations.
 * @returns {Array<{node: object, depth: number}>}
 */
function _flattenTree() {
  /** @param {number|null} parentId @param {number} depth @param {Array} out */
  function walk(parentId, depth, out) {
    _nodes
      .filter((n) => (n.parent_id ?? null) === parentId)
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach((n) => {
        out.push({ node: n, depth });
        walk(n.id, depth + 1, out);
      });
  }
  const out = [];
  walk(null, 0, out);
  return out;
}

/**
 * Get the display name for a volunteer id.
 * @param {number|null} volId
 * @returns {string}
 */
function _volName(volId) {
  if (!volId) return "— Unassigned —";
  return _volunteers.find((v) => v.id === volId)?.name || `Volunteer #${volId}`;
}

/**
 * Get all descendant IDs of a node (for preventing circular parent refs).
 * @param {number} nodeId
 * @returns {Set<number>}
 */
function _descendants(nodeId) {
  const out = new Set();
  const q = [nodeId];
  while (q.length) {
    const id = q.shift();
    _nodes
      .filter((n) => n.parent_id === id)
      .forEach((n) => {
        out.add(n.id);
        q.push(n.id);
      });
  }
  return out;
}

// ─────────────────────────────────────────────
//  Mutations
// ─────────────────────────────────────────────

/**
 * Re-number sort_order within each sibling group to 0, 1, 2 …
 * @returns {void}
 */
function _renumber() {
  const groups = new Map();
  for (const n of _nodes) {
    const key = n.parent_id ?? null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  for (const siblings of groups.values()) {
    siblings
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach((n, i) => {
        n.sort_order = i;
      });
  }
}

/**
 * Move a node up among its siblings.
 * @param {number} id
 * @returns {void}
 */
function _moveUp(id) {
  const node = _nodes.find((n) => n.id === id);
  if (!node) return;
  const siblings = _nodes
    .filter((n) => (n.parent_id ?? null) === (node.parent_id ?? null))
    .sort((a, b) => a.sort_order - b.sort_order);
  const idx = siblings.indexOf(node);
  if (idx <= 0) return;
  [siblings[idx].sort_order, siblings[idx - 1].sort_order] = [
    siblings[idx - 1].sort_order,
    siblings[idx].sort_order,
  ];
  _renumber();
  _render();
}

/**
 * Move a node down among its siblings.
 * @param {number} id
 * @returns {void}
 */
function _moveDown(id) {
  const node = _nodes.find((n) => n.id === id);
  if (!node) return;
  const siblings = _nodes
    .filter((n) => (n.parent_id ?? null) === (node.parent_id ?? null))
    .sort((a, b) => a.sort_order - b.sort_order);
  const idx = siblings.indexOf(node);
  if (idx >= siblings.length - 1) return;
  [siblings[idx].sort_order, siblings[idx + 1].sort_order] = [
    siblings[idx + 1].sort_order,
    siblings[idx].sort_order,
  ];
  _renumber();
  _render();
}

/**
 * Indent: make the node a child of the previous sibling.
 * @param {number} id
 * @returns {void}
 */
function _indent(id) {
  const node = _nodes.find((n) => n.id === id);
  if (!node) return;
  const siblings = _nodes
    .filter((n) => (n.parent_id ?? null) === (node.parent_id ?? null))
    .sort((a, b) => a.sort_order - b.sort_order);
  const idx = siblings.indexOf(node);
  if (idx <= 0) return;
  const newParent = siblings[idx - 1];
  node.parent_id = newParent.id;
  node.sort_order = _nodes.filter((n) => n.parent_id === newParent.id).length;
  _renumber();
  _render();
}

/**
 * Outdent: promote node to be a sibling after its current parent.
 * @param {number} id
 * @returns {void}
 */
function _outdent(id) {
  const node = _nodes.find((n) => n.id === id);
  if (!node || node.parent_id === null) return;
  const parent = _nodes.find((n) => n.id === node.parent_id);
  if (!parent) return;
  const grandParentId = parent.parent_id ?? null;
  node.parent_id = grandParentId;
  node.sort_order = parent.sort_order + 0.5; // insert after parent
  _renumber();
  _render();
}

/**
 * Add a new node as a child of the given parent (or root if null).
 * @param {number|null} parentId
 * @returns {void}
 */
function _addNode(parentId) {
  const siblings = _nodes.filter((n) => (n.parent_id ?? null) === parentId);
  const newNode = {
    id: _nextTempId--,
    parent_id: parentId,
    role_title: "New Role",
    sort_order: siblings.length,
    volunteer_id: null,
    firstName: null,
    lastName: null,
  };
  _nodes.push(newNode);
  _render();
}

/**
 * Delete a node (promoting children to its parent).
 * @param {number} id
 * @returns {void}
 */
function _deleteNode(id) {
  const node = _nodes.find((n) => n.id === id);
  if (!node) return;
  // Promote children
  _nodes
    .filter((n) => n.parent_id === id)
    .forEach((n) => {
      n.parent_id = node.parent_id ?? null;
    });
  _nodes = _nodes.filter((n) => n.id !== id);
  _renumber();
  _render();
}

/**
 * Update role_title for a node inline.
 * @param {number} id
 * @param {string} title
 * @returns {void}
 */
function _updateTitle(id, title) {
  const node = _nodes.find((n) => n.id === id);
  if (node) node.role_title = title;
}

/**
 * Update volunteer_id for a node.
 * @param {number} id
 * @param {number|null} volId
 * @returns {void}
 */
function _updateVolunteer(id, volId) {
  const node = _nodes.find((n) => n.id === id);
  if (!node) return;
  node.volunteer_id = volId;
  const vol = _volunteers.find((v) => v.id === volId);
  if (vol) {
    const [last, rest] = (vol.name || "").split(", ");
    node.firstName = rest?.trim() || null;
    node.lastName = last?.trim() || null;
  } else {
    node.firstName = null;
    node.lastName = null;
  }
}

// ─────────────────────────────────────────────
//  Render
// ─────────────────────────────────────────────

/**
 * Render the full tree into #chTree.
 * @returns {void}
 */
function _render() {
  _treeEl.innerHTML = "";
  const flat = _flattenTree();

  if (flat.length === 0) {
    const empty = document.createElement("p");
    empty.classList.add("text-muted", "small");
    empty.textContent = 'No nodes yet. Click "Add root node" to begin.';
    _treeEl.appendChild(empty);
    return;
  }

  flat.forEach(({ node, depth }) => {
    const siblings = _nodes
      .filter((n) => (n.parent_id ?? null) === (node.parent_id ?? null))
      .sort((a, b) => a.sort_order - b.sort_order);
    const idx = siblings.indexOf(node);
    const isFirst = idx === 0;
    const isLast = idx === siblings.length - 1;

    const row = document.createElement("div");
    row.classList.add("ch-row");
    row.dataset.id = String(node.id);
    row.style.setProperty("--depth", String(depth));

    row.innerHTML = `
          <div class="ch-indent-line"></div>
          <div class="ch-row-body">
            <div class="ch-row-top">
              <input type="text" class="ch-title-input form-control form-control-sm"
                     value="${_esc(node.role_title)}" placeholder="Role title"
                     data-id="${node.id}" />
              <select class="ch-vol-select form-select form-select-sm" data-id="${node.id}">
                <option value="">— Unassigned —</option>
                ${_volunteers
                  .map(
                    (v) =>
                      `<option value="${v.id}" ${v.id === node.volunteer_id ? "selected" : ""}>${_esc(v.name)}</option>`,
                  )
                  .join("")}
              </select>
            </div>
            <div class="ch-row-actions">
              <button type="button" class="ch-btn" data-action="up"      data-id="${node.id}" title="Move up"      ${isFirst ? "disabled" : ""}><i class="fa-solid fa-arrow-up"></i></button>
              <button type="button" class="ch-btn" data-action="down"    data-id="${node.id}" title="Move down"    ${isLast ? "disabled" : ""}><i class="fa-solid fa-arrow-down"></i></button>
              <button type="button" class="ch-btn" data-action="indent"  data-id="${node.id}" title="Indent →"     ${isFirst || depth >= 6 ? "disabled" : ""}><i class="fa-solid fa-arrow-right"></i></button>
              <button type="button" class="ch-btn" data-action="outdent" data-id="${node.id}" title="Outdent ←"    ${depth === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-left"></i></button>
              <button type="button" class="ch-btn ch-btn--add"    data-action="add-child" data-id="${node.id}" title="Add child"><i class="fa-solid fa-plus"></i></button>
              <button type="button" class="ch-btn ch-btn--delete" data-action="delete"    data-id="${node.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>`;

    _treeEl.appendChild(row);
  });

  // Wire events
  _treeEl.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      const id = Number(btn.dataset.id);
      if (action === "up") _moveUp(id);
      else if (action === "down") _moveDown(id);
      else if (action === "indent") _indent(id);
      else if (action === "outdent") _outdent(id);
      else if (action === "add-child") _addNode(id);
      else if (action === "delete") {
        if (
          confirm(
            "Delete this node? Its children will be promoted to its level.",
          )
        ) {
          _deleteNode(id);
        }
      }
    });
  });

  _treeEl.querySelectorAll(".ch-title-input").forEach((input) => {
    input.addEventListener("input", () => {
      _updateTitle(Number(input.dataset.id), input.value);
    });
  });

  _treeEl.querySelectorAll(".ch-vol-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      _updateVolunteer(
        Number(sel.dataset.id),
        sel.value ? Number(sel.value) : null,
      );
    });
  });
}

/**
 * HTML-escape a string.
 * @param {string} str
 * @returns {string}
 */
function _esc(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─────────────────────────────────────────────
//  Persistence
// ─────────────────────────────────────────────

/**
 * Save the current node order and content to the server.
 * New nodes (negative IDs) are added first, then existing ones updated.
 * @returns {Promise<void>}
 */
async function _save() {
  if (_saveBtn) {
    _saveBtn.disabled = true;
  }
  if (_saveStatus) {
    _saveStatus.textContent = "Saving…";
    _saveStatus.className = "text-muted small";
  }

  try {
    // Add new nodes (negative IDs) first, mapping temp→real IDs
    const idMap = new Map();
    const newNodes = _nodes.filter((n) => n.id < 0);
    for (const n of newNodes) {
      const parentId =
        n.parent_id !== null && idMap.has(n.parent_id)
          ? idMap.get(n.parent_id)
          : n.parent_id !== null && n.parent_id >= 0
            ? n.parent_id
            : null;

      const res = await fetch("/oversight/tools/hierarchy/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": _csrf(),
        },
        body: JSON.stringify({
          parent_id: parentId,
          role_title: n.role_title,
          volunteer_id: n.volunteer_id,
          sort_order: n.sort_order,
        }),
      });
      const data = await res.json();
      if (data.success && data.id) {
        idMap.set(n.id, data.id);
        n.id = data.id;
      }
    }

    // Remap temp parent references
    for (const n of _nodes) {
      if (n.parent_id !== null && idMap.has(n.parent_id)) {
        n.parent_id = idMap.get(n.parent_id);
      }
    }

    // Bulk-save order
    const res = await fetch("/oversight/tools/hierarchy/save", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": _csrf() },
      body: JSON.stringify({ nodes: _nodes }),
    });
    const data = await res.json();

    if (data.success) {
      if (_saveStatus) {
        _saveStatus.textContent = "Saved.";
        _saveStatus.className = "text-success small";
      }
      setTimeout(() => {
        if (_saveStatus) _saveStatus.textContent = "";
      }, 3000);
    } else {
      throw new Error(data.error || "Save failed");
    }
  } catch (err) {
    console.error("[hierarchy] save error:", err);
    if (_saveStatus) {
      _saveStatus.textContent = "Save failed — please try again.";
      _saveStatus.className = "text-danger small";
    }
  } finally {
    if (_saveBtn) _saveBtn.disabled = false;
  }
}

// ─────────────────────────────────────────────
//  Init
// ─────────────────────────────────────────────

_saveBtn?.addEventListener("click", _save);
_addRootBtn?.addEventListener("click", () => _addNode(null));

_render();
