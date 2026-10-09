import cors from 'cors';
import express from 'express';
import { config, firestoreEnabled } from './config.js';
import enquiries from './routes/enquiries.js';
import { startSyncWorker } from './lib/sync.js';
import { syncCounts } from './store/db.js';

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
app.use(express.json({ limit: '32kb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true, firestore: firestoreEnabled, sync: syncCounts() });
});

app.use('/api/enquiries', enquiries);

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// Final handler: a rejected CORS origin and a malformed JSON body both land
// here, and both are the caller's fault rather than a server fault.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const badRequest = error?.type === 'entity.parse.failed' || /is not allowed/.test(error?.message || '');
  if (badRequest) return res.status(400).json({ error: error.message });
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
});

const stopSync = startSyncWorker();

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[server] ${signal} received, shutting down.`);
    stopSync();
    server.close(() => process.exit(0));
  });
}
