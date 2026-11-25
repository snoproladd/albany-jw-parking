/**
 * @file trackerPayload.js
 * @description Builds the compact JSON payloads the Invitation Tracker page
 * uses — the invitation rows and campaign list it embeds in its HTML, and the
 * send history it loads when a campaign card is opened — and escapes JSON so
 * it can sit safely inside a `<script type="application/json">` block.
 *
 * The tracker used to render one fully-marked-up table row per invitation on
 * the server (about 19 elements and 4 KB each). The page now ships the rows as
 * data and `public/js/invitationTracker.js` renders them in chunks, so only
 * the fields the page actually uses are sent, and dates are formatted here
 * once, in the server's time zone, exactly as the old template did.
 *
 * @module trackerPayload
 */

/**
 * One invitation as the Invitation Tracker page consumes it.
 *
 * Ids that the page compares against `<select>` values (`batchId`,
 * `familyRootId`, `dayId`) are strings, "" when absent, so the client can
 * compare them directly.
 *
 * @typedef {Object} TrackerRow
 * @property {number} id - Invitation id (used by revoke / reinstate).
 * @property {number} volunteerId - Volunteer id (stat-card de-duplication).
 * @property {string} name - "Last, First".
 * @property {string} gender - "male", "female" or "".
 * @property {boolean} revoked - True when the invitation is revoked.
 * @property {string} batchId - Campaign (batch) id, or "".
 * @property {string} familyRootId - Id of the top-level campaign in the family.
 * @property {string} dayId - Convention day id, or "".
 * @property {string|null} response - Raw response ("yes", "no", "maybe",
 *   "other", a poll answer) or null.
 * @property {string|null} responseOther - Free-text answer for "other".
 * @property {boolean} responseNeeded - Whether the campaign expects a reply.
 * @property {string} sentAt - Formatted send date, e.g. "Oct 3, 2026".
 * @property {string|null} sentAtIso - Send time as ISO 8601 (for sorting).
 * @property {string|null} respondedAt - Formatted response date, or null.
 * @property {string|null} remindedAt - Formatted last-reminder date, or null
 *   when no reminder has been sent.
 * @property {number} reminderCount - Number of reminders sent.
 * @property {string|null} lastRemindedChannel - "email", "sms", "both" or null.
 * @property {string} volStatus - Volunteer status, e.g. "completed".
 * @property {string} messageType - "invitation", "alert" or "followup".
 * @property {string|null} batchName - Campaign name.
 * @property {boolean} isFollowUp - True when the campaign has a parent.
 * @property {string|null} dayLabel - Convention day label.
 * @property {string|null} eventColor - Event type colour (CSS colour string).
 * @property {string|null} eventTypeName - Event type name.
 * @property {string|null} shiftLabel - Shift label.
 * @property {string|null} channel - "email", "sms", "both" or null.
 * @property {string|null} previousResponse - The answer before the latest
 *   change, or null when it never changed.
 * @property {string|null} changedAt - Formatted date of the latest change.
 * @property {number} changeCount - How many times the answer changed.
 * @property {string|null} responseSource - "link", "text" or "oversight".
 */

/**
 * Reduce the rows returned by `getInvitationsForTracker` to the compact
 * objects the tracker page renders.
 *
 * Dates are formatted with one shared `Intl.DateTimeFormat` (building a
 * formatter per call, as `toLocaleDateString` does, was the single most
 * expensive part of the old server-side render). The formatter is created per
 * call, not at import time, so it follows the process time zone at request
 * time just as `toLocaleDateString` did.
 *
 * @param {Array<Object>} invitations - Rows from `getInvitationsForTracker`.
 * @returns {TrackerRow[]}
 */
