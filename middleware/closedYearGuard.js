/**
 * @file middleware/closedYearGuard.js
 * @description Makes closed convention years read-only on the server.
 *
 * Every POST / PUT / PATCH / DELETE is checked against RULES below. A rule
 * names the route (method + path regex) and says where its year-scoped
 * record ids live (path, body or query). All ids for the request are
 * resolved to their convention years in ONE query
 * (getMinYearForRefs in lib/dbSync.js); if any of them is earlier than the
 * active year the request is refused with 403 before it reaches the route.
 *
 * Routes that do not match a rule — volunteer profiles, signs, templates,
 * system variables, the oversight structure, etc. — are not year-scoped
 * and pass straight through.
 *
 * Fails open: if the lookup itself errors, the request is allowed and the
 * error is logged, so a database hiccup never blocks the whole site.
 *
 * Mount after body parsing and inside demoContextMiddleware (so the demo
 * site checks against its own active year), before the routers.
 */

import { getActiveYear } from "../lib/conventionYear.js";
import { getMinYearForRefs } from "../lib/dbSync.js";

/** Methods that can change data. */
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * @typedef {"year"|"day"|"session"|"shift"|"assignment"|"location"|"subLocation"
 *   |"capacityRule"|"rendezvous"|"alertSchedule"|"slot"|"blackout"|"batch"
 *   |"invitation"|"meeting"|"lesson"} RefKind
 */

/**
 * @typedef {object} GuardRule
 * @property {string[]} methods - HTTP methods the rule applies to.
 * @property {RegExp}   path    - Matched against req.path; capture groups are passed to refs().
 * @property {(req: import("express").Request, m: RegExpMatchArray) => Array<[RefKind, unknown]>} refs
 *   Returns [kind, id] pairs; ids that are not positive integers are ignored.
 */

/**
 * Body field, as-is.
 *
 * @param {import("express").Request} req
 * @param {string} key
 * @returns {unknown}
 */
const b = (req, key) => req.body?.[key];

/**
 * One [kind, id] pair per element of an array body field.
 *
 * @param {RefKind} kind
 * @param {unknown} list
 * @returns {Array<[RefKind, unknown]>}
 */
const each = (kind, list) => (Array.isArray(list) ? list.map((id) => [kind, id]) : []);

