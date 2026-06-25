/**
 * @file lib/noteAnalyzer.js
 * @description Azure OpenAI integration for volunteer intake note analysis.
 *
 * Accepts a volunteer's note text and returns a structured JSON result containing
 * a plain-English summary, category classification, suggested action items, and
 * proposed scheduling blackouts. All results are intended for human review —
 * nothing is applied automatically.
 *
 * Authentication: API key retrieved from Azure Key Vault via azureConfig.
 * The AzureOpenAI client is lazy-initialized and cached after first use.
 *
 * Hash utility: computeNoteHash() produces a SHA-256 hex digest of note text.
 * The route layer uses this to detect whether a note has changed since its last
 * analysis (staleness check), matching the HASHBYTES comparison in dbSync.js.
 *
 * @module lib/noteAnalyzer
 */

import { createHash } from "crypto";
import { AzureOpenAI } from "openai";
import { getConfig } from "../src/config/azureConfig.js";

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Azure OpenAI REST API version.
 * Verify this against your resource's supported versions in the Azure portal
 * (OpenAI resource → Overview → API version).
 */
const AZURE_OPENAI_API_VERSION = "2024-08-01-preview";

/** Valid category values enforced during response normalization. */
const VALID_CATEGORIES = [
  "scheduling_constraint",
  "preference",
  "personal_info",
  "data_correction",
  "other",
];

/**
 * System prompt sent with every analysis request.
 * Stable across calls — Azure OpenAI caches this on their side.
 * Describes the domain context, JSON schema, and behavioral rules.
 */
const SYSTEM_PROMPT = `You are a scheduling assistant for a Jehovah's Witnesses regional convention parking volunteer coordination team.

Your job: analyze a volunteer's intake note and extract actionable scheduling information.

Context:
- The convention runs Friday, Saturday, and Sunday.
- Each day has morning, afternoon, and evening sessions.
- Volunteers are assigned to parking shifts within those sessions.
- Overseers review notes to adjust schedules before and during the event.

Blackout types recognized by the scheduling system:
- "Full Day"    — volunteer unavailable for an entire convention day
- "Session"     — unavailable for an entire session (e.g., all of Friday morning)
- "Shift"       — unavailable for one specific shift within a session
- "Pre-session" — must leave before or cannot stay past a specific session boundary
- "Custom"      — a specific time window that does not align to standard session boundaries

Respond ONLY with a single valid JSON object. No markdown fences, no explanation, no text outside the JSON.

Required schema:
{
  "summary": "<1-2 sentence plain-English summary of the note's key information>",
  "category": "scheduling_constraint" | "preference" | "personal_info" | "data_correction" | "other",
  "actionItems": [
    { "description": "<clear action for the scheduling team>", "priority": "high" | "medium" | "low" }
  ],
  "suggestedBlackouts": [
    {
      "type": "Full Day" | "Session" | "Shift" | "Pre-session" | "Custom",
      "description": "<human-readable description of the constraint>",
      "dayHint": "Friday" | "Saturday" | "Sunday" | null,
      "timeHint": "morning" | "afternoon" | "evening" | null
    }
  ],
  "flags": ["scheduling_constraint" | "preference" | "pairing_request" | "data_correction" | "vague" | "no_action_needed"]
}

Rules:
- Notes with no actionable content (e.g. "N/a", "That's for the privilege", whitespace only): set category to "other", use empty arrays for actionItems and suggestedBlackouts, include the flag "no_action_needed".
- Soft preferences ("prefers mornings", "would rather not do back-to-back shifts") → actionItem only, not a suggestedBlackout.
- Hard constraints ("cannot do Sunday", "appointment until noon on Saturday") → suggestedBlackout, and an actionItem to confirm with the volunteer if unclear.
- Pairing requests ("my husband is Lucas Cunningham, please pair us") → actionItem with priority "medium", flag "pairing_request".
- Data corrections ("app wouldn't let me pick my birthdate") → actionItem with priority "low", flag "data_correction".
- Do not invent or infer beyond what the note explicitly states.
- Return valid JSON only. No trailing commas. No comments inside JSON.`;

// ─── Client cache ─────────────────────────────────────────────────────────────

/** @type {AzureOpenAI|null} */
let _client = null;
/** @type {string|null} */
let _deployment = null;

/**
 * Returns the cached AzureOpenAI client, initializing it on first call.
 * Throws if AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_KEY are not configured.
 *
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
 * Computes a SHA-256 hex digest of note text.
 * Used by routes to detect staleness (compare against volunteer_note_analyses.note_hash).
 * Matches the HASHBYTES('SHA2_256', ...) computation in getVolunteersWithUnanalyzedNotes().
 *
 * @param {string|null|undefined} noteText
 * @returns {string} 64-character lowercase hex string.
 */
export function computeNoteHash(noteText) {
  return createHash("sha256")
    .update(noteText ?? "")
    .digest("hex");
}

/**
 * Analyzes a volunteer's intake note via Azure OpenAI and returns a structured result.
 *
 * On API or parse failure, returns a result object with error populated and
 * empty arrays for actionItems, suggestedBlackouts, and flags so the caller
 * can always persist a row regardless of success.
 *
 * @param {number} volunteerId     - For logging context only; not sent to the API.
 * @param {string} firstName
 * @param {string} lastName
 * @param {string} noteText
 * @returns {Promise<{
 *   summary:            string|null,
 *   category:           string|null,
 *   actionItems:        Array<{ description: string, priority: string }>,
 *   suggestedBlackouts: Array<{ type: string, description: string, dayHint: string|null, timeHint: string|null }>,
 *   flags:              string[],
 *   promptTokens:       number|null,
 *   completionTokens:   number|null,
 *   rawResponse:        string|null,
 *   error:              string|null,
 * }>}
 */
export async function analyzeNote(volunteerId, firstName, lastName, noteText) {
  let rawResponse = null;

  try {
    const { client, deployment } = await getClient();

    const response = await client.chat.completions.create({
      model: deployment,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Volunteer: ${firstName} ${lastName}\nNote: ${noteText}`,
        },
      ],
      temperature: 0,
      max_tokens: 800,
      response_format: { type: "json_object" },
    });

    rawResponse = JSON.stringify(response);

    const content = response.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty content in Azure OpenAI response.");

    const parsed = JSON.parse(content);

    return {
      summary:
        typeof parsed.summary === "string" ? parsed.summary.trim() : null,
      category: VALID_CATEGORIES.includes(parsed.category)
        ? parsed.category
        : "other",
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      suggestedBlackouts: Array.isArray(parsed.suggestedBlackouts)
        ? parsed.suggestedBlackouts
        : [],
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      promptTokens: response.usage?.prompt_tokens ?? null,
      completionTokens: response.usage?.completion_tokens ?? null,
      rawResponse,
      error: null,
    };
  } catch (err) {
    console.error(
      `[noteAnalyzer] Analysis failed for volunteer ${volunteerId}:`,
      err.message,
    );
    return {
      summary: null,
      category: null,
      actionItems: [],
      suggestedBlackouts: [],
      flags: ["analysis_error"],
      promptTokens: null,
      completionTokens: null,
      rawResponse,
      error: err.message,
    };
  }
}
