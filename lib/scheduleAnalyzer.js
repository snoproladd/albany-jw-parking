/**
 * @file lib/scheduleAnalyzer.js
 * @description Schedule violation detection combining a deterministic rule engine
 *              with Azure OpenAI enhancement for severity, confidence, and suggestions.
 *
 * Two-layer design:
 *  Rule engine — deterministic, runs first, produces raw violations.
 *    - time_overlap:         two assigned shifts overlap on the same day
 *    - blackout_violation:   assigned shift overlaps a volunteer's blackout
 *    - pre_session_overload: 2+ pre-session shifts for one volunteer on one day
 *    - post_session_overload: 2+ post-session shifts (security excluded from both)
 *    - understaffed:         slot assigned_count < vol_min (info-level flag)
 *
 *  AI layer — calls Azure OpenAI once with the full violation list and a
 *    schedule context payload. Returns enhanced severity/confidence/suggestions
 *    per violation and may add new ai_observation violations.
 *
 * Caching: A SHA-256 hash of all assignments + blackouts is compared against
 * the most recent run. If unchanged, the cached result is returned without
 * re-analysis unless force = true.
 *
 * @module lib/scheduleAnalyzer
 */

import crypto from "crypto";
import { AzureOpenAI } from "openai";
import { getConfig } from "../src/config/azureConfig.js";
import {
  getConventionDays,
  getConventionDaysWithSessions,
  getConflictGridData,
  getSlotStaffingForYear,
  getLatestScheduleViolationRun,
  insertScheduleViolationRun,
  insertScheduleViolation,
  getScheduleAnalysisRules,
} from "./dbSync.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const AZURE_OPENAI_API_VERSION = "2024-08-01-preview";

/** Maximum violations sent to AI in one call. Chunking not implemented for MVP. */
const AI_MAX_VIOLATIONS = 60;

// ─── Client cache ─────────────────────────────────────────────────────────────

/** @type {AzureOpenAI|null} */
let _client = null;
/** @type {string|null} */
let _deployment = null;

