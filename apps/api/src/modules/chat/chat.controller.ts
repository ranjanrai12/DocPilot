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

// Phase 4: streams the answer over SSE (text/event-stream). The conversation is
// verified first so 400/404 stay normal JSON errors before the stream opens;
// once streaming, errors are delivered in-band as `error` events.
export async function ask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = req.user!;
    const parsed = ConversationIdParam.safeParse(req.params);
    if (!parsed.success) throw httpError('Invalid conversation id.', 400, 'VALIDATION_ERROR');
    await service.assertConversation(workspaceId, parsed.data.id); // 404 here -> JSON

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering
    res.flushHeaders();
    res.on('error', () => {}); // swallow EPIPE/ECONNRESET on an abruptly closed socket

    // Abort the upstream LLM call if the client disconnects / hits Stop.
    const controller = new AbortController();
    req.on('close', () => controller.abort());

    const send = (event: unknown) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    // Keep-alive comment frames (ignored by the SSE parser) so proxies don't
    // drop the connection during a slow first token or long inter-token gaps.
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, 15000);

    try {
      const { message, citations, usage } = await service.askStream(
        workspaceId,
        parsed.data.id,
        req.body.question,
        { onToken: (value) => send({ type: 'token', value }), signal: controller.signal },
      );
      send({ type: 'done', messageId: message.id, citations, usage });
    } catch (streamErr) {
      if (!controller.signal.aborted) {
        console.error('[chat] stream failed:', streamErr instanceof Error ? streamErr.message : streamErr);
        send({ type: 'error', message: 'Failed to generate the answer.' });
      }
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  } catch (err) {
    next(err); // pre-stream errors (400/404) -> standard JSON error shape
  }
}
