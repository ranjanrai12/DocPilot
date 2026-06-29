import { randomUUID } from 'node:crypto';
import { withWorkspace } from '../lib/prisma.js';
import { storage } from '../lib/storage.js';
import { embedder } from '../lib/llm.js';
import { extractText } from './extract.js';
import { chunkText } from './chunk.js';
import type { IngestionJobData } from './ingestion.queue.js';

const EMBED_BATCH = 96;

// Ingestion pipeline (docs/02 §3A): download → extract → chunk → embed → insert
// chunks → set status. Runs in the BullMQ worker, never inline in a request.
// Safe to re-run (idempotent): prior chunks are cleared before inserting, and a
// document already READY is skipped — so a job retry won't duplicate data.
export async function processIngestion(data: IngestionJobData): Promise<void> {
  const { documentId, workspaceId } = data;

  const doc = await withWorkspace(workspaceId, (tx) =>
    tx.document.findFirst({ where: { id: documentId, workspaceId } }),
  );
  if (!doc) throw new Error(`Document ${documentId} not found in workspace ${workspaceId}.`);
  if (doc.status === 'READY') return;

  try {
    const buffer = await storage.get(doc.storageKey);
    const text = await extractText(buffer, doc.mimeType);
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error('No extractable text in document.');

    // Embed in batches (provider input limits).
    const vectors: number[][] = [];
    let tokens = 0;
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const slice = chunks.slice(i, i + EMBED_BATCH).map((c) => c.content);
      const result = await embedder.embed(slice);
      vectors.push(...result.vectors);
      tokens += result.tokens;
    }

    await withWorkspace(workspaceId, async (tx) => {
      // Idempotency: clear any prior chunks for this document.
      await tx.chunk.deleteMany({ where: { documentId, workspaceId } });

      // pgvector column can't be bound via the Prisma model, so insert raw. The
      // GUC app.workspace_id is set by withWorkspace, so RLS WITH CHECK passes.
      for (let i = 0; i < chunks.length; i++) {
        const id = randomUUID();
        const vectorLiteral = `[${vectors[i].join(',')}]`;
        await tx.$executeRaw`
          INSERT INTO "Chunk" (id, "documentId", "workspaceId", content, metadata, embedding, "createdAt")
          VALUES (
            ${id}, ${documentId}, ${workspaceId}, ${chunks[i].content},
            ${JSON.stringify(chunks[i].metadata)}::jsonb, ${vectorLiteral}::vector, now()
          )
        `;
      }

      await tx.document.update({
        where: { id: documentId },
        data: { status: 'READY', error: null },
      });

      // Cost/usage accounting hook (full reporting lands in Phase 6).
      await tx.usageEvent.create({
        data: { workspaceId, kind: 'EMBEDDING', tokensIn: tokens, tokensOut: 0, costUsd: 0 },
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ingestion failed.';
    // Never leave a document stuck in PROCESSING.
    await withWorkspace(workspaceId, (tx) =>
      tx.document.update({ where: { id: documentId }, data: { status: 'FAILED', error: message } }),
    ).catch(() => {});
    throw err; // surface to BullMQ for retry/visibility
  }
}
