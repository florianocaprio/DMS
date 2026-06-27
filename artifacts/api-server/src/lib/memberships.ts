import { db, protocolDossiersTable, protocolsTable, documentDossiersTable, documentsTable } from "@workspace/db";
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

export type DocumentMembership = { documentId: number; dossierId: number; isHome: boolean };

/**
 * Returns the effective document↔dossier memberships, merging each document's
 * "home" dossier (`documents.dossierId`) with the `document_dossiers` junction
 * (extra copies). A document's home is always included; junction rows add
 * further memberships. Deduplicated by (documentId, dossierId).
 */
export async function getEffectiveDocumentMemberships(): Promise<DocumentMembership[]> {
  const docs = await db.select({ id: documentsTable.id, dossierId: documentsTable.dossierId }).from(documentsTable);
  const junction = await db.select().from(documentDossiersTable);

  const seen = new Set<string>();
  const result: DocumentMembership[] = [];
  for (const d of docs) {
    if (d.dossierId != null) {
      const key = `${d.id}:${d.dossierId}`;
      seen.add(key);
      result.push({ documentId: d.id, dossierId: d.dossierId, isHome: true });
    }
  }
  for (const m of junction) {
    const key = `${m.documentId}:${m.dossierId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ documentId: m.documentId, dossierId: m.dossierId, isHome: false });
  }
  return result;
}

/**
 * Map of documentId -> set of effective dossier ids (home ∪ junction copies).
 */
export async function getDocumentDossierSets(): Promise<Map<number, Set<number>>> {
  const memberships = await getEffectiveDocumentMemberships();
  const map = new Map<number, Set<number>>();
  for (const m of memberships) {
    let set = map.get(m.documentId);
    if (!set) {
      set = new Set<number>();
      map.set(m.documentId, set);
    }
    set.add(m.dossierId);
  }
  return map;
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
