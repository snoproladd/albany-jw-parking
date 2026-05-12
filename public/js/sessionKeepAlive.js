/**
 * @file sessionKeepAlive.js
 * @description Resets the server-side session timer while the user is active.
 *
 * Behaviour:
 *  - Listens for user activity events (mouse, keyboard, scroll, touch).
 *  - Debounces activity into a ping to /api/session/touch at most once
 *    every PING_INTERVAL_MS (2 minutes).
 *  - Shows a warning modal when the session has been idle for
 *    WARN_AFTER_MS (13 minutes), giving the user a 2-minute countdown.
 *  - If the touch endpoint returns 401, redirects to /login immediately.
 *  - Only active when a user is authenticated (data-authed="true" on <body>).
 */

(() => {
  "use strict";

  /** Session lifetime in ms — must match index.js maxAge. */
  const SESSION_MS = 15 * 60 * 1000;
  /** Show warning this many ms before expiry. */
  const WARN_BEFORE_MS = 2 * 60 * 1000;
  /** Warn when idle for this long. */
  const WARN_AFTER_MS = SESSION_MS - WARN_BEFORE_MS; // 13 min
  /** Minimum interval between server pings. */
  const PING_INTERVAL_MS = 2 * 60 * 1000; // 2 min

  // Only run when the user is logged in
  if (document.body.dataset.authed !== "true") return;

  // ── State ────────────────────────────────────────────────────────────
  let lastActivity = Date.now();
  let lastPing = Date.now();
  let warnShown = false;
  let countdownTimer = null;
  let checkTimer = null;

  // ── Warning modal (injected into DOM) ────────────────────────────────

  /**
   * Inject the session warning modal if it doesn't already exist.
   * @returns {HTMLElement} the modal element
   */
  function ensureModal() {
    let modal = document.getElementById("sessionWarnModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "sessionWarnModal";
    modal.className = "modal fade";
    modal.tabIndex = -1;
    modal.setAttribute("data-bs-backdrop", "static");
    modal.setAttribute("aria-labelledby", "sessionWarnLabel");
    modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header bg-warning text-dark">
                        <h5 class="modal-title" id="sessionWarnLabel">
                            <i class="fa-solid fa-clock me-2"></i>Session Expiring Soon
                        </h5>
                    </div>
                    <div class="modal-body">
                        <p class="mb-2">
                            You've been inactive for a while. Your session will expire in
                            <strong id="sessionCountdown">2:00</strong>.
                        </p>
                        <p class="mb-0 text-muted small">
                            Click <strong>Stay Logged In</strong> to continue, or your
                            session will end automatically.
                        </p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-warning" id="sessionStayBtn">
                            <i class="fa-solid fa-rotate-right me-1"></i>Stay Logged In
                        </button>
                        <a href="/logout" class="btn btn-outline-secondary">
                            Log Out Now
                        </a>
                    </div>
                </div>
            </div>`;
    document.body.appendChild(modal);

    document.getElementById("sessionStayBtn").addEventListener("click", () => {
      dismissWarning();
      pingServer();
    });

    return modal;
  }

  // ── Countdown display ────────────────────────────────────────────────

  /**
   * Format milliseconds as M:SS.
   * @param {number} ms
   * @returns {string}
   */
  function formatMs(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  /**
   * Start the 2-minute countdown display inside the modal.
   * @param {number} expiresAt - timestamp when session expires
   */
  function startCountdown(expiresAt) {
    const el = document.getElementById("sessionCountdown");
    if (!el) return;

    if (countdownTimer) clearInterval(countdownTimer);

    countdownTimer = setInterval(() => {
      const remaining = expiresAt - Date.now();
      if (el) el.textContent = formatMs(remaining);
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        window.location.href = "/login?expired=1";
      }
    }, 1000);
  }

  /**
   * Show the session warning modal.
   * @param {number} expiresAt
   */
  function showWarning(expiresAt) {
    if (warnShown) return;
    warnShown = true;

    const modalEl = ensureModal();
    const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    bsModal.show();
    startCountdown(expiresAt);
  }

  /**
   * Hide the warning modal and clear the countdown.
   */
  function dismissWarning() {
    warnShown = false;
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }

    const modalEl = document.getElementById("sessionWarnModal");
    if (modalEl) {
      bootstrap.Modal.getInstance(modalEl)?.hide();
    }
  }

  // ── Server ping ───────────────────────────────────────────────────────

  /**
   * Ping /api/session/touch to reset the server-side session timer.
   * Redirects to /login if the session has already expired (401).
   */
  async function pingServer() {
    try {
      const resp = await fetch("/api/session/touch", {
        method: "GET",
        credentials: "same-origin",
      });

      if (resp.status === 401) {
        window.location.href = "/login?expired=1";
        return;
      }

      if (resp.ok) {
        lastPing = Date.now();
        lastActivity = Date.now();
        dismissWarning();
      }
    } catch {
      // Network error — don't redirect, could be a transient blip
    }
  }

  // ── Activity tracking ─────────────────────────────────────────────────

  /** Record user activity and ping the server if enough time has passed. */
  function onActivity() {
    lastActivity = Date.now();

    // Dismiss warning immediately on any activity
    if (warnShown) {
      dismissWarning();
      pingServer();
      return;
    }

    // Throttle pings to at most once per PING_INTERVAL_MS
    if (Date.now() - lastPing >= PING_INTERVAL_MS) {
      pingServer();
    }
  }

  // Attach activity listeners — passive where possible for performance
  [
    "mousemove",
    "mousedown",
    "keydown",
    "scroll",
    "touchstart",
    "click",
  ].forEach((evt) => {
    window.addEventListener(evt, onActivity, { passive: true });
  });

  // ── Idle check loop ───────────────────────────────────────────────────

  /**
   * Periodically check how long since last activity and show the
   * warning modal when the idle threshold is reached.
   */
  function startIdleCheck() {
    checkTimer = setInterval(() => {
      const idleMs = Date.now() - lastActivity;
      const expiresAt = lastActivity + SESSION_MS;

      if (idleMs >= WARN_AFTER_MS && !warnShown) {
        showWarning(expiresAt);
      }
    }, 30_000); // check every 30 seconds
  }

  startIdleCheck();
})();
