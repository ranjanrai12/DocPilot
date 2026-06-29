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

beforeAll(async () => {
  await bypassRls(async (tx) => {
    const a = await tx.workspace.create({ data: { name: `iso-A-${tag}` } });
    const b = await tx.workspace.create({ data: { name: `iso-B-${tag}` } });
    wsA = a.id;
    wsB = b.id;

    await tx.user.create({
      data: { email: `a-${tag}@example.test`, passwordHash: 'x', workspaceId: wsA, role: 'ADMIN' },
    });
    await tx.user.create({
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
  });
});

afterAll(async () => {
  await bypassRls(async (tx) => {
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
});
