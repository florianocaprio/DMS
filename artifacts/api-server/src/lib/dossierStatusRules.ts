import { db, dossiersTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

export type DossierStatus = "open" | "closed" | "archived";

export const DOSSIER_STATUSES: readonly DossierStatus[] = ["open", "closed", "archived"];

export const PROTOCOL_DOSSIER_CLOSED_MESSAGE =
  "Non è possibile associare protocolli a un fascicolo chiuso. Riaprire il fascicolo prima di procedere.";
export const DOCUMENT_DOSSIER_CLOSED_MESSAGE =
  "Non è possibile associare documenti a un fascicolo chiuso. Riaprire il fascicolo prima di procedere.";
export const ARCHIVED_DOSSIER_EDIT_MESSAGE = "Non è possibile modificare un fascicolo archiviato.";
export const ARCHIVED_DOSSIER_REOPEN_MESSAGE = "Un fascicolo archiviato non può essere riaperto.";
export const DEFAULT_DOSSIER_STATUS_MESSAGE =
  "Il fascicolo Archive di sistema non può essere chiuso o archiviato.";

type DossierRow = typeof dossiersTable.$inferSelect;

export function isDossierStatus(value: unknown): value is DossierStatus {
  return typeof value === "string" && DOSSIER_STATUSES.includes(value as DossierStatus);
}

export function canReopenDossier(role: string | null | undefined): boolean {
  return role === "admin" || role === "protocol_manager";
}

export function protocolAssociationError(dossier: Pick<DossierRow, "status">): string | null {
  if (dossier.status === "closed") return PROTOCOL_DOSSIER_CLOSED_MESSAGE;
  if (dossier.status === "archived") return "Non è possibile associare protocolli a un fascicolo archiviato.";
  return null;
}

export function documentAssociationError(dossier: Pick<DossierRow, "status">): string | null {
  if (dossier.status === "closed") return DOCUMENT_DOSSIER_CLOSED_MESSAGE;
  if (dossier.status === "archived") return "Non è possibile associare documenti a un fascicolo archiviato.";
  return null;
}

export function taskAssociationError(dossier: Pick<DossierRow, "status">): string | null {
  if (dossier.status === "closed") return "Non è possibile associare attività a un fascicolo chiuso.";
  if (dossier.status === "archived") return "Non è possibile associare attività a un fascicolo archiviato.";
  return null;
}

export function childDossierError(dossier: Pick<DossierRow, "status">): string | null {
  if (dossier.status === "closed") return "Non è possibile creare sotto-fascicoli in un fascicolo chiuso.";
  if (dossier.status === "archived") return "Non è possibile creare sotto-fascicoli in un fascicolo archiviato.";
  return null;
}

export function workflowRuleError(dossier: Pick<DossierRow, "status">): string | null {
  if (dossier.status === "closed") return "Non è possibile aggiungere workflow a un fascicolo chiuso.";
  if (dossier.status === "archived") return "Non è possibile aggiungere workflow a un fascicolo archiviato.";
  return null;
}

export async function loadDossierMap(ids: number[]): Promise<Map<number, DossierRow>> {
  const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
  if (uniqueIds.length === 0) return new Map();
  const rows = await db.select().from(dossiersTable).where(inArray(dossiersTable.id, uniqueIds));
  return new Map(rows.map((d) => [d.id, d]));
}

export function firstMissingDossierId(ids: number[], dossierMap: Map<number, DossierRow>): number | null {
  return ids.find((id) => !dossierMap.has(id)) ?? null;
}

export function firstAssociationError(
  ids: number[],
  dossierMap: Map<number, DossierRow>,
  errorFor: (dossier: DossierRow) => string | null,
): string | null {
  for (const id of ids) {
    const dossier = dossierMap.get(id);
    if (!dossier) continue;
    const error = errorFor(dossier);
    if (error) return error;
  }
  return null;
}
