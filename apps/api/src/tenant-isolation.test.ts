import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma, withWorkspace, bypassRls } from './lib/prisma.js';
import { searchWorkspaceChunks, loadHistory } from './modules/chat/chat.service.js';
import { getUsageSummary } from './modules/usage/usage.service.js';
import { listMembers, updateMemberRole, removeMember } from './modules/members/members.service.js';

// Multi-tenant isolation — the project's #1 non-negotiable rule (CLAUDE.md,
// docs/02 §7). This proves the RLS *backstop*: even a query that omits the
// explicit `where: { workspaceId }` filter cannot read another workspace's rows.
//
// Requires a reachable Postgres with the `enable_rls` migration applied
// (`pnpm --filter api prisma migrate deploy`). RLS is a database feature and
// cannot be mocked. Point tests at a throwaway DB via TEST_DATABASE_URL.

// Unique marker so we only ever touch rows this test created.
const tag = randomUUID();

let wsA = '';
let wsB = '';
let userA = '';
let userB = '';
let docA = '';
let docB = '';
let convoA = '';
let convoB = '';

// A 1536-dim embedding (matches the pgvector column) for B's seed chunk, plus a
// query vector — used to prove search_documents can't reach across tenants.
const vecLiteral = `[${Array(1536).fill(0.0125).join(',')}]`;
const queryVector = Array<number>(1536).fill(0.0125);

beforeAll(async () => {
  await bypassRls(async (tx) => {
    const a = await tx.workspace.create({ data: { name: `iso-A-${tag}` } });
    const b = await tx.workspace.create({ data: { name: `iso-B-${tag}` } });
    wsA = a.id;
    wsB = b.id;

    const ua = await tx.user.create({
      data: { email: `a-${tag}@example.test`, passwordHash: 'x', workspaceId: wsA, role: 'ADMIN' },
    });
    const ub = await tx.user.create({
      data: { email: `b-${tag}@example.test`, passwordHash: 'x', workspaceId: wsB, role: 'ADMIN' },
    });
    userA = ua.id;
    userB = ub.id;

    const da = await tx.document.create({
      data: { workspaceId: wsA, filename: 'a.pdf', storageKey: `seed/${tag}/a`, mimeType: 'application/pdf' },
    });
    const db = await tx.document.create({
      data: { workspaceId: wsB, filename: 'b.pdf', storageKey: `seed/${tag}/b`, mimeType: 'application/pdf' },
    });
    docA = da.id;
    docB = db.id;

    const ca = await tx.conversation.create({ data: { workspaceId: wsA, userId: ua.id, title: `convo-A-${tag}` } });
    const cb = await tx.conversation.create({ data: { workspaceId: wsB, userId: ub.id, title: `convo-B-${tag}` } });
    convoA = ca.id;
    convoB = cb.id;
    await tx.message.create({ data: { conversationId: convoA, role: 'USER', content: 'message in A' } });
    await tx.message.create({ data: { conversationId: convoB, role: 'USER', content: 'message in B' } });

    // B gets one embedded chunk (raw SQL — Prisma can't bind vector). Cascades
    // away when docB is deleted in afterAll. Lets us prove the agent's vector
    // search is tenant-scoped.
    await tx.$executeRawUnsafe(
      `INSERT INTO "Chunk" (id, "documentId", "workspaceId", content, embedding)
       VALUES ($1, $2, $3, 'chunk in B', $4::vector)`,
      randomUUID(),
      docB,
      wsB,
      vecLiteral,
    );

    // Usage events in both workspaces, to prove the /api/usage aggregation
    // (groupBy + _sum) can't sum across tenants.
    await tx.usageEvent.create({ data: { workspaceId: wsA, kind: 'CHAT', tokensIn: 100, tokensOut: 50, costUsd: 0.01 } });
    await tx.usageEvent.create({ data: { workspaceId: wsB, kind: 'CHAT', tokensIn: 999, tokensOut: 999, costUsd: 9.99 } });
  });
});

afterAll(async () => {
  await bypassRls(async (tx) => {
    await tx.usageEvent.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await tx.conversation.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } }); // cascades messages
    await tx.document.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await tx.user.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await tx.workspace.deleteMany({ where: { id: { in: [wsA, wsB] } } });
  });
  await prisma.$disconnect();
});

