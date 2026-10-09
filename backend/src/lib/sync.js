// Drains the SQLite outbox into Firestore.
//
// The API never waits on this: a submit is answered as soon as the row is in
// SQLite, and the push happens here. That is what keeps the form working when
// GCP is unreachable or not configured at all.
import { config } from '../config.js';
import { markSyncAttempt, markSynced, pendingEnquiries } from '../store/db.js';
import { firestoreEnabled, pushEnquiry } from './firestore.js';

let running = false;

export async function syncPending() {
  if (!firestoreEnabled) return { skipped: 'firestore-not-configured' };

  // One drain at a time, or a slow push would overlap the next tick and send
  // the same rows twice.
  if (running) return { skipped: 'already-running' };
  running = true;

  const result = { pushed: 0, failed: 0 };
  try {
    const rows = pendingEnquiries();
    for (const row of rows) {
      try {
        await pushEnquiry(row);
        markSynced(row.id);
        result.pushed += 1;
      } catch (error) {
        markSyncAttempt(row.id, error?.message || error);
        result.failed += 1;
        console.error(`[sync] enquiry ${row.id} failed:`, error?.message || error);
      }
    }
  } finally {
    running = false;
  }
  return result;
}

export function startSyncWorker() {
  if (!firestoreEnabled) {
    console.warn('[sync] GCLOUD_PROJECT is not set — enquiries stay in SQLite only.');
    return () => {};
  }
  if (config.sync.intervalMs <= 0) {
    console.warn('[sync] worker disabled (SYNC_INTERVAL_MS=0) — run `npm run sync` to push.');
    return () => {};
  }

  const tick = () => {
    syncPending().catch((error) => console.error('[sync] worker error:', error));
  };

  tick();
  const timer = setInterval(tick, config.sync.intervalMs);
  timer.unref?.();
  console.log(`[sync] worker started, every ${config.sync.intervalMs}ms`);
  return () => clearInterval(timer);
}
