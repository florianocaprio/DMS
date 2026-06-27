import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Settings, HardDrive, CheckCircle2, AlertCircle,
  ExternalLink, Save, Trash2, Loader2, FolderTree, RotateCcw, ChevronRight,
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
const MM = String(today.getMonth() + 1).padStart(2, "0");
const MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const EXAMPLE_MONTH = `${MM} - ${MESI[today.getMonth()]}`;
const EXAMPLE_YEAR = String(today.getFullYear());

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folderInput, setFolderInput] = useState("");
  const [folderName, setFolderName] = useState("");

  const [recovering, setRecovering] = useState(false);
  const [recoverDry, setRecoverDry] = useState(true);
  const [recoverResult, setRecoverResult] = useState<null | {
    dry: boolean;
    report: {
      scannedFolders: number; inserted: number; skipped: number; failed: number;
      protocols: { folderName: string; status: string; protocolNumber?: string; reason?: string }[];
    };
  }>(null);

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
    setSaving(true); setError(null); setSaved(false);
    try {
      const folderId = folderInput.trim() ? parseFolderIdFromUrl(folderInput) : "";
      await saveSetting("gdrive_enabled", "true");
      if (folderId) {
        await saveSetting("gdrive_folder_id", folderId);
        await saveSetting("gdrive_folder_name", folderName || folderId);
        setSettings(s => ({ ...s, gdrive_folder_id: folderId, gdrive_folder_name: folderName || folderId, gdrive_enabled: "true" }));
        setFolderInput(folderId);
      } else {
        await deleteSetting("gdrive_folder_id");
        await deleteSetting("gdrive_folder_name");
        setSettings(s => ({ ...s, gdrive_folder_id: undefined, gdrive_folder_name: undefined, gdrive_enabled: "true" }));
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
      setSettings({}); setFolderInput(""); setFolderName("");
    } catch {
      setError("Errore durante la disattivazione.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRecover() {
    setRecovering(true); setRecoverResult(null);
    try {
      const url = `/api/admin/drive/recover${recoverDry ? "?dry=true" : ""}`;
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      setRecoverResult(data);
    } catch {
      setError("Errore durante la procedura di recovery.");
    } finally {
      setRecovering(false);
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

        {/* Google Drive card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <HardDrive className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Google Drive</CardTitle>
                  <CardDescription className="text-xs mt-0">Archiviazione automatica per numero di protocollo</CardDescription>
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
              <div className="font-mono text-[11px] text-slate-500 space-y-0.5 leading-5">
                <div className="flex items-center gap-1">
                  <span>📁</span>
                  <span className="text-slate-700 font-semibold">
                    {settings.gdrive_folder_name ?? "Root Drive"}
                  </span>
                  <span className="text-slate-400 ml-1 font-sans">(cartella base)</span>
                </div>
                <div className="pl-5 flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 text-slate-300 -ml-3.5" />
                  <span>📁</span>
                  <span className="text-blue-700 font-semibold">Archivio-DMS</span>
                  <span className="text-slate-400 ml-1 font-sans">(auto)</span>
                </div>
                <div className="pl-9 flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 text-slate-300 -ml-3.5" />
                  <span>📁</span>
                  <span>{EXAMPLE_YEAR}</span>
                </div>
                <div className="pl-[52px] flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 text-slate-300 -ml-3.5" />
                  <span>📁</span>
                  <span>{EXAMPLE_MONTH}</span>
                </div>
                <div className="pl-[66px] flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 text-slate-300 -ml-3.5" />
                  <span>📁</span>
                  <span className="text-violet-700 font-medium">AIM-{EXAMPLE_YEAR}-E-000001</span>
                  <span className="text-slate-400 ml-1 font-sans">(una cartella per protocollo)</span>
                </div>
                <div className="pl-[80px] space-y-0.5">
                  <div className="flex items-center gap-1">
                    <ChevronRight className="w-3 h-3 text-slate-300 -ml-3.5" />
                    <span>📄</span>
                    <span className="text-emerald-700 font-medium">metadati.xml</span>
                    <span className="text-slate-400 ml-1 font-sans">(generato automaticamente)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <ChevronRight className="w-3 h-3 text-slate-300 -ml-3.5" />
                    <span>📎</span>
                    <span>allegato.pdf, contratto.docx, …</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Folder config */}
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-slate-600 mb-1.5 block">Cartella base (opzionale)</Label>
                <Input
                  value={folderInput}
                  onChange={e => setFolderInput(e.target.value)}
                  placeholder="URL o ID cartella Drive — lascia vuoto per usare la root del Drive"
                  className="text-xs font-mono"
                />
                {folderInput && folderInput.includes("/") && (
                  <p className="text-xs text-slate-400 mt-1">
                    ID estratto: <span className="font-mono text-slate-600">{parseFolderIdFromUrl(folderInput)}</span>
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  <span className="font-mono font-medium text-slate-600">Archivio-DMS</span> verrà creata qui dentro.
                  Lasciando vuoto, viene creata nella root del Google Drive.
                </p>
              </div>
              <div>
                <Label className="text-xs text-slate-600 mb-1.5 block">
                  Nome cartella (solo per riferimento nell'interfaccia)
                </Label>
                <Input
                  value={folderName}
                  onChange={e => setFolderName(e.target.value)}
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
                <a
                  href={`https://drive.google.com/drive/folders/${settings.gdrive_folder_id}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                >
                  Apri cartella base <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            {isDriveEnabled && !settings.gdrive_folder_id && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5 text-xs text-emerald-700">
                <span className="font-medium">Drive attivo — root di Drive.</span>
                {" "}La cartella <span className="font-mono">Archivio-DMS</span> viene creata nella root del tuo Google Drive.
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" onClick={handleSaveDrive} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saved ? "Salvato!" : isDriveEnabled ? "Aggiorna" : "Attiva integrazione"}
              </Button>
              {isDriveEnabled && (
                <Button variant="outline" size="sm" onClick={handleDisable} disabled={saving}
                  className="gap-1.5 text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" />
                  Disattiva
                </Button>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-1">
              <p className="text-xs text-slate-500 font-medium">Come funziona</p>
              <ul className="text-xs text-slate-400 list-disc ml-4 space-y-1">
                <li>Ogni protocollo riceve la propria cartella <span className="font-mono text-slate-500">AIM-ANNO-TIPO-NUMERO</span></li>
                <li>Dentro ogni cartella: gli allegati + <span className="font-mono text-slate-500">metadati.xml</span> con tutto lo storico</li>
                <li>Il file XML si aggiorna automaticamente ad ogni modifica degli allegati</li>
                <li>Le cartelle già esistenti vengono riutilizzate, non duplicate</li>
                <li>In caso di corruzione del DB, usa la <strong>procedura di recovery</strong> qui sotto per ricostruirlo</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Recovery card */}
        {isDriveEnabled && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                  <RotateCcw className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Recovery da Google Drive</CardTitle>
                  <CardDescription className="text-xs mt-0">
                    Ricostruisce il database leggendo i file <span className="font-mono">metadati.xml</span> dall'archivio Drive
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                <p className="font-medium mb-1">Quando usare questa procedura</p>
                <ul className="list-disc ml-4 space-y-0.5 text-amber-700">
                  <li>Il database centrale è corrotto o perso</li>
                  <li>Migrazione verso un nuovo server</li>
                  <li>Ripristino dopo un incidente</li>
                </ul>
                <p className="mt-2 text-amber-600">
                  La procedura legge in sequenza ogni cartella protocollo su Drive, analizza il file
                  <span className="font-mono font-medium"> metadati.xml</span> e reinserisce i dati nel DB.
                  I protocolli già esistenti vengono saltati senza modifiche.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={recoverDry}
                    onChange={e => setRecoverDry(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-xs text-slate-600 font-medium">Modalità simulazione</span>
                </label>
                <span className="text-xs text-slate-400">(solo rapporto, nessuna scrittura nel DB)</span>
              </div>

              <Button
                variant={recoverDry ? "outline" : "default"}
                size="sm"
                onClick={handleRecover}
                disabled={recovering}
                className="gap-1.5"
              >
                {recovering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                {recovering
                  ? "Scansione in corso…"
                  : recoverDry
                    ? "Esegui scansione (simulazione)"
                    : "Avvia recovery reale"}
              </Button>

              {recoverResult && (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-3 py-2 flex items-center gap-4 text-xs">
                    <span className="font-medium text-slate-700">
                      {recoverResult.dry ? "🔍 Risultato simulazione" : "✅ Recovery completato"}
                    </span>
                    <span className="text-slate-500">
                      Scansionate: <strong>{recoverResult.report.scannedFolders}</strong>
                    </span>
                    <span className="text-emerald-600">
                      Inserite: <strong>{recoverResult.report.inserted}</strong>
                    </span>
                    <span className="text-slate-500">
                      Saltate: <strong>{recoverResult.report.skipped}</strong>
                    </span>
                    {recoverResult.report.failed > 0 && (
                      <span className="text-red-500">
                        Errori: <strong>{recoverResult.report.failed}</strong>
                      </span>
                    )}
                  </div>
                  <div className="max-h-48 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-1.5 text-slate-500 font-medium">Cartella</th>
                          <th className="text-left px-3 py-1.5 text-slate-500 font-medium">Numero</th>
                          <th className="text-left px-3 py-1.5 text-slate-500 font-medium">Esito</th>
                          <th className="text-left px-3 py-1.5 text-slate-500 font-medium">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recoverResult.report.protocols.map((p, i) => (
                          <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-3 py-1.5 font-mono text-[11px] text-slate-600">{p.folderName}</td>
                            <td className="px-3 py-1.5 font-mono text-[11px]">{p.protocolNumber ?? "—"}</td>
                            <td className="px-3 py-1.5">
                              <span className={`font-medium ${
                                p.status === "inserted" ? "text-emerald-600" :
                                p.status === "failed"   ? "text-red-500" : "text-slate-400"
                              }`}>
                                {p.status === "inserted" ? "Inserita" : p.status === "skipped" ? "Saltata" : "Errore"}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-slate-400 truncate max-w-[200px]">{p.reason ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Other integrations placeholder */}
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
