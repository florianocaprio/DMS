import { Router } from "express";
import { db } from "@workspace/db";
import { dossiersTable, usersTable, classificationsTable, documentsTable, protocolsTable } from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";

const router = Router();

router.get("/dossiers", async (req, res): Promise<void> => {
  const { status, responsibleId, page = "1", limit = "20" } = req.query;
  const pg = Number(page);
  const lm = Number(limit);
  const offset = (pg - 1) * lm;

  const allRows = await db.select().from(dossiersTable).orderBy(dossiersTable.createdAt);
  let filtered = allRows;
  if (status) filtered = filtered.filter((d) => d.status === status);
  if (responsibleId) filtered = filtered.filter((d) => d.responsibleId === Number(responsibleId));

  const total = filtered.length;
  const page_items = filtered.slice(offset, offset + lm);

  const userMap = await getUserMap();
  const classMap = await getClassMap();
  const docCounts = await db.select({ dossierId: documentsTable.dossierId, cnt: count() }).from(documentsTable).groupBy(documentsTable.dossierId);
  const protCounts = await db.select({ dossierId: protocolsTable.dossierId, cnt: count() }).from(protocolsTable).groupBy(protocolsTable.dossierId);
  const docCountMap = Object.fromEntries(docCounts.filter((x) => x.dossierId != null).map((x) => [x.dossierId as number, Number(x.cnt)]));
  const protCountMap = Object.fromEntries(protCounts.filter((x) => x.dossierId != null).map((x) => [x.dossierId as number, Number(x.cnt)]));

  res.json({
    items: page_items.map((d) => fmtDossier(d, userMap, classMap, docCountMap, protCountMap)),
    total,
    page: pg,
    limit: lm,
  });
});

router.get("/dossiers/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [d] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, id)).limit(1);
  if (!d) { res.status(404).json({ error: "Not found" }); return; }
  const userMap = await getUserMap();
  const classMap = await getClassMap();
  const docCounts = await db.select({ dossierId: documentsTable.dossierId, cnt: count() }).from(documentsTable).groupBy(documentsTable.dossierId);
  const protCounts = await db.select({ dossierId: protocolsTable.dossierId, cnt: count() }).from(protocolsTable).groupBy(protocolsTable.dossierId);
  const docCountMap = Object.fromEntries(docCounts.filter((x) => x.dossierId != null).map((x) => [x.dossierId as number, Number(x.cnt)]));
  const protCountMap = Object.fromEntries(protCounts.filter((x) => x.dossierId != null).map((x) => [x.dossierId as number, Number(x.cnt)]));
  res.json(fmtDossier(d, userMap, classMap, docCountMap, protCountMap));
});

router.post("/dossiers", async (req, res): Promise<void> => {
  const { title, description, area, confidentiality, responsibleId, classificationId } = req.body;
  const year = new Date().getFullYear();
  const existing = await db.select({ id: dossiersTable.id }).from(dossiersTable).where(sql`extract(year from ${dossiersTable.createdAt}) = ${year}`);
  const code = `FASC-${year}-${String(existing.length + 1).padStart(4, "0")}`;
  const [d] = await db.insert(dossiersTable).values({
    title, description, area, confidentiality: confidentiality || "normal",
    responsibleId: responsibleId || null, classificationId: classificationId || null,
    year, code,
  }).returning();
  res.status(201).json(fmtDossier(d, {}, {}, {}, {}));
});

router.patch("/dossiers/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { title, description, status, area, confidentiality, responsibleId, classificationId, closedAt } = req.body;
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;
  if (area !== undefined) updates.area = area;
  if (confidentiality !== undefined) updates.confidentiality = confidentiality;
  if (responsibleId !== undefined) updates.responsibleId = responsibleId;
  if (classificationId !== undefined) updates.classificationId = classificationId;
  if (closedAt !== undefined) updates.closedAt = closedAt ? new Date(closedAt) : null;
  const [d] = await db.update(dossiersTable).set(updates).where(eq(dossiersTable.id, id)).returning();
  if (!d) { res.status(404).json({ error: "Not found" }); return; }
  res.json(fmtDossier(d, {}, {}, {}, {}));
});

router.get("/dossiers/:id/documents", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const docs = await db.select().from(documentsTable).where(eq(documentsTable.dossierId, id));
  const userMap = await getUserMap();
  res.json(docs.map((doc) => fmtDoc(doc, userMap)));
});

async function getUserMap() {
  const users = await db.select().from(usersTable);
  return Object.fromEntries(users.map((u) => [u.id, u]));
}
async function getClassMap() {
  const cls = await db.select().from(classificationsTable);
  return Object.fromEntries(cls.map((c) => [c.id, c]));
}

function fmtDossier(
  d: typeof dossiersTable.$inferSelect,
  userMap: Record<number, { name: string }>,
  classMap: Record<number, { code: string }>,
  docCountMap: Record<number, number>,
  protCountMap: Record<number, number>,
) {
  return {
    id: d.id,
    code: d.code,
    title: d.title,
    description: d.description,
    status: d.status,
    year: d.year,
    area: d.area,
    confidentiality: d.confidentiality,
    responsibleId: d.responsibleId,
    responsibleName: d.responsibleId ? (userMap[d.responsibleId]?.name ?? null) : null,
    classificationId: d.classificationId,
    classificationCode: d.classificationId ? (classMap[d.classificationId]?.code ?? null) : null,
    documentCount: docCountMap[d.id] ?? 0,
    protocolCount: protCountMap[d.id] ?? 0,
    openedAt: d.openedAt.toISOString(),
    closedAt: d.closedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

function fmtDoc(doc: typeof documentsTable.$inferSelect, userMap: Record<number, { name: string }>) {
  return {
    id: doc.id,
    title: doc.title,
    type: doc.type,
    status: doc.status,
    subject: doc.subject,
    confidentiality: doc.confidentiality,
    priority: doc.priority,
    version: doc.version,
    createdById: doc.createdById,
    createdByName: userMap[doc.createdById]?.name ?? "Unknown",
    responsibleId: doc.responsibleId,
    responsibleName: doc.responsibleId ? (userMap[doc.responsibleId]?.name ?? null) : null,
    tags: doc.tags,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export default router;
