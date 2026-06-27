import { db } from "@workspace/db";
import { dossiersTable } from "@workspace/db";
import { and, eq, ne, asc } from "drizzle-orm";
import { logger } from "./logger";

const DEFAULT_DOSSIER_TITLE = "Archivio Documenti";

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
