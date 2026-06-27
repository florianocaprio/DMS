import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { api, ensureCurrentUser, closeDb, Fixtures, uniqueSuffix } from "./helpers";

const fx = new Fixtures();
let currentUserName = "";

beforeAll(async () => {
  currentUserName = (await ensureCurrentUser()).name;
});

afterAll(async () => {
  await fx.cleanup();
  await closeDb();
});

describe("attachments soft-delete & history", () => {
  it("add → soft-delete → includeRemoved history keeps who/when", async () => {
    const p = await fx.createProtocol();

    // Add an attachment (Drive sync is disabled in tests, so no real upload runs).
    const { body: created } = await api
      .post("/api/attachments")
      .send({
        objectPath: `/objects/test-${uniqueSuffix()}.pdf`,
        originalName: "documento.pdf",
        mimeType: "application/pdf",
        fileSize: 1234,
        protocolId: p.id,
      })
      .expect(201);
    fx.trackAttachment(created.id);
    expect(created.removedAt).toBeNull();

    // Active listing shows it, with the uploader name resolved.
    const { body: active } = await api.get(`/api/attachments?protocolId=${p.id}`).expect(200);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(created.id);
    expect(active[0].uploadedByName).toBe(currentUserName);
    expect(active[0].removedByName).toBeNull();

    // Soft delete.
    await api.delete(`/api/attachments/${created.id}`).expect(204);

    // Default listing hides removed rows.
    const { body: afterDelete } = await api.get(`/api/attachments?protocolId=${p.id}`).expect(200);
    expect(afterDelete).toHaveLength(0);

    // includeRemoved=true surfaces the soft-deleted row with full history.
    const { body: history } = await api
      .get(`/api/attachments?protocolId=${p.id}&includeRemoved=true`)
      .expect(200);
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(created.id);
    expect(history[0].removedAt).not.toBeNull();
    expect(history[0].uploadedByName).toBe(currentUserName);
    expect(history[0].removedByName).toBe(currentUserName);
  });

  it("deleting an already-removed attachment is idempotent (204)", async () => {
    const p = await fx.createProtocol();
    const { body: created } = await api
      .post("/api/attachments")
      .send({
        objectPath: `/objects/test-${uniqueSuffix()}.pdf`,
        originalName: "doc2.pdf",
        mimeType: "application/pdf",
        fileSize: 10,
        protocolId: p.id,
      })
      .expect(201);
    fx.trackAttachment(created.id);

    await api.delete(`/api/attachments/${created.id}`).expect(204);
    await api.delete(`/api/attachments/${created.id}`).expect(204);
  });

  it("rejects an attachment missing required fields", async () => {
    await api.post("/api/attachments").send({ originalName: "x.pdf" }).expect(400);
  });
});
