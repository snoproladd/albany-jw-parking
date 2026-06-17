/**
 * @file reportsCharts.js
 * @description Graphical chart rendering for the Oversight Reports page.
 *
 * Tabs and their data sources:
 *  - Application Status  — table only (reports.js handles it, no charts here)
 *  - Demographics        — KPI cards + registration donut (embedded JSON) +
 *                          age distribution + spiritual privileges (API)
 *  - Target Levels       — slot fill rate per day (API)
 *  - Staff Usage         — crew roster vs. scheduled count (API)
 *  - Crew Attendance     — invited / attended / no-show per day (API)
 *  - Garage Capacity     — disabled / coming soon
 *
 * All API-driven tabs lazy-fetch on first activation.
 * The Demographics KPI cards + donut compute instantly from the embedded
 * volunteer JSON (same block used by reports.js).
 *
 * Depends on:
 *  - #report-volunteer-data JSON block (embedded by reports.ejs)
 *  - Bootstrap 5 shown.bs.tab events
 *  - GET /api/reports/demographics
 *  - GET /api/reports/scheduling-coverage  (Target Levels)
 *  - GET /api/reports/crew-staffing        (Staff Usage)
 *  - GET /api/reports/attendance-overview  (Crew Attendance)
 *  - Chart.js 4 from jsDelivr ESM
 *  - /styles/reportsCharts.css
 *
 * @module reportsCharts
 */

import {
  Chart,
  registerables,
} from "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/+esm";

Chart.register(...registerables);

// ─── Global Chart.js defaults ─────────────────────────────────────────────

Chart.defaults.font.family = "'Archivo', system-ui, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = "#6b7280";
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.padding = 14;

// ─── App color palette ────────────────────────────────────────────────────

/** @type {Record<string, string>} */
const C = {
  blue: "#1e3a8a",
  blueMid: "#2563eb",
  blueBg: "rgba(37, 99, 235, 0.15)",
  green: "#166534",
  greenMid: "#16a34a",
  greenBg: "rgba(22, 163, 74, 0.15)",
  amber: "#92400e",
  amberMid: "#d97706",
  amberBg: "rgba(217, 119, 6, 0.15)",
  red: "#991b1b",
  redMid: "#dc2626",
  redBg: "rgba(220, 38, 38, 0.15)",
  teal: "#0e7490",
  tealMid: "#0891b2",
  tealBg: "rgba(8, 145, 178, 0.15)",
  purple: "#581c87",
  purpleMid: "#7c3aed",
  purpleBg: "rgba(124, 58, 237, 0.15)",
  gray: "#6b7280",
  grayBg: "rgba(107, 114, 128, 0.15)",
};

// ─── Volunteer embed (shared with reports.js) ─────────────────────────────

/**
 * Load the volunteer array embedded in the page.
 * @returns {Array<object>}
 */
function loadVolunteers() {
  try {
    const el = document.getElementById("report-volunteer-data");
    return el ? JSON.parse(el.textContent) : [];
  } catch {
    return [];
  }
}

/** @type {Array<object>} */
const volunteers = loadVolunteers();

// ─── DOM helpers ──────────────────────────────────────────────────────────

/**
 * Set the text content of an element by ID; silently ignores missing elements.
 * @param {string} id
 * @param {string|number} value
 * @returns {void}
 */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}

/**
 * Hide loading spinner and reveal canvas.
 * @param {string} loadingId
 * @param {string} canvasId
 * @returns {void}
 */
function revealChart(loadingId, canvasId) {
  const loading = document.getElementById(loadingId);
  const canvas = document.getElementById(canvasId);
  if (loading) loading.style.display = "none";
  if (canvas) canvas.style.display = "block";
}

/**
 * Show an error message and hide the loading spinner.
 * @param {string} errorId
 * @param {string} loadingId
 * @param {string} message
 * @returns {void}
 */
function showError(errorId, loadingId, message) {
  const err = document.getElementById(errorId);
  const loading = document.getElementById(loadingId);
  if (err) {
    err.textContent = message;
    err.style.display = "block";
  }
  if (loading) loading.style.display = "none";
}

