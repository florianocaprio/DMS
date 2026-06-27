import { db } from "@workspace/db";
import { dossiersTable, usersTable } from "@workspace/db";
import { and, eq, ne, asc } from "drizzle-orm";
import { logger } from "./logger";
import { hashPassword } from "./password";

const DEFAULT_DOSSIER_TITLE = "Archivio Documenti";

const LOCAL_ADMIN_USERNAME = "admin";
const LOCAL_ADMIN_EMAIL = "admin@angeliinmoto.it";
const LOCAL_ADMIN_NAME = "Amministratore";
const LOCAL_ADMIN_PASSWORD = "flocap!";

/**
 * Ensures a local admin account (username `admin`) exists with a password so the
 * app can be accessed without Clerk/Google. Idempotent: if the account already
 * exists it is reconciled to a working administrator state (role=admin, active,
 * and a password hash present), without clobbering an existing/changed password
 * or its mustChangePassword flag; if a row with the admin email exists it is
 * upgraded with the username/initial password (and forced password change)
 * rather than creating a duplicate. New admins must change the initial password
 * (`flocap!`) on first login.
 */
export async function ensureLocalAdmin(): Promise<void> {
  try {
    const [byUsername] = await db
      .select({ id: usersTable.id, passwordHash: usersTable.passwordHash })
      .from(usersTable)
      .where(eq(usersTable.username, LOCAL_ADMIN_USERNAME))
      .limit(1);
    if (byUsername) {
      // Repair role/active and backfill a password hash if missing, so the
      // local admin can always sign in. Don't overwrite an existing hash.
      await db
        .update(usersTable)
        .set({
          role: "admin",
          isActive: true,
          ...(byUsername.passwordHash ? {} : { passwordHash: await hashPassword(LOCAL_ADMIN_PASSWORD) }),
        })
        .where(eq(usersTable.id, byUsername.id));
      return;
    }

    const passwordHash = await hashPassword(LOCAL_ADMIN_PASSWORD);

    const [byEmail] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, LOCAL_ADMIN_EMAIL))
      .limit(1);

    if (byEmail) {
      await db
        .update(usersTable)
        .set({ username: LOCAL_ADMIN_USERNAME, passwordHash, role: "admin", isActive: true, mustChangePassword: true })
        .where(eq(usersTable.id, byEmail.id));
      logger.info({ id: byEmail.id }, "ensureLocalAdmin: upgraded existing user with local credentials");
      return;
    }

    const [created] = await db
      .insert(usersTable)
      .values({
        username: LOCAL_ADMIN_USERNAME,
        passwordHash,
        email: LOCAL_ADMIN_EMAIL,
        name: LOCAL_ADMIN_NAME,
        role: "admin",
        isActive: true,
        mustChangePassword: true,
      })
      .onConflictDoNothing()
      .returning();
    logger.info({ id: created?.id }, "ensureLocalAdmin: created local admin account");
  } catch (err) {
    logger.error({ err }, "ensureLocalAdmin failed");
  }
}

/**
 * Returns the id of the default dossier ("Archivio Documenti"), or null if it
 * does not exist yet. Picks the lowest id when (unexpectedly) several are flagged.
 */
export async function getDefaultDossierId(): Promise<number | null> {
  const [row] = await db
    .select({ id: dossiersTable.id })
    .from(dossiersTable)
    .where(eq(dossiersTable.isDefault, true))
    .orderBy(asc(dossiersTable.id))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Ensures exactly one default dossier ("Archivio Documenti") exists. New
 * documents created without an explicit fascicolo land here. Idempotent: safe
 * to call on every boot. If a dossier with the canonical title already exists
 * it is promoted to default rather than creating a duplicate. If multiple
 * defaults somehow exist, the lowest id wins and the rest are demoted so the
 * frontend's `find(d => d.isDefault)` is deterministic.
 */
export async function ensureDefaultDossier(): Promise<void> {
  try {
    const defaults = await db
      .select({ id: dossiersTable.id })
      .from(dossiersTable)
      .where(eq(dossiersTable.isDefault, true))
      .orderBy(asc(dossiersTable.id));
    if (defaults.length > 0) {
      const keep = defaults[0].id;
      if (defaults.length > 1) {
        await db
          .update(dossiersTable)
          .set({ isDefault: false })
          .where(and(eq(dossiersTable.isDefault, true), ne(dossiersTable.id, keep)));
        logger.warn({ keep, demoted: defaults.length - 1 }, "ensureDefaultDossier: reconciled duplicate defaults");
      }
      return;
    }

    const [byTitle] = await db
      .select()
      .from(dossiersTable)
      .where(eq(dossiersTable.title, DEFAULT_DOSSIER_TITLE))
      .limit(1);
    if (byTitle) {
      await db.update(dossiersTable).set({ isDefault: true }).where(eq(dossiersTable.id, byTitle.id));
      logger.info({ id: byTitle.id }, "ensureDefaultDossier: promoted existing dossier to default");
      return;
    }

    const year = new Date().getFullYear();
    const code = `FASC-${year}-ARCH`;
    const [created] = await db
      .insert(dossiersTable)
      .values({
        code,
        title: DEFAULT_DOSSIER_TITLE,
        description: "Fascicolo predefinito per i documenti non assegnati a un fascicolo specifico.",
        status: "open",
        year,
        area: "Generale",
        confidentiality: "normal",
        isDefault: true,
      })
      .onConflictDoNothing()
      .returning();
    logger.info({ id: created?.id }, "ensureDefaultDossier: created default dossier");
  } catch (err) {
    logger.error({ err }, "ensureDefaultDossier failed");
  }
}
