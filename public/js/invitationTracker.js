/**
 * @file invitationTracker.js
 * @description Client-side logic for the Invitation Tracker page.
 *
 * The tracker shows one card per campaign (a top-level campaign together with
 * its follow-ups). Each card has the campaign's response bar and its actions
 * (Remind pending, Add people, Edit). Opening a card shows two lists:
 *
 *  - Sends: every time the campaign went out, oldest first — the original,
 *    people added later, each reminder and each follow-up — with the message
 *    exactly as written and who it went to, with text and email delivery
 *    status. Loaded on first open from
 *    GET /oversight/tools/campaigns/batches/:id/sends.
 *  - People: everyone in the campaign, one row each, with their response and
 *    Remind (pending people: opens the Campaign Center's Reminder with only
 *    them selected), Set answer, Revoke / Reinstate.
 *
 * Data: the server embeds every invitation (#it-rows-data, one row per
 * volunteer per campaign family; lib/trackerPayload.js) and the year's
 * campaigns (#it-campaigns-data). Filters (campaign, day, response, gender,
 * revoked, response required, name search) run entirely client-side against
 * that data. The stat cards count people across every matching row.
 *
 * Runs as soon as the script is reached rather than on DOMContentLoaded: it is
 * the last script in <body>, and the cards must be in place before the first
 * paint (DOMContentLoaded also waits for the deferred tour module).
 */

