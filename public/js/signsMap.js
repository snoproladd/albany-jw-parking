/**
 * @file public/js/signsMap.js
 * @description Sign Map — location-based Google Maps view with stacked
 *   sign markers, attachment management, and drag-to-reorder.
 *
 * Data model: locations → attachments (many signs per location).
 * Each map marker represents a physical mounting point (pole, cone,
 * a-frame, structure). Signs are attached to locations and rendered
 * as a vertical stack inside the marker.
 */

(() => {
  "use strict";

  // ============================================================
  // CONSTANTS
  // ============================================================

  const ARROW_GLYPHS = {
    up: "\u2191",
    down: "\u2193",
    left: "\u2190",
    right: "\u2192",
    "up-left": "\u2196",
    "up-right": "\u2197",
    "down-left": "\u2199",
    "down-right": "\u2198",
    "up-then-left": "\u21B0",
    "up-then-right": "\u21B1",
  };

  const MOUNT_LABELS = {
    pole: "Pole",
    cone: "Cone",
    "a-frame": "A-frame",
    "existing-structure": "Existing structure",
  };

  const STATUS_CYCLE = ["planned", "installed", "removed"];

  // ============================================================
  // MODULE STATE
  // ============================================================

  /** @type {google.maps.Map|null} */
  let mapRef = null;
  let locations = [];
  let signs = [];
  const markers = new Map();
  let selectedId = null;
  let canManage = false;
  let editingLocationId = null;
  let pendingMarker = null;
  let isPlacing = false;
  let editorOffcanvas = null;
  let photoCacheBuster = 0;
  let isDraggingMarker = false;

  // ============================================================
  // HELPERS
  // ============================================================

  /** @returns {string} */
  function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content || "";
  }

  /**
   * Derive the effective status for a location from its attachments.
   * @param {object} loc
   * @returns {string}
   */
  function deriveStatus(loc) {
    const atts = loc.attachments || [];
    if (atts.length === 0) return "planned";
    if (atts.some((a) => a.status === "installed")) return "installed";
    if (atts.some((a) => a.status === "planned")) return "planned";
    return "removed";
  }

  /** @param {number} id */
  function findLocation(id) {
    return locations.find((l) => l.location_id === id) || null;
  }

  /** @param {number} id */
  function findSign(id) {
    return signs.find((s) => s.sign_id === id) || null;
  }

  /**
   * @param {string|null} dir
   * @returns {string}
   */
  function arrowGlyph(dir) {
    if (!dir) return "";
    if (dir === "destination") return "";
    return ARROW_GLYPHS[dir] || "";
  }

  function formatDateDMY(d) {
    const dt = d instanceof Date ? d : new Date(d);
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${dt.getUTCFullYear()}`;
  }

  // ============================================================
  // GOOGLE MAPS LOADER
  // ============================================================

  function loadGoogleMaps(apiKey) {
    return new Promise((resolve, reject) => {
      if (window.google?.maps) {
        resolve();
        return;
      }
      const params = new URLSearchParams({
        key: apiKey,
        v: "weekly",
        libraries: "marker",
        loading: "async",
        callback: "__signsMapInitialized",
      });
      window.__signsMapInitialized = () => {
        delete window.__signsMapInitialized;
        resolve();
      };
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?${params}`;
      s.async = true;
      s.defer = true;
      s.onerror = () => reject(new Error("Failed to load Google Maps."));
      document.head.appendChild(s);
    });
  }

  // ============================================================
  // MAP INITIALIZATION
  // ============================================================

  function initMap(center) {
    const mapEl = document.getElementById("googleMap");
    if (!mapEl) return;
    mapEl.replaceChildren();

    mapRef = new google.maps.Map(mapEl, {
      center: { lat: center.lat, lng: center.lng },
      zoom: center.zoom,
      mapTypeId: "roadmap",
      mapId: "6261df670165b61fc3ae73a4",
      tilt: 0,
      disableDefaultUI: false,
      gestureHandling: "greedy",
      mapTypeControl: true,
      zoomControl: true,
      streetViewControl: false,
      fullscreenControl: false,
      rotateControl: false,
      scaleControl: false,
      cameraControl: false,
      panControl: false,
      disableDoubleClickZoom: true,
    });

    // Click-to-place
    if (canManage) {
      mapRef.addListener("click", (e) => {
        if (!isPlacing) return;
        beginNewLocation(e.latLng.lat(), e.latLng.lng());
      });
    }

    // Add markers
    locations.forEach((loc) => addMarkerForLocation(loc));
    applyFilters();
    renderLocationList();
  }

  // ============================================================
  // MARKER RENDERING
  // ============================================================

  /**
   * Build stacked marker content for a location.
   * @param {object} loc
   * @returns {HTMLDivElement}
   */
  function buildMarkerContent(loc) {
    const status = deriveStatus(loc);
    const colorCls = loc.marker_color
      ? ` signs-map-marker-color-${loc.marker_color}`
      : "";

    const wrapper = document.createElement("div");
    wrapper.className = `signs-map-marker signs-map-marker-${status}${colorCls}`;

    const stack = document.createElement("div");
    stack.className = "signs-map-marker-stack";

    const atts = (loc.attachments || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);

    if (atts.length === 0) {
      // Empty location — show a placeholder
      const empty = document.createElement("div");
      empty.className = "sign-preview signs-map-marker-sign";
      empty.style.cssText = "opacity:0.5;border-style:dashed";
      const t = document.createElement("span");
      t.className = "sign-preview-text";
      t.textContent = "empty";
      empty.appendChild(t);
      stack.appendChild(empty);
    } else {
      atts.forEach((att) => {
        const sign = document.createElement("div");
        sign.className = "sign-preview signs-map-marker-sign";

        // Per-attachment status border override
        if (att.status === "removed") {
          sign.style.cssText = "opacity:0.5;border-color:#b02a37";
        } else if (att.status === "installed") {
          sign.style.setProperty("border-color", "#198754");
        }

        const text = document.createElement("span");
        text.className = "sign-preview-text";
        text.textContent = att.sign_text || "";
        sign.appendChild(text);

        const arrow = document.createElement("span");
        arrow.className = "sign-preview-arrow";
        const dir = att.arrow_direction;
        if (dir === "destination") {
          const icon = document.createElement("i");
          icon.className = "fa-solid fa-location-dot";
          icon.setAttribute("aria-hidden", "true");
          arrow.appendChild(icon);
        } else if (dir && ARROW_GLYPHS[dir]) {
          arrow.textContent = ARROW_GLYPHS[dir];
        }
        sign.appendChild(arrow);

        stack.appendChild(sign);
      });
    }

    wrapper.appendChild(stack);
    return wrapper;
  }

  /**
   * Create an AdvancedMarkerElement for a location.
   * @param {object} loc
   */
  function addMarkerForLocation(loc) {
    const content = buildMarkerContent(loc);
    const marker = new google.maps.marker.AdvancedMarkerElement({
      map: mapRef,
      position: { lat: Number(loc.latitude), lng: Number(loc.longitude) },
      content,
      title:
        (loc.attachments || []).map((a) => a.sign_text).join(", ") ||
        "Empty location",
      gmpDraggable: canManage,
    });

    // Click → select + open editor
    marker.addListener("click", () => {
      selectMarker(loc.location_id);
      openEditor(loc.location_id);
    });

    // Drag
    if (canManage) {
      marker.addListener("dragstart", () => {
        isDraggingMarker = true;
        document.body.classList.add("signs-map-dragging");
        dismissInfoSheet(true);
        dismissEditorIfOpen();
      });

      marker.addListener("dragend", () => {
        isDraggingMarker = false;
        document.body.classList.remove("signs-map-dragging");
        const pos = marker.position;
        const lat = typeof pos.lat === "function" ? pos.lat() : pos.lat;
        const lng = typeof pos.lng === "function" ? pos.lng() : pos.lng;
        persistDrag(loc.location_id, lat, lng);
      });
    }

    markers.set(loc.location_id, marker);
  }

  /**
   * Rebuild a single marker's DOM after data changes.
   * @param {number} locationId
   */
  function refreshMarker(locationId) {
    const loc = findLocation(locationId);
    const marker = markers.get(locationId);
    if (!loc || !marker) return;
    marker.content = buildMarkerContent(loc);
    marker.title =
      (loc.attachments || []).map((a) => a.sign_text).join(", ") ||
      "Empty location";
  }

  // ============================================================
  // SELECTION
  // ============================================================

  function selectMarker(locationId) {
    // Deselect previous
    if (selectedId !== null && selectedId !== locationId) {
      const prev = markers.get(selectedId);
      if (prev?.content)
        prev.content.classList.remove("signs-map-marker-selected");
    }
    selectedId = locationId;
    const m = markers.get(locationId);
    if (m?.content) {
      m.content.classList.add("signs-map-marker-selected");
      // Pan to marker
      mapRef?.panTo(m.position);
    }
    // Highlight sidebar row
    document.querySelectorAll(".signs-location-row").forEach((row) => {
      row.classList.toggle(
        "border-primary",
        Number(row.dataset.locationId) === locationId,
      );
    });
  }

  // ============================================================
  // FILTERING
  // ============================================================

  function applyFilters() {
    const statusVal =
      document.querySelector('input[name="statusFilter"]:checked')?.value || "";
    const templateVal =
      Number(document.getElementById("signTemplateFilter")?.value) || 0;

    const visible = [];

    locations.forEach((loc) => {
      const m = markers.get(loc.location_id);
      if (!m) return;

      let show = true;

      // Status filter: check derived status
      if (statusVal) {
        show = deriveStatus(loc) === statusVal;
      }

      // Template filter: check if any attachment uses this template
      if (show && templateVal) {
        show = (loc.attachments || []).some((a) => a.sign_id === templateVal);
      }

      m.map = show ? mapRef : null;
      if (show) visible.push(loc);
    });

    renderLocationList(visible);
  }

  // ============================================================
  // SIDEBAR LOCATION LIST
  // ============================================================

  /**
   * @param {Array<object>} [visibleLocs]
   */
  function renderLocationList(visibleLocs) {
    const list = document.getElementById("locationList");
    if (!list) return;

    const locs = visibleLocs || locations;
    list.replaceChildren();

    if (locs.length === 0) {
      const empty = document.createElement("p");
      empty.className = "signs-location-empty";
      empty.textContent = "No locations to show.";
      list.appendChild(empty);
      return;
    }

    locs.forEach((loc) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "signs-location-row";
      row.dataset.locationId = loc.location_id;

      // Status dot
      const dot = document.createElement("span");
      dot.className = `signs-placement-dot signs-placement-dot-${deriveStatus(loc)}`;
      dot.style.cssText = "margin-top:0.35rem;flex-shrink:0";
      row.appendChild(dot);

      // Body
      const body = document.createElement("div");
      body.className = "signs-location-body";

      const atts = (loc.attachments || [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order);

      if (atts.length === 0) {
        const em = document.createElement("span");
        em.className = "signs-location-empty";
        em.textContent = "Empty location";
        body.appendChild(em);
      } else {
        const signsDiv = document.createElement("div");
        signsDiv.className = "signs-location-signs";

        atts.forEach((att) => {
          const sr = document.createElement("div");
          sr.className = "signs-location-sign-row";

          const name = document.createElement("span");
          name.className = "signs-location-sign-text";
          name.textContent = att.sign_text || "";
          sr.appendChild(name);

          const dir = att.arrow_direction;
          if (dir) {
            const ar = document.createElement("span");
            ar.className = "signs-location-sign-arrow";
            if (dir === "destination") {
              ar.innerHTML = '<i class="fa-solid fa-location-dot"></i>';
            } else if (ARROW_GLYPHS[dir]) {
              ar.textContent = ARROW_GLYPHS[dir];
            }
            sr.appendChild(ar);
          }

          const badge = document.createElement("span");
          badge.className = `signs-location-sign-status signs-location-sign-status-${att.status}`;
          badge.textContent = att.status;
          sr.appendChild(badge);

          signsDiv.appendChild(sr);
        });

        body.appendChild(signsDiv);
      }

      // Sub line: mount type + notes
      const sub = document.createElement("div");
      sub.className = "signs-location-sub";
      const parts = [];
      if (loc.mount_type)
        parts.push(MOUNT_LABELS[loc.mount_type] || loc.mount_type);
      if (loc.location_notes) parts.push(loc.location_notes);
      sub.textContent = parts.join(" — ") || `#${loc.location_id}`;
      body.appendChild(sub);

      row.appendChild(body);

      // Click → select + fly to + open editor
      row.addEventListener("click", () => {
        selectMarker(loc.location_id);
        openEditor(loc.location_id);
      });

      list.appendChild(row);
    });
  }

  // ============================================================
  // EDITOR — open / populate / save
  // ============================================================

  function dismissEditorIfOpen() {
    if (editorOffcanvas) {
      try {
        editorOffcanvas.hide();
      } catch (_) {
        /* noop */
      }
    }
  }

  /**
   * Open the location editor for an existing or new location.
   * @param {number|null} locationId — null for new (unsaved) location
   */
  function openEditor(locationId) {
    const loc = locationId ? findLocation(locationId) : null;
    editingLocationId = locationId || null;

    // Title
    const title = document.getElementById("locationEditorTitle");
    if (title) title.textContent = loc ? "Edit Location" : "New Location";

    // Coords
    document.getElementById("editorLat").value = loc ? loc.latitude : "";
    document.getElementById("editorLng").value = loc ? loc.longitude : "";

    // Mount type
    const mt = document.getElementById("editorMountType");
    if (mt) mt.value = loc?.mount_type || "";

    // A-frame bearing row
    const bearingRow = document.getElementById("editorBearingRow");
    const bearingInput = document.getElementById("editorFrontBearing");
    if (bearingRow) bearingRow.hidden = loc?.mount_type !== "a-frame";
    if (bearingInput) bearingInput.value = loc?.front_bearing ?? "";

    // Mount type change → toggle bearing row + face selector
    if (mt && !mt._wired) {
      mt.addEventListener("change", () => {
        if (bearingRow) bearingRow.hidden = mt.value !== "a-frame";
        const faceRow = document.getElementById("addAttFaceRow");
        if (faceRow) faceRow.hidden = mt.value !== "a-frame";
      });
      mt._wired = true;
    }

    // Marker colour
    document
      .querySelectorAll("#editorColorSwatches .signs-color-swatch")
      .forEach((btn) => {
        btn.classList.toggle(
          "active",
          (btn.dataset.color || "") === (loc?.marker_color || ""),
        );
      });

    // Notes
    const notes = document.getElementById("editorNotes");
    if (notes) notes.value = loc?.location_notes || "";

    // Photo
    renderEditorPhoto(loc);

    // Attachments
    const attSection = document.getElementById("editorAttachmentsSection");
    if (attSection) attSection.hidden = !loc; // hide for new unsaved locations
    if (loc) renderEditorAttachments(loc);

    // Collapse add-attachment form
    const addForm = document.getElementById("addAttachmentForm");
    if (addForm) {
      const bsCollapse = bootstrap.Collapse.getOrCreateInstance(addForm, {
        toggle: false,
      });
      bsCollapse.hide();
    }

    // Face row visibility
    const faceRow = document.getElementById("addAttFaceRow");
    if (faceRow) faceRow.hidden = loc?.mount_type !== "a-frame";

    // Delete button
    const delBtn = document.getElementById("editorDeleteBtn");
    if (delBtn) delBtn.hidden = !loc;

    // Audit meta
    const meta = document.getElementById("editorMeta");
    if (meta) {
      if (loc) {
        meta.hidden = false;
        meta.textContent = `Created by ${loc.created_by || "—"} on ${loc.created_at ? formatDateDMY(loc.created_at) : "—"}`;
      } else {
        meta.hidden = true;
      }
    }

    // Feedback
    const fb = document.getElementById("editorFeedback");
    if (fb) fb.textContent = "";

    // Show offcanvas
    if (!editorOffcanvas) {
      editorOffcanvas = new bootstrap.Offcanvas(
        document.getElementById("locationEditor"),
      );
    }
    editorOffcanvas.show();
  }

  /**
   * Save the location from the editor (create or update).
   */
  async function saveFromEditor() {
    const lat = Number(document.getElementById("editorLat").value);
    const lng = Number(document.getElementById("editorLng").value);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      showEditorFeedback("Valid coordinates are required.", true);
      return;
    }

    const mountType = document.getElementById("editorMountType")?.value || null;
    const frontBearing =
      document.getElementById("editorFrontBearing")?.value || null;
    const markerColor =
      document.querySelector("#editorColorSwatches .signs-color-swatch.active")
        ?.dataset.color || null;
    const locationNotes = document.getElementById("editorNotes")?.value || null;

    const body = {
      latitude: lat,
      longitude: lng,
      mountType,
      frontBearing,
      markerColor,
      locationNotes,
    };
    const csrf = getCsrfToken();

    try {
      let res, data;
      if (editingLocationId) {
        // Update
        res = await fetch(`/signs/locations/${editingLocationId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "CSRF-Token": csrf },
          body: JSON.stringify(body),
        });
        data = await res.json();
        if (!data.success) {
          showEditorFeedback(data.error || "Save failed.", true);
          return;
        }

        // Update local data
        const loc = findLocation(editingLocationId);
        if (loc) {
          Object.assign(loc, {
            latitude: lat,
            longitude: lng,
            mount_type: mountType,
            front_bearing: frontBearing ? Number(frontBearing) : null,
            marker_color: markerColor,
            location_notes: locationNotes,
          });
          refreshMarker(editingLocationId);
          const m = markers.get(editingLocationId);
          if (m) m.position = { lat, lng };
        }
      } else {
        // Create
        res = await fetch("/signs/locations", {
          method: "POST",
          headers: { "Content-Type": "application/json", "CSRF-Token": csrf },
          body: JSON.stringify(body),
        });
        data = await res.json();
        if (!data.success) {
          showEditorFeedback(data.error || "Create failed.", true);
          return;
        }

        // Add to local data
        const newLoc = {
          location_id: data.id,
          latitude: lat,
          longitude: lng,
          mount_type: mountType,
          front_bearing: frontBearing ? Number(frontBearing) : null,
          marker_color: markerColor,
          location_notes: locationNotes,
          photo_url: null,
          photo_taken_by: null,
          photo_taken_at: null,
          created_by: "you",
          created_at: new Date().toISOString(),
          attachments: [],
        };
        locations.push(newLoc);
        addMarkerForLocation(newLoc);

        // Clean up pending marker
        clearPendingMarker();
        exitPlacingMode();

        // Switch editor to the new location
        editingLocationId = data.id;
        const attSection = document.getElementById("editorAttachmentsSection");
        if (attSection) attSection.hidden = false;
        renderEditorAttachments(newLoc);
        const delBtn = document.getElementById("editorDeleteBtn");
        if (delBtn) delBtn.hidden = false;
        const title = document.getElementById("locationEditorTitle");
        if (title) title.textContent = "Edit Location";
      }

      showEditorFeedback("Saved.", false);
      applyFilters();
    } catch (err) {
      console.error("saveFromEditor error:", err);
      showEditorFeedback("Server error.", true);
    }
  }

  async function deleteFromEditor() {
    if (!editingLocationId) return;
    if (!confirm("Delete this location and all attached signs?")) return;

    try {
      const res = await fetch(`/signs/locations/${editingLocationId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": getCsrfToken(),
        },
      });
      const data = await res.json();
      if (!data.success) {
        showEditorFeedback(data.error || "Delete failed.", true);
        return;
      }

      // Remove from local data
      const idx = locations.findIndex(
        (l) => l.location_id === editingLocationId,
      );
      if (idx !== -1) locations.splice(idx, 1);
      const m = markers.get(editingLocationId);
      if (m) {
        m.map = null;
        markers.delete(editingLocationId);
      }

      editingLocationId = null;
      dismissEditorIfOpen();
      applyFilters();
    } catch (err) {
      console.error("deleteFromEditor error:", err);
      showEditorFeedback("Server error.", true);
    }
  }

  function showEditorFeedback(msg, isError) {
    const el = document.getElementById("editorFeedback");
    if (!el) return;
    el.textContent = msg;
    el.className = `small mt-2 ${isError ? "text-danger" : "text-success"}`;
    if (!isError)
      setTimeout(() => {
        el.textContent = "";
      }, 3000);
  }

  // ============================================================
  // EDITOR — attachment list + CRUD
  // ============================================================

  /**
   * Render the draggable attachment list inside the editor.
   * @param {object} loc
   */
  function renderEditorAttachments(loc) {
    const list = document.getElementById("editorAttachmentList");
    const countBadge = document.getElementById("editorAttachmentCount");
    if (!list) return;
    list.replaceChildren();

    const atts = (loc.attachments || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);

    if (countBadge) countBadge.textContent = atts.length;

    atts.forEach((att) => {
      const row = document.createElement("div");
      row.className = "signs-attachment-row";
      row.draggable = canManage;
      row.dataset.attachmentId = att.attachment_id;

      // Drag handle
      if (canManage) {
        const handle = document.createElement("span");
        handle.className = "signs-attachment-drag-handle";
        handle.innerHTML = '<i class="fa-solid fa-grip-vertical"></i>';
        row.appendChild(handle);
      }

      // Info (name + arrow)
      const info = document.createElement("div");
      info.className = "signs-attachment-info";

      const name = document.createElement("span");
      name.className = "signs-attachment-name";
      name.textContent = att.sign_text || "";
      info.appendChild(name);

      if (att.arrow_direction) {
        const ar = document.createElement("span");
        ar.className = "signs-attachment-arrow";
        if (att.arrow_direction === "destination") {
          ar.innerHTML = '<i class="fa-solid fa-location-dot"></i>';
        } else {
          ar.textContent = arrowGlyph(att.arrow_direction);
        }
        info.appendChild(ar);
      }

      if (att.face) {
        const face = document.createElement("span");
        face.className = "signs-attachment-face";
        face.textContent = att.face;
        info.appendChild(face);
      }

      row.appendChild(info);

      // Status badge (click to cycle)
      if (canManage) {
        const statusBtn = document.createElement("button");
        statusBtn.type = "button";
        statusBtn.className = `signs-attachment-status-btn signs-attachment-status-${att.status}`;
        statusBtn.textContent = att.status;
        statusBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          cycleAttachmentStatus(att.attachment_id);
        });
        row.appendChild(statusBtn);
      } else {
        const statusSpan = document.createElement("span");
        statusSpan.className = `signs-attachment-status-btn signs-attachment-status-${att.status}`;
        statusSpan.textContent = att.status;
        row.appendChild(statusSpan);
      }

      // Remove button
      if (canManage) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "signs-attachment-remove-btn";
        removeBtn.title = "Remove from location";
        removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        removeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          removeAttachment(att.attachment_id);
        });
        row.appendChild(removeBtn);
      }

      // Drag events
      if (canManage) {
        row.addEventListener("dragstart", (e) => {
          row.classList.add("signs-attachment-dragging");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", att.attachment_id);
        });
        row.addEventListener("dragend", () => {
          row.classList.remove("signs-attachment-dragging");
          commitAttachmentReorder(loc.location_id);
        });
        row.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const dragging = list.querySelector(".signs-attachment-dragging");
          if (dragging && dragging !== row) {
            const rect = row.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) {
              list.insertBefore(dragging, row);
            } else {
              list.insertBefore(dragging, row.nextSibling);
            }
          }
        });
      }

      list.appendChild(row);
    });
  }

  /**
   * Read the current DOM order and persist reorder.
   * @param {number} locationId
   */
  async function commitAttachmentReorder(locationId) {
    const list = document.getElementById("editorAttachmentList");
    if (!list) return;

    const orderedIds = Array.from(list.children)
      .map((row) => Number(row.dataset.attachmentId))
      .filter((id) => id);

    try {
      const res = await fetch(
        `/signs/locations/${locationId}/attachments/reorder`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "CSRF-Token": getCsrfToken(),
          },
          body: JSON.stringify({ orderedIds }),
        },
      );
      const data = await res.json();
      if (!data.success) {
        console.error("Reorder failed:", data.error);
        return;
      }

      // Update local sort_order
      const loc = findLocation(locationId);
      if (loc) {
        orderedIds.forEach((id, i) => {
          const att = loc.attachments.find((a) => a.attachment_id === id);
          if (att) att.sort_order = i;
        });
        refreshMarker(locationId);
        applyFilters();
      }
    } catch (err) {
      console.error("commitAttachmentReorder error:", err);
    }
  }

  /**
   * Cycle attachment status: planned → installed → removed → planned.
   * @param {number} attachmentId
   */
  async function cycleAttachmentStatus(attachmentId) {
    const loc = locations.find((l) =>
      (l.attachments || []).some((a) => a.attachment_id === attachmentId),
    );
    if (!loc) return;
    const att = loc.attachments.find((a) => a.attachment_id === attachmentId);
    if (!att) return;

    const idx = STATUS_CYCLE.indexOf(att.status);
    const newStatus = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];

    try {
      const res = await fetch(`/signs/attachments/${attachmentId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!data.success) {
        console.error("Status update failed:", data.error);
        return;
      }

      att.status = newStatus;
      refreshMarker(loc.location_id);
      renderEditorAttachments(loc);
      applyFilters();
    } catch (err) {
      console.error("cycleAttachmentStatus error:", err);
    }
  }

  /**
   * Remove an attachment from its location.
   * @param {number} attachmentId
   */
  async function removeAttachment(attachmentId) {
    if (!confirm("Remove this sign from the location?")) return;

    const loc = locations.find((l) =>
      (l.attachments || []).some((a) => a.attachment_id === attachmentId),
    );
    if (!loc) return;

    try {
      const res = await fetch(`/signs/attachments/${attachmentId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": getCsrfToken(),
        },
      });
      const data = await res.json();
      if (!data.success) {
        console.error("Remove failed:", data.error);
        return;
      }

      loc.attachments = loc.attachments.filter(
        (a) => a.attachment_id !== attachmentId,
      );
      refreshMarker(loc.location_id);
      renderEditorAttachments(loc);
      applyFilters();
    } catch (err) {
      console.error("removeAttachment error:", err);
    }
  }

  /**
   * Add a new attachment from the add-attachment form.
   */
  async function addAttachmentFromForm() {
    if (!editingLocationId) return;

    const signId = Number(document.getElementById("addAttSignTemplate")?.value);
    if (!signId) {
      alert("Pick a sign template.");
      return;
    }

    const arrowDirection =
      document.getElementById("addAttArrowDirection")?.value || null;
    const face = document.getElementById("addAttFace")?.value || null;

    const loc = findLocation(editingLocationId);
    const sortOrder = (loc?.attachments || []).length;

    try {
      const res = await fetch(
        `/signs/locations/${editingLocationId}/attachments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "CSRF-Token": getCsrfToken(),
          },
          body: JSON.stringify({ signId, arrowDirection, face, sortOrder }),
        },
      );
      const data = await res.json();
      if (!data.success) {
        alert(data.error || "Failed to add sign.");
        return;
      }

      // Add to local data
      const sign = findSign(signId);
      if (loc) {
        loc.attachments.push({
          attachment_id: data.id,
          sign_id: signId,
          sign_text: sign?.sign_text || "",
          abbreviation: sign?.abbreviation || "",
          template_arrow_direction: sign?.arrow_direction || null,
          face,
          sort_order: sortOrder,
          arrow_direction: arrowDirection,
          status: "planned",
          installed_by: null,
          installed_at: null,
          removed_at: null,
          created_by: "you",
          created_at: new Date().toISOString(),
        });
        refreshMarker(editingLocationId);
        renderEditorAttachments(loc);
        applyFilters();
      }

      // Reset form
      document.getElementById("addAttSignTemplate").value = "";
      document.getElementById("addAttArrowDirection").value = "";
      syncAddAttArrowPicker("");
      const addForm = document.getElementById("addAttachmentForm");
      if (addForm) bootstrap.Collapse.getOrCreateInstance(addForm).hide();
    } catch (err) {
      console.error("addAttachmentFromForm error:", err);
    }
  }

  /**
   * Sync the add-attachment arrow picker buttons to the hidden input.
   * @param {string} dir
   */
  function syncAddAttArrowPicker(dir) {
    document
      .querySelectorAll("#addAttachmentForm .arrow-btn")
      .forEach((btn) => {
        btn.classList.toggle(
          "active",
          (btn.dataset.arrow ?? "") === (dir ?? ""),
        );
      });
  }

  // ============================================================
  // CLICK-TO-PLACE
  // ============================================================

  function enterPlacingMode() {
    isPlacing = true;
    const mapEl = document.getElementById("googleMap");
    if (mapEl) mapEl.classList.add("signs-map-placing");
    const help = document.getElementById("addLocationHelp");
    if (help) help.hidden = false;
  }

  function exitPlacingMode() {
    isPlacing = false;
    const mapEl = document.getElementById("googleMap");
    if (mapEl) mapEl.classList.remove("signs-map-placing");
    const help = document.getElementById("addLocationHelp");
    if (help) help.hidden = true;
  }

  function clearPendingMarker() {
    if (pendingMarker) {
      pendingMarker.map = null;
      pendingMarker = null;
    }
  }

  /**
   * @param {number} lat
   * @param {number} lng
   */
  function beginNewLocation(lat, lng) {
    clearPendingMarker();

    // Create a temporary marker
    const content = document.createElement("div");
    content.className = "signs-map-marker signs-map-marker-pending";
    const stack = document.createElement("div");
    stack.className = "signs-map-marker-stack";
    const preview = document.createElement("div");
    preview.className = "sign-preview signs-map-marker-sign";
    preview.style.cssText =
      "border-style:dashed;background:#e7f1ff;color:#0a58ca";
    const t = document.createElement("span");
    t.className = "sign-preview-text";
    t.textContent = "New";
    preview.appendChild(t);
    stack.appendChild(preview);
    content.appendChild(stack);

    pendingMarker = new google.maps.marker.AdvancedMarkerElement({
      map: mapRef,
      position: { lat, lng },
      content,
      gmpDraggable: true,
    });

    pendingMarker.addListener("dragend", () => {
      const pos = pendingMarker.position;
      const newLat = typeof pos.lat === "function" ? pos.lat() : pos.lat;
      const newLng = typeof pos.lng === "function" ? pos.lng() : pos.lng;
      document.getElementById("editorLat").value = newLat.toFixed(7);
      document.getElementById("editorLng").value = newLng.toFixed(7);
    });

    // Open editor for new location
    openEditor(null);
    document.getElementById("editorLat").value = lat.toFixed(7);
    document.getElementById("editorLng").value = lng.toFixed(7);
  }

  // ============================================================
  // DRAG TO REPOSITION
  // ============================================================

  async function persistDrag(locationId, lat, lng) {
    const loc = findLocation(locationId);
    if (!loc) return;

    const body = {
      latitude: lat,
      longitude: lng,
      mountType: loc.mount_type,
      frontBearing: loc.front_bearing,
      markerColor: loc.marker_color,
      locationNotes: loc.location_notes,
    };

    try {
      const res = await fetch(`/signs/locations/${locationId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        loc.latitude = lat;
        loc.longitude = lng;
      } else {
        console.error("Drag persist failed:", data.error);
      }
    } catch (err) {
      console.error("persistDrag error:", err);
    }
  }

  // ============================================================
  // PHOTO HANDLING
  // ============================================================

  function renderEditorPhoto(loc) {
    const dropzone = document.getElementById("editorPhotoDropzone");
    const display = document.getElementById("editorPhotoDisplay");
    const thumb = document.getElementById("editorPhotoThumb");
    const credit = document.getElementById("editorPhotoCredit");

    if (!dropzone || !display) return;

    if (loc?.photo_url) {
      dropzone.hidden = true;
      display.hidden = false;
      if (thumb)
        thumb.src = `/signs/locations/${loc.location_id}/photo?v=${photoCacheBuster}`;
      if (credit) {
        credit.hidden = !loc.photo_taken_by;
        credit.textContent = loc.photo_taken_by
          ? `Photo by ${loc.photo_taken_by}${loc.photo_taken_at ? ` on ${formatDateDMY(loc.photo_taken_at)}` : ""}`
          : "";
      }
    } else {
      dropzone.hidden = false;
      display.hidden = true;
    }
  }

  async function uploadEditorPhoto(file) {
    if (!editingLocationId || !file) return;

    const uploading = document.getElementById("editorPhotoUploading");
    const errEl = document.getElementById("editorPhotoError");
    if (uploading) uploading.hidden = false;
    if (errEl) errEl.hidden = true;

    const form = new FormData();
    form.append("photo", file);

    try {
      const res = await fetch(`/signs/locations/${editingLocationId}/photo`, {
        method: "POST",
        headers: { "CSRF-Token": getCsrfToken() },
        body: form,
      });
      const data = await res.json();
      if (!data.success) {
        if (errEl) {
          errEl.textContent = data.error;
          errEl.hidden = false;
        }
        return;
      }

      const loc = findLocation(editingLocationId);
      if (loc) {
        loc.photo_url = data.photo_url;
        loc.photo_taken_by = data.photo_taken_by;
        loc.photo_taken_at = data.photo_taken_at;
      }
      photoCacheBuster++;
      renderEditorPhoto(loc);
    } catch (err) {
      console.error("Photo upload error:", err);
      if (errEl) {
        errEl.textContent = "Upload failed.";
        errEl.hidden = false;
      }
    } finally {
      if (uploading) uploading.hidden = true;
    }
  }

  async function deleteEditorPhoto() {
    if (!editingLocationId) return;
    if (!confirm("Remove this photo?")) return;

    try {
      const res = await fetch(`/signs/locations/${editingLocationId}/photo`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": getCsrfToken(),
        },
      });
      const data = await res.json();
      if (!data.success) {
        console.error("Photo delete failed:", data.error);
        return;
      }

      const loc = findLocation(editingLocationId);
      if (loc) {
        loc.photo_url = null;
        loc.photo_taken_by = null;
        loc.photo_taken_at = null;
      }
      renderEditorPhoto(loc);
    } catch (err) {
      console.error("deleteEditorPhoto error:", err);
    }
  }

  // ============================================================
  // GEOTAG
  // ============================================================

  function geotagLocation(targetLatEl, targetLngEl) {
    if (!navigator.geolocation) {
      alert("Geolocation not supported.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        targetLatEl.value = pos.coords.latitude.toFixed(7);
        targetLngEl.value = pos.coords.longitude.toFixed(7);
      },
      (err) => {
        alert(`Geolocation error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // ============================================================
  // INFO SHEET (mobile)
  // ============================================================

  function dismissInfoSheet(immediate) {
    const sheet = document.getElementById("signsInfoSheet");
    const backdrop = document.getElementById("signsInfoSheetBackdrop");
    if (sheet) {
      sheet.classList.remove("signs-info-sheet-open");
      sheet.classList.add("d-none");
    }
    if (backdrop) {
      backdrop.classList.remove("signs-info-sheet-backdrop-visible");
      backdrop.classList.add("d-none");
    }
  }

  // ============================================================
  // UI WIRING
  // ============================================================

  function wireUi() {
    // Filters
    document.querySelectorAll('input[name="statusFilter"]').forEach((radio) => {
      radio.addEventListener("change", () => applyFilters());
    });
    const templateFilter = document.getElementById("signTemplateFilter");
    if (templateFilter)
      templateFilter.addEventListener("change", () => applyFilters());

    // Add location button
    const addBtn = document.getElementById("addLocationBtn");
    if (addBtn) addBtn.addEventListener("click", () => enterPlacingMode());

    // Cancel add
    const cancelBtn = document.getElementById("cancelAddBtn");
    if (cancelBtn)
      cancelBtn.addEventListener("click", () => {
        clearPendingMarker();
        exitPlacingMode();
      });

    // Geotag new
    const geoNewBtn = document.getElementById("geotagNewBtn");
    if (geoNewBtn) {
      geoNewBtn.addEventListener("click", () => {
        if (!navigator.geolocation) {
          alert("Geolocation not supported.");
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => beginNewLocation(pos.coords.latitude, pos.coords.longitude),
          (err) => alert(`Geolocation error: ${err.message}`),
          { enableHighAccuracy: true, timeout: 10000 },
        );
      });
    }

    // Editor save
    const saveBtn = document.getElementById("editorSaveBtn");
    if (saveBtn) saveBtn.addEventListener("click", () => saveFromEditor());

    // Editor delete
    const delBtn = document.getElementById("editorDeleteBtn");
    if (delBtn) delBtn.addEventListener("click", () => deleteFromEditor());

    // Editor colour swatches
    document
      .querySelectorAll("#editorColorSwatches .signs-color-swatch")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          document
            .querySelectorAll("#editorColorSwatches .signs-color-swatch")
            .forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
        });
      });

    // Geotag update
    const geoUpdateBtn = document.getElementById("geotagUpdateBtn");
    if (geoUpdateBtn) {
      geoUpdateBtn.addEventListener("click", () => {
        geotagLocation(
          document.getElementById("editorLat"),
          document.getElementById("editorLng"),
        );
      });
    }

    // Photo upload / capture
    const uploadInput = document.getElementById("editorPhotoUploadInput");
    const captureInput = document.getElementById("editorPhotoCaptureInput");
    const uploadBtn = document.getElementById("editorPhotoUploadBtn");
    const captureBtn = document.getElementById("editorPhotoCaptureBtn");
    const replaceBtn = document.getElementById("editorPhotoReplaceBtn");
    const captureReplaceBtn = document.getElementById(
      "editorPhotoCaptureReplaceBtn",
    );
    const photoDeleteBtn = document.getElementById("editorPhotoDeleteBtn");

    if (uploadBtn)
      uploadBtn.addEventListener("click", () => uploadInput?.click());
    if (captureBtn)
      captureBtn.addEventListener("click", () => captureInput?.click());
    if (replaceBtn)
      replaceBtn.addEventListener("click", () => uploadInput?.click());
    if (captureReplaceBtn)
      captureReplaceBtn.addEventListener("click", () => captureInput?.click());
    if (uploadInput)
      uploadInput.addEventListener("change", () => {
        if (uploadInput.files?.[0]) uploadEditorPhoto(uploadInput.files[0]);
        uploadInput.value = "";
      });
    if (captureInput)
      captureInput.addEventListener("change", () => {
        if (captureInput.files?.[0]) uploadEditorPhoto(captureInput.files[0]);
        captureInput.value = "";
      });
    if (photoDeleteBtn)
      photoDeleteBtn.addEventListener("click", () => deleteEditorPhoto());

    // Add attachment toggle
    const addAttToggle = document.getElementById("addAttachmentToggle");
    const addAttForm = document.getElementById("addAttachmentForm");
    if (addAttToggle && addAttForm) {
      addAttToggle.addEventListener("click", () => {
        bootstrap.Collapse.getOrCreateInstance(addAttForm).toggle();
      });
    }

    // Add attachment arrow picker
    document
      .querySelectorAll("#addAttachmentForm .arrow-btn")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const dir = btn.dataset.arrow ?? "";
          document.getElementById("addAttArrowDirection").value = dir;
          syncAddAttArrowPicker(dir);
        });
      });

    // Add attachment save
    const addAttSave = document.getElementById("addAttSaveBtn");
    if (addAttSave)
      addAttSave.addEventListener("click", () => addAttachmentFromForm());

    // Add attachment cancel
    const addAttCancel = document.getElementById("addAttCancelBtn");
    if (addAttCancel) {
      addAttCancel.addEventListener("click", () => {
        const form = document.getElementById("addAttachmentForm");
        if (form) bootstrap.Collapse.getOrCreateInstance(form).hide();
      });
    }

    // Editor offcanvas close → clean up pending marker
    const editorEl = document.getElementById("locationEditor");
    if (editorEl) {
      editorEl.addEventListener("hidden.bs.offcanvas", () => {
        if (!editingLocationId) {
          clearPendingMarker();
          exitPlacingMode();
        }
      });
    }

    // Escape key → deselect / exit placing mode
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (isPlacing) {
          clearPendingMarker();
          exitPlacingMode();
        }
      }
    });
  }

  // ============================================================
  // BOOTSTRAP
  // ============================================================

  function init() {
    const root = document.getElementById("signsMapRoot");
    if (!root) return;

    const apiKey = root.getAttribute("data-api-key") || "";
    const centerLat = Number(root.getAttribute("data-center-lat"));
    const centerLng = Number(root.getAttribute("data-center-lng"));
    const centerZoom = Number(root.getAttribute("data-center-zoom")) || 17;
    canManage = root.getAttribute("data-can-manage") === "1";

    const dataEl = document.getElementById("signsMapBootstrap");
    if (dataEl) {
      try {
        const parsed = JSON.parse(dataEl.textContent || "{}");
        signs = Array.isArray(parsed.signs) ? parsed.signs : [];
        locations = Array.isArray(parsed.locations) ? parsed.locations : [];
      } catch (err) {
        console.error("Failed to parse signsMapBootstrap JSON:", err);
      }
    }

    wireUi();
    renderLocationList();

    if (!apiKey) return;

    loadGoogleMaps(apiKey)
      .then(() => initMap({ lat: centerLat, lng: centerLng, zoom: centerZoom }))
      .catch((err) => console.error("Google Maps load failed:", err));
  }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
})();
