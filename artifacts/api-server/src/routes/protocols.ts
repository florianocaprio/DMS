import { Router } from "express";
import { db } from "@workspace/db";
import { protocolsTable, usersTable, dossiersTable, classificationsTable, protocolDossiersTable, activityLogTable } from "@workspace/db";
import { eq, sql, desc, and } from "drizzle-orm";
import { triggerDossierWorkflows } from "../lib/dossierWorkflowEngine";
import { getEffectiveMemberships, materializeLegacyMembership } from "../lib/memberships";
import {
  loadProtocolNumberingConfig,
  renderProtocolNumber,
  validateProtocolNumber,
  ProtocolNumberingError,
} from "../lib/protocolNumbering";

const router = Router();

async function generateNumber(type: string): Promise<string> {
  const year = new Date().getFullYear();
  const config = await loadProtocolNumberingConfig();
  const existing = await db.select({ id: protocolsTable.id })
    .from(protocolsTable)
    .where(sql`extract(year from ${protocolsTable.registeredAt}) = ${year} AND ${protocolsTable.type} = ${type}`);
  const number = renderProtocolNumber(config, type, year, existing.length + 1);
  if (!validateProtocolNumber(number, config)) {
    throw new ProtocolNumberingError("Il numero generato non rispetta la regex configurata");
  }
  return number;
}

router.get("/protocols", async (req, res): Promise<void> => {
  const { type, status, year, dossierId, assignedToMe, page = "1", limit = "20" } = req.query;
  const pg = Number(page);
  const lm = Number(limit);
  const offset = (pg - 1) * lm;

  let rows = await db.select().from(protocolsTable).orderBy(desc(protocolsTable.registeredAt));
  if (type) rows = rows.filter((p) => p.type === type);
  if (status) rows = rows.filter((p) => p.status === status);
  if (year) rows = rows.filter((p) => p.year === Number(year));
  if (dossierId) {
    const memberships = (await getEffectiveMemberships()).filter((m) => m.dossierId === Number(dossierId));
    const ids = new Set(memberships.map((m) => m.protocolId));
    rows = rows.filter((p) => ids.has(p.id));
  }
  if (assignedToMe === "true") rows = rows.filter((p) => p.assignedToId === req.currentUserId);

  const total = rows.length;
  const page_items = rows.slice(offset, offset + lm);

  const userMap = await getUserMap();
  const dossierMap = await getDossierMap();
  const classMap = await getClassMap();

  res.json({
    items: page_items.map((p) => fmtProtocol(p, userMap, dossierMap, classMap)),
    total,
    page: pg,
    limit: lm,
  });
});

router.get("/protocols/summary", async (_req, res): Promise<void> => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const all = await db.select().from(protocolsTable);

  const byType = ["incoming", "outgoing", "internal", "reserved"].map((type) => ({
    type,
    count: all.filter((p) => p.type === type).length,
  }));

  const byStatus = ["registered", "assigned", "in_progress", "completed", "cancelled"].map((status) => ({
    status,
    count: all.filter((p) => p.status === status).length,
  }));

  const thisYear = all.filter((p) => p.year === year).length;
  const thisMonth = all.filter((p) => {
    const d = new Date(p.registeredAt);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  }).length;

  res.json({ byType, byStatus, thisYear, thisMonth });
});

router.get("/protocols/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [p] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, id)).limit(1);
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  const userMap = await getUserMap();
  const dossierMap = await getDossierMap();
  const classMap = await getClassMap();
  res.json(fmtProtocol(p, userMap, dossierMap, classMap));
});

