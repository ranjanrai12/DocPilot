# 02 — Architecture

## 1. System overview

```
┌────────────────────────────────────────────────────────────────┐
│  React SPA (Vite)                                                │
│  • Auth screens · Document dashboard · Chat UI (streaming)       │
│  • TanStack Query for server state · Tailwind for styling        │
└───────────────┬──────────────────────────────────────────────────┘
                │  HTTPS (REST)  +  SSE (token streaming)
┌───────────────▼──────────────────────────────────────────────────┐
│  Express API (Node + TypeScript)                                  │
│  • Auth middleware (JWT)  • Tenant-scoping (RLS + explicit)        │
│  • Validation (zod)  • Rate limiting  • Routes/controllers        │
└──┬───────────────┬───────────────────┬───────────────────────────┘
   │               │                   │
   │          ┌────▼─────┐       ┌──────▼───────┐
   │          │ BullMQ   │       │  RAG / Agent │
   │          │ worker   │       │   service    │
   │          │(ingest)  │       └──────┬───────┘
   │          └────┬─────┘              │
┌──▼───────────┐ ┌─▼──────────────┐ ┌───▼─────────────┐ ┌──────────┐
│ PostgreSQL   │ │ pgvector       │ │ LLM API         │ │  Redis   │
│ (Prisma)     │ │ (embeddings,   │ │ (Claude/OpenAI) │ │ (queue + │
│ users, docs, │ │  chunks) —     │ │ + embeddings    │ │  cache)  │
│ convos, msgs │ │  same Postgres │ │ API             │ │          │
└──────────────┘ └────────────────┘ └─────────────────┘ └──────────┘
        │
   ┌────▼────────┐
   │ R2 / S3     │  raw uploaded files
   └─────────────┘
```

**Key idea:** Postgres does double duty — relational data *and* vector search (via the pgvector
extension). One database = simpler ops, a deliberate choice we can defend in interviews.

## 2. Components

### Frontend (React + Vite)
- **Auth pages**, **Dashboard** (uploads + status), **Chat** (streaming + citations), **History**, **Team**.
- **TanStack Query** manages server data (caching, refetching).
- Streaming consumed via the browser **EventSource / fetch stream** API.

### Backend (Express)
**Feature/module-based structure** — code is grouped by feature (what it does for the user), not by
technical layer. Related code lives together, so adding or changing a feature touches one folder
instead of being scattered. This mirrors how NestJS/Angular organize code.

```
src/
├─ modules/                    # one folder per feature
│  ├─ auth/
│  │  ├─ auth.routes.ts        # endpoint definitions
│  │  ├─ auth.controller.ts    # request/response handling
│  │  ├─ auth.service.ts       # business logic (calls Prisma directly)
│  │  └─ auth.schema.ts        # zod validation schemas
│  ├─ workspaces/
│  ├─ documents/               # upload + ingestion enqueue + listing
│  ├─ chat/                    # conversations + RAG query flow
│  ├─ agent/                   # tool definitions + tool-calling loop
│  └─ usage/                   # token/cost tracking + rate-limit accounting
├─ middleware/                 # cross-cutting: auth, tenant scoping, validation, rate limit, errors
├─ jobs/                       # BullMQ worker + processors (document ingestion)
├─ lib/                        # infra clients: prisma, redis, llm, storage
├─ config/                     # env loading & validation
└─ types/                      # shared/local types
```

