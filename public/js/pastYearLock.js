/**
 * @file public/js/pastYearLock.js
 * @description Read-only mode for pages viewing a closed convention year
 * (loaded by views/partials/yearBanner.ejs only when `?year=` points at an
 * earlier year than the active one).
 *
 * Stops saves before they leave the browser:
 *   - fetch() calls with POST / PUT / PATCH / DELETE get an immediate 403
 *     JSON response ({ success: false, error }) instead of a network call,
 *     so each page's existing error handling shows the message;
 *   - <form method="post"> submissions are cancelled.
 * Either way the banner flashes so it is clear why nothing happened.
 *
 * Reading (GET) is untouched, so filters, year pickers and navigation keep
 * working. This is a convenience only — middleware/closedYearGuard.js
 * refuses the same writes on the server.
 */

(() => {
    "use strict";

    const banner = document.getElementById("pastYearBanner");
    if (!banner) return;

    const pastYear = banner.dataset.pastYear;
    const activeYear = banner.dataset.activeYear;
    const message = `${pastYear} is closed and read-only. Changes can only be made to ${activeYear}.`;

    const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

    /**
     * Writes that are not about the year being viewed and stay allowed:
     * signing out, bug reports, tour dismissal and the rollover prompt.
     */
    const ALLOWED_PREFIXES = [
        "/logout",
        "/api/bug-report",
        "/api/tours/dismiss",
        "/api/convention-year/",
        "/oversight/tools/start-year",
    ];

    /**
     * Whether a URL is on the allow-list.
     *
     * @param {string} url
     * @returns {boolean}
     */
    function isAllowed(url) {
        let path;
        try {
            path = new URL(url, window.location.href).pathname;
        } catch {
            return false;
        }
        return ALLOWED_PREFIXES.some((p) => path.startsWith(p));
    }

    /**
     * Flash the banner and bring it into view.
     *
     * @returns {void}
     */
    function flashBanner() {
        banner.classList.remove("is-flashing");
        // Force a reflow so the animation restarts on repeated attempts.
        void banner.offsetWidth;
        banner.classList.add("is-flashing");
        banner.scrollIntoView({ block: "nearest" });
    }

    // ── fetch() ─────────────────────────────────────────────────────
    const nativeFetch = window.fetch.bind(window);

    window.fetch = (input, init) => {
        const isRequest = typeof Request !== "undefined" && input instanceof Request;
        const url = isRequest ? input.url : String(input);
        const method = String(init?.method || (isRequest ? input.method : "GET")).toUpperCase();

        if (WRITE_METHODS.has(method) && !isAllowed(url)) {
            flashBanner();
            return Promise.resolve(
                new Response(
                    JSON.stringify({ success: false, readOnlyYear: Number(pastYear), error: message }),
                    { status: 403, headers: { "Content-Type": "application/json" } },
                ),
            );
        }
        return nativeFetch(input, init);
    };

    // ── <form method="post"> ────────────────────────────────────────
    document.addEventListener(
        "submit",
        (e) => {
            const form = e.target;
            if (!(form instanceof HTMLFormElement)) return;
            const method = (form.getAttribute("method") || "get").toUpperCase();
            if (!WRITE_METHODS.has(method)) return;
            if (isAllowed(form.action)) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            flashBanner();
        },
        true,
    );

    document.documentElement.classList.add("is-past-year");
})();
