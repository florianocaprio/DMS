import { useRef, useState } from "react";
import { useUpload } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import {
  FileText, FileImage, FileArchive, FileSpreadsheet,
  FileCode, File, Upload, Trash2, Download, Loader2, Paperclip
} from "lucide-react";

interface Attachment {
  id: number;
  objectPath: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

interface FileAttachmentsProps {
  documentId?: number;
  protocolId?: number;
  dossierId?: number;
  attachments: Attachment[];
  onAttachmentAdded?: (a: Attachment) => void;
  onAttachmentDeleted?: (id: number) => void;
  readonly?: boolean;
}

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/tiff",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip", "application/x-zip-compressed",
  "text/plain", "text/csv",
  "application/octet-stream",
];

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return <FileImage className="w-4 h-4 text-blue-500" />;
  if (mimeType === "application/pdf") return <FileText className="w-4 h-4 text-red-500" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType === "text/csv")
    return <FileSpreadsheet className="w-4 h-4 text-emerald-600" />;
  if (mimeType.includes("word") || mimeType.includes("document"))
    return <FileText className="w-4 h-4 text-blue-600" />;
  if (mimeType.includes("zip") || mimeType.includes("compressed"))
    return <FileArchive className="w-4 h-4 text-amber-500" />;
  if (mimeType.startsWith("text/"))
    return <FileCode className="w-4 h-4 text-slate-500" />;
  return <File className="w-4 h-4 text-slate-400" />;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

async function saveAttachment(
  objectPath: string,
  originalName: string,
  mimeType: string,
  fileSize: number,
  parentIds: { documentId?: number; protocolId?: number; dossierId?: number },
): Promise<Attachment> {
  const res = await fetch("/api/attachments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectPath, originalName, mimeType, fileSize, ...parentIds }),
  });
  if (!res.ok) throw new Error("Failed to save attachment");
  return res.json();
}

async function deleteAttachment(id: number) {
  const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete attachment");
}

export function FileAttachments({
  documentId, protocolId, dossierId,
  attachments, onAttachmentAdded, onAttachmentDeleted, readonly = false,
}: FileAttachmentsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { uploadFile, isUploading, progress } = useUpload({
    onSuccess: async (response) => {
      setUploadError(null);
    },
    onError: (err) => setUploadError(err.message),
  });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadError(null);

    for (const file of Array.from(files)) {
      const response = await uploadFile(file);
      if (response) {
        try {
          const saved = await saveAttachment(
            response.objectPath,
            file.name,
            file.type || "application/octet-stream",
            file.size,
            { documentId, protocolId, dossierId },
          );
          onAttachmentAdded?.(saved);
        } catch {
          setUploadError("Upload completato ma salvataggio record fallito.");
        }
      }
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteAttachment(id);
      onAttachmentDeleted?.(id);
    } catch {
      setUploadError("Errore durante l'eliminazione.");
    } finally {
      setDeletingId(null);
    }
  }

  function handleDownload(a: Attachment) {
    const url = `/api/storage${a.objectPath}`;
    const link = document.createElement("a");
    link.href = url;
    link.download = a.originalName;
    link.click();
  }

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <Paperclip className="w-4 h-4" />
          Allegati
          {attachments.length > 0 && (
            <span className="ml-1 bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full">
              {attachments.length}
            </span>
          )}
        </div>
        {!readonly && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {isUploading ? `${progress}%` : "Carica file"}
          </Button>
        )}
      </div>

      {!readonly && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !isUploading && inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg px-4 py-5 text-center cursor-pointer transition-colors select-none ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
          } ${isUploading ? "opacity-60 cursor-not-allowed pointer-events-none" : ""}`}
        >
          {isUploading ? (
            <div className="space-y-1.5">
              <Loader2 className="w-6 h-6 mx-auto text-primary animate-spin" />
              <p className="text-xs text-slate-500">Caricamento in corso... {progress}%</p>
              <div className="w-32 mx-auto h-1 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <Upload className="w-5 h-5 mx-auto text-slate-400 mb-1.5" />
              <p className="text-xs text-slate-500">
                <span className="font-medium text-primary">Clicca per caricare</span> o trascina qui
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                PDF, Word, Excel, immagini, ZIP (max 50 MB)
              </p>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        accept={ALLOWED_TYPES.join(",")}
        onChange={(e) => handleFiles(e.target.files)}
      />

      {uploadError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {uploadError}
        </p>
      )}

      {attachments.length > 0 ? (
        <ul className="space-y-1">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2.5 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 hover:border-slate-200 group"
            >
              <div className="flex-shrink-0">{getFileIcon(a.mimeType)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800 truncate">{a.originalName}</p>
                <p className="text-xs text-slate-400">
                  {formatBytes(a.fileSize)} · {new Date(a.createdAt).toLocaleDateString("it-IT")}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleDownload(a)}
                  className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors"
                  title="Scarica"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                {!readonly && (
                  <button
                    onClick={() => handleDelete(a.id)}
                    disabled={deletingId === a.id}
                    className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
                    title="Elimina"
                  >
                    {deletingId === a.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400 text-center py-2">Nessun allegato</p>
      )}
    </div>
  );
}
