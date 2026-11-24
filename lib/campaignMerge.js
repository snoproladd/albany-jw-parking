/**
 * @file campaignMerge.js
 * @description Fills in the merge fields ({firstName}, {link}, {shiftDay}, …)
 * of a Campaign Center message for one volunteer.
 *
 * Shared by the send route (each real message) and the preview route (the
 * Review step), so the preview is exactly what the volunteer receives.
 *
 * @module campaignMerge
 */

/**
 * The event details a message can mention. Any of them may be missing when
 * no event is linked; the fields then fill in as empty text.
 *
 * @typedef {Object} MergeContext
 * @property {Date|string|null} [convention_date]
 * @property {string|null} [day_label]
 * @property {Date|string|null} [shift_start]
 * @property {Date|string|null} [shift_end]
 * @property {string|null} [event_type_name]
 * @property {string|null} [shift_label]
 * @property {string|null} [location_names] - "A, B, C"
 * @property {number|null} [location_count]
 * @property {string|null} [location_address]
 * @property {string|null} [location_maps_url]
 */

/**
 * Format a TIME value (an epoch-anchored Date, as mssql returns TIME, or a
 * string) as "h:MM AM/PM".
 *
 * @param {Date|string|null|undefined} val
 * @returns {string}
 */
export function formatShiftTime(val) {
    if (!val) return "";
    const d = new Date(val);
    if (Number.isNaN(d.valueOf())) return String(val).slice(0, 5);
    const h = d.getUTCHours();
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    return `${h % 12 || 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
}

/**
 * The location text for {locationName}: one name, or "At one of: A, B".
 *
 * @param {MergeContext|null} ctx
 * @returns {string}
 */
function locationText(ctx) {
    const names = ctx?.location_names || "";
    if (!names) return "";
    return (ctx?.location_count || 0) > 1 ? `At one of: ${names}` : names;
}

/**
 * Replace every merge field in a message for one volunteer.
 *
 * @param {string} text - The message as written.
 * @param {{
 *   firstName?: string|null,
 *   lastName?: string|null,
 *   rsvpUrl: string,
 *   year: number|string,
 *   context?: MergeContext|null,
 * }} values
 * @returns {string}
 */
export function fillMergeFields(text, { firstName, lastName, rsvpUrl, year, context = null }) {
    const first = firstName || "";
    const last = lastName || "";
    const date = context?.convention_date
        ? new Date(context.convention_date).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
        })
        : "";

    /** @type {Record<string, string>} */
    const fields = {
        firstName: first,
        lastName: last,
        fullName: [first, last].filter(Boolean).join(" "),
        link: rsvpUrl,
        year: String(year ?? ""),
        shiftDate: date,
        shiftDay: context?.day_label || "",
        shiftStart: formatShiftTime(context?.shift_start),
        shiftEnd: formatShiftTime(context?.shift_end),
        shiftType: context?.event_type_name || "",
        shiftLabel: context?.shift_label || "",
        locationName: locationText(context),
        locationAddress: context?.location_address || "",
        locationMapsUrl: context?.location_maps_url || "",
    };

    return String(text || "").replace(/\{(\w+)\}/g, (match, key) =>
        Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : match,
    );
}
