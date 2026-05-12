// lib/passwordVer.js
import crypto from "crypto";

const PBKDF2_DIGEST = "sha256";
const PBKDF2_ITERATIONS = 100_000; // adjust as you wish
const HASH_LENGTH = 32; // 32 bytes (256 bits)
const SALT_LENGTH = 16; // 16 bytes

/**
 * Hash a password using PBKDF2-SHA256.
 * Returns raw buffers that map directly to VARBINARY columns.
 *
 * @param {string} password
 * @returns {{hash: Buffer, salt: Buffer, iterations: number, algo: string}}
 */
export function hashPassword(password) {
  if (typeof password !== "string" || !password) {
    throw new Error("Password is required for hashing.");
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const hash = crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    HASH_LENGTH,
    PBKDF2_DIGEST,
  );

  return {
    hash, // Buffer → VARBINARY(32)
    salt, // Buffer → VARBINARY(16)
    iterations: PBKDF2_ITERATIONS,
    algo: "PBKDF2-SHA256",
  };
}

/**
 * Verify a password against stored hash metadata.
 *
 * @param {string} password
 * @param {{hash: Buffer, salt: Buffer, iterations: number, algo: string}} stored
 * @returns {boolean}
 */
export function verifyPassword(password, stored) {
  try {
    if (
      !stored ||
      !stored.hash ||
      !stored.salt ||
      !stored.iterations ||
      !stored.algo
    ) {
      return false;
    }

    // mssql returns VARBINARY as Buffer already
    const saltBuf = Buffer.isBuffer(stored.salt)
      ? stored.salt
      : Buffer.from(stored.salt);
    const hashBuf = Buffer.isBuffer(stored.hash)
      ? stored.hash
      : Buffer.from(stored.hash);

    const digest =
      stored.algo === "PBKDF2-SHA256" ? PBKDF2_DIGEST : PBKDF2_DIGEST; // only SHA256 for now

    const candidate = crypto.pbkdf2Sync(
      password,
      saltBuf,
      stored.iterations,
      hashBuf.length,
      digest,
    );

    // Constant-time comparison
    return (
      candidate.length === hashBuf.length &&
      crypto.timingSafeEqual(candidate, hashBuf)
    );
  } catch {
    return false;
  }
}
