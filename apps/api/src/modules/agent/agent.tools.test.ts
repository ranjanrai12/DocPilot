import { describe, it, expect } from 'vitest';
import { runTool, toolSpecs, type ToolContext } from './agent.tools.js';

// No DB/embedder needed for these paths (validation + mocked email/ticket tools).
const ctx: ToolContext = { workspaceId: 'ws-1', addCitations: () => {} };

describe('toolSpecs', () => {
  it('advertises the three Phase 5 tools with object input schemas', () => {
    const names = toolSpecs()
      .map((t) => t.name)
      .sort();
    expect(names).toEqual(['create_ticket', 'email_summary', 'search_documents']);
    for (const t of toolSpecs()) expect(t.input_schema).toMatchObject({ type: 'object' });
  });
});

describe('runTool', () => {
  it('returns a tool error for an unknown tool (no throw)', async () => {
    const r = await runTool('does_not_exist', {}, ctx);
    expect(r.isError).toBe(true);
  });

  it('returns a tool error for invalid args (bad email)', async () => {
    const r = await runTool('email_summary', { recipient: 'not-an-email', summary: 'hi' }, ctx);
    expect(r.isError).toBe(true);
  });

  it('email_summary (mock) succeeds and echoes the recipient', async () => {
    const r = await runTool(
      'email_summary',
      { recipient: 'teammate@example.com', summary: 'hi' },
      ctx,
    );
    expect(r.isError).toBe(false);
    expect(r.result).toMatchObject({ recipient: 'teammate@example.com' });
  });

  it('create_ticket (mock) returns a TICKET- id', async () => {
    const r = await runTool('create_ticket', { title: 'Bug', description: 'details' }, ctx);
    expect(r.isError).toBe(false);
    expect(r.result).toMatchObject({ ticketId: expect.stringMatching(/^TICKET-/) });
  });
});
