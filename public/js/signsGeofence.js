/**
 * @file public/js/signsGeofence.js
 * @description Geofencing companion for the Sign Map page. Adds continuous
 *   GPS tracking with proximity alerts and quick status toggles when the
 *   user is within range of a sign placement.
 *
 *   Requires the API surface exposed by signsMap.js at window.signsMapApi.
 *   Only activates for users with manageSigns permission.
 *
 * Activation flow:
 *   1. User taps the floating "Track my location" button (FAB).
 *   2. watchPosition starts; a blue dot appears on the map.
 *   3. When within PROXIMITY_RADIUS_M of a placement, a proximity bar
 *      slides up with the sign info and one-tap status buttons.
 *   4. Tapping a status button fires quickSetStatus via the signsMap API.
 *   5. Tapping the FAB again stops tracking and cleans up.
 *
 * Public surface: none (all state is private to the IIFE).
 */

(() => {
  "use strict";

  // ================================================================
  // CONSTANTS
  // ================================================================

  /** Proximity trigger radius in metres. */
  const PROXIMITY_RADIUS_M = 75;

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

  /** placement_id of the nearest in-range placement, or null. */
  let activeProxId = null;

  /**
   * Set of placement_ids the user has dismissed during this tracking
   * session. Cleared when tracking stops or restarts.
   */
  const dismissedIds = new Set();

  /** Whether the map should auto-pan to follow the user's position. */
  let followMode = true;

  /** Timer handle for re-enabling follow after user map interaction. */
  let followTimer = null;

  /** Safety timeout handle from hideProximityBar, cleared on re-show. */
  let hideBarTimer = null;

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
   * Format a distance in metres as a human-readable string.
   *
   * @param {number} m  Distance in metres.
   * @returns {string}  e.g. "42 m" or "1.2 km".
   */
  function fmtDist(m) {
    if (m < 1000) return `${Math.round(m)} m`;
    return `${(m / 1000).toFixed(1)} km`;
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
   * GPS position. Uses AdvancedMarkerElement with custom DOM content
   * to match the existing marker architecture in signsMap.js.
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
   * Build and show the proximity bar for a placement that just entered
   * the detection radius.
   *
   * @param {object} placement  In-memory placement object from the API.
   * @param {number} distanceM  Current distance in metres.
   */
  function showProximityBar(placement, distanceM) {
    if (!proxBar || !proxInfo || !proxActions) return;

    // ── Info row: sign preview + distance ──────────────────────
    proxInfo.replaceChildren();

    const preview = document.createElement("div");
    preview.className = "sign-preview signs-proximity-preview";

    const textSpan = document.createElement("span");
    textSpan.className = "sign-preview-text";
    textSpan.textContent = placement.sign_text || "";
    preview.appendChild(textSpan);

    const dir = placement.arrow_direction;
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
    buildProximityPhoto(placement);

    // ── Status buttons ─────────────────────────────────────────
    buildStatusButtons(placement);

    // ── Raise the FAB above the bar ────────────────────────────
    if (fabBtn) fabBtn.classList.add("signs-geofence-fab-raised");

    // ── Cancel any pending hide timer from a prior hideProximityBar call
    if (hideBarTimer !== null) {
      clearTimeout(hideBarTimer);
      hideBarTimer = null;
    }

    // ── Slide in ───────────────────────────────────────────────
    proxBar.classList.remove("d-none");
    void proxBar.offsetWidth; // force reflow so transition fires
    proxBar.classList.add("signs-proximity-bar-open");
  }

  /**
   * Build the three status toggle buttons inside the proximity bar's
   * action area. Can be called repeatedly to re-render after a status
   * change without rebuilding the entire bar.
   *
   * @param {object} placement  In-memory placement object.
   */
  function buildStatusButtons(placement) {
    if (!proxActions) return;
    proxActions.replaceChildren();

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
      if (placement.status === status) {
        btn.classList.add("signs-proximity-status-btn-active");
      }

      const iconEl = document.createElement("i");
      iconEl.className = icon;
      iconEl.setAttribute("aria-hidden", "true");
      btn.appendChild(iconEl);
      btn.appendChild(document.createTextNode(label));

      btn.addEventListener("click", async () => {
        if (placement.status === status) return;
        try {
          await api.quickSetStatus(placement.placement_id, status);
          // quickSetStatus mutates the in-memory placement,
          // so re-render the buttons to reflect the new state.
          buildStatusButtons(placement);
        } catch (err) {
          console.error("Proximity status update error:", err);
        }
      });

      proxActions.appendChild(btn);
    });
  }

  /**
   * Build the photo thumbnail inside the proximity bar. Shows a small
   * preview that expands on tap with a chevron to collapse.
   *
   * @param {object} placement  In-memory placement object.
   */
  function buildProximityPhoto(placement) {
    if (!proxPhoto) return;
    proxPhoto.replaceChildren();

    if (!placement.photo_url) {
      proxPhoto.classList.add("d-none");
      return;
    }

    const thumb = document.createElement("img");
    thumb.className = "signs-proximity-photo-thumb";
    thumb.alt = "Sign placement photo";
    thumb.src = `/signs/placements/${placement.placement_id}/photo?t=${Date.now()}`;

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
   * @param {number} distanceM
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

    // Lower the FAB back to its default position
    if (fabBtn) fabBtn.classList.remove("signs-geofence-fab-raised");

    proxBar.classList.remove("signs-proximity-bar-open");

    /**
     * After the transition finishes, hide the element from the
     * layout entirely. A safety timeout ensures d-none is applied
     * even if transitionend doesn't fire (e.g. element was already
     * at translateY(100%) and no transition occurred).
     */
    const onEnd = () => {
      proxBar.classList.add("d-none");
      proxBar.removeEventListener("transitionend", onEnd);
    };
    proxBar.addEventListener("transitionend", onEnd, { once: true });
    hideBarTimer = setTimeout(() => proxBar.classList.add("d-none"), 350);
  }

  // ================================================================
  // PROXIMITY DETECTION
  // ================================================================

  /**
   * Scan all placements and show / update / hide the proximity bar
   * depending on which (if any) are within the detection radius.
   */
  function checkProximity() {
    if (!userPos) return;
    const placements = api.getPlacements();

    let nearest = null;
    let nearestDist = Infinity;

    for (const p of placements) {
      if (dismissedIds.has(p.placement_id)) continue;
      const dist = haversineM(
        userPos.lat,
        userPos.lng,
        Number(p.latitude),
        Number(p.longitude),
      );
      if (dist < PROXIMITY_RADIUS_M && dist < nearestDist) {
        nearest = p;
        nearestDist = dist;
      }
    }

    if (nearest) {
      if (activeProxId !== nearest.placement_id) {
        // New placement entered range — select it and show the bar
        activeProxId = nearest.placement_id;
        api.selectMarker(nearest.placement_id);
        showProximityBar(nearest, nearestDist);
      } else {
        // Same placement still nearest — just update distance
        updateProximityDistance(nearestDist);
      }
    } else if (activeProxId !== null) {
      // User left all proximity zones
      activeProxId = null;
      hideProximityBar();
    }
  }

  // ================================================================
  // FOLLOW MODE
  // ================================================================

  /**
   * Called when the user manually interacts with the map (pan, zoom).
   * Temporarily disables auto-pan so the map doesn't fight the user,
   * then re-enables after FOLLOW_RESUME_MS of inactivity.
   */
  function onMapInteraction() {
    if (!tracking) return;
    followMode = false;
    clearFollowTimer();
    followTimer = setTimeout(() => {
      followMode = true;
    }, FOLLOW_RESUME_MS);
  }

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
   * Success callback for watchPosition. Updates the blue dot,
   * checks proximity, and optionally pans the map.
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

    if (followMode) {
      const map = api.getMapRef();
      if (map) map.panTo({ lat: userPos.lat, lng: userPos.lng });
    }
  }

  /**
   * Error callback for watchPosition. Logs the error and stops
   * tracking if permission was denied.
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
    followMode = true;
    dismissedIds.clear();
    activeProxId = null;
    updateFabState();

    watchId = navigator.geolocation.watchPosition(
      onPosition,
      onPositionError,
      GEO_OPTIONS,
    );

    // Periodic recheck so placement moves made while tracking are
    // detected without waiting for the next GPS position update.
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
    proxPhoto   = document.getElementById("signsProximityPhoto");
    proxDismiss = document.getElementById("signsProximityDismiss");

    if (!fabBtn) return;

    // Once the map is available, move the FAB into the Google Maps
    // control stack so it sits above the zoom / Street View controls
    // instead of overlapping them. Poll briefly since the map loads
    // asynchronously after bootstrap().
    const attachToMap = () => {
      const map = api.getMapRef();
      if (!map) {
        setTimeout(attachToMap, 500);
        return;
      }
      // Google Maps applies all:revert on custom control containers,
      // which collapses class-based sizing. Inline styles survive
      // the reset because they have highest specificity.
      const s = fabBtn.style;
      s.width         = "52px";
      s.height        = "52px";
      s.minWidth      = "52px";
      s.minHeight     = "52px";
      s.borderRadius  = "50%";
      s.border        = "none";
      s.background    = "#fff";
      s.boxShadow     = "0 2px 8px rgba(0,0,0,0.25)";
      s.color         = "#6c757d";
      s.fontSize      = "1.25rem";
      s.display       = "flex";
      s.alignItems    = "center";
      s.justifyContent = "center";
      s.cursor        = "pointer";
      s.padding       = "0";
      s.margin        = "0 10px 10px 0";
      s.position      = "relative";

      const wrapper = document.createElement("div");
      wrapper.appendChild(fabBtn);
      fabBtn.classList.remove("d-none");
      map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(wrapper);
    };
    attachToMap();

    // Toggle tracking on FAB click
    fabBtn.addEventListener("click", () => {
      if (tracking) {
        stopTracking();
      } else {
        startTracking();
      }
      // Release focus so keyboard events (Shift+drag, arrow nudge)
      // aren't swallowed by the Maps control container.
      fabBtn.blur();
    });

    // Dismiss bar for the current placement; re-check for others
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

    // Pause follow mode when the user manually pans or zooms
    const mapEl = document.getElementById("googleMap");
    if (mapEl) {
      mapEl.addEventListener("pointerdown", onMapInteraction);
      mapEl.addEventListener("wheel", onMapInteraction);
    }

    // Clean up on page unload
    window.addEventListener("beforeunload", stopTracking);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
