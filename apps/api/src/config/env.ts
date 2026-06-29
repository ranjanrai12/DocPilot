import { z } from 'zod';

// Treat a blank optional URL var (e.g. `REDIS_URL=` left empty in .env) as unset
// rather than failing validation. A non-empty malformed URL still errors.
const optionalUrl = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().url().optional(),
);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),

  DATABASE_URL: z.string().url(),
  // Least-privilege runtime role (docpilot_app, NOBYPASSRLS) so RLS is enforced.
  // Optional: falls back to DATABASE_URL (owner) if unset — but then RLS is
  // bypassed, so set this in any real environment.
  APP_DATABASE_URL: optionalUrl,

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),

  // Redis (BullMQ ingestion queue + worker). Optional so the API can still boot
  // without it, but uploads return 503 until it's set.
  REDIS_URL: optionalUrl,

  // Storage (lib/storage) — where raw uploaded files live.
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_DIR: z.string().default('.uploads'),
  STORAGE_ENDPOINT: optionalUrl,
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_REGION: z.string().default('auto'),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),

  // Embeddings (lib/llm). `fake` = deterministic dev driver (no key/cost).
  EMBEDDING_PROVIDER: z.enum(['fake', 'openai']).default('fake'),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  OPENAI_API_KEY: z.string().optional(),

  // Uploads
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
