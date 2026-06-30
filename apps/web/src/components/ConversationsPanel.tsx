import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ConversationListResponse } from '@docpilot/shared';
import { api, ApiRequestError } from '../lib/api';

export default function ConversationsPanel({
  selectedId,
  onSelect,
  className = '',
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<ConversationListResponse>('/api/conversations'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/conversations/${id}`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (selectedId === id) onSelect(null);
    },
    onError: (e) =>
      setError(e instanceof ApiRequestError ? e.message : 'Failed to delete conversation.'),
  });

  const conversations = conversationsQuery.data?.items ?? [];

  return (
    <section className={`flex-col min-h-0 bg-white ${className}`}>
      <div className="h-14 shrink-0 px-3 flex items-center border-b border-slate-200">
        <button
          onClick={() => onSelect(null)}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium px-3 py-2 hover:bg-slate-800 transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          New chat
        </button>
      </div>

      {error && (
        <div className="mx-3 mt-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      <ul className="flex-1 overflow-y-auto px-2 pt-2 pb-2 space-y-0.5">
        {conversations.map((c) => (
          <li
            key={c.id}
            className={`group flex items-center rounded-lg transition-colors ${
              c.id === selectedId ? 'bg-indigo-50' : 'hover:bg-slate-50'
            }`}
          >
            <button
              onClick={() => onSelect(c.id)}
              className={`flex-1 text-left text-sm px-3 py-2 truncate ${
                c.id === selectedId ? 'text-indigo-700 font-medium' : 'text-slate-600'
              }`}
            >
              {c.title}
            </button>
            <button
              onClick={() => deleteMutation.mutate(c.id)}
              disabled={deleteMutation.isPending}
              className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-600 px-2 transition disabled:opacity-50"
              title="Delete conversation"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              </svg>
            </button>
          </li>
        ))}
        {conversations.length === 0 && (
          <li className="px-3 py-2 text-xs text-slate-400">No conversations yet.</li>
        )}
      </ul>
    </section>
  );
}
