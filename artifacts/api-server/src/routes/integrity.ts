import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  protocolsTable,
  protocolIntegrityTable,
  integritySchedulesTable,
  integrityCheckLogTable,
} from "@workspace/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import {
  computeProtocolIntegrity,
  verifyProtocolIntegrity,
  verifyAllProtocols,
} from "../lib/integrity";
import {
  buildCronExpression,
  reloadSchedule,
  stopScheduleJob,
  runScheduleNow,
} from "../lib/scheduler";
import { requireAnyRole } from "../middleware/requireRole";

const router: IRouter = Router();

router.use("/admin/integrity", requireAnyRole(["admin"]));

// ── GET /api/admin/integrity/status ──────────────────────────────────────────
// Riepilogo stato integrità: totale protocolli, quanti hanno hash, ultima verifica
router.get("/admin/integrity/status", async (req: Request, res: Response) => {
  try {
    const allProtocols = await db
      .select({ id: protocolsTable.id, number: protocolsTable.number })
      .from(protocolsTable);

    const hashes = await db
      .select({ protocolId: protocolIntegrityTable.protocolId, computedAt: protocolIntegrityTable.computedAt })
      .from(protocolIntegrityTable);

    const hashSet = new Map(hashes.map(h => [h.protocolId, h.computedAt]));

    const [lastRun] = await db
      .select()
      .from(integrityCheckLogTable)
      .where(eq(integrityCheckLogTable.status, "completed"))
      .orderBy(desc(integrityCheckLogTable.completedAt))
      .limit(1);

    res.json({
      totalProtocols: allProtocols.length,
      withHash: hashSet.size,
      withoutHash: allProtocols.length - hashSet.size,
      lastRun: lastRun ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "integrity status error");
    res.status(500).json({ error: "Errore recupero stato integrità" });
  }
});

// ── GET /api/admin/integrity/protocols ───────────────────────────────────────
// Lista protocolli con stato hash (senza ri-verifica, solo meta)
router.get("/admin/integrity/protocols", async (req: Request, res: Response) => {
  try {
    const protocols = await db
      .select({
        id: protocolsTable.id,
        number: protocolsTable.number,
        type: protocolsTable.type,
        status: protocolsTable.status,
        subject: protocolsTable.subject,
        registeredAt: protocolsTable.registeredAt,
      })
      .from(protocolsTable)
      .orderBy(desc(protocolsTable.registeredAt));

    const hashes = await db
      .select()
      .from(protocolIntegrityTable);

    const hashMap = new Map(hashes.map(h => [h.protocolId, h]));

    const result = protocols.map(p => {
      const h = hashMap.get(p.id);
      return {
        ...p,
        hasHash: !!h,
        integrityHash: h?.integrityHash ?? null,
        computedAt: h?.computedAt ?? null,
        triggeredBy: h?.triggeredBy ?? null,
      };
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "integrity protocols list error");
    res.status(500).json({ error: "Errore recupero lista protocolli" });
  }
});

// ── POST /api/admin/integrity/compute/:protocolId ────────────────────────────
// Calcola e salva l'impronta di un protocollo
router.post("/admin/integrity/compute/:protocolId", async (req: Request, res: Response) => {
  try {
    const protocolId = Number(req.params.protocolId);
    if (isNaN(protocolId)) { res.status(400).json({ error: "ID non valido" }); return; }

    const { hash, snapshot } = await computeProtocolIntegrity(protocolId, "manual");
    res.json({ ok: true, hash, attachmentCount: snapshot.attachments.length });
  } catch (err) {
    req.log.error({ err }, "compute integrity error");
    res.status(500).json({ error: "Errore calcolo impronta" });
  }
});

// ── POST /api/admin/integrity/compute-all ────────────────────────────────────
// Calcola l'impronta per tutti i protocolli (ricalcolo di massa)
router.post("/admin/integrity/compute-all", async (req: Request, res: Response) => {
  try {
    const protocols = await db
      .select({ id: protocolsTable.id })
      .from(protocolsTable);

    let computed = 0;
    const errors: string[] = [];

    for (const p of protocols) {
      try {
        await computeProtocolIntegrity(p.id, "bulk");
        computed++;
      } catch (err) {
        errors.push(`Protocol ${p.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    res.json({ ok: true, computed, errors: errors.slice(0, 10), total: protocols.length });
  } catch (err) {
    req.log.error({ err }, "compute-all integrity error");
    res.status(500).json({ error: "Errore calcolo impronte di massa" });
  }
});

// ── GET /api/admin/integrity/verify/:protocolId ──────────────────────────────
// Verifica un singolo protocollo
router.get("/admin/integrity/verify/:protocolId", async (req: Request, res: Response) => {
  try {
    const protocolId = Number(req.params.protocolId);
    if (isNaN(protocolId)) { res.status(400).json({ error: "ID non valido" }); return; }

    const result = await verifyProtocolIntegrity(protocolId);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "verify integrity error");
    res.status(500).json({ error: "Errore verifica integrità" });
  }
});

// ── POST /api/admin/integrity/verify-all ─────────────────────────────────────
// Verifica tutti i protocolli e salva nel log
router.post("/admin/integrity/verify-all", async (req: Request, res: Response) => {
  try {
    const [logEntry] = await db
      .insert(integrityCheckLogTable)
      .values({ triggeredBy: "manual", startedAt: new Date(), status: "running" })
      .returning();

    // Risponde subito con l'ID del log, la verifica gira in background
    res.json({ ok: true, logId: logEntry.id });

    setImmediate(async () => {
      try {
        const { results, total, valid, invalid, skipped } = await verifyAllProtocols(req);
        await db
          .update(integrityCheckLogTable)
          .set({
            completedAt: new Date(),
            total,
            valid,
            invalid,
            skipped,
            status: "completed",
            details: results as unknown[],
          })
          .where(eq(integrityCheckLogTable.id, logEntry.id));
      } catch (err) {
        req.log.error({ err }, "verify-all background error");
        await db
          .update(integrityCheckLogTable)
          .set({ completedAt: new Date(), status: "failed" })
          .where(eq(integrityCheckLogTable.id, logEntry.id));
      }
    });
  } catch (err) {
    req.log.error({ err }, "verify-all error");
    res.status(500).json({ error: "Errore avvio verifica" });
  }
});

// ── GET /api/admin/integrity/logs ─────────────────────────────────────────────
// Ultimi log di verifica
router.get("/admin/integrity/logs", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const rows = await db
      .select()
      .from(integrityCheckLogTable)
      .orderBy(desc(integrityCheckLogTable.startedAt))
      .limit(limit);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "integrity logs error");
    res.status(500).json({ error: "Errore recupero log" });
  }
});

// ── GET /api/admin/integrity/logs/:id ─────────────────────────────────────────
// Dettaglio singolo log (con details completi)
router.get("/admin/integrity/logs/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db
      .select()
      .from(integrityCheckLogTable)
      .where(eq(integrityCheckLogTable.id, id));
    if (!row) { res.status(404).json({ error: "Log non trovato" }); return; }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "integrity log detail error");
    res.status(500).json({ error: "Errore recupero log" });
  }
});

// ── GET /api/admin/integrity/schedules ───────────────────────────────────────
router.get("/admin/integrity/schedules", async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(integritySchedulesTable)
      .orderBy(asc(integritySchedulesTable.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "schedules list error");
    res.status(500).json({ error: "Errore recupero schedule" });
  }
});

// ── POST /api/admin/integrity/schedules ──────────────────────────────────────
router.post("/admin/integrity/schedules", async (req: Request, res: Response) => {
  try {
    const {
      name, frequency = "weekly",
      hour = 2, minute = 0,
      dayOfWeek, dayOfMonth, monthOfYear,
      enabled = true,
    } = req.body as {
      name: string; frequency: string;
      hour?: number; minute?: number;
      dayOfWeek?: number; dayOfMonth?: number; monthOfYear?: number;
      enabled?: boolean;
    };

    if (!name?.trim()) { res.status(400).json({ error: "Nome obbligatorio" }); return; }

    const cronExpression = buildCronExpression(frequency, hour, minute, dayOfWeek, dayOfMonth, monthOfYear);

    const [created] = await db
      .insert(integritySchedulesTable)
      .values({
        name: name.trim(),
        frequency,
        cronExpression,
        hour,
        minute,
        dayOfWeek: dayOfWeek ?? null,
        dayOfMonth: dayOfMonth ?? null,
        monthOfYear: monthOfYear ?? null,
        enabled,
      })
      .returning();

    if (enabled) await reloadSchedule(created.id);
    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "create schedule error");
    res.status(500).json({ error: "Errore creazione schedule" });
  }
});

// ── PUT /api/admin/integrity/schedules/:id ───────────────────────────────────
router.put("/admin/integrity/schedules/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const {
      name, frequency, hour, minute,
      dayOfWeek, dayOfMonth, monthOfYear, enabled,
    } = req.body as {
      name?: string; frequency?: string;
      hour?: number; minute?: number;
      dayOfWeek?: number; dayOfMonth?: number; monthOfYear?: number;
      enabled?: boolean;
    };

    const [existing] = await db
      .select()
      .from(integritySchedulesTable)
      .where(eq(integritySchedulesTable.id, id));
    if (!existing) { res.status(404).json({ error: "Schedule non trovata" }); return; }

    const newFrequency  = frequency ?? existing.frequency;
    const newHour       = hour ?? existing.hour;
    const newMinute     = minute ?? existing.minute;
    const newDow        = dayOfWeek  !== undefined ? dayOfWeek  : existing.dayOfWeek;
    const newDom        = dayOfMonth !== undefined ? dayOfMonth : existing.dayOfMonth;
    const newMoy        = monthOfYear !== undefined ? monthOfYear : existing.monthOfYear;
    const newEnabled    = enabled !== undefined ? enabled : existing.enabled;
    const newCron       = buildCronExpression(newFrequency, newHour, newMinute, newDow, newDom, newMoy);

    const [updated] = await db
      .update(integritySchedulesTable)
      .set({
        name: name ?? existing.name,
        frequency: newFrequency,
        cronExpression: newCron,
        hour: newHour,
        minute: newMinute,
        dayOfWeek: newDow,
        dayOfMonth: newDom,
        monthOfYear: newMoy,
        enabled: newEnabled,
      })
      .where(eq(integritySchedulesTable.id, id))
      .returning();

    await reloadSchedule(id);
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "update schedule error");
    res.status(500).json({ error: "Errore aggiornamento schedule" });
  }
});

// ── DELETE /api/admin/integrity/schedules/:id ────────────────────────────────
router.delete("/admin/integrity/schedules/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    stopScheduleJob(id);
    await db.delete(integritySchedulesTable).where(eq(integritySchedulesTable.id, id));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "delete schedule error");
    res.status(500).json({ error: "Errore eliminazione schedule" });
  }
});

// ── POST /api/admin/integrity/schedules/:id/run ──────────────────────────────
// Esegui una schedule manualmente adesso
router.post("/admin/integrity/schedules/:id/run", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [s] = await db
      .select()
      .from(integritySchedulesTable)
      .where(eq(integritySchedulesTable.id, id));
    if (!s) { res.status(404).json({ error: "Schedule non trovata" }); return; }

    res.json({ ok: true, message: "Verifica avviata in background" });
    setImmediate(() => runScheduleNow(id).catch(() => {}));
  } catch (err) {
    req.log.error({ err }, "run schedule error");
    res.status(500).json({ error: "Errore avvio schedule" });
  }
});

export default router;
