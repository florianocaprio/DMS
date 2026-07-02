import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { requireAnyRole } from "../middleware/requireRole";
import {
  loadProtocolNumberingConfig,
  normalizeProtocolNumberingConfig,
  previewProtocolNumber,
  saveProtocolNumberingConfig,
  validateProtocolNumber,
  ProtocolNumberingError,
} from "../lib/protocolNumbering";
import {
  DOSSIER_LEVEL_COLORS_SETTING_KEY,
  DossierLevelColorsError,
  loadDossierLevelColors,
  normalizeDossierLevelColorsSettingValue,
  resetDossierLevelColors,
  saveDossierLevelColors,
} from "../lib/dossierLevelColors";

const router: IRouter = Router();

router.get("/settings/dossier-level-colors", async (req: Request, res: Response) => {
  try {
    res.json(await loadDossierLevelColors());
  } catch (err) {
    req.log.error({ err }, "Error loading dossier level colors");
    res.status(500).json({ error: "Errore caricamento colori livelli fascicolo" });
  }
});

router.use("/settings", requireAnyRole(["admin"]));

router.get("/settings", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(appSettingsTable);
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json(settings);
  } catch (err) {
    req.log.error({ err }, "Error listing settings");
    res.status(500).json({ error: "Failed to list settings" });
  }
});

router.put("/settings/dossier-level-colors", async (req: Request, res: Response) => {
  try {
    res.json(await saveDossierLevelColors(req.body));
  } catch (err) {
    if (err instanceof DossierLevelColorsError) {
      res.status(400).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "Error updating dossier level colors");
    res.status(500).json({ error: "Errore salvataggio colori livelli fascicolo" });
  }
});

router.delete("/settings/dossier-level-colors", async (req: Request, res: Response) => {
  try {
    await resetDossierLevelColors();
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Error resetting dossier level colors");
    res.status(500).json({ error: "Errore reset colori livelli fascicolo" });
  }
});

router.get("/settings/protocol-numbering", async (req: Request, res: Response) => {
  try {
    res.json(await loadProtocolNumberingConfig());
  } catch (err) {
    req.log.error({ err }, "Error loading protocol numbering config");
    res.status(500).json({ error: "Errore caricamento configurazione numerazione" });
  }
});

router.put("/settings/protocol-numbering", async (req: Request, res: Response) => {
  try {
    const config = normalizeProtocolNumberingConfig(req.body as Record<string, unknown>);
    await saveProtocolNumberingConfig(config);
    res.json(config);
  } catch (err) {
    if (err instanceof ProtocolNumberingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "Error updating protocol numbering config");
    res.status(500).json({ error: "Errore salvataggio configurazione numerazione" });
  }
});

router.post("/settings/protocol-numbering/preview", async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as {
      config?: Record<string, unknown>;
      type?: string;
      year?: number;
      sequence?: number;
    };
    const config = body.config
      ? normalizeProtocolNumberingConfig(body.config)
      : await loadProtocolNumberingConfig();
    res.json(previewProtocolNumber(config, body.type, body.year, body.sequence));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Configurazione non valida";
    res.status(400).json({ number: "", valid: false, error: message });
  }
});

router.post("/settings/protocol-numbering/validate", async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as { number?: string; config?: Record<string, unknown> };
    const number = typeof body.number === "string" ? body.number.trim() : "";
    if (!number) {
      res.status(400).json({ valid: false, error: "Numero protocollo obbligatorio" });
      return;
    }
    const config = body.config
      ? normalizeProtocolNumberingConfig(body.config)
      : await loadProtocolNumberingConfig();
    const valid = validateProtocolNumber(number, config);
    res.json({ valid, error: valid ? null : "Numero non conforme alla regex configurata" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Configurazione non valida";
    res.status(400).json({ valid: false, error: message });
  }
});

router.put("/settings/:key", async (req: Request, res: Response) => {
  try {
    const key = req.params.key as string;
    const { value } = req.body as { value: string };
    if (typeof value !== "string") {
      res.status(400).json({ error: "value is required" });
      return;
    }
    const storedValue = key === DOSSIER_LEVEL_COLORS_SETTING_KEY
      ? normalizeDossierLevelColorsSettingValue(value)
      : value;
    await db.execute(
      sql`INSERT INTO app_settings (key, value, updated_at)
          VALUES (${key}, ${storedValue}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = ${storedValue}, updated_at = NOW()`
    );
    res.json({ key, value: storedValue });
  } catch (err) {
    if (err instanceof DossierLevelColorsError) {
      res.status(400).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "Error updating setting");
    res.status(500).json({ error: "Failed to update setting" });
  }
});

router.delete("/settings/:key", async (req: Request, res: Response) => {
  try {
    await db.delete(appSettingsTable).where(eq(appSettingsTable.key, req.params.key as string));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Error deleting setting");
    res.status(500).json({ error: "Failed to delete setting" });
  }
});

export default router;
