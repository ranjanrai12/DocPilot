import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

interface AppError extends Error {
  status?: number;
  code?: string;
  details?: unknown;
}

// Must be registered last (4-arg signature tells Express it's an error handler).
export function errorHandler(err: AppError, req: Request, res: Response, _next: NextFunction): void {
  // Known operational errors (httpError): expected, log at warn with context.
  if (err.status && err.code) {
    logger.warn(
      { code: err.code, status: err.status, method: req.method, url: req.url },
      err.message,
    );
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }
  // Unexpected: log the full error server-side; return a generic message so no
  // internals (stack, query, provider text) leak to the client.
  logger.error({ err, method: req.method, url: req.url }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'An unexpected error occurred.' } });
}
