import React, { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  RefreshCw,
  Play,
  Trash2,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Hash,
  Calendar,
  ChevronDown,
  ChevronUp,
  Eye,
  X,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface IntegrityStatus {
  totalProtocols: number;
  withHash: number;
  withoutHash: number;
  lastRun: CheckLog | null;
}

interface ProtocolEntry {
  id: number;
  number: string;
  type: string;
  status: string;
  subject: string;
  registeredAt: string | null;
  hasHash: boolean;
  integrityHash: string | null;
  computedAt: string | null;
  triggeredBy: string | null;
}

interface VerifyResult {
  protocolId: number;
  protocolNumber: string;
  status: "valid" | "invalid" | "uncomputed" | "error";
  reason?: string;
  storedHash?: string;
  currentHash?: string;
  computedAt?: string;
}

interface CheckLog {
  id: number;
  scheduleId: number | null;
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
  total: number;
  valid: number;
  invalid: number;
  skipped: number;
  status: "running" | "completed" | "failed";
  details: VerifyResult[];
}

interface Schedule {
  id: number;
  name: string;
  frequency: string;
  cronExpression: string;
  hour: number;
  minute: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const API = "/api";

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText })) as { error?: string };
    throw new Error(err.error ?? r.statusText);
  }
  return r.json() as Promise<T>;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: it });
}

function fmtFrequency(s: Schedule) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const t = `${pad(s.hour)}:${pad(s.minute)}`;
  const days = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
  const months = ["", "Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
  switch (s.frequency) {
    case "once":    return `Una volta (manuale) alle ${t}`;
    case "daily":   return `Ogni giorno alle ${t}`;
    case "weekly":  return `Ogni settimana (${days[s.dayOfWeek ?? 1]}) alle ${t}`;
    case "monthly": return `Ogni mese il giorno ${s.dayOfMonth ?? 1} alle ${t}`;
    case "yearly":  return `Ogni anno (${months[s.monthOfYear ?? 1]} ${s.dayOfMonth ?? 1}) alle ${t}`;
    default:        return s.cronExpression;
  }
}

// ─── Status Badge ──────────────────────────────────────────────────────────────

