import { useListClassifications, useCreateClassification, getListClassificationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { Plus, BookOpen, ChevronRight, Pencil } from "lucide-react";
import { ROLE_OPTIONS, roleInfo } from "@/lib/roles";
import { useToast } from "@/hooks/use-toast";
import { getDossierLevelColor, useDossierLevelColors } from "@/lib/dossier-level-colors";

type Classification = {
  id: number;
  code: string;
  title: string;
  description?: string | null;
  level: number;
  parentId?: number | null;
  isActive: boolean;
  sortOrder?: number;
  retentionYears?: number | null;
  retentionPolicy?: string | null;
  responsibleRole?: string | null;
  responsibleUserId?: number | null;
  visibility?: string | null;
};

type ClassificationForm = {
  code: string;
  title: string;
  description: string;
  level: string;
  parentId: string;
  sortOrder: string;
  retentionYears: string;
  retentionPolicy: string;
  responsibleRole: string;
  visibility: string;
  isActive: boolean;
};

const emptyForm: ClassificationForm = {
  code: "",
  title: "",
  description: "",
  level: "1",
  parentId: "",
  sortOrder: "0",
  retentionYears: "",
  retentionPolicy: "",
  responsibleRole: "none",
  visibility: "normal",
  isActive: true,
};

export default function ClassificationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: classifications, isLoading } = useListClassifications({ query: { queryKey: getListClassificationsQueryKey() } });
  const createClassification = useCreateClassification();
  const levelColors = useDossierLevelColors();
  const [showNew, setShowNew] = useState(false);
  const [editItem, setEditItem] = useState<Classification | null>(null);
  const [form, setForm] = useState<ClassificationForm>(emptyForm);
  const [editForm, setEditForm] = useState<ClassificationForm>(emptyForm);
  const [savingEdit, setSavingEdit] = useState(false);

  const list = [...((classifications ?? []) as Classification[])].sort(sortClassifications);
  const topLevel = list.filter((c) => !c.parentId || c.level === 1);
  const getChildren = (parentId: number) => list.filter((c) => c.parentId === parentId);

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListClassificationsQueryKey() });
  }

  function handleCreate() {
    createClassification.mutate(
      { data: buildPayload(form) as Parameters<typeof createClassification.mutate>[0]["data"] },
      {
        onSuccess: () => {
          invalidate();
          setShowNew(false);
          setForm(emptyForm);
          toast({ title: "Voce creata" });
        },
        onError: (e) => toast({ title: "Errore creazione voce", description: errorMessage(e), variant: "destructive" }),
      },
    );
  }

  function openEdit(c: Classification) {
    setEditItem(c);
    setEditForm({
      code: c.code,
      title: c.title,
      description: c.description ?? "",
      level: String(c.level),
      parentId: c.parentId ? String(c.parentId) : "",
      sortOrder: String(c.sortOrder ?? 0),
      retentionYears: c.retentionYears != null ? String(c.retentionYears) : "",
      retentionPolicy: c.retentionPolicy ?? "",
      responsibleRole: c.responsibleRole ?? "none",
      visibility: c.visibility ?? "normal",
      isActive: c.isActive,
    });
  }

  async function handleUpdate() {
    if (!editItem) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/classifications/${editItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(editForm)),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Errore aggiornamento voce" }));
        throw new Error(data.error ?? "Errore aggiornamento voce");
      }
      invalidate();
      setEditItem(null);
      toast({ title: "Voce aggiornata" });
    } catch (e) {
      toast({ title: "Errore aggiornamento voce", description: errorMessage(e), variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  }

  const ClassEntry = ({ c, depth }: { c: Classification; depth: number }) => {
    const children = getChildren(c.id);
    const role = c.responsibleRole ? roleInfo(c.responsibleRole) : null;
    const levelColor = getDossierLevelColor(levelColors, c.level - 1);
    return (
      <div>
        <div
          className={`flex items-center gap-3 px-6 py-3 hover:bg-slate-50 border-b border-slate-50 ${depth > 0 ? "bg-slate-50/50" : ""}`}
          style={{ paddingLeft: `${24 + depth * 20}px`, borderLeft: `4px solid ${levelColor.foreground}` }}
        >
          {depth > 0 && <ChevronRight className="h-3 w-3 text-slate-300 flex-shrink-0" />}
          <span className="font-mono text-xs font-semibold text-slate-500 w-24 flex-shrink-0">{c.code}</span>
          <span className="text-sm text-slate-800 flex-1">{c.title}</span>
          <span className="text-xs text-slate-400 flex-1 truncate">{c.description ?? "—"}</span>
          {role && <Badge className={`text-xs border ${role.color}`}>{role.label}</Badge>}
          {c.retentionYears != null && <Badge variant="outline" className="text-xs">{c.retentionYears} anni</Badge>}
          <Badge
            className={`text-xs ${c.isActive ? "" : "bg-slate-100 text-slate-400"}`}
            style={c.isActive ? { backgroundColor: levelColor.background, color: levelColor.foreground, borderColor: levelColor.foreground } : undefined}
          >
            {c.isActive ? `Livello ${c.level}` : "Disattiva"}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => openEdit(c)}
          >
            <Pencil className="h-3.5 w-3.5" />
            Modifica
          </Button>
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
          </div>
        ) : (
          <div className="border-b border-slate-200">
            <div className="flex items-center gap-3 px-6 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <span className="w-24">Codice</span>
              <span className="flex-1">Titolo</span>
              <span className="flex-1">Descrizione</span>
              <span>Metadati</span>
              <span>Stato</span>
              <span className="w-24 text-right">Azioni</span>
            </div>
            {topLevel.map((c) => <ClassEntry key={c.id} c={c} depth={0} />)}
          </div>
        )}
      </div>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Nuova Voce di Classificazione</DialogTitle></DialogHeader>
          <ClassificationFields form={form} list={list} onChange={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Annulla</Button>
            <Button onClick={handleCreate} disabled={!form.code || !form.title || createClassification.isPending}>
              {createClassification.isPending ? "Salvataggio..." : "Crea Voce"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Modifica Voce di Classificazione</DialogTitle></DialogHeader>
          <ClassificationFields form={editForm} list={list} excludeId={editItem?.id} onChange={setEditForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Annulla</Button>
            <Button onClick={handleUpdate} disabled={!editForm.code || !editForm.title || savingEdit}>
              {savingEdit ? "Salvataggio..." : "Salva modifiche"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClassificationFields({
  form,
  list,
  excludeId,
  onChange,
}: {
  form: ClassificationForm;
  list: Classification[];
  excludeId?: number;
  onChange: (form: ClassificationForm) => void;
}) {
  const parentOptions = list.filter((c) => c.id !== excludeId && c.level < Number(form.level));
  return (
    <div className="grid grid-cols-2 gap-4 py-2">
      <div>
        <Label className="text-xs text-slate-600 mb-1 block">Codice *</Label>
        <Input value={form.code} onChange={(e) => onChange({ ...form, code: e.target.value })} placeholder="es. 01.02.03" />
      </div>
      <div>
        <Label className="text-xs text-slate-600 mb-1 block">Livello</Label>
        <Select value={form.level} onValueChange={(v) => onChange({ ...form, level: v, parentId: v === "1" ? "" : form.parentId })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Livello 1</SelectItem>
            <SelectItem value="2">Livello 2</SelectItem>
            <SelectItem value="3">Livello 3</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-2">
        <Label className="text-xs text-slate-600 mb-1 block">Titolo *</Label>
        <Input value={form.title} onChange={(e) => onChange({ ...form, title: e.target.value })} placeholder="Titolo della voce" />
      </div>
      <div className="col-span-2">
        <Label className="text-xs text-slate-600 mb-1 block">Voce padre</Label>
        <Select value={form.parentId || "none"} onValueChange={(v) => onChange({ ...form, parentId: v === "none" ? "" : v })}>
          <SelectTrigger><SelectValue placeholder="Nessuna" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nessuna</SelectItem>
            {parentOptions.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.code} - {c.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-2">
        <Label className="text-xs text-slate-600 mb-1 block">Descrizione</Label>
        <Textarea value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} rows={2} placeholder="Descrizione opzionale" />
      </div>
      <div>
        <Label className="text-xs text-slate-600 mb-1 block">Ordinamento</Label>
        <Input type="number" value={form.sortOrder} onChange={(e) => onChange({ ...form, sortOrder: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs text-slate-600 mb-1 block">Conservazione anni</Label>
        <Input type="number" min={0} value={form.retentionYears} onChange={(e) => onChange({ ...form, retentionYears: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs text-slate-600 mb-1 block">Policy conservazione</Label>
        <Input value={form.retentionPolicy} onChange={(e) => onChange({ ...form, retentionPolicy: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs text-slate-600 mb-1 block">Ruolo responsabile</Label>
        <Select value={form.responsibleRole} onValueChange={(v) => onChange({ ...form, responsibleRole: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nessuno</SelectItem>
            {ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs text-slate-600 mb-1 block">Visibilità</Label>
        <Select value={form.visibility} onValueChange={(v) => onChange({ ...form, visibility: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="normal">Normale</SelectItem>
            <SelectItem value="reserved">Riservata</SelectItem>
            <SelectItem value="restricted">Ristretta</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600 pt-6">
        <Switch checked={form.isActive} onCheckedChange={(v) => onChange({ ...form, isActive: Boolean(v) })} />
        Attiva
      </label>
    </div>
  );
}

function buildPayload(form: ClassificationForm) {
  return {
    code: form.code.trim(),
    title: form.title.trim(),
    description: form.description.trim() || null,
    level: Number(form.level),
    parentId: form.parentId ? Number(form.parentId) : null,
    sortOrder: Number(form.sortOrder || 0),
    retentionYears: form.retentionYears ? Number(form.retentionYears) : null,
    retentionPolicy: form.retentionPolicy.trim() || null,
    responsibleRole: form.responsibleRole === "none" ? null : form.responsibleRole,
    visibility: form.visibility || "normal",
    isActive: form.isActive,
  };
}

function sortClassifications(a: Classification, b: Classification) {
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.code.localeCompare(b.code);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
