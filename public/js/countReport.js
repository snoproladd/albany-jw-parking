/**
 * @file public/js/countReport.js
 * @description Oversight parking count report — embedded in the Garage Capacity
 * tab of the Reports page.
 *
 * Layout:
 *  1. Overview bar chart  — latest count vs. capacity per garage (top of panel)
 *  2. Per-garage time-series — one stacked area chart per location, with
 *     individual entrance fills summing to the total line
 *  3. Summary table — peak, capacity, utilisation per garage + reset controls
 *
 * All bucket timestamps from the API are UTC DATETIME2; axis labels convert
 * to Eastern Time. Stacked area charts use manually-accumulated cumulative
 * values so fills nest correctly without Chart.js's scale-level stacking mode.
 *
 * Auto-refresh fires every 60 seconds (silent — charts stay visible).
 * A manual refresh button spins while loading. Both pause when the page is
 * hidden and resume (with an immediate catch-up fetch) on visibility restore.
 *
 * @module countReport
 */

import {
  Chart,
  registerables,
} from "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/+esm";

Chart.register(...registerables);

// ── Chart.js defaults ────────────────────────────────────────────────────────

Chart.defaults.font.family = "'Archivo', system-ui, sans-serif";
Chart.defaults.font.size   = 12;
Chart.defaults.color       = "#6b7280";

// ── DOM refs ─────────────────────────────────────────────────────────────────

const reportDaySelect = /** @type {HTMLSelectElement} */ (
  document.getElementById("reportDaySelect")
);
const crLoading      = document.getElementById("crLoading");
const crError        = document.getElementById("crError");
const crEmpty        = document.getElementById("crEmpty");
const crOverviewWrap = document.getElementById("crOverviewWrap");
const crGaragesWrap  = document.getElementById("crGaragesWrap");
const crSummary      = document.getElementById("crSummary");

/**
 * Whether the current user can reset counts (ASSISTANT_ADMIN+).
 * Set server-side via data-can-reset on #countReportRoot.
 */
const canResetCounts =
  document.getElementById("countReportRoot")?.dataset.canReset === "1";

// ── Refresh state ─────────────────────────────────────────────────────────────

const crRefreshBtn  = document.getElementById("crRefreshBtn");
const crRefreshIcon = document.getElementById("crRefreshIcon");

/** Currently displayed convention day ID, or null. */
let currentDayId = null;

/** setInterval handle for the 60-second auto-refresh, or null. */
let refreshIntervalId = null;

// ── Chart instances ───────────────────────────────────────────────────────────

/** @type {Chart | null} */
let overviewChartInstance = null;

/** @type {Map<number, Chart>} locationId → Chart instance */
const garageChartInstances = new Map();

// ── Color palette ─────────────────────────────────────────────────────────────

const SERIES_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
  "#84cc16", // lime
];

/**
 * Return a series color by index, cycling if needed.
 * @param {number} index
 * @returns {string}
 */
function seriesColor(index) {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

// ── Time formatting ───────────────────────────────────────────────────────────

/**
 * Format a UTC bucket timestamp as a short Eastern Time string (e.g. "9:00 AM").
 * @param {string | Date} bucket  UTC datetime value from the API.
 * @returns {string}
 */
function formatBucket(bucket) {
  return new Date(bucket).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour:     "numeric",
    minute:   "2-digit",
    hour12:   true,
  });
}

// ── UI state helpers ──────────────────────────────────────────────────────────

/** Show the loading spinner; hide all content regions. @returns {void} */
function showLoading() {
  crLoading.classList.remove("d-none");
  crError.classList.add("d-none");
  crEmpty.classList.add("d-none");
  crOverviewWrap?.classList.add("d-none");
  crGaragesWrap?.classList.add("d-none");
  crSummary.classList.add("d-none");
}

/**
 * Show an error message.
 * @param {string} message
 * @returns {void}
 */
function showError(message) {
  crLoading.classList.add("d-none");
  crError.textContent = message;
  crError.classList.remove("d-none");
}