/** @type {GuardRule[]} */
const RULES = [
    // ── Timelines ────────────────────────────────────────────────────
    { methods: ["POST"], path: /^\/oversight\/tools\/timelines\/days$/,
      refs: (req) => [["year", b(req, "year")]] },
    { methods: ["PUT", "DELETE"], path: /^\/oversight\/tools\/timelines\/days\/(\d+)$/,
      refs: (req, m) => [["day", m[1]]] },
    // Copying FROM a closed year is fine; the target year must be open.
    { methods: ["POST"], path: /^\/oversight\/tools\/timelines\/days\/\d+\/copy$/,
      refs: (req) => [["year", b(req, "year")]] },
    { methods: ["POST"], path: /^\/oversight\/tools\/timelines\/sessions$/,
      refs: (req) => [["day", b(req, "convention_day_id")]] },
    { methods: ["PUT", "DELETE"], path: /^\/oversight\/tools\/timelines\/sessions\/(\d+)$/,
      refs: (req, m) => [["session", m[1]]] },
    { methods: ["POST"], path: /^\/oversight\/tools\/timelines\/shifts$/,
      refs: (req) => [["session", b(req, "session_id")]] },
    { methods: ["PUT", "DELETE"], path: /^\/oversight\/tools\/timelines\/shifts\/(\d+)$/,
      refs: (req, m) => [["shift", m[1]]] },
    { methods: ["PATCH"], path: /^\/oversight\/tools\/timelines\/shifts\/(\d+)\/invitable$/,
      refs: (req, m) => [["shift", m[1]]] },
    { methods: ["POST"], path: /^\/oversight\/tools\/timelines\/assignments$/,
      refs: (req) => [["shift", b(req, "shift_id")], ["location", b(req, "location_task_id")]] },
    { methods: ["PUT", "DELETE"], path: /^\/oversight\/tools\/timelines\/assignments\/(\d+)$/,
      refs: (req, m) => [["assignment", m[1]], ["location", b(req, "location_task_id")]] },

    // ── Locations & Tasks, sub-locations, capacity alerts ────────────
    { methods: ["POST"], path: /^\/oversight\/tools\/locationsAndTasks$/,
      refs: (req) => [["year", b(req, "year")]] },
    { methods: ["PUT"], path: /^\/oversight\/tools\/locationsAndTasks\/(\d+)$/,
      refs: (req, m) => [["location", m[1]]] },
    { methods: ["PATCH"], path: /^\/oversight\/tools\/locationsAndTasks\/(\d+)\/active$/,
      refs: (req, m) => [["location", m[1]]] },
    { methods: ["PUT"], path: /^\/api\/locations\/(\d+)\/classification$/,
      refs: (req, m) => [["location", m[1]]] },
    { methods: ["POST"], path: /^\/api\/locations\/(\d+)\/sub-locations$/,
      refs: (req, m) => [["location", m[1]]] },
    { methods: ["PUT"], path: /^\/api\/locations\/(\d+)\/sub-locations\/reorder$/,
      refs: (req, m) => [["location", m[1]]] },
    { methods: ["PUT", "DELETE"], path: /^\/api\/locations\/sub-locations\/(\d+)$/,
      refs: (req, m) => [["subLocation", m[1]]] },
    { methods: ["POST"], path: /^\/api\/capacity-alerts$/,
      refs: (req) => [["location", b(req, "locationTaskId")], ["subLocation", b(req, "subLocationId")]] },
    { methods: ["PUT"], path: /^\/api\/capacity-alerts\/bulk-active$/,
      refs: (req) => each("capacityRule", b(req, "ids")) },
    { methods: ["PUT", "DELETE"], path: /^\/api\/capacity-alerts\/(\d+)$/,
      refs: (req, m) => [["capacityRule", m[1]]] },

    // ── Rendezvous points ────────────────────────────────────────────
    { methods: ["POST"], path: /^\/api\/rendezvous$/,
      refs: (req) => [["assignment", b(req, "schedule_assignment_id")]] },
    { methods: ["PUT", "DELETE"], path: /^\/api\/rendezvous\/(\d+)$/,
      refs: (req, m) => [["rendezvous", m[1]]] },
    { methods: ["POST", "DELETE"], path: /^\/api\/rendezvous\/(\d+)\/photo$/,
      refs: (req, m) => [["rendezvous", m[1]]] },
    { methods: ["POST"], path: /^\/api\/rendezvous\/(\d+)\/apply-to$/,
      refs: (req, m) => [["rendezvous", m[1]], ...each("assignment", b(req, "targetAssignmentIds"))] },

    // ── Shift alert schedules ────────────────────────────────────────
    { methods: ["POST"], path: /^\/oversight\/tools\/shift-alerts\/schedules$/,
      refs: (req) => [["year", b(req, "year")]] },
    { methods: ["PUT", "DELETE"], path: /^\/oversight\/tools\/shift-alerts\/schedules\/(\d+)$/,
      refs: (req, m) => [["alertSchedule", m[1]]] },
    { methods: ["DELETE"], path: /^\/oversight\/tools\/shift-alerts\/schedules\/(\d+)\/permanent$/,
      refs: (req, m) => [["alertSchedule", m[1]]] },
    { methods: ["POST"], path: /^\/oversight\/tools\/shift-alerts\/schedules\/(\d+)\/send$/,
      refs: (req, m) => [["alertSchedule", m[1]]] },

    // ── Scheduler, blackouts, conflict grid, attendance, publish ─────
    { methods: ["POST"], path: /^\/api\/scheduler\/slots$/,
      refs: (req) => [["assignment", b(req, "schedule_assignment_id")], ["day", b(req, "convention_day_id")]] },
    { methods: ["DELETE"], path: /^\/api\/scheduler\/slots\/(\d+)$/,
      refs: (req, m) => [["slot", m[1]]] },
    { methods: ["POST"], path: /^\/(?:api\/scheduler|edit-volunteer|api\/my-account)\/blackouts$/,
      refs: (req) => [["day", b(req, "conventionDayId")]] },
    { methods: ["DELETE"], path: /^\/(?:api\/scheduler|edit-volunteer|api\/my-account)\/blackouts\/(\d+)$/,
      refs: (req, m) => [["blackout", m[1]]] },
    { methods: ["POST"], path: /^\/api\/blackouts\/\d+$/,
      refs: (req) => (Array.isArray(b(req, "blackouts"))
          ? b(req, "blackouts").map((x) => ["day", x?.conventionDayId])
          : []) },
    { methods: ["DELETE"], path: /^\/api\/conflict-grid\/assignment$/,
      refs: (req) => [["shift", b(req, "shiftId")]] },
    { methods: ["POST"], path: /^\/oversight\/tools\/attendance\/record$/,
      refs: (req) => [["day", b(req, "conventionDayId")], ["shift", b(req, "shiftId")]] },
    { methods: ["POST"], path: /^\/oversight\/tools\/scheduler\/publish$/,
      refs: (req) => [["day", b(req, "dayId")]] },

    // ── Campaigns ────────────────────────────────────────────────────
    { methods: ["POST"], path: /^\/oversight\/tools\/campaigns\/send$/,
      refs: (req) => [
          ["batch", b(req, "existingBatchId")],
          ["batch", b(req, "parentBatchId")],
          ["day", b(req, "conventionDayId")],
          ["shift", b(req, "shiftId")],
      ] },
    { methods: ["PUT"], path: /^\/oversight\/tools\/campaigns\/batches\/(\d+)$/,
      refs: (req, m) => [["batch", m[1]]] },
    { methods: ["POST"], path: /^\/oversight\/tools\/campaigns\/invitations\/(\d+)\/(?:revoke|reinstate|answer)$/,
      refs: (req, m) => [["invitation", m[1]]] },
    { methods: ["POST"], path: /^\/edit-volunteer\/set-rsvp$/,
      refs: (req) => [["invitation", b(req, "invitationId")]] },
    { methods: ["PUT", "DELETE"], path: /^\/api\/campaign-meetings\/(\d+)$/,
      refs: (req, m) => [["meeting", m[1]]] },

    // ── Parking counts ───────────────────────────────────────────────
    { methods: ["POST"], path: /^\/api\/counts\/(?:submit|manual-submit)$/,
      refs: (req) => [["day", b(req, "conventionDayId")]] },
    { methods: ["DELETE"], path: /^\/api\/counts\/location\/\d+$/,
      refs: (req) => [["day", req.query?.dayId]] },

    // ── Lessons Learned ──────────────────────────────────────────────
    { methods: ["POST"], path: /^\/api\/lessons-learned$/,
      refs: (req) => [["year", b(req, "year")]] },
    { methods: ["POST"], path: /^\/api\/lessons-learned\/(?:batch-publish|publish-selected)$/,
      refs: (req) => [["year", b(req, "year")], ...each("lesson", b(req, "ids"))] },
    { methods: ["PUT", "DELETE", "PATCH", "POST"], path: /^\/api\/lessons-learned\/(\d+)(?:\/[a-z-]+(?:\/\d+)?)?$/,
      refs: (req, m) => [["lesson", m[1]], ["year", b(req, "year")]] },
];

