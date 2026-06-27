import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../app";
import { hashPassword } from "../lib/password";
import { validateBootstrapInput } from "../lib/bootstrap";
import { ALLOWED_DOMAIN, closeDb, uniqueSuffix } from "./helpers";

/**
 * First-run setup. The positive path (no admin → open setup) can't be exercised
 * against the shared test DB without wiping all admins, so the pure validator is
 * unit-tested directly and the locked-state behavior (an admin exists) is driven
 * through the HTTP endpoints.
 */
describe("validateBootstrapInput", () => {
  const valid = {
    name: "Mario Rossi",
    email: "mario@example.it",
    username: "mario",
    password: "password1",
    role: "admin",
  };

  it("accepts a valid payload and normalizes email/username", () => {
    const r = validateBootstrapInput({ ...valid, email: "  Mario@Example.it ", username: " Mario " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.email).toBe("mario@example.it");
      expect(r.value.username).toBe("mario");
    }
  });

  it("rejects missing fields", () => {
    expect(validateBootstrapInput({}).ok).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(validateBootstrapInput({ ...valid, email: "nope" }).ok).toBe(false);
  });

  it("rejects a too-short username", () => {
    expect(validateBootstrapInput({ ...valid, username: "ab" }).ok).toBe(false);
  });

  it("rejects a too-short password", () => {
    expect(validateBootstrapInput({ ...valid, password: "short" }).ok).toBe(false);
  });

  it("rejects an unknown role", () => {
    expect(validateBootstrapInput({ ...valid, role: "root" }).ok).toBe(false);
  });
});

describe("bootstrap endpoints when the app is already configured", () => {
  let adminId: number;

  beforeAll(async () => {
    // Guarantee at least one admin so setup mode is closed regardless of other data.
    const username = `boot-admin-${uniqueSuffix()}`.toLowerCase();
    const [u] = await db
      .insert(usersTable)
      .values({
        username,
        passwordHash: await hashPassword("password1"),
        email: `${username}@${ALLOWED_DOMAIN}`,
        name: "Boot Admin",
        role: "admin",
        isActive: true,
      })
      .returning();
    adminId = u.id;
  });

  afterAll(async () => {
    await db.delete(usersTable).where(eq(usersTable.id, adminId));
    await closeDb();
  });

  it("reports setupMode=false once an administrator exists", async () => {
    const res = await request(app).get("/api/auth/bootstrap");
    expect(res.status).toBe(200);
    expect(res.body.setupMode).toBe(false);
  });

  it("refuses first-run user creation once configured (403)", async () => {
    const res = await request(app)
      .post("/api/auth/bootstrap")
      .send({ name: "X", email: "x@y.it", username: "xyz123", password: "password1", role: "admin" });
    expect(res.status).toBe(403);
  });
});