/** Show the empty state (no data for this day yet). @returns {void} */
function showEmpty() {
  crLoading.classList.add("d-none");
  crEmpty.classList.remove("d-none");
}

/** Reveal the overview chart, per-garage charts, and summary. @returns {void} */
function showChart() {
  crLoading.classList.add("d-none");
  crOverviewWrap?.classList.remove("d-none");
  crGaragesWrap?.classList.remove("d-none");
  crSummary.classList.remove("d-none");
}

// ── Data grouping ─────────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   locationId:    number,
 *   locationName:  string,
 *   capacity:      number | null,
 *   buckets:       string[],
 *   subs:          Array<{ subLabel: string, data: Map<string, number> }>,
 *   totalByBucket: Map<string, number>,
 *   latestTotal:   number,
 * }} LocationGroup
 */

/**
 * Transform flat API rows into per-location groups, each containing a sorted
 * bucket list, per-sub-location data maps, and a total-by-bucket map.
 *
 * @param {Array<{
 *   location_task_id:  number,
 *   location_name:     string,
 *   capacity:          number | null,
 *   sub_location_id:   number | null,
 *   sub_location_name: string | null,
 *   sub_type_name:     string | null,
 *   bucket:            string,
 *   total_count:       number,
 * }>} rows
 * @returns {LocationGroup[]}
 */
function buildLocationGroups(rows) {
  // Locations that have at least one named sub-location.
  const locsWithSubs = new Set(
    rows.filter((r) => r.sub_location_id != null).map((r) => r.location_task_id)
  );

  const locMap = new Map();

  for (const row of rows) {
    const lid = row.location_task_id;
    if (!locMap.has(lid)) {
      locMap.set(lid, {
        locationId:    lid,
        locationName:  row.location_name,
        capacity:      row.capacity,
        bucketSet:     new Set(),
        subs:          new Map(),
        totalByBucket: new Map(),
      });
    }
    const loc = locMap.get(lid);

    loc.bucketSet.add(row.bucket);

    // Build a stable sub-location key and display label.
    const subKey = String(row.sub_location_id ?? "null");
    if (!loc.subs.has(subKey)) {
      let subLabel;
      if (row.sub_location_name) {
        subLabel = row.sub_type_name
          ? `${row.sub_location_name} (${row.sub_type_name})`
          : row.sub_location_name;
      } else if (locsWithSubs.has(lid)) {
        subLabel = "(unassigned)";
      } else {
        subLabel = row.location_name; // sole series — use location name
      }
      loc.subs.set(subKey, { subLabel, data: new Map() });
    }
    loc.subs.get(subKey).data.set(row.bucket, row.total_count);

    // Accumulate total per bucket.
    loc.totalByBucket.set(
      row.bucket,
      (loc.totalByBucket.get(row.bucket) ?? 0) + row.total_count
    );
  }

  return [...locMap.values()].map((loc) => {
    const buckets     = [...loc.bucketSet].sort();
    const lastBucket  = buckets[buckets.length - 1];
    const latestTotal = lastBucket ? (loc.totalByBucket.get(lastBucket) ?? 0) : 0;
    return {
      locationId:    loc.locationId,
      locationName:  loc.locationName,
      capacity:      loc.capacity,
      buckets,
      subs:          [...loc.subs.values()],
      totalByBucket: loc.totalByBucket,
      latestTotal,
    };
  });
}

// ── Overview bar chart ────────────────────────────────────────────────────────

/**
 * Render (or update) the top-of-panel overview bar chart showing the latest
 * count vs. capacity for each garage. Bars are colour-coded by utilisation:
 * green < 70%, amber 70–90%, red ≥ 90%.
 *
 * @param {LocationGroup[]} locations
 * @returns {void}
 */
