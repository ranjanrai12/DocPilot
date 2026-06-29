import type { Request, Response, NextFunction } from 'express';
import * as service from './chat.service.js';
import { ConversationIdParam, ListConversationsQuery } from './chat.schema.js';
import { httpError } from '../../lib/http-error.js';

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId, sub } = req.user!;
    const conversation = await service.createConversation(workspaceId, sub, req.body.title);
    res.status(201).json({ conversation });
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = req.user!;
    const parsed = ListConversationsQuery.safeParse(req.query);
    if (!parsed.success) {
      throw httpError('Invalid query parameters.', 400, 'VALIDATION_ERROR', parsed.error.flatten());
    }
    const { limit, cursor } = parsed.data;
    res.json(await service.listConversations(workspaceId, limit, cursor));
  } catch (err) {
    next(err);
  }
}

export async function get(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = req.user!;
    const parsed = ConversationIdParam.safeParse(req.params);
    if (!parsed.success) throw httpError('Invalid conversation id.', 400, 'VALIDATION_ERROR');
    res.json(await service.getConversation(workspaceId, parsed.data.id));
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = req.user!;
    const parsed = ConversationIdParam.safeParse(req.params);
    if (!parsed.success) throw httpError('Invalid conversation id.', 400, 'VALIDATION_ERROR');
    await service.deleteConversation(workspaceId, parsed.data.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// Phase 3: non-streaming JSON. Phase 4 converts this to SSE token streaming.
export async function ask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = req.user!;
    const parsed = ConversationIdParam.safeParse(req.params);
    if (!parsed.success) throw httpError('Invalid conversation id.', 400, 'VALIDATION_ERROR');
    const result = await service.ask(workspaceId, parsed.data.id, req.body.question);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
