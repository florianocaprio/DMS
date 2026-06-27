import { db, usersTable } from "@workspace/db";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";

// Identity of the default administrator seeded on a fresh install. The password
// is intentionally left unset so the first visitor must choose it via the public
// /auth/bootstrap endpoints (see routes/auth.ts).
export const DEFAULT_ADMIN_USERNAME = "admin";
export const DEFAULT_ADMIN_EMAIL = "admin@local";
export const DEFAULT_ADMIN_NAME = "Amministratore";

export type AdminAwaitingSetup = typeof usersTable.$inferSelect;

/**
 * First-run setup is active while a LOCAL administrator account exists that has
 * no password yet — the seeded default admin. Clerk/Google admins are excluded
 * (they have a null username and authenticate via SSO, never a password), so an
 * existing SSO-only deployment is never mistaken for "needs setup". Once the
 * password is set the account is configured and the public bootstrap endpoints
 * lock themselves; access then requires real credentials. When several pending
 * admins somehow exist, the lowest id wins so the choice is deterministic.
 */
export async function getAdminAwaitingPasswordSetup(): Promise<AdminAwaitingSetup | null> {
  const [row] = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.role, "admin"),
        isNull(usersTable.passwordHash),
        isNotNull(usersTable.username),
      ),
    )
    .orderBy(asc(usersTable.id))
    .limit(1);
  return row ?? null;
}
