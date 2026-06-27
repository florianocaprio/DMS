import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { fileAttachmentsTable, protocolsTable, usersTable, activityLogTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import {
  getDriveSettings,
  getOrCreateProtocolFolder,
  getOrCreateDatedFolder,
  uploadFileToDrive,
  uploadOrReplaceFile,
  deleteFileFromDrive,
  downloadObjectAsBuffer,
} from "../lib/googleDrive";
import { buildProtocolXml } from "../lib/protocolXml";
import { stampPdf, stampImage, isStampable } from "../lib/stamp";
import { uploadBufferToObjectPath } from "../lib/objectStorage";

const router: IRouter = Router();

router.get("/attachments", async (req: Request, res: Response) => {
  try {
    const { documentId, protocolId, dossierId, includeRemoved } = req.query;
    const conditions = [];
    if (documentId) conditions.push(eq(fileAttachmentsTable.documentId, Number(documentId)));
    if (protocolId)  conditions.push(eq(fileAttachmentsTable.protocolId, Number(protocolId)));
    if (dossierId)   conditions.push(eq(fileAttachmentsTable.dossierId, Number(dossierId)));
    if (includeRemoved !== "true") conditions.push(isNull(fileAttachmentsTable.removedAt));

    const rows = conditions.length > 0
      ? await db.select().from(fileAttachmentsTable).where(and(...conditions)).orderBy(fileAttachmentsTable.createdAt)
      : await db.select().from(fileAttachmentsTable).orderBy(fileAttachmentsTable.createdAt);

    const users = await db.select().from(usersTable);
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));
    res.json(rows.map((r) => fmtAttachment(r, userMap)));
  } catch (err) {
    req.log.error({ err }, "Error listing attachments");
    res.status(500).json({ error: "Failed to list attachments" });
  }
});

function fmtAttachment(
  r: typeof fileAttachmentsTable.$inferSelect,
  userMap: Record<number, string>,
) {
  return {
    ...r,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    removedAt: r.removedAt instanceof Date ? r.removedAt.toISOString() : r.removedAt,
    uploadedByName: userMap[r.uploadedById] ?? "Sconosciuto",
    removedByName: r.removedById ? (userMap[r.removedById] ?? null) : null,
  };
}

router.post("/attachments", async (req: Request, res: Response) => {
  try {
    const { objectPath, originalName, mimeType, fileSize, documentId, protocolId, dossierId } = req.body as {
      objectPath: string; originalName: string; mimeType: string; fileSize: number;
      documentId?: number; protocolId?: number; dossierId?: number;
    };

    if (!objectPath || !originalName || !mimeType || !fileSize) {
      res.status(400).json({ error: "objectPath, originalName, mimeType, fileSize are required" });
      return;
    }

    const [created] = await db.insert(fileAttachmentsTable).values({
      objectPath,
      originalName,
      mimeType,
      fileSize,
      documentId: documentId ?? null,
      protocolId: protocolId ?? null,
      dossierId: dossierId ?? null,
      uploadedById: req.currentUserId!,
    }).returning();

    res.status(201).json(created);

    await logAttachmentActivity("file_added", `File "${originalName}" caricato`, req.currentUserId!, documentId, protocolId);

    // Async Drive sync — does not block the HTTP response
    syncToDrive(created.id, objectPath, originalName, mimeType, req.log, protocolId).catch(() => {});
  } catch (err) {
    req.log.error({ err }, "Error saving attachment");
    res.status(500).json({ error: "Failed to save attachment" });
  }
});

router.delete("/attachments/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db.select().from(fileAttachmentsTable).where(eq(fileAttachmentsTable.id, id));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    if (row.removedAt) { res.status(204).end(); return; }

    // Soft delete: keep the record as evidence of who removed the file and when.
    await db.update(fileAttachmentsTable)
      .set({ removedAt: new Date(), removedById: req.currentUserId! })
      .where(eq(fileAttachmentsTable.id, id));
    res.status(204).end();

    await logAttachmentActivity("file_removed", `File "${row.originalName}" rimosso`, req.currentUserId!, row.documentId ?? undefined, row.protocolId ?? undefined);

    if (row.driveFileId) deleteFileFromDrive(row.driveFileId).catch(() => {});
    if (row.protocolId)  regenerateProtocolXml(row.protocolId, req.log).catch(() => {});
  } catch (err) {
    req.log.error({ err }, "Error deleting attachment");
    res.status(500).json({ error: "Failed to delete attachment" });
  }
});

async function logAttachmentActivity(type: string, description: string, userId: number, documentId?: number, protocolId?: number) {
  await db.insert(activityLogTable).values({
    type,
    description,
    userId,
    documentId: documentId ?? null,
    protocolId: protocolId ?? null,
  });
}

