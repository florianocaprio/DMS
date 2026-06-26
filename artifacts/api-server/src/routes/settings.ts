import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

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

router.put("/settings/:key", async (req: Request, res: Response) => {
  try {
    const key = req.params.key as string;
    const { value } = req.body as { value: string };
    if (value === undefined || value === null) {
      res.status(400).json({ error: "value is required" });
      return;
    }
    await db.execute(
      sql`INSERT INTO app_settings (key, value, updated_at)
          VALUES (${key}, ${value}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()`
    );
    res.json({ key, value });
  } catch (err) {
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
