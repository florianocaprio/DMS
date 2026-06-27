---
name: Clerk auth + current-user replacement
description: Durable lessons for the DMS Clerk SSO setup and replacing a hardcoded current user across routes
---

# Clerk SSO + replacing the hardcoded current user

**Replacing a hardcoded current user is not just a numeric-literal search.** The hardcoded identity
can hide behind a named module-level constant, not only `id: 1` / `=== 1`. Grep for named constants
(USER_ID, CURRENT_USER, etc.) as well, or you will leave broken access control behind.
**Why:** a leftover `CURRENT_USER_ID = 1` in a protected route means any authenticated user acts as
user 1 and real users can't act on their own items — a code review caught exactly this miss.

**Auth chain ordering matters.** The Clerk proxy middleware must run before body parsers; `requireAuth`
must run before audit logging so the audit layer sees the resolved user. Because every protected route
sits behind `requireAuth`, the resolved current-user id is safe to treat as non-null inside handlers.

**System actors are not "the current user."** Non-request-scoped writes (automated workflow-engine
signature requests, test seed helpers) legitimately keep a fixed actor id and must NOT be swapped to a
request user — there is no request context for them.

## `@clerk/react` dual API trap
`@clerk/react` (not `@clerk/clerk-react`) has two entrypoints. The default export uses the new "signals"
API where `useSignIn()` lacks `isLoaded` and `authenticateWithRedirect`. For the classic OAuth redirect
flow import `useSignIn` from `@clerk/react/legacy`; both entrypoints share the same `<ClerkProvider>`.
**Why:** typecheck fails cryptically (`SignInSignalValue` / `SignInFutureResource`) if you assume the
classic shape on the default import.

## Deep-link return after SSO
To return a user to their originally requested route after OAuth, pass that route as
`redirectUrlComplete` on `authenticateWithRedirect`, and use the *Fallback* (not *Force*) redirect-url
props on the callback component — Force props override the per-attempt completion URL and discard the
deep link.
