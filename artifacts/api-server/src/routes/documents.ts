import { Router } from "express";
import { db } from "@workspace/db";
import { documentsTable, usersTable, dossiersTable, classificationsTable, protocolsTable, documentDossiersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { triggerDossierWorkflows } from "../lib/dossierWorkflowEngine";
import { getDocumentDossierSets } from "../lib/memberships";
import { getDefaultDossierId, ensureDefaultDossier } from "../lib/ensureDefaults";
import {
  documentAssociationError,
  firstAssociationError,
  firstMissingDossierId,
  loadDossierMap,
} from "../lib/dossierStatusRules";

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
  // Filter by effective membership (home dossier ∪ copied memberships) so a
  // document copied into another fascicolo shows up there too.
  if (dossierId || dossierIdSet) {
    const docSets = await getDocumentDossierSets();
    if (dossierId) {
      const did = Number(dossierId);
      rows = rows.filter((d) => docSets.get(d.id)?.has(did) ?? false);
    }
    if (dossierIdSet) {
      rows = rows.filter((d) => {
        const set = docSets.get(d.id);
        if (!set) return false;
        for (const id of dossierIdSet) if (set.has(id)) return true;
        return false;
      });
    }
  }
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

  // Ensure the "Archivio Documenti" default exists before filing (normally
  // created at boot, but enforce here so the rule always holds).
  let defaultDossierId = await getDefaultDossierId();
  if (!defaultDossierId) {
    await ensureDefaultDossier();
    defaultDossierId = await getDefaultDossierId();
  }

  const selected = dossierId ? Number(dossierId) : null;
  // No fascicolo selected → land in "Archivio Documenti" (default) as home.
  const homeDossierId = selected ?? defaultDossierId;
  const needsArchiveCopy = !!(defaultDossierId && homeDossierId && homeDossierId !== defaultDossierId);
  const targetDossierIds = Array.from(new Set([
    ...(homeDossierId != null ? [homeDossierId] : []),
    ...(needsArchiveCopy ? [defaultDossierId!] : []),
  ]));
  const validatedDossierMap = await loadDossierMap(targetDossierIds);
  const missingDossierId = firstMissingDossierId(targetDossierIds, validatedDossierMap);
  if (missingDossierId != null) {
    res.status(404).json({ error: `Fascicolo ${missingDossierId} non trovato` });
    return;
  }
  const associationError = firstAssociationError(targetDossierIds, validatedDossierMap, documentAssociationError);
  if (associationError) {
    res.status(400).json({ error: associationError });
    return;
  }

  let effectiveClassificationId = classificationId ? Number(classificationId) : null;
  if (!effectiveClassificationId && homeDossierId) {
    effectiveClassificationId = validatedDossierMap.get(homeDossierId)?.classificationId ?? null;
  }

  // Create the document and (when a fascicolo was selected) the automatic
  // "Archivio Documenti" junction copy atomically so the doc is never left
  // out of Archivio on a partial failure.
  const doc = await db.transaction(async (tx) => {
    const [created] = await tx.insert(documentsTable).values({
      title, type, subject, description,
      confidentiality: confidentiality || "normal",
      priority: priority || "normal",
      dossierId: homeDossierId,
      classificationId: effectiveClassificationId,
      responsibleId: responsibleId || null,
      createdById: req.currentUserId!,
      tags: tags || [],
      driveUrl, fileName,
    }).returning();
    if (needsArchiveCopy) {
      await tx.insert(documentDossiersTable)
        .values({ documentId: created.id, dossierId: defaultDossierId!, isPrimary: false, addedById: req.currentUserId! })
        .onConflictDoNothing({ target: [documentDossiersTable.documentId, documentDossiersTable.dossierId] });
    }
    return created;
  });

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
  if (!prev) { res.status(404).json({ error: "Not found" }); return; }
  if (dossierId !== undefined && dossierId != null) {
    const newDossierId = Number(dossierId);
    const dossierMap = await loadDossierMap([newDossierId]);
    if (firstMissingDossierId([newDossierId], dossierMap) != null) {
      res.status(404).json({ error: "Fascicolo non trovato" });
      return;
    }
    const associationError = firstAssociationError([newDossierId], dossierMap, documentAssociationError);
    if (associationError) {
      res.status(400).json({ error: associationError });
      return;
    }
    updates.dossierId = newDossierId;
  } else if (dossierId === null) {
    updates.dossierId = null;
  }
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
  classMap: Record<number, { code: string; title: string }>,
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
    classificationTitle: doc.classificationId ? (classMap[doc.classificationId]?.title ?? null) : null,
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
