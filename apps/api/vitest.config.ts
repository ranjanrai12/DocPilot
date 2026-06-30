import { defineConfig } from 'vitest/config';

// Default config = UNIT tests: no external services, runnable anywhere (CI).
// Integration tests (real Postgres) are excluded here and run via
// `pnpm test:integration` (vitest.integration.config.ts).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/*.integration.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
});
