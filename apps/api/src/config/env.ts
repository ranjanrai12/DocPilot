import { z } from 'zod';

/**
 * Validate environment variables AT STARTUP with zod.
 * If a required var is missing or malformed, the app refuses to boot
 * (a deliberate convention from docs/08-operations.md).
 *
 * For Phase 0 we only need a couple of vars; we'll add DATABASE_URL,
 * REDIS_URL, JWT secrets, LLM keys, etc. in later phases.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
