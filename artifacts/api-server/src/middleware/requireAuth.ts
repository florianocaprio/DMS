import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { clearLocalSessionCookies, isSessionInactive, readLocalSessionUserId } from "../lib/localSession";

// Paths (relative to the /api mount) reachable without authentication. The
// /auth/* endpoints implement the local login / first-run setup flow themselves.
const PUBLIC_PATHS = new Set([
  "/healthz",
  "/auth/login",
  "/auth/logout",
  "/auth/session",
  // First-run setup: status probe + first-admin registration while no admin
  // with a password exists. The POST handler enforces that server-side.
  "/auth/bootstrap",
]);

// Protected paths a user with a pending forced password change may reach.
// Activity refresh is allowed so a user is not logged out while typing the new
// password form.
const PASSWORD_CHANGE_ALLOWED_PATHS = new Set(["/auth/change-password", "/auth/activity"]);

/**
 * Express middleware: requires a valid local session (the signed `pd_session`
 * cookie set by /auth/login or /auth/bootstrap) and exposes the resolved user
 * on `req.currentUser` / `req.currentUserId`. Public paths are skipped.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (PUBLIC_PATHS.has(req.path)) {
    next();
    return;
  }

  const id = readLocalSessionUserId(req);
  if (!id) {
    res.status(401).json({ error: "Autenticazione richiesta" });
    return;
  }
  if (isSessionInactive(req)) {
    clearLocalSessionCookies(req, res);
    res.status(401).json({ error: "Sessione scaduta per inattività", reason: "SESSION_IDLE_TIMEOUT" });
    return;
  }

  const [row] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!row || !row.isActive) {
    clearLocalSessionCookies(req, res);
    res.status(401).json({ error: "Autenticazione richiesta" });
    return;
  }

  req.currentUser = { id: row.id, email: row.email, name: row.name, role: row.role };
  req.currentUserId = row.id;

  // Forced password change: block all protected routes except the
  // change-password endpoint until the user sets a new password.
  if (row.mustChangePassword && !PASSWORD_CHANGE_ALLOWED_PATHS.has(req.path)) {
    res.status(403).json({ error: "Cambio password obbligatorio prima di continuare", mustChangePassword: true });
    return;
  }

  next();
}
