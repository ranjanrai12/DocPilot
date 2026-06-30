import bcrypt from 'bcryptjs';
import { bypassRls, withWorkspace } from '../../lib/prisma.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt.js';
import type { SignupBody, LoginBody } from './auth.schema.js';

const BCRYPT_COST = 12;

// Compared against when the email doesn't exist, so /login takes ~the same time
// whether or not the account is real (mitigates timing-based user enumeration).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('invalid-placeholder-password', BCRYPT_COST);

function toPublicUser(user: { id: string; workspaceId: string; email: string; role: string; createdAt: Date }) {
  return { id: user.id, workspaceId: user.workspaceId, email: user.email, role: user.role, createdAt: user.createdAt };
}

function makeTokens(user: { id: string; workspaceId: string; role: string }) {
  const payload = { sub: user.id, workspaceId: user.workspaceId, role: user.role };
  return { accessToken: signAccessToken(payload), refreshToken: signRefreshToken(payload) };
}

export async function signup(body: SignupBody) {
  // Hash before opening the transaction so we don't hold it during the (slow) bcrypt work.
  const passwordHash = await bcrypt.hash(body.password, BCRYPT_COST);

  // Auth is the trusted pre-tenant boundary: it must look up users across all
  // workspaces, so it runs under bypassRls. Creating the workspace + admin user
  // together is atomic inside the one transaction.
  const user = await bypassRls(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email: body.email } });
    if (existing) {
      const err = new Error('Email already registered.') as Error & { status: number; code: string };
      err.status = 409;
      err.code = 'CONFLICT';
      throw err;
    }

    const workspace = await tx.workspace.create({ data: { name: body.workspaceName } });
    return tx.user.create({
      data: { email: body.email, passwordHash, workspaceId: workspace.id, role: 'ADMIN' },
    });
  });

  return { user: toPublicUser(user), ...makeTokens(user) };
}

export async function login(body: LoginBody) {
  const user = await bypassRls((tx) => tx.user.findUnique({ where: { email: body.email } }));
  // Always run a compare (dummy hash when the user is absent) to equalize timing.
  const valid = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

  if (!user || !valid) {
    const err = new Error('Invalid email or password.') as Error & { status: number; code: string };
    err.status = 401;
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  return { user: toPublicUser(user), ...makeTokens(user) };
}

export async function refresh(refreshToken: string) {
  const payload = verifyRefreshToken(refreshToken);
  const user = await bypassRls((tx) => tx.user.findUnique({ where: { id: payload.sub } }));

  if (!user) {
    const err = new Error('User not found.') as Error & { status: number; code: string };
    err.status = 401;
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  const accessToken = signAccessToken({ sub: user.id, workspaceId: user.workspaceId, role: user.role });
  return { accessToken };
}

export async function getMe(userId: string, workspaceId: string) {
  // Post-auth (workspace is known): scope to the workspace via RLS, not bypass.
  const user = await withWorkspace(workspaceId, (tx) =>
    tx.user.findFirst({ where: { id: userId, workspaceId } }),
  );
  if (!user) {
    const err = new Error('User not found.') as Error & { status: number; code: string };
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }
  return { user: toPublicUser(user) };
}
