import { db } from "@workspace/db";
import {
  dossierWorkflowRulesTable,
  dossierWorkflowInstancesTable,
  signatureRequestsTable,
  protocolDossiersTable,
  documentDossiersTable,
  protocolsTable,
  documentsTable,
  dossiersTable,
  usersTable,
  type CcRuleConfig,
  type ApprovalRuleConfig,
  type SignatureRuleConfig,
  type MoveCopyRuleConfig,
  type InstanceParticipant,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";
import { sendMail } from "./mailer";

export type TargetType = "document" | "protocol";

function mkParticipants(userIds: number[]): InstanceParticipant[] {
  return userIds.map((userId) => ({ userId, status: "pending", actedAt: null, note: null }));
}

interface TargetInfo {
  label: string;
  subject: string | null;
  description: string | null;
}

async function getTargetInfo(targetType: TargetType, targetId: number): Promise<TargetInfo | null> {
  if (targetType === "protocol") {
    const [p] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, targetId)).limit(1);
    if (!p) return null;
    return { label: `Protocollo ${p.number}`, subject: p.subject, description: p.description };
  }
  const [d] = await db.select().from(documentsTable).where(eq(documentsTable.id, targetId)).limit(1);
  if (!d) return null;
  return { label: `Documento "${d.title}"`, subject: d.subject, description: d.description };
}

async function emailsForUsers(userIds: number[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const users = await db.select().from(usersTable);
  const map = new Map(users.map((u) => [u.id, u.email]));
  return userIds.map((id) => map.get(id)).filter((e): e is string => !!e && e.includes("@"));
}

function composeBody(intro: string, info: TargetInfo, action: string): string {
  const lines = [
    intro,
    "",
    info.label,
    ...(info.subject ? [`Oggetto: ${info.subject}`] : []),
    ...(info.description ? [`Contenuto: ${info.description}`] : []),
    "",
    action,
    "",
    "— ProtocolloDigitale (notifica automatica)",
  ];
  return lines.join("\n");
}

/**
 * Sends a notification email for a workflow instance. Recipients are the
 * internal participants' emails plus any free-form notifyEmails from the rule.
 * Failures are logged but never thrown — email must never break the trigger.
 */
async function notifyByEmail(
  kind: "cc" | "approval" | "signature",
  targetType: TargetType,
  targetId: number,
  userIds: number[],
  notifyEmails: string[],
): Promise<void> {
  try {
    const info = await getTargetInfo(targetType, targetId);
    if (!info) return;
    const userEmails = await emailsForUsers(userIds);
    const extra = (notifyEmails ?? []).filter((e) => e && e.includes("@"));
    const to = Array.from(new Set([...userEmails, ...extra]));
    if (to.length === 0) return;

    let subject: string;
    let body: string;
    if (kind === "cc") {
      subject = `[Per conoscenza] ${info.label}`;
      body = composeBody(
        "Ti viene inviato per conoscenza il seguente contenuto:",
        info,
        "Nessuna azione è richiesta.",
      );
    } else if (kind === "approval") {
      subject = `[Per competenza] ${info.label}`;
      body = composeBody(
        "Ti viene assegnato per competenza/approvazione il seguente contenuto:",
        info,
        "Accedi a ProtocolloDigitale per approvare o rifiutare.",
      );
    } else {
      subject = `[Per firma] ${info.label}`;
      body = composeBody(
        "Ti viene richiesta la firma sul seguente contenuto:",
        info,
        "Accedi alla sezione Firme di ProtocolloDigitale per firmare.",
      );
    }
    await sendMail({ to, subject, text: body });
  } catch (err) {
    logger.error({ err, kind, targetType, targetId }, "notifyByEmail failed");
  }
}

/**
 * MOVE: relocate a protocol's primary filing from the source dossier to the
 * target dossier. Removes the source membership and makes the target the
 * primary, keeping protocols.dossierId and the junction atomic (one-primary
 * invariant). No-op if target === source.
 */
async function moveProtocol(protocolId: number, sourceDossierId: number, targetDossierId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(protocolsTable).where(eq(protocolsTable.id, protocolId)).limit(1);
    if (!p) return;
    // Materialize a legacy filing so the junction is authoritative.
    const existing = await tx.select({ id: protocolDossiersTable.id }).from(protocolDossiersTable).where(eq(protocolDossiersTable.protocolId, protocolId)).limit(1);
    if (existing.length === 0 && p.dossierId != null) {
      await tx.insert(protocolDossiersTable)
        .values({ protocolId, dossierId: p.dossierId, isPrimary: true, addedById: p.registeredById ?? 1 })
        .onConflictDoNothing({ target: [protocolDossiersTable.protocolId, protocolDossiersTable.dossierId] });
    }
    // Remove the source membership, then promote target as the sole primary.
    await tx.delete(protocolDossiersTable).where(and(eq(protocolDossiersTable.protocolId, protocolId), eq(protocolDossiersTable.dossierId, sourceDossierId)));
    await tx.update(protocolDossiersTable).set({ isPrimary: false }).where(eq(protocolDossiersTable.protocolId, protocolId));
    await tx.insert(protocolDossiersTable)
      .values({ protocolId, dossierId: targetDossierId, isPrimary: true, addedById: p.registeredById ?? 1 })
      .onConflictDoUpdate({ target: [protocolDossiersTable.protocolId, protocolDossiersTable.dossierId], set: { isPrimary: true } });
    await tx.update(protocolsTable).set({ dossierId: targetDossierId }).where(eq(protocolsTable.id, protocolId));
  });
}

