import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ConversationDetailResponse, ConversationDto, Citation } from '@docpilot/shared';
import { api, ApiRequestError } from '../lib/api';

const EXAMPLE_QUESTIONS = [
  'Give me a summary of my documents',
  'What are the main topics covered?',
  'List any dates, deadlines, or numbers',
];

type Streaming = { id: string; question: string; answer: string; citations: Citation[] };

export default function ChatThread({
  selectedId,
  onSelect,
  className = '',
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isStreaming = streaming !== null;

  const conversationQuery = useQuery({
    queryKey: ['conversation', selectedId],
    queryFn: () => api.get<ConversationDetailResponse>(`/api/conversations/${selectedId}`),
    enabled: !!selectedId,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post<{ conversation: ConversationDto }>('/api/conversations', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  });

  async function submit(question: string) {
    const q = question.trim();
    if (!q || isStreaming) return;

    let id = selectedId;
    if (!id) {
      const { conversation } = await createMutation.mutateAsync();
      id = conversation.id;
      onSelect(id);
    }
    setDraft('');
    setError(null);
    setStreaming({ id, question: q, answer: '', citations: [] });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await api.stream(
        `/api/conversations/${id}/messages`,
        { question: q },
        {
          signal: controller.signal,
          onEvent: (ev) => {
            if (ev.type === 'token') {
              setStreaming((s) => (s ? { ...s, answer: s.answer + ev.value } : s));
            } else if (ev.type === 'done') {
              setStreaming((s) => (s ? { ...s, citations: ev.citations } : s));
            } else if (ev.type === 'error') {
              setError(ev.message);
            }
          },
        },
      );
      await queryClient.invalidateQueries({ queryKey: ['conversation', id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (e) {
      if (controller.signal.aborted) {
        await queryClient.invalidateQueries({ queryKey: ['conversation', id] });
      } else {
        setError(e instanceof ApiRequestError ? e.message : 'Failed to get an answer.');
      }
    } finally {
      setStreaming(null);
      abortRef.current = null;
    }
  }

  function onSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void submit(draft);
  }

  function stop() {
    abortRef.current?.abort();
  }

  const messages = conversationQuery.data?.messages ?? [];
  const showEmptyState = messages.length === 0 && !streaming;

  return (
    <main className={`flex-col min-w-0 min-h-0 bg-slate-50 ${className}`}>
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        {showEmptyState ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <span className="h-12 w-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">Ask about your documents</h3>
            <p className="mt-1 text-sm text-slate-500 max-w-sm">
              Every answer is grounded in the files you upload, with citations back to the source.
            </p>
            <div className="mt-6 flex flex-col gap-2 w-full max-w-sm">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => void submit(q)}
                  className="text-left text-sm text-slate-700 bg-white border border-slate-200 rounded-xl px-4 py-2.5 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            {messages.map((m) => (
              <Bubble key={m.id} role={m.role === 'USER' ? 'user' : 'assistant'} citations={m.citations ?? undefined}>
                {m.content}
              </Bubble>
            ))}
            {streaming && streaming.id === selectedId && (
              <>
                <Bubble role="user">{streaming.question}</Bubble>
                <Bubble role="assistant" citations={streaming.citations.length ? streaming.citations : undefined}>
                  {streaming.answer ? (
                    <span>
                      {streaming.answer}
                      <span className="inline-block w-1.5 h-4 align-text-bottom bg-slate-400 ml-0.5 animate-pulse" />
                    </span>
                  ) : (
                    <Dots />
                  )}
                </Bubble>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 sm:px-6 pb-2">
          <div className="max-w-2xl mx-auto rounded-lg bg-rose-50 border border-rose-200 px-4 py-2 text-sm text-rose-700">
            {error}
          </div>
        </div>
      )}

      <form onSubmit={onSend} className="border-t border-slate-200 bg-white px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={isStreaming}
            placeholder="Ask a question about your documents…"
            className="flex-1 min-w-0 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition disabled:opacity-60"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={stop}
              className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-rose-700 transition-colors"
              title="Stop generating"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="1.5" />
              </svg>
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim()}
              className="shrink-0 inline-flex items-center justify-center rounded-xl bg-indigo-600 text-white px-4 py-2.5 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              title="Send"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          )}
        </div>
      </form>
    </main>
  );
}

function Bubble({
  role,
  citations,
  children,
}: {
  role: 'user' | 'assistant';
  citations?: Citation[];
  children: React.ReactNode;
}) {
  return (
    <div className={role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          role === 'user'
            ? 'bg-indigo-600 text-white'
            : 'bg-white border border-slate-200 text-slate-800 shadow-sm'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{children}</p>
        {citations && citations.length > 0 && <Citations citations={citations} />}
      </div>
    </div>
  );
}

function Citations({ citations }: { citations: Citation[] }) {
  return (
    <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-wrap gap-1.5">
      {citations.map((c) => (
        <span
          key={c.documentId}
          className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 rounded-md px-2 py-0.5"
          title={c.filename}
        >
          <svg viewBox="0 0 24 24" className="h-3 w-3 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
          {c.filename}
          {c.page ? ` · p.${c.page}` : ''}
        </span>
      ))}
    </div>
  );
}

function Dots() {
  return (
    <span className="flex items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-300 animate-bounce [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 rounded-full bg-slate-300 animate-bounce [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 rounded-full bg-slate-300 animate-bounce" />
    </span>
  );
}
