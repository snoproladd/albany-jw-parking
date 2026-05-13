/**
 * @file departments.js
 * @description Parking department keys, display labels, and lookup helpers.
 * Shared by the scheduler grid builder and drag-and-drop drop guards.
 */

/** @typedef {'lots_and_garages'|'signs'|'security'|'dropoff_pickup'|'mobile_support'} DepartmentKey */

/** @type {DepartmentKey[]} */
export const DEPARTMENT_KEYS = [
  "lots_and_garages",
  "signs",
  "security",
  "dropoff_pickup",
  "mobile_support",
];

/** @type {Record<DepartmentKey, string>} */
export const DEPT_LABEL = {
  lots_and_garages: "Lots and Garages",
  signs: "Signs",
  security: "Security",
  dropoff_pickup: "Dropoff / Pickup",
  mobile_support: "Mobile Support",
};

/** Reverse lookup: display label → department key. */
export const LABEL_TO_DEPT = Object.fromEntries(
  Object.entries(DEPT_LABEL).map(([k, v]) => [v, k]),
);

/**
 * Type guard — returns true if the given string is a valid DepartmentKey.
 * @param {string} maybe
 * @returns {maybe is DepartmentKey}
 */
export function isDepartmentKey(maybe) {
  return DEPARTMENT_KEYS.includes(/** @type {any} */ (maybe));
}