/** COPY: add a non-primary protocol membership to the target dossier. */
async function copyProtocol(protocolId: number, targetDossierId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(protocolsTable).where(eq(protocolsTable.id, protocolId)).limit(1);
    if (!p) return;
    const existing = await tx.select({ id: protocolDossiersTable.id }).from(protocolDossiersTable).where(eq(protocolDossiersTable.protocolId, protocolId)).limit(1);
    if (existing.length === 0 && p.dossierId != null) {
      await tx.insert(protocolDossiersTable)
        .values({ protocolId, dossierId: p.dossierId, isPrimary: true, addedById: p.registeredById ?? 1 })
        .onConflictDoNothing({ target: [protocolDossiersTable.protocolId, protocolDossiersTable.dossierId] });
    }
    await tx.insert(protocolDossiersTable)
      .values({ protocolId, dossierId: targetDossierId, isPrimary: false, addedById: p.registeredById ?? 1 })
      .onConflictDoNothing({ target: [protocolDossiersTable.protocolId, protocolDossiersTable.dossierId] });
  });
}

/**
 * MOVE: relocate a document's "home" dossier to the target. Because reads use
 * effective membership (home ∪ junction), we must also drop any source junction
 * membership (e.g. left by a prior COPY) so the document no longer appears in the
 * source fascicolo, and clean a redundant target junction row. Atomic.
 */
async function moveDocument(documentId: number, sourceDossierId: number, targetDossierId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(documentsTable).set({ dossierId: targetDossierId }).where(eq(documentsTable.id, documentId));
    // Remove source junction membership so it disappears from the source dossier.
    await tx.delete(documentDossiersTable).where(and(eq(documentDossiersTable.documentId, documentId), eq(documentDossiersTable.dossierId, sourceDossierId)));
    // Target is now the home; a junction row to it would be redundant.
    await tx.delete(documentDossiersTable).where(and(eq(documentDossiersTable.documentId, documentId), eq(documentDossiersTable.dossierId, targetDossierId)));
  });
}

/** COPY: add an extra document membership (junction) to the target dossier. */
async function copyDocument(documentId: number, targetDossierId: number): Promise<void> {
  await db.insert(documentDossiersTable)
    .values({ documentId, dossierId: targetDossierId, isPrimary: false, addedById: 1 })
    .onConflictDoNothing({ target: [documentDossiersTable.documentId, documentDossiersTable.dossierId] });
}

/**
 * Trigger all active workflow rules attached to a dossier when an item
 * (document or protocol) is added to it. Creates instances for CC, approval and
 * signature rules (and a real signature request for documents), auto-executes
 * move/copy rules, and sends notification emails for cc/approval/signature.
 * Idempotent: skips a rule if an instance already exists for the same target.
 */
