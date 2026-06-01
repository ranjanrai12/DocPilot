/**
 * Shared TypeScript types used by BOTH the API and the web app.
 * Import via:  import type { HealthResponse } from '@docpilot/shared';
 *
 * Keeping these in one place means the frontend and backend can never
 * drift out of sync about the shape of the data they exchange.
 */

/** Response shape of GET /api/health */
export interface HealthResponse {
  status: 'ok';
  db: 'up' | 'down' | 'unknown';
  redis: 'up' | 'down' | 'unknown';
}

/** Standard API error shape (see docs/07-api-spec.md). */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
