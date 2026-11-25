/**
 * @file conventionVenue.js
 * @description "Convention venue & time zone" card on System Variables
 * (/oversight/tools/system-variables). Shows the active convention year's
 * venue and time zone; convention admins (convention.manageDays) can set it
 * two ways:
 *  - "Set to convention city": city, state and ZIP are looked up through
 *    Google (POST /api/convention-venue/lookup) and the answer is shown for
 *    confirmation before saving;
 *  - a manual pick from the US time zones.
 * Saving is PUT /api/convention-venue. Built with DOM nodes (venue names are
 * data, never HTML).
 */

/** @type {HTMLElement|null} */
const root = document.getElementById("sv-venue-root");

/** @type {HTMLElement|null} */
const yearBadge = document.getElementById("sv-venue-year");

/**
 * The CSRF token from the page's meta tag.
 *
 * @returns {string}
 */
function csrf() {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";
}

/**
 * Create an element with classes and optional text.
 *
 * @param {string} tag
 * @param {string[]} [classes]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, classes = [], text) {
    const node = document.createElement(tag);
    if (classes.length) node.classList.add(...classes);
    if (text !== undefined) node.textContent = text;
    return node;
}

/**
 * A moment in the viewer's own time zone, with its abbreviation
 * ("Nov 25, 2026, 10:52 AM EST").
 *
 * @param {string|Date|null} value
 * @returns {string}
 */
function formatMoment(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", timeZoneName: "short",
    });
}

/**
 * Send JSON to the venue API.
 *
 * @param {string} url
 * @param {"POST"|"PUT"} method
 * @param {object} body
 * @returns {Promise<any>}  the parsed answer (success false on any failure)
 */
async function send(url, method, body) {
    try {
        const res = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok && data.success === undefined) data.success = false;
        if (!data.success && !data.error) data.error = `Request failed (${res.status}).`;
        return data;
    } catch {
        return { success: false, error: "Network error. Try again." };
    }
}

/**
 * Write a message into the card's status line.
 *
 * @param {HTMLElement} status
 * @param {string} msg
 * @param {"success"|"danger"|"secondary"} variant
 * @returns {void}
 */
function setStatus(status, msg, variant) {
    status.textContent = msg;
    status.className = `sv-venue-status small mt-2 text-${variant}`;
}

/**
 * The read-only summary: zone, venue and who set it.
 *
 * @param {any} data  GET/PUT /api/convention-venue answer
 * @returns {HTMLElement}
 */
