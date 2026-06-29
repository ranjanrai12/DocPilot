import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import type { HealthResponse } from '@docpilot/shared';
import { env } from './config/env.js';
import { prisma, assertRlsEnforced } from './lib/prisma.js';
import { pingRedis, isRedisConfigured } from './lib/redis.js';
import authRoutes from './modules/auth/auth.routes.js';
import documentRoutes from './modules/documents/documents.routes.js';
import conversationRoutes from './modules/chat/chat.routes.js';
import { errorHandler } from './middleware/errors.js';

const app = express();

app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/conversations', conversationRoutes);

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
  const body: HealthResponse = { status: 'ok', db, redis };
  res.json(body);
});

// Error handler must be last
app.use(errorHandler);

async function start(): Promise<void> {
  await assertRlsEnforced();
  app.listen(env.PORT, () => {
    console.log(`🚀 API listening on http://localhost:${env.PORT}  (env: ${env.NODE_ENV})`);
  });
}

void start();
