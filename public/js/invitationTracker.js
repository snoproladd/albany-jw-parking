/**
 * @file invitationTracker.js
 * @description Client-side logic for the Invitation Tracker page.
 *
 * Responsibilities:
 *  - Render the invitation rows. The server embeds every invitation as JSON
 *    (#it-rows-data, built by lib/trackerPayload.js); this file renders them
 *    into the table in chunks of PAGE_SIZE with a "Show more" control, so the
 *    page holds 100 table rows instead of over a thousand.
 *  - Live filtering (campaign, day, response, revoked, gender, name search)
 *    entirely client-side against that data, not against the DOM.
 *  - Event dot color application (CSP-safe via data-color → JS).
 *  - Revoke / reinstate AJAX actions (one delegated click listener); the
 *    table is re-rendered from the updated data.
 *  - Row count update after filtering or actions.
 *  - Add-volunteers shortcut link — updates href dynamically to match
 *    the currently selected campaign filter.
 */

/**
 * Initialise the Invitation Tracker page.
 *
 * Runs as soon as the script is reached rather than on DOMContentLoaded. This
 * script is the last element in <body>, so everything it needs already exists,
 * and the table rows must be in the DOM before the first paint:
 * DOMContentLoaded also waits for the deferred tour module and its imports,
 * which would leave the table empty (and the page jumping) for that long.
 *
 * @returns {void}
 */
