/**
 * Sistema di integrità protocolli.
 *
 * Calcola un'impronta SHA-256 su:
 *   - tutti i campi significativi del protocollo
 *   - metadati di ogni allegato
 *   - contenuto binario di ogni allegato (hash individuale)
 *
 * Conserva l'hash nel DB (UPSERT). La verifica confronta l'hash ricalcolato
 * con quello memorizzato e segnala qualsiasi discrepanza.
 */

import { createHash } from "crypto";
import { db } from "@workspace/db";
import {
  protocolsTable,
  fileAttachmentsTable,
  protocolIntegrityTable,
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { downloadObjectAsBuffer } from "./googleDrive";
import type { Request } from "express";

// ── Tipi pubblici ─────────────────────────────────────────────────────────────

export interface FileHashEntry {
  attachmentId: number;
  originalName: string;
  mimeType: string;
  fileSize: number;
  objectPath: string;
  contentHash: string;
}

export interface ProtocolSnapshot {
  number: string;
  year: number;
  type: string;
  status: string;
  subject: string;
  description: string | null;
  sender: string | null;
  recipients: string[];
  ccRecipients: string[];
  notes: string | null;
  priority: string;
  confidentiality: string;
  registeredAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  attachments: FileHashEntry[];
}

export interface IntegrityResult {
  protocolId: number;
  protocolNumber: string;
  status: "valid" | "invalid" | "uncomputed" | "error";
  reason?: string;
  storedHash?: string;
  currentHash?: string;
  computedAt?: Date;
}

// ── Utilità ───────────────────────────────────────────────────────────────────

function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Serializzazione canonica: chiavi ordinate alfabeticamente a ogni livello.
 */
function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalize).join(",")}]`;
  const sorted = Object.keys(obj as Record<string, unknown>)
    .sort()
    .map(k => `${JSON.stringify(k)}:${canonicalize((obj as Record<string, unknown>)[k])}`);
  return `{${sorted.join(",")}}`;
}

// ── Hash di un singolo allegato ───────────────────────────────────────────────

async function hashAttachment(
  a: {
    id: number;
    originalName: string;
    mimeType: string;
    fileSize: number;
    objectPath: string;
  },
): Promise<FileHashEntry> {
  let contentHash = "unavailable";
  try {
    const buf = await downloadObjectAsBuffer(a.objectPath);
    contentHash = sha256Buffer(buf);
  } catch {
    // file non disponibile nello storage — annotiamo il fatto
    contentHash = "unavailable";
  }
  return {
    attachmentId: a.id,
    originalName: a.originalName,
    mimeType: a.mimeType,
    fileSize: a.fileSize,
    objectPath: a.objectPath,
    contentHash,
  };
}

// ── Costruisce lo snapshot canonico di un protocollo ─────────────────────────

async function buildSnapshot(protocolId: number): Promise<{
  protocol: typeof protocolsTable.$inferSelect;
  snapshot: ProtocolSnapshot;
  fileHashes: Record<number, string>;
}> {
  const [protocol] = await db
    .select()
    .from(protocolsTable)
    .where(eq(protocolsTable.id, protocolId));

  if (!protocol) throw new Error(`Protocollo ${protocolId} non trovato`);

  const attachments = await db
    .select()
    .from(fileAttachmentsTable)
    .where(eq(fileAttachmentsTable.protocolId, protocolId));

  // Hash dei file in parallelo (max 10 alla volta per non saturare le connessioni)
  const fileEntries: FileHashEntry[] = [];
  const chunkSize = 10;
  for (let i = 0; i < attachments.length; i += chunkSize) {
    const chunk = attachments.slice(i, i + chunkSize);
    const hashes = await Promise.all(chunk.map(hashAttachment));
    fileEntries.push(...hashes);
  }

  // Ordine deterministico per gli allegati
  fileEntries.sort((a, b) => a.attachmentId - b.attachmentId);

  const snapshot: ProtocolSnapshot = {
    number: protocol.number,
    year: protocol.year,
    type: protocol.type,
    status: protocol.status,
    subject: protocol.subject,
    description: protocol.description ?? null,
    sender: protocol.sender ?? null,
    recipients: [...(protocol.recipients ?? [])].sort(),
    ccRecipients: [...(protocol.ccRecipients ?? [])].sort(),
    notes: protocol.notes ?? null,
    priority: protocol.priority,
    confidentiality: protocol.confidentiality,
    registeredAt: protocol.registeredAt ? new Date(protocol.registeredAt).toISOString() : "",
    cancelledAt: protocol.cancelledAt ? new Date(protocol.cancelledAt).toISOString() : null,
    cancelReason: protocol.cancelReason ?? null,
    attachments: fileEntries,
  };

  const fileHashes: Record<number, string> = {};
  for (const fe of fileEntries) fileHashes[fe.attachmentId] = fe.contentHash;

  return { protocol, snapshot, fileHashes };
}

// ── Calcola e persiste l'impronta ─────────────────────────────────────────────

export async function computeProtocolIntegrity(
  protocolId: number,
  triggeredBy: string = "manual",
): Promise<{ hash: string; snapshot: ProtocolSnapshot }> {
  const { snapshot, fileHashes } = await buildSnapshot(protocolId);
  const hash = sha256(canonicalize(snapshot));

  await db
    .insert(protocolIntegrityTable)
    .values({
      protocolId,
      integrityHash: hash,
      fileHashes: fileHashes as Record<string, unknown>,
      protocolSnapshot: snapshot as unknown as Record<string, unknown>,
      computedAt: new Date(),
      triggeredBy,
    })
    .onConflictDoUpdate({
      target: protocolIntegrityTable.protocolId,
      set: {
        integrityHash: hash,
        fileHashes: fileHashes as Record<string, unknown>,
        protocolSnapshot: snapshot as unknown as Record<string, unknown>,
        computedAt: new Date(),
        triggeredBy,
      },
    });

  return { hash, snapshot };
}

// ── Verifica un singolo protocollo ────────────────────────────────────────────

export async function verifyProtocolIntegrity(protocolId: number): Promise<IntegrityResult> {
  const [protocol] = await db
    .select({ id: protocolsTable.id, number: protocolsTable.number })
    .from(protocolsTable)
    .where(eq(protocolsTable.id, protocolId));

  if (!protocol) {
    return { protocolId, protocolNumber: "?", status: "error", reason: "Protocollo non trovato" };
  }

  const [stored] = await db
    .select()
    .from(protocolIntegrityTable)
    .where(eq(protocolIntegrityTable.protocolId, protocolId));

  if (!stored) {
    return {
      protocolId,
      protocolNumber: protocol.number,
      status: "uncomputed",
      reason: "Nessuna impronta registrata — eseguire prima il calcolo",
    };
  }

  try {
    const { snapshot, fileHashes } = await buildSnapshot(protocolId);
    const currentHash = sha256(canonicalize(snapshot));

    if (currentHash === stored.integrityHash) {
      return {
        protocolId,
        protocolNumber: protocol.number,
        status: "valid",
        storedHash: stored.integrityHash,
        currentHash,
        computedAt: stored.computedAt,
      };
    }

    // Trova le differenze
    const reasons: string[] = [];

    // Confronta i metadati del protocollo (senza allegati per chiarezza)
    const storedSnap = stored.protocolSnapshot as Partial<ProtocolSnapshot>;
    const metaFields: (keyof Omit<ProtocolSnapshot, "attachments">)[] = [
      "number", "year", "type", "status", "subject", "description",
      "sender", "recipients", "ccRecipients", "notes", "priority",
      "confidentiality", "registeredAt", "cancelledAt", "cancelReason",
    ];
    for (const field of metaFields) {
      const sv = canonicalize(storedSnap[field]);
      const cv = canonicalize(snapshot[field]);
      if (sv !== cv) reasons.push(`campo '${field}' modificato`);
    }

    // Confronta hash dei file
    const storedFileHashes = stored.fileHashes as Record<string, string>;
    for (const [idStr, ch] of Object.entries(fileHashes)) {
      const sh = storedFileHashes[idStr];
      if (!sh) reasons.push(`allegato #${idStr}: nuovo (non presente all'impronta)`);
      else if (sh !== ch) reasons.push(`allegato #${idStr}: contenuto modificato`);
    }
    for (const idStr of Object.keys(storedFileHashes)) {
      if (!(idStr in fileHashes)) reasons.push(`allegato #${idStr}: rimosso`);
    }

    return {
      protocolId,
      protocolNumber: protocol.number,
      status: "invalid",
      reason: reasons.join("; ") || "hash non corrispondente",
      storedHash: stored.integrityHash,
      currentHash,
      computedAt: stored.computedAt,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      protocolId,
      protocolNumber: protocol.number,
      status: "error",
      reason: `Errore durante la verifica: ${msg}`,
    };
  }
}

// ── Verifica tutti i protocolli ───────────────────────────────────────────────

export async function verifyAllProtocols(
  log?: Pick<Request, "log">,
): Promise<{ results: IntegrityResult[]; total: number; valid: number; invalid: number; skipped: number }> {
  const allProtocols = await db
    .select({ id: protocolsTable.id, number: protocolsTable.number })
    .from(protocolsTable);

  const results: IntegrityResult[] = [];
  let valid = 0, invalid = 0, skipped = 0;

  for (const p of allProtocols) {
    try {
      const r = await verifyProtocolIntegrity(p.id);
      results.push(r);
      if (r.status === "valid") valid++;
      else if (r.status === "uncomputed") skipped++;
      else if (r.status === "invalid") invalid++;
      else invalid++;
    } catch (err) {
      log?.log.error({ err, protocolId: p.id }, "integrity verify error");
      results.push({ protocolId: p.id, protocolNumber: p.number, status: "error", reason: String(err) });
      invalid++;
    }
  }

  return { results, total: allProtocols.length, valid, invalid, skipped };
}
