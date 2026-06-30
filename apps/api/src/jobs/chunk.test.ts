import { describe, it, expect } from 'vitest';
import { chunkText } from './chunk.js';

describe('chunkText', () => {
  it('returns [] for empty / whitespace-only text', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\t ')).toEqual([]);
  });

  it('produces a single chunk when under the size limit', () => {
    const chunks = chunkText('one two three', { size: 500, overlap: 50 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('one two three');
    expect(chunks[0].metadata).toMatchObject({ index: 0, startWord: 0, endWord: 3 });
  });

  it('splits into overlapping windows', () => {
    const words = Array.from({ length: 12 }, (_, i) => `w${i}`).join(' ');
    const chunks = chunkText(words, { size: 5, overlap: 2 });
    expect(chunks.length).toBeGreaterThan(1);
    // first window covers words 0..5; the next steps back by `overlap` (2)
    expect(chunks[0].metadata).toMatchObject({ startWord: 0, endWord: 5 });
    expect(chunks[1].metadata).toMatchObject({ startWord: 3 });
  });

  it('normalizes CRLF and collapses runs of spaces', () => {
    const chunks = chunkText('a\r\nb   c');
    expect(chunks[0].content).toBe('a b c');
  });
});
