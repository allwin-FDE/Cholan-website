// Public blog: GET /api/posts (live posts, newest first), GET /api/posts/:slug,
// and GET /api/media/* (blog images from the private bucket).
import { Router } from 'express';
import { Storage } from '@google-cloud/storage';
import { config } from '../config.js';
import { postsCollection, isLive } from '../lib/posts.js';

const router = Router();
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

// A short cache: a new post shows within a minute without a database read on
// every page view.
let listCache = { at: 0, posts: [] };

async function livePosts() {
  if (Date.now() - listCache.at < 60_000) return listCache.posts;
  const snap = await postsCollection().get();
  const posts = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((post) => isLive(post))
    .sort((a, b) => Date.parse(b.publishAt) - Date.parse(a.publishAt));
  listCache = { at: Date.now(), posts };
  return posts;
}

// What visitors may see: nothing about who wrote or reviewed the post.
const publicPost = ({ updatedBy: _u, createdBy: _c, postedBy: _p, reviewNote: _n, reviewedBy: _r, reviewedAt: _a, submittedAt: _s, ...post }) => post;

router.get(
  '/posts',
  wrap(async (req, res) => {
    const posts = (await livePosts()).map(publicPost).map(({ contentHtml: _html, ...post }) => post);
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ posts });
  }),
);

router.get(
  '/posts/:slug',
  wrap(async (req, res) => {
    const post = (await livePosts()).find((p) => p.slug === req.params.slug);
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    res.set('Cache-Control', 'public, max-age=60');
    return res.json(publicPost(post));
  }),
);

const bucket = new Storage().bucket(config.mediaBucket);

router.get(
  '/media/*',
  wrap(async (req, res) => {
    const name = req.params[0];
    if (!/^(dev_)?blog\/[\w.-]+$/.test(name)) return res.status(404).end();
    const file = bucket.file(name);
    const [exists] = await file.exists();
    if (!exists) return res.status(404).end();
    const [meta] = await file.getMetadata();
    res.set({
      'Content-Type': meta.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    file.createReadStream().on('error', () => res.destroy()).pipe(res);
  }),
);

export function clearPostCache() {
  listCache = { at: 0, posts: [] };
}

export default router;
