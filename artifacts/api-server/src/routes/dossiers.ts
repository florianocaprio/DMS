import { Router } from "express";
import { db } from "@workspace/db";
import { dossiersTable, usersTable, classificationsTable, documentsTable, protocolsTable } from "@workspace/db";
import { eq, sql, count, inArray } from "drizzle-orm";
import { getEffectiveMemberships, getEffectiveDocumentMemberships } from "../lib/memberships";

const router = Router();

router.get("/dossiers", async (req, res): Promise<void> => {
  const { status, responsibleId, parentId, topLevel, page = "1", limit = "20" } = req.query;
  const pg = Number(page);
  const lm = Number(limit);
  const offset = (pg - 1) * lm;

  const allRows = await db.select().from(dossiersTable).orderBy(dossiersTable.createdAt);
  let filtered = allRows;
  if (status) filtered = filtered.filter((d) => d.status === status);
  if (responsibleId) filtered = filtered.filter((d) => d.responsibleId === Number(responsibleId));
  if (parentId) filtered = filtered.filter((d) => d.parentId === Number(parentId));
  if (topLevel === "true") filtered = filtered.filter((d) => d.parentId == null);

  const total = filtered.length;
  const page_items = filtered.slice(offset, offset + lm);

  const userMap = await getUserMap();
  const classMap = await getClassMap();
  const docCountMap = await getDocCountMap();
  const protCountMap = await getProtCountMap();
  const parentMap = Object.fromEntries(allRows.map((d) => [d.id, d]));
  const childCountMap = await getChildCountMap();

  res.json({
    items: page_items.map((d) => fmtDossier(d, userMap, classMap, docCountMap, protCountMap, parentMap, childCountMap)),
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
  const docCountMap = await getDocCountMap();
  const protCountMap = await getProtCountMap();
  const childCountMap = await getChildCountMap();
  const parentMap = await getDossierMap();
  res.json(fmtDossier(d, userMap, classMap, docCountMap, protCountMap, parentMap, childCountMap));
});

router.post("/dossiers", async (req, res): Promise<void> => {
  const { title, description, area, confidentiality, responsibleId, classificationId, parentId } = req.body;
  const year = new Date().getFullYear();
  const existing = await db.select({ id: dossiersTable.id }).from(dossiersTable).where(sql`extract(year from ${dossiersTable.createdAt}) = ${year}`);
  const code = `FASC-${year}-${String(existing.length + 1).padStart(4, "0")}`;
  let validParentId: number | null = null;
  if (parentId) {
    const [parent] = await db.select({ id: dossiersTable.id }).from(dossiersTable).where(eq(dossiersTable.id, Number(parentId))).limit(1);
    if (parent) validParentId = parent.id;
  }
  const [d] = await db.insert(dossiersTable).values({
    title, description, area, confidentiality: confidentiality || "normal",
    responsibleId: responsibleId || null, classificationId: classificationId || null,
    parentId: validParentId,
    year, code,
  }).returning();
  res.status(201).json(fmtDossier(d, {}, {}, {}, {}, {}, {}));
});

router.patch("/dossiers/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { title, description, status, area, confidentiality, responsibleId, classificationId, closedAt, parentId } = req.body;
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;
  if (area !== undefined) updates.area = area;
  if (confidentiality !== undefined) updates.confidentiality = confidentiality;
  if (responsibleId !== undefined) updates.responsibleId = responsibleId;
  if (classificationId !== undefined) updates.classificationId = classificationId;
  if (closedAt !== undefined) updates.closedAt = closedAt ? new Date(closedAt) : null;
  if (parentId !== undefined) {
    const newParent = parentId == null ? null : Number(parentId);
    if (newParent != null) {
      if (newParent === id) { res.status(400).json({ error: "Un fascicolo non può essere padre di se stesso" }); return; }
      if (await wouldCreateCycle(id, newParent)) { res.status(400).json({ error: "Gerarchia non valida: ciclo rilevato" }); return; }
    }
    updates.parentId = newParent;
  }
  const [d] = await db.update(dossiersTable).set(updates).where(eq(dossiersTable.id, id)).returning();
  if (!d) { res.status(404).json({ error: "Not found" }); return; }
  res.json(fmtDossier(d, {}, {}, {}, {}, {}, {}));
});

router.get("/dossiers/:id/children", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const rows = await db.select().from(dossiersTable).where(eq(dossiersTable.parentId, id)).orderBy(dossiersTable.createdAt);
  const userMap = await getUserMap();
  const classMap = await getClassMap();
  const docCountMap = await getDocCountMap();
  const protCountMap = await getProtCountMap();
  const childCountMap = await getChildCountMap();
  res.json(rows.map((d) => fmtDossier(d, userMap, classMap, docCountMap, protCountMap, {}, childCountMap)));
});

