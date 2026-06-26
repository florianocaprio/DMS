import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dossiersTable = pgTable("dossiers", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("open"),
  year: integer("year").notNull(),
  area: text("area"),
  confidentiality: text("confidentiality").notNull().default("normal"),
  responsibleId: integer("responsible_id"),
  classificationId: integer("classification_id"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDossierSchema = createInsertSchema(dossiersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDossier = z.infer<typeof insertDossierSchema>;
export type Dossier = typeof dossiersTable.$inferSelect;
