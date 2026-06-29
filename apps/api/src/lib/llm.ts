import { createHash } from 'node:crypto';
import { env } from '../config/env.js';

// Embeddings live behind one swappable client (CLAUDE.md). The chat/RAG client
// (Phase 3) will be added here too. Dimension must match the pgvector column.
export const EMBEDDING_DIM = 1536;

export interface EmbedResult {
  vectors: number[][];
  tokens: number;
}

export interface Embedder {
  embed(texts: string[]): Promise<EmbedResult>;
}

// --- Fake deterministic embedder (dev default) ------------------------------
// No API key, no cost. Same text → same unit-length vector, so the pipeline and
// similarity search are exercised end to end. Swap to OpenAI via env later.
class FakeEmbedder implements Embedder {
  async embed(texts: string[]): Promise<EmbedResult> {
    const vectors = texts.map(unitVectorFromText);
    const tokens = texts.reduce((sum, t) => sum + estimateTokens(t), 0);
    return { vectors, tokens };
  }
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4)); // ~4 chars/token heuristic
}

// mulberry32 PRNG seeded from a hash of the text → deterministic vectors.
function unitVectorFromText(text: string): number[] {
  const seed = createHash('sha256').update(text).digest().readUInt32LE(0);
  const rand = mulberry32(seed);
  const v = new Array<number>(EMBEDDING_DIM);
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    const x = rand() * 2 - 1;
    v[i] = x;
    norm += x * x;
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < EMBEDDING_DIM; i++) v[i] /= norm;
  return v;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- OpenAI embedder (real) — via fetch, no SDK dependency ------------------
class OpenAIEmbedder implements Embedder {
  async embed(texts: string[]): Promise<EmbedResult> {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for EMBEDDING_PROVIDER=openai.');
    }
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: env.EMBEDDING_MODEL, input: texts }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI embeddings failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      data: { embedding: number[]; index: number }[];
      usage: { total_tokens: number };
    };
    // OpenAI may return embeddings out of input order — sort by `index` first.
    const ordered = [...json.data].sort((a, b) => a.index - b.index);
    return { vectors: ordered.map((d) => d.embedding), tokens: json.usage.total_tokens };
  }
}

export const embedder: Embedder =
  env.EMBEDDING_PROVIDER === 'openai' ? new OpenAIEmbedder() : new FakeEmbedder();
