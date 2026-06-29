// One-time (idempotent) setup: create the least-privilege runtime DB role.
//
// Why: the Supabase `postgres` role has BYPASSRLS, so it ignores every RLS
// policy — connecting the app as `postgres` would defeat the tenant backstop.
// The API runtime instead connects as `docpilot_app` (NOBYPASSRLS), which is
// subject to RLS. Migrations still run as the owner (`postgres`) via DATABASE_URL.
//
// Run as the owner:  node scripts/setup-app-role.mjs
// Requires DATABASE_URL (owner) and APP_DB_PASSWORD in the environment.

import { PrismaClient } from '@prisma/client';

const password = process.env.APP_DB_PASSWORD;
if (!password) {
  console.error('Set APP_DB_PASSWORD before running.');
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  // Create or update the role (idempotent). Password is interpolated as a
  // quoted literal — it is generated hex (no special chars), set by us, not user input.
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'docpilot_app') THEN
        CREATE ROLE docpilot_app WITH LOGIN NOBYPASSRLS PASSWORD '${password}';
      ELSE
        ALTER ROLE docpilot_app WITH LOGIN NOBYPASSRLS PASSWORD '${password}';
      END IF;
    END
    $$;
  `);

  // Least-privilege: DML on current + future tables, no DDL, no bypass.
  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO docpilot_app;`);
  await prisma.$executeRawUnsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO docpilot_app;`,
  );
  await prisma.$executeRawUnsafe(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO docpilot_app;`,
  );
  // Future tables/sequences created by the owner are auto-granted.
  await prisma.$executeRawUnsafe(
    `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO docpilot_app;`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO docpilot_app;`,
  );

  // pgvector lives in the `extensions` schema on Supabase. The role needs both
  // USAGE on that schema and `extensions` on its search_path so `::vector` casts
  // and the `<=>` operator resolve unqualified (and the HNSW index is usable).
  // Create the schema if missing so a fresh DB (local/CI) can run the pgvector
  // migration, which assumes `extensions` exists.
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS extensions;`);
  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA extensions TO docpilot_app;`);
  await prisma.$executeRawUnsafe(
    `ALTER ROLE docpilot_app SET search_path = "$user", public, extensions;`,
  );

  const check = await prisma.$queryRawUnsafe(
    `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'docpilot_app'`,
  );
  console.log('docpilot_app ready:', JSON.stringify(check));
} catch (e) {
  console.error('SETUP FAIL:', e.message);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
