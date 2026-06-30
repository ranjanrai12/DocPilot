/** Response shape of GET /api/health. `degraded` (HTTP 503) means a critical
 *  dependency (the database) is unreachable. */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: 'up' | 'down' | 'unknown';
  redis: 'up' | 'down' | 'unknown';
}

/** Standard API error shape (see docs/07-api-spec.md). */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type UserRole = 'ADMIN' | 'MEMBER';

export interface UserPublic {
  id: string;
  workspaceId: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface AuthResponse {
  user: UserPublic;
  accessToken: string;
}

export interface RefreshResponse {
  accessToken: string;
}

/** GET /api/members — workspace team roster (admin + members). */
export interface MembersListResponse {
  members: UserPublic[];
}

/** POST /api/members — invite a teammate. tempPassword is returned ONCE so the
 *  admin can share it (no email provider wired in the MVP). */
export interface InviteMemberResponse {
  user: UserPublic;
  tempPassword: string;
}

export type DocStatus = 'PROCESSING' | 'READY' | 'FAILED';

/** Public document shape returned by the documents API (omits internal storageKey). */
export interface DocumentDto {
  id: string;
  workspaceId: string;
  filename: string;
  mimeType: string;
  status: DocStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentListResponse {
  items: DocumentDto[];
  nextCursor: string | null;
}

export type MsgRole = 'USER' | 'ASSISTANT' | 'TOOL';

export type UsageKind = 'EMBEDDING' | 'CHAT';

/** Per-workspace usage totals, broken down by event kind (docs/05 Phase 6). */
export interface UsageByKind {
  kind: UsageKind;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

/** Response of GET /api/usage. */
export interface UsageSummaryResponse {
  totalCostUsd: number;
  totalTokensIn: number;
  totalTokensOut: number;
  byKind: UsageByKind[];
}

/** A source reference attached to an assistant answer (docs/04). */
export interface Citation {
  documentId: string;
  filename: string;
  page?: number;
}

export interface ConversationDto {
  id: string;
  workspaceId: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/** A tool the agent invoked, persisted on a TOOL-role message (docs/05 Phase 5). */
export interface ToolCallRecord {
  /** Tool name, e.g. "search_documents" | "email_summary" | "create_ticket". */
  name: string;
  /** Validated arguments the model supplied. */
  input: unknown;
  /** Structured result returned to the model + rendered in the UI. */
  result: unknown;
  isError: boolean;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  role: MsgRole;
  content: string;
  citations: Citation[] | null;
  /** Populated only for TOOL-role messages; null otherwise. */
  toolCall: ToolCallRecord | null;
  createdAt: string;
}

export interface ConversationListResponse {
  items: ConversationDto[];
  nextCursor: string | null;
}

export interface ConversationDetailResponse {
  conversation: ConversationDto;
  messages: MessageDto[];
}

/** Response of POST /api/conversations/:id/messages (Phase 3 — non-streaming). */
export interface AskResponse {
  message: MessageDto;
  citations: Citation[];
}

/**
 * SSE events streamed from POST /api/conversations/:id/messages.
 * Phase 4: token | done | error. Phase 5 adds tool_call | tool_result so the
 * UI can render the agent's tool activity inline as it happens.
 */
export type ChatStreamEvent =
  | { type: 'token'; value: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; name: string; result: unknown; isError: boolean }
  | { type: 'done'; messageId: string; citations: Citation[]; usage: { tokensIn: number; tokensOut: number } }
  | { type: 'error'; message: string };
