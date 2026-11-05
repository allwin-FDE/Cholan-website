import cors from 'cors';
import express from 'express';
import { config, firestoreEnabled, salesDaddyEnabled } from './config.js';
import enquiries from './routes/enquiries.js';
import chat from './routes/chat.js';
import track from './routes/track.js';
import admin from './routes/admin.js';
import posts from './routes/posts.js';
import subscribe from './routes/subscribe.js';
import comments from './routes/comments.js';
import warehouse from './routes/warehouse.js';
import { knowledgeSize } from './chat/retrieve.js';
import { startSyncWorker } from './lib/sync.js';
import { crmCounts, syncCounts } from './store/db.js';

const app = express();

// Cloud Run terminates TLS and forwards the caller's address in
// X-Forwarded-For; without this, every request looks like it comes from the
// proxy and the rate limiter would treat all visitors as one.
app.set('trust proxy', true);
app.disable('x-powered-by');

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header: curl, health checks, server-to-server. Not a browser,
      // so there is no cross-origin rule to enforce.
      if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed.`));
    },
  }),
);
// Small bodies everywhere, except blog posts and the warehouse, which parse
// their own (larger) body in their routes.
const smallJson = express.json({ limit: '32kb' });
app.use((req, res, next) =>
  req.path.startsWith('/api/admin/posts') || req.path.startsWith('/api/warehouse') ? next() : smallJson(req, res, next),
);

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    firestore: firestoreEnabled,
    salesDaddy: salesDaddyEnabled,
    chat: config.chat.enabled,
    sync: syncCounts(),
    crm: crmCounts(),
  });
});

app.use('/api/enquiries', enquiries);
app.use('/api/chat', chat);
app.use('/api/track', track);
app.use('/api/subscribe', subscribe);
app.use('/api/admin', admin);
app.use('/api/warehouse', warehouse);
app.use('/api', comments);
app.use('/api', posts);

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// Final handler: a rejected CORS origin and a malformed JSON body both land
// here, and both are the caller's fault rather than a server fault.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const badRequest = error?.type === 'entity.parse.failed' || /is not allowed/.test(error?.message || '');
  if (badRequest) return res.status(400).json({ error: error.message });
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'That is too large to upload.' });
  if (error?.status && error.status < 600) return res.status(error.status).json({ error: error.message });
  console.error('[server] unhandled error:', error);
  return res.status(500).json({ error: 'Something went wrong.' });
});

const server = app.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port}`);
  console.log(`[server] sqlite: ${config.dbFile}`);
  console.log(
    firestoreEnabled
      ? `[server] firestore: ${config.firestore.projectId}/${config.firestore.collection}`
      : '[server] firestore: not configured',
  );
  console.log(
    config.chat.enabled
      ? `[server] chat: LangChain + Groq ${config.chat.model} (topic check: ${config.chat.guardModel}), ${knowledgeSize} knowledge chunks`
      : '[server] chat: off (set GROQ_API_KEY to turn it on)',
  );
});

const stopSync = startSyncWorker();

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[server] ${signal} received, shutting down.`);
    stopSync();
    server.close(() => process.exit(0));
  });
}