router.get("/dossiers/:id/documents", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  // Effective membership: documents whose home OR a copied membership is this dossier.
  const memberships = (await getEffectiveDocumentMemberships()).filter((m) => m.dossierId === id);
  const docIds = new Set(memberships.map((m) => m.documentId));
  const allDocs = await db.select().from(documentsTable);
  const docs = allDocs.filter((d) => docIds.has(d.id));
  const userMap = await getUserMap();
  res.json(docs.map((doc) => fmtDoc(doc, userMap)));
});

router.get("/dossiers/:id/protocols", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const memberships = (await getEffectiveMemberships()).filter((m) => m.dossierId === id);
  const protocolIds = memberships.map((m) => m.protocolId);
  const primaryMap = Object.fromEntries(memberships.map((m) => [m.protocolId, m.isPrimary]));
  const rows = protocolIds.length > 0
    ? await db.select().from(protocolsTable).where(inArray(protocolsTable.id, protocolIds))
    : [];
  const userMap = await getUserMap();
  res.json(rows.map((p) => ({
    id: p.id,
    number: p.number,
    type: p.type,
    status: p.status,
    subject: p.subject,
    sender: p.sender,
    recipients: p.recipients,
    priority: p.priority,
    confidentiality: p.confidentiality,
    isPrimary: primaryMap[p.id] ?? false,
    registeredAt: p.registeredAt?.toISOString() ?? null,
    registeredById: p.registeredById,
    createdByName: userMap[p.registeredById]?.name ?? "Unknown",
  })));
});

async function wouldCreateCycle(dossierId: number, newParentId: number): Promise<boolean> {
  const all = await db.select({ id: dossiersTable.id, parentId: dossiersTable.parentId }).from(dossiersTable);
  const parentOf = Object.fromEntries(all.map((d) => [d.id, d.parentId]));
  let cur: number | null | undefined = newParentId;
  const seen = new Set<number>();
  while (cur != null) {
    if (cur === dossierId) return true;
    if (seen.has(cur)) break;
    seen.add(cur);
    cur = parentOf[cur];
  }
  return false;
}

async function getUserMap() {
  const users = await db.select().from(usersTable);
  return Object.fromEntries(users.map((u) => [u.id, u]));
}
async function getClassMap() {
  const cls = await db.select().from(classificationsTable);
  return Object.fromEntries(cls.map((c) => [c.id, c]));
}
async function getDossierMap() {
  const rows = await db.select().from(dossiersTable);
  return Object.fromEntries(rows.map((d) => [d.id, d]));
}
async function getDocCountMap() {
  // Count effective memberships (home ∪ copied) so copied docs are counted in
  // every fascicolo they belong to.
  const memberships = await getEffectiveDocumentMemberships();
  const map: Record<number, number> = {};
  for (const m of memberships) map[m.dossierId] = (map[m.dossierId] ?? 0) + 1;
  return map;
}
async function getProtCountMap() {
  const memberships = await getEffectiveMemberships();
  const map: Record<number, number> = {};
  for (const m of memberships) map[m.dossierId] = (map[m.dossierId] ?? 0) + 1;
  return map;
}
async function getChildCountMap() {
  const childCounts = await db.select({ parentId: dossiersTable.parentId, cnt: count() }).from(dossiersTable).groupBy(dossiersTable.parentId);
  return Object.fromEntries(childCounts.filter((x) => x.parentId != null).map((x) => [x.parentId as number, Number(x.cnt)]));
}

function fmtDossier(
  d: typeof dossiersTable.$inferSelect,
  userMap: Record<number, { name: string }>,
  classMap: Record<number, { code: string }>,
  docCountMap: Record<number, number>,
  protCountMap: Record<number, number>,
  parentMap: Record<number, { code: string; title: string }>,
  childCountMap: Record<number, number>,
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
    isDefault: d.isDefault,
    parentId: d.parentId,
    parentCode: d.parentId ? (parentMap[d.parentId]?.code ?? null) : null,
    parentTitle: d.parentId ? (parentMap[d.parentId]?.title ?? null) : null,
    childCount: childCountMap[d.id] ?? 0,
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
