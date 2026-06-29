import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';

// Embeddings + chat live behind one swappable client (CLAUDE.md). Embedding
// dimension must match the pgvector column.
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
    const vectors = ordered.map((d) => d.embedding);
    // Guard: dimension must match the pgvector column or inserts/queries fail later.
    for (const v of vectors) {
      if (v.length !== EMBEDDING_DIM) {
        throw new Error(
          `Embedding dimension ${v.length} != ${EMBEDDING_DIM}. Check EMBEDDING_MODEL ("${env.EMBEDDING_MODEL}") against the vector(${EMBEDDING_DIM}) column.`,
        );
      }
    }
    return { vectors, tokens: json.usage.total_tokens };
  }
}

export const embedder: Embedder =
  env.EMBEDDING_PROVIDER === 'openai' ? new OpenAIEmbedder() : new FakeEmbedder();

// --- Chat client (RAG answers) ----------------------------------------------

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

export interface ChatClient {
  complete(input: { system: string; messages: ChatTurn[]; maxTokens?: number }): Promise<ChatResult>;
}

// Anthropic Claude via the official SDK (claude-api skill: use the SDK, not raw HTTP).
class AnthropicChat implements ChatClient {
  private readonly client: Anthropic;
  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }
  async complete({ system, messages, maxTokens }: { system: string; messages: ChatTurn[]; maxTokens?: number }): Promise<ChatResult> {
    const res = await this.client.messages.create({
      model: env.CHAT_MODEL,
      max_tokens: maxTokens ?? 1024,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const text = res.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
    return { text, tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens };
  }
}

// Deterministic dev driver — no key/cost. Proves the RAG plumbing end to end.
class FakeChat implements ChatClient {
  async complete({ system, messages }: { system: string; messages: ChatTurn[] }): Promise<ChatResult> {
    const question = messages[messages.length - 1]?.content ?? '';
    const hasContext = system.includes('<chunk ');
    const text = hasContext
      ? `(fake LLM) Based on the retrieved documents, here is a grounded answer to: "${question}". Set LLM_PROVIDER=anthropic and ANTHROPIC_API_KEY for real answers.`
      : "I don't know based on the documents.";
    const tokensIn = Math.ceil((system.length + question.length) / 4);
    return { text, tokensIn, tokensOut: Math.ceil(text.length / 4) };
  }
}

export const chatClient: ChatClient =
  env.LLM_PROVIDER === 'anthropic' && env.ANTHROPIC_API_KEY
    ? new AnthropicChat(env.ANTHROPIC_API_KEY)
    : new FakeChat();