// ─── API fetch ────────────────────────────────────────────────────────────

/**
 * Fetch a report API endpoint; throws on non-2xx.
 * @param {string} url
 * @returns {Promise<object>}
 */
async function fetchReport(url) {
  const resp = await fetch(url, { credentials: "same-origin" });
  if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
  return resp.json();
}

/** @returns {number} Current calendar year. */
function year() {
  return new Date().getFullYear();
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB: Demographics
// ═════════════════════════════════════════════════════════════════════════════

/** @type {Chart|null} */ let demoDonutChart = null;
/** @type {Chart|null} */ let demoAgeChart = null;
/** @type {Chart|null} */ let demoPrivChart = null;
/** @type {boolean} */ let demoLoaded = false;

/**
 * Compute KPI stats from the embedded volunteer data.
 * @returns {{ total: number, completed: number, draft: number, rate: number }}
 */
function computeRegStats() {
  const total = volunteers.length;
  const completed = volunteers.filter(
    (v) => v.registration_status === "completed",
  ).length;
  const draft = total - completed;
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, draft, rate };
}

/**
 * Render KPI cards with registration summary stats.
 * @param {{ total:number, completed:number, draft:number, rate:number }} stats
 * @returns {void}
 */
function renderDemoKpis(stats) {
  setText("kpi-total", stats.total);
  setText("kpi-completed", stats.completed);
  setText("kpi-draft", stats.draft);
  setText("kpi-rate", `${stats.rate}%`);
}

/**
 * Draw the registration-status donut from embedded data.
 * @param {{ completed:number, draft:number }} stats
 * @returns {void}
 */
