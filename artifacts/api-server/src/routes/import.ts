import { Router } from "express";
import { db } from "@workspace/db";
import { protocolsTable } from "@workspace/db/schema";
import { eq, and, desc, like } from "drizzle-orm";
import { logger } from "../lib/logger";
import { requireAnyRole } from "../middleware/requireRole";

const router = Router();

router.use("/admin/import", requireAnyRole(["admin"]));

// ─── CSV parser (RFC 4180, supports quoted multi-line fields) ──────────────────
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    const row: string[] = [];
    let inRow = true;

    while (inRow && i < n) {
      let field = "";

      if (i < n && text[i] === '"') {
        i++; // skip opening quote
        while (i < n) {
          if (text[i] === '"') {
            if (i + 1 < n && text[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              i++; // skip closing quote
              break;
            }
          } else {
            field += text[i++];
          }
        }
      } else {
        while (i < n && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") {
          field += text[i++];
        }
      }

      row.push(field.trim());

      if (i < n && text[i] === ",") {
        i++;
      } else {
        inRow = false;
        if (i < n && text[i] === "\r") i++;
        if (i < n && text[i] === "\n") i++;
      }
    }

    if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sanitize(val: string): string {
  return val === "-" || val === "" ? "" : val.trim();
}

function detectType(circolazione: string): "incoming" | "outgoing" | "internal" {
  const c = circolazione.toLowerCase();
  if (c.includes("entrata")) return "incoming";
  if (c.includes("uscita")) return "outgoing";
  return "internal";
}

function typeCode(type: "incoming" | "outgoing" | "internal"): string {
  return type === "incoming" ? "E" : type === "outgoing" ? "U" : "I";
}

function splitRecipients(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

interface ParsedAttachment {
  filename: string;
  hash: string;
}

interface ParsedProtocol {
  originalNumber: string;
  date: Date;
  year: number;
  subject: string;
  description: string;
  sender: string;
  recipients: string[];
  ccRecipients: string[];
  ufficio: string;
  tipologia: string;
  operatore: string;
  sezione: string;
  circolazione: string;
  type: "incoming" | "outgoing" | "internal";
  attachments: ParsedAttachment[];
  originalStatus: string;
  note: string;
}

function parseProtocols(csvText: string): ParsedProtocol[] {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return [];

  // skip header row
  const dataRows = rows.slice(1);

  const byNumber = new Map<string, { header: string[]; attachments: ParsedAttachment[] }>();
  const order: string[] = [];

  for (const row of dataRows) {
    const numero = row[0] ?? "";
    const suffisso = row[1] ?? "";
    const filename = row[15] ?? "";
    const hash = row[17] ?? "";

    if (!numero) continue;

    if (suffisso === "-") {
      // Main protocol row
      if (!byNumber.has(numero)) {
        byNumber.set(numero, { header: row, attachments: [] });
        order.push(numero);
      }
    } else {
      // Attachment row
      const entry = byNumber.get(numero);
      if (entry && sanitize(filename)) {
        entry.attachments.push({ filename: sanitize(filename), hash: sanitize(hash) });
      }
    }
  }

  const protocols: ParsedProtocol[] = [];

  for (const num of order) {
    const entry = byNumber.get(num)!;
    const r = entry.header;

    const dateStr = sanitize(r[2] ?? "");
    const date = dateStr ? new Date(dateStr) : new Date();
    const year = isNaN(date.getFullYear()) ? new Date().getFullYear() : date.getFullYear();
    const circolazione = sanitize(r[13] ?? "");
    const type = detectType(circolazione);

    const parts: string[] = [];
    const ufficio = sanitize(r[9] ?? "");
    const tipologia = sanitize(r[10] ?? "");
    const operatore = sanitize(r[11] ?? "");
    const sezione = sanitize(r[14] ?? "");
    const originalStatus = sanitize(r[5] ?? "");

    parts.push(`[Importato da Regystrum] Numero originale: ${num}`);
    if (originalStatus) parts.push(`Stato originale: ${originalStatus}`);
    if (tipologia) parts.push(`Tipologia: ${tipologia}`);
    if (ufficio) parts.push(`Ufficio: ${ufficio}`);
    if (sezione) parts.push(`Sezione: ${sezione}`);
    if (operatore) parts.push(`Operatore: ${operatore}`);
    if (circolazione) parts.push(`Circolazione: ${circolazione}`);
    if (entry.attachments.length > 0) {
      parts.push(
        `Allegati (${entry.attachments.length}): ${entry.attachments.map(a => a.filename).join(", ")}`
      );
    }

    protocols.push({
      originalNumber: num,
      date,
      year,
      subject: sanitize(r[3] ?? "") || num,
      description: sanitize(r[4] ?? ""),
      sender: sanitize(r[6] ?? ""),
      recipients: splitRecipients(sanitize(r[8] ?? "")),
      ccRecipients: splitRecipients(sanitize(r[7] ?? "")),
      ufficio,
      tipologia,
      operatore,
      sezione,
      circolazione,
      type,
      attachments: entry.attachments,
      originalStatus,
      note: parts.join(" | "),
    });
  }

  return protocols;
}

// ─── POST /api/admin/import/preview ──────────────────────────────────────────
router.post("/admin/import/preview", async (req, res) => {
  try {
    const { csv } = req.body as { csv?: string };
    if (!csv || typeof csv !== "string") {
      res.status(400).json({ error: "Campo 'csv' mancante o non valido" });
      return;
    }

    const protocols = parseProtocols(csv);
    if (protocols.length === 0) {
      res.status(400).json({ error: "Nessun protocollo trovato nel file CSV" });
      return;
    }

    // Check conflicts (numbers already in DB)
    const existingNumbers = await db
      .select({ number: protocolsTable.number })
      .from(protocolsTable);
    const existingSet = new Set(existingNumbers.map(r => r.number));

    const conflicts = protocols
      .filter(p => existingSet.has(p.originalNumber))
      .map(p => p.originalNumber);

    const dates = protocols.map(p => p.date).filter(d => !isNaN(d.getTime()));
    const minDate = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
    const maxDate = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;

    const byType = {
      incoming: protocols.filter(p => p.type === "incoming").length,
      outgoing: protocols.filter(p => p.type === "outgoing").length,
      internal: protocols.filter(p => p.type === "internal").length,
    };

    const totalAttachments = protocols.reduce((acc, p) => acc + p.attachments.length, 0);

    res.json({
      total: protocols.length,
      totalAttachments,
      byType,
      conflicts,
      dateRange: { min: minDate, max: maxDate },
      sample: protocols.slice(0, 15).map(p => ({
        originalNumber: p.originalNumber,
        date: p.date,
        subject: p.subject,
        type: p.type,
        sender: p.sender,
        attachmentCount: p.attachments.length,
        originalStatus: p.originalStatus,
        isDuplicate: existingSet.has(p.originalNumber),
      })),
    });
  } catch (err) {
    logger.error({ err }, "import preview error");
    res.status(500).json({ error: "Errore durante l'analisi del CSV" });
  }
});

// ─── POST /api/admin/import/execute ──────────────────────────────────────────
router.post("/admin/import/execute", async (req, res) => {
  try {
    const {
      csv,
      keepOriginalNumbers = true,
      skipDuplicates = true,
    } = req.body as {
      csv?: string;
      keepOriginalNumbers?: boolean;
      skipDuplicates?: boolean;
    };

    if (!csv || typeof csv !== "string") {
      res.status(400).json({ error: "Campo 'csv' mancante o non valido" });
      return;
    }

    const protocols = parseProtocols(csv);
    if (protocols.length === 0) {
      res.status(400).json({ error: "Nessun protocollo trovato nel file CSV" });
      return;
    }

    // Load existing numbers for conflict check
    const existingRows = await db
      .select({ number: protocolsTable.number })
      .from(protocolsTable);
    const existingSet = new Set(existingRows.map(r => r.number));

    // For remap: compute next sequence per year+type
    const seqCounters = new Map<string, number>();

    if (!keepOriginalNumbers) {
      // Query max sequences currently in DB
      const allProtocols = await db
        .select({ number: protocolsTable.number, year: protocolsTable.year, type: protocolsTable.type })
        .from(protocolsTable);

      for (const p of allProtocols) {
        const key = `${p.year}-${p.type}`;
        const match = p.number.match(/(\d+)$/);
        const seq = match ? parseInt(match[1], 10) : 0;
        seqCounters.set(key, Math.max(seqCounters.get(key) ?? 0, seq));
      }
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const protocol of protocols) {
      try {
        // Conflict check
        if (skipDuplicates && existingSet.has(protocol.originalNumber)) {
          skipped++;
          continue;
        }

        let finalNumber: string;

        if (keepOriginalNumbers) {
          finalNumber = protocol.originalNumber;
        } else {
          const key = `${protocol.year}-${protocol.type}`;
          const next = (seqCounters.get(key) ?? 0) + 1;
          seqCounters.set(key, next);
          const code = typeCode(protocol.type);
          finalNumber = `AIM-${protocol.year}-${code}-${String(next).padStart(6, "0")}`;
        }

        await db.insert(protocolsTable).values({
          number: finalNumber,
          year: protocol.year,
          type: protocol.type,
          status: "imported",
          subject: protocol.subject || "(nessun oggetto)",
          description: protocol.description || null,
          sender: protocol.sender || null,
          recipients: protocol.recipients,
          ccRecipients: protocol.ccRecipients,
          notes: protocol.note,
          registeredById: req.currentUserId!,
          registeredAt: protocol.date,
          confidentiality: "normal",
          priority: "normal",
        });

        existingSet.add(finalNumber);
        imported++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${protocol.originalNumber}: ${msg}`);
        logger.error({ err, number: protocol.originalNumber }, "import row error");
      }
    }

    res.json({
      imported,
      skipped,
      errors: errors.slice(0, 20), // cap errors returned
      total: protocols.length,
    });
  } catch (err) {
    logger.error({ err }, "import execute error");
    res.status(500).json({ error: "Errore durante l'importazione" });
  }
});

export default router;
