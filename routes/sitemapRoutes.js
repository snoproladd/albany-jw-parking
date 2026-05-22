/**
 * @file routes/sitemapRoutes.js
 * @description Route for the public, role-filtered site map page.
 *
 * Loads sitemap.json once at module startup. On each request, filters
 * groups and pages server-side to only include entries the current user
 * can actually access — no inaccessible paths are ever sent to the client.
 */

import express from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { ROLE_HIERARCHY } from "../src/config/roles.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * @typedef {Object} SitemapPage
 * @property {string}      title
 * @property {string}      path
 * @property {string}      description
 * @property {string}      icon
 * @property {string|null} minRole     - Minimum role required, or null for public.
 * @property {string|null} permission  - Required permission key, or null for role-only check.
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
   * Renders a role-filtered index of all app pages.
   * Guests see public pages only; logged-in users see pages for their role.
   */
  router.get("/sitemap", (req, res) => {
    const role = req.session?.userRole || "NON_REGISTERED";
    const permissions = req.session?.permissions || {};
    const roleLevel = ROLE_HIERARCHY.indexOf(role);

    /**
     * Return true if the current user should see this page entry.
     *
     * @param {SitemapPage} page
     * @returns {boolean}
     */
    function isVisible(page) {
      if (page.minRole !== null) {
        const minLevel = ROLE_HIERARCHY.indexOf(page.minRole);
        if (minLevel === -1 || roleLevel < minLevel) return false;
      }
      if (page.permission !== null) {
        if (!permissions[role]?.[page.permission]) return false;
      }
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
      userRole: role,
      userPermissions: res.locals.userPermissions,
      appVersion: res.locals.appVersion,
    });
  });

  return router;
}
