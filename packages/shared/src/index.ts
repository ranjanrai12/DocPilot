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
