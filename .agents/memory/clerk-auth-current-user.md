---
name: Clerk auth + current-user replacement
description: How auth is wired and the trap when replacing the hardcoded current user across routes
---

# Clerk SSO + replacing the hardcoded current user

The DMS uses Replit-managed Clerk (Google SSO, domain-restricted to @angeliinmoto.it). `requireAuth`
middleware runs before audit/router on all `/api` routes except PUBLIC_PATHS (/healthz) and sets
`req.currentUserId` / `req.currentUser`. Because every protected route runs behind it, `req.currentUserId!`
(non-null) is safe inside route handlers.

**Trap:** the hardcoded current user was NOT only literal `id: 1` / `=== 1`. One route module declared a
named module-level constant (`const CURRENT_USER_ID = 1`) and used it in `pendingForMe` filters and the
`act` participant lookup. A grep for `1` misses these. When replacing the current user, grep for named
constants too (e.g. `USER_ID`, `CURRENT_USER`), not just numeric literals — a code review caught the miss.

**Why:** leaving a `CURRENT_USER_ID = 1` constant in a protected route is broken access control: any
authenticated user acts as user 1, and real users can't act on their own pending items.

**How to apply:** when threading the authenticated user through routes, search for both numeric `1`
literals AND named constants; verify each handler is behind `requireAuth` before using `req.currentUserId!`.

## Frontend Clerk API gotcha
`@clerk/react` (not @clerk/clerk-react) has two entrypoints: the default index export uses the new
"signals" API where `useSignIn()` returns `SignInSignalValue` (no `isLoaded`, no
`signIn.authenticateWithRedirect`). For the classic OAuth redirect flow import
`useSignIn` from `@clerk/react/legacy` — it returns the classic `{ isLoaded, signIn }` with
`authenticateWithRedirect`. Both entrypoints share the same `<ClerkProvider>` context.

## System-actor exception
Automated, non-request-scoped writes legitimately keep a fixed system actor (id 1): the dossier workflow
engine's auto-created signature requests and test seed helpers. These are NOT "the current user" and were
intentionally left alone.
