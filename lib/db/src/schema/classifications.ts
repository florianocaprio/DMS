import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const classificationsTable = pgTable("classifications", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  level: integer("level").notNull().default(1),
  parentId: integer("parent_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClassificationSchema = createInsertSchema(classificationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClassification = z.infer<typeof insertClassificationSchema>;
export type Classification = typeof classificationsTable.$inferSelect;
