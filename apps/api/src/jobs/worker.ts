import { Worker } from 'bullmq';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { INGESTION_QUEUE, type IngestionJobData } from './ingestion.queue.js';
import { processIngestion } from './ingestion.processor.js';

// Standalone worker process: `pnpm --filter api worker` (dev) / `node dist/jobs/worker.js`.
// Separate from the API so slow ingestion never blocks request handling.
// Exits with a clear error if REDIS_URL isn't configured.
const log = logger.child({ component: 'ingestion-worker' });

const worker = new Worker<IngestionJobData>(
  INGESTION_QUEUE,
  async (job) => {
    await processIngestion(job.data);
  },
  { connection: getRedis(), concurrency: 3 },
);

worker.on('completed', (job) => {
  log.info({ jobId: job.id, documentId: job.data.documentId }, 'ingestion done');
});

worker.on('failed', (job, err) => {
  log.error(
    { jobId: job?.id, documentId: job?.data.documentId, err: err.message },
    'ingestion failed',
  );
});

log.info('👷 Ingestion worker started — waiting for jobs...');
