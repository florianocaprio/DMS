import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

export const auditLogTable = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  action: text("action").notNull(),       // READ | CREATE | UPDATE | DELETE
  entityType: text("entity_type"),        // protocol | document | dossier | ...
  entityId: integer("entity_id"),
  userId: integer("user_id"),
  method: text("method").notNull(),       // GET | POST | PUT | PATCH | DELETE
  path: text("path").notNull(),
  statusCode: integer("status_code").notNull(),
  durationMs: integer("duration_ms"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  requestBody: jsonb("request_body"),
  description: text("description"),
});

export type AuditLogEntry = typeof auditLogTable.$inferSelect;
