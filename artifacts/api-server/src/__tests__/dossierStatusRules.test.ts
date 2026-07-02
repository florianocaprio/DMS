import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { agentFor, api, closeDb, ensureCurrentUser, Fixtures } from "./helpers";

const fx = new Fixtures();

beforeAll(async () => {
  await ensureCurrentUser();
});

afterAll(async () => {
  await fx.cleanup();
  await closeDb();
});

describe("dossier status rules", () => {
  it("rejects protocol filing into a closed dossier", async () => {
    const protocol = await fx.createProtocol();
    const dossier = await fx.createDossier({ status: "closed", closedAt: new Date() });

    const { body } = await api
      .post(`/api/protocols/${protocol.id}/dossiers`)
      .send({ dossierId: dossier.id })
      .expect(400);

    expect(body.error).toBe("Non è possibile associare protocolli a un fascicolo chiuso. Riaprire il fascicolo prima di procedere.");
  });

  it("rejects protocol filing into an archived dossier", async () => {
    const protocol = await fx.createProtocol();
    const dossier = await fx.createDossier({ status: "archived", closedAt: new Date() });

    const { body } = await api
      .post(`/api/protocols/${protocol.id}/dossiers`)
      .send({ dossierId: dossier.id })
      .expect(400);

    expect(body.error).toBe("Non è possibile associare protocolli a un fascicolo archiviato.");
  });

  it("rejects protocol creation when the selected dossier is closed", async () => {
    const dossier = await fx.createDossier({ status: "closed", closedAt: new Date() });

    const { body } = await api
      .post("/api/protocols")
      .send({ type: "incoming", subject: "Protocollo su fascicolo chiuso", dossierId: dossier.id })
      .expect(400);

    expect(body.error).toBe("Non è possibile associare protocolli a un fascicolo chiuso. Riaprire il fascicolo prima di procedere.");
  });

  it("rejects changing a protocol primary dossier to an archived dossier", async () => {
    const protocol = await fx.createProtocol();
    const dossier = await fx.createDossier({ status: "archived", closedAt: new Date() });

    const { body } = await api
      .patch(`/api/protocols/${protocol.id}`)
      .send({ dossierId: dossier.id })
      .expect(400);

    expect(body.error).toBe("Non è possibile associare protocolli a un fascicolo archiviato.");
  });

  it("rejects document creation in a closed dossier", async () => {
    const dossier = await fx.createDossier({ status: "closed", closedAt: new Date() });

    const { body } = await api
      .post("/api/documents")
      .send({ title: "Documento su fascicolo chiuso", type: "delibera", dossierId: dossier.id })
      .expect(400);

    expect(body.error).toBe("Non è possibile associare documenti a un fascicolo chiuso. Riaprire il fascicolo prima di procedere.");
  });

  it("rejects document creation in an archived dossier", async () => {
    const dossier = await fx.createDossier({ status: "archived", closedAt: new Date() });

    const { body } = await api
      .post("/api/documents")
      .send({ title: "Documento su fascicolo archiviato", type: "delibera", dossierId: dossier.id })
      .expect(400);

    expect(body.error).toBe("Non è possibile associare documenti a un fascicolo archiviato.");
  });

  it("rejects moving an existing document into a closed dossier", async () => {
    const document = await fx.createDocument();
    const dossier = await fx.createDossier({ status: "closed", closedAt: new Date() });

    const { body } = await api
      .patch(`/api/documents/${document.id}`)
      .send({ dossierId: dossier.id })
      .expect(400);

    expect(body.error).toBe("Non è possibile associare documenti a un fascicolo chiuso. Riaprire il fascicolo prima di procedere.");
  });

  it("reopens a closed dossier for an authorized role", async () => {
    const user = await fx.createUser({ role: "protocol_manager" });
    const dossier = await fx.createDossier({ status: "closed", closedAt: new Date() });

    const { body } = await agentFor(user.id)
      .patch(`/api/dossiers/${dossier.id}`)
      .send({ status: "open" })
      .expect(200);

    expect(body.status).toBe("open");
    expect(body.closedAt).toBeNull();
  });

  it("rejects reopening an archived dossier", async () => {
    const user = await fx.createUser({ role: "admin" });
    const dossier = await fx.createDossier({ status: "archived", closedAt: new Date() });

    const { body } = await agentFor(user.id)
      .patch(`/api/dossiers/${dossier.id}`)
      .send({ status: "open" })
      .expect(400);

    expect(body.error).toBe("Un fascicolo archiviato non può essere riaperto.");
  });
});
