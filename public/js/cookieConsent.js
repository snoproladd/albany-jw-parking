/**
 * @file cookieConsent.js
 * @description Cookie consent banner logic.
 *
 * Injects the banner directly into <body> at runtime so it is never
 * trapped by a stacking context created by backdrop-filter, transform,
 * or filter on any ancestor element. This guarantees true viewport-fixed
 * positioning regardless of page structure.
 *
 * localStorage key: cookieConsent
 * Values:          'accepted' | 'essential'
 *
 * Banner is suppressed on subsequent visits once a value is stored.
 */

/**
 * Key used to persist consent choice in localStorage.
 * @type {string}
 */
const CONSENT_KEY = "cookieConsent";

/**
 * Retrieve the stored consent value, if any.
 * @returns {string | null}
 */
function getStoredConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
}

/**
 * Persist a consent choice to localStorage.
 * @param {'accepted' | 'essential'} value
 * @returns {void}
 */
function storeConsent(value) {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // localStorage may be unavailable in private browsing — fail silently
  }
}

/**
 * Build and inject the banner HTML as a direct child of <body>.
 * Injecting here rather than rendering in a partial guarantees the element
 * sits at the top of the DOM tree, outside any stacking context created by
 * backdrop-filter or transform on page-level elements like the footer.
 * @returns {HTMLElement} The injected banner element.
 */
function injectBanner() {
  const banner = document.createElement("div");
  banner.id = "cookieConsentBanner";
  banner.className = "cookie-consent";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-live", "polite");
  banner.setAttribute("aria-label", "Cookie preferences");

  banner.innerHTML = `
        <div class="cookie-consent-inner">
            <div class="cookie-consent-text">
                <strong>Cookie Notice</strong>
                <p>
                    We use strictly necessary cookies for session management and security.
                    No tracking or advertising cookies are used.
                    <a href="/privacy">Privacy Policy</a>
                </p>
            </div>
            <div class="cookie-consent-actions">
                <button type="button" id="cookieBtnManage" class="btn btn-sm btn-outline-secondary">Manage Preferences</button>
                <button type="button" id="cookieBtnDecline" class="btn btn-sm btn-outline-primary">Essential Only</button>
                <button type="button" id="cookieBtnAccept" class="btn btn-sm btn-primary">Accept All</button>
            </div>
        </div>
        <div id="cookieManagePanel" class="cookie-manage-panel d-none">
            <div class="cookie-category">
                <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                    <div>
                        <strong>Strictly Necessary</strong>
                        <p class="text-muted small mb-0">
                            Session and CSRF security cookies. Required for the site to function — cannot be disabled.
                        </p>
                    </div>
                    <span class="badge bg-success">Always On</span>
                </div>
            </div>
            <div class="cookie-manage-actions">
                <button type="button" id="cookieBtnSavePrefs" class="btn btn-sm btn-primary">Save Preferences</button>
            </div>
        </div>
    `;

  document.body.appendChild(banner);
  return banner;
}

/**
 * Show the consent banner with a slide-up transition.
 * A short delay allows the browser to paint the initial off-screen state
 * before the transition class is applied.
 * @param {HTMLElement} banner
 * @returns {void}
 */
function showBanner(banner) {
  setTimeout(() => {
    banner.classList.add("cookie-consent--visible");
  }, 50);
}

/**
 * Hide the consent banner with a slide-down transition.
 * Uses setTimeout matching the CSS transition duration rather than
 * transitionend, which fires once per property and can cause race
 * conditions when multiple properties are transitioning.
 * @param {HTMLElement} banner
 * @returns {void}
 */
function dismissBanner(banner) {
  banner.classList.remove("cookie-consent--visible");
  banner.classList.add("cookie-consent--dismissing");
  setTimeout(() => {
    banner.classList.remove("cookie-consent--dismissing");
  }, 320);
}

/**
 * Toggle visibility of the manage-preferences panel.
 * Hides the Accept All and Essential Only buttons while the panel
 * is open so Save Preferences is the clear CTA.
 * @param {HTMLElement} panel
 * @param {HTMLElement} btnAccept
 * @param {HTMLElement} btnDecline
 * @returns {void}
 */
function toggleManagePanel(panel, btnAccept, btnDecline) {
  const isOpening = panel.classList.contains("d-none");
  panel.classList.toggle("d-none");
  btnAccept.classList.toggle("d-none", isOpening);
  btnDecline.classList.toggle("d-none", isOpening);
}

/**
 * Initialise the cookie consent banner.
 * Injects the banner into <body>, attaches event listeners, and shows
 * it if no consent has been stored yet.
 * @returns {void}
 */
function initCookieConsent() {
  if (getStoredConsent()) return;

  const banner = injectBanner();
  const btnAccept = document.getElementById("cookieBtnAccept");
  const btnDecline = document.getElementById("cookieBtnDecline");
  const btnManage = document.getElementById("cookieBtnManage");
  const btnSave = document.getElementById("cookieBtnSavePrefs");
  const panel = document.getElementById("cookieManagePanel");

  if (!btnAccept || !btnDecline || !btnManage || !btnSave || !panel) return;

  showBanner(banner);

  btnAccept.addEventListener("click", () => {
    storeConsent("accepted");
    dismissBanner(banner);
  });

  btnDecline.addEventListener("click", () => {
    storeConsent("essential");
    dismissBanner(banner);
  });

  btnManage.addEventListener("click", () => {
    toggleManagePanel(panel, btnAccept, btnDecline);
  });

  btnSave.addEventListener("click", () => {
    storeConsent("essential");
    dismissBanner(banner);
  });
}

document.addEventListener("DOMContentLoaded", initCookieConsent);
