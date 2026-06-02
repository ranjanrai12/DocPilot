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
