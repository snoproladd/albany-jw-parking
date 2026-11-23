/**
 * @file public/js/permissions.js
 * @description The signed-in person's catalogue permissions for client
 * scripts (multi-department phase 3d).
 *
 * Reads the JSON block written by views/partials/permissionsData.ejs and
 * exposes:
 *
 *     window.AppPermissions.can("volunteers.edit")   // → boolean
 *     window.AppPermissions.list()                    // → string[]
 *
 * Only for showing or hiding controls; the server checks every request.
 * Load with `defer` after the partial; scripts that use it should also be
 * deferred so they run after it.
 */

(() => {
    "use strict";

    /** @type {Set<string>} */
    let held = new Set();

    const el = document.getElementById("permissions-data");
    if (el) {
        try {
            const parsed = JSON.parse(el.textContent || "[]");
            if (Array.isArray(parsed)) held = new Set(parsed.filter((k) => typeof k === "string"));
        } catch (err) {
            console.error("[permissions] could not read permissions-data:", err);
        }
    }

    window.AppPermissions = Object.freeze({
        /**
         * True when the person holds the catalogue key.
         * @param {string} key
         * @returns {boolean}
         */
        can(key) {
            return held.has(key);
        },

        /**
         * Every catalogue key the person holds, sorted.
         * @returns {string[]}
         */
        list() {
            return [...held].sort();
        },
    });
})();
