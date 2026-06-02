/**
 * @file public/js/signsMap.js
 * @description Sign Map page — Google Maps satellite view of all
 *   non-archived sign placements, with click-to-place / drag-to-reposition
 *   for OVERSEER+ users.
 *
 * Design notes:
 *   - The Google Maps script is loaded dynamically at runtime so the API
 *     key never appears in static HTML. The key is read from a data-* attr
 *     on #signsMapRoot, which the server templates in.
 *   - Placement markers use google.maps.marker.AdvancedMarkerElement so the
 *     marker content is real DOM (the sign-preview block from signs.css)
 *     and clicks/drags fire native events. AdvancedMarkerElement requires
 *     the "marker" library plus a mapId — we use Google's default styled
 *     map id "DEMO_MAP_ID" for now. Replace with a project-specific id if
 *     you want custom styles.
 *   - Mount type, status, and template filters are pure client-side; the
 *     server returns every non-archived placement on page load and we
 *     hide/show via marker.map = null / marker.map = mapRef.
 *
 * Public surface: none (the bootstrap script tag triggers everything).
 */

(() => {
  "use strict";

  // ============================================================
  // CONSTANTS
  // ============================================================

  /** Unicode glyphs by direction token; matches signsBuilder.js. */
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

  /** Human-readable labels for mount types. */
  const MOUNT_LABELS = {
    cone: "Cone",
    "a-frame": "A-frame",
    "existing-structure": "Existing structure",
  };

  /** Status pill class mapping. */
  const STATUS_CLASSES = {
    planned: "signs-status-pill signs-status-planned",
    installed: "signs-status-pill signs-status-installed",
    removed: "signs-status-pill signs-status-removed",
  };

  /** Valid marker colour palette keys (must match CSS classes). */
  const MARKER_COLORS = [
    "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink",
  ];

  // ============================================================
  // MODULE STATE
  // ============================================================

  /** @type {google.maps.Map|null} */
  let mapRef = null;

  /** @type {Array<object>} all placements from the server, mutated in place. */
  let placements = [];

  /** @type {Array<object>} all sign templates from the server. */
  let signs = [];

  /** Map of placement_id -> AdvancedMarkerElement. */
  const markers = new Map();

  /** Currently keyboard-selected placement_id (separate from editor's editingId). */
  let selectedId = null;

  /** Debounce timer for autosaving nudges. */
  let nudgeSaveTimer = null;

  /** True while a nudge save is in-flight to serialize rapid keypresses. */
  let nudgeInFlight = false;

  /** Meters per nudge — base step (arrow keys) and shift step (shift+arrow). */
  const NUDGE_STEP_METERS = 0.5;
  const NUDGE_STEP_SHIFT_METERS = 5;

  /**
   * Zoom level at and above which markers render as the full sign-preview
   * block. Below this threshold, markers render as a compact 32px disc
   * with abbreviation text and an arrow badge — keeps the map readable
   * when zoomed out far enough to see multiple placements at once.
   *
   * Users can adjust this at runtime via the on-map control; their
   * preference is persisted to localStorage.
   */
  const ZOOM_DETAIL_DEFAULT = 19;
  let zoomFullDetail = Number(
    localStorage.getItem("signs-map-detail-zoom") || ZOOM_DETAIL_DEFAULT,
  );

  /**
   * Timestamp (ms since epoch) of the most recent marker dragend, used to
   * suppress the spurious map-background click that some browsers fire
   * immediately after a drag completes. Without this guard, that click
   * would clear the keyboard selection right after dragend re-sets it.
   */
  let lastDragEndAt = 0;

  /**
   * Counter incremented on each successful photo upload/delete, appended
   * as a cache-busting query string to the proxy URL. Browsers happily
   * cache the proxy response (we set Cache-Control: private, max-age=3600),
   * so without this query param a replaced photo would still show the
   * stale thumbnail until the user hard-refreshes.
   */
  let photoCacheBuster = 0;

  /**
   * Current marker detail level — 'compact' (abbreviation disc) or
   * 'full' (sign-preview block). Cached so we only swap marker.content
   * when the level crosses the threshold, not on every zoom_changed
   * fire (Google emits these continuously during pinch gestures).
   */
  let currentDetailLevel = "compact";

  /** When true, the next map click drops a new placement marker. */
  let placingMode = false;

  /** Currently-edited placement_id, or null when editing a new placement. */
  let editingId = null;

  /** Coordinates of the pending new placement (only used while editingId === null). */
  let pendingNewLatLng = null;

  /** AdvancedMarkerElement for the pending new placement (cleared on save/cancel). */
  let pendingNewMarker = null;

  /** Bootstrap Offcanvas instance for the editor. */
  let offcanvas = null;

  /** Can the current user manage placements (drag/save/delete)? */
  let canManage = false;

  // ============================================================
  // HELPERS
  // ============================================================

  /**
   * Read the CSRF token from the meta tag.
   * @returns {string}
   */
  function getCsrfToken() {
    const el = document.querySelector('meta[name="csrf-token"]');
    return el ? el.getAttribute("content") || "" : "";
  }

  /**
   * Build the inner HTML for a sign-preview block used as a marker.
   * The destination pin uses a FontAwesome icon; other arrows use Unicode.
   *
   * @param {{ sign_text: string, arrow_direction: string|null, status: string }} placement
   * @returns {HTMLDivElement}
   */
  function buildMarkerContent(placement) {
    const wrapper = document.createElement("div");
    const colorCls = placement.marker_color
      ? ` signs-map-marker-color-${placement.marker_color}`
      : "";
    wrapper.className = `signs-map-marker signs-map-marker-${placement.status || "planned"}${colorCls}`;

    const sign = document.createElement("div");
    sign.className = "sign-preview signs-map-marker-sign";

    const text = document.createElement("span");
    text.className = "sign-preview-text";
    text.textContent = placement.sign_text || "";
    sign.appendChild(text);

    const arrow = document.createElement("span");
    arrow.className = "sign-preview-arrow";

    if (placement.arrow_direction === "destination") {
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-location-dot";
      icon.setAttribute("aria-hidden", "true");
      arrow.appendChild(icon);
    } else if (
      placement.arrow_direction &&
      ARROW_GLYPHS[placement.arrow_direction]
    ) {
      arrow.textContent = ARROW_GLYPHS[placement.arrow_direction];
    }
    sign.appendChild(arrow);

    wrapper.appendChild(sign);
    return wrapper;
  }

  /**
   * Build a compact 32px disc marker — abbreviation text centered with a
   * status-colored background, and a small arrow badge in the top-right
   * corner for directional signs. Used when zoom < ZOOM_FULL_DETAIL.
   *
   * @param {{ abbreviation: string, arrow_direction: string|null, status: string }} placement
   * @returns {HTMLDivElement}
   */
  function buildCompactMarkerContent(placement) {
    const wrapper = document.createElement("div");
    const colorCls = placement.marker_color
      ? ` signs-map-marker-color-${placement.marker_color}`
      : "";
    wrapper.className = `signs-map-marker signs-map-marker-compact signs-map-marker-${placement.status || "planned"}${colorCls}`;

    const disc = document.createElement("div");
    disc.className = "signs-map-marker-disc";

    // Abbreviation text — always present (server guarantees non-null)
    const abbr = document.createElement("span");
    abbr.className = "signs-map-marker-abbr";
    abbr.textContent = placement.abbreviation || "?";
    disc.appendChild(abbr);

    wrapper.appendChild(disc);

    // Arrow badge — small indicator in the top-right corner.
    // Omitted entirely for signs with no arrow direction.
    if (placement.arrow_direction) {
      const badge = document.createElement("span");
      badge.className = "signs-map-marker-badge";

      if (placement.arrow_direction === "destination") {
        const icon = document.createElement("i");
        icon.className = "fa-solid fa-location-dot";
        icon.setAttribute("aria-hidden", "true");
        badge.appendChild(icon);
      } else if (ARROW_GLYPHS[placement.arrow_direction]) {
        badge.textContent = ARROW_GLYPHS[placement.arrow_direction];
      }
      wrapper.appendChild(badge);
    }

    return wrapper;
  }

  /**
   * Map a zoom level to the detail level it should render at.
   *
   * @param {number} zoom
   * @returns {'compact'|'full'}
   */
  function detailLevelForZoom(zoom) {
    return zoom >= zoomFullDetail ? "full" : "compact";
  }

  /**
   * Build marker content for a placement at the given detail level.
   *
   * @param {object} placement
   * @param {'compact'|'full'} level
   * @returns {HTMLDivElement}
   */
  function buildMarkerContentForLevel(placement, level) {
    return level === "full"
      ? buildMarkerContent(placement)
      : buildCompactMarkerContent(placement);
  }

  /**
   * Swap every marker's content to match the new detail level. Reassigning
   * marker.content discards the old DOM node (and its class list), so the
   * keyboard-selected highlight has to be re-applied to the new node.
   *
   * @param {'compact'|'full'} level
   */
  function applyDetailLevelToAllMarkers(level) {
    placements.forEach((p) => {
      const marker = markers.get(p.placement_id);
      if (!marker) return;
      const newContent = buildMarkerContentForLevel(p, level);
      if (selectedId === p.placement_id) {
        newContent.classList.add("signs-map-marker-selected");
      }
      marker.content = newContent;
    });
  }

  /**
   * Refresh the preview block inside the offcanvas editor.
   *
   * @param {string} signText
   * @param {string|null} arrowDirection
   */
  function updateEditorPreview(signText, arrowDirection) {
    const textEl = document.getElementById("editorPreviewText");
    const arrowEl = document.getElementById("editorPreviewArrow");
    if (!textEl || !arrowEl) return;

    textEl.textContent = signText || "—";
    arrowEl.textContent = "";
    arrowEl.replaceChildren();

    if (arrowDirection === "destination") {
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-location-dot";
      icon.setAttribute("aria-hidden", "true");
      arrowEl.appendChild(icon);
    } else if (arrowDirection && ARROW_GLYPHS[arrowDirection]) {
      arrowEl.textContent = ARROW_GLYPHS[arrowDirection];
    }
  }

  /**
   * Find the placement object in the in-memory array by id.
   * @param {number} id
   * @returns {object|null}
   */
  function findPlacement(id) {
    return placements.find((p) => p.placement_id === id) || null;
  }

  /**
   * Find the sign template in the in-memory array by id.
   * @param {number} id
   * @returns {object|null}
   */
  function findSign(id) {
    return signs.find((s) => s.sign_id === id) || null;
  }

  /**
   * Sync the editor's arrow picker buttons with a given direction value.
   * Sets the hidden input and highlights the matching button.
   *
   * @param {string} dir  Direction token or '' for no arrow.
   */
  function syncEditorArrowPicker(dir) {
    const input = document.getElementById("editorArrowDirection");
    if (input) input.value = dir;

    const row = document.getElementById("editorArrowRow");
    if (!row) return;
    row.querySelectorAll(".arrow-btn").forEach((btn) => {
      const btnDir = btn.getAttribute("data-arrow") || "";
      btn.classList.toggle("active", btnDir === dir);
    });
  }

  /**
   * Apply the current filter selections by toggling each marker's map.
   * Also rebuilds the sidebar placement list.
   */
  function applyFilters() {
    const statusEl = document.querySelector(
      'input[name="statusFilter"]:checked',
    );
    const signEl = document.getElementById("signTemplateFilter");
    const status = statusEl ? statusEl.value : "";
    const signIdRaw = signEl ? signEl.value : "";
    const signId = signIdRaw ? Number(signIdRaw) : null;

    const visible = [];
    placements.forEach((p) => {
      const matchesStatus = !status || p.status === status;
      const matchesSign = !signId || p.sign_id === signId;
      const ok = matchesStatus && matchesSign;

      const marker = markers.get(p.placement_id);
      if (marker) marker.map = ok ? mapRef : null;
      if (ok) visible.push(p);
    });

    renderPlacementList(visible);
  }

  /**
   * Re-render the left-column placement list using the visible array.
   * @param {Array<object>} visible
   */
  function renderPlacementList(visible) {
    const container = document.getElementById("placementList");
    if (!container) return;
    container.replaceChildren();

    if (visible.length === 0) {
      const empty = document.createElement("p");
      empty.className = "small text-muted text-center py-3 mb-0";
      empty.textContent = "No placements match the current filters.";
      container.appendChild(empty);
      return;
    }

    visible.forEach((p) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "signs-placement-row";
      row.setAttribute("data-placement-id", String(p.placement_id));

      // Status dot
      const dot = document.createElement("span");
      dot.className = `signs-placement-dot signs-placement-dot-${p.status}`;
      row.appendChild(dot);

      // Body
      const body = document.createElement("div");
      body.className = "signs-placement-body";

      const name = document.createElement("div");
      name.className = "signs-placement-name";
      name.textContent = p.sign_text;
      if (
        p.arrow_direction &&
        p.arrow_direction !== "destination" &&
        ARROW_GLYPHS[p.arrow_direction]
      ) {
        name.textContent += " " + ARROW_GLYPHS[p.arrow_direction];
      }
      body.appendChild(name);

      const sub = document.createElement("div");
      sub.className = "signs-placement-sub";
      const subParts = [];
      if (p.mount_type)
        subParts.push(MOUNT_LABELS[p.mount_type] || p.mount_type);
      if (p.location_notes) subParts.push(p.location_notes);
      sub.textContent = subParts.length
        ? subParts.join(" • ")
        : `${Number(p.latitude).toFixed(5)}, ${Number(p.longitude).toFixed(5)}`;
      body.appendChild(sub);

      row.appendChild(body);
      container.appendChild(row);
    });
  }

  // ============================================================
  // MAP LIFECYCLE
  // ============================================================

  /**
   * Dynamically inject the Google Maps loader script. Resolves once
   * the maps + marker libraries are available.
   *
   * @param {string} apiKey
   * @returns {Promise<void>}
   */
  function loadGoogleMaps(apiKey) {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps) {
        resolve();
        return;
      }
      // The async loader pattern recommended by Google. The "loading=async"
      // param avoids the deprecation warning. We request the "marker"
      // library for AdvancedMarkerElement.
      const params = new URLSearchParams({
        key: apiKey,
        v: "weekly",
        libraries: "marker",
        loading: "async",
        callback: "__signsMapInitialized",
      });
      const url = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;

      window.__signsMapInitialized = () => {
        delete window.__signsMapInitialized;
        resolve();
      };

      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.defer = true;
      script.onerror = () =>
        reject(new Error("Failed to load Google Maps JavaScript API."));
      document.head.appendChild(script);
    });
  }

  /**
   * Create the map and the AdvancedMarkerElement for each placement.
   *
   * @param {{ lat: number, lng: number, zoom: number }} center
   */
  function initMap(center) {
    const mapEl = document.getElementById("googleMap");
    if (!mapEl) return;

    // Remove the loading spinner now that we're ready to render.
    mapEl.replaceChildren();

mapRef = new google.maps.Map(mapEl, {
  center: { lat: center.lat, lng: center.lng },
  zoom: center.zoom,
  mapTypeId: "roadmap", // Default; satellite available via map type control
  mapId: "6261df670165b61fc3ae73a4", // Custom Map ID — POIs hidden via Cloud Console style
  tilt: 0,
  disableDefaultUI: false,
  // Explicit per-control toggles (vector maps default to more
  // controls than raster, including a pan control we don't want).
  mapTypeControl: true,
  zoomControl: true,
  streetViewControl: false, // Phase 3 wires this up properly
  fullscreenControl: false, // Default control rendered poorly against satellite tiles
  rotateControl: false, // Not useful at tilt: 0
  scaleControl: false,
  cameraControl: false,
  // The pan control is a vector-maps-only diamond of arrows shown
  // by default in the lower-right; we don't want it duplicating
  // the zoom stack. Setting panControl explicitly to false
  // suppresses it across all map renderers.
  panControl: false,
});

    // Seed the detail level from the initial zoom so the first batch
    // of markers renders at the correct size.
    currentDetailLevel = detailLevelForZoom(mapRef.getZoom());

    // ── Zoom / detail-threshold control ──────────────────────────
    // Sits in the bottom-left of the map via the Maps custom controls
    // API so it doesn't overlap Google's own controls.
    const zoomCtrl = document.createElement("div");
    zoomCtrl.className = "signs-map-zoom-control";

    const zoomLabel = document.createElement("span");
    zoomLabel.className = "signs-map-zoom-level";
    zoomLabel.textContent = `Z: ${mapRef.getZoom()}`;

    const detailLabel = document.createElement("label");
    detailLabel.className = "signs-map-zoom-detail-label";
    detailLabel.textContent = "Detail \u2265 ";

    const detailInput = document.createElement("input");
    detailInput.type = "number";
    detailInput.className = "signs-map-zoom-input";
    detailInput.min = "1";
    detailInput.max = "22";
    detailInput.value = String(zoomFullDetail);
    detailInput.title = "Zoom level at which markers show full detail";

    detailLabel.appendChild(detailInput);
    zoomCtrl.appendChild(zoomLabel);
    zoomCtrl.appendChild(detailLabel);
    mapRef.controls[google.maps.ControlPosition.BOTTOM_LEFT].push(zoomCtrl);

    // Keep the zoom display current
    mapRef.addListener("zoom_changed", () => {
      zoomLabel.textContent = `Z: ${mapRef.getZoom()}`;
    });

    // Let users adjust the detail threshold on the fly
    detailInput.addEventListener("change", () => {
      const val = Number(detailInput.value);
      if (!Number.isFinite(val) || val < 1 || val > 22) {
        detailInput.value = String(zoomFullDetail);
        return;
      }
      zoomFullDetail = val;
      localStorage.setItem("signs-map-detail-zoom", String(val));
      const newLevel = detailLevelForZoom(mapRef.getZoom());
      if (newLevel !== currentDetailLevel) {
        currentDetailLevel = newLevel;
        applyDetailLevelToAllMarkers(newLevel);
      }
    });

    // Render each placement
    placements.forEach((p) => addMarkerForPlacement(p));

    // Swap every marker when crossing the detail threshold. Google fires
    // zoom_changed continuously during pinch/scroll, so we early-out
    // unless the resulting level actually changes.
    mapRef.addListener("zoom_changed", () => {
      const newLevel = detailLevelForZoom(mapRef.getZoom());
      if (newLevel !== currentDetailLevel) {
        currentDetailLevel = newLevel;
        applyDetailLevelToAllMarkers(newLevel);
      }
    });

    // Map background click: in placing mode, drop a new placement;
    // otherwise, deselect any keyboard-selected marker. Skip the deselect
    // if a drag just finished — browsers sometimes fire a synthetic click
    // immediately after dragend that would otherwise wipe the selection
    // the dragend listener just set.
    mapRef.addListener("click", (e) => {
      if (placingMode && canManage) {
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        beginNewPlacement(lat, lng);
        return;
      }
      if (Date.now() - lastDragEndAt < 300) return;
      selectMarker(null);
    });
  }

  /**
   * Build and attach a marker for one placement, registering listeners.
   *
   * @param {object} placement
   */
  function addMarkerForPlacement(placement) {
    if (!mapRef || !google.maps.marker) return;

    const marker = new google.maps.marker.AdvancedMarkerElement({
      map: mapRef,
      position: {
        lat: Number(placement.latitude),
        lng: Number(placement.longitude),
      },
      content: buildMarkerContentForLevel(placement, currentDetailLevel),
      gmpDraggable: canManage,
      title: placement.sign_text,
    });

    marker.addListener("gmp-click", () => {
      selectMarker(placement.placement_id);
      openEditor(placement.placement_id);
    });

    if (canManage) {
      // gmp-dragend fires after a user finishes dragging the marker.
      // Keep keyboard selection on this marker so the user can continue
      // nudging with arrow keys without re-clicking it first. Mark the
      // drag-end timestamp synchronously (before the await) so the
      // 300ms guard in the map-click handler catches any synthetic click
      // that fires immediately after dragend.
      marker.addListener("dragend", async () => {
        lastDragEndAt = Date.now();
        const pos = marker.position;
        const newLat = typeof pos.lat === "function" ? pos.lat() : pos.lat;
        const newLng = typeof pos.lng === "function" ? pos.lng() : pos.lng;
        selectMarker(placement.placement_id);
        await persistDrag(placement.placement_id, newLat, newLng);
      });
    }

    markers.set(placement.placement_id, marker);
  }

  /**
   * Mark a placement as keyboard-selected. Adds a visual highlight class
   * to its marker content and tracks the selection so arrow-key nudges
   * know which marker to move. Pass null to clear.
   *
   * @param {number|null} placementId
   */
  function selectMarker(placementId) {
    if (selectedId !== null) {
      const prev = markers.get(selectedId);
      if (prev && prev.content) {
        prev.content.classList.remove("signs-map-marker-selected");
      }
    }

    selectedId = placementId;

    if (placementId !== null) {
      const next = markers.get(placementId);
      if (next && next.content) {
        next.content.classList.add("signs-map-marker-selected");
      }
    }
  }

  /**
   * Convert a (meters_north, meters_east) offset into (deltaLat, deltaLng)
   * in degrees, accounting for longitude compression by latitude.
   *
   * @param {number} metersNorth
   * @param {number} metersEast
   * @param {number} atLat  Latitude where the conversion applies (degrees).
   * @returns {{ dLat: number, dLng: number }}
   */
  function metersToDegrees(metersNorth, metersEast, atLat) {
    const dLat = metersNorth / 111320;
    const cosLat = Math.cos((atLat * Math.PI) / 180);
    const dLng = metersEast / (111320 * Math.max(cosLat, 1e-9));
    return { dLat, dLng };
  }

  /**
   * Apply a keyboard nudge to the currently selected marker. Updates the
   * marker position visually, mirrors to the editor inputs if it's open
   * on this placement, and debounces the autosave to the server.
   *
   * @param {'up'|'down'|'left'|'right'} direction
   * @param {boolean} shifted  True for the 5m coarse step; false for 0.5m fine.
   */
  function nudgeSelected(direction, shifted) {
    if (selectedId === null || !canManage) return;
    const p = findPlacement(selectedId);
    if (!p) return;
    const marker = markers.get(selectedId);
    if (!marker) return;

    const step = shifted ? NUDGE_STEP_SHIFT_METERS : NUDGE_STEP_METERS;
    let dN = 0;
    let dE = 0;
    if (direction === "up") dN = step;
    if (direction === "down") dN = -step;
    if (direction === "right") dE = step;
    if (direction === "left") dE = -step;

    const lat = Number(p.latitude);
    const lng = Number(p.longitude);
    const { dLat, dLng } = metersToDegrees(dN, dE, lat);
    const newLat = lat + dLat;
    const newLng = lng + dLng;

    p.latitude = newLat;
    p.longitude = newLng;
    marker.position = { lat: newLat, lng: newLng };

    // Mirror to the editor inputs if it's currently editing this placement
    if (editingId === selectedId) {
      const latInput = document.getElementById("editorLat");
      const lngInput = document.getElementById("editorLng");
      if (latInput) latInput.value = newLat.toFixed(7);
      if (lngInput) lngInput.value = newLng.toFixed(7);
    }

    // Debounced autosave
    if (nudgeSaveTimer) clearTimeout(nudgeSaveTimer);
    nudgeSaveTimer = window.setTimeout(() => {
      nudgeSaveTimer = null;
      saveNudge(selectedId);
    }, 400);
  }

  /**
   * Persist the latest position of a nudged placement to the server.
   * Sends a full PUT (matching the existing drag-save flow) so all
   * editable fields are preserved.
   *
   * @param {number} placementId
   */
  async function saveNudge(placementId) {
    if (nudgeInFlight) {
      // Another save is in flight — re-schedule this one for after it lands
      nudgeSaveTimer = window.setTimeout(() => saveNudge(placementId), 100);
      return;
    }
    const p = findPlacement(placementId);
    if (!p) return;

    nudgeInFlight = true;
    try {
      const res = await fetch(`/signs/placements/${placementId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify({
          latitude: p.latitude,
          longitude: p.longitude,
          heading: p.heading,
          locationNotes: p.location_notes,
          mountType: p.mount_type,
          markerColor: p.marker_color,
          arrowDirection: p.arrow_direction,
        }),
      });
      const data = await res.json();
      if (!data?.success) {
        console.error("Nudge save rejected:", data?.error);
      }
    } catch (err) {
      console.error("saveNudge error:", err);
    } finally {
      nudgeInFlight = false;
    }
  }

  /**
   * Document-level keyboard handler for arrow-key nudging. Suspended
   * while the offcanvas editor is open or focus is in a form field
   * so typing in inputs doesn't move the marker.
   *
   * @param {KeyboardEvent} e
   */
function onMapKeyDown(e) {
  if (selectedId === null) return;

  // Suspend while editor is open OR focus is in a form field
  const editorEl = document.getElementById("placementEditor");
  const editorOpen = editorEl && editorEl.classList.contains("show");
  if (editorOpen) return;

  const tag = (e.target?.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.target?.isContentEditable) return;

  let dir = null;
  if (e.key === "ArrowUp") dir = "up";
  if (e.key === "ArrowDown") dir = "down";
  if (e.key === "ArrowLeft") dir = "left";
  if (e.key === "ArrowRight") dir = "right";

  if (dir) {
    e.preventDefault();
    nudgeSelected(dir, e.shiftKey);
    return;
  }

  if (e.key === "Escape") {
    e.preventDefault();
    selectMarker(null);
  }
}

  /**
   * Persist a drag-end coordinate change to the server, keeping all other
   * fields the same as the in-memory placement.
   *
   * @param {number} placementId
   * @param {number} lat
   * @param {number} lng
   */
  async function persistDrag(placementId, lat, lng) {
    const p = findPlacement(placementId);
    if (!p) return;

    try {
      const res = await fetch(`/signs/placements/${placementId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify({
          latitude: lat,
          longitude: lng,
          heading: p.heading,
          locationNotes: p.location_notes,
          mountType: p.mount_type,
          markerColor: p.marker_color,
          arrowDirection: p.arrow_direction,
        }),
      });
      const data = await res.json();
      if (data && data.success) {
        p.latitude = lat;
        p.longitude = lng;
        renderPlacementListFromFilters();
      } else {
        window.alert(data?.error || "Failed to save new position.");
        // Snap back if the server rejected it
        const marker = markers.get(placementId);
        if (marker) {
          marker.position = {
            lat: Number(p.latitude),
            lng: Number(p.longitude),
          };
        }
      }
    } catch (err) {
      console.error("persistDrag error:", err);
      window.alert("Network error — could not save new position.");
    }
  }

  /**
   * Convenience: re-render the placement list against the current filters.
   */
  function renderPlacementListFromFilters() {
    applyFilters();
  }

  // ============================================================
  // EDITOR (OFFCANVAS)
  // ============================================================

  /**
   * Render the editor's photo section based on a placement's photo_url.
   * Shows the thumbnail+actions if a photo exists, the drop zone if not.
   * Clears the upload/error states.
   *
   * @param {object|null} placement  Null = clear/reset the section.
   */
  function renderEditorPhoto(placement) {
    const section    = document.getElementById("editorPhotoSection");
    const dropzone   = document.getElementById("editorPhotoDropzone");
    const display    = document.getElementById("editorPhotoDisplay");
    const uploading  = document.getElementById("editorPhotoUploading");
    const errorEl    = document.getElementById("editorPhotoError");
    const thumb      = document.getElementById("editorPhotoThumb");
    if (!section) return;

    if (uploading) uploading.hidden = true;
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }

    if (!placement) {
      // No placement context yet (new placement before save)
      section.hidden = true;
      return;
    }

    section.hidden = false;

    if (placement.photo_url) {
      if (dropzone) dropzone.hidden = true;
      if (display)  display.hidden  = false;
      if (thumb) {
        // Cache-bust so a replaced photo shows the new bytes immediately
        thumb.src = `/signs/placements/${placement.placement_id}/photo?t=${photoCacheBuster}`;
      }
    } else {
      if (dropzone) dropzone.hidden = false;
      if (display)  display.hidden  = true;
    }
  }

  /**
   * Upload a photo file for the currently-editing placement.
   *
   * @param {File} file  Image file from the input element.
   */
  async function uploadEditorPhoto(file) {
    if (editingId === null) {
      // Photos are only allowed on saved placements — new placements
      // must be created (POST) before they can receive a photo.
      showEditorPhotoError("Save the placement first, then add a photo.");
      return;
    }
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      showEditorPhotoError("That doesn't look like an image file.");
      return;
    }
    // Match the server's 12 MB cap; reject early to skip the round trip
    if (file.size > 12 * 1024 * 1024) {
      showEditorPhotoError("Photo is too large (max 12 MB).");
      return;
    }

    setEditorPhotoUploading(true);

    try {
      const fd = new FormData();
      fd.append("photo", file, file.name || "photo.jpg");

      const res = await fetch(
        `/signs/placements/${editingId}/photo`,
        {
          method:  "POST",
          headers: { "CSRF-Token": getCsrfToken() },
          body:    fd,
        },
      );
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "Upload failed.");
      }

      const p = findPlacement(editingId);
      if (p) {
        p.photo_url = data.photo_url;
      }
      photoCacheBuster += 1;
      renderEditorPhoto(p);
    } catch (err) {
      console.error("uploadEditorPhoto error:", err);
      showEditorPhotoError(err.message || "Upload failed.");
    } finally {
      setEditorPhotoUploading(false);
    }
  }

  /**
   * Delete the photo for the currently-editing placement.
   */
  async function deleteEditorPhoto() {
    if (editingId === null) return;
    const p = findPlacement(editingId);
    if (!p?.photo_url) return;

    const confirmed = window.confirm("Remove this photo?");
    if (!confirmed) return;

    setEditorPhotoUploading(true);

    try {
      const res = await fetch(
        `/signs/placements/${editingId}/photo`,
        {
          method:  "DELETE",
          headers: {
            "Content-Type": "application/json",
            "CSRF-Token":   getCsrfToken(),
          },
        },
      );
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "Delete failed.");
      }

      p.photo_url = null;
      photoCacheBuster += 1;
      renderEditorPhoto(p);
    } catch (err) {
      console.error("deleteEditorPhoto error:", err);
      showEditorPhotoError(err.message || "Delete failed.");
    } finally {
      setEditorPhotoUploading(false);
    }
  }

  /**
   * Toggle the photo section's uploading/spinner state.
   *
   * @param {boolean} on
   */
  function setEditorPhotoUploading(on) {
    const uploading = document.getElementById("editorPhotoUploading");
    const dropzone  = document.getElementById("editorPhotoDropzone");
    const display   = document.getElementById("editorPhotoDisplay");
    if (uploading) uploading.hidden = !on;
    // Hide the dropzone/display while uploading so the user can't double-fire
    if (on) {
      if (dropzone) dropzone.hidden = true;
      if (display)  display.hidden  = true;
    }
  }

  /**
   * Show an error message in the photo section.
   *
   * @param {string} msg
   */
  function showEditorPhotoError(msg) {
    const errorEl = document.getElementById("editorPhotoError");
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  /**
   * Open the editor offcanvas for an existing placement.
   * @param {number} placementId
   */
  function openEditor(placementId) {
    const p = findPlacement(placementId);
    if (!p) return;

    editingId = placementId;
    pendingNewLatLng = null;
    clearPendingMarker();

    document.getElementById("placementEditorTitle").textContent =
      `${p.sign_text}${p.arrow_direction && p.arrow_direction !== "destination" && ARROW_GLYPHS[p.arrow_direction] ? " " + ARROW_GLYPHS[p.arrow_direction] : ""}`;

    document.getElementById("editorSignTemplateRow").hidden = true;

    updateEditorPreview(p.sign_text, p.arrow_direction);
    syncEditorArrowPicker(p.arrow_direction || "");

    document.getElementById("editorLat").value = Number(p.latitude).toFixed(7);
    document.getElementById("editorLng").value = Number(p.longitude).toFixed(7);
    document.getElementById("editorMountType").value = p.mount_type || "";
    document.getElementById("editorHeading").value =
      p.heading != null ? Number(p.heading) : "";
    document.getElementById("editorNotes").value = p.location_notes || "";

    const statusInput = document.querySelector(
      `input[name="editorStatus"][value="${p.status}"]`,
    );
    if (statusInput) statusInput.checked = true;

    // Colour swatches — highlight the active one
    const swatches = document.getElementById("editorColorSwatches");
    if (swatches) {
      swatches.querySelectorAll(".signs-color-swatch").forEach((btn) => {
        btn.classList.toggle(
          "active",
          (btn.getAttribute("data-color") || "") === (p.marker_color || ""),
        );
      });
    }

    // Bulk-color button — show for saved placements, include sign name
    const bulkBtn = document.getElementById("editorBulkColorBtn");
    if (bulkBtn) {
      bulkBtn.hidden = false;
      bulkBtn.setAttribute("data-sign-id", String(p.sign_id));
      bulkBtn.textContent = `Apply to all ${p.sign_text} placements`;
    }

    // Meta block
    const meta = document.getElementById("editorMeta");
    if (meta) {
      const parts = [`Created by ${p.created_by || "unknown"}`];
      if (p.installed_by) parts.push(`installed by ${p.installed_by}`);
      meta.textContent = parts.join(" • ");
      meta.hidden = false;
    }

    // Delete button visible for existing placements only
    const delBtn = document.getElementById("editorDeleteBtn");
    if (delBtn) delBtn.hidden = false;

    const feedback = document.getElementById("editorFeedback");
    if (feedback) feedback.textContent = "";

    renderEditorPhoto(p);

    offcanvas?.show();
  }

  /**
   * Open the editor offcanvas for a brand-new placement at the given coords.
   * @param {number} lat
   * @param {number} lng
   */
  function beginNewPlacement(lat, lng) {
    editingId = null;
    pendingNewLatLng = { lat, lng };

    document.getElementById("placementEditorTitle").textContent =
      "New placement";
    document.getElementById("editorSignTemplateRow").hidden = false;
    document.getElementById("editorSignTemplate").value = "";

    updateEditorPreview("—", null);
    syncEditorArrowPicker("");

    document.getElementById("editorLat").value = lat.toFixed(7);
    document.getElementById("editorLng").value = lng.toFixed(7);
    document.getElementById("editorMountType").value = "";
    document.getElementById("editorHeading").value = "";
    document.getElementById("editorNotes").value = "";

    const planned = document.getElementById("editorStatusPlanned");
    if (planned) planned.checked = true;

    const meta = document.getElementById("editorMeta");
    if (meta) {
      meta.textContent = "";
      meta.hidden = true;
    }

    const delBtn = document.getElementById("editorDeleteBtn");
    if (delBtn) delBtn.hidden = true;

    const feedback = document.getElementById("editorFeedback");
    if (feedback) feedback.textContent = "";

    // New placements can't have photos yet — hide the section until saved
    renderEditorPhoto(null);

    // Drop a temporary marker so the user can see where the click landed
    clearPendingMarker();
    if (google.maps.marker) {
      const ghost = document.createElement("div");
      ghost.className = "signs-map-marker signs-map-marker-pending";
      const sign = document.createElement("div");
      sign.className = "sign-preview signs-map-marker-sign";
      const text = document.createElement("span");
      text.className = "sign-preview-text";
      text.textContent = "NEW";
      sign.appendChild(text);
      ghost.appendChild(sign);

      pendingNewMarker = new google.maps.marker.AdvancedMarkerElement({
        map: mapRef,
        position: { lat, lng },
        content: ghost,
        gmpDraggable: true,
      });

      pendingNewMarker.addListener("dragend", () => {
        const pos = pendingNewMarker.position;
        pendingNewLatLng = {
          lat: typeof pos.lat === "function" ? pos.lat() : pos.lat,
          lng: typeof pos.lng === "function" ? pos.lng() : pos.lng,
        };
        document.getElementById("editorLat").value =
          pendingNewLatLng.lat.toFixed(7);
        document.getElementById("editorLng").value =
          pendingNewLatLng.lng.toFixed(7);
      });
    }

    exitPlacingMode();
    offcanvas?.show();
  }

  /**
   * Remove the temporary "new" marker if one exists.
   */
  function clearPendingMarker() {
    if (pendingNewMarker) {
      pendingNewMarker.map = null;
      pendingNewMarker = null;
    }
  }

  /**
   * Toggle on placing-mode: next map click drops a new placement.
   */
  function enterPlacingMode() {
    placingMode = true;
    const help = document.getElementById("addPlacementHelp");
    if (help) help.hidden = false;
    if (mapRef && mapRef.getDiv) {
      mapRef.getDiv().classList.add("signs-map-placing");
    }
  }

  /**
   * Turn placing-mode off.
   */
  function exitPlacingMode() {
    placingMode = false;
    const help = document.getElementById("addPlacementHelp");
    if (help) help.hidden = true;
    if (mapRef && mapRef.getDiv) {
      mapRef.getDiv().classList.remove("signs-map-placing");
    }
  }

  /**
   * Save the editor — POST for a new placement, PUT + PATCH/status for existing.
   */
  async function saveFromEditor() {
    const saveBtn = document.getElementById("editorSaveBtn");
    const feedback = document.getElementById("editorFeedback");
    if (!saveBtn) return;

    const lat = Number(document.getElementById("editorLat").value);
    const lng = Number(document.getElementById("editorLng").value);
    const mountType = document.getElementById("editorMountType").value || null;
    const headingV = document.getElementById("editorHeading").value;
    const heading = headingV === "" ? null : Number(headingV);
    const notes = document.getElementById("editorNotes").value.trim() || null;
    const status =
      document.querySelector('input[name="editorStatus"]:checked')?.value ||
      "planned";
    const arrowDirection =
      document.getElementById("editorArrowDirection")?.value || null;
    const activeSwatch = document.querySelector(
      "#editorColorSwatches .signs-color-swatch.active",
    );
    const markerColor = activeSwatch
      ? activeSwatch.getAttribute("data-color") || null
      : null;

    saveBtn.disabled = true;
    const origLabel = saveBtn.innerHTML;
    saveBtn.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin me-1"></i>Saving…';
    if (feedback) {
      feedback.className = "small text-muted";
      feedback.textContent = "";
    }

    try {
      if (editingId === null) {
        // ---- New placement ----
        const signIdRaw = document.getElementById("editorSignTemplate").value;
        const signId = signIdRaw ? Number(signIdRaw) : null;
        if (!signId) {
          if (feedback) {
            feedback.className = "small text-danger";
            feedback.textContent = "Pick a sign template first.";
          }
          saveBtn.disabled = false;
          saveBtn.innerHTML = origLabel;
          return;
        }

        const res = await fetch(`/signs/${signId}/placements`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "CSRF-Token": getCsrfToken(),
          },
          body: JSON.stringify({
            latitude: lat,
            longitude: lng,
            heading,
            locationNotes: notes,
            status,
            mountType,
            markerColor,
            arrowDirection,
          }),
        });
        const data = await res.json();
        if (!data?.success) throw new Error(data?.error || "Save failed.");

        const sign = findSign(signId);
        const newPlacement = {
          placement_id: data.id,
          sign_id: signId,
          sign_text: sign?.sign_text || "",
          abbreviation: sign?.abbreviation || "",
          arrow_direction: arrowDirection,
          latitude: lat,
          longitude: lng,
          heading,
          location_notes: notes,
          status,
          mount_type: mountType,
          marker_color: markerColor,
          photo_url: null,
          installed_by: status === "installed" ? "you" : null,
          installed_at:
            status === "installed" ? new Date().toISOString() : null,
          removed_at: null,
          created_by: "you",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        placements.push(newPlacement);
        clearPendingMarker();
        addMarkerForPlacement(newPlacement);
      } else {
        // ---- Existing placement: PUT for fields, PATCH for status ----
        const p = findPlacement(editingId);
        if (!p) throw new Error("Placement not found in memory.");

        const putRes = await fetch(`/signs/placements/${editingId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "CSRF-Token": getCsrfToken(),
          },
          body: JSON.stringify({
            latitude: lat,
            longitude: lng,
            heading,
            locationNotes: notes,
            mountType,
            markerColor,
            arrowDirection,
          }),
        });
        const putData = await putRes.json();
        if (!putData?.success)
          throw new Error(putData?.error || "Save failed.");

        if (status !== p.status) {
          const patchRes = await fetch(
            `/signs/placements/${editingId}/status`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "CSRF-Token": getCsrfToken(),
              },
              body: JSON.stringify({ status }),
            },
          );
          const patchData = await patchRes.json();
          if (!patchData?.success)
            throw new Error(patchData?.error || "Status update failed.");
        }

        // Update in-memory and the marker visual
        p.latitude = lat;
        p.longitude = lng;
        p.heading = heading;
        p.location_notes = notes;
        p.status = status;
        p.mount_type = mountType;
        p.marker_color = markerColor;
        p.arrow_direction = arrowDirection;

        const marker = markers.get(editingId);
        if (marker) {
          marker.position = { lat, lng };
          marker.content = buildMarkerContentForLevel(p, currentDetailLevel);
        }
      }

      applyFilters();
      offcanvas?.hide();
    } catch (err) {
      console.error("saveFromEditor error:", err);
      if (feedback) {
        feedback.className = "small text-danger";
        feedback.textContent = err.message || "Save failed.";
      }
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = origLabel;
    }
  }

  /**
   * Delete the placement currently being edited.
   */
  async function deleteFromEditor() {
    if (editingId === null) return;
    const p = findPlacement(editingId);
    if (!p) return;

    const confirmed = window.confirm(
      `Delete this placement of "${p.sign_text}"?\n\n` +
        "The sign template remains intact and can be placed again later.",
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/signs/placements/${editingId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": getCsrfToken(),
        },
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "Delete failed.");

      const marker = markers.get(editingId);
      if (marker) {
        marker.map = null;
        markers.delete(editingId);
      }
      placements = placements.filter((x) => x.placement_id !== editingId);

      applyFilters();
      offcanvas?.hide();
    } catch (err) {
      console.error("deleteFromEditor error:", err);
      window.alert(err.message || "Delete failed.");
    }
  }

  // ============================================================
  // WIRING
  // ============================================================

  /**
   * Wire all DOM event listeners. Called after Maps has loaded.
   */
  function wireUi() {
    // Filters
    document.querySelectorAll('input[name="statusFilter"]').forEach((el) => {
      el.addEventListener("change", applyFilters);
    });
    const tmplEl = document.getElementById("signTemplateFilter");
    if (tmplEl) tmplEl.addEventListener("change", applyFilters);

    // Add placement
    const addBtn = document.getElementById("addPlacementBtn");
    const cancelBtn = document.getElementById("cancelAddBtn");
    if (addBtn) addBtn.addEventListener("click", enterPlacingMode);
    if (cancelBtn) cancelBtn.addEventListener("click", exitPlacingMode);

    // Editor: sign template picker -> live preview
    const tmplSelect = document.getElementById("editorSignTemplate");
    if (tmplSelect) {
      tmplSelect.addEventListener("change", () => {
        const opt = tmplSelect.options[tmplSelect.selectedIndex];
        if (!opt || !opt.value) {
          updateEditorPreview("—", null);
          syncEditorArrowPicker("");
          return;
        }
        const templateArrow = opt.getAttribute("data-arrow") || "";
        updateEditorPreview(
          opt.getAttribute("data-text") || "",
          templateArrow || null,
        );
        // Pre-select the template's default direction; the user can
        // override it before saving.
        syncEditorArrowPicker(templateArrow);
      });
    }

    // Editor buttons
    const saveBtn = document.getElementById("editorSaveBtn");
    const delBtn = document.getElementById("editorDeleteBtn");
    if (saveBtn) saveBtn.addEventListener("click", saveFromEditor);
    if (delBtn) delBtn.addEventListener("click", deleteFromEditor);

    // ---- Photo section wiring ----
    const photoInput     = document.getElementById("editorPhotoInput");
    const photoChooseBtn = document.getElementById("editorPhotoChooseBtn");
    const photoReplaceBtn = document.getElementById("editorPhotoReplaceBtn");
    const photoDeleteBtn = document.getElementById("editorPhotoDeleteBtn");
    const photoDropzone  = document.getElementById("editorPhotoDropzone");

    if (photoChooseBtn && photoInput) {
      photoChooseBtn.addEventListener("click", () => photoInput.click());
    }
    if (photoReplaceBtn && photoInput) {
      photoReplaceBtn.addEventListener("click", () => photoInput.click());
    }
    if (photoInput) {
      photoInput.addEventListener("change", () => {
        const file = photoInput.files?.[0];
        if (file) uploadEditorPhoto(file);
        // Reset so picking the same file twice still fires change
        photoInput.value = "";
      });
    }
    if (photoDeleteBtn) {
      photoDeleteBtn.addEventListener("click", deleteEditorPhoto);
    }

    // Drag-and-drop onto the dropzone
    if (photoDropzone) {
      ["dragenter", "dragover"].forEach((ev) => {
        photoDropzone.addEventListener(ev, (e) => {
          e.preventDefault();
          e.stopPropagation();
          photoDropzone.classList.add("signs-photo-dropzone-active");
        });
      });
      ["dragleave", "drop"].forEach((ev) => {
        photoDropzone.addEventListener(ev, (e) => {
          e.preventDefault();
          e.stopPropagation();
          photoDropzone.classList.remove("signs-photo-dropzone-active");
        });
      });
      photoDropzone.addEventListener("drop", (e) => {
        const file = e.dataTransfer?.files?.[0];
        if (file) uploadEditorPhoto(file);
      });
    }

    // Colour swatch clicks — toggle active class
    const swatches = document.getElementById("editorColorSwatches");
    if (swatches) {
      swatches.addEventListener("click", (e) => {
        const btn = e.target.closest(".signs-color-swatch");
        if (!btn) return;
        swatches.querySelectorAll(".signs-color-swatch").forEach((s) => {
          s.classList.remove("active");
        });
        btn.classList.add("active");
      });
    }

    // Bulk-color button
    const bulkColorBtn = document.getElementById("editorBulkColorBtn");
    if (bulkColorBtn) {
      bulkColorBtn.addEventListener("click", async () => {
        const signId = Number(bulkColorBtn.getAttribute("data-sign-id"));
        if (!signId) return;

        const activeSwatch = document.querySelector(
          "#editorColorSwatches .signs-color-swatch.active",
        );
        const color = activeSwatch
          ? activeSwatch.getAttribute("data-color") || null
          : null;
        const colorLabel = color || "default (status)";
        const signName = bulkColorBtn.textContent.replace(
          "Apply to all ",
          "",
        ).replace(" placements", "");

        const ok = window.confirm(
          `Set marker colour to "${colorLabel}" on all placements of "${signName}"?`,
        );
        if (!ok) return;

        try {
          const res = await fetch(`/signs/${signId}/placements/color`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "CSRF-Token": getCsrfToken(),
            },
            body: JSON.stringify({ markerColor: color }),
          });
          const data = await res.json();
          if (!data?.success) throw new Error(data?.error || "Bulk update failed.");

          // Update all in-memory placements + rebuild their markers
          placements.forEach((p) => {
            if (p.sign_id === signId) {
              p.marker_color = color;
              const marker = markers.get(p.placement_id);
              if (marker) {
                const newContent = buildMarkerContentForLevel(p, currentDetailLevel);
                if (selectedId === p.placement_id) {
                  newContent.classList.add("signs-map-marker-selected");
                }
                marker.content = newContent;
              }
            }
          });
        } catch (err) {
          console.error("bulkSetColor error:", err);
          window.alert(err.message || "Bulk update failed.");
        }
      });
    }

    // Arrow picker in the offcanvas editor — same click-to-toggle
    // behaviour as the Sign Builder, driving a hidden input.
    const arrowRow = document.getElementById("editorArrowRow");
    if (arrowRow) {
      arrowRow.addEventListener("click", (e) => {
        const btn = e.target.closest(".arrow-btn");
        if (!btn) return;
        const dir = btn.getAttribute("data-arrow") || "";
        const input = document.getElementById("editorArrowDirection");
        if (!input) return;

        // Toggle off if clicking the already-active direction
        if (dir && dir === input.value) {
          input.value = "";
        } else {
          input.value = dir;
        }
        syncEditorArrowPicker(input.value);
        // Update the sign preview so the user sees the arrow change
        const textEl = document.getElementById("editorPreviewText");
        updateEditorPreview(textEl?.textContent || "", input.value || null);
      });
    }

    // Placement list row click -> open editor
    const list = document.getElementById("placementList");
    if (list) {
      list.addEventListener("click", (e) => {
        const row = e.target.closest(".signs-placement-row");
        if (!row) return;
        const id = Number(row.getAttribute("data-placement-id"));
        if (id) openEditor(id);
      });
    }

    // Reset pending-marker / editing state when the editor is dismissed
    const editorEl = document.getElementById("placementEditor");
    if (editorEl) {
      editorEl.addEventListener("hidden.bs.offcanvas", () => {
        clearPendingMarker();
        editingId = null;
        pendingNewLatLng = null;
      });
    }

    // Offcanvas instance
    if (window.bootstrap && editorEl) {
      offcanvas = window.bootstrap.Offcanvas.getOrCreateInstance(editorEl);
    }

    // Global keyboard listener for arrow-key nudging of the selected marker.
    // The handler self-suspends while the editor is open or focus is in a
    // form field so typing doesn't move the marker.
    //
    // useCapture=true is critical here: Google Maps' internal DOM captures
    // keyboard events on its container and stops their propagation, so
    // bubble-phase listeners on document never see them. Capture phase
    // runs on the way DOWN the tree (before Maps' handler), giving us
    // first crack at the event.
    document.addEventListener("keydown", onMapKeyDown, true);
  }

  // ============================================================
  // BOOTSTRAP
  // ============================================================

  /**
   * Read server-rendered JSON, then load and initialize the map.
   */
  function bootstrap() {
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
        placements = Array.isArray(parsed.placements) ? parsed.placements : [];
      } catch (err) {
        console.error("Failed to parse signsMapBootstrap JSON:", err);
      }
    }

    wireUi();
    renderPlacementList(placements);

    if (!apiKey) {
      // The EJS shows the missing-key message; nothing else to do here.
      return;
    }

    loadGoogleMaps(apiKey)
      .then(() =>
        initMap({
          lat: Number.isFinite(centerLat) ? centerLat : 42.6485,
          lng: Number.isFinite(centerLng) ? centerLng : -73.749,
          zoom: centerZoom,
        }),
      )
      .catch((err) => {
        console.error(err);
        const mapEl = document.getElementById("googleMap");
        if (mapEl) {
          mapEl.replaceChildren();
          const msg = document.createElement("p");
          msg.className = "text-center text-danger p-4 mb-0";
          msg.textContent =
            "Failed to load Google Maps. Check the API key and browser console.";
          mapEl.appendChild(msg);
        }
      });
  }

  document.addEventListener("DOMContentLoaded", bootstrap);
})();