function renderOverviewChart(locations) {
  const canvas = /** @type {HTMLCanvasElement | null} */ (
    document.getElementById("crOverviewChart")
  );
  if (!canvas) return;

  const labels     = locations.map((l) => l.locationName);
  const counts     = locations.map((l) => l.latestTotal);
  const capacities = locations.map((l) => l.capacity);

  // Colour bars by utilisation.
  const barColors = counts.map((c, i) => {
    const cap = capacities[i];
    if (cap == null) return "#3b82f6";
    const pct = c / cap;
    if (pct >= 0.9) return "#ef4444";
    if (pct >= 0.7) return "#f59e0b";
    return "#22c55e";
  });

  if (overviewChartInstance) overviewChartInstance.destroy();

  overviewChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label:           "Current count",
          data:            counts,
          backgroundColor: barColors,
          borderRadius:    4,
          order:           1,
        },
        {
          label:           "Capacity",
          data:            capacities,
          backgroundColor: "rgba(156, 163, 175, 0.15)",
          borderColor:     "rgba(156, 163, 175, 0.6)",
          borderWidth:     1.5,
          borderRadius:    4,
          order:           2,
        },
      ],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: "bottom",
          labels:   { usePointStyle: true, pointStyleWidth: 10 },
        },
        tooltip: {
          callbacks: {
            afterBody: (ctx) => {
              const idx = ctx[0]?.dataIndex;
              const cap = capacities[idx];
              const cnt = counts[idx];
              if (cap == null || !cap) return "";
              return `Utilization: ${Math.round((cnt / cap) * 100)}%`;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
          title: { display: true, text: "Cars" },
        },
      },
    },
  });
}

// ── Per-garage time-series charts ─────────────────────────────────────────────

/**
 * Destroy all existing garage chart instances and clear the container, then
 * render one stacked area chart per location into crGaragesWrap.
 *
 * @param {LocationGroup[]} locations
 * @returns {void}
 */
function renderGarageCharts(locations) {
  if (!crGaragesWrap) return;

  // Destroy previous instances to avoid memory leaks.
  garageChartInstances.forEach((chart) => chart.destroy());
  garageChartInstances.clear();
  crGaragesWrap.innerHTML = "";

  locations.forEach((loc) => {
    const chart = renderGarageChart(loc);
    if (chart) garageChartInstances.set(loc.locationId, chart);
  });
}

/**
 * Build and inject a stacked area time-series chart for a single garage.
 *
 * When a garage has multiple sub-locations, each sub-location becomes a
 * coloured fill band. The bands use manually accumulated cumulative y-values
 * so Chart.js `fill: '-1'` stacks them visually without scale-level stacking.
 * A bold total line sits on top of all fills.
 *
 * When there is only one data series (no sub-locations), renders a simple
 * shaded area chart.
 *
 * @param {LocationGroup} loc
 * @returns {Chart | null}
 */
