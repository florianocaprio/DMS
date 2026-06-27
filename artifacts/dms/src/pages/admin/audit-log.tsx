import React, { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList, RefreshCw, ChevronLeft, ChevronRight,
  Eye, Plus, Pencil, Trash2, Search, Filter, Download,
} from "lucide-react";

interface AuditEntry {
  id: number;
  timestamp: string;
  action: string;
  entityType: string | null;
  entityId: number | null;
  userId: number | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestBody: unknown;
  description: string | null;
}

interface Pagination {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface Stats {
  since: string;
  stats: { READ: number; CREATE: number; UPDATE: number; DELETE: number };
}

const ACTION_CONFIG = {
  READ:   { label: "Lettura",      icon: Eye,    cls: "bg-slate-100 text-slate-600 border-slate-200" },
  CREATE: { label: "Creazione",    icon: Plus,   cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  UPDATE: { label: "Aggiornamento",icon: Pencil, cls: "bg-amber-50 text-amber-700 border-amber-200" },
  DELETE: { label: "Eliminazione", icon: Trash2, cls: "bg-red-50 text-red-600 border-red-200" },
} as const;

const ENTITY_LABELS: Record<string, string> = {
  protocol: "Protocollo", document: "Documento", dossier: "Fascicolo",
  user: "Utente", classification: "Classificazione", task: "Attività",
  workflow: "Workflow", signature: "Firma", attachment: "Allegato",
  settings: "Impostazioni", search: "Ricerca", dashboard: "Dashboard",
  drive: "Drive",
};

function ActionBadge({ action }: { action: string }) {
  const cfg = ACTION_CONFIG[action as keyof typeof ACTION_CONFIG];
  if (!cfg) return <Badge variant="outline" className="text-xs">{action}</Badge>;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`text-xs gap-1 ${cfg.cls}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </Badge>
  );
}

function StatusBadge({ code }: { code: number }) {
  const ok = code >= 200 && code < 300;
  const warn = code >= 300 && code < 400;
  return (
    <span className={`text-xs font-mono font-semibold ${ok ? "text-emerald-600" : warn ? "text-amber-500" : "text-red-500"}`}>
      {code}
    </span>
  );
}

async function fetchLog(params: Record<string, string>): Promise<{ data: AuditEntry[]; pagination: Pagination }> {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  const res = await fetch(`/api/admin/audit-log?${qs}`);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function fetchStats(): Promise<Stats> {
  const res = await fetch("/api/admin/audit-log/stats");
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  const [filters, setFilters] = useState({
    action: "", entityType: "", status: "", q: "", page: "1",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [result, s] = await Promise.all([fetchLog(filters), fetchStats()]);
      setRows(result.data);
      setPagination(result.pagination);
      setStats(s);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  function setFilter(k: keyof typeof filters, v: string) {
    setFilters(f => ({ ...f, [k]: v, page: k !== "page" ? "1" : v }));
  }

  function exportCsv() {
    const header = "id,timestamp,azione,entità,entità_id,metodo,path,stato,durata_ms,ip,descrizione";
    const body = rows.map(r => [
      r.id, r.timestamp, r.action, r.entityType ?? "", r.entityId ?? "",
      r.method, r.path, r.statusCode, r.durationMs ?? "", r.ipAddress ?? "",
      `"${(r.description ?? "").replace(/"/g, '""')}"`,
    ].join(",")).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-slate-500" />
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Audit Log</h1>
            <p className="text-xs text-slate-500 mt-0.5">Registro completo di tutte le operazioni sulla piattaforma</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5 text-xs" disabled={rows.length === 0}>
            <Download className="w-3.5 h-3.5" />
            Esporta CSV
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5 text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Aggiorna
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      {stats && (
        <div className="px-6 py-2 border-b border-slate-100 bg-slate-50 flex items-center gap-6 flex-shrink-0">
          <span className="text-xs text-slate-500">Ultime 24h:</span>
          {(["READ","CREATE","UPDATE","DELETE"] as const).map(a => {
            const Icon = ACTION_CONFIG[a].icon;
            return (
              <span key={a} className="flex items-center gap-1.5 text-xs">
                <Icon className="w-3 h-3 text-slate-400" />
                <span className="text-slate-600 font-medium">{stats.stats[a] ?? 0}</span>
                <span className="text-slate-400">{ACTION_CONFIG[a].label}</span>
              </span>
            );
          })}
          {pagination && (
            <span className="ml-auto text-xs text-slate-400">
              {pagination.total} operazioni totali
            </span>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-3 flex-shrink-0 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <Input
            value={filters.q}
            onChange={e => setFilter("q", e.target.value)}
            placeholder="Cerca descrizione o path…"
            className="pl-8 h-8 text-xs w-52"
          />
        </div>

        <Select value={filters.action || "all"} onValueChange={v => setFilter("action", v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 text-xs w-40">
            <SelectValue placeholder="Tutte le azioni" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le azioni</SelectItem>
            <SelectItem value="READ">Lettura</SelectItem>
            <SelectItem value="CREATE">Creazione</SelectItem>
            <SelectItem value="UPDATE">Aggiornamento</SelectItem>
            <SelectItem value="DELETE">Eliminazione</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.entityType || "all"} onValueChange={v => setFilter("entityType", v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 text-xs w-44">
            <SelectValue placeholder="Tutti i tipi" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i tipi</SelectItem>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.status || "all"} onValueChange={v => setFilter("status", v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="Tutti gli stati" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="success">Solo successi (2xx)</SelectItem>
            <SelectItem value="error">Solo errori (4xx/5xx)</SelectItem>
          </SelectContent>
        </Select>

        {(filters.action || filters.entityType || filters.status || filters.q) && (
          <Button variant="ghost" size="sm" className="text-xs h-8 text-slate-500"
            onClick={() => setFilters({ action: "", entityType: "", status: "", q: "", page: "1" })}>
            Reset filtri
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-slate-400">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Caricamento…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-400 gap-2">
            <ClipboardList className="w-8 h-8" />
            <p className="text-sm">Nessuna operazione registrata</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 z-10">
              <tr>
                <th className="text-left px-4 py-2.5 text-slate-500 font-medium w-36">Data e ora</th>
                <th className="text-left px-3 py-2.5 text-slate-500 font-medium w-32">Azione</th>
                <th className="text-left px-3 py-2.5 text-slate-500 font-medium w-32">Entità</th>
                <th className="text-left px-3 py-2.5 text-slate-500 font-medium">Descrizione</th>
                <th className="text-left px-3 py-2.5 text-slate-500 font-medium w-20">Stato</th>
                <th className="text-left px-3 py-2.5 text-slate-500 font-medium w-20">Durata</th>
                <th className="text-left px-3 py-2.5 text-slate-500 font-medium w-28">IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <React.Fragment key={row.id}>
                  <tr
                    className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors ${
                      expanded === row.id ? "bg-slate-50" : ""
                    }`}
                    onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  >
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                      {format(new Date(row.timestamp), "dd/MM/yy HH:mm:ss", { locale: it })}
                    </td>
                    <td className="px-3 py-2.5">
                      <ActionBadge action={row.action} />
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {ENTITY_LABELS[row.entityType ?? ""] ?? row.entityType ?? "—"}
                      {row.entityId ? <span className="text-slate-400 ml-1">#{row.entityId}</span> : null}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 max-w-xs truncate">
                      {row.description ?? row.path}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge code={row.statusCode} />
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">
                      {row.durationMs != null ? `${row.durationMs}ms` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400 font-mono text-[10px]">
                      {row.ipAddress ?? "—"}
                    </td>
                  </tr>
                  {expanded === row.id && (
                    <tr key={`${row.id}-detail`} className="bg-slate-50 border-b border-slate-200">
                      <td colSpan={7} className="px-6 py-3">
                        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
                          <div className="flex gap-2">
                            <span className="text-slate-400 w-24 flex-shrink-0">ID evento</span>
                            <span className="font-mono text-slate-600">{row.id}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-slate-400 w-24 flex-shrink-0">Metodo HTTP</span>
                            <span className="font-mono font-semibold text-slate-700">{row.method}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-slate-400 w-24 flex-shrink-0">Path</span>
                            <span className="font-mono text-slate-600 break-all">{row.path}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-slate-400 w-24 flex-shrink-0">User Agent</span>
                            <span className="text-slate-500 truncate max-w-xs">{row.userAgent ?? "—"}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-slate-400 w-24 flex-shrink-0">Timestamp</span>
                            <span className="text-slate-600">
                              {format(new Date(row.timestamp), "dd MMMM yyyy, HH:mm:ss", { locale: it })}
                            </span>
                          </div>
                          {!!row.requestBody && (
                            <div className="col-span-2 flex gap-2">
                              <span className="text-slate-400 w-24 flex-shrink-0">Body richiesta</span>
                              <pre className="text-[10px] bg-slate-100 rounded px-2 py-1 overflow-auto max-h-24 max-w-lg text-slate-600 whitespace-pre-wrap">
                                {JSON.stringify(row.requestBody, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-between flex-shrink-0 bg-white">
          <span className="text-xs text-slate-500">
            Pagina {pagination.page} di {pagination.totalPages}
            {" "}({pagination.total} risultati)
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => setFilter("page", String(pagination.page - 1))}
              disabled={pagination.page <= 1}
              className="h-7 px-2"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => setFilter("page", String(pagination.page + 1))}
              disabled={pagination.page >= pagination.totalPages}
              className="h-7 px-2"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
