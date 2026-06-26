import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("draft"),
  subject: text("subject"),
  description: text("description"),
  confidentiality: text("confidentiality").notNull().default("normal"),
  priority: text("priority").notNull().default("normal"),
  version: integer("version").notNull().default(1),
  driveUrl: text("drive_url"),
  fileName: text("file_name"),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  dossierId: integer("dossier_id"),
  protocolId: integer("protocol_id"),
  classificationId: integer("classification_id"),
  responsibleId: integer("responsible_id"),
  createdById: integer("created_by_id").notNull(),
  tags: text("tags").array().notNull().default([]),
  ocrText: text("ocr_text"),
  aiSummary: text("ai_summary"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;