export async function triggerDossierWorkflows(
  dossierId: number,
  targetType: TargetType,
  targetId: number,
): Promise<void> {
  if (!dossierId) return;

  const rules = await db
    .select()
    .from(dossierWorkflowRulesTable)
    .where(and(eq(dossierWorkflowRulesTable.dossierId, dossierId), eq(dossierWorkflowRulesTable.isActive, true)));

  for (const rule of rules) {
    const applies = rule.appliesTo === "both" || rule.appliesTo === `${targetType}s`;
    if (!applies) continue;

    // Signature rules only make sense on documents (protocols have no signable file).
    if (rule.type === "signature" && targetType !== "document") continue;

    // Idempotency guard: do not create a duplicate instance for the same target.
    const existing = await db
      .select()
      .from(dossierWorkflowInstancesTable)
      .where(
        and(
          eq(dossierWorkflowInstancesTable.ruleId, rule.id),
          eq(dossierWorkflowInstancesTable.targetType, targetType),
          eq(dossierWorkflowInstancesTable.targetId, targetId),
        ),
      )
      .limit(1);
    if (existing.length > 0) continue;

    if (rule.type === "cc") {
      const cfg = (rule.config ?? {}) as CcRuleConfig;
      const userIds = cfg.userIds ?? [];
      const notifyEmails = cfg.notifyEmails ?? [];
      if (userIds.length === 0 && notifyEmails.length === 0) continue;
      await db.insert(dossierWorkflowInstancesTable).values({
        ruleId: rule.id,
        dossierId,
        type: "cc",
        targetType,
        targetId,
        status: "pending",
        participants: mkParticipants(userIds),
      });
      await notifyByEmail("cc", targetType, targetId, userIds, notifyEmails);
    } else if (rule.type === "approval") {
      const cfg = (rule.config ?? {}) as ApprovalRuleConfig;
      if (!cfg.approverId) continue;
      await db.insert(dossierWorkflowInstancesTable).values({
        ruleId: rule.id,
        dossierId,
        type: "approval",
        targetType,
        targetId,
        status: "pending",
        participants: mkParticipants([cfg.approverId]),
      });
      await notifyByEmail("approval", targetType, targetId, [cfg.approverId], cfg.notifyEmails ?? []);
    } else if (rule.type === "signature") {
      const cfg = (rule.config ?? {}) as SignatureRuleConfig;
      const signatoryIds = cfg.signatoryIds ?? [];
      if (signatoryIds.length === 0) continue;
      const signatories = signatoryIds.map((userId, i) => ({
        userId,
        order: i + 1,
        status: "pending",
        signedAt: null,
        note: null,
      }));
      const [sr] = await db
        .insert(signatureRequestsTable)
        .values({
          documentId: targetId,
          type: "internal",
          signatories,
          requireAll: cfg.requireAll ?? true,
          requestedById: 1,
          note: `Richiesta automatica dal workflow del fascicolo: ${rule.name}`,
        })
        .returning();
      await db.insert(dossierWorkflowInstancesTable).values({
        ruleId: rule.id,
        dossierId,
        type: "signature",
        targetType,
        targetId,
        status: "pending",
        participants: mkParticipants(signatoryIds),
        signatureRequestId: sr?.id ?? null,
      });
      await notifyByEmail("signature", targetType, targetId, signatoryIds, cfg.notifyEmails ?? []);
    } else if (rule.type === "move" || rule.type === "copy") {
      const cfg = (rule.config ?? {}) as MoveCopyRuleConfig;
      const target = Number(cfg.targetDossierId);
      // Guard: valid, existing target that differs from the source dossier.
      if (!Number.isInteger(target) || target <= 0 || target === dossierId) continue;
      const [exists] = await db.select({ id: dossiersTable.id }).from(dossiersTable).where(eq(dossiersTable.id, target)).limit(1);
      if (!exists) continue;

      try {
        if (rule.type === "move") {
          if (targetType === "protocol") await moveProtocol(targetId, dossierId, target);
          else await moveDocument(targetId, dossierId, target);
        } else {
          if (targetType === "protocol") await copyProtocol(targetId, target);
          else await copyDocument(targetId, target);
        }
      } catch (err) {
        logger.error({ err, ruleId: rule.id, type: rule.type, targetType, targetId, target }, "move/copy rule execution failed");
        continue;
      }

      await db.insert(dossierWorkflowInstancesTable).values({
        ruleId: rule.id,
        dossierId,
        type: rule.type,
        targetType,
        targetId,
        status: "completed",
        participants: [],
        resolvedAt: new Date(),
      });
    }
  }
}
