import { Router } from "express";
import { db } from "@workspace/db";
import { protocolsTable, documentsTable, tasksTable, signatureRequestsTable, usersTable, documentWorkflowsTable, activityLogTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/dashboard/stats", async (_req, res): Promise<void> => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [protocols, documents, tasks, signatures] = await Promise.all([
    db.select().from(protocolsTable),
    db.select().from(documentsTable),
    db.select().from(tasksTable),
    db.select().from(signatureRequestsTable),
  ]);

  const today_str = todayStart.toISOString();
  const month_str = monthStart.toISOString();
  const today_date = now.toISOString().slice(0, 10);

  res.json({
    protocolsToday: protocols.filter((p) => p.registeredAt >= todayStart).length,
    protocolsThisMonth: protocols.filter((p) => p.registeredAt >= monthStart).length,
    protocolsIncoming: protocols.filter((p) => p.type === "incoming" && p.status !== "cancelled").length,
    protocolsOutgoing: protocols.filter((p) => p.type === "outgoing" && p.status !== "cancelled").length,
    protocolsInternal: protocols.filter((p) => p.type === "internal" && p.status !== "cancelled").length,
    documentsInProgress: documents.filter((d) => d.status === "in_progress").length,
    documentsInApproval: documents.filter((d) => d.status === "in_approval").length,
    documentsInSignature: documents.filter((d) => d.status === "in_signature").length,
    openTasks: tasks.filter((t) => !["completed", "cancelled"].includes(t.status)).length,
    overdueTasks: tasks.filter((t) => t.dueDate && t.dueDate < today_date && !["completed", "cancelled"].includes(t.status)).length,
    pendingSignatures: signatures.filter((s) => s.status === "pending").length,
    cancelledProtocols: protocols.filter((p) => p.status === "cancelled").length,
  });
});

router.get("/dashboard/my-items", async (req, res): Promise<void> => {
  const myId = req.currentUserId!;
  const [documents, tasks, docWorkflows, signatures] = await Promise.all([
    db.select().from(documentsTable).where(eq(documentsTable.responsibleId, myId)).limit(5),
    db.select().from(tasksTable).where(eq(tasksTable.assignedToId, myId)).limit(5),
    db.select().from(documentWorkflowsTable).where(eq(documentWorkflowsTable.status, "in_progress")).limit(5),
    db.select().from(signatureRequestsTable).where(eq(signatureRequestsTable.status, "pending")).limit(5),
  ]);

  const today_date = new Date().toISOString().slice(0, 10);
  const upcoming = await db.select().from(tasksTable)
    .where(eq(tasksTable.assignedToId, myId))
    .orderBy(tasksTable.dueDate)
    .limit(5);

  const userMap = Object.fromEntries((await db.select().from(usersTable)).map((u) => [u.id, u]));

  res.json({
    assignedDocuments: documents.map((d) => ({
      id: d.id, title: d.title, type: d.type, status: d.status,
      subject: d.subject, confidentiality: d.confidentiality, priority: d.priority,
      version: d.version, dossierId: d.dossierId, dossierTitle: null,
      protocolId: d.protocolId, protocolNumber: null, classificationId: d.classificationId,
      classificationCode: null, responsibleId: d.responsibleId,
      responsibleName: d.responsibleId ? (userMap[d.responsibleId]?.name ?? null) : null,
      createdById: d.createdById, createdByName: userMap[d.createdById]?.name ?? "Unknown",
      tags: d.tags, ocrText: null, aiSummary: d.aiSummary,
      driveUrl: d.driveUrl, fileName: d.fileName, fileSize: d.fileSize, mimeType: d.mimeType,
      createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString(), archivedAt: null,
    })),
    myTasks: tasks.map((t) => ({
      id: t.id, title: t.title, description: t.description, status: t.status,
      priority: t.priority, progress: t.progress, protocolId: t.protocolId,
      protocolNumber: null, documentId: t.documentId, documentTitle: null,
      dossierId: t.dossierId, dossierTitle: null, assignedToId: t.assignedToId,
      assignedToName: t.assignedToId ? (userMap[t.assignedToId]?.name ?? null) : null,
      createdById: t.createdById, createdByName: userMap[t.createdById]?.name ?? "Unknown",
      dueDate: t.dueDate, completedAt: t.completedAt?.toISOString() ?? null,
      notes: t.notes, outcome: t.outcome,
      createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(),
    })),
    pendingApprovals: docWorkflows.map((dw) => ({
      id: dw.id, documentId: dw.documentId, documentTitle: null,
      workflowId: dw.workflowId, workflowName: "Workflow",
      currentStep: dw.currentStep, totalSteps: dw.totalSteps, status: dw.status,
      startedAt: dw.startedAt.toISOString(), completedAt: dw.completedAt?.toISOString() ?? null,
      currentStepName: null, currentStepAction: null,
      currentAssigneeId: dw.currentAssigneeId, currentAssigneeName: null,
    })),
    pendingSignatures: signatures.map((s) => ({
      id: s.id, documentId: s.documentId, documentTitle: null,
      status: s.status, type: s.type,
      signatories: (s.signatories as Array<{ userId: number; order: number; status: string; signedAt: string | null; note: string | null }>).map((sg) => ({
        userId: sg.userId, userName: userMap[sg.userId]?.name ?? "Unknown",
        order: sg.order, status: sg.status, signedAt: sg.signedAt, note: sg.note,
      })),
      requestedById: s.requestedById, requestedByName: userMap[s.requestedById]?.name ?? "Unknown",
      note: s.note, createdAt: s.createdAt.toISOString(),
      completedAt: s.completedAt?.toISOString() ?? null, expiresAt: s.expiresAt?.toISOString() ?? null,
    })),
    upcomingDeadlines: upcoming
      .filter((t) => t.dueDate && !["completed", "cancelled"].includes(t.status))
      .map((t) => ({
        id: t.id, title: t.title, description: t.description, status: t.status,
        priority: t.priority, progress: t.progress, protocolId: t.protocolId,
        protocolNumber: null, documentId: t.documentId, documentTitle: null,
        dossierId: t.dossierId, dossierTitle: null, assignedToId: t.assignedToId,
        assignedToName: t.assignedToId ? (userMap[t.assignedToId]?.name ?? null) : null,
        createdById: t.createdById, createdByName: userMap[t.createdById]?.name ?? "Unknown",
        dueDate: t.dueDate, completedAt: t.completedAt?.toISOString() ?? null,
        notes: t.notes, outcome: t.outcome,
        createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(),
      })),
  });
});

router.get("/dashboard/activity", async (_req, res): Promise<void> => {
  const logs = await db.select().from(activityLogTable).orderBy(desc(activityLogTable.createdAt)).limit(20);
  const userMap = Object.fromEntries((await db.select().from(usersTable)).map((u) => [u.id, u]));
  res.json(logs.map((l) => ({
    id: l.id,
    type: l.type,
    description: l.description,
    userId: l.userId,
    userName: userMap[l.userId]?.name ?? "Unknown",
    timestamp: l.createdAt.toISOString(),
    documentId: l.documentId,
    protocolNumber: null,
  })));
});

export default router;
