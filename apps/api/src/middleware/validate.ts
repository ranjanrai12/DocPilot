import type { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

// Validates req.body against the given schema. On failure sends a
// standard VALIDATION_ERROR response (see docs/07-api-spec.md).
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        path: e.path.join('.'),
        issue: e.message,
      }));
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', details },
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
