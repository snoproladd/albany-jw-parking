// public/js/permissionMatrix.js
// -----------------------------------------------------------------------------
// Permission matrix toggle handler for /oversight/tools/permissions.
// Reads CSRF token from <meta name="csrf-token">.
// Saves each toggle change immediately via AJAX POST.
// Manages the per-cell DB override badge (amber) — adds on override,
// removes when value is reset to factory default.
// -----------------------------------------------------------------------------

(() => {
  "use strict";

  /**
   * Read the CSRF token from the page's <meta name="csrf-token"> tag.
   * @returns {string}
   */
  function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content || "";
  }

  /** @type {HTMLElement | null} */
  const saveStatus = document.getElementById("saveStatus");

  /** @type {Map<string, AbortController>} */
  const inFlight = new Map();

  /**
   * Show a transient status message in #saveStatus.
   * "secondary" type (Saving…) persists until replaced.
   * "success" and "danger" auto-clear after 2.5s.
   *
   * @param {string} msg
   * @param {"success"|"danger"|"secondary"} [type]
   */
  function flashStatus(msg, type = "secondary") {
    if (!saveStatus) return;

    const iconMap = {
      success: "circle-check",
      danger: "triangle-exclamation",
      secondary: "spinner fa-spin",
    };

    saveStatus.innerHTML = `
            <span class="badge bg-${type} saving-indicator">
                <i class="fa-solid fa-${iconMap[type]} me-1"></i>${msg}
            </span>`;

    if (type !== "secondary") {
      setTimeout(() => {
        if (saveStatus) saveStatus.innerHTML = "";
      }, 2500);
    }
  }

  /**
   * Persist a single permission toggle change via AJAX.
   * On success:
   *   - If server signals removedOverride=true, removes the DB badge from the cell.
   *   - Otherwise ensures the DB badge is present.
   * On failure, reverts the toggle to its previous state.
   *
   * @param {HTMLInputElement} toggle
   * @returns {Promise<void>}
   */
  async function saveToggle(toggle) {
    const roleName = toggle.dataset.role;
    const permission = toggle.dataset.permission;
    const isGranted = toggle.checked;
    const key = `${roleName}.${permission}`;

    // Cancel any in-flight request for the same cell
    if (inFlight.has(key)) {
      inFlight.get(key).abort();
    }

    const controller = new AbortController();
    inFlight.set(key, controller);

    toggle.disabled = true;
    flashStatus("Saving…");

    try {
      const res = await fetch("/oversight/tools/permissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
        },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({ roleName, permission, isGranted }),
      });

      const data = await res.json().catch(() => ({}));

      if (data.success) {
        flashStatus("Saved", "success");

        const switchDiv = toggle.parentElement;
        const existing = switchDiv ? switchDiv.querySelector(".badge") : null;

        if (data.removedOverride) {
          // Value now matches factory default — no active override, remove badge
          if (existing) existing.remove();
        } else {
          // Active DB override — ensure badge is present
          if (!existing) {
            const badge = document.createElement("span");
            badge.className =
              "badge bg-warning text-dark saving-indicator ms-1";
            badge.title = "DB override active";
            badge.innerHTML = '<i class="fa-solid fa-database"></i>';
            switchDiv.appendChild(badge);
          }
        }
      } else {
        flashStatus(data.error || "Save failed", "danger");
        toggle.checked = !isGranted;
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("saveToggle error:", err);
        flashStatus("Save failed", "danger");
        toggle.checked = !isGranted;
      }
    } finally {
      toggle.disabled = false;
      inFlight.delete(key);
    }
  }

  // Wire all toggles on DOMContentLoaded
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".perm-toggle").forEach((toggle) => {
      toggle.addEventListener("change", () =>
        saveToggle(/** @type {HTMLInputElement} */ (toggle)),
      );
    });
  });
})();
