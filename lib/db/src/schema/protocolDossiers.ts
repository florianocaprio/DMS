import { pgTable, serial, timestamp, integer, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const protocolDossiersTable = pgTable(
  "protocol_dossiers",
  {
    id: serial("id").primaryKey(),
    protocolId: integer("protocol_id").notNull(),
    dossierId: integer("dossier_id").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    addedById: integer("added_by_id").notNull().default(1),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("protocol_dossiers_unique").on(t.protocolId, t.dossierId)],
);

export const insertProtocolDossierSchema = createInsertSchema(protocolDossiersTable).omit({
  id: true,
  addedAt: true,
});
export type InsertProtocolDossier = z.infer<typeof insertProtocolDossierSchema>;
export type ProtocolDossier = typeof protocolDossiersTable.$inferSelect;
