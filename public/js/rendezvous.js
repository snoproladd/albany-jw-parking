/**
 * @file rendezvous.js
 * @description Shared rendezvous point editor/viewer component.
 *
 * Used by the scheduler context menu, the rendezvous landing page,
 * and the timelines page. Provides a floating panel with view/edit
 * modes, GPS capture, photo upload/preview, and T-15 time guard logic.
 *
 * Depends on: Bootstrap 5 (classes only), FontAwesome icons.
 */

// ─────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────

/** EDT offset in hours (UTC-4) — matches alertScheduler.js. */
const EDT_OFFSET_HOURS = 4;

/** Minutes after shift start beyond which editing is locked. */
const LOCK_AFTER_MINUTES = 15;

// ─────────────────────────────────────────────
//  Module state
// ─────────────────────────────────────────────

/** @type {Map<number, object>} assignmentId → RV data (preloaded). */
const _cache = new Map();

/** @type {HTMLElement|null} Active panel element. */
let _panelEl = null;

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/**
 * Read the CSRF token from the page meta tag.
 *
 * @returns {string}
 */
function _csrf() {
  return document.querySelector('meta[name="csrf-token"]')?.content || "";
}

/**
 * Compute minutes until (positive) or since (negative) a shift starts.
 * Uses the same EDT conversion as alertScheduler.js.
 *
 * @param {string} conventionDate  "YYYY-MM-DD"
 * @param {string} startTime      "HH:MM" (24-hour Eastern local)
 * @returns {number}  Positive = minutes until start, negative = minutes since start.
 */
function _minutesToShiftStart(conventionDate, startTime) {
  if (!conventionDate || !startTime) return Infinity;
  const [h, m] = startTime.split(":").map(Number);
  const utc = new Date(`${conventionDate}T00:00:00Z`);
  utc.setUTCHours(h + EDT_OFFSET_HOURS, m, 0, 0);
  return (utc - Date.now()) / (60 * 1000);
}

/**
 * Determine the time guard zone for a shift.
 *
 * @param {string} conventionDate  "YYYY-MM-DD"
 * @param {string} startTime      "HH:MM"
 * @returns {{ zone: 'free'|'warn'|'lock', minutesUntil: number }}
 */
function _timeGuard(conventionDate, startTime) {
  const mins = _minutesToShiftStart(conventionDate, startTime);
  if (Number.isNaN(mins)) return { zone: "free", minutesUntil: Infinity };
  if (mins > 15) return { zone: "free", minutesUntil: mins };
  if (mins >= -LOCK_AFTER_MINUTES) return { zone: "warn", minutesUntil: mins };
  return { zone: "lock", minutesUntil: mins };
}

/**
 * Format minutes-until-start as a human-readable label.
 *
 * @param {number} mins
 * @returns {string}
 */
function _guardLabel(mins) {
  if (mins > 0) {
    const m = Math.round(mins);
    return `This shift starts in ${m} minute${m !== 1 ? "s" : ""}.`;
  }
  const m = Math.round(Math.abs(mins));
  return `This shift started ${m} minute${m !== 1 ? "s" : ""} ago.`;
}

/**
 * Position a fixed element near a coordinate, keeping it in viewport.
 *
 * @param {HTMLElement} el
 * @param {number} x
 * @param {number} y
 */
function _positionEl(el, x, y) {
  el.style.position = "fixed";
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.zIndex = "9998";
  requestAnimationFrame(() => {
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) {
      el.style.left = `${x - r.width}px`;
    }
    if (r.bottom > window.innerHeight - 8) {
      // Clamp so the panel (and its header) never gets pushed above
      // the top of the viewport when there isn't enough room below.
      el.style.top = `${Math.max(8, y - r.height)}px`;
    }
  });
}

// ─────────────────────────────────────────────
//  Cache (preload)
// ─────────────────────────────────────────────

/**
 * Batch-fetch all rendezvous points for a convention day and store
 * them in the module-level cache. Call once when a day is selected
 * in the scheduler or landing page.
 *
 * @param {number} dayId  convention_days.id
 * @returns {Promise<void>}
 */
