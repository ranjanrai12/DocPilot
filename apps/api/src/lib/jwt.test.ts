import { describe, it, expect } from 'vitest';
import { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken } from './jwt.js';

const payload = { sub: 'user-1', workspaceId: 'ws-1', role: 'ADMIN' };

describe('jwt', () => {
  it('access token round-trips the payload', () => {
    expect(verifyAccessToken(signAccessToken(payload))).toMatchObject(payload);
  });

  it('refresh token round-trips the payload', () => {
    expect(verifyRefreshToken(signRefreshToken(payload))).toMatchObject(payload);
  });

  it('access and refresh secrets are distinct (a refresh token fails access verify)', () => {
    const refresh = signRefreshToken(payload);
    expect(() => verifyAccessToken(refresh)).toThrow();
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken(payload);
    expect(() => verifyAccessToken(`${token}tampered`)).toThrow();
  });
});
