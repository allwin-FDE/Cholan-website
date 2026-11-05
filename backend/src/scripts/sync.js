// Manual drain of the outbox: `npm run sync`. Useful after the backend has run
// without GCP configured, or to flush the queue before shutting an instance down.
import { syncPending } from '../lib/sync.js';
import { crmCounts, syncCounts } from '../store/db.js';

const result = await syncPending();

if (result.skipped) {
  console.log(`Nothing pushed (${result.skipped}).`);
} else {
  for (const [target, outcome] of Object.entries(result)) {
    console.log(
      typeof outcome === 'string'
        ? `${target}: ${outcome}`
        : `${target}: pushed ${outcome.pushed}, failed ${outcome.failed}.`,
    );
  }
}
console.log('Local state:', { firestore: syncCounts(), salesDaddy: crmCounts() });
