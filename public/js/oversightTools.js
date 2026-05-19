/**
 * @file oversightTools.js
 * @description Oversight Tools page — mobile section jump + sidebar active state.
 */
document.addEventListener("DOMContentLoaded", () => {
  // ── Mobile section jump dropdown ─────────────────────────────────
  const mobileNav = document.getElementById("otMobileNav");
  mobileNav?.addEventListener("change", () => {
    const id = mobileNav.value;
    if (!id) return;
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    mobileNav.value = "";
  });

  // ── Sidebar active link on scroll ────────────────────────────────
  const sidebarLinks = Array.from(
    document.querySelectorAll(".ot-sidebar-link"),
  );
  if (!sidebarLinks.length) return;

  const sectionIds = sidebarLinks
    .map((a) => a.getAttribute("href")?.replace("#", ""))
    .filter(Boolean);

  const sections = sectionIds
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  /**
   * Mark the sidebar link whose section is currently most visible.
   * @returns {void}
   */
  function updateActiveLink() {
    let activeId = null;
    for (const sec of sections) {
      const rect = sec.getBoundingClientRect();
      if (rect.top <= 120) activeId = sec.id;
    }
    sidebarLinks.forEach((a) => {
      const id = a.getAttribute("href")?.replace("#", "");
      a.classList.toggle("active", id === activeId);
    });
  }

  window.addEventListener("scroll", updateActiveLink, { passive: true });
  updateActiveLink();
});
