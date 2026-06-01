# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this project is

**DocPilot** — an AI Knowledge Assistant SaaS (RAG + agent). Businesses upload documents; their team
chats with an AI that answers **only from those documents**, with citations, and can take actions via
AI tool-calling. It is a **production-grade portfolio project** to demonstrate AI-fullstack skills.

Read the docs before making changes — they are the source of truth:

- `docs/01-project-spec.md` — product spec, functional requirements, scope
- `docs/02-architecture.md` — system design, RAG pipeline, request flows
- `docs/03-tech-stack.md` — stack choices + rationale
- `docs/04-data-model.md` — tables, relationships, Prisma schema, vector-search SQL
- `docs/05-roadmap.md` — phased build plan (Phase 0→6); **follow phase order**
- `docs/06-learning-guide.md` — what the author is learning per phase
- `docs/07-api-spec.md` — REST endpoints, streaming format, **standard error shape**, permissions matrix
- `docs/08-operations.md` — env vars, rate limits, data retention, testing, CI/CD, **security checklist**

## Current status

🟢 **Phase 0 complete.** pnpm monorepo scaffolded and verified: `apps/api` (Express + TS, zod-validated
env, `/api/health`), `apps/web` (React + Vite + TS + TanStack Query, calls the API), `packages/shared`
(shared types). Both apps start and typecheck/build clean. **Next: Phase 1** (auth + database).

## Locked tech stack

- **Frontend:** React 18 + Vite + TypeScript, TanStack Query, Tailwind CSS
- **Backend:** Express + Node + TypeScript
- **Database:** PostgreSQL + pgvector (Supabase managed) via Prisma ORM
- **Jobs/cache:** Redis + BullMQ (background document ingestion)
- **Storage:** Cloudflare R2 / S3
- **AI:** Anthropic Claude (or OpenAI) + OpenAI embeddings
- **Deploy:** Render / Railway + GitHub Actions

Do not switch frameworks/languages without the author's explicit approval — these were deliberate
decisions (see `docs/03-tech-stack.md`).

## Planned repository layout

```
docpilot/
├─ docs/                  # project documentation (source of truth)
├─ apps/
│  ├─ web/                # React + Vite frontend
│  └─ api/                # Express backend (layout below)
├─ packages/
│  └─ shared/             # shared TypeScript types (front <-> back)
├─ docker-compose.yml     # local Redis
└─ CLAUDE.md
```

Backend (`apps/api/src/`) — **feature/module-based** structure (group by feature, not by layer):

```
modules/           # one folder per feature, each owns its routes/controller/service/schema
  auth/            #   auth.routes.ts, auth.controller.ts, auth.service.ts, auth.schema.ts
  workspaces/
  documents/       # upload + ingestion enqueue + listing
  chat/            # conversations + RAG query flow
  agent/           # tool definitions + tool-calling loop
  usage/           # token/cost tracking + rate-limit accounting
middleware/        # cross-cutting: auth, tenant scoping, validation, rate limit, errors
jobs/              # BullMQ worker + processors (ingestion)
lib/               # infra clients: prisma, redis, llm, storage
config/            # env loading & validation
types/             # local types
```

Per module: `routes → controller → service`. No business logic in routes/controllers.

## Conventions

- **TypeScript everywhere**; share types via `packages/shared`, don't duplicate.
- **Validate all inputs** with zod before they reach services.
- **Multi-tenancy is non-negotiable:** every DB query must be scoped by `workspaceId` (explicit
  `where` clause), backed by **Postgres RLS** as a backstop. A test must prove no cross-tenant reads.
  Cross-tenant access returns **404**, not 403.
- **Auth:** JWT access token (in memory, ~15m) + refresh token (httpOnly Secure SameSite cookie, ~7d);
  bcrypt cost ≥ 12. Do not use localStorage for tokens.
- **Express structure:** routes → controllers → services. No business logic in route handlers.
- **Long/slow work** (document ingestion, embedding) goes through the **BullMQ queue**, never inline in a request.
- **Streaming:** chat uses `fetch` + `ReadableStream` over a **POST** that returns `text/event-stream`
  (NOT `EventSource`, which is GET-only).
- **LLM access** is abstracted behind one client module in `lib/` so the provider can be swapped.
- **Errors:** use the standard error shape from `07-api-spec.md` (`{ error: { code, message, details } }`).
- **Config:** validate env with zod at startup; refuse to boot if required vars are missing.
- **Secrets** live in `.env` (gitignored); provide a `.env.example`. Never commit keys.
- **Data deletion:** deleting a document must also remove its chunks AND the storage object (cascade
  covers DB only, not S3/R2).
- **Hallucination control:** the RAG system prompt must instruct the model to answer only from
  retrieved context and say "I don't know" otherwise.

## Build order

Follow `docs/05-roadmap.md` phase by phase. Each phase must _work_ (meet its "Done when" criterion)
before starting the next. The author is new to React, Express, and databases — when implementing,
briefly explain concepts and the _why_ behind decisions (Angular analogies help).

## Commands

Monorepo uses **pnpm workspaces** (`apps/*`, `packages/*`).

- `pnpm install` — install all workspace deps
- `pnpm dev` — run api (:3000) + web (:5173) in parallel
- `pnpm --filter api dev` / `pnpm --filter web dev` — run one app
- `pnpm typecheck` — typecheck all packages
- `pnpm build` — build all packages
- `pnpm --filter web build` — build the web app
- `pnpm format` / `pnpm format:check` — format (Prettier) / check formatting
- Dev runner: **tsx** (api). API prod build: **tsup**.
- Coming in later phases: `pnpm --filter api prisma migrate dev`, `pnpm --filter api prisma generate`

> **Deferred to Phase 6 (deliberate):** ESLint is not configured yet — `pnpm lint` is a no-op stub.
> Local Redis (`docker-compose.yml`) is defined but only needed from Phase 2 (BullMQ ingestion).

## Git

- Not yet committed. Commit/push only when the author asks.
- Conventional-commit style messages (e.g. `feat:`, `chore:`, `docs:`).
