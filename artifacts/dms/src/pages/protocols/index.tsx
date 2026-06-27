import { useState } from "react";
import { Link } from "wouter";
import {
  useListProtocols,
  useGetProtocolSummary,
  useCreateProtocol,
  useListDossiers,
  getListProtocolsQueryKey,
  getListDossiersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ProtocolTypeBadge, StatusBadge } from "@/components/shared/status-badges";
import { FileAttachments } from "@/components/shared/FileAttachments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Plus, Filter, Mail, Send, Building2, Lock, X, FolderOpen, ExternalLink } from "lucide-react";

const TYPES = [
  { value: "incoming", label: "Entrata" },
  { value: "outgoing", label: "Uscita" },
  { value: "internal", label: "Interno" },
  { value: "reserved", label: "Riservato" },
];

const STATUSES = [
  { value: "registered", label: "Protocollato" },
  { value: "assigned", label: "Assegnato" },
  { value: "in_progress", label: "In lavorazione" },
  { value: "completed", label: "Completato" },
  { value: "cancelled", label: "Annullato" },
];

interface Attachment {
  id: number;
  objectPath: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  uploadedByName?: string | null;
  removedAt?: string | null;
  removedByName?: string | null;
}

interface DossierMembership {
  id?: number | null;
  dossierId: number;
  dossierCode?: string | null;
  dossierTitle?: string | null;
  isPrimary: boolean;
  addedByName?: string | null;
  addedAt?: string | null;
}

interface ProtocolItem {
  id: number;
  number: string;
  type: string;
  subject: string;
  sender?: string | null;
  recipients?: string[] | null;
  status: string;
  priority?: string;
  registeredAt: string;
  assignedToName?: string | null;
  dossierTitle?: string | null;
  notes?: string | null;
}

