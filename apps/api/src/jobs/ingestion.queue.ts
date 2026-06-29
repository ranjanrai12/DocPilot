import { Queue } from 'bullmq';
import { getRedis } from '../lib/redis.js';

export const INGESTION_QUEUE = 'ingestion';

export interface IngestionJobData {
  documentId: string;
  workspaceId: string;
}

// Lazily-created producer-side queue. The API enqueues; the worker (worker.ts)
// consumes. Both share lib/redis.
let queue: Queue<IngestionJobData> | undefined;

export function getIngestionQueue(): Queue<IngestionJobData> {
  return (queue ??= new Queue<IngestionJobData>(INGESTION_QUEUE, {
    connection: getRedis(),
    defaultJobOptions: {
      // Retry transient failures (storage/embedding blips) with backoff; terminal
      // failures throw UnrecoverableError in the processor so they stop early.
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      // Keep Redis tidy: drop succeeded jobs, retain the last 100 failures for debugging.
      removeOnComplete: true,
      removeOnFail: { count: 100 },
    },
  }));
}