async function getClient() {
  if (_client && _deployment)
    return { client: _client, deployment: _deployment };
  const config = await getConfig();
  if (!config.AZURE_OPENAI_ENDPOINT || !config.AZURE_OPENAI_KEY) {
    throw new Error("Azure OpenAI not configured.");
  }
  _deployment = config.AZURE_OPENAI_DEPLOYMENT || "gpt-4o";
  _client = new AzureOpenAI({
    endpoint: config.AZURE_OPENAI_ENDPOINT,
    apiKey: config.AZURE_OPENAI_KEY,
    apiVersion: AZURE_OPENAI_API_VERSION,
    deployment: _deployment,
  });
  return { client: _client, deployment: _deployment };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Runs the full schedule analysis pipeline and persists results.
 *
 * Returns the cached result immediately if schedule is unchanged and
 * force is false.
 *
 * @param {{
 *   year:        number,
 *   triggeredBy: number|null,
 *   force?:      boolean,
 * }} opts
 * @returns {Promise<{
 *   runId:        number,
 *   isNew:        boolean,
 *   isUnchanged:  boolean,
 *   hash:         string,
 *   violations:   Array<object>,
 *   run:          object,
 * }>}
 */
export async function analyzeSchedule({ year, triggeredBy, force = false }) {
  // ── Fetch all schedule data ────────────────────────────────────────────────
  const [gridData, conventionDays, understaffedSlots] = await Promise.all([
    getConflictGridData(year),
    getConventionDays(year),
    getSlotStaffingForYear(year),
  ]);

  const { shifts, volunteers, assignments, blackouts } = gridData;

  // ── Compute schedule hash ──────────────────────────────────────────────────
  const hash = _computeHash(assignments, blackouts);

  // ── Check cache ────────────────────────────────────────────────────────────
  const latestRun = await getLatestScheduleViolationRun(year);

  if (!force && latestRun && latestRun.schedule_hash === hash) {
    return {
      runId: latestRun.id,
      isNew: false,
      isUnchanged: true,
      hash,
      violations: latestRun.violations || [],
      run: latestRun,
    };
  }

  // ── Build indices ──────────────────────────────────────────────────────────
  const shiftMap = new Map(shifts.map((s) => [s.shift_id, s]));
  const volunteerMap = new Map(volunteers.map((v) => [v.id, v]));
  const dayMap = new Map();

  /** @param {Date|null} t @returns {number|null} */
  const toMins = (t) =>
    t instanceof Date ? t.getUTCHours() * 60 + t.getUTCMinutes() : null;

  // Build session-derived program boundaries — more reliable than program_start/program_end
  // which are manually entered and prone to data entry errors.
  const daysWithSessions = await getConventionDaysWithSessions();
  const sessionBoundaries = new Map();
  for (const d of daysWithSessions) {
      if (!d.sessions.length) continue;
      sessionBoundaries.set(d.id, {
          start: Math.min(...d.sessions.map((s) => s.startMin)),
          end:   Math.max(...d.sessions.map((s) => s.endMin)),
      });
  }

  for (const d of conventionDays) {
      const bounds = sessionBoundaries.get(d.id);
      dayMap.set(d.id, {
          ...d,
          programStartMins: bounds?.start ?? toMins(d.program_start),
          programEndMins:   bounds?.end   ?? toMins(d.program_end),
      });
  }

  /** @type {Map<number, Array<object>>} volunteerId → assigned shift objects */
  const volunteerShiftMap = new Map();
  for (const a of assignments) {
    const sh = shiftMap.get(a.shift_id);
    if (!sh) continue;
    if (!volunteerShiftMap.has(a.volunteer_id))
      volunteerShiftMap.set(a.volunteer_id, []);
    volunteerShiftMap.get(a.volunteer_id).push(sh);
  }

  /** @type {Map<string, Array<{start_mins:number, end_mins:number}>>} "volId-dayId" → ranges */
  const blackoutIndex = new Map();
  for (const bk of blackouts) {
    const key = `${bk.volunteer_id}-${bk.day_id}`;
    if (!blackoutIndex.has(key)) blackoutIndex.set(key, []);
    blackoutIndex
      .get(key)
      .push({ start_mins: bk.start_mins, end_mins: bk.end_mins });
  }

  // ── Rule engine ────────────────────────────────────────────────────────────
  /** @type {Array<object>} */
  const rawViolations = [];
  let ruleId = 0;

  for (const [volId, volShifts] of volunteerShiftMap) {
    const vol = volunteerMap.get(volId);
    const volName = vol
      ? `${vol.firstName} ${vol.lastName}`
      : `Volunteer #${volId}`;

    // Group by day
    /** @type {Map<number, Array<object>>} */
    const byDay = new Map();
    for (const sh of volShifts) {
      if (!byDay.has(sh.day_id)) byDay.set(sh.day_id, []);
      byDay.get(sh.day_id).push(sh);
    }

    for (const [dayId, dayShifts] of byDay) {
      const day = dayMap.get(dayId);
      const dayLabel = day?.label ?? `Day ${dayId}`;
      const programStartMins = day?.programStartMins ?? null;
      const programEndMins = day?.programEndMins ?? null;

      // ── Time overlap ─────────────────────────────────────────────────
      for (let i = 0; i < dayShifts.length; i++) {
        for (let j = i + 1; j < dayShifts.length; j++) {
          const a = dayShifts[i],
            b = dayShifts[j];
          if (_overlaps(a.start_mins, a.end_mins, b.start_mins, b.end_mins)) {
            rawViolations.push({
              _ruleId: ++ruleId,
              volunteer_id: volId,
              volunteer_name: volName,
              shift_id: a.shift_id,
              shift_id_2: b.shift_id,
              convention_day_id: dayId,
              violation_type: "time_overlap",
              description:
                `${volName} is assigned to overlapping shifts on ${dayLabel}: ` +
                `"${a.shift_label}" (${_fmt(a.start_mins)}–${_fmt(a.end_mins)}) ` +
                `and "${b.shift_label}" (${_fmt(b.start_mins)}–${_fmt(b.end_mins)}).`,
              shift_a_label: a.shift_label,
              shift_b_label: b.shift_label,
            });
          }
        }
      }

      // ── Blackout violation ───────────────────────────────────────────
      const bks = blackoutIndex.get(`${volId}-${dayId}`) || [];
      for (const sh of dayShifts) {
        for (const bk of bks) {
          if (
            _overlaps(sh.start_mins, sh.end_mins, bk.start_mins, bk.end_mins)
          ) {
            rawViolations.push({
              _ruleId: ++ruleId,
              volunteer_id: volId,
              volunteer_name: volName,
              shift_id: sh.shift_id,
              convention_day_id: dayId,
              violation_type: "blackout_violation",
              description:
                `${volName} is assigned to "${sh.shift_label}" ` +
                `(${_fmt(sh.start_mins)}–${_fmt(sh.end_mins)}) on ${dayLabel} ` +
                `which overlaps a blackout window ` +
                `(${_fmt(bk.start_mins)}–${_fmt(bk.end_mins)}).`,
            });
          }
        }
      }

      // ── Pre/post session overload ────────────────────────────────────
      if (programStartMins !== null && programEndMins !== null) {
        const preShifts = dayShifts.filter(
          (sh) =>
            sh.end_mins <= programStartMins && sh.department !== "security",
        );
        const postShifts = dayShifts.filter(
          (sh) =>
            sh.start_mins >= programEndMins && sh.department !== "security",
        );

        if (preShifts.length > 1) {
          rawViolations.push({
            _ruleId: ++ruleId,
            volunteer_id: volId,
            volunteer_name: volName,
            shift_id: preShifts[0].shift_id,
            convention_day_id: dayId,
            violation_type: "pre_session_overload",
            description:
              `${volName} has ${preShifts.length} pre-session shifts on ${dayLabel}: ` +
              preShifts
                .map(
                  (s) =>
                    `"${s.shift_label}" (${_fmt(s.start_mins)}–${_fmt(s.end_mins)})`,
                )
                .join(", ") +
              ".",
            shift_list: preShifts.map((s) => s.shift_label),
          });
        }

        if (postShifts.length > 1) {
          rawViolations.push({
            _ruleId: ++ruleId,
            volunteer_id: volId,
            volunteer_name: volName,
            shift_id: postShifts[0].shift_id,
            convention_day_id: dayId,
            violation_type: "post_session_overload",
            description:
              `${volName} has ${postShifts.length} post-session shifts on ${dayLabel}: ` +
              postShifts
                .map(
                  (s) =>
                    `"${s.shift_label}" (${_fmt(s.start_mins)}–${_fmt(s.end_mins)})`,
                )
                .join(", ") +
              ".",
            shift_list: postShifts.map((s) => s.shift_label),
          });
        }
      }
    }
  }

  // ── Understaffed slots ─────────────────────────────────────────────────────
  for (const slot of understaffedSlots) {
    rawViolations.push({
      _ruleId: ++ruleId,
      volunteer_id: null,
      shift_id: slot.shift_id,
      convention_day_id: slot.day_id,
      violation_type: "understaffed",
      severity: "info",
      description:
        `Slot "${slot.location_name || slot.shift_label}" on ${slot.day_label} ` +
        `is understaffed: ${slot.assigned_count}/${slot.vol_min} minimum.`,
      assigned_count: slot.assigned_count,
      vol_min: slot.vol_min,
    });
  }

  // ── Build volunteer context for AI ─────────────────────────────────────────
  const violatedVolIds = new Set(
    rawViolations.filter((v) => v.volunteer_id).map((v) => v.volunteer_id),
  );

  const volunteerContext = [];
  for (const volId of violatedVolIds) {
    const vol = volunteerMap.get(volId);
    const volShifts = volunteerShiftMap.get(volId) || [];
    volunteerContext.push({
      id: volId,
      name: vol ? `${vol.firstName} ${vol.lastName}` : `Volunteer #${volId}`,
      allShifts: volShifts.map((sh) => ({
        day: dayMap.get(sh.day_id)?.label ?? `Day ${sh.day_id}`,
        label: sh.shift_label,
        dept: sh.department,
        start: sh.start_mins,
        end: sh.end_mins,
      })),
    });
  }

  // ── AI enhancement ─────────────────────────────────────────────────────────
  const violationsToSend = rawViolations.slice(0, AI_MAX_VIOLATIONS);
  const activeRules = await getScheduleAnalysisRules({ activeOnly: true });
  let aiEnhanced = null;

  try {
    aiEnhanced = await _callAI({
      year,
      conventionDays: [...dayMap.values()].map((d) => ({
        id: d.id,
        label: d.label,
        programStartMins: d.programStartMins,
        programEndMins: d.programEndMins,
      })),
      violations: violationsToSend,
      volunteerContext,
      customRules: activeRules.map((r) => r.rule_text),
      understaffedSlots: understaffedSlots.map((s) => ({
        day: s.day_label,
        shift: s.shift_label,
        location: s.location_name,
        assigned: s.assigned_count,
        minimum: s.vol_min,
      })),
    });
  } catch (err) {
    console.error("[scheduleAnalyzer] AI call failed:", err.message);
    // Fall through — persist rule-engine violations without AI enhancement
  }

  // ── Merge AI results ───────────────────────────────────────────────────────
  const finalViolations = _mergeAiResults(rawViolations, aiEnhanced);

  // ── Persist ────────────────────────────────────────────────────────────────
  const runId = await insertScheduleViolationRun({
    year,
    scheduleHash: hash,
    triggeredBy: triggeredBy ?? null,
    violationCount: finalViolations.length,
  });

  const savedViolations = [];
  for (const v of finalViolations) {
    const id = await insertScheduleViolation({
      runId,
      volunteerId: v.volunteer_id ?? null,
      shiftId: v.shift_id ?? null,
      shiftId2: v.shift_id_2 ?? null,
      conventionDayId: v.convention_day_id,
      violationType: v.violation_type,
      severity: v.severity ?? null,
      confidence: v.confidence ?? null,
      description: v.description,
      aiSuggestion: v.ai_suggestion ?? null,
      aiQuestion: v.ai_question ?? null,
    });
    savedViolations.push({ ...v, id });
  }

  return {
    runId,
    isNew: true,
    isUnchanged: false,
    hash,
    violations: savedViolations,
    run: {
      id: runId,
      year,
      schedule_hash: hash,
      triggered_by: triggeredBy,
      violation_count: finalViolations.length,
    },
  };
}

// ─── AI call ──────────────────────────────────────────────────────────────────

/**
 * @param {object} context
 * @returns {Promise<Array<object>>} Enhanced violation array from AI.
 */
async function _callAI(context) {
  const { client, deployment } = await getClient();

  const rulesBlock = context.customRules?.length
    ? `MANDATORY SCHEDULING RULES — set by the scheduling team. ` +
      `You MUST apply these when assessing every violation. ` +
      `When a rule directly changes your assessment, begin ai_suggestion with "Per rule N:" ` +
      `so overseers can verify it was applied.\n\n` +
      context.customRules.map((r, i) => `Rule ${i + 1}: ${r}`).join("\n") +
      `\n\n`
    : "";

  const systemPrompt =
    `You are a scheduling expert for a Jehovah's Witnesses regional convention ` +
    `parking volunteer team.\n\n` +
    rulesBlock +
    `You will receive a list of potential scheduling violations detected by a rule engine, ` +
    `plus full schedule context for the volunteers involved.\n\n` +
    `For EACH violation in the input:\n` +
    `  - Assign severity: "critical" (must fix now), "high" (strongly recommended), ` +
    `    "medium" (should review), "low" (minor), or "info" (informational only).\n` +
    `  - Assign confidence (0.0–1.0): how certain are you this is genuinely a problem ` +
    `    given all context? e.g. a 5-minute overlap between adjacent shifts might be 0.3, ` +
    `    while a 2-hour double-booking is 0.95.\n` +
    `  - ai_suggestion: a specific, actionable resolution if you can determine one. ` +
    `    Include shift names and days. Null if not determinable.\n` +
    `  - ai_question: a clarifying question for the overseer if the situation is ambiguous ` +
    `    and you need more context to assess it. Keep it short. Null if not needed.\n\n` +
    `Additionally, if you identify significant scheduling issues NOT in the provided list ` +
    `(e.g. an entire department has no coverage on a day), add them as new items with ` +
    `violation_type = "ai_observation" and id = null.\n\n` +
    `Context notes:\n` +
    `- Pre/post session shifts = shifts that occur before or after the main program sessions.\n` +
    `- Security department shifts during sessions are NOT counted toward shift-load violations.\n` +
    `- "understaffed" violations are informational; upgrade severity only if the slot is ` +
    `  critically understaffed (0 assigned, or a critical-path department).\n\n` +
    `Respond ONLY with this JSON — no markdown fences, no explanation:\n` +
    `{ "violations": [ { "id": <_ruleId from input or null>, "violation_type": "...", ` +
    `"severity": "...", "confidence": 0.0, "description": "...", ` +
    `"ai_suggestion": "..."|null, "ai_question": "..."|null } ] }`;

  // customRules are already in the system prompt — exclude from user content
  // to keep the payload clean and avoid the AI treating them as data rather than policy.
  const { customRules: _omit, ...contextForUser } = context;
  const userContent = JSON.stringify(contextForUser, null, 2);

  const response = await client.chat.completions.create({
    model: deployment,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: 0.1,
    max_tokens: 3000,
    response_format: { type: "json_object" },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty AI response");

  const parsed = JSON.parse(content);
  return parsed.violations || [];
}

/**
 * Performs a targeted single-violation AI re-analysis incorporating
 * the overseer's response to a previous AI question.
 *
 * @param {{
 *   violationDescription: string,
 *   originalAiQuestion:   string,
 *   overseerResponse:     string,
 *   volunteerName?:       string,
 *   dayLabel?:            string,
 * }} context
 * @returns {Promise<{
 *   aiSuggestion: string|null,
 *   aiQuestion:   string|null,
 *   confidence:   number|null,
 * }>}
 */
export async function reanalyzeViolation(context) {
    const { client, deployment } = await getClient();

    // Inject current active rules so re-analysis reflects the latest policy,
    // including any rule just created from this overseer response.
    const activeRules = await getScheduleAnalysisRules({ activeOnly: true });
    const rulesSection = activeRules.length > 0
        ? `\n\nCustom organizational rules (treat as authoritative policy):\n` +
          activeRules.map((r, i) => `${i + 1}. ${r.rule_text}`).join("\n") + "\n"
        : "";

    const systemPrompt =
        `You are a scheduling expert.${rulesSection} A scheduling violation was flagged, you asked a ` +
    `clarifying question, and the overseer has now responded.\n\n` +
    `Based on the original violation and the overseer's response, provide:\n` +
    `  - Updated ai_suggestion: a specific actionable resolution, or null.\n` +
    `  - Updated ai_question: a follow-up question if still unclear, or null.\n` +
    `  - Updated confidence: your confidence that this is a real problem (0.0–1.0).\n\n` +
    `Respond ONLY with JSON: { "ai_suggestion": "..."|null, "ai_question": "..."|null, "confidence": 0.0 }`;

  const response = await client.chat.completions.create({
    model: deployment,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          violation: context.violationDescription,
          volunteer: context.volunteerName,
          day: context.dayLabel,
          originalQuestion: context.originalAiQuestion,
          overseerResponse: context.overseerResponse,
        }),
      },
    ],
    temperature: 0.1,
    max_tokens: 400,
    response_format: { type: "json_object" },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty AI re-analysis response");

  const parsed = JSON.parse(content);
  return {
    aiSuggestion: parsed.ai_suggestion ?? null,
    aiQuestion: parsed.ai_question ?? null,
    confidence:
      typeof parsed.confidence === "number" ? parsed.confidence : null,
  };
}

// ─── Internals ────────────────────────────────────────────────────────────────

/**
 * Merges AI-enhanced violation data into the raw rule-engine array.
 * AI may enhance existing items (matched by _ruleId) or add new ai_observation rows.
 *
 * @param {Array<object>} raw
 * @param {Array<object>|null} aiResults
 * @returns {Array<object>}
 */
function _mergeAiResults(raw, aiResults) {
  if (!aiResults) return raw;

  const byRuleId = new Map(raw.map((v) => [v._ruleId, v]));
  const merged = [...raw];

  for (const ai of aiResults) {
    if (ai.id !== null && ai.id !== undefined) {
      const existing = byRuleId.get(ai.id);
      if (existing) {
        if (ai.severity) existing.severity = ai.severity;
        if (ai.confidence != null) existing.confidence = ai.confidence;
        if (ai.description) existing.description = ai.description;
        existing.ai_suggestion = ai.ai_suggestion ?? null;
        existing.ai_question = ai.ai_question ?? null;
      }
    } else if (ai.violation_type === "ai_observation") {
      // New observation from AI — needs a convention_day_id
      // Use day 0 from the convention if not determinable
      merged.push({
        volunteer_id: null,
        shift_id: null,
        convention_day_id: raw[0]?.convention_day_id ?? 1,
        violation_type: "ai_observation",
        severity: ai.severity ?? "info",
        confidence: ai.confidence ?? null,
        description: ai.description ?? "",
        ai_suggestion: ai.ai_suggestion ?? null,
        ai_question: ai.ai_question ?? null,
      });
    }
  }

  return merged;
}

/**
 * Computes a SHA-256 hash of the current schedule state (assignments + blackouts).
 * Used to detect whether a re-analysis is needed.
 *
 * @param {Array<{volunteer_id:number, shift_id:number}>}                        assignments
 * @param {Array<{volunteer_id:number, day_id:number, start_mins:number, end_mins:number}>} blackouts
 * @returns {string} Hex digest.
 */
function _computeHash(assignments, blackouts) {
  const aStr = assignments
    .map((a) => `${a.volunteer_id}:${a.shift_id}`)
    .sort()
    .join("|");
  const bStr = blackouts
    .map((b) => `${b.volunteer_id}:${b.day_id}:${b.start_mins}:${b.end_mins}`)
    .sort()
    .join("|");
  return crypto.createHash("sha256").update(`${aStr}||${bStr}`).digest("hex");
}

/** @param {number} aS @param {number} aE @param {number} bS @param {number} bE @returns {boolean} */
function _overlaps(aS, aE, bS, bE) {
  return aS < bE && bS < aE;
}

/** @param {number} mins @returns {string} */
function _fmt(mins) {
  const h = Math.floor(mins / 60),
    m = mins % 60,
    ap = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ap}`;
}
