// Manual drain of the outbox: `npm run sync`. Useful after the backend has run
// without GCP configured, or to flush the queue before shutting an instance down.
import { syncPending } from '../lib/sync.js';
import { syncCounts } from '../store/db.js';

const result = await syncPending();

if (result.skipped) {
  console.log(`Nothing pushed (${result.skipped}).`);
} else {
  console.log(`Pushed ${result.pushed}, failed ${result.failed}.`);
}
console.log('Local state:', syncCounts());
