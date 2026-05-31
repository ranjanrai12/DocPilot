# 07 — API Specification

REST API for DocMind. All endpoints are prefixed `/api`. All authenticated requests send
`Authorization: Bearer <accessToken>`. All bodies are JSON unless noted (uploads are multipart).
Every tenant-owned resource is implicitly scoped to the caller's `workspaceId` (from the JWT).

## Conventions

- **Auth:** access JWT in `Authorization` header; refresh token in an httpOnly cookie (see architecture §6).
- **IDs:** UUID strings.
- **Timestamps:** ISO-8601 UTC.
- **Validation:** request bodies validated with zod; invalid input → `400 VALIDATION_ERROR`.
- **Pagination:** list endpoints accept `?limit=&cursor=`; respond `{ items, nextCursor }`.

## Standard error format

Every error response uses this shape and an appropriate HTTP status:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable summary.",
    "details": [{ "path": "email", "issue": "Invalid email" }]
  }
}
```

| HTTP | code | When |
|------|------|------|
| 400 | `VALIDATION_ERROR` | Body/query failed validation |
| 401 | `UNAUTHENTICATED` | Missing/invalid/expired access token |
| 403 | `FORBIDDEN` | Authenticated but lacks role / not in workspace |
| 404 | `NOT_FOUND` | Resource missing or not in caller's workspace |
| 409 | `CONFLICT` | e.g. email already registered |
| 413 | `PAYLOAD_TOO_LARGE` | Upload exceeds size limit |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Disallowed file type |
| 429 | `RATE_LIMITED` | Rate/usage limit hit (includes `Retry-After`) |
| 500 | `INTERNAL` | Unexpected error (details hidden; logged + Sentry) |

> Cross-tenant access returns **404** (not 403) so existence isn't leaked across workspaces.

## Endpoints

### Auth
| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| POST | `/api/auth/signup` | — | `{ email, password, workspaceName }` | `201 { user, accessToken }` (+ refresh cookie); creates workspace, caller = ADMIN |
| POST | `/api/auth/login` | — | `{ email, password }` | `200 { user, accessToken }` (+ refresh cookie) |
| POST | `/api/auth/refresh` | refresh cookie | — | `200 { accessToken }` |
| POST | `/api/auth/logout` | refresh cookie | — | `204` (clears cookie) |
| GET | `/api/auth/me` | access | — | `200 { user }` |

### Workspace & members
| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| GET | `/api/workspace` | access | — | `200 { workspace }` |
| GET | `/api/workspace/members` | access | — | `200 { items }` |
| POST | `/api/workspace/invites` | **ADMIN** | `{ email, role }` | `201 { invite }` — see invite flow below |
| POST | `/api/workspace/invites/accept` | — | `{ token, password }` | `201 { user, accessToken }` |
| DELETE | `/api/workspace/members/:userId` | **ADMIN** | — | `204` |

### Documents
| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| POST | `/api/documents` | access | multipart file | `202 { document }` (status=PROCESSING; enqueues ingestion) |
| GET | `/api/documents` | access | — | `200 { items, nextCursor }` |
| GET | `/api/documents/:id` | access | — | `200 { document }` |
| DELETE | `/api/documents/:id` | access | — | `204` (deletes DB rows + chunks + storage object) |

### Conversations & chat
| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| GET | `/api/conversations` | access | — | `200 { items, nextCursor }` |
| POST | `/api/conversations` | access | `{ title? }` | `201 { conversation }` |
| GET | `/api/conversations/:id` | access | — | `200 { conversation, messages }` |
| DELETE | `/api/conversations/:id` | access | — | `204` |
| POST | `/api/conversations/:id/messages` | access | `{ question }` | **streamed** `text/event-stream` (see below) |

### Streaming response (chat)
`POST /api/conversations/:id/messages` returns `Content-Type: text/event-stream`. The client reads it
with `fetch` + `ReadableStream` (not `EventSource`). Event sequence:

```
data: {"type":"token","value":"Remote"}
data: {"type":"token","value":" work"}
...
data: {"type":"tool_call","name":"email_summary","args":{...}}
data: {"type":"tool_result","name":"email_summary","result":{...}}
...
data: {"type":"done","citations":[{"documentId":"...","filename":"HR.pdf","page":2}],"usage":{"tokensIn":1200,"tokensOut":180}}
```

Aborting the request (AbortController) cancels generation and the upstream LLM call.

### Ops
| Method | Path | Auth | Returns |
|--------|------|------|---------|
| GET | `/api/health` | — | `200 { status:"ok", db, redis }` |
| GET | `/api/usage` | **ADMIN** | `200 { window, tokensIn, tokensOut, costUsd }` |

## Invite flow (resolves spec ambiguity)
- Admin calls `POST /api/workspace/invites` → server creates a pending invite with a signed token.
- For the MVP (no email provider yet), the API **returns the invite link** for the admin to share
  manually; later this is emailed. The invitee calls `/api/workspace/invites/accept` to set a
  password and join the workspace.

## Permissions matrix
| Action | ADMIN | MEMBER |
|--------|:----:|:-----:|
| Upload / delete documents | ✅ | ✅ |
| Chat / view conversations | ✅ | ✅ |
| Invite / remove members | ✅ | ❌ |
| View workspace usage | ✅ | ❌ |

> Decision: document upload/delete is allowed for **all members** (not admin-only) — simpler and
> matches FR-5. Member management and usage are admin-only.
