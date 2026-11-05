// Visitors' comments and star ratings on blog posts. Public: send one, and read
// the approved ones. Nothing shows until someone approves it in the dashboard
// (routes/admin.js), and an email address is never sent back to the site.
import { Router } from 'express';
import { collection } from '../lib/firestore.js';
import { createRateLimit } from '../lib/rateLimit.js';
import { isLive, postsCollection } from '../lib/posts.js';

const router = Router();
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
export const commentsCollection = () => collection('comments');

const limit = createRateLimit({
  windowMs: 60_000,
  max: 3,
  message: 'Please wait a minute before sending another comment.',
});
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

async function livePost(slug) {
  const snap = await postsCollection().where('slug', '==', slug).limit(1).get();
  const doc = snap.docs[0];
  return doc && isLive(doc.data()) ? doc : null;
}

router.get(
  '/posts/:slug/comments',
  wrap(async (req, res) => {
    const post = await livePost(req.params.slug);
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    const snap = await commentsCollection().where('postId', '==', post.id).where('status', '==', 'approved').get();
    const comments = snap.docs
      .map((doc) => {
        const { name, rating, text: body, createdAt } = doc.data();
        return { id: doc.id, name, rating, text: body, createdAt };
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const rated = comments.filter((c) => c.rating);
    res.set('Cache-Control', 'public, max-age=60');
    return res.json({
      comments,
      ratingCount: rated.length,
      ratingAverage: rated.length ? Math.round((rated.reduce((sum, c) => sum + c.rating, 0) / rated.length) * 10) / 10 : null,
    });
  }),
);

router.post(
  '/posts/:slug/comments',
  limit,
  wrap(async (req, res) => {
    const input = req.body && typeof req.body === 'object' ? req.body : {};
    // A box people never see. Whatever fills it in is a robot, so it is told
    // all is well and nothing is kept.
    if (input.website) return res.status(201).json({ ok: true });

    const fields = {};
    const name = text(input.name, 80);
    const email = text(input.email, 160).toLowerCase();
    const body = text(input.text, 1500);
    const rating = Number(input.rating);
    if (!name) fields.name = 'Your name is required.';
    if (!EMAIL.test(email)) fields.email = 'That email address does not look right.';
    if (body.length < 2) fields.text = 'Write your comment.';
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Please check the form.', fields });

    const post = await livePost(req.params.slug);
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    await commentsCollection().add({
      postId: post.id,
      postTitle: post.data().title,
      postSlug: post.data().slug,
      name,
      email,
      text: body,
      rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    return res.status(201).json({ ok: true });
  }),
);

export default router;
