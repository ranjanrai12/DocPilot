import { pino } from 'pino';
import { env } from '../config/env.js';

// Single structured logger for the API + worker (Phase 6 observability).
// - Dev: pretty-printed via pino-pretty (a devDependency; only referenced when
//   NODE_ENV=development, so the production bundle never loads it).
// - Prod: line-delimited JSON to stdout, for a log shipper to collect.
// Secrets are redacted defensively in case a request/credential object is ever
// passed to the logger.
const isDev = env.NODE_ENV === 'development';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.ANTHROPIC_API_KEY',
      '*.OPENAI_API_KEY',
    ],
    remove: true,
  },
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
});
