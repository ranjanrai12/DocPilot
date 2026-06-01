import express from 'express';
import cors from 'cors';
import type { HealthResponse } from '@docpilot/shared';
import { env } from './config/env';

const app = express();

// Allow the web app (different origin in dev) to call us, with cookies (for the
// refresh token later). Locked to the known web origin — not a wildcard.
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));

// Parse JSON request bodies.
app.use(express.json());

/**
 * Health check — used by the web app (and later by the deploy platform) to
 * confirm the API is up. In Phase 1/2 we'll wire real db/redis checks here.
 */
app.get('/api/health', (_req, res) => {
  const body: HealthResponse = { status: 'ok', db: 'unknown', redis: 'unknown' };
  res.json(body);
});

app.listen(env.PORT, () => {
  console.log(`🚀 API listening on http://localhost:${env.PORT}  (env: ${env.NODE_ENV})`);
});
