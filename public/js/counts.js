/**
 * @file public/js/counts.js
 * @description Client-side logic for the Parking Counter tally page.
 *
 * Features:
 *  - Auto-detect today's convention day; falls back to manual picker.
 *  - Location picker loaded from /api/counts/locations.
 *  - Tap button increments a monotonic running total; plays 880 Hz beep.
 *  - 60-second heartbeat POST to /api/counts/heartbeat.
 *  - Quarter-hour alarm (880 Hz + 1100 Hz two-tone) at :00/:15/:30/:45.
 *  - Submit POST to /api/counts/submit records the running total as a
 *    confirmed checkpoint (is_final = 1) WITHOUT resetting the local
 *    tally. This preserves the report's MAX-per-15min-bucket aggregation
 *    so multiple submits within a bucket don't overwrite earlier data.
 *  - Manual entry adds its value to the running total before submitting,
 *    so a user with a physical clicker can periodically fold their count
 *    in. Rows are still flagged is_manual = 1 for audit.
 *  - Wake Lock API keeps the screen on during counting.
 *  - Page Visibility API sends a catch-up heartbeat on tab restore.
 *  - sessionStorage persists state across refreshes and same-tab navigation,
 *    but is cleared when the tab or browser closes — so a new browsing
 *    session (e.g. a new user opening the shared COUNTER account in a
 *    fresh tab) always begins at the setup panel rather than inheriting
 *    the previous user's location and tally.
 *
 * @module counts
 */

// ── DOM refs ────────────────────────────────────────────────────────────────

const setupPanel = document.getElementById("setupPanel");
const countingPanel = document.getElementById("countingPanel");
const dayAutoRow = document.getElementById("dayAutoRow");
const dayAutoLabel = document.getElementById("dayAutoLabel");
const dayChangeBtn = document.getElementById("dayChangeBtn");
const dayNotice = document.getElementById("dayNotice");
const daySelect = document.getElementById("daySelect");
const locationSelect = document.getElementById("locationSelect");
const startBtn = document.getElementById("startBtn");
const setupError = document.getElementById("setupError");
const activeLocationName = document.getElementById("activeLocationName");
const changeSetupBtn = document.getElementById("changeSetupBtn");
const tapBtn = document.getElementById("tapBtn");
const countDisplay = document.getElementById("countDisplay");
const sessionTotalDisplay = document.getElementById("sessionTotalDisplay");
const submitBtn = document.getElementById("submitBtn");
const submitBanner = document.getElementById("submitBanner");
const submitBannerText = document.getElementById("submitBannerText");
const manualToggleBtn = document.getElementById("manualToggleBtn");
const manualEntry = document.getElementById("manualEntry");
const manualCountInput = /** @type {HTMLInputElement} */ (document.getElementById("manualCountInput"));
const manualSubmitBtn = document.getElementById("manualSubmitBtn");
const decrementBtn = document.getElementById("decrementBtn");
const subLocationWrap   = document.getElementById("subLocationWrap");
const subLocationSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById("subLocationSelect"));

// ── State ───────────────────────────────────────────────────────────────────

/**
 * Client-side counter state.
 *
 * `count` is a monotonic running total for the current (garage,
 * sub-location) session. Every tap, decrement, and manual-entry
 * increment updates it in place; submitting does NOT reset it.
 * `returnToSetup` resets it to 0 when the user changes garage or
 * entrance.
 *
 * `lastConfirmed` is the value of `count` at the moment of the last
 * successful is_final = 1 submission — displayed in the bottom bar so
 * the user can see how far they've counted since their last checkpoint.
 *
 * @typedef {{
 *   locationTaskId:  number | null,
 *   locationName:    string | null,
 *   conventionDayId: number | null,
 *   subLocationId:   number | null,
 *   subLocationName: string | null,
 *   count:           number,
 *   lastConfirmed:   number,
 *   active:          boolean,
 * }} CountState
 */

/** @type {CountState} */
const state = {
  locationTaskId:  null,
  locationName:    null,
  conventionDayId: null,
  subLocationId:   null,
  subLocationName: null,
  count:         0,
  lastConfirmed: 0,
  active:        false,
};

// ── sessionStorage ──────────────────────────────────────────────────────────
// sessionStorage (not localStorage) is deliberate: it survives F5, same-tab
// navigation, and Wake-Lock-induced background time, but a tab/browser close
// clears it. That matches the shared-account handoff model — a new browsing
// session begins fresh at the setup panel.

