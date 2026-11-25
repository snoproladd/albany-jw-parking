/**
 * @file lib/timeZoneLookup.js
 * @description "Set to convention city": find the time zone of a US venue
 * from its city, state and ZIP with Google's Geocoding API (place → map
 * point) and Time Zone API (map point → IANA zone name).
 *
 * Needs a server key with both APIs enabled: Key Vault GoogleServerApiKey in
 * production (read at startup), GOOGLE_SERVER_API_KEY in the local .env
 * (Key Vault is only read when NODE_ENV=production). The browser Maps key is
 * usually restricted to the site's pages and is refused for server calls.
 * Without a key the System Variables card offers only the manual pick.
 */

/** Give up on a Google call after this long. */
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Plain-language reason for a Google API status.
 *
 * @param {string} status        Google's "status" field
 * @param {string} [message]     Google's "error_message", if any
 * @returns {string}
 */
function describeGoogleStatus(status, message) {
    switch (status) {
        case "ZERO_RESULTS":
            return "Google couldn't find that place. Check the city, state and ZIP.";
        case "REQUEST_DENIED":
            return "Google refused the request. The server key needs the Geocoding API and the Time Zone API enabled"
                + (message ? ` (${message})` : ".");
        case "OVER_QUERY_LIMIT":
        case "OVER_DAILY_LIMIT":
            return "Google's usage limit for the key was reached. Try again later, or pick the time zone from the list.";
        case "INVALID_REQUEST":
            return "Google couldn't read the request. Check the city, state and ZIP.";
        default:
            return `Google answered "${status}"${message ? `: ${message}` : ""}.`;
    }
}

/**
 * GET a Google Maps Platform JSON endpoint, with a timeout.
 *
 * @param {string} url
 * @returns {Promise<any>}
 * @throws on a network error, a timeout or a non-JSON answer
 */
async function getJson(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

/**
 * Look up a US venue's time zone.
 *
 * @param {{
 *   city:    string,
 *   state:   string,
 *   zip:     string,
 *   apiKey:  string|null|undefined,
 *   now?:    Date,      for the Time Zone API's timestamp
 * }} venue
 * @returns {Promise<
 *   { ok: true, timeZone: string, formattedAddress: string, location: { lat: number, lng: number } } |
 *   { ok: false, error: string }
 * >}
 */
export async function lookupVenueTimeZone({ city, state, zip, apiKey, now = new Date() }) {
    if (!apiKey) {
        return { ok: false, error: "Looking up by city isn't set up on this server (no Google server key). Pick the time zone from the list." };
    }
    const address = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (!address.trim()) return { ok: false, error: "Enter the venue's city, state and ZIP." };

    try {
        const geo = await getJson(
            "https://maps.googleapis.com/maps/api/geocode/json"
            + `?address=${encodeURIComponent(address)}`
            + "&components=country:US"
            + `&key=${encodeURIComponent(apiKey)}`,
        );
        if (geo.status !== "OK" || !geo.results?.length) {
            return { ok: false, error: describeGoogleStatus(geo.status, geo.error_message) };
        }
        const { lat, lng } = geo.results[0].geometry.location;

        const tz = await getJson(
            "https://maps.googleapis.com/maps/api/timezone/json"
            + `?location=${lat},${lng}`
            + `&timestamp=${Math.floor(now.getTime() / 1000)}`
            + `&key=${encodeURIComponent(apiKey)}`,
        );
        if (tz.status !== "OK" || !tz.timeZoneId) {
            return { ok: false, error: describeGoogleStatus(tz.status, tz.errorMessage) };
        }
        return {
            ok: true,
            timeZone: tz.timeZoneId,
            formattedAddress: geo.results[0].formatted_address || address,
            location: { lat, lng },
        };
    } catch (err) {
        const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
        return {
            ok: false,
            error: timedOut
                ? "Google didn't answer in time. Try again, or pick the time zone from the list."
                : `Couldn't reach Google (${err?.message || "network error"}). Pick the time zone from the list.`,
        };
    }
}
