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

export interface ChatInput {
  system: string;
  messages: ChatTurn[];
  maxTokens?: number;
  signal?: AbortSignal;
}

// --- Agentic tool-calling (Phase 5, docs/05) --------------------------------

/** A tool definition advertised to the model (JSON-Schema input). */
export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** A single tool invocation the model requested. */
export interface ToolUse {
  id: string;
  name: string;
  input: unknown;
}

/** What a tool execution returns to the model. */
export interface ToolOutcome {
  content: string; // text fed back to the model as the tool_result
  isError?: boolean;
}

export interface AgentStreamInput {
  system: string;
  messages: ChatTurn[];
  tools: ToolSpec[];
  maxTokens?: number;
  /** Hard cap on tool round-trips so the model can't loop forever (safety). */
  maxIterations?: number;
  signal?: AbortSignal;
}

export interface AgentStreamHandlers {
  onToken: (token: string) => void;
  // Execute one tool call and return its result. The caller validates args,
  // runs the (workspace-scoped) side effect, and returns the content string.
  onToolUse: (use: ToolUse) => Promise<ToolOutcome>;
}

export interface ChatClient {
  complete(input: ChatInput): Promise<ChatResult>;
  // Streams token deltas via onToken; resolves with the full result. Pass an
  // AbortSignal to cancel the upstream LLM call when the client disconnects.
  stream(input: ChatInput, onToken: (token: string) => void): Promise<ChatResult>;
  // Runs the bounded tool-calling loop (LLM -> tool_use -> execute -> result ->
  // final answer), streaming the answer text via handlers.onToken. The caller
  // executes tools via handlers.onToolUse; this driver only threads the
  // Anthropic tool_use/tool_result blocks and accumulates token usage.
  agentStream(input: AgentStreamInput, handlers: AgentStreamHandlers): Promise<ChatResult>;
}

const DEFAULT_MAX_ITERATIONS = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Anthropic Claude via the official SDK (claude-api skill: use the SDK, not raw HTTP).
class AnthropicChat implements ChatClient {
  private readonly client: Anthropic;
  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }
  async complete({ system, messages, maxTokens }: ChatInput): Promise<ChatResult> {
    const res = await this.client.messages.create({
      model: env.CHAT_MODEL,
      max_tokens: maxTokens ?? 1024,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const text = res.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
    return { text, tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens };
  }

  async stream({ system, messages, maxTokens, signal }: ChatInput, onToken: (t: string) => void): Promise<ChatResult> {
    const s = this.client.messages.stream(
      {
        model: env.CHAT_MODEL,
        max_tokens: maxTokens ?? 1024,
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      },
      signal ? { signal } : undefined,
    );
    s.on('text', (delta) => onToken(delta));
    const final = await s.finalMessage();
    const text = final.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
    return { text, tokensIn: final.usage.input_tokens, tokensOut: final.usage.output_tokens };
  }

  async agentStream(
    { system, messages, tools, maxTokens, maxIterations = DEFAULT_MAX_ITERATIONS, signal }: AgentStreamInput,
    handlers: AgentStreamHandlers,
  ): Promise<ChatResult> {
    const convo: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));
    const toolDefs: Anthropic.Tool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool.InputSchema,
    }));

    let tokensIn = 0;
    let tokensOut = 0;
    // Accumulate text across turns so the persisted answer matches exactly what
    // was streamed to the client (the model may narrate before a tool call).
    let finalText = '';

    // Bounded loop: each pass either ends the turn (final answer) or executes
    // the requested tools and feeds the results back for another pass.
    for (let i = 0; i < maxIterations; i++) {
      const s = this.client.messages.stream(
        { model: env.CHAT_MODEL, max_tokens: maxTokens ?? 1024, system, messages: convo, tools: toolDefs },
        signal ? { signal } : undefined,
      );
      s.on('text', (delta) => handlers.onToken(delta));
      const msg = await s.finalMessage();
      tokensIn += msg.usage.input_tokens;
      tokensOut += msg.usage.output_tokens;
      finalText += msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');

      const toolUses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (msg.stop_reason !== 'tool_use' || toolUses.length === 0) {
        return { text: finalText, tokensIn, tokensOut };
      }

      // Preserve the assistant turn verbatim (keeps the tool_use blocks), then
      // execute each tool and return all results in a single user turn.
      convo.push({ role: 'assistant', content: msg.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const outcome = await handlers.onToolUse({ id: use.id, name: use.name, input: use.input });
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: outcome.content,
          is_error: outcome.isError ?? false,
        });
      }
      convo.push({ role: 'user', content: results });
    }

    // Iteration cap hit: the last turn requested more tools, whose results are
    // now in `convo` but unsynthesized. Make ONE final pass WITHOUT tools so the
    // model must produce an answer from them instead of returning empty text.
    const finalStream = this.client.messages.stream(
      { model: env.CHAT_MODEL, max_tokens: maxTokens ?? 1024, system, messages: convo },
      signal ? { signal } : undefined,
    );
    finalStream.on('text', (delta) => handlers.onToken(delta));
    const finalMsg = await finalStream.finalMessage();
    tokensIn += finalMsg.usage.input_tokens;
    tokensOut += finalMsg.usage.output_tokens;
    finalText += finalMsg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');

    return { text: finalText, tokensIn, tokensOut };
  }
}