function renderGarageChart(loc) {
  if (!crGaragesWrap) return null;

  const { locationId, locationName, capacity, buckets, subs, totalByBucket } = loc;
  const labels   = buckets.map(formatBucket);
  const hasSubs  = subs.length > 1 || subs[0]?.subLabel !== locationName;
  const datasets = [];

  if (hasSubs && subs.length > 1) {
    // Stacked area — build cumulative y-values so fills nest correctly.
    const cumulative = buckets.map(() => 0);

    subs.forEach((sub, i) => {
      const cumulData = buckets.map((b, j) => {
        cumulative[j] += sub.data.get(b) ?? 0;
        return cumulative[j];
      });

      datasets.push({
        label:           sub.subLabel,
        data:            [...cumulData],
        fill:            i === 0 ? "origin" : "-1",
        backgroundColor: seriesColor(i) + "55",
        borderColor:     seriesColor(i),
        borderWidth:     1.5,
        pointRadius:     2,
        tension:         0.3,
        spanGaps:        true,
      });
    });

    // Bold total line sitting on top of all fills.
    datasets.push({
      label:       "Total",
      data:        buckets.map((b) => totalByBucket.get(b) ?? null),
      fill:        false,
      borderColor: "#1e293b",
      borderWidth: 2.5,
      pointRadius: 0,
      tension:     0.3,
      spanGaps:    true,
    });
  } else {
    // Single series — simple shaded area.
    datasets.push({
      label:           locationName,
      data:            buckets.map((b) => totalByBucket.get(b) ?? null),
      fill:            "origin",
      backgroundColor: seriesColor(0) + "40",
      borderColor:     seriesColor(0),
      borderWidth:     2,
      pointRadius:     2,
      tension:         0.3,
      spanGaps:        true,
    });
  }

  // Capacity reference line.
  if (capacity != null) {
    datasets.push({
      label:       `Capacity (${capacity})`,
      data:        buckets.map(() => capacity),
      fill:        false,
      borderColor: "#dc2626",
      borderDash:  [6, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      tension:     0,
    });
  }

  // Build DOM block.
  const block      = document.createElement("div");
  block.className  = "cr-garage-block";
  block.dataset.locationId = String(locationId);

  const heading    = document.createElement("p");
  heading.className = "cr-garage-heading";
  heading.innerHTML = `<i class="fa-solid fa-warehouse me-2 text-secondary"></i>${locationName}`;

  const canvasWrap = document.createElement("div");
  canvasWrap.className = "cr-garage-chart-wrap";

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", `${locationName} parking counts over time`);
  canvas.setAttribute("role",       "img");

  canvasWrap.appendChild(canvas);
  block.appendChild(heading);
  block.appendChild(canvasWrap);
  crGaragesWrap.appendChild(block);

  return new Chart(canvas, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            filter:          (item) => !item.text.startsWith("Capacity"),
            usePointStyle:   true,
            pointStyleWidth: 10,
          },
        },
        tooltip: {
          callbacks: {
            /**
             * Sub-location datasets store cumulative (stacked) values so
             * the area fills nest correctly -- the raw value at any point
             * is "this entrance plus everything below it in the stack,"
             * not this entrance's own count. Subtract the previous
             * sub-location's cumulative value at the same point to
             * recover the individual count. The "Total" dataset is not
             * stacked against anything else, so its value is already
             * correct as-is (the top of the stack IS the true total).
             */
            label: (ctx) => {
              if (ctx.dataset.label?.startsWith("Capacity")) return null;
              if (ctx.dataset.label === "Total") {
                return ` ${ctx.dataset.label}: ${ctx.parsed.y ?? "\u2014"}`;
              }
              const prevDataset = ctx.datasetIndex > 0
                ? ctx.chart.data.datasets[ctx.datasetIndex - 1]
                : null;
              const prevValue = prevDataset?.data[ctx.dataIndex] ?? 0;
              const individual = (ctx.parsed.y ?? 0) - prevValue;
              return ` ${ctx.dataset.label}: ${individual}`;
            },
          },
          filter: (item) => !item.dataset.label?.startsWith("Capacity"),
        },
      },
      scales: {
        x: {
          title: { display: true, text: "Time (Eastern)" },
          ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 12 },
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: "Cars" },
          ticks: { precision: 0 },
        },
      },
    },
  });
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

/**
 * Entry point for all chart rendering. Groups raw API rows into per-location
 * structures, then delegates to overview, garage, and summary renderers.
 *
 * @param {Array} rows  Raw rows from /api/counts/report-data
 * @returns {void}
 */
function renderChart(rows) {
  const locations = buildLocationGroups(rows);
  renderOverviewChart(locations);
  renderGarageCharts(locations);
  renderSummary(locations);
}

// ── Summary table ─────────────────────────────────────────────────────────────

/**
 * Render the per-garage capacity summary table below the charts.
 * Shows latest count, peak, capacity, peak utilisation, and a Reset button
 * per row for ASSISTANT_ADMIN+ users.
 *
 * @param {LocationGroup[]} locations
 * @returns {void}
 */
