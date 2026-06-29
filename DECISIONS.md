# Decisions

Short notes on non-obvious choices. Great interview fuel (see roadmap §"working rhythm").

## Phase 2 — Document upload + background ingestion

**Swappable infra drivers (CLAUDE.md).** `lib/storage` and `lib/llm` are interfaces with
multiple drivers selected by env, so no provider is hard-wired:
- **Storage** — `local` filesystem driver (dev default, `STORAGE_DIR`) + an `s3`/R2 driver
  that dynamically imports `@aws-sdk/client-s3` only when `STORAGE_DRIVER=s3` (so the SDK
  isn't a hard dependency for local dev).
- **Embeddings** — `fake` deterministic driver (mulberry32 PRNG seeded from a text hash →
  unit-length 1536-dim vector; no key/cost, dev default) + an `openai` driver via `fetch`
  (no SDK). Swap with `EMBEDDING_PROVIDER`.

**Ingestion runs in a BullMQ worker, never inline** (docs/02 §3A). Upload → store file →
create `Document` (PROCESSING) → enqueue → `202`. Worker: download → extract
(pdf-parse v2 / mammoth / txt) → chunk (~500 words, 50 overlap) → embed → insert chunks →
READY. Processor is **idempotent** (clears prior chunks; skips already-READY) so a retry
can't duplicate data. Failures set status FAILED + `error` so nothing sticks in PROCESSING.

**pgvector chunks insert via raw SQL** inside `withWorkspace` (RLS GUC set), since Prisma
can't bind the `vector` type. The `docpilot_app` role needed `USAGE` on the `extensions`
schema + `extensions` on its `search_path` for the `<=>` operator and HNSW index to resolve.

**Gotchas hit:** (1) BullMQ bundles ioredis 5.10 but our direct dep was 5.11 → type clash on
`connection`; fixed with a single `ioredis` override in `pnpm-workspace.yaml`. (2) Prisma's
client init auto-loads `.env` into `process.env` — so a malformed var in `.env` (e.g. a bad
`REDIS_URL`) fails env validation at boot even if unset in the shell. Optional URL env vars
now treat blank as unset.

## Phase 1 — RLS backstop + tenant-isolation test

**Defense in depth for multi-tenancy.** The primary control is the explicit
`where: { workspaceId }` filter in every service. Postgres Row-Level Security is the
**backstop**: even a query that forgets the filter cannot read another workspace's rows
(migration `20260629120000_enable_rls`).

- **Two roles (the key lesson).** Supabase's `postgres` role has the `BYPASSRLS`
  attribute, which skips *every* policy — `FORCE` cannot override it. So the API runtime
  connects as a dedicated least-privilege role **`docpilot_app` (NOBYPASSRLS)** via
  `APP_DATABASE_URL`, which IS subject to RLS. Migrations still run as the owner
  (`postgres`) via `DATABASE_URL`. `lib/prisma` selects the runtime role with
  `datasourceUrl`. Create the role once with `scripts/setup-app-role.mjs`.
- **`FORCE ROW LEVEL SECURITY`** — defense in depth: even if the app were ever pointed at
  an owner role, `FORCE` makes policies apply to table owners too (owners are otherwise
  exempt from plain RLS).
- **Per-transaction GUC `app.workspace_id`** — policies compare `workspaceId` to
  `current_setting('app.workspace_id', true)`. `lib/prisma` `withWorkspace()` sets it via
  `set_config(..., true)` (transaction-local, so it can't leak across pooled connections).
  Unset → `NULL` → default-deny.
- **Bypass for auth** — login/signup/refresh must look up users *before* a workspace is
  known. Those run under `bypassRls()` (sets `app.bypass_rls = 'on'`), the trusted
  pre-tenant boundary. Everything else uses `withWorkspace()`.
- **Cross-tenant rule** — services return **404 NOT_FOUND** (not 403) for another
  workspace's id, so existence isn't leaked (docs/07). The RLS test asserts a cross-tenant
  read comes back as "not found" / empty.
- **The test needs a real Postgres** — RLS is a database feature and can't be mocked.
  `apps/api/src/tenant-isolation.test.ts` (Vitest) seeds two workspaces and proves no
  cross-read. It connects as `docpilot_app` (or `TEST_DATABASE_URL`) — connecting as the
  owner would make RLS a no-op and silently "pass nothing." Apply the migration first:
  `pnpm --filter api prisma migrate deploy`.

**Status:** ✅ migration applied to Supabase and all 4 isolation tests pass against the
live DB.
