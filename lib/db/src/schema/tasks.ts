import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("new"),
  priority: text("priority").notNull().default("normal"),
  progress: integer("progress").notNull().default(0),
  protocolId: integer("protocol_id"),
  documentId: integer("document_id"),
  dossierId: integer("dossier_id"),
  assignedToId: integer("assigned_to_id"),
  createdById: integer("created_by_id").notNull(),
  dueDate: text("due_date"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  notes: text("notes"),
  outcome: text("outcome"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
