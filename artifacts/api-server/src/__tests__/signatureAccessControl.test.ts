import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { agentFor, ensureCurrentUser, closeDb, Fixtures } from "./helpers";

const fx = new Fixtures();

beforeAll(async () => {
  await ensureCurrentUser();
});

afterAll(async () => {
  await fx.cleanup();
  await closeDb();
});

describe("signatures — sign/reject is scoped to the authenticated user", () => {
  it("rejects a non-signatory trying to consume another user's pending signature", async () => {
    const userA = await fx.createUser();
    const userB = await fx.createUser();
    const sr = await fx.createSignatureRequest({
      requestedById: userA.id,
      signatories: [{ userId: userA.id, order: 1, status: "pending", signedAt: null, note: null }],
    });

    // User B is authenticated but is not a signatory: the request should be
    // rejected with a clear error and nothing should change.
    const resB = await agentFor(userB.clerkUserId)
      .post(`/api/signatures/${sr.id}/sign`)
      .send({ action: "sign" });
    expect(resB.status).toBe(400);
    expect(resB.body.error).toBe("Nessuna firma in attesa per l'utente corrente");

    const after = await fx.getSignatories(sr.id);
    expect(after).toEqual([expect.objectContaining({ userId: userA.id, status: "pending" })]);
  });

  it("lets the pending signatory sign their own request", async () => {
    const userA = await fx.createUser();
    const sr = await fx.createSignatureRequest({
      requestedById: userA.id,
      signatories: [{ userId: userA.id, order: 1, status: "pending", signedAt: null, note: null }],
    });

    const resA = await agentFor(userA.clerkUserId)
      .post(`/api/signatures/${sr.id}/sign`)
      .send({ action: "sign" });
    expect(resA.status).toBe(200);
    expect(resA.body.status).toBe("completed");

    const after = await fx.getSignatories(sr.id);
    expect(after).toEqual([expect.objectContaining({ userId: userA.id, status: "signed" })]);
  });

  it("only consumes the acting signatory's step when several are pending", async () => {
    const userA = await fx.createUser();
    const userB = await fx.createUser();
    const sr = await fx.createSignatureRequest({
      requestedById: userA.id,
      requireAll: true,
      signatories: [
        { userId: userA.id, order: 1, status: "pending", signedAt: null, note: null },
        { userId: userB.id, order: 2, status: "pending", signedAt: null, note: null },
      ],
    });

    // User A rejects: only their step flips; the request as a whole is rejected
    // (requireAll), but User B's step must remain untouched.
    const resA = await agentFor(userA.clerkUserId)
      .post(`/api/signatures/${sr.id}/sign`)
      .send({ action: "reject" });
    expect(resA.status).toBe(200);

    const after = await fx.getSignatories(sr.id);
    expect(after).toContainEqual(expect.objectContaining({ userId: userA.id, status: "rejected" }));
    expect(after).toContainEqual(expect.objectContaining({ userId: userB.id, status: "pending" }));
  });

  it("requires authentication to sign", async () => {
    const userA = await fx.createUser();
    const sr = await fx.createSignatureRequest({
      requestedById: userA.id,
      signatories: [{ userId: userA.id, order: 1, status: "pending", signedAt: null, note: null }],
    });

    await agentFor().post(`/api/signatures/${sr.id}/sign`).send({ action: "sign" }).expect(401);
  });
});

describe("signatures — pendingForMe is scoped to the authenticated user", () => {
  it("only surfaces signature requests where the authenticated user has a pending step", async () => {
    const userA = await fx.createUser();
    const userB = await fx.createUser();
    const sr = await fx.createSignatureRequest({
      requestedById: userA.id,
      signatories: [{ userId: userA.id, order: 1, status: "pending", signedAt: null, note: null }],
    });

    const { body: forA } = await agentFor(userA.clerkUserId)
      .get(`/api/signatures?pendingForMe=true`)
      .expect(200);
    expect(forA.map((s: { id: number }) => s.id)).toContain(sr.id);

    const { body: forB } = await agentFor(userB.clerkUserId)
      .get(`/api/signatures?pendingForMe=true`)
      .expect(200);
    expect(forB.map((s: { id: number }) => s.id)).not.toContain(sr.id);
  });
});

describe("tasks — assignedToMe is scoped to the authenticated user", () => {
  it("only returns tasks assigned to the authenticated user", async () => {
    const userA = await fx.createUser();
    const userB = await fx.createUser();
    const taskA = await fx.createTask({ assignedToId: userA.id, createdById: userA.id });
    const taskB = await fx.createTask({ assignedToId: userB.id, createdById: userA.id });

    const { body: forA } = await agentFor(userA.clerkUserId)
      .get(`/api/tasks?assignedToMe=true&limit=200`)
      .expect(200);
    const idsA = forA.items.map((t: { id: number }) => t.id);
    expect(idsA).toContain(taskA.id);
    expect(idsA).not.toContain(taskB.id);

    const { body: forB } = await agentFor(userB.clerkUserId)
      .get(`/api/tasks?assignedToMe=true&limit=200`)
      .expect(200);
    const idsB = forB.items.map((t: { id: number }) => t.id);
    expect(idsB).toContain(taskB.id);
    expect(idsB).not.toContain(taskA.id);
  });
});