router.post("/protocols", async (req, res): Promise<void> => {
  const { type, subject, description, sender, recipients, ccRecipients, channel, confidentiality, priority, dossierId, dossierIds, classificationId, documentId, assignedToId, notes } = req.body;
  let number: string;
  try {
    number = await generateNumber(type);
  } catch (err) {
    if (err instanceof ProtocolNumberingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
  const year = new Date().getFullYear();

  // Determine primary + extra dossier memberships
  const extras: number[] = Array.isArray(dossierIds) ? dossierIds.map((x: unknown) => Number(x)).filter((n: number) => !Number.isNaN(n)) : [];
  let primary: number | null = dossierId ? Number(dossierId) : null;
  if (primary == null && extras.length > 0) primary = extras[0];
  const memberIds = Array.from(new Set([...(primary != null ? [primary] : []), ...extras]));
  let effectiveClassificationId = classificationId ? Number(classificationId) : null;
  if (!effectiveClassificationId && primary) {
    const [primaryDossier] = await db
      .select({ classificationId: dossiersTable.classificationId })
      .from(dossiersTable)
      .where(eq(dossiersTable.id, primary))
      .limit(1);
    effectiveClassificationId = primaryDossier?.classificationId ?? null;
  }

  const [p] = await db.insert(protocolsTable).values({
    number, year, type, subject, description, sender,
    recipients: recipients || [], ccRecipients: ccRecipients || [],
    channel, confidentiality: confidentiality || "normal",
    priority: priority || "normal",
    dossierId: primary, classificationId: effectiveClassificationId,
    documentId: documentId || null, assignedToId: assignedToId || null,
    registeredById: req.currentUserId!, notes,
  }).returning();

  if (memberIds.length > 0) {
    await db.insert(protocolDossiersTable).values(
      memberIds.map((dId) => ({ protocolId: p.id, dossierId: dId, isPrimary: dId === primary, addedById: req.currentUserId! })),
    ).onConflictDoNothing();
    const dossierMap = await getDossierMap();
    for (const dId of memberIds) {
      await logActivity(p.id, "protocol_filed", `Protocollo ${p.number} archiviato nel fascicolo ${dossierMap[dId]?.code ?? dId}${dId === primary ? " (primario)" : ""}`, req.currentUserId!);
      await triggerDossierWorkflows(dId, "protocol", p.id);
    }
  }

  res.status(201).json(fmtProtocol(p, {}, {}, {}));
});

router.patch("/protocols/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { subject, description, sender, recipients, priority, confidentiality, dossierId, classificationId, assignedToId, notes } = req.body;
  const updates: Record<string, unknown> = {};
  if (subject !== undefined) updates.subject = subject;
  if (description !== undefined) updates.description = description;
  if (sender !== undefined) updates.sender = sender;
  if (recipients !== undefined) updates.recipients = recipients;
  if (priority !== undefined) updates.priority = priority;
  if (confidentiality !== undefined) updates.confidentiality = confidentiality;
  if (classificationId !== undefined) updates.classificationId = classificationId;
  if (assignedToId !== undefined) updates.assignedToId = assignedToId;
  if (notes !== undefined) updates.notes = notes;
  const [prev] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, id)).limit(1);
  if (!prev) { res.status(404).json({ error: "Not found" }); return; }

  // Existence is confirmed above, so the junction is only ever mutated for a
  // real protocol. The protocol update and the primary-membership change run in
  // one transaction so protocols.dossierId and the junction stay atomic.
  let p: typeof prev | undefined;
  await db.transaction(async (tx) => {
    // Changing dossierId via PATCH = set/replace primary membership
    if (dossierId !== undefined) {
      const newPrimary = dossierId == null ? null : Number(dossierId);
      updates.dossierId = newPrimary;
      // Always demote existing primaries first so the junction never keeps a
      // stale primary that disagrees with protocols.dossierId (incl. null case).
      await tx.update(protocolDossiersTable).set({ isPrimary: false }).where(eq(protocolDossiersTable.protocolId, id));
      if (newPrimary != null) {
        await tx.insert(protocolDossiersTable)
          .values({ protocolId: id, dossierId: newPrimary, isPrimary: true, addedById: req.currentUserId! })
          .onConflictDoUpdate({ target: [protocolDossiersTable.protocolId, protocolDossiersTable.dossierId], set: { isPrimary: true } });
      }
    }
    [p] = await tx.update(protocolsTable).set(updates).where(eq(protocolsTable.id, id)).returning();
  });

  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  if (p.dossierId && p.dossierId !== prev.dossierId) {
    await triggerDossierWorkflows(p.dossierId, "protocol", p.id);
  }
  res.json(fmtProtocol(p, {}, {}, {}));
});

