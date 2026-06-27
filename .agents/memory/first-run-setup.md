---
name: First-run admin registration
description: How the DMS first-run flow detects setup mode and registers the very first administrator (local-only auth).
---

# First-run admin registration

Auth is **local-only** (username/password + signed `pd_session` cookie); there is
no external SSO. There is no seeded default admin. Instead, the app is in "setup
mode" until the first administrator account is created, and the public
`/auth/bootstrap` endpoints let the first visitor **register** that admin (name,
username, password ≥8 chars, optional email defaulting to `${username}@local`),
auto-log-in via the session cookie, and then lock themselves.

## Setup-mode detection (the key invariant)
"Needs setup" = **no LOGIN-CAPABLE administrator exists**. Login-capable means
ALL of: `role='admin'`, `passwordHash IS NOT NULL`, `isActive=true`, and a
non-null `username`. If zero such rows → setupMode = true.

**Why all four clauses (not just "has a password"):** the predicate gates both
whether setup is open AND whether a usable admin already exists. If it only
checked `passwordHash IS NOT NULL`, an admin that is inactive or has no username
would count as "configured" yet could not actually log in — leaving the app
permanently locked out (no login possible, setup refuses to re-open). Requiring
the row to be genuinely loginable means an unusable admin keeps setup open so a
real one can be (re)registered.

**How to apply:** keep the predicate in a single shared helper used by BOTH the
GET probe and the POST registration re-check — never inline it twice, or the two
drift. The POST re-checks inside a transaction guarded by `pg_advisory_xact_lock`
so concurrent first-run requests can't create two "first" admins; duplicate
username/email → 409, already-configured → 403.

## Testing against the shared dev DB
The bootstrap suite must force setup mode, so it **deletes all password-bearing
admins up front and restores them at the end** — keep that snapshot/restore or it
wipes real dev admin accounts. Test usernames must satisfy the endpoint's length
cap (the long `uniqueSuffix()` overflows it).
