import { randomUUID } from 'node:crypto';
import type { Citation } from '@docpilot/shared';
import type { ZodSchema } from 'zod';
import { embedder, type ToolSpec } from '../../lib/llm.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import {
  searchWorkspaceChunks,
  buildCitations,
  escapeAttr,
  escapeText,
  pageOf,
} from '../chat/chat.service.js';
import { SearchDocumentsInput, EmailSummaryInput, CreateTicketInput } from './agent.schema.js';

// Per-request context handed to every tool. addCitations lets search_documents
// surface the sources it actually used so the final answer can cite them.
export interface ToolContext {
  workspaceId: string;
  addCitations: (cs: Citation[]) => void;
}

export interface ExecutedTool {
  content: string; // text fed back to the model as the tool_result
  result: unknown; // structured result for the UI + persisted toolCall
  isError: boolean;
}

interface AgentTool {
  spec: ToolSpec;
  schema: ZodSchema<unknown>;
  execute: (input: unknown, ctx: ToolContext) => Promise<ExecutedTool>;
}

// --- search_documents: tenant-scoped vector search (real) -------------------
const searchDocuments: AgentTool = {
  spec: {
    name: 'search_documents',
    description:
      "Search the workspace's uploaded documents for passages relevant to a query, " +
      'using semantic (vector) similarity. Call this before answering any question about ' +
      "the user's documents, and ground your answer only on what it returns.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for, in natural language.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  schema: SearchDocumentsInput,
  async execute(input, ctx) {
    const { query } = SearchDocumentsInput.parse(input);
    const { vectors } = await embedder.embed([query]);
    const chunks = await searchWorkspaceChunks(ctx.workspaceId, vectors[0], env.RAG_TOP_K);

    if (chunks.length === 0) {
      return {
        content: 'No matching passages found in the documents.',
        result: { count: 0, matches: [] },
        isError: false,
      };
    }

    // Tagged + escaped so poisoned document text can't break out of the
    // delimiters or be read as instructions (prompt-injection mitigation).
    const content = chunks
      .map((c) => {
        const page = pageOf(c.metadata);
        const pageAttr = page ? ` page="${page}"` : '';
        return `<chunk id="${c.id}" document="${escapeAttr(c.filename)}"${pageAttr}>\n${escapeText(c.content)}\n</chunk>`;
      })
      .join('\n');

    ctx.addCitations(buildCitations(chunks));
    const matches = chunks.map((c) => ({
      documentId: c.documentId,
      filename: c.filename,
      page: pageOf(c.metadata) ?? null,
      similarity: Number(c.similarity.toFixed(4)),
    }));
    return { content, result: { count: chunks.length, matches }, isError: false };
  },
};

// --- email_summary: mocked (logged) action ----------------------------------
const emailSummary: AgentTool = {
  spec: {
    name: 'email_summary',
    description:
      'Email a short summary to a recipient. Use only when the user explicitly asks to ' +
      'email or send a summary to someone.',
    input_schema: {
      type: 'object',
      properties: {
        recipient: { type: 'string', description: 'Recipient email address.' },
        summary: { type: 'string', description: 'The summary text to send.' },
      },
      required: ['recipient', 'summary'],
      additionalProperties: false,
    },
  },
  schema: EmailSummaryInput,
  async execute(input, ctx) {
    const { recipient, summary } = EmailSummaryInput.parse(input);
    // MVP: no email provider wired yet — log the intended action (clearly a
    // mock, not a silent no-op) so the demo is honest and auditable.
    logger.info(
      {
        tool: 'email_summary',
        mock: true,
        workspaceId: ctx.workspaceId,
        recipient,
        chars: summary.length,
      },
      'agent tool (mock): email_summary',
    );
    return {
      content: `Email to ${recipient} has been queued (mock — no email provider is configured).`,
      result: { status: 'queued (mock)', recipient },
      isError: false,
    };
  },
};

// --- create_ticket: mocked (logged) action ----------------------------------
const createTicket: AgentTool = {
  spec: {
    name: 'create_ticket',
    description:
      'Create a support/work ticket from the conversation. Use only when the user explicitly ' +
      'asks to create a ticket.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short ticket title.' },
        description: { type: 'string', description: 'Ticket body / details.' },
      },
      required: ['title', 'description'],
      additionalProperties: false,
    },
  },
  schema: CreateTicketInput,
  async execute(input, ctx) {
    const { title, description } = CreateTicketInput.parse(input);
    const ticketId = `TICKET-${randomUUID().slice(0, 8).toUpperCase()}`;
    logger.info(
      {
        tool: 'create_ticket',
        mock: true,
        workspaceId: ctx.workspaceId,
        ticketId,
        title,
        chars: description.length,
      },
      'agent tool (mock): create_ticket',
    );
    return {
      content: `Created ticket ${ticketId} (mock — no ticketing integration is configured).`,
      result: { status: 'created (mock)', ticketId, title },
      isError: false,
    };
  },
};

const REGISTRY: Record<string, AgentTool> = {
  [searchDocuments.spec.name]: searchDocuments,
  [emailSummary.spec.name]: emailSummary,
  [createTicket.spec.name]: createTicket,
};

/** Tool definitions advertised to the model. */
export function toolSpecs(): ToolSpec[] {
  return Object.values(REGISTRY).map((t) => t.spec);
}

/**
 * Validate + execute one tool call. Unknown tools and invalid arguments are
 * returned as tool errors (isError) rather than thrown, so the model can
 * recover instead of the whole turn failing.
 */
export async function runTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<ExecutedTool> {
  const tool = REGISTRY[name];
  if (!tool) {
    return {
      content: `Unknown tool: ${name}.`,
      result: { error: 'unknown_tool', name },
      isError: true,
    };
  }
  const parsed = tool.schema.safeParse(input);
  if (!parsed.success) {
    return {
      content: `Invalid arguments for ${name}: ${parsed.error.issues.map((i) => i.message).join('; ')}.`,
      result: { error: 'invalid_arguments', issues: parsed.error.flatten() },
      isError: true,
    };
  }
  return tool.execute(input, ctx);
}
