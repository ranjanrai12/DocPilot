// Load apps/api/.env into process.env before validating. In production the host
// provides real env vars and there's no .env file — dotenv then just no-ops.
// (tsx/node don't auto-load .env, and env validation runs before Prisma would.)
import 'dotenv/config';
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
  // Pino log level (lib/logger). `debug` is handy in dev; keep `info` in prod.
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

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

  // Chat LLM (lib/llm). `fake` = deterministic dev driver (no key/cost);
  // `anthropic` uses Claude and needs ANTHROPIC_API_KEY (falls back to fake in
  // dev if the key is missing).
  LLM_PROVIDER: z.enum(['anthropic', 'fake']).default('fake'),
  ANTHROPIC_API_KEY: z.string().optional(),
  CHAT_MODEL: z.string().default('claude-opus-4-8'),
  RAG_TOP_K: z.coerce.number().int().min(1).max(20).default(5),

  // Uploads
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),

  // Per-workspace rate limits (fixed 60s window, Redis-backed). Fail open if
  // Redis is unavailable so a Redis blip can't take the API down.
  RATE_LIMIT_CHAT_PER_MIN: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_UPLOAD_PER_MIN: z.coerce.number().int().positive().default(20),
}).superRefine((val, ctx) => {
  // Conditionally-required vars — fail at startup, not on first use.
  if (val.STORAGE_DRIVER === 's3') {
    for (const key of ['STORAGE_BUCKET', 'STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY'] as const) {
      if (!val[key]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is required when STORAGE_DRIVER=s3` });
      }
    }
  }
  if (val.EMBEDDING_PROVIDER === 'openai' && !val.OPENAI_API_KEY) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['OPENAI_API_KEY'], message: 'OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai' });
  }
  // In production the runtime MUST use the least-privilege role or RLS is a no-op.
  if (val.NODE_ENV === 'production' && !val.APP_DATABASE_URL) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['APP_DATABASE_URL'], message: 'APP_DATABASE_URL (least-privilege docpilot_app role) is required in production so RLS is enforced' });
  }
  if (val.NODE_ENV === 'production' && val.LLM_PROVIDER === 'anthropic' && !val.ANTHROPIC_API_KEY) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ANTHROPIC_API_KEY'], message: 'ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic' });
  }
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
