/**
 * protocolXml.ts
 * Builds the authoritative XML snapshot of a protocol and its history.
 * Also provides a parser for the recovery procedure.
 */
import { db } from "@workspace/db";
import {
  protocolsTable, activityLogTable, fileAttachmentsTable, usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import type { InsertProtocol } from "@workspace/db";

// ── XML helpers ────────────────────────────────────────────────────────────

function esc(v: string | null | undefined): string {
  if (v == null) return "";
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isoDate(d: Date | null | undefined): string {
  return d ? d.toISOString() : "";
}

const TYPE_IT: Record<string, string> = {
  incoming: "Entrata", outgoing: "Uscita", internal: "Interno", reserved: "Riservato",
};
const STATUS_IT: Record<string, string> = {
  registered: "Registrato", in_progress: "In lavorazione",
  completed: "Completato", cancelled: "Annullato",
};

// ── Builder ────────────────────────────────────────────────────────────────

/**
 * Fetches all data for a protocol from the DB and returns a formatted XML string.
 * This file is uploaded to Drive as `metadati.xml` inside the protocol folder
 * and serves as the single source of truth for the recovery procedure.
 */
export async function buildProtocolXml(protocolId: number): Promise<string> {
  const [protocol] = await db
    .select()
    .from(protocolsTable)
    .where(eq(protocolsTable.id, protocolId));

  if (!protocol) throw new Error(`Protocol ${protocolId} not found`);

  const [registeredBy] = protocol.registeredById
    ? await db.select({ name: usersTable.name, email: usersTable.email })
        .from(usersTable).where(eq(usersTable.id, protocol.registeredById))
    : [null];

  const [assignedTo] = protocol.assignedToId
    ? await db.select({ name: usersTable.name, email: usersTable.email })
        .from(usersTable).where(eq(usersTable.id, protocol.assignedToId))
    : [null];

  const activities = await db
    .select({
      id: activityLogTable.id,
      type: activityLogTable.type,
      description: activityLogTable.description,
      createdAt: activityLogTable.createdAt,
      userName: usersTable.name,
      userEmail: usersTable.email,
    })
    .from(activityLogTable)
    .leftJoin(usersTable, eq(activityLogTable.userId, usersTable.id))
    .where(eq(activityLogTable.protocolId, protocolId))
    .orderBy(activityLogTable.createdAt);

  const attachments = await db
    .select()
    .from(fileAttachmentsTable)
    .where(eq(fileAttachmentsTable.protocolId, protocolId))
    .orderBy(fileAttachmentsTable.createdAt);

  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<!-- ProtocolloDigitale — metadati protocollo -->`);
  lines.push(`<!-- Generato: ${new Date().toISOString()} -->`);
  lines.push(`<protocollo>`);

  // ── metadati ──
  lines.push(`  <metadati>`);
  lines.push(`    <id>${protocol.id}</id>`);
  lines.push(`    <numero>${esc(protocol.number)}</numero>`);
  lines.push(`    <anno>${protocol.year}</anno>`);
  lines.push(`    <tipo>${esc(TYPE_IT[protocol.type] ?? protocol.type)}</tipo>`);
  lines.push(`    <tipoEn>${esc(protocol.type)}</tipoEn>`);
  lines.push(`    <stato>${esc(STATUS_IT[protocol.status] ?? protocol.status)}</stato>`);
  lines.push(`    <statoEn>${esc(protocol.status)}</statoEn>`);
  lines.push(`    <oggetto>${esc(protocol.subject)}</oggetto>`);
  if (protocol.description) lines.push(`    <descrizione>${esc(protocol.description)}</descrizione>`);
  if (protocol.sender)      lines.push(`    <mittente>${esc(protocol.sender)}</mittente>`);

  if (protocol.recipients?.length) {
    lines.push(`    <destinatari>`);
    for (const r of protocol.recipients) lines.push(`      <destinatario>${esc(r)}</destinatario>`);
    lines.push(`    </destinatari>`);
  } else {
    lines.push(`    <destinatari/>`);
  }

  if (protocol.ccRecipients?.length) {
    lines.push(`    <cc>`);
    for (const r of protocol.ccRecipients) lines.push(`      <destinatario>${esc(r)}</destinatario>`);
    lines.push(`    </cc>`);
  }

  if (protocol.channel) lines.push(`    <canale>${esc(protocol.channel)}</canale>`);
  lines.push(`    <confidenzialita>${esc(protocol.confidentiality)}</confidenzialita>`);
  lines.push(`    <priorita>${esc(protocol.priority)}</priorita>`);
  if (protocol.notes)        lines.push(`    <note>${esc(protocol.notes)}</note>`);
  if (protocol.cancelReason) lines.push(`    <motivoAnnullamento>${esc(protocol.cancelReason)}</motivoAnnullamento>`);

  lines.push(`    <registratoDa>`);
  lines.push(`      <nome>${esc(registeredBy?.name ?? "")}</nome>`);
  lines.push(`      <email>${esc(registeredBy?.email ?? "")}</email>`);
  lines.push(`    </registratoDa>`);
  lines.push(`    <registratoIl>${isoDate(protocol.registeredAt)}</registratoIl>`);

  if (assignedTo) {
    lines.push(`    <assegnatoA>`);
    lines.push(`      <nome>${esc(assignedTo.name)}</nome>`);
    lines.push(`      <email>${esc(assignedTo.email)}</email>`);
    lines.push(`    </assegnatoA>`);
  }

  lines.push(`    <creatoIl>${isoDate(protocol.createdAt)}</creatoIl>`);
  lines.push(`    <aggiornatoIl>${isoDate(protocol.updatedAt)}</aggiornatoIl>`);
  if (protocol.cancelledAt) lines.push(`    <annullatoIl>${isoDate(protocol.cancelledAt)}</annullatoIl>`);
  if (protocol.driveFolder) lines.push(`    <driveFolderId>${esc(protocol.driveFolder)}</driveFolderId>`);
  lines.push(`  </metadati>`);

  // ── allegati ──
  lines.push(`  <allegati totale="${attachments.length}">`);
  for (const a of attachments) {
    lines.push(`    <allegato id="${a.id}">`);
    lines.push(`      <nome>${esc(a.originalName)}</nome>`);
    lines.push(`      <mimeType>${esc(a.mimeType)}</mimeType>`);
    lines.push(`      <dimensioneBytes>${a.fileSize}</dimensioneBytes>`);
    lines.push(`      <percorsoInterno>${esc(a.objectPath)}</percorsoInterno>`);
    if (a.driveFileId)   lines.push(`      <driveFileId>${esc(a.driveFileId)}</driveFileId>`);
    if (a.driveViewLink) lines.push(`      <driveLink>${esc(a.driveViewLink)}</driveLink>`);
    lines.push(`      <caricatoIl>${isoDate(a.createdAt)}</caricatoIl>`);
    lines.push(`    </allegato>`);
  }
  lines.push(`  </allegati>`);

  // ── storico attività ──
  lines.push(`  <storicoAttivita totale="${activities.length}">`);
  for (const ev of activities) {
    lines.push(`    <evento id="${ev.id}">`);
    lines.push(`      <tipo>${esc(ev.type)}</tipo>`);
    lines.push(`      <descrizione>${esc(ev.description)}</descrizione>`);
    lines.push(`      <utente>${esc(ev.userName ?? "")}</utente>`);
    lines.push(`      <email>${esc(ev.userEmail ?? "")}</email>`);
    lines.push(`      <data>${isoDate(ev.createdAt)}</data>`);
    lines.push(`    </evento>`);
  }
  lines.push(`  </storicoAttivita>`);

  lines.push(`</protocollo>`);
  return lines.join("\n");
}

// ── Parser (for recovery) ──────────────────────────────────────────────────

function extractText(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  if (!m) return undefined;
  return m[1].trim()
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractAll(xml: string, outerTag: string, innerTag: string): string[] {
  const block = xml.match(new RegExp(`<${outerTag}[^>]*>([\\s\\S]*?)<\\/${outerTag}>`));
  if (!block) return [];
  const inner = block[1];
  return [...inner.matchAll(new RegExp(`<${innerTag}[^>]*>([\\s\\S]*?)<\\/${innerTag}>`, "g"))]
    .map(m => m[1].trim()
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'"));
}

export interface ParsedProtocol {
  number: string;
  year: number;
  type: string;
  status: string;
  subject: string;
  description?: string;
  sender?: string;
  recipients: string[];
  ccRecipients: string[];
  channel?: string;
  confidentiality: string;
  priority: string;
  notes?: string;
  cancelReason?: string;
  registeredAt?: Date;
  driveFolder?: string;
  registeredByName?: string;
  registeredByEmail?: string;
}

export interface ParsedAttachment {
  id: number;
  originalName: string;
  mimeType: string;
  fileSize: number;
  objectPath: string;
  driveFileId?: string;
  driveViewLink?: string;
  createdAt?: Date;
}

export interface ParsedActivity {
  id: number;
  type: string;
  description: string;
  userName?: string;
  userEmail?: string;
  createdAt?: Date;
}

export interface ParsedProtocolXml {
  protocol: ParsedProtocol;
  attachments: ParsedAttachment[];
  activities: ParsedActivity[];
}

const TYPE_EN: Record<string, string> = {
  "Entrata": "incoming", "Uscita": "outgoing", "Interno": "internal", "Riservato": "reserved",
};

/**
 * Parses a `metadati.xml` string produced by buildProtocolXml.
 * Returns structured data suitable for reconstructing the DB.
 */
export function parseProtocolXml(xml: string): ParsedProtocolXml {
  const meta = xml.match(/<metadati>([\s\S]*?)<\/metadati>/)?.[1] ?? "";
  const attachmentsBlock = xml.match(/<allegati[^>]*>([\s\S]*?)<\/allegati>/)?.[1] ?? "";
  const activityBlock = xml.match(/<storicoAttivita[^>]*>([\s\S]*?)<\/storicoAttivita>/)?.[1] ?? "";

  const tipoEn = extractText(meta, "tipoEn");
  const statoEn = extractText(meta, "statoEn");
  const tipoIt = extractText(meta, "tipo");
  const statoIt = extractText(meta, "stato");
  const regDateStr = extractText(meta, "registratoIl");

  const protocol: ParsedProtocol = {
    number:          extractText(meta, "numero") ?? "",
    year:            parseInt(extractText(meta, "anno") ?? "0", 10) || new Date().getFullYear(),
    type:            tipoEn ?? TYPE_EN[tipoIt ?? ""] ?? "incoming",
    status:          statoEn ?? statoIt ?? "registered",
    subject:         extractText(meta, "oggetto") ?? "(senza oggetto)",
    description:     extractText(meta, "descrizione"),
    sender:          extractText(meta, "mittente"),
    recipients:      extractAll(xml, "destinatari", "destinatario"),
    ccRecipients:    extractAll(xml, "cc", "destinatario"),
    channel:         extractText(meta, "canale"),
    confidentiality: extractText(meta, "confidenzialita") ?? "normal",
    priority:        extractText(meta, "priorita") ?? "normal",
    notes:           extractText(meta, "note"),
    cancelReason:    extractText(meta, "motivoAnnullamento"),
    registeredAt:    regDateStr ? new Date(regDateStr) : undefined,
    driveFolder:     extractText(meta, "driveFolderId"),
    registeredByName:  extractText(meta, "registratoDa") ? extractText(
      meta.match(/<registratoDa>([\s\S]*?)<\/registratoDa>/)?.[1] ?? "", "nome"
    ) : undefined,
    registeredByEmail: extractText(meta, "registratoDa") ? extractText(
      meta.match(/<registratoDa>([\s\S]*?)<\/registratoDa>/)?.[1] ?? "", "email"
    ) : undefined,
  };

  // Parse attachments
  const attachments: ParsedAttachment[] = [];
  for (const m of attachmentsBlock.matchAll(/<allegato id="(\d+)">([\s\S]*?)<\/allegato>/g)) {
    const id = parseInt(m[1], 10);
    const block = m[2];
    attachments.push({
      id,
      originalName: extractText(block, "nome") ?? "",
      mimeType:     extractText(block, "mimeType") ?? "application/octet-stream",
      fileSize:     parseInt(extractText(block, "dimensioneBytes") ?? "0", 10),
      objectPath:   extractText(block, "percorsoInterno") ?? "",
      driveFileId:  extractText(block, "driveFileId"),
      driveViewLink: extractText(block, "driveLink"),
      createdAt:    (s => s ? new Date(s) : undefined)(extractText(block, "caricatoIl")),
    });
  }

  // Parse activities
  const activities: ParsedActivity[] = [];
  for (const m of activityBlock.matchAll(/<evento id="(\d+)">([\s\S]*?)<\/evento>/g)) {
    const id = parseInt(m[1], 10);
    const block = m[2];
    activities.push({
      id,
      type:        extractText(block, "tipo") ?? "",
      description: extractText(block, "descrizione") ?? "",
      userName:    extractText(block, "utente"),
      userEmail:   extractText(block, "email"),
      createdAt:   (s => s ? new Date(s) : undefined)(extractText(block, "data")),
    });
  }

  return { protocol, attachments, activities };
}