export function buildTrackerRows(invitations) {
    const dateFormat = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });

    /**
     * @param {string|number|Date|null|undefined} value
     * @returns {string}
     */
    const formatDate = (value) => {
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? "Invalid Date"
            : dateFormat.format(date);
    };

    return invitations.map((inv) => ({
        id: inv.id,
        volunteerId: inv.volunteer_id,
        name: `${inv.lastName}, ${inv.firstName}`,
        gender: inv.gender || "",
        revoked: !!inv.revoked,
        batchId: String(inv.batch_id || ""),
        familyRootId: String(inv.family_root_id || inv.batch_id || ""),
        dayId: String(inv.convention_day_id || ""),
        response: inv.response || null,
        responseOther: inv.response_other || null,
        responseNeeded: !!inv.response_needed,
        sentAt: formatDate(inv.sent_at),
        sentAtIso: toIso(inv.sent_at),
        respondedAt: inv.responded_at ? formatDate(inv.responded_at) : null,
        previousResponse: inv.response_changed_at ? inv.previous_response || null : null,
        changedAt: inv.response_changed_at ? formatDate(inv.response_changed_at) : null,
        changeCount: inv.response_change_count || 0,
        responseSource: inv.response_source || null,
        remindedAt:
            inv.last_reminded_at && inv.reminder_count > 0
                ? formatDate(inv.last_reminded_at)
                : null,
        reminderCount: inv.reminder_count || 0,
        lastRemindedChannel: inv.last_reminded_channel || null,
        volStatus: inv.volunteer_status || "",
        messageType: inv.batch_message_type || "invitation",
        batchName: inv.batch_name || null,
        isFollowUp: !!inv.parent_batch_id,
        dayLabel: inv.day_label || null,
        eventColor: inv.event_type_color || null,
        eventTypeName: inv.event_type_name || null,
        shiftLabel: inv.shift_label || null,
        channel: inv.channel || null,
    }));
}

/**
 * A date as an ISO 8601 string, or null when missing or invalid.
 *
 * @param {string|number|Date|null|undefined} value
 * @returns {string|null}
 */
