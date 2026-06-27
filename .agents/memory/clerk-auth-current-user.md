---
name: Local auth + current-user replacement
description: Durable lessons for the DMS local-only auth chain and replacing a hardcoded current user across routes.
---

# Local auth + replacing the hardcoded current user

Auth is **local-only** now (signed `pd_session` cookie via `requireAuth`); Clerk
and Google SSO were removed entirely (deps, middleware, proxy, and the
`clerkUserId` column all dropped). Tests authenticate by signing a `pd_session`
cookie with `cookie-signature` + `SESSION_SECRET` (see `__tests__/helpers.ts`
`agentFor(userId)`), not by a header shim.

**Replacing a hardcoded current user is not just a numeric-literal search.** The
hardcoded identity can hide behind a named module-level constant, not only
`id: 1` / `=== 1`. Grep for named constants (USER_ID, CURRENT_USER, etc.) too.
**Why:** a leftover `CURRENT_USER_ID = 1` in a protected route means any
authenticated user acts as user 1 and real users can't act on their own items —
a code review caught exactly this miss.

**Auth chain ordering matters.** `cookie-parser` (with the signing secret) must
run before `requireAuth`, and `requireAuth` must run before audit logging so the
audit layer sees the resolved user. Because every protected route sits behind
`requireAuth`, the resolved current-user id is safe to treat as non-null inside
handlers.

**System actors are not "the current user."** Non-request-scoped writes
(automated workflow-engine signature requests, test seed helpers) legitimately
keep a fixed actor id and must NOT be swapped to a request user — there is no
request context for them.