function renderDemoDonut(stats) {
  revealChart("demo-donut-loading", "demo-donut-canvas");
  const ctx = /** @type {HTMLCanvasElement|null} */ (
    document.getElementById("demo-donut-canvas")
  );
  if (!ctx) return;
  if (demoDonutChart) demoDonutChart.destroy();
  const total = stats.completed + stats.draft;
  demoDonutChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Completed", "Incomplete"],
      datasets: [
        {
          data: [stats.completed, stats.draft],
          backgroundColor: [C.greenMid, C.amberMid],
          borderColor: [C.greenMid, C.amberMid],
          borderWidth: 1,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (item) => {
              const pct =
                total > 0 ? Math.round((item.parsed / total) * 100) : 0;
              return ` ${item.label}: ${item.parsed} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

/**
 * @typedef {{ age: number|null, gender: string|null,
 *             elder: boolean, min_serv: boolean, aux_pioneer: boolean,
 *             reg_pioneer: boolean, spec_pioneer: boolean, sfs: boolean }} DemoRow
 */

/**
 * Aggregate rows into age histogram bins.
 * @param {DemoRow[]} rows
 * @returns {Array<{label:string, count:number}>}
 */
function buildAgeBins(rows) {
  const bins = [
    { label: "Under 25", min: 0, max: 24, count: 0 },
    { label: "25–34", min: 25, max: 34, count: 0 },
    { label: "35–44", min: 35, max: 44, count: 0 },
    { label: "45–54", min: 45, max: 54, count: 0 },
    { label: "55–64", min: 55, max: 64, count: 0 },
    { label: "65+", min: 65, max: 999, count: 0 },
    { label: "Unknown", min: -1, max: -1, count: 0 },
  ];
  for (const r of rows) {
    const age = r.age;
    if (age == null || age < 0 || age > 120) {
      bins[bins.length - 1].count++;
      continue;
    }
    const bin = bins.find((b) => b.min !== -1 && age >= b.min && age <= b.max);
    if (bin) bin.count++;
    else bins[bins.length - 1].count++;
  }
  return bins.filter((b) => b.count > 0);
}

/**
 * Aggregate spiritual privilege counts.
 * @param {DemoRow[]} rows
 * @returns {Array<{label:string, count:number}>}
 */
function buildPrivilegeCounts(rows) {
  const entries = [
    { label: "Elder", key: "elder" },
    { label: "Min. Servant", key: "min_serv" },
    { label: "Aux. Pioneer", key: "aux_pioneer" },
    { label: "Reg. Pioneer", key: "reg_pioneer" },
    { label: "Spec. Pioneer", key: "spec_pioneer" },
    { label: "School — Family", key: "sfs" },
  ];
  for (const e of entries) {
    e.count = rows.filter((r) => !!r[e.key]).length;
  }
  return entries.sort((a, b) => b.count - a.count);
}

/**
 * Render the age distribution horizontal bar chart.
 * @param {DemoRow[]} rows
 * @returns {void}
 */
function renderDemoAge(rows) {
  revealChart("demo-age-loading", "demo-age-canvas");
  const ctx = /** @type {HTMLCanvasElement|null} */ (
    document.getElementById("demo-age-canvas")
  );
  if (!ctx) return;
  if (demoAgeChart) demoAgeChart.destroy();

  const bins = buildAgeBins(rows);
  demoAgeChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: bins.map((b) => b.label),
      datasets: [
        {
          label: "Volunteers",
          data: bins.map((b) => b.count),
          backgroundColor: C.blueMid,
          borderColor: C.blueMid,
          borderWidth: 0,
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } },
      },
      plugins: { legend: { display: false } },
    },
  });
}

/**
 * Render the spiritual privileges horizontal bar chart.
 * @param {DemoRow[]} rows
 * @returns {void}
 */
function renderDemoPrivileges(rows) {
  revealChart("demo-priv-loading", "demo-priv-canvas");
  const ctx = /** @type {HTMLCanvasElement|null} */ (
    document.getElementById("demo-priv-canvas")
  );
  if (!ctx) return;
  if (demoPrivChart) demoPrivChart.destroy();

  const privileges = buildPrivilegeCounts(rows);
  demoPrivChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: privileges.map((p) => p.label),
      datasets: [
        {
          label: "Volunteers",
          data: privileges.map((p) => p.count),
          backgroundColor: C.purpleMid,
          borderColor: C.purpleMid,
          borderWidth: 0,
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => {
              const total = privileges.reduce((s, p) => s + p.count, 0);
              const pct =
                total > 0
                  ? Math.round((item.parsed.x / volunteers.length) * 100)
                  : 0;
              return ` ${item.parsed.x} volunteers (${pct}% of total)`;
            },
          },
        },
      },
    },
  });
}

/**
 * Initialize the Demographics tab — runs once on first activation.
 * KPI cards + donut compute instantly; age/privilege charts fetch from API.
 * @returns {Promise<void>}
 */
async function initDemographics() {
  if (demoLoaded) return;
  demoLoaded = true;

  // Instant: KPI cards and donut from embedded data
  const stats = computeRegStats();
  renderDemoKpis(stats);
  renderDemoDonut(stats);

  // API: age and privilege charts
  try {
    const data = await fetchReport(`/api/reports/demographics?year=${year()}`);
    renderDemoAge(data.volunteers);
    renderDemoPrivileges(data.volunteers);
  } catch (err) {
    showError(
      "demo-age-error",
      "demo-age-loading",
      `Could not load age data: ${err.message}`,
    );
    showError(
      "demo-priv-error",
      "demo-priv-loading",
      `Could not load privilege data: ${err.message}`,
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB: Target Levels
// ═════════════════════════════════════════════════════════════════════════════

/** @type {Chart|null} */ let targetsChart = null;
/** @type {boolean} */ let targetsLoaded = false;

/**
 * @typedef {{ day_label:string, total_needed:number, total_assigned:number }} TargetDay
 */

/**
 * Render the slot fill rate grouped bar chart.
 * @param {{ days: TargetDay[] }} data
 * @returns {void}
 */
function renderTargetsChart(data) {
  revealChart("targets-chart-loading", "targets-chart-canvas");
  const ctx = /** @type {HTMLCanvasElement|null} */ (
    document.getElementById("targets-chart-canvas")
  );
  if (!ctx) return;
  if (targetsChart) targetsChart.destroy();

  targetsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.days.map((d) => d.day_label),
      datasets: [
        {
          label: "Total slots needed",
          data: data.days.map((d) => d.total_needed),
          backgroundColor: C.blueBg,
          borderColor: C.blueMid,
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: "Slots assigned",
          data: data.days.map((d) => d.total_assigned),
          backgroundColor: C.blueMid,
          borderColor: C.blueMid,
          borderWidth: 0,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
          title: { display: true, text: "Volunteer slots" },
        },
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            afterBody: (items) => {
              const day = data.days[items[0].dataIndex];
              const pct =
                day.total_needed > 0
                  ? Math.round((day.total_assigned / day.total_needed) * 100)
                  : 0;
              return [`Fill rate: ${pct}%`];
            },
          },
        },
      },
    },
  });

  // Populate summary totals row
  const totalNeeded = data.days.reduce((s, d) => s + d.total_needed, 0);
  const totalAssigned = data.days.reduce((s, d) => s + d.total_assigned, 0);
  const overallPct =
    totalNeeded > 0 ? Math.round((totalAssigned / totalNeeded) * 100) : 0;
  setText("targets-sum-needed", totalNeeded);
  setText("targets-sum-assigned", totalAssigned);
  setText("targets-sum-pct", `${overallPct}%`);
  const summaryRow = document.getElementById("targets-summary");
  if (summaryRow) summaryRow.classList.add("is-visible");
}

/**
 * Fetch and render the Target Levels tab. Lazy — runs once.
 * @returns {Promise<void>}
 */
async function initTargetLevels() {
  if (targetsLoaded) return;
  targetsLoaded = true;
  try {
    const data = await fetchReport(
      `/api/reports/scheduling-coverage?year=${year()}`,
    );
    renderTargetsChart(data);
  } catch (err) {
    showError(
      "targets-chart-error",
      "targets-chart-loading",
      `Could not load scheduling data: ${err.message}`,
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB: Staff Usage
// ═════════════════════════════════════════════════════════════════════════════

/** @type {Chart|null} */ let staffChart = null;
/** @type {boolean} */ let staffLoaded = false;

/**
 * @typedef {{ department:string, label:string,
 *             roster_count:number, scheduled_count:number }} CrewRow
 */

/**
 * Render the crew staffing horizontal bar chart.
 * @param {{ crews: CrewRow[] }} data
 * @returns {void}
 */
function renderStaffChart(data) {
  revealChart("staff-chart-loading", "staff-chart-canvas");
  const ctx = /** @type {HTMLCanvasElement|null} */ (
    document.getElementById("staff-chart-canvas")
  );
  if (!ctx) return;
  if (staffChart) staffChart.destroy();

  staffChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.crews.map((c) => c.label),
      datasets: [
        {
          label: "On roster (crew flag set)",
          data: data.crews.map((c) => c.roster_count),
          backgroundColor: C.tealBg,
          borderColor: C.tealMid,
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: "Appeared in a shift",
          data: data.crews.map((c) => c.scheduled_count),
          backgroundColor: C.tealMid,
          borderColor: C.tealMid,
          borderWidth: 0,
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          beginAtZero: true,
          ticks: { precision: 0 },
          title: { display: true, text: "Volunteers" },
        },
      },
      plugins: { legend: { position: "bottom" } },
    },
  });
}

/**
 * Fetch and render the Staff Usage tab. Lazy — runs once.
 * @returns {Promise<void>}
 */
async function initStaffUsage() {
  if (staffLoaded) return;
  staffLoaded = true;
  try {
    const data = await fetchReport(`/api/reports/crew-staffing?year=${year()}`);
    renderStaffChart(data);
  } catch (err) {
    showError(
      "staff-chart-error",
      "staff-chart-loading",
      `Could not load crew staffing data: ${err.message}`,
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB: Crew Attendance
// ═════════════════════════════════════════════════════════════════════════════

/** @type {Chart|null} */ let crewAttendChart = null;
/** @type {boolean} */ let crewAttendLoaded = false;

/**
 * @typedef {{ day_label:string, total_invited:number,
 *             total_attended:number, total_no_show:number }} AttendDay
 */

/**
 * Render the crew attendance stacked bar chart.
 * @param {{ days: AttendDay[] }} data
 * @returns {void}
 */
function renderCrewAttendChart(data) {
  revealChart("crew-attend-loading", "crew-attend-canvas");
  const ctx = /** @type {HTMLCanvasElement|null} */ (
    document.getElementById("crew-attend-canvas")
  );
  if (!ctx) return;
  if (crewAttendChart) crewAttendChart.destroy();

  crewAttendChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.days.map((d) => d.day_label),
      datasets: [
        {
          label: "Attended",
          data: data.days.map((d) => d.total_attended),
          backgroundColor: C.greenMid,
          borderColor: C.greenMid,
          borderWidth: 0,
          borderRadius: 4,
        },
        {
          label: "No-show",
          data: data.days.map((d) => d.total_no_show),
          backgroundColor: C.redMid,
          borderColor: C.redMid,
          borderWidth: 0,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { precision: 0 },
          title: { display: true, text: "Invited volunteers" },
        },
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            afterBody: (items) => {
              const day = data.days[items[0].dataIndex];
              const pct =
                day.total_invited > 0
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
 * Fetch and render the Crew Attendance tab. Lazy — runs once.
 * @returns {Promise<void>}
 */
async function initCrewAttendance() {
  if (crewAttendLoaded) return;
  crewAttendLoaded = true;
  try {
    const data = await fetchReport(
      `/api/reports/attendance-overview?year=${year()}`,
    );
    renderCrewAttendChart(data);
  } catch (err) {
    showError(
      "crew-attend-error",
      "crew-attend-loading",
      `Could not load attendance data: ${err.message}`,
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB: Day Staffing
// ═════════════════════════════════════════════════════════════════════════════

/** @type {Chart|null} */ let dayStaffChart = null;
/** @type {boolean} */ let dayStaffLoaded = false;

/**
 * @typedef {{
 *   department:     string,
 *   label:          string,
 *   volunteer_need: number,
 *   scheduled:      number,
 *   attended:       number,
 *   gap:            number,
 * }} CrewDayRow
 */

/**
 * Populate the day picker <select> from the scheduling-coverage days list.
 * Auto-selects today's day when present, otherwise the first available day.
 *
 * @param {Array<{day_id:number, day_label:string, convention_date:string|null}>} days
 * @returns {void}
 */
function populateDayPicker(days) {
  const sel = /** @type {HTMLSelectElement|null} */ (
    document.getElementById("staffing-day-select")
  );
  if (!sel || !days.length) return;

  const todayStr = new Date().toISOString().slice(0, 10);
  let todayIdx = -1;

  sel.innerHTML = "";
  days.forEach((d, i) => {
    const opt = document.createElement("option");
    opt.value = String(d.day_id);
    const datePart =
      d.convention_date
        ? " — " +
          new Date(d.convention_date).toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })
        : "";
    opt.textContent = d.day_label + datePart;
    sel.appendChild(opt);
    if (d.convention_date && d.convention_date.startsWith(todayStr))
      todayIdx = i;
  });

  sel.selectedIndex = todayIdx >= 0 ? todayIdx : 0;
}

/**
 * Build and insert crew status summary cards into #staffing-cards.
 * Each card shows crew name, gap, and the Need / Sched. / Present trio.
 *
 * @param {CrewDayRow[]} crews
 * @returns {void}
 */
function renderStaffingCards(crews) {
  const container = document.getElementById("staffing-cards");
  if (!container) return;
  container.innerHTML = "";

  for (const crew of crews) {
    const gap = crew.gap; // positive = short, negative = over
    let mod, statusText, gapDisplay;

    if (gap <= 0) {
      // On target or over-staffed
      mod = gap < -1 ? "staffing-card--over" : "staffing-card--ok";
      statusText = gap < -1 ? `Over by ${Math.abs(gap)}` : "On target";
      gapDisplay = gap < 0 ? `+${Math.abs(gap)}` : "✓";
    } else {
      // Short-staffed
      const pct =
        crew.volunteer_need > 0 ? crew.attended / crew.volunteer_need : 0;
      mod = pct >= 0.75 ? "staffing-card--warn" : "staffing-card--short";
      statusText = `Short ${gap}`;
      gapDisplay = `\u2212${gap}`; // − (minus sign)
    }

    const card = document.createElement("div");
    card.className = `staffing-card ${mod}`;

    // Header row: name + status badge
    const header = document.createElement("div");
    header.className = "staffing-card-header";
    const nameEl = document.createElement("span");
    nameEl.className = "staffing-card-name";
    nameEl.textContent = crew.label;
    const statusEl = document.createElement("span");
    statusEl.className = "staffing-card-status";
    statusEl.textContent = statusText;
    header.appendChild(nameEl);
    header.appendChild(statusEl);

    // Large gap number
    const gapEl = document.createElement("div");
    gapEl.className = "staffing-card-gap";
    gapEl.textContent = gapDisplay;

    // Stat trio
    const stats = document.createElement("div");
    stats.className = "staffing-card-stats";
    [
      ["Need", crew.volunteer_need],
      ["Sched.", crew.scheduled],
      ["Present", crew.attended],
    ].forEach(([lbl, val]) => {
      const cell = document.createElement("div");
      const sp = document.createElement("span");
      sp.textContent = String(lbl);
      const strong = document.createElement("strong");
      strong.textContent = String(val);
      cell.appendChild(sp);
      cell.appendChild(strong);
      stats.appendChild(cell);
    });

    card.appendChild(header);
    card.appendChild(gapEl);
    card.appendChild(stats);
    container.appendChild(card);
  }
}

/**
 * Render (or replace) the day staffing grouped bar chart.
 * The "Present" bar for each crew is colored by coverage health:
 *   gap ≤ 0  → teal   (on target or over)
 *   gap > 0 and ≥ 75% fill → amber (close)
 *   gap > 0 and < 75% fill → red   (short)
 *
 * @param {CrewDayRow[]} crews
 * @returns {void}
 */
function renderDayStaffChart(crews) {
  revealChart("day-staff-loading", "day-staff-canvas");
  const ctx = /** @type {HTMLCanvasElement|null} */ (
    document.getElementById("day-staff-canvas")
  );
  if (!ctx) return;
  if (dayStaffChart) dayStaffChart.destroy();

  const presentColors = crews.map((c) => {
    if (c.gap <= 0) return C.tealMid;
    const pct = c.volunteer_need > 0 ? c.attended / c.volunteer_need : 0;
    return pct >= 0.75 ? C.amberMid : C.redMid;
  });

  dayStaffChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: crews.map((c) => c.label),
      datasets: [
        {
          label: "Need (target)",
          data: crews.map((c) => c.volunteer_need),
          backgroundColor: C.grayBg,
          borderColor: C.gray,
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: "Scheduled",
          data: crews.map((c) => c.scheduled),
          backgroundColor: C.blueBg,
          borderColor: C.blueMid,
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: "Present",
          data: crews.map((c) => c.attended),
          backgroundColor: presentColors,
          borderColor: presentColors,
          borderWidth: 0,
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          beginAtZero: true,
          ticks: { precision: 0 },
          title: { display: true, text: "Volunteers" },
        },
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            afterBody: (items) => {
              const crew = crews[items[0].dataIndex];
              const pct =
                crew.volunteer_need > 0
                  ? Math.round((crew.attended / crew.volunteer_need) * 100)
                  : 0;
              const gapSign = crew.gap > 0 ? "\u2212" : "+";
              const gapAbs = Math.abs(crew.gap);
              return [
                `Gap: ${gapSign}${gapAbs}`,
                `Coverage: ${pct}%`,
              ];
            },
          },
        },
      },
    },
  });
}

/**
 * Fetch and render staffing data for the given day ID.
 * Resets the chart and cards before each load so the UI stays clean
 * when the user changes the day picker.
 *
 * @param {number|string} dayId
 * @returns {Promise<void>}
 */
async function loadDayStaffing(dayId) {
  // Reset UI
  const loading = document.getElementById("day-staff-loading");
  const canvas = document.getElementById("day-staff-canvas");
  const errEl = document.getElementById("day-staff-error");
  const cards = document.getElementById("staffing-cards");
  if (loading) loading.style.display = "flex";
  if (canvas) canvas.style.display = "none";
  if (errEl) errEl.style.display = "none";
  if (cards) cards.innerHTML = "";

  try {
    const data = await fetchReport(
      `/api/reports/day-staffing?dayId=${encodeURIComponent(dayId)}`
    );
    if (!data.crews || data.crews.length === 0) {
      showError(
        "day-staff-error",
        "day-staff-loading",
        "No scheduled shifts found for this day."
      );
      return;
    }
    renderStaffingCards(data.crews);
    renderDayStaffChart(data.crews);
  } catch (err) {
    showError(
      "day-staff-error",
      "day-staff-loading",
      `Could not load staffing data: ${err.message}`
    );
  }
}

/**
 * Initialize the Day Staffing tab. Lazy — runs once.
 * Loads the convention days list into the picker, selects today or the
 * first available day, then fetches and renders staffing for that day.
 *
 * @returns {Promise<void>}
 */
async function initDayStaffing() {
  if (dayStaffLoaded) return;
  dayStaffLoaded = true;

  try {
    // Reuse the scheduling-coverage endpoint — it already returns the days list
    const daysData = await fetchReport(
      `/api/reports/scheduling-coverage?year=${year()}`
    );
    if (!daysData.days || !daysData.days.length) {
      showError(
        "day-staff-error",
        "day-staff-loading",
        "No convention days found for this year."
      );
      return;
    }

    populateDayPicker(daysData.days);

    const sel = document.getElementById("staffing-day-select");
    if (!sel) return;

    // Load the initially selected day
    await loadDayStaffing(sel.value);

    // Re-load whenever the user changes the picker
    sel.addEventListener("change", () => {
      if (sel.value) loadDayStaffing(sel.value);
    });
  } catch (err) {
    showError(
      "day-staff-error",
      "day-staff-loading",
      `Could not load day list: ${err.message}`
    );
  }
}

// ─── Tab wiring ───────────────────────────────────────────────────────────

/**
 * Wire Bootstrap tab events to lazy chart initializers.
 * Also auto-initializes whichever tab is active on page load
 * (including when ?tab= deep-links to a non-default tab).
 *
 * @returns {void}
 */
function wireTabs() {
  document.addEventListener("shown.bs.tab", (e) => {
    const target = /** @type {HTMLElement} */ (e.target).dataset.bsTarget || "";
    if (target === "#panel-demographics") initDemographics();
    else if (target === "#panel-target-levels") initTargetLevels();
    else if (target === "#panel-staff-usage") initStaffUsage();
    else if (target === "#panel-crew-attendance") initCrewAttendance();
    else if (target === "#panel-day-staffing") initDayStaffing();
  });

  // Init whichever tab is active on load (default = app-status, no charts needed;
  // deep-link may have activated a chart tab before this script ran).
  const active = document.querySelector("#reportTabs .nav-link.active");
  const t = active?.getAttribute("data-bs-target") ?? "";
  if (t === "#panel-demographics") initDemographics();
  else if (t === "#panel-target-levels") initTargetLevels();
  else if (t === "#panel-staff-usage") initStaffUsage();
  else if (t === "#panel-crew-attendance") initCrewAttendance();
  else if (t === "#panel-day-staffing") initDayStaffing();
}

// ─── Entry point ──────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", wireTabs);
