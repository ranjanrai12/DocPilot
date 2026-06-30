import { describe, it, expect } from 'vitest';
import { chatClient, type ToolSpec } from './llm.js';

// With no real LLM key (test env), chatClient is the deterministic FakeChat.
describe('FakeChat (dev driver)', () => {
  it('complete: grounded answer when context chunks are present', async () => {
    const r = await chatClient.complete({
      system: 'rules\n<chunk id="1">hello</chunk>',
      messages: [{ role: 'user', content: 'q' }],
    });
    expect(r.text).toContain('fake LLM');
    expect(r.tokensOut).toBeGreaterThan(0);
  });

  it('complete: "I don\'t know" when there is no context', async () => {
    const r = await chatClient.complete({
      system: 'rules only, no chunks',
      messages: [{ role: 'user', content: 'q' }],
    });
    expect(r.text).toMatch(/don't know/i);
  });

  it('agentStream: calls search_documents, streams tokens, reports usage', async () => {
    const tools: ToolSpec[] = [
      { name: 'search_documents', description: 'd', input_schema: { type: 'object' } },
    ];
    const calls: string[] = [];
    let streamed = '';
    const usage = { tokensIn: 0, tokensOut: 0 };

    const result = await chatClient.agentStream(
      { system: 's', messages: [{ role: 'user', content: 'hello there' }], tools },
      {
        onToken: (t) => {
          streamed += t;
        },
        onUsage: (u) => {
          usage.tokensIn += u.tokensIn;
          usage.tokensOut += u.tokensOut;
        },
        onToolUse: async (use) => {
          calls.push(use.name);
          return { content: 'ok' };
        },
      },
    );

    expect(calls).toContain('search_documents');
    expect(streamed.length).toBeGreaterThan(0);
    expect(result.text).toBe(streamed); // persisted answer == streamed tokens
    expect(usage.tokensOut).toBeGreaterThan(0);
  });
});
