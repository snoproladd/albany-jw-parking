/**
 * @file procedures.js
 * @description Registry of allowed stored procedures for the Run Procedure tool.
 *
 * Only procedures listed here can be executed — the route validates the
 * submitted proc name against this list before executing anything.
 * Add new entries here as needed; no other files need to change.
 */

/**
 * @typedef {Object} ProcedureDefinition
 * @property {string} name        - Exact dbo.ProcedureName as it exists in SQL Server.
 * @property {string} label       - Human-readable display name shown in the dropdown.
 * @property {string} description - Brief description shown below the dropdown.
 */

/** @type {ProcedureDefinition[]} */
export const PROCEDURES = [
  {
    name: "dbo.GetDecentlyExport",
    label: "Decently Export",
    description: "Exports volunteer data for use in Decently scheduling.",
  },
];

/**
 * Look up a procedure definition by its exact name.
 * Returns null if the name is not in the allowed list.
 *
 * @param {string} name
 * @returns {ProcedureDefinition | null}
 */
export function findProcedure(name) {
  return PROCEDURES.find((p) => p.name === name) || null;
}
