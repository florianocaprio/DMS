import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { integritySchedulesTable } from "./integritySchedules";

/**
 * Log di ogni esecuzione di verifica di integrità (manuale o schedulata).
 */
export const integrityCheckLogTable = pgTable("integrity_check_log", {
  id: serial("id").primaryKey(),
  scheduleId: integer("schedule_id").references(() => integritySchedulesTable.id, {
    onDelete: "set null",
  }),
  triggeredBy: text("triggered_by").notNull().default("manual"), // manual | schedule
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  total: integer("total").notNull().default(0),
  valid: integer("valid").notNull().default(0),
  invalid: integer("invalid").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  status: text("status").notNull().default("running"), // running | completed | failed
  details: jsonb("details").notNull().default([]),
});