// ── Timbro digitale ───────────────────────────────────────────────────────
router.post("/attachments/:id/stamp", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "ID non valido" }); return; }

    const [attachment] = await db
      .select()
      .from(fileAttachmentsTable)
      .where(eq(fileAttachmentsTable.id, id));

    if (!attachment) { res.status(404).json({ error: "Allegato non trovato" }); return; }

    if (!isStampable(attachment.mimeType)) {
      res.status(400).json({
        error: "Tipo file non supportato per il timbro (solo PDF, JPEG, PNG, WEBP, TIFF)",
      });
      return;
    }

    if (!attachment.protocolId) {
      res.status(400).json({ error: "L'allegato non è associato a un protocollo" });
      return;
    }

    const [protocol] = await db
      .select({ id: protocolsTable.id, number: protocolsTable.number, registeredAt: protocolsTable.registeredAt })
      .from(protocolsTable)
      .where(eq(protocolsTable.id, attachment.protocolId));

    if (!protocol) { res.status(404).json({ error: "Protocollo non trovato" }); return; }

    const registeredAt = protocol.registeredAt ? new Date(protocol.registeredAt) : new Date();

    // Download → stamp → re-upload in-place
    const inputBuffer = await downloadObjectAsBuffer(attachment.objectPath);

    const stampedBuffer = attachment.mimeType === "application/pdf"
      ? await stampPdf(inputBuffer, protocol.number, registeredAt)
      : await stampImage(inputBuffer, attachment.mimeType, protocol.number, registeredAt);

    await uploadBufferToObjectPath(attachment.objectPath, stampedBuffer, attachment.mimeType);

    // Update file size in DB
    const [updated] = await db
      .update(fileAttachmentsTable)
      .set({ fileSize: stampedBuffer.length })
      .where(eq(fileAttachmentsTable.id, id))
      .returning();

    res.json({ ok: true, attachment: updated });

    // Re-sync to Drive asynchronously (file content changed)
    syncToDrive(
      attachment.id,
      attachment.objectPath,
      attachment.originalName,
      attachment.mimeType,
      req.log,
      attachment.protocolId,
    ).catch(() => {});
  } catch (err) {
    req.log.error({ err }, "Error stamping attachment");
    res.status(500).json({ error: "Errore durante l'apposizione del timbro" });
  }
});

// ── Drive sync helpers ─────────────────────────────────────────────────────

async function syncToDrive(
  attachmentId: number,
  objectPath: string,
  originalName: string,
  mimeType: string,
  log: Request["log"],
  protocolId?: number,
) {
  const { enabled, rootFolderId } = await getDriveSettings();
  if (!enabled) return;

  try {
    let folderId: string;

    if (protocolId) {
      folderId = await resolveProtocolFolder(protocolId, rootFolderId, log);
    } else {
      folderId = await getOrCreateDatedFolder(rootFolderId, new Date());
    }

    const fileBuffer = await downloadObjectAsBuffer(objectPath);
    const driveFile  = await uploadFileToDrive(fileBuffer, originalName, mimeType, folderId);

    await db
      .update(fileAttachmentsTable)
      .set({ driveFileId: driveFile.id, driveViewLink: driveFile.webViewLink })
      .where(eq(fileAttachmentsTable.id, attachmentId));

    log.info({ attachmentId, driveFileId: driveFile.id }, "Synced attachment to Drive");

    if (protocolId) {
      await regenerateProtocolXml(protocolId, log);
    }
  } catch (err) {
    log.error({ err, attachmentId }, "Failed to sync attachment to Drive");
  }
}

/**
 * Returns the Drive folder id for a protocol.
 * Uses the cached value in protocols.drive_folder when available;
 * otherwise traverses/creates the folder tree and persists the id.
 */
export async function resolveProtocolFolder(
  protocolId: number,
  rootFolderId: string,
  log: Request["log"],
): Promise<string> {
  const [protocol] = await db
    .select({ id: protocolsTable.id, number: protocolsTable.number,
              registeredAt: protocolsTable.registeredAt, createdAt: protocolsTable.createdAt,
              driveFolder: protocolsTable.driveFolder })
    .from(protocolsTable)
    .where(eq(protocolsTable.id, protocolId));

  if (!protocol) throw new Error(`Protocol ${protocolId} not found`);
  if (protocol.driveFolder) return protocol.driveFolder;

  const folderId = await getOrCreateProtocolFolder(
    rootFolderId,
    protocol.number,
    protocol.registeredAt ?? protocol.createdAt,
  );

  await db.update(protocolsTable).set({ driveFolder: folderId }).where(eq(protocolsTable.id, protocolId));
  log.info({ protocolId, folderId }, "Created Drive folder for protocol");
  return folderId;
}

/**
 * Rebuilds and re-uploads metadati.xml for a protocol.
 * Called after every attachment add/delete so the XML is always current.
 */
export async function regenerateProtocolXml(protocolId: number, log: Request["log"]) {
  try {
    const { enabled, rootFolderId } = await getDriveSettings();
    if (!enabled) return;

    const folderId = await resolveProtocolFolder(protocolId, rootFolderId, log);
    const xml = await buildProtocolXml(protocolId);
    await uploadOrReplaceFile(folderId, "metadati.xml", xml, "application/xml");
    log.info({ protocolId }, "Regenerated metadati.xml on Drive");
  } catch (err) {
    log.error({ err, protocolId }, "Failed to regenerate metadati.xml");
  }
}

export default router;
