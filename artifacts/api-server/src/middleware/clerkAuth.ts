import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Only members of this Google Workspace domain may access the application.
const ALLOWED_DOMAIN = "angeliinmoto.it";

// Paths (relative to the /api mount) that are reachable without authentication.
// The /auth/* endpoints handle the local login flow themselves.
const PUBLIC_PATHS = new Set(["/healthz", "/auth/login", "/auth/logout", "/auth/session"]);

// Signed cookie carrying the local-session user id (set by routes/auth.ts).
const LOCAL_SESSION_COOKIE = "pd_session";

// The only protected path a local user with a pending forced password change may
// reach (login/logout/session are already public). Everything else is blocked
// until the password is changed, so the forced-change gate is enforced server-side
// and not merely in the UI.
const PASSWORD_CHANGE_PATH = "/auth/change-password";

// Emails that are always provisioned (and kept) as system administrators.
const ADMIN_EMAILS = new Set(["info@angeliinmoto.it"]);

export class DomainNotAllowedError extends Error {
  constructor(email: string) {
    super(`L'accesso è riservato agli account @${ALLOWED_DOMAIN} (${email}).`);
    this.name = "DomainNotAllowedError";
  }
}

interface ResolvedUser {
  id: number;
  email: string;
  name: string;
  role: string;
}

// Cache the Clerk-user → local-user mapping so we don't hit Clerk's API (and
// re-verify the domain) on every request. Only positive (allowed) mappings are
// cached; rejected domains are never cached so they keep being rejected.
const userCache = new Map<string, ResolvedUser>();

function emailDomainAllowed(email: string): boolean {
  return email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

/**
 * Resolve the local `users` row for a Clerk user, provisioning it on first
 * login. Throws DomainNotAllowedError for emails outside the allowed domain.
 */
async function resolveLocalUser(clerkUserId: string): Promise<ResolvedUser> {
  const cached = userCache.get(clerkUserId);
  if (cached) return cached;

  // Stable mapping first: an already-linked local row needs no Clerk call.
  const [linked] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);

  if (linked) {
    if (!emailDomainAllowed(linked.email)) throw new DomainNotAllowedError(linked.email);
    await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, linked.id));
    const resolved: ResolvedUser = { id: linked.id, email: linked.email, name: linked.name, role: linked.role };
    userCache.set(clerkUserId, resolved);
    return resolved;
  }

  // First login for this Clerk identity: fetch profile from Clerk.
  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const primaryEmail =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress;

  if (!primaryEmail) throw new DomainNotAllowedError("");
  const email = primaryEmail.toLowerCase();
  if (!emailDomainAllowed(email)) throw new DomainNotAllowedError(email);

  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
    clerkUser.username ||
    email.split("@")[0];
  const avatarUrl = clerkUser.imageUrl || null;

  // Link to an existing row with the same email, otherwise create a new user.
  const [existingByEmail] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  const isAdmin = ADMIN_EMAILS.has(email);

  let row;
  if (existingByEmail) {
    [row] = await db
      .update(usersTable)
      .set({
        clerkUserId,
        lastLoginAt: new Date(),
        avatarUrl: existingByEmail.avatarUrl ?? avatarUrl,
        // Ensure designated admins keep the admin role; never downgrade others.
        ...(isAdmin ? { role: "admin" } : {}),
      })
      .where(eq(usersTable.id, existingByEmail.id))
      .returning();
  } else {
    [row] = await db
      .insert(usersTable)
      .values({ clerkUserId, email, name, avatarUrl, lastLoginAt: new Date(), ...(isAdmin ? { role: "admin" } : {}) })
      .returning();
  }

  const resolved: ResolvedUser = { id: row.id, email: row.email, name: row.name, role: row.role };
  userCache.set(clerkUserId, resolved);
  return resolved;
}

/**
 * Express middleware: requires a valid Clerk session, enforces the allowed
 * domain, and exposes the resolved local user on `req.currentUser` /
 * `req.currentUserId`. Public paths (e.g. healthcheck) are skipped.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (PUBLIC_PATHS.has(req.path)) {
    next();
    return;
  }

  // Local session (signed cookie) takes precedence over Clerk. This lets the
  // admin sign in with username/password without a Clerk/Google account.
  const localRaw = req.signedCookies?.[LOCAL_SESSION_COOKIE];
  if (localRaw) {
    const localId = Number(localRaw);
    if (!Number.isNaN(localId)) {
      const [row] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, localId))
        .limit(1);
      if (row && row.isActive) {
        req.currentUser = { id: row.id, email: row.email, name: row.name, role: row.role };
        req.currentUserId = row.id;
        // Forced password change: block all protected routes except the
        // change-password endpoint until the user sets a new password.
        if (row.mustChangePassword && req.path !== PASSWORD_CHANGE_PATH) {
          res.status(403).json({ error: "Cambio password obbligatorio prima di continuare", mustChangePassword: true });
          return;
        }
        next();
        return;
      }
    }
    // Invalid/stale local cookie: fall through to Clerk rather than hard-failing.
  }

  const auth = getAuth(req);
  const clerkUserId = auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Autenticazione richiesta" });
    return;
  }

  try {
    const user = await resolveLocalUser(clerkUserId);
    req.currentUser = user;
    req.currentUserId = user.id;
    next();
  } catch (err) {
    if (err instanceof DomainNotAllowedError) {
      res.status(403).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "Failed to resolve authenticated user");
    res.status(500).json({ error: "Errore di autenticazione" });
  }
}
