/**
 * @file capacityAlerter.js
 * @description Event-driven capacity alert engine. Evaluates active
 * capacity_alert_rules against a newly recorded parking count and sends
 * SMS alerts via Twilio when a threshold is crossed.
 *
 * Edge-triggered design: each rule carries an is_armed flag. A rule only
 * fires while armed, then disarms itself so repeated heartbeats above
 * threshold don't spam recipients. The rule re-arms once the count
 * returns to the safe side of the threshold, so the next crossing fires
 * again.
 *
 * Threshold types:
 *   'percent' — threshold_value is a percentage of the location's capacity
 *   'count'   — threshold_value is a raw vehicle count
 *
 * Direction:
 *   'above' — fires when count >= limit (typical "nearing full" alert)
 *   'below' — fires when count <= limit (e.g. "lot draining" alert)
 */

import {
  getActiveCapacityAlertRulesForLocation,
  disarmCapacityAlertRule,
  rearmCapacityAlertRule,
  getVolunteersByRoles,
  logCapacityAlert,
} from "./dbSync.js";

import { sendAlertSms } from "./alertScheduler.js";

/** Role tiers included when a rule's recipient_role is set to a given minimum. */
const ROLE_ORDER = [
  "NON_REGISTERED",
  "REGISTERED",
  "DESK",
  "KEYMAN",
  "OVERSEER",
  "ASSISTANT_ADMIN",
  "ADMIN",
];

/**
 * Resolve the list of roles at or above the rule's recipient_role tier.
 *
 * @param {string} minRole
 * @returns {string[]}
 */
function rolesAtOrAbove(minRole) {
  const idx = ROLE_ORDER.indexOf(minRole);
  return idx === -1
    ? ["OVERSEER", "ASSISTANT_ADMIN", "ADMIN"]
    : ROLE_ORDER.slice(idx);
}

/**
 * Compute the numeric limit for a rule given the location's capacity.
 *
 * @param {{ threshold_type: 'percent'|'count', threshold_value: number, capacity: number|null }} rule
 * @returns {number|null}  null when a percent rule has no capacity to base itself on
 */
function resolveLimit(rule) {
  if (rule.threshold_type === "count") {
    return rule.threshold_value;
  }
  if (rule.capacity == null) {
    return null;
  }
  return Math.ceil((rule.threshold_value / 100) * rule.capacity);
}

/**
 * Build the default SMS body for a fired rule.
 *
 * @param {{ threshold_type: string, threshold_value: number, direction: string }} rule
 * @param {number} count
 * @param {number} limit
 * @param {string} locationName
 * @returns {string}
 */
function buildDefaultMessage(rule, count, limit, locationName) {
  const verb = rule.direction === "above" ? "reached" : "dropped to";
  const thresholdLabel =
    rule.threshold_type === "percent"
      ? `${rule.threshold_value}% capacity (${limit})`
      : `${limit} vehicles`;
  return `Capacity alert: ${locationName} has ${verb} ${thresholdLabel}. Current count: ${count}.`;
}

/**
 * Evaluate all active capacity alert rules for a location/sub-location
 * against a newly recorded count, firing SMS alerts for any rule that
 * crosses its threshold while armed, and re-arming rules whose count
 * has returned to the safe side.
 *
 * Failures to send are logged per-recipient but do not throw — a
 * capacity alert failure should never break the count submission flow.
 *
 * @param {{
 *   locationTaskId:  number,
 *   locationName:    string,
 *   subLocationId:   number|null,
 *   count:           number,
 *   accountSid:      string,
 *   authToken:       string,
 *   messagingSid:    string,
 *   logError:        (...args: any[]) => void,
 * }} params
 * @returns {Promise<void>}
 */
export async function evaluateCapacityAlerts({
  locationTaskId,
  locationName,
  subLocationId,
  count,
  accountSid,
  authToken,
  messagingSid,
  logError,
}) {
  const err = logError || console.error;

  let rules;
  try {
    rules = await getActiveCapacityAlertRulesForLocation(
      locationTaskId,
      subLocationId,
    );
  } catch (e) {
    err("[capacityAlerter] failed to load rules:", e);
    return;
  }

  for (const rule of rules) {
    const limit = resolveLimit(rule);
    if (limit == null) continue;

    const crossed =
      rule.direction === "above" ? count >= limit : count <= limit;

    if (crossed && rule.is_armed) {
      let claimed = false;
      try {
        claimed = await disarmCapacityAlertRule(rule.id);
      } catch (e) {
        err("[capacityAlerter] failed to claim rule", rule.id, e);
        continue;
      }

      // Another concurrent evaluation (e.g. an overlapping heartbeat)
      // already claimed and is firing this rule. Skip to avoid a
      // duplicate SMS blast.
      if (!claimed) continue;

      let recipients = [];
      try {
        recipients = await getVolunteersByRoles(
          rolesAtOrAbove(rule.recipient_role),
        );
      } catch (e) {
        err("[capacityAlerter] failed to load recipients:", e);
        continue;
      }

      const body =
        rule.message_override ||
        buildDefaultMessage(rule, count, limit, locationName);
      let sentCount = 0;
      let lastError = null;

      for (const contact of recipients) {
        try {
          await sendAlertSms(
            contact.phone,
            body,
            accountSid,
            authToken,
            messagingSid,
          );
          sentCount += 1;
        } catch (e) {
          lastError = e.message || String(e);
          err("[capacityAlerter] send failed for", contact.id, e);
        }
      }

      try {
        await logCapacityAlert({
          ruleId: rule.id,
          locationTaskId,
          triggeredCount: count,
          recipientCount: sentCount,
          status: sentCount > 0 ? "sent" : "failed",
          errorMsg: sentCount > 0 ? null : lastError,
        });
      } catch (e) {
        err("[capacityAlerter] failed to log rule fire", rule.id, e);
      }
    } else if (!crossed && !rule.is_armed) {
      try {
        await rearmCapacityAlertRule(rule.id);
      } catch (e) {
        err("[capacityAlerter] failed to re-arm rule", rule.id, e);
      }
    }
  }
}
