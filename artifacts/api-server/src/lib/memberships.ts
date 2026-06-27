import { db, protocolDossiersTable, protocolsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type EffectiveMembership = {
  id: number | null;
  protocolId: number;
  dossierId: number;
  isPrimary: boolean;
  addedById: number | null;
  addedAt: Date | null;
};

/**
 * Returns the effective protocol↔dossier memberships, merging the
 * `protocol_dossiers` junction (the source of truth going forward) with a
 * backward-compatible fallback to the legacy `protocols.dossierId` column.
 *
 * A protocol that has ANY junction rows is represented solely by those rows
 * (its `dossierId` mirrors the primary, so it is already covered). A protocol
 * with no junction rows but a non-null `dossierId` yields a synthetic primary
 * membership, so legacy data never disappears from dossier views/counts/filters.
 */
export async function getEffectiveMemberships(): Promise<EffectiveMembership[]> {
  const junction = await db.select().from(protocolDossiersTable);
  const withJunction = new Set(junction.map((m) => m.protocolId));

  const result: EffectiveMembership[] = junction.map((m) => ({
    id: m.id,
    protocolId: m.protocolId,
    dossierId: m.dossierId,
    isPrimary: m.isPrimary,
    addedById: m.addedById,
    addedAt: m.addedAt,
  }));

  const legacy = await db
    .select({ id: protocolsTable.id, dossierId: protocolsTable.dossierId })
    .from(protocolsTable);
  for (const p of legacy) {
    if (p.dossierId != null && !withJunction.has(p.id)) {
      result.push({ id: null, protocolId: p.id, dossierId: p.dossierId, isPrimary: true, addedById: null, addedAt: null });
    }
  }
  return result;
}

/**
 * Ensures the junction is authoritative for a protocol before mutating its
 * memberships. A legacy protocol may have `protocols.dossierId` set with no
 * junction rows; this materializes that legacy filing as a real primary
 * membership (in-transaction) so add/remove/primary logic operates on a
 * consistent junction. No-op when junction rows already exist or there is no
 * legacy dossierId.
 */
export async function materializeLegacyMembership(
  tx: Tx,
  protocol: { id: number; dossierId: number | null; registeredById: number | null },
): Promise<void> {
  if (protocol.dossierId == null) return;
  const existing = await tx
    .select({ id: protocolDossiersTable.id })
    .from(protocolDossiersTable)
    .where(eq(protocolDossiersTable.protocolId, protocol.id))
    .limit(1);
  if (existing.length > 0) return;
  await tx
    .insert(protocolDossiersTable)
    .values({ protocolId: protocol.id, dossierId: protocol.dossierId, isPrimary: true, addedById: protocol.registeredById ?? 1 })
    .onConflictDoNothing({ target: [protocolDossiersTable.protocolId, protocolDossiersTable.dossierId] });
}
