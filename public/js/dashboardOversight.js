/**
 * @file dashboardOversight.js
 * @description Dashboard oversight widgets for OVERSEER+ users.
 *
 * Renders three frosted-glass cards injected by index.ejs:
 *
 *   1. Notes Report glimpse (#dbNotesInsightBody)
 *      Fetches: GET /api/notes-report/volunteers
 *               GET /api/notes-report/actions
 *               GET /api/notes-report/sms-messages
 *      Derives: total, unread-by-me, pending actions, pending SMS
 *
 *   2. Conflict Analysis glimpse (#dbViolationsInsightBody)
 *      Fetches: GET /api/schedule/violations
 *      Derives: unacknowledged count, per-severity breakdown
 *
 *   3. Reports chart carousel (#dbReportsInsightBody)
 *      Three slides (lazy fetch + local cache):
 *        Slide 0 — Slot Fill Rate       /api/reports/scheduling-coverage
 *        Slide 1 — Crew Attendance      /api/reports/attendance-overview
 *        Slide 2 — Staff Usage          /api/reports/crew-staffing
 *
 * All endpoints already exist; no new SQL or server routes are needed.
 * Chart.js is loaded from the same CDN import used by reportsCharts.js.
 *
 * The logged-in user's volunteer ID is read from the #db-oversight-meta
 * JSON script block embedded by index.ejs.
 *
 * @module dashboardOversight
 */

import {
    Chart,
    registerables,
} from "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/+esm";

Chart.register(...registerables);

// ── Chart.js defaults (mirrors reportsCharts.js) ───────────────────────────

Chart.defaults.font.family = "'Archivo', system-ui, sans-serif";
Chart.defaults.font.size   = 12;
Chart.defaults.color       = "#6b7280";
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.padding  = 14;

// ── Color palette (mirrors reportsCharts.js) ───────────────────────────────

/** @type {Record<string, string>} */
const C = {
    blue:      "#1e3a8a",
    blueMid:   "#2563eb",
    blueBg:    "rgba(37, 99, 235, 0.15)",
    green:     "#166534",
    greenMid:  "#16a34a",
    greenBg:   "rgba(22, 163, 74, 0.15)",
    amber:     "#92400e",
    amberMid:  "#d97706",
    amberBg:   "rgba(217, 119, 6, 0.15)",
    red:       "#991b1b",
    redMid:    "#dc2626",
    redBg:     "rgba(220, 38, 38, 0.15)",
    teal:      "#0e7490",
    tealMid:   "#0891b2",
    tealBg:    "rgba(8, 145, 178, 0.15)",
    gray:      "#6b7280",
    grayBg:    "rgba(107, 114, 128, 0.15)",
};

// ── Shared utilities ───────────────────────────────────────────────────────

/**
 * Returns the current four-digit year.
 * @returns {number}
 */
function currentYear() {
    return new Date().getFullYear();
}

/**
 * Fetch a JSON endpoint; throws if the response is not 2xx.
 * @param {string} url
 * @returns {Promise<object>}
 */
async function fetchJson(url) {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
    return res.json();
}

/**
 * Format an ISO 8601 datetime string as a short US date (e.g. "Jun 15, 2026").
 * @param {string | null | undefined} iso
 * @returns {string}
 */
function fmtDate(iso) {
    if (!iso) return "Never";
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day:   "numeric",
        year:  "numeric",
    });
}

/**
 * Replace an element's innerHTML.
 * @param {HTMLElement} el
 * @param {string}      html
 * @returns {void}
 */
function setContent(el, html) {
    el.innerHTML = html;
}

/**
 * Build a row of stat blocks separated by vertical dividers.
 *
 * @param {Array<{
 *   num:     number,
 *   label:   string,
 *   warn?:   boolean,
 *   danger?: boolean,
 * }>} stats
 * @returns {string}
 */
