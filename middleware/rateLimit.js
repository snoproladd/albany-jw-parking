/**
 * @file middleware/rateLimit.js
 * @description Small in-memory rate limiting (fixed window per key), with no
 * extra package.
 *
 * Two ways to use it:
 *   - rateLimit({...}) is Express middleware that counts every request by
 *     client IP and answers 429 (JSON, with Retry-After) once the limit is
 *     passed. Used on GET /api/volunteers/exists.
 *   - createRateLimiter({...}) returns a counter a route drives itself, for
 *     limits that count only some requests: POST /login counts failed
 *     sign-ins and clears the count on success.
 *
 * Counts live in this process only, so with more than one app instance each
 * one counts separately; that is enough to slow scripted guessing. Client IP
 * is req.ip, which is the real address because index.js sets "trust proxy"
 * for Azure App Service. Expired windows are swept once a minute (the timer
 * does not keep the process alive).
 */

/**
 * @typedef {Object} RateLimiter
 * @property {(key: string) => { limited: boolean, retryAfterSeconds: number }} check
 *           Whether the key is over the limit now (does not count).
 * @property {(key: string) => { limited: boolean, retryAfterSeconds: number }} hit
 *           Count one for the key, then report as check() does.
 * @property {(key: string) => void} reset  Forget the key's count.
 */

/**
 * Create a fixed-window counter: at most `max` hits per key in each
 * `windowMs`, the window starting at the key's first hit.
 *
 * @param {{ windowMs: number, max: number }} options
 * @returns {RateLimiter}
 */
export function createRateLimiter({ windowMs, max }) {
    /** @type {Map<string, { count: number, resetAt: number }>} */
    const counts = new Map();

    const sweep = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of counts) {
            if (entry.resetAt <= now) counts.delete(key);
        }
    }, 60_000);
    sweep.unref?.();

    /**
     * The key's live entry, or undefined when it has none or it expired.
     *
     * @param {string} key
     * @param {number} now
     * @returns {{ count: number, resetAt: number } | undefined}
     */
    function live(key, now) {
        const entry = counts.get(key);
        if (entry && entry.resetAt <= now) {
            counts.delete(key);
            return undefined;
        }
        return entry;
    }

    /**
     * @param {{ count: number, resetAt: number } | undefined} entry
     * @param {number} now
     * @returns {{ limited: boolean, retryAfterSeconds: number }}
     */
    function report(entry, now) {
        const limited = Boolean(entry && entry.count > max);
        return {
            limited,
            retryAfterSeconds: limited ? Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) : 0,
        };
    }

    return {
        check(key) {
            const now = Date.now();
            const entry = live(key, now);
            // At the limit already counts as limited for check(): the next hit would pass it.
            if (entry && entry.count >= max) {
                return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
            }
            return { limited: false, retryAfterSeconds: 0 };
        },
        hit(key) {
            const now = Date.now();
            let entry = live(key, now);
            if (!entry) {
                entry = { count: 0, resetAt: now + windowMs };
                counts.set(key, entry);
            }
            entry.count += 1;
            return report(entry, now);
        },
        reset(key) {
            counts.delete(key);
        },
    };
}

/**
 * Express middleware: at most `max` requests per client IP in each
 * `windowMs`. Over the limit it answers 429 with a Retry-After header and
 * `{ error: message }`.
 *
 * @param {{ windowMs: number, max: number, name: string, message?: string }} options
 *        name: prefixes the key, so separate limits never share counts.
 * @returns {import("express").RequestHandler}
 */
export function rateLimit({ windowMs, max, name, message = "Too many requests. Please wait a few minutes and try again." }) {
    const limiter = createRateLimiter({ windowMs, max });
    return (req, res, next) => {
        const { limited, retryAfterSeconds } = limiter.hit(`${name}|${req.ip || "unknown"}`);
        if (limited) {
            res.set("Retry-After", String(retryAfterSeconds));
            return res.status(429).json({ error: message });
        }
        return next();
    };
}
