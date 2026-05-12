// src/config/privilegeRules.js
// -----------------------------------------------------------------------------
// Central privilege configuration and validation helpers.
//
// This module is used on the server side (Node/Express) and its data can be
// safely serialized and sent to the client as window.PRIVILEGE_RULES for use
// by public/js/privilegeEnforcer.js and summary/spiritual info pages.
// -----------------------------------------------------------------------------

/**
 * High-level grouping of privileges by category.
 *
 * These are mostly for UI/organization (e.g., section headings), not for
 * incompatibility logic. The keys should be stable, human-readable categories,
 * while the arrays contain the underlying privilege keys.
 *
 * Example UI usage:
 *  - render section "Ministry" with options from PRIVILEGES.Ministry
 *
 * @type {Readonly<Record<string, string[]>>}
 */
export const PRIVILEGES = Object.freeze({
  Ministry: ["auxPioneer", "regPioneer", "specPioneer"],
  Congregation: ["minServ", "elder"],
  Other: ["sfs"],
});

/**
 * Incompatibility rules for privileges and genders.
 *
 * Each key is a privilege (or gender) identifier. The array contains keys
 * that are incompatible with that privilege/gender.
 *
 * For example:
 *  - "female": ["male", "minServ", "elder"]
 *    => a female cannot be assigned male-only roles or congregation positions.
 *  - "auxPioneer": ["regPioneer", "specPioneer", "sfs"]
 *    => cannot hold multiple pioneer/SFS statuses simultaneously.
 *
 * These keys must align with:
 *  - checkbox values or data-privilege attributes in the UI
 *  - gender keys returned by your forms (e.g., "male", "female")
 *  - the usage in public/js/privilegeEnforcer.js
 *
 * @type {Readonly<Record<string, string[]>>}
 */
export const INCOMPATIBILITIES = Object.freeze({
  // Gender keys
  male: ["female"],
  female: ["male", "minServ", "elder"],

  // Ministry privileges
  auxPioneer: ["regPioneer", "specPioneer", "sfs"],
  regPioneer: ["auxPioneer", "specPioneer", "sfs"],
  specPioneer: ["auxPioneer", "regPioneer", "sfs"],

  // Congregation privileges
  minServ: ["female", "elder"],
  elder: ["female", "minServ"],

  // Other full-time service
  sfs: ["auxPioneer", "regPioneer", "specPioneer"],
});

/**
 * Checks whether a set of selected privilege keys is internally consistent
 * with the INCOMPATIBILITIES map.
 *
 * This is intended for server-side validation where you receive an array of
 * privilege identifiers from the client (e.g. ["auxPioneer", "minServ"]).
 *
 * Algorithm:
 *  - de-duplicate the input
 *  - for each pair (a, b), check if:
 *      INCOMPATIBILITIES[a] includes b  OR
 *      INCOMPATIBILITIES[b] includes a
 *    If so, the combination is invalid.
 *
 * @param {string[]} selected - Array of privilege keys (may contain duplicates).
 * @returns {boolean} true if the combination is valid, false if any incompatibility is found.
 */
export function isValidPrivilegeCombination(selected) {
  const unique = [...new Set(selected)];

  for (let i = 0; i < unique.length; i++) {
    const a = unique[i];
    const aBad = INCOMPATIBILITIES[a] || [];

    for (let j = i + 1; j < unique.length; j++) {
      const b = unique[j];
      const bBad = INCOMPATIBILITIES[b] || [];

      if (aBad.includes(b) || bBad.includes(a)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Convenience helper for serializing rules to the client.
 *
 * This gives you a single object that matches what public/js/privilegeEnforcer.js
 * expects as window.PRIVILEGE_RULES:
 *
 * {
 *   male: [...],
 *   female: [...],
 *   auxPioneer: [...],
 *   ...
 * }
 *
 * You can either:
 *   - attach it directly as window.PRIVILEGE_RULES in an inline <script>, or
 *   - embed as JSON in a <script type="application/json" id="privilege-rules-json">
 *
 * Example EJS:
 *  <script id="privilege-rules-json" type="application/json">
 *    <%- JSON.stringify(getClientPrivilegeRules()) %>
 *  </script>
 *
 * @returns {Record<string, string[]>}
 */
export function getClientPrivilegeRules() {
  // Right now, the client only needs the incompatibilities map.
  // If you ever want to send PRIVILEGES as well, you could change this to:
  // return { ...INCOMPATIBILITIES, __groups: PRIVILEGES };
  return { ...INCOMPATIBILITIES };
}
