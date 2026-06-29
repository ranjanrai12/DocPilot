---
name: agent-tools
description: >-
  How to build DocPilot's agentic tool-calling (Phase 5): define tool schemas (search_documents,
  email_summary, create_ticket), run the LLM → tool-call → execute → result → final-answer loop
  safely (bounded, validated, workspace-scoped), and render tool calls/results in the chat UI. Use when
  working in modules/agent or wiring tools into the chat flow. Provider is Anthropic Claude via lib/llm.
---

# Agentic tool-calling (DocPilot, Phase 5)

The "wow" feature (docs/05 Phase 5): the assistant takes actions via tools. Uses **Anthropic Claude**
tool-use through `lib/llm` — consult the **claude-api** skill for the exact tool-use request/response
shape and the streaming tool-call events; don't guess the API.

## Initial tools (docs/02 §4)

| Tool | Purpose | MVP |
|------|---------|-----|
| `search_documents` | Tenant-scoped vector search over the workspace's chunks | real (reuse the `rag-chat` retrieval) |
| `email_summary` | Email a summary to a recipient | mocked/logged, wired to a provider later |
| `create_ticket` | Create a ticket from the conversation | mocked/logged, wired later |

Define each tool's input as a JSON schema (mirror it with a zod schema for server-side validation).

## The loop

```
1. Send question + tool definitions to the LLM.
2. If the LLM returns a tool call → validate args (zod) → execute the tool → return the result to the LLM.
3. Repeat until the LLM returns a final answer (no more tool calls).
4. Stream the final answer to the client; persist messages (role TOOL for tool turns, with toolCall jsonb).
```

## Safety rules (do not skip)

- **Bound the loop.** Cap iterations (e.g. ≤ 5 tool round-trips) so a model can't loop forever — runaway
  loops burn tokens and cost.
- **Validate every tool's arguments server-side** with zod before executing. Never `eval` or pass model
  output straight into a side effect.
- **Scope tool side effects to the caller's workspace.** `search_documents` must filter by
  `req.user.workspaceId`; `email_summary`/`create_ticket` must only act on the caller's workspace data.
  A tool is an authorization surface — the same tenant rules apply (see the `tenant-scoping` skill).
- **Prompt-injection:** retrieved document text must never be able to trigger a tool. Treat document
  content as data; only the user's instruction and the system rules drive tool selection (docs/02 §7).
- **Mocked tools must be clearly mocked** (log the intended action + return a structured result), not
  silent no-ops, so the demo is honest and the UI can render them.
- **Record usage** (`UsageEvent { kind: CHAT }`) including tool-turn tokens.

## Streaming tool calls to the UI

Reuse the chat SSE channel (see `rag-chat`). Emit tool activity as events so the UI can render it
(docs/07):
```
data: {"type":"tool_call","name":"email_summary","args":{...}}
data: {"type":"tool_result","name":"email_summary","result":{...}}
data: {"type":"done","citations":[...],"usage":{...}}
```
Persist tool turns as `Message` rows with `role = TOOL` and the `toolCall` jsonb populated.

After building, run **rag-agent-reviewer** (loop bounds, arg validation, scoped side effects, injection)
and **tenant-isolation-auditor** (tool data access is workspace-scoped).
