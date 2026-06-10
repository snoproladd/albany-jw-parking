/**
 * @file src/config/mapOverlays.js
 * @description Parses building polygon overlays from a KML file.
 *
 * Reads `buildings.kml` (exported from Google My Maps) on each call
 * and returns an array of overlay objects for the sign map bootstrap
 * data. Drop in a new KML file to update outlines without restart.
 *
 * Colors and IDs are mapped by building name via OVERLAY_STYLES.
 * Unrecognised names receive a default gray style.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KML_PATH = resolve(__dirname, "buildings.kml");

/**
 * Style lookup keyed by Placemark name in the KML.
 * Add new buildings here after tracing them in Google My Maps.
 *
 * @type {Object<string, { id: string, color: string, fillOpacity: number }>}
 */
const OVERLAY_STYLES = {
  "MVP Arena": { id: "mvp-arena", color: "#0d6efd", fillOpacity: 0.12 },
  "MVP Parking": { id: "mvp-parking", color: "#198754", fillOpacity: 0.12 },
  "OGS East Garage": {
    id: "ogs-east-garage",
    color: "#6f42c1",
    fillOpacity: 0.12,
  },
};

const DEFAULT_STYLE = { color: "#6c757d", fillOpacity: 0.1 };

/**
 * Parse the KML file and return an array of map overlay objects.
 *
 * @returns {Array<{ id: string, name: string, color: string, fillOpacity: number, coords: Array<{ lat: number, lng: number }> }>}
 */
export function getMapOverlays() {
  let xml;
  try {
    xml = readFileSync(KML_PATH, "utf-8");
  } catch (err) {
    console.error("mapOverlays: could not read buildings.kml:", err.message);
    return [];
  }

  const placemarks = [...xml.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)];

  return placemarks
    .map((match) => {
      const block = match[1];
      const name = block.match(/<name>(.*?)<\/name>/)?.[1] || "Unknown";
      const coordsText =
        block.match(/<coordinates>([\s\S]*?)<\/coordinates>/)?.[1] || "";

      const coords = coordsText
        .trim()
        .split(/\s+/)
        .map((pair) => {
          const [lng, lat] = pair.split(",").map(Number);
          return { lat, lng };
        })
        .filter((c) => !isNaN(c.lat) && !isNaN(c.lng));

      /* Remove closing vertex (KML repeats the first point). */
      if (
        coords.length > 1 &&
        coords[0].lat === coords[coords.length - 1].lat &&
        coords[0].lng === coords[coords.length - 1].lng
      ) {
        coords.pop();
      }

      const style = OVERLAY_STYLES[name] || {
        ...DEFAULT_STYLE,
        id: name.toLowerCase().replace(/\s+/g, "-"),
      };

      return {
        id: style.id,
        name,
        color: style.color,
        fillOpacity: style.fillOpacity,
        coords,
      };
    })
    .filter((o) => o.coords.length >= 3);
}