function buildStatRow(stats) {
    const blocks = stats.map(({ num, label, warn = false, danger = false }, i) => {
        const numCls = danger
            ? "db-stat-num db-stat-num--danger"
            : warn
                ? "db-stat-num db-stat-num--warn"
                : "db-stat-num";

        const divider = i < stats.length - 1
            ? '<div class="db-stat-divider" aria-hidden="true"></div>'
            : "";

        return `<div class="db-stat-block">
                    <span class="${numCls}">${num}</span>
                    <span class="db-stat-lbl">${label}</span>
                </div>${divider}`;
    });

    return `<div class="db-insight-stats">${blocks.join("")}</div>`;
}

/**
 * Build a row of colored severity pills for unacknowledged violations.
 * Omits pills with a count of zero.
 *
 * @param {{ critical: number, high: number, medium: number, low: number, info: number }} bySeverity
 * @returns {string}
 */
function buildSeverityStrip(bySeverity) {
    /** @type {Array<{ key: string, label: string, cls: string }>} */
    const defs = [
        { key: "critical", label: "Critical", cls: "db-sev--critical" },
        { key: "high",     label: "High",     cls: "db-sev--high"     },
        { key: "medium",   label: "Medium",   cls: "db-sev--medium"   },
        { key: "low",      label: "Low",      cls: "db-sev--low"      },
        { key: "info",     label: "Info",     cls: "db-sev--info"     },
    ];

    const pills = defs
        .filter(({ key }) => bySeverity[key] > 0)
        .map(({ key, label, cls }) =>
            `<span class="db-sev-pill ${cls}">${bySeverity[key]} ${label}</span>`,
        )
        .join("");

    return pills
        ? `<div class="db-insight-sev-strip" aria-label="Unacknowledged violations by severity">${pills}</div>`
        : "";
}

/**
 * Standard error HTML shown when any fetch fails.
 * @returns {string}
 */
