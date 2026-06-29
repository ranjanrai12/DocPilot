import type { ApiError, ChatStreamEvent } from '@docpilot/shared';

// Reads the in-memory access token. Set by AuthContext after login/signup/refresh.
let _accessToken: string | null = null;
export const tokenStore = {
  get: () => _accessToken,
  set: (t: string | null) => { _accessToken = t; },
};

export class ApiRequestError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  // For FormData, let the browser set Content-Type (with the multipart boundary).
  const isForm = init.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isForm ? {} : { 'Content-Type': 'application/json' }),
    ...(init.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, { ...init, headers, credentials: 'include' });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(
      res.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? res.statusText,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// POST that returns text/event-stream; reads the body incrementally with
// fetch + ReadableStream (NOT EventSource, which is GET-only) and calls onEvent
// for each `data: <json>` SSE frame. Pass a signal to stop (AbortController) —
// aborting also cancels the upstream LLM call server-side.
async function streamRequest(
  path: string,
  body: unknown,
  opts: { onEvent: (event: ChatStreamEvent) => void; signal?: AbortSignal },
): Promise<void> {
  const token = tokenStore.get();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    credentials: 'include',
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const errBody = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(
      res.status,
      errBody?.error?.code ?? 'UNKNOWN',
      errBody?.error?.message ?? res.statusText,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of frame.split('\n')) {
        if (line.startsWith('data:')) {
          const json = line.slice(5).trim();
          if (json) opts.onEvent(JSON.parse(json) as ChatStreamEvent);
        }
      }
    }
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  stream: (
    path: string,
    body: unknown,
    opts: { onEvent: (event: ChatStreamEvent) => void; signal?: AbortSignal },
  ) => streamRequest(path, body, opts),
};