**Per-module convention:** `routes → controller → service`. Routes wire endpoints; controllers handle
HTTP (parse, validate via the module's zod schema, respond); services hold business logic.

**Repository layer (optional, deferred):** Prisma already abstracts the database, so services call
Prisma directly to start (fewer moving parts while learning). A thin `*.repository.ts` can be
introduced later in one module (e.g. `documents`) to demonstrate the pattern and improve testability —
not applied everywhere by default (avoids over-engineering).

**Cross-cutting code stays outside `modules/`:** middleware, the BullMQ worker (`jobs/`), infra
clients (`lib/`), config, and shared types are not features and are shared across modules.

### Background worker (BullMQ)
Document ingestion is slow (parse + embed many chunks), so it runs **out of the request cycle**:
the upload endpoint enqueues a job; the worker processes it; the UI polls/streams status.

### Data stores
- **PostgreSQL (Prisma):** users, workspaces, documents, conversations, messages, usage.
- **pgvector:** the `chunks` table stores text + an `embedding vector` column for similarity search.
- **Redis:** BullMQ queue + caching + rate-limit counters.
- **R2/S3:** raw uploaded files (never store binaries in the DB).

## 3. The RAG pipeline (core)

### Phase A — Ingestion (background job, on upload)
```
1. Save file to R2/S3, create `documents` row (status = PROCESSING).
2. Enqueue an ingestion job (BullMQ).
3. Worker:
   a. Download file → extract text (pdf-parse / mammoth / plain).
   b. Chunk text (~500 tokens, ~50 token overlap, prefer heading boundaries).
   c. For each chunk → call embeddings API → get a vector.
   d. Insert chunks (content + embedding + metadata) into pgvector.
   e. Set document status = READY (or FAILED with reason).
```

**Embeddings explained:** an embedding is a numeric vector capturing a chunk's *meaning*; similar
meanings → nearby vectors. This enables search by meaning, not keywords.

### Phase B — Query (on each user question)
```
1. Embed the user's question (same embeddings model).
2. Vector similarity search in pgvector (cosine), scoped to workspace → top-K chunks.
3. Build a prompt:  system rules + retrieved chunks (with source ids) + chat history + question.
4. Call the LLM with streaming enabled.
5. Stream tokens to the client over SSE.
6. Persist the message + citations; record token usage.
```

**Hallucination control:** the system prompt instructs the model to answer **only** from the
provided chunks and to reply "I don't know based on the documents" when the answer isn't present.

## 4. Agentic tool-calling

The LLM is given a set of callable **tools** (function schemas). Flow:
```
1. LLM receives the question + tool definitions.
2. If it decides to act, it returns a tool call, e.g. email_summary({ to, summary }).
3. Backend executes the tool, returns the result to the LLM.
4. LLM produces the final user-facing answer.
```
Initial tools: `search_documents`, `email_summary`, `create_ticket` (the last two can be mocked/
logged in the MVP and wired to real providers later).

## 5. Streaming (decided: fetch streaming over POST)

The question is sent in a request **body**, so we stream the response from a **POST** endpoint using
**`fetch` + `ReadableStream`** on the client — *not* the `EventSource` API (which only supports GET).

- Endpoint: `POST /api/conversations/:id/messages` returns `Content-Type: text/event-stream` (SSE
  wire format: `data: <token>\n\n`), written as tokens arrive from the LLM.
- The client reads the response body stream incrementally and renders tokens live.
- An **AbortController** lets the user stop generation; aborting also cancels the upstream LLM call to
  save cost.
- A terminal event carries citations + usage so the client can finalize the message.

## 6. Authentication (decided)

**Strategy: JWT access token + refresh token.** Chosen over cookie-sessions because the React SPA
and the Express API are deployed on **different origins** (Vercel/Render), which makes token-based
auth simpler and the design more "stateless API"-shaped.

- **Access token (JWT):** short-lived (~15 min). Held **in memory** in the SPA (not localStorage —
  avoids XSS token theft). Sent as `Authorization: Bearer <token>`.
- **Refresh token:** long-lived (~7 days), stored in an **httpOnly, Secure, SameSite cookie** so JS
  can't read it. A `POST /api/auth/refresh` endpoint issues a new access token.
- **Password hashing:** bcrypt (cost ≥ 12).
- **Logout:** clears the refresh cookie; optionally maintain a refresh-token denylist in Redis.
- The JWT payload carries `userId`, `workspaceId`, and `role` so middleware can authorize without a
  DB hit on every request.

## 7. Multi-tenancy & security

### How tenant isolation is actually enforced (defense in depth)
The cornerstone of the app — must be real, not hand-waved. We use **two layers**:

1. **Explicit scoping in services (primary).** Every service method takes the caller's `workspaceId`
   (from the verified JWT) and includes it in the Prisma `where` clause. No service queries a
   tenant-owned table without it. This is enforced by code review + tests (a test asserts that
   workspace A cannot read workspace B's data).
2. **Postgres Row-Level Security (RLS) (backstop).** RLS policies on tenant tables ensure that even
   a buggy query cannot cross tenants. The app sets the current workspace per connection/transaction
   (e.g. `SET app.workspace_id = ...`) and policies filter on it. Pairs well with Supabase and is a
   strong interview talking point.

> A Prisma **Client Extension (`$extends`)** can additionally auto-inject the `workspaceId` filter as
> a convenience, but it is a helper — **not** the security boundary. RLS is the real boundary.

### Other security controls
- **AuthZ:** role checks (admin-only routes for invites, deletes) via a `requireRole('ADMIN')` middleware.
- **Validation:** all inputs validated with **zod** before hitting services; a standard error shape is returned (see `07-api-spec.md`).
- **Prompt-injection mitigation:** retrieved document text is clearly delimited; the system prompt
  tells the model to treat document content as data, not instructions; tool calls are validated server-side.
- **File safety:** allow-list of mime types, max size, parsing in the worker (never trust client mime type).
- **Transport:** HTTPS only; CORS restricted to the known web origin with credentials enabled for the refresh cookie.
- See `docs/08-operations.md` for rate limiting, secrets, and data retention.

## 8. Request flow examples

**Upload a document**
```
Client → POST /api/documents (multipart)
       → validate → store file in R2 → create documents row (PROCESSING)
       → enqueue ingestion job → 202 Accepted { documentId }
Worker → process → update status → READY
Client polls GET /api/documents → sees READY
```

**Ask a question**
```
Client → POST /api/conversations/:id/messages { question }
       → embed question → vector search (top-K) → build prompt
       → open SSE → stream LLM tokens → client renders live
       → on finish: persist assistant message + citations + usage
```

## 9. Deployment

```
GitHub → GitHub Actions (lint, typecheck, test, build)
       → deploy API + worker to Render/Railway (Docker)
       → deploy web (static) to Render/Vercel
Supabase hosts Postgres+pgvector; Upstash/Render hosts Redis.
```

Observability: Pino structured logs, Sentry error tracking, `/health` endpoint, per-request token/cost logging.