function errorHtml() {
    return `<div class="db-insight-error">
                <i class="fa-solid fa-triangle-exclamation me-1" aria-hidden="true"></i>
                Failed to load — refresh to retry.
            </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// Card 1 — Notes Report glimpse
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch and render the Notes Report summary card.
 * Derives all stats from three existing endpoints without any new SQL.
 *
 * @param {number} userId - The logged-in volunteer's DB ID (for "unread by me").
 * @returns {Promise<void>}
 */
async function initNotesCard(userId) {
    const el = document.getElementById("dbNotesInsightBody");
    if (!el) return;

    try {
        const [notesData, actionsData, smsData] = await Promise.all([
            fetchJson("/api/notes-report/volunteers"),
            fetchJson("/api/notes-report/actions"),
            fetchJson("/api/notes-report/sms-messages"),
        ]);

        const volunteers = notesData.volunteers   || [];
        const actions    = actionsData.actions     || [];
        const messages   = smsData.messages        || [];

        const total          = volunteers.length;
        const unreadByMe     = volunteers.filter(
            (v) => !v.reads.some((r) => r.read_by === userId),
        ).length;
        const pendingActions = actions.filter((a) => !a.completed).length;
        const pendingSms     = messages.length;

        const statRow = buildStatRow([
            { num: total,          label: "Total Notes"      },
            { num: unreadByMe,     label: "Unread by Me",    warn: unreadByMe > 0     },
            { num: pendingActions, label: "Pending Actions", warn: pendingActions > 0 },
        ]);

        const smsBadge = pendingSms > 0
            ? `<div class="db-insight-sub-badge db-insight-sub-badge--sms">
                   <i class="fa-solid fa-message me-1" aria-hidden="true"></i>
                   ${pendingSms} inbound SMS awaiting review
               </div>`
            : "";

        const emptyMsg = total === 0
            ? `<p class="db-insight-empty-msg mb-0">No active intake notes.</p>`
            : "";

        setContent(el, `${statRow}${smsBadge}${emptyMsg}`);
    } catch (err) {
        console.error("[dashboardOversight] notes card:", err);
        setContent(el, errorHtml());
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// Card 2 — Conflict Analysis glimpse
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Compute per-severity counts from an arbitrary violations array.
 * Extracted as a helper so both "all" and "unacknowledged" breakdowns
 * can be derived from the same violations payload without repeating logic.
 *
 * @param {Array<{ severity: string | null }>} list
 * @returns {{ critical: number, high: number, medium: number, low: number, info: number }}
 */
function countBySeverity(list) {
    return {
        critical: list.filter((v) => v.severity === "critical").length,
        high:     list.filter((v) => v.severity === "high").length,
        medium:   list.filter((v) => v.severity === "medium").length,
        low:      list.filter((v) => v.severity === "low").length,
        info:     list.filter((v) => v.severity === "info").length,
    };
}

/**
 * Fetch and render the Conflict Analysis summary card.
 *
 * Removes the stored total-violation count (which mismatches the severity
 * breakdown when violations have been acknowledged) and replaces it with a
 * toggle between all-violation and unacknowledged-only severity breakdowns.
 *
 * @returns {Promise<void>}
 */
async function initViolationsCard() {
    const el = document.getElementById("dbViolationsInsightBody");
    if (!el) return;

    try {
        const data       = await fetchJson("/api/schedule/violations");
        const run        = data.run        ?? null;
        const violations = data.violations ?? [];

        if (!run) {
            setContent(el, `
                <div class="db-insight-empty">
                    <i class="fa-solid fa-circle-question fa-lg text-muted mb-2 d-block"
                       aria-hidden="true"></i>
                    <p class="text-muted small mb-0">No analysis has been run yet.</p>
                    <p class="text-muted small mb-0">Open the scheduler to trigger one.</p>
                </div>`);
            return;
        }

        // Derive counts for both all violations and unacknowledged only
        const unacked      = violations.filter((v) => !v.acknowledged);
        const allBySev     = countBySeverity(violations);
        const unackedBySev = countBySeverity(unacked);

        const hasUrgent = (unackedBySev.critical + unackedBySev.high) > 0;

        // Stat row: just the unacknowledged count — total is misleading
        // because run.violation_count includes already-acknowledged violations
        // that don't appear in the severity pills
        const statRow = buildStatRow([{
            num:    unacked.length,
            label:  "Unacknowledged",
            danger: hasUrgent && unacked.length > 0,
            warn:   !hasUrgent && unacked.length > 0,
        }]);

        setContent(el, `
            <div class="db-insight-run-meta">
                <i class="fa-regular fa-clock me-1 text-muted" aria-hidden="true"></i>
                Last run: <strong>${fmtDate(run.triggered_at)}</strong>
            </div>
            ${statRow}
            <div class="db-sev-section">
                <div class="db-sev-mode-group" role="group" aria-label="Severity filter">
                    <button type="button"
                            class="db-sev-mode-btn db-sev-mode-btn--active"
                            data-mode="all">All</button>
                    <button type="button"
                            class="db-sev-mode-btn"
                            data-mode="unacked">Unacked</button>
                </div>
                <div class="db-insight-sev-strip" id="dbViolSevStrip"></div>
            </div>`);

        // Populate the strip and wire toggle buttons
        const strip   = /** @type {HTMLElement} */ (el.querySelector("#dbViolSevStrip"));
        const buttons = el.querySelectorAll(".db-sev-mode-btn");

        /**
         * Re-render severity pills for the selected mode.
         * @param {"all" | "unacked"} mode
         * @returns {void}
         */
        function renderSevPills(mode) {
            strip.innerHTML = buildSeverityStrip(mode === "unacked" ? unackedBySev : allBySev);
        }

        renderSevPills("all");

        buttons.forEach((btn) => {
            btn.addEventListener("click", () => {
                buttons.forEach((b) => b.classList.remove("db-sev-mode-btn--active"));
                btn.classList.add("db-sev-mode-btn--active");
                renderSevPills(/** @type {"all" | "unacked"} */ (btn.dataset.mode));
            });
        });

    } catch (err) {
        console.error("[dashboardOversight] violations card:", err);
        setContent(el, errorHtml());
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// Card 3 — Reports chart carousel
// ══════════════════════════════════════════════════════════════════════════════

/** @type {Chart | null} Current Chart.js instance; destroyed before each redraw. */
let activeChart = null;

/**
 * Per-slide fetched data cache. Index matches SLIDES array.
 * @type {Array<object | null>}
 */
const slideCache = [null, null, null];

/** @type {number} Zero-based index of the currently displayed slide. */
let currentSlide = 0;

/**
 * Render the slot-fill-rate grouped bar chart.
 * Data shape: { days: [{ day_label, total_needed, total_assigned }] }
 *
 * @param {object} data - Response from /api/reports/scheduling-coverage.
 * @param {HTMLCanvasElement} canvas
 * @returns {void}
 */
function renderSlotFillChart(data, canvas) {
    if (activeChart) { activeChart.destroy(); activeChart = null; }
    activeChart = new Chart(canvas, {
        type: "bar",
        data: {
            labels:   data.days.map((d) => d.day_label),
            datasets: [
                {
                    label:           "Slots needed",
                    data:            data.days.map((d) => d.total_needed),
                    backgroundColor: C.blueBg,
                    borderColor:     C.blueMid,
                    borderWidth:     1,
                    borderRadius:    4,
                },
                {
                    label:           "Slots assigned",
                    data:            data.days.map((d) => d.total_assigned),
                    backgroundColor: C.blueMid,
                    borderColor:     C.blueMid,
                    borderWidth:     0,
                    borderRadius:    4,
                },
            ],
        },
        options: {
            responsive:          true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks:       { precision: 0 },
                },
            },
            plugins: {
                legend: { position: "bottom" },
                tooltip: {
                    callbacks: {
                        afterBody: (items) => {
                            const day = data.days[items[0].dataIndex];
                            const pct = day.total_needed > 0
                                ? Math.round((day.total_assigned / day.total_needed) * 100)
                                : 0;
                            return [`Fill rate: ${pct}%`];
                        },
                    },
                },
            },
        },
    });
}

/**
 * Render the crew attendance stacked bar chart.
 * Data shape: { days: [{ day_label, total_invited, total_attended, total_no_show }] }
 *
 * @param {object} data - Response from /api/reports/attendance-overview.
 * @param {HTMLCanvasElement} canvas
 * @returns {void}
 */
function renderCrewAttendanceChart(data, canvas) {
    if (activeChart) { activeChart.destroy(); activeChart = null; }
    activeChart = new Chart(canvas, {
        type: "bar",
        data: {
            labels:   data.days.map((d) => d.day_label),
            datasets: [
                {
                    label:           "Attended",
                    data:            data.days.map((d) => d.total_attended),
                    backgroundColor: C.greenMid,
                    borderColor:     C.greenMid,
                    borderWidth:     0,
                    borderRadius:    4,
                },
                {
                    label:           "No-show",
                    data:            data.days.map((d) => d.total_no_show),
                    backgroundColor: C.redMid,
                    borderColor:     C.redMid,
                    borderWidth:     0,
                    borderRadius:    4,
                },
            ],
        },
        options: {
            responsive:          true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true },
                y: {
                    stacked:     true,
                    beginAtZero: true,
                    ticks:       { precision: 0 },
                },
            },
            plugins: {
                legend: { position: "bottom" },
                tooltip: {
                    callbacks: {
                        afterBody: (items) => {
                            const day = data.days[items[0].dataIndex];
                            const pct = day.total_invited > 0
                                ? Math.round((day.total_attended / day.total_invited) * 100)
                                : 0;
                            return [`Attendance rate: ${pct}%`];
                        },
                    },
                },
            },
        },
    });
}

/**
 * Render the staff-usage horizontal bar chart.
 * Data shape: { crews: [{ label, roster_count, scheduled_count }] }
 *
 * @param {object} data - Response from /api/reports/crew-staffing.
 * @param {HTMLCanvasElement} canvas
 * @returns {void}
 */
function renderStaffUsageChart(data, canvas) {
    if (activeChart) { activeChart.destroy(); activeChart = null; }
    activeChart = new Chart(canvas, {
        type: "bar",
        data: {
            labels:   data.crews.map((c) => c.label),
            datasets: [
                {
                    label:           "On roster",
                    data:            data.crews.map((c) => c.roster_count),
                    backgroundColor: C.tealBg,
                    borderColor:     C.tealMid,
                    borderWidth:     1,
                    borderRadius:    4,
                },
                {
                    label:           "Appeared in a shift",
                    data:            data.crews.map((c) => c.scheduled_count),
                    backgroundColor: C.tealMid,
                    borderColor:     C.tealMid,
                    borderWidth:     0,
                    borderRadius:    4,
                },
            ],
        },
        options: {
            indexAxis:           "y",
            responsive:          true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    beginAtZero: true,
                    ticks:       { precision: 0 },
                },
            },
            plugins: { legend: { position: "bottom" } },
        },
    });
}

/**
 * @typedef {{
 *   title:  string,
 *   icon:   string,
 *   url:    string,
 *   render: (data: object, canvas: HTMLCanvasElement) => void,
 * }} SlideDefinition
 */

/**
 * Ordered slide definitions for the reports carousel.
 * Each slide has a title, a Font Awesome icon class, the API URL to fetch,
 * and a render function that draws onto the shared canvas.
 *
 * @type {SlideDefinition[]}
 */
const SLIDES = [
    {
        title:  "Slot Fill Rate",
        icon:   "fa-bars-progress",
        url:    `/api/reports/scheduling-coverage?year=${currentYear()}`,
        render: renderSlotFillChart,
    },
    {
        title:  "Crew Attendance",
        icon:   "fa-user-check",
        url:    `/api/reports/attendance-overview?year=${currentYear()}`,
        render: renderCrewAttendanceChart,
    },
    {
        title:  "Staff Usage",
        icon:   "fa-layer-group",
        url:    `/api/reports/crew-staffing?year=${currentYear()}`,
        render: renderStaffUsageChart,
    },
];

/**
 * Update the carousel header label and prev/next button disabled states.
 *
 * @param {HTMLElement}       labelEl
 * @param {HTMLButtonElement} prevBtn
 * @param {HTMLButtonElement} nextBtn
 * @returns {void}
 */
function updateCarouselNav(labelEl, prevBtn, nextBtn) {
    const slide = SLIDES[currentSlide];
    labelEl.innerHTML = `
        <i class="fa-solid ${slide.icon} me-1" aria-hidden="true"></i>
        ${slide.title}
        <span class="db-carousel-counter">${currentSlide + 1}&thinsp;/&thinsp;${SLIDES.length}</span>`;
    prevBtn.disabled = currentSlide === 0;
    nextBtn.disabled = currentSlide === SLIDES.length - 1;
}

/**
 * Show the loading spinner and hide the chart canvas and error.
 *
 * @param {HTMLElement} loadingEl
 * @param {HTMLElement} wrapEl
 * @param {HTMLElement} errorEl
 * @returns {void}
 */
function showCarouselLoading(loadingEl, wrapEl, errorEl) {
    loadingEl.classList.remove("d-none");
    wrapEl.classList.add("d-none");
    errorEl.classList.add("d-none");
    errorEl.textContent = "";
}

/**
 * Show the chart canvas and hide the spinner and error.
 *
 * @param {HTMLElement} loadingEl
 * @param {HTMLElement} wrapEl
 * @param {HTMLElement} errorEl
 * @returns {void}
 */
function showCarouselChart(loadingEl, wrapEl, errorEl) {
    loadingEl.classList.add("d-none");
    wrapEl.classList.remove("d-none");
    errorEl.classList.add("d-none");
    errorEl.textContent = "";
}

/**
 * Show an error message and hide the spinner and chart.
 *
 * @param {HTMLElement} loadingEl
 * @param {HTMLElement} wrapEl
 * @param {HTMLElement} errorEl
 * @param {string}      message
 * @returns {void}
 */
function showCarouselError(loadingEl, wrapEl, errorEl, message) {
    loadingEl.classList.add("d-none");
    wrapEl.classList.add("d-none");
    errorEl.classList.remove("d-none");
    errorEl.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation me-1" aria-hidden="true"></i>${message}`;
}

