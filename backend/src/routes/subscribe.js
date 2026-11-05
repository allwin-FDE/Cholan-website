// POST /api/subscribe — the footer's "Subscribe to Updates" box (public).
// One document per email address in `subscribers`, so signing up twice keeps
// one entry; the dashboard lists them (routes/admin.js).
import { Router } from 'express';
import { FieldValue } from '@google-cloud/firestore';
import { createRateLimit } from '../lib/rateLimit.js';
import { collection } from '../lib/firestore.js';

const router = Router();

const limit = createRateLimit({
  windowMs: 60_000,
  max: 5,
  message: 'Too many tries. Please wait a minute and try again.',
});

// No slashes: the address is the document id.
const EMAIL = /^[^\s@/]+@[^\s@/]+\.[^\s@/]{2,}$/;
const pick = (value, max = 200) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);

router.post('/', limit, async (req, res, next) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 160) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const meta = req.body?.meta && typeof req.body.meta === 'object' ? req.body.meta : {};
  const now = new Date().toISOString();
  const ref = collection('subscribers').doc(email);
  try {
    try {
      await ref.create({
        email,
        createdAt: now,
        lastAt: now,
        signups: 1,
        // Where they signed up, and how they found the site.
        page: pick(meta.page),
        referrer: pick(meta.referrer, 300),
        utmSource: pick(meta.utmSource, 100),
        utmCampaign: pick(meta.utmCampaign, 100),
      });
      return res.status(201).json({ ok: true });
    } catch (error) {
      // 6 = ALREADY_EXISTS: they were already on the list.
      if (error?.code !== 6) throw error;
      await ref.update({ lastAt: now, signups: FieldValue.increment(1) });
      return res.json({ ok: true, already: true });
    }
  } catch (error) {
    return next(error);
  }
});

export default router;
