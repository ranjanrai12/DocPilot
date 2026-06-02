---
description: Scaffold a new Express feature module (routes → controller → service + zod schema)
argument-hint: <module-name>
---

Scaffold a new backend feature module named **$1** following this project's locked conventions
(see `CLAUDE.md` and `docs/02-architecture.md`). Group by feature, not by layer.

If no module name was provided (`$1` is empty), stop and ask me for the module name before doing anything.

Create these files under `apps/api/src/modules/$1/`:

1. **`$1.schema.ts`** — zod schemas for this module's request inputs (export the schemas and their
   inferred TypeScript types). Validation lives here; controllers parse with these.

2. **`$1.service.ts`** — business logic. Functions are pure-ish and take the caller's `workspaceId`
   as an explicit argument so every DB query can be tenant-scoped. No Express `req`/`res` here.
   Calls Prisma directly (no repository layer yet — that's deferred per the architecture doc).

3. **`$1.controller.ts`** — thin HTTP layer. Each handler: validates input with the module's zod
   schema, calls the service, and sends the response using the standard shapes. No business logic.
   On error, forward to the central error middleware (the standard error shape is in
   `docs/07-api-spec.md`).

4. **`$1.routes.ts`** — an Express `Router` that wires paths to controller handlers, applying auth /
   tenant-scoping / role middleware as appropriate. Export the router as default.

Requirements:
- TypeScript throughout; import shared types from `@docpilot/shared` rather than duplicating them.
- Keep imports extension-less (the project uses `moduleResolution: Bundler`).
- Add stubs that **typecheck cleanly** (`pnpm --filter api typecheck`), even if handlers are
  placeholders returning `501`/TODO for now.
- Tenant safety: any data access must include an explicit `workspaceId` filter — never query a
  tenant-owned table without it.
- After creating the files, remind me to register the new router in the API's main route setup, and
  show the small snippet to add.

If a module folder named `$1` already exists, stop and tell me instead of overwriting it.
