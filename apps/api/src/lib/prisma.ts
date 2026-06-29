import { PrismaClient, Prisma } from '@prisma/client';

// Singleton pattern — reuse the same client across hot-reloads in dev.
// In Node.js each module is cached, so this runs once per process.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Runtime connects as the least-privilege `docpilot_app` role (NOBYPASSRLS) so
// RLS is actually enforced. Migrations run separately as the owner via
// DATABASE_URL. Falls back to DATABASE_URL only if APP_DATABASE_URL is unset.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// --- Multi-tenancy: RLS session helpers ---------------------------------------
//
// The `enable_rls` migration gates every tenant table on a per-transaction
// Postgres setting, `app.workspace_id`. These helpers set that setting and run
// the work inside the SAME transaction, so RLS is the real security boundary —
// not just the explicit `where: { workspaceId }` filter in services.
//
// `set_config(name, value, true)` makes the setting transaction-LOCAL: it can
// never leak to the next request on a pooled connection. Always use these
// helpers (never a bare `SET`) for tenant-scoped work.

/**
 * Run `fn` scoped to a single workspace. Inside the callback, RLS restricts
 * every tenant table to rows belonging to `workspaceId`, even for queries that
 * forget an explicit `where: { workspaceId }` filter.
 */
export function withWorkspace<T>(
  workspaceId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.workspace_id', ${workspaceId}, true)`;
    return fn(tx);
  });
}

/**
 * Run `fn` with RLS bypassed. ONLY for trusted, pre-tenant operations that must
 * look across workspaces before a workspace is known — i.e. auth lookups by
 * email/id (login, signup, refresh). Never use this for request-scoped reads of
 * tenant data; use `withWorkspace` for those.
 */
export function bypassRls<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
    return fn(tx);
  });
}

// Boot-time guard: the runtime role must NOT be able to bypass RLS, or the entire
// tenant-isolation backstop is silently a no-op (e.g. if APP_DATABASE_URL is unset
// and we fall back to the owner role). Refuses to boot in production; warns in dev.
export async function assertRlsEnforced(): Promise<void> {
  try {
    const rows = await prisma.$queryRawUnsafe<
      { role: string; superuser: boolean; bypassrls: boolean }[]
    >(
      `select current_user as role,
              (current_setting('is_superuser') = 'on') as superuser,
              coalesce((select rolbypassrls from pg_roles where rolname = current_user), false) as bypassrls`,
    );
    const row = rows[0];
    if (!row || !(row.superuser || row.bypassrls)) return;

    const msg = `runtime DB role "${row.role}" can BYPASS RLS (superuser=${row.superuser}, bypassrls=${row.bypassrls}); the tenant-isolation backstop is DISABLED. Point APP_DATABASE_URL at the least-privilege docpilot_app role.`;
    if (process.env.NODE_ENV === 'production') {
      console.error(`❌ ${msg}`);
      process.exit(1);
    }
    console.warn(`⚠️  ${msg}`);
  } catch (err) {
    // Don't block boot on a transient DB error — the health endpoint covers DB status.
    console.warn('⚠️  Could not verify RLS enforcement:', err instanceof Error ? err.message : err);
  }
}