// Deterministic dev driver — no key/cost. Proves the RAG plumbing end to end.
class FakeChat implements ChatClient {
  async complete({ system, messages }: ChatInput): Promise<ChatResult> {
    const question = messages[messages.length - 1]?.content ?? '';
    const hasContext = system.includes('<chunk ');
    const text = hasContext
      ? `(fake LLM) Based on the retrieved documents, here is a grounded answer to: "${question}". Set LLM_PROVIDER=anthropic and ANTHROPIC_API_KEY for real answers.`
      : "I don't know based on the documents.";
    const tokensIn = Math.ceil((system.length + question.length) / 4);
    return { text, tokensIn, tokensOut: Math.ceil(text.length / 4) };
  }

  async stream(input: ChatInput, onToken: (t: string) => void): Promise<ChatResult> {
    const result = await this.complete(input);
    // Emit word-by-word so the UI streaming path is exercised in dev.
    const tokens = result.text.match(/\S+\s*/g) ?? [result.text];
    for (const t of tokens) {
      if (input.signal?.aborted) throw new Error('aborted');
      onToken(t);
      await sleep(20);
    }
    return result;
  }

  // Deterministic agent driver: always searches the documents, and additionally
  // emails/creates a ticket when the question mentions it — so the full tool
  // path (call -> execute -> result -> UI render) is exercised without a key.
  async agentStream(input: AgentStreamInput, handlers: AgentStreamHandlers): Promise<ChatResult> {
    const question = input.messages[input.messages.length - 1]?.content ?? '';
    const has = (name: string) => input.tools.some((t) => t.name === name);
    let tokensIn = Math.ceil((input.system.length + question.length) / 4);

    if (has('search_documents')) {
      await handlers.onToolUse({ id: 'fake_search_1', name: 'search_documents', input: { query: question } });
    }
    if (/\bemail\b/i.test(question) && has('email_summary')) {
      await handlers.onToolUse({
        id: 'fake_email_1',
        name: 'email_summary',
        input: { recipient: 'teammate@example.com', summary: `Summary of: ${question}` },
      });
    }
    if (/\bticket\b/i.test(question) && has('create_ticket')) {
      await handlers.onToolUse({
        id: 'fake_ticket_1',
        name: 'create_ticket',
        input: { title: question.slice(0, 60) || 'Untitled', description: question },
      });
    }

    const answer = `(fake agent) I used my tools to help with: "${question}". Set LLM_PROVIDER=anthropic and ANTHROPIC_API_KEY for real tool-calling.`;
    const tokens = answer.match(/\S+\s*/g) ?? [answer];
    for (const t of tokens) {
      if (input.signal?.aborted) throw new Error('aborted');
      handlers.onToken(t);
      await sleep(20);
    }
    return { text: answer, tokensIn, tokensOut: Math.ceil(answer.length / 4) };
  }
}

export const chatClient: ChatClient =
  env.LLM_PROVIDER === 'anthropic' && env.ANTHROPIC_API_KEY
    ? new AnthropicChat(env.ANTHROPIC_API_KEY)
    : new FakeChat();