(function initInvitationTracker() {
  // =========================================================
  // Element references
  // =========================================================

  /** @type {HTMLInputElement|null} */
  const searchInput = document.getElementById("itSearch");
  /** @type {HTMLSelectElement|null} */
  const batchFilter = document.getElementById("itBatchFilter");
  /** @type {HTMLSelectElement|null} */
  const dayFilter = document.getElementById("itDayFilter");
  /** @type {HTMLSelectElement|null} */
  const responseFilter = document.getElementById("itResponseFilter");
  /** @type {HTMLInputElement|null} */
  const revokedChk = document.getElementById("itIncludeRevoked");
  /** @type {HTMLInputElement|null} */
  const responseRequiredChk = document.getElementById("itResponseRequiredOnly");
  /** @type {HTMLSelectElement|null} */
  const genderFilter = document.getElementById("itGenderFilter");
  /** @type {HTMLButtonElement|null} */
  const resetBtn = document.getElementById("itResetFilters");
  /** @type {HTMLElement|null} */
  const rowCount = document.getElementById("itRowCount");
  /** @type {HTMLInputElement|null} */
  const csrfTokenEl = document.getElementById("itCsrfToken");
  /** @type {HTMLElement|null} */
  const addVolunteersWrap = document.getElementById("itAddVolunteersWrap");
  /** @type {HTMLAnchorElement|null} */
  const addVolunteersBtn = document.getElementById("itAddVolunteersBtn");
  /** @type {HTMLButtonElement|null} */
  const editCampaignBtn = document.getElementById("itEditCampaignBtn");
  /** @type {HTMLTableSectionElement|null} */
  const tableBody = document.getElementById("itTableBody");
  /** @type {HTMLElement|null} */
  const showMoreWrap = document.getElementById("itShowMoreWrap");
  /** @type {HTMLButtonElement|null} */
  const showMoreBtn = document.getElementById("itShowMoreBtn");
  /** @type {HTMLButtonElement|null} */
  const showAllBtn = document.getElementById("itShowAllBtn");

  // =========================================================
  // Helpers
  // =========================================================

  /** @returns {string} */
  function getCsrf() {
    return csrfTokenEl?.value || "";
  }

  // =========================================================
  // Invitation data and table rendering
  // =========================================================

  /**
   * Rows rendered at a time. Every invitation is held as data, but only this
   * many are put in the DOM until the user asks for more. The view sets it
   * (data-page-size on the tbody) because it also prints that many placeholder
   * rows; 100 is the fallback.
   * @type {number}
   */
  const PAGE_SIZE = Number(tableBody?.dataset.pageSize) || 100;

  /**
   * An invitation as embedded by the server (see lib/trackerPayload.js), plus
   * the lower-cased `search` key added by loadRows.
   * @typedef {import("../../lib/trackerPayload.js").TrackerRow & { search: string }} InvitationRow
   */

  /** True when #it-rows-data was missing or could not be parsed. */
  let loadFailed = false;

  /**
   * Read the invitation rows the server embedded in #it-rows-data. Adds a
   * lower-cased `search` key to each row once, so typing in the name box does
   * not lower-case every name on every keystroke.
   *
   * @returns {InvitationRow[]} The rows, or [] if the data is missing or invalid.
   */
  function loadRows() {
      try {
          const el = document.getElementById("it-rows-data");
          const rows = el ? JSON.parse(el.textContent) : [];
          if (!Array.isArray(rows)) throw new Error("rows is not an array");
          rows.forEach((row) => {
              row.search = row.name.toLowerCase();
          });
          return rows;
      } catch (err) {
          loadFailed = true;
          console.error("[invitationTracker] could not read invitation data:", err);
          return [];
      }
  }

  /** @type {InvitationRow[]} Every invitation, in table order. */
  const trackerRows = loadRows();

  /** @type {InvitationRow[]} The rows that pass the current filters. */
  let matchedRows = [];

  /** How many of matchedRows are currently in the table. */
  let renderedCount = 0;

  /**
   * The row's response bucket as the filters and stat cards see it: its
   * answer, or "revoked" / "pending" when it has none.
   *
   * @param {InvitationRow} row
   * @returns {string}
   */
  function responseOf(row) {
      return row.response || (row.revoked ? "revoked" : "pending");
  }

  /** @type {Record<string, string>} */
  const HTML_ESCAPES = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
  };

  /**
   * Escape a value for use in HTML text or a double-quoted attribute.
   *
   * @param {*} value
   * @returns {string}
   */
  function esc(value) {
      return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
  }

  /**
   * Email / SMS channel icons.
   *
   * @param {string|null} channel - "email", "sms", "both" or null.
   * @returns {string}
   */
  function channelIconsHtml(channel) {
      const email = channel === "email" || channel === "both";
      const sms = channel === "sms" || channel === "both";
      return (
          (email ? '<i class="fa-solid fa-envelope text-info me-1" title="Email"></i>' : "") +
          (sms ? '<i class="fa-solid fa-comment-sms text-success" title="SMS"></i>' : "")
      );
  }

  /**
   * Campaign cell: name, follow-up arrow and Alert / Follow-up badge.
   *
   * @param {InvitationRow} row
   * @returns {string}
   */
  function campaignCellHtml(row) {
      if (!row.batchName) return '<span class="text-muted">—</span>';
      const parts = [];
      if (row.isFollowUp) {
          parts.push('<span class="text-muted small me-1" title="follow-up campaign">↳</span>');
      }
      parts.push(`<span class="small">${esc(row.batchName)}</span>`);
      if (row.messageType === "alert") {
          parts.push('<span class="badge bg-warning text-dark ms-1 it-type-badge">Alert</span>');
      } else if (row.messageType === "followup") {
          parts.push('<span class="badge bg-info text-white ms-1 it-type-badge">Follow-up</span>');
      }
      return parts.join(" ");
  }

  /**
   * Event / shift cell. The dot colour is applied afterwards by
   * applyEventDotColors (CSP: no inline style attributes).
   *
   * @param {InvitationRow} row
   * @returns {string}
   */
  function eventCellHtml(row) {
      if (!row.dayLabel) return '<span class="text-muted">—</span>';
      const dot = row.eventColor
          ? `<span class="it-event-dot" data-color="${esc(row.eventColor)}"></span>`
          : "";
      const shift = row.shiftLabel
          ? `<span class="text-muted"> · ${esc(row.eventTypeName)} (${esc(row.shiftLabel)})</span>`
          : "";
      return `<span class="it-event-label">${dot}${esc(row.dayLabel)}${shift}</span>`;
  }

  /**
   * Reminded cell: last reminder date, channel icons and a ×N badge.
   *
   * @param {InvitationRow} row
   * @returns {string}
   */
  function remindedCellHtml(row) {
      if (!row.remindedAt) return '<span class="text-muted">—</span>';
      const parts = [
          esc(row.remindedAt),
          `<span class="ms-1">${channelIconsHtml(row.lastRemindedChannel)}</span>`,
      ];
      if (row.reminderCount > 1) {
          parts.push(
              `<span class="badge bg-secondary ms-1" title="${row.reminderCount} reminders sent">×${row.reminderCount}</span>`,
          );
      }
      return parts.join(" ");
  }

  /**
   * Response cell: Revoked / Pending / Yes / No / Maybe / other badge.
   *
   * @param {InvitationRow} row
   * @returns {string}
   */
  function responseCellHtml(row) {
      if (row.revoked) {
          return '<span class="badge it-badge-revoked"><i class="fa-solid fa-ban me-1"></i>Revoked</span>';
      }
      if (!row.respondedAt) {
          return row.responseNeeded
              ? '<span class="badge it-badge-pending">Pending</span>'
              : '<span class="text-muted small">—</span>';
      }
      if (row.response === "yes") {
          return '<span class="badge it-badge-yes"><i class="fa-solid fa-circle-check me-1"></i>Yes</span>';
      }
      if (row.response === "no") {
          return '<span class="badge it-badge-no"><i class="fa-solid fa-circle-xmark me-1"></i>No</span>';
      }
      if (row.response === "maybe") {
          return '<span class="badge it-badge-maybe"><i class="fa-solid fa-circle-question me-1"></i>Maybe</span>';
      }
      if (row.response === "other" && row.responseOther) {
          const text =
              row.responseOther.length > 20
                  ? `${row.responseOther.slice(0, 20)}…`
                  : row.responseOther;
          return `<span class="badge bg-secondary" title="${esc(row.responseOther)}"><i class="fa-solid fa-pen me-1"></i>${esc(text)}</span>`;
      }
      if (row.response) {
          return `<span class="badge bg-info text-dark">${esc(row.response)}</span>`;
      }
      return "";
  }

  /**
   * Actions cell: a Reinstate button for revoked rows, otherwise Revoke.
   *
   * @param {InvitationRow} row
   * @returns {string}
   */
  function actionsCellHtml(row) {
      const name = esc(row.name);
      return row.revoked
          ? `<button type="button" class="btn btn-outline-success btn-sm it-reinstate-btn" data-id="${row.id}" data-name="${name}" title="Reinstate invitation" aria-label="Reinstate invitation for ${name}"><i class="fa-solid fa-rotate-left"></i></button>`
          : `<button type="button" class="btn btn-outline-danger btn-sm it-revoke-btn" data-id="${row.id}" data-name="${name}" title="Revoke invitation" aria-label="Revoke invitation for ${name}"><i class="fa-solid fa-ban"></i></button>`;
  }

  /**
   * The markup for one table row.
   *
   * @param {InvitationRow} row
   * @returns {string}
   */
  function buildRowHtml(row) {
      return (
          `<tr class="it-row${row.revoked ? " it-row--revoked" : ""}" data-id="${row.id}">` +
          `<td class="it-col-name fw-semibold">${esc(row.name)}</td>` +
          `<td class="it-col-campaign">${campaignCellHtml(row)}</td>` +
          `<td class="it-col-event">${eventCellHtml(row)}</td>` +
          `<td class="it-col-channel text-center">${channelIconsHtml(row.channel)}</td>` +
          `<td class="it-col-sent text-muted small">${esc(row.sentAt)}</td>` +
          `<td class="it-col-reminded text-muted small">${remindedCellHtml(row)}</td>` +
          `<td class="it-col-response">${responseCellHtml(row)}</td>` +
          `<td class="it-col-responded text-muted small">${esc(row.respondedAt || "—")}</td>` +
          `<td class="it-col-actions text-end">${actionsCellHtml(row)}</td>` +
          "</tr>"
      );
  }

  /**
   * Update the "Showing N invitations" line and the Show more buttons from
   * matchedRows and renderedCount.
   *
   * @returns {void}
   */
  function updateRowCount() {
      const total = matchedRows.length;
      const remaining = total - renderedCount;
      const noun = `invitation${total !== 1 ? "s" : ""}`;

      if (rowCount) {
          if (loadFailed) {
              rowCount.textContent = "Could not load the invitations — please reload the page.";
          } else if (remaining > 0) {
              rowCount.textContent = `Showing ${renderedCount} of ${total} ${noun}`;
          } else {
              rowCount.textContent = `Showing ${total} ${noun}`;
          }
      }

      showMoreWrap?.classList.toggle("d-none", remaining <= 0);
      if (remaining > 0) {
          if (showMoreBtn) {
              showMoreBtn.textContent = `Show ${Math.min(PAGE_SIZE, remaining)} more`;
          }
          if (showAllBtn) showAllBtn.textContent = `Show all ${total}`;
      }
  }

  /**
   * Replace the table body with the first `count` rows of matchedRows.
   *
   * @param {number} count - How many rows to render.
   * @returns {void}
   */
  function renderRows(count) {
      if (tableBody) {
          const chunk = matchedRows.slice(0, count);
          tableBody.innerHTML = chunk.map(buildRowHtml).join("");
          renderedCount = chunk.length;
          applyEventDotColors();
      }
      updateRowCount();
  }

  /**
   * Add the next `count` rows of matchedRows to the end of the table.
   *
   * @param {number} count - How many more rows to render.
   * @returns {void}
   */
  function appendRows(count) {
      if (!tableBody) return;
      const firstNew = renderedCount;
      const chunk = matchedRows.slice(renderedCount, renderedCount + count);
      tableBody.insertAdjacentHTML("beforeend", chunk.map(buildRowHtml).join(""));
      renderedCount += chunk.length;
      applyEventDotColors(firstNew);
      updateRowCount();
  }

  showMoreBtn?.addEventListener("click", () => appendRows(PAGE_SIZE));
  showAllBtn?.addEventListener("click", () => {
      appendRows(matchedRows.length - renderedCount);
  });

  // =========================================================
  // Batch metadata maps — built once from filter option data attributes
  // =========================================================

  /**
   * Maps batch ID string → whether response is needed (boolean).
   * Used by applyFilters to exclude info-only campaigns from the
   * pending count shown on the Remind button.
   * @type {Map<string, boolean>}
   */
  const batchResponseNeededMap = new Map(
    Array.from(batchFilter?.querySelectorAll("option[value]") || [])
      .filter((opt) => opt.value)
      .map((opt) => [opt.value, opt.dataset.responseNeeded !== "0"]),
  );

  // =========================================================
  // Batch group expansion
  // =========================================================

  /**
   * Resolve a selected batch option value to its family root id.
   *
   * If the selected option is a child batch (has data-parent-id set),
   * returns the parent id so filtering uses family_root_id correctly.
   * Also returns the count of child batches belonging to the resolved root
   * for the batch group note.
   *
   * @param {string} batchVal - The selected batch option value, or "" for all.
   * @returns {{ rootId: string, childCount: number }}
   */
  function resolveFamilyRoot(batchVal) {
    if (!batchVal) return { rootId: '', childCount: 0 };

    const selectedOpt = batchFilter?.querySelector(`option[value="${batchVal}"]`);
    const rootId = selectedOpt?.dataset.parentId || batchVal;

    const childCount = Array.from(
      batchFilter?.querySelectorAll(`option[data-parent-id="${rootId}"]`) || [],
    ).length;

    return { rootId, childCount };
  }

  // =========================================================
  // Event dot colors (CSP-safe)
  // =========================================================

  /**
   * Apply data-color attribute values as inline background-color to the
   * event dots in the rendered rows.
   * @param {number} [startIndex=0] - Only colour rows from this index on
   *   (used after appending a chunk, so earlier rows are not revisited).
   * @returns {void}
   */
  function applyEventDotColors(startIndex = 0) {
      if (!tableBody) return;
      Array.from(tableBody.rows)
          .slice(startIndex)
          .forEach((row) => {
              row.querySelectorAll(".it-event-dot[data-color]").forEach((dot) => {
                  dot.style.backgroundColor = dot.dataset.color;
              });
          });
  }

  // =========================================================
  // Live filtering
  // =========================================================

  /**
   * Apply all active filters to the invitation data, then render the first
   * page of matching rows and recompute the summary stat cards and remind
   * button from the matching rows.
   * @param {{ keepRendered?: boolean }} [options] - keepRendered: re-render at
   *   least as many rows as are showing now (used after revoke / reinstate)
   *   instead of going back to the first page. Also tolerates being passed an
   *   Event when used directly as a listener.
   * @returns {void}
   */
  function applyFilters(options) {
    const query      = (searchInput?.value || "").trim().toLowerCase();
    const batchVal   = batchFilter?.value   || "";
    const dayVal     = dayFilter?.value     || "";
    const responseVal = responseFilter?.value || "all";
    const genderVal  = genderFilter?.value  || "";
    const showRevoked          = revokedChk?.checked ?? true;
    const responseRequiredOnly = responseRequiredChk?.checked ?? false;

    const { rootId: familyRootVal, childCount: batchChildCount } =
      resolveFamilyRoot(batchVal);

    const rows = trackerRows;
    /** Rows that pass every filter, in table order. */
    const matched = [];

    // Sets of volunteer IDs per response bucket — deduplicates volunteers
    // who have multiple historical rows from pre-reminder sends.
    const seenTotal = new Set();
    const seenYes = new Set();
    const seenNo = new Set();
    const seenMaybe = new Set();
    const seenPending = new Set();
    const seenRevoked = new Set();

    /**
     * Accumulates each volunteer's response states across all their visible
     * rows before resolving to stat card buckets. Prevents a volunteer who
     * responded to the parent campaign from also counting as pending because
     * they appear in a follow-up campaign row.
     * @type {Map<number, {yes:boolean, no:boolean, maybe:boolean, pending:boolean, revoked:boolean}>}
     */
    const volResponseAccum = new Map();

    rows.forEach((row) => {
      const response = responseOf(row);
      const revoked = row.revoked;
      const volId = row.volunteerId;

      // Revoked visibility
      if (revoked && !showRevoked) return;

      // Campaign filter — match on family_root_id so follow-up rows are
      // included when viewing the parent, and child selection resolves to parent.
      if (familyRootVal && row.familyRootId !== familyRootVal) return;

      // Day filter
      if (dayVal && row.dayId !== dayVal) return;

      // Response filter
      if (responseVal !== "all" && response !== responseVal) return;

      // Response required filter
      if (responseRequiredOnly && !row.responseNeeded) return;

      // Gender filter
      if (genderVal && row.gender !== genderVal) return;

      // Name search
      if (query && !row.search.includes(query)) return;

      matched.push(row);

      // Accumulate this row's response state for later per-volunteer resolution
      if (!volResponseAccum.has(volId)) {
        volResponseAccum.set(volId, {
          yes: false,
          no: false,
          maybe: false,
          pending: false,
          revoked: false,
        });
      }
      const accum = volResponseAccum.get(volId);
      if (revoked) accum.revoked = true;
      else if (response === "yes") accum.yes = true;
      else if (response === "no") accum.no = true;
      else if (response === "maybe") accum.maybe = true;
      else accum.pending = true;
    });

    // Resolve per-volunteer accumulated responses to stat card buckets.
    // A volunteer with any definitive response (yes/no/maybe) in any
    // visible row is NOT counted as pending — even if they also have a
    // pending row from a follow-up campaign they were re-invited to.
    for (const [vid, accum] of volResponseAccum) {
      const hasResponded = accum.yes || accum.no || accum.maybe;
      seenTotal.add(vid);
      if (accum.yes) seenYes.add(vid);
      if (accum.no) seenNo.add(vid);
      if (accum.maybe) seenMaybe.add(vid);
      if (!hasResponded && accum.pending) seenPending.add(vid);
      if (!hasResponded && accum.revoked) seenRevoked.add(vid);
    }

    const cntTotal = seenTotal.size;
    const cntYes = seenYes.size;
    const cntNo = seenNo.size;
    const cntMaybe = seenMaybe.size;
    const cntPending = seenPending.size;
    const cntRevoked = seenRevoked.size;

    /**
     * Returns true if a volunteer has responded (yes/no/maybe) in any
     * visible row — used to exclude them from the Remind count even if
     * their row in the parent batch is still marked pending.
     * @param {string} volId
     * @returns {boolean}
     */
    const hasRespondedAnywhere = (volId) => {
      const accum = volResponseAccum.get(volId);
      return !!accum && (accum.yes || accum.no || accum.maybe);
    };

    // Pending count for the Remind button — mirrors the Pending stat card.
    // Since the DB now returns one row per volunteer per family, each visible
    // pending row IS the canonical pending state — no cross-row dedup needed.
    const cntPendingParentOnly = new Set(
      matched
        .filter(
          (r) =>
            responseOf(r) === 'pending' &&
            r.volStatus === 'completed' &&
            batchResponseNeededMap.get(r.batchId) !== false,
        )
        .map((r) => r.volunteerId),
    ).size;

    // Render the first page of matches (or as many as were showing, after a
    // revoke / reinstate) and refresh the "Showing N" line.
    matchedRows = matched;
    renderRows(
      options?.keepRendered === true
        ? Math.max(PAGE_SIZE, renderedCount)
        : PAGE_SIZE,
    );

    // Update stat cards
    const statTotal = document.getElementById("itStatTotal");
    const statYes = document.getElementById("itStatYes");
    const statNo = document.getElementById("itStatNo");
    const statMaybe = document.getElementById("itStatMaybe");
    const statPending = document.getElementById("itStatPending");
    const statRevoked = document.getElementById("itStatRevoked");
    if (statTotal) statTotal.textContent = String(cntTotal);
    if (statYes) statYes.textContent = String(cntYes);
    if (statNo) statNo.textContent = String(cntNo);
    if (statMaybe) statMaybe.textContent = String(cntMaybe);
    if (statPending) statPending.textContent = String(cntPending);
    if (statRevoked) statRevoked.textContent = String(cntRevoked);

    // Update batch group note
    const groupNote = document.getElementById("itBatchGroupNote");
    if (groupNote) {
      if (familyRootVal && batchChildCount > 0) {
        groupNote.textContent = `Includes ${batchChildCount} follow-up campaign${batchChildCount !== 1 ? 's' : ''}`;
        groupNote.classList.remove('d-none');
      } else {
        groupNote.textContent = '';
        groupNote.classList.add('d-none');
      }
    }

    updateAddVolunteersLink();
    updateRemindButton(cntPendingParentOnly);
  }

  // Wire all filter controls
  [batchFilter, dayFilter, responseFilter, genderFilter].forEach((el) => {
    el?.addEventListener("change", applyFilters);
  });
  revokedChk?.addEventListener("change", applyFilters);
  responseRequiredChk?.addEventListener("change", applyFilters);
  searchInput?.addEventListener("input", applyFilters);

  // =========================================================
  // Reset filters
  // =========================================================

  /**
   * Reset all filters to their default state and re-apply.
   * @returns {void}
   */
  resetBtn?.addEventListener("click", () => {
    if (batchFilter)    batchFilter.value    = "";
    if (dayFilter)      dayFilter.value      = "";
    if (responseFilter) responseFilter.value = "all";
    if (genderFilter)   genderFilter.value   = "";
    if (revokedChk)          revokedChk.checked = true;
    if (responseRequiredChk) responseRequiredChk.checked = false;
    if (searchInput)         searchInput.value = "";
    applyFilters();
  });

  // =========================================================
  // Add volunteers link — updates dynamically with batch filter
  // =========================================================

  /**
   * Show / hide and update the "Add volunteers" shortcut based on
   * the currently selected campaign filter.
   * @returns {void}
   */
  function updateAddVolunteersLink() {
    const batchVal = batchFilter?.value || "";
    const { rootId: familyRootVal } = resolveFamilyRoot(batchVal);
    if (!addVolunteersWrap || !addVolunteersBtn) return;

    if (familyRootVal) {
      addVolunteersBtn.href = `/oversight/tools/campaigns?batchId=${familyRootVal}`;
      addVolunteersWrap.classList.remove('d-none');
    } else {
      addVolunteersWrap.classList.add('d-none');
    }
  }

  // =========================================================
  // Remind button — updates dynamically with batch filter
  // =========================================================

  /** @type {HTMLElement|null} */
  const remindWrap = document.getElementById("itRemindWrap");

  /**
   * Update the Remind button and the Pending stat card based on the current
   * filter state and the live filtered pending count.
   *
   * - If no batch is selected: disabled button that triggers the no-batch toast.
   * - If selected batch has response_needed=0: remind button hidden entirely;
   *   pending card loses its drill-down link.
   * - Otherwise: active link pre-filtered to pending invitations for that batch.
   *
   * @param {number} [livePendingCount] - Pending count from the current visible rows.
   * @returns {void}
   */
  function updateRemindButton(livePendingCount) {
    const batchVal = batchFilter?.value || "";
    const { rootId: familyRootVal } = resolveFamilyRoot(batchVal);
    const pendingCount =
      livePendingCount ?? Number(remindWrap?.dataset.pendingCount ?? 0);

    // Determine response_needed for selected batch
    const selectedOpt = familyRootVal
      ? batchFilter?.querySelector(`option[value="${familyRootVal}"]`)
      : null;
    const responseNeeded =
      !selectedOpt || selectedOpt.dataset.responseNeeded !== '0';

    // ── Pending stat card ───────────────────────────────────────────────
    // No click behaviour — setting the response filter to "pending" hides
    // all responded rows, which breaks the volResponseAccum dedup logic
    // and causes the Remind button count to inflate back to the raw total.
    const pendingLabel = document.getElementById("itStatPendingLabel");
    if (pendingLabel) pendingLabel.textContent = "Pending";

    // ── Remind button ───────────────────────────────────────────────────
    if (!remindWrap) return;

    if (!familyRootVal) {
      remindWrap.innerHTML = '';
      return;
    }

    if (!responseNeeded) {
      remindWrap.innerHTML = '';
      return;
    }

    remindWrap.innerHTML = `
      <a href="/oversight/tools/campaigns?batchId=${familyRootVal}&selectPending=1"
         class="btn btn-warning btn-sm">
        <i class="fa-solid fa-bell me-1"></i>Remind ${pendingCount} pending
      </a>`;
  }

  // =========================================================
  // Revoke / Reinstate
  // =========================================================

  /**
   * Base path of the revoke / reinstate endpoints. (These pointed at
   * /oversight/tools/messaging/... until now, which no longer exists since
   * the 2.12.0 rename to /campaigns, so both actions returned 404.)
   * @type {string}
   */
  const INVITATION_API = "/oversight/tools/campaigns/invitations";

  /**
   * Confirm, then revoke or reinstate the invitation behind a row button.
   * On success the row's data is updated and the table re-rendered through
   * applyFilters, so the row obeys the "Show revoked" toggle and the stat
   * cards and Remind count follow.
   *
   * @param {HTMLButtonElement} btn - A .it-revoke-btn or .it-reinstate-btn.
   * @returns {Promise<void>}
   */
  async function handleRowAction(btn) {
      const id = Number(btn.dataset.id);
      const name = btn.dataset.name || "this volunteer";
      const isRevoke = btn.classList.contains("it-revoke-btn");
      const action = isRevoke ? "revoke" : "reinstate";
      const label = isRevoke ? "Revoke" : "Reinstate";

      if (!confirm(`${label} invitation for ${name}?`)) return;

      const origHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;

      try {
          const res = await fetch(`${INVITATION_API}/${id}/${action}`, {
              method: "POST",
              headers: {
                  "Content-Type": "application/json",
                  "X-CSRF-Token": getCsrf(),
              },
              body: JSON.stringify({}),
          });
          const data = await res.json().catch(() => ({}));

          if (!res.ok || !data.success) {
              btn.disabled = false;
              btn.innerHTML = origHtml;
              alert(data.error || `${label} failed — please try again.`);
              return;
          }

          const row = trackerRows.find((r) => r.id === id);
          if (row) row.revoked = isRevoke;
          applyFilters({ keepRendered: true });
      } catch (err) {
          console.error(`[invitationTracker] ${action} error:`, err);
          btn.disabled = false;
          btn.innerHTML = origHtml;
          alert("Network error — please try again.");
      }
  }

  // One listener for every row button, including rows rendered later.
  tableBody?.addEventListener("click", (event) => {
      const btn =
          event.target instanceof Element
              ? event.target.closest(".it-revoke-btn, .it-reinstate-btn")
              : null;
      if (btn && !btn.disabled) handleRowAction(btn);
  });

  // Remind button initial state — wire toast if no batch active on load
  updateRemindButton(Number(remindWrap?.dataset.pendingCount ?? 0));

  // =========================================================
  // Edit Campaign
  // =========================================================

  /**
   * Load the full batches array embedded in the page by the server.
   * Returns an empty array if the element is absent (non-admin view).
   * @returns {Array<object>}
   */
  function getBatchesData() {
    try {
      const el = document.getElementById("it-batches-data");
      return el ? JSON.parse(el.textContent) : [];
    } catch {
      return [];
    }
  }

  /** @type {number|null} Currently open batch id in the edit modal. */
  let editingBatchId = null;

  /**
   * Show or hide the edit button based on whether a campaign is selected.
   * Removes the self-option from the parent picker to prevent cycles.
   * @returns {void}
   */
  function updateEditCampaignBtn() {
    if (!editCampaignBtn) return;
    const batchVal = batchFilter?.value || "";
    editCampaignBtn.classList.toggle('d-none', !batchFilter?.value);
  }

  /**
   * Open the edit modal pre-populated with the selected campaign's data.
   * @returns {void}
   */
  function openEditModal() {
    const batchVal = batchFilter?.value || "";
    if (!batchVal) return;

    const id = Number(batchVal);
    const batches = getBatchesData();
    const batch = batches.find((b) => b.id === id);
    if (!batch) return;

    editingBatchId = id;

    // Populate fields
    const nameEl = document.getElementById("itEditName");
    const subjectEl = document.getElementById("itEditSubject");
    const bodyEl = document.getElementById("itEditBody");
    const parentEl = document.getElementById("itEditParent");
    const parentHint = document.getElementById("itEditParentHint");
    const respEl = document.getElementById("itEditResponseNeeded");
    const activeEl = document.getElementById("itEditActive");
    const errorEl = document.getElementById("itEditError");

    if (nameEl) nameEl.value = batch.name || "";
    if (subjectEl) subjectEl.value = batch.message_subject || "";
    if (bodyEl) bodyEl.value = batch.message_body || "";
    if (respEl) respEl.checked = batch.response_needed !== false;
    if (activeEl) activeEl.checked = batch.active !== false;
    const msgTypeEl = document.getElementById("itEditMessageType");
    if (msgTypeEl) msgTypeEl.value = batch.message_type || "invitation";
    if (errorEl) errorEl.classList.add("d-none");

    // Rebuild parent picker — exclude self and any of its own children
    // (to avoid cycles: child of a child cannot become the parent)
    if (parentEl) {
      const childIds = new Set(
        batches.filter((b) => b.parent_batch_id === id).map((b) => b.id),
      );

      Array.from(parentEl.options).forEach((opt) => {
        const optId = Number(opt.value);
        opt.hidden = optId === id || childIds.has(optId);
      });

      parentEl.value = batch.parent_batch_id
        ? String(batch.parent_batch_id)
        : "";

      if (parentHint) {
        const childCount = childIds.size;
        parentHint.textContent =
          childCount > 0
            ? `This campaign has ${childCount} follow-up${childCount !== 1 ? "s" : ""}. They cannot be selected as a parent.`
            : "";
      }
    }

    const modalEl = document.getElementById("itEditCampaignModal");
    if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }

  editCampaignBtn?.addEventListener("click", openEditModal);

  // Also update edit button visibility when batch filter changes
  batchFilter?.addEventListener("change", updateEditCampaignBtn);
  updateEditCampaignBtn();

  /**
   * Save edited campaign via PUT /oversight/tools/messaging/batches/:id.
   * On success updates the batch filter option text and data attributes in place,
   * refreshes the page if active was toggled off (batch disappears from list),
   * otherwise closes the modal.
   * @returns {Promise<void>}
   */
  document
    .getElementById("itEditSaveBtn")
    ?.addEventListener("click", async () => {
      if (!editingBatchId) return;

      const nameEl = document.getElementById("itEditName");
      const subjectEl = document.getElementById("itEditSubject");
      const bodyEl = document.getElementById("itEditBody");
      const parentEl = document.getElementById("itEditParent");
      const respEl = document.getElementById("itEditResponseNeeded");
      const activeEl = document.getElementById("itEditActive");
      const errorEl = document.getElementById("itEditError");
      const saveBtn = document.getElementById("itEditSaveBtn");

      const name = nameEl?.value.trim() || "";
      const messageSubject = subjectEl?.value.trim() || null;
      const messageBody = bodyEl?.value.trim() || "";
      const parentBatchId = Number(parentEl?.value) || null;
      const responseNeeded = respEl?.checked ?? true;
      const active = activeEl?.checked ?? true;

      if (!name) {
        if (errorEl) {
          errorEl.textContent = "Name is required.";
          errorEl.classList.remove("d-none");
        }
        return;
      }
      if (!messageBody) {
        if (errorEl) {
          errorEl.textContent = "Message body is required.";
          errorEl.classList.remove("d-none");
        }
        return;
      }

      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Saving…`;
      }
      if (errorEl) errorEl.classList.add("d-none");

      try {
        const messageType =
          document.getElementById("itEditMessageType")?.value || "invitation";
        const res = await fetch(
          `/oversight/tools/campaigns/batches/${editingBatchId}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": getCsrf(),
            },
            body: JSON.stringify({
              name,
              messageSubject,
              messageBody,
              parentBatchId,
              responseNeeded,
              active,
              messageType,
            }),
          },
        );
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
          if (errorEl) {
            errorEl.textContent =
              data.error || "Save failed — please try again.";
            errorEl.classList.remove("d-none");
          }
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk me-1"></i>Save changes`;
          }
          return;
        }

        // If deactivated, the batch will no longer appear — reload to resync
        if (!active) {
          window.location.reload();
          return;
        }

        // Update the option text and data attrs in the batch filter select
        const opt = batchFilter?.querySelector(
          `option[value="${editingBatchId}"]`,
        );
        if (opt) {
          opt.dataset.responseNeeded = responseNeeded ? "1" : "0";
          opt.dataset.parentId = parentBatchId ? String(parentBatchId) : "";
          const prefix = parentBatchId ? "↳ " : "";
          opt.textContent = `${prefix}${name}`;
        }

        // Sync the in-memory batches array so re-opening the edit modal
        // pre-fills with the values that were just saved, not stale page-load data.
        const batchesEl = document.getElementById("it-batches-data");
        if (batchesEl) {
          try {
            const batches = JSON.parse(batchesEl.textContent);
            const idx = batches.findIndex((b) => b.id === editingBatchId);
            if (idx !== -1) {
              batches[idx] = {
                ...batches[idx],
                name,
                message_subject: messageSubject,
                message_body: messageBody,
                parent_batch_id: parentBatchId,
                response_needed: responseNeeded,
                active,
              };
              batchesEl.textContent = JSON.stringify(batches);
            }
          } catch {
            // Non-fatal — worst case the modal pre-fills with stale data
          }
        }

        // Close modal
        const modalEl = document.getElementById("itEditCampaignModal");
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();

        // Re-run filters so response_needed changes take effect immediately
        applyFilters();
      } catch (err) {
        console.error("[invitationTracker] edit campaign save error:", err);
        if (errorEl) {
          errorEl.textContent = "Network error — please try again.";
          errorEl.classList.remove("d-none");
        }
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk me-1"></i>Save changes`;
        }
      }
    });

  // =========================================================
  // Init
  // =========================================================

  applyFilters();
})();
