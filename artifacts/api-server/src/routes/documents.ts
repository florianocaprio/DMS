import { Router } from "express";
import { db } from "@workspace/db";
import { documentsTable, usersTable, dossiersTable, classificationsTable, protocolsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { triggerDossierWorkflows } from "../lib/dossierWorkflowEngine";

const router = Router();

router.get("/documents", async (req, res): Promise<void> => {
  const { status, type, dossierId, dossierIds, assignedToMe, page = "1", limit = "20" } = req.query;
  const pg = Number(page);
  const lm = Number(limit);
  const offset = (pg - 1) * lm;

  const parsedDossierIds =
    typeof dossierIds === "string"
      ? dossierIds
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .map((s) => Number(s))
          .filter((n) => Number.isInteger(n))
      : [];
  const dossierIdSet = parsedDossierIds.length > 0 ? new Set(parsedDossierIds) : null;

  let rows = await db.select().from(documentsTable).orderBy(desc(documentsTable.createdAt));
  if (status) rows = rows.filter((d) => d.status === status);
  if (type) rows = rows.filter((d) => d.type === type);
  if (dossierId) rows = rows.filter((d) => d.dossierId === Number(dossierId));
  if (dossierIdSet) rows = rows.filter((d) => d.dossierId !== null && dossierIdSet.has(d.dossierId));
  if (assignedToMe === "true") rows = rows.filter((d) => d.responsibleId === req.currentUserId);

  const total = rows.length;
  const page_items = rows.slice(offset, offset + lm);

  const userMap = await getUserMap();
  const dossierMap = await getDossierMap();
  const classMap = await getClassMap();
  const protMap = await getProtMap();

  res.json({
    items: page_items.map((d) => fmtDocument(d, userMap, dossierMap, classMap, protMap)),
    total,
    page: pg,
    limit: lm,
  });
});

router.post("/documents", async (req, res): Promise<void> => {
  const { title, type, subject, description, confidentiality, priority, dossierId, classificationId, responsibleId, tags, driveUrl, fileName } = req.body;
  const [doc] = await db.insert(documentsTable).values({
    title, type, subject, description,
    confidentiality: confidentiality || "normal",
    priority: priority || "normal",
    dossierId: dossierId || null,
    classificationId: classificationId || null,
    responsibleId: responsibleId || null,
    createdById: req.currentUserId!,
    tags: tags || [],
    driveUrl, fileName,
  }).returning();
  if (doc.dossierId) await triggerDossierWorkflows(doc.dossierId, "document", doc.id);
  const userMap = await getUserMap();
  res.status(201).json(fmtDocument(doc, userMap, {}, {}, {}));
});

router.get("/documents/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id)).limit(1);
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  const userMap = await getUserMap();
  const dossierMap = await getDossierMap();
  const classMap = await getClassMap();
  const protMap = await getProtMap();
  res.json(fmtDocument(doc, userMap, dossierMap, classMap, protMap));
});

router.patch("/documents/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { title, subject, description, type, confidentiality, priority, dossierId, classificationId, responsibleId, tags, aiSummary } = req.body;
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (subject !== undefined) updates.subject = subject;
  if (description !== undefined) updates.description = description;
  if (type !== undefined) updates.type = type;
  if (confidentiality !== undefined) updates.confidentiality = confidentiality;
  if (priority !== undefined) updates.priority = priority;
  if (dossierId !== undefined) updates.dossierId = dossierId;
  if (classificationId !== undefined) updates.classificationId = classificationId;
  if (responsibleId !== undefined) updates.responsibleId = responsibleId;
  if (tags !== undefined) updates.tags = tags;
  if (aiSummary !== undefined) updates.aiSummary = aiSummary;
  const [prev] = await db.select().from(documentsTable).where(eq(documentsTable.id, id)).limit(1);
  const [doc] = await db.update(documentsTable).set(updates).where(eq(documentsTable.id, id)).returning();
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  if (doc.dossierId && doc.dossierId !== prev?.dossierId) {
    await triggerDossierWorkflows(doc.dossierId, "document", doc.id);
  }
  const userMap = await getUserMap();
  res.json(fmtDocument(doc, userMap, {}, {}, {}));
});

