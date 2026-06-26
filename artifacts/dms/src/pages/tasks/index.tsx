import { useState } from "react";
import { useListTasks, useGetOverdueTasks, useCreateTask, useUpdateTask, useDeleteTask, useListUsers, getListTasksQueryKey, getGetOverdueTasksQueryKey, getListUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBadge, PriorityBadge } from "@/components/shared/status-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Plus, CheckSquare, AlertTriangle, Trash2, Edit2 } from "lucide-react";

const PRIORITIES = [
  { value: "urgent", label: "Urgente" },
  { value: "high", label: "Alta" },
  { value: "normal", label: "Normale" },
  { value: "low", label: "Bassa" },
];

const STATUSES = [
  { value: "new", label: "Nuovo" },
  { value: "in_progress", label: "In corso" },
  { value: "completed", label: "Completato" },
  { value: "cancelled", label: "Annullato" },
];

export default function TasksPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterMine, setFilterMine] = useState(false);
  const [view, setView] = useState<"all" | "overdue">("all");
  const [showNew, setShowNew] = useState(false);
  const [editTask, setEditTask] = useState<{ id: number; status: string; progress: number } | null>(null);
  const [form, setForm] = useState({ title: "", description: "", priority: "normal", assignedToId: "", dueDate: "", notes: "" });

  const params = {
    page, limit: 20,
    ...(filterStatus !== "all" && { status: filterStatus }),
    ...(filterPriority !== "all" && { priority: filterPriority }),
    ...(filterMine && { assignedToMe: true }),
  };

  const { data, isLoading } = useListTasks(params, { query: { queryKey: getListTasksQueryKey(params), enabled: view === "all" } });
  const { data: overdueData } = useGetOverdueTasks({ query: { queryKey: getGetOverdueTasksQueryKey(), enabled: view === "overdue" } });
  const { data: users } = useListUsers({}, { query: { queryKey: getListUsersQueryKey() } });
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const items = view === "overdue" ? (overdueData ?? []) : (data?.items ?? []);
  const total = view === "overdue" ? (overdueData?.length ?? 0) : (data?.total ?? 0);
  const totalPages = Math.ceil(total / 20);
  const overdueCount = overdueData?.length ?? 0;

  function handleCreate() {
    createTask.mutate(
      {
        data: {
          ...form,
          priority: form.priority || "normal",
          assignedToId: form.assignedToId ? Number(form.assignedToId) : undefined,
          dueDate: form.dueDate || undefined,
        } as Parameters<typeof createTask.mutate>[0]["data"],
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["listTasks"] });
          setShowNew(false);
          setForm({ title: "", description: "", priority: "normal", assignedToId: "", dueDate: "", notes: "" });
        },
      }
    );
  }

  function handleStatusUpdate(id: number, status: string) {
    updateTask.mutate(
      { id, data: { status } as Parameters<typeof updateTask.mutate>[0]["data"] },
      { onSuccess: () => qc.invalidateQueries({ queryKey: ["listTasks"] }) }
    );
  }

  function handleDelete(id: number) {
    deleteTask.mutate(
      { id },
      { onSuccess: () => qc.invalidateQueries({ queryKey: ["listTasks"] }) }
    );
  }

  const isOverdue = (dueDate: string | null | undefined) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Attività</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {total} attività
            {overdueCount > 0 && <span className="ml-2 text-red-600 font-medium">{overdueCount} scadute</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-slate-200 rounded-md overflow-hidden text-xs">
            <button className={`px-3 py-1.5 transition-colors ${view === "all" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`} onClick={() => setView("all")}>Tutte</button>
            <button className={`px-3 py-1.5 flex items-center gap-1 transition-colors ${view === "overdue" ? "bg-red-700 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`} onClick={() => setView("overdue")}>
              <AlertTriangle className="h-3 w-3" />Scadute {overdueCount > 0 && <Badge className="h-4 text-xs bg-red-500">{overdueCount}</Badge>}
            </button>
          </div>
          <Button onClick={() => setShowNew(true)} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Nuova Attività
          </Button>
        </div>
      </div>

      <div className="px-6 py-3 flex gap-3 items-center border-b border-slate-100">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Stato" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Priorità" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte</SelectItem>
            {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-6 text-center text-slate-400 text-sm">Caricamento...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <CheckSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nessuna attività trovata</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {(items as Array<{
              id: number; title: string; description?: string | null; status: string; priority: string;
              progress: number; assignedToName?: string | null; dueDate?: string | null;
              protocolNumber?: string | null; documentTitle?: string | null; dossierTitle?: string | null;
            }>).map((task) => (
              <div key={task.id} className="px-6 py-4 hover:bg-slate-50 group flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-medium text-sm ${task.status === "completed" ? "line-through text-slate-400" : "text-slate-800"}`}>{task.title}</span>
                    <PriorityBadge priority={task.priority} />
                    <StatusBadge status={task.status} />
                    {task.dueDate && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${isOverdue(task.dueDate) && task.status !== "completed" ? "bg-red-100 text-red-700 font-medium" : "bg-slate-100 text-slate-600"}`}>
                        Scadenza: {new Date(task.dueDate).toLocaleDateString("it-IT")}
                      </span>
                    )}
                  </div>
                  {task.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{task.description}</p>}
                  <div className="flex items-center gap-4 mt-2 flex-wrap">
                    {task.assignedToName && <span className="text-xs text-slate-500">Assegnato: <span className="font-medium text-slate-700">{task.assignedToName}</span></span>}
                    {task.protocolNumber && <span className="text-xs text-slate-400">Prot. {task.protocolNumber}</span>}
                    {task.documentTitle && <span className="text-xs text-slate-400">Doc. {task.documentTitle}</span>}
                  </div>
                  {task.progress > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={task.progress} className="h-1.5 w-40" />
                      <span className="text-xs text-slate-400">{task.progress}%</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {task.status !== "completed" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleStatusUpdate(task.id, "completed")}>
                      Completa
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDelete(task.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {view === "all" && totalPages > 1 && (
        <div className="px-6 py-3 border-t border-slate-200 flex items-center gap-3">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-xs text-slate-600">Pagina {page} di {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Nuova Attività</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label className="text-xs text-slate-600 mb-1 block">Titolo *</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Titolo dell'attività" />
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Priorità</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Assegnato a</Label>
              <Select value={form.assignedToId} onValueChange={(v) => setForm((f) => ({ ...f, assignedToId: v }))}>
                <SelectTrigger><SelectValue placeholder="Nessuno" /></SelectTrigger>
                <SelectContent>
                  {(users ?? []).map((u: { id: number; name: string }) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Scadenza</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-slate-600 mb-1 block">Descrizione</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} placeholder="Descrizione dell'attività" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Annulla</Button>
            <Button onClick={handleCreate} disabled={!form.title || createTask.isPending}>
              {createTask.isPending ? "Salvataggio..." : "Crea Attività"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
