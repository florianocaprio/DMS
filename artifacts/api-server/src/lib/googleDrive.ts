import { ReplitConnectors } from "@replit/connectors-sdk";
import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db";
import { objectStorageClient } from "./objectStorage";

const connectors = new ReplitConnectors();

const MESI_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

// ── Types ──────────────────────────────────────────────────────────────────

interface DriveFileMetadata {
  id: string;
  name: string;
  webViewLink: string;
  size?: string;
}

interface DriveFolderItem {
  id: string;
  name: string;
}

// ── Settings ───────────────────────────────────────────────────────────────

export async function getDriveSettings(): Promise<{
  enabled: boolean;
  rootFolderId: string;
  rootFolderName: string | null;
}> {
  const rows = await db.select().from(appSettingsTable);
  const s: Record<string, string> = {};
  for (const row of rows) s[row.key] = row.value;
  return {
    enabled: s.gdrive_enabled === "true",
    rootFolderId: s.gdrive_folder_id || "root",
    rootFolderName: s.gdrive_folder_name ?? null,
  };
}

// ── Object Storage helpers ─────────────────────────────────────────────────

function parseObjectPath(objectPath: string): { bucketName: string; objectName: string } {
  const normalized = objectPath.startsWith("/") ? objectPath.slice(1) : objectPath;
  const slashIdx = normalized.indexOf("/");
  if (slashIdx === -1) return { bucketName: normalized, objectName: "" };
  return { bucketName: normalized.slice(0, slashIdx), objectName: normalized.slice(slashIdx + 1) };
}

export async function downloadObjectAsBuffer(objectPath: string): Promise<Buffer> {
  const { bucketName, objectName } = parseObjectPath(objectPath);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  const [contents] = await file.download();
  return contents;
}

// ── Drive folder helpers ───────────────────────────────────────────────────

interface DriveRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: Buffer | string;
}

async function driveRequest(path: string, init?: DriveRequestOptions): Promise<Response> {
  return connectors.proxy("google-drive", path, init);
}

async function findFolder(name: string, parentId: string): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await driveRequest(`/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`);
  if (!res.ok) throw new Error(`Drive search failed: ${res.status}`);
  const data = await res.json() as { files: DriveFolderItem[] };
  return data.files[0]?.id ?? null;
}

async function createFolder(name: string, parentId: string): Promise<string> {
  const res = await driveRequest("/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Drive folder creation failed: ${res.status} — ${errText}`);
  }
  const data = await res.json() as { id: string };
  return data.id;
}

async function findOrCreateFolder(name: string, parentId: string): Promise<string> {
  const existing = await findFolder(name, parentId);
  if (existing) return existing;
  return createFolder(name, parentId);
}

// ── Dated folder tree: Archivio-DMS / ANNO / MM - MESE / GG ───────────────

async function getOrCreateDateFolder(rootParentId: string, date: Date): Promise<string> {
  const anno = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const mese = `${mm} - ${MESI_IT[date.getMonth()]}`;
  const giorno = String(date.getDate()).padStart(2, "0");

  const archivioId = await findOrCreateFolder("Archivio-DMS", rootParentId);
  const annoId = await findOrCreateFolder(anno, archivioId);
  const meseId = await findOrCreateFolder(mese, annoId);
  const giornoId = await findOrCreateFolder(giorno, meseId);

  return giornoId;
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function uploadFileToDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<DriveFileMetadata> {
  const { enabled, rootFolderId } = await getDriveSettings();
  if (!enabled) throw new Error("Google Drive not configured");

  const dayFolderId = await getOrCreateDateFolder(rootFolderId, new Date());

  const boundary = "----formdata-drive-" + Math.random().toString(36).slice(2);
  const metadata = JSON.stringify({ name: fileName, parents: [dayFolderId] });
  const metaPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n`;
  const filePart =
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  const body = Buffer.concat([
    Buffer.from(metaPart, "utf-8"),
    Buffer.from(filePart, "utf-8"),
    fileBuffer,
    Buffer.from(closing, "utf-8"),
  ]);

  const res = await driveRequest(
    "/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,size",
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Drive upload failed: ${res.status} — ${errText}`);
  }

  return res.json() as Promise<DriveFileMetadata>;
}

export async function deleteFileFromDrive(fileId: string): Promise<void> {
  await driveRequest(`/drive/v3/files/${fileId}`, { method: "DELETE" });
}

// ── Compatibility shim ─────────────────────────────────────────────────────
// kept so attachments.ts does not need changes to the getDriveFolderId call

export async function getDriveFolderId(): Promise<string | null> {
  const { enabled } = await getDriveSettings();
  return enabled ? "managed" : null;
}
