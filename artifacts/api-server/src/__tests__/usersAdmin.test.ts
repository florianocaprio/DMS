import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agentFor, closeDb, Fixtures, uniqueSuffix } from "./helpers";

const fx = new Fixtures();
let adminId: number;

beforeAll(async () => {
  const admin = await fx.createUser({
    username: `admin${Math.floor(Math.random() * 1e6)}`,
    role: "admin",
    isActive: true,
    mustChangePassword: false,
  });
  adminId = admin.id;
});

afterAll(async () => {
  await fx.cleanup();
  await closeDb();
});

describe("admin users management", () => {
  it("rejects user list access for non-admin roles", async () => {
    const operator = await fx.createUser({ role: "protocol_operator" });

    await agentFor(operator.id).get("/api/users").expect(403);
  });

  it("allows an admin to update role and security flags", async () => {
    const user = await fx.createUser({ role: "viewer", mustChangePassword: false });

    const { body } = await agentFor(adminId)
      .patch(`/api/users/${user.id}`)
      .send({ role: "protocol_manager", isActive: false, mustChangePassword: true })
      .expect(200);

    expect(body.role).toBe("protocol_manager");
    expect(body.isActive).toBe(false);
    expect(body.mustChangePassword).toBe(true);
  });

  it("returns 409 for duplicate email or username", async () => {
    const suffix = uniqueSuffix().replace(/[^a-z0-9]/g, "").slice(0, 12);
    const existing = await fx.createUser({ username: `dup${suffix}` });

    const duplicateEmail = await agentFor(adminId)
      .post("/api/users")
      .send({
        email: existing.email,
        username: `new${suffix}`,
        name: "Duplicato Email",
        role: "viewer",
      });
    expect(duplicateEmail.status).toBe(409);
    expect(duplicateEmail.body.error).toBe("Email già in uso");

    const duplicateUsername = await agentFor(adminId)
      .post("/api/users")
      .send({
        email: `new-${suffix}@angeliinmoto.it`,
        username: existing.username,
        name: "Duplicato Username",
        role: "viewer",
      });
    expect(duplicateUsername.status).toBe(409);
    expect(duplicateUsername.body.error).toBe("Username già in uso");
  });
});
