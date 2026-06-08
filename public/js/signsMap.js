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

  /** Inline SVG icons for mount types (compact markers + full-detail label). */
  const MOUNT_ICONS = {
    cone: '<svg class="signs-mount-icon" viewBox="0 0 16 16" aria-hidden="true"><polygon points="8,2 13,14 3,14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><line x1="2" y1="14" x2="14" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    "a-frame":
      '<svg class="signs-mount-icon" viewBox="0 0 16 16" aria-hidden="true"><polyline points="3,14 8,2 13,14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><line x1="5" y1="10" x2="11" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    "existing-structure":
      '<svg class="signs-mount-icon" viewBox="0 0 16 16" aria-hidden="true"><line x1="8" y1="3" x2="8" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="4" y1="5" x2="12" y2="5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    pole: '<svg class="signs-mount-icon" viewBox="0 0 16 16" aria-hidden="true"><line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };

  /** Delay (ms) before a hovered compact marker expands to full detail. */
  const HOVER_EXPAND_DELAY = 250;

  /** Delay (ms) before a full-detail hover-expanded marker collapses. */
  const HOVER_COLLAPSE_DELAY = 150;

  /** Minimum ms since last drag/pan before a marker click is honoured. */
  const CLICK_AFTER_DRAG_THRESHOLD = 300;

  /**
   * Attach the Shift+zoom drag gate to a location marker's content.
   * Blocks Maps' built-in drag unless Shift is held at sufficient zoom.
   * No-op on coarse-pointer devices or if the user lacks manage rights.
   *
   * @param {HTMLElement} content
   */
  function attachLocationShiftGate(content) {
    if (!canManage || isCoarsePointer) return;
    content.addEventListener(
      "pointerdown",
      (e) => {
        if (!shiftHeld || !canDragAtCurrentZoom()) {
          e.stopImmediatePropagation();
        }
      },
      true,
    );
  }

  /**
   * Attach the Shift+zoom drag gate to an arrow marker's content.
   * Same as the location gate, but also intercepts the rotation
   * handle so Shift+drag on the handle starts bearing adjustment
   * instead of a Maps drag.
   *
   * @param {HTMLElement} content
   * @param {number} arrowId
   */
  function attachArrowShiftGate(content, arrowId) {
    if (!canManage || isCoarsePointer) return;
    content.addEventListener(
      "pointerdown",
      (e) => {
        const onHandle = e.target.closest(".signs-arrow-handle");
        if (!shiftHeld || !canDragAtCurrentZoom()) {
          e.stopImmediatePropagation();
          if (shiftHeld && onHandle) {
            beginArrowRotation(arrowId, e);
          }
          return;
        }
        if (onHandle) {
          e.stopImmediatePropagation();
          beginArrowRotation(arrowId, e);
        }
      },
      true,
    );
  }

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

  /** @type {Map<number, number>} location_id → setTimeout ID for hover expand/collapse */
  const hoverTimers = new Map();

  /** @type {Set<number>} Location IDs currently hover-expanded to full detail */
  const hoverExpanded = new Set();

  /** Timestamp of last drag/pan end — used to suppress accidental clicks. */
  let lastDragEndTime = 0;

  /** @type {Array<object>} */
  let arrows = [];
  /** @type {Map<number, google.maps.marker.AdvancedMarkerElement>} */
  const arrowMarkers = new Map();
  let selectedArrowId = null;
  let isPlacingArrow = false;
  let arrowEditorOffcanvas = null;
  let shiftHeld = false;
  let isRotatingArrow = false;
  let rotatingArrowId = null;
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;

  /** Minimum zoom level at which Shift+drag movement is allowed. */
  const MIN_ZOOM_FOR_DRAG = 17;

  /**
   * Zoom level at and above which markers render at full detail.
   * Below this, locations show as compact abbreviation discs and
   * arrows show as small dots.
   */
  const ZOOM_FULL_DETAIL = 19;

  /**
   * Current marker detail level. Cached so we only swap content
   * when the level crosses the threshold, not on every zoom_changed.
   * @type {'compact'|'full'}
   */
  let currentDetailLevel = "full";

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

  /** @param {number} id */
  function findArrow(id) {
    return arrows.find((a) => a.arrow_id === id) || null;
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

  /**
   * Whether the current zoom level permits marker/arrow dragging.
   * @returns {boolean}
   */
  function canDragAtCurrentZoom() {
    return mapRef ? mapRef.getZoom() >= MIN_ZOOM_FOR_DRAG : false;
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
        if (isPlacingArrow) {
          beginNewArrow(e.latLng.lat(), e.latLng.lng());
          return;
        }
        if (!isPlacing) return;
        beginNewLocation(e.latLng.lat(), e.latLng.lng());
      });
    }

    // Track map pan end for click-after-drag suppression
    mapRef.addListener("dragend", () => {
      lastDragEndTime = Date.now();
    });

    // Seed detail level from initial zoom
    currentDetailLevel = detailLevelForZoom(mapRef.getZoom());

    // Add markers
    locations.forEach((loc) => addMarkerForLocation(loc));
    arrows.forEach((arrow) => addMarkerForArrow(arrow));
    applyFilters();
    renderLocationList();

    // Zoom indicator + detail level switching
    updateZoomIndicator(mapRef.getZoom());
    mapRef.addListener("zoom_changed", () => {
      const zoom = mapRef.getZoom();
      updateZoomIndicator(zoom);

      const newLevel = detailLevelForZoom(zoom);
      if (newLevel !== currentDetailLevel) {
        currentDetailLevel = newLevel;
        applyDetailLevelToAll(newLevel);
      }
    });
  }

  // ============================================================
  // ZOOM INDICATOR
  // ============================================================

  /**
   * Update the zoom level badge and sync the input field.
   *
   * @param {number} zoom
   */
  function updateZoomIndicator(zoom) {
    const rounded = Math.round(zoom * 10) / 10;
    const badge = document.getElementById("zoomLevelBadge");
    const input = document.getElementById("zoomLevelInput");
    if (badge) badge.textContent = `Z ${rounded}`;
    if (input) input.value = rounded;
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

    // Mount-type label below the sign stack
    if (loc.mount_type && MOUNT_ICONS[loc.mount_type]) {
      const label = document.createElement("div");
      label.className = "signs-map-marker-mount-label";
      label.innerHTML = MOUNT_ICONS[loc.mount_type];
      const text = document.createElement("span");
      text.textContent = MOUNT_LABELS[loc.mount_type] || loc.mount_type;
      label.appendChild(text);
      wrapper.appendChild(label);
    }

    return wrapper;
  }

  /**
   * Create an AdvancedMarkerElement for a location.
   * Movement requires Shift+drag at zoom >= MIN_ZOOM_FOR_DRAG
   * (desktop only). Completely blocked on coarse-pointer devices.
   *
   * @param {object} loc
   */
  function addMarkerForLocation(loc) {
    const content = buildMarkerContent(loc);
    const draggable = canManage && !isCoarsePointer;
    const marker = new google.maps.marker.AdvancedMarkerElement({
      map: mapRef,
      position: { lat: Number(loc.latitude), lng: Number(loc.longitude) },
      content,
      title:
        (loc.attachments || []).map((a) => a.sign_text).join(", ") ||
        "Empty location",
      gmpDraggable: draggable,
    });

    // Click → select + open editor (suppressed briefly after drag/pan)
    marker.addListener("click", () => {
      if (Date.now() - lastDragEndTime < CLICK_AFTER_DRAG_THRESHOLD) return;
      selectMarker(loc.location_id);
      openEditor(loc.location_id);
    });

    // Shift-gate: block Maps drag unless Shift held + zoomed in
    if (draggable) {
      attachLocationShiftGate(content);

      marker.addListener("dragstart", () => {
        isDraggingMarker = true;
        document.body.classList.add("signs-map-dragging");
        dismissInfoSheet(true);
        dismissEditorIfOpen();
      });

      marker.addListener("dragend", () => {
        isDraggingMarker = false;
        lastDragEndTime = Date.now();
        document.body.classList.remove("signs-map-dragging");
        const pos = marker.position;
        const lat = typeof pos.lat === "function" ? pos.lat() : pos.lat;
        const lng = typeof pos.lng === "function" ? pos.lng() : pos.lng;
        persistDrag(loc.location_id, lat, lng);
      });
    }

    // Hover-to-expand for compact markers (desktop only)
    attachHoverExpand(loc, marker, content);

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

    const useFullDetail =
      currentDetailLevel === "full" || hoverExpanded.has(locationId);
    const content = useFullDetail
      ? buildMarkerContent(loc)
      : buildCompactLocationContent(loc);

    // Re-attach shift-gate on new content
    attachLocationShiftGate(content);

    if (selectedId === locationId) {
      content.classList.add("signs-map-marker-selected");
    }

    marker.content = content;
    marker.title =
      (loc.attachments || []).map((a) => a.sign_text).join(", ") ||
      "Empty location";

    // Re-attach hover behavior for compact mode
    if (currentDetailLevel === "compact") {
      if (hoverExpanded.has(locationId)) {
        content.addEventListener("mouseleave", () => {
          clearTimeout(hoverTimers.get(locationId));
          hoverTimers.set(
            locationId,
            setTimeout(() => {
              collapseMarkerOnHover(loc, marker);
            }, HOVER_COLLAPSE_DELAY),
          );
        });
      } else {
        attachHoverExpand(loc, marker, content);
      }
    }
  }

  // ============================================================
  // SELECTION
  // ============================================================

  function selectMarker(locationId) {
    // Deselect any selected arrow
    if (selectedArrowId !== null) {
      const prevArrow = arrowMarkers.get(selectedArrowId);
      if (prevArrow?.content)
        prevArrow.content.classList.remove("signs-arrow-marker-selected");
      clearArrowHighlights();
      selectedArrowId = null;
    }
    dismissArrowEditorIfOpen();

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
  // TRAFFIC ARROW MARKERS
  // ============================================================

  /**
   * Build the SVG arrow element for a traffic arrow marker.
   * The arrow points "up" (north = 0°) by default; the wrapper
   * is rotated by the arrow's bearing. Includes a rotation handle
   * at the tip for Shift+drag bearing adjustment (desktop only).
   *
   * @param {object} arrow
   * @returns {HTMLDivElement}
   */
  function buildArrowMarkerContent(arrow) {
    const wrapper = document.createElement("div");
    const selCls =
      selectedArrowId === arrow.arrow_id ? " signs-arrow-marker-selected" : "";
    wrapper.className = `signs-arrow-marker${selCls}`;
    wrapper.style.transform = `translateY(26px) rotate(${arrow.bearing || 0}deg)`;

    wrapper.innerHTML = `<svg viewBox="0 0 40 64" xmlns="http://www.w3.org/2000/svg">
      <line class="signs-arrow-marker-outline" x1="20" y1="56" x2="20" y2="26" />
      <line class="signs-arrow-marker-fg" x1="20" y1="56" x2="20" y2="26" />
      <polyline class="signs-arrow-marker-outline" points="8,30 20,6 32,30" />
      <polyline class="signs-arrow-marker-fg" points="8,30 20,6 32,30" />
    </svg>`;

    // Rotation handle at the tip (desktop only)
    if (canManage && !isCoarsePointer) {
      const handle = document.createElement("div");
      handle.className = "signs-arrow-handle";
      wrapper.appendChild(handle);
    }

    return wrapper;
  }

  /**
   * Place a traffic arrow on the map as an AdvancedMarkerElement.
   * Movement requires Shift+drag (desktop only). Rotation is
   * triggered by Shift+drag on the tip handle. Both are completely
   * blocked on coarse-pointer (mobile/tablet) devices.
   *
   * @param {object} arrow
   */
  function addMarkerForArrow(arrow) {
    const content = buildArrowMarkerContent(arrow);
    const draggable = canManage && !isCoarsePointer;
    const marker = new google.maps.marker.AdvancedMarkerElement({
      map: mapRef,
      position: { lat: Number(arrow.latitude), lng: Number(arrow.longitude) },
      content,
      title: arrow.label || "Traffic arrow",
      gmpDraggable: draggable,
      zIndex: 10,
    });

    marker.addListener("click", () => {
      if (Date.now() - lastDragEndTime < CLICK_AFTER_DRAG_THRESHOLD) return;
      selectArrow(arrow.arrow_id);
      openArrowEditor(arrow.arrow_id);
    });

    if (draggable) {
      attachArrowShiftGate(content, arrow.arrow_id);

      marker.addListener("dragstart", () => {
        isDraggingMarker = true;
        document.body.classList.add("signs-map-dragging");
        dismissInfoSheet(true);
      });

      marker.addListener("dragend", () => {
        isDraggingMarker = false;
        lastDragEndTime = Date.now();
        document.body.classList.remove("signs-map-dragging");
        const pos = marker.position;
        const lat = typeof pos.lat === "function" ? pos.lat() : pos.lat;
        const lng = typeof pos.lng === "function" ? pos.lng() : pos.lng;
        persistArrowDrag(arrow.arrow_id, lat, lng);
      });
    }

    arrowMarkers.set(arrow.arrow_id, marker);
  }

  /**
   * Rebuild an arrow marker's DOM after data changes.
   *
   * @param {number} arrowId
   */
  function refreshArrowMarker(arrowId) {
    const arrow = findArrow(arrowId);
    const marker = arrowMarkers.get(arrowId);
    if (!arrow || !marker) return;
    marker.content = buildArrowMarkerContent(arrow);
    marker.title = arrow.label || "Traffic arrow";
  }

  // ============================================================
  // COMPACT MARKERS (low-zoom rendering)
  // ============================================================

  /**
   * Build a compact 32px disc marker for a location — shows the
   * mount-type icon (cone, a-frame, pole) with a count badge for
   * the number of attached signs.
   *
   * @param {object} loc
   * @returns {HTMLDivElement}
   */
  function buildCompactLocationContent(loc) {
    const status = deriveStatus(loc);
    const colorCls = loc.marker_color
      ? ` signs-map-marker-color-${loc.marker_color}`
      : "";
    const wrapper = document.createElement("div");
    wrapper.className = `signs-map-marker signs-map-marker-compact signs-map-marker-${status}${colorCls}`;

    const disc = document.createElement("div");
    disc.className = "signs-map-marker-disc";

    const atts = (loc.attachments || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);

    // Mount-type icon or fallback bullet
    if (loc.mount_type && MOUNT_ICONS[loc.mount_type]) {
      const iconWrap = document.createElement("span");
      iconWrap.className = "signs-map-marker-mount-icon-wrap";
      iconWrap.innerHTML = MOUNT_ICONS[loc.mount_type];
      disc.appendChild(iconWrap);
    } else {
      const abbr = document.createElement("span");
      abbr.className = "signs-map-marker-abbr";
      abbr.textContent = "\u2022";
      disc.appendChild(abbr);
    }
    wrapper.appendChild(disc);

    // Count badge (1+ attachments; empty locations have no badge)
    if (atts.length >= 1) {
      const badge = document.createElement("span");
      badge.className = "signs-map-marker-count";
      badge.textContent = atts.length;
      wrapper.appendChild(badge);
    }

    return wrapper;
  }

  /**
   * Build compact arrow content — a small directional dot.
   *
   * @param {object} arrow
   * @returns {HTMLDivElement}
   */
  function buildCompactArrowContent(arrow) {
    const wrapper = document.createElement("div");
    const selCls =
      selectedArrowId === arrow.arrow_id ? " signs-arrow-marker-selected" : "";
    wrapper.className = `signs-arrow-marker signs-arrow-marker-compact${selCls}`;
    wrapper.style.transform = `translateY(6px) rotate(${arrow.bearing || 0}deg)`;
    wrapper.innerHTML = `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
      <polyline class="signs-arrow-marker-outline" points="4,16 10,4 16,16"
                stroke-width="4" />
      <polyline class="signs-arrow-marker-fg" points="4,16 10,4 16,16"
                stroke-width="2.5" />
    </svg>`;
    return wrapper;
  }

  // ============================================================
  // HOVER-TO-EXPAND (compact markers, desktop only)
  // ============================================================

  /**
   * Attach mouseenter/mouseleave listeners to a compact marker
   * that temporarily expand it to full detail on hover. No-op
   * when the detail level is 'full' or on coarse-pointer devices.
   *
   * @param {object} loc
   * @param {google.maps.marker.AdvancedMarkerElement} marker
   * @param {HTMLElement} content
   */
  function attachHoverExpand(loc, marker, content) {
    if (isCoarsePointer || currentDetailLevel !== "compact") return;

    content.addEventListener("mouseenter", () => {
      clearTimeout(hoverTimers.get(loc.location_id));
      hoverTimers.set(
        loc.location_id,
        setTimeout(() => {
          expandMarkerOnHover(loc, marker);
        }, HOVER_EXPAND_DELAY),
      );
    });

    content.addEventListener("mouseleave", () => {
      clearTimeout(hoverTimers.get(loc.location_id));
      if (hoverExpanded.has(loc.location_id)) {
        hoverTimers.set(
          loc.location_id,
          setTimeout(() => {
            collapseMarkerOnHover(loc, marker);
          }, HOVER_COLLAPSE_DELAY),
        );
      }
    });
  }

  /**
   * Expand a compact marker to full detail on hover.
   *
   * @param {object} loc
   * @param {google.maps.marker.AdvancedMarkerElement} marker
   */
  function expandMarkerOnHover(loc, marker) {
    if (currentDetailLevel !== "compact") return;
    hoverExpanded.add(loc.location_id);

    const content = buildMarkerContent(loc);
    if (selectedId === loc.location_id) {
      content.classList.add("signs-map-marker-selected");
    }
    attachLocationShiftGate(content);
    // Collapse when the mouse leaves the expanded content
    content.addEventListener("mouseleave", () => {
      clearTimeout(hoverTimers.get(loc.location_id));
      hoverTimers.set(
        loc.location_id,
        setTimeout(() => {
          collapseMarkerOnHover(loc, marker);
        }, HOVER_COLLAPSE_DELAY),
      );
    });
    marker.content = content;
  }

  /**
   * Collapse a hover-expanded marker back to compact.
   *
   * @param {object} loc
   * @param {google.maps.marker.AdvancedMarkerElement} marker
   */
  function collapseMarkerOnHover(loc, marker) {
    if (currentDetailLevel !== "compact") return;
    hoverExpanded.delete(loc.location_id);

    const content = buildCompactLocationContent(loc);
    if (selectedId === loc.location_id) {
      content.classList.add("signs-map-marker-selected");
    }
    attachLocationShiftGate(content);
    attachHoverExpand(loc, marker, content);
    marker.content = content;
  }

  /**
   * Map a zoom level to the detail level.
   *
   * @param {number} zoom
   * @returns {'compact'|'full'}
   */
  function detailLevelForZoom(zoom) {
    return zoom >= ZOOM_FULL_DETAIL ? "full" : "compact";
  }

  /**
   * Swap all markers to match the new detail level. Preserves
   * selection highlighting on rebuilt content.
   *
   * @param {'compact'|'full'} level
   */
  function applyDetailLevelToAll(level) {
    // Clear all hover-expand state on level change
    hoverTimers.forEach((timerId) => clearTimeout(timerId));
    hoverTimers.clear();
    hoverExpanded.clear();

    // Location markers
    locations.forEach((loc) => {
      const marker = markers.get(loc.location_id);
      if (!marker) return;
      const content =
        level === "full"
          ? buildMarkerContent(loc)
          : buildCompactLocationContent(loc);
      if (selectedId === loc.location_id) {
        content.classList.add("signs-map-marker-selected");
      }

      attachLocationShiftGate(content);

      marker.content = content;

      // Attach hover-to-expand for compact mode
      if (level === "compact") {
        attachHoverExpand(loc, marker, content);
      }
    });

    // Arrow markers
    arrows.forEach((arrow) => {
      const marker = arrowMarkers.get(arrow.arrow_id);
      if (!marker) return;
      const content =
        level === "full"
          ? buildArrowMarkerContent(arrow)
          : buildCompactArrowContent(arrow);
      if (selectedArrowId === arrow.arrow_id) {
        content.classList.add("signs-arrow-marker-selected");
      }

      attachArrowShiftGate(content, arrow.arrow_id);

      marker.content = content;
    });
  }

  /**
   * Select a traffic arrow, deselecting any previous arrow and
   * any selected location marker. Highlights linked sign markers.
   *
   * @param {number} arrowId
   */
  function selectArrow(arrowId) {
    // Deselect previous location
    if (selectedId !== null) {
      const prev = markers.get(selectedId);
      if (prev?.content)
        prev.content.classList.remove("signs-map-marker-selected");
      selectedId = null;
    }

    // Deselect previous arrow
    if (selectedArrowId !== null && selectedArrowId !== arrowId) {
      const prev = arrowMarkers.get(selectedArrowId);
      if (prev?.content)
        prev.content.classList.remove("signs-arrow-marker-selected");
      clearArrowHighlights();
    }

    selectedArrowId = arrowId;
    const m = arrowMarkers.get(arrowId);
    if (m?.content) {
      m.content.classList.add("signs-arrow-marker-selected");
      mapRef?.panTo(m.position);
    }

    // Highlight linked sign markers
    highlightLinkedMarkers(arrowId);
  }

  /**
   * Add a highlight glow to sign markers linked to the given arrow.
   *
   * @param {number} arrowId
   */
  function highlightLinkedMarkers(arrowId) {
    clearArrowHighlights();
    const arrow = findArrow(arrowId);
    if (!arrow) return;

    (arrow.links || []).forEach((attId) => {
      // Find which location owns this attachment
      const loc = locations.find((l) =>
        (l.attachments || []).some((a) => a.attachment_id === attId),
      );
      if (!loc) return;
      const marker = markers.get(loc.location_id);
      if (marker?.content)
        marker.content.classList.add("signs-map-marker-arrow-linked");
    });
  }

  /**
   * Remove all arrow-linked highlight classes from sign markers.
   */
  function clearArrowHighlights() {
    markers.forEach((marker) => {
      if (marker?.content)
        marker.content.classList.remove("signs-map-marker-arrow-linked");
    });
  }

  /**
   * Persist an arrow position after a drag.
   *
   * @param {number} arrowId
   * @param {number} lat
   * @param {number} lng
   */
  async function persistArrowDrag(arrowId, lat, lng) {
    const arrow = findArrow(arrowId);
    if (!arrow) return;

    try {
      const res = await fetch(`/signs/arrows/${arrowId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify({
          latitude: lat,
          longitude: lng,
          bearing: arrow.bearing,
          label: arrow.label,
          color: arrow.color,
        }),
      });
      const data = await res.json();
      if (data.success) {
        arrow.latitude = lat;
        arrow.longitude = lng;
      } else {
        // Snap back
        const marker = arrowMarkers.get(arrowId);
        if (marker)
          marker.position = {
            lat: Number(arrow.latitude),
            lng: Number(arrow.longitude),
          };
      }
    } catch (err) {
      console.error("Arrow drag persist failed:", err);
    }
  }

  // ============================================================
  // TRAFFIC ARROW ROTATION
  // ============================================================

  /**
   * Begin rotating an arrow's bearing via pointer drag.
   * Computes the angle from the arrow marker's screen centre
   * to the pointer position and maps it to a compass bearing.
   *
   * @param {number} arrowId
   * @param {PointerEvent} startEvent
   */
  function beginArrowRotation(arrowId, startEvent) {
    isRotatingArrow = true;
    rotatingArrowId = arrowId;
    const marker = arrowMarkers.get(arrowId);
    if (!marker?.content) return;

    document.body.classList.add("signs-arrow-rotating");

    /**
     * Get the screen-centre of the arrow marker element.
     * @returns {{ cx: number, cy: number }}
     */
    function markerCenter() {
      const rect = marker.content.getBoundingClientRect();
      return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
    }

    /** @param {PointerEvent} e */
    function onMove(e) {
      const { cx, cy } = markerCenter();
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      // atan2 gives angle from positive-X axis (east); convert to
      // compass bearing (0 = north, clockwise).
      const angleDeg = Math.atan2(dx, -dy) * (180 / Math.PI);
      const bearing = ((angleDeg % 360) + 360) % 360;
      const rounded = Math.round(bearing * 10) / 10;

      // Live-update the marker rotation (preserve the tip-anchor offset)
      const yOff = marker.content.classList.contains(
        "signs-arrow-marker-compact",
      )
        ? 6
        : 26;
      marker.content.style.transform = `translateY(${yOff}px) rotate(${rounded}deg)`;

      // Update in-memory state for persistence on pointerup
      const arrow = findArrow(arrowId);
      if (arrow) arrow.bearing = rounded;
    }

    /** @param {PointerEvent} e */
    function onUp(e) {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.classList.remove("signs-arrow-rotating");
      isRotatingArrow = false;
      rotatingArrowId = null;

      // Persist
      const arrow = findArrow(arrowId);
      if (arrow) {
        persistArrowDrag(arrowId, arrow.latitude, arrow.longitude);
        // Update the bearing field if the editor is open
        const bearingInput = document.getElementById("arrowEditorBearing");
        const editorEl = document.getElementById("arrowEditor");
        if (bearingInput && Number(editorEl?.dataset.arrowId) === arrowId) {
          bearingInput.value = arrow.bearing;
        }
      }
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  // ============================================================
  // TRAFFIC ARROW PLACING MODE
  // ============================================================

  /**
   * Enter arrow-placing mode. Click on the map to drop an arrow.
   */
  function enterArrowPlacingMode() {
    exitPlacingMode();
    isPlacingArrow = true;
    const help = document.getElementById("addArrowHelp");
    if (help) help.hidden = false;
    const locHelp = document.getElementById("addLocationHelp");
    if (locHelp) locHelp.hidden = true;
    if (mapRef) mapRef.getDiv().style.cursor = "crosshair";
  }

  /**
   * Exit arrow-placing mode.
   */
  function exitArrowPlacingMode() {
    isPlacingArrow = false;
    const help = document.getElementById("addArrowHelp");
    if (help) help.hidden = true;
    if (mapRef) mapRef.getDiv().style.cursor = "";
  }

  /**
   * Create a new traffic arrow at the clicked position.
   *
   * @param {number} lat
   * @param {number} lng
   */
  async function beginNewArrow(lat, lng) {
    exitArrowPlacingMode();

    try {
      const res = await fetch("/signs/arrows", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify({ latitude: lat, longitude: lng, bearing: 0 }),
      });
      const data = await res.json();
      if (!data.success) {
        console.error("Create arrow failed:", data.error);
        return;
      }

      const arrow = {
        arrow_id: data.arrowId,
        latitude: lat,
        longitude: lng,
        bearing: 0,
        label: null,
        color: null,
        links: [],
      };
      arrows.push(arrow);
      addMarkerForArrow(arrow);
      selectArrow(arrow.arrow_id);
      openArrowEditor(arrow.arrow_id);
    } catch (err) {
      console.error("Create arrow error:", err);
    }
  }

  // ============================================================
  // TRAFFIC ARROW EDITOR
  // ============================================================

  /**
   * Open the arrow editor offcanvas for the given arrow.
   *
   * @param {number} arrowId
   */
  function openArrowEditor(arrowId) {
    // Close location editor if open
    dismissEditorIfOpen();

    const arrow = findArrow(arrowId);
    if (!arrow) return;

    const el = document.getElementById("arrowEditor");
    if (!el) return;

    // Populate fields
    document.getElementById("arrowEditorBearing").value = arrow.bearing ?? "";
    document.getElementById("arrowEditorLabel").value = arrow.label || "";
    document.getElementById("arrowEditorLat").value = arrow.latitude;
    document.getElementById("arrowEditorLng").value = arrow.longitude;

    renderArrowLinks(arrow);

    if (!arrowEditorOffcanvas) {
      arrowEditorOffcanvas = new bootstrap.Offcanvas(el);
    }
    arrowEditorOffcanvas.show();
    el.dataset.arrowId = arrowId;
  }

  /**
   * Save the arrow editor form.
   */
  async function saveArrowEditor() {
    const el = document.getElementById("arrowEditor");
    const arrowId = Number(el?.dataset.arrowId);
    const arrow = findArrow(arrowId);
    if (!arrow) return;

    const bearing = parseFloat(
      document.getElementById("arrowEditorBearing").value,
    );
    const label =
      document.getElementById("arrowEditorLabel").value.trim() || null;
    const lat = parseFloat(document.getElementById("arrowEditorLat").value);
    const lng = parseFloat(document.getElementById("arrowEditorLng").value);

    if (isNaN(bearing) || isNaN(lat) || isNaN(lng)) {
      showArrowEditorFeedback("Invalid bearing or coordinates.", true);
      return;
    }

    try {
      const res = await fetch(`/signs/arrows/${arrowId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify({
          latitude: lat,
          longitude: lng,
          bearing,
          label,
          color: arrow.color,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        showArrowEditorFeedback(data.error || "Save failed.", true);
        return;
      }

      arrow.latitude = lat;
      arrow.longitude = lng;
      arrow.bearing = bearing;
      arrow.label = label;

      const marker = arrowMarkers.get(arrowId);
      if (marker) {
        marker.position = { lat, lng };
      }
      refreshArrowMarker(arrowId);
      highlightLinkedMarkers(arrowId);
      showArrowEditorFeedback("Saved.");
    } catch (err) {
      console.error("Arrow save error:", err);
      showArrowEditorFeedback("Network error.", true);
    }
  }

  /**
   * Delete the arrow currently open in the editor.
   */
  async function deleteArrowEditor() {
    const el = document.getElementById("arrowEditor");
    const arrowId = Number(el?.dataset.arrowId);
    if (!arrowId || !confirm("Delete this traffic arrow?")) return;

    try {
      const res = await fetch(`/signs/arrows/${arrowId}`, {
        method: "DELETE",
        headers: { "CSRF-Token": getCsrfToken() },
      });
      const data = await res.json();
      if (!data.success) {
        showArrowEditorFeedback(data.error || "Delete failed.", true);
        return;
      }

      // Remove from state
      arrows = arrows.filter((a) => a.arrow_id !== arrowId);
      const marker = arrowMarkers.get(arrowId);
      if (marker) marker.map = null;
      arrowMarkers.delete(arrowId);
      clearArrowHighlights();
      selectedArrowId = null;

      arrowEditorOffcanvas?.hide();
    } catch (err) {
      console.error("Arrow delete error:", err);
      showArrowEditorFeedback("Network error.", true);
    }
  }

  /**
   * Show feedback text in the arrow editor.
   *
   * @param {string} msg
   * @param {boolean} [isError=false]
   */
  function showArrowEditorFeedback(msg, isError) {
    const el = document.getElementById("arrowEditorFeedback");
    if (!el) return;
    el.textContent = msg;
    el.className = `small mt-2 ${isError ? "text-danger" : "text-success"}`;
    if (!isError) {
      setTimeout(() => {
        if (el.textContent === msg) el.textContent = "";
      }, 3000);
    }
  }

  // ============================================================
  // ARROW LINK MANAGEMENT
  // ============================================================

  /**
   * Render the linked-signs list in the arrow editor.
   *
   * @param {object} arrow
   */
  function renderArrowLinks(arrow) {
    const list = document.getElementById("arrowLinkList");
    const countBadge = document.getElementById("arrowLinkCount");
    if (!list) return;
    list.replaceChildren();

    const links = arrow.links || [];
    if (countBadge) countBadge.textContent = links.length;

    if (links.length === 0) {
      const empty = document.createElement("p");
      empty.className = "small text-muted mb-0";
      empty.textContent = "No signs linked yet.";
      list.appendChild(empty);
    } else {
      links.forEach((attId) => {
        const row = buildArrowLinkRow(arrow.arrow_id, attId);
        if (row) list.appendChild(row);
      });
    }

    // Populate the "add link" dropdown with unlinked attachments
    populateArrowLinkPicker(arrow);
  }

  /**
   * Build a single row for the linked-signs list.
   *
   * @param {number} arrowId
   * @param {number} attachmentId
   * @returns {HTMLDivElement|null}
   */
  function buildArrowLinkRow(arrowId, attachmentId) {
    // Find attachment across all locations
    let att = null;
    let loc = null;
    for (const l of locations) {
      const a = (l.attachments || []).find(
        (x) => x.attachment_id === attachmentId,
      );
      if (a) {
        att = a;
        loc = l;
        break;
      }
    }
    if (!att) return null;

    const row = document.createElement("div");
    row.className = "signs-arrow-link-item";

    const text = document.createElement("div");
    text.className = "signs-arrow-link-item-text";
    text.innerHTML = `<span class="fw-semibold">${att.sign_text}</span>
      <span class="text-muted small">(loc #${loc.location_id})</span>`;
    row.appendChild(text);

    if (canManage) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "signs-arrow-link-remove-btn";
      btn.title = "Unlink";
      btn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      btn.addEventListener("click", () =>
        removeArrowLink(arrowId, attachmentId),
      );
      row.appendChild(btn);
    }

    return row;
  }

  /**
   * Populate the add-link dropdown with attachments not yet linked.
   *
   * @param {object} arrow
   */
  function populateArrowLinkPicker(arrow) {
    const select = document.getElementById("addArrowLinkSelect");
    if (!select) return;
    select.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Pick a sign attachment\u2026";
    select.appendChild(placeholder);

    const linked = new Set(arrow.links || []);

    locations.forEach((loc) => {
      (loc.attachments || []).forEach((att) => {
        if (linked.has(att.attachment_id)) return;
        const opt = document.createElement("option");
        opt.value = att.attachment_id;
        opt.textContent = `${att.sign_text} (loc #${loc.location_id})`;
        select.appendChild(opt);
      });
    });
  }

  /**
   * Link a selected attachment to the current arrow.
   */
  async function addArrowLink() {
    const el = document.getElementById("arrowEditor");
    const arrowId = Number(el?.dataset.arrowId);
    const select = document.getElementById("addArrowLinkSelect");
    const attachmentId = Number(select?.value);
    if (!arrowId || !attachmentId) return;

    try {
      const res = await fetch(`/signs/arrows/${arrowId}/links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify({ attachmentId }),
      });
      const data = await res.json();
      if (!data.success) {
        showArrowEditorFeedback(data.error || "Link failed.", true);
        return;
      }

      const arrow = findArrow(arrowId);
      if (arrow) {
        arrow.links.push(attachmentId);
        renderArrowLinks(arrow);
        highlightLinkedMarkers(arrowId);
      }

      // Collapse the form
      const form = document.getElementById("addArrowLinkForm");
      if (form) bootstrap.Collapse.getOrCreateInstance(form).hide();
    } catch (err) {
      console.error("Add arrow link error:", err);
      showArrowEditorFeedback("Network error.", true);
    }
  }

  /**
   * Unlink an attachment from the current arrow.
   *
   * @param {number} arrowId
   * @param {number} attachmentId
   */
  async function removeArrowLink(arrowId, attachmentId) {
    try {
      const res = await fetch(
        `/signs/arrows/${arrowId}/links/${attachmentId}`,
        {
          method: "DELETE",
          headers: { "CSRF-Token": getCsrfToken() },
        },
      );
      const data = await res.json();
      if (!data.success) {
        showArrowEditorFeedback(data.error || "Unlink failed.", true);
        return;
      }

      const arrow = findArrow(arrowId);
      if (arrow) {
        arrow.links = arrow.links.filter((id) => id !== attachmentId);
        renderArrowLinks(arrow);
        highlightLinkedMarkers(arrowId);
      }
    } catch (err) {
      console.error("Remove arrow link error:", err);
    }
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
   * Hide the arrow editor offcanvas if it is currently visible.
   */
  function dismissArrowEditorIfOpen() {
    if (arrowEditorOffcanvas) {
      try {
        arrowEditorOffcanvas.hide();
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
    dismissArrowEditorIfOpen();
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
    exitArrowPlacingMode();
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

    // ── Arrow buttons ──────────────────────────────────────────
    const addArrowBtn = document.getElementById("addArrowBtn");
    if (addArrowBtn)
      addArrowBtn.addEventListener("click", () => enterArrowPlacingMode());

    const cancelAddArrowBtn = document.getElementById("cancelAddArrowBtn");
    if (cancelAddArrowBtn)
      cancelAddArrowBtn.addEventListener("click", () => exitArrowPlacingMode());

    // Arrow editor save
    const arrowSaveBtn = document.getElementById("arrowEditorSaveBtn");
    if (arrowSaveBtn)
      arrowSaveBtn.addEventListener("click", () => saveArrowEditor());

    // Arrow editor delete
    const arrowDelBtn = document.getElementById("arrowEditorDeleteBtn");
    if (arrowDelBtn)
      arrowDelBtn.addEventListener("click", () => deleteArrowEditor());

    // Arrow link toggle
    const arrowLinkToggle = document.getElementById("addArrowLinkToggle");
    const arrowLinkForm = document.getElementById("addArrowLinkForm");
    if (arrowLinkToggle && arrowLinkForm) {
      arrowLinkToggle.addEventListener("click", () => {
        bootstrap.Collapse.getOrCreateInstance(arrowLinkForm).toggle();
      });
    }

    // Arrow link save
    const arrowLinkSaveBtn = document.getElementById("addArrowLinkSaveBtn");
    if (arrowLinkSaveBtn)
      arrowLinkSaveBtn.addEventListener("click", () => addArrowLink());

    // Arrow link cancel
    const arrowLinkCancelBtn = document.getElementById("addArrowLinkCancelBtn");
    if (arrowLinkCancelBtn) {
      arrowLinkCancelBtn.addEventListener("click", () => {
        if (arrowLinkForm)
          bootstrap.Collapse.getOrCreateInstance(arrowLinkForm).hide();
      });
    }

    // Arrow editor offcanvas close → clean up
    const arrowEditorEl = document.getElementById("arrowEditor");
    if (arrowEditorEl) {
      arrowEditorEl.addEventListener("hidden.bs.offcanvas", () => {
        clearArrowHighlights();
      });
    }

    // Zoom level input
    const zoomInput = document.getElementById("zoomLevelInput");
    if (zoomInput) {
      zoomInput.addEventListener("change", () => {
        const z = parseFloat(zoomInput.value);
        if (!isNaN(z) && z >= 1 && z <= 22 && mapRef) {
          mapRef.setZoom(z);
        }
      });
      zoomInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          zoomInput.blur();
        }
        e.stopPropagation();
      });
    }

    // Shift key tracking for arrow drag-gate / rotation
    document.addEventListener("keydown", (e) => {
      if (e.key === "Shift") {
        shiftHeld = true;
        mapRef?.getDiv().classList.add("signs-map-shift-held");
      }
    });
    document.addEventListener("keyup", (e) => {
      if (e.key === "Shift") {
        shiftHeld = false;
        mapRef?.getDiv().classList.remove("signs-map-shift-held");
      }
    });
    window.addEventListener("blur", () => {
      shiftHeld = false;
      mapRef?.getDiv().classList.remove("signs-map-shift-held");
    });

    // Escape key → deselect / exit placing mode
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (isPlacingArrow) {
          exitArrowPlacingMode();
          return;
        }
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
        arrows = Array.isArray(parsed.arrows) ? parsed.arrows : [];
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