function toIso(value) {
    if (value == null) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * One campaign (invitation batch) as the tracker's campaign cards use it.
 * Ids are strings so the client can compare them with row and `<select>`
 * values directly.
 *
 * @typedef {Object} TrackerCampaign
 * @property {string} id
 * @property {string} parentId - Parent campaign id, or "" for a top-level one.
 * @property {string} name
 * @property {string} messageType - "invitation", "alert" or "followup".
 * @property {boolean} responseNeeded
 * @property {boolean} isRecruitment
 * @property {string} dayId - Convention day id, or "".
 * @property {string|null} dayLabel
 * @property {string|null} shiftLabel
 * @property {string|null} eventTypeName
 * @property {string|null} createdAtIso
 * @property {number} sendCount - Sends in the whole family (top-level only).
 * @property {string|null} lastSentAtIso - Latest send in the family.
 * @property {{ choices: Array<{ value: string, label: string }>, allowOther: boolean }|null} answers
 *   The campaign's answers (lib/rsvp.js answerChoices), for Set answer;
 *   null when the caller didn't add them.
 */

/**
 * Reduce `getInvitationBatches` rows to the campaign list the tracker's
 * cards use, adding each family's send count and latest send.
 *
 * @param {Array<Object>} batches - Rows from `getInvitationBatches`, each
 *   optionally with `answers` (lib/rsvp.js answerChoices) added.
 * @param {Map<number, { sendCount: number, lastSentAt: Date|null }>} summaries
 *   From `getCampaignSendSummaries`, keyed by top-level campaign id.
 * @returns {TrackerCampaign[]}
 */
export function buildTrackerCampaigns(batches, summaries) {
    return batches.map((b) => {
        const summary = b.parent_batch_id ? null : summaries.get(b.id);
        return {
            id: String(b.id),
            parentId: String(b.parent_batch_id || ""),
            name: b.name || "",
            messageType: b.message_type || "invitation",
            responseNeeded: b.response_needed !== false && b.response_needed !== 0,
            isRecruitment: !!b.is_recruitment,
            dayId: String(b.convention_day_id || ""),
            dayLabel: b.day_label || null,
            shiftLabel: b.shift_label || null,
            eventTypeName: b.event_type_name || null,
            createdAtIso: toIso(b.created_at),
            sendCount: summary?.sendCount || 0,
            lastSentAtIso: toIso(summary?.lastSentAt),
            answers: b.answers || null,
        };
    });
}

/**
 * One send of a campaign family, as the tracker's send list shows it.
 *
 * @typedef {Object} TrackerSend
 * @property {number} id
 * @property {string} batchId
 * @property {string} batchName
 * @property {boolean} isFollowUp - Sent by a follow-up campaign.
 * @property {string} kind - "original", "added" or "reminder".
 * @property {string|null} subject
 * @property {string|null} body - The message as written (merge fields not
 *   filled in); for backfilled sends, the campaign's saved message.
 * @property {string|null} channels - "email", "sms" or "both".
 * @property {string|null} sentBy
 * @property {string|null} sentAtIso
 * @property {boolean} isBackfill - Rebuilt from invitations sent before send
 *   history was recorded.
 * @property {{ recipients: number, sent: number, skipped: number, errors: number }} counts
 * @property {Array<{
 *   volunteerId: number|null,
 *   invitationId: number|null,
 *   name: string,
 *   channel: string|null,
 *   outcome: string,
 *   reason: string|null,
 *   email: string|null,
 *   sms: string|null,
 *   smsError: number|null,
 *   smsErrorText: string|null
 * }>} recipients - email / sms: delivery status of that channel, or null
 *   when nothing was recorded for it. smsErrorText: plain-language reason a
 *   text failed.
 */

/**
 * Shape `getCampaignFamilySends` results for the tracker page.
 *
 * @param {Array<Object>} sends - From `getCampaignFamilySends`.
 * @param {(code: number|null) => string} [describeError] - Turns a Twilio
 *   error code into a plain reason (lib/messaging.js describeSmsError).
 * @returns {TrackerSend[]}
 */
export function buildTrackerSends(sends, describeError) {
    return sends.map((s) => ({
        id: s.id,
        batchId: String(s.batch_id),
        batchName: s.batch_name || "",
        isFollowUp: !!s.is_follow_up,
        kind: s.kind,
        subject: s.message_subject || null,
        body: s.message_body || null,
        channels: s.channels || null,
        sentBy: s.sent_by || null,
        sentAtIso: toIso(s.sent_at),
        isBackfill: !!s.is_backfill,
        counts: {
            recipients: s.recipient_count || 0,
            sent: s.sent_count || 0,
            skipped: s.skipped_count || 0,
            errors: s.error_count || 0,
        },
        recipients: (s.recipients || []).map((r) => {
            const email = r.deliveries.find((d) => d.channel === "email");
            const sms = r.deliveries.find((d) => d.channel === "sms");
            return {
                volunteerId: r.volunteer_id ?? null,
                invitationId: r.invitation_id ?? null,
                name: r.recipient_name || "",
                channel: r.channel || null,
                outcome: r.outcome,
                reason: r.reason || null,
                email: email?.status || null,
                sms: sms?.status || null,
                smsError: sms?.error_code ?? null,
                smsErrorText:
                    sms && (sms.status === "failed" || sms.status === "undelivered") && describeError
                        ? describeError(sms.error_code ?? null)
                        : null,
            };
        }),
    }));
}

/**
 * Serialise a value as JSON that is safe to print, unescaped, inside a
 * `<script type="application/json">` element.
 *
 * `JSON.stringify` alone is not enough: a string containing `</script>` (for
 * example a campaign message body) would end the block early. Escaping `<`,
 * `>` and `&` as unicode escapes keeps the JSON equivalent while making that
 * impossible; U+2028 / U+2029 are escaped as well for older parsers.
 *
 * @param {*} value - Any JSON-serialisable value.
 * @returns {string} JSON text; "null" when the value cannot be serialised.
 */
export function jsonForScript(value) {
    return (JSON.stringify(value) ?? "null")
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026")
        .replace(new RegExp("\\u2028", "g"), "\\u2028")
        .replace(new RegExp("\\u2029", "g"), "\\u2029");
}
