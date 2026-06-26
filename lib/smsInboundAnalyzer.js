/**
 * @file lib/smsInboundAnalyzer.js
 * @description Azure OpenAI integration for analyzing freeform inbound SMS
 *              messages from parking volunteers.
 *
 * Accepts a volunteer's raw SMS body and returns a structured JSON result
 * containing a plain-English summary, category classification, suggested
 * action items, and any scheduling blackouts implied by the message.
 * All results are intended for human review — nothing is applied automatically.
 *
 * The AzureOpenAI client is shared with noteAnalyzer.js conceptually but
 * initialized independently here to keep the two analyzers decoupled. Both
 * lazy-initialize and cache their client on first use.
 *
 * Authentication: API key retrieved from Azure Key Vault via azureConfig.
 *
 * @module lib/smsInboundAnalyzer
 */

import { AzureOpenAI } from "openai";
import { getConfig } from "../src/config/azureConfig.js";

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Azure OpenAI REST API version.
 * Must match the supported version on the albany-parking-resource deployment.
 */
const AZURE_OPENAI_API_VERSION = "2024-08-01-preview";

/** Valid category values enforced during response normalization. */
const VALID_CATEGORIES = [
  "scheduling_constraint",
  "general_message",
  "question",
  "other",
];

/**
 * System prompt for SMS analysis.
 * Scoped to freeform volunteer texts — not intake form notes.
 * Focuses on scheduling constraints, unavailability, and general requests.
 */
const SYSTEM_PROMPT = `You are a scheduling assistant for a Jehovah's Witnesses regional convention parking volunteer coordination team.

Your job: analyze a short SMS text message sent by a parking volunteer and extract any actionable scheduling information or requests.

Context:
- The convention runs Friday, Saturday, and Sunday.
- Each day has morning, afternoon, and evening sessions.
- Volunteers are assigned to parking shifts within those sessions.
- Overseers receive these messages and will follow up directly with the volunteer.
- Messages are typically brief, informal, and may contain typos or abbreviations.

Blackout types recognized by the scheduling system:
- "Full Day"    — volunteer unavailable for an entire convention day
- "Session"     — unavailable for an entire session (e.g., all of Friday morning)
- "Shift"       — unavailable for one specific shift within a session
- "Pre-session" — must leave before or cannot stay past a specific session boundary
- "Custom"      — a specific time window that does not align to standard session boundaries

Respond ONLY with a single valid JSON object. No markdown fences, no explanation, no text outside the JSON.

Required schema:
{
  "summary": "<1-2 sentence plain-English summary of what the volunteer is communicating>",
  "category": "scheduling_constraint" | "general_message" | "question" | "other",
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
  "flags": ["scheduling_constraint" | "question" | "needs_reply" | "data_correction" | "vague" | "no_action_needed"]
}

Rules:
- If the message has no scheduling content (e.g. "ok", "thanks", "sounds good"): set category to "other", empty arrays for actionItems and suggestedBlackouts, include flag "no_action_needed".
- Unavailability statements ("can't make it Friday", "I won't be there Saturday morning") → suggestedBlackout + high priority actionItem to contact the volunteer.
- General questions or requests ("can I switch shifts?", "who is my overseer?") → actionItem with priority "medium", flag "question".
- Vague messages where intent is unclear → flag "vague", actionItem to follow up for clarification.
- Do not invent or infer beyond what the message explicitly states.
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

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Analyzes a freeform inbound SMS message via Azure OpenAI and returns a
 * structured result.
 *
 * On API or parse failure, returns a result object with error populated and
 * empty arrays for actionItems, suggestedBlackouts, and flags, so the caller
 * can always persist a row regardless of success.
 *
 * @param {string}      rawBody    - The original SMS message text.
 * @param {string}      firstName  - Volunteer's first name (for context only).
 * @param {string}      lastName   - Volunteer's last name (for context only).
 * @param {number|null} volunteerId - For logging context only; not sent to the API.
 * @returns {Promise<{
 *   summary:            string|null,
 *   category:           string|null,
 *   actionItems:        Array<{ description: string, priority: string }>,
 *   suggestedBlackouts: Array<{
 *     type:        string,
 *     description: string,
 *     dayHint:     string|null,
 *     timeHint:    string|null,
 *   }>,
 *   flags:              string[],
 *   promptTokens:       number|null,
 *   completionTokens:   number|null,
 *   rawResponse:        string|null,
 *   error:              string|null,
 * }>}
 */
export async function analyzeSms(
  rawBody,
  firstName,
  lastName,
  volunteerId = null,
) {
  let rawResponse = null;

  try {
    const { client, deployment } = await getClient();

    const response = await client.chat.completions.create({
      model: deployment,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Volunteer: ${firstName} ${lastName}\nSMS: ${rawBody}`,
        },
      ],
      temperature: 0,
      max_tokens: 600,
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
      `[smsInboundAnalyzer] Analysis failed for volunteer ${volunteerId ?? "unknown"}:`,
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
