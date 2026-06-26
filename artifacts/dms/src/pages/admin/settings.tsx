import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Settings, HardDrive, CheckCircle2, AlertCircle,
  ExternalLink, Save, Trash2, Loader2, FolderTree,
} from "lucide-react";

interface AppSettings {
  gdrive_folder_id?: string;
  gdrive_folder_name?: string;
  gdrive_enabled?: string;
}

async function loadSettings(): Promise<AppSettings> {
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error("Failed to load settings");
  return res.json();
}

async function saveSetting(key: string, value: string) {
  const res = await fetch(`/api/settings/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error("Failed to save setting");
}

async function deleteSetting(key: string) {
  await fetch(`/api/settings/${key}`, { method: "DELETE" });
}

function parseFolderIdFromUrl(input: string): string {
  const match = input.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(input.trim())) return input.trim();
  return input.trim();
}

const today = new Date();
const mm = String(today.getMonth() + 1).padStart(2, "0");
const MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const EXAMPLE_PATH = `Archivio-DMS / ${today.getFullYear()} / ${mm} - ${MESI[today.getMonth()]} / ${String(today.getDate()).padStart(2, "0")}`;

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folderInput, setFolderInput] = useState("");
  const [folderName, setFolderName] = useState("");

  useEffect(() => {
    loadSettings()
      .then((s) => {
        setSettings(s);
        if (s.gdrive_folder_id) setFolderInput(s.gdrive_folder_id);
        if (s.gdrive_folder_name) setFolderName(s.gdrive_folder_name);
      })
      .catch(() => setError("Impossibile caricare le impostazioni."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSaveDrive() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const folderId = folderInput.trim() ? parseFolderIdFromUrl(folderInput) : "";
      await saveSetting("gdrive_enabled", "true");
      if (folderId) {
        await saveSetting("gdrive_folder_id", folderId);
        await saveSetting("gdrive_folder_name", folderName || folderId);
        setSettings((s) => ({ ...s, gdrive_folder_id: folderId, gdrive_folder_name: folderName || folderId, gdrive_enabled: "true" }));
        setFolderInput(folderId);
      } else {
        await deleteSetting("gdrive_folder_id");
        await deleteSetting("gdrive_folder_name");
        setSettings((s) => ({ ...s, gdrive_folder_id: undefined, gdrive_folder_name: undefined, gdrive_enabled: "true" }));
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Errore durante il salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisable() {
    setSaving(true);
    try {
      await deleteSetting("gdrive_folder_id");
      await deleteSetting("gdrive_folder_name");
      await deleteSetting("gdrive_enabled");
      setSettings({});
      setFolderInput("");
      setFolderName("");
    } catch {
      setError("Errore durante la disattivazione.");
    } finally {
      setSaving(false);
    }
  }

  const isDriveEnabled = settings.gdrive_enabled === "true";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-6 py-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-slate-500" />
          <h1 className="text-xl font-semibold text-slate-900">Impostazioni</h1>
        </div>
        <p className="text-sm text-slate-500 mt-0.5">Configurazione integrazioni e preferenze di sistema</p>
      </div>

      <div className="flex-1 p-6 max-w-2xl space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <HardDrive className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Google Drive</CardTitle>
                  <CardDescription className="text-xs mt-0">Archiviazione automatica con struttura ANNO / MESE / GIORNO</CardDescription>
                </div>
              </div>
              {isDriveEnabled ? (
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 text-xs">
                  <CheckCircle2 className="w-3 h-3" /> Attivo
                </Badge>
              ) : (
                <Badge variant="outline" className="text-slate-500 gap-1 text-xs">
                  <AlertCircle className="w-3 h-3" /> Non attivo
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Tree preview */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-2">
                <FolderTree className="w-3.5 h-3.5" />
                Struttura cartelle creata automaticamente
              </div>
              <div className="font-mono text-xs text-slate-500 space-y-0.5 pl-1">
                <div className="flex items-center gap-1">
                  <span className="text-blue-500">📁</span>
                  <span className="text-slate-700 font-semibold">
                    {settings.gdrive_folder_name ? settings.gdrive_folder_name : "Root Drive"}
                  </span>
                  <span className="text-slate-400 ml-1">(cartella base)</span>
                </div>
                <div className="pl-4 flex items-center gap-1">
                  <span className="text-blue-500">📁</span>
                  <span className="text-blue-700 font-medium">Archivio-DMS</span>
                  <span className="text-slate-400 ml-1">(creata automaticamente)</span>
                </div>
                <div className="pl-8 flex items-center gap-1">
                  <span className="text-blue-400">📁</span>
                  <span>{today.getFullYear()}</span>
                </div>
                <div className="pl-12 flex items-center gap-1">
                  <span className="text-blue-400">📁</span>
                  <span>{mm} - {MESI[today.getMonth()]}</span>
                </div>
                <div className="pl-16 flex items-center gap-1">
                  <span className="text-blue-400">📁</span>
                  <span>{String(today.getDate()).padStart(2, "0")}</span>
                </div>
                <div className="pl-20 flex items-center gap-1">
                  <span className="text-slate-400">📄</span>
                  <span className="text-slate-500 italic">documento.pdf, allegato.docx, …</span>
                </div>
              </div>
            </div>

            {/* Folder configuration */}
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-slate-600 mb-1.5 block">
                  Cartella base (opzionale)
                </Label>
                <Input
                  value={folderInput}
                  onChange={(e) => setFolderInput(e.target.value)}
                  placeholder="URL o ID cartella Drive — lascia vuoto per usare la root del Drive"
                  className="text-xs font-mono"
                />
                {folderInput && folderInput.includes("/") && (
                  <p className="text-xs text-slate-400 mt-1">
                    ID estratto: <span className="font-mono text-slate-600">{parseFolderIdFromUrl(folderInput)}</span>
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  La cartella <span className="font-mono font-medium text-slate-600">Archivio-DMS</span> verrà creata qui dentro.
                  Se lasci vuoto, viene creata nella root del tuo Google Drive.
                </p>
              </div>

              <div>
                <Label className="text-xs text-slate-600 mb-1.5 block">
                  Nome cartella (solo per riferimento nell'interfaccia)
                </Label>
                <Input
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="es. Drive Condiviso Ufficio"
                  className="text-xs"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
            )}

            {isDriveEnabled && settings.gdrive_folder_id && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5 text-xs space-y-1">
                <p className="text-emerald-700 font-medium">Cartella base configurata</p>
                <p className="text-emerald-800">{settings.gdrive_folder_name}</p>
                <p className="font-mono text-[11px] text-emerald-600">{settings.gdrive_folder_id}</p>
                <div className="flex items-center gap-3 mt-1">
                  <a
                    href={`https://drive.google.com/drive/folders/${settings.gdrive_folder_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    Apri cartella base <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}

            {isDriveEnabled && !settings.gdrive_folder_id && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5 text-xs text-emerald-700">
                <span className="font-medium">Drive attivo — root di Drive</span>
                <p className="text-emerald-600 mt-0.5">
                  La cartella <span className="font-mono">Archivio-DMS</span> viene creata nella root del tuo Google Drive.
                </p>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleSaveDrive}
                disabled={saving}
                className="gap-1.5"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saved ? "Salvato!" : isDriveEnabled ? "Aggiorna configurazione" : "Attiva integrazione"}
              </Button>
              {isDriveEnabled && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisable}
                  disabled={saving}
                  className="gap-1.5 text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Disattiva
                </Button>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-500 font-medium mb-1.5">Come funziona</p>
              <ul className="text-xs text-slate-400 space-y-1 list-disc ml-4">
                <li>Ad ogni allegato caricato, il sistema crea automaticamente la struttura <span className="font-mono text-slate-500">Archivio-DMS / ANNO / MM - Mese / GG</span></li>
                <li>Se le cartelle esistono già vengono riutilizzate, non duplicate</li>
                <li>I file originali rimangono nell'archivio interno — Drive è una copia di backup</li>
                <li>Eliminando un allegato dal DMS, viene rimosso anche da Drive</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="opacity-60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                  <Settings className="w-4 h-4 text-slate-400" />
                </div>
                <div>
                  <CardTitle className="text-base text-slate-500">Altre integrazioni</CardTitle>
                  <CardDescription className="text-xs mt-0">Prossimamente disponibili</CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-xs text-slate-400">Presto</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-400">Email SMTP, firma elettronica qualificata, conservazione a norma.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