/**
 * Navigate to the given slide index: fetch (or use cache), then render.
 *
 * @param {number}            index
 * @param {HTMLElement}       loadingEl
 * @param {HTMLElement}       wrapEl
 * @param {HTMLElement}       errorEl
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement}       labelEl
 * @param {HTMLButtonElement} prevBtn
 * @param {HTMLButtonElement} nextBtn
 * @returns {Promise<void>}
 */
async function navigateToSlide(index, loadingEl, wrapEl, errorEl, canvas, labelEl, prevBtn, nextBtn) {
    currentSlide = index;
    updateCarouselNav(labelEl, prevBtn, nextBtn);
    showCarouselLoading(loadingEl, wrapEl, errorEl);

    const slide = SLIDES[currentSlide];

    try {
        // Serve from cache if available — no redundant network calls
        if (!slideCache[currentSlide]) {
            slideCache[currentSlide] = await fetchJson(slide.url);
        }
        slide.render(slideCache[currentSlide], canvas);
        showCarouselChart(loadingEl, wrapEl, errorEl);
    } catch (err) {
        console.error(`[dashboardOversight] slide ${currentSlide} (${slide.title}):`, err);
        showCarouselError(loadingEl, wrapEl, errorEl, `Could not load ${slide.title} data.`);
    }
}

