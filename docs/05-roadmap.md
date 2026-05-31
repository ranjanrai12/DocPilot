# 05 — Build Roadmap

Build in **layers**. Each phase produces something that *works* before the next begins, so you're
never building everything at once and you always have something to demo.

Estimated ~8 weeks part-time. Adjust freely — the *order* matters more than the dates.

---

## Phase 0 — Foundations & accounts (½ week)
**Goal:** tools installed, services created, repo scaffolded.

- [ ] Install Node 20 LTS, Git, a code editor.
- [ ] Create accounts: Supabase (Postgres+pgvector), an LLM provider (Anthropic/OpenAI), Cloudflare R2 or AWS S3, Upstash/Render (Redis).
- [ ] Scaffold monorepo: `apps/web` (React+Vite+TS), `apps/api` (Express+TS), `packages/shared`.
- [ ] `docker-compose.yml` for local Redis.
- [ ] Base config: env loading + validation, linting, formatting, `tsconfig`.

**Done when:** `web` and `api` both start locally and a `/health` route returns OK.

---

## Phase 1 — App skeleton + database (1 week)
**Goal:** auth + database working end to end.

- [ ] Connect Prisma to Supabase; define schema (Workspace, User); run first migration.
- [ ] Signup (creates workspace + admin user, hashes password), login, logout, session/JWT.
- [ ] Auth middleware + tenant-scoping middleware.
- [ ] React: login/signup pages, auth state, protected routes.
- [ ] Wire TanStack Query to call the API.

**Done when:** you can sign up, log in, and hit a protected endpoint scoped to your workspace.
**Demoable:** ✅ working auth.

---

## Phase 2 — Document upload + ingestion (1.5 weeks)
**Goal:** documents get uploaded and processed in the background.

- [ ] File upload endpoint (multipart, validation, type/size limits) → store in R2/S3.
- [ ] `Document` + `Chunk` models; pgvector migration (enable extension, add `embedding` column + index).
- [ ] BullMQ queue + worker.
- [ ] Ingestion processor: extract text → chunk → embed → insert chunks → set status.
- [ ] React: dashboard with upload UI + document list + status (polling).

**Done when:** uploading a PDF results in chunks with embeddings in the DB and status = READY.
**Demoable:** ✅ upload + processing pipeline.

---

## Phase 3 — Basic RAG chat (1 week)
**Goal:** ask a question, get an answer from your documents (non-streaming first).

- [ ] `Conversation` + `Message` models.
- [ ] Query flow: embed question → vector search (top-K, tenant-scoped) → build prompt → LLM call.
- [ ] System prompt enforcing "answer only from context; otherwise say you don't know".
- [ ] React: basic chat page (send question, render answer).

**Done when:** a real question returns a correct answer grounded in an uploaded document.
**Demoable:** ✅ this is the core of the product working.

---

## Phase 4 — Streaming + citations (1 week)
**Goal:** make it feel real.

- [ ] Convert chat endpoint to **SSE streaming**; stream tokens from the LLM.
- [ ] React: render tokens incrementally; **stop** button (AbortController).
- [ ] Return + display **citations** (source document + page/section).
- [ ] Save messages; conversation history sidebar.

**Done when:** answers stream word-by-word with visible, accurate citations, and history persists.
**Demoable:** ✅ looks and feels like a polished AI product.

---

## Phase 5 — Agentic tool-calling (1 week)
**Goal:** the "wow" — the AI takes actions.

- [ ] Define tool schemas: `search_documents`, `email_summary`, `create_ticket`.
- [ ] Implement the tool-calling loop (LLM → tool call → execute → result → final answer).
- [ ] Execute tools (email/ticket can be mocked/logged in MVP).
- [ ] React: render tool calls + results in the conversation.

**Done when:** asking the assistant to "email a summary" triggers a real tool call shown in the UI.
**Demoable:** ✅ agentic behavior — a standout interview talking point.

---

## Phase 6 — Production hardening (1 week)
**Goal:** make it production-grade, not a demo.

- [ ] Rate limiting + per-workspace usage/cost tracking (UsageEvent).
- [ ] Role-based access (admin invite/delete routes), team invite flow.
- [ ] Security pass: input validation everywhere, prompt-injection mitigation, file safety.
- [ ] Error handling + structured logging (Pino) + Sentry + `/health`.
- [ ] Tests: unit (RAG/auth services) + one e2e (signup → upload → ask).
- [ ] CI/CD (GitHub Actions): lint, typecheck, test, build, deploy.
- [ ] Deploy live (API + worker + web + DB + Redis); add a public demo URL.
- [ ] Finalize README with architecture diagram + design decisions.

**Done when:** a stranger can visit the URL and complete the full journey; CI is green.
**Demoable:** ✅ a deployed, documented, tested product.

---

## Milestones (talking points unlocked)
| Milestone | You can now say in interviews... |
|-----------|----------------------------------|
| End P1 | "Multi-tenant auth with isolated data per customer" |
| End P2 | "Background ingestion pipeline with a job queue; embeddings in pgvector" |
| End P3 | "Implemented RAG end to end — chunking, embeddings, vector search" |
| End P4 | "Streaming AI responses over SSE with citations and cancellation" |
| End P5 | "AI agent tool-calling so the model takes real actions" |
| End P6 | "Deployed with CI/CD, rate limiting, logging, error tracking, tests" |

## Definition of Done (whole project)
A deployed, multi-tenant RAG + agent SaaS with streaming chat and citations, background document
ingestion, auth, observability, tests, and CI/CD — with documentation explaining every decision.

## Suggested working rhythm
- One phase at a time; don't start the next until the current one *works*.
- Commit per meaningful step; open a PR per phase (good portfolio hygiene).
- Keep a short `DECISIONS.md` note when you make a non-obvious choice (great interview fuel).
