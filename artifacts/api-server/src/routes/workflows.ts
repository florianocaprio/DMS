import { Router } from "express";
import { db } from "@workspace/db";
import { workflowsTable, documentWorkflowsTable, usersTable, documentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/workflows", async (_req, res): Promise<void> => {
  const rows = await db.select().from(workflowsTable).orderBy(workflowsTable.name);
  res.json(rows.map(fmtWorkflow));
});

router.get("/workflows/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [w] = await db.select().from(workflowsTable).where(eq(workflowsTable.id, id)).limit(1);
  if (!w) { res.status(404).json({ error: "Not found" }); return; }
  res.json(fmtWorkflow(w));
});

router.post("/workflows", async (req, res): Promise<void> => {
  const { name, description, documentType, steps } = req.body;
  const [w] = await db.insert(workflowsTable).values({ name, description, documentType, steps: steps || [] }).returning();
  res.status(201).json(fmtWorkflow(w));
});

router.get("/document-workflows", async (req, res): Promise<void> => {
  const { documentId, status } = req.query;
  let rows = await db.select().from(documentWorkflowsTable).orderBy(documentWorkflowsTable.startedAt);
  if (documentId) rows = rows.filter((dw) => dw.documentId === Number(documentId));
  if (status) rows = rows.filter((dw) => dw.status === status);
  const wfMap = Object.fromEntries((await db.select().from(workflowsTable)).map((w) => [w.id, w]));
  const docMap = Object.fromEntries((await db.select().from(documentsTable)).map((d) => [d.id, d]));
  const userMap = Object.fromEntries((await db.select().from(usersTable)).map((u) => [u.id, u]));
  res.json(rows.map((dw) => fmtDocWorkflow(dw, wfMap, docMap, userMap)));
});

router.post("/document-workflows", async (req, res): Promise<void> => {
  const { documentId, workflowId, note } = req.body;
  const [wf] = await db.select().from(workflowsTable).where(eq(workflowsTable.id, workflowId)).limit(1);
  if (!wf) { res.status(404).json({ error: "Workflow not found" }); return; }
  const steps = (wf.steps as Array<{ order: number }>) || [];
  const [dw] = await db.insert(documentWorkflowsTable).values({
    documentId, workflowId, totalSteps: steps.length, note,
    status: "in_progress", currentStep: 1,
  }).returning();
  const wfMap = { [wf.id]: wf };
  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, documentId)).limit(1);
  const docMap = doc ? { [doc.id]: doc } : {};
  res.status(201).json(fmtDocWorkflow(dw, wfMap, docMap, {}));
});

router.post("/document-workflows/:id/advance", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { outcome, note } = req.body;
  const [dw] = await db.select().from(documentWorkflowsTable).where(eq(documentWorkflowsTable.id, id)).limit(1);
  if (!dw) { res.status(404).json({ error: "Not found" }); return; }

  let updates: Record<string, unknown> = {};
  if (outcome === "approved" || outcome === "completed") {
    if (dw.currentStep >= dw.totalSteps) {
      updates = { status: "completed", completedAt: new Date() };
    } else {
      updates = { currentStep: dw.currentStep + 1 };
    }
  } else if (outcome === "rejected") {
    updates = { status: "rejected", completedAt: new Date() };
  }
  if (note) updates.note = note;
  const [updated] = await db.update(documentWorkflowsTable).set(updates).where(eq(documentWorkflowsTable.id, id)).returning();
  const wfMap = Object.fromEntries((await db.select().from(workflowsTable)).map((w) => [w.id, w]));
  const docMap = Object.fromEntries((await db.select().from(documentsTable)).map((d) => [d.id, d]));
  const userMap = Object.fromEntries((await db.select().from(usersTable)).map((u) => [u.id, u]));
  res.json(fmtDocWorkflow(updated, wfMap, docMap, userMap));
});

function fmtWorkflow(w: typeof workflowsTable.$inferSelect) {
  const steps = (w.steps as Array<{ id?: number; name: string; description?: string; order: number; action: string; responsibleRole?: string; dueDays?: number; requiredApprovalType?: string }>) || [];
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    documentType: w.documentType,
    steps: steps.map((s, i) => ({
      id: s.id ?? i + 1,
      name: s.name,
      description: s.description ?? null,
      order: s.order,
      action: s.action,
      responsibleRole: s.responsibleRole ?? null,
      dueDays: s.dueDays ?? null,
      requiredApprovalType: s.requiredApprovalType ?? "single",
    })),
    isActive: w.isActive,
    createdAt: w.createdAt.toISOString(),
  };
}

function fmtDocWorkflow(
  dw: typeof documentWorkflowsTable.$inferSelect,
  wfMap: Record<number, typeof workflowsTable.$inferSelect>,
  docMap: Record<number, { title: string }>,
  userMap: Record<number, { name: string }>,
) {
  const wf = wfMap[dw.workflowId];
  const steps = (wf?.steps as Array<{ order: number; name: string; action: string }>) || [];
  const currentStepData = steps.find((s) => s.order === dw.currentStep);
  return {
    id: dw.id,
    documentId: dw.documentId,
    documentTitle: docMap[dw.documentId]?.title ?? null,
    workflowId: dw.workflowId,
    workflowName: wf?.name ?? "Unknown",
    currentStep: dw.currentStep,
    totalSteps: dw.totalSteps,
    status: dw.status,
    startedAt: dw.startedAt.toISOString(),
    completedAt: dw.completedAt?.toISOString() ?? null,
    currentStepName: currentStepData?.name ?? null,
    currentStepAction: currentStepData?.action ?? null,
    currentAssigneeId: dw.currentAssigneeId,
    currentAssigneeName: dw.currentAssigneeId ? (userMap[dw.currentAssigneeId]?.name ?? null) : null,
  };
}

export default router;