const STORAGE_KEY = "parkingCounter_state";

/**
 * Persist current state to sessionStorage.
 * @returns {void}
 */
function saveState() {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * Restore state from sessionStorage, or return null if absent / unreadable.
 * @returns {CountState | null}
 */
function loadSavedState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Remove persisted state from sessionStorage.
 * @returns {void}
 */
function clearSavedState() {
  sessionStorage.removeItem(STORAGE_KEY);
}

// ── Audio ───────────────────────────────────────────────────────────────────

/** @type {AudioContext | null} */
let audioCtx = null;

/**
 * Return (or lazily create) the shared AudioContext.
 * Resumes it if suspended — required after tab visibility changes.
 * @returns {AudioContext}
 */
function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Play a single sine-wave tone.
 * @param {number} freq       Frequency in Hz.
 * @param {number} duration   Duration in seconds.
 * @param {number} [gain]     Peak gain (0–1). Defaults to 0.3.
 * @returns {void}
 */
function playTone(freq, duration, gain = 0.3) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(gain, ctx.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

/**
 * Short 880 Hz beep played on each tap.
 * @returns {void}
 */
function playTapBeep() {
  playTone(880, 0.08);
}

/**
 * Two-tone quarter-hour alarm: 880 Hz then 1100 Hz.
 * @returns {void}
 */
function playAlarm() {
  playTone(880, 0.2);
  setTimeout(() => playTone(1100, 0.2), 240);
}

// ── Wake Lock ────────────────────────────────────────────────────────────────

/** @type {WakeLockSentinel | null} */
let wakeLock = null;

/**
 * Request a screen Wake Lock to prevent the device sleeping during counting.
 * @returns {Promise<void>}
 */
async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    // Wake Lock denied or unavailable — not fatal.
  }
}

/**
 * Release the active Wake Lock, if any.
 * @returns {void}
 */
function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

// ── Heartbeat ────────────────────────────────────────────────────────────────

/** @type {number | null} */
let heartbeatInterval = null;

/**
 * POST the current count to /api/counts/heartbeat.
 * Silently ignores errors — the next heartbeat will retry.
 * @returns {Promise<void>}
 */
async function sendHeartbeat() {
  if (!state.active) return;
  try {
    await fetch("/api/counts/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationTaskId:  state.locationTaskId,
        conventionDayId: state.conventionDayId,
        count:           state.count,
        subLocationId:   state.subLocationId,
      }),
    });
  } catch {
    // Network error — will retry on next interval.
  }
}

/**
 * Start the 60-second heartbeat interval.
 * Clears any existing interval first.
 * @returns {void}
 */
function startHeartbeat() {
  clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(sendHeartbeat, 60_000);
}

/**
 * Stop the heartbeat interval.
 * @returns {void}
 */
function stopHeartbeat() {
  clearInterval(heartbeatInterval);
  heartbeatInterval = null;
}

// ── Quarter-hour alarm ───────────────────────────────────────────────────────

/** @type {number | null} */
let alarmInterval = null;

/** Tracks the last minute the alarm fired to prevent duplicate plays. */
let lastAlarmMinute = -1;

/**
 * Start checking every 60 seconds whether it's a quarter-hour mark.
 * Plays the two-tone alarm at :00, :15, :30, and :45.
 * @returns {void}
 */
function startAlarm() {
  clearInterval(alarmInterval);
  lastAlarmMinute = -1;
  alarmInterval = setInterval(() => {
    if (!state.active) return;
    const m = new Date().getMinutes();
    if (m % 15 === 0 && m !== lastAlarmMinute) {
      lastAlarmMinute = m;
      playAlarm();
    }
  }, 60_000);
}

/**
 * Stop the quarter-hour alarm interval.
 * @returns {void}
 */
function stopAlarm() {
  clearInterval(alarmInterval);
  alarmInterval = null;
}

// ── UI transitions ───────────────────────────────────────────────────────────

/**
 * Switch from the setup panel to the counting panel.
 * Starts the heartbeat, alarm, and Wake Lock.
 * @returns {void}
 */
function enterCountingState() {
  state.active = true;
  setupPanel.classList.add("d-none");
  countingPanel.classList.remove("d-none");
  activeLocationName.textContent = state.subLocationName
    ? `${state.locationName} — ${state.subLocationName}`
    : (state.locationName ?? "");
  countDisplay.textContent = String(state.count);
  sessionTotalDisplay.textContent = String(state.lastConfirmed);
  saveState();
  requestWakeLock();
  startHeartbeat();
  startAlarm();
}

