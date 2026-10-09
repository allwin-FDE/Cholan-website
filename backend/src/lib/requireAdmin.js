// Guards the routes that read stored enquiries. Those rows hold phone numbers
// and email addresses, so the default is closed: without ADMIN_TOKEN set, only
// a request from the loopback address gets through, which keeps `curl` handy in
// development while a deployed instance exposes nothing.
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function tokenMatches(provided) {
  const expected = Buffer.from(config.adminToken);
  const actual = Buffer.from(provided);
  // timingSafeEqual throws on a length mismatch, so compare lengths first.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : req.get('x-admin-token') || '';

  if (config.adminToken) {
    if (provided && tokenMatches(provided)) return next();
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (LOOPBACK.has(req.ip)) return next();

  return res.status(401).json({
    error: 'Unauthorized. Set ADMIN_TOKEN to read enquiries from outside localhost.',
  });
}
