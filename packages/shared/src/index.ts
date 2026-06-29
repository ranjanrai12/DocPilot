/** Response shape of GET /api/health */
export interface HealthResponse {
  status: 'ok';
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

export interface MessageDto {
  id: string;
  conversationId: string;
  role: MsgRole;
  content: string;
  citations: Citation[] | null;
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
