# Decisions

Short notes on non-obvious choices. Great interview fuel (see roadmap §"working rhythm").

## Phase 3 — Basic RAG chat (non-streaming)

**RAG query flow** (`modules/chat/chat.service.ts` `ask`): embed question → **tenant-scoped
pgvector `<=>` search** (top-K, `WHERE workspaceId`, parameterized, inside `withWorkspace`) →
grounded prompt → LLM → persist user+assistant `Message` + `citations` + a `CHAT` `UsageEvent`.
No migration needed — Conversation/Message tables existed since Phase 1 and already have RLS.

- **Chat LLM behind `lib/llm`** (swappable): `AnthropicChat` (Claude via the official
  `@anthropic-ai/sdk`, model `CHAT_MODEL` = `claude-opus-4-8`) + a `FakeChat` dev driver. Selected
  by `LLM_PROVIDER`; falls back to fake if no `ANTHROPIC_API_KEY` (so dev runs with no keys/cost).
- **Grounding / anti-hallucination**: system prompt answers ONLY from the `<context>` block, else the
  exact "I don't know based on the documents." Retrieved text is delimited and **escaped** (both
  filename attrs and chunk *body*) so poisoned document content can't break out of the tags and inject
  instructions (prompt-injection mitigation, docs/02 §7).
- **Citations** built only from chunks actually retrieved (one per source document); never fabricated.
- Phase 3 is **non-streaming JSON**; Phase 4 converts `POST /api/conversations/:id/messages` to SSE.

**Review pass (rag-agent-reviewer + tenant-isolation-auditor): both PASS.** Fixes applied: escape
chunk body text; history window now takes the most-recent N (was oldest); embedding-dimension guard;
added `Conversation`/`Message` cross-tenant tests (the `Message` RLS policy is scoped via its parent
Conversation — now has direct coverage).

> ⚠️ **Re-embed when switching embeddings provider.** Dev uses the deterministic `fake` embedder, so
> retrieval isn't semantic. Turning on real embeddings (`EMBEDDING_PROVIDER=openai` + `OPENAI_API_KEY`,
> 1536-dim to match the column) requires **re-ingesting existing documents** — old fake vectors share
> the dimension so they'd retrieve poorly rather than error. Claude has no embeddings API, so embeddings
> need OpenAI (or another provider) even though chat uses Claude.

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

### Post-build review pass (3 custom agents)

After Phase 2, ran `tenant-isolation-auditor`, `prisma-guardian`, and `docpilot-reviewer`.
Both security audits PASSed (no exploitable cross-tenant path). Fixes applied from the review:
- **RLS no-op guard** — `assertRlsEnforced()` (lib/prisma) refuses to boot in production (warns in
  dev) if the runtime role can bypass RLS; `APP_DATABASE_URL` is required in production.
- **Upload orchestration moved controller → `service.uploadDocument()`** with compensation (delete
  object / mark FAILED on partial failure) — also fixes the "stuck PROCESSING forever" case.
- `getMe` now uses `withWorkspace` (not `bypassRls`); all writes scoped (`deleteMany`/`updateMany`
  with `{ id, workspaceId }`); `:id` params zod-validated; conditional env enforced at startup;
  user-facing `document.error` sanitized (raw provider text logged server-side only).
- `embedding` modeled as `Unsupported("vector(1536)")?` so `prisma migrate dev` won't DROP it.
- Isolation test expanded to cover writes (RLS `WITH CHECK` insert rejection + cross-tenant update).

**Deferred to Phase 6 / CI (prisma-guardian, not blocking):**
- The `add_pgvector_embeddings` migration assumes the `extensions` schema exists; it's already applied
  to Supabase (can't edit — checksum), so fresh CI/local needs a pre-migration `CREATE SCHEMA IF NOT
  EXISTS extensions` (or a pgvector image bootstrap). `setup-app-role.mjs` does this for the runtime DB.
- `migrate dev` could emit a spurious `embedding` ALTER if the migration owner's `search_path` lacks
  `extensions` (qualified vs unqualified `vector` type). On Supabase the `postgres` owner already has
  `extensions` on its path. Mitigation: keep hand-authoring vector migrations + `migrate deploy`; if
  `migrate dev` is ever used, review/discard any generated `embedding` type change.

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
