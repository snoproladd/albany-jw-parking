// mobileDropdownSafety.js
(function () {
  if (window.innerWidth > 768) return;

  const SAFE_ZONE = 0.85; // keep bottom 15% clear

  function ensureSafeViewport(el) {
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
