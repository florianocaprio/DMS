import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { agentFor, api, closeDb, ensureCurrentUser, Fixtures } from "./helpers";
import {
  DEFAULT_DOSSIER_LEVEL_COLORS,
  DOSSIER_LEVEL_COLORS_SETTING_KEY,
} from "../lib/dossierLevelColors";

const fx = new Fixtures();
let adminUserId: number;
let viewerUserId: number;

const validColors = {
  "1": { background: "#E3F2FD", foreground: "#0D47A1" },
  "2": { background: "#E8F5E9", foreground: "#1B5E20" },
  "3": { background: "#FFF8E1", foreground: "#7A4F00" },
  "4": { background: "#FCE4EC", foreground: "#880E4F" },
};

beforeAll(async () => {
  await ensureCurrentUser();
  const admin = await fx.createUser({ role: "admin" });
  const viewer = await fx.createUser({ role: "viewer" });
  adminUserId = admin.id;
  viewerUserId = viewer.id;
});

beforeEach(async () => {
  await db.delete(appSettingsTable).where(eq(appSettingsTable.key, DOSSIER_LEVEL_COLORS_SETTING_KEY));
});

afterAll(async () => {
  await db.delete(appSettingsTable).where(eq(appSettingsTable.key, DOSSIER_LEVEL_COLORS_SETTING_KEY));
  await fx.cleanup();
  await closeDb();
});

describe("dossier level colors settings", () => {
  it("returns defaults when no configuration is stored", async () => {
    const { body } = await api.get("/api/settings/dossier-level-colors").expect(200);

    expect(body).toEqual(DEFAULT_DOSSIER_LEVEL_COLORS);
  });

  it("rejects invalid color values", async () => {
    const { body } = await agentFor(adminUserId)
      .put("/api/settings/dossier-level-colors")
      .send({
        ...validColors,
        "2": { background: "green", foreground: "#1B5E20" },
      })
      .expect(400);

    expect(body.error).toContain("Sfondo livello 2");
  });

  it("normalizes and stores a valid configuration", async () => {
    const { body } = await agentFor(adminUserId)
      .put("/api/settings/dossier-level-colors")
      .send({
        ...validColors,
        "1": { background: "#abc", foreground: "#036" },
      })
      .expect(200);

    expect(body["1"]).toEqual({ background: "#AABBCC", foreground: "#003366" });

    const { body: stored } = await api.get("/api/settings/dossier-level-colors").expect(200);
    expect(stored["1"]).toEqual({ background: "#AABBCC", foreground: "#003366" });
  });

  it("requires admin role to update the configuration", async () => {
    await agentFor(viewerUserId)
      .put("/api/settings/dossier-level-colors")
      .send(validColors)
      .expect(403);
  });
});