router.delete("/documents/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.update(documentsTable).set({ status: "archived", archivedAt: new Date() }).where(eq(documentsTable.id, id));
  res.status(204).end();
});

router.patch("/documents/:id/status", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { status } = req.body;
  const [doc] = await db.update(documentsTable).set({ status }).where(eq(documentsTable.id, id)).returning();
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  const userMap = await getUserMap();
  res.json(fmtDocument(doc, userMap, {}, {}, {}));
});

router.get("/documents/:id/versions", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const doc = await db.select().from(documentsTable).where(eq(documentsTable.id, id)).limit(1);
  if (!doc[0]) { res.status(404).json({ error: "Not found" }); return; }
  const userMap = await getUserMap();
  res.json([{
    id: doc[0].id,
    documentId: doc[0].id,
    version: doc[0].version,
    status: doc[0].status,
    description: "Initial version",
    driveUrl: doc[0].driveUrl,
    fileName: doc[0].fileName,
    fileHash: null,
    createdAt: doc[0].createdAt.toISOString(),
    createdById: doc[0].createdById,
    createdByName: userMap[doc[0].createdById]?.name ?? "Unknown",
  }]);
});

router.post("/documents/:id/assignments", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { assignments } = req.body;
  if (assignments && assignments.length > 0) {
    const firstAssignee = assignments[0];
    await db.update(documentsTable).set({ responsibleId: firstAssignee.userId }).where(eq(documentsTable.id, id));
  }
  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id)).limit(1);
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  const userMap = await getUserMap();
  res.json(fmtDocument(doc, userMap, {}, {}, {}));
});

async function getUserMap() {
  const users = await db.select().from(usersTable);
  return Object.fromEntries(users.map((u) => [u.id, u]));
}
async function getDossierMap() {
  const dossiers = await db.select().from(dossiersTable);
  return Object.fromEntries(dossiers.map((d) => [d.id, d]));
}
async function getClassMap() {
  const cls = await db.select().from(classificationsTable);
  return Object.fromEntries(cls.map((c) => [c.id, c]));
}
async function getProtMap() {
  const prots = await db.select().from(protocolsTable);
  return Object.fromEntries(prots.map((p) => [p.id, p]));
}

function fmtDocument(
  doc: typeof documentsTable.$inferSelect,
  userMap: Record<number, { name: string }>,
  dossierMap: Record<number, { title: string }>,
  classMap: Record<number, { code: string }>,
  protMap: Record<number, { number: string }>,
) {
  return {
    id: doc.id,
    title: doc.title,
    type: doc.type,
    status: doc.status,
    subject: doc.subject,
    description: doc.description,
    confidentiality: doc.confidentiality,
    priority: doc.priority,
    version: doc.version,
    driveUrl: doc.driveUrl,
    fileName: doc.fileName,
    fileSize: doc.fileSize,
    mimeType: doc.mimeType,
    dossierId: doc.dossierId,
    dossierTitle: doc.dossierId ? (dossierMap[doc.dossierId]?.title ?? null) : null,
    protocolId: doc.protocolId,
    protocolNumber: doc.protocolId ? (protMap[doc.protocolId]?.number ?? null) : null,
    classificationId: doc.classificationId,
    classificationCode: doc.classificationId ? (classMap[doc.classificationId]?.code ?? null) : null,
    responsibleId: doc.responsibleId,
    responsibleName: doc.responsibleId ? (userMap[doc.responsibleId]?.name ?? null) : null,
    createdById: doc.createdById,
    createdByName: userMap[doc.createdById]?.name ?? "Unknown",
    tags: doc.tags,
    ocrText: doc.ocrText,
    aiSummary: doc.aiSummary,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    archivedAt: doc.archivedAt?.toISOString() ?? null,
  };
}

export default router;
