/**
 * @file lib/magicLinkToken.js
 * @description Random token generation and SHA-256 hashing for
 * passwordless "magic link" logins. Unlike rvToken.js (deterministic
 * HMAC), these tokens are random and opaque -- the raw value is
 * generated once, shown to the admin, and never stored. Only its
 * hash is persisted in dbo.magic_login_tokens, so a database leak
 * does not expose a usable credential.
 */

import crypto from 'crypto';

/**
 * Generate a new random magic-link token.
 * 32 random bytes, base64url-encoded (URL-safe, no padding).
 *
 * @returns {string} Raw token -- show once, never log or store as-is.
 */
export function generateMagicLinkToken() {
    return crypto.randomBytes(32).toString('base64url');
}

/**
 * Hash a raw token for storage/lookup. SHA-256, hex-encoded.
 *
 * @param {string} token
 * @returns {string} 64-character hex digest.
 */
export function hashMagicLinkToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}
