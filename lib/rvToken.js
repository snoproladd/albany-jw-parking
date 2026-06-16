/**
 * @file lib/rvToken.js
 * @description HMAC token generation and verification for public
 * rendezvous detail page links. Tokens are deterministic — the same
 * assignment ID always produces the same token for a given secret,
 * so links remain valid across server restarts.
 */

import crypto from "crypto";

/** @type {string|null} Cached secret set at startup. */
let _secret = null;

/**
 * Initialize the token module with a persistent secret.
 * Call once at startup from index.js.
 *
 * @param {string} secret
 */
export function initRvTokenSecret(secret) {
  _secret = secret;
}

/**
 * Generate an HMAC token for a schedule_assignment_id.
 *
 * @param {number} assignmentId
 * @returns {string}  Hex-encoded HMAC.
 */
export function generateRvToken(assignmentId) {
  if (!_secret) throw new Error("RV token secret not initialized.");
  return crypto
    .createHmac("sha256", _secret)
    .update(`rv-${assignmentId}`)
    .digest("hex")
    .slice(0, 24);
}

/**
 * Verify an HMAC token for a schedule_assignment_id.
 *
 * @param {number} assignmentId
 * @param {string} token
 * @returns {boolean}
 */
export function verifyRvToken(assignmentId, token) {
  if (!_secret || !token) return false;
  const expected = generateRvToken(assignmentId);
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(token, "hex"),
  );
}
