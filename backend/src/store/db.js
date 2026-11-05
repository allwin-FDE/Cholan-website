// The local database: a SQLite file that is both the record of every enquiry
// and the outbox for pushing them to Firestore.
//
// An enquiry's `sync_state` walks one way: pending -> synced, or pending ->
// failed once it has used up its attempts. Nothing is ever deleted here, so
// the file stays the durable copy even after a row reaches GCP.
// Uses node:sqlite, the runtime's own SQLite binding, so there is no native
// module to compile on a dev machine or in the container build.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config, salesDaddyEnabled } from '../config.js';

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

const db = new DatabaseSync(config.dbFile);

// WAL keeps the API's writes from blocking the sync worker's reads.
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS enquiries (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    phone         TEXT NOT NULL,
    email         TEXT,
    enquiry_type  TEXT NOT NULL,
    message       TEXT NOT NULL,
    product       TEXT,
    source        TEXT,
    user_agent    TEXT,
    ip            TEXT,
    created_at    TEXT NOT NULL,
    sync_state    TEXT NOT NULL DEFAULT 'pending',
    sync_attempts INTEGER NOT NULL DEFAULT 0,
    synced_at     TEXT,
    sync_error    TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_enquiries_sync_state
    ON enquiries (sync_state, created_at);

  CREATE INDEX IF NOT EXISTS idx_enquiries_created_at
    ON enquiries (created_at DESC);
`);

// Added later: where on the site the enquiry came from, as JSON (page,
// landing page, referrer, campaign, visit id). Older files gain the column.
if (!db.prepare('PRAGMA table_info(enquiries)').all().some((column) => column.name === 'meta')) {
  db.exec('ALTER TABLE enquiries ADD COLUMN meta TEXT');
}

// Added later: the second outbox, to Sales Daddy (the CRM). crm_state walks
// pending -> sent, or pending -> failed after its attempts; 'off' marks rows
// stored while no Sales Daddy key was set, which are never sent, so turning
// the key on does not replay old or test enquiries into the CRM.
if (!db.prepare('PRAGMA table_info(enquiries)').all().some((column) => column.name === 'crm_state')) {
  db.exec(`
    ALTER TABLE enquiries ADD COLUMN crm_state TEXT NOT NULL DEFAULT 'off';
    ALTER TABLE enquiries ADD COLUMN crm_attempts INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE enquiries ADD COLUMN crm_lead_id TEXT;
    ALTER TABLE enquiries ADD COLUMN crm_error TEXT;
  `);
}

const statements = {
  insert: db.prepare(`
    INSERT INTO enquiries
      (id, name, phone, email, enquiry_type, message, product, source, meta, user_agent, ip, created_at, crm_state)
    VALUES
      (@id, @name, @phone, @email, @enquiryType, @message, @product, @source, @meta, @userAgent, @ip, @createdAt, @crmState)
  `),
  pending: db.prepare(`
    SELECT * FROM enquiries
    WHERE sync_state = 'pending' AND sync_attempts < @maxAttempts
    ORDER BY created_at
    LIMIT @limit
  `),
  markSynced: db.prepare(`
    UPDATE enquiries
    SET sync_state = 'synced', synced_at = @syncedAt, sync_error = NULL
    WHERE id = @id
  `),
  markAttempt: db.prepare(`
    UPDATE enquiries
    SET sync_attempts = sync_attempts + 1,
        sync_error = @error,
        sync_state = CASE
          WHEN sync_attempts + 1 >= @maxAttempts THEN 'failed'
          ELSE 'pending'
        END
    WHERE id = @id
  `),
  crmPending: db.prepare(`
    SELECT * FROM enquiries
    WHERE crm_state = 'pending' AND crm_attempts < @maxAttempts
    ORDER BY created_at
    LIMIT @limit
  `),
  crmSent: db.prepare(`
    UPDATE enquiries SET crm_state = 'sent', crm_lead_id = @leadId, crm_error = NULL WHERE id = @id
  `),
  crmAttempt: db.prepare(`
    UPDATE enquiries
    SET crm_attempts = crm_attempts + 1,
        crm_error = @error,
        crm_state = CASE
          WHEN crm_attempts + 1 >= @maxAttempts THEN 'failed'
          ELSE 'pending'
        END
    WHERE id = @id
  `),
  crmCounts: db.prepare(`
    SELECT crm_state, COUNT(*) AS count FROM enquiries GROUP BY crm_state
  `),
  recent: db.prepare(`
    SELECT * FROM enquiries ORDER BY created_at DESC LIMIT @limit
  `),
  counts: db.prepare(`
    SELECT sync_state, COUNT(*) AS count FROM enquiries GROUP BY sync_state
  `),
};

export function insertEnquiry(enquiry) {
  statements.insert.run({ ...enquiry, crmState: salesDaddyEnabled ? 'pending' : 'off' });
  return enquiry;
}

export function pendingEnquiries(limit = config.sync.batchSize) {
  return statements.pending.all({ limit, maxAttempts: config.sync.maxAttempts });
}

export function markSynced(id) {
  statements.markSynced.run({ id, syncedAt: new Date().toISOString() });
}

// Records a failed push. The row flips to 'failed' once it has burned through
// `maxAttempts`, so a permanently bad row stops being retried forever.
export function markSyncAttempt(id, error) {
  statements.markAttempt.run({
    id,
    error: String(error).slice(0, 500),
    maxAttempts: config.sync.maxAttempts,
  });
}

export function pendingLeads(limit = config.sync.batchSize) {
  return statements.crmPending.all({ limit, maxAttempts: config.sync.maxAttempts });
}

export function markLeadSent(id, leadId) {
  statements.crmSent.run({ id, leadId: leadId ?? null });
}

export function markLeadAttempt(id, error) {
  statements.crmAttempt.run({
    id,
    error: String(error).slice(0, 500),
    maxAttempts: config.sync.maxAttempts,
  });
}

export function recentEnquiries(limit = 50) {
  return statements.recent.all({ limit });
}

export function syncCounts() {
  const counts = { pending: 0, synced: 0, failed: 0 };
  for (const row of statements.counts.all()) counts[row.sync_state] = row.count;
  return counts;
}

export function crmCounts() {
  const counts = { pending: 0, sent: 0, failed: 0, off: 0 };
  for (const row of statements.crmCounts.all()) counts[row.crm_state] = row.count;
  return counts;
}

export default db;
