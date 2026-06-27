import { db } from "@workspace/db";
import {
  dossierWorkflowRulesTable,
  dossierWorkflowInstancesTable,
  signatureRequestsTable,
  type CcRuleConfig,
  type ApprovalRuleConfig,
  type SignatureRuleConfig,
  type InstanceParticipant,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";

export type TargetType = "document" | "protocol";

function mkParticipants(userIds: number[]): InstanceParticipant[] {
  return userIds.map((userId) => ({ userId, status: "pending", actedAt: null, note: null }));
}

/**
 * Trigger all active workflow rules attached to a dossier when an item
 * (document or protocol) is added to it. Creates instances for CC and approval
 * rules, and a real signature request (documents only) for signature rules.
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
      if (userIds.length === 0) continue;
      await db.insert(dossierWorkflowInstancesTable).values({
        ruleId: rule.id,
        dossierId,
        type: "cc",
        targetType,
        targetId,
        status: "pending",
        participants: mkParticipants(userIds),
      });
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
    }
  }
}
