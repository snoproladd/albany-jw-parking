/**
 * @file scrollToTop.js
 * @description Initialises the scroll-to-top button. Shows the button once
 * the page has scrolled past a threshold, and smoothly scrolls back to the
 * top on click.
 */

/** Scroll distance (px) before the button becomes visible. */
const SCROLL_THRESHOLD = 300;

/**
 * Initialise the scroll-to-top button behaviour.
 * Attaches a scroll listener to show/hide the button and a click listener
 * to scroll the window back to the top.
 *
 * @returns {void}
 */
function initScrollToTop() {
  const btn = document.getElementById("scrollToTopBtn");
  if (!btn) return;

  window.addEventListener(
    "scroll",
    () => {
      btn.classList.toggle(
        "scroll-top-visible",
        window.scrollY > SCROLL_THRESHOLD,
      );
    },
    { passive: true },
  );

  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

document.addEventListener("DOMContentLoaded", initScrollToTop);