/**
 * Return from the counting panel to the setup panel.
 * Resets state and reloads setup data.
 * @returns {void}
 */
function returnToSetup() {
  state.active          = false;
  state.count           = 0;
  state.lastConfirmed   = 0;
  state.locationTaskId  = null;
  state.locationName    = null;
  state.conventionDayId = null;
  state.subLocationId   = null;
  state.subLocationName = null;
  stopHeartbeat();
  stopAlarm();
  releaseWakeLock();
  clearSavedState();

  countingPanel.classList.add("d-none");
  setupPanel.classList.remove("d-none");
  startBtn.disabled = true;

  // Reset setup UI for a fresh load.
  locationSelect.innerHTML = '<option value="">Loading…</option>';
  daySelect.innerHTML      = '<option value="">Select a day…</option>';
  daySelect.classList.add("d-none");
  dayAutoRow.classList.add("d-none");
  dayNotice.classList.add("d-none");
  setupError.classList.add("d-none");
  if (subLocationWrap)   subLocationWrap.classList.add("d-none");
  if (subLocationSelect) subLocationSelect.innerHTML = "";

  initSetup();
}

// ── Setup helpers ────────────────────────────────────────────────────────────

/**
 * Enable the Start button only when location, day, and (if visible) sub-location are selected.
 * @returns {void}
 */
function updateStartBtn() {
  const hasLocation = Boolean(locationSelect.value);
  const hasDay      = state.conventionDayId != null || Boolean(daySelect.value);
  const subVisible  = subLocationWrap && !subLocationWrap.classList.contains("d-none");
  const hasSubLoc   = !subVisible || Boolean(subLocationSelect?.value);
  startBtn.disabled = !(hasLocation && hasDay && hasSubLoc);
}

/**
 * Populate the location picker from the API.
 * @returns {Promise<void>}
 */
async function loadLocations() {
  const res = await fetch("/api/counts/locations");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load locations.");
  locationSelect.innerHTML =
    '<option value="">Select a location…</option>' +
    data.locations
      .map(
        (l) =>
          `<option value="${l.id}" data-name="${l.name}">${l.name} (cap: ${l.capacity})</option>`,
      )
      .join("");
  locationSelect.addEventListener("change", () => {
    // Reset and hide sub-location picker whenever location changes.
    if (subLocationWrap)   subLocationWrap.classList.add("d-none");
    if (subLocationSelect) subLocationSelect.innerHTML = "";
    state.subLocationId   = null;
    state.subLocationName = null;
    updateStartBtn();
    // Load sub-locations for the newly selected location.
    const locId = Number(locationSelect.value);
    if (locId) loadSubLocations(locId);
  });
}

/**
 * Fetch and show active sub-locations for a location.
 * Reveals the picker if sub-locations exist; hides it if none are configured
 * (the location can still be counted without one).
 *
 * @param {number} locationTaskId
 * @returns {Promise<void>}
 */
