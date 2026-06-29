import { z } from 'zod';

// Server-side validation for every tool's arguments (agent-tools skill: never
// pass model output straight into a side effect). Mirrors the JSON schemas the
// model sees in agent.tools.ts.

export const SearchDocumentsInput = z.object({
  query: z.string().min(1).max(1000),
});

export const EmailSummaryInput = z.object({
  recipient: z.string().email(),
  summary: z.string().min(1).max(8000),
});

export const CreateTicketInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(8000),
});

export type SearchDocumentsInput = z.infer<typeof SearchDocumentsInput>;
export type EmailSummaryInput = z.infer<typeof EmailSummaryInput>;
export type CreateTicketInput = z.infer<typeof CreateTicketInput>;
