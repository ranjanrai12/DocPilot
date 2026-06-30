import { describe, it, expect } from 'vitest';
import {
  buildCitations,
  escapeText,
  escapeAttr,
  pageOf,
  type RetrievedChunk,
} from './chat.service.js';

const chunk = (over: Partial<RetrievedChunk>): RetrievedChunk => ({
  id: 'c',
  content: 'x',
  documentId: 'd',
  filename: 'f',
  metadata: null,
  similarity: 0.5,
  ...over,
});

describe('buildCitations', () => {
  it('emits one citation per document, with page when present', () => {
    const cites = buildCitations([
      chunk({ documentId: 'd1', filename: 'A.pdf', metadata: { page: 2 } }),
      chunk({ documentId: 'd1', filename: 'A.pdf', metadata: { page: 3 } }), // same doc → deduped
      chunk({ documentId: 'd2', filename: 'B.txt', metadata: null }),
    ]);
    expect(cites).toHaveLength(2);
    expect(cites[0]).toMatchObject({ documentId: 'd1', filename: 'A.pdf', page: 2 });
    expect(cites[1]).toMatchObject({ documentId: 'd2', filename: 'B.txt' });
    expect(cites[1].page).toBeUndefined();
  });
});

describe('escaping (prompt-injection mitigation)', () => {
  it('neutralizes closing tags in body text (& first, then <)', () => {
    expect(escapeText('</chunk> & <x>')).toBe('&lt;/chunk> &amp; &lt;x>');
  });

  it('escapes quotes and angle brackets in attribute values', () => {
    expect(escapeAttr('a"b<c&d')).toBe('a&quot;b&lt;c&amp;d');
  });

  it('pageOf reads a numeric page, else undefined', () => {
    expect(pageOf({ page: 5 })).toBe(5);
    expect(pageOf({ page: 'x' })).toBeUndefined();
    expect(pageOf({})).toBeUndefined();
    expect(pageOf(null)).toBeUndefined();
  });
});
