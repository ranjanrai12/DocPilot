import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import * as service from './documents.service.js';
import { ListDocumentsQuery } from './documents.schema.js';
import { storage } from '../../lib/storage.js';
import { isSupportedMime } from '../../jobs/extract.js';
import { getIngestionQueue } from '../../jobs/ingestion.queue.js';
import { isRedisConfigured } from '../../lib/redis.js';
import { httpError } from '../../lib/http-error.js';

export async function upload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = req.user!;
    const file = req.file;
    if (!file) throw httpError('No file uploaded (field name must be "file").', 400, 'VALIDATION_ERROR');
    if (!isSupportedMime(file.mimetype)) {
      throw httpError(`Unsupported file type: ${file.mimetype}.`, 415, 'UNSUPPORTED_MEDIA_TYPE');
    }
    // Ingestion runs through the queue — refuse the upload if Redis isn't set,
    // rather than creating a document that can never be processed.
    if (!isRedisConfigured()) {
      throw httpError('Ingestion is unavailable (REDIS_URL not configured).', 503, 'SERVICE_UNAVAILABLE');
    }

    const safeName = file.originalname.replace(/[^\w.\-]+/g, '_').slice(0, 200);
    const storageKey = `${workspaceId}/${randomUUID()}-${safeName}`;
    await storage.put(storageKey, file.buffer, file.mimetype);

    const document = await service.createDocument(workspaceId, {
      filename: file.originalname,
      mimeType: file.mimetype,
      storageKey,
    });

    await getIngestionQueue().add(
      'ingest',
      { documentId: document.id, workspaceId },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true, removeOnFail: 100 },
    );

    res.status(202).json({ document });
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = req.user!;
    const parsed = ListDocumentsQuery.safeParse(req.query);
    if (!parsed.success) throw httpError('Invalid query parameters.', 400, 'VALIDATION_ERROR');
    const { limit, cursor } = parsed.data;
    res.json(await service.listDocuments(workspaceId, limit, cursor));
  } catch (err) {
    next(err);
  }
}

export async function get(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = req.user!;
    const document = await service.getDocument(workspaceId, req.params.id);
    res.json({ document });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = req.user!;
    await service.deleteDocument(workspaceId, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
