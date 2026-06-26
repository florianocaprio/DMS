import { useState } from "react";
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
import { StatusBadge, PriorityBadge } from "@/components/shared/status-badges";
import { FileAttachments } from "@/components/shared/FileAttachments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, ChevronRight, Plus, FileText, Filter, X, Paperclip } from "lucide-react";

const DOC_TYPES = ["delibera", "circolare", "verbale", "contratto", "relazione", "comunicazione", "fattura", "altro"];
const DOC_STATUSES = [
  { value: "draft", label: "Bozza" },
  { value: "in_progress", label: "In lavorazione" },
  { value: "in_approval", label: "In approvazione" },
  { value: "in_signature", label: "In firma" },
  { value: "completed", label: "Completato" },
  { value: "archived", label: "Archiviato" },
];

interface Attachment {
  id: number;
  objectPath: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

interface DocItem {
  id: number;
  title: string;
  type: string;
  status: string;
  priority?: string;
  version?: number;
  subject?: string | null;
  description?: string | null;
  dossierTitle?: string | null;
  responsibleName?: string | null;
  confidentiality?: string;
  createdAt: string;
}

function useAttachments(documentId: number | null) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loaded, setLoaded] = useState<number | null>(null);

  async function load(id: number) {
    if (loaded === id) return;
    const res = await fetch(`/api/attachments?documentId=${id}`);
    if (res.ok) {
      const data = await res.json();
      setAttachments(data);
      setLoaded(id);
    }
  }

  return { attachments, setAttachments, load };
}

export default function DocumentsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterMine, setFilterMine] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocItem | null>(null);
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

  const items = (data?.items ?? []) as DocItem[];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const { attachments, setAttachments, load } = useAttachments(selectedDoc?.id ?? null);

  function handleSelectDoc(doc: DocItem) {
    setSelectedDoc(doc);
    load(doc.id);
  }

  function handleCreate() {
    createDocument.mutate(
      {
        data: {
          ...form,
          dossierId: form.dossierId && form.dossierId !== "none" ? Number(form.dossierId) : undefined,
          responsibleId: form.responsibleId && form.responsibleId !== "none" ? Number(form.responsibleId) : undefined,
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
    <div className="flex h-full">
      <div className={`flex flex-col ${selectedDoc ? "flex-1" : "w-full"} transition-all duration-200`}>
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
                  {!selectedDoc && <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Stato</th>
                  {!selectedDoc && <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Priorità</th>}
                  {!selectedDoc && <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fascicolo</th>}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((doc) => (
                  <tr
                    key={doc.id}
                    className={`hover:bg-slate-50 cursor-pointer transition-colors ${selectedDoc?.id === doc.id ? "bg-blue-50 border-l-2 border-l-primary" : ""}`}
                    onClick={() => handleSelectDoc(doc)}
                  >
                    <td className="px-6 py-2.5">
                      <p className="font-medium text-slate-900 text-xs line-clamp-1">{doc.title}</p>
                      {doc.subject && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{doc.subject}</p>}
                    </td>
                    {!selectedDoc && (
                      <td className="px-4 py-2.5">
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">{doc.type}</span>
                      </td>
                    )}
                    <td className="px-4 py-2.5"><StatusBadge status={doc.status} /></td>
                    {!selectedDoc && <td className="px-4 py-2.5"><PriorityBadge priority={doc.priority ?? "normal"} /></td>}
                    {!selectedDoc && <td className="px-4 py-2.5 text-slate-500 text-xs">{doc.dossierTitle ?? "—"}</td>}
                    <td className="px-4 py-2.5 text-slate-400 text-xs whitespace-nowrap">
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
      </div>

      {selectedDoc && (
        <div className="w-80 border-l border-slate-200 flex flex-col bg-white overflow-hidden">
          <div className="flex items-start justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex-1 min-w-0 mr-2">
              <p className="text-sm font-semibold text-slate-900 line-clamp-2">{selectedDoc.title}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded capitalize">{selectedDoc.type}</span>
                <StatusBadge status={selectedDoc.status} />
              </div>
            </div>
            <button onClick={() => setSelectedDoc(null)} className="text-slate-400 hover:text-slate-600 flex-shrink-0 mt-0.5">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="space-y-2">
              {selectedDoc.subject && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Oggetto</p>
                  <p className="text-xs text-slate-700 mt-0.5">{selectedDoc.subject}</p>
                </div>
              )}
              {selectedDoc.description && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Descrizione</p>
                  <p className="text-xs text-slate-600 mt-0.5">{selectedDoc.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-slate-400">Priorità</p>
                  <PriorityBadge priority={selectedDoc.priority ?? "normal"} />
                </div>
                <div>
                  <p className="text-slate-400">Versione</p>
                  <p className="text-slate-700 font-mono">v{selectedDoc.version ?? 1}</p>
                </div>
                {selectedDoc.dossierTitle && (
                  <div className="col-span-2">
                    <p className="text-slate-400">Fascicolo</p>
                    <p className="text-slate-700">{selectedDoc.dossierTitle}</p>
                  </div>
                )}
                {selectedDoc.responsibleName && (
                  <div className="col-span-2">
                    <p className="text-slate-400">Responsabile</p>
                    <p className="text-slate-700">{selectedDoc.responsibleName}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <FileAttachments
                documentId={selectedDoc.id}
                attachments={attachments}
                onAttachmentAdded={(a) => setAttachments((prev) => [...prev, a])}
                onAttachmentDeleted={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
              />
            </div>
          </div>
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
