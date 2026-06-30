import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import type { HealthResponse } from '@docpilot/shared';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma, assertRlsEnforced } from './lib/prisma.js';
import { pingRedis, isRedisConfigured } from './lib/redis.js';
import authRoutes from './modules/auth/auth.routes.js';
import documentRoutes from './modules/documents/documents.routes.js';
import conversationRoutes from './modules/chat/chat.routes.js';
import usageRoutes from './modules/usage/usage.routes.js';
import { errorHandler } from './middleware/errors.js';

const app = express();

// Structured per-request logging (attaches a request id + req.log). Health
// checks are polled frequently, so don't log them at info.
app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === '/api/health' },
    customLogLevel: (_req, res, err) =>
      res.statusCode >= 500 || err ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
  }),
);

app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/usage', usageRoutes);

// Liveness/readiness probe. The database is critical → DB down returns 503 so a
// load balancer pulls the instance. Redis being down is reported but does not
// fail the check (the API still serves auth/chat; only ingestion needs Redis).
app.get('/api/health', async (_req, res) => {
  let db: HealthResponse['db'] = 'unknown';
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = 'up';
  } catch {
    db = 'down';
  }
  const redis: HealthResponse['redis'] = !isRedisConfigured()
    ? 'unknown'
    : (await pingRedis())
      ? 'up'
      : 'down';
  const body: HealthResponse = { status: db === 'up' ? 'ok' : 'degraded', db, redis };
  res.status(db === 'up' ? 200 : 503).json(body);
});

// Error handler must be last
app.use(errorHandler);

async function start(): Promise<void> {
  await assertRlsEnforced();
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, '🚀 API listening');
  });
}

void start();
