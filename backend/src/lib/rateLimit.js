// A small in-memory per-IP limiter. Good enough for one instance; a
// multi-instance deploy would want a shared store.
import { config } from '../config.js';

// Each limiter keeps its own counts, so the enquiry form and the chat do not
// eat into each other's allowance.
export function createRateLimit({ windowMs, max, message }) {
  const hits = new Map();

  function sweep(now) {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }

  return function rateLimit(req, res, next) {
    const now = Date.now();
    if (hits.size > 5000) sweep(now);

    const key = req.ip || 'unknown';
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    return next();
  };
}

// The enquiry form's limiter.
export const rateLimit = createRateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: 'Too many enquiries from this address. Please try again in a minute.',
});
