/**
 * @file contactDirectory.js
 * @description Client-side logic for the Contact Directory report
 * (/oversight/tools/contacts). Renders the volunteer list embedded by
 * the server, and provides search and column sorting. Print is a
 * plain window.print() of the currently filtered/sorted table — the
 * button itself is only rendered server-side for users with the
 * printUserData permission.
 */

/**
 * @typedef {Object} ContactRow
 * @property {number} id
 * @property {string} firstName
 * @property {string} lastName
 * @property {string|null} suffix
 * @property {string|null} email
 * @property {string|null} phone
 * @property {string} role
 */

const searchInput = document.getElementById("cdSearch");
const tableBody = document.getElementById("cdTableBody");
const emptyState = document.getElementById("cdEmpty");
const visibleCountEl = document.getElementById("cdVisibleCount");
const printBtn = document.getElementById("cdPrintBtn");
const sortableHeaders = document.querySelectorAll("#cdTable .cd-sortable");

/** @type {ContactRow[]} */
const allVolunteers = JSON.parse(
  document.getElementById("contact-directory-data").textContent || "[]",
);

/** @type {{ col: string, dir: 1 | -1 }} */
const sortState = { col: "name", dir: 1 };

/**
 * Format a raw phone string as (XXX) XXX-XXXX when it contains exactly
 * 10 US digits; otherwise return the original value unchanged.
 *
 * @param {string|null} raw
 * @returns {string}
 */
function formatPhone(raw) {
    if (!raw) return "";
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 10) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return raw;
}

/**
 * Build the display full name for a volunteer row.
 *
 * @param {ContactRow} v
 * @returns {string}
 */
function fullName(v) {
    const suffix = v.suffix ? ` ${v.suffix}` : "";
    return `${v.lastName}, ${v.firstName}${suffix}`;
}

/**
 * Human-readable label for a role string (e.g. "ASSISTANT_ADMIN" -> "Assistant Admin").
 *
 * @param {string} role
 * @returns {string}
 */
function roleLabel(role) {
    return (role || "")
        .toLowerCase()
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

/**
 * Apply the current search filter to the full volunteer list.
 *
 * @returns {ContactRow[]}
 */
function getFiltered() {
    const term = searchInput.value.trim().toLowerCase();
    if (!term) return allVolunteers.slice();
    return allVolunteers.filter((v) => {
        const haystack = `${fullName(v)} ${v.email || ""} ${v.phone || ""}`.toLowerCase();
        return haystack.includes(term);
    });
}

/**
 * Sort rows in place according to the current sortState.
 *
 * @param {ContactRow[]} rows
 * @returns {ContactRow[]}
 */
function applySort(rows) {
    const { col, dir } = sortState;
    rows.sort((a, b) => {
        let av;
        let bv;
        if (col === "name") {
            av = fullName(a);
            bv = fullName(b);
        } else if (col === "role") {
            av = roleLabel(a.role);
            bv = roleLabel(b.role);
        } else {
            av = a[col] || "";
            bv = b[col] || "";
        }
        return av.localeCompare(bv) * dir;
    });
    return rows;
}

/**
 * Render the table body from the given rows and update the visible
 * count / empty state.
 *
 * @param {ContactRow[]} rows
 */
function render(rows) {
    tableBody.innerHTML = "";

    if (rows.length === 0) {
        emptyState.classList.remove("d-none");
        visibleCountEl.textContent = "0 volunteers";
        return;
    }
    emptyState.classList.add("d-none");
    visibleCountEl.textContent = `${rows.length} volunteer${rows.length === 1 ? "" : "s"}`;

    const frag = document.createDocumentFragment();
    for (const v of rows) {
        const tr = document.createElement("tr");

        const nameTd = document.createElement("td");
        nameTd.className = "ps-3";
        nameTd.textContent = fullName(v);
        tr.appendChild(nameTd);

        const emailTd = document.createElement("td");
        if (v.email) {
            const a = document.createElement("a");
            a.href = `mailto:${v.email}`;
            a.textContent = v.email;
            emailTd.appendChild(a);
        } else {
            emailTd.textContent = "—";
            emailTd.className = "text-muted";
        }
        tr.appendChild(emailTd);

        const phoneTd = document.createElement("td");
        const formattedPhone = formatPhone(v.phone);
        if (formattedPhone) {
            const a = document.createElement("a");
            a.href = `tel:${(v.phone || "").replace(/\D/g, "")}`;
            a.textContent = formattedPhone;
            phoneTd.appendChild(a);
        } else {
            phoneTd.textContent = "—";
            phoneTd.className = "text-muted";
        }
        tr.appendChild(phoneTd);

        const roleTd = document.createElement("td");
        roleTd.textContent = roleLabel(v.role);
        tr.appendChild(roleTd);

        frag.appendChild(tr);
    }
    tableBody.appendChild(frag);
}

/** Re-filter, re-sort, and re-render from current state. */
function refresh() {
    render(applySort(getFiltered()));
}

sortableHeaders.forEach((th) => {
    th.addEventListener("click", () => {
        const col = th.dataset.col;
        if (sortState.col === col) {
            sortState.dir *= -1;
        } else {
            sortState.col = col;
            sortState.dir = 1;
        }
        sortableHeaders.forEach((h) => h.removeAttribute("aria-sort"));
        th.setAttribute("aria-sort", sortState.dir === 1 ? "ascending" : "descending");
        refresh();
    });
});

searchInput.addEventListener("input", refresh);

if (printBtn) {
    printBtn.addEventListener("click", () => window.print());
}

refresh();
