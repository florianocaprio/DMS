import React, { useState, useRef, useCallback } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PreviewSample {
  originalNumber: string;
  date: string;
  subject: string;
  type: "incoming" | "outgoing" | "internal";
  sender: string;
  attachmentCount: number;
  originalStatus: string;
  isDuplicate: boolean;
}

interface PreviewResponse {
  total: number;
  totalAttachments: number;
  byType: { incoming: number; outgoing: number; internal: number };
  conflicts: string[];
  dateRange: { min: string | null; max: string | null };
  sample: PreviewSample[];
}

interface ExecuteResponse {
  imported: number;
  skipped: number;
  errors: string[];
  total: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function typeLabel(type: string) {
  switch (type) {
    case "incoming": return { label: "Entrata", cls: "bg-blue-50 text-blue-700 border-blue-200" };
    case "outgoing": return { label: "Uscita", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "internal": return { label: "Interno", cls: "bg-slate-100 text-slate-700 border-slate-200" };
    default: return { label: type, cls: "bg-gray-50 text-gray-500 border-gray-200" };
  }
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy", { locale: it }); } catch { return d; }
}

// ─── Step indicators ──────────────────────────────────────────────────────────
function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${active ? "text-blue-700 font-semibold" : done ? "text-emerald-600" : "text-slate-400"}`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${active ? "border-blue-600 bg-blue-600 text-white" : done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-slate-400"}`}>
        {done ? "✓" : n}
      </div>
      {label}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ImportPage() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [csvText, setCsvText] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<ExecuteResponse | null>(null);
  const [keepOriginalNumbers, setKeepOriginalNumbers] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingExecute, setLoadingExecute] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // ── File loading ────────────────────────────────────────────────────────────
  const loadFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast({ variant: "destructive", title: "Formato non valido", description: "Seleziona un file .csv" });
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      setCsvText(text);
      handlePreview(text);
    };
    reader.readAsText(file, "utf-8");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }, [loadFile]);

  // ── Preview ─────────────────────────────────────────────────────────────────
  async function handlePreview(csv: string) {
    setLoadingPreview(true);
    try {
      const res = await fetch("/api/admin/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Errore sconosciuto" }));
        throw new Error(err.error ?? "Errore");
      }
      const data: PreviewResponse = await res.json();
      setPreview(data);
      setStep("preview");
    } catch (err) {
      toast({ variant: "destructive", title: "Errore analisi CSV", description: String(err) });
    } finally {
      setLoadingPreview(false);
    }
  }

  // ── Execute ─────────────────────────────────────────────────────────────────
  async function handleExecute() {
    setLoadingExecute(true);
    try {
      const res = await fetch("/api/admin/import/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText, keepOriginalNumbers, skipDuplicates }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Errore sconosciuto" }));
        throw new Error(err.error ?? "Errore");
      }
      const data: ExecuteResponse = await res.json();
      setResult(data);
      setStep("done");
    } catch (err) {
      toast({ variant: "destructive", title: "Errore importazione", description: String(err) });
    } finally {
      setLoadingExecute(false);
    }
  }

  // ── Reset ───────────────────────────────────────────────────────────────────
  function reset() {
    setStep("upload");
    setCsvText("");
    setFileName("");
    setPreview(null);
    setResult(null);
    setKeepOriginalNumbers(true);
    setSkipDuplicates(true);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-auto bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Upload className="w-5 h-5 text-slate-600" />
          <div>
            <h1 className="text-base font-semibold text-slate-900">Import da Regystrum</h1>
            <p className="text-xs text-slate-500">Migra i protocolli dal vecchio sistema CSV</p>
          </div>
        </div>
      </div>

      {/* Step bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-6 text-sm flex-shrink-0">
        <Step n={1} label="Carica file" active={step === "upload"} done={step !== "upload"} />
        <ChevronRight className="w-4 h-4 text-slate-300" />
        <Step n={2} label="Anteprima e opzioni" active={step === "preview"} done={step === "done"} />
        <ChevronRight className="w-4 h-4 text-slate-300" />
        <Step n={3} label="Risultato" active={step === "done"} done={false} />
      </div>

      <div className="flex-1 overflow-auto p-6">

        {/* ── STEP 1: Upload ── */}
        {step === "upload" && (
          <div className="max-w-xl mx-auto">
            <div
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${dragOver ? "border-blue-400 bg-blue-50" : "border-slate-300 bg-white hover:border-slate-400"}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              {loadingPreview ? (
                <RefreshCw className="w-10 h-10 mx-auto text-blue-500 animate-spin mb-3" />
              ) : (
                <Upload className="w-10 h-10 mx-auto text-slate-400 mb-3" />
              )}
              <p className="text-sm font-medium text-slate-700">
                {loadingPreview ? "Analisi in corso…" : "Trascina qui il file CSV di Regystrum"}
              </p>
              <p className="text-xs text-slate-400 mt-1">oppure clicca per selezionarlo</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); }}
              />
            </div>
            <div className="mt-4 rounded-lg bg-blue-50 border border-blue-100 p-4 flex gap-3">
              <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-blue-700 space-y-1">
                <p className="font-medium">Formato atteso: export CSV di Regystrum</p>
                <p>Colonne: Numero, Suffisso, Data, Titolo, Descrizione, Stato, Creato da, Assegnato per conoscenza, Assegnato per competenza, Ufficio, Tipologia, Operatore, Ufficio, Circolazione, Sezione, Nome file, Note, Impronta</p>
                <p>Lo stato di ogni protocollo importato verrà impostato a <strong>Importato</strong> indipendentemente dal valore originale.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Preview & Options ── */}
        {step === "preview" && preview && (
          <div className="max-w-4xl mx-auto space-y-5">
            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Protocolli trovati", value: preview.total, color: "text-slate-800" },
                { label: "Allegati elencati", value: preview.totalAttachments, color: "text-slate-600" },
                { label: "Conflitti", value: preview.conflicts.length, color: preview.conflicts.length > 0 ? "text-amber-600" : "text-emerald-600" },
                { label: "Periodo", value: preview.dateRange.min ? `${fmtDate(preview.dateRange.min)} – ${fmtDate(preview.dateRange.max)}` : "—", color: "text-slate-600" },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-lg border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">{s.label}</p>
                  <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Type breakdown */}
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-medium text-slate-600 mb-3">Distribuzione per tipo</p>
              <div className="flex gap-4">
                {[
                  { type: "incoming", count: preview.byType.incoming },
                  { type: "outgoing", count: preview.byType.outgoing },
                  { type: "internal", count: preview.byType.internal },
                ].map(({ type, count }) => {
                  const t = typeLabel(type);
                  return (
                    <div key={type} className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${t.cls}`}>{t.label}</Badge>
                      <span className="text-sm font-semibold text-slate-700">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Options */}
            <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-800">Opzioni di importazione</h3>

              {/* Numbering option */}
              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-slate-600">Numerazione protocolli</legend>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="numbering"
                    checked={keepOriginalNumbers}
                    onChange={() => setKeepOriginalNumbers(true)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-800 group-hover:text-blue-700">Mantieni numerazione originale</p>
                    <p className="text-xs text-slate-500">I protocolli mantengono il numero Regystrum (es. <code className="bg-slate-100 px-1 rounded">AIM-2026-00108</code>)</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="numbering"
                    checked={!keepOriginalNumbers}
                    onChange={() => setKeepOriginalNumbers(false)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-800 group-hover:text-blue-700">Rigenera con nuovo formato</p>
                    <p className="text-xs text-slate-500">Assegna numeri nel formato ProtocolloDigitale (es. <code className="bg-slate-100 px-1 rounded">AIM-2026-E-000109</code>). Il numero originale viene salvato nelle note.</p>
                  </div>
                </label>
              </fieldset>

              {/* Duplicate option */}
              <div className="border-t border-slate-100 pt-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={e => setSkipDuplicates(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-800">Salta duplicati</p>
                    <p className="text-xs text-slate-500">
                      {preview.conflicts.length > 0
                        ? `${preview.conflicts.length} protocolli con lo stesso numero esistono già nel sistema e verranno saltati.`
                        : "Nessun conflitto rilevato — tutti i protocolli sono nuovi."}
                    </p>
                  </div>
                </label>
                {preview.conflicts.length > 0 && (
                  <div className="mt-2 ml-6 text-xs text-amber-700 bg-amber-50 rounded p-2 border border-amber-100">
                    Numeri già presenti: {preview.conflicts.slice(0, 5).join(", ")}
                    {preview.conflicts.length > 5 && ` e altri ${preview.conflicts.length - 5}`}
                  </div>
                )}
              </div>
            </div>

            {/* Sample table */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-xs font-medium text-slate-600">
                  Anteprima primi {preview.sample.length} protocolli di {preview.total}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2 text-slate-500 font-medium w-36">Numero originale</th>
                      <th className="text-left px-3 py-2 text-slate-500 font-medium w-24">Data</th>
                      <th className="text-left px-3 py-2 text-slate-500 font-medium w-20">Tipo</th>
                      <th className="text-left px-3 py-2 text-slate-500 font-medium">Oggetto</th>
                      <th className="text-left px-3 py-2 text-slate-500 font-medium w-28">Mittente</th>
                      <th className="text-left px-3 py-2 text-slate-500 font-medium w-16">Allegati</th>
                      <th className="text-left px-3 py-2 text-slate-500 font-medium w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map(row => {
                      const t = typeLabel(row.type);
                      return (
                        <tr key={row.originalNumber} className={`border-b border-slate-50 ${row.isDuplicate ? "bg-amber-50" : ""}`}>
                          <td className="px-4 py-2 font-mono text-slate-700">{row.originalNumber}</td>
                          <td className="px-3 py-2 text-slate-500">{fmtDate(row.date)}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className={`text-xs ${t.cls}`}>{t.label}</Badge>
                          </td>
                          <td className="px-3 py-2 text-slate-700 max-w-xs truncate" title={row.subject}>{row.subject}</td>
                          <td className="px-3 py-2 text-slate-500 truncate max-w-[7rem]" title={row.sender}>{row.sender || "—"}</td>
                          <td className="px-3 py-2 text-slate-500 text-center">{row.attachmentCount || "—"}</td>
                          <td className="px-3 py-2">
                            {row.isDuplicate && (
                              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">duplicato</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={reset}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Cambia file
              </Button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">
                  {skipDuplicates
                    ? `${preview.total - preview.conflicts.length} protocolli verranno importati`
                    : `${preview.total} protocolli verranno importati`}
                </span>
                <Button
                  onClick={handleExecute}
                  disabled={loadingExecute}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {loadingExecute
                    ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Importazione…</>
                    : <><Upload className="w-4 h-4 mr-2" /> Avvia importazione</>}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: Result ── */}
        {step === "done" && result && (
          <div className="max-w-xl mx-auto space-y-5">
            <div className={`rounded-xl p-6 border ${result.errors.length === 0 ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
              <div className="flex items-center gap-3 mb-4">
                {result.errors.length === 0
                  ? <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                  : <AlertTriangle className="w-7 h-7 text-amber-600" />}
                <div>
                  <h2 className="text-base font-semibold text-slate-800">Importazione completata</h2>
                  <p className="text-xs text-slate-500">{fileName}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Importati", value: result.imported, icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" /> },
                  { label: "Saltati", value: result.skipped, icon: <Info className="w-4 h-4 text-slate-400" /> },
                  { label: "Errori", value: result.errors.length, icon: <XCircle className="w-4 h-4 text-red-500" /> },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-lg p-3 border border-white/60">
                    <div className="flex items-center gap-1.5 mb-1">{s.icon}<p className="text-xs text-slate-500">{s.label}</p></div>
                    <p className="text-2xl font-bold text-slate-800">{s.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="bg-white rounded-lg border border-red-200 overflow-hidden">
                <div className="px-4 py-3 bg-red-50 border-b border-red-100">
                  <p className="text-xs font-medium text-red-700">Righe con errore ({result.errors.length})</p>
                </div>
                <ul className="divide-y divide-red-50 max-h-48 overflow-auto">
                  {result.errors.map((e, i) => (
                    <li key={i} className="px-4 py-2 text-xs text-red-600 font-mono">{e}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" size="sm" onClick={reset} className="flex-1">
                <Upload className="w-4 h-4 mr-1" /> Importa un altro file
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => window.location.href = "/protocols"}
              >
                <FileText className="w-4 h-4 mr-1" /> Vai ai protocolli
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
