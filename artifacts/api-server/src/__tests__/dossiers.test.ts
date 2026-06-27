import { describe, it, expect, afterAll } from "vitest";
import { api, closeDb, Fixtures } from "./helpers";

const fx = new Fixtures();

afterAll(async () => {
  await fx.cleanup();
  await closeDb();
});

async function createDossierViaApi(body: Record<string, unknown>) {
  const res = await api.post("/api/dossiers").send(body).expect(201);
  fx.trackDossier(res.body.id);
  return res.body;
}

describe("sub-fascicoli (dossier hierarchy)", () => {
  it("creates a sub-fascicolo with parentId and exposes the parent link", async () => {
    const parent = await createDossierViaApi({ title: "Fascicolo padre" });
    const child = await createDossierViaApi({ title: "Sotto-fascicolo", parentId: parent.id });

    expect(child.parentId).toBe(parent.id);

    // The create response omits parent details (empty maps); the detail
    // endpoint resolves parentCode/parentTitle from the parent record.
    const { body: childDetail } = await api.get(`/api/dossiers/${child.id}`).expect(200);
    expect(childDetail.parentId).toBe(parent.id);
    expect(childDetail.parentCode).toBe(parent.code);
    expect(childDetail.parentTitle).toBe("Fascicolo padre");

    // The child appears under the parent's children.
    const { body: children } = await api.get(`/api/dossiers/${parent.id}/children`).expect(200);
    expect(children.map((c: { id: number }) => c.id)).toContain(child.id);

    // The parent's childCount reflects the new sub-fascicolo.
    const { body: parentDetail } = await api.get(`/api/dossiers/${parent.id}`).expect(200);
    expect(parentDetail.childCount).toBeGreaterThanOrEqual(1);
  });

  it("ignores a non-existent parentId on create (stores null)", async () => {
    const child = await createDossierViaApi({ title: "Senza padre valido", parentId: 999999999 });
    expect(child.parentId).toBeNull();
  });

  it("rejects making a dossier its own parent", async () => {
    const d = await createDossierViaApi({ title: "Auto-padre" });
    const { body } = await api.patch(`/api/dossiers/${d.id}`).send({ parentId: d.id }).expect(400);
    expect(body.error).toBe("Un fascicolo non può essere padre di se stesso");
  });

  it("rejects a parent change that would create a cycle", async () => {
    const a = await createDossierViaApi({ title: "A" });
    const b = await createDossierViaApi({ title: "B", parentId: a.id });

    // a is an ancestor of b; making a a child of b would form a cycle.
    const { body } = await api.patch(`/api/dossiers/${a.id}`).send({ parentId: b.id }).expect(400);
    expect(body.error).toBe("Gerarchia non valida: ciclo rilevato");
  });

  it("allows clearing the parent (parentId: null)", async () => {
    const parent = await createDossierViaApi({ title: "Padre" });
    const child = await createDossierViaApi({ title: "Figlio", parentId: parent.id });

    const { body } = await api.patch(`/api/dossiers/${child.id}`).send({ parentId: null }).expect(200);
    expect(body.parentId).toBeNull();
  });
});
