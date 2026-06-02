import type { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service.js';
import { env } from '../../config/env.js';

const REFRESH_COOKIE = 'refreshToken';

const cookieOpts = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: '/api/auth',
};

export async function signup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { user, accessToken, refreshToken } = await authService.signup(req.body);
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts);
    res.status(201).json({ user, accessToken });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { user, accessToken, refreshToken } = await authService.login(req.body);
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts);
    res.status(200).json({ user, accessToken });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Missing refresh token.' } });
      return;
    }
    const result = await authService.refresh(token);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie(REFRESH_COOKIE, { ...cookieOpts, maxAge: 0 });
  res.status(204).send();
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.getMe(req.user!.sub);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
