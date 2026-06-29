import { getIngestionQueue, INGESTION_QUEUE } from './ingestion.queue.js';

// One-off maintenance: wipe the ingestion queue (waiting + active + completed +
// failed + delayed). Use to clear orphaned jobs that reference documents which
// no longer exist. Run: `pnpm --filter api queue:clear`.
//
// NOTE: this removes EVERY job in the queue. If a document is still genuinely
// PROCESSING afterwards, re-upload it to enqueue a fresh job.
const queue = getIngestionQueue();
const before = await queue.getJobCounts();
console.log(`Queue "${INGESTION_QUEUE}" before:`, before);

await queue.obliterate({ force: true });

console.log(`✅ Cleared queue "${INGESTION_QUEUE}".`);
await queue.close();
process.exit(0);
