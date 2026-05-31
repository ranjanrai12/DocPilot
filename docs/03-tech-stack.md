# 03 — Tech Stack & Decisions

Each choice below includes the *why* — phrased so it doubles as interview prep.

## Summary table

| Concern | Choice | One-line rationale |
|---------|--------|--------------------|
| Frontend framework | React 18 + Vite | Highest market demand; broadens an Angular background |
| Language (front & back) | TypeScript | One language end-to-end; shared types; type safety |
| Server state | TanStack Query | Caching/refetching without hand-rolled state |
| Styling | Tailwind CSS (+ optional shadcn/ui) | Fast, consistent UI without bikeshedding CSS |
| Backend framework | Express + Node | Most-used Node framework; lean; transparent fundamentals |
| Validation | zod | Runtime validation + inferred TS types |
| ORM | Prisma | Type-safe DB access; readable schema; easy migrations |
| Database | PostgreSQL + pgvector | Relational + vector search in one DB |
| DB hosting | Supabase | Managed Postgres with pgvector built in; no local DB ops |
| Queue/cache | Redis + BullMQ | Background ingestion jobs; rate-limit counters |
| File storage | Cloudflare R2 / S3 | Object storage for raw files |
| LLM | Anthropic Claude (or OpenAI) | Strong streaming + tool-calling support |
| Embeddings | OpenAI text-embedding-3-small | Cheap, high quality |
| Auth | JWT (access + refresh) + bcrypt | Stateless API; SPA & API on different origins (see architecture §6) |
| Monorepo | pnpm workspaces (+ optional Turborepo) | Share the `packages/shared` types package across apps |
| Deploy | Render / Railway + GitHub Actions | Simple container deploys + CI/CD |
| Observability | Pino + Sentry | Structured logs + error tracking |

## Decision details

### Frontend: React + Vite (not Angular)
- React has the largest frontend job demand; pairing it with existing Angular experience signals
  framework-agnostic frontend skill.
- Vite for instant dev server and fast builds.
- TanStack Query removes most manual loading/error/caching state code.

### Backend: Express (not NestJS)
- Express is the most widely used Node framework and keeps the surface area small while learning
  React and databases at the same time.
- We impose **structure manually** (routes → controllers → services, middleware, typed config) so
  it stays production-shaped rather than tutorial-level.
- Interview answer: *"I chose Express for a lean, transparent backend and wired auth/validation
  myself; I'm also comfortable with NestJS."*

### Why TypeScript everywhere (not Python)
- "AI fullstack" = building AI-powered apps; the needed AI work (LLM calls, RAG, embeddings,
  tool-calling, streaming) is fully supported in TS (official Anthropic/OpenAI SDKs, pgvector).
- One language across the stack → shared types, simpler tooling, a coherent story.
- Python remains the choice for ML/model/data work; can be added later as a small FastAPI service
  if a target role requires it.

### Database: PostgreSQL + pgvector via Supabase + Prisma
- **pgvector** lets one Postgres handle both normal tables and vector similarity search — fewer
  moving parts than running a separate vector database (Pinecone/Qdrant) at this scale.
- **Supabase** provides managed Postgres with pgvector enabled — no local DB installation or admin.
- **Prisma** turns DB access into type-safe TypeScript (`prisma.user.findMany(...)`), which is
  approachable for someone new to databases; raw SQL is used only for the vector-search query.

### Queue: Redis + BullMQ
- Document ingestion (parse + embed) is too slow to run inside an HTTP request → it must be a
  background job. BullMQ on Redis is the standard Node solution and also powers rate limiting.

### LLM + embeddings
- Anthropic Claude (or OpenAI) for chat — both support streaming and tool-calling.
- A small, cheap embeddings model keeps ingestion costs low.
- The LLM client is abstracted behind one module so the provider can be swapped.

## Versions / baseline

> **Verify the latest stable major at scaffold time** (these move fast). As of 2026, prefer the
> current majors below; only pin older ones if a dependency forces it.

- Node 20 LTS (or 22 LTS), TypeScript 5.x
- React 19, Vite 6
- Express 5 (stable), zod 3
- Prisma 6, PostgreSQL 15+ (Supabase), pgvector
- BullMQ 5, Redis 7
- pnpm 9 (workspaces)

**Auth detail:** access JWT ~15 min held in memory; refresh token ~7 days in an httpOnly+Secure
SameSite cookie; `POST /api/auth/refresh` rotates the access token. bcrypt cost ≥ 12. See
architecture §6.
