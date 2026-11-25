/**
 * @file capacityAlerts.js
 * @description Client-side logic for the Capacity Alerts management page.
 * Loads rules and send history, and drives the create/edit/delete modal.
 */

(function () {
  "use strict";

  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || "";
  const rulesTbody = document.getElementById("ca-rules-tbody");
  const logTbody = document.getElementById("ca-log-tbody");
  const modalEl = document.getElementById("ca-rule-modal");
  const modal = new bootstrap.Modal(modalEl);
  const form = document.getElementById("ca-rule-form");
  const deleteBtn = document.getElementById("ca-delete-btn");
  const saveBtn = document.getElementById("ca-save-btn");
  const locationSelect = document.getElementById("ca-location");
  const subLocationSelect = document.getElementById("ca-sub-location");
  const killSwitchToggle = document.getElementById("ca-kill-switch-toggle");
  const killSwitchStatus = document.getElementById("ca-kill-switch-status");
  const selectAllCheckbox = document.getElementById("ca-select-all");
  const bulkToolbar = document.getElementById("ca-bulk-toolbar");
  const bulkCountLabel = document.getElementById("ca-bulk-count");
  const bulkEnableBtn = document.getElementById("ca-bulk-enable-btn");
  const bulkDisableBtn = document.getElementById("ca-bulk-disable-btn");

  let rulesCache = [];
  const selectedIds = new Set();

  /**
   * Perform a fetch call with JSON body/headers and CSRF token attached.
   *
   * @param {string} url
   * @param {string} method
   * @param {object} [body]
   * @returns {Promise<object>}
   */
  async function apiCall(url, method, body) {
    const opts = {
      method,
      headers: { "Content-Type": "application/json", "CSRF-Token": csrfToken },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return res.json();
  }

  /**
   * Format a threshold for table display.
   *
   * @param {{ threshold_type: string, threshold_value: number, capacity: number|null }} rule
   * @returns {string}
   */
  function formatThreshold(rule) {
    if (rule.threshold_type === "percent") {
      const limit = rule.capacity
        ? Math.ceil((rule.threshold_value / 100) * rule.capacity)
        : "?";
      return `${rule.threshold_value}% (${limit} vehicles)`;
    }
    return `${rule.threshold_value} vehicles`;
  }

  /**
   * Render the rules table from the cached rule list.
   *
   * @returns {void}
   */
  function renderRules() {
    if (rulesCache.length === 0) {
      rulesTbody.innerHTML =
        '<tr><td colspan="7" class="text-center text-muted py-4">No rules defined yet.</td></tr>';
      return;
    }

    rulesTbody.innerHTML = "";
    rulesCache.forEach((rule) => {
      const tr = document.createElement("tr");

      const statusBadgeClass = !rule.active
        ? "bg-secondary"
        : rule.is_armed
          ? "bg-success"
          : "bg-warning text-dark";
      const statusLabel = !rule.active
        ? "Inactive"
        : rule.is_armed
          ? "Armed"
          : "Waiting to re-arm";

      tr.innerHTML = `
                <td><input type="checkbox" class="ca-row-checkbox" data-id="${rule.id}" ${selectedIds.has(rule.id) ? "checked" : ""} aria-label="Select rule" /></td>
                <td>${rule.location_name}</td>
                <td>${rule.sub_location_name || '<span class="text-muted">Whole location</span>'}</td>
                <td>${formatThreshold(rule)}</td>
                <td>${rule.direction === "above" ? "Rising to/above" : "Dropping to/below"}</td>
                <td>${escapeHtml(rule.position_names) || '<span class="text-danger">Nobody</span>'}</td>
                <td><span class="badge ${statusBadgeClass}">${statusLabel}</span></td>
                <td class="text-end">
                    <button type="button" class="btn btn-sm btn-outline-primary ca-edit-btn" data-id="${rule.id}">Edit</button>
                </td>
            `;
      rulesTbody.appendChild(tr);
    });

    document.querySelectorAll(".ca-edit-btn").forEach((btn) => {
      btn.addEventListener("click", () =>
        openEditModal(Number(btn.dataset.id)),
      );
    });

    document.querySelectorAll(".ca-row-checkbox").forEach((cb) => {
      cb.addEventListener("change", () => {
        const id = Number(cb.dataset.id);
        if (cb.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        updateBulkToolbar();
      });
    });

    updateBulkToolbar();
  }

  /**
   * Show/hide the bulk action toolbar and update its selected-count label
   * based on the current selection. Also keeps the "select all" checkbox
   * in sync (checked, unchecked, or indeterminate).
   *
   * @returns {void}
   */
  function updateBulkToolbar() {
    const count = selectedIds.size;
    bulkToolbar.classList.toggle("d-none", count === 0);
    bulkToolbar.classList.toggle("d-flex", count > 0);
    bulkCountLabel.textContent = `${count} selected`;

    if (rulesCache.length === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    } else if (count === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    } else if (count === rulesCache.length) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    }
  }

  /**
   * Load and render the kill switch's current state.
   *
   * @returns {Promise<void>}
   */
  async function loadKillSwitch() {
    try {
      const state = await apiCall("/api/capacity-alerts/kill-switch", "GET");
      killSwitchToggle.checked = state.enabled;
      renderKillSwitchStatus(state);
    } catch (err) {
      console.error("Failed to load kill switch state:", err);
    }
  }

  /**
   * Render the kill switch's status line (who/when it was last flipped on).
   *
   * @param {{ enabled: boolean, enabledBy: number|null, enabledAt: string|null }} state
   * @returns {void}
   */
  function renderKillSwitchStatus(state) {
    if (!state.enabled) {
      killSwitchStatus.classList.add("d-none");
      killSwitchStatus.textContent = "";
      return;
    }
    const when = state.enabledAt
      ? new Date(state.enabledAt).toLocaleString()
      : "unknown time";
    killSwitchStatus.textContent = `All alerts are paused (enabled ${when}). No SMS will send until this is turned back off.`;
    killSwitchStatus.classList.remove("d-none");
  }

  /**
   * HTML for a send's Delivered cell, from row.delivery (texts tracked
   * through Twilio's status callbacks): "3 of 4 delivered", how many are
   * still pending or untracked, and who it did not reach and why.
   * Sends from before delivery tracking (delivery null) show a dash.
   *
   * @param {{ delivered: number, pending: number, failed: number, untracked: number,
   *           failures: Array<{ name: string, reason: string }> }|null} d
   * @returns {string}
   */
  function deliveryCell(d) {
    if (!d) return '<span class="text-muted">\u2014</span>';
    const total = d.delivered + d.pending + d.failed + d.untracked;
    if (total === 0) return '<span class="text-muted">\u2014</span>';
    const parts = [
      `<span class="${d.failed ? "text-danger" : "text-success"} fw-semibold">${d.delivered} of ${total} delivered</span>`,
    ];
    if (d.pending) parts.push(`<span class="ca-delivery-note">${d.pending} pending</span>`);
    if (d.untracked) parts.push(`<span class="ca-delivery-note">${d.untracked} not tracked</span>`);
    if (d.failures && d.failures.length) {
      const items = d.failures
        .map((f) => `<li>${escapeHtml(f.name)}: ${escapeHtml(f.reason)}</li>`)
        .join("");
      parts.push(`<ul class="ca-delivery-failures">${items}</ul>`);
    }
    return parts.join("");
  }

  /**
   * Render the send history table.
   *
   * @param {Array} log
   * @returns {void}
   */
  function renderLog(log) {
    if (log.length === 0) {
      logTbody.innerHTML =
        '<tr><td colspan="6" class="text-center text-muted py-3">No alerts sent yet.</td></tr>';
      return;
    }

    logTbody.innerHTML = "";
    log.forEach((row) => {
      const tr = document.createElement("tr");
      const sentAt = new Date(row.sent_at).toLocaleString();
      const statusClass =
        row.status === "sent" ? "text-success" : "text-danger";
      tr.innerHTML = `
                <td>${escapeHtml(sentAt)}</td>
                <td>${escapeHtml(row.location_name)}</td>
                <td>${escapeHtml(row.triggered_count)}</td>
                <td>${escapeHtml(row.recipient_count)}</td>
                <td class="${statusClass}">${escapeHtml(row.status)}</td>
                <td>${deliveryCell(row.delivery)}</td>
            `;
      logTbody.appendChild(tr);
    });
  }

  /**
   * Populate the sub-location dropdown for the currently selected location.
   *
   * @param {number} locationTaskId
   * @param {number|null} [selectedId]
   * @returns {Promise<void>}
   */
  async function loadSubLocations(locationTaskId, selectedId) {
    subLocationSelect.innerHTML = '<option value="">Whole location</option>';
    if (!locationTaskId) return;

    try {
      const data = await apiCall(
        `/api/counts/sub-locations?locationTaskId=${locationTaskId}`,
        "GET",
      );
      (data.subLocations || []).forEach((sub) => {
        const opt = document.createElement("option");
        opt.value = sub.id;
        opt.textContent = sub.name;
        if (selectedId && Number(selectedId) === sub.id) opt.selected = true;
        subLocationSelect.appendChild(opt);
      });
    } catch (err) {
      console.error("Failed to load sub-locations:", err);
    }
  }

  /**
   * Escape text for use inside HTML built with innerHTML.
   *
   * @param {unknown} value
   * @returns {string}
   */
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * The ids of the ticked "Notify" positions (phase 3d-5).
   *
   * @returns {number[]}
   */
  function getCheckedPositions() {
    return [...document.querySelectorAll(".ca-position-checkbox:checked")]
      .map((el) => Number(el.value))
      .filter((n) => Number.isInteger(n) && n > 0);
  }

  /**
   * Tick exactly the given "Notify" positions.
   *
   * @param {number[]} ids
   * @returns {void}
   */
  function setCheckedPositions(ids) {
    const wanted = new Set(ids.map(Number));
    document.querySelectorAll(".ca-position-checkbox").forEach((el) => {
      el.checked = wanted.has(Number(el.value));
    });
  }

  /**
   * Reset the modal form to its "new rule" state.
   *
   * @returns {void}
   */
  function resetForm() {
    form.reset();
    document.getElementById("ca-rule-id").value = "";
    document.getElementById("ca-rule-modal-title").textContent = "New Rule";
    deleteBtn.classList.add("d-none");
    subLocationSelect.innerHTML = '<option value="">Whole location</option>';
  }

  /**
   * Open the modal pre-filled for editing an existing rule.
   *
   * @param {number} id
   * @returns {Promise<void>}
   */
  async function openEditModal(id) {
    const rule = rulesCache.find((r) => r.id === id);
    if (!rule) return;

    resetForm();
    document.getElementById("ca-rule-modal-title").textContent = "Edit Rule";
    document.getElementById("ca-rule-id").value = rule.id;
    locationSelect.value = rule.location_task_id;
    document.getElementById("ca-threshold-type").value = rule.threshold_type;
    document.getElementById("ca-threshold-value").value = rule.threshold_value;
    document.getElementById("ca-direction").value = rule.direction;
    setCheckedPositions(rule.position_ids || []);
    document.getElementById("ca-message-override").value =
      rule.message_override || "";
    document.getElementById("ca-active").checked = rule.active;
    deleteBtn.classList.remove("d-none");
    deleteBtn.dataset.id = rule.id;

    await loadSubLocations(rule.location_task_id, rule.sub_location_id);
    modal.show();
  }

  /**
   * Load rules and log data, then render both tables.
   *
   * @returns {Promise<void>}
   */
  async function loadAll() {
    try {
      const [rulesData, logData] = await Promise.all([
        apiCall("/api/capacity-alerts", "GET"),
        apiCall("/api/capacity-alerts/log", "GET"),
      ]);
      rulesCache = rulesData.rules || [];
      renderRules();
      renderLog(logData.log || []);
    } catch (err) {
      rulesTbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">${err.message}</td></tr>`;
    }
  }

  document.getElementById("ca-new-rule-btn").addEventListener("click", () => {
    resetForm();
    modal.show();
  });

  killSwitchToggle.addEventListener("change", async () => {
    const enabling = killSwitchToggle.checked;
    const confirmMsg = enabling
      ? "Pause ALL capacity alerts immediately? No SMS will send for any location until you turn this back off."
      : "Resume capacity alerts? Rules will fire normally again as thresholds are crossed.";
    if (!confirm(confirmMsg)) {
      killSwitchToggle.checked = !enabling;
      return;
    }
    try {
      await apiCall("/api/capacity-alerts/kill-switch", "PUT", { enabled: enabling });
      await loadKillSwitch();
    } catch (err) {
      alert(err.message);
      killSwitchToggle.checked = !enabling;
    }
  });

  selectAllCheckbox.addEventListener("change", () => {
    if (selectAllCheckbox.checked) {
      rulesCache.forEach((rule) => selectedIds.add(rule.id));
    } else {
      selectedIds.clear();
    }
    renderRules();
  });

  bulkEnableBtn.addEventListener("click", async () => {
    if (selectedIds.size === 0) return;
    try {
      await apiCall("/api/capacity-alerts/bulk-active", "PUT", {
        ids: Array.from(selectedIds),
        active: true,
      });
      selectedIds.clear();
      await loadAll();
    } catch (err) {
      alert(err.message);
    }
  });

  bulkDisableBtn.addEventListener("click", async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Disable ${selectedIds.size} selected rule(s)?`)) return;
    try {
      await apiCall("/api/capacity-alerts/bulk-active", "PUT", {
        ids: Array.from(selectedIds),
        active: false,
      });
      selectedIds.clear();
      await loadAll();
    } catch (err) {
      alert(err.message);
    }
  });

  locationSelect.addEventListener("change", () => {
    loadSubLocations(Number(locationSelect.value) || null, null);
  });

  saveBtn.addEventListener("click", async () => {
    const id = document.getElementById("ca-rule-id").value;
    const payload = {
      locationTaskId: Number(locationSelect.value),
      subLocationId: subLocationSelect.value
        ? Number(subLocationSelect.value)
        : null,
      thresholdType: document.getElementById("ca-threshold-type").value,
      thresholdValue: Number(
        document.getElementById("ca-threshold-value").value,
      ),
      direction: document.getElementById("ca-direction").value,
      positionIds: getCheckedPositions(),
      messageOverride:
        document.getElementById("ca-message-override").value || null,
      active: document.getElementById("ca-active").checked,
    };

    if (!payload.locationTaskId || !payload.thresholdValue) {
      alert("Location and threshold value are required.");
      return;
    }
    if (payload.positionIds.length === 0) {
      alert("Tick at least one position to notify.");
      return;
    }

    try {
      if (id) {
        await apiCall(`/api/capacity-alerts/${id}`, "PUT", payload);
      } else {
        await apiCall("/api/capacity-alerts", "POST", payload);
      }
      modal.hide();
      await loadAll();
    } catch (err) {
      alert(err.message);
    }
  });

  deleteBtn.addEventListener("click", async () => {
    const id = deleteBtn.dataset.id;
    if (
      !id ||
      !confirm("Delete this capacity alert rule? This cannot be undone.")
    )
      return;

    try {
      await apiCall(`/api/capacity-alerts/${id}`, "DELETE");
      modal.hide();
      await loadAll();
    } catch (err) {
      alert(err.message);
    }
  });

  loadAll();
  loadKillSwitch();
})();
