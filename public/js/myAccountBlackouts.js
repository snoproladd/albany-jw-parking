// public/js/myAccountBlackouts.js
/**
 * @file Self-service blackout-window management for the My Account page.
 *
 * Wires the day picker, fetches / creates / deletes blackout windows
 * via the /api/my-account/blackouts endpoints. The volunteer can only
 * manage their own blackouts — ownership is enforced server-side.
 */

document.addEventListener("DOMContentLoaded", () => {
  const daySelect = document.getElementById("bkDaySelect");
  const listEl = document.getElementById("bkList");
  const addForm = document.getElementById("bkAddForm");
  const startInput = document.getElementById("bkStart");
  const endInput = document.getElementById("bkEnd");
  const reasonInput = document.getElementById("bkReason");
  const addBtn = document.getElementById("bkAddBtn");
  const statusEl = document.getElementById("bkFormStatus");

  if (!daySelect || !listEl) return;

  /**
   * Retrieve the CSRF token from the hidden input on the page.
   * @returns {string}
   */
  function getCsrf() {
    return document.querySelector('input[name="_csrf"]')?.value || "";
  }

  /**
   * Convert an HH:MM string from an input[type="time"] to minutes
   * from midnight.
   * @param {string} str - "HH:MM" value.
   * @returns {number} Minutes since midnight.
   */
  function timeToMins(str) {
    const [h, m] = (str || "").split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  /**
   * Format minutes from midnight as "h:MM AM/PM".
   * @param {number} mins - Minutes since midnight.
   * @returns {string} Formatted time string.
   */
  function fmtMins(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const ap = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ap}`;
  }

  /**
   * Render a list of blackout rows into the list container.
   *
   * @param {Array<{id:number, start_mins:number, end_mins:number, reason:string|null}>} blackouts
   * @param {number} dayId - Currently selected convention day id.
   * @returns {void}
   */
  function renderList(blackouts, dayId) {
    listEl.innerHTML = "";

    if (blackouts.length === 0) {
      const p = document.createElement("p");
      p.classList.add("text-muted", "small", "mb-0");
      p.textContent = "No blackouts for this day.";
      listEl.appendChild(p);
      return;
    }

    const table = document.createElement("table");
    table.classList.add("table", "table-sm", "table-hover", "small", "mb-0");
    table.innerHTML = `
            <thead class="table-light">
                <tr><th>Time Range</th><th>Reason</th><th></th></tr>
            </thead>`;
    const tbody = document.createElement("tbody");

    for (const bk of blackouts) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
                <td class="text-nowrap fw-semibold">${fmtMins(bk.start_mins)} – ${fmtMins(bk.end_mins)}</td>
                <td class="text-muted">${bk.reason || "—"}</td>
                <td class="text-end">
                    <button type="button"
                        class="btn btn-outline-danger btn-sm bk-del-btn"
                        data-id="${bk.id}"
                        data-start="${bk.start_mins}"
                        data-end="${bk.end_mins}">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </td>`;
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    listEl.appendChild(table);

    // Wire delete buttons
    tbody.querySelectorAll(".bk-del-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          const res = await fetch(
            `/api/my-account/blackouts/${btn.dataset.id}`,
            {
              method: "DELETE",
              headers: { "X-CSRF-Token": getCsrf() },
            },
          );
          const data = await res.json().catch(() => ({}));
          if (data.success) {
            await loadList(dayId);
          }
        } catch (err) {
          console.error("[myAccountBlackouts] delete error:", err);
          btn.disabled = false;
        }
      });
    });
  }

  /**
   * Fetch and render blackouts for the selected day.
   *
   * @param {number} dayId - Convention day id.
   * @returns {Promise<void>}
   */
  async function loadList(dayId) {
    if (!dayId) return;

    listEl.innerHTML =
      '<p class="text-muted small"><span class="spinner-border spinner-border-sm me-1"></span>Loading…</p>';
    try {
      const res = await fetch(`/api/my-account/blackouts?dayId=${dayId}`);
      const data = await res.json().catch(() => ({}));
      renderList(data.blackouts || [], dayId);
    } catch {
      listEl.innerHTML =
        '<p class="text-danger small">Failed to load blackouts.</p>';
    }
  }

  // Day picker change
  daySelect.addEventListener("change", async () => {
    const dayId = Number(daySelect.value);
    if (!dayId) {
      listEl.innerHTML = "";
      addForm?.classList.add("d-none");
      return;
    }
    addForm?.classList.remove("d-none");
    await loadList(dayId);
  });

  // Add button
  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      const dayId = Number(daySelect.value);
      const startVal = /** @type {HTMLInputElement} */ (startInput)?.value;
      const endVal = /** @type {HTMLInputElement} */ (endInput)?.value;

      if (!startVal || !endVal) {
        if (statusEl) {
          statusEl.textContent = "Start and end times are required.";
          statusEl.className = "small text-danger";
        }
        return;
      }

      const startMins = timeToMins(startVal);
      const endMins = timeToMins(endVal);

      if (endMins <= startMins) {
        if (statusEl) {
          statusEl.textContent = "End must be after start.";
          statusEl.className = "small text-danger";
        }
        return;
      }

      if (statusEl) {
        statusEl.textContent = "Saving…";
        statusEl.className = "small text-muted";
      }
      addBtn.disabled = true;

      try {
        const res = await fetch("/api/my-account/blackouts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrf(),
          },
          body: JSON.stringify({
            conventionDayId: dayId,
            startMins,
            endMins,
            reason:
              /** @type {HTMLInputElement} */ (reasonInput)?.value.trim() ||
              null,
          }),
        });
        const data = await res.json().catch(() => ({}));

        if (data.success) {
          /** @type {HTMLInputElement} */ (startInput).value = "";
          /** @type {HTMLInputElement} */ (endInput).value = "";
          /** @type {HTMLInputElement} */ (reasonInput).value = "";
          if (statusEl) statusEl.textContent = "";
          await loadList(dayId);
        } else {
          if (statusEl) {
            statusEl.textContent = data.error || "Failed to save.";
            statusEl.className = "small text-danger";
          }
        }
      } catch (err) {
        console.error("[myAccountBlackouts] create error:", err);
        if (statusEl) {
          statusEl.textContent = "Network error.";
          statusEl.className = "small text-danger";
        }
      } finally {
        addBtn.disabled = false;
      }
    });
  }
});
