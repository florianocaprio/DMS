/**
 * drive.ts — Admin routes for Google Drive management
 *
 * POST /api/admin/drive/sync-protocol/:id
 *   Force-regenerate metadati.xml for a single protocol and push all its
 *   attachments to Drive (idempotent — safe to call multiple times).
 *
 * POST /api/admin/drive/recover
 *   Walk the Archivio-DMS folder tree on Drive, read every metadati.xml,
 *   and reconstruct the protocols table from those files.
 *   Returns a detailed report of what was inserted, skipped, or failed.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { protocolsTable, fileAttachmentsTable, activityLogTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  getDriveSettings,
  findArchivioDmsFolder,
  listSubfolders,
  listFilesInFolder,
  downloadDriveFile,
} from "../lib/googleDrive";
import { parseProtocolXml, type ParsedProtocolXml } from "../lib/protocolXml";
import { resolveProtocolFolder, regenerateProtocolXml } from "./attachments";
import { logger } from "../lib/logger";
import { requireAnyRole } from "../middleware/requireRole";

const router: IRouter = Router();

router.use("/admin/drive", requireAnyRole(["admin"]));

// ── Force-sync a single protocol ──────────────────────────────────────────

router.post("/admin/drive/sync-protocol/:id", async (req: Request, res: Response) => {
  try {
    const protocolId = Number(req.params["id"]);
    const { enabled, rootFolderId } = await getDriveSettings();
    if (!enabled) {
      res.status(400).json({ error: "Google Drive non è configurato" });
      return;
    }

    const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, protocolId));
    if (!protocol) {
      res.status(404).json({ error: "Protocollo non trovato" });
      return;
    }

    const folderId = await resolveProtocolFolder(protocolId, rootFolderId, req.log);
    await regenerateProtocolXml(protocolId, req.log);

    res.json({
      ok: true,
      protocolId,
      protocolNumber: protocol.number,
      driveFolderId: folderId,
    });
  } catch (err) {
    req.log.error({ err }, "Drive sync-protocol failed");
    res.status(500).json({ error: "Sincronizzazione fallita", detail: String(err) });
  }
});

// ── Recovery ───────────────────────────────────────────────────────────────

interface RecoveryReport {
  scannedFolders: number;
  inserted: number;
  skipped: number;
  failed: number;
  protocols: RecoveryEntry[];
}

interface RecoveryEntry {
  folderName: string;
  folderId: string;
  status: "inserted" | "skipped" | "failed";
  protocolNumber?: string;
  reason?: string;
  detail?: string;
}

router.post("/admin/drive/recover", async (req: Request, res: Response) => {
  try {
    const { enabled, rootFolderId } = await getDriveSettings();
    if (!enabled) {
      res.status(400).json({ error: "Google Drive non è configurato" });
      return;
    }

    const dry = req.query["dry"] === "true";   // ?dry=true → only report, no DB writes
    const report: RecoveryReport = { scannedFolders: 0, inserted: 0, skipped: 0, failed: 0, protocols: [] };

    // 1. Find Archivio-DMS
    const archivioId = await findArchivioDmsFolder(rootFolderId);
    if (!archivioId) {
      res.json({ ok: true, message: "Cartella Archivio-DMS non trovata su Drive", report });
      return;
    }

    // 2. Walk: ANNO → MESE → Protocollo
    const annoFolders = await listSubfolders(archivioId);
    for (const anno of annoFolders) {
      const meseFolders = await listSubfolders(anno.id);
      for (const mese of meseFolders) {
        const protocolFolders = await listSubfolders(mese.id);
        for (const protoFolder of protocolFolders) {
          report.scannedFolders++;
          const entry = await recoverProtocolFolder(protoFolder, dry, req.log, req.currentUserId!);
          report.protocols.push(entry);
          if (entry.status === "inserted") report.inserted++;
          else if (entry.status === "skipped") report.skipped++;
          else report.failed++;
        }
      }
    }

    res.json({ ok: true, dry, report });
  } catch (err) {
    req.log.error({ err }, "Drive recovery failed");
    res.status(500).json({ error: "Procedura di recovery fallita", detail: String(err) });
  }
});

// ── Recovery helpers ───────────────────────────────────────────────────────

async function recoverProtocolFolder(
  folder: { id: string; name: string },
  dry: boolean,
  log: Request["log"],
  currentUserId: number,
): Promise<RecoveryEntry> {
  const entry: RecoveryEntry = { folderName: folder.name, folderId: folder.id, status: "failed" };

  try {
    // Find metadati.xml
    const files = await listFilesInFolder(folder.id);
    const xmlFile = files.find(f => f.name === "metadati.xml");

    if (!xmlFile) {
      entry.status = "skipped";
      entry.reason = "metadati.xml non trovato nella cartella";
      return entry;
    }

    // Download and parse
    const xmlBuffer = await downloadDriveFile(xmlFile.id);
    const xmlString = xmlBuffer.toString("utf-8");
    let parsed: ParsedProtocolXml;
    try {
      parsed = parseProtocolXml(xmlString);
    } catch (parseErr) {
      entry.status = "failed";
      entry.reason = "XML non valido o non parsabile";
      entry.detail = String(parseErr);
      return entry;
    }

    const proto = parsed.protocol;
    entry.protocolNumber = proto.number;

    if (!proto.number) {
      entry.status = "failed";
      entry.reason = "Numero protocollo mancante nell'XML";
      return entry;
    }

    // Check if already in DB
    const existing = await db
      .select({ id: protocolsTable.id })
      .from(protocolsTable)
      .where(eq(protocolsTable.number, proto.number));

    if (existing.length > 0) {
      entry.status = "skipped";
      entry.reason = `Già presente in DB (id: ${existing[0]!.id})`;
      return entry;
    }

    if (dry) {
      entry.status = "inserted";  // would be inserted
      entry.reason = "dry-run — nessuna scrittura effettuata";
      return entry;
    }

    // Resolve registeredById: try to find user by email, else fall back to the
    // current authenticated user performing the recovery.
    let registeredById = currentUserId;
    if (proto.registeredByEmail) {
      const [u] = await db.select({ id: usersTable.id }).from(usersTable)
        .where(eq(usersTable.email, proto.registeredByEmail));
      if (u) registeredById = u.id;
    }

    // Insert protocol
    const [inserted] = await db.insert(protocolsTable).values({
      number:          proto.number,
      year:            proto.year,
      type:            proto.type,
      status:          proto.status,
      subject:         proto.subject,
      description:     proto.description ?? null,
      sender:          proto.sender ?? null,
      recipients:      proto.recipients,
      ccRecipients:    proto.ccRecipients,
      channel:         proto.channel ?? null,
      confidentiality: proto.confidentiality,
      priority:        proto.priority,
      notes:           proto.notes ?? null,
      cancelReason:    proto.cancelReason ?? null,
      registeredById,
      registeredAt:    proto.registeredAt ?? new Date(),
      driveFolder:     proto.driveFolder ?? folder.id,
    }).returning({ id: protocolsTable.id });

    const newProtocolId = inserted!.id;

    // Insert attachments from XML (metadata only — files already on Drive)
    for (const att of parsed.attachments) {
      await db.insert(fileAttachmentsTable).values({
        objectPath:   att.objectPath || `recovered/${folder.id}/${att.originalName}`,
        originalName: att.originalName,
        mimeType:     att.mimeType,
        fileSize:     att.fileSize || 0,
        protocolId:   newProtocolId,
        uploadedById: currentUserId,
        driveFileId:  att.driveFileId ?? null,
        driveViewLink: att.driveViewLink ?? null,
      }).onConflictDoNothing();
    }

    // Insert activity log entries from XML
    for (const ev of parsed.activities) {
      await db.insert(activityLogTable).values({
        type:        ev.type,
        description: ev.description,
        userId:      currentUserId,
        protocolId:  newProtocolId,
        createdAt:   ev.createdAt ?? new Date(),
      }).onConflictDoNothing();
    }

    entry.status = "inserted";
    log.info({ protocolNumber: proto.number, newProtocolId }, "Protocol recovered from Drive");
    return entry;
  } catch (err) {
    entry.status = "failed";
    entry.reason = "Errore durante il recovery";
    entry.detail = String(err);
    logger.error({ err, folderId: folder.id }, "Protocol folder recovery error");
    return entry;
  }
}

export default router;