function summary(data) {
    const box = el("dl", ["sv-venue-summary", "mb-0"]);
    const v = data.venue || {};

    box.append(el("dt", [], "Time zone"));
    const tzDd = el("dd", [], data.timeZoneLabel);
    tzDd.append(el("span", ["text-muted", "ms-1"], `· ${v.timeZone || ""}`));
    box.append(tzDd);

    box.append(el("dt", [], "Venue"));
    const place = [v.city, [v.state, v.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    box.append(el("dd", place ? [] : ["text-muted"], place || "Not set"));

    box.append(el("dt", [], "Set"));
    if (v.setAt) {
        const how = v.source === "city" ? "from the venue's city" : "picked from the list";
        box.append(el("dd", [], `${how}${v.setBy ? ` by ${v.setBy}` : ""}, ${formatMoment(v.setAt)}`));
    } else {
        box.append(el("dd", ["text-muted"], "Not set yet: using the default (Eastern Time)."));
    }
    return box;
}

/**
 * A labelled text input.
 *
 * @param {string} id
 * @param {string} label
 * @param {string} value
 * @param {{ maxLength?: number, autocomplete?: string, inputMode?: string, extra?: string[] }} [opts]
 * @returns {{ wrap: HTMLElement, input: HTMLInputElement }}
 */
function field(id, label, value, opts = {}) {
    const wrap = el("div", opts.extra || []);
    const lab = el("label", ["form-label", "small", "fw-semibold", "mb-1"], label);
    lab.htmlFor = id;
    const input = /** @type {HTMLInputElement} */ (el("input", ["form-control", "form-control-sm"]));
    input.id = id;
    input.type = "text";
    input.value = value || "";
    if (opts.maxLength) input.maxLength = opts.maxLength;
    if (opts.autocomplete) input.autocomplete = opts.autocomplete;
    if (opts.inputMode) input.inputMode = opts.inputMode;
    wrap.append(lab, input);
    return { wrap, input };
}

/**
 * Render the card from an API answer.
 *
 * @param {any} data
 * @returns {void}
 */
function render(data) {
    if (!root) return;
    if (yearBadge) yearBadge.textContent = String(data.year ?? "");
    root.replaceChildren(summary(data));

    if (!data.canEdit) {
        root.append(el("p", ["text-muted", "small", "mt-3", "mb-0"],
            "Only convention admins can change the venue and time zone."));
        return;
    }

    const v = data.venue || {};
    const form = el("div", ["sv-venue-form", "mt-3"]);

    // ── Set to convention city ──────────────────────────────────
    const cityBlock = el("fieldset", ["sv-venue-block"]);
    cityBlock.append(el("legend", ["sv-venue-legend"], "Set to convention city"));
    const row = el("div", ["sv-venue-fields"]);
    const city = field("sv-venue-city", "City", v.city, { maxLength: 100, autocomplete: "address-level2", extra: ["sv-venue-city"] });
    const state = field("sv-venue-state", "State", v.state, { maxLength: 50, autocomplete: "address-level1", extra: ["sv-venue-state"] });
    const zip = field("sv-venue-zip", "ZIP", v.zip, { maxLength: 10, autocomplete: "postal-code", inputMode: "numeric", extra: ["sv-venue-zip"] });
    row.append(city.wrap, state.wrap, zip.wrap);
    cityBlock.append(row);

    const lookupBtn = /** @type {HTMLButtonElement} */ (el("button", ["btn", "btn-sm", "btn-primary", "mt-2"], "Look up time zone"));
    lookupBtn.type = "button";
    lookupBtn.disabled = !data.lookupAvailable;
    cityBlock.append(lookupBtn);
    if (!data.lookupAvailable) {
        cityBlock.append(el("p", ["small", "text-muted", "mt-1", "mb-0"],
            "Looking up by city isn't set up on this server: it needs the Google server key (Key Vault GoogleServerApiKey in Azure, GOOGLE_SERVER_API_KEY in a local .env). Pick the zone below."));
    }
    const confirmBox = el("div", ["sv-venue-confirm", "d-none"]);
    cityBlock.append(confirmBox);
    form.append(cityBlock);

    // ── Manual pick ─────────────────────────────────────────────
    const manualBlock = el("fieldset", ["sv-venue-block"]);
    manualBlock.append(el("legend", ["sv-venue-legend"], "Or choose the time zone"));
    const selLabel = el("label", ["visually-hidden"], "Time zone");
    selLabel.htmlFor = "sv-venue-tz";
    const sel = /** @type {HTMLSelectElement} */ (el("select", ["form-select", "form-select-sm", "sv-venue-select"]));
    sel.id = "sv-venue-tz";
    for (const z of data.timeZones || []) {
        sel.append(new Option(`${z.label} — ${z.now}`, z.id, false, z.id === v.timeZone));
    }
    if (v.timeZone && !(data.timeZones || []).some((z) => z.id === v.timeZone)) {
        sel.append(new Option(`${v.timeZone} — ${data.timeZoneLabel}`, v.timeZone, false, true));
    }
    const manualBtn = /** @type {HTMLButtonElement} */ (el("button", ["btn", "btn-sm", "btn-outline-primary", "mt-2"], "Save this time zone"));
    manualBtn.type = "button";
    manualBlock.append(selLabel, sel, manualBtn);
    form.append(manualBlock);

    const status = el("div", ["sv-venue-status", "small", "mt-2"]);
    status.setAttribute("role", "status");
    form.append(status);
    root.append(form);

    /**
     * Save the venue fields with a zone.
     *
     * @param {string} timeZone
     * @param {"city"|"manual"} source
     * @returns {Promise<void>}
     */
    const save = async (timeZone, source) => {
        setStatus(status, "Saving…", "secondary");
        const result = await send("/api/convention-venue", "PUT", {
            city: city.input.value, state: state.input.value, zip: zip.input.value,
            timeZone, source,
        });
        if (!result.success) {
            setStatus(status, result.error, "danger");
            return;
        }
        render(result);
        const newStatus = root.querySelector(".sv-venue-status");
        if (newStatus) setStatus(/** @type {HTMLElement} */ (newStatus), "Saved. Every page, text and timer now uses this time zone.", "success");
    };

    lookupBtn.addEventListener("click", async () => {
        lookupBtn.disabled = true;
        confirmBox.classList.add("d-none");
        setStatus(status, "Looking up…", "secondary");
        const result = await send("/api/convention-venue/lookup", "POST", {
            city: city.input.value, state: state.input.value, zip: zip.input.value,
        });
        lookupBtn.disabled = false;
        if (!result.success) {
            setStatus(status, result.error, "danger");
            return;
        }
        setStatus(status, "", "secondary");
        const text = el("p", ["mb-2"]);
        text.append(
            el("strong", [], result.formattedAddress),
            document.createTextNode(" is in "),
            el("strong", [], result.timeZoneLabel),
            document.createTextNode(` (${result.timeZone}).`),
        );
        const useBtn = /** @type {HTMLButtonElement} */ (el("button", ["btn", "btn-sm", "btn-success"], "Use this time zone"));
        useBtn.type = "button";
        useBtn.addEventListener("click", () => save(result.timeZone, "city"));
        confirmBox.replaceChildren(text, useBtn);
        if (!result.inList) {
            confirmBox.append(el("p", ["small", "text-muted", "mt-1", "mb-0"],
                "This zone isn't one of the usual US zones; check it before saving."));
        }
        confirmBox.classList.remove("d-none");
    });

    manualBtn.addEventListener("click", () => save(sel.value, "manual"));
}

/**
 * Load the card.
 *
 * @returns {Promise<void>}
 */
async function load() {
    if (!root) return;
    try {
        const res = await fetch("/api/convention-venue");
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Failed to load.");
        render(data);
    } catch (err) {
        root.replaceChildren(el("p", ["text-danger", "small", "mb-0"],
            `Couldn't load the convention venue: ${err.message || err}`));
    }
}

load();
