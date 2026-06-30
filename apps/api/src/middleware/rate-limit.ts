import type { Request, Response, NextFunction } from 'express';
import { getRedis, isRedisConfigured } from '../lib/redis.js';
import { httpError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';

interface RateLimitOptions {
  bucket: string; // namespace, e.g. "chat" | "upload" | "auth"
  limit: number; // max requests per window
  windowSec: number; // window length in seconds
  // What to key the counter on. "workspace" (default) requires req.user and is
  // for authenticated endpoints; "ip" is for pre-auth endpoints (login/signup)
  // to blunt brute-force / credential stuffing.
  keyOn?: 'workspace' | 'ip';
}

// Fixed-window rate limiter backed by Redis (INCR + EXPIRE), so the count is
// shared across API instances. Fails OPEN — if Redis is unavailable/unconfigured
// or the key subject is missing, requests are allowed (a rate limiter must never
// be a single point of failure). "workspace" keying must run AFTER requireAuth.
export function rateLimit({ bucket, limit, windowSec, keyOn = 'workspace' }: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const subject = keyOn === 'ip' ? req.ip : req.user?.workspaceId;
    if (!subject || !isRedisConfigured()) {
      next();
      return;
    }

    const key = `ratelimit:${bucket}:${keyOn}:${subject}`;
    try {
      const redis = getRedis();
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSec); // set TTL on first hit of the window
      if (count > limit) {
        const ttl = await redis.ttl(key);
        const retryAfter = ttl > 0 ? ttl : windowSec;
        res.setHeader('Retry-After', String(retryAfter));
        next(httpError('Rate limit exceeded. Please slow down and try again shortly.', 429, 'RATE_LIMITED'));
        return;
      }
      next();
    } catch (err) {
      // Redis error → fail open so a transient blip can't take the endpoint down.
      logger.warn({ err: err instanceof Error ? err.message : err, bucket }, 'rate limiter unavailable — allowing request');
      next();
    }
  };
}
