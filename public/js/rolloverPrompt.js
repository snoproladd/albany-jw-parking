/**
 * @file public/js/rolloverPrompt.js
 * @description Behaviour for the "Has the next convention year begun?"
 * prompt (views/partials/rolloverPrompt.ejs), shown to ADMIN and
 * ASSISTANT_ADMIN on or after September 1 until the next year is started.
 *
 * Flow:
 *   1. Load context (years, the active year's dates, CSRF token) from
 *      GET /api/convention-year/rollover-context and open the modal.
 *   2. The admin clicks dates on a multi-select month calendar limited to
 *      the next year, and chooses what to bring forward.
 *   3. Continue → confirmation step, which lists each new date with the
 *      current-year day it will copy from (matched by days before the last
 *      convention day, the same rule the server uses).
 *   4. Start → POST /oversight/tools/start-year → summary of what was copied.
 *   "Not yet" → POST /api/convention-year/snooze and close.
 *
 * Loaded with `defer`, so Bootstrap's bundle has already run.
 */

(() => {
    "use strict";

    const modalEl = document.getElementById("rolloverModal");
    if (!modalEl || !window.bootstrap) return;

    const activeYear = Number(modalEl.dataset.activeYear);
    const nextYear = Number(modalEl.dataset.nextYear);

    const els = {
        error: document.getElementById("rolloverError"),
        currentDates: document.getElementById("rolloverCurrentDates"),
        monthTitle: document.getElementById("rolloverMonthTitle"),
        prevMonth: document.getElementById("rolloverPrevMonth"),
        nextMonth: document.getElementById("rolloverNextMonth"),
        grid: document.getElementById("rolloverDayGrid"),
        selected: document.getElementById("rolloverSelected"),
        noneSelected: document.getElementById("rolloverNoneSelected"),
        carryLocations: document.getElementById("rolloverCarryLocations"),
        carryStructure: document.getElementById("rolloverCarryStructure"),
        resetSigns: document.getElementById("rolloverResetSigns"),
        pickPanel: document.getElementById("rolloverPickPanel"),
        confirmPanel: document.getElementById("rolloverConfirmPanel"),
        confirmDays: document.getElementById("rolloverConfirmDays"),
        confirmCarry: document.getElementById("rolloverConfirmCarry"),
        donePanel: document.getElementById("rolloverDonePanel"),
        summary: document.getElementById("rolloverSummary"),
        reloadBtn: document.getElementById("rolloverReloadBtn"),
        footer: document.getElementById("rolloverFooter"),
        snoozeBtn: document.getElementById("rolloverSnoozeBtn"),
        backBtn: document.getElementById("rolloverBackBtn"),
        continueBtn: document.getElementById("rolloverContinueBtn"),
        startBtn: document.getElementById("rolloverStartBtn"),
    };

    const modal = new window.bootstrap.Modal(modalEl);

    const MONTHS = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
    const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    /** @type {Set<string>} Selected dates as "YYYY-MM-DD". */
    const selected = new Set();

    /** Month (0-11) currently shown in the calendar. */
    let viewMonth = 5;

    /** CSRF token returned by the context endpoint. */
    let csrfToken = "";

    /**
     * The active year's convention days, from the context endpoint.
     * @type {Array<{ date: string, label: string }>}
     */
    let sourceDays = [];

    // ============================================================
    // Date helpers (UTC throughout, so no time-zone day shifts)
    // ============================================================

    /**
     * @param {number} y
     * @param {number} m - 0-11
     * @param {number} d
     * @returns {string} "YYYY-MM-DD"
     */
    function iso(y, m, d) {
        return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }

    /**
     * Long label for a date, e.g. "Friday, July 2, 2027".
     *
     * @param {string} isoDate
     * @returns {string}
     */
    function longLabel(isoDate) {
        const [y, m, d] = isoDate.split("-").map(Number);
        return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
            timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric",
        });
    }

    /**
     * Short label for a date, e.g. "Fri, Jul 2".
     *
     * @param {string} isoDate
     * @returns {string}
     */
    function shortLabel(isoDate) {
        const [y, m, d] = isoDate.split("-").map(Number);
        return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
            timeZone: "UTC", weekday: "short", month: "short", day: "numeric",
        });
    }

    /**
     * Whole days from `a` to `b` (b - a), both "YYYY-MM-DD".
     *
     * @param {string} a
     * @param {string} b
     * @returns {number}
     */
    function daysBetween(a, b) {
        const toUtc = (s) => {
            const [y, m, d] = s.split("-").map(Number);
            return Date.UTC(y, m - 1, d);
        };
        return Math.round((toUtc(b) - toUtc(a)) / 86400000);
    }

    /**
     * Match each new date to the active-year day the same number of days
     * before the last convention day. Mirrors startConventionYear().
     *
     * @param {string[]} newDates - Sorted "YYYY-MM-DD".
     * @returns {Array<{ date: string, source: { date: string, label: string } | null }>}
     */
    function matchDays(newDates) {
        if (newDates.length === 0) return [];
        const newLast = newDates[newDates.length - 1];
        const oldLast = sourceDays.length
            ? sourceDays[sourceDays.length - 1].date
            : null;
        return newDates.map((date) => {
            const offset = daysBetween(date, newLast);
            const source = oldLast
                ? sourceDays.find((d) => daysBetween(d.date, oldLast) === offset) || null
                : null;
            return { date, source };
        });
    }

    // ============================================================
    // UI helpers
    // ============================================================

    /**
     * Show or clear the error alert.
     *
     * @param {string|null} message
     * @returns {void}
     */
    function showError(message) {
        els.error.textContent = message || "";
        els.error.classList.toggle("d-none", !message);
    }

    /**
     * Switch between the pick, confirm and done steps.
     *
     * @param {"pick"|"confirm"|"done"} step
     * @returns {void}
     */
    function showStep(step) {
        els.pickPanel.classList.toggle("d-none", step !== "pick");
        els.confirmPanel.classList.toggle("d-none", step !== "confirm");
        els.donePanel.classList.toggle("d-none", step !== "done");
        els.footer.classList.toggle("d-none", step === "done");
        els.snoozeBtn.classList.toggle("d-none", step !== "pick");
        els.continueBtn.classList.toggle("d-none", step !== "pick");
        els.backBtn.classList.toggle("d-none", step !== "confirm");
        els.startBtn.classList.toggle("d-none", step !== "confirm");
    }

    /**
     * POST JSON with the CSRF token; resolves to the parsed body.
     *
     * @param {string} url
     * @param {object} body
     * @returns {Promise<any>}
     */
    async function postJson(url, body) {
        const res = await fetch(url, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
            body: JSON.stringify(body),
        });
        let data = null;
        try {
            data = await res.json();
        } catch {
            data = null;
        }
        if (!res.ok || !data?.success) {
            throw new Error(data?.error || `Request failed (${res.status}).`);
        }
        return data;
    }

    // ============================================================
    // Calendar
    // ============================================================

    /**
     * Render the month grid for `viewMonth` of the next year.
     *
     * @returns {void}
     */
    function renderCalendar() {
        els.monthTitle.textContent = `${MONTHS[viewMonth]} ${nextYear}`;
        els.prevMonth.disabled = viewMonth === 0;
        els.nextMonth.disabled = viewMonth === 11;

        const frag = document.createDocumentFragment();

        for (const wd of WEEKDAYS_SHORT) {
            const head = document.createElement("span");
            head.className = "rollover-cal-wd";
            head.textContent = wd;
            head.setAttribute("aria-hidden", "true");
            frag.appendChild(head);
        }

        const firstWeekday = new Date(Date.UTC(nextYear, viewMonth, 1)).getUTCDay();
        const daysInMonth = new Date(Date.UTC(nextYear, viewMonth + 1, 0)).getUTCDate();

        for (let i = 0; i < firstWeekday; i++) {
            const pad = document.createElement("span");
            pad.className = "rollover-cal-pad";
            frag.appendChild(pad);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const key = iso(nextYear, viewMonth, d);
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "rollover-cal-day";
            btn.textContent = String(d);
            btn.dataset.date = key;
            btn.setAttribute("aria-label", longLabel(key));
            btn.setAttribute("aria-pressed", selected.has(key) ? "true" : "false");
            btn.classList.toggle("is-selected", selected.has(key));
            frag.appendChild(btn);
        }

        els.grid.replaceChildren(frag);
    }

    /**
     * Re-render the selected-dates list and the Continue button state.
     *
     * @returns {void}
     */
    function renderSelected() {
        const dates = [...selected].sort();
        els.selected.querySelectorAll(".rollover-chip-item").forEach((li) => li.remove());
        els.noneSelected.classList.toggle("d-none", dates.length > 0);

        for (const date of dates) {
            const li = document.createElement("li");
            li.className = "rollover-chip-item";

            const chip = document.createElement("span");
            chip.className = "rollover-chip";
            chip.textContent = shortLabel(date);

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "btn-close btn-close-sm rollover-chip-remove";
            remove.dataset.date = date;
            remove.setAttribute("aria-label", `Remove ${longLabel(date)}`);

            chip.appendChild(remove);
            li.appendChild(chip);
            els.selected.appendChild(li);
        }

        els.continueBtn.disabled = dates.length === 0;
    }

    /**
     * Toggle a date in the selection and refresh the UI.
     *
     * @param {string} date
     * @returns {void}
     */
    function toggleDate(date) {
        if (selected.has(date)) {
            selected.delete(date);
        } else {
            selected.add(date);
        }
        renderCalendar();
        renderSelected();
    }

    // ============================================================
    // Events
    // ============================================================

    els.grid.addEventListener("click", (e) => {
        const btn = e.target.closest(".rollover-cal-day");
        if (btn) toggleDate(btn.dataset.date);
    });

    els.selected.addEventListener("click", (e) => {
        const btn = e.target.closest(".rollover-chip-remove");
        if (btn) toggleDate(btn.dataset.date);
    });

    els.prevMonth.addEventListener("click", () => {
        if (viewMonth > 0) {
            viewMonth -= 1;
            renderCalendar();
        }
    });

    els.nextMonth.addEventListener("click", () => {
        if (viewMonth < 11) {
            viewMonth += 1;
            renderCalendar();
        }
    });

    /**
     * Fill the confirmation step: the carry-forward choices and one line
     * per new date showing what it will copy from.
     *
     * @returns {void}
     */
    function renderConfirm() {
        const carry = [];
        if (els.carryLocations.checked) carry.push("Locations & Tasks");
        if (els.carryStructure.checked) carry.push("session & shift structure");
        if (els.resetSigns.checked) carry.push("sign attachments reset to planned");
        els.confirmCarry.textContent = carry.length
            ? `Brought forward: ${carry.join(", ")}.`
            : "Nothing else is brought forward.";

        const withStructure = els.carryStructure.checked;
        const frag = document.createDocumentFragment();
        for (const { date, source } of matchDays([...selected].sort())) {
            const li = document.createElement("li");
            const day = document.createElement("strong");
            day.textContent = shortLabel(date);
            li.appendChild(day);

            const detail = document.createElement("span");
            detail.className = source ? "rollover-map-match" : "rollover-map-empty";
            if (source && withStructure) {
                detail.textContent = ` — copies "${source.label}" (${shortLabel(source.date)}, ${activeYear})`;
            } else if (source) {
                detail.textContent = ` — named "${source.label}", no sessions copied`;
            } else {
                detail.textContent = ` — no matching ${activeYear} day; created empty`;
            }
            li.appendChild(detail);
            frag.appendChild(li);
        }
        els.confirmDays.replaceChildren(frag);
    }

    /**
     * Fill the done step with what the server reports it did.
     *
     * @param {Record<string, any>} s - `summary` from the start-year response.
     * @returns {void}
     */
    function renderSummary(s) {
        const n = (v) => Number(v) || 0;
        const lines = [
            `${n(s.daysCreated)} convention day(s) created` +
                (n(s.daysAlreadyExisted) ? `, ${n(s.daysAlreadyExisted)} already existed` : ""),
            `${n(s.volunteersReset)} volunteer(s) marked inactive; ${n(s.volunteersSnapshotted)} ${activeYear} record(s) saved`,
        ];
        if (s.locationsSkipped) {
            lines.push(`Locations not copied — ${nextYear} already had locations`);
        } else if (n(s.locationsCopied)) {
            lines.push(`${n(s.locationsCopied)} location(s), ${n(s.subLocationsCopied)} sub-location(s), ${n(s.capacityRulesCopied)} capacity rule(s) copied`);
        }
        if (n(s.sessionsCopied) || n(s.shiftsCopied)) {
            lines.push(`${n(s.daysWithStructure)} day(s) received ${n(s.sessionsCopied)} session(s), ${n(s.shiftsCopied)} shift(s), ${n(s.assignmentsCopied)} assignment(s)`);
        }
        if (n(s.assignmentsSkipped)) {
            lines.push(`${n(s.assignmentsSkipped)} assignment(s) skipped — no matching ${nextYear} location`);
        }
        if (n(s.rendezvousCopied)) lines.push(`${n(s.rendezvousCopied)} rendezvous point(s) copied`);
        if (n(s.alertSchedulesCopied)) lines.push(`${n(s.alertSchedulesCopied)} shift alert schedule(s) copied with dates moved`);
        if (n(s.signsReset)) lines.push(`${n(s.signsReset)} sign attachment(s) reset to planned`);

        const frag = document.createDocumentFragment();
        for (const text of lines) {
            const li = document.createElement("li");
            li.textContent = text;
            frag.appendChild(li);
        }
        els.summary.replaceChildren(frag);
    }

    els.continueBtn.addEventListener("click", () => {
        showError(null);
        renderConfirm();
        showStep("confirm");
    });

    els.reloadBtn.addEventListener("click", () => window.location.reload());

    els.backBtn.addEventListener("click", () => showStep("pick"));

    els.snoozeBtn.addEventListener("click", async () => {
        els.snoozeBtn.disabled = true;
        try {
            await postJson("/api/convention-year/snooze", {});
            modal.hide();
        } catch (err) {
            showError(err.message);
        } finally {
            els.snoozeBtn.disabled = false;
        }
    });

    els.startBtn.addEventListener("click", async () => {
        els.startBtn.disabled = true;
        els.backBtn.disabled = true;
        showError(null);
        try {
            const data = await postJson("/oversight/tools/start-year", {
                year: nextYear,
                dates: [...selected].sort(),
                carryLocations: els.carryLocations.checked,
                carryStructure: els.carryStructure.checked,
                resetSigns: els.resetSigns.checked,
            });
            renderSummary(data.summary || {});
            showStep("done");
        } catch (err) {
            showStep("pick");
            showError(err.message);
        } finally {
            els.startBtn.disabled = false;
            els.backBtn.disabled = false;
        }
    });

    // ============================================================
    // Init
    // ============================================================

    /**
     * Load context, set the starting month, and open the modal.
     *
     * @returns {Promise<void>}
     */
    async function init() {
        try {
            const res = await fetch("/api/convention-year/rollover-context", {
                credentials: "same-origin",
                headers: { Accept: "application/json" },
            });
            const data = await res.json();
            if (!res.ok || !data?.success) return;

            csrfToken = data.csrfToken;
            sourceDays = Array.isArray(data.currentDates) ? data.currentDates : [];

            if (Array.isArray(data.currentDates) && data.currentDates.length > 0) {
                // Start on the month of this year's first convention day.
                viewMonth = Number(data.currentDates[0].date.slice(5, 7)) - 1;
                els.currentDates.textContent =
                    `${activeYear} dates: ` +
                    data.currentDates.map((d) => shortLabel(d.date)).join(", ");
            } else {
                els.currentDates.classList.add("d-none");
            }

            renderCalendar();
            renderSelected();
            showStep("pick");
            modal.show();
        } catch {
            // Context unavailable — leave the prompt closed; it returns on the next page.
        }
    }

    init();
})();
