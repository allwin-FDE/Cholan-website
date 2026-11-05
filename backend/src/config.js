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
    // Put in front of every other collection name (visits, posts, access…).
    // Local development sets "dev_" so testing never mixes with live data.
    prefix: process.env.FIRESTORE_PREFIX || '',
  },

  // The dashboard (/dashboard on the website). People sign in with a link
  // sent to their email (Firebase Authentication); these addresses always
  // have full access and cannot be removed from inside the dashboard. Others
  // are added in the dashboard's Settings.
  ownerEmails: (process.env.OWNER_EMAILS || 'admin@chennairiceindustries.com,ashleyjosco@chennairiceindustries.com')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),

  // Private Cloud Storage bucket for blog images, served through /api/media.
  mediaBucket: process.env.MEDIA_BUCKET || 'cholan-rice-site-media',

  // Visitor activity is kept this long, then deleted (Firestore TTL on expireAt).
  trackRetentionDays: num(process.env.TRACK_RETENTION_DAYS, 400),

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

  // Sales Daddy CRM: every enquiry also becomes a lead there. The API key is
  // made in Sales Daddy (Settings → Integrations → Developer API) and belongs
  // to one workspace, so the key alone decides where leads land. No key, no
  // push: the enquiry is still stored and synced as before.
  salesDaddy: {
    apiKey: process.env.SALESDADDY_API_KEY || '',
    baseUrl: process.env.SALESDADDY_API_URL || 'https://api.salesdaddy.in/v1/ext',
    // A source key from the workspace's masters.
    source: process.env.SALESDADDY_SOURCE || 'website',
  },

  // Per-IP submit limit, to keep the form from being used as a spam relay.
  rateLimit: {
    windowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    max: num(process.env.RATE_LIMIT_MAX, 5),
  },

  // The website assistant (POST /api/chat), a LangChain pipeline on Groq. It
  // runs only when GROQ_API_KEY is set; without it the route answers 503 and
  // the rest of the backend is unaffected.
  chat: {
    groqKey: process.env.GROQ_API_KEY || '',
    enabled: Boolean(process.env.GROQ_API_KEY),
    // Writes the answers.
    model: process.env.CHAT_MODEL || 'openai/gpt-oss-120b',
    // Decides whether a question is on topic. Small and fast, and on Groq
    // each model has its own per-minute allowance.
    guardModel: process.env.CHAT_GUARD_MODEL || 'openai/gpt-oss-20b',
    // Short customer questions over a little text: low effort answers fast
    // and well. Raise it if answers start missing details.
    effort: process.env.CHAT_EFFORT || 'low',
    // A ceiling on what one public question can cost; answers are a few
    // sentences, so this is never the thing that stops a normal reply.
    maxTokens: num(process.env.CHAT_MAX_TOKENS, 4000),
    rateWindowMs: num(process.env.CHAT_RATE_WINDOW_MS, 60_000),
    rateMax: num(process.env.CHAT_RATE_MAX, 15),
  },
};

export const firestoreEnabled = Boolean(config.firestore.projectId);
export const salesDaddyEnabled = Boolean(config.salesDaddy.apiKey);
