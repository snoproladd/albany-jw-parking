/**
 * @file scripts/seedDemo.js
 * @description
 *   Seeds the demo schema with data mirroring the real dbo structure:
 *   real event types, real Riverdale Arena / OGS Garage locations, real
 *   session / shift layout, a full-size volunteer roster (fictional names),
 *   and correct oversight structure.
 *
 *   Safe to re-run — clears all demo tables before inserting.
 *
 * Usage (from project root):
 *   node scripts/seedDemo.js
 *
 * Required env vars:
 *   AZSQLServer / AZURE_SQL_SERVER   - SQL server FQDN
 *   AZSQLDB / AZURE_SQL_DATABASE     - Database name
 *   DEMO_DB_USER                     - parking_demo
 *   DEMO_DB_PASSWORD                 - password set in setupDemoSchema scripts
 *
 * Named login accounts (password: Demo@2026!):
 *   admin@demo.com          ADMIN           (mirrors Barrett Bainbridge)
 *   asstadmin@demo.com      ASSISTANT_ADMIN (mirrors Arlo Wakefield)
 *   overseer@demo.com       OVERSEER        (mirrors Tristan Hawthorne)
 *   keyman@demo.com         KEYMAN          (mirrors Carson Barlowe)
 *   desk@demo.com           DESK            (mirrors Ross Bainbridge)
 *   volunteer@demo.com      REGISTERED      (mirrors Rufus Thackeray)
 */

import sql from "mssql";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// ---------------------------------------------------------------------------
// Bootstrap .env for local runs
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
try {
  const { default: dotenv } = await import("dotenv");
  dotenv.config({ path: join(__dirname, "..", ".env") });
} catch {
  /* env may already be set */
}

function log(...a) {
  console.log(`[${new Date().toISOString()}] [seedDemo]`, ...a);
}
function logError(...a) {
  console.error(`[${new Date().toISOString()}] [seedDemo:ERROR]`, ...a);
}

// ---------------------------------------------------------------------------
// Password hashing (mirrors lib/passwordVer.js)
// ---------------------------------------------------------------------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 32, "sha256");
  return { hash, salt, iterations: 100_000, algo: "PBKDF2-SHA256" };
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------
const SQL_SERVER =
  process.env.AZSQLServer ||
  process.env.AZURE_SQL_SERVER ||
  process.env.SQL_SERVER ||
  "";
const SQL_DB =
  process.env.AZSQLDB ||
  process.env.AZURE_SQL_DATABASE ||
  process.env.SQL_DATABASE ||
  "";
const DEMO_USER = process.env.DEMO_DB_USER || "parking_demo";
const DEMO_PASS = process.env.DEMO_DB_PASSWORD || "";

const missing = [
  !SQL_SERVER && "AZSQLServer",
  !SQL_DB && "AZSQLDB",
  !DEMO_PASS && "DEMO_DB_PASSWORD",
].filter(Boolean);
if (missing.length) {
  logError("Missing env vars:", missing.join(", "));
  process.exit(1);
}

