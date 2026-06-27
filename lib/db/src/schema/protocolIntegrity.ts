import { pgTable, serial, integer, text, timestamp, jsonb, unique } from "drizzle-orm/pg-core";
import { protocolsTable } from "./protocols";

/**
 * Conserva l'impronta di integrità più recente per ogni protocollo.
 * UPSERT on conflict(protocolId) → mantiene solo l'ultima versione.
 */
export const protocolIntegrityTable = pgTable(
  "protocol_integrity",
  {
    id: serial("id").primaryKey(),
    protocolId: integer("protocol_id")
      .notNull()
      .references(() => protocolsTable.id, { onDelete: "cascade" }),
    integrityHash: text("integrity_hash").notNull(),
    fileHashes: jsonb("file_hashes").notNull().default({}),
    protocolSnapshot: jsonb("protocol_snapshot").notNull().default({}),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    triggeredBy: text("triggered_by").notNull().default("manual"),
  },
  (t) => [unique("protocol_integrity_protocol_id_unique").on(t.protocolId)],
);
