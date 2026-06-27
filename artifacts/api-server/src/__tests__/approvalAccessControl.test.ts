import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { api, agentFor, ensureCurrentUser, closeDb, Fixtures } from "./helpers";

const fx = new Fixtures();

beforeAll(async () => {
  await ensureCurrentUser();
});

afterAll(async () => {
  await fx.cleanup();
  await closeDb();
});

describe("workflow approval — act is scoped to the authenticated user", () => {
  it("rejects an act from a user who is not the pending participant", async () => {
    const userA = await fx.createUser();
    const userB = await fx.createUser();
    const inst = await fx.createWorkflowInstance({
      type: "approval",
      status: "pending",
      participants: [{ userId: userA.id, status: "pending", actedAt: null, note: null }],
    });

    // User B is authenticated but has no pending step on this instance.
    const resB = await agentFor(userB.clerkUserId)
      .post(`/api/workflow-instances/${inst.id}/act`)
      .send({ action: "approve" });
    expect(resB.status).toBe(400);
    expect(resB.body.error).toMatch(/Nessuna azione in attesa/i);

    // The participant must still be pending — B's call changed nothing.
    const after = await fx.getInstanceParticipants(inst.id);
    expect(after).toEqual([expect.objectContaining({ userId: userA.id, status: "pending" })]);
  });

  it("lets the pending participant act on their own approval", async () => {
    const userA = await fx.createUser();
    const inst = await fx.createWorkflowInstance({
      type: "approval",
      status: "pending",
      participants: [{ userId: userA.id, status: "pending", actedAt: null, note: null }],
    });

    const resA = await agentFor(userA.clerkUserId)
      .post(`/api/workflow-instances/${inst.id}/act`)
      .send({ action: "approve" });
    expect(resA.status).toBe(200);
    expect(resA.body.status).toBe("approved");

    const after = await fx.getInstanceParticipants(inst.id);
    expect(after).toEqual([expect.objectContaining({ userId: userA.id, status: "approved" })]);
  });

  it("only resolves the acting user's step in a multi-participant approval", async () => {
    const userA = await fx.createUser();
    const userB = await fx.createUser();
    const inst = await fx.createWorkflowInstance({
      type: "approval",
      status: "pending",
      participants: [
        { userId: userA.id, status: "pending", actedAt: null, note: null },
        { userId: userB.id, status: "pending", actedAt: null, note: null },
      ],
    });

    // User A approves: their step resolves, User B's remains pending, instance still pending.
    const resA = await agentFor(userA.clerkUserId)
      .post(`/api/workflow-instances/${inst.id}/act`)
      .send({ action: "approve" });
    expect(resA.status).toBe(200);
    expect(resA.body.status).toBe("pending");

    const after = await fx.getInstanceParticipants(inst.id);
    expect(after).toContainEqual(expect.objectContaining({ userId: userA.id, status: "approved" }));
    expect(after).toContainEqual(expect.objectContaining({ userId: userB.id, status: "pending" }));
  });

  it("requires authentication to act", async () => {
    const userA = await fx.createUser();
    const inst = await fx.createWorkflowInstance({
      type: "approval",
      status: "pending",
      participants: [{ userId: userA.id, status: "pending", actedAt: null, note: null }],
    });

    // agentFor() with no clerk id => no session => 401.
    await agentFor().post(`/api/workflow-instances/${inst.id}/act`).send({ action: "approve" }).expect(401);
  });
});

describe("workflow approval — pendingForMe is scoped to the authenticated user", () => {
  it("only surfaces instances where the authenticated user has a pending step", async () => {
    const userA = await fx.createUser();
    const userB = await fx.createUser();
    const inst = await fx.createWorkflowInstance({
      type: "approval",
      status: "pending",
      participants: [{ userId: userA.id, status: "pending", actedAt: null, note: null }],
    });

    const { body: forA } = await agentFor(userA.clerkUserId)
      .get(`/api/workflow-instances?pendingForMe=true`)
      .expect(200);
    expect(forA.map((i: { id: number }) => i.id)).toContain(inst.id);

    const { body: forB } = await agentFor(userB.clerkUserId)
      .get(`/api/workflow-instances?pendingForMe=true`)
      .expect(200);
    expect(forB.map((i: { id: number }) => i.id)).not.toContain(inst.id);
  });
});
