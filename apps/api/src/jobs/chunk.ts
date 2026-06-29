export interface TextChunk {
  content: string;
  metadata: Record<string, unknown>;
}

// Split text into overlapping windows of roughly `size` words with `overlap`
// words of carry-over. Word count approximates tokens — good enough for the MVP;
// heading/page-aware splitting (for richer citations) can come later (Phase 4).
export function chunkText(
  text: string,
  opts: { size?: number; overlap?: number } = {},
): TextChunk[] {
  const size = opts.size ?? 500;
  const overlap = opts.overlap ?? 50;

  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (!clean) return [];

  const words = clean.split(/\s+/);
  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < words.length) {
    const end = Math.min(start + size, words.length);
    chunks.push({
      content: words.slice(start, end).join(' '),
      metadata: { index, startWord: start, endWord: end },
    });
    if (end === words.length) break;
    start = end - overlap; // step back for overlap
    index++;
  }

  return chunks;
}
