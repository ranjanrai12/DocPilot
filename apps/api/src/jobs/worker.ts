import { Worker } from 'bullmq';
import { getRedis } from '../lib/redis.js';
import { INGESTION_QUEUE, type IngestionJobData } from './ingestion.queue.js';
import { processIngestion } from './ingestion.processor.js';

// Standalone worker process: `pnpm --filter api worker` (dev) / `node dist/jobs/worker.js`.
// Separate from the API so slow ingestion never blocks request handling.
// Exits with a clear error if REDIS_URL isn't configured.
const worker = new Worker<IngestionJobData>(
  INGESTION_QUEUE,
  async (job) => {
    await processIngestion(job.data);
  },
  { connection: getRedis(), concurrency: 3 },
);

worker.on('completed', (job) => {
  console.log(`✅ ingestion ${job.id} done (document ${job.data.documentId})`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ ingestion ${job?.id} failed: ${err.message}`);
});

console.log('👷 Ingestion worker started — waiting for jobs...');
