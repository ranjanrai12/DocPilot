---
name: tenant-scoping
description: >-
  How to correctly scope any data access to a workspace in DocPilot, and how to write the
  cross-tenant isolation test. Use whenever you add or change a service that queries a tenant-owned
  table (User, Document, Chunk, Conversation, Message, UsageEvent), add a route that reads/writes
  tenant data, or wire tenant-scoping middleware. This is the project's #1 non-negotiable rule
  (CLAUDE.md, docs/02 §7). Apply it while building; the tenant-isolation-auditor agent verifies after.
---

# Tenant scoping (DocPilot)

Multi-tenancy is **defense in depth** (docs/02-architecture.md §7): explicit `workspaceId` scoping in
services is the primary control; Postgres RLS is the backstop. Build with both in mind.

## The rules

1. **`workspaceId` comes only from the verified JWT** (`req.user.workspaceId`) — never from the request
   body, query, or params. Letting the client pick its own `workspaceId` is a critical vulnerability.
2. **Every service method that touches a tenant-owned table takes `workspaceId` as an explicit argument**
   and puts it in the Prisma `where` clause. No exceptions.
3. **Cross-tenant access returns 404 `NOT_FOUND`, not 403** (docs/07) — so existence isn't leaked.
4. A **test must prove** workspace A cannot read workspace B's data.

## The pattern

**Controller** — pull scope from the token, pass it down:
```ts
export async function getDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.user!;            // from verified JWT, never req.params/body
    const document = await documentService.getById(workspaceId, req.params.id);
    res.json({ document });
  } catch (err) { next(err); }
}
```

**Service** — scope by `workspaceId` AND id; missing row → 404 (not found vs. not-in-workspace are
indistinguishable to the caller, which is the point):
```ts
export async function getById(workspaceId: string, id: string) {
  const document = await prisma.document.findFirst({ where: { id, workspaceId } });
  if (!document) {
    const err = new Error('Document not found.') as Error & { status: number; code: string };
    err.status = 404; err.code = 'NOT_FOUND';
    throw err;
  }
  return document;
}
```

> Use `findFirst({ where: { id, workspaceId } })`, **not** `findUnique({ where: { id } })`. `findUnique`
> can only key on unique fields and silently ignores the `workspaceId` filter — a classic leak.

For writes (`update`/`delete`), scope the same way — prefer `updateMany`/`deleteMany` with
`{ id, workspaceId }` and check the returned `count`, or read-then-act inside the service so a
cross-tenant id can't mutate another workspace's row.

## RLS backstop (when enabling it)

RLS policies on tenant tables filter on a per-connection setting (e.g. `SET app.workspace_id = ...`).
It is the real security boundary; the app-layer filter is the primary control. A Prisma Client Extension
(`$extends`) may auto-inject the filter as a *convenience* — it is not the boundary. If RLS is being
deferred to a later phase, record that in `DECISIONS.md`.

## The isolation test (required)

Create a test that seeds two workspaces and asserts no cross-read. Sketch:
```ts
// arrange: workspace A with a document; workspace B with none
const a = await createWorkspaceWithUser();
const b = await createWorkspaceWithUser();
const doc = await documentService.create(a.workspaceId, /* ... */);

// act + assert: B cannot read A's document — must behave as "not found" (404), not 403
await expect(documentService.getById(b.workspaceId, doc.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
```
Add one such test per tenant-owned resource as you build it. This is a Phase 1 "Done when" gap today.

## Before you finish

Run the **tenant-isolation-auditor** agent over the change to confirm every query is scoped and the
404-not-403 rule holds.
