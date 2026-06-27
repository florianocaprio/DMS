import { db, usersTable } from "@workspace/db";
import { and, eq, isNotNull } from "drizzle-orm";

/**
 * The single source of truth for "an administrator who can actually log in
 * exists". Used both to detect setup mode (GET /auth/bootstrap) and to lock the
 * registration endpoint (POST /auth/bootstrap), so the two never drift.
 *
 * A login-capable admin must have role 'admin', a password set, be active, and
 * have a username (local login uses the username). Requiring all four prevents a
 * permanent lockout: if the only admin-with-password were inactive or had no
 * username, it could neither log in nor would setup re-open — leaving the app
 * inaccessible. Treating such a row as "not login-capable" keeps setup open so
 * the first usable admin can be (re)registered.
 */
export function loginCapableAdminCondition() {
  return and(
    eq(usersTable.role, "admin"),
    isNotNull(usersTable.passwordHash),
    eq(usersTable.isActive, true),
    isNotNull(usersTable.username),
  );
}

/**
 * First-run setup is active until at least one administrator able to log in
 * exists (see {@link loginCapableAdminCondition}). On a fresh/empty database (or
 * one that only has unusable rows) this returns true, and the public
 * /auth/bootstrap flow lets the first visitor register the initial administrator
 * and sign in. Once a usable admin exists, setup locks itself and access
 * requires real credentials.
 */
export async function isSetupMode(): Promise<boolean> {
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(loginCapableAdminCondition())
    .limit(1);
  return !row;
}
