// A small in-memory per-IP limiter for the submit route. Good enough for one
// instance; a multi-instance deploy would want a shared store.
import { config } from '../config.js';

const hits = new Map();

function sweep(now) {
  for (const [key, entry] of hits) {
    if (entry.resetAt <= now) hits.delete(key);
  }
}

export function rateLimit(req, res, next) {
  const now = Date.now();
  if (hits.size > 5000) sweep(now);

  const key = req.ip || 'unknown';
  const entry = hits.get(key);

  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + config.rateLimit.windowMs });
    return next();
  }

  entry.count += 1;
  if (entry.count > config.rateLimit.max) {
    res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    return res.status(429).json({
      error: 'Too many enquiries from this address. Please try again in a minute.',
    });
  }
  return next();
}
