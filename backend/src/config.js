// Backend configuration, all of it from the environment so the same build runs
// locally and on Cloud Run. See .env.example for what each variable means.
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: num(process.env.PORT, 8080),

  // Where the local SQLite file lives. Every enquiry lands here first.
  //
  // The default sits in `.data/` at the repo root rather than inside backend/,
  // because `npm run dev` watches backend/ for changes and SQLite's WAL
  // sidecar files are rewritten on every insert: a database under the watched
  // tree makes the server restart itself in a loop on its own writes.
  dbFile: process.env.DB_FILE || path.join(root, '..', '.data', 'enquiries.db'),

  // Browser origins allowed to POST an enquiry. Comma separated.
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  firestore: {
    // Empty project id means "no GCP configured": enquiries stay in SQLite
    // and the sync worker idles instead of erroring on every tick.
    projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '',
    collection: process.env.FIRESTORE_COLLECTION || 'enquiries',
  },

  sync: {
    // Push pending rows to Firestore on this interval. 0 disables the worker,
    // which leaves `npm run sync` as the manual way to drain the queue.
    intervalMs: num(process.env.SYNC_INTERVAL_MS, 60_000),
    batchSize: num(process.env.SYNC_BATCH_SIZE, 25),
    maxAttempts: num(process.env.SYNC_MAX_ATTEMPTS, 5),
  },

  // Shared secret for reading stored enquiries. Enquiries hold phone numbers
  // and emails, so the read route stays closed unless this is set: no token,
  // no reading, except from localhost during development.
  adminToken: process.env.ADMIN_TOKEN || '',

  // Per-IP submit limit, to keep the form from being used as a spam relay.
  rateLimit: {
    windowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    max: num(process.env.RATE_LIMIT_MAX, 5),
  },
};

export const firestoreEnabled = Boolean(config.firestore.projectId);