export async function preloadRendezvousForDay(dayId) {
  _cache.clear();
  try {
    const res = await fetch(`/api/rendezvous/day/${dayId}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.rows)) {
      for (const rv of data.rows) {
        _cache.set(rv.schedule_assignment_id, rv);
      }
    }
  } catch (err) {
    console.error("[rendezvous] preload error:", err);
  }
}

/**
 * Read a cached rendezvous point by schedule_assignment_id.
 *
 * @param {number} assignmentId
 * @returns {object|null}
 */
export function getCachedRendezvous(assignmentId) {
  return _cache.get(assignmentId) || null;
}

/**
 * Clear the entire RV cache (e.g. on day change).
 *
 * @returns {void}
 */
export function clearRendezvousCache() {
  _cache.clear();
}

/**
 * Update a single entry in the cache after a create/update/delete.
 *
 * @param {number} assignmentId
 * @param {object|null} rvData  null to remove from cache.
 */
export function updateCache(assignmentId, rvData) {
  if (rvData) {
    _cache.set(assignmentId, rvData);
  } else {
    _cache.delete(assignmentId);
  }
}

// ─────────────────────────────────────────────
//  Panel dismiss
// ─────────────────────────────────────────────

/**
 * Remove the active RV panel from the DOM.
 *
 * @returns {void}
 */
export function dismissRendezvousPanel() {
  _panelEl?.remove();
  _panelEl = null;
}

// ─────────────────────────────────────────────
//  Panel builder
// ─────────────────────────────────────────────

/**
 * Open the rendezvous editor/viewer panel.
 *
 * @param {{
 *   assignmentId:   number,
 *   shiftLabel:     string,
 *   locationName:   string,
 *   startTime:      string,
 *   conventionDate: string,
 *   canCreate:      boolean,
 *   canEdit:        boolean,
 *   canDelete:      boolean,
 *   anchorX:        number,
 *   anchorY:        number,
 *   onUpdate?:      (assignmentId: number, rvData: object|null) => void,
 * }} opts
 * @returns {Promise<void>}
 */
export async function openRendezvousPanel(opts) {
  dismissRendezvousPanel();

  const {
    assignmentId,
    shiftLabel,
    locationName,
    startTime,
    conventionDate,
    canCreate,
    canEdit,
    canDelete,
    anchorX,
    anchorY,
    onUpdate,
  } = opts;

  // Fetch current data (prefer fresh over cache)
  let rv = null;
  try {
    const res = await fetch(`/api/rendezvous/${assignmentId}`);
    const data = await res.json();
    if (data.success) rv = data.rv;
  } catch (err) {
    console.error("[rendezvous] fetch error:", err);
    rv = getCachedRendezvous(assignmentId);
  }

  const exists = !!rv;
  const editable = exists ? canEdit : canCreate;
  const guard = _timeGuard(conventionDate, startTime);

  // Build panel
  const panel = document.createElement("div");
  panel.classList.add("rv-panel");

  // Header
  const hdr = document.createElement("div");
  hdr.classList.add("rv-panel-header");
  const ttl = document.createElement("span");
  ttl.textContent = `${shiftLabel} — ${locationName}`;
  const closeBtn = document.createElement("button");
  closeBtn.classList.add("rv-panel-close");
  closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  closeBtn.addEventListener("click", dismissRendezvousPanel);
  hdr.appendChild(ttl);
  hdr.appendChild(closeBtn);
  panel.appendChild(hdr);

  const body = document.createElement("div");
  body.classList.add("rv-panel-body");

  if (guard.zone === "lock") {
    const lockMsg = document.createElement("p");
    lockMsg.classList.add("rv-lock-msg");
    lockMsg.textContent =
      "This shift is well underway. Rendezvous changes are locked.";
    body.appendChild(lockMsg);
  }

  if (!exists && !canCreate) {
    const noRv = document.createElement("p");
    noRv.classList.add("rv-empty");
    noRv.textContent = "No rendezvous point set.";
    body.appendChild(noRv);
    panel.appendChild(body);
    document.body.appendChild(panel);
    _panelEl = panel;
    _positionEl(panel, anchorX, anchorY);
    return;
  }

  // ── Form fields ──
  const isLocked = guard.zone === "lock";
  const readOnly = isLocked || !editable;

  /**
   * @param {string} label
   * @param {string} id
   * @param {string} value
   * @param {string} [type='text']
   * @returns {HTMLElement}
   */
  function _field(label, id, value, type) {
    const grp = document.createElement("div");
    grp.classList.add("rv-field");
    const lbl = document.createElement("label");
    lbl.textContent = label;
    lbl.setAttribute("for", id);
    const inp =
      type === "textarea"
        ? document.createElement("textarea")
        : document.createElement("input");
    inp.id = id;
    inp.classList.add("form-control", "form-control-sm");
    if (type !== "textarea") inp.type = type || "text";
    if (type === "textarea") inp.rows = 2;
    inp.value = value || "";
    if (readOnly) inp.disabled = true;
    grp.appendChild(lbl);
    grp.appendChild(inp);
    return grp;
  }

  body.appendChild(
    _field("Description", "rv-description", rv?.description, "textarea"),
  );
  body.appendChild(_field("Address", "rv-address", rv?.address));
  body.appendChild(_field("Floor", "rv-floor", rv?.floor_number));

  // Coordinates row
  const coordRow = document.createElement("div");
  coordRow.classList.add("rv-coord-row");
  const latField = _field(
    "Latitude",
    "rv-lat",
    rv?.latitude != null ? String(rv.latitude) : "",
    "number",
  );
  const lngField = _field(
    "Longitude",
    "rv-lng",
    rv?.longitude != null ? String(rv.longitude) : "",
    "number",
  );
  coordRow.appendChild(latField);
  coordRow.appendChild(lngField);

  if (!readOnly) {
    const gpsBtn = document.createElement("button");
    gpsBtn.type = "button";
    gpsBtn.classList.add(
      "btn",
      "btn-outline-secondary",
      "btn-sm",
      "rv-gps-btn",
    );
    gpsBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> GPS';
    gpsBtn.addEventListener("click", () => {
      gpsBtn.disabled = true;
      gpsBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          /** @type {HTMLInputElement} */ (
            document.getElementById("rv-lat")
          ).value = pos.coords.latitude.toFixed(7);
          /** @type {HTMLInputElement} */ (
            document.getElementById("rv-lng")
          ).value = pos.coords.longitude.toFixed(7);
          gpsBtn.disabled = false;
          gpsBtn.innerHTML =
            '<i class="fa-solid fa-location-crosshairs"></i> GPS';
        },
        (err) => {
          console.error("[rendezvous] GPS error:", err);
          gpsBtn.disabled = false;
          gpsBtn.innerHTML =
            '<i class="fa-solid fa-location-crosshairs"></i> GPS';
          const msg =
            err.code === 1
              ? "Location access denied."
              : "Could not get location.";
          _flashStatus(body, msg, "danger");
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
    coordRow.appendChild(gpsBtn);
  }
  body.appendChild(coordRow);

  // Photo
  const photoSection = document.createElement("div");
  photoSection.classList.add("rv-photo-section");
  const photoLabel = document.createElement("label");
  photoLabel.textContent = "Photo";
  photoSection.appendChild(photoLabel);

  if (rv?.photo_blob_name) {
    const img = document.createElement("img");
    img.src = `/api/rendezvous/photo/${encodeURIComponent(rv.photo_blob_name)}`;
    img.classList.add("rv-photo-preview");
    img.alt = "Rendezvous photo";
    photoSection.appendChild(img);

    if (!readOnly) {
      const clearPhotoBtn = document.createElement("button");
      clearPhotoBtn.type = "button";
      clearPhotoBtn.classList.add(
        "btn",
        "btn-outline-danger",
        "btn-sm",
        "rv-clear-photo",
      );
      clearPhotoBtn.textContent = "Clear Photo";
      clearPhotoBtn.addEventListener("click", async () => {
        clearPhotoBtn.disabled = true;
        try {
          const res = await fetch(`/api/rendezvous/${rv.id}/photo`, {
            method: "DELETE",
            headers: { "X-CSRF-Token": _csrf() },
          });
          const data = await res.json();
          if (data.success) {
            rv.photo_blob_name = null;
            img.remove();
            clearPhotoBtn.remove();
            updateCache(assignmentId, rv);
            if (onUpdate) onUpdate(assignmentId, rv);
          }
        } catch (err) {
          console.error("[rendezvous] clear photo error:", err);
        }
        clearPhotoBtn.disabled = false;
      });
      photoSection.appendChild(clearPhotoBtn);
    }
  }

  if (!readOnly) {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.capture = "environment";
    fileInput.classList.add("form-control", "form-control-sm", "rv-file-input");
    fileInput.id = "rv-photo-file";
    photoSection.appendChild(fileInput);
  }
  body.appendChild(photoSection);

  // Status area
  const statusEl = document.createElement("div");
  statusEl.classList.add("rv-status");
  body.appendChild(statusEl);

  // Action buttons
  if (!readOnly) {
    const actions = document.createElement("div");
    actions.classList.add("rv-actions");

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.classList.add("btn", "btn-primary", "btn-sm");
    saveBtn.textContent = exists ? "Save" : "Create";
    saveBtn.addEventListener("click", () => {
      _handleSave(rv, assignmentId, guard, body, statusEl, saveBtn, onUpdate);
    });
    actions.appendChild(saveBtn);

    if (exists && canDelete) {
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.classList.add("btn", "btn-outline-danger", "btn-sm");
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", async () => {
        if (!confirm("Delete this rendezvous point? This cannot be undone."))
          return;
        delBtn.disabled = true;
        try {
          const res = await fetch(`/api/rendezvous/${rv.id}`, {
            method: "DELETE",
            headers: { "X-CSRF-Token": _csrf() },
          });
          const data = await res.json();
          if (data.success) {
            updateCache(assignmentId, null);
            if (onUpdate) onUpdate(assignmentId, null);
            dismissRendezvousPanel();
          } else {
            _flashStatus(body, data.error || "Delete failed.", "danger");
          }
        } catch (err) {
          console.error("[rendezvous] delete error:", err);
          _flashStatus(body, "Network error.", "danger");
        }
        delBtn.disabled = false;
      });
      actions.appendChild(delBtn);
    }

    body.appendChild(actions);
  }

  if (exists && canCreate) {
    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.classList.add("btn", "btn-outline-primary", "btn-sm", "rv-apply-trigger");
    applyBtn.innerHTML = '<i class="fa-solid fa-copy me-1"></i>Apply to Other Shifts';
    applyBtn.addEventListener("click", () => _showApplyToView(rv, opts));
    body.appendChild(applyBtn);
  }

  panel.appendChild(body);
  document.body.appendChild(panel);
  _panelEl = panel;
  _positionEl(panel, anchorX, anchorY);

  // Dismiss on outside click
  const _outsideClick = (e) => {
    if (_panelEl && !_panelEl.contains(e.target)) {
      dismissRendezvousPanel();
      document.removeEventListener("mousedown", _outsideClick);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", _outsideClick), 0);
}

// ─────────────────────────────────────────────
//  Apply to other shifts
// ─────────────────────────────────────────────

/**
 * Replaces the panel body with a list of other schedule assignments at
 * the same location, letting the user select which ones should receive
 * a copy of this rendezvous point's description, address, floor, and
 * GPS coordinates. Photos are never copied.
 *
 * @param {object} rv    - The source rendezvous point (must have an id).
 * @param {object} opts  - The original options passed to openRendezvousPanel,
 *                          used to rebuild the edit view on "Back".
 * @returns {Promise<void>}
 */
async function _showApplyToView(rv, opts) {
  if (!_panelEl) return;
  const body = _panelEl.querySelector(".rv-panel-body");
  if (!body) return;

  body.innerHTML = '<p class="rv-empty">Loading nearby shifts…</p>';

  let candidates = [];
  try {
    const year = new Date(opts.conventionDate || Date.now()).getUTCFullYear();
    const res = await fetch(
      `/api/rendezvous/${rv.id}/apply-candidates?year=${year}`,
    );
    const data = await res.json();
    if (data.success) candidates = data.candidates;
  } catch (err) {
    console.error("[rendezvous] apply-candidates error:", err);
  }

  body.innerHTML = "";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.classList.add("btn", "btn-outline-secondary", "btn-sm", "rv-apply-back");
  backBtn.innerHTML = '<i class="fa-solid fa-arrow-left me-1"></i>Back';
  backBtn.addEventListener("click", () => openRendezvousPanel(opts));
  body.appendChild(backBtn);

  if (candidates.length === 0) {
    const none = document.createElement("p");
    none.classList.add("rv-empty");
    none.textContent = "No other shifts found at this location.";
    body.appendChild(none);
    return;
  }

  const hint = document.createElement("p");
  hint.classList.add("rv-apply-hint");
  hint.innerHTML =
    "Select the shifts that should share this rendezvous point. Photos are not copied — add those individually.";
  body.appendChild(hint);

  const selectAllRow = document.createElement("label");
  selectAllRow.classList.add("rv-apply-row", "rv-apply-select-all");
  const selectAllCb = document.createElement("input");
  selectAllCb.type = "checkbox";
  selectAllRow.appendChild(selectAllCb);
  selectAllRow.appendChild(document.createTextNode(" Select all"));
  body.appendChild(selectAllRow);

  const list = document.createElement("div");
  list.classList.add("rv-apply-list");

  const checkboxes = [];
  for (const c of candidates) {
    const row = document.createElement("label");
    row.classList.add("rv-apply-row");

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = String(c.id);
    row.appendChild(cb);
    checkboxes.push(cb);

    const info = document.createElement("span");
    info.classList.add("rv-apply-row-info");
    const dayText = c.convention_date
      ? new Date(c.convention_date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        })
      : "";
    info.textContent = `${c.day_label || dayText} — ${c.shift_label}${c.event_type_name ? " (" + c.event_type_name + ")" : ""}`;
    row.appendChild(info);

    if (c.has_rendezvous) {
      const badge = document.createElement("span");
      badge.classList.add("rv-apply-badge");
      badge.textContent = "already set";
      row.appendChild(badge);
    }

    list.appendChild(row);
  }
  body.appendChild(list);

  selectAllCb.addEventListener("change", () => {
    checkboxes.forEach((cb) => (cb.checked = selectAllCb.checked));
  });

  const statusEl = document.createElement("div");
  statusEl.classList.add("rv-status");
  body.appendChild(statusEl);

  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.classList.add("btn", "btn-primary", "btn-sm", "rv-apply-submit");
  applyBtn.textContent = "Apply";
  applyBtn.addEventListener("click", async () => {
    const targetAssignmentIds = checkboxes
      .filter((cb) => cb.checked)
      .map((cb) => Number(cb.value));

    if (targetAssignmentIds.length === 0) {
      _flashStatus(body, "Select at least one shift.", "danger");
      return;
    }

    applyBtn.disabled = true;
    try {
      const res = await fetch(`/api/rendezvous/${rv.id}/apply-to`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": _csrf(),
        },
        body: JSON.stringify({ targetAssignmentIds }),
      });
      const data = await res.json();
      if (!data.success) {
        _flashStatus(body, data.error || "Apply failed.", "danger");
        applyBtn.disabled = false;
        return;
      }
      _flashStatus(
        body,
        `Applied to ${data.applied} shift${data.applied !== 1 ? "s" : ""}.` +
          (data.failed ? ` ${data.failed} failed.` : ""),
        data.failed ? "warning" : "success",
      );
      if (opts.onUpdate) opts.onUpdate(opts.assignmentId, rv);
    } catch (err) {
      console.error("[rendezvous] apply-to error:", err);
      _flashStatus(body, "Network error.", "danger");
    }
    applyBtn.disabled = false;
  });
  body.appendChild(applyBtn);
}

// ─────────────────────────────────────────────
//  Save handler
// ─────────────────────────────────────────────

/**
 * Handle the Save/Create button click with time guard logic.
 *
 * @param {object|null} rv          Existing RV data or null for create.
 * @param {number}      assignmentId
 * @param {{ zone: string, minutesUntil: number }} guard
 * @param {HTMLElement}  body
 * @param {HTMLElement}  statusEl
 * @param {HTMLElement}  saveBtn
 * @param {Function}     [onUpdate]
 * @returns {Promise<void>}
 */
async function _handleSave(
  rv,
  assignmentId,
  guard,
  body,
  statusEl,
  saveBtn,
  onUpdate,
) {
  const exists = !!rv;

  // Collect form values
  const description =
    /** @type {HTMLTextAreaElement} */ (
      document.getElementById("rv-description")
    )?.value?.trim() || null;
  const address =
    /** @type {HTMLInputElement} */ (
      document.getElementById("rv-address")
    )?.value?.trim() || null;
  const floor_number =
    /** @type {HTMLInputElement} */ (
      document.getElementById("rv-floor")
    )?.value?.trim() || null;
  const latVal = /** @type {HTMLInputElement} */ (
    document.getElementById("rv-lat")
  )?.value;
  const lngVal = /** @type {HTMLInputElement} */ (
    document.getElementById("rv-lng")
  )?.value;
  const latitude = latVal ? parseFloat(latVal) : null;
  const longitude = lngVal ? parseFloat(lngVal) : null;

  let sendAlert = false;

  // T-15 warning
  if (guard.zone === "warn") {
    const msg =
      _guardLabel(guard.minutesUntil) +
      " Saving will send an update alert to all assigned volunteers. Continue?";
    if (!confirm(msg)) return;
    sendAlert = true;
  }

  saveBtn.disabled = true;
  statusEl.textContent = "";

  try {
    let result;
    if (exists) {
      // PUT update
      const res = await fetch(`/api/rendezvous/${rv.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": _csrf(),
        },
        body: JSON.stringify({
          description,
          address,
          latitude,
          longitude,
          floor_number,
          send_alert: sendAlert,
        }),
      });
      result = await res.json();
    } else {
      // POST create
      const res = await fetch("/api/rendezvous", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": _csrf(),
        },
        body: JSON.stringify({
          schedule_assignment_id: assignmentId,
          description,
          address,
          latitude,
          longitude,
          floor_number,
        }),
      });
      result = await res.json();
    }

    if (!result.success) {
      _flashStatus(body, result.error || "Save failed.", "danger");
      saveBtn.disabled = false;
      return;
    }

    // Upload photo if a file was selected
    const fileInput = /** @type {HTMLInputElement} */ (
      document.getElementById("rv-photo-file")
    );
    const rvId = exists ? rv.id : result.id;

    if (fileInput?.files?.length > 0) {
      const formData = new FormData();
      formData.append("photo", fileInput.files[0]);
      const photoRes = await fetch(`/api/rendezvous/${rvId}/photo`, {
        method: "POST",
        headers: { "X-CSRF-Token": _csrf() },
        body: formData,
      });
      const photoData = await photoRes.json();
      if (!photoData.success) {
        _flashStatus(
          body,
          photoData.error || "Photo upload failed.",
          "warning",
        );
      }
    }

    // Refresh cache
    try {
      const freshRes = await fetch(`/api/rendezvous/${assignmentId}`);
      const freshData = await freshRes.json();
      updateCache(assignmentId, freshData.rv || null);
      if (onUpdate) onUpdate(assignmentId, freshData.rv || null);
    } catch {
      /* non-fatal */
    }

    // Show alert result if applicable
    if (result.alertResult) {
      const { sent, failed, total } = result.alertResult;
      _flashStatus(
        body,
        `Saved. Alert sent to ${sent}/${total} volunteer${total !== 1 ? "s" : ""}.` +
          (failed > 0 ? ` ${failed} failed.` : ""),
        failed > 0 ? "warning" : "success",
      );
    } else {
      _flashStatus(body, "Saved.", "success");
    }

    // Update save button label to "Save" now that RV exists
    saveBtn.textContent = "Save";
  } catch (err) {
    console.error("[rendezvous] save error:", err);
    _flashStatus(body, "Network error.", "danger");
  }
  saveBtn.disabled = false;
}

/**
 * Flash a status message in the panel.
 *
 * @param {HTMLElement} container  Panel body element.
 * @param {string}      msg
 * @param {'success'|'warning'|'danger'} variant
 */
function _flashStatus(container, msg, variant) {
  const el = container.querySelector(".rv-status");
  if (!el) return;
  el.textContent = msg;
  el.className = `rv-status text-${variant}`;
}
