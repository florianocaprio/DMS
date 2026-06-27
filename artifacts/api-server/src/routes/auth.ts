import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../lib/password";
import { isSetupMode, loginCapableAdminCondition } from "../lib/bootstrap";

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
// (no administrator with a password exists yet). Public.
router.get("/auth/bootstrap", async (_req, res): Promise<void> => {
  res.json({ setupMode: await isSetupMode() });
});

// POST /auth/bootstrap — first-run: register the very first administrator.
// Allowed only while no admin with a password exists; creating it completes
// setup, logs the new admin in (signed session cookie) and locks this endpoint.
// Public (used before any login). Body: { name, username, password, email? }.
router.post("/auth/bootstrap", async (req, res): Promise<void> => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
  const emailInput = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!name) {
    res.status(400).json({ error: "Il nome è obbligatorio" });
    return;
  }
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    res.status(400).json({ error: "Nome utente non valido (min 3 caratteri: lettere, numeri, . _ -)" });
    return;
  }
  if (emailInput && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput)) {
    res.status(400).json({ error: "Email non valida" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "La password deve contenere almeno 8 caratteri" });
    return;
  }

  const email = emailInput || `${username}@local`;
  // Hash outside the transaction so the (slow) scrypt work doesn't hold the
  // advisory lock.
  const passwordHash = await hashPassword(password);

  try {
    // Serialize concurrent first-run requests and re-check INSIDE the locked
    // transaction. This closes the check-then-insert race: once one request
    // creates the first admin, every later locked request is rejected.
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${BOOTSTRAP_ADVISORY_LOCK_KEY})`);
      const [existingAdmin] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(loginCapableAdminCondition())
        .limit(1);
      if (existingAdmin) return { status: "locked" as const };

      // Reject duplicates explicitly so the user gets a clear message rather
      // than a raw unique-constraint error.
      const [byUsername] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.username, username))
        .limit(1);
      if (byUsername) return { status: "username_taken" as const };
      const [byEmail] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);
      if (byEmail) return { status: "email_taken" as const };

      const [created] = await tx
        .insert(usersTable)
        .values({
          username,
          email,
          name,
          role: "admin",
          passwordHash,
          mustChangePassword: false,
          isActive: true,
          lastLoginAt: new Date(),
        })
        .returning();
      return { status: "created" as const, user: created };
    });

    if (outcome.status === "locked") {
      res.status(403).json({ error: "Configurazione già completata. Accedi con le tue credenziali." });
      return;
    }
    if (outcome.status === "username_taken") {
      res.status(409).json({ error: "Nome utente già in uso" });
      return;
    }
    if (outcome.status === "email_taken") {
      res.status(409).json({ error: "Email già in uso" });
      return;
    }
    res.cookie(LOCAL_SESSION_COOKIE, String(outcome.user.id), cookieOptions());
    res.status(201).json(publicUser(outcome.user));
  } catch (err) {
    req.log.error({ err }, "first admin registration failed");
    res.status(500).json({ error: "Errore durante la registrazione" });
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
// valid, otherwise 401. Checks only the local signed session cookie. Public.
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
