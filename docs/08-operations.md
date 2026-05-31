# 08 — Operations, Security & Quality

Production concerns that don't belong to a single feature: environment, monorepo, rate limiting,
data retention, testing, CI/CD, and observability.

## 1. Monorepo & tooling

- **pnpm workspaces** manage `apps/web`, `apps/api`, and `packages/shared`.
- `packages/shared` holds TypeScript types shared front ↔ back (e.g. API request/response types,
  enums) — imported as `@docmind/shared`. Never duplicate these types.
- Optional **Turborepo** for task caching (`build`, `lint`, `test`) once the repo grows.
- Root scripts: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm typecheck`.

## 2. Environment variables

Each app has its own `.env` (gitignored) plus a committed `.env.example`. **Never commit real keys.**

### `apps/api/.env`
| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | Postgres connection (Supabase) |
| `DIRECT_URL` | Direct Postgres URL for Prisma migrations (Supabase pooler workaround) |
| `REDIS_URL` | Redis/Upstash connection (BullMQ + rate limits) |
| `JWT_ACCESS_SECRET` | Signs access tokens |
| `JWT_REFRESH_SECRET` | Signs refresh tokens |
| `ACCESS_TOKEN_TTL` | e.g. `15m` |
| `REFRESH_TOKEN_TTL` | e.g. `7d` |
| `LLM_PROVIDER` | `anthropic` \| `openai` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | LLM access |
| `OPENAI_API_KEY` (embeddings) | Embeddings (if using OpenAI embeddings) |
| `EMBEDDING_MODEL` | e.g. `text-embedding-3-small` |
| `STORAGE_ENDPOINT` / `STORAGE_BUCKET` | R2/S3 |
| `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` | R2/S3 credentials |
| `WEB_ORIGIN` | Allowed CORS origin (the SPA URL) |
| `SENTRY_DSN` | Error tracking (optional in dev) |
| `MAX_UPLOAD_MB` | Upload size limit (e.g. `25`) |

### `apps/web/.env`
| Var | Purpose |
|-----|---------|
| `VITE_API_BASE_URL` | API origin |
| `VITE_SENTRY_DSN` | Frontend error tracking (optional) |

> Config is loaded and **validated with zod at startup** (`config/`); the app refuses to boot if a
> required var is missing or malformed.

## 3. Rate limiting & cost control

LLM calls cost money, so limits are enforced per workspace, backed by Redis counters:

- **Request rate limit:** e.g. 60 chat requests / minute / workspace (sliding window in Redis).
- **Token/cost budget:** a monthly token cap per workspace; each request records a `UsageEvent`
  (tokensIn/Out + estimated cost). When the cap is exceeded → `429 RATE_LIMITED`.
- **Upload limits:** max file size (`MAX_UPLOAD_MB`), max documents per workspace (MVP cap).
- **Concurrency:** BullMQ worker concurrency is bounded so embedding bursts don't exhaust the LLM quota.
- Limit responses include a `Retry-After` header.

## 4. Data lifecycle & retention

- **Document delete** removes: the DB `Document` row, its `Chunk` rows (cascade), **and** the object
  in R2/S3. Storage cleanup is explicit — DB cascade does not touch object storage.
- **Conversation delete** cascades to its `Message` rows.
- **Workspace delete** (future) cascades all owned data and purges storage objects.
- **Retention:** raw files retained while the document exists; on delete, purged. Document text lives
  only as chunks. No training on customer data.
- **Backups:** rely on Supabase automated backups; document this as a known dependency.

## 5. Testing strategy

| Level | Tool | Scope |
|-------|------|-------|
| Unit | **Vitest** | Services: RAG (chunking, prompt build), auth (hashing, token issue), tenant scoping |
| Integration | **Vitest + Supertest** | API routes against a test DB (signup, upload enqueue, message) |
| E2E | **Playwright** | One happy path: signup → upload → wait ready → ask → see cited answer |
| Security test | Vitest | Assert workspace A **cannot** read workspace B's documents/conversations |

- Use a **separate test database** (or transactional rollback per test).
- Mock the LLM/embeddings provider in unit/integration tests (deterministic, no cost); use a small
  real call only in a dedicated, opt-in test.
- Target: meaningful coverage on services and the tenant-isolation guarantee (not a % vanity metric).

## 6. CI/CD

**GitHub Actions** pipeline on every PR and on `main`:

```
PR:    install → typecheck → lint → test (unit + integration) → build
main:  the above → deploy api + worker (Render/Railway) → deploy web (Vercel/Render)
       → run prisma migrate deploy
```

- **Branching:** feature branches → PR into `main`; one PR per roadmap phase.
- **Secrets:** stored in GitHub Actions secrets / the host's env, never in the repo.
- **Migrations:** `prisma migrate deploy` runs in the deploy step (never auto-migrate at app boot in prod).
- Build must be green to merge.

## 7. Observability

- **Logging:** Pino structured JSON logs; include a request id + `workspaceId` (never log secrets or
  full document content).
- **Errors:** Sentry on API and web.
- **Health:** `GET /api/health` checks DB + Redis connectivity.
- **Metrics:** per-request token usage and cost logged via `UsageEvent`; surfaced at `/api/usage`.

## 8. Security checklist (consolidated)

- [ ] Passwords hashed with bcrypt (cost ≥ 12); never logged.
- [ ] JWT access (memory) + refresh (httpOnly Secure SameSite cookie); short access TTL; rotation on refresh.
- [ ] CORS locked to `WEB_ORIGIN` with credentials; HTTPS only.
- [ ] Tenant isolation: explicit `workspaceId` scoping **and** Postgres RLS backstop; test proves no cross-tenant reads.
- [ ] All inputs validated with zod; standard error shape; cross-tenant → 404.
- [ ] File uploads: mime allow-list, size cap, parsed server-side in the worker.
- [ ] Prompt-injection mitigation: document text delimited & treated as data; tool args validated server-side.
- [ ] Rate limits + per-workspace token budget enforced.
- [ ] Secrets only in env / CI secrets; `.env` gitignored; `.env.example` committed.
- [ ] Dependency audit in CI (`pnpm audit`).
