import { useState } from "react";
import { useSearchDocuments, getSearchDocumentsQueryKey } from "@workspace/api-client-react";
import { StatusBadge, ProtocolTypeBadge } from "@/components/shared/status-badges";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, FileText, Hash, ChevronLeft, ChevronRight, X } from "lucide-react";

const DOC_TYPES = ["delibera", "circolare", "verbale", "contratto", "relazione", "comunicazione", "fattura", "altro"];
const STATUSES = [
  { value: "draft", label: "Bozza" },
  { value: "in_progress", label: "In lavorazione" },
  { value: "in_approval", label: "In approvazione" },
  { value: "completed", label: "Completato" },
];
const PROTOCOL_TYPES = [
  { value: "incoming", label: "Entrata" },
  { value: "outgoing", label: "Uscita" },
  { value: "internal", label: "Interno" },
];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterProtocolType, setFilterProtocolType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const params = {
    q: submitted,
    page,
    limit: 20,
    ...(filterType !== "all" && { type: filterType }),
    ...(filterStatus !== "all" && { status: filterStatus }),
    ...(filterProtocolType !== "all" && { protocolType: filterProtocolType }),
    ...(dateFrom && { dateFrom }),
    ...(dateTo && { dateTo }),
  };

  const { data, isLoading } = useSearchDocuments(params, {
    query: {
      queryKey: getSearchDocumentsQueryKey(params),
      enabled: submitted.length > 0,
    },
  });

  function handleSearch() {
    setSubmitted(query);
    setPage(1);
  }

  function clearSearch() {
    setQuery("");
    setSubmitted("");
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-slate-200">
        <h1 className="text-xl font-semibold text-slate-900 mb-3">Ricerca</h1>
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Cerca in documenti, protocolli, oggetti, testo..."
              className="pl-9 pr-8"
            />
            {query && (
              <button onClick={clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button onClick={handleSearch} disabled={!query.trim()}>Cerca</Button>
        </div>

        <div className="flex gap-3 mt-3 flex-wrap">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Tipo documento" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i tipi</SelectItem>
              {DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Stato" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterProtocolType} onValueChange={setFilterProtocolType}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Tipo protocollo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti</SelectItem>
              {PROTOCOL_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40 h-8 text-xs" placeholder="Dal" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40 h-8 text-xs" placeholder="Al" />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {!submitted ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Search className="h-14 w-14 mb-4 opacity-20" />
            <p className="text-sm">Inserisci un termine di ricerca per trovare documenti e protocolli</p>
          </div>
        ) : isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Ricerca in corso...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nessun risultato per "<strong>{submitted}</strong>"</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            <div className="px-6 py-2 bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
              {total} risultati per "<strong className="text-slate-700">{submitted}</strong>"
            </div>
            {(items as Array<{
              id: number; resultType: string; title: string; subject?: string | null;
              excerpt?: string | null; status: string; protocolNumber?: string | null;
              documentType?: string | null; createdAt: string;
            }>).map((item, i) => (
              <div
                key={`${item.resultType}-${item.id}-${i}`}
                className="px-6 py-4 hover:bg-slate-50 cursor-pointer"
                onClick={() => window.location.href = item.resultType === "protocol" ? `/protocols/${item.id}` : `/documents/${item.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 p-1.5 rounded-md ${item.resultType === "protocol" ? "bg-blue-50" : "bg-slate-100"}`}>
                    {item.resultType === "protocol" ? <Hash className="h-3.5 w-3.5 text-blue-600" /> : <FileText className="h-3.5 w-3.5 text-slate-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-slate-900">{item.title}</span>
                      {item.protocolNumber && <span className="font-mono text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{item.protocolNumber}</span>}
                      <StatusBadge status={item.status} />
                      {item.documentType && item.resultType === "protocol" && <ProtocolTypeBadge type={item.documentType} />}
                    </div>
                    {item.subject && <p className="text-xs text-slate-500 mt-0.5">{item.subject}</p>}
                    {item.excerpt && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{item.excerpt}</p>}
                    <span className="text-xs text-slate-400 mt-1 block">{new Date(item.createdAt).toLocaleDateString("it-IT")}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {submitted && totalPages > 1 && (
        <div className="px-6 py-3 border-t border-slate-200 flex items-center gap-3">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-xs text-slate-600">Pagina {page} di {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}
