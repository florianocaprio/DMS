import { useState } from "react";
import { Link } from "wouter";
import { useListDossiers, useCreateDossier, useListUsers, useListClassifications, getListDossiersQueryKey, getListUsersQueryKey, getListClassificationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBadge } from "@/components/shared/status-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Plus, FolderOpen, Users } from "lucide-react";

const STATUSES = [
  { value: "open", label: "Aperto" },
  { value: "closed", label: "Chiuso" },
  { value: "archived", label: "Archiviato" },
];

export default function DossiersPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", area: "", confidentiality: "normal", responsibleId: "", classificationId: "" });

  const params = {
    page, limit: 20,
    ...(filterStatus !== "all" && { status: filterStatus }),
  };

  const { data, isLoading } = useListDossiers(params, { query: { queryKey: getListDossiersQueryKey(params) } });
  const { data: users } = useListUsers({}, { query: { queryKey: getListUsersQueryKey() } });
  const { data: classifications } = useListClassifications({ query: { queryKey: getListClassificationsQueryKey() } });
  const createDossier = useCreateDossier();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  function handleCreate() {
    createDossier.mutate(
      {
        data: {
          ...form,
          confidentiality: form.confidentiality || "normal",
          responsibleId: form.responsibleId ? Number(form.responsibleId) : undefined,
          classificationId: form.classificationId ? Number(form.classificationId) : undefined,
          year: new Date().getFullYear(),
          code: "TEMP",
          status: "open",
        } as Parameters<typeof createDossier.mutate>[0]["data"],
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["listDossiers"] });
          setShowNew(false);
          setForm({ title: "", description: "", area: "", confidentiality: "normal", responsibleId: "", classificationId: "" });
        },
      }
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Fascicoli</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} fascicoli totali</p>
        </div>
        <Button onClick={() => setShowNew(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nuovo Fascicolo
        </Button>
      </div>

      <div className="px-6 py-3 flex gap-3 items-center border-b border-slate-100">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-slate-500">{total} fascicoli</span>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-6 text-center text-slate-400 text-sm">Caricamento...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nessun fascicolo trovato</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Codice</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Titolo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Area</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Stato</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Responsabile</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Doc.</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Prot.</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Anno</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(items as Array<{
                id: number; code: string; title: string; area?: string | null;
                status: string; responsibleName?: string | null; documentCount?: number;
                protocolCount?: number; year: number;
              }>).map((d) => (
                <tr key={d.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => window.location.href = `/dossiers/${d.id}`}>
                  <td className="px-6 py-3">
                    <Link href={`/dossiers/${d.id}`} className="font-mono text-xs font-medium text-slate-900 hover:text-blue-700">{d.code}</Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-slate-800 font-medium line-clamp-1">{d.title}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{d.area ?? "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{d.responsibleName ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{d.documentCount ?? 0}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{d.protocolCount ?? 0}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{d.year}</td>
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
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Nuovo Fascicolo</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label className="text-xs text-slate-600 mb-1 block">Titolo *</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Titolo del fascicolo" />
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Area</Label>
              <Input value={form.area} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))} placeholder="Area di competenza" />
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Riservatezza</Label>
              <Select value={form.confidentiality} onValueChange={(v) => setForm((f) => ({ ...f, confidentiality: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normale</SelectItem>
                  <SelectItem value="reserved">Riservato</SelectItem>
                  <SelectItem value="secret">Segreto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Responsabile</Label>
              <Select value={form.responsibleId} onValueChange={(v) => setForm((f) => ({ ...f, responsibleId: v }))}>
                <SelectTrigger><SelectValue placeholder="Nessuno" /></SelectTrigger>
                <SelectContent>
                  {(users ?? []).map((u: { id: number; name: string }) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Classificazione</Label>
              <Select value={form.classificationId} onValueChange={(v) => setForm((f) => ({ ...f, classificationId: v }))}>
                <SelectTrigger><SelectValue placeholder="Nessuna" /></SelectTrigger>
                <SelectContent>
                  {(classifications ?? []).map((c: { id: number; code: string; title: string }) => <SelectItem key={c.id} value={String(c.id)}>{c.code} — {c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-slate-600 mb-1 block">Descrizione</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} placeholder="Descrizione del fascicolo" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Annulla</Button>
            <Button onClick={handleCreate} disabled={!form.title || createDossier.isPending}>
              {createDossier.isPending ? "Salvataggio..." : "Crea Fascicolo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
