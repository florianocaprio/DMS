import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Settings, HardDrive, CheckCircle2, AlertCircle, ExternalLink, Save, Trash2, Loader2 } from "lucide-react";

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
      const folderId = parseFolderIdFromUrl(folderInput);
      if (!folderId) {
        setError("Inserisci un ID cartella o URL valido.");
        return;
      }
      await saveSetting("gdrive_folder_id", folderId);
      await saveSetting("gdrive_folder_name", folderName || folderId);
      await saveSetting("gdrive_enabled", "true");
      setSettings((s) => ({ ...s, gdrive_folder_id: folderId, gdrive_folder_name: folderName || folderId, gdrive_enabled: "true" }));
      setFolderInput(folderId);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Errore durante il salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnectDrive() {
    setSaving(true);
    try {
      await deleteSetting("gdrive_folder_id");
      await deleteSetting("gdrive_folder_name");
      await deleteSetting("gdrive_enabled");
      setSettings({});
      setFolderInput("");
      setFolderName("");
    } catch {
      setError("Errore durante la disconnessione.");
    } finally {
      setSaving(false);
    }
  }

  const isDriveConfigured = Boolean(settings.gdrive_folder_id && settings.gdrive_enabled === "true");

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
                  <CardDescription className="text-xs mt-0">Archiviazione documenti su cartella Drive</CardDescription>
                </div>
              </div>
              {isDriveConfigured ? (
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 text-xs">
                  <CheckCircle2 className="w-3 h-3" /> Configurato
                </Badge>
              ) : (
                <Badge variant="outline" className="text-slate-500 gap-1 text-xs">
                  <AlertCircle className="w-3 h-3" /> Non configurato
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800 space-y-1.5">
              <p className="font-medium">Come configurare:</p>
              <ol className="list-decimal ml-4 space-y-1 text-blue-700">
                <li>Apri Google Drive e vai alla cartella dove vuoi archiviare i documenti</li>
                <li>Copia l'URL dalla barra del browser (es. <span className="font-mono">drive.google.com/drive/folders/ABC123</span>)</li>
                <li>Incollalo qui sotto — l'ID cartella verrà estratto automaticamente</li>
              </ol>
              <a
                href="https://drive.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline font-medium mt-1"
              >
                Apri Google Drive <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs text-slate-600 mb-1.5 block">
                  ID cartella o URL Google Drive
                </Label>
                <Input
                  value={folderInput}
                  onChange={(e) => setFolderInput(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/... oppure solo l'ID"
                  className="text-xs font-mono"
                />
                {folderInput && folderInput.includes("/") && (
                  <p className="text-xs text-slate-400 mt-1">
                    ID estratto: <span className="font-mono text-slate-600">{parseFolderIdFromUrl(folderInput)}</span>
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs text-slate-600 mb-1.5 block">
                  Nome cartella (opzionale, solo per riferimento)
                </Label>
                <Input
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="es. Archivio ProtocolloDigitale 2026"
                  className="text-xs"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </p>
            )}

            {isDriveConfigured && (
              <div className="bg-slate-50 rounded-lg border border-slate-200 px-3 py-2.5 text-xs space-y-1">
                <p className="text-slate-500 font-medium">Configurazione attiva</p>
                <p className="text-slate-700">
                  <span className="text-slate-400">Cartella: </span>
                  {settings.gdrive_folder_name}
                </p>
                <p className="text-slate-700 font-mono text-[11px]">
                  <span className="text-slate-400">ID: </span>
                  {settings.gdrive_folder_id}
                </p>
                <a
                  href={`https://drive.google.com/drive/folders/${settings.gdrive_folder_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                >
                  Apri cartella in Drive <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleSaveDrive}
                disabled={saving || !folderInput}
                className="gap-1.5"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saved ? "Salvato!" : "Salva configurazione"}
              </Button>
              {isDriveConfigured && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnectDrive}
                  disabled={saving}
                  className="gap-1.5 text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Rimuovi
                </Button>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-500 font-medium mb-2">Come viene usata l'integrazione</p>
              <ul className="text-xs text-slate-400 space-y-1 list-disc ml-4">
                <li>I documenti archiviati vengono copiati automaticamente nella cartella Drive configurata</li>
                <li>L'accesso richiede che l'account Google abbia i permessi di scrittura sulla cartella</li>
                <li>I file originali rimangono nell'archivio interno del sistema</li>
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