router.post("/protocols/:id/cancel", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { reason } = req.body;
  if (!reason) { res.status(400).json({ error: "Reason is required" }); return; }
  const [p] = await db.update(protocolsTable).set({
    status: "cancelled",
    cancelledAt: new Date(),
    cancelReason: reason,
  }).where(eq(protocolsTable.id, id)).returning();
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  res.json(fmtProtocol(p, {}, {}, {}));
});

// ── Multi-fascicolo membership ─────────────────────────────────────────────

router.get("/protocols/:id/dossiers", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const memberships = (await getEffectiveMemberships())
    .filter((m) => m.protocolId === id)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || (a.addedAt?.getTime() ?? 0) - (b.addedAt?.getTime() ?? 0));
  const dossierMap = await getDossierMap();
  const userMap = await getUserMap();
  res.json(memberships.map((m) => ({
    id: m.id,
    protocolId: m.protocolId,
    dossierId: m.dossierId,
    dossierCode: dossierMap[m.dossierId]?.code ?? null,
    dossierTitle: dossierMap[m.dossierId]?.title ?? null,
    isPrimary: m.isPrimary,
    addedById: m.addedById,
    addedByName: m.addedById != null ? userMap[m.addedById]?.name ?? "Unknown" : null,
    addedAt: m.addedAt?.toISOString() ?? null,
  })));
});

router.post("/protocols/:id/dossiers", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { dossierId, isPrimary } = req.body as { dossierId?: number; isPrimary?: boolean };
  if (!dossierId) { res.status(400).json({ error: "dossierId è obbligatorio" }); return; }
  const [p] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, id)).limit(1);
  if (!p) { res.status(404).json({ error: "Protocollo non trovato" }); return; }
  const [dossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, Number(dossierId))).limit(1);
  if (!dossier) { res.status(404).json({ error: "Fascicolo non trovato" }); return; }

  const did = Number(dossierId);
  await db.transaction(async (tx) => {
    // Legacy protocols may have protocols.dossierId set with no junction rows;
    // materialize that filing first so primary computation below is accurate.
    await materializeLegacyMembership(tx, p);
    // The first fascicolo a protocol is filed into must always be primary,
    // so protocols.dossierId and the junction never desync (zero-primary state).
    const [existingPrimary] = await tx.select().from(protocolDossiersTable)
      .where(and(eq(protocolDossiersTable.protocolId, id), eq(protocolDossiersTable.isPrimary, true))).limit(1);
    const makePrimary = isPrimary === true || !existingPrimary;

    if (makePrimary) {
      await tx.update(protocolDossiersTable).set({ isPrimary: false }).where(eq(protocolDossiersTable.protocolId, id));
      await tx.insert(protocolDossiersTable)
        .values({ protocolId: id, dossierId: did, isPrimary: true, addedById: req.currentUserId! })
        .onConflictDoUpdate({ target: [protocolDossiersTable.protocolId, protocolDossiersTable.dossierId], set: { isPrimary: true } });
      await tx.update(protocolsTable).set({ dossierId: did }).where(eq(protocolsTable.id, id));
    } else {
      await tx.insert(protocolDossiersTable)
        .values({ protocolId: id, dossierId: did, isPrimary: false, addedById: req.currentUserId! })
        .onConflictDoNothing({ target: [protocolDossiersTable.protocolId, protocolDossiersTable.dossierId] });
    }
  });

  const isNowPrimary = isPrimary === true || !p.dossierId;
  await logActivity(id, "protocol_filed", `Protocollo ${p.number} archiviato nel fascicolo ${dossier.code}${isNowPrimary ? " (primario)" : ""}`, req.currentUserId!);
  await triggerDossierWorkflows(Number(dossierId), "protocol", id);

  res.status(201).json({ ok: true });
});

