/**
 * @file decentlyImport.js
 * @description Client logic for the Decently Import tool.
 *
 * Phases:
 *  1. Upload    — user selects a CSV; client parses it.
 *  2. Review    — parsed rows sent to /process; results rendered into four tables.
 *                 Fuzzy rows expose per-row dropdowns for manual mapping.
 *  3. Apply     — confirmed mapping sent to /apply; matched IDs activated,
 *                 unmatched DB volunteers deactivated.
 *  4. Create    — unmatched CSV rows validated (email + phone) then auto-created
 *                 via /oversight/tools/create-volunteer. Invalid rows flagged inline.
 *  5. Send links — newly created volunteers offered email/SMS welcome links
 *                 that inform them of their temporary password (LastName1914).
 */

document.addEventListener("DOMContentLoaded", () => {
  // ── DOM refs ────────────────────────────────────────────────────────
  const csrfToken =
    document.querySelector('meta[name="csrf-token"]')?.content || "";

  const phaseUpload = document.getElementById("phase-upload");
  const phaseReview = document.getElementById("phase-review");

  const csvFileInput = document.getElementById("csvFileInput");
  const parseBtn = document.getElementById("parseBtn");
  const uploadStatus = document.getElementById("uploadStatus");
  const resetBtn = document.getElementById("resetBtn");
  const reviewStatus = document.getElementById("reviewStatus");

  const matchedSection = document.getElementById("matchedSection");
  const fuzzySection = document.getElementById("fuzzySection");
  const inactiveSection = document.getElementById("inactiveSection");
  const unmatchedCsvSection = document.getElementById("unmatchedCsvSection");

  const matchedCount = document.getElementById("matchedCount");
  const fuzzyCount = document.getElementById("fuzzyCount");
  const inactiveCount = document.getElementById("inactiveCount");
  const unmatchedCsvCount = document.getElementById("unmatchedCsvCount");

  const matchedTbody = document.querySelector("#matchedTable tbody");
  const fuzzyTbody = document.querySelector("#fuzzyTable tbody");
  const inactiveTbody = document.querySelector("#inactiveTable tbody");
  const unmatchedCsvTbody = document.querySelector("#unmatchedCsvTable tbody");

  const applyBtn = document.getElementById("applyBtn");
  const applyStatus = document.getElementById("applyStatus");

  // Phase 3 — create modal
  const createUnmatchedModal = new bootstrap.Modal(
    document.getElementById("createUnmatchedModal"),
  );
  const createUnmatchedList = document.getElementById("createUnmatchedList");
  const createAllBtn = document.getElementById("createAllBtn");
  const createAllStatus = document.getElementById("createAllStatus");
  const skipCreateBtn = document.getElementById("skipCreateBtn");

  // Phase 4 — send-welcome modal
  const sendWelcomeModal = new bootstrap.Modal(
    document.getElementById("sendWelcomeModal"),
  );
  const sendWelcomeList = document.getElementById("sendWelcomeList");

  // ── State ────────────────────────────────────────────────────────────
  /** @type {Array<{csvRow:object, dbMatch:object, confidence:string}>} */
  let stateMatched = [];
  /** @type {Array<{csvRow:object, candidates:object[]}>} */
  let stateFuzzy = [];
  /** @type {object[]} */
  let stateUnmatchedDb = [];
  /** @type {object[]} */
  let stateUnmatchedCsv = [];
  /** @type {object[]} rows pending creation in phase 3 */
  let stateToCreate = [];
  /** @type {Array<{id:number, firstName:string, lastName:string, email:string|null, phone:string|null}>} */
  let stateCreated = [];

  // ── Helpers ──────────────────────────────────────────────────────────

  /**
   * Render an alert into a container element.
   * @param {HTMLElement} el
   * @param {string} msg
   * @param {'danger'|'warning'|'success'|'info'} [type]
   */
  function showAlert(el, msg, type = "danger") {
    const icon =
      type === "success"
        ? "circle-check"
        : type === "info"
          ? "circle-info"
          : "triangle-exclamation";
    el.innerHTML = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                <i class="fa-solid fa-${icon} me-2"></i>${msg}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>`;
  }

  /**
   * Escape a value for safe HTML insertion.
   * @param {string|null|undefined} s
   * @returns {string}
   */
  function esc(s) {
    return (s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /**
   * Format a DB volunteer's display name (Last, First Suffix).
   * @param {{firstName?:string, lastName?:string, suffix?:string}} v
   * @returns {string}
   */
  function dbName(v) {
    return [v.lastName, v.firstName, v.suffix].filter(Boolean).join(", ");
  }

  /**
   * Strip all non-digit characters from a phone string.
   * @param {string|null|undefined} s
   * @returns {string}
   */
  function digitsOnly(s) {
    return (s || "").replace(/\D/g, "");
  }

  /**
   * Format raw digits into US (NXX) NXX-XXXX mask.
   * @param {string} raw
   * @returns {string}
   */
  function maskPhone(raw) {
    const d = digitsOnly(raw).slice(0, 10);
    if (d.length === 0) return "";
    if (d.length <= 3) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }

  // ── CSV Parser ────────────────────────────────────────────────────────

  /**
   * Parse a CSV string into an array of objects keyed by the header row.
   * Handles quoted fields containing commas or newlines.
   *
   * @param {string} text
   * @returns {Array<Record<string, string>>}
   */
  function parseCsv(text) {
    const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const rows = [];
    let inQ = false;
    const cells = [];
    let cell = "";

    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '"') {
        if (inQ && src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        cells.push(cell);
        cell = "";
      } else if (ch === "\n" && !inQ) {
        cells.push(cell);
        cell = "";
        rows.push([...cells]);
        cells.length = 0;
      } else {
        cell += ch;
      }
    }
    if (cell || cells.length) {
      cells.push(cell);
      rows.push([...cells]);
    }
    if (rows.length < 2) return [];

    const headers = rows[0].map((h) => h.trim());
    return rows
      .slice(1)
      .filter((r) => r.some((c) => c.trim()))
      .map((r) =>
        Object.fromEntries(headers.map((h, i) => [h, (r[i] || "").trim()])),
      );
  }

  // ── Phase 1: file selection ───────────────────────────────────────────

  csvFileInput.addEventListener("change", () => {
    parseBtn.disabled = !csvFileInput.files?.length;
    uploadStatus.innerHTML = "";
  });

  parseBtn.addEventListener("click", async () => {
    const file = csvFileInput.files?.[0];
    if (!file) return;

    uploadStatus.innerHTML = `<div class="text-muted small">
            <span class="spinner-border spinner-border-sm me-1"></span>Reading file…</div>`;
    parseBtn.disabled = true;

    const text = await file.text();
    const rows = parseCsv(text);

    if (rows.length === 0) {
      showAlert(
        uploadStatus,
        "Could not parse the CSV — check the file format.",
      );
      parseBtn.disabled = false;
      return;
    }

    const sample = rows[0];
    if (!("Name" in sample) || !("Email" in sample) || !("Phone" in sample)) {
      showAlert(
        uploadStatus,
        "CSV must contain <strong>Name</strong>, <strong>Email</strong>, and <strong>Phone</strong> columns.",
      );
      parseBtn.disabled = false;
      return;
    }

    const normalised = rows.map((r) => ({
      name: r["Name"] || "",
      email: r["Email"] || "",
      phone: r["Phone"] || "",
      congregation: r["Congregation"] || "",
      role: r["Role"] || "",
    }));

    uploadStatus.innerHTML = `<div class="text-muted small">
            <span class="spinner-border spinner-border-sm me-1"></span>
            Matching ${normalised.length} rows against database…</div>`;

    try {
      const resp = await fetch("/oversight/tools/decently-import/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ rows: normalised }),
      });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data.success) {
        showAlert(uploadStatus, data.error || "Server error during matching.");
        parseBtn.disabled = false;
        return;
      }

      stateMatched = data.matched || [];
      stateFuzzy = data.fuzzy || [];
      stateUnmatchedDb = data.unmatchedDb || [];
      stateUnmatchedCsv = data.unmatchedCsv || [];

      renderReview();
      phaseUpload.classList.add("d-none");
      phaseReview.classList.remove("d-none");
    } catch (err) {
      console.error("[decentlyImport] process error:", err);
      showAlert(uploadStatus, "Network error — please try again.");
      parseBtn.disabled = false;
    }
  });

  // ── Phase 2: render review tables ────────────────────────────────────

  /** Populate all four review tables from current state. */
  function renderReview() {
    // Exact matches
    matchedTbody.innerHTML = "";
    if (stateMatched.length > 0) {
      matchedSection.classList.remove("d-none");
      matchedCount.textContent = stateMatched.length;
      for (const { csvRow, dbMatch, confidence } of stateMatched) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
                    <td>${esc(csvRow.name)}</td>
                    <td class="text-muted small">${esc(csvRow.email)}</td>
                    <td class="text-muted small">${esc(csvRow.phone)}</td>
                    <td><strong>${esc(dbName(dbMatch))}</strong>
                        <div class="text-muted small">${esc(dbMatch.email || "")} · ${esc(dbMatch.phone || "")}</div>
                    </td>
                    <td><span class="badge ${
                      confidence === "email"
                        ? "bg-primary"
                        : confidence === "phone"
                          ? "bg-info text-dark"
                          : "bg-secondary"
                    }">${esc(confidence)}</span></td>`;
        matchedTbody.appendChild(tr);
      }
    } else {
      matchedSection.classList.add("d-none");
    }

    // Fuzzy matches
    fuzzyTbody.innerHTML = "";
    if (stateFuzzy.length > 0) {
      fuzzySection.classList.remove("d-none");
      fuzzyCount.textContent = stateFuzzy.length;
      stateFuzzy.forEach(({ csvRow, candidates }, idx) => {
        const tr = document.createElement("tr");
        const selId = `fuzzy-select-${idx}`;
        const opts = candidates
          .map(
            (c) =>
              `<option value="${c.id}">${esc(dbName(c))} — ${esc(c.email || "")} · ${esc(c.phone || "")}</option>`,
          )
          .join("");
        tr.innerHTML = `
                    <td>${esc(csvRow.name)}</td>
                    <td class="text-muted small">${esc(csvRow.email)}</td>
                    <td class="text-muted small">${esc(csvRow.phone)}</td>
                    <td>
                        <select class="form-select form-select-sm fuzzy-select" id="${selId}"
                            data-csv-idx="${idx}">
                            <option value="">— Skip (treat as unrecognised) —</option>
                            ${opts}
                        </select>
                    </td>`;
        fuzzyTbody.appendChild(tr);
      });
    } else {
      fuzzySection.classList.add("d-none");
    }

    // Will be marked inactive
    inactiveTbody.innerHTML = "";
    if (stateUnmatchedDb.length > 0) {
      inactiveSection.classList.remove("d-none");
      inactiveCount.textContent = stateUnmatchedDb.length;
      for (const v of stateUnmatchedDb) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
                    <td>${esc(dbName(v))}</td>
                    <td class="text-muted small">${esc(v.email || "—")}</td>
                    <td class="text-muted small">${esc(v.phone || "—")}</td>`;
        inactiveTbody.appendChild(tr);
      }
    } else {
      inactiveSection.classList.add("d-none");
    }

    // No DB match
    unmatchedCsvTbody.innerHTML = "";
    if (stateUnmatchedCsv.length > 0) {
      unmatchedCsvSection.classList.remove("d-none");
      unmatchedCsvCount.textContent = stateUnmatchedCsv.length;
      for (const row of stateUnmatchedCsv) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
                    <td>${esc(row.name)}</td>
                    <td class="text-muted small">${esc(row.email)}</td>
                    <td class="text-muted small">${esc(row.phone)}</td>`;
        unmatchedCsvTbody.appendChild(tr);
      }
    } else {
      unmatchedCsvSection.classList.add("d-none");
    }

    reviewStatus.innerHTML = `
            <div class="alert alert-info">
                <i class="fa-solid fa-circle-info me-2"></i>
                Review the sections below. Fuzzy matches require your confirmation.
                When ready, click <strong>Apply Import</strong>.
            </div>`;
  }

  // ── Reset ─────────────────────────────────────────────────────────────

  resetBtn.addEventListener("click", () => {
    phaseReview.classList.add("d-none");
    phaseUpload.classList.remove("d-none");
    csvFileInput.value = "";
    parseBtn.disabled = true;
    uploadStatus.innerHTML = "";
    applyStatus.innerHTML = "";
    reviewStatus.innerHTML = "";
    stateMatched = [];
    stateFuzzy = [];
    stateUnmatchedDb = [];
    stateUnmatchedCsv = [];
    stateToCreate = [];
    stateCreated = [];
  });

  // ── Phase 3: Apply ────────────────────────────────────────────────────

  applyBtn.addEventListener("click", async () => {
    applyStatus.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Applying…`;
    applyBtn.disabled = true;

    const matchedIds = stateMatched.map((m) => m.dbMatch.id);

    const fuzzySelects = document.querySelectorAll(".fuzzy-select");
    const fuzzyMappedIds = [];
    const fuzzySkipped = [];

    fuzzySelects.forEach((sel) => {
      const idx = parseInt(sel.dataset.csvIdx, 10);
      if (sel.value) {
        fuzzyMappedIds.push(Number(sel.value));
      } else {
        fuzzySkipped.push(stateFuzzy[idx]?.csvRow);
      }
    });

    const allMatchedIds = [...matchedIds, ...fuzzyMappedIds];
    const confirmedSet = new Set(allMatchedIds);
    const inactiveIds = stateUnmatchedDb
      .map((v) => v.id)
      .filter((id) => !confirmedSet.has(id));

    try {
      const resp = await fetch("/oversight/tools/decently-import/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ matchedIds: allMatchedIds, inactiveIds }),
      });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data.success) {
        showAlert(applyStatus, data.error || "Failed to apply import.");
        applyBtn.disabled = false;
        return;
      }

      applyStatus.innerHTML = `
                <span class="text-success fw-semibold">
                    <i class="fa-solid fa-circle-check me-1"></i>
                    ${data.activated} activated, ${data.deactivated} deactivated.
                </span>`;
      applyBtn.textContent = "Applied";

      // Collect all rows that need to be created
      stateToCreate = [...stateUnmatchedCsv, ...fuzzySkipped.filter(Boolean)];

      if (stateToCreate.length > 0) {
        renderCreateModal(stateToCreate);
        createUnmatchedModal.show();
      }
    } catch (err) {
      console.error("[decentlyImport] apply error:", err);
      showAlert(applyStatus, "Network error — please try again.");
      applyBtn.disabled = false;
    }
  });

  // ── Phase 4: Validate & Create ────────────────────────────────────────

  /**
   * Render the create modal list. Each row gets a status cell that
   * will be updated live during validation and creation.
   *
   * @param {object[]} rows
   */
  function renderCreateModal(rows) {
    createUnmatchedList.innerHTML = rows
      .map(
        (row, idx) => `
            <div class="card mb-2" id="create-row-${idx}">
                <div class="card-body py-2 px-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <div>
                        <strong>${esc(row.name)}</strong>
                        <div class="text-muted small">
                            ${row.email ? `<i class="fa-solid fa-envelope me-1"></i>${esc(row.email)}` : ""}
                            ${row.phone ? `<span class="ms-2"><i class="fa-solid fa-phone me-1"></i>${esc(row.phone)}</span>` : ""}
                        </div>
                    </div>
                    <div id="create-status-${idx}" class="small text-muted">Pending…</div>
                </div>
            </div>`,
      )
      .join("");
    createAllStatus.innerHTML = "";
  }

  /**
   * Validate a single email via Kickbox endpoint.
   * @param {string} email
   * @returns {Promise<{ok: boolean, message: string}>}
   */
  async function validateEmail(email) {
    if (!email) return { ok: false, message: "No email provided." };
    try {
      const resp = await fetch(
        `/validate-email?email=${encodeURIComponent(email.trim())}`,
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok)
        return { ok: false, message: data.error || "Email validation error." };
      if (String(data.result || "").toLowerCase() === "deliverable")
        return { ok: true, message: "Email valid." };
      return {
        ok: false,
        message: `Email invalid: ${data.reason || "not deliverable"}.`,
      };
    } catch {
      return { ok: false, message: "Email validation failed." };
    }
  }

  /**
   * Validate a single phone number via Twilio endpoint.
   * @param {string} phone
   * @returns {Promise<{ok: boolean, message: string, normalized?: string}>}
   */
  async function validatePhone(phone) {
    const digits = digitsOnly(phone);
    if (digits.length < 10) return { ok: false, message: "Phone too short." };
    try {
      const resp = await fetch(
        `/validate-phone?phone=${encodeURIComponent(digits)}`,
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok)
        return { ok: false, message: data.error || "Phone validation error." };
      if (data.valid)
        return {
          ok: true,
          message: "Phone valid.",
          normalized: maskPhone(digits),
        };
      return { ok: false, message: data.validation_errors || "Phone invalid." };
    } catch {
      return { ok: false, message: "Phone validation failed." };
    }
  }

  /**
   * Set the status cell for a create row.
   * @param {number} idx
   * @param {string} html
   * @param {'muted'|'danger'|'success'|'warning'} [color]
   */
  function setCreateRowStatus(idx, html, color = "muted") {
    const el = document.getElementById(`create-status-${idx}`);
    if (el) {
      el.innerHTML = html;
      el.className = `small text-${color}`;
    }
  }

  /**
   * Highlight the card border for a create row.
   * @param {number} idx
   * @param {'success'|'danger'|'warning'} color
   */
  function setCreateRowBorder(idx, color) {
    const el = document.getElementById(`create-row-${idx}`);
    if (el) el.className = `card mb-2 border-${color}`;
  }

  createAllBtn.addEventListener("click", async () => {
    createAllBtn.disabled = true;
    createAllBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Working…`;
    createAllStatus.innerHTML = "";
    stateCreated = [];

    let successCount = 0;
    let failCount = 0;

    for (let idx = 0; idx < stateToCreate.length; idx++) {
      const row = stateToCreate[idx];

      // Split name: last word = lastName, rest = firstName
      const nameParts = (row.name || "").trim().split(" ");
      const firstName =
        nameParts.length >= 2 ? nameParts.slice(0, -1).join(" ") : row.name;
      const lastName =
        nameParts.length >= 2 ? nameParts[nameParts.length - 1] : "";

      if (!firstName || !lastName) {
        setCreateRowStatus(idx, "Cannot split name — skipping.", "warning");
        setCreateRowBorder(idx, "warning");
        failCount++;
        continue;
      }

      // ── Validate email ──
      setCreateRowStatus(idx, "Validating email…");
      const emailResult = await validateEmail(row.email);
      if (!emailResult.ok) {
        setCreateRowStatus(
          idx,
          `<i class="fa-solid fa-triangle-exclamation me-1"></i>${esc(emailResult.message)}`,
          "danger",
        );
        setCreateRowBorder(idx, "danger");
        failCount++;
        continue;
      }

      // ── Validate phone ──
      setCreateRowStatus(idx, "Validating phone…");
      const phoneResult = await validatePhone(row.phone);
      if (!phoneResult.ok) {
        setCreateRowStatus(
          idx,
          `<i class="fa-solid fa-triangle-exclamation me-1"></i>${esc(phoneResult.message)}`,
          "danger",
        );
        setCreateRowBorder(idx, "danger");
        failCount++;
        continue;
      }

      // ── Create account ──
      setCreateRowStatus(idx, "Creating account…");
      try {
        const resp = await fetch("/oversight/tools/create-volunteer", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          body: JSON.stringify({
            firstName,
            lastName,
            suffix: "",
            email: row.email.trim().toLowerCase(),
            phone: phoneResult.normalized || maskPhone(row.phone),
            congAssigned: "unknown",
            congregation: "",
            force: "false",
          }),
        });
        const data = await resp.json().catch(() => ({}));

        if (data.duplicates && data.duplicates.length > 0) {
          // Duplicate found — flag but don't fail hard
          setCreateRowStatus(
            idx,
            `<i class="fa-solid fa-triangle-exclamation me-1"></i>Possible duplicate — skipped.`,
            "warning",
          );
          setCreateRowBorder(idx, "warning");
          failCount++;
          continue;
        }

        if (!data.success) {
          setCreateRowStatus(
            idx,
            `<i class="fa-solid fa-triangle-exclamation me-1"></i>${esc(data.error || "Creation failed.")}`,
            "danger",
          );
          setCreateRowBorder(idx, "danger");
          failCount++;
          continue;
        }

        setCreateRowStatus(
          idx,
          `<i class="fa-solid fa-circle-check me-1"></i>Created (ID ${data.newId})`,
          "success",
        );
        setCreateRowBorder(idx, "success");
        successCount++;
        stateCreated.push({
          id: data.newId,
          firstName,
          lastName,
          email: row.email || null,
          phone: row.phone || null,
        });
      } catch (err) {
        console.error("[decentlyImport] create error:", err);
        setCreateRowStatus(idx, "Network error.", "danger");
        setCreateRowBorder(idx, "danger");
        failCount++;
      }
    }

    // Summary
    const parts = [];
    if (successCount > 0)
      parts.push(`<span class="text-success">${successCount} created</span>`);
    if (failCount > 0)
      parts.push(
        `<span class="text-danger">${failCount} failed or skipped</span>`,
      );
    createAllStatus.innerHTML = `<div class="mt-3 small fw-semibold">${parts.join(" · ")}</div>`;
    createAllBtn.textContent = "Done";

    // Move to send-welcome phase after a short pause if any were created
    if (stateCreated.length > 0) {
      setTimeout(() => {
        createUnmatchedModal.hide();
        renderSendWelcomeModal(stateCreated);
        sendWelcomeModal.show();
      }, 1200);
    }
  });

  // Skip create — no send-welcome needed
  skipCreateBtn.addEventListener("click", () => {
    createUnmatchedModal.hide();
  });

  // ── Phase 5: Send Welcome Links ───────────────────────────────────────

  /**
   * Render the send-welcome modal with one row per newly created volunteer.
   * Each row has Email and/or SMS buttons depending on what contact info exists.
   *
   * @param {Array<{id:number, firstName:string, lastName:string, email:string|null, phone:string|null}>} created
   */
  function renderSendWelcomeModal(created) {
    sendWelcomeList.innerHTML = created
      .map(
        (v, idx) => `
            <div class="card mb-2" id="welcome-row-${idx}">
                <div class="card-body py-2 px-3">
                    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
                        <div>
                            <strong>${esc(v.firstName)} ${esc(v.lastName)}</strong>
                            <div class="text-muted small">
                                ${v.email ? `<i class="fa-solid fa-envelope me-1"></i>${esc(v.email)}` : ""}
                                ${v.phone ? `<span class="ms-2"><i class="fa-solid fa-phone me-1"></i>${esc(v.phone)}</span>` : ""}
                            </div>
                        </div>
                        <div class="d-flex gap-2 align-items-center flex-wrap">
                            ${
                              v.email
                                ? `
                                <button type="button" class="btn btn-sm btn-outline-primary send-welcome-btn"
                                    data-vol-idx="${idx}" data-method="email">
                                    <i class="fa-solid fa-envelope me-1"></i>Email
                                </button>`
                                : ""
                            }
                            ${
                              v.phone
                                ? `
                                <button type="button" class="btn btn-sm btn-outline-success send-welcome-btn"
                                    data-vol-idx="${idx}" data-method="phone">
                                    <i class="fa-solid fa-comment-sms me-1"></i>SMS
                                </button>`
                                : ""
                            }
                            <span id="welcome-status-${idx}" class="small text-muted"></span>
                        </div>
                    </div>
                </div>
            </div>`,
      )
      .join("");
  }

  // Delegated click handler for all send-welcome buttons
  document
    .getElementById("sendWelcomeList")
    .addEventListener("click", async (ev) => {
      const btn = ev.target.closest(".send-welcome-btn");
      if (!btn) return;

      const idx = parseInt(btn.dataset.volIdx, 10);
      const method = btn.dataset.method;
      const volunteer = stateCreated[idx];
      const statusEl = document.getElementById(`welcome-status-${idx}`);

      if (!volunteer) return;

      btn.disabled = true;
      if (statusEl) {
        statusEl.textContent = "Sending…";
        statusEl.className = "small text-muted";
      }

      try {
        const resp = await fetch(
          "/oversight/tools/decently-import/send-welcome",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrfToken,
            },
            body: JSON.stringify({ volunteerId: volunteer.id, method }),
          },
        );
        const data = await resp.json().catch(() => ({}));

        if (!resp.ok || !data.success) {
          if (statusEl) {
            statusEl.textContent = data.message || "Failed.";
            statusEl.className = "small text-danger";
          }
          btn.disabled = false;
          return;
        }

        if (statusEl) {
          statusEl.innerHTML = `<i class="fa-solid fa-circle-check me-1"></i>Sent`;
          statusEl.className = "small text-success";
        }
        // Leave button disabled — sent once is enough
      } catch (err) {
        console.error("[decentlyImport] send-welcome error:", err);
        if (statusEl) {
          statusEl.textContent = "Network error.";
          statusEl.className = "small text-danger";
        }
        btn.disabled = false;
      }
    });
});
