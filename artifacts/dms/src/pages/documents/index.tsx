import { useState } from "react";
import { Link } from "wouter";
import {
  useListDocuments,
  useCreateDocument,
  useListDossiers,
  useListUsers,
  getListDocumentsQueryKey,
  getListDossiersQueryKey,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBadge, PriorityBadge, ConfidentialityBadge } from "@/components/shared/status-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, ChevronRight, Plus, FileText, Filter, Search } from "lucide-react";

const DOC_TYPES = ["delibera", "circolare", "verbale", "contratto", "relazione", "comunicazione", "fattura", "altro"];
const DOC_STATUSES = [
  { value: "draft", label: "Bozza" },
  { value: "in_progress", label: "In lavorazione" },
  { value: "in_approval", label: "In approvazione" },
  { value: "in_signature", label: "In firma" },
  { value: "completed", label: "Completato" },
  { value: "archived", label: "Archiviato" },
];

export default function DocumentsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterMine, setFilterMine] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    title: "", type: "delibera", subject: "", description: "",
    confidentiality: "normal", priority: "normal", dossierId: "", responsibleId: "",
  });

  const params = {
    page, limit: 20,
    ...(filterStatus !== "all" && { status: filterStatus }),
    ...(filterType !== "all" && { type: filterType }),
    ...(filterMine && { assignedToMe: true }),
  };

  const { data, isLoading } = useListDocuments(params, { query: { queryKey: getListDocumentsQueryKey(params) } });
  const { data: dossiers } = useListDossiers({}, { query: { queryKey: getListDossiersQueryKey() } });
  const { data: users } = useListUsers({}, { query: { queryKey: getListUsersQueryKey() } });
  const createDocument = useCreateDocument();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  function handleCreate() {
    createDocument.mutate(
      {
        data: {
          ...form,
          dossierId: form.dossierId ? Number(form.dossierId) : undefined,
          responsibleId: form.responsibleId ? Number(form.responsibleId) : undefined,
          tags: [],
        } as Parameters<typeof createDocument.mutate>[0]["data"],
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["listDocuments"] });
          setShowNew(false);
          setForm({ title: "", type: "delibera", subject: "", description: "", confidentiality: "normal", priority: "normal", dossierId: "", responsibleId: "" });
        },
      }
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Archivio Documenti</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} documenti totali</p>
        </div>
        <Button onClick={() => setShowNew(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nuovo Documento
        </Button>
      </div>

      <div className="px-6 py-3 flex gap-3 items-center border-b border-slate-100">
        <Filter className="h-4 w-4 text-slate-400" />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            {DOC_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i tipi</SelectItem>
            {DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
          <Checkbox checked={filterMine} onCheckedChange={(v) => setFilterMine(Boolean(v))} />
          Solo miei
        </label>
        <span className="ml-auto text-xs text-slate-500">{total} documenti</span>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-6 text-center text-slate-400 text-sm">Caricamento...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nessun documento trovato</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Titolo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Stato</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Priorità</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ver.</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fascicolo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Responsabile</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(items as Array<{
                id: number; title: string; type: string; status: string; priority?: string;
                version?: number; dossierTitle?: string | null; responsibleName?: string | null;
                confidentiality?: string; createdAt: string;
              }>).map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => window.location.href = `/documents/${doc.id}`}>
                  <td className="px-6 py-3">
                    <Link href={`/documents/${doc.id}`} className="font-medium text-slate-900 hover:text-blue-700 line-clamp-1 max-w-xs block">{doc.title}</Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">{doc.type}</span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={doc.status} /></td>
                  <td className="px-4 py-3"><PriorityBadge priority={doc.priority ?? "normal"} /></td>
                  <td className="px-4 py-3 text-slate-500 text-xs">v{doc.version}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{doc.dossierTitle ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{doc.responsibleName ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {new Date(doc.createdAt).toLocaleDateString("it-IT")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-slate-200 flex items-center gap-3">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-xs text-slate-600">Pagina {page} di {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Nuovo Documento</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label className="text-xs text-slate-600 mb-1 block">Titolo *</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Titolo del documento" />
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Tipo *</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Priorità</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgente</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="normal">Normale</SelectItem>
                  <SelectItem value="low">Bassa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-slate-600 mb-1 block">Oggetto</Label>
              <Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Oggetto breve" />
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Fascicolo</Label>
              <Select value={form.dossierId} onValueChange={(v) => setForm((f) => ({ ...f, dossierId: v }))}>
                <SelectTrigger><SelectValue placeholder="Nessuno" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuno</SelectItem>
                  {(dossiers?.items ?? []).map((d: { id: number; code: string; title: string }) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.code} — {d.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Responsabile</Label>
              <Select value={form.responsibleId} onValueChange={(v) => setForm((f) => ({ ...f, responsibleId: v }))}>
                <SelectTrigger><SelectValue placeholder="Nessuno" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuno</SelectItem>
                  {(users ?? []).map((u: { id: number; name: string }) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-slate-600 mb-1 block">Descrizione</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} placeholder="Descrizione del documento" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Annulla</Button>
            <Button onClick={handleCreate} disabled={!form.title || createDocument.isPending}>
              {createDocument.isPending ? "Salvataggio..." : "Crea Documento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
