import { Router } from "express";
import { db } from "@workspace/db";
import { protocolsTable, usersTable, dossiersTable, classificationsTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";

const router = Router();

const TYPE_MAP: Record<string, string> = {
  incoming: "E",
  outgoing: "U",
  internal: "I",
  reserved: "RIS",
};

async function generateNumber(type: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = "AIM";
  const typeCode = TYPE_MAP[type] || "I";
  const existing = await db.select({ id: protocolsTable.id })
    .from(protocolsTable)
    .where(sql`extract(year from ${protocolsTable.registeredAt}) = ${year} AND ${protocolsTable.type} = ${type}`);
  const num = String(existing.length + 1).padStart(6, "0");
  return `${prefix}-${year}-${typeCode}-${num}`;
}

router.get("/protocols", async (req, res): Promise<void> => {
  const { type, status, year, dossierId, assignedToMe, page = "1", limit = "20" } = req.query;
  const pg = Number(page);
  const lm = Number(limit);
  const offset = (pg - 1) * lm;

  let rows = await db.select().from(protocolsTable).orderBy(desc(protocolsTable.registeredAt));
  if (type) rows = rows.filter((p) => p.type === type);
  if (status) rows = rows.filter((p) => p.status === status);
  if (year) rows = rows.filter((p) => p.year === Number(year));
  if (dossierId) rows = rows.filter((p) => p.dossierId === Number(dossierId));
  if (assignedToMe === "true") rows = rows.filter((p) => p.assignedToId === 1);

  const total = rows.length;
  const page_items = rows.slice(offset, offset + lm);

  const userMap = await getUserMap();
  const dossierMap = await getDossierMap();
  const classMap = await getClassMap();

  res.json({
    items: page_items.map((p) => fmtProtocol(p, userMap, dossierMap, classMap)),
    total,
    page: pg,
    limit: lm,
  });
});

router.get("/protocols/summary", async (_req, res): Promise<void> => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const all = await db.select().from(protocolsTable);

  const byType = ["incoming", "outgoing", "internal", "reserved"].map((type) => ({
    type,
    count: all.filter((p) => p.type === type).length,
  }));

  const byStatus = ["registered", "assigned", "in_progress", "completed", "cancelled"].map((status) => ({
    status,
    count: all.filter((p) => p.status === status).length,
  }));

  const thisYear = all.filter((p) => p.year === year).length;
  const thisMonth = all.filter((p) => {
    const d = new Date(p.registeredAt);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  }).length;

  res.json({ byType, byStatus, thisYear, thisMonth });
});

router.get("/protocols/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [p] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, id)).limit(1);
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  const userMap = await getUserMap();
  const dossierMap = await getDossierMap();
  const classMap = await getClassMap();
  res.json(fmtProtocol(p, userMap, dossierMap, classMap));
});

router.post("/protocols", async (req, res): Promise<void> => {
  const { type, subject, description, sender, recipients, ccRecipients, channel, confidentiality, priority, dossierId, classificationId, documentId, assignedToId, notes } = req.body;
  const number = await generateNumber(type);
  const year = new Date().getFullYear();
  const [p] = await db.insert(protocolsTable).values({
    number, year, type, subject, description, sender,
    recipients: recipients || [], ccRecipients: ccRecipients || [],
    channel, confidentiality: confidentiality || "normal",
    priority: priority || "normal",
    dossierId: dossierId || null, classificationId: classificationId || null,
    documentId: documentId || null, assignedToId: assignedToId || null,
    registeredById: 1, notes,
  }).returning();
  res.status(201).json(fmtProtocol(p, {}, {}, {}));
});

router.patch("/protocols/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { subject, description, sender, recipients, priority, confidentiality, dossierId, classificationId, assignedToId, notes } = req.body;
  const updates: Record<string, unknown> = {};
  if (subject !== undefined) updates.subject = subject;
  if (description !== undefined) updates.description = description;
  if (sender !== undefined) updates.sender = sender;
  if (recipients !== undefined) updates.recipients = recipients;
  if (priority !== undefined) updates.priority = priority;
  if (confidentiality !== undefined) updates.confidentiality = confidentiality;
  if (dossierId !== undefined) updates.dossierId = dossierId;
  if (classificationId !== undefined) updates.classificationId = classificationId;
  if (assignedToId !== undefined) updates.assignedToId = assignedToId;
  if (notes !== undefined) updates.notes = notes;
  const [p] = await db.update(protocolsTable).set(updates).where(eq(protocolsTable.id, id)).returning();
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  res.json(fmtProtocol(p, {}, {}, {}));
});

router.post("/protocols/:id/cancel", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { reason } = req.body;
  if (!reason) { res.status(400).json({ error: "Reason is required" }); return; }
  const [p] = await db.update(protocolsTable).set({
    status: "cancelled",
    cancelledAt: new Date(),
    cancelReason: reason,
  }).where(eq(protocolsTable.id, id)).returning();
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  res.json(fmtProtocol(p, {}, {}, {}));
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

function fmtProtocol(
  p: typeof protocolsTable.$inferSelect,
  userMap: Record<number, { name: string }>,
  dossierMap: Record<number, { title: string }>,
  classMap: Record<number, { code: string }>,
) {
  return {
    id: p.id,
    number: p.number,
    year: p.year,
    type: p.type,
    status: p.status,
    subject: p.subject,
    description: p.description,
    sender: p.sender,
    recipients: p.recipients,
    ccRecipients: p.ccRecipients,
    channel: p.channel,
    confidentiality: p.confidentiality,
    priority: p.priority,
    dossierId: p.dossierId,
    dossierTitle: p.dossierId ? (dossierMap[p.dossierId]?.title ?? null) : null,
    classificationId: p.classificationId,
    classificationCode: p.classificationId ? (classMap[p.classificationId]?.code ?? null) : null,
    documentId: p.documentId,
    assignedToId: p.assignedToId,
    assignedToName: p.assignedToId ? (userMap[p.assignedToId]?.name ?? null) : null,
    registeredById: p.registeredById,
    registeredByName: userMap[p.registeredById]?.name ?? "System",
    cancelledAt: p.cancelledAt?.toISOString() ?? null,
    cancelReason: p.cancelReason,
    notes: p.notes,
    driveFolder: p.driveFolder,
    registeredAt: p.registeredAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export default router;