router.delete("/protocols/:id/dossiers/:dossierId", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const dossierId = Number(req.params.dossierId);
  const [p] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, id)).limit(1);
  if (!p) { res.status(404).json({ error: "Protocollo non trovato" }); return; }

  let removed = false;
  await db.transaction(async (tx) => {
    // A legacy protocol may carry its filing only in protocols.dossierId;
    // materialize it as a junction row so it can actually be removed here.
    await materializeLegacyMembership(tx, p);
    const [membership] = await tx.select().from(protocolDossiersTable)
      .where(and(eq(protocolDossiersTable.protocolId, id), eq(protocolDossiersTable.dossierId, dossierId))).limit(1);
    if (!membership) return;
    removed = true;

    await tx.delete(protocolDossiersTable)
      .where(and(eq(protocolDossiersTable.protocolId, id), eq(protocolDossiersTable.dossierId, dossierId)));

    // If we removed the primary, promote the oldest remaining membership (if any)
    if (membership.isPrimary) {
      const [next] = await tx.select().from(protocolDossiersTable)
        .where(eq(protocolDossiersTable.protocolId, id))
        .orderBy(protocolDossiersTable.addedAt).limit(1);
      if (next) {
        await tx.update(protocolDossiersTable).set({ isPrimary: true }).where(eq(protocolDossiersTable.id, next.id));
        await tx.update(protocolsTable).set({ dossierId: next.dossierId }).where(eq(protocolsTable.id, id));
      } else {
        await tx.update(protocolsTable).set({ dossierId: null }).where(eq(protocolsTable.id, id));
      }
    }
  });
  if (!removed) { res.status(404).json({ error: "Associazione non trovata" }); return; }

  const dossierMap = await getDossierMap();
  await logActivity(id, "protocol_unfiled", `Protocollo ${p.number} rimosso dal fascicolo ${dossierMap[dossierId]?.code ?? dossierId}`, req.currentUserId!);

  res.status(204).end();
});

async function logActivity(protocolId: number, type: string, description: string, userId: number) {
  await db.insert(activityLogTable).values({ type, description, userId, protocolId });
}

async function getUserMap() {
  const users = await db.select().from(usersTable);
  return Object.fromEntries(users.map((u) => [u.id, u]));
}
async function getDossierMap() {
  const dossiers = await db.select().from(dossiersTable);
  return Object.fromEntries(dossiers.map((d) => [d.id, d]));
}
async function getClassMap() {
  const cls = await db.select().from(classificationsTable);
  return Object.fromEntries(cls.map((c) => [c.id, c]));
}

function fmtProtocol(
  p: typeof protocolsTable.$inferSelect,
  userMap: Record<number, { name: string }>,
  dossierMap: Record<number, { title: string }>,
  classMap: Record<number, { code: string; title: string }>,
) {
  return {
    id: p.id,
    number: p.number,
    year: p.year,
    type: p.type,
    status: p.status,
    subject: p.subject,
    description: p.description,
    sender: p.sender,
    recipients: p.recipients,
    ccRecipients: p.ccRecipients,
    channel: p.channel,
    confidentiality: p.confidentiality,
    priority: p.priority,
    dossierId: p.dossierId,
    dossierTitle: p.dossierId ? (dossierMap[p.dossierId]?.title ?? null) : null,
    classificationId: p.classificationId,
    classificationCode: p.classificationId ? (classMap[p.classificationId]?.code ?? null) : null,
    classificationTitle: p.classificationId ? (classMap[p.classificationId]?.title ?? null) : null,
    documentId: p.documentId,
    assignedToId: p.assignedToId,
    assignedToName: p.assignedToId ? (userMap[p.assignedToId]?.name ?? null) : null,
    registeredById: p.registeredById,
    registeredByName: userMap[p.registeredById]?.name ?? "System",
    cancelledAt: p.cancelledAt?.toISOString() ?? null,
    cancelReason: p.cancelReason,
    notes: p.notes,
    driveFolder: p.driveFolder,
    registeredAt: p.registeredAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export default router;
