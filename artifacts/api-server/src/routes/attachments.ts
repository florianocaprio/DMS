import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { fileAttachmentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

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
  } catch (err) {
    req.log.error({ err }, "Error saving attachment");
    res.status(500).json({ error: "Failed to save attachment" });
  }
});

router.delete("/attachments/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await db.delete(fileAttachmentsTable).where(eq(fileAttachmentsTable.id, id));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Error deleting attachment");
    res.status(500).json({ error: "Failed to delete attachment" });
  }
});

export default router;
