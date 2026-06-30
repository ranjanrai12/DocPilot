import type { Request, Response, NextFunction } from 'express';
import * as service from './members.service.js';
import { MemberIdParam } from './members.schema.js';
import { httpError } from '../../lib/http-error.js';

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = req.user!;
    res.json({ members: await service.listMembers(workspaceId) });
  } catch (err) {
    next(err);
  }
}

export async function invite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = req.user!;
    const result = await service.inviteMember(workspaceId, req.body.email, req.body.role);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function updateRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId, sub } = req.user!;
    const parsed = MemberIdParam.safeParse(req.params);
    if (!parsed.success) throw httpError('Invalid member id.', 400, 'VALIDATION_ERROR');
    const member = await service.updateMemberRole(workspaceId, sub, parsed.data.id, req.body.role);
    res.json({ member });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId, sub } = req.user!;
    const parsed = MemberIdParam.safeParse(req.params);
    if (!parsed.success) throw httpError('Invalid member id.', 400, 'VALIDATION_ERROR');
    await service.removeMember(workspaceId, sub, parsed.data.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
