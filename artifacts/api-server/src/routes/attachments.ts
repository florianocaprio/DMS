import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { fileAttachmentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getDriveFolderId, uploadFileToDrive, deleteFileFromDrive, downloadObjectAsBuffer } from "../lib/googleDrive";

const router: IRouter = Router();

router.get("/attachments", async (req: Request, res: Response) => {
  try {
    const { documentId, protocolId, dossierId } = req.query;
    const conditions = [];
    if (documentId) conditions.push(eq(fileAttachmentsTable.documentId, Number(documentId)));
    if (protocolId) conditions.push(eq(fileAttachmentsTable.protocolId, Number(protocolId)));
    if (dossierId) conditions.push(eq(fileAttachmentsTable.dossierId, Number(dossierId)));

    const rows = conditions.length > 0
      ? await db.select().from(fileAttachmentsTable).where(and(...conditions)).orderBy(fileAttachmentsTable.createdAt)
      : await db.select().from(fileAttachmentsTable).orderBy(fileAttachmentsTable.createdAt);

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Error listing attachments");
    res.status(500).json({ error: "Failed to list attachments" });
  }
});

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
      uploadedById: 1,
    }).returning();

    res.status(201).json(created);

    // Async Drive sync — does not block the response
    syncToDrive(created.id, objectPath, originalName, mimeType, req.log).catch(() => {});
  } catch (err) {
    req.log.error({ err }, "Error saving attachment");
    res.status(500).json({ error: "Failed to save attachment" });
  }
});

router.delete("/attachments/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db.select().from(fileAttachmentsTable).where(eq(fileAttachmentsTable.id, id));
    await db.delete(fileAttachmentsTable).where(eq(fileAttachmentsTable.id, id));
    res.status(204).end();

    // Async Drive cleanup
    if (row?.driveFileId) {
      deleteFileFromDrive(row.driveFileId).catch(() => {});
    }
  } catch (err) {
    req.log.error({ err }, "Error deleting attachment");
    res.status(500).json({ error: "Failed to delete attachment" });
  }
});

async function syncToDrive(
  attachmentId: number,
  objectPath: string,
  originalName: string,
  mimeType: string,
  log: Request["log"],
) {
  const folderId = await getDriveFolderId();
  if (!folderId) return;

  try {
    const fileBuffer = await downloadObjectAsBuffer(objectPath);
    const driveFile = await uploadFileToDrive(fileBuffer, originalName, mimeType, folderId);
    await db
      .update(fileAttachmentsTable)
      .set({ driveFileId: driveFile.id, driveViewLink: driveFile.webViewLink })
      .where(eq(fileAttachmentsTable.id, attachmentId));
    log.info({ attachmentId, driveFileId: driveFile.id }, "Synced attachment to Google Drive");
  } catch (err) {
    log.error({ err, attachmentId }, "Failed to sync attachment to Google Drive");
  }
}

export default router;
