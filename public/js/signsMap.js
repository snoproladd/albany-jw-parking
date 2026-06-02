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

  /**
   * Length of the direction-of-travel arrow handle extending from the
   * center of a full marker, in CSS pixels. Only rendered at full detail.
   */
  const TRAVEL_HANDLE_LENGTH = 100;

  /**
   * Distance to offset the Street View panorama position behind the sign,
   * along the opposite of the direction of travel. Gives the viewer the
   * perspective of an approaching driver.
   */
  const SV_APPROACH_DISTANCE_METERS = 20;

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

  // ── Hover tooltip ──────────────────────────────────────────────────

  /**
   * The single shared tooltip DOM element. Positioned absolutely over the
   * map container and shown/hidden via class. Built once in wireUi().
   * @type {HTMLElement|null}
   */
  let tooltipEl = null;

  /**
   * Placement id currently shown in the tooltip, or null if hidden.
   * Used to skip redundant DOM updates when the same marker re-triggers
   * mouseenter (e.g. on compact↔full swap).
   * @type {number|null}
   */
  let tooltipForId = null;

  /**
   * setTimeout handle used to delay hiding the tooltip briefly after
   * mouseleave so the user can move between the marker and tooltip
   * without it flickering out.
   * @type {number|null}
   */
  let tooltipHideTimer = null;

  // ── Context menu ────────────────────────────────────────────────────

  /**
   * The single shared context-menu DOM element, built once in wireUi().
   * @type {HTMLElement|null}
   */
  let ctxMenuEl = null;

  /**
   * The placement_id the context menu is currently shown for, or null.
   * @type {number|null}
   */
  let ctxMenuForId = null;

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

  /** @type {google.maps.StreetViewPanorama|null} Active Street View panorama, or null when closed. */
  let streetViewPanorama = null;

  /** placement_id the Street View overlay is currently showing, or null. */
  let streetViewForId = null;

  // ── Direction-of-travel handle drag ────────────────────────────────

  /**
   * placement_id currently being rotated via the travel-direction handle,
   * or null when no drag is in progress.
   * @type {number|null}
   */
  let travelDragId = null;

  /**
   * Bounding rect of the marker wrapper at the moment a travel-handle
   * drag begins. Cached so pointermove doesn't need to call
   * getBoundingClientRect() on every event.
   * @type {DOMRect|null}
   */
  let travelDragMarkerRect = null;

  /**
   * The handle DOM element being dragged, kept so we can remove its
   * drag-active class on pointerup even if the pointer leaves the element.
   * @type {HTMLElement|null}
   */
  let travelDragHandleEl = null;

  /** Can the current user manage placements (drag/save/delete)? */
  let canManage = false;

  /**
   * True when the primary input is a coarse pointer (touch screen).
   * Set once at bootstrap() and used to branch between the info-sheet
   * tap flow (mobile) and the direct-to-editor click flow (desktop).
   * @type {boolean}
   */
  let isTouchDevice = false;

  // ── Info sheet ──────────────────────────────────────────────────────

  /**
   * The placement_id the info sheet is currently showing, or null.
   * @type {number|null}
   */
  let infoSheetForId = null;

  /**
   * True while the info sheet open/close CSS transition is in progress.
   * Guards against double-taps and rapid open/close sequences.
   * @type {boolean}
   */
  let infoSheetTransitioning = false;

  /**
   * Touch Y-position (clientY) at the start of a swipe-to-dismiss gesture
   * on the info sheet. Null when no swipe is in progress.
   * @type {number|null}
   */
  let infoSheetSwipeStartY = null;

  /**
   * Current swipe offset in pixels (positive = dragging downward).
   * Applied as a live translateY so the sheet follows the finger.
   * @type {number}
   */
  let infoSheetSwipeDelta = 0;

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
   * Build the direction-of-travel arrow handle DOM element for a full
   * marker. The handle is a thin stem + arrowhead extending TRAVEL_HANDLE_LENGTH
   * px upward from the marker center, then rotated to match the bearing.
   *
   * The element is absolutely positioned relative to the marker wrapper.
   * Bearing 0° = north = pointing straight up = no rotation needed.
   * CSS rotate() increases clockwise, matching compass convention.
   *
   * The handle is interactive only for canManage users — pointerdown on
   * it starts a drag-to-rotate session (see attachTravelHandleListeners).
   *
   * @param {object} placement
   * @returns {HTMLDivElement}
   */
  /**
   * Build the direction-of-travel arrow handle DOM element for a full marker.
   *
   * Uses an inline SVG so the arrow can be painted with a white outline
   * stroke behind a colored fill stroke — the same high-contrast technique
   * Windows cursor files use. This makes the shape readable on any map
   * tile (asphalt, grass, snow, rooftop) without knowing the background.
   *
   * The SVG path draws a vertical stem from the marker center upward, with
   * a triangular arrowhead at the tip. The path is stroked twice:
   *   1. A wider white stroke (painted first, acts as an outline/halo).
   *   2. A narrower colored stroke on top.
   *
   * The handle wrapper is rotated via inline transform to match the bearing.
   * Bearing 0° = north = arrow pointing straight up = no rotation.
   *
   * @param {object} placement
   * @returns {HTMLDivElement}
   */
  function buildTravelHandle(placement) {
    const hasHeading =
      placement.heading !== null &&
      placement.heading !== undefined &&
      placement.heading !== "";
    const bearing = hasHeading ? Number(placement.heading) : 0;

    const handle = document.createElement("div");
    handle.className = "signs-map-travel-handle";
    if (!hasHeading) handle.classList.add("signs-map-travel-handle-unset");
    handle.setAttribute("data-placement-id", String(placement.placement_id));
    handle.style.setProperty("--travel-bearing", `${bearing}deg`);

    // SVG dimensions: the arrow extends 100px upward from the origin.
    // We give the canvas a little horizontal breathing room (24px wide,
    // centered on the axis) so the arrowhead and outline don't clip.
    // The SVG origin (0,0) sits at the bottom-center of the canvas,
    // which aligns with the marker center via CSS positioning.
    //
    // Path breakdown (all coords relative to the SVG viewBox):
    //   M 12,100  — start at the bottom-center (origin)
    //   L 12,18   — draw the stem upward, stopping below the arrowhead
    //   M 2,22    — move to the left base of the arrowhead
    //   L 12,2    — draw the left side up to the tip
    //   L 22,22   — draw the right side back down
    //   Z         — close the triangle (base implied by fill)
    //
    // Using stroke-only (fill:none) for the arrowhead so the double-stroke
    // outline trick works uniformly across the whole shape. The triangle
    // is open at the base — the stem connects to it visually.
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 102");
    svg.setAttribute("width", "24");
    svg.setAttribute("height", "102");
    svg.setAttribute("aria-hidden", "true");
    svg.className.baseVal = "signs-map-travel-svg";

    const pathD = "M 12,101 L 12,20 M 3,24 L 12,3 L 21,24";

    // White outline stroke — painted first so it sits behind the color
    const outline = document.createElementNS(ns, "path");
    outline.setAttribute("d", pathD);
    outline.setAttribute("stroke", "white");
    outline.setAttribute("stroke-width", "5");
    outline.setAttribute("stroke-linecap", "round");
    outline.setAttribute("stroke-linejoin", "round");
    outline.setAttribute("fill", "none");
    outline.className.baseVal = "signs-map-travel-outline";
    svg.appendChild(outline);

    // Colored foreground stroke — painted on top of the white outline
    const fg = document.createElementNS(ns, "path");
    fg.setAttribute("d", pathD);
    fg.setAttribute("stroke-linecap", "round");
    fg.setAttribute("stroke-linejoin", "round");
    fg.setAttribute("fill", "none");
    fg.className.baseVal = "signs-map-travel-fg";
    svg.appendChild(fg);

    handle.appendChild(svg);
    return handle;
  }

  /**
   * Build the inner HTML for a sign-preview block used as a marker.
   * The destination pin uses a FontAwesome icon; other arrows use Unicode.
   * At full detail, a direction-of-travel arrow handle is appended when
   * canManage is true or when a direction is already set.
   *
   * @param {{ sign_text: string, arrow_direction: string|null, status: string, heading: number|null }} placement
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

    // Travel-direction handle — show when the user can manage (so they
    // can drag to set it) or when a direction is already stored (so
    // view-only users can see which way traffic flows).
    const hasHeading =
      placement.heading !== null &&
      placement.heading !== undefined &&
      placement.heading !== "";
    if (canManage || hasHeading) {
      wrapper.appendChild(buildTravelHandle(placement));
    }

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
      attachMarkerHoverListeners(p.placement_id, marker);
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
  // TOOLTIP
  // ============================================================

  /**
   * Populate and position the hover tooltip for a placement.
   *
   * The tooltip is absolutely positioned relative to the map canvas
   * (#googleMap). We read the marker's content element's bounding rect
   * and offset it by the map container's rect so the tooltip floats
   * just above the marker regardless of where the map sits on the page.
   *
   * @param {number} placementId
   * @param {HTMLElement} markerContent  The marker's .content element.
   */
  function showTooltip(placementId, markerContent) {
    if (!tooltipEl) return;
    if (tooltipHideTimer) {
      clearTimeout(tooltipHideTimer);
      tooltipHideTimer = null;
    }
    // Skip DOM rebuild if it's already showing for this placement
    if (tooltipForId === placementId && !tooltipEl.classList.contains("d-none")) {
      return;
    }

    const p = findPlacement(placementId);
    if (!p) return;
    tooltipForId = placementId;

    // ── Build content ────────────────────────────────────────────────

    tooltipEl.replaceChildren();

    // Header row: sign preview + status badge
    const header = document.createElement("div");
    header.className = "signs-tooltip-header";

    const preview = document.createElement("div");
    preview.className = "sign-preview signs-tooltip-preview";
    const previewText = document.createElement("span");
    previewText.className = "sign-preview-text";
    previewText.textContent = p.sign_text || "";
    preview.appendChild(previewText);

    if (p.arrow_direction) {
      const arrowSpan = document.createElement("span");
      arrowSpan.className = "sign-preview-arrow";
      if (p.arrow_direction === "destination") {
        const icon = document.createElement("i");
        icon.className = "fa-solid fa-location-dot";
        icon.setAttribute("aria-hidden", "true");
        arrowSpan.appendChild(icon);
      } else if (ARROW_GLYPHS[p.arrow_direction]) {
        arrowSpan.textContent = ARROW_GLYPHS[p.arrow_direction];
      }
      preview.appendChild(arrowSpan);
    }
    header.appendChild(preview);

    const statusBadge = document.createElement("span");
    statusBadge.className = `signs-tooltip-status signs-tooltip-status-${p.status || "planned"}`;
    statusBadge.textContent = p.status
      ? p.status.charAt(0).toUpperCase() + p.status.slice(1)
      : "Planned";
    header.appendChild(statusBadge);
    tooltipEl.appendChild(header);

    // Detail rows
    const details = document.createElement("dl");
    details.className = "signs-tooltip-details";

    /**
     * Append a dt/dd pair to the details list.
     * @param {string} label
     * @param {string|Node} value
     */
    const addDetail = (label, value) => {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      if (typeof value === "string") {
        dd.textContent = value;
      } else {
        dd.appendChild(value);
      }
      details.appendChild(dt);
      details.appendChild(dd);
    };

    if (p.mount_type) {
      addDetail("Mount", MOUNT_LABELS[p.mount_type] || p.mount_type);
    }
    if (p.location_notes) {
      addDetail("Notes", p.location_notes);
    }

    const coordText = `${Number(p.latitude).toFixed(5)}, ${Number(p.longitude).toFixed(5)}`;
    addDetail("Coords", coordText);

    tooltipEl.appendChild(details);

    // Thumbnail — only if the placement has a photo
    if (p.photo_url) {
      const imgWrap = document.createElement("div");
      imgWrap.className = "signs-tooltip-thumb-wrap";
      const img = document.createElement("img");
      img.className = "signs-tooltip-thumb";
      img.alt = "Sign placement photo";
      img.src = `/signs/placements/${p.placement_id}/photo?t=${photoCacheBuster}`;
      imgWrap.appendChild(img);
      tooltipEl.appendChild(imgWrap);
    }

    // ── Position ─────────────────────────────────────────────────────

    tooltipEl.classList.remove("d-none");

    /**
     * Position the tooltip using fixed viewport coordinates from the
     * marker's bounding rect. Called once immediately (before image load,
     * for text-only placements) and again after any thumbnail loads so
     * the taller tooltip re-anchors correctly.
     */
    const positionTooltip = () => {
      const markerRect = markerContent.getBoundingClientRect();
      const MARGIN = 8;
      const EDGE_PAD = 6;
      const vpW = window.innerWidth;
      const vpH = window.innerHeight;

      const tipW = tooltipEl.offsetWidth;
      const tipH = tooltipEl.offsetHeight;

      // Prefer above the marker; fall back to below if it clips the top
      let top = markerRect.top - tipH - MARGIN;
      if (top < EDGE_PAD) {
        top = markerRect.bottom + MARGIN;
      }

      // Centre horizontally on the marker, clamped to viewport
      let left = markerRect.left + markerRect.width / 2 - tipW / 2;
      left = Math.max(EDGE_PAD, Math.min(left, vpW - tipW - EDGE_PAD));

      // If showing below also clips the bottom, just pin to bottom edge
      if (top + tipH > vpH - EDGE_PAD) {
        top = vpH - tipH - EDGE_PAD;
      }

      tooltipEl.style.top  = `${top}px`;
      tooltipEl.style.left = `${left}px`;
    };

    positionTooltip();

    // Re-position after the thumbnail loads — it adds height to the tooltip
    // and the initial measurement won't have accounted for it yet.
    const img = tooltipEl.querySelector(".signs-tooltip-thumb");
    if (img) {
      img.addEventListener("load",  positionTooltip, { once: true });
      img.addEventListener("error", positionTooltip, { once: true });
    }
  }

  /**
   * Hide the tooltip after a short delay. The delay lets the user move
   * the cursor from the marker to the tooltip itself without it vanishing.
   *
   * @param {boolean} [immediate=false]  Skip the delay and hide right away.
   */
  function hideTooltip(immediate = false) {
    if (immediate) {
      if (tooltipHideTimer) {
        clearTimeout(tooltipHideTimer);
        tooltipHideTimer = null;
      }
      if (tooltipEl) tooltipEl.classList.add("d-none");
      tooltipForId = null;
      return;
    }
    tooltipHideTimer = window.setTimeout(() => {
      tooltipHideTimer = null;
      if (tooltipEl) tooltipEl.classList.add("d-none");
      tooltipForId = null;
    }, 200);
  }

  // ============================================================
  // CONTEXT MENU
  // ============================================================

  /**
   * Build and show the right-click context menu for a placement.
   *
   * The menu is a fixed-position element (not inside #googleMap, so it is
   * unaffected by the Google Maps CSS reset block). It is created once in
   * wireUi() and its contents are replaced on each invocation.
   *
   * @param {number} placementId
   * @param {number} clientX  Mouse X from the contextmenu event.
   * @param {number} clientY  Mouse Y from the contextmenu event.
   */
  function showContextMenu(placementId, clientX, clientY) {
    if (!ctxMenuEl) return;
    const p = findPlacement(placementId);
    if (!p) return;

    ctxMenuForId = placementId;
    hideTooltip(true);
    ctxMenuEl.replaceChildren();

    /**
     * Append a menu item button.
     * @param {string}   icon     FontAwesome class string.
     * @param {string}   label    Display text.
     * @param {Function} onClick  Click handler.
     * @param {string}   [cls]    Optional extra CSS class on the button.
     */
    const addItem = (icon, label, onClick, cls = "") => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `signs-ctx-item${cls ? " " + cls : ""}`;
      const iconEl = document.createElement("i");
      iconEl.className = icon;
      iconEl.setAttribute("aria-hidden", "true");
      btn.appendChild(iconEl);
      btn.appendChild(document.createTextNode(" " + label));
      btn.addEventListener("click", () => {
        dismissContextMenu();
        onClick();
      });
      ctxMenuEl.appendChild(btn);
    };

    /**
     * Append a visual divider.
     */
    const addDivider = () => {
      const hr = document.createElement("hr");
      hr.className = "signs-ctx-divider";
      ctxMenuEl.appendChild(hr);
    };

    // ── Menu items ───────────────────────────────────────────────────

    // Edit — always available
    addItem("fa-solid fa-pen", "Edit", () => {
      selectMarker(placementId);
      openEditor(placementId);
    });

    // View photo — only when a photo exists
    if (p.photo_url) {
      addItem("fa-solid fa-image", "View photo", () => {
        openPhotoLightbox(placementId);
      });
    }

    if (canManage) {
      addDivider();

      // Mark status submenu items — skip the current status
      const statusItems = [
        { status: "planned",   icon: "fa-solid fa-circle-dot",   label: "Mark as Planned"   },
        { status: "installed", icon: "fa-solid fa-circle-check",  label: "Mark as Installed" },
        { status: "removed",   icon: "fa-solid fa-circle-xmark",  label: "Mark as Removed"   },
      ];
      statusItems.forEach(({ status, icon, label }) => {
        if (status === p.status) return; // skip current
        addItem(icon, label, () => quickSetStatus(placementId, status));
      });

      addDivider();
    }

    // Street View — opens the Street View overlay
    addItem("fa-solid fa-street-view", "View in Street View", () => {
      openStreetView(placementId);
    });

    // Get directions — opens Google Maps in a new tab
    addItem("fa-solid fa-diamond-turn-right", "Get directions", () => {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`;
      window.open(url, "_blank", "noopener,noreferrer");
    });

    // Copy coordinates
    addItem("fa-solid fa-copy", "Copy coordinates", () => {
      const text = `${Number(p.latitude).toFixed(7)}, ${Number(p.longitude).toFixed(7)}`;
      navigator.clipboard.writeText(text).catch(() => {
        // Fallback for older browsers / non-secure contexts
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      });
    });

    if (canManage) {
      addDivider();

      addItem("fa-solid fa-trash", "Delete placement", () => {
        // Re-use the existing delete flow; open the editor silently
        // then call delete (editor opens briefly — keep it seamless).
        openEditor(placementId);
        // Slight delay so the offcanvas finishes opening before we fire
        // the delete, which calls its own confirm dialog.
        window.setTimeout(() => deleteFromEditor(), 120);
      }, "signs-ctx-item-danger");
    }

    // ── Position ─────────────────────────────────────────────────────

    ctxMenuEl.classList.remove("d-none");

    const EDGE_PAD = 8;
    const menuW = ctxMenuEl.offsetWidth;
    const menuH = ctxMenuEl.offsetHeight;
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;

    let x = clientX + 2;
    let y = clientY + 2;
    if (x + menuW > vpW - EDGE_PAD) x = clientX - menuW - 2;
    if (y + menuH > vpH - EDGE_PAD) y = clientY - menuH - 2;
    x = Math.max(EDGE_PAD, x);
    y = Math.max(EDGE_PAD, y);

    ctxMenuEl.style.left = `${x}px`;
    ctxMenuEl.style.top  = `${y}px`;
  }

  /**
   * Hide and clear the context menu.
   */
  function dismissContextMenu() {
    if (!ctxMenuEl) return;
    ctxMenuEl.classList.add("d-none");
    ctxMenuForId = null;
  }

  /**
   * Quick-set placement status from the context menu without opening the
   * full editor. Sends the PATCH /status request and updates in-memory +
   * marker visual on success.
   *
   * @param {number} placementId
   * @param {'planned'|'installed'|'removed'} newStatus
   */
  async function quickSetStatus(placementId, newStatus) {
    const p = findPlacement(placementId);
    if (!p) return;

    try {
      const res = await fetch(`/signs/placements/${placementId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "Status update failed.");

      p.status = newStatus;

      const marker = markers.get(placementId);
      if (marker) {
        const newContent = buildMarkerContentForLevel(p, currentDetailLevel);
        if (selectedId === placementId) {
          newContent.classList.add("signs-map-marker-selected");
        }
        marker.content = newContent;
        // Re-attach tooltip and context-menu listeners to the new content
        attachMarkerHoverListeners(placementId, marker);
      }
      applyFilters();
    } catch (err) {
      console.error("quickSetStatus error:", err);
      window.alert(err.message || "Failed to update status.");
    }
  }

  /**
   * Open a simple lightbox overlay to view the full-size placement photo.
   * Clicking the overlay or pressing Escape dismisses it.
   *
   * @param {number} placementId
   */
  function openPhotoLightbox(placementId) {
    const existing = document.getElementById("signsPhotoLightbox");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "signsPhotoLightbox";
    overlay.className = "signs-lightbox";

    const img = document.createElement("img");
    img.className = "signs-lightbox-img";
    img.alt = "Sign placement photo";
    img.src = `/signs/placements/${placementId}/photo?t=${photoCacheBuster}`;
    overlay.appendChild(img);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "signs-lightbox-close";
    closeBtn.setAttribute("aria-label", "Close photo");
    const closeIcon = document.createElement("i");
    closeIcon.className = "fa-solid fa-xmark";
    closeIcon.setAttribute("aria-hidden", "true");
    closeBtn.appendChild(closeIcon);
    overlay.appendChild(closeBtn);

    const dismiss = () => overlay.remove();
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) dismiss();
    });
    closeBtn.addEventListener("click", dismiss);

    const onKey = (e) => {
      if (e.key === "Escape") {
        dismiss();
        document.removeEventListener("keydown", onKey, true);
      }
    };
    document.addEventListener("keydown", onKey, true);

    document.body.appendChild(overlay);
  }

  // ============================================================
  // STREET VIEW
  // ============================================================

  /**
   * Open the Street View modal overlay for a placement.
   *
   * Creates a StreetViewPanorama pointed at the placement's coordinates.
   * If a heading is stored on the placement it is used as the initial
   * camera bearing; otherwise the panorama opens facing north (0°) and
   * a hint prompts the user to rotate manually.
   *
   * The panorama is destroyed (not just hidden) when the overlay closes
   * so Google's internal event listeners don't leak between sessions.
   *
   * @param {number} placementId
   */
  function openStreetView(placementId) {
    const p = findPlacement(placementId);
    if (!p) return;

    streetViewForId = placementId;

    const overlay  = document.getElementById("streetViewOverlay");
    const pane     = document.getElementById("streetViewPane");
    const titleEl  = document.getElementById("svTitle");
    const badgeEl  = document.getElementById("svHeadingBadge");
    const hintEl   = document.getElementById("svHeadingHint");
    const noImgEl  = document.getElementById("svNoImageryMsg");
    const mapsLink = document.getElementById("svGoogleMapsLink");
    if (!overlay || !pane) return;

    // ── Populate header ───────────────────────────────────────────────
    const arrowGlyph =
      p.arrow_direction && p.arrow_direction !== "destination" && ARROW_GLYPHS[p.arrow_direction]
        ? " " + ARROW_GLYPHS[p.arrow_direction]
        : "";
    if (titleEl) titleEl.textContent = (p.sign_text || "Placement") + arrowGlyph;

    const hasHeading = p.heading !== null && p.heading !== undefined && p.heading !== "";
    const travelBearing = hasHeading ? Number(p.heading) : 0;

    if (badgeEl) {
      if (hasHeading) {
        badgeEl.textContent = `${Math.round(travelBearing)}° direction of travel`;
        badgeEl.classList.remove("d-none");
      } else {
        badgeEl.classList.add("d-none");
      }
    }
    if (hintEl) {
      hintEl.classList.toggle("d-none", hasHeading);
    }

    // ── Compute approach position ────────────────────────────────────
    // Stand SV_APPROACH_DISTANCE_METERS behind the sign along the
    // opposite of the travel direction, then look forward (travelBearing).
    // If no heading is set, position = the placement itself.
    let svLat = Number(p.latitude);
    let svLng = Number(p.longitude);

    if (hasHeading) {
      const backBearing = (travelBearing + 180) % 360;
      const metersN = SV_APPROACH_DISTANCE_METERS * Math.cos((backBearing * Math.PI) / 180);
      const metersE = SV_APPROACH_DISTANCE_METERS * Math.sin((backBearing * Math.PI) / 180);
      const { dLat, dLng } = metersToDegrees(metersN, metersE, svLat);
      svLat += dLat;
      svLng += dLng;
    }

    // ── Reset no-imagery footer ───────────────────────────────────────
    if (noImgEl) noImgEl.classList.add("d-none");
    if (mapsLink) {
      mapsLink.href = `https://www.google.com/maps/@${svLat},${svLng},3a,75y,${Math.round(travelBearing)}h,85t/data=!3m1!1e1`;
    }

    // ── Show overlay ──────────────────────────────────────────────────
    overlay.classList.remove("d-none");
    // requestAnimationFrame defers the opacity transition start until
    // the browser has painted the initial d-none removal, ensuring the
    // CSS fade-in actually fires.
    requestAnimationFrame(() => overlay.classList.add("signs-sv-overlay-visible"));

    // ── Destroy any previous panorama before creating a new one ──────
    if (streetViewPanorama) {
      streetViewPanorama.setVisible(false);
      streetViewPanorama = null;
    }

    // ── Create panorama ───────────────────────────────────────────────
    // Position the camera at the approach point (behind the sign).
    // POV heading = direction of travel so the camera looks toward the sign.
    streetViewPanorama = new google.maps.StreetViewPanorama(pane, {
      position: { lat: svLat, lng: svLng },
      pov: {
        heading: travelBearing,
        pitch: -5,
      },
      zoom: 0,
      addressControl: false,
      fullscreenControl: false,
      motionTrackingControl: false,
      showRoadLabels: true,
      linksControl: true,
    });

    // ── No-imagery fallback ───────────────────────────────────────────
    streetViewPanorama.addListener("status_changed", () => {
      if (streetViewPanorama.getStatus() !== google.maps.StreetViewStatus.OK) {
        if (noImgEl) noImgEl.classList.remove("d-none");
      }
    });

    // Focus the close button so keyboard users can dismiss immediately
    document.getElementById("streetViewCloseBtn")?.focus();
  }

  /**
   * Close the Street View overlay and release the panorama.
   */
  function closeStreetView() {
    const overlay = document.getElementById("streetViewOverlay");
    if (!overlay) return;

    overlay.classList.remove("signs-sv-overlay-visible");

    // Wait for the CSS fade-out to finish before hiding the element so
    // the transition plays out before the element disappears from layout.
    const onTransitionEnd = () => {
      overlay.classList.add("d-none");
      overlay.removeEventListener("transitionend", onTransitionEnd);
    };
    overlay.addEventListener("transitionend", onTransitionEnd);

    if (streetViewPanorama) {
      streetViewPanorama.setVisible(false);
      streetViewPanorama = null;
    }
    streetViewForId = null;
  }

  // ============================================================
  // MAP LIFECYCLE

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
  streetViewControl: true, // Phase 3 wires this up properly
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

    // Belt-and-suspenders: if isTouchDevice is true (or becomes true after
    // a DevTools switch), forcibly disable dragging on every marker now
    // that they've all been constructed. gmpDraggable can be set post-
    // construction on AdvancedMarkerElement.
    if (isTouchDevice) {
      markers.forEach((marker) => {
        marker.gmpDraggable = false;
      });
    }

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
      // Dragging is desktop-only — touch users can accidentally reposition
      // a sign while panning the map, and there's no undo. On touch they
      // edit coordinates via the editor form instead.
      gmpDraggable: canManage && !isTouchDevice,
      title: placement.sign_text,
    });

    marker.addListener("gmp-click", () => {
      selectMarker(placement.placement_id);
      showInfoSheet(placement.placement_id);
    });

    attachMarkerHoverListeners(placement.placement_id, marker);

    if (canManage) {
      // gmp-dragend fires after a user finishes dragging the marker.
      // Keep keyboard selection on this marker so the user can continue
      // nudging with arrow keys without re-clicking it first. Mark the
      // drag-end timestamp synchronously (before the await) so the
      // 300ms guard in the map-click handler catches any synthetic click
      // that fires immediately after dragend.
      marker.addListener("dragend", async () => {
        lastDragEndAt = Date.now();
        // If we're on a touch device (DevTools emulation or real),
        // snap the marker back immediately and bail. persistDrag also
        // has this guard, but snapping here avoids the async round-trip.
        if (isTouchDevice) {
          const p = findPlacement(placement.placement_id);
          if (p) {
            marker.position = {
              lat: Number(p.latitude),
              lng: Number(p.longitude),
            };
          }
          return;
        }
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
   * Attach mouseenter/mouseleave/contextmenu listeners to a marker's
   * current content element. Must be called whenever marker.content is
   * replaced (detail-level swap, status change, color change) so the
   * tooltip and context menu keep working on the new DOM node.
   *
   * @param {number}                                   placementId
   * @param {google.maps.marker.AdvancedMarkerElement} marker
   */
  function attachMarkerHoverListeners(placementId, marker) {
    const el = marker.content;
    if (!el) return;

    el.addEventListener("mouseenter", (e) => {
      // Don't show the tooltip when the pointer enters via the travel-
      // direction handle — the handle needs to stay unobstructed for
      // dragging. relatedTarget is the element the pointer came FROM;
      // we also check the target itself in case the event fires directly
      // on the handle rather than bubbling from it.
      const handle = el.querySelector(".signs-map-travel-handle");
      if (handle && (handle.contains(e.target) || handle === e.target)) return;
      showTooltip(placementId, el);
    });
    el.addEventListener("mouseleave", () => {
      hideTooltip();
    });
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(placementId, e.clientX, e.clientY);
    });

    // Wire the travel-direction drag handle if present (full markers only).
    const handleEl = el.querySelector(".signs-map-travel-handle");
    if (handleEl) {
      // Prevent tooltip from appearing when moving the pointer onto the
      // handle from somewhere else on the marker.
      handleEl.addEventListener("mouseenter", (e) => {
        e.stopPropagation();
        hideTooltip(true);
      });
      attachTravelHandleListeners(placementId, handleEl, el);
    }
  }

  /**
   * Attach pointerdown on the travel-direction handle element so the user
   * can drag to set the direction-of-travel bearing. Only called for full
   * markers (compact markers have no handle). Must be re-called whenever
   * marker.content is replaced.
   *
   * Drag mechanics:
   *   - pointerdown on the handle captures the pointer and records the
   *     marker center from getBoundingClientRect().
   *   - pointermove computes atan2(dx, -dy) from center to pointer,
   *     converting screen coords (Y-down) to compass bearing (clockwise
   *     from north-up). The handle rotates live via inline transform.
   *   - pointerup releases capture, updates in-memory heading, mirrors
   *     to the editor input if open, and fires a debounced PUT save.
   *
   * @param {number}      placementId
   * @param {HTMLElement} handleEl     The .signs-map-travel-handle element.
   * @param {HTMLElement} wrapperEl    The marker wrapper (parent of handleEl).
   */
  function attachTravelHandleListeners(placementId, handleEl, wrapperEl) {
    if (!canManage) return;
    // Travel handle drag requires a precise pointer; skip on touch devices.
    if (isTouchDevice) return;

    handleEl.addEventListener("pointerdown", (e) => {
      // Only primary button; ignore touch-scroll etc.
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.stopPropagation(); // Don't let the map see this as a drag-start
      e.preventDefault();

      travelDragId        = placementId;
      travelDragHandleEl  = handleEl;
      travelDragMarkerRect = wrapperEl.getBoundingClientRect();

      handleEl.setPointerCapture(e.pointerId);
      handleEl.classList.add("signs-map-travel-handle-dragging");

      // Suppress map cursor changes while dragging bearing
      if (mapRef && mapRef.getDiv) {
        mapRef.getDiv().classList.add("signs-map-bearing-drag");
      }

      // Hide tooltip immediately so it doesn't obscure the handle
      hideTooltip(true);
    });

    handleEl.addEventListener("pointermove", (e) => {
      if (travelDragId !== placementId) return;

      const cx = travelDragMarkerRect.left + travelDragMarkerRect.width  / 2;
      const cy = travelDragMarkerRect.top  + travelDragMarkerRect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;

      // atan2(dx, -dy): screen Y is inverted vs. map Y, so negate dy to
      // get clockwise-from-north matching compass convention.
      let bearing = Math.atan2(dx, -dy) * (180 / Math.PI);
      if (bearing < 0) bearing += 360;
      bearing = Math.round(bearing);

      handleEl.style.setProperty("--travel-bearing", `${bearing}deg`);
      handleEl.classList.remove("signs-map-travel-handle-unset");

      // Mirror live to the editor input if it's editing this placement
      if (editingId === placementId) {
        const inp = document.getElementById("editorHeading");
        if (inp) inp.value = String(bearing);
      }
    });

    handleEl.addEventListener("pointerup", (e) => {
      if (travelDragId !== placementId) return;

      handleEl.releasePointerCapture(e.pointerId);
      handleEl.classList.remove("signs-map-travel-handle-dragging");

      if (mapRef && mapRef.getDiv) {
        mapRef.getDiv().classList.remove("signs-map-bearing-drag");
      }

      // Read the final bearing from the CSS custom property set in pointermove.
      const transformVal = handleEl.style.getPropertyValue("--travel-bearing") || "0deg";
      const match = transformVal.match(/(-?[\d.]+)deg/);
      if (!match) {
        travelDragId = null;
        travelDragHandleEl = null;
        travelDragMarkerRect = null;
        return;
      }

      let finalBearing = Number(match[1]);
      if (finalBearing < 0) finalBearing += 360;
      finalBearing = Math.round(finalBearing) % 360;

      const p = findPlacement(placementId);
      if (p) {
        p.heading = finalBearing;

        // Mirror to the editor input (already done live, but ensure
        // the final rounded value is reflected accurately).
        if (editingId === placementId) {
          const inp = document.getElementById("editorHeading");
          if (inp) inp.value = String(finalBearing);
        }

        // Debounced PUT — reuse the same endpoint as the position saves
        persistTravelDirection(placementId, finalBearing);
      }

      travelDragId        = null;
      travelDragHandleEl  = null;
      travelDragMarkerRect = null;
    });

    // Cancel drag if pointer is lost (e.g. window loses focus mid-drag)
    handleEl.addEventListener("pointercancel", () => {
      if (travelDragId !== placementId) return;
      if (travelDragHandleEl) {
        travelDragHandleEl.classList.remove("signs-map-travel-handle-dragging");
      }
      if (mapRef && mapRef.getDiv) {
        mapRef.getDiv().classList.remove("signs-map-bearing-drag");
      }
      travelDragId        = null;
      travelDragHandleEl  = null;
      travelDragMarkerRect = null;
    });
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
   * Persist a direction-of-travel bearing change to the server.
   * Sends a full PUT so all other editable fields are preserved.
   * Silently logs on failure — the in-memory value was already updated
   * so the marker stays correct; the user can save via the editor if
   * a network hiccup causes a mismatch.
   *
   * @param {number} placementId
   * @param {number} bearing  0–359, clockwise from north.
   */
  async function persistTravelDirection(placementId, bearing) {
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
          latitude:      p.latitude,
          longitude:     p.longitude,
          heading:       bearing,
          locationNotes: p.location_notes,
          mountType:     p.mount_type,
          markerColor:   p.marker_color,
          arrowDirection: p.arrow_direction,
        }),
      });
      const data = await res.json();
      if (!data?.success) {
        console.error("persistTravelDirection rejected:", data?.error);
      }
    } catch (err) {
      console.error("persistTravelDirection error:", err);
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
    // Dismiss overlays in reverse z-index order so the user can step
    // out gracefully: Street View → info sheet → deselect marker.
    const svOverlay = document.getElementById("streetViewOverlay");
    if (svOverlay && !svOverlay.classList.contains("d-none")) {
      closeStreetView();
      return;
    }
    const infoSheet = document.getElementById("signsInfoSheet");
    if (infoSheet && !infoSheet.classList.contains("d-none")) {
      dismissInfoSheet();
      return;
    }
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
    // Belt-and-suspenders: never persist a drag that originated on a
    // touch device. gmpDraggable should already be false on touch, but
    // DevTools emulation and mid-session device changes can produce a
    // draggable marker on a coarse-pointer context. If that happens, snap
    // the marker back to its stored position instead of saving the move.
    if (isTouchDevice) {
      const p = findPlacement(placementId);
      const marker = markers.get(placementId);
      if (p && marker) {
        marker.position = {
          lat: Number(p.latitude),
          lng: Number(p.longitude),
        };
      }
      return;
    }

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

    // Delete + Street View buttons visible for existing placements only
    const delBtn = document.getElementById("editorDeleteBtn");
    if (delBtn) delBtn.hidden = false;

    const svBtn = document.getElementById("editorStreetViewBtn");
    if (svBtn) svBtn.hidden = false;

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

    const svBtn = document.getElementById("editorStreetViewBtn");
    if (svBtn) svBtn.hidden = true;

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
        gmpDraggable: !isTouchDevice,
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
          // Rebuild at full detail only — compact markers have no handle,
          // so use the current level to stay consistent with zoom state.
          marker.content = buildMarkerContentForLevel(p, currentDetailLevel);
          attachMarkerHoverListeners(editingId, marker);
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
  // GEOLOCATION
  // ============================================================

  /**
   * Attempt to get the device's current GPS position and apply it to the
   * given context:
   *
   *   - 'new':      Repositions (or creates) the pending new-placement
   *                 marker and populates the editor lat/lng inputs. If the
   *                 editor isn't open yet, opens it at the GPS position.
   *   - 'existing': Updates the editor lat/lng inputs and moves the
   *                 existing marker visually. Does NOT auto-save — the
   *                 user must press Save to persist.
   *
   * The button passed in is placed into a loading state while the fix is
   * pending and restored on completion (success or failure).
   *
   * @param {'new'|'existing'} context
   * @param {HTMLElement}      triggerBtn  The button that was clicked.
   */
  function geotagPlacement(context, triggerBtn) {
    if (!navigator.geolocation) {
      showGeotagError("Geolocation is not supported by this browser.");
      return;
    }

    // Disable the button and show a spinner while waiting for a fix
    triggerBtn.disabled = true;
    const origHTML = triggerBtn.innerHTML;
    triggerBtn.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin me-1" aria-hidden="true"></i>Getting location…';

    /**
     * Restore the trigger button to its original state.
     */
    const restoreBtn = () => {
      triggerBtn.disabled = false;
      triggerBtn.innerHTML = origHTML;
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        restoreBtn();
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy; // metres

        // Populate the editor inputs
        const latInput = document.getElementById("editorLat");
        const lngInput = document.getElementById("editorLng");
        if (latInput) latInput.value = lat.toFixed(7);
        if (lngInput) lngInput.value = lng.toFixed(7);

        // Show accuracy feedback so the user can judge whether the fix
        // is good enough (GPS in a parking garage may be off by 30m+).
        showGeotagAccuracy(accuracy);

        if (context === "new") {
          if (pendingNewMarker) {
            // Reposition the existing ghost marker
            pendingNewMarker.position = { lat, lng };
            pendingNewLatLng = { lat, lng };
          } else {
            // No map tap yet — create a ghost marker at the GPS position
            // and open the editor as if the user had tapped the map there.
            beginNewPlacement(lat, lng);
            // beginNewPlacement already opens the offcanvas and sets
            // pendingNewLatLng, so we just need to sync the inputs again
            // in case beginNewPlacement used slightly different rounding.
            if (latInput) latInput.value = lat.toFixed(7);
            if (lngInput) lngInput.value = lng.toFixed(7);
          }
        } else if (context === "existing" && editingId !== null) {
          // Move the existing marker visually (not saved yet)
          const marker = markers.get(editingId);
          if (marker) marker.position = { lat, lng };

          // Update in-memory coordinates so a subsequent Save picks up
          // the new position even without re-reading the inputs.
          const p = findPlacement(editingId);
          if (p) {
            p.latitude  = lat;
            p.longitude = lng;
          }
        }

        // Pan the map to the new position so the user can verify
        if (mapRef) {
          mapRef.panTo({ lat, lng });
        }
      },
      (err) => {
        restoreBtn();
        let msg;
        switch (err.code) {
          case err.PERMISSION_DENIED:
            msg = "Location permission denied. Enable it in your browser or device settings.";
            break;
          case err.POSITION_UNAVAILABLE:
            msg = "Location unavailable. Check that GPS is enabled on your device.";
            break;
          case err.TIMEOUT:
            msg = "Location request timed out. Try again in a moment.";
            break;
          default:
            msg = "Could not get your location.";
        }
        showGeotagError(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  }

  /**
   * Show a geolocation error message in the editor feedback area.
   * Reuses the existing #editorFeedback element so no new DOM is needed.
   *
   * @param {string} msg
   */
  function showGeotagError(msg) {
    const fb = document.getElementById("editorFeedback");
    if (!fb) return;
    fb.className = "small text-danger";
    fb.textContent = msg;
  }

  /**
   * Show a GPS accuracy hint below the coordinate inputs.
   * Clears automatically after 6 seconds.
   *
   * @param {number} accuracyMeters  Accuracy radius in metres from the Geolocation API.
   */
  function showGeotagAccuracy(accuracyMeters) {
    const hint = document.getElementById("editorCoordsHint");
    if (!hint) return;
    const rounded = Math.round(accuracyMeters);
    const quality = rounded <= 5 ? "Excellent" : rounded <= 15 ? "Good" : rounded <= 40 ? "Fair" : "Poor";
    hint.textContent = `GPS fix: ±${rounded} m (${quality}). Save to keep this position.`;
    window.setTimeout(() => {
      // Restore the default hint after a delay, but only if it hasn't
      // been replaced by another message in the meantime.
      if (hint.textContent.startsWith("GPS fix:")) {
        hint.textContent = isTouchDevice && canManage
          ? "Enter coordinates manually, or tap the map to place."
          : "Drag the marker on the map to reposition.";
      }
    }, 6000);
  }

  // ============================================================
  // INFO SHEET
  // ============================================================

  /**
   * Build and show the bottom info sheet for a placement.
   *
   * The sheet is a fixed card that slides up from the bottom of the
   * viewport. It shows the sign preview, status, detail rows, an optional
   * photo thumbnail, and a full set of action buttons — giving touch users
   * the same functionality as the desktop context menu.
   *
   * On desktop the sheet is also used as the primary tap/click target from
   * the placement list so the user can preview before committing to the
   * full editor.
   *
   * @param {number} placementId
   */
  function showInfoSheet(placementId) {
    if (infoSheetTransitioning) return;
    const p = findPlacement(placementId);
    if (!p) return;

    infoSheetForId = placementId;
    hideTooltip(true);
    dismissContextMenu();

    const sheet   = document.getElementById("signsInfoSheet");
    const header  = document.getElementById("signsInfoSheetHeader");
    const body    = document.getElementById("signsInfoSheetBody");
    const backdrop = document.getElementById("signsInfoSheetBackdrop");
    if (!sheet || !header || !body) return;

    // ── Header ───────────────────────────────────────────────────────

    header.replaceChildren();

    const previewGroup = document.createElement("div");
    previewGroup.className = "signs-info-sheet-preview-group";

    // Sign preview block
    const preview = document.createElement("div");
    preview.className = "sign-preview";
    const previewText = document.createElement("span");
    previewText.className = "sign-preview-text";
    previewText.textContent = p.sign_text || "";
    preview.appendChild(previewText);

    if (p.arrow_direction) {
      const arrowSpan = document.createElement("span");
      arrowSpan.className = "sign-preview-arrow";
      if (p.arrow_direction === "destination") {
        const icon = document.createElement("i");
        icon.className = "fa-solid fa-location-dot";
        icon.setAttribute("aria-hidden", "true");
        arrowSpan.appendChild(icon);
      } else if (ARROW_GLYPHS[p.arrow_direction]) {
        arrowSpan.textContent = ARROW_GLYPHS[p.arrow_direction];
      }
      preview.appendChild(arrowSpan);
    }
    previewGroup.appendChild(preview);

    // Status badge
    const statusBadge = document.createElement("span");
    statusBadge.className = `signs-tooltip-status signs-tooltip-status-${p.status || "planned"}`;
    statusBadge.textContent = p.status
      ? p.status.charAt(0).toUpperCase() + p.status.slice(1)
      : "Planned";
    previewGroup.appendChild(statusBadge);

    header.appendChild(previewGroup);

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "signs-info-sheet-close";
    closeBtn.setAttribute("aria-label", "Close");
    const closeIcon = document.createElement("i");
    closeIcon.className = "fa-solid fa-xmark";
    closeIcon.setAttribute("aria-hidden", "true");
    closeBtn.appendChild(closeIcon);
    closeBtn.addEventListener("click", () => dismissInfoSheet());
    header.appendChild(closeBtn);

    // ── Body ─────────────────────────────────────────────────────────

    body.replaceChildren();

    // Detail rows
    const details = document.createElement("dl");
    details.className = "signs-info-sheet-details";

    /**
     * Append a dt/dd pair to the details list.
     * @param {string} label
     * @param {string} value
     */
    const addDetail = (label, value) => {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      details.appendChild(dt);
      details.appendChild(dd);
    };

    if (p.mount_type) {
      addDetail("Mount", MOUNT_LABELS[p.mount_type] || p.mount_type);
    }
    if (p.location_notes) {
      addDetail("Notes", p.location_notes);
    }
    addDetail(
      "Coords",
      `${Number(p.latitude).toFixed(5)}, ${Number(p.longitude).toFixed(5)}`,
    );

    body.appendChild(details);

    // Photo thumbnail
    if (p.photo_url) {
      const img = document.createElement("img");
      img.className = "signs-info-sheet-thumb";
      img.alt = "Sign placement photo";
      img.src = `/signs/placements/${p.placement_id}/photo?t=${photoCacheBuster}`;
      img.addEventListener("click", () => openPhotoLightbox(p.placement_id));
      body.appendChild(img);
    }

    // ── Action buttons ───────────────────────────────────────────────

    const actions = document.createElement("div");
    actions.className = "signs-info-sheet-actions";

    /**
     * Append a full-width action button.
     * @param {string}   iconCls    FontAwesome class string.
     * @param {string}   label      Display text.
     * @param {Function} onClick    Click handler.
     * @param {string}   [modifier] Optional BEM modifier class suffix.
     */
    const addAction = (iconCls, label, onClick, modifier = "") => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `signs-info-sheet-action-btn${modifier ? " signs-info-sheet-action-btn-" + modifier : ""}`;
      const icon = document.createElement("i");
      icon.className = iconCls;
      icon.setAttribute("aria-hidden", "true");
      btn.appendChild(icon);
      btn.appendChild(document.createTextNode(" " + label));
      btn.addEventListener("click", () => {
        dismissInfoSheet();
        onClick();
      });
      actions.appendChild(btn);
    };

    // Edit (primary CTA — always first)
    if (canManage) {
      addAction("fa-solid fa-pen", "Edit placement", () => openEditor(placementId), "primary");
    }

    // View photo
    if (p.photo_url) {
      addAction("fa-solid fa-image", "View photo", () => openPhotoLightbox(placementId));
    }

    // Quick status change (manageSigns only) — three side-by-side buttons
    if (canManage) {
      const statusGroup = document.createElement("div");
      statusGroup.className = "signs-info-sheet-status-group";

      const statusDefs = [
        { status: "planned",   icon: "fa-solid fa-circle-dot",   label: "Planned"   },
        { status: "installed", icon: "fa-solid fa-circle-check",  label: "Installed" },
        { status: "removed",   icon: "fa-solid fa-circle-xmark",  label: "Removed"   },
      ];

      statusDefs.forEach(({ status, icon, label }) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `signs-info-sheet-status-btn signs-info-sheet-status-btn-${status}`;
        if (p.status === status) btn.classList.add("signs-info-sheet-status-btn-active");
        const iconEl = document.createElement("i");
        iconEl.className = icon;
        iconEl.setAttribute("aria-hidden", "true");
        btn.appendChild(iconEl);
        btn.appendChild(document.createTextNode(label));
        btn.addEventListener("click", async () => {
          if (p.status === status) return; // already this status
          dismissInfoSheet();
          await quickSetStatus(placementId, status);
        });
        statusGroup.appendChild(btn);
      });

      actions.appendChild(statusGroup);
    }

    // Street View
    addAction("fa-solid fa-street-view", "View in Street View", () => openStreetView(placementId));

    // Get directions
    addAction("fa-solid fa-diamond-turn-right", "Get directions", () => {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`;
      window.open(url, "_blank", "noopener,noreferrer");
    });

    // Copy coordinates
    addAction("fa-solid fa-copy", "Copy coordinates", () => {
      const text = `${Number(p.latitude).toFixed(7)}, ${Number(p.longitude).toFixed(7)}`;
      navigator.clipboard.writeText(text).catch(() => {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      });
    });

    // Delete (manageSigns only — bottom, danger style)
    if (canManage) {
      addAction("fa-solid fa-trash", "Delete placement", () => {
        openEditor(placementId);
        window.setTimeout(() => deleteFromEditor(), 120);
      }, "danger");
    }

    body.appendChild(actions);

    // ── Animate in ───────────────────────────────────────────────────

    infoSheetTransitioning = true;

    if (backdrop) {
      backdrop.classList.remove("d-none");
      // Force a reflow so the opacity transition fires
      void backdrop.offsetWidth;
      backdrop.classList.add("signs-info-sheet-backdrop-visible");
    }

    sheet.classList.remove("d-none");
    // Force a reflow before adding the open class so the translateY
    // transition fires (avoids the element jumping to final position).
    void sheet.offsetWidth;
    sheet.classList.add("signs-info-sheet-open");

    sheet.addEventListener(
      "transitionend",
      () => {
        infoSheetTransitioning = false;
      },
      { once: true },
    );
  }

  /**
   * Dismiss the info sheet with a slide-down animation.
   *
   * @param {boolean} [immediate=false]  Skip the transition (e.g. on navigation).
   */
  function dismissInfoSheet(immediate = false) {
    const sheet   = document.getElementById("signsInfoSheet");
    const backdrop = document.getElementById("signsInfoSheetBackdrop");
    if (!sheet) return;

    infoSheetForId = null;

    if (immediate) {
      sheet.classList.remove("signs-info-sheet-open");
      sheet.classList.add("d-none");
      if (backdrop) {
        backdrop.classList.remove("signs-info-sheet-backdrop-visible");
        backdrop.classList.add("d-none");
      }
      infoSheetTransitioning = false;
      return;
    }

    infoSheetTransitioning = true;
    sheet.classList.remove("signs-info-sheet-open");

    if (backdrop) {
      backdrop.classList.remove("signs-info-sheet-backdrop-visible");
    }

    sheet.addEventListener(
      "transitionend",
      () => {
        sheet.classList.add("d-none");
        if (backdrop) backdrop.classList.add("d-none");
        infoSheetTransitioning = false;
      },
      { once: true },
    );
  }

  /**
   * Wire swipe-to-dismiss on the info sheet.
   * Tracks touchstart/touchmove/touchend on the sheet itself and the
   * drag handle. A downward swipe of ≥ 80px dismisses the sheet; a
   * shorter swipe snaps back.
   */
  function wireInfoSheetSwipe() {
    const sheet  = document.getElementById("signsInfoSheet");
    const handle = document.getElementById("signsInfoSheetHandle");
    if (!sheet) return;

    // We listen on the whole sheet so the user can swipe anywhere in the
    // header/handle area. We stop propagation on the body scroll container
    // so normal scrolling still works inside the body.
    const swipeTarget = handle || sheet;

    swipeTarget.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      infoSheetSwipeStartY = e.touches[0].clientY;
      infoSheetSwipeDelta  = 0;
      // Remove the CSS transition while dragging so the sheet follows
      // the finger instantly without the easing lag.
      sheet.style.transition = "none";
    }, { passive: true });

    swipeTarget.addEventListener("touchmove", (e) => {
      if (infoSheetSwipeStartY === null) return;
      const dy = e.touches[0].clientY - infoSheetSwipeStartY;
      if (dy < 0) return; // Don't allow upward drag beyond open position
      infoSheetSwipeDelta = dy;

      // Apply live transform: on desktop the sheet has an X offset too,
      // so we must preserve it.
      const isWide = window.matchMedia("(min-width: 768px)").matches;
      const xOffset = isWide ? "translateX(-50%) " : "";
      sheet.style.transform = `${xOffset}translateY(${dy}px)`;
    }, { passive: true });

    swipeTarget.addEventListener("touchend", () => {
      if (infoSheetSwipeStartY === null) return;
      infoSheetSwipeStartY = null;

      // Restore the CSS transition
      sheet.style.transition = "";
      sheet.style.transform  = "";

      if (infoSheetSwipeDelta >= 80) {
        dismissInfoSheet();
      } else {
        // Snap back — re-apply the open class to retrigger the transition
        sheet.classList.add("signs-info-sheet-open");
      }
      infoSheetSwipeDelta = 0;
    }, { passive: true });
  }

  // ============================================================
  // WIRING
  // ============================================================

  /**
   * Wire all DOM event listeners. Called after Maps has loaded.
   */
  function wireUi() {
    // ── Build tooltip element ─────────────────────────────────────────
    // ── Build tooltip element ─────────────────────────────────────────
    // Appended to <body> (not #googleMap) so it escapes the `all: revert`
    // CSS reset block that would otherwise kill position:fixed and our
    // custom CSS variables. Uses fixed positioning; coordinates come from
    // the marker's getBoundingClientRect() in showTooltip().
    tooltipEl = document.createElement("div");
    tooltipEl.className = "signs-tooltip d-none";
    tooltipEl.setAttribute("aria-hidden", "true");
    tooltipEl.addEventListener("mouseenter", () => {
      if (tooltipHideTimer) {
        clearTimeout(tooltipHideTimer);
        tooltipHideTimer = null;
      }
    });
    tooltipEl.addEventListener("mouseleave", () => hideTooltip());
    document.body.appendChild(tooltipEl);

    // ── Build context-menu element ────────────────────────────────────
    ctxMenuEl = document.createElement("div");
    ctxMenuEl.className = "signs-ctx-menu d-none";
    ctxMenuEl.setAttribute("role", "menu");
    document.body.appendChild(ctxMenuEl);

    // ── Info sheet backdrop + swipe ───────────────────────────────────
    const infoBackdrop = document.getElementById("signsInfoSheetBackdrop");
    if (infoBackdrop) {
      infoBackdrop.addEventListener("click", () => dismissInfoSheet());
    }
    wireInfoSheetSwipe();

    // Dismiss context menu on outside click or Escape
    document.addEventListener("mousedown", (e) => {
      if (ctxMenuEl && !ctxMenuEl.contains(e.target)) {
        dismissContextMenu();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") dismissContextMenu();
    });
    // Suppress browser default context menu on map background
    const mapCanvas = document.getElementById("googleMap");
    if (mapCanvas) {
      mapCanvas.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        dismissContextMenu();
      });
    }

    // ── Filters ───────────────────────────────────────────────────────
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

    const geoNewBtn = document.getElementById("geotagNewBtn");
    if (geoNewBtn) {
      geoNewBtn.addEventListener("click", () => geotagPlacement("new", geoNewBtn));
    }
    const geoUpdateBtn = document.getElementById("geotagUpdateBtn");
    if (geoUpdateBtn) {
      geoUpdateBtn.addEventListener("click", () => geotagPlacement("existing", geoUpdateBtn));
    }

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
                attachMarkerHoverListeners(p.placement_id, marker);
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

    // Placement list row click -> open info sheet (same as tapping a marker)
    const list = document.getElementById("placementList");
    if (list) {
      list.addEventListener("click", (e) => {
        const row = e.target.closest(".signs-placement-row");
        if (!row) return;
        const id = Number(row.getAttribute("data-placement-id"));
        if (!id) return;
        selectMarker(id);
        showInfoSheet(id);
      });
    }

// Reset pending-marker / editing state when the editor is dismissed
    const editorEl = document.getElementById("placementEditor");
    if (editorEl) {
      editorEl.addEventListener("hidden.bs.offcanvas", () => {
        clearPendingMarker();
        editingId = null;
        pendingNewLatLng = null;
        // Street View stays open if launched from the editor — the user
        // may want to keep viewing while the panel closes. No auto-close.
      });
    }

    // Street View button in the offcanvas editor
    const svBtn = document.getElementById("editorStreetViewBtn");
    if (svBtn) {
      svBtn.addEventListener("click", () => {
        if (editingId !== null) openStreetView(editingId);
      });
    }

    // Street View overlay close button
    const svCloseBtn = document.getElementById("streetViewCloseBtn");
    if (svCloseBtn) {
      svCloseBtn.addEventListener("click", closeStreetView);
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

    // ── Legend toggle ─────────────────────────────────────────────────
    const legendToggle = document.getElementById("legendToggleBtn");
    const legendPanel  = document.getElementById("mapLegendPanel");
    if (legendToggle && legendPanel) {
      legendPanel.addEventListener("show.bs.collapse", () => {
        legendToggle.querySelector(".signs-legend-chevron")?.classList.replace("fa-chevron-down", "fa-chevron-up");
      });
      legendPanel.addEventListener("hide.bs.collapse", () => {
        legendToggle.querySelector(".signs-legend-chevron")?.classList.replace("fa-chevron-up", "fa-chevron-down");
      });
    }
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
    isTouchDevice = window.matchMedia("(pointer: coarse)").matches;

    // Update the coordinate input hint so mobile canManage users know
    // they can type coordinates directly (drag is disabled on touch).
    if (isTouchDevice && canManage) {
      const hint = document.getElementById("editorCoordsHint");
      if (hint) hint.textContent = "Enter coordinates manually, or tap the map to place.";
    }

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
