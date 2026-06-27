import { vi } from "vitest";

/**
 * Test-only Clerk shim.
 *
 * The real auth chain (see middleware/clerkAuth.ts) resolves the authenticated
 * user from a Clerk session. Integration tests don't have one, so we replace
 * `@clerk/express` with a shim that derives the Clerk user id from a request
 * header (`x-test-clerk-user-id`). Requests without that header resolve to no
 * session, exercising the genuine 401 path.
 *
 * `resolveLocalUser` looks up the local row by `clerkUserId` first (the "stable
 * mapping" branch), so as long as tests seed users with a known `clerkUserId`,
 * `clerkClient.users.getUser` is never reached — it throws here to make any
 * accidental reliance on the network obvious.
 */
vi.mock("@clerk/express", () => ({
  clerkMiddleware:
    () =>
    (_req: unknown, _res: unknown, next: () => void): void =>
      next(),
  getAuth: (req: { headers: Record<string, string | string[] | undefined> }) => {
    const header = req.headers["x-test-clerk-user-id"];
    const userId = Array.isArray(header) ? header[0] : header;
    return { userId: userId ?? null };
  },
  clerkClient: {
    users: {
      getUser: async () => {
        throw new Error(
          "clerkClient.users.getUser must not be called in tests — seed users with a clerkUserId so resolveLocalUser finds them via the stable mapping",
        );
      },
    },
  },
}));
