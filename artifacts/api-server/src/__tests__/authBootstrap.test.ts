import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../app";
import { hashPassword } from "../lib/password";
import { ALLOWED_DOMAIN, closeDb, uniqueSuffix } from "./helpers";

/**
 * First-run setup: a default administrator is seeded WITHOUT a password and the
 * public /auth/bootstrap endpoints let the first visitor set it. The seeded
 * admin is a LOCAL account (username set, passwordHash null); Clerk admins have
 * a null username and are never treated as "needs setup". These tests drive the
 * flow against the shared DB by inserting a pending admin and cleaning it up.
 */
describe("first-run admin password setup (/auth/bootstrap)", () => {
  const username = `setup-admin-${uniqueSuffix()}`.toLowerCase();
  let adminId: number;

  beforeAll(async () => {
    const [u] = await db
      .insert(usersTable)
      .values({
        username,
        email: `${username}@${ALLOWED_DOMAIN}`,
        name: "Amministratore di test",
        role: "admin",
        passwordHash: null,
        mustChangePassword: false,
        isActive: true,
      })
      .returning();
    adminId = u.id;
  });

  afterAll(async () => {
    await db.delete(usersTable).where(eq(usersTable.id, adminId));
  });

  it("reports setup mode and exposes the pending admin username", async () => {
    const res = await request(app).get("/api/auth/bootstrap");
    expect(res.status).toBe(200);
    expect(res.body.setupMode).toBe(true);
    expect(typeof res.body.username).toBe("string");
  });

  it("rejects a password shorter than 8 characters (400)", async () => {
    const res = await request(app).post("/api/auth/bootstrap").send({ password: "short" });
    expect(res.status).toBe(400);
    // The pending admin must still have no password after a rejected attempt.
    const [row] = await db.select().from(usersTable).where(eq(usersTable.id, adminId)).limit(1);
    expect(row.passwordHash).toBeNull();
  });

  it("sets the password, logs the admin in, then locks itself", async () => {
    const res = await request(app).post("/api/auth/bootstrap").send({ password: "supersegreta123" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(adminId);
    expect(res.body.mustChangePassword).toBe(false);

    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(Array.isArray(cookies)).toBe(true);
    expect(cookies.some((c) => c.startsWith("pd_session="))).toBe(true);

    // The seeded admin now has a password hash.
    const [row] = await db.select().from(usersTable).where(eq(usersTable.id, adminId)).limit(1);
    expect(row.passwordHash).toBeTruthy();

    // No pending admin remains, so the endpoint is locked.
    const status = await request(app).get("/api/auth/bootstrap");
    expect(status.body.setupMode).toBe(false);
    const again = await request(app).post("/api/auth/bootstrap").send({ password: "anothergoodpass" });
    expect(again.status).toBe(403);
  });
});

describe("bootstrap is a no-op once a configured administrator exists", () => {
  let adminId: number;

  beforeAll(async () => {
    const u = `config-admin-${uniqueSuffix()}`.toLowerCase();
    const [row] = await db
      .insert(usersTable)
      .values({
        username: u,
        passwordHash: await hashPassword("password1"),
        email: `${u}@${ALLOWED_DOMAIN}`,
        name: "Admin configurato",
        role: "admin",
        isActive: true,
      })
      .returning();
    adminId = row.id;
  });

  afterAll(async () => {
    await db.delete(usersTable).where(eq(usersTable.id, adminId));
    await closeDb();
  });

  it("reports setupMode=false when the only admin already has a password", async () => {
    const res = await request(app).get("/api/auth/bootstrap");
    expect(res.status).toBe(200);
    expect(res.body.setupMode).toBe(false);
  });
});
