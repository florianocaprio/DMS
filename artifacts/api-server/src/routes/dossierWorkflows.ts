import { Router } from "express";
import { db } from "@workspace/db";
import {
  dossierWorkflowRulesTable,
  dossierWorkflowInstancesTable,
  signatureRequestsTable,
  usersTable,
  documentsTable,
  protocolsTable,
  type InstanceParticipant,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

const CURRENT_USER_ID = 1;

// ─── Rules CRUD ──────────────────────────────────────────────────────────────

router.get("/dossiers/:id/workflow-rules", async (req, res): Promise<void> => {
  const dossierId = Number(req.params.id);
  const rows = await db
    .select()
    .from(dossierWorkflowRulesTable)
    .where(eq(dossierWorkflowRulesTable.dossierId, dossierId))
    .orderBy(desc(dossierWorkflowRulesTable.createdAt));
  const userMap = await getUserMap();
  res.json(rows.map((r) => fmtRule(r, userMap)));
});

router.post("/dossiers/:id/workflow-rules", async (req, res): Promise<void> => {
  const dossierId = Number(req.params.id);
  const { type, name, appliesTo, config, isActive } = req.body;
  if (!type || !name) {
    res.status(400).json({ error: "type and name are required" });
    return;
  }
  const [r] = await db
    .insert(dossierWorkflowRulesTable)
    .values({
      dossierId,
      type,
      name,
      appliesTo: appliesTo || "both",
      config: config || {},
      isActive: isActive ?? true,
    })
    .returning();
  const userMap = await getUserMap();
  res.status(201).json(fmtRule(r, userMap));
});

router.patch("/workflow-rules/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { name, appliesTo, config, isActive } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (appliesTo !== undefined) updates.appliesTo = appliesTo;
  if (config !== undefined) updates.config = config;
  if (isActive !== undefined) updates.isActive = isActive;
  const [r] = await db.update(dossierWorkflowRulesTable).set(updates).where(eq(dossierWorkflowRulesTable.id, id)).returning();
  if (!r) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const userMap = await getUserMap();
  res.json(fmtRule(r, userMap));
});

router.delete("/workflow-rules/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(dossierWorkflowRulesTable).where(eq(dossierWorkflowRulesTable.id, id));
  res.status(204).end();
});

// ─── Instances ───────────────────────────────────────────────────────────────

router.get("/dossiers/:id/workflow-instances", async (req, res): Promise<void> => {
  const dossierId = Number(req.params.id);
  const rows = await db
    .select()
    .from(dossierWorkflowInstancesTable)
    .where(eq(dossierWorkflowInstancesTable.dossierId, dossierId))
    .orderBy(desc(dossierWorkflowInstancesTable.createdAt));
  res.json(await fmtInstances(rows));
});

router.get("/workflow-instances", async (req, res): Promise<void> => {
  const { pendingForMe } = req.query;
  const rows = await db.select().from(dossierWorkflowInstancesTable).orderBy(desc(dossierWorkflowInstancesTable.createdAt));
  // Format first so signature instances reflect live signature-request state,
  // then filter on the formatted (live) status/participants.
  let formatted = await fmtInstances(rows);
  if (pendingForMe === "true") {
    formatted = formatted.filter(
      (inst) =>
        inst.status === "pending" &&
        inst.participants.some((p) => p.userId === CURRENT_USER_ID && p.status === "pending"),
    );
  }
  res.json(formatted);
});

router.post("/workflow-instances/:id/act", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { action, note } = req.body as { action?: string; note?: string };
  const [inst] = await db.select().from(dossierWorkflowInstancesTable).where(eq(dossierWorkflowInstancesTable.id, id)).limit(1);
  if (!inst) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (inst.type === "signature") {
    res.status(400).json({ error: "Le firme si gestiscono dalla sezione Firme" });
    return;
  }

  // Validate action against the instance type.
  const allowed: Record<string, string[]> = { approval: ["approve", "reject"], cc: ["acknowledge"] };
  if (!action || !allowed[inst.type]?.includes(action)) {
    res.status(400).json({ error: `Azione non valida per questo tipo (ammesse: ${allowed[inst.type]?.join(", ") ?? "nessuna"})` });
    return;
  }

  const parts = (inst.participants as InstanceParticipant[]) || [];
  const me = parts.find((p) => p.userId === CURRENT_USER_ID && p.status === "pending");
  if (!me) {
    res.status(400).json({ error: "Nessuna azione in attesa per l'utente corrente" });
    return;
  }

  if (inst.type === "approval") {
    me.status = action === "reject" ? "rejected" : "approved";
  } else {
    // cc
    me.status = "acknowledged";
  }
  me.actedAt = new Date().toISOString();
  me.note = note || null;

  const anyRejected = parts.some((p) => p.status === "rejected");
  const allActed = parts.every((p) => p.status !== "pending");
  let status = inst.status;
  if (inst.type === "approval") {
    status = anyRejected ? "rejected" : allActed ? "approved" : "pending";
  } else {
    status = allActed ? "acknowledged" : "pending";
  }
  const resolved = status !== "pending";

  const [updated] = await db
    .update(dossierWorkflowInstancesTable)
    .set({ participants: parts, status, resolvedAt: resolved ? new Date() : null })
    .where(eq(dossierWorkflowInstancesTable.id, id))
    .returning();

  const [one] = await fmtInstances([updated]);
  res.json(one);
});

