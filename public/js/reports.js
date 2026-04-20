/**
 * @file reports.js
 * @description Client-side logic for the Oversight Reports page.
 *
 * Reads volunteer data from window.REPORT_DATA (injected by the EJS template),
 * renders the Application Status table, and wires up filtering and sorting.
 *
 * No external dependencies — vanilla JS + Bootstrap 5.
 */

// ─── Data ──────────────────────────────────────────────────────────────────

/**
 * Load volunteer rows embedded in the page as a JSON data block.
 * Uses the same CSP-safe pattern as the Messaging Center.
 * @returns {Array<object>}
 */
function loadVolunteers() {
  try {
    const el = document.getElementById("report-volunteer-data");
    return el ? JSON.parse(el.textContent) : [];
  } catch {
    return [];
  }
}

/** @type {Array<object>} */
const volunteers = loadVolunteers();

// ─── DOM references ────────────────────────────────────────────────────────

const tbody = /** @type {HTMLTableSectionElement} */ (
  document.getElementById("appStatusBody")
);
const emptyState = /** @type {HTMLElement}             */ (
  document.getElementById("appStatusEmpty")
);
const visibleCount = /** @type {HTMLElement}             */ (
  document.getElementById("visibleCount")
);
const statusFilter = /** @type {HTMLSelectElement}       */ (
  document.getElementById("statusFilter")
);
const searchInput = /** @type {HTMLInputElement}        */ (
  document.getElementById("reportSearch")
);
const sortableHeads = /** @type {NodeListOf<HTMLElement>} */ (
  document.querySelectorAll("th[data-col]")
);

// ─── Sort state ────────────────────────────────────────────────────────────

/** @type {{ col: string, dir: 'asc'|'desc' }} */
let sortState = { col: "name", dir: "asc" };

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Format an ISO date string (or Date-like value) to a locale date string.
 * Returns an em-dash if the value is null/undefined/empty.
 *
 * @param {string|Date|null|undefined} val
 * @returns {string}
 */
function fmtDate(val) {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d.valueOf())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Build the display name for a volunteer row.
 *
 * @param {{ firstName:string|null, lastName:string|null, suffix:string|null }} v
 * @returns {string}
 */
function displayName(v) {
  const parts = [v.lastName, v.firstName].filter(Boolean).join(", ");
  return v.suffix ? `${parts} ${v.suffix}` : parts;
}

/**
 * Return a Bootstrap badge HTML string for a registration_status value.
 *
 * @param {string} status
 * @param {boolean} isComplete - Whether the profile passed isProfileComplete checks.
 * @returns {string}
 */
function statusBadge(status, isComplete) {
  if (status === "completed") {
    return '<span class="badge bg-success">Completed</span>';
  }
  if (status === "draft" && isComplete) {
    // Shouldn't normally occur after promoteIfComplete runs, but handle gracefully
    return '<span class="badge bg-warning text-dark">Draft (promotable)</span>';
  }
  if (status === "draft") {
    return '<span class="badge bg-secondary">Draft</span>';
  }
  return `<span class="badge bg-light text-dark border">${status}</span>`;
}

/**
 * Return a sortable key for a given column from a volunteer row.
 *
 * @param {object} v
 * @param {string} col
 * @returns {string|number}
 */
function sortKey(v, col) {
  switch (col) {
    case "name":
      return displayName(v).toLowerCase();
    case "email":
      return (v.email || "").toLowerCase();
    case "status":
      return v.registration_status || "";
    case "updated":
      return v.last_updated ? new Date(v.last_updated).getTime() : 0;
    default:
      return "";
  }
}

// ─── Render ────────────────────────────────────────────────────────────────

/**
 * Filter, sort, and re-render the Application Status table body.
 * Called on every filter/sort change.
 *
 * @returns {void}
 */
function renderTable() {
  const statusVal = statusFilter.value;
  const searchVal = searchInput.value.trim().toLowerCase();

  // 1. Filter
  let filtered = volunteers.filter((v) => {
    if (statusVal === "completed" && v.registration_status !== "completed")
      return false;
    if (statusVal === "draft" && v.registration_status !== "draft")
      return false;

    if (searchVal) {
      const name = displayName(v).toLowerCase();
      const email = (v.email || "").toLowerCase();
      if (!name.includes(searchVal) && !email.includes(searchVal)) return false;
    }

    return true;
  });

  // 2. Sort
  const { col, dir } = sortState;
  filtered.sort((a, b) => {
    const ka = sortKey(a, col);
    const kb = sortKey(b, col);
    if (ka < kb) return dir === "asc" ? -1 : 1;
    if (ka > kb) return dir === "asc" ? 1 : -1;
    return 0;
  });

  // 3. Render rows
  if (filtered.length === 0) {
    tbody.innerHTML = "";
    emptyState.classList.remove("d-none");
    visibleCount.textContent = "0";
    return;
  }

  emptyState.classList.add("d-none");
  visibleCount.textContent = String(filtered.length);

  tbody.innerHTML = filtered
    .map((v) => {
      const name = displayName(v);
      const email = v.email || '<span class="text-muted">—</span>';
      const badge = statusBadge(v.registration_status, v.isComplete);
      const updated = fmtDate(v.last_updated);

      const missingHtml =
        v.missingFields && v.missingFields.length > 0
          ? v.missingFields
              .map(
                (f) =>
                  `<span class="badge bg-warning text-dark me-1 mb-1">${f}</span>`,
              )
              .join("")
          : '<span class="text-muted small">—</span>';

      return `
            <tr data-id="${v.id}">
              <td class="ps-3 fw-semibold">${name}</td>
              <td class="text-muted small">${email}</td>
              <td>${badge}</td>
              <td class="small">${missingHtml}</td>
              <td class="text-muted small">${updated}</td>
            </tr>
        `;
    })
    .join("");
}

// ─── Sort header wiring ────────────────────────────────────────────────────

/**
 * Update `aria-sort` attributes and sort-icon classes on all sortable headers.
 *
 * @returns {void}
 */
function syncSortIcons() {
  sortableHeads.forEach((th) => {
    const col = th.dataset.col;
    const icon = th.querySelector(".sort-icon");
    if (!icon) return;

    if (col === sortState.col) {
      th.setAttribute(
        "aria-sort",
        sortState.dir === "asc" ? "ascending" : "descending",
      );
      icon.className =
        sortState.dir === "asc"
          ? "fa-solid fa-sort-up ms-1 sort-icon text-primary"
          : "fa-solid fa-sort-down ms-1 sort-icon text-primary";
    } else {
      th.removeAttribute("aria-sort");
      icon.className = "fa-solid fa-sort ms-1 sort-icon text-muted";
    }
  });
}

sortableHeads.forEach((th) => {
  th.style.cursor = "pointer";
  th.addEventListener("click", () => {
    const col = th.dataset.col;
    if (sortState.col === col) {
      sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
    } else {
      sortState.col = col;
      sortState.dir = "asc";
    }
    syncSortIcons();
    renderTable();
  });
});

// ─── Filter wiring ────────────────────────────────────────────────────────

statusFilter.addEventListener("change", renderTable);
searchInput.addEventListener("input", renderTable);

// ─── Init ─────────────────────────────────────────────────────────────────

syncSortIcons();
renderTable();
