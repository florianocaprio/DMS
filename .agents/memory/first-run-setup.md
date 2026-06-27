---
name: First-run default-admin setup
description: How the DMS first-run "set the admin password" flow detects setup mode and why it excludes SSO admins.
---

# First-run default-admin setup

On boot, if **no** admin exists, the API seeds a default admin with `username` set
and `passwordHash = NULL` (a passwordless local account). On first access the app
shows a "set password" screen (no login needed); the public POST `/auth/bootstrap`
sets the password (≥8 chars), auto-logs-in via the signed session cookie, and
locks itself. After that, access requires credentials.

## Setup-mode detection (the key invariant)
"Needs setup" = a LOCAL admin awaiting a password:
`role='admin' AND passwordHash IS NULL AND username IS NOT NULL` (lowest id wins).

**Why the `username IS NOT NULL` clause matters:** Clerk/Google SSO admins
legitimately have `passwordHash = NULL` (they never use a password) AND a null
username. Detecting setup mode on null-password alone would wrongly flag an
SSO-only deployment as "needs setup". Requiring a non-null username scopes
detection to the seeded local default admin only.

**How to apply:** keep the same predicate in lockstep across the GET probe, the
POST set-password transaction, and the `ensureDefaultAdmin` seed guard. The seed
only runs when zero admins exist, so configured deployments (dev DB with Clerk
admins) are never touched and never enter setup mode.

## Startup ordering (don't regress)
`ensureDefaultAdmin()` must complete **before** `app.listen` serves traffic.
**Why:** the frontend probes `/auth/bootstrap` once on mount; if seeding is
fire-and-forget in the listen callback, a cold-start first visitor can race and
get dropped into normal login instead of the set-password screen until a manual
reload.
