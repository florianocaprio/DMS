import { Router } from "express";
import { db } from "@workspace/db";
import { classificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAnyRole } from "../middleware/requireRole";

const router = Router();

router.get("/classifications", async (_req, res): Promise<void> => {
  const rows = await db.select().from(classificationsTable).orderBy(classificationsTable.sortOrder, classificationsTable.code);
  res.json(rows.map(fmt));
});

router.use("/classifications", requireAnyRole(["admin"]));

router.post("/classifications", async (req, res): Promise<void> => {
  const values = parseClassificationInput(req.body);
  if ("error" in values) { res.status(400).json({ error: values.error }); return; }
  const [row] = await db.insert(classificationsTable).values(values).returning();
  res.status(201).json(fmt(row));
});

router.patch("/classifications/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const updates = parseClassificationUpdate(req.body);
  if ("error" in updates) { res.status(400).json({ error: updates.error }); return; }

  if (updates.parentId === id) {
    res.status(400).json({ error: "Una voce non può essere padre di se stessa" });
    return;
  }
  if (typeof updates.parentId === "number" && await wouldCreateCycle(id, updates.parentId)) {
    res.status(400).json({ error: "Gerarchia non valida: ciclo rilevato" });
    return;
  }

  const [row] = await db.update(classificationsTable).set(updates).where(eq(classificationsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(fmt(row));
});

function parseClassificationInput(body: Record<string, unknown>) {
  const code = cleanString(body.code);
  const title = cleanString(body.title);
  if (!code) return { error: "Codice obbligatorio" };
  if (!title) return { error: "Titolo obbligatorio" };

  return {
    code,
    title,
    description: cleanNullableString(body.description),
    level: toInteger(body.level, 1),
    parentId: toNullableInteger(body.parentId),
    sortOrder: toInteger(body.sortOrder, 0),
    retentionYears: toNullableInteger(body.retentionYears),
    retentionPolicy: cleanNullableString(body.retentionPolicy),
    responsibleRole: cleanNullableString(body.responsibleRole),
    responsibleUserId: toNullableInteger(body.responsibleUserId),
    visibility: cleanString(body.visibility) || "normal",
    isActive: body.isActive === undefined ? true : Boolean(body.isActive),
  };
}

function parseClassificationUpdate(body: Record<string, unknown>) {
  const updates: Record<string, unknown> = {};
  for (const key of ["code", "title", "visibility"] as const) {
    if (body[key] !== undefined) {
      const value = cleanString(body[key]);
      if (!value && key !== "visibility") return { error: `${key} obbligatorio` };
      updates[key] = value || "normal";
    }
  }
  if (body.description !== undefined) updates.description = cleanNullableString(body.description);
  if (body.level !== undefined) updates.level = toInteger(body.level, 1);
  if (body.parentId !== undefined) updates.parentId = toNullableInteger(body.parentId);
  if (body.sortOrder !== undefined) updates.sortOrder = toInteger(body.sortOrder, 0);
  if (body.retentionYears !== undefined) updates.retentionYears = toNullableInteger(body.retentionYears);
  if (body.retentionPolicy !== undefined) updates.retentionPolicy = cleanNullableString(body.retentionPolicy);
  if (body.responsibleRole !== undefined) updates.responsibleRole = cleanNullableString(body.responsibleRole);
  if (body.responsibleUserId !== undefined) updates.responsibleUserId = toNullableInteger(body.responsibleUserId);
  if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);
  return updates;
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNullableString(value: unknown): string | null {
  const clean = cleanString(value);
  return clean || null;
}

function toInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function toNullableInteger(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

async function wouldCreateCycle(classificationId: number, newParentId: number): Promise<boolean> {
  const all = await db.select({ id: classificationsTable.id, parentId: classificationsTable.parentId }).from(classificationsTable);
  const parentOf = Object.fromEntries(all.map((c) => [c.id, c.parentId]));
  let cur: number | null | undefined = newParentId;
  const seen = new Set<number>();
  while (cur != null) {
    if (cur === classificationId) return true;
    if (seen.has(cur)) return true;
    seen.add(cur);
    cur = parentOf[cur];
  }
  return false;
}

function fmt(c: typeof classificationsTable.$inferSelect) {
  return {
    id: c.id,
    code: c.code,
    title: c.title,
    description: c.description,
    level: c.level,
    parentId: c.parentId,
    sortOrder: c.sortOrder,
    retentionYears: c.retentionYears,
    retentionPolicy: c.retentionPolicy,
    responsibleRole: c.responsibleRole,
    responsibleUserId: c.responsibleUserId,
    visibility: c.visibility,
    isActive: c.isActive,
  };
}

export default router;