/**
 * Initialize the Reports chart carousel: wire up prev/next buttons and
 * load the first slide.
 *
 * @returns {Promise<void>}
 */
async function initReportsCarousel() {
    const navEl     = document.getElementById("dbReportsCarouselNav");
    const labelEl   = document.getElementById("dbReportsSlideLabel");
    const prevBtn   = /** @type {HTMLButtonElement|null} */ (document.getElementById("dbReportsPrev"));
    const nextBtn   = /** @type {HTMLButtonElement|null} */ (document.getElementById("dbReportsNext"));
    const loadingEl = document.getElementById("dbReportsLoading");
    const wrapEl    = document.getElementById("dbReportsChartWrap");
    const errorEl   = document.getElementById("dbReportsError");
    const canvas    = /** @type {HTMLCanvasElement|null} */ (document.getElementById("dbReportsCanvas"));

    if (!navEl || !labelEl || !prevBtn || !nextBtn || !loadingEl || !wrapEl || !errorEl || !canvas) return;

    // Reveal nav controls now that the DOM is confirmed ready
    navEl.classList.remove("d-none");

    prevBtn.addEventListener("click", () => {
        if (currentSlide > 0) {
            navigateToSlide(currentSlide - 1, loadingEl, wrapEl, errorEl, canvas, labelEl, prevBtn, nextBtn);
        }
    });

    nextBtn.addEventListener("click", () => {
        if (currentSlide < SLIDES.length - 1) {
            navigateToSlide(currentSlide + 1, loadingEl, wrapEl, errorEl, canvas, labelEl, prevBtn, nextBtn);
        }
    });

    // Load slide 0 immediately
    await navigateToSlide(0, loadingEl, wrapEl, errorEl, canvas, labelEl, prevBtn, nextBtn);
}

// ══════════════════════════════════════════════════════════════════════════════
// Entry point
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Read the current user's ID from the embedded meta block, then initialize
 * all three oversight dashboard widgets in parallel.
 *
 * @returns {Promise<void>}
 */
async function initOversightWidgets() {
    // Read current user's ID from the #db-oversight-meta block embedded by index.ejs
    let userId = 0;
    try {
        const metaEl = document.getElementById("db-oversight-meta");
        if (metaEl) userId = JSON.parse(metaEl.textContent || "{}").userId ?? 0;
    } catch {
        // Non-fatal — "unread by me" defaults to 0 rather than crashing
    }

    await Promise.allSettled([
        initNotesCard(userId),
        initViolationsCard(),
        initReportsCarousel(),
    ]);
}

document.addEventListener("DOMContentLoaded", initOversightWidgets);
