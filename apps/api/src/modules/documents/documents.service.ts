import { randomUUID } from 'node:crypto';
import type { Document } from '@prisma/client';
import type { DocumentDto, DocumentListResponse } from '@docpilot/shared';
import { withWorkspace } from '../../lib/prisma.js';
import { storage } from '../../lib/storage.js';
import { getIngestionQueue } from '../../jobs/ingestion.queue.js';
import { httpError } from '../../lib/http-error.js';

export interface NewDocument {
  filename: string;
  mimeType: string;
  storageKey: string;
}

// Map the DB row to the public DTO — omits the internal storageKey.
export function toDto(doc: Document): DocumentDto {
  return {
    id: doc.id,
    workspaceId: doc.workspaceId,
    filename: doc.filename,
    mimeType: doc.mimeType,
    status: doc.status,
    error: doc.error,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function createDocument(
  workspaceId: string,
  input: NewDocument,
): Promise<DocumentDto> {
  const doc = await withWorkspace(workspaceId, (tx) =>
    tx.document.create({
      data: {
        workspaceId,
        filename: input.filename,
        mimeType: input.mimeType,
        storageKey: input.storageKey,
        status: 'PROCESSING',
      },
    }),
  );
  return toDto(doc);
}

// Orchestrates an upload: store the object → create the row → enqueue ingestion.
// Compensates on partial failure so we never leak a storage object or strand a
// document in PROCESSING with no job to ever process it.
export async function uploadDocument(
  workspaceId: string,
  file: { originalname: string; mimetype: string; buffer: Buffer },
): Promise<DocumentDto> {
  const safeName = file.originalname.replace(/[^\w.\-]+/g, '_').slice(0, 200);
  const storageKey = `${workspaceId}/${randomUUID()}-${safeName}`;
  await storage.put(storageKey, file.buffer, file.mimetype);

  let document: DocumentDto;
  try {
    document = await createDocument(workspaceId, {
      filename: file.originalname,
      mimeType: file.mimetype,
      storageKey,
    });
  } catch (err) {
    await storage.delete(storageKey).catch(() => {}); // don't leak the stored object
    throw err;
  }

  try {
    await getIngestionQueue().add(
      'ingest',
      { documentId: document.id, workspaceId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  } catch {
    // Enqueue failed — mark FAILED so it isn't stuck in PROCESSING forever.
    await withWorkspace(workspaceId, (tx) =>
      tx.document.updateMany({
        where: { id: document.id, workspaceId },
        data: { status: 'FAILED', error: 'Could not start ingestion.' },
      }),
    ).catch(() => {});
    throw httpError(
      'Could not start document ingestion. Please try again.',
      503,
      'SERVICE_UNAVAILABLE',
    );
  }

  return document;
}

export async function listDocuments(
  workspaceId: string,
  limit: number,
  cursor?: string,
): Promise<DocumentListResponse> {
  const rows = await withWorkspace(workspaceId, (tx) =>
    tx.document.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1, // fetch one extra to detect another page
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
  );

  let nextCursor: string | null = null;
  if (rows.length > limit) {
    nextCursor = rows.pop()!.id;
  }
  return { items: rows.map(toDto), nextCursor };
}

// Scope by id AND workspaceId; missing → 404 (not 403), so existence isn't leaked.
async function findOrThrow(workspaceId: string, id: string): Promise<Document> {
  const doc = await withWorkspace(workspaceId, (tx) =>
    tx.document.findFirst({ where: { id, workspaceId } }),
  );
  if (!doc) throw httpError('Document not found.', 404, 'NOT_FOUND');
  return doc;
}

export async function getDocument(workspaceId: string, id: string): Promise<DocumentDto> {
  return toDto(await findOrThrow(workspaceId, id));
}

export async function deleteDocument(workspaceId: string, id: string): Promise<void> {
  const doc = await findOrThrow(workspaceId, id);
  // DB cascade removes Chunk rows, but NOT the storage object — delete it explicitly
  // (CLAUDE.md / docs/08 §4). Ignore a missing object so delete stays idempotent.
  await storage.delete(doc.storageKey).catch(() => {});
  // Self-contained write: scoped by id AND workspaceId (not by-id-only).
  await withWorkspace(workspaceId, (tx) => tx.document.deleteMany({ where: { id, workspaceId } }));
}
