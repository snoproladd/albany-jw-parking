/**
 * @file volunteerSchedule.js
 * @description Client-side logic for the Volunteer Schedule report page.
 *
 * Handles:
 *   - Volunteer search (oversight mode) with debounced API typeahead
 *   - Day filter (show/hide day sections)
 *   - Crew/department filter (show/hide assignment cards)
 *   - Print button
 *   - Send modal (SMS / email) via POST /api/volunteer-schedule/:id/send
 */

document.addEventListener("DOMContentLoaded", () => {
  const mode =
    document.querySelector('meta[name="vs-mode"]')?.content || "self";
  const volId =
    document.querySelector('meta[name="vs-volunteer-id"]')?.content || null;
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || "";

  // ── Day filter ──────────────────────────────────────────────

  const dayPicker = document.getElementById("vs-day-picker");

  /**
   * Show/hide day sections based on the selected day filter.
   *
   * @returns {void}
   */
  function applyDayFilter() {
    const val = dayPicker?.value || "all";
    document.querySelectorAll(".vs-day").forEach((section) => {
      const dayId = section.dataset.dayId;
      section.style.display = val === "all" || dayId === val ? "" : "none";
    });
  }

  dayPicker?.addEventListener("change", applyDayFilter);

  // ── Crew / department filter ────────────────────────────────

  /**
   * Toggle assignment card visibility when a crew filter checkbox changes.
   *
   * @param {Event} e
   * @returns {void}
   */
  function onCrewFilterChange(e) {
    const deptKey = e.currentTarget.dataset.dept;
    const visible = e.currentTarget.checked;
    document
      .querySelectorAll(`.vs-assignment[data-dept="${deptKey}"]`)
      .forEach((card) => {
        card.style.display = visible ? "" : "none";
      });
  }

  document.querySelectorAll(".vs-crew-cb").forEach((cb) => {
    cb.addEventListener("change", onCrewFilterChange);
  });

  // ── Print button ────────────────────────────────────────────

  document.getElementById("vs-print-btn")?.addEventListener("click", () => {
    window.print();
  });

  // ── Volunteer search (oversight mode only) ──────────────────

  if (mode === "oversight") {
    const input = document.getElementById("vs-search-input");
    const resultsBox = document.getElementById("vs-search-results");
    let debounceTimer = null;
    let activeIndex = -1;
    let currentItems = [];

    /**
     * Fetch matching volunteers from the API.
     *
     * @param {string} query
     * @returns {Promise<Array<{id:number, firstName:string, lastName:string}>>}
     */
    async function searchVolunteers(query) {
      try {
        const res = await fetch(
          `/api/volunteers/search?q=${encodeURIComponent(query)}`,
          { headers: { "csrf-token": csrf } },
        );
        if (!res.ok) return [];
        const data = await res.json();
        return data.results || [];
      } catch {
        return [];
      }
    }

    /**
     * Render search result items in the dropdown.
     *
     * @param {Array<{id:number, firstName:string, lastName:string}>} items
     * @returns {void}
     */
    function renderResults(items) {
      currentItems = items;
      activeIndex = -1;

      if (items.length === 0) {
        resultsBox.innerHTML = "";
        resultsBox.classList.remove("is-open");
        return;
      }

      resultsBox.innerHTML = items
        .map(
          (v, i) =>
            `<div class="vs-search-item" data-index="${i}" data-id="${v.id}">${v.lastName}, ${v.firstName}</div>`,
        )
        .join("");
      resultsBox.classList.add("is-open");

      resultsBox.querySelectorAll(".vs-search-item").forEach((el) => {
        el.addEventListener("mousedown", (e) => {
          e.preventDefault();
          navigateToVolunteer(el.dataset.id);
        });
      });
    }

    /**
     * Navigate to the volunteer schedule page for the given ID.
     *
     * @param {string|number} id
     * @returns {void}
     */
    function navigateToVolunteer(id) {
      window.location.href = `/oversight/tools/volunteer-schedule?volunteerId=${id}`;
    }

    /**
     * Highlight the active search result item.
     *
     * @returns {void}
     */
    function updateActiveItem() {
      resultsBox.querySelectorAll(".vs-search-item").forEach((el, i) => {
        el.classList.toggle("is-active", i === activeIndex);
      });
    }

    input?.addEventListener("input", () => {
      const q = input.value.trim();
      clearTimeout(debounceTimer);

      if (q.length < 2) {
        renderResults([]);
        return;
      }

      debounceTimer = setTimeout(async () => {
        const results = await searchVolunteers(q);
        renderResults(results);
      }, 250);
    });

    input?.addEventListener("keydown", (e) => {
      if (!currentItems.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, currentItems.length - 1);
        updateActiveItem();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        updateActiveItem();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex >= 0 && currentItems[activeIndex]) {
          navigateToVolunteer(currentItems[activeIndex].id);
        }
      } else if (e.key === "Escape") {
        renderResults([]);
        input.blur();
      }
    });

    input?.addEventListener("blur", () => {
      setTimeout(() => renderResults([]), 150);
    });

    input?.addEventListener("focus", () => {
      if (input.value.trim().length >= 2 && currentItems.length) {
        resultsBox.classList.add("is-open");
      }
    });
  }

  // ── Send schedule ───────────────────────────────────────────

  document
    .getElementById("vsSendConfirmBtn")
    ?.addEventListener("click", async () => {
      const targetId = document.getElementById("vs-send-btn")?.dataset.volId;
      const channel = document.querySelector(
        'input[name="sendChannel"]:checked',
      )?.value;
      const btn = document.getElementById("vsSendConfirmBtn");
      const errEl = document.getElementById("vsSendError");
      const okEl = document.getElementById("vsSendSuccess");

      if (!targetId || !channel) return;

      errEl.classList.add("d-none");
      errEl.textContent = "";
      okEl.classList.add("d-none");
      okEl.textContent = "";

      btn.disabled = true;
      btn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Sending…';

      try {
        const res = await fetch(`/api/volunteer-schedule/${targetId}/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "csrf-token": csrf,
          },
          body: JSON.stringify({ channel }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || `Server error ${res.status}`);
        }

        okEl.textContent =
          channel === "sms"
            ? "Schedule sent via SMS."
            : "Schedule sent via email.";
        okEl.classList.remove("d-none");

        btn.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i>Sent';
        btn.disabled = true;

        document.getElementById("vsSendModal")?.addEventListener(
          "hidden.bs.modal",
          () => {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane me-1"></i>Send';
            errEl.classList.add("d-none");
            okEl.classList.add("d-none");
          },
          { once: true },
        );
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove("d-none");
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane me-1"></i>Send';
      }
    });
});
