// Vitest global setup. config/env validates process.env at import and calls
// process.exit(1) if required vars are missing — so without this, importing any
// module that touches env would abort the test run in CI (no .env present).
//
// We load .env first (so local integration tests get the real DATABASE_URL /
// APP_DATABASE_URL), force NODE_ENV=test (keeps the logger in JSON mode — no
// pino-pretty worker thread during tests), then fill any still-missing required
// vars with harmless dummies for unit runs.
import 'dotenv/config';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL ??= 'silent';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/docpilot_test';
process.env.APP_DATABASE_URL ??= process.env.DATABASE_URL;
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789abcdef';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-9876543210abcdef';
