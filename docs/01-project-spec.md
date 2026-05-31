# 01 — Project Specification

## 1. Vision

**DocPilot** is a SaaS web application where a business uploads its documents and gets an AI
assistant that answers questions **grounded only in those documents**, with citations, and can
perform actions on the user's behalf via AI tool-calling.

One-line pitch: *"Upload your documents, then chat with them."*

## 2. The problem

Companies store critical knowledge in documents (handbooks, policies, product manuals, contracts),
but that knowledge is hard to access:

- New employees repeatedly ask the same questions.
- Support staff dig through PDFs to answer customers.
- Information *exists* but isn't *findable* — nobody reads 500 pages to find one answer.

DocPilot makes that knowledge instantly accessible through conversation, with citations so answers
can be trusted, and without hallucinating facts that aren't in the source material.

## 3. Target users (personas)

| Persona | Role | What they do |
|---------|------|--------------|
| **Admin** | Business owner / manager | Signs up, uploads documents, invites team members, manages the workspace |
| **Member** | Employee / support agent | Logs in, asks the AI questions, gets cited answers, uses agent actions |

**Tenant model:** one company = one *workspace* (tenant). All documents, conversations, and users
belong to a workspace and are **fully isolated** from other workspaces.

**Permissions:** both roles can upload/delete documents and chat. Only **admins** can invite/remove
members and view workspace usage. See the full permissions matrix and invite flow in
[07-api-spec.md](07-api-spec.md).

## 4. Scope

### In scope (MVP + showcase)
- Email/password auth with sessions
- Multi-tenant workspaces with role-based access (admin / member)
- Document upload (PDF, DOCX, TXT) with background processing
- RAG-based chat: questions answered only from uploaded documents
- Streaming responses (token-by-token)
- Citations (which document/section an answer came from)
- Conversation history
- AI agent tool-calling (e.g. email summary, create ticket)
- Usage/cost tracking, rate limiting
- Deployed live with CI/CD

### Out of scope (explicitly, for now)
- Billing / Stripe (it's a portfolio piece, not a commercial launch)
- SSO / OAuth providers
- Mobile app
- Real-time multi-user collaboration in a single chat
- Fine-tuning or training custom models

## 5. Functional requirements

### Authentication & workspaces
- FR-1: A user can sign up with email + password; doing so creates a new workspace and makes them admin.
- FR-2: A user can log in and log out; sessions persist securely.
- FR-3: An admin can invite members to their workspace.
- FR-4: All data access is scoped to the user's workspace (no cross-tenant leakage).

### Documents
- FR-5: A user can upload PDF / DOCX / TXT files.
- FR-6: Uploaded documents are processed in the background; the UI shows status (processing → ready / failed).
- FR-7: A user can see a list of their workspace's documents and delete them.

### Chat (RAG)
- FR-8: A user can ask a question in natural language.
- FR-9: The system retrieves the most relevant document chunks and answers using only that context.
- FR-10: If the answer is not in the documents, the assistant says so (no hallucination).
- FR-11: Answers stream token-by-token; the user can stop generation.
- FR-12: Each answer shows citations (source document + location).
- FR-13: Conversations are saved and can be revisited.

### Agent actions
- FR-14: The assistant can call tools to take actions (e.g. `email_summary`, `create_ticket`).
- FR-15: Tool calls and their results are visible to the user in the conversation.

### Operations
- FR-16: Per-workspace rate limiting and token/cost tracking.
- FR-17: Health-check endpoint, structured logging, error tracking.

## 6. Non-functional requirements
- **Security:** hashed passwords, validated inputs, tenant isolation, prompt-injection mitigation, file type/size limits.
- **Performance:** document ingestion is async (never blocks a request); chat first-token latency kept low via streaming.
- **Reliability:** ingestion jobs retry on failure; failed documents surface a clear error.
- **Maintainability:** clean module structure, shared types between frontend and backend, tests on core logic.
- **Observability:** logs, error tracking, usage metrics.

## 7. Primary user journey

```
1. Admin signs up → workspace created.
2. Admin uploads documents (e.g. HR policies, product manuals).
3. Documents process in the background → marked "ready".
4. Admin invites team members.
5. Member logs in and asks: "What's our remote-work policy?"
6. Answer streams in with a citation: "...up to 3 days/week. [Source: HR-Policy.pdf, p.2]"
7. Member follows up: "Email that summary to my manager."
8. The assistant calls the email tool → action completed, shown in the chat.
```

## 8. Screens (frontend)
1. **Auth** — login / signup
2. **Dashboard** — document list, upload, processing status
3. **Chat** — message thread, streaming answers, citations, input box, stop button
4. **History** — sidebar of past conversations
5. **Team** (admin) — invite / list members

## 9. Success criteria
- A visitor can be given a public URL, sign up, upload a document, ask a question, and get a correct, cited, streamed answer — end to end.
- The codebase clearly demonstrates RAG, agents, streaming, auth, multi-tenancy, background jobs, and deployment.
- The author can explain every architectural decision in an interview.
