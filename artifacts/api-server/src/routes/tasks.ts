import { Router } from "express";
import { db } from "@workspace/db";
import { tasksTable, usersTable, protocolsTable, documentsTable, dossiersTable } from "@workspace/db";
import { eq, lt, desc } from "drizzle-orm";

const router = Router();

router.get("/tasks", async (req, res): Promise<void> => {
  const { status, assignedToMe, protocolId, dossierId, priority, page = "1", limit = "20" } = req.query;
  const pg = Number(page);
  const lm = Number(limit);
  const offset = (pg - 1) * lm;

  let rows = await db.select().from(tasksTable).orderBy(desc(tasksTable.createdAt));
  if (status) rows = rows.filter((t) => t.status === status);
  if (assignedToMe === "true") rows = rows.filter((t) => t.assignedToId === req.currentUserId);
  if (protocolId) rows = rows.filter((t) => t.protocolId === Number(protocolId));
  if (dossierId) rows = rows.filter((t) => t.dossierId === Number(dossierId));
  if (priority) rows = rows.filter((t) => t.priority === priority);

  const total = rows.length;
  const page_items = rows.slice(offset, offset + lm);

  const ctx = await getContext();
  res.json({
    items: page_items.map((t) => fmtTask(t, ctx)),
    total,
    page: pg,
    limit: lm,
  });
});

router.get("/tasks/overdue", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.select().from(tasksTable)
    .where(lt(tasksTable.dueDate, today))
    .orderBy(tasksTable.dueDate);
  const filtered = rows.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  const ctx = await getContext();
  res.json(filtered.map((t) => fmtTask(t, ctx)));
});

router.get("/tasks/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [t] = await db.select().from(tasksTable).where(eq(tasksTable.id, id)).limit(1);
  if (!t) { res.status(404).json({ error: "Not found" }); return; }
  const ctx = await getContext();
  res.json(fmtTask(t, ctx));
});

router.post("/tasks", async (req, res): Promise<void> => {
  const { title, description, priority, protocolId, documentId, dossierId, assignedToId, dueDate, notes } = req.body;
  const [t] = await db.insert(tasksTable).values({
    title, description, priority: priority || "normal",
    protocolId: protocolId || null, documentId: documentId || null,
    dossierId: dossierId || null, assignedToId: assignedToId || null,
    createdById: req.currentUserId!, dueDate: dueDate || null, notes,
  }).returning();
  const ctx = await getContext();
  res.status(201).json(fmtTask(t, ctx));
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { title, description, status, priority, progress, assignedToId, dueDate, notes, outcome } = req.body;
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;
  if (priority !== undefined) updates.priority = priority;
  if (progress !== undefined) updates.progress = progress;
  if (assignedToId !== undefined) updates.assignedToId = assignedToId;
  if (dueDate !== undefined) updates.dueDate = dueDate;
  if (notes !== undefined) updates.notes = notes;
  if (outcome !== undefined) updates.outcome = outcome;
  if (status === "completed") updates.completedAt = new Date();
  const [t] = await db.update(tasksTable).set(updates).where(eq(tasksTable.id, id)).returning();
  if (!t) { res.status(404).json({ error: "Not found" }); return; }
  const ctx = await getContext();
  res.json(fmtTask(t, ctx));
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.update(tasksTable).set({ status: "cancelled" }).where(eq(tasksTable.id, id));
  res.status(204).end();
});

async function getContext() {
  const [users, protocols, documents, dossiers] = await Promise.all([
    db.select().from(usersTable),
    db.select().from(protocolsTable),
    db.select().from(documentsTable),
    db.select().from(dossiersTable),
  ]);
  return {
    userMap: Object.fromEntries(users.map((u) => [u.id, u])),
    protMap: Object.fromEntries(protocols.map((p) => [p.id, p])),
    docMap: Object.fromEntries(documents.map((d) => [d.id, d])),
    dossierMap: Object.fromEntries(dossiers.map((d) => [d.id, d])),
  };
}

function fmtTask(
  t: typeof tasksTable.$inferSelect,
  ctx: {
    userMap: Record<number, { name: string }>;
    protMap: Record<number, { number: string }>;
    docMap: Record<number, { title: string }>;
    dossierMap: Record<number, { title: string }>;
  },
) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    progress: t.progress,
    protocolId: t.protocolId,
    protocolNumber: t.protocolId ? (ctx.protMap[t.protocolId]?.number ?? null) : null,
    documentId: t.documentId,
    documentTitle: t.documentId ? (ctx.docMap[t.documentId]?.title ?? null) : null,
    dossierId: t.dossierId,
    dossierTitle: t.dossierId ? (ctx.dossierMap[t.dossierId]?.title ?? null) : null,
    assignedToId: t.assignedToId,
    assignedToName: t.assignedToId ? (ctx.userMap[t.assignedToId]?.name ?? null) : null,
    createdById: t.createdById,
    createdByName: ctx.userMap[t.createdById]?.name ?? "Unknown",
    dueDate: t.dueDate,
    completedAt: t.completedAt?.toISOString() ?? null,
    notes: t.notes,
    outcome: t.outcome,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export default router;
