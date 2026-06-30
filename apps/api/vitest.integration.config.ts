import { defineConfig } from 'vitest/config';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Integration tests run against a REAL Postgres — RLS is a Postgres feature and
// can't be mocked. Point at a throwaway DB with TEST_DATABASE_URL; otherwise it
// falls back to APP_DATABASE_URL / DATABASE_URL. The DB connection MUST use the
// least-privilege (NOBYPASSRLS) role or RLS won't be enforced.
const here = dirname(fileURLToPath(import.meta.url));
const parsed = loadEnv({ path: resolve(here, '.env') }).parsed ?? {};
const pick = (k: string) => process.env[k] ?? parsed[k];

const databaseUrl = pick('DATABASE_URL') ?? '';
const appDatabaseUrl = pick('TEST_DATABASE_URL') ?? pick('APP_DATABASE_URL') ?? databaseUrl;

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    env: { DATABASE_URL: databaseUrl, APP_DATABASE_URL: appDatabaseUrl },
    // Tenant tests seed/clean shared rows — never run files concurrently.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
