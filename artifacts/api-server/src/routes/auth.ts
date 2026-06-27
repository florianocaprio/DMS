import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../lib/password";
import { adminExists, validateBootstrapInput } from "../lib/bootstrap";

const router = Router();

// Arbitrary constant key used to serialize concurrent first-run bootstrap
// requests via a Postgres transaction-level advisory lock, so the
// "no more creation once an admin exists" invariant holds even under races.
const BOOTSTRAP_ADVISORY_LOCK_KEY = 920_117;

// Name of the signed cookie that carries the local-session user id.
export const LOCAL_SESSION_COOKIE = "pd_session";

const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    signed: true,
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  };
}

function publicUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    username: u.username,
    avatarUrl: u.avatarUrl,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
  };
}

// POST /auth/login — local username/password login. Sets a signed httpOnly
// session cookie on success. Public (exempt from requireAuth).
router.post("/auth/login", async (req, res): Promise<void> => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!username || !password) {
    res.status(400).json({ error: "Username e password sono obbligatori" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
  // Always run the (relatively slow) verify to reduce username enumeration via timing.
  const ok = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !ok) {
    res.status(401).json({ error: "Credenziali non valide" });
    return;
  }
  if (!user.isActive) {
    res.status(403).json({ error: "Account disattivato" });
    return;
  }

  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
  res.cookie(LOCAL_SESSION_COOKIE, String(user.id), cookieOptions());
  res.json(publicUser(user));
});

// POST /auth/logout — clears the local session cookie. Public (idempotent).
router.post("/auth/logout", async (_req, res): Promise<void> => {
  res.clearCookie(LOCAL_SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.status(204).end();
});

// GET /auth/bootstrap — reports whether the app still needs first-run setup
// (no administrator account exists yet). Public.
router.get("/auth/bootstrap", async (_req, res): Promise<void> => {
  res.json({ setupMode: !(await adminExists()) });
});

// POST /auth/bootstrap — first-run user creation. Only allowed while no admin
// exists; creating an administrator completes setup and locks this endpoint, so
// from then on access requires real credentials. Public (used before any login).
router.post("/auth/bootstrap", async (req, res): Promise<void> => {
  if (await adminExists()) {
    res.status(403).json({ error: "Configurazione già completata. Accedi con le tue credenziali." });
    return;
  }

  const parsed = validateBootstrapInput(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const { name, email, username, password, role } = parsed.value;

  // Hash outside the transaction so the (slow) scrypt work doesn't hold the
  // advisory lock.
  const passwordHash = await hashPassword(password);

  try {
    // Serialize all bootstrap creations and re-check admin existence INSIDE the
    // locked transaction. This closes the check-then-insert race: once a request
    // commits the first admin, every subsequent locked request sees it and is
    // rejected, so no extra unauthenticated accounts can slip through.
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${BOOTSTRAP_ADVISORY_LOCK_KEY})`);
      const [existingAdmin] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.role, "admin"))
        .limit(1);
      if (existingAdmin) return { locked: true as const };
      const [user] = await tx
        .insert(usersTable)
        .values({ name, email, username, passwordHash, role, isActive: true })
        .returning();
      return { locked: false as const, user };
    });

    if (outcome.locked) {
      res.status(403).json({ error: "Configurazione già completata. Accedi con le tue credenziali." });
      return;
    }
    res.status(201).json({ user: publicUser(outcome.user), setupComplete: role === "admin" });
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      res.status(409).json({ error: "Nome utente o email già esistenti" });
      return;
    }
    req.log.error({ err }, "bootstrap user creation failed");
    res.status(500).json({ error: "Errore durante la creazione dell'utenza" });
  }
});

// POST /auth/change-password — sets a new password for the current local-session
// user and clears the mustChangePassword flag. Requires authentication (the
// signed session cookie set by /auth/login), so it is NOT a public path.
router.post("/auth/change-password", async (req, res): Promise<void> => {
  const userId = req.currentUserId;
  if (!userId) {
    res.status(401).json({ error: "Autenticazione richiesta" });
    return;
  }

  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Password attuale e nuova password sono obbligatorie" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "La nuova password deve contenere almeno 8 caratteri" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Utente non trovato" });
    return;
  }
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Password attuale non corretta" });
    return;
  }
  if (newPassword === currentPassword) {
    res.status(400).json({ error: "La nuova password deve essere diversa da quella attuale" });
    return;
  }

  const passwordHash = await hashPassword(newPassword);
  const [updated] = await db
    .update(usersTable)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(usersTable.id, userId))
    .returning();
  res.json(publicUser(updated));
});

// GET /auth/session — returns the local-session user if the signed cookie is
// valid, otherwise 401. Only checks the local cookie (never Clerk). Public.
router.get("/auth/session", async (req, res): Promise<void> => {
  const raw = req.signedCookies?.[LOCAL_SESSION_COOKIE];
  const id = Number(raw);
  if (!raw || Number.isNaN(id)) {
    res.status(401).json({ error: "Nessuna sessione locale" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user || !user.isActive) {
    res.clearCookie(LOCAL_SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
    res.status(401).json({ error: "Sessione non valida" });
    return;
  }
  res.json(publicUser(user));
});

export default router;
