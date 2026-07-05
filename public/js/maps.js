/**
 * @file public/js/maps.js
 * @description Client-side logic for the /maps page.
 *
 * Responsibilities:
 *  - Format file last-modified dates from [data-raw] ISO timestamps.
 *  - Format file sizes from [data-bytes] values into human-readable strings.
 *  - Wire the "Sync Now" button (accessAdminConsole users only) to trigger
 *    an on-demand SharePoint -> Blob Storage sync via POST /api/maps/sync.
 */

/**
 * Format an ISO 8601 timestamp for display.
 * Returns a short locale date string, e.g. "Jul 3, 2026".
 *
 * @param {string} iso - ISO 8601 date string.
 * @returns {string}
 */
function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

/**
 * Format a file size in bytes into a human-readable string.
 * e.g. 1536 → "1.5 KB", 2097152 → "2.0 MB"
 *
 * @param {number} bytes
 * @returns {string}
 */
function fmtBytes(bytes) {
    if (!bytes || bytes <= 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Initialise all date and size spans on the maps page.
 *
 * @returns {void}
 */
function initMapsMeta() {
    document.querySelectorAll(".maps-tile-date[data-raw]").forEach((el) => {
        const raw = el.getAttribute("data-raw");
        const formatted = fmtDate(raw);
        if (formatted) {
            el.textContent = formatted;
        } else {
            el.remove();
        }
    });

    document.querySelectorAll(".maps-tile-size[data-bytes]").forEach((el) => {
        const bytes = parseInt(el.getAttribute("data-bytes"), 10);
        const formatted = fmtBytes(bytes);
        if (formatted) {
            el.textContent = formatted;
        } else {
            el.remove();
        }
    });
}

/**
 * Wire up the "Sync Now" button (visible only to accessAdminConsole users)
 * to POST /api/maps/sync and reload the page on success.
 *
 * @returns {void}
 */
function initMapsSync() {
    const btn = document.getElementById("mapsSyncBtn");
    const statusEl = document.getElementById("mapsSyncStatus");
    if (!btn) return;

    btn.addEventListener("click", async () => {
        const csrfToken =
            document.querySelector('meta[name="csrf-token"]')?.content || "";

        btn.disabled = true;
        const origLabel = btn.innerHTML;
        btn.innerHTML =
            '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Syncing\u2026';

        if (statusEl) {
            statusEl.className = "small mt-1 text-muted";
            statusEl.textContent = "Syncing files from SharePoint\u2026";
        }

        try {
            const res = await fetch("/api/maps/sync", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrfToken,
                },
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.message || `HTTP ${res.status}`);
            }

            const { added, updated, removed } = data.summary;
            if (statusEl) {
                statusEl.className = "small mt-1 text-success";
                statusEl.textContent = `\u2713 ${added} added, ${updated} updated, ${removed} removed. Reloading\u2026`;
            }

            setTimeout(() => window.location.reload(), 1200);
        } catch (err) {
            if (statusEl) {
                statusEl.className = "small mt-1 text-danger";
                statusEl.textContent = `Sync failed: ${err.message}`;
            }
            btn.disabled = false;
            btn.innerHTML = origLabel;
        }
    });
}

document.addEventListener("DOMContentLoaded", initMapsMeta);
document.addEventListener("DOMContentLoaded", initMapsSync);
