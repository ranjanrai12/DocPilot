-- Multi-tenant Row-Level Security (RLS) backstop.
--
-- Primary tenant isolation is the explicit `where: { workspaceId }` filter in
-- every service (see the tenant-scoping skill). RLS is the *backstop*: even a
-- query that forgets that filter cannot read another workspace's rows.
--
-- Mechanism: each tenant table gets a policy gated on a per-transaction setting,
-- `app.workspace_id`, supplied by `withWorkspace()` in lib/prisma. Pre-tenant
-- auth lookups (login/signup find a user before a workspace is known) run under
-- `app.bypass_rls = 'on'` via `bypassRls()`.
--
-- FORCE is required: Prisma connects as the table owner, and owners are exempt
-- from plain (non-forced) RLS. `current_setting(name, true)` returns NULL when
-- the setting is unset, so an unscoped query is default-denied
-- (`workspaceId = NULL` yields no rows).
--
-- Note: Prisma maps `String @default(uuid())` to a TEXT column (not Postgres
-- `uuid`), and `current_setting` returns text, so comparisons are text = text —
-- no casts.

-- Workspace — scoped on its own id (it has no workspaceId column).
ALTER TABLE "Workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Workspace" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Workspace"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "id" = current_setting('app.workspace_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "id" = current_setting('app.workspace_id', true)
  );

-- User
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "User"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "workspaceId" = current_setting('app.workspace_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "workspaceId" = current_setting('app.workspace_id', true)
  );

-- Document
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Document"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "workspaceId" = current_setting('app.workspace_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "workspaceId" = current_setting('app.workspace_id', true)
  );

-- Chunk
ALTER TABLE "Chunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Chunk" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Chunk"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "workspaceId" = current_setting('app.workspace_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "workspaceId" = current_setting('app.workspace_id', true)
  );

-- Conversation
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Conversation"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "workspaceId" = current_setting('app.workspace_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "workspaceId" = current_setting('app.workspace_id', true)
  );

-- UsageEvent
ALTER TABLE "UsageEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UsageEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "UsageEvent"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "workspaceId" = current_setting('app.workspace_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "workspaceId" = current_setting('app.workspace_id', true)
  );

-- Message — no workspaceId column; scoped through its parent Conversation.
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Message"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Conversation" c
      WHERE c."id" = "Message"."conversationId"
        AND c."workspaceId" = current_setting('app.workspace_id', true)
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Conversation" c
      WHERE c."id" = "Message"."conversationId"
        AND c."workspaceId" = current_setting('app.workspace_id', true)
    )
  );
