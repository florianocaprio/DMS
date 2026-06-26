import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fileAttachmentsTable = pgTable("file_attachments", {
  id: serial("id").primaryKey(),
  objectPath: text("object_path").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  documentId: integer("document_id"),
  protocolId: integer("protocol_id"),
  dossierId: integer("dossier_id"),
  uploadedById: integer("uploaded_by_id").notNull().default(1),
  driveFileId: text("drive_file_id"),
  driveViewLink: text("drive_view_link"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFileAttachmentSchema = createInsertSchema(fileAttachmentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertFileAttachment = z.infer<typeof insertFileAttachmentSchema>;
export type FileAttachment = typeof fileAttachmentsTable.$inferSelect;
