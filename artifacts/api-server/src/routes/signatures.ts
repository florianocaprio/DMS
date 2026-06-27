import { Router } from "express";
import { db } from "@workspace/db";
import { signatureRequestsTable, usersTable, documentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/signatures", async (req, res): Promise<void> => {
  const { documentId, status, pendingForMe } = req.query;
  let rows = await db.select().from(signatureRequestsTable).orderBy(signatureRequestsTable.createdAt);
  if (documentId) rows = rows.filter((s) => s.documentId === Number(documentId));
  if (status) rows = rows.filter((s) => s.status === status);
  if (pendingForMe === "true") {
    rows = rows.filter((s) => {
      const sigs = (s.signatories as Array<{ userId: number; status: string }>) || [];
      return sigs.some((sg) => sg.userId === req.currentUserId && sg.status === "pending");
    });
  }
  const userMap = Object.fromEntries((await db.select().from(usersTable)).map((u) => [u.id, u]));
  const docMap = Object.fromEntries((await db.select().from(documentsTable)).map((d) => [d.id, d]));
  res.json(rows.map((s) => fmtSignature(s, userMap, docMap)));
});

router.post("/signatures", async (req, res): Promise<void> => {
  const { documentId, type, signatories, note, expiresAt } = req.body;
  const sigs = (signatories || []).map((s: { userId: number; order: number }) => ({
    userId: s.userId,
    order: s.order,
    status: "pending",
    signedAt: null,
    note: null,
  }));
  const [sr] = await db.insert(signatureRequestsTable).values({
    documentId, type: type || "internal", signatories: sigs,
    requestedById: req.currentUserId!, note,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  }).returning();
  const userMap = Object.fromEntries((await db.select().from(usersTable)).map((u) => [u.id, u]));
  const docMap = Object.fromEntries((await db.select().from(documentsTable)).map((d) => [d.id, d]));
  res.status(201).json(fmtSignature(sr, userMap, docMap));
});

router.post("/signatures/:id/sign", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { action, note } = req.body;
  const [sr] = await db.select().from(signatureRequestsTable).where(eq(signatureRequestsTable.id, id)).limit(1);
  if (!sr) { res.status(404).json({ error: "Not found" }); return; }

  const sigs = (sr.signatories as Array<{ userId: number; order: number; status: string; signedAt: string | null; note: string | null }>) || [];
  const pending = sigs.find((s) => s.userId === req.currentUserId && s.status === "pending");
  if (!pending) {
    res.status(400).json({ error: "Nessuna firma in attesa per l'utente corrente" });
    return;
  }
  pending.status = action === "sign" ? "signed" : "rejected";
  pending.signedAt = new Date().toISOString();
  pending.note = note || null;

  const allSigned = sigs.every((s) => s.status === "signed");
  const anySigned = sigs.some((s) => s.status === "signed");
  const anyRejected = sigs.some((s) => s.status === "rejected");
  const allRejected = sigs.every((s) => s.status === "rejected");
  const requireAll = sr.requireAll ?? true;

  let newStatus: string;
  if (requireAll) {
    // every signatory must sign; a single rejection blocks the request
    newStatus = anyRejected ? "rejected" : allSigned ? "completed" : "pending";
  } else {
    // a single signature is sufficient; only blocked if everyone rejects
    newStatus = anySigned ? "completed" : allRejected ? "rejected" : "pending";
  }
  const isResolved = newStatus !== "pending";

  const [updated] = await db.update(signatureRequestsTable).set({
    signatories: sigs,
    status: newStatus,
    completedAt: isResolved ? new Date() : null,
  }).where(eq(signatureRequestsTable.id, id)).returning();

  const userMap = Object.fromEntries((await db.select().from(usersTable)).map((u) => [u.id, u]));
  const docMap = Object.fromEntries((await db.select().from(documentsTable)).map((d) => [d.id, d]));
  res.json(fmtSignature(updated, userMap, docMap));
});

function fmtSignature(
  s: typeof signatureRequestsTable.$inferSelect,
  userMap: Record<number, { name: string }>,
  docMap: Record<number, { title: string }>,
) {
  const sigs = (s.signatories as Array<{ userId: number; order: number; status: string; signedAt: string | null; note: string | null }>) || [];
  return {
    id: s.id,
    documentId: s.documentId,
    documentTitle: docMap[s.documentId]?.title ?? null,
    status: s.status,
    type: s.type,
    signatories: sigs.map((sg) => ({
      userId: sg.userId,
      userName: userMap[sg.userId]?.name ?? "Unknown",
      order: sg.order,
      status: sg.status,
      signedAt: sg.signedAt,
      note: sg.note,
    })),
    requestedById: s.requestedById,
    requestedByName: userMap[s.requestedById]?.name ?? "Unknown",
    note: s.note,
    createdAt: s.createdAt.toISOString(),
    completedAt: s.completedAt?.toISOString() ?? null,
    expiresAt: s.expiresAt?.toISOString() ?? null,
  };
}

export default router;
