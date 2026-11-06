/**
 * @file trackerPayload.js
 * @description Builds the compact JSON payload the Invitation Tracker page
 * embeds in its HTML, and escapes JSON so it can sit safely inside a
 * `<script type="application/json">` block.
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
        respondedAt: inv.responded_at ? formatDate(inv.responded_at) : null,
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
