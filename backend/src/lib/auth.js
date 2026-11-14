// Admin sign-in (/admin on the website). The browser signs in with Firebase
// Authentication, with a Google account only, and sends its ID token with each
// request; here the token is checked and the email looked up in the access list.
//
// Roles, each including everything below it:
//   viewer  — reports: overview, visitors, heatmaps
//   editor  — and enquiries and the blog
//   admin   — and Settings: who has access
//   owner   — an admin from OWNER_EMAILS, who cannot be removed
//
// Warehouse workers (warehouse-staff, warehouse-manager) sit outside this
// ladder: they rank below every role here, so requireRole refuses them on every
// admin route, and only requireWarehouse lets them in.
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { config } from '../config.js';
import { collection } from './firestore.js';

export const ROLES = ['viewer', 'editor', 'admin', 'owner'];
const rank = (role) => ROLES.indexOf(role);

export const WAREHOUSE_ROLES = ['warehouse-staff', 'warehouse-manager'];
const WAREHOUSE_LEVEL = { 'warehouse-staff': 'staff', 'warehouse-manager': 'manager', admin: 'admin', owner: 'admin' };
const LEVELS = ['staff', 'manager', 'admin'];

export function auth() {
  if (!getApps().length) initializeApp({ projectId: config.firestore.projectId || 'cholan-rice-site' });
  return getAuth();
}

const access = () => collection('dashboardAccess');

// The person's role, or null if their email is not on the list.
export async function roleFor(email) {
  if (!email) return null;
  const key = email.toLowerCase();
  if (config.ownerEmails.includes(key)) return 'owner';
  const doc = await access().doc(key).get();
  return doc.exists ? doc.data().role : null;
}

// Express middleware: signed in, on the list, and at least `minRole`.
// Sets req.user = { email, role }.
export function requireRole(minRole = 'viewer') {
  return async (req, res, next) => {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Please sign in.' });

    let decoded;
    try {
      decoded = await auth().verifyIdToken(token);
    } catch {
      return res.status(401).json({ error: 'Your sign-in has expired. Please sign in again.' });
    }
    if (!decoded.email || !decoded.email_verified) {
      return res.status(401).json({ error: 'Please sign in with Google.' });
    }

    try {
      const role = await roleFor(decoded.email);
      // No entry, or one left from a role that no longer exists (the old shared
      // "poster" login), opens nothing.
      if (!role || (!ROLES.includes(role) && !WAREHOUSE_ROLES.includes(role))) {
        return res.status(403).json({
          error: `${decoded.email} does not have access to the admin. Ask an admin to add it in Settings.`,
          code: 'no-access',
        });
      }
      if (WAREHOUSE_ROLES.includes(role)) {
        return res.status(403).json({ error: 'This login is for the warehouse page only.', code: 'no-access' });
      }
      // The admin is opened with Google only; a session from an old emailed
      // link, or any other way in, has to sign in again with Google.
      if (decoded.firebase?.sign_in_provider !== 'google.com') {
        return res.status(403).json({ error: 'The admin now uses Google sign-in only. Sign out, then choose “Continue with Google”.' });
      }
      if (rank(role) < rank(minRole)) {
        return res.status(403).json({ error: `This needs ${minRole} access; you have ${role} access.` });
      }
      req.user = { email: decoded.email.toLowerCase(), role };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

// Express middleware for /api/warehouse: `minLevel` is staff, manager or admin.
// A dashboard admin or owner counts as admin here; other dashboard roles have
// no warehouse access. Workers must use their password: the access list is read
// on every request, so removing a worker shuts them out at once.
// Sets req.user = { email, role, level, name }.
export function requireWarehouse(minLevel = 'staff') {
  return async (req, res, next) => {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Please sign in.' });

    let decoded;
    try {
      decoded = await auth().verifyIdToken(token);
    } catch {
      return res.status(401).json({ error: 'Your sign-in has expired. Please sign in again.' });
    }
    if (!decoded.email || !decoded.email_verified) {
      return res.status(401).json({ error: 'Please sign in again.' });
    }

    try {
      const email = decoded.email.toLowerCase();
      const entry = config.ownerEmails.includes(email) ? { role: 'owner' } : (await access().doc(email).get()).data();
      const level = WAREHOUSE_LEVEL[entry?.role];
      if (!level) {
        return res.status(403).json({ error: `${email} does not have access to the warehouse page. Ask an admin to add you.`, code: 'no-access' });
      }
      if (WAREHOUSE_ROLES.includes(entry.role) && decoded.firebase?.sign_in_provider !== 'password') {
        return res.status(403).json({ error: 'Please sign in with your username and password.', code: 'no-access' });
      }
      if (LEVELS.indexOf(level) < LEVELS.indexOf(minLevel)) {
        return res.status(403).json({ error: `This needs ${minLevel} access.` });
      }
      req.user = { email, role: entry.role, level, name: entry.name || decoded.name || email };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export { access as accessCollection };
