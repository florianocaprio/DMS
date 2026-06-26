---
name: Seed via scripts package
description: Database seeding must run via the @workspace/scripts package; running node -e at root fails because pg is not installed there.
---

The `pg` package is only installed inside workspace packages (e.g. `@workspace/db`). Running `node -e "require('pg')"` at the monorepo root always throws `MODULE_NOT_FOUND`.

**Why:** pnpm hoisting does not make `pg` available at the root level unless explicitly added to root dependencies.

**How to apply:** 
- Seed script lives at `scripts/src/seed.ts` and imports from `@workspace/db`.
- Run with: `pnpm --filter @workspace/scripts run seed`
- The scripts package has `@workspace/db` as a `dependencies` entry.
