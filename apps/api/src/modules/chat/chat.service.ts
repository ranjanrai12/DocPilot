import type { Conversation, Message, Prisma } from '@prisma/client';
import type {
  Citation,
  ConversationDto,
  MessageDto,
  ConversationListResponse,
  ToolCallRecord,
} from '@docpilot/shared';
import { withWorkspace } from '../../lib/prisma.js';
import { httpError } from '../../lib/http-error.js';

function toConversationDto(c: Conversation): ConversationDto {
  return {
    id: c.id,
    workspaceId: c.workspaceId,
    userId: c.userId,
    title: c.title,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function toMessageDto(m: Message): MessageDto {
  return {
    id: m.id,
    conversationId: m.conversationId,
    role: m.role,
    content: m.content,
    citations: (m.citations as unknown as Citation[] | null) ?? null,
    toolCall: (m.toolCall as unknown as ToolCallRecord | null) ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}

export async function createConversation(
  workspaceId: string,
  userId: string,
  title?: string,
): Promise<ConversationDto> {
  const convo = await withWorkspace(workspaceId, (tx) =>
    tx.conversation.create({
      data: { workspaceId, userId, title: title?.trim() || 'New conversation' },
    }),
  );
  return toConversationDto(convo);
}

export async function listConversations(
  workspaceId: string,
  limit: number,
  cursor?: string,
): Promise<ConversationListResponse> {
  const rows = await withWorkspace(workspaceId, (tx) =>
    tx.conversation.findMany({
      where: { workspaceId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
  );
  let nextCursor: string | null = null;
  if (rows.length > limit) nextCursor = rows.pop()!.id;
  return { items: rows.map(toConversationDto), nextCursor };
}

async function findConversationOrThrow(workspaceId: string, id: string): Promise<Conversation> {
  const convo = await withWorkspace(workspaceId, (tx) =>
    tx.conversation.findFirst({ where: { id, workspaceId } }),
  );
  if (!convo) throw httpError('Conversation not found.', 404, 'NOT_FOUND');
  return convo;
}

export async function getConversation(
  workspaceId: string,
  id: string,
): Promise<{ conversation: ConversationDto; messages: MessageDto[] }> {
  const convo = await findConversationOrThrow(workspaceId, id);
  const messages = await withWorkspace(workspaceId, (tx) =>
    tx.message.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'asc' } }),
  );
  return { conversation: toConversationDto(convo), messages: messages.map(toMessageDto) };
}

export async function deleteConversation(workspaceId: string, id: string): Promise<void> {
  await findConversationOrThrow(workspaceId, id); // 404 if missing/not in workspace
  await withWorkspace(workspaceId, (tx) =>
    tx.conversation.deleteMany({ where: { id, workspaceId } }),
  );
}

// --- RAG retrieval (docs/02 §3B, docs/04 §4) --------------------------------
// Shared with the agent's search_documents tool (modules/agent).

export interface RetrievedChunk {
  id: string;
  content: string;
  documentId: string;
  filename: string;
  metadata: unknown;
  similarity: number;
}

// Tenant-scoped vector search. An UNSCOPED similarity query is a cross-tenant
// leak — always filter by workspaceId (primary control) inside withWorkspace (RLS backstop).
function retrieve(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  queryVector: number[],
  k: number,
): Promise<RetrievedChunk[]> {
  const literal = `[${queryVector.join(',')}]`;
  return tx.$queryRawUnsafe<RetrievedChunk[]>(
    `SELECT c.id, c.content, c."documentId" AS "documentId", d.filename, c.metadata,
            1 - (c.embedding <=> $1::vector) AS similarity
     FROM "Chunk" c
     JOIN "Document" d ON d.id = c."documentId"
     WHERE c."workspaceId" = $2 AND c.embedding IS NOT NULL
     ORDER BY c.embedding <=> $1::vector
     LIMIT $3`,
    literal,
    workspaceId,
    k,
  );
}

// Tenant-scoped vector search in its own short transaction (RLS backstop).
// Used by the agent's search_documents tool.
export function searchWorkspaceChunks(
  workspaceId: string,
  queryVector: number[],
  k: number,
): Promise<RetrievedChunk[]> {
  return withWorkspace(workspaceId, (tx) => retrieve(tx, workspaceId, queryVector, k));
}

export function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// Escape body text so document content can't break out of the <chunk>/<context>
// delimiters (prompt-injection mitigation, docs/02 §7). Escaping `<` neutralizes
// any literal </chunk> or </context> in poisoned document text. `&` first.
export function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

export function pageOf(metadata: unknown): number | undefined {
  if (metadata && typeof metadata === 'object' && 'page' in metadata) {
    const page = (metadata as Record<string, unknown>).page;
    if (typeof page === 'number') return page;
  }
  return undefined;
}

// One citation per source document, built only from chunks actually retrieved.
export function buildCitations(chunks: RetrievedChunk[]): Citation[] {
  const byDoc = new Map<string, Citation>();
  for (const c of chunks) {
    if (byDoc.has(c.documentId)) continue;
    const page = pageOf(c.metadata);
    byDoc.set(c.documentId, {
      documentId: c.documentId,
      filename: c.filename,
      ...(page ? { page } : {}),
    });
  }
  return [...byDoc.values()];
}

// Verify a conversation belongs to the workspace (404 otherwise). Called by the
// controller BEFORE opening the SSE stream so a miss stays a normal JSON error.
// The agent answer flow lives in modules/agent (askAgentStream).
export async function assertConversation(workspaceId: string, id: string): Promise<void> {
  await findConversationOrThrow(workspaceId, id);
}

// Load recent USER/ASSISTANT turns (chronological) for prompt history. TOOL
// turns are omitted — prior assistant answers already capture their outcomes.
export async function loadHistory(
  workspaceId: string,
  conversationId: string,
  limit: number,
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const recent = await withWorkspace(workspaceId, (tx) =>
    tx.message.findMany({
      where: { conversationId, role: { in: ['USER', 'ASSISTANT'] } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
  );
  return recent.reverse().map((m) => ({
    role: m.role === 'ASSISTANT' ? 'assistant' : ('user' as const),
    content: m.content,
  }));
}
