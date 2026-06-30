import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type TokenPayload } from '../lib/jwt.js';

// Augment Express Request so downstream code gets typed req.user.
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

// Extracts and verifies the Bearer token. Attaches the decoded payload as
// req.user. Returns 401 on missing/invalid/expired token.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Missing access token.' } });
    return;
  }

  const token = header.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    res
      .status(401)
      .json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired access token.' } });
  }
}

// Checks that req.user.role === 'ADMIN'. Must run after requireAuth.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin access required.' } });
    return;
  }
  next();
}
