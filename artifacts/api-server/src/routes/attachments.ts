import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { fileAttachmentsTable, protocolsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
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

const router: IRouter = Router();

router.get("/attachments", async (req: Request, res: Response) => {
  try {
    const { documentId, protocolId, dossierId } = req.query;
    const conditions = [];
    if (documentId) conditions.push(eq(fileAttachmentsTable.documentId, Number(documentId)));
    if (protocolId)  conditions.push(eq(fileAttachmentsTable.protocolId, Number(protocolId)));
    if (dossierId)   conditions.push(eq(fileAttachmentsTable.dossierId, Number(dossierId)));

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
    await db.delete(fileAttachmentsTable).where(eq(fileAttachmentsTable.id, id));
    res.status(204).end();

    if (row?.driveFileId) deleteFileFromDrive(row.driveFileId).catch(() => {});
    if (row?.protocolId)  regenerateProtocolXml(row.protocolId, req.log).catch(() => {});
  } catch (err) {
    req.log.error({ err }, "Error deleting attachment");
    res.status(500).json({ error: "Failed to delete attachment" });
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
