import { defineConfig } from 'vitest/config';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load apps/api/.env so the integration test can reach Postgres. The isolation
// test runs against a REAL database (RLS is a Postgres feature — it can't be
// mocked). Point it at a throwaway DB with TEST_DATABASE_URL; otherwise it
// falls back to DATABASE_URL.
const here = dirname(fileURLToPath(import.meta.url));
const parsed = loadEnv({ path: resolve(here, '.env') }).parsed ?? {};
const pick = (k: string) => process.env[k] ?? parsed[k];

// The isolation test MUST connect as the least-privilege role (NOBYPASSRLS) or
// RLS won't be enforced. Prefer a throwaway TEST_DATABASE_URL, else the app role.
const databaseUrl = pick('DATABASE_URL') ?? '';
const appDatabaseUrl =
  pick('TEST_DATABASE_URL') ?? pick('APP_DATABASE_URL') ?? databaseUrl;

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: { DATABASE_URL: databaseUrl, APP_DATABASE_URL: appDatabaseUrl },
    // Tenant tests seed/clean shared rows — never run files concurrently.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
