import { Router } from "express";
import { db } from "@workspace/db";
import { classificationsTable, documentsTable, protocolsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router = Router();

router.get("/search", async (req, res): Promise<void> => {
  const { q, type, status, dateFrom, dateTo, protocolType, classificationId, includeClassificationChildren = "true", page = "1", limit = "20" } = req.query;
  const query = (q as string || "").toLowerCase();
  const pg = Number(page);
  const lm = Number(limit);
  const offset = (pg - 1) * lm;

  const [documents, protocols, classifications] = await Promise.all([
    db.select().from(documentsTable).orderBy(desc(documentsTable.createdAt)),
    db.select().from(protocolsTable).orderBy(desc(protocolsTable.registeredAt)),
    db.select().from(classificationsTable).orderBy(classificationsTable.code),
  ]);
  const classMap = Object.fromEntries(classifications.map((c) => [c.id, c]));
  const allowedClassIds = buildAllowedClassificationIds(
    classificationId ? Number(classificationId) : null,
    includeClassificationChildren !== "false",
    classifications,
  );

  const results: Array<{
    id: number;
    resultType: string;
    title: string;
    subject: string | null;
    excerpt: string | null;
    status: string;
    protocolNumber: string | null;
    dossierTitle: string | null;
    assignedToName: string | null;
    documentType: string | null;
    classificationId: number | null;
    classificationCode: string | null;
    classificationTitle: string | null;
    createdAt: string;
  }> = [];

  for (const doc of documents) {
    const matches = !query ||
      doc.title.toLowerCase().includes(query) ||
      (doc.subject?.toLowerCase().includes(query)) ||
      (doc.description?.toLowerCase().includes(query)) ||
      (doc.ocrText?.toLowerCase().includes(query)) ||
      (doc.aiSummary?.toLowerCase().includes(query)) ||
      doc.tags.some((t: string) => t.toLowerCase().includes(query));

    if (!matches) continue;
    if (type && doc.type !== type) continue;
    if (status && doc.status !== status) continue;
    if (dateFrom && doc.createdAt.toISOString() < (dateFrom as string)) continue;
    if (dateTo && doc.createdAt.toISOString() > (dateTo as string)) continue;
    if (allowedClassIds && (!doc.classificationId || !allowedClassIds.has(doc.classificationId))) continue;

    results.push({
      id: doc.id,
      resultType: "document",
      title: doc.title,
      subject: doc.subject,
      excerpt: doc.description?.slice(0, 200) ?? doc.aiSummary?.slice(0, 200) ?? null,
      status: doc.status,
      protocolNumber: null,
      dossierTitle: null,
      assignedToName: null,
      documentType: doc.type,
      classificationId: doc.classificationId,
      classificationCode: doc.classificationId ? (classMap[doc.classificationId]?.code ?? null) : null,
      classificationTitle: doc.classificationId ? (classMap[doc.classificationId]?.title ?? null) : null,
      createdAt: doc.createdAt.toISOString(),
    });
  }

  for (const prot of protocols) {
    if (protocolType && prot.type !== protocolType) continue;
    if (allowedClassIds && (!prot.classificationId || !allowedClassIds.has(prot.classificationId))) continue;
    const matches = !query ||
      prot.subject.toLowerCase().includes(query) ||
      prot.number.toLowerCase().includes(query) ||
      (prot.sender?.toLowerCase().includes(query)) ||
      (prot.description?.toLowerCase().includes(query));
    if (!matches) continue;
    if (status && prot.status !== status) continue;

    results.push({
      id: prot.id,
      resultType: "protocol",
      title: prot.subject,
      subject: prot.sender,
      excerpt: prot.description?.slice(0, 200) ?? null,
      status: prot.status,
      protocolNumber: prot.number,
      dossierTitle: null,
      assignedToName: null,
      documentType: prot.type,
      classificationId: prot.classificationId,
      classificationCode: prot.classificationId ? (classMap[prot.classificationId]?.code ?? null) : null,
      classificationTitle: prot.classificationId ? (classMap[prot.classificationId]?.title ?? null) : null,
      createdAt: prot.registeredAt.toISOString(),
    });
  }

  const total = results.length;
  const page_items = results.slice(offset, offset + lm);

  res.json({ query: q as string || "", items: page_items, total, page: pg, limit: lm });
});

function buildAllowedClassificationIds(
  rootId: number | null,
  includeChildren: boolean,
  classifications: Array<typeof classificationsTable.$inferSelect>,
): Set<number> | null {
  if (!rootId || Number.isNaN(rootId)) return null;
  const ids = new Set([rootId]);
  if (!includeChildren) return ids;

  let changed = true;
  while (changed) {
    changed = false;
    for (const c of classifications) {
      if (c.parentId != null && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        changed = true;
      }
    }
  }
  return ids;
}

export default router;
