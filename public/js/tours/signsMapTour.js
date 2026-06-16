/**
 * @fileoverview signsMapTour.js
 * Shepherd.js tour for the Sign Map page (/signs/map).
 * Walks through sidebar filters, layer toggles, markers, adding/editing
 * locations, traffic arrows, and the print/geofence tools.
 *
 * @module signsMapTour
 */

import {
  createTour,
  navButtons,
  startButtons,
  finishButtons,
  registerTour,
} from "./tourBase.js";

/**
 * Builds and returns the Sign Map tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildSignsMapTour() {
  const tour = createTour();

  const canManage = !!document.getElementById("addLocationBtn");
  const hasLocations = !!document.querySelector(".signs-sidebar-location-row");
  const hasLayers = !!document.getElementById("layerTrafficArrows");
  const hasLegend = !!document.getElementById("mapLegendTab");
  const hasGeofence = !!document.getElementById("signsGeofenceFab");

  const steps = [];

  steps.push({
    id: "sm-welcome",
    title: "Sign Map",
    text: "The Sign Map shows every sign location as a marker on a Google Map. Each marker displays the signs attached to that spot — stacked top-to-bottom in mounting order. The sidebar on the left has filters, layer controls, and the location list.",
    buttons: null,
  });

  steps.push({
    id: "sm-status-filter",
    title: "Status filter",
    text: "Filter locations by status: <strong>Planned</strong> (orange), <strong>Installed</strong> (green), or <strong>Removed</strong> (red). A location's status is derived from its attachments — if any sign is installed, the location shows as installed.",
    attachTo: { element: "#statusAll", on: "right" },
    buttons: null,
  });

  steps.push({
    id: "sm-template-filter",
    title: "Sign template filter",
    text: 'Narrow the map to locations that have a specific sign template attached. Useful for finding all the "PARKING →" placements or all the "LOT FULL" signs.',
    attachTo: { element: "#signTemplateFilter", on: "right" },
    buttons: null,
  });

  if (hasLayers) {
    steps.push({
      id: "sm-layers",
      title: "Map layers",
      text: "Four toggleable layers control what overlays appear: <strong>Traffic arrows</strong> (chevron markers and connector lines), <strong>Sign facing</strong> (radial bearing indicators), <strong>Sign count</strong> (attachment count badges), and <strong>Placement ID</strong> (P1, P2 badges for field reference). Facing mode auto-disables count and ID badges.",
      attachTo: { element: "#layerTrafficArrows", on: "right" },
      buttons: null,
    });
  }

  if (canManage) {
    steps.push({
      id: "sm-add-location",
      title: "Adding a location",
      text: "Click <strong>Add location</strong> — the cursor becomes a crosshair. Click the map to drop a marker, then fill in the editor that slides in from the right. The GPS button (📍) drops a marker at your current device position instead.",
      attachTo: { element: "#addLocationBtn", on: "right" },
      buttons: null,
    });

    steps.push({
      id: "sm-add-arrow",
      title: "Traffic arrows",
      text: "Click <strong>Add arrow</strong> to place a road-surface directional indicator. Arrows point drivers toward sign locations. <strong>Hover</strong> an arrow to see a direction pulse. Link arrows to specific signs to establish facing bearings.",
      attachTo: { element: "#addArrowBtn", on: "right" },
      buttons: null,
    });
  }

  if (hasLocations) {
    steps.push({
      id: "sm-location-list",
      title: "Location list",
      text: "Every location is listed here with its attached signs and status. <strong>Click a row</strong> to open the info sheet for that location. The list respects the status and template filters above.",
      attachTo: { element: "#locationList", on: "right" },
      buttons: null,
    });
  }

  steps.push({
    id: "sm-map",
    title: "The map",
    text: "Markers show attached signs as a vertical stack. <strong>Single-click</strong> opens a read-only info sheet. <strong>Double-click</strong> opens the editor (oversight only). <strong>Right-click</strong> shows a context menu with Edit, Delete, Street View, and quick status changes. Convention buildings are highlighted with colored polygon outlines.",
    attachTo: { element: "#googleMap", on: "left" },
    buttons: null,
  });

  steps.push({
    id: "sm-zoom",
    title: "Zoom levels",
    text: "At low zoom, markers show as compact discs with a mount-type icon. At high zoom, they expand to full sign stacks. <strong>Hovering</strong> a compact marker temporarily expands it. The zoom threshold is adjustable via the control at the bottom-left corner.",
    attachTo: { element: "#zoomIndicator", on: "top" },
    buttons: null,
  });

  if (canManage) {
    steps.push({
      id: "sm-editing",
      title: "Editing locations",
      text: "The editor (via double-click or info sheet) lets you set mount type, notes, marker color, and manage attached signs. <strong>Drag to reorder</strong> signs on the stack. Click a sign's status badge to cycle it. Upload a photo or save a Street View snapshot. <strong>Shift+drag</strong> a marker to reposition it on the map.",
      buttons: null,
    });
  }

  if (hasLegend) {
    steps.push({
      id: "sm-legend",
      title: "Legend",
      text: "Click the grip tab on the left edge of the map to slide out the legend panel — it shows sign type icons, status colors, mount types, and keyboard shortcuts.",
      attachTo: { element: "#mapLegendTab", on: "right" },
      buttons: null,
    });
  }

  if (hasGeofence) {
    steps.push({
      id: "sm-geofence",
      title: "Geofencing",
      text: "The GPS button at the bottom-right toggles live location tracking. When you're within ~250 feet of a sign location, a proximity bar slides up with the sign details, live distance, and one-tap status buttons. Tap the GPS button again to stop tracking.",
      attachTo: { element: "#signsGeofenceFab", on: "left" },
      buttons: null,
    });
  }

  steps.push({
    id: "sm-print",
    title: "Print map",
    text: "Click the printer icon (🖨) in the sidebar header to open a print-optimized view in a new tab. The print map has its own layer toggles (Arrows, Expand, Facing, Count, Placement ID) and can be published as a PDF to SharePoint.",
    buttons: null,
  });

  steps.forEach((step, i) => {
    const isFirst = i === 0;
    const isLast = i === steps.length - 1;
    step.buttons = isFirst
      ? startButtons(tour)
      : isLast
        ? finishButtons(tour)
        : navButtons(tour);
    tour.addStep(step);
  });

  return tour;
}

/**
 * Attaches the tour to #tourTriggerBtn on the Sign Map page.
 *
 * @returns {void}
 */
export function initSignsMapTour() {
  const btn = document.getElementById("tourTriggerBtn");
  if (!btn) return;
  btn.addEventListener("click", () => buildSignsMapTour().start());
  registerTour("signsMap", buildSignsMapTour);
}

initSignsMapTour();
