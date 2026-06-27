import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { db, usersTable } from "@workspace/db";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import app from "../app";
import { hashPassword } from "../lib/password";
import { ALLOWED_DOMAIN, closeDb, uniqueSuffix } from "./helpers";

/**
 * First-run setup: when no LOGIN-CAPABLE administrator exists, the public
 * /auth/bootstrap endpoints let the first visitor REGISTER the initial admin and
 * are then locked. These tests must run against a DB that has no usable admin,
 * so the suite removes every password-bearing admin up front and restores them
 * afterwards (the dev DB keeps its real accounts).
 *
 * Note: these suites manipulate the global admin state, so they assume they own
 * the DB for their duration (vitest runs files sequentially: fileParallelism is
 * disabled).
 */
async function deletePasswordAdmins(): Promise<Array<typeof usersTable.$inferSelect>> {
  return db
    .delete(usersTable)
    .where(and(eq(usersTable.role, "admin"), isNotNull(usersTable.passwordHash)))
    .returning();
}

// Real password-bearing admins removed to force setup mode, restored at the very
// end so the shared dev database keeps its existing accounts.
let savedAdmins: Array<typeof usersTable.$inferSelect> = [];

beforeAll(async () => {
  savedAdmins = await deletePasswordAdmins();
});

afterAll(async () => {
  if (savedAdmins.length) {
    await db.insert(usersTable).values(savedAdmins).onConflictDoNothing();
    savedAdmins = [];
  }
  await closeDb();
});

describe("first-run admin registration (/auth/bootstrap)", () => {
  // Keep usernames short: the endpoint caps them at 30 chars.
  const username = `setup${Math.floor(Math.random() * 1e6)}`;
  let createdId: number | undefined;

  beforeAll(async () => {
    await deletePasswordAdmins();
  });

  afterAll(async () => {
    if (createdId !== undefined) {
      await db.delete(usersTable).where(eq(usersTable.id, createdId));
    }
  });

  it("reports setup mode while no login-capable admin exists", async () => {
    const res = await request(app).get("/api/auth/bootstrap");
    expect(res.status).toBe(200);
    expect(res.body.setupMode).toBe(true);
  });

  it("rejects a password shorter than 8 characters (400)", async () => {
    const res = await request(app)
      .post("/api/auth/bootstrap")
      .send({ name: "Admin", username, password: "short" });
    expect(res.status).toBe(400);
    // Still in setup mode after a rejected attempt — no admin was created.
    const status = await request(app).get("/api/auth/bootstrap");
    expect(status.body.setupMode).toBe(true);
  });

  it("rejects an invalid username (400)", async () => {
    const res = await request(app)
      .post("/api/auth/bootstrap")
      .send({ name: "Admin", username: "ab", password: "supersegreta123" });
    expect(res.status).toBe(400);
  });

  it("registers the first admin, logs them in, then locks itself", async () => {
    const res = await request(app)
      .post("/api/auth/bootstrap")
      .send({ name: "Amministratore", username, password: "supersegreta123" });
    expect(res.status).toBe(201);
    expect(res.body.username).toBe(username);
    expect(res.body.role).toBe("admin");
    expect(res.body.mustChangePassword).toBe(false);
    createdId = res.body.id;

    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(Array.isArray(cookies)).toBe(true);
    expect(cookies.some((c) => c.startsWith("pd_session="))).toBe(true);

    // The new admin has a password hash and a default @local email.
    const [row] = await db.select().from(usersTable).where(eq(usersTable.id, res.body.id)).limit(1);
    expect(row.passwordHash).toBeTruthy();
    expect(row.email).toBe(`${username}@local`);

    // Setup is now complete, so the endpoint is locked.
    const status = await request(app).get("/api/auth/bootstrap");
    expect(status.body.setupMode).toBe(false);
    const again = await request(app)
      .post("/api/auth/bootstrap")
      .send({ name: "Altro", username: `other${Math.floor(Math.random() * 1e6)}`, password: "anothergoodpass" });
    expect(again.status).toBe(403);
  });
});

describe("bootstrap accepts an optional custom email", () => {
  let adminId: number;
  const username = `mail${Math.floor(Math.random() * 1e6)}`;
  const email = `custom-${uniqueSuffix()}@${ALLOWED_DOMAIN}`.toLowerCase();

  beforeAll(async () => {
    await deletePasswordAdmins();
  });

  afterAll(async () => {
    await db.delete(usersTable).where(eq(usersTable.id, adminId));
  });

  it("uses the provided email instead of the @local default", async () => {
    const res = await request(app)
      .post("/api/auth/bootstrap")
      .send({ name: "Admin Email", username, email, password: "supersegreta123" });
    expect(res.status).toBe(201);
    adminId = res.body.id;
    expect(res.body.email).toBe(email);

    const status = await request(app).get("/api/auth/bootstrap");
    expect(status.body.setupMode).toBe(false);
  });
});

describe("setup stays open when the only password-admin cannot log in", () => {
  const createdIds: number[] = [];

  beforeAll(async () => {
    await deletePasswordAdmins();
  });

  afterAll(async () => {
    if (createdIds.length) {
      await db.delete(usersTable).where(inArray(usersTable.id, createdIds));
    }
  });

  it("treats an inactive admin-with-password as not login-capable", async () => {
    const passwordHash = await hashPassword("supersegreta123");
    const [admin] = await db
      .insert(usersTable)
      .values({
        username: `inactive${Math.floor(Math.random() * 1e6)}`,
        email: `inactive-${uniqueSuffix()}@${ALLOWED_DOMAIN}`,
        name: "Admin Inattivo",
        role: "admin",
        passwordHash,
        isActive: false,
      })
      .returning();
    createdIds.push(admin.id);

    // Still in setup mode: the inactive admin cannot log in, so the app must not
    // lock itself out.
    const status = await request(app).get("/api/auth/bootstrap");
    expect(status.body.setupMode).toBe(true);

    // ...and registration is still allowed, creating a usable admin.
    const username = `usable${Math.floor(Math.random() * 1e6)}`;
    const res = await request(app)
      .post("/api/auth/bootstrap")
      .send({ name: "Admin Valido", username, password: "supersegreta123" });
    expect(res.status).toBe(201);
    createdIds.push(res.body.id);

    const after = await request(app).get("/api/auth/bootstrap");
    expect(after.body.setupMode).toBe(false);
  });

  it("treats an admin-with-password but no username as not login-capable", async () => {
    await deletePasswordAdmins();
    const passwordHash = await hashPassword("supersegreta123");
    const [admin] = await db
      .insert(usersTable)
      .values({
        username: null,
        email: `nousername-${uniqueSuffix()}@${ALLOWED_DOMAIN}`,
        name: "Admin Senza Username",
        role: "admin",
        passwordHash,
        isActive: true,
      })
      .returning();
    createdIds.push(admin.id);

    const status = await request(app).get("/api/auth/bootstrap");
    expect(status.body.setupMode).toBe(true);
  });
});