/**
 * Collect the [kind, id] refs for a request from every matching rule,
 * keeping only positive-integer ids.
 *
 * @param {import("express").Request} req
 * @returns {Array<{ k: RefKind, id: number }>}
 */
export function collectRefs(req) {
    const out = [];
    for (const rule of RULES) {
        if (!rule.methods.includes(req.method)) continue;
        const m = req.path.match(rule.path);
        if (!m) continue;
        for (const [k, raw] of rule.refs(req, m)) {
            const id = Number(raw);
            if (Number.isInteger(id) && id > 0) out.push({ k, id });
        }
    }
    return out;
}

/**
 * Express middleware: refuse writes to records in a closed convention year.
 *
 * @param {import("express").Request}      req
 * @param {import("express").Response}     res
 * @param {import("express").NextFunction} next
 * @returns {Promise<void>}
 */
export async function closedYearGuard(req, res, next) {
    if (!WRITE_METHODS.has(req.method)) return next();

    const refs = collectRefs(req);
    if (refs.length === 0) return next();

    try {
        const [activeYear, minYear] = await Promise.all([
            getActiveYear(),
            getMinYearForRefs(refs),
        ]);
        if (minYear != null && minYear < activeYear) {
            res.status(403).json({
                success: false,
                readOnlyYear: minYear,
                error: `${minYear} is closed and read-only. Changes can only be made to ${activeYear}.`,
            });
            return;
        }
    } catch (err) {
        console.error(
            `[${new Date().toISOString()}] [middleware/closedYearGuard.js]`,
            `Year check failed for ${req.method} ${req.path} — allowing request:`,
            err,
        );
    }
    return next();
}