function renderSummary(locations) {
  if (!locations.length) {
    crSummary.innerHTML = "";
    return;
  }

  const actionHeader = canResetCounts ? "<th></th>" : "";

  const rows = locations
    .map((loc) => {
      const allCounts = [...loc.totalByBucket.values()];
      const peak      = allCounts.length ? Math.max(...allCounts) : 0;
      const capText   = loc.capacity != null ? String(loc.capacity) : "\u2014";
      const pct       = loc.capacity ? Math.round((peak / loc.capacity) * 100) : null;

      const actionCell = canResetCounts
        ? `<td class="cr-summary-action">
            <button type="button"
                    class="btn btn-sm cr-reset-btn"
                    data-location-id="${loc.locationId}"
                    data-location-name="${loc.locationName.replace(/"/g, "&quot;")}">
              <i class="fa-solid fa-rotate-left me-1"></i>Reset
            </button>
           </td>`
        : "";

      return `
        <tr>
          <td class="cr-summary-name">${loc.locationName}</td>
          <td class="cr-summary-val">${loc.latestTotal}</td>
          <td class="cr-summary-val">${peak}</td>
          <td class="cr-summary-val">${capText}</td>
          <td class="cr-summary-val">${pct != null ? pct + "%" : "\u2014"}</td>
          ${actionCell}
        </tr>`;
    })
    .join("");

  crSummary.innerHTML = `
    <table class="table table-sm cr-summary-table">
      <thead>
        <tr>
          <th>Location</th>
          <th>Latest</th>
          <th>Peak</th>
          <th>Capacity</th>
          <th>Peak utilization</th>
          ${actionHeader}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  if (canResetCounts) {
    crSummary.querySelectorAll(".cr-reset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        openResetModal(
          Number(btn.dataset.locationId),
          btn.dataset.locationName ?? ""
        );
      });
    });
  }
}

// ── Data loading ──────────────────────────────────────────────────────────────

/**
 * Fetch and render report data for a given convention day.
 *
 * @param {number}  dayId            convention_days.id
 * @param {boolean} [silent=false]   When true the existing charts stay visible
 *   during the fetch (used for auto/manual refresh). When false the full
 *   loading spinner replaces the chart area (used on initial day selection).
 * @returns {Promise<void>}
 */
async function loadReportData(dayId, silent = false) {
  currentDayId = dayId;
  if (!silent) showLoading();
  if (crRefreshBtn) crRefreshBtn.disabled = true;
  crRefreshIcon?.classList.add("fa-spin");
  try {
    const res  = await fetch(`/api/counts/report-data?dayId=${dayId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (!data.rows.length) {
      if (!silent) showEmpty();
      return;
    }
    showChart();
    renderChart(data.rows);
    // Start the auto-refresh interval only on the first (non-silent) load.
    if (!silent) startAutoRefresh();
  } catch (err) {
    if (!silent) showError(`Failed to load report data: ${err.message}`);
  } finally {
    if (crRefreshBtn) crRefreshBtn.disabled = !currentDayId;
    crRefreshIcon?.classList.remove("fa-spin");
  }
}

/**
 * Populate the day picker and auto-select today's convention day if found.
 * @returns {Promise<void>}
 */
async function loadDays() {
  try {
    const res  = await fetch("/api/counts/days");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const today = new Date().toISOString().slice(0, 10);

    reportDaySelect.innerHTML =
      '<option value="">Select a day\u2026</option>' +
      data.days
        .map((d) => {
          const dateStr = new Date(d.convention_date).toISOString().slice(0, 10);
          return `<option value="${d.id}" data-date="${dateStr}">${d.label}</option>`;
        })
        .join("");

    const todayOpt = [...reportDaySelect.options].find(
      (o) => o.dataset.date === today
    );
    if (todayOpt) {
      reportDaySelect.value = todayOpt.value;
      await loadReportData(Number(todayOpt.value));
    } else {
      crLoading.classList.add("d-none");
    }
  } catch (err) {
    showError(`Failed to load convention days: ${err.message}`);
  }
}

// ── Auto-refresh ──────────────────────────────────────────────────────────────

