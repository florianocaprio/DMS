import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { and, eq, ne } from "drizzle-orm";
import { isKnownRole, requireAnyRole } from "../middleware/requireRole";

const router = Router();

router.get("/users/me", async (req, res): Promise<void> => {
  const user = await db.select().from(usersTable).where(eq(usersTable.id, req.currentUserId!)).limit(1);
  if (!user[0]) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatUser(user[0]));
});

router.use("/users", requireAnyRole(["admin"]));

router.get("/users", async (req, res): Promise<void> => {
  const { role, active } = req.query;
  let rows = await db.select().from(usersTable).orderBy(usersTable.name);
  if (role) rows = rows.filter((u) => u.role === role);
  if (active !== undefined) rows = rows.filter((u) => u.isActive === (active === "true"));
  res.json(rows.map(formatUser));
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user[0]) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatUser(user[0]));
});

router.post("/users", async (req, res): Promise<void> => {
  const { username, email, name, role, area, section, avatarUrl, isActive, mustChangePassword } = req.body;
  const clean = normalizeUserInput({ username, email, name, role });
  if ("error" in clean) { res.status(400).json({ error: clean.error }); return; }

  const duplicate = await findUserDuplicate(clean.email, clean.username);
  if (duplicate) { res.status(409).json({ error: duplicate }); return; }

  const [user] = await db.insert(usersTable).values({
    username: clean.username,
    email: clean.email,
    name: clean.name,
    role: clean.role,
    area: area || null,
    section: section || null,
    avatarUrl: avatarUrl || null,
    isActive: isActive ?? true,
    mustChangePassword: mustChangePassword ?? false,
  }).returning();
  res.status(201).json(formatUser(user));
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { username, email, name, role, area, section, isActive, mustChangePassword, avatarUrl } = req.body;
  const updates: Record<string, unknown> = {};
  if (username !== undefined) {
    const normalized = normalizeUsername(username);
    if (normalized === "") { res.status(400).json({ error: "Username non valido" }); return; }
    updates.username = normalized;
  }
  if (email !== undefined) {
    const normalized = normalizeEmail(email);
    if (!normalized) { res.status(400).json({ error: "Email obbligatoria" }); return; }
    updates.email = normalized;
  }
  if (name !== undefined) {
    const value = String(name).trim();
    if (!value) { res.status(400).json({ error: "Nome obbligatorio" }); return; }
    updates.name = value;
  }
  if (role !== undefined) {
    if (!isKnownRole(role)) { res.status(400).json({ error: "Ruolo non valido" }); return; }
    updates.role = role;
  }
  if (area !== undefined) updates.area = area;
  if (section !== undefined) updates.section = section;
  if (isActive !== undefined) updates.isActive = isActive;
  if (mustChangePassword !== undefined) updates.mustChangePassword = mustChangePassword;
  if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;

  if (updates.email || updates.username) {
    const duplicate = await findUserDuplicate(updates.email as string | undefined, updates.username as string | null | undefined, id);
    if (duplicate) { res.status(409).json({ error: duplicate }); return; }
  }

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatUser(user));
});

function normalizeUserInput(input: { username?: unknown; email?: unknown; name?: unknown; role?: unknown }) {
  const email = normalizeEmail(input.email);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const username = normalizeUsername(input.username);
  const role = input.role || "collaborator";

  if (!email) return { error: "Email obbligatoria" };
  if (!name) return { error: "Nome obbligatorio" };
  if (username === "") return { error: "Username non valido" };
  if (!isKnownRole(role)) return { error: "Ruolo non valido" };

  return { email, name, username, role };
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeUsername(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const username = String(value).trim().toLowerCase();
  return /^[a-z0-9._-]{3,30}$/.test(username) ? username : "";
}

async function findUserDuplicate(email?: string, username?: string | null, exceptId?: number): Promise<string | null> {
  if (email) {
    const rows = exceptId
      ? await db.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.email, email), ne(usersTable.id, exceptId))).limit(1)
      : await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (rows[0]) return "Email già in uso";
  }
  if (username) {
    const rows = exceptId
      ? await db.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.username, username), ne(usersTable.id, exceptId))).limit(1)
      : await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username)).limit(1);
    if (rows[0]) return "Username già in uso";
  }
  return null;
}

function formatUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    name: u.name,
    role: u.role,
    area: u.area,
    section: u.section,
    avatarUrl: u.avatarUrl,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

export default router;
