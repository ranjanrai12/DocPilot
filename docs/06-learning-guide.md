# 06 — Learning Guide

You're strong in TypeScript/Angular but **React, Express, and databases are new**. This maps what
to learn **just in time** for each phase — learn only what each step needs, not everything upfront.

## Your starting strengths (these transfer)
- TypeScript fluency → applies everywhere.
- Component thinking, services, dependency injection (Angular) → React components & hooks, Express services.
- HTTP/REST, RxJS observables → understanding async, streaming, and data flow.

## Mindset
Don't try to "learn React + Express + Postgres" as courses first. Build a phase, and learn the
3–5 concepts that phase needs. You'll retain far more.

---

## What to learn per phase

### Phase 0–1: React basics + Express basics + DB basics
**React (coming from Angular):**
- Components & JSX (vs Angular templates)
- `useState` (≈ component state) and `useEffect` (≈ lifecycle)
- Props (≈ `@Input`), lifting state up
- React Router (≈ Angular Router)
- TanStack Query: `useQuery` / `useMutation` (replaces most manual HTTP+state code)

**Express:**
- App, routes, `req`/`res`, `next`
- Middleware (how it chains) — auth, validation, errors
- A clean layout: routes → controllers → services

**Database / Prisma:**
- Tables ≈ types, rows ≈ objects, relations ≈ references by id
- Prisma schema syntax; `migrate` (creates tables from schema)
- The 5 methods you'll use most: `create`, `findUnique`, `findMany`, `update`, `delete`
- What a foreign key and a unique constraint are

**Auth concepts:** password hashing (bcrypt), sessions vs JWT, why never store plain passwords.

### Phase 2: files, queues, embeddings
- Multipart file upload; object storage (R2/S3) keys
- What a **job queue** is and why slow work runs in the background (BullMQ basics)
- **Embeddings**: text → vector capturing meaning; why we store them
- **pgvector**: a Postgres extension adding a `vector` column + similarity search

### Phase 3: RAG fundamentals
- **RAG** = Retrieval-Augmented Generation: retrieve relevant chunks, then ask the LLM using them
- **Chunking**: why split documents, chunk size & overlap trade-offs
- **Vector / similarity search**: cosine distance, top-K
- **Prompt design**: system prompt, grounding, "answer only from context"

### Phase 4: streaming
- **Server-Sent Events (SSE)**: one-way token stream from server to browser
- Consuming a stream on the client; rendering incrementally
- **AbortController** to cancel an in-flight request
- **Citations**: tracking which chunk produced which answer

### Phase 5: AI agents
- **Tool/function calling**: giving the LLM callable functions
- The tool-calling loop: model → tool call → execute → result → final answer
- Designing safe tool schemas

### Phase 6: production skills
- Rate limiting; token/cost accounting
- Role-based authorization
- Structured logging (Pino), error tracking (Sentry), health checks
- Testing: unit vs e2e (Vitest/Jest + Supertest)
- CI/CD with GitHub Actions; deploying containers
- Prompt-injection awareness & input validation

---

## Recommended reference docs (use as needed, don't pre-read cover to cover)
- React: official react.dev "Learn" guide
- TanStack Query docs (quick start)
- Express: official guide (routing, middleware)
- Prisma: "Get started" + "CRUD" pages
- pgvector: project README
- Your LLM provider's docs: streaming + tool-calling sections
- BullMQ: quick start

## How we'll work together
For each phase I will:
1. Explain the concepts in plain terms (with Angular analogies where useful).
2. Scaffold/write the code with comments.
3. Point out the *why* behind decisions (so you can explain them in interviews).
4. Give you small things to try yourself to lock in the learning.

## Tip: keep an interview journal
As you build, jot one line per non-obvious decision (e.g. "chose IVFFlat index because…"). By the
end you'll have a ready set of confident, specific interview answers — the thing that separates
"I followed a tutorial" from "I built this."
