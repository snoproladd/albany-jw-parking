/**
 * @file public/js/signsMapPrint.js
 * @description Print-optimised sign placement map.
 *
 * Reads the locations + attachments data model and renders one marker
 * per location using the top sign's abbreviation + arrow. The legend
 * maps abbreviations back to full sign names.
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

  const MARKER_COLORS = [
    { key: "red", hex: "#dc3545" },
    { key: "orange", hex: "#fd7e14" },
    { key: "yellow", hex: "#ffc107" },
    { key: "green", hex: "#198754" },
    { key: "teal", hex: "#0dcaf0" },
    { key: "blue", hex: "#0d6efd" },
    { key: "purple", hex: "#6f42c1" },
    { key: "pink", hex: "#d63384" },
  ];

  /**
   * FontAwesome mount-type icons — matches the legend in the sidebar
   * of the main sign map.
   *
   * @type {Object<string, string>}
   */
  const MOUNT_ICONS = {
    pole: "fa-solid fa-signs-post",
    cone: "fa-solid fa-triangle-exclamation",
    "a-frame": "fa-solid fa-tent",
    "existing-structure": "fa-solid fa-building",
  };

  /**
   * Human-readable labels for mount types.
   *
   * @type {Object<string, string>}
   */
  const MOUNT_LABELS = {
    pole: "Pole",
    cone: "Cone",
    "a-frame": "A-frame",
    "existing-structure": "Existing structure",
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
    } else if (category === "info") {
      i.className = "fa-solid fa-circle-info sign-category-icon";
    } else if (category === "warning") {
      i.className = "fa-solid fa-triangle-exclamation sign-category-icon";
    } else {
      return null;
    }
    return i;
  }

  /**
   * Get the category of a location's top attachment.
   *
   * @param {object} loc
   * @returns {string|null}
   */
  function getTopCategory(loc) {
    const atts = (loc.attachments || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
    if (atts.length === 0) return null;
    return atts[0].sign_category || null;
  }

  // ============================================================
  // MODULE STATE
  // ============================================================

  /** @type {google.maps.Map|null} */
  let mapRef = null;
  let signs = [];
  let locations = [];
  let arrows = [];
  let mapOverlays = [];
  const markerEntries = new Map();
  /** @type {Map<number, google.maps.marker.AdvancedMarkerElement>} */
  const arrowMarkers = new Map();
  /** @type {Map<number, { attachment: object, location: object }>} */
  const attachmentLookup = new Map();
  /** @type {google.maps.Polyline[]} */
  const connectorLines = [];
  let tilesReady = false;

  /**
   * Layer visibility state — mirrors the main map's layer toggles.
   *
   * @type {{ trafficArrows: boolean, signFacing: boolean, signCount: boolean, placementId: boolean }}
   */
  const layerState = {
    trafficArrows: true,
    expandSigns: true,
    signFacing: false,
    signCount: true,
    placementId: true,
  };

  /** @type {Map<number, number[]>|null} */
  let cachedBearingMap = null;

  // ============================================================
  // HELPERS
  // ============================================================

  /**
   * Derive effective status for a location from its attachments.
   *
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

  /**
   * Get the display abbreviation for a location's top attachment.
   *
   * @param {object} loc
   * @returns {string}
   */
  function getTopAbbreviation(loc) {
    const atts = (loc.attachments || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
    if (atts.length === 0) return "?";
    const top = atts[0];
    return top.abbreviation || (top.sign_text || "?").slice(0, 4).toUpperCase();
  }

  /**
   * Get the arrow direction of a location's top attachment.
   *
   * @param {object} loc
   * @returns {string|null}
   */
  function getTopArrow(loc) {
    const atts = (loc.attachments || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
    if (atts.length === 0) return null;
    return atts[0].arrow_direction || null;
  }

  // ============================================================
  // FACING HELPERS
  // ============================================================

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
   * Group a location's attachments by facing direction derived
   * from linked traffic arrows. Bearings within ±15° cluster together.
   *
   * @param {object} loc
   * @returns {{ groups: Map<number, object[]>, unlinked: object[] }}
   */
  function groupAttachmentsByFacing(loc) {
    const bearingMap = getAttachmentBearingMap();
    /** @type {Map<number, object[]>} */
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
   * Build the center disc element for a facing layout marker.
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
      const icon = document.createElement("i");
      icon.className = `${MOUNT_ICONS[loc.mount_type]} signs-mount-icon`;
      icon.setAttribute("aria-hidden", "true");
      wrap.appendChild(icon);
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

    const chevron = document.createElement("i");
    chevron.className = "fa-solid fa-chevron-up signs-facing-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.style.setProperty("--facing-deg", `${bearing}deg`);
    group.appendChild(chevron);

    children.forEach((child) => group.appendChild(child));
    return group;
  }

  /**
   * Build symbol-level facing content for the print map.
   * Compact radial chevron pills with optional count badges.
   *
   * @param {object} loc
   * @returns {HTMLDivElement}
   */
  function buildFacingSymbolContent(loc) {
    const status = deriveStatus(loc);
    const wrapper = document.createElement("div");
    wrapper.className =
      `signs-map-marker signs-facing-layout signs-facing-layout-symbol signs-map-marker-${status}`;

    wrapper.appendChild(buildFacingCenter(loc));

    const { groups } = groupAttachmentsByFacing(loc);

    groups.forEach((atts, bearing) => {
      const children = [];
      if (atts.length > 1) {
        const count = document.createElement("span");
        count.className = "signs-facing-count";
        count.textContent = atts.length;
        children.push(count);
      }
      const group = buildFacingGroup(bearing, 20, children);
      wrapper.appendChild(group);
    });

    return wrapper;
  }

  // ============================================================
  // ARROW RENDERING
  // ============================================================

  /**
   * Build a static SVG chevron for a traffic arrow on the print map.
   * No interactive zones or drag handles — purely visual.
   *
   * @param {object} arrow
   * @returns {HTMLDivElement}
   */
  function buildPrintArrowContent(arrow) {
    const wrapper = document.createElement("div");
    wrapper.className = "signs-arrow-marker signs-arrow-marker-print";
    // Shift down so the arrow tip sits at the geographic point.
    // 30×48 SVG, tip at viewBox y=6 → rendered y = 6*(48/64) = 4.5 → 48−4.5 ≈ 44
    wrapper.style.transform = "translateY(44px)";

    const b = arrow.bearing || 0;
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
   * Place a traffic arrow marker on the print map.
   *
   * @param {object} arrow
   */
  function addMarkerForArrow(arrow) {
    const content = buildPrintArrowContent(arrow);
    const marker = new google.maps.marker.AdvancedMarkerElement({
      map: layerState.trafficArrows ? mapRef : null,
      position: { lat: Number(arrow.latitude), lng: Number(arrow.longitude) },
      content,
      title: arrow.label || "Traffic arrow",
      zIndex: 10,
    });
    arrowMarkers.set(arrow.arrow_id, marker);
  }

  // ============================================================
  // ATTACHMENT LOOKUP + CONNECTOR LINES
  // ============================================================

  /**
   * Build a reverse lookup from attachment_id to its parent
   * location and attachment details. Called once after data load.
   */
  function buildAttachmentLookup() {
    attachmentLookup.clear();
    locations.forEach((loc) => {
      (loc.attachments || []).forEach((att) => {
        attachmentLookup.set(att.attachment_id, {
          attachment: att,
          location: loc,
        });
      });
    });
  }

  /**
   * Draw polylines from each traffic arrow to the locations
   * of its linked signs. Clears existing lines first.
   */
  function drawConnectorLines() {
    connectorLines.forEach((line) => line.setMap(null));
    connectorLines.length = 0;

    if (!mapRef) return;

    arrows.forEach((arrow) => {
      if (!arrow.links?.length) return;

      const arrowPos = {
        lat: Number(arrow.latitude),
        lng: Number(arrow.longitude),
      };

      const seenLocations = new Set();
      arrow.links.forEach((attId) => {
        const entry = attachmentLookup.get(attId);
        if (!entry || seenLocations.has(entry.location.location_id)) return;
        seenLocations.add(entry.location.location_id);

        const line = new google.maps.Polyline({
          path: [
            arrowPos,
            {
              lat: Number(entry.location.latitude),
              lng: Number(entry.location.longitude),
            },
          ],
          strokeColor: "#6f42c1",
          strokeOpacity: 0.35,
          strokeWeight: 1.5,
          geodesic: false,
          map: layerState.trafficArrows ? mapRef : null,
        });
        connectorLines.push(line);
      });
    });
  }

  /**
   * Show or hide all connector lines.
   *
   * @param {boolean} visible
   */
  function setConnectorLinesVisible(visible) {
    connectorLines.forEach((line) => {
      line.setMap(visible ? mapRef : null);
    });
  }

  // ============================================================
  // LAYER TOGGLES
  // ============================================================

  /**
   * Toggle visibility for a named print map layer.
   *
   * @param {'trafficArrows'|'signFacing'|'signCount'|'placementId'} layerId
   * @param {boolean} visible
   */
  function togglePrintLayer(layerId, visible) {
    layerState[layerId] = visible;

    if (layerId === "trafficArrows") {
      arrowMarkers.forEach((marker) => {
        marker.map = visible ? mapRef : null;
      });
      setConnectorLinesVisible(visible);
    } else if (layerId === "expandSigns") {
      // Disable count/placement toggles when expanded
      ["layerSignCount", "layerPlacementId"].forEach((id) => {
        const cb = document.getElementById(id);
        if (cb) cb.disabled = visible;
      });
      const mapDiv = mapRef?.getDiv();
      if (mapDiv) {
        mapDiv.classList.toggle("signs-print-hide-sign-count", visible);
        mapDiv.classList.toggle("signs-print-hide-placement-id", visible);
      }
      rebuildAllLocationMarkers();
      applyFilters(true);
    } else if (layerId === "signFacing") {
      // Disable count/placement toggles when facing is on
      ["layerSignCount", "layerPlacementId"].forEach((id) => {
        const cb = document.getElementById(id);
        if (cb) cb.disabled = visible;
      });
      rebuildAllLocationMarkers();
      applyFilters(true);
    } else if (layerId === "signCount") {
      const mapDiv = mapRef?.getDiv();
      if (mapDiv) mapDiv.classList.toggle("signs-print-hide-sign-count", !visible);
    } else if (layerId === "placementId") {
      const mapDiv = mapRef?.getDiv();
      if (mapDiv) mapDiv.classList.toggle("signs-print-hide-placement-id", !visible);
    }
  }

  /**
   * Rebuild every location marker — needed when toggling
   * between pill and facing mode.
   */
  function rebuildAllLocationMarkers() {
    markerEntries.forEach((entry, locId) => {
      entry.marker.map = null;
    });
    markerEntries.clear();
    locations.forEach((loc) => addMarkerForLocation(loc));
  }

  // ============================================================
  // GOOGLE MAPS LOADER
  // ============================================================

  /**
   * @param {string} apiKey
   * @returns {Promise<void>}
   */
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
        callback: "__signsMapPrintInit",
      });
      window.__signsMapPrintInit = () => {
        delete window.__signsMapPrintInit;
        resolve();
      };
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
      script.async = true;
      script.defer = true;
      script.onerror = () =>
        reject(new Error("Failed to load Google Maps JavaScript API."));
      document.head.appendChild(script);
    });
  }

  // ============================================================
  // MAP INITIALISATION
  // ============================================================

  /**
   * @param {{ lat: number, lng: number, zoom: number }} center
   */
  function initMap(center) {
    const mapEl = document.getElementById("googleMap");
    if (!mapEl) return;
    mapEl.replaceChildren();

    const params = new URLSearchParams(window.location.search);
    const initialMapType = params.get("mapType") === "hybrid" ? "hybrid" : "roadmap";

    mapRef = new google.maps.Map(mapEl, {
      center: { lat: center.lat, lng: center.lng },
      zoom: center.zoom,
      mapTypeId: initialMapType,
      mapId: "6261df670165b61fc3ae73a4",
      tilt: 0,
      disableDefaultUI: true,
      gestureHandling: "greedy",
      zoomControl: true,
      disableDoubleClickZoom: true,
    });

    google.maps.event.addListenerOnce(mapRef, "tilesloaded", () => {
      tilesReady = true;
      const printBtn = document.getElementById("printBtn");
      if (printBtn) printBtn.disabled = false;
      const fitBtn = document.getElementById("fitBtn");
      if (fitBtn) fitBtn.disabled = false;
      const publishBtn = document.getElementById("publishBtn");
      if (publishBtn) publishBtn.disabled = false;

      // Signal for Puppeteer PDF generation
      window.signsMapReady = true;
    });

    window.addEventListener("beforeprint", () => {
      if (mapRef) google.maps.event.trigger(mapRef, "resize");
    });
    window.addEventListener("afterprint", () => {
      if (mapRef) google.maps.event.trigger(mapRef, "resize");
    });

    mapOverlays.forEach((overlay) => {
      if (overlay.type === "marker") {
        addMarkerForLocation(overlay.location);
      }
    });
    locations.forEach((loc) => addMarkerForLocation(loc));
    buildAttachmentLookup();
    arrows.forEach((arrow) => addMarkerForArrow(arrow));
    drawConnectorLines();
    buildLegend();
    applyFilters();

    if (window.signsMapOverlays) {
      window.signsMapOverlays.render(mapRef, mapOverlays);
    }
  }

  // ============================================================
  // MARKER RENDERING
  // ============================================================

  /**
   * Build print marker content for a location.
   * Shows a compact icon + arrow pill for every attachment.
   *
   * @param {object} loc
   * @returns {HTMLDivElement}
   */
  function buildPrintMarkerContent(loc) {
    const status = deriveStatus(loc);
    const colorCls = loc.marker_color
      ? ` signs-map-marker-color-${loc.marker_color}`
      : "";
    const wrapper = document.createElement("div");
    wrapper.className = `signs-map-marker signs-map-marker-print signs-map-marker-${status}${colorCls}`;

    const row = document.createElement("div");
    row.className = "signs-print-marker-row";

    const atts = (loc.attachments || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);

    atts.forEach((att) => {
      const pill = document.createElement("div");
      pill.className = "sign-preview signs-print-marker-pill";

      if (att.sign_category) {
        pill.classList.add(`sign-preview-category-${att.sign_category}`);
      }

      const catIcon = buildCategoryIcon(att.sign_category);
      if (catIcon) pill.appendChild(catIcon);

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
        pill.appendChild(arrow);
      }

      row.appendChild(pill);
    });

    wrapper.appendChild(row);

    // Count badge — visible attachment count
    if (atts.length >= 2) {
      const badge = document.createElement("span");
      badge.className = "signs-print-marker-count";
      badge.textContent = atts.length;
      wrapper.appendChild(badge);
    }

    // Placement ID badge
    if (loc.placement_number != null) {
      const badge = document.createElement("span");
      badge.className = "signs-print-placement-badge";
      badge.textContent = `P${loc.placement_number}`;
      wrapper.appendChild(badge);
    }

    if (loc.mount_type && MOUNT_ICONS[loc.mount_type]) {
      const mount = document.createElement("div");
      mount.className = "signs-print-marker-mount";
      const icon = document.createElement("i");
      icon.className = `${MOUNT_ICONS[loc.mount_type]} signs-print-marker-mount-icon`;
      icon.setAttribute("aria-hidden", "true");
      mount.appendChild(icon);
      wrapper.appendChild(mount);
    }

    return wrapper;
  }

  /**
   * Build the appropriate marker content for a location based
   * on the current layer state. Uses facing layout when the
   * facing layer is enabled and the location has linked arrows;
   * falls back to the standard pill layout otherwise.
   *
   * @param {object} loc
   * @returns {HTMLElement}
   */
  /**
   * Build compact print marker — just the disc with mount icon or
   * bullet, plus count and placement badges. Used when non-facing
   * and not expanded.
   *
   * @param {object} loc
   * @returns {HTMLDivElement}
   */
  function buildCompactPrintContent(loc) {
    const status = deriveStatus(loc);
    const colorCls = loc.marker_color
      ? ` signs-map-marker-color-${loc.marker_color}`
      : "";
    const wrapper = document.createElement("div");
    wrapper.className =
      `signs-map-marker signs-map-marker-print signs-map-marker-compact signs-map-marker-${status}${colorCls}`;

    const disc = document.createElement("div");
    disc.className = "signs-map-marker-disc";

    if (loc.mount_type && MOUNT_ICONS[loc.mount_type]) {
      const wrap = document.createElement("span");
      wrap.className = "signs-map-marker-mount-icon-wrap";
      const icon = document.createElement("i");
      icon.className = `${MOUNT_ICONS[loc.mount_type]} signs-mount-icon`;
      icon.setAttribute("aria-hidden", "true");
      wrap.appendChild(icon);
      disc.appendChild(wrap);
    } else {
      const dot = document.createElement("span");
      dot.className = "signs-map-marker-abbr";
      dot.textContent = "\u2022";
      disc.appendChild(dot);
    }
    wrapper.appendChild(disc);

    const atts = loc.attachments || [];
    if (atts.length >= 2) {
      const badge = document.createElement("span");
      badge.className = "signs-print-marker-count";
      badge.textContent = atts.length;
      wrapper.appendChild(badge);
    }

    if (loc.placement_number != null) {
      const badge = document.createElement("span");
      badge.className = "signs-print-placement-badge";
      badge.textContent = `P${loc.placement_number}`;
      wrapper.appendChild(badge);
    }

    return wrapper;
  }

  /**
   * Build facing-expanded content — symbolic sign pills positioned
   * radially by bearing. Used when facing is on and expanded.
   * Replaces the chevron arrows with actual sign pills.
   *
   * @param {object} loc
   * @returns {HTMLDivElement}
   */
  function buildFacingExpandedContent(loc) {
    const status = deriveStatus(loc);
    const wrapper = document.createElement("div");
    wrapper.className =
      `signs-map-marker signs-facing-layout signs-facing-layout-symbol signs-map-marker-${status}`;

    wrapper.appendChild(buildFacingCenter(loc));

    const { groups, unlinked } = groupAttachmentsByFacing(loc);

    groups.forEach((atts, bearing) => {
      const pills = atts.map((att) => {
        const pill = document.createElement("div");
        pill.className = "sign-preview signs-print-marker-pill";

        if (att.sign_category) {
          pill.classList.add(`sign-preview-category-${att.sign_category}`);
        }

        const catIcon = buildCategoryIcon(att.sign_category);
        if (catIcon) pill.appendChild(catIcon);

        const dir = att.arrow_direction;
        if (dir) {
          const arrowSpan = document.createElement("span");
          arrowSpan.className = "sign-preview-arrow";
          if (dir === "destination") {
            const icon = document.createElement("i");
            icon.className = "fa-solid fa-location-dot";
            icon.setAttribute("aria-hidden", "true");
            arrowSpan.appendChild(icon);
          } else if (ARROW_GLYPHS[dir]) {
            arrowSpan.textContent = ARROW_GLYPHS[dir];
          }
          pill.appendChild(arrowSpan);
        }

        return pill;
      });

      wrapper.appendChild(buildFacingGroup(bearing, 30, pills));
    });

    // Unlinked signs — stack below center
    if (unlinked.length) {
      const group = document.createElement("div");
      group.className = "signs-facing-group signs-facing-group-unlinked";
      group.style.setProperty("--facing-x", "0px");
      group.style.setProperty("--facing-y", "30px");

      unlinked.forEach((att) => {
        const pill = document.createElement("div");
        pill.className = "sign-preview signs-print-marker-pill";
        if (att.sign_category) {
          pill.classList.add(`sign-preview-category-${att.sign_category}`);
        }
        const catIcon = buildCategoryIcon(att.sign_category);
        if (catIcon) pill.appendChild(catIcon);
        group.appendChild(pill);
      });

      wrapper.appendChild(group);
    }

    return wrapper;
  }

  /**
   * Select the appropriate marker content based on the current
   * facing and expand layer state.
   *
   * |              | Expand OFF         | Expand ON              |
   * |--------------|--------------------|------------------------|
   * | Facing OFF   | compact disc       | full pill rows         |
   * | Facing ON    | radial chevrons    | radial sign pills      |
   *
   * @param {object} loc
   * @returns {HTMLElement}
   */
  function buildLocationContent(loc) {
    if (layerState.signFacing) {
      if (layerState.expandSigns) {
        return buildFacingExpandedContent(loc);
      }
      const { groups } = groupAttachmentsByFacing(loc);
      if (groups.size > 0) {
        return buildFacingSymbolContent(loc);
      }
      // No arrow links — minimal disc
      const status = deriveStatus(loc);
      const w = document.createElement("div");
      w.className =
        `signs-map-marker signs-facing-layout signs-facing-layout-symbol signs-map-marker-${status}`;
      w.appendChild(buildFacingCenter(loc));
      return w;
    }
    if (layerState.expandSigns) {
      return buildPrintMarkerContent(loc);
    }
    return buildCompactPrintContent(loc);
  }

  /**
   * @param {object} loc
   */
  function addMarkerForLocation(loc) {
    if ((loc.attachments || []).length === 0) return;

    const content = buildLocationContent(loc);
    const marker = new google.maps.marker.AdvancedMarkerElement({
      map: mapRef,
      position: { lat: Number(loc.latitude), lng: Number(loc.longitude) },
      content,
      title: (loc.attachments || []).map((a) => a.sign_text).join(", "),
    });

    markerEntries.set(loc.location_id, { marker, visible: true });
  }

  // ============================================================
  // FILTERING
  // ============================================================

  /**
   * Apply status and template filters, update counts.
   */
  function applyFilters(skipFit) {
    const statusCbs = document.querySelectorAll(".signs-print-filter-cb");
    const activeStatuses = new Set();
    statusCbs.forEach((cb) => {
      if (cb.checked) activeStatuses.add(cb.value);
    });

    const templateSelect = document.getElementById("templateFilter");
    const templateId = templateSelect ? Number(templateSelect.value) || 0 : 0;

    let visibleCount = 0;

    locations.forEach((loc) => {
      const entry = markerEntries.get(loc.location_id);
      if (!entry) return;

      const statusOk =
        activeStatuses.size === 0 || activeStatuses.has(deriveStatus(loc));
      const templateOk =
        !templateId ||
        (loc.attachments || []).some((a) => a.sign_id === templateId);
      const show = statusOk && templateOk;

      entry.marker.map = show ? mapRef : null;
      entry.visible = show;
      if (show) visibleCount++;
    });

    const label = `${visibleCount} location${visibleCount !== 1 ? "s" : ""}`;
    const countEl = document.getElementById("printCount");
    if (countEl) countEl.textContent = label;
    const legendCountEl = document.getElementById("legendCount");
    if (legendCountEl) legendCountEl.textContent = label;

    if (!skipFit) fitBoundsToVisible();
  }

  /**
   * Parse query string for initial filter state.
   */
  function applyQueryParamFilters() {
    const params = new URLSearchParams(window.location.search);
    const statusParam = params.get("status");
    if (statusParam) {
      const wanted = new Set(statusParam.split(",").map((s) => s.trim()));
      document.querySelectorAll(".signs-print-filter-cb").forEach((cb) => {
        cb.checked = wanted.has(cb.value);
      });
    }
    const templateParam = params.get("template");
    if (templateParam) {
      const sel = document.getElementById("templateFilter");
      if (sel) sel.value = templateParam;
    }
    const mapTypeParam = params.get("mapType");
    if (mapTypeParam) {
      const radio = document.getElementById(
        mapTypeParam === "hybrid" ? "mapTypeHybrid" : "mapTypeRoadmap",
      );
      if (radio) radio.checked = true;
    }
  }

  /**
   * Fit map to visible markers.
   */
  function fitBoundsToVisible() {
    if (!mapRef) return;
    const bounds = new google.maps.LatLngBounds();
    let count = 0;

    markerEntries.forEach((entry) => {
      if (!entry.visible) return;
      bounds.extend(entry.marker.position);
      count++;
    });

    if (count === 0) return;
    if (count === 1) {
      mapRef.setCenter(bounds.getCenter());
      mapRef.setZoom(18);
    } else {
      mapRef.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
    }
  }

  // ============================================================
  // LEGEND
  // ============================================================

  /**
   * Collect unique abbreviation → full name mappings from all
   * location attachments.
   *
   * @returns {Array<{ abbr: string, text: string, arrow: string }>}
   */
  function collectSignKey() {
    const seen = new Map();

    locations.forEach((loc) => {
      (loc.attachments || []).forEach((att) => {
        const key = String(att.sign_id);
        if (!seen.has(key)) {
          seen.set(key, {
            text: att.sign_text || "",
            arrow: att.arrow_direction || "",
            category: att.sign_category || null,
          });
        }
      });
    });

    return Array.from(seen.values())
      .sort((a, b) => a.text.localeCompare(b.text));
  }

  /**
   * Build legend in #printLegend container.
   */
  function buildLegend() {
    const container = document.getElementById("printLegend");
    if (!container) return;
    container.replaceChildren();

    // Sign Types
    const typesSection = document.createElement("div");
    typesSection.className = "signs-print-legend-section";
    const typesLabel = document.createElement("div");
    typesLabel.className = "signs-print-legend-label";
    typesLabel.textContent = "Sign Types";
    typesSection.appendChild(typesLabel);

[
  { category: "parking", label: "Parking" },
  { category: "accessible", label: "Accessible" },
  { category: "dropoff", label: "Drop-off / Pick-up" },
  { category: "info", label: "Info" },
  { category: "warning", label: "Warning / Hazard" },
].forEach((t) => {
  const row = document.createElement("div");
  row.className = "signs-print-legend-row";

  const pill = document.createElement("span");
  pill.className = "sign-preview signs-legend-category-pill";
  if (t.category) {
    pill.classList.add(`sign-preview-category-${t.category}`);
  }
  const icon = buildCategoryIcon(t.category);
  if (icon) pill.appendChild(icon);
  row.appendChild(pill);

  const lbl = document.createElement("span");
  lbl.textContent = t.label;
  row.appendChild(lbl);
  typesSection.appendChild(row);
});

    // Status
    const statusSection = document.createElement("div");
    statusSection.className = "signs-print-legend-section";
    const statusLabel = document.createElement("div");
    statusLabel.className = "signs-print-legend-label";
    statusLabel.textContent = "Status";
    statusSection.appendChild(statusLabel);

    [
      { key: "planned", label: "Planned" },
      { key: "installed", label: "Installed" },
      { key: "removed", label: "Removed" },
    ].forEach((s) => {
      const row = document.createElement("div");
      row.className = "signs-print-legend-row";
      const dot = document.createElement("span");
      dot.className = `signs-print-legend-dot signs-print-legend-dot-${s.key}`;
      row.appendChild(dot);
      const lbl = document.createElement("span");
      lbl.textContent = s.label;
      row.appendChild(lbl);
      statusSection.appendChild(row);
    });

    // Mount Types
    const mountSection = document.createElement("div");
    mountSection.className = "signs-print-legend-section";
    const mountLabel = document.createElement("div");
    mountLabel.className = "signs-print-legend-label";
    mountLabel.textContent = "Mount Types";
    mountSection.appendChild(mountLabel);

    [
      { key: "cone", label: "Cone" },
      { key: "a-frame", label: "A-frame" },
      { key: "existing-structure", label: "Existing structure" },
    ].forEach((m) => {
      const row = document.createElement("div");
      row.className = "signs-print-legend-row";
      const icon = document.createElement("i");
      icon.className = `${MOUNT_ICONS[m.key]} signs-print-legend-mount-icon`;
      icon.setAttribute("aria-hidden", "true");
      row.appendChild(icon);
      const lbl = document.createElement("span");
      lbl.textContent = m.label;
      row.appendChild(lbl);
      mountSection.appendChild(row);
    });

    // Count
    const countSection = document.createElement("div");
    countSection.className = "signs-print-legend-section";
    const countRow = document.createElement("div");
    countRow.className = "signs-print-legend-count";
    countRow.id = "legendCount";
    countRow.textContent = "0 locations";
    countSection.appendChild(countRow);

    container.appendChild(typesSection);
    container.appendChild(statusSection);
    container.appendChild(mountSection);
    container.appendChild(countSection);
  }

  // ============================================================
  // TOOLBAR WIRING
  // ============================================================

  function wireToolbar() {
    document.querySelectorAll('input[name="mapType"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        if (mapRef) mapRef.setMapTypeId(radio.value);
      });
    });

    document.querySelectorAll(".signs-print-filter-cb").forEach((cb) => {
      cb.addEventListener("change", () => applyFilters());
    });

    const templateSel = document.getElementById("templateFilter");
    if (templateSel)
      templateSel.addEventListener("change", () => applyFilters());

    const fitBtn = document.getElementById("fitBtn");
    if (fitBtn) fitBtn.addEventListener("click", () => fitBoundsToVisible());

    document.querySelectorAll(".signs-print-layer-cb").forEach((cb) => {
      cb.addEventListener("change", () => {
        const layerId = cb.dataset.layer;
        if (layerId) togglePrintLayer(layerId, cb.checked);
      });
    });

    const printBtn = document.getElementById("printBtn");
    if (printBtn) {
      printBtn.addEventListener("click", () => {
        if (!tilesReady) return;
        window.print();
      });
    }

    const publishBtn = document.getElementById("publishBtn");
    if (publishBtn) {
      publishBtn.addEventListener("click", () => handlePublish());
    }
  }

  /**
   * Gather current filter state and POST to the publish endpoint.
   * Shows a confirmation dialog first, then displays the result.
   */
  async function handlePublish() {
    if (!tilesReady) return;

    const ok = confirm(
      "Publish the current sign map as a PDF?\n\n" +
        "This will upload to SharePoint and Blob Storage.",
    );
    if (!ok) return;

    const publishBtn = document.getElementById("publishBtn");
    if (publishBtn) {
      publishBtn.disabled = true;
      publishBtn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-1"></span>Publishing…';
    }

    // Gather current filter state
    const checkedStatuses = [];
    document.querySelectorAll(".signs-print-filter-cb").forEach((cb) => {
      if (cb.checked) checkedStatuses.push(cb.value);
    });
    const templateSel = document.getElementById("templateFilter");
    const templateVal = templateSel ? templateSel.value : "";
    const mapTypeRadio = document.querySelector(
      'input[name="mapType"]:checked',
    );
    const mapTypeVal = mapTypeRadio ? mapTypeRadio.value : "roadmap";

    const csrfMeta = document.querySelector('meta[name="csrf-token"]');
    const csrfToken = csrfMeta ? csrfMeta.getAttribute("content") : "";

    try {
      const res = await fetch("/signs/map/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          status: checkedStatuses.join(","),
          template: templateVal || undefined,
          mapType: mapTypeVal,
        }),
      });

      const data = await res.json();

      if (data.success) {
        const toast = document.createElement("div");
        toast.className = "signs-publish-toast";
        toast.innerHTML = [
          '<i class="fa-solid fa-circle-check me-2"></i>',
          "<strong>Published!</strong> ",
          data.filename,
          data.sharePointUrl
            ? ' &mdash; <a href="' +
              data.sharePointUrl +
              '" target="_blank" rel="noopener noreferrer">Open in SharePoint</a>'
            : "",
        ].join("");
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add("signs-publish-toast--visible"));
        setTimeout(() => {
          toast.classList.remove("signs-publish-toast--visible");
          setTimeout(() => toast.remove(), 400);
        }, 8000);
      } else {
        alert("Publish failed: " + (data.error || "Unknown error."));
      }
    } catch (err) {
      console.error("Publish error:", err);
      alert("Publish failed: " + err.message);
    } finally {
      if (publishBtn) {
        publishBtn.disabled = false;
        publishBtn.innerHTML =
          '<i class="fa-solid fa-cloud-arrow-up me-1"></i>Publish';
      }
    }
  }

  // ============================================================
  // INIT
  // ============================================================

  function init() {
    const root = document.getElementById("signsMapRoot");
    if (!root) return;

    const apiKey = root.getAttribute("data-api-key") || "";
    const centerLat = Number(root.getAttribute("data-center-lat"));
    const centerLng = Number(root.getAttribute("data-center-lng"));
    const centerZoom = Number(root.getAttribute("data-center-zoom")) || 17;

    const dataEl = document.getElementById("signsMapBootstrap");
    if (dataEl) {
      try {
        const parsed = JSON.parse(dataEl.textContent || "{}");
        signs = Array.isArray(parsed.signs) ? parsed.signs : [];
        locations = Array.isArray(parsed.locations) ? parsed.locations : [];
        arrows = Array.isArray(parsed.arrows) ? parsed.arrows : [];
        mapOverlays = Array.isArray(parsed.mapOverlays) ? parsed.mapOverlays : [];
      } catch (err) {
        console.error("Failed to parse signsMapBootstrap JSON:", err);
      }
    }

    const dateEl = document.getElementById("printDate");
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }

    applyQueryParamFilters();
    wireToolbar();

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
