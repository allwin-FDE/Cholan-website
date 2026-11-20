// One request = one database transaction as the signed-in person, with a
// role check first. Work that must wait until the change is saved (a
// WhatsApp message about it) goes in req.afterCommit and runs before the
// answer. A refusal comes back as a plain message for the screen
// (and field hints); anything else goes to the server's error handler.
import { requireRole } from '../lib/auth.js';
import { dbEnabled, withTx } from '../db/pool.js';
import { friendly } from '../lib/business.js';

export const needDb = (req, res, next) =>
  dbEnabled() ? next() : res.status(503).json({ error: 'The business database is not connected yet.', code: 'no-database' });

export const handle = (minRole, fn) => [
  requireRole(minRole),
  async (req, res, next) => {
    try {
      const result = await withTx(req.user.email, (client) => fn(client, req));
      if (req.afterCommit) await req.afterCommit().catch((error) => console.error('[after commit]', error.message));
      res.json(result ?? { ok: true });
    } catch (error) {
      const e = friendly(error);
      if (e.status && e.status < 500) {
        return res.status(e.status).json({ error: e.message, fields: e.fields || undefined, code: e.code || undefined, credit: e.credit || undefined });
      }
      next(e);
    }
  },
];

export const idOf = (value) => (/^\d{1,12}$/.test(String(value)) ? Number(value) : null);
export const need = (value, what) => {
  if (value == null) throw Object.assign(new Error(`${what} not found.`), { status: 404 });
  return value;
};
// Admin and Owner (ranks from lib/auth.js ROLES).
export const isAdmin = (req) => ['admin', 'owner'].includes(req.user.role);
