import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const protocolsTable = pgTable("protocols", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(),
  year: integer("year").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("registered"),
  subject: text("subject").notNull(),
  description: text("description"),
  sender: text("sender"),
  recipients: text("recipients").array().notNull().default([]),
  ccRecipients: text("cc_recipients").array().notNull().default([]),
  channel: text("channel"),
  confidentiality: text("confidentiality").notNull().default("normal"),
  priority: text("priority").notNull().default("normal"),
  dossierId: integer("dossier_id"),
  classificationId: integer("classification_id"),
  documentId: integer("document_id"),
  assignedToId: integer("assigned_to_id"),
  registeredById: integer("registered_by_id").notNull(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelReason: text("cancel_reason"),
  notes: text("notes"),
  driveFolder: text("drive_folder"),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProtocolSchema = createInsertSchema(protocolsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProtocol = z.infer<typeof insertProtocolSchema>;
export type Protocol = typeof protocolsTable.$inferSelect;
