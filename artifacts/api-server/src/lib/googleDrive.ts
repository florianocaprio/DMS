import { ReplitConnectors } from "@replit/connectors-sdk";
import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db";
import { objectStorageClient } from "./objectStorage";

const connectors = new ReplitConnectors();

export const MESI_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

// ── Types ──────────────────────────────────────────────────────────────────

export interface DriveFileMetadata {
  id: string;
  name: string;
  webViewLink: string;
  size?: string;
}

export interface DriveFolderItem {
  id: string;
  name: string;
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
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

// ── Drive request helper ───────────────────────────────────────────────────

interface DriveRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: Buffer | string;
}

async function driveRequest(path: string, init?: DriveRequestOptions): Promise<Response> {
  return connectors.proxy("google-drive", path, init);
}

// ── Folder helpers ─────────────────────────────────────────────────────────

async function findFolder(name: string, parentId: string): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await driveRequest(`/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`);
  if (!res.ok) throw new Error(`Drive folder search failed: ${res.status}`);
  const data = await res.json() as { files: DriveFolderItem[] };
  return data.files[0]?.id ?? null;
}

async function createFolder(name: string, parentId: string): Promise<string> {
  const res = await driveRequest("/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
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

// ── Protocol folder tree: Archivio-DMS / ANNO / MM - Mese / {numero} ──────

/**
 * Finds or creates the hierarchy:
 *   rootParentId → Archivio-DMS → ANNO → MM - Mese → protocolNumber
 *
 * Returns the leaf folder ID (one per protocol).
 */
export async function getOrCreateProtocolFolder(
  rootParentId: string,
  protocolNumber: string,
  registeredAt: Date,
): Promise<string> {
  const anno = String(registeredAt.getFullYear());
  const mm = String(registeredAt.getMonth() + 1).padStart(2, "0");
  const mese = `${mm} - ${MESI_IT[registeredAt.getMonth()]}`;

  const archivioId = await findOrCreateFolder("Archivio-DMS", rootParentId);
  const annoId = await findOrCreateFolder(anno, archivioId);
  const meseId = await findOrCreateFolder(mese, annoId);
  const protocolFolderId = await findOrCreateFolder(protocolNumber, meseId);

  return protocolFolderId;
}

/**
 * Returns the root Archivio-DMS folder id if it exists, otherwise null.
 * Used by the recovery procedure to discover all protocols.
 */
export async function findArchivioDmsFolder(rootParentId: string): Promise<string | null> {
  return findFolder("Archivio-DMS", rootParentId);
}

// ── Listing helpers for recovery ───────────────────────────────────────────

export async function listSubfolders(parentId: string): Promise<DriveFolderItem[]> {
  const q = encodeURIComponent(
    `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await driveRequest(`/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1000`);
  if (!res.ok) throw new Error(`Drive list subfolders failed: ${res.status}`);
  const data = await res.json() as { files: DriveFolderItem[] };
  return data.files;
}

export async function listFilesInFolder(folderId: string): Promise<DriveFileItem[]> {
  const q = encodeURIComponent(
    `'${folderId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await driveRequest(`/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=1000`);
  if (!res.ok) throw new Error(`Drive list files failed: ${res.status}`);
  const data = await res.json() as { files: DriveFileItem[] };
  return data.files;
}

export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const res = await driveRequest(`/drive/v3/files/${fileId}?alt=media`);
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ── File upload ────────────────────────────────────────────────────────────

async function uploadMultipart(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  folderId: string,
): Promise<DriveFileMetadata> {
  const boundary = "----formdata-drive-" + Math.random().toString(36).slice(2);
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const metaPart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`;
  const filePart =
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
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

/**
 * Uploads a file to the given Drive folder.
 * Caller is responsible for passing the correct protocol folder id.
 */
export async function uploadFileToDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  folderId: string,
): Promise<DriveFileMetadata> {
  return uploadMultipart(fileBuffer, fileName, mimeType, folderId);
}

/**
 * Finds an existing file by name in the folder and deletes it, then uploads a fresh copy.
 * Used to keep metadati.xml always current without accumulating duplicates.
 */
export async function uploadOrReplaceFile(
  folderId: string,
  fileName: string,
  content: Buffer | string,
  mimeType: string,
): Promise<DriveFileMetadata> {
  // Delete any existing file with this name
  const q = encodeURIComponent(
    `name='${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`
  );
  const listRes = await driveRequest(`/drive/v3/files?q=${q}&fields=files(id)&pageSize=10`);
  if (listRes.ok) {
    const listData = await listRes.json() as { files: { id: string }[] };
    for (const f of listData.files) {
      await driveRequest(`/drive/v3/files/${f.id}`, { method: "DELETE" });
    }
  }

  const buf = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
  return uploadMultipart(buf, fileName, mimeType, folderId);
}

// ── Delete ─────────────────────────────────────────────────────────────────

export async function deleteFileFromDrive(fileId: string): Promise<void> {
  await driveRequest(`/drive/v3/files/${fileId}`, { method: "DELETE" });
}

// ── Dated folder fallback (for non-protocol attachments) ───────────────────

/**
 * Archivio-DMS / ANNO / MM - Mese
 * Used when there is no protocol context (document/dossier attachments).
 */
export async function getOrCreateDatedFolder(rootParentId: string, date: Date): Promise<string> {
  const anno = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const mese = `${mm} - ${MESI_IT[date.getMonth()]}`;

  const archivioId = await findOrCreateFolder("Archivio-DMS", rootParentId);
  const annoId     = await findOrCreateFolder(anno, archivioId);
  const meseId     = await findOrCreateFolder(mese, annoId);
  return meseId;
}

// ── Compatibility shim ─────────────────────────────────────────────────────

export async function getDriveFolderId(): Promise<string | null> {
  const { enabled } = await getDriveSettings();
  return enabled ? "managed" : null;
}