describe('multi-tenant isolation (RLS backstop)', () => {
  it('scoped to A: an unfiltered findMany returns only A rows', async () => {
    const docs = await withWorkspace(wsA, (tx) => tx.document.findMany());
    const ids = docs.map((d) => d.id);
    expect(ids).toContain(docA);
    expect(ids).not.toContain(docB);
  });

  it("scoped to A: reading B's document by id is not found (404 semantics)", async () => {
    // findUnique silently ignores any workspace filter — RLS is what blocks it.
    const doc = await withWorkspace(wsA, (tx) => tx.document.findUnique({ where: { id: docB } }));
    expect(doc).toBeNull();
  });

  it('scoped to B: cannot see A rows', async () => {
    const docs = await withWorkspace(wsB, (tx) => tx.document.findMany());
    const ids = docs.map((d) => d.id);
    expect(ids).toContain(docB);
    expect(ids).not.toContain(docA);
  });

  it('no workspace scope and no bypass: tenant tables are not readable', async () => {
    // A bare query (no withWorkspace/bypassRls) has app.workspace_id unset, so
    // RLS default-denies every row.
    const docs = await prisma.document.findMany({ where: { storageKey: { contains: tag } } });
    expect(docs).toHaveLength(0);
  });

  it("scoped to A: WITH CHECK rejects inserting a Chunk tagged with B's workspaceId", async () => {
    await expect(
      withWorkspace(
        wsA,
        (tx) =>
          tx.$executeRaw`INSERT INTO "Chunk" (id, "documentId", "workspaceId", content)
            VALUES (${randomUUID()}, ${docB}, ${wsB}, 'cross-tenant leak attempt')`,
      ),
    ).rejects.toThrow();
  });

  it("scoped to A: updating B's document affects 0 rows (write isolation)", async () => {
    const res = await withWorkspace(wsA, (tx) =>
      tx.document.updateMany({ where: { id: docB }, data: { filename: 'hacked.pdf' } }),
    );
    expect(res.count).toBe(0);
  });

  it("scoped to A: cannot read B's messages (Message is scoped via its parent Conversation)", async () => {
    const messages = await withWorkspace(wsA, (tx) => tx.message.findMany());
    const convoIds = messages.map((m) => m.conversationId);
    expect(convoIds).toContain(convoA);
    expect(convoIds).not.toContain(convoB);
  });

  it("scoped to A: WITH CHECK rejects inserting a Message into B's conversation", async () => {
    await expect(
      withWorkspace(wsA, (tx) =>
        tx.message.create({ data: { conversationId: convoB, role: 'USER', content: 'cross-tenant leak' } }),
      ),
    ).rejects.toThrow();
  });

  // Phase 5: the agent's search_documents and history-load paths must not leak
  // across tenants. These exercise the exported functions directly.
  it("agent search_documents (searchWorkspaceChunks) scoped to A can't see B's chunk", async () => {
    const fromA = await searchWorkspaceChunks(wsA, queryVector, 5);
    expect(fromA.every((c) => c.documentId !== docB)).toBe(true);
    // Sanity: B can see its own chunk, so the seed/query are valid.
    const fromB = await searchWorkspaceChunks(wsB, queryVector, 5);
    expect(fromB.some((c) => c.documentId === docB)).toBe(true);
  });

  it("agent loadHistory scoped to A returns nothing for B's conversation", async () => {
    const history = await loadHistory(wsA, convoB, 20);
    expect(history).toHaveLength(0);
  });

  it('usage summary (groupBy + _sum) scoped to A excludes B usage events', async () => {
    const summary = await getUsageSummary(wsA);
    // A seeded 100/50; B's 999/999 must not bleed into the aggregate.
    expect(summary.totalTokensIn).toBe(100);
    expect(summary.totalTokensOut).toBe(50);
    expect(summary.totalCostUsd).toBeCloseTo(0.01, 6);
  });

  it('member roster scoped to A excludes B users', async () => {
    const members = await listMembers(wsA);
    const ids = members.map((m) => m.id);
    expect(ids).toContain(userA);
    expect(ids).not.toContain(userB);
  });

  it("admin in A cannot change role of B's user (404)", async () => {
    // Caller is A's admin (passes the freshness check); target is B's user.
    await expect(updateMemberRole(wsA, userA, userB, 'MEMBER')).rejects.toMatchObject({ status: 404 });
  });

  it("admin in A cannot remove B's user (404)", async () => {
    await expect(removeMember(wsA, userA, userB)).rejects.toMatchObject({ status: 404 });
  });
});
