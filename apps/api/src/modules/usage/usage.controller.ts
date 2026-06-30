import type { Request, Response, NextFunction } from 'express';
import * as service from './usage.service.js';

export async function get(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = req.user!;
    res.json(await service.getUsageSummary(workspaceId));
  } catch (err) {
    next(err);
  }
}
