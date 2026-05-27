/**
 * @file scripts/anonymizeSeed.js
 * @description
 *   Replaces real volunteer names and place names in scripts/seedDemo.js
 *   with fictional alternatives, then re-seeds the demo database.
 *
 *   Run BEFORE scripts/seedDemo.js:
 *     node scripts/anonymizeSeed.js && node scripts/seedDemo.js
 *
 *   Safe to re-run — fictional names won't match real names in the maps.
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedPath = join(__dirname, "seedDemo.js");

function log(...a) {
  console.log("[anonymizeSeed]", ...a);
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Maps — key: exactly as it appears in seedDemo.js, value: replacement
// ---------------------------------------------------------------------------

// These are replaced wherever they appear as a standalone quoted word
// e.g.  'Brian'  →  'Carter'  (in firstName / lastName / any string field)
const FIRST_NAMES = {
  Brian: "Carter",
  Winston: "Marcus",
  Collin: "Derek",
  Jeremy: "Owen",
  Jeff: "Grant",
  Sean: "Elliot",
  Justin: "Adrian",
  John: "Wesley",
  Lucas: "Brendan",
  Rick: "Gordon",
  Logan: "Spencer",
  Lee: "Miles",
  Moses: "Ethan",
  Osvaldo: "Rafael",
  Noah: "Caleb",
  Ryan: "Nathan",
  Stephen: "Trevor",
  Zachary: "Preston",
  Vahe: "Armen",
  Elijah: "Isaiah",
  Tom: "Gerald",
  Jayson: "Darnell",
  Bobby: "Hector",
  Shane: "Garrett",
  Daniel: "Andre",
  Matthew: "Patrick",
  Scott: "Douglas",
  Rohit: "Vikram",
  Rockiem: "Damien",
  Jacob: "Malcolm",
  Jason: "Phillip",
  Earl: "Wallace",
  Jude: "Felix",
  Cody: "Tanner",
  Mirko: "Mateo",
  Cameron: "Landon",
  Thomas: "Fletcher",
  Danny: "Victor",
  Amos: "Lionel",
  Bryce: "Kendall",
  Reese: "Holden",
  Paul: "Raymond",
  Joseph: "Franklin",
  Alec: "Griffin",
  Nevin: "Roland",
  Anthony: "Dominic",
  Josiah: "Elias",
  Aaron: "Tobias",
  Micah: "Asher",
  Liam: "Bennett",
  Aubrey: "Sterling",
  Aidan: "Rowan",
  Brennan: "Callum",
  Benjamin: "Emmett",
  Maurice: "Cedric",
  Jay: "Clifton",
  Travis: "Hollis",
  Brisbane: "Whitfield",
};

const LAST_NAMES = {
  Alling: "Hargrove",
  Austin: "Whitmore",
  Begnoche: "Calloway",
  Boshart: "Pemberton",
  Brownell: "Stafford",
  Chrysler: "Wentworth",
  Cook: "Holloway",
  Crankshaw: "Davenport",
  Cunningham: "Ashworth",
  Davis: "Caldwell",
  Detrick: "Whitfield",
  Duprey: "Langford",
  Erhardt: "Blackwell",
  Estrada: "Delgado",
  Ewbank: "Collingwood",
  Fagan: "Hartwell",
  Finch: "Larkwood",
  Folts: "Merritt",
  Garabedian: "Nazarian",
  Garcia: "Castellano",
  Gifford: "Pickworth",
  Glover: "Dunmore",
  Guaschino: "Marchetti",
  Gulotta: "Ferrante",
  Hart: "Bromley",
  Hebert: "Thibodeau",
  Holmes: "Alderwood",
  Kanchan: "Bhardwaj",
  Kennedy: "Cromwell",
  King: "Fairbanks",
  Kirk: "Thornwood",
  Kyarsgaard: "Halvorsen",
  Lamphear: "Covington",
  Leight: "Bancroft",
  Lowry: "Norwood",
  "Manrique Fong": "Delacroix-Fong",
  Manrique: "Delacroix",
  McKee: "Greenfield",
  Mogensen: "Lindqvist",
  Munoz: "Montoya",
  Page: "Stanwick",
  Parker: "Beaumont",
  Patulski: "Kowalski",
  Potter: "Whitaker",
  Raynor: "Colton",
  Rebecca: "Capello",
  Rivera: "Espinoza",
  Schiemer: "Bergmann",
  Tomchik: "Kowalczyk",
  Welch: "Fairfax",
  Wells: "Moorefield",
  Wilkes: "Stratford",
  Young: "Alderton",
  // Multi-word last names handled separately below
};

// Handled with exact string replacement to avoid partial matches
// order matters — longer strings first
const EXACT_STRINGS = [
  // Full name strings in firstName/lastName fields (multi-word last names first)
  ["'Manrique Fong'", "'Delacroix-Fong'"],
  // Location names
  ["'OGS Parking Garage'", "'Civic Center Garage'"],
  ["'MVP Garage'", "'Arena Garage'"],
  ["'MVP Arena'", "'Riverdale Arena'"],
  ["'Drop-Off/Pickup Area'", "'Arrival & Departure Zone'"],
  ["'Bus Depot'", "'Shuttle Station'"],
  ["'Mezzanine - MVP Arena'", "'Mezzanine Level — Riverdale Arena'"],
  ["'Schodack KH of JW'", "'Millhaven Kingdom Hall'"],
  // Addresses
  ["'51 S Pearl St, Albany, NY 12207'", "'12 Arena Way, Riverdale, NY 12001'"],
  [
    "'129 Hamilton St, Albany, NY 12207'",
    "'45 Civic Plaza Dr, Riverdale, NY 12001'",
  ],
  ["'51 So Pearl St'", "'12 Arena Way'"],
  ["'51 S Pearl St, Albany, NY'", "'12 Arena Way, Riverdale, NY'"],
  [
    "'1169 Rt 9, Castlteon, NY 12033'",
    "'500 Riverside Rd, Millhaven, NY 12033'",
  ],
  [
    "'South (Left) side of arena, Market St entrance'",
    "'South side of arena, Commerce St entrance'",
  ],
  [
    "'Halfway up escalators on right side as viewed from front.'",
    "'Halfway up escalators on right side, as viewed from main entrance.'",
  ],
  // City names in congregation strings — longer/specific first
  ["'South Glens Falls, NY'", "'South Northridge Falls, NY'"],
  ["'South - Albany, NY'", "'South - Riverdale, NY'"],
  ["'South - Rome, NY'", "'South - Linwood, NY'"],
  ["'South - Troy, NY'", "'South - Lakeview, NY'"],
  ["'North - Oneonta, NY'", "'North - Clarksburg, NY'"],
  ["'North - Troy, NY'", "'North - Lakeview, NY'"],
  ["'North Adams, MA'", "'North Weston, MA'"],
  ["'English - Whitehall, NY'", "'English - Harborview, NY'"],
  ["'Au Sable Valley, NY'", "'Ridgewood Valley, NY'"],
  ["'Ballston Spa, NY'", "'Cedarfield, NY'"],
  ["'Amsterdam, NY'", "'Millbrook, NY'"],
  ["'Catskill, NY'", "'Ravenswood, NY'"],
  ["'Duanesburg, NY'", "'Westport, NY'"],
  ["'Fort Plain, NY'", "'Clearfield, NY'"],
  ["'Glens Falls, NY'", "'Northridge Falls, NY'"],
  ["'Gloversville, NY'", "'Elmsdale, NY'"],
  ["'Johnstown, NY'", "'Kingsford, NY'"],
  ["'Latham, NY'", "'Ashgrove, NY'"],
  ["'Malone, NY'", "'Ridgecrest, NY'"],
  ["'Moretown, VT'", "'Ferndale, VT'"],
  ["'Plattsburgh, NY'", "'Harborfield, NY'"],
  ["'Schodack, NY'", "'Millhaven, NY'"],
  ["'Ticonderoga, NY'", "'Ironwood, NY'"],
  // Description field references to Albany
  ["Albany, NY", "Riverdale, NY"],
  ["snoproladd@live.com", "admin@demo.com"],
];

// ---------------------------------------------------------------------------
// Apply replacements
// ---------------------------------------------------------------------------

log("Reading", seedPath);
let content = readFileSync(seedPath, "utf8");
const before = content;
let totalChanges = 0;

// 1. Exact string replacements (location names, addresses, cities)
for (const [find, replace] of EXACT_STRINGS) {
  const escaped = escapeRegex(find);
  const regex = new RegExp(escaped, "g");
  const count = (content.match(regex) || []).length;
  if (count > 0) {
    content = content.replace(regex, replace);
    log(`  exact: "${find}" → "${replace}" (${count}x)`);
    totalChanges += count;
  }
}

// 2. First names — match 'Name' as a quoted value (not mid-word)
//    Pattern:  '<firstName>'  where < and > are quote boundaries
for (const [real, fictional] of Object.entries(FIRST_NAMES)) {
  // Match the name as a complete quoted string value
  const regex = new RegExp(`'${escapeRegex(real)}'`, "g");
  const count = (content.match(regex) || []).length;
  if (count > 0) {
    content = content.replace(regex, `'${fictional}'`);
    log(`  firstName: '${real}' → '${fictional}' (${count}x)`);
    totalChanges += count;
  }
}

// 3. Last names — same approach, but do multi-word ones first (already in EXACT_STRINGS),
//    here only single-word last names remain
for (const [real, fictional] of Object.entries(LAST_NAMES)) {
  const regex = new RegExp(`'${escapeRegex(real)}'`, "g");
  const count = (content.match(regex) || []).length;
  if (count > 0) {
    content = content.replace(regex, `'${fictional}'`);
    log(`  lastName: '${real}' → '${fictional}' (${count}x)`);
    totalChanges += count;
  }
}

// ---------------------------------------------------------------------------
// Write result
// ---------------------------------------------------------------------------

if (content === before) {
  log("No changes detected — file may already be anonymized.");
} else {
  writeFileSync(seedPath, content, "utf8");
  log(`\nDone. Total replacements: ${totalChanges}`);
  log("Now run: node scripts/seedDemo.js");
}