async function loadSubLocations(locationTaskId) {
  try {
    const res  = await fetch(`/api/counts/sub-locations?locationTaskId=${locationTaskId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    if (data.subLocations.length > 0) {
      if (subLocationSelect) {
        subLocationSelect.innerHTML =
          '<option value="">Select an entrance or section…</option>' +
          data.subLocations
            .map((s) => {
              const label = s.sub_type_name ? `${s.name} (${s.sub_type_name})` : s.name;
              return `<option value="${s.id}" data-name="${s.name}">${label}</option>`;
            })
            .join("");
        subLocationSelect.addEventListener("change", updateStartBtn, { once: true });
      }
      subLocationWrap?.classList.remove("d-none");
    } else {
      // No sub-locations configured — hide picker and proceed without one.
      subLocationWrap?.classList.add("d-none");
      state.subLocationId   = null;
      state.subLocationName = null;
    }
    updateStartBtn();
  } catch {
    // Non-fatal: hide picker and allow counting without a sub-location.
    subLocationWrap?.classList.add("d-none");
    updateStartBtn();
  }
}

/**
 * Populate the day picker from the API.
 * @returns {Promise<void>}
 */
async function loadDays() {
  const res  = await fetch("/api/counts/days");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load convention days.");
  daySelect.innerHTML =
    '<option value="">Select a day…</option>' +
    data.days
      .map((d) => `<option value="${d.id}">${d.label}</option>`)
      .join("");
  daySelect.addEventListener("change", updateStartBtn);
}

/**
 * Check whether today matches a convention day.
 * Shows the auto-detected day or the "not a convention day" notice + manual picker.
 * @returns {Promise<void>}
 */
async function loadToday() {
  const res = await fetch("/api/counts/today");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to detect today.");

  if (data.day) {
    state.conventionDayId = data.day.id;
    dayAutoLabel.textContent = data.day.label;
    dayAutoRow.classList.remove("d-none");
    updateStartBtn();
  } else {
    dayNotice.classList.remove("d-none");
    await loadDays();
    daySelect.classList.remove("d-none");
  }
}

/**
 * Load locations and detect today's day in parallel.
 * Called on first load and whenever the user returns to the setup panel.
 * @returns {Promise<void>}
 */
async function initSetup() {
  const [locResult, todayResult] = await Promise.allSettled([
    loadLocations(),
    loadToday(),
  ]);
  if (locResult.status === "rejected") {
    setupError.textContent =
      "Could not load parking locations. Please refresh.";
    setupError.classList.remove("d-none");
  }
  if (todayResult.status === "rejected") {
    // Non-fatal: fall back to showing the manual day picker.
    dayNotice.classList.remove("d-none");
    daySelect.classList.remove("d-none");
    loadDays().catch(() => {});
  }
}

// ── Submit ───────────────────────────────────────────────────────────────────

/** @type {number | null} */
let bannerTimer = null;

/**
 * Show a temporary banner below the submit button.
 * @param {string}  text       Banner message.
 * @param {boolean} [isError]  If true, renders in the error style.
 * @returns {void}
 */
function showBanner(text, isError = false) {
  clearTimeout(bannerTimer);
  submitBannerText.textContent = text;
  submitBanner.classList.toggle("counts-submit-banner--error", isError);
  submitBanner.classList.remove("d-none");
  bannerTimer = setTimeout(() => submitBanner.classList.add("d-none"), 5_000);
}

/**
 * POST the current running total as a confirmed checkpoint (is_final = 1).
 * Does NOT reset the local count — the running total is monotonic across
 * the counting session so the report's MAX-per-bucket aggregation reflects
 * every tap, and multiple submits in the same 15-minute window can't
 * overwrite each other.
 *
 * On success, updates `state.lastConfirmed` so the bottom-bar display
 * shows the value at the most recent checkpoint.
 *
 * @returns {Promise<void>}
 */
async function handleSubmit() {
  const submitted = state.count;
  submitBtn.disabled = true;
  try {
    const res = await fetch("/api/counts/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationTaskId:  state.locationTaskId,
        conventionDayId: state.conventionDayId,
        count:           submitted,
        subLocationId:   state.subLocationId,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    state.lastConfirmed = submitted;
    sessionTotalDisplay.textContent = String(state.lastConfirmed);
    saveState();
    showBanner(`Confirmed at ${submitted}`);
  } catch (err) {
    showBanner(`Submit failed: ${err.message}`, true);
  } finally {
    submitBtn.disabled = false;
  }
}

// ── Event listeners ──────────────────────────────────────────────────────────

tapBtn.addEventListener("click", () => {
  state.count++;
  countDisplay.textContent = String(state.count);
  saveState();
  playTapBeep();
});

// Decrement by 1, floor at 0 — for correcting accidental over-taps.
decrementBtn?.addEventListener("click", () => {
  if (state.count > 0) {
    state.count--;
    countDisplay.textContent = String(state.count);
    saveState();
  }
});

submitBtn.addEventListener("click", handleSubmit);

startBtn.addEventListener("click", () => {
  const opt = locationSelect.options[locationSelect.selectedIndex];
  state.locationTaskId  = Number(locationSelect.value);
  state.locationName    = opt.dataset.name || opt.text;
  if (!daySelect.classList.contains("d-none")) {
    state.conventionDayId = Number(daySelect.value);
  }
  // Capture sub-location when the picker is visible and a value is chosen.
  if (subLocationSelect?.value) {
    const subOpt          = subLocationSelect.options[subLocationSelect.selectedIndex];
    state.subLocationId   = Number(subLocationSelect.value);
    state.subLocationName = subOpt.dataset.name || subOpt.text;
  } else {
    state.subLocationId   = null;
    state.subLocationName = null;
  }
  enterCountingState();
});

changeSetupBtn.addEventListener("click", returnToSetup);

dayChangeBtn.addEventListener("click", async () => {
  state.conventionDayId = null;
  dayAutoRow.classList.add("d-none");
  if (daySelect.options.length <= 1) {
    await loadDays().catch(() => {});
  }
  daySelect.classList.remove("d-none");
  updateStartBtn();
});

// ── Manual count ──────────────────────────────────────────────────────────────

manualToggleBtn.addEventListener("click", () => {
  const expanded = manualToggleBtn.getAttribute("aria-expanded") === "true";
  manualToggleBtn.setAttribute("aria-expanded", String(!expanded));
  manualEntry.classList.toggle("d-none", expanded);
});

/**
 * Submit a manually-entered count.
 *
 * The value is a DELTA that folds into the running total: `state.count`
 * is incremented by the entered value before the POST, and the POST body
 * carries the new running total (not the raw delta). The server writes
 * a row with is_final = 1, is_manual = 1 — the manual flag preserves
 * audit trail but the value stored is the running total, which keeps
 * the report's MAX-per-bucket aggregation consistent with tap-flow
 * submits.
 *
 * Negatives are accepted for overcount corrections (per the note in the
 * UI). The running total will drop; future buckets will reflect the
 * corrected value. Within the same bucket as the overcount, the peak
 * remains what was recorded — corrections propagate forward, not
 * retroactively.
 *
 * @returns {Promise<void>}
 */
async function handleManualSubmit() {
  const value = parseInt(manualCountInput.value, 10);
  if (isNaN(value)) {
    manualCountInput.classList.add("is-invalid");
    return;
  }
  manualCountInput.classList.remove("is-invalid");
  manualSubmitBtn.disabled = true;

  const newTotal = state.count + value;

  try {
    const res = await fetch("/api/counts/manual-submit", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        locationTaskId:  state.locationTaskId,
        conventionDayId: state.conventionDayId,
        count:           newTotal,
        subLocationId:   state.subLocationId,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    state.count         = newTotal;
    state.lastConfirmed = newTotal;
    countDisplay.textContent        = String(state.count);
    sessionTotalDisplay.textContent = String(state.lastConfirmed);
    saveState();
    manualCountInput.value = "";
    manualEntry.classList.add("d-none");
    manualToggleBtn.setAttribute("aria-expanded", "false");
    showBanner(
      value >= 0
        ? `Manual +${value} · confirmed at ${newTotal}`
        : `Manual ${value} · confirmed at ${newTotal}`,
    );
  } catch (err) {
    showBanner(`Manual submit failed: ${err.message}`, true);
  } finally {
    manualSubmitBtn.disabled = false;
  }
}

manualSubmitBtn.addEventListener("click", handleManualSubmit);

// Page Visibility — beacon the current count when hiding (navigation away, tab
// switch, screen lock), and catch-up heartbeat + Wake Lock on restore.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && state.active) {
    // sendBeacon is guaranteed to deliver even as the page unloads.
    const body = JSON.stringify({
      locationTaskId:  state.locationTaskId,
      conventionDayId: state.conventionDayId,
      count:           state.count,
      subLocationId:   state.subLocationId,
    });
    navigator.sendBeacon(
      "/api/counts/heartbeat",
      new Blob([body], { type: "application/json" })
    );
  } else if (document.visibilityState === "visible" && state.active) {
    requestWakeLock();
    sendHeartbeat();
  }
});

// Release Wake Lock when the page is being unloaded.
window.addEventListener("pagehide", releaseWakeLock);

// ── Init ─────────────────────────────────────────────────────────────────────

/**
 * Entry point.
 *
 * On a fresh login, the server sets `data-force-selection="true"` on
 * `#countsRoot` (via a one-shot `req.session.forceCountsSelection` flag
 * consumed by GET /counts). When present, we drop any persisted state
 * before checking localStorage — this ensures the setup panel is shown
 * even if a prior user of a shared account (e.g. COUNTER role) left an
 * active tally behind. Subsequent in-session visits to /counts do NOT
 * carry the flag, so a user who navigates away and returns resumes
 * their session normally.
 *
 * Otherwise, restores from localStorage if an active session exists;
 * failing that, loads setup data (locations + today's day).
 *
 * @returns {Promise<void>}
 */
async function init() {
  const rootEl = document.getElementById("countsRoot");
  if (rootEl?.dataset.forceSelection === "true") {
    clearSavedState();
  }

  const saved = loadSavedState();
  if (saved?.active && saved.locationTaskId && saved.conventionDayId) {
    Object.assign(state, saved);
    enterCountingState();
    return;
  }
  await initSetup();
}

init();
