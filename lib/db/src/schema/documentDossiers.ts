import { pgTable, serial, timestamp, integer, boolean, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { documentsTable } from "./documents";
import { dossiersTable } from "./dossiers";

export const documentDossiersTable = pgTable(
  "document_dossiers",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    dossierId: integer("dossier_id")
      .notNull()
      .references(() => dossiersTable.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    addedById: integer("added_by_id").notNull().default(1),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("document_dossiers_unique").on(t.documentId, t.dossierId),
    uniqueIndex("document_dossiers_one_primary")
      .on(t.documentId)
      .where(sql`${t.isPrimary} = true`),
  ],
);

export const insertDocumentDossierSchema = createInsertSchema(documentDossiersTable).omit({
  id: true,
  addedAt: true,
});
export type InsertDocumentDossier = z.infer<typeof insertDocumentDossierSchema>;
export type DocumentDossier = typeof documentDossiersTable.$inferSelect;
