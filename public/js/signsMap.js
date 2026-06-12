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
  ("use strict");

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

  /** Distance in meters to offset the Street View camera behind the sign. */
  const SV_APPROACH_DISTANCE_METERS = 20;

  /** Inline SVG icons for mount types (compact markers + full-detail label). */
  /** FontAwesome mount-type icons — matches the legend in the sidebar. */
  const MOUNT_ICONS = {
    pole: '<i class="fa-solid fa-signs-post signs-mount-icon" aria-hidden="true"></i>',
    cone: '<i class="fa-solid fa-triangle-exclamation signs-mount-icon" aria-hidden="true"></i>',
    "a-frame":
      '<i class="fa-solid fa-tent signs-mount-icon" aria-hidden="true"></i>',
    "existing-structure":
      '<i class="fa-solid fa-building signs-mount-icon" aria-hidden="true"></i>',
  };

  /**
   * Build a DOM element for a sign category icon.
   *
   * @param {string|null} category - 'parking', 'accessible', 'dropoff', or falsy
   * @returns {HTMLElement|null} The icon element, or null for uncategorised signs
   */
  function buildCategoryIcon(category) {
    if (!category) return null;
    if (category === "parking") {
      const span = document.createElement("span");
      span.className = "sign-category-icon sign-category-icon-parking";
      span.textContent = "P";
      return span;
    }
    const i = document.createElement("i");
    i.setAttribute("aria-hidden", "true");
    if (category === "accessible") {
      i.className = "fa-solid fa-wheelchair sign-category-icon";
    } else if (category === "dropoff") {
      i.className = "fa-solid fa-person-walking-luggage sign-category-icon";
    } else {
      return null;
    }
    return i;
  }

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
  /**
   * Location drag guard — now handled by dynamic gmpDraggable
   * toggle in updateDraggableState().  Retained as a no-op so
   * existing call sites (refreshMarker, applyDetailLevelToAll)
   * don't need modification.
   *
   * @param {HTMLElement} _content
   */
  function attachLocationShiftGate(_content) {
    // no-op — see updateDraggableState()
  }

  /**
   * Toggle gmpDraggable on every marker based on the current
   * Shift-key and zoom state.  Called from keydown/keyup/blur
   * and zoom_changed so the Maps API never starts a drag
   * unless conditions are met.
   */
  function updateDraggableState() {
    if (!canManage || isCoarsePointer) return;
    const allowed = shiftHeld && canDragAtCurrentZoom();
    markers.forEach((marker) => {
      marker.gmpDraggable = allowed;
    });
    arrowMarkers.forEach((marker) => {
      marker.gmpDraggable = allowed;
    });
    if (pendingMarker) {
      pendingMarker.gmpDraggable = allowed;
    }
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
  /**
   * Attach the rotation-handle interceptor to an arrow marker.
   * When Shift is held at sufficient zoom, clicking the handle
   * starts rotation instead of a Maps drag.  Drag gating itself
   * is handled by dynamic gmpDraggable in updateDraggableState().
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
        if (onHandle && shiftHeld && canDragAtCurrentZoom()) {
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
  let mapOverlays = [];
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

  /** @type {number|null} Timer ID for single/double-click disambiguation. */
  let singleClickTimer = null;

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

  /** @type {Array<google.maps.marker.AdvancedMarkerElement>} Active ghost arrows from a direction pulse. */
  let activeGhosts = [];

  /** @type {number|null} Cleanup timer for the current pulse animation. */
  let pulseTimer = null;

  /** @type {number|null} Arrow ID currently being pulsed (used as stale-timer guard). */
  let pulsingArrowId = null;

  /**
   * Zoom thresholds for facing detail levels (when layer is active).
   * Below SYMBOL: normal markers. SYMBOL–FULL: radial category icons.
   * At/above FULL: radial text pills.
   */
  const ZOOM_FACING_SYMBOL = 17;
  const ZOOM_FACING_FULL = 19;

  /**
   * Reference zoom for facing pill radius scaling. At this zoom pills
   * render at their designed pixel radius; zooming out shrinks the
   * radius by 2^(zoom - ref) so pills track a roughly constant ground
   * distance instead of appearing to drift away from the location.
   */
  const FACING_SCALE_REF_ZOOM = 19;

  /**
   * Clamp bounds for the facing radius scale. The minimum keeps pills
   * legible and clear of the center disc when zoomed out; the maximum
   * keeps pills inside the 110×110 content border-box (the Maps API
   * pointer-event delivery zone) when zoomed in.
   */
  const FACING_SCALE_MIN = 0.5;
  const FACING_SCALE_MAX = 1;

  /**
   * Current facing detail level, driven by zoom + layer state.
   * @type {'none'|'symbol'|'full'}
   */
  let currentFacingLevel = "none";

  /**
   * Cached reverse lookup: attachment_id → [arrow bearings].
   * Invalidated when arrow links change.
   * @type {Map<number, number[]>|null}
   */
  let cachedBearingMap = null;

  // ============================================================
  // LAYER VISIBILITY STATE
  // ============================================================

  /**
   * Tracks which map layers are currently visible.
   * Keys match the checkbox IDs minus the "layer" prefix (camelCase).
   *
   * @type {{ trafficArrows: boolean, signFacing: boolean }}
   */
  /**
   * @type {{
   *   trafficArrows: boolean,
   *   signFacing: boolean,
   *   signCount: boolean,
   *   placementId: boolean,
   * }}
   */
  const layerState = {
    trafficArrows: true,
    signFacing: false,
    signCount: true,
    placementId: true,
  };

  /** @type {google.maps.StreetViewPanorama|null} Active panorama, or null when closed. */
  let streetViewPanorama = null;
  /** location_id the Street View overlay is currently showing, or null. */
  let streetViewForId = null;
  /** arrow_id when SV was opened from an arrow, or null. */
  let streetViewFromArrowId = null;

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
  /**
   * Approximate distance in feet between two lat/lng points.
   * Flat-earth approximation — accurate for distances under a mile.
   *
   * @param {number} lat1
   * @param {number} lng1
   * @param {number} lat2
   * @param {number} lng2
   * @returns {number}
   */
  function approxDistanceFt(lat1, lng1, lat2, lng2) {
    const FT_PER_DEG_LAT = 364567;
    const avgLat = (((lat1 + lat2) / 2) * Math.PI) / 180;
    const FT_PER_DEG_LNG = FT_PER_DEG_LAT * Math.cos(avgLat);
    const dy = (lat2 - lat1) * FT_PER_DEG_LAT;
    const dx = (lng2 - lng1) * FT_PER_DEG_LNG;
    return Math.sqrt(dx * dx + dy * dy);
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

    // Click on empty map → deselect active marker / dismiss menus.
    // Placement-mode handling follows for canManage users.
    mapRef.addListener("click", (e) => {
      deselectAll();
      if (!canManage) return;
      if (isPlacingArrow) {
        beginNewArrow(e.latLng.lat(), e.latLng.lng());
        return;
      }
      if (!isPlacing) return;
      beginNewLocation(e.latLng.lat(), e.latLng.lng());
    });

    // Track map pan end for click-after-drag suppression
    mapRef.addListener("dragend", () => {
      lastDragEndTime = Date.now();
    });

    // Seed detail level + facing pill scale from initial zoom
    currentDetailLevel = detailLevelForZoom(mapRef.getZoom());
    updateFacingZoomScale(mapRef.getZoom());

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
      updateDraggableState();
      updateFacingZoomScale(zoom);

      const newLevel = detailLevelForZoom(zoom);
      const newFacing = facingDetailForZoom(zoom);
      const needsRebuild =
        newLevel !== currentDetailLevel || newFacing !== currentFacingLevel;
      currentDetailLevel = newLevel;
      currentFacingLevel = newFacing;

      if (needsRebuild) {
        applyDetailLevelToAll(newLevel);
      }
    });

    // Hover-collapse safety net. mouseleave alone can fail when
    // marker.content is swapped under a stationary cursor — the new element
    // never enters the browser's hover chain, so a fast exit that skips it
    // fires no mouseleave and the marker sticks expanded. A native delegated
    // mousemove on the map container always sees the true cursor position:
    // any move outside an expanded marker's host schedules its collapse,
    // and moves inside it (including over the hover overlay) cancel.
    mapRef.getDiv().addEventListener("mousemove", (e) => {
      if (!hoverExpanded.size) return;
      hoverExpanded.forEach((locationId) => {
        const marker = markers.get(locationId);
        if (!marker?.element) return;
        clearTimeout(hoverTimers.get(locationId));
        if (isCursorWithinMarker(e, marker)) return;
        hoverTimers.set(
          locationId,
          setTimeout(() => {
            const loc = findLocation(locationId);
            if (loc) collapseMarkerOnHover(loc, marker);
          }, HOVER_COLLAPSE_DELAY),
        );
      });
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
  /**
   * Build the user-facing placement ID badge (e.g. "P12") used to
   * cross-reference a marker against printed location-sign reports.
   * The number is a dense rank computed by the backend, not the DB id.
   *
   * @param {object} loc
   * @returns {HTMLSpanElement|null} Badge element, or null when the
   *   location carries no placement_number
   */
  function buildPlacementBadge(loc) {
    if (loc.placement_number == null) return null;
    const badge = document.createElement("span");
    badge.className = "signs-placement-badge";
    badge.textContent = `P${loc.placement_number}`;
    return badge;
  }

  function buildMarkerContent(loc) {
    const status = deriveStatus(loc);
    const colorCls = loc.marker_color
      ? ` signs-map-marker-color-${loc.marker_color}`
      : "";

    const wrapper = document.createElement("div");
    wrapper.className = `signs-map-marker signs-map-marker-${status}${colorCls}`;

    const placementBadge = buildPlacementBadge(loc);
    if (placementBadge) wrapper.appendChild(placementBadge);

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
        sign.dataset.attachmentId = att.attachment_id;

        // Per-attachment status border override
        if (att.status === "removed") {
          sign.style.cssText = "opacity:0.5;border-color:#b02a37";
        } else if (att.status === "installed") {
          sign.style.setProperty("border-color", "#198754");
        }

        // Category styling (parking = blue border, accessible = inverted blue)
        if (att.sign_category) {
          sign.classList.add(`sign-preview-category-${att.sign_category}`);
        }
        const catIcon = buildCategoryIcon(att.sign_category);
        if (catIcon) sign.appendChild(catIcon);

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
    const content = buildLocationContent(loc);
    const draggable = canManage && !isCoarsePointer;
    const marker = new google.maps.marker.AdvancedMarkerElement({
      map: mapRef,
      position: { lat: Number(loc.latitude), lng: Number(loc.longitude) },
      content,
      title:
        (loc.attachments || []).map((a) => a.sign_text).join(", ") ||
        "Empty location",
      gmpDraggable: false,
    });

    // Single click → select + info sheet; double-click → editor (canManage).
    // Uses marker.element (the persistent gmp-advanced-marker host) so
    // listeners survive marker.content swaps on zoom transitions AND
    // survive post-drag click suppression by the Maps API.
    marker.element.addEventListener("click", () => {
      if (Date.now() - lastDragEndTime < CLICK_AFTER_DRAG_THRESHOLD) return;
      clearTimeout(singleClickTimer);
      singleClickTimer = setTimeout(() => {
        selectMarker(loc.location_id);
        openInfoSheet(loc.location_id);
      }, 220);
    });

    if (canManage) {
      marker.element.addEventListener("dblclick", (e) => {
        clearTimeout(singleClickTimer);
        singleClickTimer = null;
        e.stopPropagation();
        e.preventDefault();
        selectMarker(loc.location_id);
        openEditor(loc.location_id);
      });

      marker.element.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (Date.now() - lastDragEndTime < CLICK_AFTER_DRAG_THRESHOLD) return;
        selectMarker(loc.location_id);
        showContextMenu(e.clientX, e.clientY, "location", loc.location_id);
      });
    }

    // No-op Maps API listener keeps the marker "clickable" so clicks
    // don't fall through to the map's click handler.  Actual click
    // logic lives on marker.element.addEventListener above.
    marker.addListener("click", () => {});

    // Shift-gate: block Maps drag unless Shift held + zoomed in
    if (draggable) {
      attachLocationShiftGate(content);

      marker.addListener("dragstart", () => {
        isDraggingMarker = true;
        document.body.classList.add("signs-map-dragging");
        dismissInfoSheet(true);
        dismissContextMenu();
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

    const content = hoverExpanded.has(locationId)
      ? buildMarkerContent(loc)
      : buildLocationContent(loc);

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
        bindHoverCollapse(loc, marker, content);
      } else {
        attachHoverExpand(loc, marker, content);
      }
    }
  }

  // ============================================================
  // SELECTION
  // ============================================================

  function selectMarker(locationId, opts) {
    // Deselect any selected arrow
    if (selectedArrowId !== null) {
      const prevArrow = arrowMarkers.get(selectedArrowId);
      if (prevArrow?.content)
        prevArrow.content.classList.remove("signs-arrow-marker-selected");
      clearLinkedSignHighlight();
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
      if (!opts?.noPan) mapRef?.panTo(m.position);
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
    wrapper.dataset.bearing = arrow.bearing || 0;
    wrapper.style.transform = "translateY(58px)";

    const b = arrow.bearing || 0;
    wrapper.innerHTML = `<svg viewBox="0 0 40 64" xmlns="http://www.w3.org/2000/svg">
      <g transform="rotate(${b}, 20, 6)">
        <line class="signs-arrow-marker-outline" x1="20" y1="56" x2="20" y2="26" />
        <line class="signs-arrow-marker-fg" x1="20" y1="56" x2="20" y2="26" />
        <polyline class="signs-arrow-marker-outline" points="8,30 20,6 32,30" />
        <polyline class="signs-arrow-marker-fg" points="8,30 20,6 32,30" />
      </g>
    </svg>`;

    // Interactive zones — rotate with the arrow visual
    const zones = document.createElement("div");
    zones.className = "signs-arrow-zones";
    zones.style.transform = `rotate(${b}deg)`;

    const bodyZone = document.createElement("div");
    bodyZone.className = "signs-arrow-body-zone";
    zones.appendChild(bodyZone);

    if (canManage && !isCoarsePointer) {
      const handle = document.createElement("div");
      handle.className = "signs-arrow-handle";
      zones.appendChild(handle);
    }

    wrapper.appendChild(zones);

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
    const content =
      currentDetailLevel === "compact"
        ? buildCompactArrowContent(arrow)
        : buildArrowMarkerContent(arrow);
    const draggable = canManage && !isCoarsePointer;
    const marker = new google.maps.marker.AdvancedMarkerElement({
      map: mapRef,
      position: { lat: Number(arrow.latitude), lng: Number(arrow.longitude) },
      content,
      title: arrow.label || "Traffic arrow",
      gmpDraggable: false,
      zIndex: 10,
    });

    // Single click → select + info sheet; double-click → editor (canManage).
    marker.element.addEventListener("click", () => {
      if (Date.now() - lastDragEndTime < CLICK_AFTER_DRAG_THRESHOLD) return;
      clearTimeout(singleClickTimer);
      singleClickTimer = setTimeout(() => {
        selectArrow(arrow.arrow_id);
        const fresh = findArrow(arrow.arrow_id);
        if (fresh && (fresh.links || []).length > 0) {
          openArrowInfoSheet(arrow.arrow_id);
        } else {
          pulseArrowDirection(arrow.arrow_id);
        }
      }, 220);
    });

    if (canManage) {
      marker.element.addEventListener("dblclick", (e) => {
        clearTimeout(singleClickTimer);
        singleClickTimer = null;
        e.stopPropagation();
        e.preventDefault();
        selectArrow(arrow.arrow_id);
        openArrowEditor(arrow.arrow_id);
      });

      marker.element.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (Date.now() - lastDragEndTime < CLICK_AFTER_DRAG_THRESHOLD) return;
        selectArrow(arrow.arrow_id);
        showContextMenu(e.clientX, e.clientY, "arrow", arrow.arrow_id);
      });
    }

    // No-op Maps API listener — see location marker equivalent.
    marker.addListener("click", () => {});

    if (draggable) {
      attachArrowShiftGate(content, arrow.arrow_id);

      marker.addListener("dragstart", () => {
        isDraggingMarker = true;
        document.body.classList.add("signs-map-dragging");
        dismissInfoSheet(true);
        dismissContextMenu();
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

    // Hover → highlight linked signs + direction pulse
    marker.element.addEventListener("mouseenter", () => {
      if (!layerState.trafficArrows) return;
      highlightArrowLinks(arrow.arrow_id);
      if (!isCoarsePointer && !isDraggingMarker && !isRotatingArrow) {
        pulseArrowDirection(arrow.arrow_id);
      }
    });
    marker.element.addEventListener("mouseleave", () => {
      clearLinkedSignHighlight();
      cancelPulse();
    });

    arrowMarkers.set(arrow.arrow_id, marker);

    // Respect layer visibility — hide if layer is off
    if (!layerState.trafficArrows) {
      marker.map = null;
    }
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
    const content = buildArrowMarkerContent(arrow);
    attachArrowShiftGate(content, arrowId);
    marker.content = content;
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

    const placementBadge = buildPlacementBadge(loc);
    if (placementBadge) wrapper.appendChild(placementBadge);

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
    wrapper.style.transform = "translateY(16px)";

    const b = arrow.bearing || 0;
    wrapper.innerHTML = `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
      <g transform="rotate(${b}, 10, 4)">
        <polyline class="signs-arrow-marker-outline" points="4,16 10,4 16,16"
                  stroke-width="4" />
        <polyline class="signs-arrow-marker-fg" points="4,16 10,4 16,16"
                  stroke-width="2.5" />
      </g>
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
    const expandable =
      currentDetailLevel === "compact" || currentFacingLevel === "symbol";
    if (isCoarsePointer || !expandable) return;

    /**
     * Bind a hover trigger element. attachmentIds limits the expanded
     * overlay to that subset; null shows every attachment.
     *
     * @param {HTMLElement} el
     * @param {number[]|null} attachmentIds
     */
    const bindTrigger = (el, attachmentIds) => {
      el.addEventListener("mouseenter", () => {
        clearTimeout(hoverTimers.get(loc.location_id));
        hoverTimers.set(
          loc.location_id,
          setTimeout(() => {
            expandMarkerOnHover(loc, marker, attachmentIds);
          }, HOVER_EXPAND_DELAY),
        );
      });

      // Only cancels a pending expand if the cursor leaves before it
      // fires. Collapse of an already-expanded marker is handled by
      // bindHoverCollapse and the map-level safety net.
      el.addEventListener("mouseleave", () => {
        if (!hoverExpanded.has(loc.location_id)) {
          clearTimeout(hoverTimers.get(loc.location_id));
        }
      });
    };

    if (currentFacingLevel === "symbol") {
      // Facing mode: each pill expands with only its own group's signs;
      // the center disc expands with all of them. The wrapper itself is
      // pointer-events: none, so these are the only hoverable surfaces.
      content.querySelectorAll(".signs-facing-group").forEach((g) => {
        const ids = (g.dataset.attachmentIds || "")
          .split(",")
          .filter(Boolean)
          .map(Number);
        bindTrigger(g, ids.length ? ids : null);
      });
      const center = content.querySelector(".signs-facing-center");
      if (center) bindTrigger(center, null);
      return;
    }

    bindTrigger(content, null);
  }
  /**
   * Check whether a mouse event's cursor is over a marker's content,
   * including hover-overlay portions that extend beyond the content's
   * border-box. DOM containment alone is not enough: the Maps API only
   * delivers pointer events within the content border-box, so the cursor
   * can sit visually on an overflowing overlay while e.target reports
   * the map tiles beneath it.
   *
   * @param {MouseEvent} e
   * @param {google.maps.marker.AdvancedMarkerElement} marker
   * @returns {boolean}
   */
  function isCursorWithinMarker(e, marker) {
    if (marker.element?.contains(e.target)) return true;
    const content = marker.content;
    if (!content?.getBoundingClientRect) return false;
    const rects = [content.getBoundingClientRect()];
    const overlay = content.querySelector?.(".signs-facing-hover-overlay");
    if (overlay) rects.push(overlay.getBoundingClientRect());
    // Pad the rects so the cursor must move clearly away from the
    // marker before the safety net schedules a collapse. Without
    // padding, a cursor right on the pill edge bounces between
    // inside/outside the tight 110×110 border-box on every
    // sub-pixel mousemove, causing rapid expand → collapse cycles.
    const PAD = 15;
    return rects.some(
      (r) =>
        e.clientX >= r.left - PAD &&
        e.clientX <= r.right + PAD &&
        e.clientY >= r.top - PAD &&
        e.clientY <= r.bottom + PAD,
    );
  }
  /**
   * Bind collapse-on-mouseleave (plus mouseenter cancel) to a marker's
   * current content element. Bound once per element via a dataset guard —
   * content rebuilt on zoom/filter changes carries a fresh guard, so
   * rebinding after every swap is safe and never duplicates listeners.
   *
   * Binds to the content element rather than the gmp-advanced-marker host:
   * the host has no border-box of its own, so its mouse events are not
   * reliably delivered. The map-level mousemove safety net (see initMap)
   * covers the residual case where swapped content never enters the
   * browser's hover chain.
   *
   * @param {object} loc
   * @param {google.maps.marker.AdvancedMarkerElement} marker
   * @param {HTMLElement} el - The marker's current content element
   */
  function bindHoverCollapse(loc, marker, el) {
    if (!el || el.dataset.hoverCollapseBound === "1") return;
    el.dataset.hoverCollapseBound = "1";

    el.addEventListener("mouseenter", () => {
      // Cancel only a pending collapse. An unconditional clear here would
      // clobber the expand timer that attachHoverExpand's mouseenter just
      // set on this same element, killing every re-hover after the first.
      if (hoverExpanded.has(loc.location_id)) {
        clearTimeout(hoverTimers.get(loc.location_id));
      }
    });

    el.addEventListener("mouseleave", () => {
      clearTimeout(hoverTimers.get(loc.location_id));
      if (!hoverExpanded.has(loc.location_id)) return;
      hoverTimers.set(
        loc.location_id,
        setTimeout(() => {
          collapseMarkerOnHover(loc, marker);
        }, HOVER_COLLAPSE_DELAY),
      );
    });
  }

  /**
   * Expand a compact marker to full detail on hover.
   *
   * @param {object} loc
   * @param {google.maps.marker.AdvancedMarkerElement} marker
   * @param {number[]|null} [attachmentIds] - Limit the facing overlay to
   *   these attachments; null/omitted shows all (compact mode ignores it)
   */
  function expandMarkerOnHover(loc, marker, attachmentIds = null) {
    const expandable =
      currentDetailLevel === "compact" || currentFacingLevel === "symbol";
    if (!expandable) return;
    hoverExpanded.add(loc.location_id);

    if (currentFacingLevel === "symbol") {
      // Overlay compact content on top of facing layout
      const wrapper = marker.content;
      wrapper.classList.add("signs-facing-hover-expanded");

      const overlay = buildFacingHoverContent(loc, attachmentIds);
      overlay.classList.add("signs-facing-hover-overlay");
      if (selectedId === loc.location_id) {
        overlay.classList.add("signs-map-marker-selected");
      }
      wrapper.appendChild(overlay);

      // Collapse binds to the 110×110 facing wrapper — the element whose
      // border-box the Maps API hit-tests.
      bindHoverCollapse(loc, marker, wrapper);
      return;
    }

    const content = buildMarkerContent(loc);
    if (selectedId === loc.location_id) {
      content.classList.add("signs-map-marker-selected");
    }
    attachLocationShiftGate(content);
    marker.content = content;

    bindHoverCollapse(loc, marker, content);
  }

  /**
   * Collapse a hover-expanded marker back to compact.
   *
   * @param {object} loc
   * @param {google.maps.marker.AdvancedMarkerElement} marker
   */
  function collapseMarkerOnHover(loc, marker) {
    const expandable =
      currentDetailLevel === "compact" || currentFacingLevel === "symbol";
    if (!expandable) return;
    hoverExpanded.delete(loc.location_id);

    if (currentFacingLevel === "symbol") {
      // Remove overlay, restore facing pills
      const wrapper = marker.content;
      const overlay = wrapper.querySelector(".signs-facing-hover-overlay");
      if (overlay) overlay.remove();
      wrapper.classList.remove("signs-facing-hover-expanded");
      return;
    }

    const content = buildLocationContent(loc);
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
      const content = buildLocationContent(loc);
      if (selectedId === loc.location_id) {
        content.classList.add("signs-map-marker-selected");
      }

      attachLocationShiftGate(content);

      marker.content = content;

      // Attach hover-to-expand for compact or facing-symbol mode
      if (level === "compact" || currentFacingLevel === "symbol") {
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
      clearLinkedSignHighlight();
    }

    selectedArrowId = arrowId;
    const m = arrowMarkers.get(arrowId);
    if (m?.content) {
      m.content.classList.add("signs-arrow-marker-selected");
      mapRef?.panTo(m.position);
    }

    // Highlight linked sign markers
    highlightArrowLinks(arrowId);
  }

  /**
   * Track markers expanded specifically for the link-highlight feature
   * (distinct from hover-expand) so we can collapse them on clear.
   * @type {Set<number>}
   */
  const linkExpandedMarkers = new Set();

  /**
   * Highlight a single sign card on the map for the given attachment.
   * Expands the parent marker if compact, and pans the map only if
   * the marker is outside the current viewport.
   *
   * @param {number} attachmentId
   */
  function highlightLinkedSign(attachmentId) {
    clearLinkedSignHighlight();
    if (!attachmentId) return;

    // Find the location that owns this attachment
    let loc = null;
    for (const l of locations) {
      if ((l.attachments || []).some((a) => a.attachment_id === attachmentId)) {
        loc = l;
        break;
      }
    }
    if (!loc) return;

    const marker = markers.get(loc.location_id);
    if (!marker) return;

    // If compact, expand the marker so individual signs are visible
    if (
      currentDetailLevel === "compact" &&
      !hoverExpanded.has(loc.location_id)
    ) {
      linkExpandedMarkers.add(loc.location_id);
      const content = buildMarkerContent(loc);
      if (selectedId === loc.location_id) {
        content.classList.add("signs-map-marker-selected");
      }
      attachLocationShiftGate(content);
      marker.content = content;
    }

    // Find and highlight the specific sign card
    const card = marker.content?.querySelector(
      `.sign-preview[data-attachment-id="${attachmentId}"]`,
    );
    if (card) card.classList.add("signs-map-marker-sign-highlighted");

    // Pan only if the marker is outside the current viewport
    if (mapRef) {
      const pos = marker.position;
      const latLng =
        typeof pos.lat === "function"
          ? pos
          : new google.maps.LatLng(pos.lat, pos.lng);
      if (!mapRef.getBounds()?.contains(latLng)) {
        mapRef.panTo(latLng);
      }
    }
  }

  /**
   * Highlight all signs linked to the given arrow. Used when hovering
   * an arrow marker on the map to show which signs it's associated with.
   *
   * @param {number} arrowId
   */
  function highlightArrowLinks(arrowId) {
    clearLinkedSignHighlight();
    const arrow = findArrow(arrowId);
    if (!arrow || !arrow.links?.length) return;

    arrow.links.forEach((attId) => {
      const loc = locations.find((l) =>
        (l.attachments || []).some((a) => a.attachment_id === attId),
      );
      if (!loc) return;

      const marker = markers.get(loc.location_id);
      if (!marker) return;

      // Expand compact marker if needed (tracked separately from hover-expand)
      if (
        currentDetailLevel === "compact" &&
        !hoverExpanded.has(loc.location_id) &&
        !linkExpandedMarkers.has(loc.location_id)
      ) {
        linkExpandedMarkers.add(loc.location_id);
        const content = buildMarkerContent(loc);
        if (selectedId === loc.location_id) {
          content.classList.add("signs-map-marker-selected");
        }
        attachLocationShiftGate(content);
        marker.content = content;
      }

      // Highlight the specific sign card
      const card = marker.content?.querySelector(
        `.sign-preview[data-attachment-id="${attId}"]`,
      );
      if (card) {
        card.classList.add("signs-map-marker-sign-highlighted");
        marker.content.classList.add("signs-map-marker-has-highlight");
      }
    });
  }
  /**
   * Remove all per-sign highlights and collapse any markers that were
   * expanded specifically for the link-highlight (not hover-expanded).
   */
  function clearLinkedSignHighlight() {
    // Remove highlight class from all sign cards and parent markers
    document
      .querySelectorAll(".signs-map-marker-sign-highlighted")
      .forEach((el) =>
        el.classList.remove("signs-map-marker-sign-highlighted"),
      );
    document
      .querySelectorAll(".signs-map-marker-has-highlight")
      .forEach((el) => el.classList.remove("signs-map-marker-has-highlight"));

    // Collapse markers we expanded for the link-highlight
    linkExpandedMarkers.forEach((locId) => {
      const loc = findLocation(locId);
      const marker = markers.get(locId);
      if (!loc || !marker || currentDetailLevel !== "compact") return;

      const content = buildLocationContent(loc);
      if (selectedId === locId) {
        content.classList.add("signs-map-marker-selected");
      }
      attachLocationShiftGate(content);
      if (currentDetailLevel === "compact" && currentFacingLevel === "none") {
        attachHoverExpand(loc, marker, content);
      }
      marker.content = content;
    });
    linkExpandedMarkers.clear();
  }

  // ============================================================
  // TRAFFIC ARROW DIRECTION PULSE
  // ============================================================

  /**
   * Compute a destination lat/lng from an origin, bearing, and distance.
   *
   * @param {number} lat  - Origin latitude in degrees
   * @param {number} lng  - Origin longitude in degrees
   * @param {number} bearing - Compass bearing in degrees (0 = north, clockwise)
   * @param {number} distM - Distance in metres
   * @returns {{ lat: number, lng: number }}
   */
  function destPoint(lat, lng, bearing, distM) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;
    const lat1 = toRad(lat);
    const lng1 = toRad(lng);
    const brng = toRad(bearing);
    const d = distM / R;

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) +
        Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
        Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
      );

    return { lat: toDeg(lat2), lng: toDeg(lng2) };
  }

  /**
   * Build a lightweight ghost arrow element for the direction pulse.
   * Matches the real arrow's SVG but has no interactive zones.
   *
   * @param {number} bearing - Compass bearing in degrees
   * @returns {HTMLDivElement}
   */
  function buildGhostArrowContent(bearing) {
    const wrapper = document.createElement("div");
    wrapper.className = "signs-arrow-ghost";
    wrapper.style.cssText =
      "transform:translateY(58px);opacity:0;pointer-events:none";

    const b = bearing || 0;
    wrapper.innerHTML = `<svg viewBox="0 0 40 64" xmlns="http://www.w3.org/2000/svg">
      <g transform="rotate(${b}, 20, 6)">
        <line class="signs-arrow-marker-outline" x1="20" y1="56" x2="20" y2="26" />
        <line class="signs-arrow-marker-fg" x1="20" y1="56" x2="20" y2="26" />
        <polyline class="signs-arrow-marker-outline" points="8,30 20,6 32,30" />
        <polyline class="signs-arrow-marker-fg" points="8,30 20,6 32,30" />
      </g>
    </svg>`;
    return wrapper;
  }

  /**
   * Flash a repeating sequence of ghost arrows behind a traffic arrow
   * to visualise its direction of travel. Five ghost arrows pulse
   * tail-to-head like runway approach lights, ending with a glow
   * on the real arrow, then the cycle repeats until cancelPulse().
   *
   * @param {number} arrowId
   */
  function pulseArrowDirection(arrowId) {
    cancelPulse();

    const arrow = findArrow(arrowId);
    if (!arrow) return;

    pulsingArrowId = arrowId;
    const bearing = arrow.bearing ?? 0;
    const reverseBearing = (bearing + 180) % 360;
    const originLat = Number(arrow.latitude);
    const originLng = Number(arrow.longitude);

    const SPACING = 12;
    const GHOST_COUNT = 5;

    for (let i = 1; i <= GHOST_COUNT; i++) {
      const pos = destPoint(originLat, originLng, reverseBearing, SPACING * i);
      const content = buildGhostArrowContent(bearing);
      const ghostMarker = new google.maps.marker.AdvancedMarkerElement({
        map: mapRef,
        position: { lat: pos.lat, lng: pos.lng },
        content,
        zIndex: 5,
      });
      activeGhosts.push(ghostMarker);
    }

    runPulseCycle();
  }

  /**
   * Run one pulse cycle (farthest → nearest → real arrow glow),
   * then schedule the next. Stops automatically when pulsingArrowId
   * is cleared by cancelPulse().
   */
  function runPulseCycle() {
    if (pulsingArrowId === null || !activeGhosts.length) return;

    const STEP_DELAY = 200;
    const count = activeGhosts.length;
    const arrowId = pulsingArrowId;

    // Reset all ghosts to invisible
    activeGhosts.forEach((ghost) => {
      if (ghost.content) {
        ghost.content.style.transition = "none";
        ghost.content.style.opacity = "0";
      }
    });

    // Sequential pulse: farthest ghost first → nearest
    activeGhosts
      .slice()
      .reverse()
      .forEach((ghost, i) => {
        setTimeout(() => {
          if (pulsingArrowId !== arrowId) return;
          const el = ghost.content;
          if (!el) return;
          el.style.transition = "opacity 0.15s ease-in";
          el.style.opacity = "0.85";
          setTimeout(() => {
            if (pulsingArrowId !== arrowId) return;
            el.style.transition = "opacity 0.2s ease-out";
            el.style.opacity = "0";
          }, 180);
        }, i * STEP_DELAY);
      });

    // Glow the real arrow at the end
    setTimeout(() => {
      if (pulsingArrowId !== arrowId) return;
      const realMarker = arrowMarkers.get(arrowId);
      if (realMarker?.content) {
        realMarker.content.classList.add("signs-arrow-pulse-highlight");
        setTimeout(() => {
          if (pulsingArrowId !== arrowId) return;
          realMarker.content.classList.remove("signs-arrow-pulse-highlight");
        }, 300);
      }
    }, count * STEP_DELAY);

    // Schedule next cycle
    pulseTimer = setTimeout(
      () => runPulseCycle(),
      (count + 1) * STEP_DELAY + 200,
    );
  }

  /**
   * Cancel any running direction pulse and remove ghost arrows.
   */
  function cancelPulse() {
    pulsingArrowId = null;
    if (pulseTimer) {
      clearTimeout(pulseTimer);
      pulseTimer = null;
    }
    activeGhosts.forEach((ghost) => {
      ghost.map = null;
    });
    activeGhosts = [];
    document
      .querySelectorAll(".signs-arrow-pulse-highlight")
      .forEach((el) => el.classList.remove("signs-arrow-pulse-highlight"));
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
        ? 16
        : 58;
      const g = marker.content.querySelector("svg > g");
      if (g) g.setAttribute("transform", `rotate(${rounded}, 20, 6)`);
      const zones = marker.content.querySelector(".signs-arrow-zones");
      if (zones) zones.style.transform = `rotate(${rounded}deg)`;
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
      lastDragEndTime = Date.now();

      // Persist
      const arrow = findArrow(arrowId);
      if (arrow) {
        persistArrowDrag(arrowId, arrow.latitude, arrow.longitude);
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

    // Auto-enable arrow layer if toggled off
    if (!layerState.trafficArrows) {
      const cb = document.getElementById("layerTrafficArrows");
      if (cb) cb.checked = true;
      toggleLayer("trafficArrows", true);
    }

    isPlacingArrow = true;
    const help = document.getElementById("addArrowHelp");
    if (help) help.hidden = false;
    const locHelp = document.getElementById("addLocationHelp");
    if (locHelp) locHelp.hidden = true;
    const mapEl = document.getElementById("googleMap");
    if (mapEl) mapEl.classList.add("signs-map-placing-arrow");
  }

  /**
   * Exit arrow-placing mode.
   */
  function exitArrowPlacingMode() {
    isPlacingArrow = false;
    const help = document.getElementById("addArrowHelp");
    if (help) help.hidden = true;
    const mapEl = document.getElementById("googleMap");
    if (mapEl) mapEl.classList.remove("signs-map-placing-arrow");
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

    const bearing = arrow.bearing ?? 0;
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
      highlightArrowLinks(arrowId);
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
      clearLinkedSignHighlight();
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
    text.className = "signs-arrow-link-item-text fw-semibold";
    text.textContent = att.sign_text;
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

    // Highlight this specific sign on the map while hovering the row
    row.addEventListener("mouseenter", () => {
      highlightLinkedSign(attachmentId);
    });
    row.addEventListener("mouseleave", () => {
      clearLinkedSignHighlight();
    });

    return row;
  }

  /**
   * Populate the add-link dropdown with attachments not yet linked.
   *
   * @param {object} arrow
   */
  /**
   * Populate the add-link dropdown with unlinked attachments within
   * 300 ft of the arrow, sorted closest-first.
   *
   * @param {object} arrow
   */
  function populateArrowLinkPicker(arrow) {
    const menu = document.getElementById("addArrowLinkMenu");
    if (!menu) return;
    menu.replaceChildren();

    const linked = new Set(arrow.links || []);
    const arrowLat = Number(arrow.latitude);
    const arrowLng = Number(arrow.longitude);
    const MAX_LINK_RADIUS_FT = 300;

    // Build candidates with distance, filter, sort
    const candidates = [];
    locations.forEach((loc) => {
      const dist = approxDistanceFt(
        arrowLat,
        arrowLng,
        Number(loc.latitude),
        Number(loc.longitude),
      );
      (loc.attachments || []).forEach((att) => {
        if (linked.has(att.attachment_id)) return;
        candidates.push({ att, loc, dist });
      });
    });

    const nearby = candidates
      .filter((c) => c.dist <= MAX_LINK_RADIUS_FT)
      .sort((a, b) => a.dist - b.dist);

    if (nearby.length === 0) {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.className = "dropdown-item-text text-muted small";
      span.textContent =
        candidates.length === 0
          ? "All nearby signs already linked to this arrow."
          : "No unlinked signs within 300 ft.";
      li.appendChild(span);
      menu.appendChild(li);
    }

    nearby.forEach(({ att, dist }) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "dropdown-item d-flex justify-content-between align-items-center";
      btn.dataset.attachmentId = att.attachment_id;

      const name = document.createElement("span");
      name.textContent = att.sign_text;
      btn.appendChild(name);

      const badge = document.createElement("span");
      badge.className = "text-muted small ms-2";
      badge.textContent = `${Math.round(dist)} ft`;
      btn.appendChild(badge);

      btn.addEventListener("mouseenter", () => {
        highlightLinkedSign(att.attachment_id);
      });
      btn.addEventListener("mouseleave", () => {
        clearLinkedSignHighlight();
      });
      btn.addEventListener("click", () => {
        addArrowLink(arrow.arrow_id, att.attachment_id);
      });

      li.appendChild(btn);
      menu.appendChild(li);
    });

    const toggle = document.getElementById("addArrowLinkToggle");
    if (toggle) toggle.disabled = nearby.length === 0;
  }

  /**
   * Link a selected attachment to the current arrow.
   */
  /**
   * Link an attachment to the given arrow.
   *
   * @param {number} arrowId
   * @param {number} attachmentId
   */
  async function addArrowLink(arrowId, attachmentId) {
    if (!arrowId || !attachmentId) return;
    clearLinkedSignHighlight();

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
        highlightArrowLinks(arrowId);
        invalidateBearingMap();
        if (currentFacingLevel !== "none") {
          applyDetailLevelToAll(currentDetailLevel);
        }
      }

      // No form to collapse — dropdown auto-closes on click
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
        highlightArrowLinks(arrowId);
        invalidateBearingMap();
        if (currentFacingLevel !== "none") {
          applyDetailLevelToAll(currentDetailLevel);
        }
      }
    } catch (err) {
      console.error("Remove arrow link error:", err);
    }
  }

  // ============================================================
  // FILTERING
  // ============================================================

  // ============================================================
  // LAYER TOGGLE
  // ============================================================

  /**
   * Set visibility for a named map layer.
   *
   * @param {'trafficArrows'|'signFacing'|'signCount'|'placementId'} layerId
   * @param {boolean} visible
   */
  function toggleLayer(layerId, visible) {
    layerState[layerId] = visible;

    if (layerId === "trafficArrows") {
      applyTrafficArrowLayer(visible);
    } else if (layerId === "signFacing") {
      const zoom = mapRef?.getZoom() || 17;
      currentFacingLevel = visible ? facingDetailForZoom(zoom) : "none";
      applyDetailLevelToAll(currentDetailLevel);

      // Count and placement badges don't apply in facing mode —
      // disable their toggles so the sidebar reflects that.
      ["layerSignCount", "layerPlacementId"].forEach((id) => {
        const cb = document.getElementById(id);
        if (cb) cb.disabled = visible;
      });
    } else if (layerId === "signCount") {
      mapRef
        ?.getDiv()
        .classList.toggle("signs-map-hide-sign-count", !visible);
    } else if (layerId === "placementId") {
      mapRef
        ?.getDiv()
        .classList.toggle("signs-map-hide-placement-id", !visible);
    }
  }

  /**
   * Show or hide all traffic arrow markers on the map.
   * When hiding, also dismisses the arrow editor and cancels
   * any active pulse or placement mode.
   *
   * @param {boolean} visible
   */
  function applyTrafficArrowLayer(visible) {
    arrowMarkers.forEach((marker) => {
      marker.map = visible ? mapRef : null;
    });

    if (!visible) {
      cancelPulse();
      clearLinkedSignHighlight();
      dismissArrowEditorIfOpen();
      if (isPlacingArrow) exitArrowPlacingMode();
    }
  }

  /**
   * Check whether a given layer is currently visible.
   *
   * @param {'trafficArrows'|'signFacing'|'signCount'|'placementId'} layerId
   * @returns {boolean}
   */
  function isLayerVisible(layerId) {
    return !!layerState[layerId];
  }

  // ============================================================
  // SIGN FACING — RADIAL LAYOUT
  // ============================================================

  /**
   * Determine the facing detail level for the current zoom.
   *
   * @param {number} zoom
   * @returns {'none'|'symbol'|'full'}
   */
  function facingDetailForZoom(zoom) {
    if (!layerState.signFacing) return "none";
    if (zoom >= ZOOM_FACING_SYMBOL) return "symbol";
    return "none";
  }

  /**
   * Update the --facing-zoom-scale CSS custom property on the map
   * container. Facing pill offsets are multiplied by this factor in
   * CSS (.signs-facing-group transform), so a single property write
   * rescales every pill smoothly with no marker rebuilds. Custom
   * properties via setProperty are CSP-safe (no inline style attr).
   *
   * @param {number} zoom
   */
  function updateFacingZoomScale(zoom) {
    if (!mapRef) return;
    const raw = Math.pow(2, zoom - FACING_SCALE_REF_ZOOM);
    const scale = Math.min(FACING_SCALE_MAX, Math.max(FACING_SCALE_MIN, raw));
    mapRef
      .getDiv()
      .style.setProperty(
        "--facing-zoom-scale",
        String(Math.round(scale * 1000) / 1000),
      );
  }

  /**
   * Invalidate the cached bearing map. Call whenever arrow links
   * are added or removed.
   */
  function invalidateBearingMap() {
    cachedBearingMap = null;
  }

  /**
   * Build (or return cached) reverse lookup from attachment_id
   * to the bearing(s) of arrows that link to it.
   *
   * @returns {Map<number, number[]>}
   */
  function getAttachmentBearingMap() {
    if (cachedBearingMap) return cachedBearingMap;
    cachedBearingMap = new Map();
    arrows.forEach((arrow) => {
      const bearing = Number(arrow.bearing);
      if (isNaN(bearing)) return;
      (arrow.links || []).forEach((attId) => {
        if (!cachedBearingMap.has(attId)) cachedBearingMap.set(attId, []);
        cachedBearingMap.get(attId).push(bearing);
      });
    });
    return cachedBearingMap;
  }

  /**
   * Group a location's attachments by the facing direction derived
   * from linked traffic arrows. Bearings within ±15° cluster together.
   *
   * @param {object} loc
   * @returns {{ groups: Map<number, object[]>, unlinked: object[] }}
   */
  function groupAttachmentsByFacing(loc) {
    const bearingMap = getAttachmentBearingMap();
    /** @type {Map<number, object[]>} facingBearing → attachments */
    const groups = new Map();
    const unlinked = [];

    const atts = (loc.attachments || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);

    atts.forEach((att) => {
      const bearings = bearingMap.get(att.attachment_id);
      if (!bearings?.length) {
        unlinked.push(att);
        return;
      }
      const facingBearing = (bearings[0] - 180 + 360) % 360;
      let matched = false;
      for (const [key] of groups) {
        const diff = Math.abs(key - facingBearing);
        if (diff < 15 || diff > 345) {
          groups.get(key).push(att);
          matched = true;
          break;
        }
      }
      if (!matched) {
        groups.set(facingBearing, [att]);
      }
    });

    return { groups, unlinked };
  }

  /**
   * Compute pixel x/y offset for a compass bearing at a given distance.
   * 0° = up (north), 90° = right (east), etc.
   *
   * @param {number} bearing - Compass bearing in degrees
   * @param {number} dist - Distance in pixels
   * @returns {{ x: number, y: number }}
   */
  function facingOffset(bearing, dist) {
    const rad = (bearing * Math.PI) / 180;
    return {
      x: Math.sin(rad) * dist,
      y: -Math.cos(rad) * dist,
    };
  }

  /**
   * Build the center element shared by all facing layouts.
   *
   * @param {object} loc
   * @returns {HTMLDivElement}
   */
  function buildFacingCenter(loc) {
    const center = document.createElement("div");
    center.className = "signs-facing-center";

    const disc = document.createElement("div");
    disc.className = "signs-map-marker-disc";

    if (loc.mount_type && MOUNT_ICONS[loc.mount_type]) {
      const wrap = document.createElement("span");
      wrap.className = "signs-map-marker-mount-icon-wrap";
      wrap.innerHTML = MOUNT_ICONS[loc.mount_type];
      disc.appendChild(wrap);
    } else {
      const dot = document.createElement("span");
      dot.className = "signs-map-marker-abbr";
      dot.textContent = "\u2022";
      disc.appendChild(dot);
    }

    center.appendChild(disc);
    return center;
  }

  /**
   * Build a facing group element positioned radially from center.
   *
   * @param {number} bearing - Facing compass bearing
   * @param {number} dist - Pixel distance from center
   * @param {HTMLElement[]} children - Content elements for this group
   * @returns {HTMLDivElement}
   */
  function buildFacingGroup(bearing, dist, children) {
    const group = document.createElement("div");
    group.className = "signs-facing-group";

    const offset = facingOffset(bearing, dist);
    group.style.setProperty("--facing-x", `${Math.round(offset.x)}px`);
    group.style.setProperty("--facing-y", `${Math.round(offset.y)}px`);

    // Directional chevron
    const chevron = document.createElement("i");
    chevron.className = "fa-solid fa-chevron-up signs-facing-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.style.setProperty("--facing-deg", `${bearing}deg`);
    group.appendChild(chevron);

    children.forEach((child) => group.appendChild(child));
    return group;
  }

  /**
   * Build facing layout with category-icon pills (zoom 17–19).
   *
   * @param {object} loc
   * @returns {HTMLDivElement}
   */
  function buildFacingSymbolContent(loc) {
    const status = deriveStatus(loc);
    const wrapper = document.createElement("div");
    wrapper.className = `signs-map-marker signs-facing-layout signs-facing-layout-symbol signs-map-marker-${status}`;

    wrapper.appendChild(buildFacingCenter(loc));

    const { groups, unlinked } = groupAttachmentsByFacing(loc);

    groups.forEach((atts, bearing) => {
      // Chevron-only pill — count badge if multiple signs
      const children = [];
      if (atts.length > 1) {
        const count = document.createElement("span");
        count.className = "signs-facing-count";
        count.textContent = atts.length;
        children.push(count);
      }
      // Radius 34 keeps the widest pill (chevron + count badge) fully
      // inside the 110×110 border-box — the Maps API only delivers
      // pointer events within that box, so anything overhanging it is a
      // hover dead zone. Do NOT enlarge the box instead: its dimensions
      // and negative margins are anchor-coupled, and changing them
      // displaces every facing marker (zoom-dependent drift).
      const group = buildFacingGroup(bearing, 34, children);
      // Tag the pill with its group's attachments so hover-expand can
      // show only the signs facing this bearing.
      group.dataset.attachmentIds = atts
        .map((a) => a.attachment_id)
        .join(",");
      wrapper.appendChild(group);
    });

    return wrapper;
  }

  /**
   * Build facing layout with full sign-preview pills (zoom ≥ 19).
   *
   * @param {object} loc
   * @returns {HTMLDivElement}
   */
  function buildFacingFullContent(loc) {
    const status = deriveStatus(loc);
    const wrapper = document.createElement("div");
    wrapper.className = `signs-map-marker signs-facing-layout signs-facing-layout-full signs-map-marker-${status}`;

    wrapper.appendChild(buildFacingCenter(loc));

    const placementBadge = buildPlacementBadge(loc);
    if (placementBadge) {
      placementBadge.classList.add("signs-placement-badge-facing");
      wrapper.appendChild(placementBadge);
    }

    const { groups, unlinked } = groupAttachmentsByFacing(loc);

    groups.forEach((atts, bearing) => {
      const pills = atts.map((att) => {
        const sign = document.createElement("div");
        sign.className = "sign-preview signs-map-marker-sign";
        sign.dataset.attachmentId = att.attachment_id;

        if (att.status === "removed") {
          sign.classList.add("signs-facing-pill-removed");
        } else if (att.status === "installed") {
          sign.classList.add("signs-facing-pill-installed");
        }

        if (att.sign_category) {
          sign.classList.add(`sign-preview-category-${att.sign_category}`);
        }
        const catIcon = buildCategoryIcon(att.sign_category);
        if (catIcon) sign.appendChild(catIcon);

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
        return sign;
      });

      wrapper.appendChild(buildFacingGroup(bearing, 40, pills));
    });

    // Unlinked pills — stack below center
    if (unlinked.length) {
      const group = document.createElement("div");
      group.className = "signs-facing-group signs-facing-group-unlinked";
      group.style.setProperty("--facing-x", "0px");
      group.style.setProperty("--facing-y", "30px");

      unlinked.forEach((att) => {
        const sign = document.createElement("div");
        sign.className = "sign-preview signs-map-marker-sign";
        if (att.sign_category) {
          sign.classList.add(`sign-preview-category-${att.sign_category}`);
        }
        const catIcon = buildCategoryIcon(att.sign_category);
        if (catIcon) sign.appendChild(catIcon);
        const text = document.createElement("span");
        text.className = "sign-preview-text";
        text.textContent = att.sign_text || "";
        sign.appendChild(text);
        group.appendChild(sign);
      });

      wrapper.appendChild(group);
    }

    // Mount label below center
    if (loc.mount_type && MOUNT_ICONS[loc.mount_type]) {
      const label = document.createElement("div");
      label.className = "signs-map-marker-mount-label signs-facing-mount-label";
      label.innerHTML = MOUNT_ICONS[loc.mount_type];
      const text = document.createElement("span");
      text.textContent = MOUNT_LABELS[loc.mount_type] || loc.mount_type;
      label.appendChild(text);
      wrapper.appendChild(label);
    }

    return wrapper;
  }

  /**
   * Build compact hover content for facing markers — category icons
   * and directional arrows only, no sign text. Matches mount-label sizing.
   *
   * @param {object} loc
   * @param {number[]|null} [attachmentIds] - Limit the facing overlay to
   *   these attachments; null/omitted shows all (compact mode ignores it)
   * @returns {HTMLDivElement}
   */
  function buildFacingHoverContent(loc, attachmentIds = null) {
    const status = deriveStatus(loc);
    const wrapper = document.createElement("div");
    wrapper.className = `signs-map-marker signs-map-marker-${status}`;

    const stack = document.createElement("div");
    stack.className = "signs-map-marker-stack";

    let atts = (loc.attachments || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);

    // Group-level hover: show only the signs facing the hovered pill's
    // bearing. Null means show everything (center-disc hover).
    if (attachmentIds?.length) {
      const idSet = new Set(attachmentIds);
      atts = atts.filter((a) => idSet.has(a.attachment_id));
    }

    atts.forEach((att) => {
      const sign = document.createElement("div");
      sign.className = "sign-preview signs-map-marker-sign";

      if (att.status === "removed") {
        sign.classList.add("signs-facing-pill-removed");
      } else if (att.status === "installed") {
        sign.classList.add("signs-facing-pill-installed");
      }

      if (att.sign_category) {
        sign.classList.add(`sign-preview-category-${att.sign_category}`);
      }

      // Preserve the facing direction in the expanded view — a leading
      // chevron rotated to this sign's facing bearing (derived from its
      // linked traffic arrows). Unlinked signs get no chevron, matching
      // the radial layout. Custom property via setProperty is CSP-safe.
      const facingBearings = getAttachmentBearingMap().get(att.attachment_id);
      if (facingBearings?.length) {
        const facingBearing = (facingBearings[0] - 180 + 360) % 360;
        const chev = document.createElement("i");
        chev.className =
          "fa-solid fa-chevron-up signs-facing-chevron signs-facing-chevron-inline";
        chev.setAttribute("aria-hidden", "true");
        chev.style.setProperty("--facing-deg", `${facingBearing}deg`);
        sign.appendChild(chev);
      }

      const catIcon = buildCategoryIcon(att.sign_category);
      if (catIcon) sign.appendChild(catIcon);

      const dir = att.arrow_direction;
      if (dir) {
        const arrow = document.createElement("span");
        arrow.className = "sign-preview-arrow";
        if (dir === "destination") {
          const icon = document.createElement("i");
          icon.className = "fa-solid fa-location-dot";
          icon.setAttribute("aria-hidden", "true");
          arrow.appendChild(icon);
        } else if (ARROW_GLYPHS[dir]) {
          arrow.textContent = ARROW_GLYPHS[dir];
        }
        sign.appendChild(arrow);
      }

      stack.appendChild(sign);
    });

    wrapper.appendChild(stack);

    // Mount label
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
   * Unified location marker content builder. Selects the
   * appropriate builder based on layer state and zoom level.
   *
   * @param {object} loc
   * @returns {HTMLDivElement}
   */
  function buildLocationContent(loc) {
    if (currentFacingLevel === "symbol") return buildFacingSymbolContent(loc);
    return currentDetailLevel === "full"
      ? buildMarkerContent(loc)
      : buildCompactLocationContent(loc);
  }

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

      // Click → select + fly to + info sheet
      row.addEventListener("click", () => {
        selectMarker(loc.location_id);
        openInfoSheet(loc.location_id);
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

    // Marker color
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
   * Set every attachment on a location to the same status.
   * Used by the geofence proximity bar for one-tap status changes.
   *
   * @param {number} locationId
   * @param {string} newStatus  One of 'planned', 'installed', 'removed'.
   */
  async function quickSetLocationStatus(locationId, newStatus) {
    const loc = findLocation(locationId);
    if (!loc) return;
    const atts = loc.attachments || [];
    if (!atts.length) return;

    const token = getCsrfToken();
    for (const att of atts) {
      if (att.status === newStatus) continue;
      try {
        const res = await fetch(
          `/signs/attachments/${att.attachment_id}/status`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "CSRF-Token": token,
            },
            body: JSON.stringify({ status: newStatus }),
          },
        );
        const data = await res.json();
        if (data.success) att.status = newStatus;
      } catch (err) {
        console.error("quickSetLocationStatus error:", err);
      }
    }
    refreshMarker(locationId);
    applyFilters();
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
          sign_category: sign?.sign_category || null,
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
      gmpDraggable: false,
    });
    updateDraggableState();

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
  // STREET VIEW
  // ============================================================

  /**
   * Show the appropriate save button based on Street View context.
   *
   * "Save as Photo" is shown when opened from a location.
   * "Save View" is shown when opened from an arrow.
   * Both are hidden when canManage is false (they won't exist in the DOM).
   *
   * @param {'location'|'arrow'} context
   */
  function showSvSaveButton(context) {
    const photoBtn = document.getElementById("svSavePhotoBtn");
    const viewBtn = document.getElementById("svSaveViewBtn");
    if (photoBtn) photoBtn.classList.toggle("d-none", context !== "location");
    if (viewBtn) viewBtn.classList.toggle("d-none", context !== "arrow");
  }

  /**
   * Open the Street View overlay for a location.
   *
   * If the location has saved SV camera state (sv_pano_id) and no
   * override bearing is supplied, the panorama is restored to that
   * exact view.  Otherwise the camera is positioned
   * SV_APPROACH_DISTANCE_METERS behind the target along the reverse
   * of the approach bearing, looking forward.  If no bearing is
   * available the panorama opens at the target facing north.
   *
   * @param {number|null} locationId
   * @param {{
   *   approachBearing?: number|null,
   *   titleOverride?: string|null,
   *   coordsOverride?: { lat: number, lng: number }|null,
   *   savedSvState?: { panoId: string, heading: number, pitch: number, fov: number }|null,
   *   context?: 'location'|'arrow',
   * }} [opts]
   */
  function openStreetView(locationId, opts) {
    const loc = locationId ? findLocation(locationId) : null;
    const {
      approachBearing,
      titleOverride,
      coordsOverride,
      savedSvState,
      context = "location",
    } = opts || {};

    // We need at least a location or override coords
    if (!loc && !coordsOverride) return;

    streetViewForId = locationId;
    showSvSaveButton(context);

    const overlay = document.getElementById("streetViewOverlay");
    const pane = document.getElementById("streetViewPane");
    const titleEl = document.getElementById("svTitle");
    const badgeEl = document.getElementById("svBearingBadge");
    const hintEl = document.getElementById("svBearingHint");
    const noImgEl = document.getElementById("svNoImageryMsg");
    const mapsLink = document.getElementById("svGoogleMapsLink");
    if (!overlay || !pane) return;

    // ── Populate header ───────────────────────────────────────
    let titleText;
    if (titleOverride) {
      titleText = titleOverride;
    } else if (loc) {
      const atts = loc.attachments || [];
      titleText = atts.length
        ? atts.map((a) => a.sign_text || "—").join(", ")
        : "Location";
    } else {
      titleText = "Street View";
    }
    if (titleEl) titleEl.textContent = titleText;

    // Determine the effective bearing for display and approach
    const effectiveBearing =
      approachBearing != null
        ? Number(approachBearing)
        : loc?.front_bearing != null && loc.front_bearing !== ""
          ? Number(loc.front_bearing)
          : null;
    const hasBearing = effectiveBearing != null;

    if (badgeEl) {
      if (hasBearing) {
        badgeEl.textContent = `${Math.round(effectiveBearing)}°`;
        badgeEl.classList.remove("d-none");
      } else {
        badgeEl.classList.add("d-none");
      }
    }
    if (hintEl) hintEl.classList.toggle("d-none", hasBearing);

    // ── Target coordinates ────────────────────────────────────
    const targetLat = coordsOverride?.lat ?? Number(loc.latitude);
    const targetLng = coordsOverride?.lng ?? Number(loc.longitude);

    // ── Reset no-imagery footer ───────────────────────────────
    if (noImgEl) noImgEl.classList.add("d-none");
    if (mapsLink) {
      mapsLink.href =
        `https://www.google.com/maps/@${targetLat},${targetLng},3a,75y,` +
        `${hasBearing ? Math.round(effectiveBearing) : 0}h,90t/data=!3m1!1e1`;
    }

    // ── Determine initial panorama position ───────────────────
    let panoOptions;

    // Priority: explicit saved state (arrow), then location sv_pano_id
    // (only when opened directly for the location), then bearing approach.
    const svState =
      savedSvState ||
      (!approachBearing && loc?.sv_pano_id
        ? {
            panoId: loc.sv_pano_id,
            heading: loc.sv_heading,
            pitch: loc.sv_pitch,
            fov: loc.sv_fov,
          }
        : null);

    if (svState?.panoId) {
      const fov = svState.fov || 90;
      panoOptions = {
        pano: svState.panoId,
        pov: {
          heading: Number(svState.heading) || 0,
          pitch: Number(svState.pitch) || 0,
        },
        zoom: Math.log2(180 / fov),
      };
    } else if (hasBearing) {
      // Compute approach position: offset behind the target
      const reverseBearingRad =
        ((effectiveBearing + 180) % 360) * (Math.PI / 180);
      const metersPerDegreeLat = 111320;
      const metersPerDegreeLng = 111320 * Math.cos(targetLat * (Math.PI / 180));
      const approachLat =
        targetLat +
        (SV_APPROACH_DISTANCE_METERS * Math.cos(reverseBearingRad)) /
          metersPerDegreeLat;
      const approachLng =
        targetLng +
        (SV_APPROACH_DISTANCE_METERS * Math.sin(reverseBearingRad)) /
          metersPerDegreeLng;

      panoOptions = {
        position: { lat: approachLat, lng: approachLng },
        pov: { heading: effectiveBearing, pitch: 0 },
        zoom: 1,
      };
    } else {
      // No bearing — open at target, facing north
      panoOptions = {
        position: { lat: targetLat, lng: targetLng },
        pov: { heading: 0, pitch: 0 },
        zoom: 1,
      };
    }

    // ── Create panorama ───────────────────────────────────────
    streetViewPanorama = new google.maps.StreetViewPanorama(pane, {
      ...panoOptions,
      addressControl: false,
      fullscreenControl: false,
      enableCloseButton: false,
      motionTracking: false,
      motionTrackingControl: false,
    });

    // Detect no-imagery
    streetViewPanorama.addListener("status_changed", () => {
      const status = streetViewPanorama.getStatus();
      if (noImgEl) {
        noImgEl.classList.toggle(
          "d-none",
          status === google.maps.StreetViewStatus.OK,
        );
      }
    });

    // ── Show overlay with fade ────────────────────────────────
    overlay.classList.remove("d-none");
    requestAnimationFrame(() => {
      overlay.classList.add("signs-sv-overlay-visible");
    });
  }

  /**
   * Close the Street View overlay and destroy the panorama.
   */
  function closeStreetView() {
    const overlay = document.getElementById("streetViewOverlay");
    if (!overlay) return;

    overlay.classList.remove("signs-sv-overlay-visible");

    const cleanup = () => {
      overlay.removeEventListener("transitionend", cleanup);
      overlay.classList.add("d-none");

      if (streetViewPanorama) {
        google.maps.event.clearInstanceListeners(streetViewPanorama);
        streetViewPanorama = null;
      }
      const pane = document.getElementById("streetViewPane");
      if (pane) pane.innerHTML = "";

      streetViewForId = null;
      streetViewFromArrowId = null;
    };

    overlay.addEventListener("transitionend", cleanup, { once: true });

    // Safety net — if transitionend doesn't fire, clean up after 300 ms
    setTimeout(() => {
      if (streetViewPanorama) cleanup();
    }, 300);
  }

  /**
   * Open Street View from a traffic arrow's perspective.
   *
   * Follows the arrow's links to find the destination location (for
   * coordinates). Uses the arrow's own bearing for the camera approach
   * direction — not the location's front_bearing. If the arrow has
   * saved SV state, restores that exact view instead.
   *
   * If the arrow has no links, falls back to the arrow's own coordinates.
   *
   * @param {number} arrowId
   */
  function openStreetViewForArrow(arrowId) {
    const arrow = findArrow(arrowId);
    if (!arrow) return;

    streetViewFromArrowId = arrowId;

    // Build saved state object if arrow has one
    const arrowSv = arrow.sv_pano_id
      ? {
          panoId: arrow.sv_pano_id,
          heading: arrow.sv_heading,
          pitch: arrow.sv_pitch,
          fov: arrow.sv_fov,
        }
      : null;

    // Resolve linked location — first link wins
    let linkedLoc = null;
    for (const attId of arrow.links || []) {
      for (const loc of locations) {
        if ((loc.attachments || []).some((a) => a.attachment_id === attId)) {
          linkedLoc = loc;
          break;
        }
      }
      if (linkedLoc) break;
    }

    const title = arrow.label || "Traffic arrow";

    if (linkedLoc) {
      openStreetView(linkedLoc.location_id, {
        approachBearing: arrowSv ? null : arrow.bearing,
        titleOverride: title,
        savedSvState: arrowSv,
        context: "arrow",
      });
    } else {
      openStreetView(null, {
        approachBearing: arrowSv ? null : arrow.bearing,
        titleOverride: title,
        savedSvState: arrowSv,
        coordsOverride: {
          lat: Number(arrow.latitude),
          lng: Number(arrow.longitude),
        },
        context: "arrow",
      });
    }
  }

  /**
   * Capture the current Street View camera state and save as the
   * location's photo via the server-side static image fetch.
   * Only available when SV was opened from a location.
   */
  async function saveStreetViewAsPhoto() {
    if (!streetViewPanorama || !streetViewForId) return;

    const btn = document.getElementById("svSavePhotoBtn");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Saving…';
    }

    try {
      const pov = streetViewPanorama.getPov();
      const pano = streetViewPanorama.getPano();
      const zoom = streetViewPanorama.getZoom();
      const fov = 180 / Math.pow(2, zoom);

      const res = await fetch(
        `/signs/locations/${streetViewForId}/street-view-photo`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "CSRF-Token": getCsrfToken(),
          },
          body: JSON.stringify({
            panoId: pano,
            heading: pov.heading,
            pitch: pov.pitch,
            fov,
          }),
        },
      );

      const data = await res.json();
      if (!data.success) {
        alert(data.error || "Failed to save Street View photo.");
        return;
      }

      // Update in-memory location
      const loc = findLocation(streetViewForId);
      if (loc) {
        loc.photo_url = data.photo_url;
        loc.photo_taken_by = data.photo_taken_by;
        loc.photo_taken_at = data.photo_taken_at;
        loc.sv_pano_id = data.sv_pano_id;
        loc.sv_heading = data.sv_heading;
        loc.sv_pitch = data.sv_pitch;
        loc.sv_fov = data.sv_fov;
      }

      photoCacheBuster++;

      // If the editor is open for this location, refresh the photo display
      if (editingLocationId === streetViewForId) {
        renderEditorPhoto(loc);
      }
    } catch (err) {
      console.error("saveStreetViewAsPhoto error:", err);
      alert("Failed to save Street View photo.");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-camera me-1"></i>Save as Photo';
      }
    }
  }

  /**
   * Persist the current Street View camera state on the active arrow.
   * Only available when SV was opened from an arrow.
   */
  async function saveArrowStreetViewState() {
    if (!streetViewPanorama || !streetViewFromArrowId) return;

    const btn = document.getElementById("svSaveViewBtn");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Saving…';
    }

    try {
      const pov = streetViewPanorama.getPov();
      const pano = streetViewPanorama.getPano();
      const zoom = streetViewPanorama.getZoom();
      const fov = 180 / Math.pow(2, zoom);

      const res = await fetch(
        `/signs/arrows/${streetViewFromArrowId}/street-view-state`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "CSRF-Token": getCsrfToken(),
          },
          body: JSON.stringify({
            panoId: pano,
            heading: pov.heading,
            pitch: pov.pitch,
            fov,
          }),
        },
      );

      const data = await res.json();
      if (!data.success) {
        alert(data.error || "Failed to save view.");
        return;
      }

      // Update in-memory arrow
      const arrow = findArrow(streetViewFromArrowId);
      if (arrow) {
        arrow.sv_pano_id = data.sv_pano_id;
        arrow.sv_heading = data.sv_heading;
        arrow.sv_pitch = data.sv_pitch;
        arrow.sv_fov = data.sv_fov;
      }
    } catch (err) {
      console.error("saveArrowStreetViewState error:", err);
      alert("Failed to save view.");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk me-1"></i>Save View';
      }
    }
  }
  // ============================================================
  // INFO SHEET
  // ============================================================

  /**
   * Deselect all markers and arrows, dismiss info sheet and context menu.
   */
  function deselectAll() {
    clearTimeout(singleClickTimer);
    singleClickTimer = null;

    if (selectedId !== null) {
      const prev = markers.get(selectedId);
      if (prev?.content)
        prev.content.classList.remove("signs-map-marker-selected");
      selectedId = null;
    }
    if (selectedArrowId !== null) {
      const prev = arrowMarkers.get(selectedArrowId);
      if (prev?.content)
        prev.content.classList.remove("signs-arrow-marker-selected");
      clearLinkedSignHighlight();
      selectedArrowId = null;
    }
    // Clear sidebar highlight
    document
      .querySelectorAll(".signs-location-row.border-primary")
      .forEach((row) => row.classList.remove("border-primary"));
    dismissInfoSheet(true);
    dismissContextMenu();
    cancelPulse();
  }

  /**
   * Dismiss the info sheet.
   *
   * @param {boolean} [immediate] - Skip the slide-out transition.
   */
  function dismissInfoSheet(immediate) {
    const sheet = document.getElementById("signsInfoSheet");
    const backdrop = document.getElementById("signsInfoSheetBackdrop");
    if (sheet) {
      sheet.classList.remove("signs-info-sheet-open");
      if (immediate) {
        sheet.classList.add("d-none");
      } else {
        sheet.addEventListener(
          "transitionend",
          () => sheet.classList.add("d-none"),
          { once: true },
        );
      }
    }
    if (backdrop) {
      backdrop.classList.remove("signs-info-sheet-backdrop-visible");
      if (immediate) {
        backdrop.classList.add("d-none");
      } else {
        backdrop.addEventListener(
          "transitionend",
          () => backdrop.classList.add("d-none"),
          { once: true },
        );
      }
    }
  }

  /**
   * Populate and show the info sheet for a sign location.
   *
   * @param {number} locationId
   */
  function openInfoSheet(locationId) {
    dismissContextMenu();
    dismissEditorIfOpen();
    dismissArrowEditorIfOpen();

    const loc = findLocation(locationId);
    if (!loc) return;

    const header = document.getElementById("signsInfoSheetHeader");
    const body = document.getElementById("signsInfoSheetBody");
    if (!header || !body) return;

    // ── Header ─────────────────────────────────────────────────
    header.innerHTML = "";

    const preview = document.createElement("div");
    preview.className = "signs-info-sheet-preview-group";

    const atts = loc.attachments || [];
    const status = deriveStatus(loc);
    const titleText = atts.length
      ? atts.map((a) => a.sign_text || "—").join(", ")
      : "Empty location";

    const titleEl = document.createElement("strong");
    titleEl.textContent = titleText;
    preview.appendChild(titleEl);

    const badge = document.createElement("span");
    badge.className = `badge rounded-pill bg-${status === "installed" ? "success" : status === "removed" ? "danger" : "secondary"} ms-2`;
    badge.textContent = status;
    preview.appendChild(badge);

    header.appendChild(preview);

    const closeBtn = document.createElement("button");
    closeBtn.className = "signs-info-sheet-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
    closeBtn.addEventListener("click", () => dismissInfoSheet());
    header.appendChild(closeBtn);

    // ── Body ───────────────────────────────────────────────────
    body.innerHTML = "";

    // Photo thumbnail
    if (loc.photo_url) {
      const thumb = document.createElement("img");
      thumb.className = "signs-info-sheet-thumb";
      thumb.alt = "Location photo";
      thumb.src = `/signs/locations/${loc.location_id}/photo?v=${photoCacheBuster}`;
      body.appendChild(thumb);
    }

    // Details grid
    const dl = document.createElement("dl");
    dl.className = "signs-info-sheet-details";

    const addDetail = (label, value) => {
      if (!value) return;
      const dt = document.createElement("dt");
      dt.textContent = label;
      dl.appendChild(dt);
      const dd = document.createElement("dd");
      dd.textContent = value;
      dl.appendChild(dd);
    };

    addDetail("Mount", MOUNT_LABELS[loc.mount_type] || loc.mount_type || "—");
    addDetail("Signs", atts.length ? `${atts.length} attached` : "None");
    addDetail("Notes", loc.location_notes);
    addDetail(
      "Coords",
      `${Number(loc.latitude).toFixed(6)}, ${Number(loc.longitude).toFixed(6)}`,
    );

    if (dl.children.length) body.appendChild(dl);

    // Attachment list
    if (atts.length) {
      atts.forEach((att) => {
        const row = document.createElement("div");
        row.className = "d-flex align-items-center gap-2 mb-1";

        const text = document.createElement("span");
        text.className = "flex-grow-1 text-truncate";
        text.style.cssText = "font-size:0.85rem";
        text.textContent = att.sign_text || "—";
        row.appendChild(text);

        const dir = att.arrow_direction;
        if (dir) {
          const ar = document.createElement("span");
          ar.className = "text-muted";
          ar.style.cssText = "font-size:0.8rem";
          if (dir === "destination") {
            ar.innerHTML = '<i class="fa-solid fa-location-dot"></i>';
          } else if (ARROW_GLYPHS[dir]) {
            ar.textContent = ARROW_GLYPHS[dir];
          }
          row.appendChild(ar);
        }

        const statusBadge = document.createElement("span");
        statusBadge.className = `badge rounded-pill bg-${att.status === "installed" ? "success" : att.status === "removed" ? "danger" : "secondary"}`;
        statusBadge.style.cssText = "font-size:0.7rem";
        statusBadge.textContent = att.status;
        row.appendChild(statusBadge);

        body.appendChild(row);
      });
    }

    // Action buttons
    if (canManage) {
      const actions = document.createElement("div");
      actions.className = "signs-info-sheet-actions mt-3";

      const svBtn = document.createElement("button");
      svBtn.type = "button";
      svBtn.className = "signs-info-sheet-action-btn";
      svBtn.innerHTML =
        '<i class="fa-solid fa-street-view" aria-hidden="true"></i> Street View';
      svBtn.addEventListener("click", () => {
        dismissInfoSheet(true);
        openStreetView(locationId);
      });
      actions.appendChild(svBtn);

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className =
        "signs-info-sheet-action-btn signs-info-sheet-action-btn-primary";
      editBtn.innerHTML =
        '<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Edit location';
      editBtn.addEventListener("click", () => {
        dismissInfoSheet(true);
        openEditor(locationId);
      });
      actions.appendChild(editBtn);

      body.appendChild(actions);
    }

    // ── Show ───────────────────────────────────────────────────
    showInfoSheetElement();
  }

  /**
   * Populate and show the info sheet for a traffic arrow.
   *
   * @param {number} arrowId
   */
  function openArrowInfoSheet(arrowId) {
    dismissContextMenu();
    dismissEditorIfOpen();
    dismissArrowEditorIfOpen();

    const arrow = findArrow(arrowId);
    if (!arrow) return;

    const header = document.getElementById("signsInfoSheetHeader");
    const body = document.getElementById("signsInfoSheetBody");
    if (!header || !body) return;

    // ── Header ─────────────────────────────────────────────────
    header.innerHTML = "";

    const preview = document.createElement("div");
    preview.className = "signs-info-sheet-preview-group";

    const titleEl = document.createElement("strong");
    titleEl.textContent = arrow.label || "Traffic arrow";
    preview.appendChild(titleEl);

    header.appendChild(preview);

    const closeBtn = document.createElement("button");
    closeBtn.className = "signs-info-sheet-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
    closeBtn.addEventListener("click", () => dismissInfoSheet());
    header.appendChild(closeBtn);

    // ── Body ───────────────────────────────────────────────────
    body.innerHTML = "";

    const dl = document.createElement("dl");
    dl.className = "signs-info-sheet-details";

    const addDetail = (label, value) => {
      if (!value && value !== 0) return;
      const dt = document.createElement("dt");
      dt.textContent = label;
      dl.appendChild(dt);
      const dd = document.createElement("dd");
      dd.textContent = value;
      dl.appendChild(dd);
    };

    addDetail("Label", arrow.label);
    addDetail("Bearing", `${arrow.bearing ?? 0}°`);
    addDetail(
      "Coords",
      `${Number(arrow.latitude).toFixed(6)}, ${Number(arrow.longitude).toFixed(6)}`,
    );

    const links = arrow.links || [];
    if (links.length) {
      const linkedNames = links
        .map((attId) => {
          for (const loc of locations) {
            const att = (loc.attachments || []).find(
              (a) => a.attachment_id === attId,
            );
            if (att) return att.sign_text || "—";
          }
          return null;
        })
        .filter(Boolean);
      if (linkedNames.length) {
        addDetail("Linked signs", linkedNames.join(", "));
      }
    }

    if (dl.children.length) body.appendChild(dl);

    // Action buttons
    if (canManage) {
      const actions = document.createElement("div");
      actions.className = "signs-info-sheet-actions mt-3";

      const svBtn = document.createElement("button");
      svBtn.type = "button";
      svBtn.className = "signs-info-sheet-action-btn";
      svBtn.innerHTML =
        '<i class="fa-solid fa-street-view" aria-hidden="true"></i> Street View';
      svBtn.addEventListener("click", () => {
        dismissInfoSheet(true);
        openStreetViewForArrow(arrowId);
      });
      actions.appendChild(svBtn);

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className =
        "signs-info-sheet-action-btn signs-info-sheet-action-btn-primary";
      editBtn.innerHTML =
        '<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Edit arrow';
      editBtn.addEventListener("click", () => {
        dismissInfoSheet(true);
        openArrowEditor(arrowId);
      });
      actions.appendChild(editBtn);

      body.appendChild(actions);
    }

    // ── Show ───────────────────────────────────────────────────
    showInfoSheetElement();
  }

  /**
   * Animate the info sheet into view.
   */
  function showInfoSheetElement() {
    const sheet = document.getElementById("signsInfoSheet");
    const backdrop = document.getElementById("signsInfoSheetBackdrop");

    if (sheet) {
      sheet.classList.remove("d-none");
      requestAnimationFrame(() => {
        sheet.classList.add("signs-info-sheet-open");
      });
    }
    if (backdrop) {
      backdrop.classList.remove("d-none");
      requestAnimationFrame(() => {
        backdrop.classList.add("signs-info-sheet-backdrop-visible");
      });
      // Backdrop click dismisses info sheet
      backdrop.onclick = () => dismissInfoSheet();
    }
  }

  // ============================================================
  // CONTEXT MENU
  // ============================================================

  /**
   * Show a floating context menu at the given screen coordinates.
   * The menu is appended to document.body to avoid Google Maps'
   * .gm-style all:revert CSS reset.
   *
   * @param {number} x - clientX
   * @param {number} y - clientY
   * @param {'location'|'arrow'} type
   * @param {number} id - location_id or arrow_id
   */
  function showContextMenu(x, y, type, id) {
    dismissContextMenu();
    dismissInfoSheet(true);

    const menu = document.createElement("div");
    menu.id = "signsContextMenu";
    menu.className = "signs-context-menu";

    /**
     * Add an item to the context menu.
     *
     * @param {string} icon - FontAwesome class
     * @param {string} label
     * @param {Function} handler
     * @param {string} [variant] - Optional CSS modifier class
     */
    const addItem = (icon, label, handler, variant) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "signs-context-menu-item" +
        (variant ? ` signs-context-menu-item-${variant}` : "");
      btn.innerHTML = `<i class="${icon}" aria-hidden="true"></i> ${label}`;
      btn.addEventListener("click", () => {
        dismissContextMenu();
        handler();
      });
      menu.appendChild(btn);
    };

    if (type === "location") {
      addItem("fa-solid fa-street-view", "Street View", () =>
        openStreetView(id),
      );
      addItem("fa-solid fa-pen-to-square", "Edit", () => openEditor(id));
      addItem(
        "fa-solid fa-trash-can",
        "Delete",
        () => {
          if (confirm("Delete this location and all its attachments?")) {
            editingLocationId = id;
            deleteFromEditor();
          }
        },
        "danger",
      );
    } else {
      addItem("fa-solid fa-street-view", "Street View", () =>
        openStreetViewForArrow(id),
      );
      addItem("fa-solid fa-pen-to-square", "Edit", () => openArrowEditor(id));
      addItem(
        "fa-solid fa-trash-can",
        "Delete",
        () => {
          if (confirm("Delete this traffic arrow?")) {
            const el = document.getElementById("arrowEditor");
            if (el) el.dataset.arrowId = id;
            deleteArrowEditor();
          }
        },
        "danger",
      );
    }

    // Position — keep within viewport
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    const posX = Math.min(x, window.innerWidth - rect.width - 8);
    const posY = Math.min(y, window.innerHeight - rect.height - 8);
    menu.style.setProperty("left", `${Math.max(0, posX)}px`);
    menu.style.setProperty("top", `${Math.max(0, posY)}px`);

    // Dismiss on next click anywhere or scroll
    requestAnimationFrame(() => {
      document.addEventListener("click", dismissContextMenu, { once: true });
      document.addEventListener("scroll", dismissContextMenu, {
        once: true,
        capture: true,
      });
    });
  }

  /**
   * Remove the context menu if it exists.
   */
  function dismissContextMenu() {
    const existing = document.getElementById("signsContextMenu");
    if (existing) existing.remove();
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

    // Legend overlay toggle
    const legendTab = document.getElementById("mapLegendTab");
    const legendPanel = document.getElementById("mapLegendPanel");
    if (legendTab && legendPanel) {
      legendTab.addEventListener("click", () => {
        const open = legendPanel.classList.toggle("signs-map-legend-open");
        legendTab.classList.toggle("signs-map-legend-tab-open", open);
      });
    }

    // Layer toggles
    document.querySelectorAll("[id^='layer']").forEach((cb) => {
      if (cb.type !== "checkbox") return;
      cb.addEventListener("change", () => {
        const id = cb.id.replace(/^layer/, "");
        const layerId = id.charAt(0).toLowerCase() + id.slice(1);
        toggleLayer(layerId, cb.checked);
      });
    });

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

    // Editor color swatches
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

    // Street View overlay
    const svCloseBtn = document.getElementById("svCloseBtn");
    if (svCloseBtn)
      svCloseBtn.addEventListener("click", () => closeStreetView());
    const svSavePhotoBtn = document.getElementById("svSavePhotoBtn");
    if (svSavePhotoBtn)
      svSavePhotoBtn.addEventListener("click", () => saveStreetViewAsPhoto());
    const svSaveViewBtn = document.getElementById("svSaveViewBtn");
    if (svSaveViewBtn)
      svSaveViewBtn.addEventListener("click", () => saveArrowStreetViewState());

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

    // Arrow link picker — items are wired in populateArrowLinkPicker()
    // (Bootstrap dropdown toggle is handled via data-bs-toggle attribute)

    // Arrow editor offcanvas close → clean up
    const arrowEditorEl = document.getElementById("arrowEditor");
    if (arrowEditorEl) {
      arrowEditorEl.addEventListener("hidden.bs.offcanvas", () => {
        clearLinkedSignHighlight();
        clearLinkedSignHighlight();
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
        updateDraggableState();
      }
    });
    document.addEventListener("keyup", (e) => {
      if (e.key === "Shift") {
        shiftHeld = false;
        mapRef?.getDiv().classList.remove("signs-map-shift-held");
        updateDraggableState();
      }
    });
    window.addEventListener("blur", () => {
      shiftHeld = false;
      mapRef?.getDiv().classList.remove("signs-map-shift-held");
      updateDraggableState();
    });

    // Escape key → dismiss SV overlay / menus / exit placing mode / deselect
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (streetViewForId !== null) {
          closeStreetView();
          return;
        }
        dismissContextMenu();
        if (isPlacingArrow) {
          exitArrowPlacingMode();
          return;
        }
        if (isPlacing) {
          clearPendingMarker();
          exitPlacingMode();
          return;
        }
        deselectAll();
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
        mapOverlays = Array.isArray(parsed.mapOverlays)
          ? parsed.mapOverlays
          : [];
      } catch (err) {
        console.error("Failed to parse signsMapBootstrap JSON:", err);
      }
    }

    wireUi();
    renderLocationList();

    // Expose a minimal API for companion modules (e.g. signsGeofence.js).
    window.signsMapApi = {
      getLocations: () => locations,
      findLocation,
      deriveStatus,
      selectMarker,
      quickSetLocationStatus,
      canManage: () => canManage,
      getMapRef: () => mapRef,
      toggleLayer,
      isLayerVisible,
    };

    if (!apiKey) return;

    loadGoogleMaps(apiKey)
      .then(() => {
        initMap({ lat: centerLat, lng: centerLng, zoom: centerZoom });
        if (window.signsMapOverlays) {
          window.signsMapOverlays.render(mapRef, mapOverlays);
        }
      })
      .catch((err) => console.error("Google Maps load failed:", err));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
