/**
 * Scheduler per le verifiche di integrità periodiche.
 * Usa node-cron per eseguire i job configurati nel DB.
 * Si inizializza all'avvio e aggiorna i job in tempo reale.
 */

import cron, { type ScheduledTask } from "node-cron";
import { db } from "@workspace/db";
import {
  integritySchedulesTable,
  integrityCheckLogTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { verifyAllProtocols } from "./integrity";
import { logger } from "./logger";

// Map scheduleId → active cron task
const activeTasks = new Map<number, ScheduledTask>();

// ── Cron expression builder ───────────────────────────────────────────────────

export function buildCronExpression(
  frequency: string,
  hour: number,
  minute: number,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null,
  monthOfYear?: number | null,
): string {
  const m = minute ?? 0;
  const h = hour ?? 2;

  switch (frequency) {
    case "daily":   return `${m} ${h} * * *`;
    case "weekly":  return `${m} ${h} * * ${dayOfWeek ?? 1}`;
    case "monthly": return `${m} ${h} ${dayOfMonth ?? 1} * *`;
    case "yearly":  return `${m} ${h} ${dayOfMonth ?? 1} ${monthOfYear ?? 1} *`;
    default:        return `${m} ${h} * * *`; // fallback: daily
  }
}

// ── Esegui un singolo schedule ────────────────────────────────────────────────

async function runSchedule(scheduleId: number) {
  logger.info({ scheduleId }, "Running integrity schedule");

  // Inserisci un log entry in stato "running"
  const [logEntry] = await db
    .insert(integrityCheckLogTable)
    .values({
      scheduleId,
      triggeredBy: "schedule",
      startedAt: new Date(),
      status: "running",
    })
    .returning();

  try {
    const { results, total, valid, invalid, skipped } = await verifyAllProtocols();

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

    // Aggiorna lastRunAt nel schedule
    await db
      .update(integritySchedulesTable)
      .set({ lastRunAt: new Date() })
      .where(eq(integritySchedulesTable.id, scheduleId));

    logger.info({ scheduleId, total, valid, invalid, skipped }, "Integrity schedule completed");
  } catch (err) {
    logger.error({ err, scheduleId }, "Integrity schedule failed");
    await db
      .update(integrityCheckLogTable)
      .set({ completedAt: new Date(), status: "failed" })
      .where(eq(integrityCheckLogTable.id, logEntry.id));
  }
}

// ── Avvia un singolo schedule ─────────────────────────────────────────────────

function startScheduleJob(schedule: typeof integritySchedulesTable.$inferSelect) {
  stopScheduleJob(schedule.id); // ferma il precedente se esiste

  if (!schedule.enabled || schedule.frequency === "once") return;

  const expr = schedule.cronExpression;
  if (!cron.validate(expr)) {
    logger.warn({ scheduleId: schedule.id, expr }, "Invalid cron expression, skipping");
    return;
  }

  const task = cron.schedule(expr, () => runSchedule(schedule.id), {
    timezone: "Europe/Rome",
  });

  activeTasks.set(schedule.id, task);
  logger.info({ scheduleId: schedule.id, expr }, "Scheduled integrity job started");
}

// ── Ferma un singolo schedule ─────────────────────────────────────────────────

export function stopScheduleJob(scheduleId: number) {
  const existing = activeTasks.get(scheduleId);
  if (existing) {
    existing.stop();
    activeTasks.delete(scheduleId);
  }
}

// ── Carica e avvia tutti gli schedule attivi dal DB ───────────────────────────

export async function initScheduler() {
  try {
    const schedules = await db.select().from(integritySchedulesTable);
    for (const s of schedules) {
      if (s.enabled && s.frequency !== "once") startScheduleJob(s);
    }
    logger.info({ count: schedules.length }, "Integrity scheduler initialized");
  } catch (err) {
    logger.error({ err }, "Failed to initialize integrity scheduler");
  }
}

// ── Ricarica uno schedule (dopo creazione/modifica) ───────────────────────────

export async function reloadSchedule(scheduleId: number) {
  const [s] = await db
    .select()
    .from(integritySchedulesTable)
    .where(eq(integritySchedulesTable.id, scheduleId));
  if (s) startScheduleJob(s);
  else stopScheduleJob(scheduleId);
}

// ── Esegui schedule manualmente ───────────────────────────────────────────────

export async function runScheduleNow(scheduleId: number) {
  await runSchedule(scheduleId);
}
