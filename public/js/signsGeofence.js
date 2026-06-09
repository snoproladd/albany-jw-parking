/**
 * @file public/js/signsGeofence.js
 * @description Geofencing companion for the Sign Map page. Adds continuous
 *   GPS tracking with proximity alerts and quick status toggles when the
 *   user is within range of a sign location.
 *
 *   Requires the API surface exposed by signsMap.js at window.signsMapApi.
 *   Only activates for users with manageSigns permission.
 *
 * Activation flow:
 *   1. User taps the floating "Track my location" button (FAB).
 *   2. watchPosition starts; a blue dot appears on the map.
 *   3. When within PROXIMITY_RADIUS_M of a location, a proximity bar
 *      slides up with the sign info and one-tap status buttons.
 *   4. Tapping a status button fires quickSetLocationStatus via the API.
 *   5. Tapping the FAB again stops tracking and cleans up.
 *
 * Public surface: none (all state is private to the IIFE).
 */

(() => {
  "use strict";

  // ================================================================
  // CONSTANTS
  // ================================================================

  /** Proximity trigger radius in metres (≈ 246 ft). */
  const PROXIMITY_RADIUS_M = 75;

  /** Metres-to-feet conversion factor. */
  const M_TO_FT = 3.28084;

  /**
   * Delay (ms) before re-enabling auto-pan after the user manually
   * interacts with the map (pan / zoom).
   */
  const FOLLOW_RESUME_MS = 5000;

  /** navigator.geolocation.watchPosition options. */
  const GEO_OPTIONS = {
    enableHighAccuracy: true,
    timeout: 30000,
    maximumAge: 3000,
  };

  /**
   * Unicode glyphs by direction token. Duplicated from signsMap.js
   * so this module is self-contained (the signsMap IIFE doesn't
   * export them).
   */
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

  // ================================================================
  // STATE
  // ================================================================

  /** @type {typeof window.signsMapApi | null} */
  let api = null;

  /** Geolocation watch handle, or null when not tracking. */
  let watchId = null;

  /** Whether tracking is currently active. */
  let tracking = false;

  /** AdvancedMarkerElement for the user's blue-dot position. */
  let userMarker = null;

  /** Last known position: { lat, lng, accuracy } or null. */
  let userPos = null;

  /** location_id of the nearest in-range location, or null. */
  let activeProxId = null;

  /**
   * Set of location_ids the user has dismissed during this tracking
   * session. Cleared when tracking stops or restarts.
   */
  const dismissedIds = new Set();

  /** Whether the map should auto-pan to follow the user's position. */
  let followMode = true;

  /** Timer handle for re-enabling follow after user map interaction. */
  let followTimer = null;

  /** Safety timeout handle from hideProximityBar, cleared on re-show. */
  let hideBarTimer = null;

  /** Named transitionend handler from hideProximityBar, cleared on re-show. */
  let hideEndHandler = null;

  /** Interval handle for periodic proximity rechecks between GPS updates. */
  let proximityInterval = null;

  // ── DOM refs (set once in init) ─────────────────────────────

  /** @type {HTMLButtonElement|null} */
  let fabBtn = null;

  /** @type {HTMLElement|null} */
  let proxBar = null;

  /** @type {HTMLElement|null} */
  let proxInfo = null;

  /** @type {HTMLElement|null} */
  let proxActions = null;

  /** @type {HTMLElement|null} */
  let proxPhoto = null;

  /** @type {HTMLButtonElement|null} */
  let proxDismiss = null;

  // ================================================================
  // HELPERS
  // ================================================================

  /**
   * Haversine distance between two lat/lng pairs, in metres.
   *
   * @param {number} lat1
   * @param {number} lng1
   * @param {number} lat2
   * @param {number} lng2
   * @returns {number}
   */
  function haversineM(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Format a distance (in metres) as a human-readable string in feet.
   *
   * @param {number} m  Distance in metres.
   * @returns {string}  e.g. "142 ft".
   */
  function fmtDist(m) {
    const ft = Math.round(m * M_TO_FT);
    return `${ft} ft`;
  }

  /**
   * Derive a display label for a location from its attachments.
   *
   * @param {object} loc
   * @returns {string}
   */
  function locationLabel(loc) {
    const atts = loc.attachments || [];
    if (!atts.length) return "Empty location";
    const first = atts[0].sign_text || "—";
    return atts.length > 1 ? `${first} (+${atts.length - 1})` : first;
  }

  // ================================================================
  // FAB STATE
  // ================================================================

  /**
   * Sync the FAB button's visual state (icon, classes, ARIA) to the
   * current tracking flag.
   */
  function updateFabState() {
    if (!fabBtn) return;
    if (tracking) {
      fabBtn.classList.add("signs-geofence-fab-active");
      fabBtn.setAttribute("aria-pressed", "true");
      fabBtn.setAttribute("title", "Stop tracking");
      fabBtn.style.background = "#0d6efd";
      fabBtn.style.color = "#fff";
      fabBtn.style.boxShadow = "0 2px 12px rgba(13,110,253,0.45)";
    } else {
      fabBtn.classList.remove("signs-geofence-fab-active");
      fabBtn.setAttribute("aria-pressed", "false");
      fabBtn.setAttribute("title", "Track my location");
      fabBtn.style.background = "#fff";
      fabBtn.style.color = "#6c757d";
      fabBtn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.25)";
    }
  }

  // ================================================================
  // BLUE DOT
  // ================================================================

  /**
   * Create or reposition the blue-dot marker at the user's current
   * GPS position.
   */
  function updateUserMarker() {
    const map = api.getMapRef();
    if (!map || !userPos) return;

    if (!userMarker) {
      const container = document.createElement("div");
      container.className = "signs-geofence-dot-wrap";

      const ring = document.createElement("div");
      ring.className = "signs-geofence-dot-ring";
      container.appendChild(ring);

      const dot = document.createElement("div");
      dot.className = "signs-geofence-dot";
      container.appendChild(dot);

      userMarker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: userPos.lat, lng: userPos.lng },
        content: container,
        zIndex: 9999,
      });
    } else {
      userMarker.position = { lat: userPos.lat, lng: userPos.lng };
    }
  }

  /**
   * Remove the blue-dot marker from the map and release the reference.
   */
  function removeUserMarker() {
    if (userMarker) {
      userMarker.map = null;
      userMarker = null;
    }
  }

  // ================================================================
  // PROXIMITY BAR
  // ================================================================

  /**
   * Build and show the proximity bar for a location that just entered
   * the detection radius.
   *
   * @param {object} loc       In-memory location object from the API.
   * @param {number} distanceM Current distance in metres.
   */
  function showProximityBar(loc, distanceM) {
    if (!proxBar || !proxInfo || !proxActions) return;

    // ── Info row: sign preview + distance ──────────────────────
    proxInfo.replaceChildren();

    const preview = document.createElement("div");
    preview.className = "sign-preview signs-proximity-preview";

    const textSpan = document.createElement("span");
    textSpan.className = "sign-preview-text";
    textSpan.textContent = locationLabel(loc);
    preview.appendChild(textSpan);

    // Show arrow glyph from first attachment if present
    const firstAtt = (loc.attachments || [])[0];
    const dir = firstAtt?.arrow_direction;
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
      preview.appendChild(arrowSpan);
    }
    proxInfo.appendChild(preview);

    const distEl = document.createElement("span");
    distEl.className = "signs-proximity-distance";
    distEl.id = "signsProximityDist";
    distEl.textContent = fmtDist(distanceM);
    proxInfo.appendChild(distEl);

    // ── Photo thumbnail ────────────────────────────────────────
    buildProximityPhoto(loc);

    // ── Status buttons ─────────────────────────────────────────
    buildStatusButtons(loc);

    // ── Raise the FAB above the bar ────────────────────────────
    if (fabBtn) fabBtn.classList.add("signs-geofence-fab-raised");

    // ── Cancel any pending hide cleanup from a prior call
    if (hideBarTimer !== null) {
      clearTimeout(hideBarTimer);
      hideBarTimer = null;
    }
    if (hideEndHandler) {
      proxBar.removeEventListener("transitionend", hideEndHandler);
      hideEndHandler = null;
    }

    // ── Slide in ───────────────────────────────────────────────
    proxBar.classList.remove("d-none");
    void proxBar.offsetWidth; // force reflow so transition fires
    proxBar.classList.add("signs-proximity-bar-open");
  }

  /**
   * Build the three status toggle buttons inside the proximity bar.
   * Can be called repeatedly to re-render after a status change.
   *
   * @param {object} loc  In-memory location object.
   */
  function buildStatusButtons(loc) {
    if (!proxActions) return;
    proxActions.replaceChildren();

    const currentStatus = api.deriveStatus(loc);

    const defs = [
      { status: "planned", icon: "fa-solid fa-circle-dot", label: "Planned" },
      {
        status: "installed",
        icon: "fa-solid fa-circle-check",
        label: "Installed",
      },
      { status: "removed", icon: "fa-solid fa-circle-xmark", label: "Removed" },
    ];

    defs.forEach(({ status, icon, label }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `signs-proximity-status-btn signs-proximity-status-btn-${status}`;
      if (currentStatus === status) {
        btn.classList.add("signs-proximity-status-btn-active");
      }

      const iconEl = document.createElement("i");
      iconEl.className = icon;
      iconEl.setAttribute("aria-hidden", "true");
      btn.appendChild(iconEl);
      btn.appendChild(document.createTextNode(label));

      btn.addEventListener("click", async () => {
        if (currentStatus === status) return;
        try {
          await api.quickSetLocationStatus(loc.location_id, status);
          buildStatusButtons(loc);
        } catch (err) {
          console.error("Proximity status update error:", err);
        }
      });

      proxActions.appendChild(btn);
    });
  }

  /**
   * Build the photo thumbnail inside the proximity bar.
   *
   * @param {object} loc  In-memory location object.
   */
  function buildProximityPhoto(loc) {
    if (!proxPhoto) return;
    proxPhoto.replaceChildren();

    if (!loc.photo_url) {
      proxPhoto.classList.add("d-none");
      return;
    }

    const thumb = document.createElement("img");
    thumb.className = "signs-proximity-photo-thumb";
    thumb.alt = "Location photo";
    thumb.src = `/signs/locations/${loc.location_id}/photo?t=${Date.now()}`;

    const collapseBtn = document.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.className = "signs-proximity-photo-collapse d-none";
    collapseBtn.setAttribute("aria-label", "Collapse photo");
    const chevron = document.createElement("i");
    chevron.className = "fa-solid fa-chevron-down";
    chevron.setAttribute("aria-hidden", "true");
    collapseBtn.appendChild(chevron);

    thumb.addEventListener("click", () => {
      const expanded = proxPhoto.classList.toggle(
        "signs-proximity-photo-expanded",
      );
      collapseBtn.classList.toggle("d-none", !expanded);
    });

    collapseBtn.addEventListener("click", () => {
      proxPhoto.classList.remove("signs-proximity-photo-expanded");
      collapseBtn.classList.add("d-none");
    });

    proxPhoto.appendChild(thumb);
    proxPhoto.appendChild(collapseBtn);
    proxPhoto.classList.remove("d-none");
  }

  /**
   * Update only the distance readout in an already-visible bar.
   *
   * @param {number} distanceM  Distance in metres (converted to ft for display).
   */
  function updateProximityDistance(distanceM) {
    const el = document.getElementById("signsProximityDist");
    if (el) el.textContent = fmtDist(distanceM);
  }

  /**
   * Hide the proximity bar with a slide-out transition.
   */
  function hideProximityBar() {
    if (!proxBar) return;

    if (fabBtn) fabBtn.classList.remove("signs-geofence-fab-raised");

    proxBar.classList.remove("signs-proximity-bar-open");

    // Track the listener so showProximityBar can cancel it if
    // the bar re-opens before the transition completes.
    hideEndHandler = () => {
      proxBar.classList.add("d-none");
      hideEndHandler = null;
    };
    proxBar.addEventListener("transitionend", hideEndHandler, { once: true });
    hideBarTimer = setTimeout(() => {
      proxBar.classList.add("d-none");
      hideEndHandler = null;
    }, 350);
  }

  // ================================================================
  // PROXIMITY DETECTION
  // ================================================================

  /**
   * Scan all locations and show / update / hide the proximity bar
   * depending on which (if any) are within the detection radius.
   */
  function checkProximity() {
    if (!userPos) return;
    const locs = api.getLocations();

    let nearest = null;
    let nearestDist = Infinity;

    for (const loc of locs) {
      if (dismissedIds.has(loc.location_id)) continue;
      const dist = haversineM(
        userPos.lat,
        userPos.lng,
        Number(loc.latitude),
        Number(loc.longitude),
      );
      if (dist < PROXIMITY_RADIUS_M && dist < nearestDist) {
        nearest = loc;
        nearestDist = dist;
      }
    }

    if (nearest) {
      if (activeProxId !== nearest.location_id) {
        activeProxId = nearest.location_id;
        api.selectMarker(nearest.location_id, { noPan: true });
        showProximityBar(nearest, nearestDist);
      } else {
        updateProximityDistance(nearestDist);
      }
    } else if (activeProxId !== null) {
      activeProxId = null;
      hideProximityBar();
    }
  }

  // ================================================================
  // FOLLOW MODE
  // ================================================================

  /**
   * Cancel the pending follow-resume timer.
   */
  function clearFollowTimer() {
    if (followTimer !== null) {
      clearTimeout(followTimer);
      followTimer = null;
    }
  }

  // ================================================================
  // TRACKING LIFECYCLE
  // ================================================================

  /**
   * Success callback for watchPosition.
   *
   * @param {GeolocationPosition} pos
   */
  function onPosition(pos) {
    userPos = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    };

    updateUserMarker();
    checkProximity();
  }

  /**
   * Error callback for watchPosition.
   *
   * @param {GeolocationPositionError} err
   */
  function onPositionError(err) {
    console.error("Geofence position error:", err.message);
    if (err.code === err.PERMISSION_DENIED) {
      stopTracking();
    }
  }

  /**
   * Begin GPS tracking and enable the proximity detection system.
   */
  function startTracking() {
    if (!navigator.geolocation) {
      window.alert("Geolocation is not supported by this browser.");
      return;
    }

    const map = api.getMapRef();
    if (!map) {
      window.alert("Map is still loading. Try again in a moment.");
      return;
    }

    tracking = true;
    followMode = false;
    dismissedIds.clear();
    activeProxId = null;
    updateFabState();

    watchId = navigator.geolocation.watchPosition(
      onPosition,
      onPositionError,
      GEO_OPTIONS,
    );

    proximityInterval = setInterval(checkProximity, 4000);
  }

  /**
   * Stop GPS tracking and clean up all geofencing UI elements.
   */
  function stopTracking() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    tracking = false;
    followMode = false;
    clearFollowTimer();
    if (proximityInterval !== null) {
      clearInterval(proximityInterval);
      proximityInterval = null;
    }
    removeUserMarker();
    hideProximityBar();
    activeProxId = null;
    userPos = null;
    dismissedIds.clear();
    updateFabState();
  }

  // ================================================================
  // INITIALISATION
  // ================================================================

  /**
   * Wire up the geofencing UI. Called on DOMContentLoaded, after
   * signsMap.js has bootstrapped and set window.signsMapApi.
   */
  function init() {
    api = window.signsMapApi;
    if (!api || !api.canManage()) return;

    fabBtn = document.getElementById("signsGeofenceFab");
    proxBar = document.getElementById("signsProximityBar");
    proxInfo = document.getElementById("signsProximityInfo");
    proxActions = document.getElementById("signsProximityActions");
    proxPhoto = document.getElementById("signsProximityPhoto");
    proxDismiss = document.getElementById("signsProximityDismiss");

    if (!fabBtn) return;

    // Push the FAB into Google Maps' control stack so it sits
    // above the zoom controls without overlapping. Inline styles
    // are required because Maps applies all:revert on control
    // containers, which collapses class-based sizing.
    const attachToMap = () => {
      const map = api.getMapRef();
      if (!map) {
        setTimeout(attachToMap, 500);
        return;
      }
      const s = fabBtn.style;
      s.width = "52px";
      s.height = "52px";
      s.minWidth = "52px";
      s.minHeight = "52px";
      s.borderRadius = "50%";
      s.border = "none";
      s.background = "#fff";
      s.boxShadow = "0 2px 8px rgba(0,0,0,0.25)";
      s.color = "#6c757d";
      s.fontSize = "1.25rem";
      s.display = "flex";
      s.alignItems = "center";
      s.justifyContent = "center";
      s.cursor = "pointer";
      s.padding = "0";
      s.margin = "0 10px 10px 0";
      s.position = "relative";

      const wrapper = document.createElement("div");
      wrapper.appendChild(fabBtn);
      fabBtn.classList.remove("d-none");
      map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(wrapper);
    };
    attachToMap();

    fabBtn.addEventListener("click", () => {
      if (tracking) {
        stopTracking();
      } else {
        startTracking();
      }
      fabBtn.blur();
    });

    if (proxDismiss) {
      proxDismiss.addEventListener("click", () => {
        if (activeProxId !== null) {
          dismissedIds.add(activeProxId);
          activeProxId = null;
          hideProximityBar();
          checkProximity();
        }
      });
    }

    window.addEventListener("beforeunload", stopTracking);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
