import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import type { UserPublic, UserRole } from '@docpilot/shared';
import { withWorkspace } from '../../lib/prisma.js';
import { httpError } from '../../lib/http-error.js';

const BCRYPT_COST = 12; // matches auth.service

function toUserPublic(u: {
  id: string;
  workspaceId: string;
  email: string;
  role: string;
  createdAt: Date;
}): UserPublic {
  return {
    id: u.id,
    workspaceId: u.workspaceId,
    email: u.email,
    role: u.role as UserRole,
    createdAt: u.createdAt.toISOString(),
  };
}

// Team roster — any authenticated member may view it. Tenant-scoped.
export async function listMembers(workspaceId: string): Promise<UserPublic[]> {
  const users = await withWorkspace(workspaceId, (tx) =>
    tx.user.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' } }),
  );
  return users.map(toUserPublic);
}

// Admin invites a teammate. No email provider is wired in the MVP, so we
// generate a temporary password and return it ONCE for the admin to share
// (the production step is emailing a one-time set-password link). The new user
// is created in the admin's workspace (RLS WITH CHECK enforces the tenant).
export async function inviteMember(
  workspaceId: string,
  email: string,
  role: UserRole,
): Promise<{ user: UserPublic; tempPassword: string }> {
  const tempPassword = randomBytes(12).toString('base64url'); // ~16 chars
  const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_COST);

  try {
    const user = await withWorkspace(workspaceId, (tx) =>
      tx.user.create({ data: { email, passwordHash, workspaceId, role } }),
    );
    return { user: toUserPublic(user), tempPassword };
  } catch (err) {
    // Email is globally unique; a clash (this or another workspace) is a P2002.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw httpError('Email already registered.', 409, 'CONFLICT');
    }
    throw err;
  }
}

// Change a member's role. Guards against demoting the last admin (lockout).
export async function updateMemberRole(
  workspaceId: string,
  targetId: string,
  role: UserRole,
): Promise<UserPublic> {
  return withWorkspace(workspaceId, async (tx) => {
    const target = await tx.user.findFirst({ where: { id: targetId, workspaceId } });
    if (!target) throw httpError('Member not found.', 404, 'NOT_FOUND');

    if (target.role === 'ADMIN' && role === 'MEMBER') {
      const admins = await tx.user.count({ where: { workspaceId, role: 'ADMIN' } });
      if (admins <= 1) throw httpError('Cannot demote the last admin.', 400, 'LAST_ADMIN');
    }

    const updated = await tx.user.update({ where: { id: targetId }, data: { role } });
    return toUserPublic(updated);
  });
}

// Remove a member. Cannot remove yourself (avoids self-lockout; use account
// deletion) or the last admin. The member's conversations are deleted first
// (messages cascade) so the User FK delete succeeds — all tenant-scoped.
export async function removeMember(
  workspaceId: string,
  callerId: string,
  targetId: string,
): Promise<void> {
  if (callerId === targetId) {
    throw httpError('You cannot remove your own account.', 400, 'INVALID_OPERATION');
  }
  await withWorkspace(workspaceId, async (tx) => {
    const target = await tx.user.findFirst({ where: { id: targetId, workspaceId } });
    if (!target) throw httpError('Member not found.', 404, 'NOT_FOUND');

    if (target.role === 'ADMIN') {
      const admins = await tx.user.count({ where: { workspaceId, role: 'ADMIN' } });
      if (admins <= 1) throw httpError('Cannot remove the last admin.', 400, 'LAST_ADMIN');
    }

    await tx.conversation.deleteMany({ where: { userId: targetId, workspaceId } });
    await tx.user.delete({ where: { id: targetId } });
  });
}
