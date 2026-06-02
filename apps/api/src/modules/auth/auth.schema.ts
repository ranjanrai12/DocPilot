import { z } from 'zod';

export const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  workspaceName: z.string().min(1, 'Workspace name is required'),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type SignupBody = z.infer<typeof SignupSchema>;
export type LoginBody = z.infer<typeof LoginSchema>;
