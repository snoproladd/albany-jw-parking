/**
 * @file lib/constraintInterpreter.js
 * @description Azure OpenAI integration for interpreting free-text scheduling
 *              constraint descriptions entered by overseers.
 *
 * Unlike the note analyzer and SMS analyzer, this function produces ONLY a
 * single structured blackout suggestion. It is scoped to one task: "given an
 * overseer's plain-English description of a scheduling constraint, return the
 * exact time window that should be blocked out for that volunteer."
 *
 * Convention day and session context is passed in as a pre-built string so
 * the AI has concrete day IDs, labels, and session times to reference when
 * producing minute values.
 *
 * Authentication: API key retrieved via azureConfig.
 *
 * @module lib/constraintInterpreter
 */

import { AzureOpenAI } from "openai";
import { getConfig } from "../src/config/azureConfig.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const AZURE_OPENAI_API_VERSION = "2024-08-01-preview";

/** Valid type values for the returned suggestion. */
const VALID_TYPES = ["Full Day", "Session", "Custom", "Pre-session"];

// ─── Client cache ─────────────────────────────────────────────────────────────

/** @type {AzureOpenAI|null} */
let _client = null;
/** @type {string|null} */
let _deployment = null;

/**
 * Lazy-initializes and caches the AzureOpenAI client.
 * @returns {Promise<{ client: AzureOpenAI, deployment: string }>}
 */
async function getClient() {
  if (_client && _deployment)
    return { client: _client, deployment: _deployment };

  const config = await getConfig();

  if (!config.AZURE_OPENAI_ENDPOINT || !config.AZURE_OPENAI_KEY) {
    throw new Error(
      "Azure OpenAI is not configured. " +
        "Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY in Key Vault or .env.",
    );
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

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Builds a human-readable convention schedule context string to include in
 * the AI prompt. Call once per request from the route handler and pass the
 * result to interpretConstraint().
 *
 * @param {Array<{
 *   id:              number,
 *   label:           string,
 *   convention_date: string,
 *   sessions: Array<{
 *     id:       number,
 *     label:    string,
 *     startMin: number,
 *     endMin:   number,
 *   }>
 * }>} days  - From getConventionDaysWithSessions().
 * @returns {string}
 */
export function buildDayContext(days) {
  const lines = days.map((day) => {
    const sessionLines = day.sessions.map(
      (s) =>
        `    • ${s.label}: ${_fmtMins(s.startMin)}–${_fmtMins(s.endMin)} ` +
        `(${s.startMin}–${s.endMin} mins from midnight)`,
    );
    return `${day.label} (${day.convention_date}):\n${sessionLines.join("\n")}`;
  });
  return lines.join("\n\n");
}

/**
 * Interprets a free-text scheduling constraint description entered by an
 * overseer and returns a structured blackout suggestion.
 *
 * The result is returned to the client for confirmation — nothing is saved
 * to the database by this function. The caller is responsible for persisting
 * the suggestion after the overseer confirms.
 *
 * @param {string} text           - Overseer's description, e.g. "Needs to leave by 12:30 Saturday."
 * @param {string} firstName      - Volunteer's first name.
 * @param {string} lastName       - Volunteer's last name.
 * @param {string} dayContext     - Pre-built schedule context from buildDayContext().
 * @returns {Promise<{
 *   blackoutType:  string|null,
 *   description:   string|null,
 *   dayHint:       string|null,
 *   timeHint:      string|null,
 *   startMins:     number|null,
 *   endMins:       number|null,
 *   error:         string|null,
 *   rawResponse:   string|null,
 * }>}
 */
export async function interpretConstraint(
  text,
  firstName,
  lastName,
  dayContext,
) {
  let rawResponse = null;

  const systemPrompt =
    `You are a scheduling assistant for a Jehovah's Witnesses regional convention ` +
    `parking volunteer coordination team.\n\n` +
    `An overseer has described a scheduling constraint for a volunteer. ` +
    `Extract the exact time window that should be blocked for that volunteer ` +
    `and return it as a single JSON object.\n\n` +
    `Convention schedule:\n${dayContext}\n\n` +
    `Rules:\n` +
    `- Use minutes-from-midnight (0 = 12:00 AM, 560 = 9:20 AM, 750 = 12:30 PM, 1005 = 4:45 PM).\n` +
    `- Set startMins and endMins when you can determine specific times from the constraint.\n` +
    `- dayHint must be exactly: "Friday", "Saturday", "Sunday", or null.\n` +
    `- timeHint must be exactly: "morning", "afternoon", "evening", or null.\n` +
    `- blackoutType: "Full Day" (all day unavailable), "Session" (one named session), ` +
    `"Pre-session" (must leave/arrive at session boundary), "Custom" (specific time range).\n` +
    `- description: one clear sentence describing the constraint for the overseer.\n` +
    `- If the constraint is ambiguous, set startMins and endMins to null and ` +
    `use dayHint and timeHint to capture what you do know.\n\n` +
    `Respond ONLY with this JSON — no markdown, no explanation:\n` +
    `{\n` +
    `  "blackoutType": "Full Day" | "Session" | "Pre-session" | "Custom",\n` +
    `  "description": "<one-sentence description>",\n` +
    `  "dayHint": "Friday" | "Saturday" | "Sunday" | null,\n` +
    `  "timeHint": "morning" | "afternoon" | "evening" | null,\n` +
    `  "startMins": <number|null>,\n` +
    `  "endMins": <number|null>\n` +
    `}`;

  try {
    const { client, deployment } = await getClient();

    const response = await client.chat.completions.create({
      model: deployment,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Volunteer: ${firstName} ${lastName}\nConstraint: ${text}`,
        },
      ],
      temperature: 0,
      max_tokens: 300,
      response_format: { type: "json_object" },
    });

    rawResponse = JSON.stringify(response);

    const content = response.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty content in Azure OpenAI response.");

    const parsed = JSON.parse(content);

    return {
      blackoutType: VALID_TYPES.includes(parsed.blackoutType)
        ? parsed.blackoutType
        : "Custom",
      description:
        typeof parsed.description === "string"
          ? parsed.description.trim()
          : null,
      dayHint: ["Friday", "Saturday", "Sunday"].includes(parsed.dayHint)
        ? parsed.dayHint
        : null,
      timeHint: ["morning", "afternoon", "evening"].includes(parsed.timeHint)
        ? parsed.timeHint
        : null,
      startMins: typeof parsed.startMins === "number" ? parsed.startMins : null,
      endMins: typeof parsed.endMins === "number" ? parsed.endMins : null,
      error: null,
      rawResponse,
    };
  } catch (err) {
    console.error(
      "[constraintInterpreter] Interpretation failed:",
      err.message,
    );
    return {
      blackoutType: null,
      description: null,
      dayHint: null,
      timeHint: null,
      startMins: null,
      endMins: null,
      error: err.message,
      rawResponse,
    };
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

/**
 * Formats minutes-from-midnight to "h:MM AM/PM" for the day context string.
 * @param {number|null} mins
 * @returns {string}
 */
function _fmtMins(mins) {
  if (mins == null) return "—";
  const h = Math.floor(mins / 60),
    m = mins % 60,
    ap = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ap}`;
}
