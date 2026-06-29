-- pgvector: enable the extension, add the embedding column + ANN index.
--
-- Prisma can't model the `vector` type, so this is raw SQL (see prisma-migration
-- skill). On Supabase the extension lives in the `extensions` schema, so the type
-- and operator class are referenced as `extensions.vector` / `extensions.vector_cosine_ops`.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

ALTER TABLE "Chunk" ADD COLUMN "embedding" extensions.vector(1536);

-- HNSW index with cosine ops, matching the `<=>` similarity query used by RAG
-- retrieval (docs/04 §4). Without an index, similarity search sequential-scans.
CREATE INDEX "Chunk_embedding_idx"
  ON "Chunk" USING hnsw ("embedding" extensions.vector_cosine_ops);
