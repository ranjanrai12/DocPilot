import { z } from 'zod';

// Query params for GET /api/documents (cursor pagination, docs/07).
export const ListDocumentsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
});

export type ListDocumentsQuery = z.infer<typeof ListDocumentsQuery>;
