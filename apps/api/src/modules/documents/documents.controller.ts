import type { Request, Response, NextFunction } from 'express';
import * as service from './documents.service.js';
import { ListDocumentsQuery, DocumentIdParam } from './documents.schema.js';
import { isSupportedMime } from '../../jobs/extract.js';
import { isRedisConfigured } from '../../lib/redis.js';
import { httpError } from '../../lib/http-error.js';

export async function upload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = req.user!;
    const file = req.file;
    if (!file)
      throw httpError('No file uploaded (field name must be "file").', 400, 'VALIDATION_ERROR');
    if (!isSupportedMime(file.mimetype)) {
      throw httpError(`Unsupported file type: ${file.mimetype}.`, 415, 'UNSUPPORTED_MEDIA_TYPE');
    }
    // Ingestion runs through the queue — refuse the upload if Redis isn't set.
    if (!isRedisConfigured()) {
      throw httpError(
        'Ingestion is unavailable (REDIS_URL not configured).',
        503,
        'SERVICE_UNAVAILABLE',
      );
    }

    const document = await service.uploadDocument(workspaceId, file);
    res.status(202).json({ document });
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = req.user!;
    const parsed = ListDocumentsQuery.safeParse(req.query);
    if (!parsed.success) {
      throw httpError('Invalid query parameters.', 400, 'VALIDATION_ERROR', parsed.error.flatten());
    }
    const { limit, cursor } = parsed.data;
    res.json(await service.listDocuments(workspaceId, limit, cursor));
  } catch (err) {
    next(err);
  }
}

export async function get(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = req.user!;
    const parsed = DocumentIdParam.safeParse(req.params);
    if (!parsed.success)
      throw httpError('Invalid document id.', 400, 'VALIDATION_ERROR', parsed.error.flatten());
    res.json({ document: await service.getDocument(workspaceId, parsed.data.id) });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = req.user!;
    const parsed = DocumentIdParam.safeParse(req.params);
    if (!parsed.success)
      throw httpError('Invalid document id.', 400, 'VALIDATION_ERROR', parsed.error.flatten());
    await service.deleteDocument(workspaceId, parsed.data.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
