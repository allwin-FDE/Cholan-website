// Drains the SQLite outbox into Firestore and Sales Daddy (the CRM).
//
// The API never waits on this: a submit is answered as soon as the row is in
// SQLite, and the push happens here. That is what keeps the form working when
// GCP or Sales Daddy is unreachable or not configured at all. Each target has
// its own state on the row, so one being down never holds up the other.
import { config, salesDaddyEnabled } from '../config.js';
import {
  markLeadAttempt,
  markLeadSent,
  markSyncAttempt,
  markSynced,
  pendingEnquiries,
  pendingLeads,
} from '../store/db.js';
import { firestore, firestoreEnabled, pushEnquiry } from './firestore.js';
import { pushLead } from './salesdaddy.js';

let running = null;
let queued = null;

async function drain(label, rows, push, markFailed) {
  const result = { pushed: 0, failed: 0 };
  for (const row of rows) {
    try {
      await push(row);
      result.pushed += 1;
    } catch (error) {
      markFailed(row.id, error?.message || error);
      result.failed += 1;
      console.error(`[sync] ${label} ${row.id} failed:`, error?.message || error);
    }
  }
  return result;
}

async function toFirestore(row) {
  await pushEnquiry(row);
  markSynced(row.id);
}

async function toSalesDaddy(row) {
  const leadId = await pushLead(row);
  markLeadSent(row.id, leadId);
  // Keep the lead id on the enquiry too. Losing it costs nothing, so a failed
  // write here does not count against the push.
  if (firestoreEnabled && leadId) {
    await firestore()
      .collection(config.firestore.collection)
      .doc(row.id)
      .set({ salesDaddyLeadId: leadId }, { merge: true })
      .catch((error) => console.error(`[sync] lead id for ${row.id} not saved:`, error?.message || error));
  }
}

async function drainAll() {
  return {
    firestore: firestoreEnabled
      ? await drain('enquiry', pendingEnquiries(), toFirestore, markSyncAttempt)
      : 'off',
    salesDaddy: salesDaddyEnabled
      ? await drain('sales daddy lead', pendingLeads(), toSalesDaddy, markLeadAttempt)
      : 'off',
  };
}

// One drain at a time, or a slow push would overlap the next tick and send
// the same rows twice. A call made during a drain gets one more drain after
// it, so a row stored meanwhile is pushed before that call resolves; the
// enquiry route waits on this (see routes/enquiries.js).
export function syncPending() {
  if (!firestoreEnabled && !salesDaddyEnabled) return Promise.resolve({ skipped: 'nothing-configured' });
  if (!running) {
    running = drainAll().finally(() => {
      running = null;
    });
    return running;
  }
  if (!queued) {
    queued = running
      .catch(() => {})
      .then(() => {
        queued = null;
        return syncPending();
      });
  }
  return queued;
}

export function startSyncWorker() {
  if (!firestoreEnabled) console.warn('[sync] GCLOUD_PROJECT is not set — enquiries are not pushed to Firestore.');
  if (!salesDaddyEnabled) console.warn('[sync] SALESDADDY_API_KEY is not set — enquiries are not sent to Sales Daddy.');
  if (!firestoreEnabled && !salesDaddyEnabled) return () => {};
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
