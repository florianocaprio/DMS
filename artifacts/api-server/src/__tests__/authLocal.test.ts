import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../app";
import { hashPassword } from "../lib/password";
import { ALLOWED_DOMAIN, closeDb, uniqueSuffix } from "./helpers";

/**
 * Exercises the local username/password login and the server-side forced
 * password change gate. Unlike the other suites these tests drive the real
 * signed-cookie session (POST /auth/login) via a cookie-persisting supertest
 * agent, since the forced-change gate lives on the local-cookie auth path.
 */
describe("local auth + forced password change", () => {
  const username = `admin-test-${uniqueSuffix()}`.toLowerCase();
  const initialPassword = "flocap!";
  const newPassword = "NuovaPass1";
  let userId: number;

  beforeAll(async () => {
    const passwordHash = await hashPassword(initialPassword);
    const [u] = await db
      .insert(usersTable)
      .values({
        username,
        passwordHash,
        email: `${username}@${ALLOWED_DOMAIN}`,
        name: "Admin Test",
        role: "admin",
        isActive: true,
        mustChangePassword: true,
      })
      .returning();
    userId = u.id;
  });

  afterEach(async () => {
    // Reset to the forced-change state so each test starts from the seed.
    await db
      .update(usersTable)
      .set({ passwordHash: await hashPassword(initialPassword), mustChangePassword: true })
      .where(eq(usersTable.id, userId));
  });

  afterAll(async () => {
    await db.delete(usersTable).where(eq(usersTable.id, userId));
    await closeDb();
  });

  it("rejects wrong credentials with 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username, password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("logs in and reports the forced-change flag", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username, password: initialPassword });
    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(true);
    expect(res.body.passwordHash).toBeUndefined();
  });

  it("blocks protected routes while a password change is pending", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username, password: initialPassword }).expect(200);
    const res = await agent.get("/api/users/me");
    expect(res.status).toBe(403);
    expect(res.body.mustChangePassword).toBe(true);
  });

  it("rejects a change with the wrong current password", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username, password: initialPassword }).expect(200);
    const res = await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: "wrong", newPassword });
    expect(res.status).toBe(401);
  });

  it("rejects a too-short new password", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username, password: initialPassword }).expect(200);
    const res = await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: initialPassword, newPassword: "short" });
    expect(res.status).toBe(400);
  });

  it("clears the flag, restores access, and rotates the password", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username, password: initialPassword }).expect(200);

    const change = await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: initialPassword, newPassword });
    expect(change.status).toBe(200);
    expect(change.body.mustChangePassword).toBe(false);

    // Protected routes are reachable again with the same session.
    await agent.get("/api/users/me").expect(200);

    // Old password no longer works; the new one does and is no longer flagged.
    await request(app).post("/api/auth/login").send({ username, password: initialPassword }).expect(401);
    const relogin = await request(app)
      .post("/api/auth/login")
      .send({ username, password: newPassword });
    expect(relogin.status).toBe(200);
    expect(relogin.body.mustChangePassword).toBe(false);
  });
});