/**
 * Initialise the Invitation Tracker page.
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
    /** @type {HTMLElement|null} */
    const list = document.getElementById("itCampaignList");
    /** @type {HTMLElement|null} */
    const emptyFiltered = document.getElementById("itEmptyFiltered");
    /** @type {HTMLInputElement|null} */
    const csrfTokenEl = document.getElementById("itCsrfToken");

    /** True when the user may edit campaigns (shows the Edit buttons). */
    const canManage = document.getElementById("itCanManage")?.value === "1";

    /** People shown at once in a card's People list before "Show all". */
    const PEOPLE_PAGE = 100;

    // =========================================================
    // Helpers
    // =========================================================

    /** @returns {string} */
    function getCsrf() {
        return csrfTokenEl?.value || "";
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
     * Read a JSON island the server embedded in the page.
     *
     * @param {string} id - Element id.
     * @returns {*} The parsed value, or null if missing or invalid.
     */
    function readJson(id) {
        try {
            const el = document.getElementById(id);
            return el ? JSON.parse(el.textContent) : null;
        } catch (err) {
            console.error(`[invitationTracker] could not read #${id}:`, err);
            return null;
        }
    }

    const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
    });
    const shortDateFormat = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
    });

    /**
     * Format an ISO time in the viewer's time zone, e.g. "Nov 20, 6:42 PM".
     *
     * @param {string|null} iso
     * @param {boolean} [withTime=true]
     * @returns {string}
     */
    function formatIso(iso, withTime = true) {
        if (!iso) return "";
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return "";
        return (withTime ? dateTimeFormat : shortDateFormat).format(date);
    }

    /**
     * "1 person" / "3 people" style counts.
     *
     * @param {number} n
     * @param {string} one
     * @param {string} [many]
     * @returns {string}
     */
    function plural(n, one, many) {
        return `${n} ${n === 1 ? one : many || `${one}s`}`;
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
            (email ? '<i class="fa-solid fa-envelope text-info me-1" title="Email" aria-label="Email"></i>' : "") +
            (sms ? '<i class="fa-solid fa-comment-sms text-success" title="Text" aria-label="Text"></i>' : "")
        );
    }

    // =========================================================
    // Data
    // =========================================================

    /**
     * An invitation as embedded by the server (lib/trackerPayload.js
     * TrackerRow), plus the lower-cased `search` key added here.
     * @typedef {import("../../lib/trackerPayload.js").TrackerRow & { search: string }} InvitationRow
     */

    /** @typedef {import("../../lib/trackerPayload.js").TrackerCampaign} Campaign */
    /** @typedef {import("../../lib/trackerPayload.js").TrackerSend} Send */

    const rawRows = readJson("it-rows-data");
    const loadFailed = !Array.isArray(rawRows);

    /** @type {InvitationRow[]} Every invitation, newest first. */
    const trackerRows = (Array.isArray(rawRows) ? rawRows : []).map((row) => ({
        ...row,
        search: String(row.name || "").toLowerCase(),
    }));

    /** @type {Campaign[]} The year's active campaigns. */
    const campaigns = readJson("it-campaigns-data") || [];

    /** @type {Map<string, Campaign>} Campaign by id. */
    const campaignById = new Map(campaigns.map((c) => [c.id, c]));

    /**
     * Rows grouped by campaign family (top-level campaign id).
     * @type {Map<string, InvitationRow[]>}
     */
    const rowsByFamily = new Map();
    trackerRows.forEach((row) => {
        const key = row.familyRootId || row.batchId || "";
        if (!rowsByFamily.has(key)) rowsByFamily.set(key, []);
        rowsByFamily.get(key).push(row);
    });

    /**
     * Every family the page can show: those with invitations, plus the
     * year's top-level campaigns that have none yet.
     * @type {string[]}
     */
    const familyIds = [
        ...new Set([
            ...rowsByFamily.keys(),
            ...campaigns.filter((c) => !c.parentId).map((c) => c.id),
        ]),
    ].filter(Boolean);

    /**
     * Display details of a family, from its campaign record when it is one of
     * the year's active campaigns, otherwise from its invitation rows.
     *
     * @param {string} rootId
     * @returns {{ id: string, name: string, messageType: string,
     *   responseNeeded: boolean, isRecruitment: boolean, dayLabel: string|null,
     *   shiftLabel: string|null, eventTypeName: string|null,
     *   eventColor: string|null, sendCount: number, lastActivity: string,
     *   followUps: Campaign[] }}
     */
    function familyInfo(rootId) {
        const c = campaignById.get(rootId);
        const rows = rowsByFamily.get(rootId) || [];
        const rootRow = rows.find((r) => r.batchId === rootId) || rows[0];
        const latestRow = rows.reduce(
            (max, r) => (r.sentAtIso && r.sentAtIso > max ? r.sentAtIso : max),
            "",
        );
        return {
            id: rootId,
            name: c?.name || (rootRow && !rootRow.isFollowUp ? rootRow.batchName : null) || "Campaign",
            messageType: c?.messageType || rootRow?.messageType || "invitation",
            responseNeeded: c ? c.responseNeeded : !!rootRow?.responseNeeded,
            isRecruitment: !!c?.isRecruitment,
            dayLabel: c?.dayLabel || rootRow?.dayLabel || null,
            shiftLabel: c?.shiftLabel || rootRow?.shiftLabel || null,
            eventTypeName: c?.eventTypeName || rootRow?.eventTypeName || null,
            eventColor: rootRow?.eventColor || null,
            sendCount: c?.sendCount || 0,
            lastActivity: [c?.lastSentAtIso, latestRow, c?.createdAtIso]
                .filter(Boolean)
                .sort()
                .pop() || "",
            followUps: campaigns.filter((f) => f.parentId === rootId),
        };
    }

    /**
     * The row's response bucket: its answer, or "revoked" / "pending".
     *
     * @param {InvitationRow} row
     * @returns {string}
     */
    function responseOf(row) {
        return row.response || (row.revoked ? "revoked" : "pending");
    }

    /**
     * The top-level campaign id for a campaign id from the filter (a
     * follow-up resolves to its parent).
     *
     * @param {string} batchVal
     * @returns {string}
     */
    function familyOf(batchVal) {
        if (!batchVal) return "";
        const opt = batchFilter?.querySelector(`option[value="${CSS.escape(batchVal)}"]`);
        return opt?.dataset.parentId || campaignById.get(batchVal)?.parentId || batchVal;
    }

    // =========================================================
    // UI state
    // =========================================================

    /** Families whose card is open. @type {Set<string>} */
    const openCards = new Set();

    /** Which list an open card shows. @type {Map<string, "sends"|"people">} */
    const cardPane = new Map();

    /** Families whose People list shows everyone. @type {Set<string>} */
    const peopleShowAll = new Set();

    /** Open sends, by send id. @type {Set<number>} */
    const openSends = new Set();

    /**
     * Loaded send history per family: the sends, a load in progress, or an
     * error message.
     * @type {Map<string, Send[]|Promise<void>|{ error: string }>}
     */
    const sendsByFamily = new Map();

    /** Matching rows per family from the last applyFilters run. @type {Map<string, InvitationRow[]>} */
    let matchedByFamily = new Map();

    // =========================================================
    // Response badges and cells
    // =========================================================

    /**
     * Response badge: Revoked / Pending / Yes / No / Maybe / other answer.
     *
     * @param {InvitationRow|undefined} row
     * @returns {string}
     */
    function responseBadgeHtml(row) {
        if (!row) return '<span class="text-muted small">—</span>';
        if (row.revoked) {
            return '<span class="badge it-badge-revoked"><i class="fa-solid fa-ban me-1" aria-hidden="true"></i>Revoked</span>';
        }
        if (!row.respondedAt) {
            return row.responseNeeded
                ? '<span class="badge it-badge-pending">Pending</span>'
                : '<span class="text-muted small">No reply needed</span>';
        }
        if (row.response === "yes") {
            return '<span class="badge it-badge-yes"><i class="fa-solid fa-circle-check me-1" aria-hidden="true"></i>Yes</span>';
        }
        if (row.response === "no") {
            return '<span class="badge it-badge-no"><i class="fa-solid fa-circle-xmark me-1" aria-hidden="true"></i>No</span>';
        }
        if (row.response === "maybe") {
            return '<span class="badge it-badge-maybe"><i class="fa-solid fa-circle-question me-1" aria-hidden="true"></i>Maybe</span>';
        }
        if (row.response === "other" && row.responseOther) {
            const text = row.responseOther.length > 20 ? `${row.responseOther.slice(0, 20)}…` : row.responseOther;
            return `<span class="badge bg-secondary" title="${esc(row.responseOther)}"><i class="fa-solid fa-pen me-1" aria-hidden="true"></i>${esc(text)}</span>`;
        }
        return row.response ? `<span class="badge bg-info text-dark">${esc(row.response)}</span>` : "";
    }

    /** @type {Record<string, string>} Where an answer came from, for people. */
    const SOURCE_LABELS = { link: "RSVP page", text: "text", oversight: "oversight" };

    /**
     * The response badge plus, when the answer changed, "was Yes · Nov 25"
     * and where the latest answer came from.
     *
     * @param {InvitationRow|undefined} row
     * @returns {string}
     */
    function responseCellHtml(row) {
        const badge = responseBadgeHtml(row);
        if (!row || !row.changedAt || row.revoked) return badge;
        const was = { yes: "Yes", no: "No", maybe: "Maybe", other: "Other" }[row.previousResponse || ""] || row.previousResponse || "no answer";
        const times = row.changeCount > 1 ? ` (${row.changeCount} changes)` : "";
        const via = row.responseSource ? ` · via ${SOURCE_LABELS[row.responseSource] || row.responseSource}` : "";
        return `${badge}<div class="it-changed small">Changed from ${esc(was)} · ${esc(row.changedAt)}${esc(times)}${esc(via)}</div>`;
    }

    /**
     * The row's buttons: Set answer (when its campaign asks for one) and
     * Revoke, or Reinstate for a revoked invitation.
     *
     * @param {InvitationRow|undefined} row
     * @returns {string}
     */
    function rowActionHtml(row) {
        if (!row) return "";
        const name = esc(row.name);
        if (row.revoked) {
            return `<button type="button" class="btn btn-outline-success btn-sm it-reinstate-btn" data-id="${row.id}" data-name="${name}" title="Reinstate invitation" aria-label="Reinstate invitation for ${name}"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i></button>`;
        }
        const setAnswer = row.responseNeeded && campaignById.get(row.batchId)?.answers
            ? `<button type="button" class="btn btn-outline-secondary btn-sm it-answer-btn" data-id="${row.id}" title="Set answer" aria-label="Set answer for ${name}"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i></button>`
            : "";
        // Remind just this person: opens the Campaign Center's Reminder with
        // only them selected (same rule as "Remind pending").
        const remind = row.responseNeeded && responseOf(row) === "pending" && row.volStatus === "completed" && row.volunteerId != null
            ? `<a class="btn btn-outline-warning btn-sm it-remind-one-btn" href="/oversight/tools/campaigns?batchId=${encodeURIComponent(row.batchId)}&selectPending=1&volunteerId=${encodeURIComponent(row.volunteerId)}" title="Remind" aria-label="Send ${name} a reminder"><i class="fa-solid fa-bell" aria-hidden="true"></i></a>`
            : "";
        return `<div class="it-row-actions">${remind}${setAnswer}<button type="button" class="btn btn-outline-danger btn-sm it-revoke-btn" data-id="${row.id}" data-name="${name}" title="Revoke invitation" aria-label="Revoke invitation for ${name}"><i class="fa-solid fa-ban" aria-hidden="true"></i></button></div>`;
    }

    /**
     * Reminder summary for a person: last reminder date, channels and ×N.
     *
     * @param {InvitationRow} row
     * @returns {string}
     */
    function remindedHtml(row) {
        if (!row.remindedAt) return '<span class="text-muted">—</span>';
        const times = row.reminderCount > 1
            ? ` <span class="badge bg-secondary" title="${row.reminderCount} reminders sent">×${row.reminderCount}</span>`
            : "";
        return `${esc(row.remindedAt)} <span class="ms-1">${channelIconsHtml(row.lastRemindedChannel)}</span>${times}`;
    }

    // =========================================================
    // Campaign card
    // =========================================================

    /**
     * Counts for a card's response bar, from all of the family's rows (one
     * per person), so they match what Remind would select.
     *
     * @param {InvitationRow[]} rows
     * @param {boolean} showRevoked
     * @returns {{ total: number, yes: number, maybe: number, no: number,
     *   other: number, pending: number, revoked: number, remindable: number }}
     */
    function familyCounts(rows, showRevoked) {
        const counts = { total: 0, yes: 0, maybe: 0, no: 0, other: 0, pending: 0, revoked: 0, remindable: 0 };
        rows.forEach((row) => {
            if (row.revoked && !showRevoked) return;
            counts.total++;
            const r = responseOf(row);
            if (r === "revoked") counts.revoked++;
            else if (r === "pending") {
                if (row.responseNeeded) {
                    counts.pending++;
                    if (row.volStatus === "completed") counts.remindable++;
                }
            } else if (r === "yes" || r === "maybe" || r === "no") counts[r]++;
            else counts.other++;
        });
        return counts;
    }

    /**
     * The response bar: one segment per bucket, widths set afterwards by
     * applySegmentWidths (CSP: no inline style attributes).
     *
     * @param {ReturnType<typeof familyCounts>} c
     * @returns {string}
     */
    function progressHtml(c) {
        if (!c.total) return "";
        const parts = [
            ["yes", c.yes, "Yes"],
            ["maybe", c.maybe, "Maybe"],
            ["other", c.other, "Other answer"],
            ["no", c.no, "No"],
            ["pending", c.pending, "Pending"],
            ["revoked", c.revoked, "Revoked"],
        ].filter(([, n]) => n > 0);
        const label = parts.map(([, n, text]) => `${n} ${text.toLowerCase()}`).join(", ");
        const segments = parts
            .map(([key, n, text]) => `<span class="it-seg it-seg--${key}" data-pct="${(n / c.total) * 100}" title="${n} ${esc(text.toLowerCase())}"></span>`)
            .join("");
        return `<div class="it-progress" role="img" aria-label="${esc(label)} of ${c.total}">${segments}</div>`;
    }

    /**
     * Legend under the bar, e.g. "18 yes · 3 maybe · 5 no · 9 pending · 35 people".
     *
     * @param {ReturnType<typeof familyCounts>} c
     * @param {boolean} responseNeeded
     * @returns {string}
     */
    function legendHtml(c, responseNeeded) {
        if (!c.total) return '<span class="text-muted">No one has been sent this campaign yet.</span>';
        const bits = [];
        if (responseNeeded || c.yes || c.no || c.maybe) {
            bits.push(
                `<span class="it-legend it-legend--yes">${c.yes} yes</span>`,
                c.maybe ? `<span class="it-legend it-legend--maybe">${c.maybe} maybe</span>` : "",
                c.other ? `<span class="it-legend it-legend--other">${c.other} other</span>` : "",
                `<span class="it-legend it-legend--no">${c.no} no</span>`,
                `<span class="it-legend it-legend--pending">${c.pending} pending</span>`,
            );
        }
        if (c.revoked) bits.push(`<span class="it-legend it-legend--revoked">${c.revoked} revoked</span>`);
        bits.push(`<span>${plural(c.total, "person", "people")}</span>`);
        return bits.filter(Boolean).join('<span class="text-muted" aria-hidden="true"> · </span>');
    }

    /**
     * One campaign card.
     *
     * @param {string} rootId
     * @param {InvitationRow[]} matched - The family's rows that pass the filters.
     * @param {boolean} peopleFiltered - Whether filters narrow the people shown.
     * @param {boolean} showRevoked
     * @returns {string}
     */
    function cardHtml(rootId, matched, peopleFiltered, showRevoked) {
        const info = familyInfo(rootId);
        const all = rowsByFamily.get(rootId) || [];
        const counts = familyCounts(all, showRevoked);
        const open = openCards.has(rootId);
        const pane = cardPane.get(rootId) || "sends";
        const detailId = `itDetail-${esc(rootId)}`;
        const typeBadge = info.messageType === "alert"
            ? '<span class="badge bg-warning text-dark it-type-badge">Alert</span>'
            : "";
        const recruitBadge = info.isRecruitment
            ? '<span class="badge text-bg-light border it-type-badge">Recruitment</span>'
            : "";
        const dot = info.eventColor ? `<span class="it-event-dot" data-color="${esc(info.eventColor)}"></span>` : "";
        const event = info.dayLabel
            ? `<span class="it-event-label">${dot}${esc(info.dayLabel)}${info.shiftLabel ? ` · ${esc(info.eventTypeName || "")} (${esc(info.shiftLabel)})` : ""}</span>`
            : '<span>No linked event</span>';
        const meta = [
            event,
            info.followUps.length ? `<span>${plural(info.followUps.length, "follow-up")}</span>` : "",
            info.sendCount ? `<span>${plural(info.sendCount, "send")}</span>` : "",
            info.lastActivity
                ? `<span>${all.length || info.sendCount ? "Last sent" : "Created"} ${esc(formatIso(info.lastActivity, false))}</span>`
                : "",
        ].filter(Boolean).join('<span aria-hidden="true"> · </span>');

        const actions = [];
        if (info.responseNeeded && counts.remindable > 0) {
            actions.push(`<a class="btn btn-warning btn-sm it-remind-btn" href="/oversight/tools/campaigns?batchId=${encodeURIComponent(rootId)}&selectPending=1"><i class="fa-solid fa-bell me-1" aria-hidden="true"></i>Remind ${counts.remindable} pending</a>`);
        }
        actions.push(`<a class="btn btn-outline-primary btn-sm it-add-btn" href="/oversight/tools/campaigns?batchId=${encodeURIComponent(rootId)}"><i class="fa-solid fa-user-plus me-1" aria-hidden="true"></i>Add people</a>`);
        if (canManage && campaignById.has(rootId)) {
            actions.push(`<button type="button" class="btn btn-outline-secondary btn-sm it-edit-btn" data-batch-id="${esc(rootId)}" aria-label="Edit campaign ${esc(info.name)}" title="Edit campaign"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i></button>`);
        }

        const matchNote = peopleFiltered
            ? `<span class="badge text-bg-light border ms-2">${plural(matched.length, "match", "matches")}</span>`
            : "";

        return `
<article class="card it-campaign shadow-sm" data-root="${esc(rootId)}">
    <div class="card-body">
        <div class="it-campaign-head">
            <div class="it-campaign-title">
                <h2 class="h6 mb-1">${esc(info.name)} ${typeBadge} ${recruitBadge}</h2>
                <div class="it-campaign-meta">${meta}</div>
            </div>
            <div class="it-campaign-actions">${actions.join("")}</div>
        </div>
        ${progressHtml(counts)}
        <div class="it-campaign-legend">${legendHtml(counts, info.responseNeeded)}${matchNote}</div>
        <button type="button" class="btn btn-link btn-sm px-0 it-toggle" aria-expanded="${open}" aria-controls="${detailId}">
            <i class="fa-solid fa-chevron-${open ? "down" : "right"} me-1" aria-hidden="true"></i>${open ? "Hide" : "Show"} sends and people
        </button>
        <div class="it-campaign-detail${open ? "" : " d-none"}" id="${detailId}">
            ${open ? detailHtml(rootId, matched, pane) : ""}
        </div>
    </div>
</article>`;
    }

    /**
     * The open card's tabs and the chosen list.
     *
     * @param {string} rootId
     * @param {InvitationRow[]} matched
     * @param {"sends"|"people"} pane
     * @returns {string}
     */
    function detailHtml(rootId, matched, pane) {
        const tab = (key, label) =>
            `<button type="button" class="btn btn-sm ${pane === key ? "btn-secondary" : "btn-outline-secondary"} it-pane-btn" data-pane="${key}" aria-pressed="${pane === key}">${label}</button>`;
        return `
            <div class="btn-group mb-2" role="group" aria-label="Show">
                ${tab("sends", '<i class="fa-solid fa-paper-plane me-1" aria-hidden="true"></i>Sends')}
                ${tab("people", `<i class="fa-solid fa-users me-1" aria-hidden="true"></i>People (${matched.length})`)}
            </div>
            <div class="it-pane">${pane === "people" ? peopleHtml(rootId, matched) : sendsHtml(rootId)}</div>`;
    }

    // =========================================================
    // People list
    // =========================================================

    /**
     * Everyone in the family who passes the filters.
     *
     * @param {string} rootId
     * @param {InvitationRow[]} rows
     * @returns {string}
     */
    function peopleHtml(rootId, rows) {
        if (!rows.length) return '<p class="text-muted small mb-0">No one matches the current filters.</p>';
        const showAll = peopleShowAll.has(rootId);
        const shown = showAll ? rows : rows.slice(0, PEOPLE_PAGE);
        const body = shown.map((row) => `
            <tr class="it-row${row.revoked ? " it-row--revoked" : ""}">
                <td class="fw-semibold">${esc(row.name)}${row.isFollowUp ? `<div class="small text-muted fw-normal">↳ ${esc(row.batchName || "follow-up")}</div>` : ""}</td>
                <td class="text-center">${channelIconsHtml(row.channel)}</td>
                <td class="text-muted small text-nowrap">${esc(row.sentAt)}</td>
                <td class="text-muted small text-nowrap">${remindedHtml(row)}</td>
                <td>${responseCellHtml(row)}</td>
                <td class="text-muted small text-nowrap">${esc(row.respondedAt || "—")}</td>
                <td class="text-end">${rowActionHtml(row)}</td>
            </tr>`).join("");
        const more = rows.length > shown.length
            ? `<button type="button" class="btn btn-link btn-sm it-people-all">Show all ${rows.length}</button>`
            : "";
        return `
            <div class="table-responsive">
                <table class="table table-sm table-hover it-table mb-0">
                    <thead class="table-light">
                        <tr>
                            <th scope="col">Volunteer</th>
                            <th scope="col" class="text-center">Ch.</th>
                            <th scope="col">Sent</th>
                            <th scope="col">Reminded</th>
                            <th scope="col">Response</th>
                            <th scope="col">Responded</th>
                            <th scope="col"><span class="visually-hidden">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody>${body}</tbody>
                </table>
            </div>${more}`;
    }

    // =========================================================
    // Sends list
    // =========================================================

    /** @type {Record<string, string>} Text delivery status → label. */
    const SMS_STATUS = {
        queued: "Sending",
        accepted: "Sending",
        sending: "Sending",
        sent: "Sent",
        delivered: "Delivered",
        undelivered: "Not delivered",
        failed: "Not delivered",
        not_tracked: "Sent (not tracked)",
    };

    /**
     * The title of a send: "Original message", "Added 6 people",
     * "Reminder 2", "Follow-up: name".
     *
     * @param {Send} send
     * @param {number} reminderNo - This reminder's number in the family.
     * @returns {string}
     */
    function sendTitle(send, reminderNo) {
        if (send.kind === "reminder") return `Reminder ${reminderNo}`;
        if (send.kind === "added") return `Added ${plural(send.counts.recipients, "person", "people")}`;
        return send.isFollowUp ? `Follow-up: ${send.batchName}` : "Original message";
    }

    /**
     * One-line results of a send, e.g. "27 reached · 1 skipped · texts: 25
     * delivered, 1 not delivered".
     *
     * @param {Send} send
     * @returns {string}
     */
    function sendSummary(send) {
        const bits = [`${send.counts.sent} reached`];
        if (send.counts.skipped) bits.push(`${send.counts.skipped} skipped`);
        if (send.counts.errors) bits.push(`${send.counts.errors} failed`);
        const sms = send.recipients.map((r) => r.sms).filter(Boolean);
        if (sms.length) {
            const tally = new Map();
            sms.forEach((s) => tally.set(SMS_STATUS[s] || s, (tally.get(SMS_STATUS[s] || s) || 0) + 1));
            bits.push(`texts: ${[...tally].map(([label, n]) => `${n} ${label.toLowerCase()}`).join(", ")}`);
        }
        return bits.join(" · ");
    }

    /**
     * What happened to one person in a send: skipped (and why), failed, or
     * the email / text delivery status.
     *
     * @param {Send["recipients"][number]} r
     * @param {boolean} isBackfill
     * @returns {string}
     */
    function deliveryHtml(r, isBackfill) {
        if (r.outcome === "skipped") return `<span class="text-muted">Skipped${r.reason ? `: ${esc(r.reason)}` : ""}</span>`;
        if (r.outcome === "error" && !r.email && !r.sms) return `<span class="text-danger">Failed${r.reason ? `: ${esc(r.reason)}` : ""}</span>`;
        if (isBackfill || (!r.email && !r.sms)) {
            return `${channelIconsHtml(r.channel)} <span class="text-muted">Sent</span>`;
        }
        const parts = [];
        if (r.email) {
            parts.push(r.email === "failed"
                ? '<span class="text-danger"><i class="fa-solid fa-envelope me-1" aria-hidden="true"></i>Email failed</span>'
                : '<span><i class="fa-solid fa-envelope text-info me-1" aria-hidden="true"></i>Email sent</span>');
        }
        if (r.sms) {
            const bad = r.sms === "failed" || r.sms === "undelivered";
            const reason = r.smsErrorText || (r.reason || "").replace(/^text failed: /, "");
            const why = bad && reason ? ` (${esc(reason)})` : "";
            parts.push(`<span class="${bad ? "text-danger" : r.sms === "delivered" ? "text-success" : ""}"><i class="fa-solid fa-comment-sms me-1" aria-hidden="true"></i>Text ${esc((SMS_STATUS[r.sms] || r.sms).toLowerCase())}${why}</span>`);
        }
        if (r.outcome === "email_only" && r.reason) {
            parts.push(`<span class="text-muted">No text: ${esc(r.reason)}</span>`);
        }
        return parts.join("<br>");
    }

    /**
     * The sends list of an open card, or its loading / error state.
     *
     * @param {string} rootId
     * @returns {string}
     */
    function sendsHtml(rootId) {
        const loaded = sendsByFamily.get(rootId);
        if (!loaded || loaded instanceof Promise) {
            loadSends(rootId);
            return '<p class="text-muted small mb-0"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Loading sends…</p>';
        }
        if (!Array.isArray(loaded)) {
            return `<p class="text-danger small mb-0">${esc(loaded.error)} <button type="button" class="btn btn-link btn-sm p-0 align-baseline it-sends-retry">Try again</button></p>`;
        }
        if (!loaded.length) {
            return '<p class="text-muted small mb-0">No sends recorded for this campaign.</p>';
        }

        /** This family's rows by volunteer, for the response column. */
        const byVolunteer = new Map((rowsByFamily.get(rootId) || []).map((r) => [r.volunteerId, r]));
        let reminderNo = 0;

        return loaded.map((send) => {
            if (send.kind === "reminder") reminderNo++;
            const open = openSends.has(send.id);
            const bodyId = `itSend-${send.id}`;
            const editBtn = canManage && send.isFollowUp && campaignById.has(send.batchId) && send.kind === "original"
                ? `<button type="button" class="btn btn-outline-secondary btn-sm it-edit-btn ms-2" data-batch-id="${esc(send.batchId)}" aria-label="Edit follow-up ${esc(send.batchName)}" title="Edit follow-up"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i></button>`
                : "";
            const meta = [
                esc(formatIso(send.sentAtIso)),
                send.sentBy ? `by ${esc(send.sentBy)}` : "",
                channelIconsHtml(send.channels),
                plural(send.counts.recipients, "person", "people"),
            ].filter(Boolean).join('<span aria-hidden="true"> · </span>');

            const message = send.body
                ? `<div class="it-send-message">${send.subject ? `<div class="fw-semibold mb-1">${esc(send.subject)}</div>` : ""}<div class="it-send-text">${esc(send.body)}</div></div>`
                : '<p class="text-muted small">The text of this reminder wasn\'t recorded (sent before send history began).</p>';
            const backfillNote = send.isBackfill && send.body
                ? '<p class="text-muted small mb-2"><i class="fa-solid fa-clock-rotate-left me-1" aria-hidden="true"></i>Sent before send history began: the message shown is the campaign\'s saved text, and delivery wasn\'t tracked.</p>'
                : "";

            const people = send.recipients.map((r) => {
                const row = r.volunteerId != null ? byVolunteer.get(r.volunteerId) : undefined;
                return `
                    <tr>
                        <td class="fw-semibold">${esc(r.name)}</td>
                        <td class="small">${deliveryHtml(r, send.isBackfill)}</td>
                        <td>${r.outcome === "skipped" ? "" : responseCellHtml(row)}</td>
                        <td class="text-end">${r.outcome === "skipped" ? "" : rowActionHtml(row)}</td>
                    </tr>`;
            }).join("");

            return `
            <section class="it-send${open ? " it-send--open" : ""}" data-send-id="${send.id}">
                <div class="it-send-head-row">
                    <button type="button" class="it-send-head" aria-expanded="${open}" aria-controls="${bodyId}">
                        <i class="fa-solid fa-chevron-${open ? "down" : "right"} it-send-chevron" aria-hidden="true"></i>
                        <span class="it-send-title">${esc(sendTitle(send, reminderNo))}</span>
                        <span class="it-send-meta">${meta}</span>
                        <span class="it-send-summary">${esc(sendSummary(send))}</span>
                    </button>${editBtn}
                </div>
                <div class="it-send-body${open ? "" : " d-none"}" id="${bodyId}">
                    ${backfillNote}${message}
                    <div class="table-responsive">
                        <table class="table table-sm mb-0 it-table">
                            <thead class="table-light">
                                <tr>
                                    <th scope="col">Volunteer</th>
                                    <th scope="col">Delivery</th>
                                    <th scope="col">Response</th>
                                    <th scope="col"><span class="visually-hidden">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody>${people || '<tr><td colspan="4" class="text-muted small">No one recorded.</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            </section>`;
        }).join("");
    }

    /**
     * Load a family's sends once, then re-render its card.
     *
     * @param {string} rootId
     * @returns {void}
     */
    function loadSends(rootId) {
        if (sendsByFamily.get(rootId) instanceof Promise) return;
        const pending = fetch(`/oversight/tools/campaigns/batches/${encodeURIComponent(rootId)}/sends`, {
            headers: { Accept: "application/json" },
        })
            .then((res) => res.json().then((data) => ({ res, data })))
            .then(({ res, data }) => {
                if (!res.ok || !data.success) throw new Error(data.error || "Could not load the sends.");
                sendsByFamily.set(rootId, data.sends);
            })
            .catch((err) => {
                console.error("[invitationTracker] sends load error:", err);
                sendsByFamily.set(rootId, { error: err.message || "Could not load the sends." });
            })
            .finally(() => rerenderCard(rootId));
        sendsByFamily.set(rootId, pending);
    }

    // =========================================================
    // Rendering
    // =========================================================

    /**
     * Apply event dot colours and response bar widths inside an element
     * (CSP-safe: set through the style property, not style attributes).
     *
     * @param {ParentNode} root
     * @returns {void}
     */
    function applyStyles(root) {
        root.querySelectorAll(".it-event-dot[data-color]").forEach((dot) => {
            dot.style.backgroundColor = dot.dataset.color;
        });
        root.querySelectorAll(".it-seg[data-pct]").forEach((seg) => {
            seg.style.width = `${seg.dataset.pct}%`;
        });
    }

    /** Current filter values. @returns {object} */
    function readFilters() {
        const responseVal = responseFilter?.value || "all";
        const genderVal = genderFilter?.value || "";
        const query = (searchInput?.value || "").trim().toLowerCase();
        const responseRequiredOnly = responseRequiredChk?.checked ?? false;
        return {
            query,
            familyVal: familyOf(batchFilter?.value || ""),
            dayVal: dayFilter?.value || "",
            responseVal,
            genderVal,
            showRevoked: revokedChk?.checked ?? true,
            responseRequiredOnly,
            peopleFiltered: !!query || responseVal !== "all" || !!genderVal || responseRequiredOnly,
        };
    }

    /**
     * Re-render one card in place (after its sends load, a pane switch, or a
     * revoke), keeping the rest of the page as it is.
     *
     * @param {string} rootId
     * @returns {void}
     */
    function rerenderCard(rootId) {
        const el = list?.querySelector(`.it-campaign[data-root="${CSS.escape(rootId)}"]`);
        if (!el) return;
        const f = readFilters();
        const holder = document.createElement("div");
        holder.innerHTML = cardHtml(rootId, matchedByFamily.get(rootId) || [], f.peopleFiltered, f.showRevoked);
        const card = holder.firstElementChild;
        if (!card) return;
        el.replaceWith(card);
        applyStyles(card);
    }

    /**
     * Apply every filter: work out each family's matching rows, render the
     * matching campaign cards, and update the stat cards and count line.
     *
     * @returns {void}
     */
    function applyFilters() {
        const f = readFilters();

        matchedByFamily = new Map();

        /** Per-volunteer response states, for the stat cards. */
        const volAccum = new Map();

        trackerRows.forEach((row) => {
            const family = row.familyRootId || row.batchId || "";
            const response = responseOf(row);
            if (row.revoked && !f.showRevoked) return;
            if (f.familyVal && family !== f.familyVal) return;
            if (f.dayVal && row.dayId !== f.dayVal) return;
            if (f.responseVal !== "all" && response !== f.responseVal) return;
            if (f.responseRequiredOnly && !row.responseNeeded) return;
            if (f.genderVal && row.gender !== f.genderVal) return;
            if (f.query && !row.search.includes(f.query)) return;

            if (!matchedByFamily.has(family)) matchedByFamily.set(family, []);
            matchedByFamily.get(family).push(row);

            if (!volAccum.has(row.volunteerId)) {
                volAccum.set(row.volunteerId, { yes: false, no: false, maybe: false, pending: false, revoked: false });
            }
            const a = volAccum.get(row.volunteerId);
            if (row.revoked) a.revoked = true;
            else if (response === "yes") a.yes = true;
            else if (response === "no") a.no = true;
            else if (response === "maybe") a.maybe = true;
            else if (response === "pending" && row.responseNeeded) a.pending = true;
        });

        // Stat cards: people, counted once. Anyone who answered anywhere in
        // view is not also pending.
        const stats = { total: 0, yes: 0, no: 0, maybe: 0, pending: 0, revoked: 0 };
        volAccum.forEach((a) => {
            const answered = a.yes || a.no || a.maybe;
            stats.total++;
            if (a.yes) stats.yes++;
            if (a.no) stats.no++;
            if (a.maybe) stats.maybe++;
            if (!answered && a.pending) stats.pending++;
            if (!answered && a.revoked) stats.revoked++;
        });
        [["itStatTotal", stats.total], ["itStatYes", stats.yes], ["itStatNo", stats.no],
            ["itStatMaybe", stats.maybe], ["itStatPending", stats.pending], ["itStatRevoked", stats.revoked]]
            .forEach(([id, n]) => {
                const el = document.getElementById(id);
                if (el) el.textContent = String(n);
            });

        // Which cards to show: families with matching people; with no people
        // filters, also campaigns that match the campaign and day filters
        // but have no one in them yet.
        const visible = familyIds.filter((id) => {
            if (f.familyVal && id !== f.familyVal) return false;
            if (matchedByFamily.has(id)) return true;
            if (f.peopleFiltered || rowsByFamily.has(id)) return false;
            const c = campaignById.get(id);
            return !!c && (!f.dayVal || c.dayId === f.dayVal);
        });
        visible.sort((a, b) => familyInfo(b).lastActivity.localeCompare(familyInfo(a).lastActivity));

        // A name search opens the matching cards on their People list, when
        // there are few enough to read.
        if (f.query && visible.length <= 5) {
            visible.forEach((id) => {
                openCards.add(id);
                cardPane.set(id, "people");
            });
        }
        // Choosing one campaign opens it.
        if (f.familyVal && visible.length === 1) openCards.add(f.familyVal);

        if (list) {
            list.innerHTML = visible
                .map((id) => cardHtml(id, matchedByFamily.get(id) || [], f.peopleFiltered, f.showRevoked))
                .join("");
            list.setAttribute("aria-busy", "false");
            applyStyles(list);
        }
        emptyFiltered?.classList.toggle("d-none", visible.length > 0 || trackerRows.length === 0);

        if (rowCount) {
            const people = [...matchedByFamily.values()].reduce((n, rows) => n + rows.length, 0);
            rowCount.textContent = loadFailed
                ? "Could not load the invitations — please reload the page."
                : `Showing ${plural(visible.length, "campaign")} · ${plural(people, "invitation")}`;
        }
    }

    // =========================================================
    // Card interactions (one delegated listener)
    // =========================================================

    list?.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const card = target.closest(".it-campaign");
        const rootId = card?.getAttribute("data-root") || "";

        const answerBtn = target.closest(".it-answer-btn");
        if (answerBtn instanceof HTMLElement) {
            openAnswerModal(Number(answerBtn.dataset.id), rootId);
            return;
        }

        const actionBtn = target.closest(".it-revoke-btn, .it-reinstate-btn");
        if (actionBtn instanceof HTMLButtonElement) {
            if (!actionBtn.disabled) handleRowAction(actionBtn, rootId);
            return;
        }

        const editBtn = target.closest(".it-edit-btn");
        if (editBtn instanceof HTMLElement) {
            openEditModal(Number(editBtn.dataset.batchId));
            return;
        }

        if (target.closest(".it-toggle")) {
            if (openCards.has(rootId)) openCards.delete(rootId);
            else openCards.add(rootId);
            rerenderCard(rootId);
            return;
        }

        const paneBtn = target.closest(".it-pane-btn");
        if (paneBtn instanceof HTMLElement) {
            cardPane.set(rootId, paneBtn.dataset.pane === "people" ? "people" : "sends");
            rerenderCard(rootId);
            return;
        }

        if (target.closest(".it-people-all")) {
            peopleShowAll.add(rootId);
            rerenderCard(rootId);
            return;
        }

        if (target.closest(".it-sends-retry")) {
            sendsByFamily.delete(rootId);
            rerenderCard(rootId);
            return;
        }

        const sendHead = target.closest(".it-send-head");
        if (sendHead) {
            const sendId = Number(sendHead.closest(".it-send")?.getAttribute("data-send-id"));
            if (openSends.has(sendId)) openSends.delete(sendId);
            else openSends.add(sendId);
            rerenderCard(rootId);
        }
    });

    // =========================================================
    // Filters
    // =========================================================

    [batchFilter, dayFilter, responseFilter, genderFilter].forEach((el) => {
        el?.addEventListener("change", () => applyFilters());
    });
    revokedChk?.addEventListener("change", () => applyFilters());
    responseRequiredChk?.addEventListener("change", () => applyFilters());
    searchInput?.addEventListener("input", () => applyFilters());

    resetBtn?.addEventListener("click", () => {
        if (batchFilter) batchFilter.value = "";
        if (dayFilter) dayFilter.value = "";
        if (responseFilter) responseFilter.value = "all";
        if (genderFilter) genderFilter.value = "";
        if (revokedChk) revokedChk.checked = true;
        if (responseRequiredChk) responseRequiredChk.checked = false;
        if (searchInput) searchInput.value = "";
        applyFilters();
    });

    // =========================================================
    // Confirm modal
    // =========================================================

    /**
     * Show the confirm modal; resolves true on Continue, false otherwise.
     *
     * @param {string} title
     * @param {string} body
     * @param {string} okLabel
     * @returns {Promise<boolean>}
     */
    function confirmAction(title, body, okLabel) {
        return new Promise((resolve) => {
            const modalEl = document.getElementById("itConfirmModal");
            const okBtn = document.getElementById("itConfirmOkBtn");
            if (!modalEl || !okBtn || typeof bootstrap === "undefined") {
                resolve(true);
                return;
            }
            const titleEl = document.getElementById("itConfirmTitle");
            const bodyEl = document.getElementById("itConfirmBody");
            if (titleEl) titleEl.textContent = title;
            if (bodyEl) bodyEl.textContent = body;
            okBtn.textContent = okLabel;

            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            let confirmed = false;
            const onOk = () => {
                confirmed = true;
                modal.hide();
            };
            okBtn.addEventListener("click", onOk);
            modalEl.addEventListener("hidden.bs.modal", () => {
                okBtn.removeEventListener("click", onOk);
                resolve(confirmed);
            }, { once: true });
            modal.show();
        });
    }

    // =========================================================
    // Revoke / Reinstate
    // =========================================================

    /** Base path of the revoke / reinstate endpoints. */
    const INVITATION_API = "/oversight/tools/campaigns/invitations";

    /**
     * Confirm, then revoke or reinstate the invitation behind a button, and
     * re-render the page so counts, filters and the card follow.
     *
     * @param {HTMLButtonElement} btn - A .it-revoke-btn or .it-reinstate-btn.
     * @param {string} rootId - The card it is in.
     * @returns {Promise<void>}
     */
    async function handleRowAction(btn, rootId) {
        const id = Number(btn.dataset.id);
        const name = btn.dataset.name || "this volunteer";
        const isRevoke = btn.classList.contains("it-revoke-btn");
        const action = isRevoke ? "revoke" : "reinstate";

        const ok = await confirmAction(
            isRevoke ? "Revoke invitation?" : "Reinstate invitation?",
            isRevoke
                ? `${name}'s RSVP link will stop working.`
                : `${name}'s RSVP link will work again.`,
            isRevoke ? "Revoke" : "Reinstate",
        );
        if (!ok) return;

        const origHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span class="visually-hidden">Working…</span>';

        try {
            const res = await fetch(`${INVITATION_API}/${id}/${action}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrf() },
                body: JSON.stringify({}),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) throw new Error(data.error || `${isRevoke ? "Revoke" : "Reinstate"} failed — please try again.`);

            const row = trackerRows.find((r) => r.id === id);
            if (row) row.revoked = isRevoke;
            openCards.add(rootId);
            applyFilters();
        } catch (err) {
            console.error(`[invitationTracker] ${action} error:`, err);
            btn.disabled = false;
            btn.innerHTML = origHtml;
            btn.title = err.message || "Network error — please try again.";
            btn.classList.add("it-action-failed");
        }
    }

    // =========================================================
    // Set answer
    // =========================================================

    /** Formats "Nov 25, 2026" like the server's tracker dates. */
    const rowDateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

    /** @type {{ id: number, rootId: string }|null} Invitation open in the Set answer modal. */
    let answering = null;

    /**
     * Open the Set answer modal for one invitation, offering its campaign's
     * own answers, plus Other (when the campaign allows it) and No answer.
     *
     * @param {number} id - Invitation id.
     * @param {string} rootId - The card it is in.
     * @returns {void}
     */
    function openAnswerModal(id, rootId) {
        const row = trackerRows.find((r) => r.id === id);
        const answers = row ? campaignById.get(row.batchId)?.answers : null;
        const modalEl = document.getElementById("itAnswerModal");
        const listEl = document.getElementById("itAnswerChoices");
        if (!row || !answers || !modalEl || !listEl || typeof bootstrap === "undefined") return;
        answering = { id, rootId };

        const whoEl = document.getElementById("itAnswerWho");
        if (whoEl) whoEl.textContent = `${row.name} · ${campaignById.get(row.batchId)?.name || "this campaign"}`;

        const current = row.respondedAt ? row.response || "" : "";
        const options = [
            ...answers.choices,
            ...(answers.allowOther ? [{ value: "other", label: "Other…" }] : []),
            { value: "", label: "No answer yet" },
        ];
        listEl.innerHTML = options.map((opt, i) => `
            <div class="form-check">
                <input class="form-check-input" type="radio" name="itAnswer" id="itAnswerOpt${i}" value="${esc(opt.value)}"${opt.value === current ? " checked" : ""}>
                <label class="form-check-label" for="itAnswerOpt${i}">${esc(opt.label)}</label>
            </div>`).join("");

        const otherEl = /** @type {HTMLInputElement|null} */ (document.getElementById("itAnswerOther"));
        if (otherEl) otherEl.value = current === "other" ? row.responseOther || "" : "";
        syncAnswerOther();
        document.getElementById("itAnswerError")?.classList.add("d-none");
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }

    /**
     * Show the Other text box only while Other is picked.
     *
     * @returns {void}
     */
    function syncAnswerOther() {
        const picked = /** @type {HTMLInputElement|null} */ (document.querySelector('input[name="itAnswer"]:checked'));
        const wrap = document.getElementById("itAnswerOtherWrap");
        if (wrap) wrap.classList.toggle("d-none", picked?.value !== "other");
    }

    document.getElementById("itAnswerChoices")?.addEventListener("change", syncAnswerOther);

    /**
     * Save the picked answer, update the row and re-render the page so
     * counts, filters and the card follow.
     *
     * @returns {Promise<void>}
     */
    async function saveAnswer() {
        if (!answering) return;
        const { id, rootId } = answering;
        const picked = /** @type {HTMLInputElement|null} */ (document.querySelector('input[name="itAnswer"]:checked'));
        const otherEl = /** @type {HTMLInputElement|null} */ (document.getElementById("itAnswerOther"));
        const errorEl = document.getElementById("itAnswerError");
        const saveBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById("itAnswerSaveBtn"));

        /** @param {string} msg */
        const showError = (msg) => {
            if (!errorEl) return;
            errorEl.textContent = msg;
            errorEl.classList.remove("d-none");
        };
        if (!picked) {
            showError("Pick an answer.");
            return;
        }
        const response = picked.value || null;
        const responseOther = response === "other" ? (otherEl?.value || "").trim() : null;
        if (response === "other" && !responseOther) {
            showError("Type the answer for Other.");
            otherEl?.focus();
            return;
        }

        if (saveBtn) saveBtn.disabled = true;
        try {
            const res = await fetch(`${INVITATION_API}/${id}/answer`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrf() },
                body: JSON.stringify({ response, responseOther }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                showError(data.error || "Save failed — please try again.");
                return;
            }

            const row = trackerRows.find((r) => r.id === id);
            if (row) {
                const today = rowDateFormat.format(new Date());
                if (data.changed) {
                    row.previousResponse = row.response;
                    row.changedAt = today;
                    row.changeCount = (row.changeCount || 0) + 1;
                }
                const wasAnswered = !!row.respondedAt;
                row.response = response;
                row.responseOther = responseOther;
                row.respondedAt = response ? (data.changed || !wasAnswered ? today : row.respondedAt) : null;
                row.responseSource = response ? "oversight" : null;
            }
            const modalEl = document.getElementById("itAnswerModal");
            if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();
            openCards.add(rootId);
            applyFilters();
        } catch (err) {
            console.error("[invitationTracker] set answer error:", err);
            showError("Network error — please try again.");
        } finally {
            if (saveBtn) saveBtn.disabled = false;
        }
    }

    document.getElementById("itAnswerSaveBtn")?.addEventListener("click", saveAnswer);

    // =========================================================
    // Edit Campaign (admins only)
    // =========================================================

    /**
     * The full campaign records the server embeds for the edit modal.
     *
     * @returns {Array<object>}
     */
    function getBatchesData() {
        return readJson("it-batches-data") || [];
    }

    /** @type {number|null} Campaign open in the edit modal. */
    let editingBatchId = null;

    /**
     * Open the edit modal filled in with a campaign's saved settings.
     *
     * @param {number} id - Campaign (batch) id.
     * @returns {void}
     */
    function openEditModal(id) {
        const batches = getBatchesData();
        const batch = batches.find((b) => b.id === id);
        if (!batch) return;
        editingBatchId = id;

        const nameEl = document.getElementById("itEditName");
        const subjectEl = document.getElementById("itEditSubject");
        const bodyEl = document.getElementById("itEditBody");
        const parentEl = document.getElementById("itEditParent");
        const parentHint = document.getElementById("itEditParentHint");
        const respEl = document.getElementById("itEditResponseNeeded");
        const activeEl = document.getElementById("itEditActive");
        const errorEl = document.getElementById("itEditError");
        const recruitEl = document.getElementById("itEditRecruitment");
        const msgTypeEl = document.getElementById("itEditMessageType");

        if (nameEl) nameEl.value = batch.name || "";
        if (subjectEl) subjectEl.value = batch.message_subject || "";
        if (bodyEl) bodyEl.value = batch.message_body || "";
        if (respEl) respEl.checked = batch.response_needed !== false;
        if (recruitEl) {
            recruitEl.checked = !!batch.is_recruitment;
            recruitEl.disabled = !(respEl?.checked ?? true);
        }
        if (activeEl) activeEl.checked = batch.active !== false;
        const respondByEl = /** @type {HTMLInputElement|null} */ (document.getElementById("itEditRespondBy"));
        if (respondByEl) respondByEl.value = batch.respond_by ? String(batch.respond_by).slice(0, 10) : "";
        if (msgTypeEl) msgTypeEl.value = batch.message_type || "invitation";
        errorEl?.classList.add("d-none");

        // Parent picker: hide this campaign and its own follow-ups (no cycles)
        if (parentEl) {
            const childIds = new Set(batches.filter((b) => b.parent_batch_id === id).map((b) => b.id));
            Array.from(parentEl.options).forEach((opt) => {
                const optId = Number(opt.value);
                opt.hidden = optId === id || childIds.has(optId);
            });
            parentEl.value = batch.parent_batch_id ? String(batch.parent_batch_id) : "";
            if (parentHint) {
                parentHint.textContent = childIds.size
                    ? `This campaign has ${plural(childIds.size, "follow-up")}. They cannot be selected as a parent.`
                    : "";
            }
        }

        const modalEl = document.getElementById("itEditCampaignModal");
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }

    // A recruitment campaign must ask for a response: keep Recruitment
    // disabled (and cleared) while "Response needed" is off.
    document.getElementById("itEditResponseNeeded")?.addEventListener("change", (e) => {
        const recruitEl = document.getElementById("itEditRecruitment");
        if (!recruitEl || !(e.target instanceof HTMLInputElement)) return;
        recruitEl.disabled = !e.target.checked;
        if (!e.target.checked) recruitEl.checked = false;
    });

    /**
     * Save the edit modal (PUT /oversight/tools/campaigns/batches/:id). The
     * campaign's saved message only affects future sends: each send keeps the
     * text it went out with. Reloads the page so cards, filters and families
     * reflect the change.
     *
     * @returns {Promise<void>}
     */
    async function saveEdit() {
        if (!editingBatchId) return;
        const errorEl = document.getElementById("itEditError");
        const saveBtn = document.getElementById("itEditSaveBtn");
        const val = (id) => /** @type {HTMLInputElement|null} */ (document.getElementById(id))?.value.trim() || "";
        const checked = (id) => /** @type {HTMLInputElement|null} */ (document.getElementById(id))?.checked ?? false;

        const name = val("itEditName");
        const messageBody = val("itEditBody");
        const showError = (msg) => {
            if (!errorEl) return;
            errorEl.textContent = msg;
            errorEl.classList.remove("d-none");
        };
        if (!name) return showError("Name is required.");
        if (!messageBody) return showError("Message body is required.");

        const responseNeeded = checked("itEditResponseNeeded");
        const restoreBtn = () => {
            if (!saveBtn) return;
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk me-1" aria-hidden="true"></i>Save changes';
        };
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Saving…';
        }
        errorEl?.classList.add("d-none");

        try {
            const res = await fetch(`/oversight/tools/campaigns/batches/${editingBatchId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrf() },
                body: JSON.stringify({
                    name,
                    messageSubject: val("itEditSubject") || null,
                    messageBody,
                    parentBatchId: Number(val("itEditParent")) || null,
                    responseNeeded,
                    active: checked("itEditActive"),
                    messageType: val("itEditMessageType") || "invitation",
                    isRecruitment: responseNeeded && checked("itEditRecruitment"),
                    respondBy: responseNeeded ? val("itEditRespondBy") : "",
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                showError(data.error || "Save failed — please try again.");
                restoreBtn();
                return;
            }
            window.location.reload();
        } catch (err) {
            console.error("[invitationTracker] edit campaign save error:", err);
            showError("Network error — please try again.");
            restoreBtn();
        }
    }

    document.getElementById("itEditSaveBtn")?.addEventListener("click", saveEdit);

    // =========================================================
    // Init
    // =========================================================

    // ?batchId=N (e.g. from Campaign Center's "View in Tracker") opens that
    // campaign on its sends.
    const initialFamily = familyOf(batchFilter?.value || "");
    if (initialFamily) openCards.add(initialFamily);

    applyFilters();
})();
