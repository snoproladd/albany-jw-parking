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

  // ============================================================
  // MODULE STATE
  // ============================================================

  /** @type {google.maps.Map|null} */
  let mapRef = null;
  let signs = [];
  let locations = [];
  const markerEntries = new Map();
  let tilesReady = false;

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

    mapRef = new google.maps.Map(mapEl, {
      center: { lat: center.lat, lng: center.lng },
      zoom: center.zoom,
      mapTypeId: "roadmap",
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
    });

    window.addEventListener("beforeprint", () => {
      if (mapRef) google.maps.event.trigger(mapRef, "resize");
    });
    window.addEventListener("afterprint", () => {
      if (mapRef) google.maps.event.trigger(mapRef, "resize");
    });

    locations.forEach((loc) => addMarkerForLocation(loc));
    buildLegend();
    applyFilters();
  }

  // ============================================================
  // MARKER RENDERING
  // ============================================================

  /**
   * Build print marker content for a location.
   * Shows the top sign's abbreviation + arrow.
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

    const sign = document.createElement("div");
    sign.className = "sign-preview signs-map-marker-sign";

    const text = document.createElement("span");
    text.className = "sign-preview-text";
    text.textContent = getTopAbbreviation(loc);
    sign.appendChild(text);

    const dir = getTopArrow(loc);
    const arrow = document.createElement("span");
    arrow.className = "sign-preview-arrow";
    if (dir === "destination") {
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-location-dot";
      icon.setAttribute("aria-hidden", "true");
      arrow.appendChild(icon);
    } else if (dir && ARROW_GLYPHS[dir]) {
      arrow.textContent = ARROW_GLYPHS[dir];
    }
    sign.appendChild(arrow);

    // Stacked badge if multiple attachments
    if ((loc.attachments || []).length > 1) {
      const badge = document.createElement("span");
      badge.className = "signs-print-marker-count";
      badge.textContent = `×${loc.attachments.length}`;
      wrapper.appendChild(badge);
    }

    wrapper.appendChild(sign);
    return wrapper;
  }

  /**
   * @param {object} loc
   */
  function addMarkerForLocation(loc) {
    if ((loc.attachments || []).length === 0) return;

    const content = buildPrintMarkerContent(loc);
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
  function applyFilters() {
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

    fitBoundsToVisible();
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
        const abbr =
          att.abbreviation || (att.sign_text || "?").slice(0, 4).toUpperCase();
        if (!seen.has(abbr)) {
          seen.set(abbr, {
            text: att.sign_text || "",
            arrow: att.arrow_direction || "",
          });
        }
      });
    });

    return Array.from(seen.entries())
      .map(([abbr, v]) => ({ abbr, text: v.text, arrow: v.arrow }))
      .sort((a, b) => a.abbr.localeCompare(b.abbr));
  }

  /**
   * Build legend in #printLegend container.
   */
  function buildLegend() {
    const container = document.getElementById("printLegend");
    if (!container) return;
    container.replaceChildren();

    // Sign Key
    const keySection = document.createElement("div");
    keySection.className = "signs-print-legend-section";
    const keyLabel = document.createElement("div");
    keyLabel.className = "signs-print-legend-label";
    keyLabel.textContent = "Sign Key";
    keySection.appendChild(keyLabel);

    const keyList = document.createElement("div");
    keyList.className = "signs-print-legend-key-list";

    collectSignKey().forEach((entry) => {
      const row = document.createElement("div");
      row.className = "signs-print-legend-key-row";

      const abbrSpan = document.createElement("span");
      abbrSpan.className = "signs-print-legend-key-abbr";
      abbrSpan.textContent = entry.abbr;
      row.appendChild(abbrSpan);

      if (entry.arrow) {
        const arrowSpan = document.createElement("span");
        arrowSpan.className = "signs-print-legend-key-arrow";
        if (entry.arrow === "destination") {
          arrowSpan.textContent = "\uD83D\uDCCD";
        } else if (ARROW_GLYPHS[entry.arrow]) {
          arrowSpan.textContent = ARROW_GLYPHS[entry.arrow];
        }
        row.appendChild(arrowSpan);
      }

      const sep = document.createElement("span");
      sep.className = "signs-print-legend-key-sep";
      sep.textContent = "\u2014";
      row.appendChild(sep);

      const nameSpan = document.createElement("span");
      nameSpan.className = "signs-print-legend-key-name";
      nameSpan.textContent = entry.text;
      row.appendChild(nameSpan);

      keyList.appendChild(row);
    });
    keySection.appendChild(keyList);

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

    // Colours + Count
    const colourSection = document.createElement("div");
    colourSection.className = "signs-print-legend-section";
    const colourLabel = document.createElement("div");
    colourLabel.className = "signs-print-legend-label";
    colourLabel.textContent = "Marker Colours";
    colourSection.appendChild(colourLabel);

    const swatches = document.createElement("div");
    swatches.className = "signs-print-legend-swatches";
    MARKER_COLORS.forEach((c) => {
      const swatch = document.createElement("span");
      swatch.className = "signs-print-legend-swatch";
      swatch.style.setProperty("background", c.hex);
      swatch.title = c.key.charAt(0).toUpperCase() + c.key.slice(1);
      swatches.appendChild(swatch);
    });
    colourSection.appendChild(swatches);

    const countRow = document.createElement("div");
    countRow.className = "signs-print-legend-count";
    countRow.id = "legendCount";
    countRow.textContent = "0 locations";
    colourSection.appendChild(countRow);

    container.appendChild(keySection);
    container.appendChild(statusSection);
    container.appendChild(colourSection);
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

    const printBtn = document.getElementById("printBtn");
    if (printBtn) {
      printBtn.addEventListener("click", () => {
        if (!tilesReady) return;
        window.print();
      });
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
