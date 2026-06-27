import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Roles that may be assigned to an account during first-run setup.
export const BOOTSTRAP_ROLES = ["admin", "manager", "collaborator", "viewer"] as const;
export type BootstrapRole = (typeof BOOTSTRAP_ROLES)[number];

export interface BootstrapInput {
  name: string;
  email: string;
  username: string;
  password: string;
  role: BootstrapRole;
}

/**
 * First-run setup is active while NO administrator account exists yet. As soon
 * as an admin row is present the app is considered configured and the public
 * bootstrap endpoints lock themselves; access then requires real credentials.
 */
export async function adminExists(): Promise<boolean> {
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"))
    .limit(1);
  return Boolean(row);
}

/**
 * Validate and normalize a first-run user-creation payload. Pure (no DB), so it
 * can be unit-tested directly without manipulating global setup state.
 */
export function validateBootstrapInput(
  body: unknown,
): { ok: true; value: BootstrapInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const username = typeof b.username === "string" ? b.username.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  const role = typeof b.role === "string" ? b.role : "";

  if (!name || !email || !username || !password) {
    return { ok: false, error: "Nome, email, nome utente e password sono obbligatori" };
  }
  if (!email.includes("@")) {
    return { ok: false, error: "Email non valida" };
  }
  if (username.length < 3) {
    return { ok: false, error: "Il nome utente deve contenere almeno 3 caratteri" };
  }
  if (password.length < 8) {
    return { ok: false, error: "La password deve contenere almeno 8 caratteri" };
  }
  if (!(BOOTSTRAP_ROLES as readonly string[]).includes(role)) {
    return { ok: false, error: "Ruolo non valido" };
  }
  return { ok: true, value: { name, email, username, password, role: role as BootstrapRole } };
}
