import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma, withWorkspace, bypassRls } from './lib/prisma.js';

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
let docA = '';
let docB = '';
let convoA = '';
let convoB = '';

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
  });
});

afterAll(async () => {
  await bypassRls(async (tx) => {
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
});
