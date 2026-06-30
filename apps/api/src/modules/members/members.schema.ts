import { z } from 'zod';

export const InviteMemberBody = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
});

export const UpdateRoleBody = z.object({
  role: z.enum(['ADMIN', 'MEMBER']),
});

export const MemberIdParam = z.object({
  id: z.string().uuid(),
});

export type InviteMemberBody = z.infer<typeof InviteMemberBody>;
export type UpdateRoleBody = z.infer<typeof UpdateRoleBody>;
