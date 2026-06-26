import { Router } from "express";
import { db } from "@workspace/db";
import { classificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/classifications", async (_req, res): Promise<void> => {
  const rows = await db.select().from(classificationsTable).orderBy(classificationsTable.code);
  res.json(rows.map(fmt));
});

router.post("/classifications", async (req, res): Promise<void> => {
  const { code, title, description, level, parentId } = req.body;
  const [row] = await db.insert(classificationsTable).values({ code, title, description, level: level || 1, parentId }).returning();
  res.status(201).json(fmt(row));
});

function fmt(c: typeof classificationsTable.$inferSelect) {
  return {
    id: c.id,
    code: c.code,
    title: c.title,
    description: c.description,
    level: c.level,
    parentId: c.parentId,
    isActive: c.isActive,
  };
}

export default router;
