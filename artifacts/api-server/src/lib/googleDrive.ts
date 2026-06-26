import { ReplitConnectors } from "@replit/connectors-sdk";
import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db";
import { objectStorageClient } from "./objectStorage";

const connectors = new ReplitConnectors();

interface DriveFileMetadata {
  id: string;
  name: string;
  webViewLink: string;
  size?: string;
}

function parseObjectPath(objectPath: string): { bucketName: string; objectName: string } {
  const normalized = objectPath.startsWith("/") ? objectPath.slice(1) : objectPath;
  const slashIdx = normalized.indexOf("/");
  if (slashIdx === -1) return { bucketName: normalized, objectName: "" };
  return { bucketName: normalized.slice(0, slashIdx), objectName: normalized.slice(slashIdx + 1) };
}

export async function getDriveFolderId(): Promise<string | null> {
  const rows = await db.select().from(appSettingsTable);
  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.key] = row.value;
  if (settings.gdrive_enabled !== "true" || !settings.gdrive_folder_id) return null;
  return settings.gdrive_folder_id;
}

export async function downloadObjectAsBuffer(objectPath: string): Promise<Buffer> {
  const { bucketName, objectName } = parseObjectPath(objectPath);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  const [contents] = await file.download();
  return contents;
}

export async function uploadFileToDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  folderId: string,
): Promise<DriveFileMetadata> {
  const boundary = "----formdata-drive-" + Math.random().toString(36).slice(2);

  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
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

  const response = await connectors.proxy(
    "google-drive",
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

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Drive upload failed: ${response.status} — ${errText}`);
  }

  return response.json() as Promise<DriveFileMetadata>;
}

export async function deleteFileFromDrive(fileId: string): Promise<void> {
  await connectors.proxy("google-drive", `/drive/v3/files/${fileId}`, {
    method: "DELETE",
  });
}