// ─── Formatters ──────────────────────────────────────────────────────────────

async function getUserMap() {
  const users = await db.select().from(usersTable);
  return Object.fromEntries(users.map((u) => [u.id, u]));
}

function fmtRule(r: typeof dossierWorkflowRulesTable.$inferSelect, userMap: Record<number, { name: string }>) {
  const config = (r.config ?? {}) as Record<string, unknown>;
  const userIdsForLabel: number[] = [];
  if (r.type === "cc" && Array.isArray(config.userIds)) userIdsForLabel.push(...(config.userIds as number[]));
  if (r.type === "approval" && typeof config.approverId === "number") userIdsForLabel.push(config.approverId);
  if (r.type === "signature" && Array.isArray(config.signatoryIds)) userIdsForLabel.push(...(config.signatoryIds as number[]));
  return {
    id: r.id,
    dossierId: r.dossierId,
    type: r.type,
    name: r.name,
    appliesTo: r.appliesTo,
    config,
    participantNames: userIdsForLabel.map((uid) => userMap[uid]?.name ?? `Utente ${uid}`),
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
  };
}

async function fmtInstances(rows: Array<typeof dossierWorkflowInstancesTable.$inferSelect>) {
  if (rows.length === 0) return [];
  const userMap = await getUserMap();
  const docMap = Object.fromEntries((await db.select().from(documentsTable)).map((d) => [d.id, d]));
  const protMap = Object.fromEntries((await db.select().from(protocolsTable)).map((p) => [p.id, p]));
  const ruleMap = Object.fromEntries((await db.select().from(dossierWorkflowRulesTable)).map((r) => [r.id, r]));

  // Pull linked signature requests to reflect live status for signature instances.
  const sigIds = rows.map((r) => r.signatureRequestId).filter((x): x is number => x != null);
  const sigMap: Record<number, typeof signatureRequestsTable.$inferSelect> = {};
  if (sigIds.length > 0) {
    const sigs = await db.select().from(signatureRequestsTable);
    for (const s of sigs) sigMap[s.id] = s;
  }

  return rows.map((inst) => {
    const rule = ruleMap[inst.ruleId];
    let targetTitle: string | null = null;
    if (inst.targetType === "document") targetTitle = docMap[inst.targetId]?.title ?? null;
    else targetTitle = protMap[inst.targetId]?.number ?? null;

    let participants = (inst.participants as InstanceParticipant[]) || [];
    let status = inst.status;

    // For signature instances, mirror the linked signature request's live state.
    if (inst.type === "signature" && inst.signatureRequestId && sigMap[inst.signatureRequestId]) {
      const sr = sigMap[inst.signatureRequestId];
      const sigs = (sr.signatories as Array<{ userId: number; status: string; signedAt: string | null; note: string | null }>) || [];
      participants = sigs.map((s) => ({ userId: s.userId, status: s.status, actedAt: s.signedAt, note: s.note }));
      status = sr.status === "completed" ? "completed" : sr.status === "rejected" ? "rejected" : "pending";
    }

    return {
      id: inst.id,
      ruleId: inst.ruleId,
      ruleName: rule?.name ?? "Regola",
      dossierId: inst.dossierId,
      type: inst.type,
      targetType: inst.targetType,
      targetId: inst.targetId,
      targetTitle,
      status,
      signatureRequestId: inst.signatureRequestId,
      participants: participants.map((p) => ({
        userId: p.userId,
        userName: userMap[p.userId]?.name ?? `Utente ${p.userId}`,
        status: p.status,
        actedAt: p.actedAt,
        note: p.note,
      })),
      note: inst.note,
      createdAt: inst.createdAt.toISOString(),
      resolvedAt: inst.resolvedAt?.toISOString() ?? null,
    };
  });
}

export default router;
