/**
 * @file volunteerStatus.js
 * @description Pure utility functions for evaluating volunteer profile completeness.
 *
 * Intentionally has zero DB dependencies — it operates on volunteer row objects
 * already fetched from the DB. This makes it testable and reusable anywhere a
 * volunteer row is in scope (routes, dbSync, reporting, etc.).
 */

/**
 * @typedef {Object} CompletenessResult
 * @property {boolean}  complete - True when all required fields are present.
 * @property {string[]} missing  - Human-readable labels for each missing field.
 */

/**
 * Required fields and their display labels.
 * Each entry is [fieldKey, displayLabel, checkFn?].
 *
 * checkFn defaults to: value is not null, undefined, or empty string.
 *
 * @type {Array<[string, string, ((val: any) => boolean)?]>}
 */
const REQUIRED_FIELDS = [
  ["firstName", "First name"],
  ["lastName", "Last name"],
  ["email", "Email address"],
  ["phone", "Phone number"],
  ["gender", "Gender"],
  ["dobirth", "Date of birth"],
  ["stamina", "Stamina / physical ability"],
  ["congregation", "Congregation"],
];

/**
 * Evaluate whether a volunteer row has all required profile fields filled in.
 *
 * Required fields:
 *  - firstName, lastName
 *  - email, phone
 *  - gender, dobirth, stamina
 *  - congregation (covers both assigned-to-convention and visiting paths)
 *
 * Spiritual privileges and notes are intentionally NOT required.
 * Account type / password state is intentionally NOT required (guest path exists).
 *
 * @param {Record<string, any>} volunteer - A row from dbo.volunteer_in.
 * @returns {CompletenessResult}
 */
export function isProfileComplete(volunteer) {
  if (!volunteer || typeof volunteer !== "object") {
    return { complete: false, missing: ["Volunteer data unavailable"] };
  }

  const missing = [];

  for (const [field, label] of REQUIRED_FIELDS) {
    const val = volunteer[field];
    const isEmpty = val === null || val === undefined || val === "";
    if (isEmpty) missing.push(label);
  }

  return { complete: missing.length === 0, missing };
}
