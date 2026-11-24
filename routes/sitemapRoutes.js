/**
 * @file routes/sitemapRoutes.js
 * @description Route for the public, permission-filtered site map page.
 *
 * Loads sitemap.json once at module startup. On each request, filters
 * groups and pages server-side to only include entries the current user
 * can actually access — no inaccessible paths are ever sent to the client.
 */

import express from "express";
import { publicRoute } from "../middleware/publicRoute.js";
import { isKnownPermission } from "../src/config/permissions.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * @typedef {Object} SitemapPage
 * @property {string}      title
 * @property {string}      path
 * @property {string}      description
 * @property {string}      icon
 * @property {string|string[]|null} permission - Catalogue key(s) that open the page
 *                                     (any one is enough), or null.
 * @property {boolean} [signedIn]      - With no permission: shown to anyone signed in.
 * @property {boolean} [tools]         - The Tools hub: shown when res.locals.hasTools.
 */

/**
 * @typedef {Object} SitemapGroup
 * @property {string}         id
 * @property {string}         label
 * @property {string}         icon
 * @property {SitemapPage[]}  pages
 */

/**
 * Sitemap data loaded once at module load time.
 * @type {{ groups: SitemapGroup[] }}
 */
const SITEMAP = JSON.parse(
  readFileSync(join(__dirname, "../src/config/sitemap.json"), "utf-8"),
);

// Every permission named in sitemap.json must be a catalogue key, so a typo
// stops the app at startup instead of quietly hiding a page.
for (const group of SITEMAP.groups) {
  for (const page of group.pages) {
    const keys = Array.isArray(page.permission) ? page.permission : (page.permission ? [page.permission] : []);
    for (const key of keys) {
      if (!isKnownPermission(key)) {
        throw new Error(`sitemap.json: unknown permission "${key}" on ${page.path}`);
      }
    }
  }
}

/**
 * Factory: build the sitemap router.
 * No injected dependencies required — reads only session and res.locals.
 *
 * @returns {import("express").Router}
 */
export function sitemapRouter() {
  const router = express.Router();

  /**
   * GET /sitemap
   * Public page — no authentication required.
   * Renders a permission-filtered index of all app pages.
   * Guests see public pages only; signed-in people see the pages their
   * permissions open.
   */
  router.get("/sitemap", publicRoute("site map (filters its links itself)"), (req, res) => {
    const isLoggedIn = Boolean(req.session?.userId);
    const can = typeof res.locals.can === "function" ? res.locals.can : () => false;

    /**
     * Return true if the current user should see this page entry: they
     * hold one of its catalogue keys (phase 3d-8; was minRole and the old
     * role matrix), or it only needs a sign-in, or it is public.
     *
     * @param {SitemapPage} page
     * @returns {boolean}
     */
    function isVisible(page) {
      if (page.permission) {
        const keys = Array.isArray(page.permission) ? page.permission : [page.permission];
        return keys.some((k) => can(k));
      }
      if (page.tools) return Boolean(res.locals.hasTools);
      if (page.signedIn) return isLoggedIn;
      return true;
    }

    const filteredGroups = SITEMAP.groups
      .map((group) => ({
        ...group,
        pages: group.pages.filter(isVisible),
      }))
      .filter((group) => group.pages.length > 0);

    return res.render("sitemap", {
      groups: filteredGroups,
      nav: res.locals.nav,
      appVersion: res.locals.appVersion,
    });
  });

  return router;
}
