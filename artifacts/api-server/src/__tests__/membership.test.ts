import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { api, ensureCurrentUser, closeDb, Fixtures } from "./helpers";

const fx = new Fixtures();
let currentUserName = "";

beforeAll(async () => {
  currentUserName = (await ensureCurrentUser()).name;
});

afterAll(async () => {
  await fx.cleanup();
  await closeDb();
});

describe("protocol ↔ dossier membership", () => {
  it("files a protocol into multiple dossiers (first is primary, rest are not)", async () => {
    const p = await fx.createProtocol();
    const d1 = await fx.createDossier();
    const d2 = await fx.createDossier();

    await api.post(`/api/protocols/${p.id}/dossiers`).send({ dossierId: d1.id }).expect(201);
    await api.post(`/api/protocols/${p.id}/dossiers`).send({ dossierId: d2.id }).expect(201);

    const { body } = await api.get(`/api/protocols/${p.id}/dossiers`).expect(200);
    expect(body).toHaveLength(2);
    // Sorted primary-first.
    expect(body[0]).toMatchObject({ dossierId: d1.id, isPrimary: true });
    expect(body[1]).toMatchObject({ dossierId: d2.id, isPrimary: false });
    expect(body[0].addedByName).toBe(currentUserName);
    expect(body[0].dossierCode).toBe(d1.code);

    // protocols.dossierId mirrors the primary membership.
    expect(await fx.getProtocolDossierId(p.id)).toBe(d1.id);
  });

  it("adding the first fascicolo as non-primary still auto-promotes it to primary", async () => {
    const p = await fx.createProtocol();
    const d1 = await fx.createDossier();

    await api.post(`/api/protocols/${p.id}/dossiers`).send({ dossierId: d1.id, isPrimary: false }).expect(201);

    const { body } = await api.get(`/api/protocols/${p.id}/dossiers`).expect(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ dossierId: d1.id, isPrimary: true });
    expect(await fx.getProtocolDossierId(p.id)).toBe(d1.id);
  });

  it("switches the primary via POST isPrimary:true (demotes the old primary)", async () => {
    const p = await fx.createProtocol();
    const d1 = await fx.createDossier();
    const d2 = await fx.createDossier();

    await api.post(`/api/protocols/${p.id}/dossiers`).send({ dossierId: d1.id }).expect(201);
    await api.post(`/api/protocols/${p.id}/dossiers`).send({ dossierId: d2.id }).expect(201);

    await api.post(`/api/protocols/${p.id}/dossiers`).send({ dossierId: d2.id, isPrimary: true }).expect(201);

    const { body } = await api.get(`/api/protocols/${p.id}/dossiers`).expect(200);
    const primary = body.filter((m: { isPrimary: boolean }) => m.isPrimary);
    expect(primary).toHaveLength(1);
    expect(primary[0].dossierId).toBe(d2.id);
    expect(await fx.getProtocolDossierId(p.id)).toBe(d2.id);
  });

  it("switches the primary via PATCH dossierId", async () => {
    const p = await fx.createProtocol();
    const d1 = await fx.createDossier();
    const d2 = await fx.createDossier();

    await api.post(`/api/protocols/${p.id}/dossiers`).send({ dossierId: d1.id }).expect(201);
    await api.post(`/api/protocols/${p.id}/dossiers`).send({ dossierId: d2.id }).expect(201);

    await api.patch(`/api/protocols/${p.id}`).send({ dossierId: d2.id }).expect(200);

    const { body } = await api.get(`/api/protocols/${p.id}/dossiers`).expect(200);
    const primary = body.filter((m: { isPrimary: boolean }) => m.isPrimary);
    expect(primary).toHaveLength(1);
    expect(primary[0].dossierId).toBe(d2.id);
    expect(await fx.getProtocolDossierId(p.id)).toBe(d2.id);
  });

  it("removing the primary promotes the oldest remaining membership", async () => {
    const p = await fx.createProtocol();
    const d1 = await fx.createDossier();
    const d2 = await fx.createDossier();
    const d3 = await fx.createDossier();

    await api.post(`/api/protocols/${p.id}/dossiers`).send({ dossierId: d1.id }).expect(201);
    await api.post(`/api/protocols/${p.id}/dossiers`).send({ dossierId: d2.id }).expect(201);
    await api.post(`/api/protocols/${p.id}/dossiers`).send({ dossierId: d3.id }).expect(201);

    // Remove the primary (d1) -> oldest remaining (d2) is promoted.
    await api.delete(`/api/protocols/${p.id}/dossiers/${d1.id}`).expect(204);

    const { body } = await api.get(`/api/protocols/${p.id}/dossiers`).expect(200);
    expect(body).toHaveLength(2);
    const primary = body.filter((m: { isPrimary: boolean }) => m.isPrimary);
    expect(primary).toHaveLength(1);
    expect(primary[0].dossierId).toBe(d2.id);
    expect(await fx.getProtocolDossierId(p.id)).toBe(d2.id);
  });

  it("removing the last membership nulls protocols.dossierId but keeps the protocol", async () => {
    const p = await fx.createProtocol();
    const d1 = await fx.createDossier();

    await api.post(`/api/protocols/${p.id}/dossiers`).send({ dossierId: d1.id }).expect(201);
    await api.delete(`/api/protocols/${p.id}/dossiers/${d1.id}`).expect(204);

    const { body } = await api.get(`/api/protocols/${p.id}/dossiers`).expect(200);
    expect(body).toHaveLength(0);
    expect(await fx.getProtocolDossierId(p.id)).toBeNull();
    // The protocol itself survives as a trace.
    expect(await fx.protocolExists(p.id)).toBe(true);
  });

  it("removing a non-existent membership returns 404", async () => {
    const p = await fx.createProtocol();
    const d1 = await fx.createDossier();

    await api.post(`/api/protocols/${p.id}/dossiers`).send({ dossierId: d1.id }).expect(201);
    await api.delete(`/api/protocols/${p.id}/dossiers/${d1.id}`).expect(204);
    // Second delete of the same membership: nothing left to remove.
    await api.delete(`/api/protocols/${p.id}/dossiers/${d1.id}`).expect(404);
  });

  it("rejects filing without a dossierId", async () => {
    const p = await fx.createProtocol();
    await api.post(`/api/protocols/${p.id}/dossiers`).send({}).expect(400);
  });
});