export default function ProtocolsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [showNew, setShowNew] = useState(false);
  const [selectedProtocol, setSelectedProtocol] = useState<ProtocolItem | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loadedProtoId, setLoadedProtoId] = useState<number | null>(null);
  const [memberships, setMemberships] = useState<DossierMembership[]>([]);
  const [addDossierSel, setAddDossierSel] = useState<string>("");
  const [membBusy, setMembBusy] = useState(false);
  const [form, setForm] = useState({
    type: "incoming", subject: "", description: "", sender: "",
    recipients: "", priority: "normal", confidentiality: "normal",
    dossierId: "", notes: "",
  });
  const [extraDossierIds, setExtraDossierIds] = useState<number[]>([]);

  const params = {
    page, limit: 20,
    ...(filterType !== "all" && { type: filterType }),
    ...(filterStatus !== "all" && { status: filterStatus }),
    ...(filterYear !== "all" && { year: Number(filterYear) }),
  };

  const { data, isLoading } = useListProtocols(params, { query: { queryKey: getListProtocolsQueryKey(params) } });
  const { data: summary } = useGetProtocolSummary();
  const { data: dossiers } = useListDossiers({}, { query: { queryKey: getListDossiersQueryKey() } });
  const createProtocol = useCreateProtocol();

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const items = (data?.items ?? []) as ProtocolItem[];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  async function handleSelectProtocol(p: ProtocolItem) {
    setSelectedProtocol(p);
    if (loadedProtoId !== p.id) {
      const res = await fetch(`/api/attachments?protocolId=${p.id}&includeRemoved=true`);
      if (res.ok) {
        setAttachments(await res.json());
        setLoadedProtoId(p.id);
      }
      await loadMemberships(p.id);
    }
  }

  async function loadMemberships(protocolId: number) {
    const res = await fetch(`/api/protocols/${protocolId}/dossiers`);
    if (res.ok) setMemberships(await res.json());
  }

  async function handleAddMembership() {
    if (!selectedProtocol || !addDossierSel) return;
    setMembBusy(true);
    try {
      await fetch(`/api/protocols/${selectedProtocol.id}/dossiers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierId: Number(addDossierSel) }),
      });
      setAddDossierSel("");
      await loadMemberships(selectedProtocol.id);
      qc.invalidateQueries({ queryKey: ["listProtocols"] });
    } finally {
      setMembBusy(false);
    }
  }

  async function handleRemoveMembership(dossierId: number) {
    if (!selectedProtocol) return;
    setMembBusy(true);
    try {
      await fetch(`/api/protocols/${selectedProtocol.id}/dossiers/${dossierId}`, { method: "DELETE" });
      await loadMemberships(selectedProtocol.id);
      qc.invalidateQueries({ queryKey: ["listProtocols"] });
    } finally {
      setMembBusy(false);
    }
  }

  async function handleSetPrimary(dossierId: number) {
    if (!selectedProtocol) return;
    setMembBusy(true);
    try {
      await fetch(`/api/protocols/${selectedProtocol.id}/dossiers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierId, isPrimary: true }),
      });
      await loadMemberships(selectedProtocol.id);
      qc.invalidateQueries({ queryKey: ["listProtocols"] });
    } finally {
      setMembBusy(false);
    }
  }

  function handleCreate() {
    createProtocol.mutate(
      {
        data: {
          ...form,
          recipients: form.recipients ? form.recipients.split(",").map((r) => r.trim()) : [],
          ccRecipients: [],
          dossierId: form.dossierId && form.dossierId !== "none" ? Number(form.dossierId) : undefined,
          dossierIds: extraDossierIds.length > 0 ? extraDossierIds : undefined,
        } as Parameters<typeof createProtocol.mutate>[0]["data"],
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["listProtocols"] });
          setShowNew(false);
          setForm({ type: "incoming", subject: "", description: "", sender: "", recipients: "", priority: "normal", confidentiality: "normal", dossierId: "", notes: "" });
          setExtraDossierIds([]);
        },
      }
    );
  }

  const TypeIcon = ({ type }: { type: string }) => {
    if (type === "incoming") return <Mail className="h-4 w-4 text-blue-600" />;
    if (type === "outgoing") return <Send className="h-4 w-4 text-emerald-600" />;
    if (type === "reserved") return <Lock className="h-4 w-4 text-red-600" />;
    return <Building2 className="h-4 w-4 text-slate-500" />;
  };

  return (
    <div className="flex h-full">
      <div className={`flex flex-col ${selectedProtocol ? "flex-1" : "w-full"} transition-all duration-200`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Registro Protocolli</h1>
            {summary && (
              <p className="text-sm text-slate-500 mt-0.5">
                {summary.thisYear} quest'anno · {summary.thisMonth} questo mese
              </p>
            )}
          </div>
          <Button onClick={() => setShowNew(true)} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Nuovo Protocollo
          </Button>
        </div>

        {summary && (
          <div className="px-6 py-3 border-b border-slate-100 bg-slate-50 flex gap-4 flex-wrap">
            {TYPES.map((t) => {
              const cnt = summary.byType.find((b: { type: string; count: number }) => b.type === t.value)?.count ?? 0;
              return (
                <button
                  key={t.value}
                  onClick={() => setFilterType(filterType === t.value ? "all" : t.value)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterType === t.value ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"}`}
                >
                  <TypeIcon type={t.value} />
                  {t.label} <span className="font-bold">{cnt}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="px-6 py-3 flex gap-3 items-center border-b border-slate-100">
          <Filter className="h-4 w-4 text-slate-400" />
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue placeholder="Anno" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti</SelectItem>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="ml-auto text-xs text-slate-500">{total} protocolli</span>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-6 text-center text-slate-400 text-sm">Caricamento...</div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nessun protocollo trovato</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Numero</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Oggetto</th>
                  {!selectedProtocol && <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Mitt./Dest.</th>}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Stato</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((p) => (
                  <tr
                    key={p.id}
                    className={`hover:bg-slate-50 cursor-pointer transition-colors ${selectedProtocol?.id === p.id ? "bg-blue-50 border-l-2 border-l-primary" : ""}`}
                    onClick={() => handleSelectProtocol(p)}
                  >
                    <td className="px-6 py-2.5">
                      <Link
                        href={`/protocols/${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-mono text-xs font-medium text-slate-900 hover:text-primary hover:underline"
                      >
                        {p.number}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5"><ProtocolTypeBadge type={p.type} /></td>
                    <td className="px-4 py-2.5 max-w-xs">
                      <span className="text-slate-800 text-xs line-clamp-1">{p.subject}</span>
                    </td>
                    {!selectedProtocol && (
                      <td className="px-4 py-2.5 text-slate-500 text-xs">
                        {p.sender || (p.recipients?.[0]) || "—"}
                      </td>
                    )}
                    <td className="px-4 py-2.5"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs whitespace-nowrap">
                      {new Date(p.registeredAt).toLocaleDateString("it-IT")}
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

      {selectedProtocol && (
        <div className="w-80 border-l border-slate-200 flex flex-col bg-white overflow-hidden">
          <div className="flex items-start justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex-1 min-w-0 mr-2">
              <p className="text-xs font-mono font-semibold text-slate-500">{selectedProtocol.number}</p>
              <p className="text-sm font-semibold text-slate-900 line-clamp-2 mt-0.5">{selectedProtocol.subject}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <ProtocolTypeBadge type={selectedProtocol.type} />
                <StatusBadge status={selectedProtocol.status} />
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
              <Link
                href={`/protocols/${selectedProtocol.id}`}
                className="text-slate-400 hover:text-primary"
                title="Apri scheda completa"
              >
                <ExternalLink className="w-4 h-4" />
              </Link>
              <button onClick={() => setSelectedProtocol(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="space-y-2 text-xs">
              {selectedProtocol.sender && (
                <div>
                  <p className="text-slate-400 uppercase tracking-wide font-medium">Mittente</p>
                  <p className="text-slate-700 mt-0.5">{selectedProtocol.sender}</p>
                </div>
              )}
              {selectedProtocol.recipients && selectedProtocol.recipients.length > 0 && (
                <div>
                  <p className="text-slate-400 uppercase tracking-wide font-medium">Destinatari</p>
                  <p className="text-slate-700 mt-0.5">{selectedProtocol.recipients.join(", ")}</p>
                </div>
              )}
              {selectedProtocol.assignedToName && (
                <div>
                  <p className="text-slate-400 uppercase tracking-wide font-medium">Assegnato a</p>
                  <p className="text-slate-700 mt-0.5">{selectedProtocol.assignedToName}</p>
                </div>
              )}
              {selectedProtocol.notes && (
                <div>
                  <p className="text-slate-400 uppercase tracking-wide font-medium">Note</p>
                  <p className="text-slate-600 mt-0.5">{selectedProtocol.notes}</p>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <p className="text-slate-400 uppercase tracking-wide font-medium text-xs mb-1.5">Fascicoli</p>
              {memberships.length === 0 ? (
                <p className="text-xs text-slate-400">Non archiviato in alcun fascicolo</p>
              ) : (
                <ul className="space-y-1">
                  {memberships.map((m) => (
                    <li key={m.dossierId} className="flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-100 rounded-md px-2 py-1.5">
                      <FolderOpen className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-700 truncate">
                          <span className="font-mono text-slate-500">{m.dossierCode}</span> {m.dossierTitle}
                        </p>
                        {m.addedByName && (
                          <p className="text-[10px] text-slate-400">
                            {m.addedByName}{m.addedAt ? ` · ${new Date(m.addedAt).toLocaleDateString("it-IT")}` : ""}
                          </p>
                        )}
                      </div>
                      {m.isPrimary ? (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-px rounded-full font-medium leading-none flex-shrink-0">Principale</span>
                      ) : (
                        <button
                          onClick={() => handleSetPrimary(m.dossierId)}
                          disabled={membBusy}
                          className="text-[10px] text-slate-500 hover:text-blue-700 flex-shrink-0"
                          title="Imposta come principale"
                        >Rendi princ.</button>
                      )}
                      <button
                        onClick={() => handleRemoveMembership(m.dossierId)}
                        disabled={membBusy}
                        className="text-slate-400 hover:text-red-600 flex-shrink-0"
                        title="Rimuovi dal fascicolo"
                      ><X className="w-3 h-3" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center gap-1.5 mt-2">
                <Select value={addDossierSel} onValueChange={setAddDossierSel}>
                  <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Aggiungi a fascicolo" /></SelectTrigger>
                  <SelectContent>
                    {(dossiers?.items ?? [])
                      .filter((d: { id: number }) => !memberships.some((m) => m.dossierId === d.id))
                      .map((d: { id: number; code: string; title: string }) => (
                        <SelectItem key={d.id} value={String(d.id)}>{d.code} — {d.title}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!addDossierSel || membBusy} onClick={handleAddMembership}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <FileAttachments
                protocolId={selectedProtocol.id}
                attachments={attachments}
                onAttachmentAdded={(a) => setAttachments((prev) => [...prev, a])}
                onAttachmentDeleted={(id) => setAttachments((prev) => prev.map((a) => a.id === id ? { ...a, removedAt: new Date().toISOString(), removedByName: "Tu" } : a))}
              />
            </div>
          </div>
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Nuovo Protocollo</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label className="text-xs text-slate-600 mb-1 block">Tipo *</Label>
              <div className="flex gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setForm((f) => ({ ...f, type: t.value }))}
                    className={`flex-1 py-2 rounded-md text-xs font-medium border transition-colors ${form.type === t.value ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
                  >{t.label}</button>
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-slate-600 mb-1 block">Oggetto *</Label>
              <Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Oggetto del protocollo" />
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">{form.type === "incoming" ? "Mittente" : "Destinatari"}</Label>
              <Input value={form.type === "incoming" ? form.sender : form.recipients} onChange={(e) => setForm((f) => form.type === "incoming" ? { ...f, sender: e.target.value } : { ...f, recipients: e.target.value })} placeholder={form.type === "incoming" ? "Nome mittente" : "Separati da virgola"} />
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
              <Label className="text-xs text-slate-600 mb-1 block">Fascicolo principale</Label>
              <Select value={form.dossierId} onValueChange={(v) => { setForm((f) => ({ ...f, dossierId: v })); setExtraDossierIds((prev) => prev.filter((id) => String(id) !== v)); }}>
                <SelectTrigger><SelectValue placeholder="Nessun fascicolo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuno</SelectItem>
                  {(dossiers?.items ?? []).map((d: { id: number; code: string; title: string }) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.code} — {d.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-slate-600 mb-1 block">Altri fascicoli (archiviazione multipla)</Label>
              <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-md p-2 space-y-1">
                {(dossiers?.items ?? []).filter((d: { id: number }) => String(d.id) !== form.dossierId).length === 0 ? (
                  <p className="text-xs text-slate-400 px-1 py-0.5">Nessun altro fascicolo disponibile</p>
                ) : (
                  (dossiers?.items ?? [])
                    .filter((d: { id: number }) => String(d.id) !== form.dossierId)
                    .map((d: { id: number; code: string; title: string }) => (
                      <label key={d.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5">
                        <input
                          type="checkbox"
                          checked={extraDossierIds.includes(d.id)}
                          onChange={(e) => setExtraDossierIds((prev) => e.target.checked ? [...prev, d.id] : prev.filter((id) => id !== d.id))}
                        />
                        <span className="font-mono text-slate-500">{d.code}</span> — {d.title}
                      </label>
                    ))
                )}
              </div>
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-slate-600 mb-1 block">Note</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Note aggiuntive" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Annulla</Button>
            <Button onClick={handleCreate} disabled={!form.subject || createProtocol.isPending}>
              {createProtocol.isPending ? "Salvataggio..." : "Registra Protocollo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
