---
name: vitest setup for api-server integration tests
description: How vitest must be configured to run TS integration tests against the Express app + workspace packages
---

# Vitest integration tests in @workspace/api-server

The repo's first test runner lives in `@workspace/api-server` (vitest + supertest, tests in `src/__tests__/*.test.ts`, run via `pnpm --filter @workspace/api-server run test`).

Two non-obvious requirements for it to work:

- **Inline workspace packages.** `@workspace/db` (and other `@workspace/*`) export raw TypeScript via their package `exports` map (e.g. `"./src/index.ts"`). Vite/vitest externalizes node_modules by default, which makes Node try to import the `.ts` file and crash. Fix: `test.server.deps.inline: [/@workspace\//]` so Vite transforms them.
- **Tests hit the real dev Postgres DB.** No FK constraints are declared in the schema, and Drive sync is disabled by default (and error-swallowed), so integration tests touch only Postgres. Create fixtures via direct DB inserts with unique `number`/`code` values, exercise behaviour through the HTTP API (supertest on the exported `app` from `app.ts`, which does not call `listen`), and clean up tracked rows in `afterAll`. Set `fileParallelism: false` and `LOG_LEVEL=silent`.

**Why:** rediscovering the inline-deps requirement and the app-vs-index split (cron/`listen` live in `index.ts`, not `app.ts`) costs real time.

**How to apply:** when adding more backend tests, reuse `src/__tests__/helpers.ts` (Fixtures tracker + `ensureCurrentUser` since routes hardcode user id=1) rather than re-deriving the config.
