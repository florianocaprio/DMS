import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const signatureRequestsTable = pgTable("signature_requests", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  status: text("status").notNull().default("pending"),
  type: text("type").notNull().default("internal"),
  signatories: jsonb("signatories").notNull().default([]),
  requestedById: integer("requested_by_id").notNull(),
  note: text("note"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSignatureRequestSchema = createInsertSchema(signatureRequestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSignatureRequest = z.infer<typeof insertSignatureRequestSchema>;
export type SignatureRequest = typeof signatureRequestsTable.$inferSelect;
