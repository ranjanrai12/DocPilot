# DocPilot — AI Knowledge Assistant (RAG + Agent)

> **Upload your documents, then chat with them.** DocPilot lets a business feed in its files
> (manuals, policies, product docs, contracts) and gives their team an AI assistant that answers
> questions using **only those documents** — with citations — and can take real actions via
> AI tool-calling.

Think *"ChatGPT, but it only knows your company's documents and never makes things up."*

---

## Status

🟡 **Planning complete — implementation not started.**
This repo currently contains the project documentation. Build begins at **Phase 0** (see the roadmap).

## What this project is for

A **production-grade portfolio project** to demonstrate **AI fullstack** skills (RAG, embeddings,
vector search, AI agents, streaming, auth, multi-tenancy, background jobs, deployment) for a career
move from frontend (Angular) into an AI fullstack role.

## Tech stack (locked)

| Layer | Technology |
|-------|------------|
| Frontend | **React 18 + Vite + TypeScript**, TanStack Query, Tailwind CSS |
| Backend | **Express + Node + TypeScript** |
| Database | **PostgreSQL + pgvector** (via **Supabase** managed DB) |
| ORM | **Prisma** (type-safe DB access) |
| Background jobs | **Redis + BullMQ** (document ingestion) |
| File storage | **Cloudflare R2 / S3** |
| AI | **Anthropic Claude** (or OpenAI) + OpenAI embeddings |
| Deployment | **Render / Railway**, GitHub Actions CI/CD |

## Documentation

| Doc | What's inside |
|-----|---------------|
| [docs/01-project-spec.md](docs/01-project-spec.md) | Product spec — problem, users, features, user journeys |
| [docs/02-architecture.md](docs/02-architecture.md) | System architecture, RAG pipeline, request flows |
| [docs/03-tech-stack.md](docs/03-tech-stack.md) | Every tech choice and *why* (interview-ready rationale) |
| [docs/04-data-model.md](docs/04-data-model.md) | Database tables, relationships, Prisma schema |
| [docs/05-roadmap.md](docs/05-roadmap.md) | Phased build plan with milestones & acceptance criteria |
| [docs/06-learning-guide.md](docs/06-learning-guide.md) | What to learn at each phase (React / Express / DB are new) |
| [docs/07-api-spec.md](docs/07-api-spec.md) | REST endpoints, streaming format, error shape, permissions |
| [docs/08-operations.md](docs/08-operations.md) | Env vars, rate limits, data retention, testing, CI/CD, security checklist |

## Repository layout (planned)

```
docpilot/
├─ docs/                  # ← project documentation (this planning)
├─ apps/
│  ├─ web/                # React + Vite frontend
│  └─ api/                # Express backend
├─ packages/
│  └─ shared/             # Shared TypeScript types (front ↔ back)
├─ docker-compose.yml     # Local Redis (and optional Postgres)
├─ pnpm-workspace.yaml    # Monorepo workspaces
├─ .gitignore
├─ CLAUDE.md              # Guidance for Claude Code
└─ README.md
```

## Quick start

> Not buildable yet — scaffolding is **Phase 1**. See [docs/05-roadmap.md](docs/05-roadmap.md).
