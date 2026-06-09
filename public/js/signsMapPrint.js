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
