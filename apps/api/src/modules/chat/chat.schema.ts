import { z } from 'zod';

export const CreateConversationBody = z.object({
  title: z.string().min(1).max(200).optional(),
});

export const AskBody = z.object({
  question: z.string().min(1).max(4000),
});

export const ConversationIdParam = z.object({
  id: z.string().uuid(),
});

export const ListConversationsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
});

export type CreateConversationBody = z.infer<typeof CreateConversationBody>;
export type AskBody = z.infer<typeof AskBody>;
