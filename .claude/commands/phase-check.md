---
description: Verify the current phase is green — runs typecheck + build (+ tests when present)
allowed-tools: Bash(pnpm typecheck:*), Bash(pnpm build:*), Bash(pnpm test:*)
---

Verify the project is in a healthy, shippable state for the current roadmap phase.

Run, from the repo root:
1. `pnpm typecheck` — all packages typecheck cleanly.
2. `pnpm build` — all packages build.
3. `pnpm test` — only if real tests exist yet (skip the no-op stubs).

Then report a concise summary:
- ✅ / ❌ for each step, with the key error lines if anything fails.
- If everything passes, state which roadmap phase's "Done when" criterion this satisfies
  (cross-reference `docs/05-roadmap.md`).
- If something fails, propose the smallest fix — do not make changes unless I ask.
