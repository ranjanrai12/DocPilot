import { Redis } from 'ioredis';
import { env } from '../config/env.js';

// Single shared Redis connection for BullMQ (queue producer + worker) and,
// later, rate-limit counters. `maxRetriesPerRequest: null` is required by BullMQ.
let connection: Redis | null = null;

export function isRedisConfigured(): boolean {
  return Boolean(env.REDIS_URL);
}

export function getRedis(): Redis {
  if (!env.REDIS_URL) {
    throw new Error('REDIS_URL is not set — required for the ingestion queue/worker.');
  }
  if (!connection) {
    connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return connection;
}

export async function pingRedis(): Promise<boolean> {
  if (!env.REDIS_URL) return false;
  try {
    return (await getRedis().ping()) === 'PONG';
  } catch {
    return false;
  }
}