/**
 * Silently re-fetch and re-render report data for the current day.
 * Keeps existing charts visible; spins the refresh icon while loading.
 * @returns {Promise<void>}
 */
async function refreshData() {
  if (!currentDayId) return;
  await loadReportData(currentDayId, true);
}

/**
 * Start (or restart) the 60-second auto-refresh interval.
 * Clears any existing interval first to prevent stacking.
 * @returns {void}
 */
function startAutoRefresh() {
  stopAutoRefresh();
  if (!currentDayId) return;
  refreshIntervalId = setInterval(refreshData, 60_000);
}

/**
 * Stop the auto-refresh interval.
 * @returns {void}
 */
function stopAutoRefresh() {
  if (refreshIntervalId != null) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

reportDaySelect.addEventListener("change", () => {
  const dayId = Number(reportDaySelect.value);
  stopAutoRefresh();
  if (dayId) {
    loadReportData(dayId);
  } else {
    currentDayId = null;
    if (crRefreshBtn) crRefreshBtn.disabled = true;
    crLoading.classList.add("d-none");
    crOverviewWrap?.classList.add("d-none");
    crGaragesWrap?.classList.add("d-none");
    crSummary.classList.add("d-none");
    crEmpty.classList.add("d-none");
  }
});

// Manual refresh button.
crRefreshBtn?.addEventListener("click", () => refreshData());

// Pause auto-refresh when the tab/window is hidden; resume and immediately
// catch up when it becomes visible again.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    stopAutoRefresh();
  } else if (currentDayId) {
    refreshData();
    startAutoRefresh();
  }
});

// ── Reset counts modal ────────────────────────────────────────────────────────

/** @type {import('bootstrap').Modal | null} */
let resetModal = null;

/** @type {{ locationId: number, locationName: string } | null} */
let pendingReset = null;

/**
 * Open the Bootstrap confirmation modal for the given location.
 * @param {number} locationId
 * @param {string} locationName
 * @returns {void}
 */
function openResetModal(locationId, locationName) {
  const modalEl = document.getElementById("resetCountsModal");
  if (!modalEl) return;
  pendingReset = { locationId, locationName };
  const nameEl = document.getElementById("resetLocationName");
  if (nameEl) nameEl.textContent = locationName;
  const errEl = document.getElementById("resetModalError");
  if (errEl) errEl.classList.add("d-none");
  if (!resetModal) resetModal = new bootstrap.Modal(modalEl);
  resetModal.show();
}

document.getElementById("confirmResetBtn")?.addEventListener("click", async () => {
  if (!pendingReset) return;
  const { locationId } = pendingReset;
  const dayId = Number(reportDaySelect.value);
  if (!dayId) return;

  const confirmBtn = /** @type {HTMLButtonElement} */ (
    document.getElementById("confirmResetBtn")
  );
  confirmBtn.disabled = true;

  try {
    const res  = await fetch(`/api/counts/location/${locationId}?dayId=${dayId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    resetModal?.hide();
    pendingReset = null;
    await loadReportData(dayId);
  } catch (err) {
    const errEl = document.getElementById("resetModalError");
    if (errEl) {
      errEl.textContent = `Reset failed: ${err.message}`;
      errEl.classList.remove("d-none");
    }
  } finally {
    confirmBtn.disabled = false;
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────

// When embedded as a tab, listen on the controlling button (shown.bs.tab fires
// on the button, not the pane). When standalone, initialise immediately.
// Also check if the tab is already active (e.g. ?tab=garage-capacity URL param
// activated it before this module ran).
const _tabPane = document.getElementById("countReportRoot")?.closest(".tab-pane");
if (_tabPane) {
  if (_tabPane.classList.contains("active")) {
    loadDays();
  } else {
    const _tabBtn = document.querySelector(`[data-bs-target="#${_tabPane.id}"]`);
    _tabBtn?.addEventListener("shown.bs.tab", () => loadDays(), { once: true });
  }
} else {
  loadDays();
}
