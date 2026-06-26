import { useListClassifications, useCreateClassification, getListClassificationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Plus, BookOpen, ChevronRight } from "lucide-react";

export default function ClassificationsPage() {
  const qc = useQueryClient();
  const { data: classifications, isLoading } = useListClassifications({ query: { queryKey: getListClassificationsQueryKey() } });
  const createClassification = useCreateClassification();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ code: "", title: "", description: "", level: "1", parentId: "" });

  const list = (classifications ?? []) as Array<{
    id: number; code: string; title: string; description?: string | null;
    level: number; parentId?: number | null; isActive: boolean;
  }>;

  const topLevel = list.filter((c) => !c.parentId || c.level === 1);
  const getChildren = (parentId: number) => list.filter((c) => c.parentId === parentId);

  function handleCreate() {
    createClassification.mutate(
      {
        data: {
          code: form.code,
          title: form.title,
          description: form.description || undefined,
          level: Number(form.level),
          parentId: form.parentId ? Number(form.parentId) : undefined,
        } as Parameters<typeof createClassification.mutate>[0]["data"],
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["listClassifications"] });
          setShowNew(false);
          setForm({ code: "", title: "", description: "", level: "1", parentId: "" });
        },
      }
    );
  }

  const ClassEntry = ({ c, depth }: { c: (typeof list)[0]; depth: number }) => {
    const children = getChildren(c.id);
    return (
      <div>
        <div className={`flex items-center gap-3 px-6 py-3 hover:bg-slate-50 border-b border-slate-50 ${depth > 0 ? "bg-slate-50/50" : ""}`}
          style={{ paddingLeft: `${24 + depth * 20}px` }}>
          {depth > 0 && <ChevronRight className="h-3 w-3 text-slate-300 flex-shrink-0" />}
          <span className="font-mono text-xs font-semibold text-slate-500 w-24 flex-shrink-0">{c.code}</span>
          <span className="text-sm text-slate-800 flex-1">{c.title}</span>
          {c.description && <span className="text-xs text-slate-400 flex-1 truncate">{c.description}</span>}
          <Badge className={`text-xs ${c.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-400"}`}>
            Livello {c.level}
          </Badge>
        </div>
        {children.map((child) => <ClassEntry key={child.id} c={child} depth={depth + 1} />)}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Titolario di Classificazione</h1>
          <p className="text-sm text-slate-500 mt-0.5">{list.length} voci</p>
        </div>
        <Button onClick={() => setShowNew(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nuova Voce
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-6 text-center text-slate-400 text-sm">Caricamento...</div>
        ) : list.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nessuna voce di classificazione</p>
            <p className="text-xs mt-1">Il titolario organizza i documenti per categoria</p>
          </div>
        ) : (
          <div className="border-b border-slate-200">
            <div className="flex items-center gap-3 px-6 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <span className="w-24">Codice</span>
              <span className="flex-1">Titolo</span>
              <span className="flex-1">Descrizione</span>
              <span>Livello</span>
            </div>
            {topLevel.map((c) => <ClassEntry key={c.id} c={c} depth={0} />)}
          </div>
        )}
      </div>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nuova Voce di Classificazione</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Codice *</Label>
              <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="es. 01.02.03" />
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Livello</Label>
              <Select value={form.level} onValueChange={(v) => setForm((f) => ({ ...f, level: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Livello 1 (Categoria)</SelectItem>
                  <SelectItem value="2">Livello 2 (Classe)</SelectItem>
                  <SelectItem value="3">Livello 3 (Sottoclasse)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-slate-600 mb-1 block">Titolo *</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Titolo della voce" />
            </div>
            {Number(form.level) > 1 && (
              <div className="col-span-2">
                <Label className="text-xs text-slate-600 mb-1 block">Voce padre</Label>
                <Select value={form.parentId} onValueChange={(v) => setForm((f) => ({ ...f, parentId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Nessuna (radice)" /></SelectTrigger>
                  <SelectContent>
                    {list.filter((c) => c.level < Number(form.level)).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.code} — {c.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="col-span-2">
              <Label className="text-xs text-slate-600 mb-1 block">Descrizione</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} placeholder="Descrizione opzionale" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Annulla</Button>
            <Button onClick={handleCreate} disabled={!form.code || !form.title || createClassification.isPending}>
              {createClassification.isPending ? "Salvataggio..." : "Crea Voce"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
