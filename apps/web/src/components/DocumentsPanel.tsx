import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DocumentDto, DocumentListResponse } from '@docpilot/shared';
import { api, ApiRequestError } from '../lib/api';

const statusMeta: Record<DocumentDto['status'], { label: string; dot: string; text: string }> = {
  PROCESSING: { label: 'Processing', dot: 'bg-amber-500', text: 'text-amber-700' },
  READY: { label: 'Ready', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  FAILED: { label: 'Failed', dot: 'bg-rose-500', text: 'text-rose-700' },
};

function extOf(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toUpperCase().slice(0, 4) : 'FILE';
}

export default function DocumentsPanel({ className = '' }: { className?: string }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll while any document is still processing; stop once all settle.
  const { data, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api.get<DocumentListResponse>('/api/documents'),
    refetchInterval: (query) =>
      (query.state.data?.items ?? []).some((d) => d.status === 'PROCESSING') ? 2000 : false,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<{ document: DocumentDto }>('/api/documents', form);
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Upload failed.'),
    onSettled: () => {
      if (fileRef.current) fileRef.current.value = '';
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/documents/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Delete failed.'),
  });

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  }

  const documents = data?.items ?? [];

  return (
    <section className={`flex-col min-h-0 bg-white ${className}`}>
      <div className="h-14 shrink-0 px-4 flex items-center justify-between border-b border-slate-200">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 leading-tight">Documents</h2>
          <p className="text-xs text-slate-400 leading-tight">{documents.length} uploaded</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={onFileChange}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {uploadMutation.isPending ? 'Uploading' : 'Upload'}
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 pt-3 pb-3">
        {isLoading ? (
          <p className="px-1 py-3 text-xs text-slate-400">Loading…</p>
        ) : documents.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
            <p className="text-sm font-medium text-slate-600">No documents yet</p>
            <p className="mt-1 text-xs text-slate-400">Upload a PDF, DOCX, or TXT to start asking questions.</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {documents.map((doc) => {
              const status = statusMeta[doc.status];
              return (
                <li key={doc.id} className="group rounded-xl px-2.5 py-2 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <span className="shrink-0 h-8 w-8 rounded-lg bg-slate-100 text-slate-500 text-[9px] font-semibold flex items-center justify-center">
                      {extOf(doc.filename)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800 truncate" title={doc.filename}>
                        {doc.filename}
                      </p>
                      <span className={`inline-flex items-center gap-1.5 text-xs ${status.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                    </div>
                    <button
                      onClick={() => deleteMutation.mutate(doc.id)}
                      disabled={deleteMutation.isPending}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-600 transition disabled:opacity-50 shrink-0"
                      title="Delete document"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      </svg>
                    </button>
                  </div>
                  {doc.status === 'FAILED' && doc.error && (
                    <p className="mt-1 ml-[42px] text-xs text-rose-500 truncate" title={doc.error}>
                      {doc.error}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
