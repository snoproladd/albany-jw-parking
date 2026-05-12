/**
 * @file bfcacheGuard.js
 * @description Evict bfcache-restored pages for authenticated users.
 *
 * The browser's back/forward cache (bfcache) can restore a full page snapshot
 * including JS state, bypassing server-side session checks. When pageshow fires
 * with persisted=true, the page was restored from bfcache rather than fetched
 * fresh — force a reload so the server can verify the session is still valid.
 *
 * Only runs on pages marked data-authed="true" on <body>.
 */
if (document.body.dataset.authed === "true") {
  window.addEventListener("pageshow", (ev) => {
    if (ev.persisted) {
      window.location.reload();
    }
  });
}
