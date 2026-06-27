import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/users", async (req, res): Promise<void> => {
  const { role, active } = req.query;
  let rows = await db.select().from(usersTable).orderBy(usersTable.name);
  if (role) rows = rows.filter((u) => u.role === role);
  if (active !== undefined) rows = rows.filter((u) => u.isActive === (active === "true"));
  res.json(rows.map(formatUser));
});

router.get("/users/me", async (req, res): Promise<void> => {
  const user = await db.select().from(usersTable).where(eq(usersTable.id, req.currentUserId!)).limit(1);
  if (!user[0]) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatUser(user[0]));
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user[0]) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatUser(user[0]));
});

router.post("/users", async (req, res): Promise<void> => {
  const { email, name, role, area, section, avatarUrl } = req.body;
  const [user] = await db.insert(usersTable).values({ email, name, role: role || "collaborator", area, section, avatarUrl }).returning();
  res.status(201).json(formatUser(user));
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { name, role, area, section, isActive, avatarUrl } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (role !== undefined) updates.role = role;
  if (area !== undefined) updates.area = area;
  if (section !== undefined) updates.section = section;
  if (isActive !== undefined) updates.isActive = isActive;
  if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatUser(user));
});

function formatUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    area: u.area,
    section: u.section,
    avatarUrl: u.avatarUrl,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

export default router;
