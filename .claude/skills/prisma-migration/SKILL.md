---
name: prisma-migration
description: >-
  The safe workflow for changing the database in DocPilot — editing the Prisma schema, generating a
  migration, and handling the pgvector embedding column (which Prisma can't model, so it's raw SQL).
  Use whenever you need to add/alter a table or column, run the first migration, enable pgvector, or
  add the vector index. Covers dev vs. deploy, schema↔migration parity, and the storage-deletion gap.
---

# Prisma migrations (DocPilot)

Database is PostgreSQL + pgvector on Supabase, via Prisma. Schema lives at
`apps/api/prisma/schema.prisma`; migrations at `apps/api/prisma/migrations/`. Migrations are
**immutable history** — never edit an applied migration; make a new one.

## Standard change workflow

1. Edit `schema.prisma`. For any **tenant-owned** table, include `workspaceId String` and an index that
   supports scoped queries (`@@index([workspaceId])`, or composite like `@@index([workspaceId, createdAt])`).
2. Generate + apply the migration in dev:
   ```
   pnpm --filter api prisma migrate dev --name <short_snake_case_name>
   ```
   This writes a new `migrations/<timestamp>_<name>/migration.sql` and regenerates the client.
3. If you only changed the client surface (not the DB): `pnpm --filter api prisma generate`.
4. Typecheck: `pnpm --filter api typecheck`.
5. In CI/production, apply with `prisma migrate deploy` (never `migrate dev`, never `db push` against
   a real DB). `db push` is fine only for throwaway local experiments — it skips migration history.

Cascade rules (docs/04 §5): Document → Chunk and Conversation → Message **cascade**; references that
must not orphan data (Workspace, User) use `RESTRICT`. Keep the Prisma `onDelete` and the generated
SQL `ON DELETE` consistent.

## pgvector — the special case (Phase 2)

Prisma has no native `vector` type, so the `embedding vector(1536)` column on `Chunk` is added with
**raw SQL inside a migration**, not in the schema (docs/02 §3, docs/04 §3). Keep the column commented
out in the schema (`// embedding Unsupported("vector(1536)")`) as documentation.

Create an empty migration and write the SQL yourself:
```
pnpm --filter api prisma migrate dev --create-only --name add_pgvector_embeddings
```
Then edit the generated `migration.sql`:
```sql
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "Chunk" ADD COLUMN "embedding" vector(1536);

-- ANN index for fast similarity search; cosine ops to match the <=> query in docs/04 §4
CREATE INDEX "Chunk_embedding_idx" ON "Chunk"
  USING hnsw ("embedding" vector_cosine_ops);
```
Apply with `prisma migrate dev`. A vector column **without** an index is a finding — similarity search
will sequential-scan. Always keep retrieval tenant-scoped (`WHERE "workspaceId" = $2`, see the
`rag-chat` skill).

## Gotchas

- **Dimension must match the embeddings model** (1536 here). Changing models means a new migration +
  re-embedding existing chunks.
- **Schema ↔ migration parity:** every schema change needs a corresponding migration; don't hand-edit
  the DB out of band.
- **Storage isn't cascaded:** deleting a `Document` cascades to its `Chunk` rows in the DB, but the
  R2/S3 object must be deleted separately in the service (CLAUDE.md). A DB cascade alone leaks storage.
- Keep `apps/api/.env.example` in sync — `DATABASE_URL` must be present for any prisma command to run.

After a schema/migration change, run the **prisma-guardian** agent to verify tenancy columns, cascade
semantics, and the vector index.
