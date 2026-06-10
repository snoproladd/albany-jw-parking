/**
 * @file public/js/signsMapOverlays.js
 * @description Shared renderer for building/landmark polygon overlays.
 *
 * Called by both signsMap.js and signsMapPrint.js after Google Maps
 * initialisation. Draws semi-transparent polygons with labels
 * centered on each shape.
 *
 * Usage:
 *   window.signsMapOverlays.render(mapRef, overlaysArray);
 */

(() => {
  "use strict";

  /**
   * Render building polygon overlays on a Google Map instance.
   *
   * @param {google.maps.Map} map - The map to draw on.
   * @param {Array<{ id: string, name: string, color: string, fillOpacity?: number, coords: Array<{ lat: number, lng: number }> }>} overlays
   * @returns {Array<{ polygon: google.maps.Polygon, label: google.maps.marker.AdvancedMarkerElement }>}
   */
  function render(map, overlays) {
    if (!map || !Array.isArray(overlays)) return [];

    const entries = [];

    overlays.forEach((overlay) => {
      if (!overlay.coords || overlay.coords.length < 3) return;

      const polygon = new google.maps.Polygon({
        paths: overlay.coords,
        strokeColor: overlay.color || "#0d6efd",
        strokeOpacity: 0.7,
        strokeWeight: 2,
        fillColor: overlay.color || "#0d6efd",
        fillOpacity: overlay.fillOpacity ?? 0.12,
        map: map,
        clickable: false,
        zIndex: 1,
      });

      /* Centre the label inside the polygon bounding box. */
      const bounds = new google.maps.LatLngBounds();
      overlay.coords.forEach((c) => bounds.extend(c));
      const center = bounds.getCenter();

      const labelEl = document.createElement("div");
      labelEl.className = "signs-overlay-label";
      labelEl.textContent = overlay.name;
      labelEl.dataset.overlayId = overlay.id;

      const label = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: center,
        content: labelEl,
        zIndex: -1,
        collisionBehavior:
          google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY,
      });

      entries.push({ polygon, label });
    });

    return entries;
  }

  window.signsMapOverlays = { render };
})();
