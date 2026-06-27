import { pgTable, text, serial, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dossierWorkflowRulesTable = pgTable("dossier_workflow_rules", {
  id: serial("id").primaryKey(),
  dossierId: integer("dossier_id").notNull(),
  type: text("type").notNull(), // cc | approval | signature
  name: text("name").notNull(),
  appliesTo: text("applies_to").notNull().default("both"), // documents | protocols | both
  config: jsonb("config").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const dossierWorkflowInstancesTable = pgTable("dossier_workflow_instances", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").notNull(),
  dossierId: integer("dossier_id").notNull(),
  type: text("type").notNull(), // cc | approval | signature
  targetType: text("target_type").notNull(), // document | protocol
  targetId: integer("target_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | acknowledged | completed
  participants: jsonb("participants").notNull().default([]),
  signatureRequestId: integer("signature_request_id"),
  note: text("note"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDossierWorkflowRuleSchema = createInsertSchema(dossierWorkflowRulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDossierWorkflowRule = z.infer<typeof insertDossierWorkflowRuleSchema>;
export type DossierWorkflowRule = typeof dossierWorkflowRulesTable.$inferSelect;
export type DossierWorkflowInstance = typeof dossierWorkflowInstancesTable.$inferSelect;

export interface CcRuleConfig { userIds: number[] }
export interface ApprovalRuleConfig { approverId: number }
export interface SignatureRuleConfig { signatoryIds: number[]; requireAll: boolean }

export interface InstanceParticipant {
  userId: number;
  status: string; // pending | approved | rejected | acknowledged | signed
  actedAt: string | null;
  note: string | null;
}
