// POST /api/enquiries  — store an enquiry (public)
// GET  /api/enquiries  — recent enquiries (admin only)
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { validateEnquiry } from '../lib/validate.js';
import { rateLimit } from '../lib/rateLimit.js';
import { requireAdmin } from '../lib/requireAdmin.js';
import { syncPending } from '../lib/sync.js';
import { insertEnquiry, recentEnquiries, syncCounts } from '../store/db.js';

const router = Router();

router.post('/', rateLimit, (req, res) => {
  const { value, errors } = validateEnquiry(req.body);
  if (errors) return res.status(400).json({ error: 'Please check the form.', fields: errors });

  const enquiry = {
    id: randomUUID(),
    ...value,
    userAgent: (req.get('user-agent') || '').slice(0, 300),
    ip: req.ip || null,
    createdAt: new Date().toISOString(),
  };

  try {
    insertEnquiry(enquiry);
  } catch (error) {
    console.error('[enquiries] could not store enquiry:', error);
    return res.status(500).json({ error: 'Could not save your enquiry. Please try again.' });
  }

  // The enquiry is safe in SQLite now, so answer immediately and let the push
  // to Firestore run on its own. A failed push is the worker's problem, not
  // the visitor's.
  res.status(201).json({ id: enquiry.id, receivedAt: enquiry.createdAt });

  syncPending().catch((error) => console.error('[enquiries] sync failed:', error));
});

router.get('/', requireAdmin, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json({ counts: syncCounts(), enquiries: recentEnquiries(limit) });
});

export default router;
