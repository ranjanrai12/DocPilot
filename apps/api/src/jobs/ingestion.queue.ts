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
  return (queue ??= new Queue<IngestionJobData>(INGESTION_QUEUE, { connection: getRedis() }));
}
