import type { Request, Response, NextFunction } from 'express';

interface AppError extends Error {
  status?: number;
  code?: string;
  details?: unknown;
}

// Must be registered last (4-arg signature tells Express it's an error handler).
export function errorHandler(err: AppError, _req: Request, res: Response, _next: NextFunction): void {
  if (err.status && err.code) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'An unexpected error occurred.' } });
}
