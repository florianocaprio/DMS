---
name: First-run setup (bootstrap) mode
description: How the DMS decides it needs first-run setup and how that mode locks down.
---

# First-run setup (bootstrap) mode

On a fresh install the app must be enterable with NO account, but only to create
the system's users; once an administrator exists, access requires credentials.

**Rule:** setup mode is active iff **no `users` row with `role='admin'` exists**
(`adminExists()` in `artifacts/api-server/src/lib/bootstrap.ts`). The trigger for
lockdown is the existence of an admin row — nothing persistent/flag-based.

**How to apply:**
- The bootstrap endpoints `GET/POST /api/auth/bootstrap` are PUBLIC (in
  `requireAuth`'s `PUBLIC_PATHS`) but self-gate: `POST` returns 403 once an admin
  exists. They never grant an app session — setup users are created via these
  public endpoints, then the user logs in normally. This avoids needing a
  synthetic/bootstrap user id for the many NOT NULL `created_by`-style FKs.
- `POST` returns `{ user, setupComplete }`; `setupComplete` is true when the
  created role is `admin`. The frontend (`SetupScreen` in `App.tsx`) lets you add
  several users and, on the first admin, shows a completion screen → reload →
  login flow.
- There is intentionally **no boot-time admin auto-seed** (the old
  `ensureLocalAdmin` boot-time seeding was removed; auto-creating an admin is
  incompatible with "first run has no account").
- The bootstrap creation is atomic: a transaction takes a Postgres advisory lock
  (`pg_advisory_xact_lock`) and re-checks admin existence inside the lock before
  inserting, so concurrent requests can't create extra accounts after the first
  admin commits.

**Why:** user requirement — clone the repo, run with an empty DB, enter without
login, create the users (≥1 admin), then it locks to credential-only access.
