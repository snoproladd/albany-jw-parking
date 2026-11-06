/**
 * @file mobileDropdownSafety.js
 * @description On small screens, nudges the page so an opening dropdown or a
 * focused native select is not hidden behind the bottom of the viewport.
 * The viewport width is checked when the event fires, not when the script
 * loads, so the script adds no layout work to page load and still works
 * after a rotation.
 */
(function () {
    /** Widest viewport (px) that counts as mobile. */
    const MOBILE_MAX_WIDTH = 768;

    /** Fraction of the viewport height that stays usable; the bottom 15% is kept clear. */
    const SAFE_ZONE = 0.85;

    /**
     * Scrolls the page down just far enough that the element's bottom edge
     * sits inside the safe zone. Does nothing on wider screens.
     *
     * @param {Element} el - The dropdown or select to keep in view.
     * @returns {void}
     */
    function ensureSafeViewport(el) {
        if (window.innerWidth > MOBILE_MAX_WIDTH) return;

        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight;

        if (rect.bottom > vh * SAFE_ZONE) {
            const scrollBy = rect.bottom - vh * SAFE_ZONE;
            window.scrollBy({
                top: scrollBy,
                behavior: "smooth",
            });
        }
    }

    // Bootstrap dropdowns
    document.addEventListener("show.bs.dropdown", (e) => {
        ensureSafeViewport(e.target);
    });

    // Native selects (best effort)
    document.addEventListener("focusin", (e) => {
        if (e.target.tagName === "SELECT") {
            ensureSafeViewport(e.target);
        }
    });
})();