function IntegrityBadge({ status }: { status: VerifyResult["status"] | "running" | "completed" | "failed" }) {
  switch (status) {
    case "valid":
      return <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3 h-3 mr-1" />Valida</Badge>;
    case "invalid":
      return <Badge className="bg-red-50 text-red-700 border border-red-200"><XCircle className="w-3 h-3 mr-1" />Modificata</Badge>;
    case "uncomputed":
      return <Badge className="bg-slate-50 text-slate-600 border border-slate-200"><Shield className="w-3 h-3 mr-1" />Non calcolata</Badge>;
    case "error":
      return <Badge className="bg-amber-50 text-amber-700 border border-amber-200"><AlertTriangle className="w-3 h-3 mr-1" />Errore</Badge>;
    case "completed":
      return <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3 h-3 mr-1" />Completata</Badge>;
    case "running":
      return <Badge className="bg-blue-50 text-blue-700 border border-blue-200"><RefreshCw className="w-3 h-3 mr-1 animate-spin" />In corso</Badge>;
    case "failed":
      return <Badge className="bg-red-50 text-red-700 border border-red-200"><XCircle className="w-3 h-3 mr-1" />Fallita</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

// ─── Schedule Form ─────────────────────────────────────────────────────────────

interface ScheduleFormData {
  name: string;
  frequency: string;
  hour: number;
  minute: number;
  dayOfWeek: number;
  dayOfMonth: number;
  monthOfYear: number;
  enabled: boolean;
}

const defaultForm: ScheduleFormData = {
  name: "",
  frequency: "weekly",
  hour: 2,
  minute: 0,
  dayOfWeek: 1,
  dayOfMonth: 1,
  monthOfYear: 1,
  enabled: true,
};

function ScheduleForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<ScheduleFormData>;
  onSave: (data: ScheduleFormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ScheduleFormData>({ ...defaultForm, ...initial });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ScheduleFormData>(k: K, v: ScheduleFormData[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  const days = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  const monthNames = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Nome</label>
        <input
          className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
          value={form.name}
          onChange={e => set("name", e.target.value)}
          placeholder="es. Verifica settimanale notturna"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Frequenza</label>
          <select
            className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            value={form.frequency}
            onChange={e => set("frequency", e.target.value)}
          >
            <option value="once">Una sola volta (manuale)</option>
            <option value="daily">Ogni giorno</option>
            <option value="weekly">Ogni settimana</option>
            <option value="monthly">Ogni mese</option>
            <option value="yearly">Ogni anno</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Ora</label>
            <input type="number" min={0} max={23}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
              value={form.hour} onChange={e => set("hour", Number(e.target.value))} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Minuti</label>
            <input type="number" min={0} max={59}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
              value={form.minute} onChange={e => set("minute", Number(e.target.value))} />
          </div>
        </div>
      </div>

      {form.frequency === "weekly" && (
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Giorno della settimana</label>
          <select className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            value={form.dayOfWeek} onChange={e => set("dayOfWeek", Number(e.target.value))}>
            {days.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
      )}

      {(form.frequency === "monthly" || form.frequency === "yearly") && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Giorno del mese</label>
            <input type="number" min={1} max={31}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
              value={form.dayOfMonth} onChange={e => set("dayOfMonth", Number(e.target.value))} />
          </div>
          {form.frequency === "yearly" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Mese</label>
              <select className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                value={form.monthOfYear} onChange={e => set("monthOfYear", Number(e.target.value))}>
                {monthNames.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input type="checkbox" id="enabled" checked={form.enabled}
          onChange={e => set("enabled", e.target.checked)} className="rounded" />
        <label htmlFor="enabled" className="text-sm">Abilitata</label>
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleSave} disabled={saving || !form.name.trim()}>
          {saving ? <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" /> : null}
          Salva
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Annulla</Button>
      </div>
    </div>
  );
}

// ─── Log Detail Modal ──────────────────────────────────────────────────────────

function LogDetailModal({ log, onClose }: { log: CheckLog; onClose: () => void }) {
  const [filter, setFilter] = useState<string>("all");
  const details = (log.details ?? []) as VerifyResult[];

  const filtered = filter === "all" ? details : details.filter(d => d.status === filter);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h2 className="font-semibold text-sm">Dettaglio verifica #{log.id}</h2>
            <p className="text-xs text-muted-foreground">{fmtDate(log.startedAt)} — {log.triggeredBy === "schedule" ? "schedulata" : "manuale"}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-md"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-3 border-b border-border flex items-center gap-4 text-xs">
          <span className="font-medium">Totale: {log.total}</span>
          <span className="text-emerald-600">✓ Validi: {log.valid}</span>
          <span className="text-red-600">✗ Modificati: {log.invalid}</span>
          <span className="text-slate-500">— Non calcolati: {log.skipped}</span>
        </div>

        <div className="px-5 py-2 border-b border-border flex gap-1.5">
          {(["all", "valid", "invalid", "uncomputed", "error"] as const).map(f => (
            <button key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}>
              {f === "all" ? "Tutti" : f === "valid" ? "Validi" : f === "invalid" ? "Modificati" : f === "uncomputed" ? "Non calcolati" : "Errori"}
              {f !== "all" && <span className="ml-1 opacity-70">({details.filter(d => d.status === f).length})</span>}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Numero</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Stato</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Dettaglio</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.protocolId} className="border-t border-border/50 hover:bg-muted/30">
                  <td className="px-4 py-2 font-mono">{d.protocolNumber}</td>
                  <td className="px-4 py-2"><IntegrityBadge status={d.status} /></td>
                  <td className="px-4 py-2 text-muted-foreground max-w-sm truncate" title={d.reason}>{d.reason ?? "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Nessun risultato</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Tab = "protocols" | "schedules" | "logs";

export default function IntegrityPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("protocols");

  // ── Status summary
  const [status, setStatus] = useState<IntegrityStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  // ── Protocols tab
  const [protocols, setProtocols] = useState<ProtocolEntry[]>([]);
  const [loadingProtocols, setLoadingProtocols] = useState(false);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [computingId, setComputingId] = useState<number | null>(null);
  const [verifyResults, setVerifyResults] = useState<Record<number, VerifyResult>>({});
  const [verifyingAll, setVerifyingAll] = useState(false);
  const [computingAll, setComputingAll] = useState(false);
  const [protocolFilter, setProtocolFilter] = useState<string>("all");

  // ── Schedules tab
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [showNewScheduleForm, setShowNewScheduleForm] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null);
  const [runningScheduleId, setRunningScheduleId] = useState<number | null>(null);

  // ── Logs tab
  const [logs, setLogs] = useState<CheckLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [selectedLog, setSelectedLog] = useState<CheckLog | null>(null);

  // ── Fetch helpers ─────────────────────────────────────────────────────────────

  const fetchStatus = async () => {
    setLoadingStatus(true);
    try { setStatus(await apiFetch<IntegrityStatus>("/admin/integrity/status")); }
    catch (e) { toast({ title: "Errore", description: String(e), variant: "destructive" }); }
    finally { setLoadingStatus(false); }
  };

  const fetchProtocols = async () => {
    setLoadingProtocols(true);
    try { setProtocols(await apiFetch<ProtocolEntry[]>("/admin/integrity/protocols")); }
    catch (e) { toast({ title: "Errore", description: String(e), variant: "destructive" }); }
    finally { setLoadingProtocols(false); }
  };

  const fetchSchedules = async () => {
    setLoadingSchedules(true);
    try { setSchedules(await apiFetch<Schedule[]>("/admin/integrity/schedules")); }
    catch (e) { toast({ title: "Errore", description: String(e), variant: "destructive" }); }
    finally { setLoadingSchedules(false); }
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try { setLogs(await apiFetch<CheckLog[]>("/admin/integrity/logs?limit=50")); }
    catch (e) { toast({ title: "Errore", description: String(e), variant: "destructive" }); }
    finally { setLoadingLogs(false); }
  };

  // ── Initial load ──────────────────────────────────────────────────────────────

  React.useEffect(() => {
    fetchStatus();
  }, []);

  React.useEffect(() => {
    if (tab === "protocols") fetchProtocols();
    if (tab === "schedules") fetchSchedules();
    if (tab === "logs") fetchLogs();
  }, [tab]);

  // ── Protocols actions ─────────────────────────────────────────────────────────

  const handleComputeOne = async (p: ProtocolEntry) => {
    setComputingId(p.id);
    try {
      await apiFetch(`/admin/integrity/compute/${p.id}`, { method: "POST" });
      toast({ title: "Impronta calcolata", description: `${p.number}: impronta registrata con successo.` });
      await Promise.all([fetchProtocols(), fetchStatus()]);
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    } finally {
      setComputingId(null);
    }
  };

  const handleVerifyOne = async (p: ProtocolEntry) => {
    setVerifyingId(p.id);
    try {
      const r = await apiFetch<VerifyResult>(`/admin/integrity/verify/${p.id}`);
      setVerifyResults(prev => ({ ...prev, [p.id]: r }));
      if (r.status === "valid") toast({ title: "Integrità verificata ✓", description: `${p.number}: nessuna modifica rilevata.` });
      else if (r.status === "invalid") toast({ title: "⚠ Integrità violata!", description: `${p.number}: ${r.reason}`, variant: "destructive" });
      else if (r.status === "uncomputed") toast({ title: "Impronta mancante", description: `Calcola prima l'impronta di ${p.number}.` });
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    } finally {
      setVerifyingId(null);
    }
  };

  const handleComputeAll = async () => {
    setComputingAll(true);
    try {
      const r = await apiFetch<{ computed: number; total: number; errors: string[] }>("/admin/integrity/compute-all", { method: "POST" });
      toast({ title: "Calcolo completato", description: `${r.computed}/${r.total} protocolli elaborati.` });
      await Promise.all([fetchProtocols(), fetchStatus()]);
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    } finally {
      setComputingAll(false);
    }
  };

  const handleVerifyAll = async () => {
    setVerifyingAll(true);
    try {
      await apiFetch("/admin/integrity/verify-all", { method: "POST" });
      toast({ title: "Verifica avviata", description: "Verifica in corso in background. Controlla il log per i risultati." });
      setTimeout(() => fetchLogs(), 3000);
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    } finally {
      setVerifyingAll(false);
    }
  };

  // ── Schedule actions ──────────────────────────────────────────────────────────

  const handleCreateSchedule = async (data: ScheduleFormData) => {
    try {
      await apiFetch("/admin/integrity/schedules", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Schedule creata" });
      setShowNewScheduleForm(false);
      fetchSchedules();
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    }
  };

  const handleUpdateSchedule = async (id: number, data: ScheduleFormData) => {
    try {
      await apiFetch(`/admin/integrity/schedules/${id}`, { method: "PUT", body: JSON.stringify(data) });
      toast({ title: "Schedule aggiornata" });
      setEditingScheduleId(null);
      fetchSchedules();
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    }
  };

  const handleDeleteSchedule = async (id: number) => {
    if (!confirm("Eliminare questa schedule?")) return;
    try {
      await apiFetch(`/admin/integrity/schedules/${id}`, { method: "DELETE" });
      toast({ title: "Schedule eliminata" });
      fetchSchedules();
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    }
  };

  const handleRunScheduleNow = async (id: number) => {
    setRunningScheduleId(id);
    try {
      await apiFetch(`/admin/integrity/schedules/${id}/run`, { method: "POST" });
      toast({ title: "Verifica avviata", description: "Il risultato apparirà nel Log verifiche." });
      setTimeout(() => { fetchLogs(); setTab("logs"); }, 2000);
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    } finally {
      setRunningScheduleId(null);
    }
  };

  // ── Filtered protocols ────────────────────────────────────────────────────────

  const filteredProtocols = protocols.filter(p => {
    if (protocolFilter === "all") return true;
    if (protocolFilter === "no-hash") return !p.hasHash;
    const r = verifyResults[p.id];
    if (protocolFilter === "invalid") return r?.status === "invalid";
    if (protocolFilter === "valid") return r?.status === "valid";
    return true;
  });

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-y-auto">
      {selectedLog && <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />}

      <div className="p-6 max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Integrità Protocolli</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Calcolo e verifica dell'impronta crittografica di ogni protocollo e dei suoi allegati
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleComputeAll} disabled={computingAll}>
              {computingAll ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Hash className="w-3.5 h-3.5 mr-1.5" />}
              Calcola tutte
            </Button>
            <Button size="sm" onClick={handleVerifyAll} disabled={verifyingAll}>
              {verifyingAll ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />}
              Verifica tutti ora
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        {status && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-2xl font-bold text-foreground">{status.totalProtocols}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Protocolli totali</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-2xl font-bold text-emerald-600">{status.withHash}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Con impronta</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-2xl font-bold text-amber-600">{status.withoutHash}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Senza impronta</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-xs text-muted-foreground mb-1">Ultima verifica</div>
              {status.lastRun ? (
                <>
                  <IntegrityBadge status={status.lastRun.status} />
                  <div className="text-xs text-muted-foreground mt-1">{fmtDate(status.lastRun.completedAt)}</div>
                  <div className="text-xs mt-0.5">
                    <span className="text-emerald-600">✓{status.lastRun.valid}</span>
                    {" "}<span className="text-red-600">✗{status.lastRun.invalid}</span>
                    {" "}<span className="text-slate-500">—{status.lastRun.skipped}</span>
                  </div>
                </>
              ) : <div className="text-xs text-muted-foreground">Mai eseguita</div>}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-border">
          <div className="flex gap-0">
            {([
              ["protocols", "Protocolli"],
              ["schedules", "Schedule"],
              ["logs", "Log verifiche"],
            ] as [Tab, string][]).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Protocols Tab ─────────────────────────────────────────────────────── */}
        {tab === "protocols" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <select
                className="border border-border rounded-md px-3 py-1.5 text-sm bg-background"
                value={protocolFilter}
                onChange={e => setProtocolFilter(e.target.value)}
              >
                <option value="all">Tutti</option>
                <option value="no-hash">Senza impronta</option>
                <option value="valid">Verificati ✓</option>
                <option value="invalid">Modificati ✗</option>
              </select>
              <Button variant="ghost" size="sm" onClick={fetchProtocols} disabled={loadingProtocols}>
                <RefreshCw className={`w-3.5 h-3.5 ${loadingProtocols ? "animate-spin" : ""}`} />
              </Button>
              <span className="text-xs text-muted-foreground ml-auto">{filteredProtocols.length} protocolli</span>
            </div>

            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Numero</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Oggetto</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Impronta</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Calcolata il</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Verifica</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {loadingProtocols ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">Caricamento…</td></tr>
                  ) : filteredProtocols.map(p => {
                    const vr = verifyResults[p.id];
                    return (
                      <tr key={p.id} className="border-t border-border/60 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-xs font-medium">{p.number}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-xs truncate" title={p.subject}>{p.subject}</td>
                        <td className="px-4 py-2.5">
                          {p.hasHash ? (
                            <span className="font-mono text-xs text-muted-foreground" title={p.integrityHash ?? ""}>
                              {p.integrityHash?.slice(0, 12)}…
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/60 italic">non calcolata</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDate(p.computedAt)}</td>
                        <td className="px-4 py-2.5">
                          {vr ? <IntegrityBadge status={vr.status} /> : (
                            p.hasHash
                              ? <span className="text-xs text-muted-foreground/50">—</span>
                              : <span className="text-xs text-muted-foreground/50">—</span>
                          )}
                          {vr?.reason && (
                            <div className="text-xs text-muted-foreground mt-0.5 max-w-xs truncate" title={vr.reason}>{vr.reason}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 justify-end">
                            <Button variant="ghost" size="sm"
                              className="h-6 px-2 text-xs"
                              disabled={computingId === p.id}
                              onClick={() => handleComputeOne(p)}
                              title="Calcola / aggiorna impronta"
                            >
                              {computingId === p.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Hash className="w-3 h-3" />}
                            </Button>
                            <Button variant="ghost" size="sm"
                              className="h-6 px-2 text-xs"
                              disabled={!p.hasHash || verifyingId === p.id}
                              onClick={() => handleVerifyOne(p)}
                              title="Verifica integrità"
                            >
                              {verifyingId === p.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!loadingProtocols && filteredProtocols.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">Nessun protocollo</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Schedules Tab ─────────────────────────────────────────────────────── */}
        {tab === "schedules" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Configura le verifiche automatiche periodiche</p>
              <Button size="sm" onClick={() => { setShowNewScheduleForm(true); setEditingScheduleId(null); }}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />Nuova schedule
              </Button>
            </div>

            {showNewScheduleForm && (
              <div className="bg-card border border-border rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-3">Nuova schedule di verifica</h3>
                <ScheduleForm
                  onSave={handleCreateSchedule}
                  onCancel={() => setShowNewScheduleForm(false)}
                />
              </div>
            )}

            {loadingSchedules ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Caricamento…</div>
            ) : schedules.length === 0 ? (
              <div className="bg-card border border-dashed border-border rounded-lg p-8 text-center">
                <Calendar className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nessuna schedule configurata</p>
                <p className="text-xs text-muted-foreground mt-1">Crea una schedule per automatizzare le verifiche di integrità</p>
              </div>
            ) : (
              <div className="space-y-2">
                {schedules.map(s => (
                  <div key={s.id} className="bg-card border border-border rounded-lg overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.enabled ? "bg-emerald-500" : "bg-slate-300"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{fmtFrequency(s)}</div>
                        {s.lastRunAt && (
                          <div className="text-xs text-muted-foreground">Ultima esecuzione: {fmtDate(s.lastRunAt)}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button variant="ghost" size="sm" className="h-7 px-2"
                          disabled={runningScheduleId === s.id}
                          onClick={() => handleRunScheduleNow(s.id)}
                          title="Esegui ora">
                          {runningScheduleId === s.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2"
                          onClick={() => setEditingScheduleId(editingScheduleId === s.id ? null : s.id)}
                          title="Modifica">
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${editingScheduleId === s.id ? "rotate-180" : ""}`} />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteSchedule(s.id)}
                          title="Elimina">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    {editingScheduleId === s.id && (
                      <div className="border-t border-border px-4 py-3 bg-muted/20">
                        <ScheduleForm
                          initial={{
                            name: s.name, frequency: s.frequency,
                            hour: s.hour, minute: s.minute,
                            dayOfWeek: s.dayOfWeek ?? 1,
                            dayOfMonth: s.dayOfMonth ?? 1,
                            monthOfYear: s.monthOfYear ?? 1,
                            enabled: s.enabled,
                          }}
                          onSave={(data) => handleUpdateSchedule(s.id, data)}
                          onCancel={() => setEditingScheduleId(null)}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Logs Tab ──────────────────────────────────────────────────────────── */}
        {tab === "logs" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Storico delle verifiche eseguite (manuali e automatiche)</p>
              <Button variant="ghost" size="sm" onClick={fetchLogs} disabled={loadingLogs}>
                <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Data</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipo</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stato</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Risultati</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Durata</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {loadingLogs ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">Caricamento…</td></tr>
                  ) : logs.map(log => {
                    const duration = log.completedAt
                      ? Math.round((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 1000)
                      : null;
                    return (
                      <tr key={log.id} className="border-t border-border/60 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 text-xs">{fmtDate(log.startedAt)}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className="text-xs">
                            {log.triggeredBy === "schedule" ? "Automatica" : "Manuale"}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5"><IntegrityBadge status={log.status} /></td>
                        <td className="px-4 py-2.5 text-xs">
                          {log.status !== "running" ? (
                            <span>
                              <span className="text-emerald-600 font-medium">✓{log.valid}</span>
                              {" "}<span className="text-red-600 font-medium">✗{log.invalid}</span>
                              {" "}<span className="text-slate-500">—{log.skipped}</span>
                              {" "}<span className="text-muted-foreground">/{log.total}</span>
                            </span>
                          ) : <span className="text-muted-foreground">In corso…</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {duration !== null ? `${duration}s` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {log.status === "completed" && (
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
                              onClick={() => setSelectedLog(log)}>
                              <Eye className="w-3 h-3 mr-1" />Dettagli
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!loadingLogs && logs.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">Nessuna verifica eseguita</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