const poolConfig = {
  server: SQL_SERVER,
  database: SQL_DB,
  port: 1433,
  authentication: {
    type: "default",
    options: { userName: DEMO_USER, password: DEMO_PASS },
  },
  options: {
    encrypt: true,
    trustServerCertificate: false,
    connectTimeout: 30_000,
    requestTimeout: 30_000,
  },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/**
 * Year the seed data was captured in. CONVENTION_DAYS dates below are
 * written in this year and moved to YEAR by shiftToYear().
 */
const SOURCE_YEAR = 2026;

/**
 * Convention year the demo is seeded as: the current year, so the demo
 * always looks current (override with DEMO_YEAR=2027 etc.).
 */
const YEAR = Number(process.env.DEMO_YEAR) || new Date().getUTCFullYear();

const DEMO_PASS_PW = "Demo@2026!";

/**
 * Move a SOURCE_YEAR date ("YYYY-MM-DD") into YEAR, keeping its weekday:
 * same month/day in YEAR, then nudged to the nearest same weekday (±3 days).
 * Fri Jul 3 2026 → Fri Jul 2 2027.
 *
 * @param {string} iso
 * @returns {string} "YYYY-MM-DD"
 */
function shiftToYear(iso) {
  const [, m, d] = iso.split("-").map(Number);
  const src = new Date(Date.UTC(SOURCE_YEAR, m - 1, d));
  const dst = new Date(Date.UTC(YEAR, m - 1, d));
  let delta = src.getUTCDay() - dst.getUTCDay();
  if (delta > 3) delta -= 7;
  if (delta < -3) delta += 7;
  dst.setUTCDate(dst.getUTCDate() + delta);
  return dst.toISOString().slice(0, 10);
}

// Volunteers whose original dbo IDs map to named demo login accounts
const NAMED_EMAIL_MAP = {
  80: "admin@demo.com",
  195: "asstadmin@demo.com",
  81: "overseer@demo.com",
  88: "keyman@demo.com",
  237: "desk@demo.com",
  137: "volunteer@demo.com",
};

// ---------------------------------------------------------------------------
// Source data — mirrors dbo exactly
// ---------------------------------------------------------------------------

const EVENT_TYPES = [
  {
    oldId: 1,
    name: "Ingress",
    description: "Morning shift of incoming cars",
    color: "#6c757d",
  },
  {
    oldId: 2,
    name: "Park Assistance",
    description: "Assist friends with parking in lots/garages",
    color: "#b0dd97",
  },
  {
    oldId: 3,
    name: "Security",
    description: "Garage Security",
    color: "#ffc35c",
  },
  {
    oldId: 4,
    name: "Pickup/Drop-off",
    description: "Assistance in front of building",
    color: "#6e5bfb",
  },
  {
    oldId: 5,
    name: "Parking Meeting",
    description: "Meeting for Parking Department",
    color: "#e23c3c",
  },
  {
    oldId: 6,
    name: "Signs",
    description: "Place, remove, replace signage",
    color: "#318081",
  },
  {
    oldId: 7,
    name: "Mobile Support",
    description: "Assist w/ flats, batteries, lockouts",
    color: "#f0eb4c",
  },
];

const LOCATIONS = [
  {
    oldId: 1,
    name: "Civic Center Garage",
    type: "location",
    description: null,
    capacity: 800,
    address: "129 Civic Plaza Dr, Riverdale, NY 12207",
    lat: 42.647658,
    lng: -73.757479,
    maps_url: "https://maps.app.goo.gl/7CmFTKHE4yFeP8v69",
  },
  {
    oldId: 2,
    name: "Arena Garage",
    type: "location",
    description: "Preferred Handicap and Disabled Garage",
    capacity: 800,
    address: "12 Arena Way",
    lat: null,
    lng: -7.375626,
    maps_url: "https://maps.app.goo.gl/YvA11LwadWDrZCgm7",
  },
  {
    oldId: 3,
    name: "Mobile Support",
    type: "task",
    description: null,
    capacity: null,
    address: null,
    lat: null,
    lng: null,
    maps_url: null,
  },
  {
    oldId: 4,
    name: "Signs",
    type: "task",
    description: null,
    capacity: null,
    address: null,
    lat: null,
    lng: null,
    maps_url: null,
  },
  {
    oldId: 5,
    name: "Arrival & Departure Zone",
    type: "location",
    description: null,
    capacity: null,
    address: "51 12 Arena Way, Riverdale, NY 12207",
    lat: 42.647634,
    lng: -73.754184,
    maps_url: "https://maps.app.goo.gl/WoxUwYneUSYVWcbZ9",
  },
  {
    oldId: 6,
    name: "Shuttle Station",
    type: "location",
    description: "South side of arena, Commerce St entrance",
    capacity: null,
    address: "51 12 Arena Way, Riverdale, NY 12207",
    lat: 42.647892,
    lng: -73.754608,
    maps_url: "https://maps.app.goo.gl/WoxUwYneUSYVWcbZ9",
  },
  {
    oldId: 7,
    name: "Mezzanine - Riverdale Arena",
    type: "location",
    description: "Halfway up escalators on right side, as viewed from main entrance.",
    capacity: null,
    address: "51 12 Arena Way, Riverdale, NY",
    lat: 42.647634,
    lng: -73.754184,
    maps_url: "https://maps.app.goo.gl/WoxUwYneUSYVWcbZ9",
  },
  {
    oldId: 8,
    name: "Millhaven Community Center",
    type: "location",
    description: null,
    capacity: null,
    address: "500 Riverside Rd, Millhaven, NY 12033",
    lat: 42.504519,
    lng: -73.67427,
    maps_url: "https://maps.app.goo.gl/z8Uj5DCGnEbyQBdG7",
  },
];

const CONVENTION_DAYS = [
  {
    oldId: 23,
    label: "Thursday Test",
    date: "2026-05-21",
    start: "09:20:00",
    end: "15:45:00",
    schedulable: 0,
  },
  {
    oldId: 15,
    label: "Training",
    date: "2026-05-23",
    start: "10:30:00",
    end: "13:30:00",
    schedulable: 0,
  },
  {
    oldId: 1,
    label: "Friday",
    date: "2026-07-03",
    start: "09:20:00",
    end: "16:45:00",
    schedulable: 1,
  },
  {
    oldId: 10,
    label: "Saturday",
    date: "2026-07-04",
    start: "09:20:00",
    end: "04:30:00",
    schedulable: 1,
  },
  {
    oldId: 14,
    label: "Sunday",
    date: "2026-07-05",
    start: "09:20:00",
    end: "15:45:00",
    schedulable: 1,
  },
];

// Sessions keyed by old convention_day_id
const SESSIONS = [
  // Friday (day 1)
  {
    oldId: 7,
    oldDayId: 1,
    label: "Pre-Session",
    order: 1,
    start: "05:30:00",
    end: "09:45:00",
  },
  {
    oldId: 1,
    oldDayId: 1,
    label: "Morning A",
    order: 2,
    start: "09:20:00",
    end: "10:40:00",
  },
  {
    oldId: 2,
    oldDayId: 1,
    label: "Morning B",
    order: 2,
    start: "10:40:00",
    end: "12:15:00",
  },
  {
    oldId: 3,
    oldDayId: 1,
    label: "Lunch",
    order: 3,
    start: "12:15:00",
    end: "13:35:00",
  },
  {
    oldId: 5,
    oldDayId: 1,
    label: "Afternoon A",
    order: 5,
    start: "13:35:00",
    end: "14:50:00",
  },
  {
    oldId: 6,
    oldDayId: 1,
    label: "Afternoon B",
    order: 6,
    start: "14:50:00",
    end: "16:45:00",
  },
  {
    oldId: 8,
    oldDayId: 1,
    label: "Post-Session",
    order: 10,
    start: "16:30:00",
    end: "18:30:00",
  },
  // Saturday (day 10)
  {
    oldId: 23,
    oldDayId: 10,
    label: "Pre-Session",
    order: 1,
    start: "05:30:00",
    end: "09:45:00",
  },
  {
    oldId: 24,
    oldDayId: 10,
    label: "Morning A",
    order: 2,
    start: "09:20:00",
    end: "10:25:00",
  },
  {
    oldId: 25,
    oldDayId: 10,
    label: "Morning B",
    order: 2,
    start: "10:25:00",
    end: "12:10:00",
  },
  {
    oldId: 26,
    oldDayId: 10,
    label: "Lunch",
    order: 3,
    start: "12:10:00",
    end: "13:35:00",
  },
  {
    oldId: 27,
    oldDayId: 10,
    label: "Afternoon A",
    order: 5,
    start: "13:35:00",
    end: "15:20:00",
  },
  {
    oldId: 28,
    oldDayId: 10,
    label: "Afternoon B",
    order: 6,
    start: "15:20:00",
    end: "16:30:00",
  },
  {
    oldId: 29,
    oldDayId: 10,
    label: "Post-Session",
    order: 10,
    start: "16:30:00",
    end: "18:30:00",
  },
  // Sunday (day 14)
  {
    oldId: 51,
    oldDayId: 14,
    label: "Pre-Session",
    order: 1,
    start: "05:30:00",
    end: "09:45:00",
  },
  {
    oldId: 52,
    oldDayId: 14,
    label: "Morning A",
    order: 2,
    start: "09:20:00",
    end: "11:00:00",
  },
  {
    oldId: 54,
    oldDayId: 14,
    label: "Morning B",
    order: 2,
    start: "11:00:00",
    end: "12:10:00",
  },
  {
    oldId: 53,
    oldDayId: 14,
    label: "Lunch",
    order: 3,
    start: "12:10:00",
    end: "13:35:00",
  },
  {
    oldId: 55,
    oldDayId: 14,
    label: "Afternoon A",
    order: 5,
    start: "13:35:00",
    end: "14:35:00",
  },
  {
    oldId: 57,
    oldDayId: 14,
    label: "Afternoon B",
    order: 6,
    start: "14:35:00",
    end: "15:45:00",
  },
  {
    oldId: 56,
    oldDayId: 14,
    label: "Post-Session",
    order: 10,
    start: "15:35:00",
    end: "18:30:00",
  },
  // Thursday Test (day 23)
  {
    oldId: 72,
    oldDayId: 23,
    label: "Pre-Session",
    order: 1,
    start: "05:30:00",
    end: "09:45:00",
  },
  {
    oldId: 75,
    oldDayId: 23,
    label: "Morning A",
    order: 2,
    start: "09:20:00",
    end: "11:00:00",
  },
  {
    oldId: 76,
    oldDayId: 23,
    label: "Morning B",
    order: 2,
    start: "11:00:00",
    end: "12:10:00",
  },
  {
    oldId: 73,
    oldDayId: 23,
    label: "Lunch",
    order: 3,
    start: "12:10:00",
    end: "13:35:00",
  },
  {
    oldId: 74,
    oldDayId: 23,
    label: "Afternoon A",
    order: 5,
    start: "13:35:00",
    end: "14:35:00",
  },
  {
    oldId: 78,
    oldDayId: 23,
    label: "Afternoon B",
    order: 6,
    start: "14:35:00",
    end: "15:45:00",
  },
  {
    oldId: 77,
    oldDayId: 23,
    label: "Post-Session",
    order: 10,
    start: "15:35:00",
    end: "18:30:00",
  },
];

// Shifts — oldSessId maps to session via SESSIONS array
const SHIFTS = [
  // Friday Pre-Session (sess 7)
  {
    oldId: 9,
    oldSessId: 7,
    oldEtId: 2,
    label: "Ingress",
    start: "05:30:00",
    end: "09:45:00",
    dept: "lots_and_garages",
    need: null,
    code: null,
  },
  {
    oldId: 10,
    oldSessId: 7,
    oldEtId: 5,
    label: "Meeting",
    start: "06:15:00",
    end: "06:45:00",
    dept: null,
    need: null,
    code: null,
  },
  {
    oldId: 11,
    oldSessId: 7,
    oldEtId: 4,
    label: "Morning",
    start: "06:30:00",
    end: "10:00:00",
    dept: "dropoff_pickup",
    need: null,
    code: null,
  },
  {
    oldId: 13,
    oldSessId: 7,
    oldEtId: 6,
    label: "Morning",
    start: "05:30:00",
    end: "06:30:00",
    dept: "signs",
    need: null,
    code: null,
  },
  // Friday Morning A (sess 1)
  {
    oldId: 12,
    oldSessId: 1,
    oldEtId: 3,
    label: "Shift A",
    start: "09:45:00",
    end: "10:55:00",
    dept: "security",
    need: null,
    code: null,
  },
  // Friday Morning B (sess 2)
  {
    oldId: 14,
    oldSessId: 2,
    oldEtId: 3,
    label: "Shift B",
    start: "10:55:00",
    end: "12:05:00",
    dept: "security",
    need: null,
    code: null,
  },
  {
    oldId: 15,
    oldSessId: 2,
    oldEtId: 3,
    label: "Shift C",
    start: "12:05:00",
    end: "13:15:00",
    dept: "security",
    need: null,
    code: null,
  },
  // Friday Lunch (sess 3)
  {
    oldId: 16,
    oldSessId: 3,
    oldEtId: 3,
    label: "Shift D",
    start: "13:15:00",
    end: "14:25:00",
    dept: "security",
    need: null,
    code: null,
  },
  // Friday Afternoon A (sess 5)
  {
    oldId: 17,
    oldSessId: 5,
    oldEtId: 3,
    label: "Shift E",
    start: "14:25:00",
    end: "15:35:00",
    dept: "security",
    need: null,
    code: null,
  },
  // Friday Afternoon B (sess 6)
  {
    oldId: 18,
    oldSessId: 6,
    oldEtId: 3,
    label: "Shift F",
    start: "15:35:00",
    end: "16:45:00",
    dept: "security",
    need: null,
    code: null,
  },
  // Friday Post-Session (sess 8)
  {
    oldId: 19,
    oldSessId: 8,
    oldEtId: 2,
    label: "Egress",
    start: "16:30:00",
    end: "18:30:00",
    dept: "lots_and_garages",
    need: null,
    code: null,
  },
  {
    oldId: 20,
    oldSessId: 8,
    oldEtId: 4,
    label: "Pickup",
    start: "16:30:00",
    end: "18:30:00",
    dept: "dropoff_pickup",
    need: null,
    code: null,
  },
  {
    oldId: 21,
    oldSessId: 8,
    oldEtId: 6,
    label: "Evening",
    start: "18:00:00",
    end: "18:30:00",
    dept: "signs",
    need: null,
    code: null,
  },
  // Saturday Pre-Session (sess 23)
  {
    oldId: 22,
    oldSessId: 23,
    oldEtId: 2,
    label: "Ingress",
    start: "05:30:00",
    end: "09:45:00",
    dept: "lots_and_garages",
    need: null,
    code: null,
  },
  {
    oldId: 23,
    oldSessId: 23,
    oldEtId: 6,
    label: "Morning",
    start: "05:30:00",
    end: "06:30:00",
    dept: "signs",
    need: null,
    code: null,
  },
  {
    oldId: 24,
    oldSessId: 23,
    oldEtId: 5,
    label: "Meeting",
    start: "06:15:00",
    end: "06:45:00",
    dept: null,
    need: null,
    code: null,
  },
  {
    oldId: 25,
    oldSessId: 23,
    oldEtId: 4,
    label: "Morning",
    start: "06:30:00",
    end: "10:00:00",
    dept: "dropoff_pickup",
    need: null,
    code: null,
  },
  // Saturday Morning A (sess 24)
  {
    oldId: 26,
    oldSessId: 24,
    oldEtId: 3,
    label: "Shift A",
    start: "09:45:00",
    end: "10:50:00",
    dept: "security",
    need: null,
    code: null,
  },
  // Saturday Morning B (sess 25)
  {
    oldId: 27,
    oldSessId: 25,
    oldEtId: 3,
    label: "Shift B",
    start: "10:50:00",
    end: "11:55:00",
    dept: "security",
    need: null,
    code: null,
  },
  {
    oldId: 28,
    oldSessId: 25,
    oldEtId: 3,
    label: "Shift C",
    start: "11:55:00",
    end: "13:00:00",
    dept: "security",
    need: null,
    code: null,
  },
  // Saturday Lunch (sess 26)
  {
    oldId: 29,
    oldSessId: 26,
    oldEtId: 3,
    label: "Shift D",
    start: "13:00:00",
    end: "14:10:00",
    dept: "security",
    need: null,
    code: null,
  },
  // Saturday Afternoon A (sess 27)
  {
    oldId: 30,
    oldSessId: 27,
    oldEtId: 3,
    label: "Shift E",
    start: "14:10:00",
    end: "15:20:00",
    dept: "security",
    need: null,
    code: null,
  },
  // Saturday Afternoon B (sess 28)
  {
    oldId: 31,
    oldSessId: 28,
    oldEtId: 3,
    label: "Shift F",
    start: "15:20:00",
    end: "16:30:00",
    dept: "security",
    need: null,
    code: null,
  },
  // Saturday Post-Session (sess 29)
  {
    oldId: 32,
    oldSessId: 29,
    oldEtId: 2,
    label: "Egress",
    start: "16:20:00",
    end: "18:30:00",
    dept: "lots_and_garages",
    need: null,
    code: null,
  },
  {
    oldId: 33,
    oldSessId: 29,
    oldEtId: 4,
    label: "Pickup",
    start: "16:20:00",
    end: "18:30:00",
    dept: "dropoff_pickup",
    need: null,
    code: null,
  },
  {
    oldId: 34,
    oldSessId: 29,
    oldEtId: 6,
    label: "Evening",
    start: "18:00:00",
    end: "18:30:00",
    dept: "signs",
    need: null,
    code: null,
  },
  // Sunday Pre-Session (sess 51)
  {
    oldId: 74,
    oldSessId: 51,
    oldEtId: 2,
    label: "Ingress",
    start: "05:30:00",
    end: "09:45:00",
    dept: "lots_and_garages",
    need: null,
    code: null,
  },
  {
    oldId: 75,
    oldSessId: 51,
    oldEtId: 6,
    label: "Morning",
    start: "05:30:00",
    end: "06:30:00",
    dept: "signs",
    need: null,
    code: null,
  },
  {
    oldId: 76,
    oldSessId: 51,
    oldEtId: 5,
    label: "Meeting",
    start: "06:15:00",
    end: "06:45:00",
    dept: null,
    need: null,
    code: null,
  },
  {
    oldId: 77,
    oldSessId: 51,
    oldEtId: 4,
    label: "Morning",
    start: "06:30:00",
    end: "10:00:00",
    dept: "dropoff_pickup",
    need: null,
    code: null,
  },
  // Sunday Morning A (sess 52)
  {
    oldId: 78,
    oldSessId: 52,
    oldEtId: 3,
    label: "Shift A",
    start: "09:45:00",
    end: "10:45:00",
    dept: "security",
    need: null,
    code: null,
  },
  // Sunday Morning B (sess 54)
  {
    oldId: 80,
    oldSessId: 54,
    oldEtId: 3,
    label: "Shift B",
    start: "10:45:00",
    end: "11:45:00",
    dept: "security",
    need: null,
    code: null,
  },
  {
    oldId: 81,
    oldSessId: 54,
    oldEtId: 3,
    label: "Shift C",
    start: "11:45:00",
    end: "12:45:00",
    dept: "security",
    need: null,
    code: null,
  },
  // Sunday Lunch (sess 53)
  {
    oldId: 82,
    oldSessId: 53,
    oldEtId: 3,
    label: "Shift D",
    start: "12:45:00",
    end: "13:45:00",
    dept: "security",
    need: null,
    code: null,
  },
  // Sunday Afternoon A (sess 55)
  {
    oldId: 79,
    oldSessId: 55,
    oldEtId: 3,
    label: "Shift E",
    start: "13:45:00",
    end: "14:45:00",
    dept: "security",
    need: null,
    code: null,
  },
  // Sunday Afternoon B (sess 57)
  {
    oldId: 86,
    oldSessId: 57,
    oldEtId: 3,
    label: "Shift F",
    start: "14:45:00",
    end: "15:45:00",
    dept: "security",
    need: null,
    code: null,
  },
  // Sunday Post-Session (sess 56)
  {
    oldId: 83,
    oldSessId: 56,
    oldEtId: 2,
    label: "Egress",
    start: "16:20:00",
    end: "18:20:00",
    dept: "lots_and_garages",
    need: null,
    code: null,
  },
  {
    oldId: 84,
    oldSessId: 56,
    oldEtId: 6,
    label: "Evening",
    start: "18:00:00",
    end: "18:30:00",
    dept: "signs",
    need: null,
    code: null,
  },
  {
    oldId: 85,
    oldSessId: 56,
    oldEtId: 4,
    label: "Pickup",
    start: "16:20:00",
    end: "18:30:00",
    dept: "dropoff_pickup",
    need: null,
    code: null,
  },
  // Thursday Test Pre-Session (sess 72)
  {
    oldId: 109,
    oldSessId: 72,
    oldEtId: 2,
    label: "Ingress",
    start: "05:30:00",
    end: "09:45:00",
    dept: null,
    need: null,
    code: null,
  },
  {
    oldId: 110,
    oldSessId: 72,
    oldEtId: 6,
    label: "Morning",
    start: "05:30:00",
    end: "06:30:00",
    dept: null,
    need: null,
    code: null,
  },
  {
    oldId: 111,
    oldSessId: 72,
    oldEtId: 5,
    label: "Meeting",
    start: "06:15:00",
    end: "06:45:00",
    dept: null,
    need: null,
    code: null,
  },
  {
    oldId: 113,
    oldSessId: 72,
    oldEtId: 4,
    label: "Morning",
    start: "06:30:00",
    end: "10:00:00",
    dept: null,
    need: null,
    code: null,
  },
  // Thursday Test Morning A (sess 75)
  {
    oldId: 115,
    oldSessId: 75,
    oldEtId: 3,
    label: "Shift A",
    start: "09:45:00",
    end: "10:45:00",
    dept: null,
    need: null,
    code: null,
  },
  // Thursday Test Morning B (sess 76)
  {
    oldId: 116,
    oldSessId: 76,
    oldEtId: 3,
    label: "Shift B",
    start: "10:45:00",
    end: "11:45:00",
    dept: null,
    need: null,
    code: null,
  },
  {
    oldId: 117,
    oldSessId: 76,
    oldEtId: 3,
    label: "Shift C",
    start: "11:45:00",
    end: "12:45:00",
    dept: null,
    need: null,
    code: null,
  },
  // Thursday Test Lunch (sess 73)
  {
    oldId: 112,
    oldSessId: 73,
    oldEtId: 3,
    label: "Shift D",
    start: "12:45:00",
    end: "13:45:00",
    dept: null,
    need: null,
    code: null,
  },
  // Thursday Test Afternoon A (sess 74)
  {
    oldId: 114,
    oldSessId: 74,
    oldEtId: 3,
    label: "Shift E",
    start: "13:45:00",
    end: "14:45:00",
    dept: null,
    need: null,
    code: null,
  },
  // Thursday Test Afternoon B (sess 78)
  {
    oldId: 121,
    oldSessId: 78,
    oldEtId: 3,
    label: "Shift F",
    start: "14:45:00",
    end: "15:45:00",
    dept: null,
    need: null,
    code: null,
  },
  {
    oldId: 122,
    oldSessId: 78,
    oldEtId: 2,
    label: "Testing",
    start: "15:15:00",
    end: "17:00:00",
    dept: "lots_and_garages",
    need: null,
    code: "SPIN",
  },
  // Thursday Test Post-Session (sess 77)
  {
    oldId: 118,
    oldSessId: 77,
    oldEtId: 2,
    label: "Egress",
    start: "16:20:00",
    end: "18:20:00",
    dept: null,
    need: null,
    code: null,
  },
  {
    oldId: 119,
    oldSessId: 77,
    oldEtId: 4,
    label: "Pickup",
    start: "16:20:00",
    end: "18:30:00",
    dept: null,
    need: null,
    code: null,
  },
  {
    oldId: 120,
    oldSessId: 77,
    oldEtId: 6,
    label: "Evening",
    start: "18:00:00",
    end: "18:30:00",
    dept: null,
    need: null,
    code: null,
  },
];

// Assignments: [oldShiftId, oldLocationId, volunteerNeed, volMin, volMax]
const ASSIGNMENTS = [
  [9, 2, 20, 15, 25],
  [9, 1, 15, 0, 15],
  [11, 6, 4, 0, 4],
  [11, 5, 6, 0, 6],
  [12, 2, 2, 0, 2],
  [12, 1, 4, 0, 4],
  [14, 2, 2, 0, 2],
  [14, 1, 4, 0, 4],
  [15, 1, 4, 0, 4],
  [15, 2, 2, 0, 2],
  [16, 2, 2, 0, 2],
  [16, 1, 4, 0, 4],
  [17, 2, 2, 0, 2],
  [17, 1, 4, 0, 4],
  [18, 2, 2, 0, 2],
  [18, 1, 4, 0, 4],
  [19, 2, 15, 0, 15],
  [19, 1, 15, 0, 15],
  [20, 5, 6, 0, 6],
  [20, 6, 4, 0, 4],
  [22, 2, 15, 0, 15],
  [22, 1, 15, 0, 15],
  [25, 6, 4, 0, 4],
  [25, 5, 6, 0, 6],
  [26, 2, 2, 0, 2],
  [26, 1, 4, 0, 4],
  [27, 2, 2, 0, 2],
  [27, 1, 4, 0, 4],
  [28, 2, 2, 0, 2],
  [28, 1, 4, 0, 4],
  [29, 2, 2, 0, 2],
  [29, 1, 4, 0, 4],
  [30, 2, 2, 0, 2],
  [30, 1, 4, 0, 4],
  [31, 2, 2, 0, 2],
  [31, 1, 4, 0, 4],
  [32, 2, 15, 0, 15],
  [32, 1, 15, 0, 15],
  [33, 6, 4, 0, 4],
  [33, 5, 6, 0, 6],
  [74, 2, 15, 0, 15],
  [74, 1, 15, 0, 15],
  [77, 5, 6, 0, 6],
  [77, 6, 4, 0, 4],
  [78, 2, 2, 0, 2],
  [78, 1, 4, 0, 4],
  [79, 2, 2, 0, 2],
  [79, 1, 4, 0, 4],
  [80, 2, 2, 0, 2],
  [80, 1, 4, 0, 4],
  [81, 2, 2, 0, 2],
  [81, 1, 4, 0, 4],
  [82, 2, 2, 0, 2],
  [82, 1, 4, 0, 4],
  [83, 2, 15, 0, 15],
  [83, 1, 15, 0, 15],
  [85, 6, 4, 0, 4],
  [85, 5, 6, 0, 6],
  [86, 2, 2, 0, 2],
  [86, 1, 4, 0, 4],
  [109, 2, 15, null, 15],
  [109, 1, 15, null, 15],
  [112, 2, 2, null, 2],
  [112, 1, 4, null, 4],
  [113, 5, 6, null, 6],
  [113, 6, 4, null, 4],
  [114, 2, 2, null, 2],
  [114, 1, 4, null, 4],
  [115, 2, 2, null, 2],
  [115, 1, 4, null, 4],
  [116, 2, 2, null, 2],
  [116, 1, 4, null, 4],
  [117, 2, 2, null, 2],
  [117, 1, 4, null, 4],
  [118, 2, 15, null, 15],
  [118, 1, 15, null, 15],
  [119, 5, 6, null, 6],
  [119, 6, 4, null, 4],
  [121, 1, 4, null, 4],
  [121, 2, 2, null, 2],
  [122, 2, 4, 2, 4],
];

// Oversight structure: [oldVolId, oldParentVolId (or null for root), title, order]
// oldParentVolId refers to the volunteer's old dbo ID for the parent node
const HIERARCHY = [
  { oldVolId: 80, parentOldVolId: null, title: "Parking Overseer", order: 0 },
  {
    oldVolId: 84,
    parentOldVolId: 80,
    title: "Lots and Garages Overseer",
    order: 0,
  },
  {
    oldVolId: 81,
    parentOldVolId: 80,
    title: "Dropoff/Pickup Overseer",
    order: 1,
  },
  {
    oldVolId: null,
    parentOldVolId: 80,
    title: "Signs and Security Overseer",
    order: 2,
  },
  {
    oldVolId: 202,
    parentOldVolId: 80,
    title: "Assistant to Oversight, General",
    order: 3,
  },
];

// Volunteer roster shaped like dbo (roles, flags, congregations, stamina),
// with fictional names and shifted birth dates — no real people.
const VOLUNTEERS = [
  {
    oldId: 232,
    firstName: "Oakley",
    lastName: "Lockhart",
    suffix: null,
    gender: "male",
    dob: "1974-03-30",
    stamina: 3,
    role: null,
    accountType: "non-registered",
    congregation: "Millbrook, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 1,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 0,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: 1,
    security: 1,
    mobile: 1,
    dropoff: 1,
  },
  {
    oldId: 137,
    firstName: "Rufus",
    lastName: "Thackeray",
    suffix: null,
    gender: "male",
    dob: "1998-07-22",
    stamina: 3,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Westport, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 1,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: 1,
    security: 1,
    mobile: 0,
    dropoff: 1,
  },
  {
    oldId: 83,
    firstName: "Finn",
    lastName: "Harrowgate",
    suffix: null,
    gender: "male",
    dob: "1998-01-18",
    stamina: 5,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "North - Clarksburg, NY",
    assignedToConv: 1,
    attendExtra: 1,
    elder: 0,
    regPioneer: 1,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 112,
    firstName: "Vaughn",
    lastName: "Southwell",
    suffix: null,
    gender: "male",
    dob: "1969-04-14",
    stamina: 5,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "South - Linwood, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 199,
    firstName: "Harlan",
    lastName: "Mansfield",
    suffix: null,
    gender: "male",
    dob: "1965-01-15",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Elmsdale, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 1,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 168,
    firstName: "Ian",
    lastName: "Sandford",
    suffix: null,
    gender: "male",
    dob: "1976-03-24",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Kingsford, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 0,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 1,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 117,
    firstName: "Fabian",
    lastName: "Redmond",
    suffix: null,
    gender: "male",
    dob: "1982-08-09",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "English - Harborview, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 1,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 84,
    firstName: "Gideon",
    lastName: "Farnsworth",
    suffix: null,
    gender: "male",
    dob: "1973-03-25",
    stamina: 4,
    role: "OVERSEER",
    accountType: "registered",
    congregation: "Elmsdale, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 1,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: null,
    signs: null,
    security: 0,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 134,
    firstName: "Pierce",
    lastName: "Lowell",
    suffix: null,
    gender: "male",
    dob: "1985-02-04",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "North Weston, MA",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 1,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 89,
    firstName: "Lachlan",
    lastName: "Thornbury",
    suffix: null,
    gender: "male",
    dob: "1968-10-21",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Kingsford, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 1,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 0,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 115,
    firstName: "Damon",
    lastName: "Brightman",
    suffix: null,
    gender: "male",
    dob: "2002-12-11",
    stamina: 5,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "South Northridge Falls, NY",
    assignedToConv: 1,
    attendExtra: 1,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 114,
    firstName: "Yates",
    lastName: "Quimby",
    suffix: null,
    gender: "male",
    dob: "1957-10-10",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Ridgewood Valley, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 119,
    firstName: "Julian",
    lastName: "Quimby",
    suffix: null,
    gender: "male",
    dob: "1988-05-18",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Harborfield, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 121,
    firstName: "Alden",
    lastName: "Garland",
    suffix: null,
    gender: "male",
    dob: "2005-07-04",
    stamina: 5,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Clearfield, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 214,
    firstName: "Silas",
    lastName: "Coldwell",
    suffix: null,
    gender: "male",
    dob: "1977-01-22",
    stamina: 2,
    role: "REGISTERED",
    accountType: "non-registered",
    congregation: "Kingsford, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 0,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: 0,
    security: 1,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 178,
    firstName: "Orson",
    lastName: "Claymore",
    suffix: null,
    gender: "male",
    dob: "2004-12-15",
    stamina: 5,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Elmsdale, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 1,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 211,
    firstName: "Sutton",
    lastName: "Hawthorne",
    suffix: null,
    gender: "male",
    dob: "1982-11-29",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Elmsdale, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: 0,
    security: 1,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 81,
    firstName: "Tristan",
    lastName: "Hawthorne",
    suffix: null,
    gender: "male",
    dob: "1974-03-27",
    stamina: 5,
    role: "OVERSEER",
    accountType: "registered",
    congregation: "Elmsdale, NY",
    assignedToConv: 1,
    attendExtra: 1,
    elder: 1,
    regPioneer: 1,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: null,
    signs: null,
    security: 0,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 233,
    firstName: "Wyatt",
    lastName: "Ainsworth",
    suffix: null,
    gender: "male",
    dob: "1967-03-28",
    stamina: 2,
    role: null,
    accountType: "non-registered",
    congregation: "Kingsford, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 0,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 0,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 241,
    firstName: "Lorenzo",
    lastName: "Rutherford",
    suffix: null,
    gender: "male",
    dob: "1988-07-09",
    stamina: 5,
    role: null,
    accountType: "registered",
    congregation: "Ravenswood, NY",
    assignedToConv: 1,
    attendExtra: 1,
    elder: 1,
    regPioneer: 1,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 0,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 0,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 176,
    firstName: "Reid",
    lastName: "Kingsley",
    suffix: null,
    gender: "male",
    dob: "1962-05-10",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Harborfield, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 1,
    regPioneer: 1,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 122,
    firstName: "Corbin",
    lastName: "Marlowe",
    suffix: null,
    gender: "male",
    dob: "2006-01-21",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Ridgecrest, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 1,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 206,
    firstName: "Archer",
    lastName: "Cobbett",
    suffix: null,
    gender: "male",
    dob: "1961-04-07",
    stamina: 3,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Elmsdale, NY",
    assignedToConv: 1,
    attendExtra: 1,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: 0,
    security: 1,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 193,
    firstName: "Zane",
    lastName: "Holbrook",
    suffix: null,
    gender: "male",
    dob: "1980-09-14",
    stamina: 2,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "South - Lakeview, NY",
    assignedToConv: 1,
    attendExtra: 1,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: 0,
    security: 1,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 215,
    firstName: "Weston",
    lastName: "Ingram",
    suffix: null,
    gender: "male",
    dob: "1984-01-09",
    stamina: 4,
    role: "REGISTERED",
    accountType: "non-registered",
    congregation: "Cedarfield, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 1,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 0,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: 0,
    security: 1,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 230,
    firstName: "Tate",
    lastName: "Hastings",
    suffix: null,
    gender: "male",
    dob: "1973-06-25",
    stamina: 5,
    role: "REGISTERED",
    accountType: "non-registered",
    congregation: "Elmsdale, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 1,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 1,
    smsOptIn: 0,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 0,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 167,
    firstName: "Marshall",
    lastName: "Halston",
    suffix: null,
    gender: "male",
    dob: "1986-02-14",
    stamina: 5,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Kingsford, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 1,
    security: 1,
    mobile: 1,
    dropoff: null,
  },
  {
    oldId: 238,
    firstName: "Jensen",
    lastName: "Blakemore",
    suffix: null,
    gender: "male",
    dob: "2006-08-21",
    stamina: 4,
    role: null,
    accountType: "non-registered",
    congregation: "Harborfield, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 1,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 0,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 0,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 82,
    firstName: "Dashiell",
    lastName: "Carrington",
    suffix: null,
    gender: "male",
    dob: "1995-06-20",
    stamina: 5,
    role: "OVERSEER",
    accountType: "registered",
    congregation: "Harborfield, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 1,
    regPioneer: 1,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: null,
    signs: null,
    security: 0,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 131,
    firstName: "Stellan",
    lastName: "Edgerton",
    suffix: null,
    gender: "male",
    dob: "1989-11-11",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Millhaven, NY",
    assignedToConv: 1,
    attendExtra: 1,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 231,
    firstName: "Quinn",
    lastName: "Northcott",
    suffix: null,
    gender: "male",
    dob: "1986-08-14",
    stamina: 2,
    role: null,
    accountType: "registered",
    congregation: "South - Riverdale, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 0,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 0,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 138,
    firstName: "Thaddeus",
    lastName: "Oakhurst",
    suffix: null,
    gender: "male",
    dob: "1992-08-23",
    stamina: 3,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Elmsdale, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 208,
    firstName: "Atticus",
    lastName: "Chadwick",
    suffix: null,
    gender: "male",
    dob: "1996-05-05",
    stamina: 5,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Elmsdale, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 1,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: 0,
    security: 1,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 198,
    firstName: "Soren",
    lastName: "Chadwick",
    suffix: null,
    gender: "male",
    dob: "1984-06-11",
    stamina: 5,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Elmsdale, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 1,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 88,
    firstName: "Carson",
    lastName: "Barlowe",
    suffix: null,
    gender: "male",
    dob: "1968-06-13",
    stamina: 3,
    role: "KEYMAN",
    accountType: "non-registered",
    congregation: "Northridge Falls, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 1,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: null,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 80,
    firstName: "Barrett",
    lastName: "Bainbridge",
    suffix: null,
    gender: "male",
    dob: "1983-11-02",
    stamina: 5,
    role: "ADMIN",
    accountType: "registered",
    congregation: "Millhaven, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 1,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 1,
    lotsGarages: 1,
    signs: 1,
    security: 1,
    mobile: 1,
    dropoff: 1,
  },
  {
    oldId: 237,
    firstName: "Ross",
    lastName: "Bainbridge",
    suffix: null,
    gender: "male",
    dob: "1983-06-29",
    stamina: 5,
    role: "DESK",
    accountType: "registered",
    congregation: "English - Harborview, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 1,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 0,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 0,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 203,
    firstName: "Ezra",
    lastName: "Dalrymple",
    suffix: null,
    gender: "male",
    dob: "1983-01-29",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Elmsdale, NY",
    assignedToConv: 1,
    attendExtra: 1,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 1,
    security: 1,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 227,
    firstName: "Dalton",
    lastName: "Gilchrist",
    suffix: null,
    gender: "male",
    dob: "2006-09-16",
    stamina: 5,
    role: "REGISTERED",
    accountType: "non-registered",
    congregation: "Cedarfield, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 0,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 133,
    firstName: "Beckett",
    lastName: "Fenwick",
    suffix: null,
    gender: "male",
    dob: "1992-07-30",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Elmsdale, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 0,
    smsAlerts: 0,
    lotsGarages: null,
    signs: 1,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 132,
    firstName: "Hale",
    lastName: "Birchall",
    suffix: null,
    gender: "male",
    dob: "2003-10-17",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Elmsdale, NY",
    assignedToConv: 1,
    attendExtra: 1,
    elder: 0,
    regPioneer: 1,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 0,
    smsAlerts: 0,
    lotsGarages: null,
    signs: 1,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 116,
    firstName: "Crispin",
    lastName: "Mayfield",
    suffix: null,
    gender: "male",
    dob: "1969-12-19",
    stamina: 5,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Elmsdale, NY",
    assignedToConv: 1,
    attendExtra: 1,
    elder: 0,
    regPioneer: 1,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 0,
    smsAlerts: 0,
    lotsGarages: null,
    signs: 1,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 192,
    firstName: "Forrest",
    lastName: "Fitzgerald",
    suffix: null,
    gender: "male",
    dob: "1994-06-16",
    stamina: 5,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "South Northridge Falls, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 1,
    security: 1,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 207,
    firstName: "Leo",
    lastName: "Westbrook",
    suffix: null,
    gender: "male",
    dob: "1999-04-01",
    stamina: 4,
    role: "REGISTERED",
    accountType: "non-registered",
    congregation: "Elmsdale, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 1,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 1,
    mobile: 0,
    dropoff: 1,
  },
  {
    oldId: 195,
    firstName: "Arlo",
    lastName: "Wakefield",
    suffix: null,
    gender: "male",
    dob: "1977-11-21",
    stamina: 4,
    role: "ASSISTANT_ADMIN",
    accountType: "registered",
    congregation: "Millhaven, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 1,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 0,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 163,
    firstName: "Chase",
    lastName: "Vance",
    suffix: "Jr",
    gender: "male",
    dob: "1966-04-02",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Kingsford, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 1,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: null,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: 1,
  },
  {
    oldId: 169,
    firstName: "Bram",
    lastName: "Granger",
    suffix: null,
    gender: "male",
    dob: "2000-06-09",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Cedarfield, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: null,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: 1,
  },
  {
    oldId: 197,
    firstName: "Jasper",
    lastName: "Granger",
    suffix: null,
    gender: "male",
    dob: "2002-04-02",
    stamina: 4,
    role: "NON_REGISTERED",
    accountType: "registered",
    congregation: "Cedarfield, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 1,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 213,
    firstName: "Remy",
    lastName: "Sherwood",
    suffix: null,
    gender: "male",
    dob: "1949-11-25",
    stamina: 3,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Elmsdale, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 1,
    mobile: 0,
    dropoff: 1,
  },
  {
    oldId: 194,
    firstName: "Leland",
    lastName: "Beckford",
    suffix: null,
    gender: "male",
    dob: "1968-04-11",
    stamina: 2,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Clearfield, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 1,
    mobile: 0,
    dropoff: 1,
  },
  {
    oldId: 234,
    firstName: "Upton",
    lastName: "Corwin",
    suffix: null,
    gender: "male",
    dob: "1998-08-31",
    stamina: 3,
    role: null,
    accountType: "non-registered",
    congregation: "South - Lakeview, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 0,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 140,
    firstName: "Nash",
    lastName: "Corwin",
    suffix: null,
    gender: "male",
    dob: "1995-12-11",
    stamina: 3,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "South - Lakeview, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: null,
    signs: null,
    security: 1,
    mobile: 1,
    dropoff: 1,
  },
  {
    oldId: 210,
    firstName: "Lyle",
    lastName: "Glenwood",
    suffix: null,
    gender: "male",
    dob: "1989-12-21",
    stamina: 5,
    role: "ASSISTANT_ADMIN",
    accountType: "registered",
    congregation: "Kingsford, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 1,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 0,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 0,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 142,
    firstName: "Xavier",
    lastName: "Lancaster",
    suffix: null,
    gender: "male",
    dob: "2006-05-02",
    stamina: 3,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Kingsford, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: null,
    signs: null,
    security: 1,
    mobile: 1,
    dropoff: 1,
  },
  {
    oldId: 240,
    firstName: "Edison",
    lastName: "Darrow",
    suffix: null,
    gender: "male",
    dob: "2008-07-17",
    stamina: 4,
    role: "DESK",
    accountType: "registered",
    congregation: "Millhaven, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 1,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 0,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 0,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 236,
    firstName: "Rollins",
    lastName: "Darrow",
    suffix: null,
    gender: "male",
    dob: "2011-01-11",
    stamina: 3,
    role: "DESK",
    accountType: "registered",
    congregation: "Millhaven, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 1,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 0,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 0,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 85,
    firstName: "Ellis",
    lastName: "Winslow",
    suffix: null,
    gender: "male",
    dob: "1971-12-02",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Elmsdale, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: null,
    signs: null,
    security: 1,
    mobile: 1,
    dropoff: null,
  },
  {
    oldId: 173,
    firstName: "Conrad",
    lastName: "Abernathy",
    suffix: null,
    gender: "male",
    dob: "1960-12-28",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Ironwood, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: null,
    signs: null,
    security: 1,
    mobile: 1,
    dropoff: null,
  },
  {
    oldId: 202,
    firstName: "Theo",
    lastName: "Abernathy",
    suffix: null,
    gender: "male",
    dob: "2000-05-24",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Elmsdale, NY",
    assignedToConv: 1,
    attendExtra: 1,
    elder: 1,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 1,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 216,
    firstName: "Milo",
    lastName: "Huxley",
    suffix: null,
    gender: "male",
    dob: "1977-11-05",
    stamina: 5,
    role: "ASSISTANT_ADMIN",
    accountType: "registered",
    congregation: "Ashgrove, NY",
    assignedToConv: 1,
    attendExtra: 1,
    elder: 1,
    regPioneer: 1,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 0,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 0,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 175,
    firstName: "Dexter",
    lastName: "Kendrick",
    suffix: null,
    gender: "male",
    dob: "1957-08-25",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Kingsford, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 0,
    smsAlerts: 0,
    lotsGarages: null,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 165,
    firstName: "Nolan",
    lastName: "Babcock",
    suffix: null,
    gender: "male",
    dob: "1995-04-17",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Ferndale, VT",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: null,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 144,
    firstName: "Lars",
    lastName: "Yardley",
    suffix: null,
    gender: "male",
    dob: "1994-11-04",
    stamina: 5,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "North - Lakeview, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: null,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 120,
    firstName: "Desmond",
    lastName: "Maxwell",
    suffix: null,
    gender: "male",
    dob: "2003-05-28",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Cedarfield, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 1,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: null,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 196,
    firstName: "Flynn",
    lastName: "Maxwell",
    suffix: null,
    gender: "male",
    dob: "2001-09-06",
    stamina: 5,
    role: "NON_REGISTERED",
    accountType: "registered",
    congregation: "Cedarfield, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 1,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 242,
    firstName: "Rhett",
    lastName: "Highsmith",
    suffix: null,
    gender: "male",
    dob: "2010-04-01",
    stamina: 5,
    role: "DESK",
    accountType: "registered",
    congregation: "Millhaven, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 0,
    smsAlerts: 0,
    lotsGarages: 0,
    signs: 0,
    security: 0,
    mobile: 0,
    dropoff: 0,
  },
  {
    oldId: 118,
    firstName: "Monty",
    lastName: "Highsmith",
    suffix: null,
    gender: "male",
    dob: "1998-09-24",
    stamina: 5,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "South - Riverdale, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 0,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: null,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 164,
    firstName: "Sawyer",
    lastName: "Burlingame",
    suffix: null,
    gender: "male",
    dob: "1975-11-09",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Kingsford, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: null,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 177,
    firstName: "Graham",
    lastName: "Burlingame",
    suffix: null,
    gender: "male",
    dob: "1981-09-16",
    stamina: 3,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Kingsford, NY",
    assignedToConv: 1,
    attendExtra: 0,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: null,
    signs: null,
    security: 1,
    mobile: null,
    dropoff: null,
  },
  {
    oldId: 190,
    firstName: "Brooks",
    lastName: "Underhill",
    suffix: null,
    gender: "male",
    dob: "1966-07-17",
    stamina: 4,
    role: "REGISTERED",
    accountType: "registered",
    congregation: "Northridge Falls, NY",
    assignedToConv: 1,
    attendExtra: 1,
    elder: 0,
    regPioneer: 0,
    auxPioneer: 0,
    specPioneer: 0,
    minServ: 1,
    sfs: 0,
    smsOptIn: 1,
    smsAlerts: 0,
    lotsGarages: 1,
    signs: 0,
    security: 1,
    mobile: 0,
    dropoff: 0,
  },
];

// Unique congregations extracted from volunteer data
const CONGREGATIONS = [
  { congregation: "Millbrook", state: "NY" },
  { congregation: "Ridgewood Valley", state: "NY" },
  { congregation: "Cedarfield", state: "NY" },
  { congregation: "Ravenswood", state: "NY" },
  { congregation: "Westport", state: "NY" },
  { congregation: "English - Harborview", state: "NY" },
  { congregation: "Clearfield", state: "NY" },
  { congregation: "Northridge Falls", state: "NY" },
  { congregation: "Elmsdale", state: "NY" },
  { congregation: "Kingsford", state: "NY" },
  { congregation: "Ashgrove", state: "NY" },
  { congregation: "Ridgecrest", state: "NY" },
  { congregation: "Ferndale", state: "VT" },
  { congregation: "North - Clarksburg", state: "NY" },
  { congregation: "North - Lakeview", state: "NY" },
  { congregation: "North Weston", state: "MA" },
  { congregation: "Harborfield", state: "NY" },
  { congregation: "Millhaven", state: "NY" },
  { congregation: "Stonegate", state: "NY" },
  { congregation: "South - Riverdale", state: "NY" },
  { congregation: "South - Linwood", state: "NY" },
  { congregation: "South - Lakeview", state: "NY" },
  { congregation: "South Northridge Falls", state: "NY" },
  { congregation: "Ironwood", state: "NY" },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
/** `node scripts/seedDemo.js --plan` prints the clear order and stops. */
const PLAN_ONLY = process.argv.includes("--plan");

/**
 * Work out a safe DELETE order for re-seeding.
 *
 * Starts from `baseTables` (what this script re-populates), adds every
 * table in the connected user's default schema (demo) that references one
 * of them — directly or through another — and orders the result so each
 * table is cleared before any table it references. Self-references are
 * ignored (a whole-table DELETE satisfies them).
 *
 * @param {import("mssql").ConnectionPool} pool
 * @param {string[]} baseTables
 * @returns {Promise<string[]>} table names, children first
 * @throws {Error} if any base table does not exist in the schema
 */
async function planClearOrder(pool, baseTables) {
  // Fail before anything is deleted if the list names a table that
  // doesn't exist in this schema (e.g. after a rename).
  const existing = await pool.request().query(
    `SELECT name FROM sys.tables WHERE schema_id = SCHEMA_ID();`,
  );
  const have = new Set(existing.recordset.map((r) => r.name.toLowerCase()));
  const missing = baseTables.filter((t) => !have.has(t.toLowerCase()));
  if (missing.length) {
    throw new Error(
      `Clear list names table(s) not found in schema: ${missing.join(", ")}`,
    );
  }

  const fk = await pool.request().query(`
    SELECT DISTINCT
           OBJECT_NAME(f.parent_object_id)     AS child,
           OBJECT_NAME(f.referenced_object_id) AS parent
    FROM   sys.foreign_keys f
    WHERE  OBJECT_SCHEMA_NAME(f.parent_object_id)     = SCHEMA_NAME()
      AND  OBJECT_SCHEMA_NAME(f.referenced_object_id) = SCHEMA_NAME()
      AND  f.parent_object_id <> f.referenced_object_id;
  `);
  /** @type {Map<string, Set<string>>} parent -> children */
  const childrenOf = new Map();
  for (const { child, parent } of fk.recordset) {
    if (!childrenOf.has(parent)) childrenOf.set(parent, new Set());
    childrenOf.get(parent).add(child);
  }

  // Everything to clear: base tables plus all (transitive) dependents.
  const toClear = new Set(baseTables);
  const queue = [...baseTables];
  while (queue.length) {
    const t = queue.shift();
    for (const c of childrenOf.get(t) || []) {
      if (!toClear.has(c)) {
        toClear.add(c);
        queue.push(c);
      }
    }
  }

  // Children before parents: repeatedly take tables with no remaining
  // children inside the set.
  const order = [];
  const remaining = new Set(toClear);
  while (remaining.size) {
    const ready = [...remaining].filter(
      (t) => ![...(childrenOf.get(t) || [])].some((c) => remaining.has(c)),
    );
    if (ready.length === 0) {
      // Foreign-key cycle — fall back to the remaining tables as listed.
      logError("Foreign-key cycle among:", [...remaining].join(", "));
      order.push(...remaining);
      break;
    }
    for (const t of ready) {
      order.push(t);
      remaining.delete(t);
    }
  }
  return order;
}

async function seed() {
  log("Connecting as", DEMO_USER, "...");
  const pool = await new sql.ConnectionPool(poolConfig).connect();
  log("Connected. Beginning seed...");

  try {
    // -------------------------------------------------------------------
    // 0. Clear all tables (FK-safe order)
    // -------------------------------------------------------------------
    log("Clearing demo tables...");
    const clears = [
      // Year-rollover tables reference volunteer_in / invitation_batches,
      // so they go first.
      "volunteer_year_status",
      "convention_years",
      "shift_alert_log",
      "shift_alert_schedules",
      "shift_slot_assignments",
      "schedule_publishes",
      "schedule_assignments",
      "invitation_revocation_log",
      "invitations",
      "invitation_batches",
      "shifts",
      "sessions",
      "volunteer_blackouts",
      "oversight_structure",
      "sms_opt_out_log",
      "attendance",
      "bug_reports",
      "message_templates",
      "role_permissions",
      "convention_days",
      "event_types",
      "locations_tasks",
      "volunteer_in",
      "roles",
      "congregations",
    ];
    // The list above is what this script re-populates. Newer tables that
    // point at those (rendezvous points, capacity rules, publish snapshots,
    // ...) would block the DELETEs, so work the order out from the demo
    // schema's own foreign keys: everything above plus anything that
    // references it, children before parents.
    const order = await planClearOrder(pool, clears);
    const extra = order.filter((t) => !clears.includes(t));
    log(`  Clearing ${order.length} tables` +
        (extra.length ? ` (incl. ${extra.length} dependent: ${extra.join(", ")})` : "") + ".");

    if (PLAN_ONLY) {
      log("PLAN ONLY (--plan) — nothing deleted. Clear order:");
      order.forEach((t, i) => log(`  ${String(i + 1).padStart(2)}. ${t}`));
      return;
    }

    for (const t of order) await pool.request().query(`DELETE FROM ${t};`);
    log("Tables cleared.");

    // -------------------------------------------------------------------
    // 1. Congregations
    // -------------------------------------------------------------------
    log("Seeding congregations...");
    for (const c of CONGREGATIONS) {
      await pool
        .request()
        .input("name", sql.NVarChar(150), c.congregation)
        .input("state", sql.NVarChar(100), c.state)
        .query(
          `INSERT INTO congregations (congregation, State) VALUES (@name, @state);`,
        );
    }
    log(`  ${CONGREGATIONS.length} congregations.`);

    // -------------------------------------------------------------------
    // 2. Roles
    // -------------------------------------------------------------------
    log("Seeding roles...");
    const roleRows = [
      {
        name: "NON_REGISTERED",
        level: 0,
        desc: "Can submit registration info only",
      },
      { name: "REGISTERED", level: 1, desc: "Can view schedules and maps" },
      {
        name: "KEYMAN",
        level: 2,
        desc: "Can view and print assignments and maps",
      },
      {
        name: "DESK",
        level: 2,
        desc: "Can create volunteer accounts and log attendance",
      },
      {
        name: "OVERSEER",
        level: 3,
        desc: "Can create and manage assignments and shifts",
      },
      {
        name: "ASSISTANT_ADMIN",
        level: 4,
        desc: "All privileges except managing admin accounts",
      },
      { name: "ADMIN", level: 5, desc: "Full sitewide access" },
    ];
    // The level column was renamed at some point; use whichever exists.
    const levelColRes = await pool.request().query(`
      SELECT TOP 1 name FROM sys.columns
      WHERE  object_id = OBJECT_ID(SCHEMA_NAME() + '.roles')
        AND  name LIKE '%level%'
      ORDER BY column_id;
    `);
    const levelCol = levelColRes.recordset[0]?.name;
    if (!levelCol) throw new Error("roles table has no *level* column.");
    for (const r of roleRows) {
      await pool
        .request()
        .input("name", sql.NVarChar(50), r.name)
        .input("level", sql.Int, r.level)
        .input("desc", sql.NVarChar(500), r.desc)
        .query(
          `INSERT INTO roles (role_name, [${levelCol}], description) VALUES (@name, @level, @desc);`,
        );
    }
    log(`  ${roleRows.length} roles.`);

    // -------------------------------------------------------------------
    // 3. Event types — build oldId → newId map
    // -------------------------------------------------------------------
    log("Seeding event types...");
    const etMap = {}; // oldId → newId
    for (const et of EVENT_TYPES) {
      const r = await pool
        .request()
        .input("name", sql.NVarChar(100), et.name)
        .input("desc", sql.NVarChar(500), et.description)
        .input("color", sql.NVarChar(7), et.color)
        .input("by", sql.NVarChar(100), "admin@demo.com")
        .query(
          `INSERT INTO event_types (name, description, color, created_by) OUTPUT INSERTED.id VALUES (@name, @desc, @color, @by);`,
        );
      etMap[et.oldId] = r.recordset[0].id;
    }
    log(`  ${EVENT_TYPES.length} event types. Map:`, etMap);

    // -------------------------------------------------------------------
    // 4. Locations — build oldId → newId map
    // -------------------------------------------------------------------
    log("Seeding locations & tasks...");
    const locMap = {}; // oldId → newId
    for (const loc of LOCATIONS) {
      const r = await pool
        .request()
        .input("year", sql.Int, YEAR)
        .input("name", sql.NVarChar(100), loc.name)
        .input("type", sql.NVarChar(20), loc.type)
        .input("desc", sql.NVarChar(500), loc.description)
        .input("cap", sql.Int, loc.capacity)
        .input("address", sql.NVarChar(255), loc.address)
        .input("lat", sql.Decimal(9, 6), loc.lat)
        .input("lng", sql.Decimal(9, 6), loc.lng)
        .input("mapsUrl", sql.NVarChar(500), loc.maps_url)
        .input("by", sql.NVarChar(100), "admin@demo.com")
        .query(
          `INSERT INTO locations_tasks (year, name, type, description, capacity, address, lat, lng, maps_url, created_by) OUTPUT INSERTED.id VALUES (@year, @name, @type, @desc, @cap, @address, @lat, @lng, @mapsUrl, @by);`,
        );
      locMap[loc.oldId] = r.recordset[0].id;
    }
    log(`  ${LOCATIONS.length} locations/tasks. Map:`, locMap);

    // -------------------------------------------------------------------
    // 5. Convention days — build oldId → newId map
    // -------------------------------------------------------------------
    log("Seeding convention days...");
    const dayMap = {}; // oldId → newId
    for (const d of CONVENTION_DAYS) {
      const r = await pool
        .request()
        .input("year", sql.Int, YEAR)
        .input("label", sql.NVarChar(50), d.label)
        .input("date", sql.Date, new Date(shiftToYear(d.date) + "T12:00:00Z"))
        .input("start", sql.NVarChar(8), d.start)
        .input("end", sql.NVarChar(8), d.end)
        .input("sched", sql.Bit, d.schedulable)
        .query(
          `INSERT INTO convention_days (year, label, convention_date, program_start, program_end, schedulable) OUTPUT INSERTED.id VALUES (@year, @label, @date, @start, @end, @sched);`,
        );
      dayMap[d.oldId] = r.recordset[0].id;
    }
    log(`  ${CONVENTION_DAYS.length} convention days (${YEAR}). Map:`, dayMap);

    // The demo's active convention year (lib/conventionYear.js reads this).
    const seededDates = CONVENTION_DAYS.map((d) => shiftToYear(d.date)).sort();
    await pool
      .request()
      .input("year", sql.Int, YEAR)
      .input("first", sql.Date, new Date(seededDates[0] + "T12:00:00Z"))
      .input("last", sql.Date, new Date(seededDates[seededDates.length - 1] + "T12:00:00Z"))
      .query(
        `INSERT INTO convention_years (year, status, first_date, last_date) VALUES (@year, 'active', @first, @last);`,
      );
    log(`  Active convention year set to ${YEAR}.`);

    // -------------------------------------------------------------------
    // 6. Sessions — build oldId → newId map
    // -------------------------------------------------------------------
    log("Seeding sessions...");
    const sessMap = {}; // oldId → newId
    for (const s of SESSIONS) {
      const newDayId = dayMap[s.oldDayId];
      if (!newDayId) {
        log(
          `  WARN: no day mapping for session oldId=${s.oldId} oldDayId=${s.oldDayId}`,
        );
        continue;
      }
      const r = await pool
        .request()
        .input("dayId", sql.Int, newDayId)
        .input("label", sql.NVarChar(50), s.label)
        .input("order", sql.Int, s.order)
        .input("start", sql.NVarChar(8), s.start)
        .input("end", sql.NVarChar(8), s.end)
        .query(
          `INSERT INTO sessions (convention_day_id, label, session_order, start_time, end_time) OUTPUT INSERTED.id VALUES (@dayId, @label, @order, @start, @end);`,
        );
      sessMap[s.oldId] = r.recordset[0].id;
    }
    log(`  ${Object.keys(sessMap).length} sessions.`);

    // -------------------------------------------------------------------
    // 7. Shifts — build oldId → newId map
    // -------------------------------------------------------------------
    log("Seeding shifts...");
    const shiftMap = {}; // oldId → newId
    for (const sh of SHIFTS) {
      const newSessId = sessMap[sh.oldSessId];
      const newEtId = etMap[sh.oldEtId];
      if (!newSessId) {
        log(
          `  WARN: no session mapping for shift oldId=${sh.oldId} oldSessId=${sh.oldSessId}`,
        );
        continue;
      }
      if (!newEtId) {
        log(
          `  WARN: no event_type mapping for shift oldId=${sh.oldId} oldEtId=${sh.oldEtId}`,
        );
        continue;
      }
      const r = await pool
        .request()
        .input("sessId", sql.Int, newSessId)
        .input("etId", sql.Int, newEtId)
        .input("label", sql.NVarChar(50), sh.label)
        .input("start", sql.NVarChar(8), sh.start)
        .input("end", sql.NVarChar(8), sh.end)
        .input("dept", sql.NVarChar(50), sh.dept)
        .input("need", sql.Int, sh.need)
        .input("code", sql.NVarChar(8), sh.code)
        .query(
          `INSERT INTO shifts (session_id, event_type_id, label, start_time, end_time, department, volunteer_need, sms_code) OUTPUT INSERTED.id VALUES (@sessId, @etId, @label, @start, @end, @dept, @need, @code);`,
        );
      shiftMap[sh.oldId] = r.recordset[0].id;
    }
    log(`  ${Object.keys(shiftMap).length} shifts.`);

    // -------------------------------------------------------------------
    // 8. Schedule assignments
    // -------------------------------------------------------------------
    log("Seeding schedule assignments...");
    let assignCount = 0;
    for (const [oldShiftId, oldLocId, need, volMin, volMax] of ASSIGNMENTS) {
      const newShiftId = shiftMap[oldShiftId];
      const newLocId = locMap[oldLocId];
      if (!newShiftId) {
        log(`  WARN: no shift mapping for assignment shiftId=${oldShiftId}`);
        continue;
      }
      if (!newLocId) {
        log(`  WARN: no loc mapping for assignment locId=${oldLocId}`);
        continue;
      }
      await pool
        .request()
        .input("shiftId", sql.Int, newShiftId)
        .input("locId", sql.Int, newLocId)
        .input("need", sql.Int, need)
        .input("volMin", sql.Int, volMin)
        .input("volMax", sql.Int, volMax)
        .query(
          `INSERT INTO schedule_assignments (shift_id, location_task_id, volunteer_need, vol_min, vol_max) VALUES (@shiftId, @locId, @need, @volMin, @volMax);`,
        );
      assignCount++;
    }
    log(`  ${assignCount} assignments.`);

    // -------------------------------------------------------------------
    // 9. Volunteers — fictional roster
    // -------------------------------------------------------------------
    log("Seeding volunteers...");
    const oldIdToNewId = {}; // old dbo id → new demo id
    for (const v of VOLUNTEERS) {
      const email =
        NAMED_EMAIL_MAP[v.oldId] ??
        `${v.firstName.toLowerCase().replace(/\s+/g, "-")}.${v.lastName.toLowerCase().replace(/\s+/g, "-")}.${v.oldId}@demo.com`;

      const isNamed = !!NAMED_EMAIL_MAP[v.oldId];
      const pwPayload = isNamed ? hashPassword(DEMO_PASS_PW) : null;

      const req = pool.request();
      req.input("email", sql.NVarChar(255), email);
      req.input("firstName", sql.NVarChar(100), v.firstName);
      req.input("lastName", sql.NVarChar(100), v.lastName);
      req.input("suffix", sql.NVarChar(20), v.suffix);
      req.input("gender", sql.NVarChar(20), v.gender);
      req.input("dobirth", sql.Date, new Date(v.dob + "T12:00:00Z"));
      req.input("stamina", sql.Int, v.stamina);
      req.input("role", sql.NVarChar(20), v.role);
      req.input("accountType", sql.NVarChar(50), v.accountType);
      req.input("congregation", sql.NVarChar(255), v.congregation);
      req.input("assignedToConv", sql.Bit, v.assignedToConv);
      req.input("attendExtra", sql.Bit, v.attendExtra);
      req.input("elder", sql.Bit, v.elder);
      req.input("regPioneer", sql.Bit, v.regPioneer);
      req.input("auxPioneer", sql.Bit, v.auxPioneer);
      req.input("specPioneer", sql.Bit, v.specPioneer);
      req.input("minServ", sql.Bit, v.minServ);
      req.input("sfs", sql.Bit, v.sfs);
      req.input("smsOptIn", sql.Bit, v.smsOptIn);
      req.input("smsAlerts", sql.Bit, v.smsAlerts);
      req.input("lotsGarages", sql.Bit, v.lotsGarages);
      req.input("signs", sql.Bit, v.signs);
      req.input("security", sql.Bit, v.security);
      req.input("mobile", sql.Bit, v.mobile);
      req.input("dropoff", sql.Bit, v.dropoff);
      req.input("pwHash", sql.VarBinary(32), pwPayload?.hash ?? null);
      req.input("pwSalt", sql.VarBinary(16), pwPayload?.salt ?? null);
      req.input("pwIter", sql.Int, pwPayload?.iterations ?? null);
      req.input("pwAlgo", sql.NVarChar(50), pwPayload?.algo ?? null);

      const result = await req.query(`
                INSERT INTO volunteer_in (
                    email, firstName, lastName, suffix, gender, dobirth, stamina,
                    role, accountType, congregation, assignedToConv, attendExtra,
                    elder, regPioneer, auxPioneer, specPioneer, minServ, sfs,
                    sms_opted_in, sms_shift_alerts_opt_in,
                    crew_lots_garages, crew_signs, crew_security,
                    crew_mobile_support, crew_dropoff_pickup,
                    passwordHash, passwordSalt, passwordIter, passwordAlgo,
                    registration_status, account_status, active_current_year
                )
                OUTPUT INSERTED.id
                VALUES (
                    @email, @firstName, @lastName, @suffix, @gender, @dobirth, @stamina,
                    @role, @accountType, @congregation, @assignedToConv, @attendExtra,
                    @elder, @regPioneer, @auxPioneer, @specPioneer, @minServ, @sfs,
                    @smsOptIn, @smsAlerts,
                    @lotsGarages, @signs, @security, @mobile, @dropoff,
                    @pwHash, @pwSalt, @pwIter, @pwAlgo,
                    'completed', 'ok', 1
                );
            `);
      oldIdToNewId[v.oldId] = result.recordset[0].id;
    }
    log(`  ${VOLUNTEERS.length} volunteers. Named accounts mapped.`);

    // -------------------------------------------------------------------
    // 10. Oversight structure
    // -------------------------------------------------------------------
    log("Seeding oversight structure...");
    // Insert root first, then children. Build nodeVolId → nodeId map.
    const oversightstructureNodeMap = {}; // oldVolId → new oversight structure node id (for parent lookup)
    for (const h of HIERARCHY) {
      const newVolId =
        h.oldVolId != null ? (oldIdToNewId[h.oldVolId] ?? null) : null;
      const newParentId =
        h.parentOldVolId != null
          ? (oversightstructureNodeMap[h.parentOldVolId] ?? null)
          : null;
      const r = await pool
        .request()
        .input("volId", sql.Int, newVolId)
        .input("parentId", sql.Int, newParentId)
        .input("title", sql.NVarChar(100), h.title)
        .input("order", sql.Int, h.order)
        .query(
          `INSERT INTO oversight_structure (volunteer_id, parent_id, role_title, sort_order) OUTPUT INSERTED.id VALUES (@volId, @parentId, @title, @order);`,
        );
      if (h.oldVolId != null) oversightstructureNodeMap[h.oldVolId] = r.recordset[0].id;
      else oversightstructureNodeMap[`null_${h.order}`] = r.recordset[0].id; // null-vol node
    }
    log("  Oversight structure (5 nodes) seeded.");

    // -------------------------------------------------------------------
    // 11. Message templates
    // -------------------------------------------------------------------
    log("Seeding message templates...");
    const templates = [
      {
        name: "Standard Invitation",
        subject: `You're Invited — ${YEAR} Albany Summer Convention Parking`,
        body: `Dear [Name],\n\nWe'd like to invite you to serve on the parking team for the ${YEAR} Albany Summer Convention. Please respond using the link below.\n\nThank you!`,
      },
      {
        name: "Reminder — No Response",
        subject: "Friendly Reminder — Convention Parking Invitation",
        body: "Dear [Name],\n\nThis is a friendly reminder that we haven't yet received your response. Please respond at your earliest convenience.",
      },
      {
        name: "Shift Alert",
        subject: "Your Parking Shift is Coming Up",
        body: "Dear [Name],\n\nThis is a reminder that you're scheduled for a parking shift: [Shift Details].\n\nPlease arrive 15 minutes early. Reply CHECK to confirm arrival.\n\nThank you!",
      },
    ];
    for (const t of templates) {
      await pool
        .request()
        .input("name", sql.NVarChar(100), t.name)
        .input("subject", sql.NVarChar(255), t.subject)
        .input("body", sql.NVarChar(sql.MAX), t.body)
        .input("by", sql.NVarChar(100), "admin@demo.com")
        .query(
          `INSERT INTO message_templates (name, subject, body, created_by) VALUES (@name, @subject, @body, @by);`,
        );
    }
    log(`  ${templates.length} message templates.`);

    // -------------------------------------------------------------------
    // 12. Sample invitation batch (Friday)
    // -------------------------------------------------------------------
    log("Seeding invitation batch...");
    const fridayNewId = dayMap[1]; // old day 1 = Friday
    const batchR = await pool
      .request()
      .input(
        "name",
        sql.NVarChar(150),
        `${YEAR} Initial Invitation — All Volunteers`,
      )
      .input("dayId", sql.Int, fridayNewId)
      .input(
        "subj",
        sql.NVarChar(255),
        `You're Invited — ${YEAR} Albany Summer Convention Parking`,
      )
      .input(
        "body",
        sql.NVarChar(sql.MAX),
        "Dear [Name], we would like to invite you to serve on the parking team this year.",
      )
      .input("year", sql.Int, YEAR)
      .input("by", sql.NVarChar(100), "admin@demo.com")
      .input("resp", sql.Bit, 1)
      .input("type", sql.NVarChar(20), "invitation")
      .query(
        `INSERT INTO invitation_batches (name, convention_day_id, message_subject, message_body, year, created_by, response_needed, message_type, is_recruitment) OUTPUT INSERTED.id VALUES (@name, @dayId, @subj, @body, @year, @by, @resp, @type, 1);`,
      );
    const batchId = batchR.recordset[0].id; // recruitment campaign: Yes/Maybe replies feed the Decently export

    // Send to first 8 volunteers — vary responses
    const responses = ["yes", "yes", "yes", "yes", null, null, null, null];
    const invVols = VOLUNTEERS.slice(0, 8);
    let invCount = 0;
    for (const v of invVols) {
      const newVolId = oldIdToNewId[v.oldId];
      const responded = responses[invCount] ? new Date() : null;
      await pool
        .request()
        .input("volId", sql.Int, newVolId)
        .input("token", sql.NVarChar(100), crypto.randomUUID())
        .input("channel", sql.NVarChar(10), "email")
        .input(
          "subj",
          sql.NVarChar(255),
          `You're Invited — ${YEAR} Albany Summer Convention Parking`,
        )
        .input("body", sql.NVarChar(sql.MAX), "Invitation text.")
        .input("sentBy", sql.NVarChar(100), "admin@demo.com")
        .input("dayId", sql.Int, fridayNewId)
        .input("batchId", sql.Int, batchId)
        .input("responded", sql.DateTime2, responded)
        .input("response", sql.NVarChar(10), responses[invCount])
        .query(
          `INSERT INTO invitations (volunteer_id, token, channel, message_subject, message_body, sent_by, convention_day_id, batch_id, responded_at, response) VALUES (@volId, @token, @channel, @subj, @body, @sentBy, @dayId, @batchId, @responded, @response);`,
        );
      invCount++;
    }
    log(`  Batch ${batchId} with ${invCount} invitations (4 yes, 4 pending).`);

    // -------------------------------------------------------------------
    // Done
    // -------------------------------------------------------------------
    log("");
    log("=========================================");
    log("  Demo seed complete!");
    log("  Volunteers: " + VOLUNTEERS.length);
    log("  Convention days: " + CONVENTION_DAYS.length + " (3 schedulable)");
    log("  Sessions: " + Object.keys(sessMap).length);
    log("  Shifts: " + Object.keys(shiftMap).length);
    log("  Assignments: " + assignCount);
    log("=========================================");
    log("");
    log("Login credentials (password: Demo@2026!):");
    log("  admin@demo.com        ADMIN           (Barrett Bainbridge)");
    log("  asstadmin@demo.com    ASSISTANT_ADMIN (Arlo Wakefield)");
    log("  overseer@demo.com     OVERSEER        (Tristan Hawthorne)");
    log("  keyman@demo.com       KEYMAN          (Carson Barlowe)");
    log("  desk@demo.com         DESK            (Ross Bainbridge)");
    log("  volunteer@demo.com    REGISTERED      (Rufus Thackeray)");
  } finally {
    await pool.close();
    log("Connection closed.");
  }
}

seed().catch((err) => {
  logError("Seed failed:", err);
  process.exit(1);
});
