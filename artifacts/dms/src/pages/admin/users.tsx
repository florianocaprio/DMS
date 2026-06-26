import { useListUsers, useCreateUser, useUpdateUser, getListUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { Plus, Users, Shield, UserCheck, UserX } from "lucide-react";

const ROLES = [
  { value: "admin", label: "Amministratore", color: "bg-purple-50 text-purple-700 border-purple-200" },
  { value: "manager", label: "Responsabile", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "collaborator", label: "Collaboratore", color: "bg-slate-50 text-slate-600 border-slate-200" },
  { value: "viewer", label: "Visualizzatore", color: "bg-gray-50 text-gray-500 border-gray-200" },
];

export default function UsersPage() {
  const qc = useQueryClient();
  const [filterRole, setFilterRole] = useState<string>("all");
  const [showNew, setShowNew] = useState(false);
  const [editUser, setEditUser] = useState<{ id: number; isActive: boolean } | null>(null);
  const [form, setForm] = useState({ email: "", name: "", role: "collaborator", area: "", section: "" });

  const params = { ...(filterRole !== "all" && { role: filterRole }) };
  const { data: users, isLoading } = useListUsers(params, { query: { queryKey: getListUsersQueryKey(params) } });
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  function handleCreate() {
    createUser.mutate(
      { data: form as Parameters<typeof createUser.mutate>[0]["data"] },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["listUsers"] });
          setShowNew(false);
          setForm({ email: "", name: "", role: "collaborator", area: "", section: "" });
        },
      }
    );
  }

  function handleToggleActive(id: number, isActive: boolean) {
    updateUser.mutate(
      { id, data: { isActive: !isActive } as Parameters<typeof updateUser.mutate>[0]["data"] },
      { onSuccess: () => qc.invalidateQueries({ queryKey: ["listUsers"] }) }
    );
  }

  const userList = (users ?? []) as Array<{
    id: number; email: string; name: string; role: string; area?: string | null;
    section?: string | null; isActive: boolean; lastLoginAt?: string | null;
  }>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Gestione Utenti</h1>
          <p className="text-sm text-slate-500 mt-0.5">{userList.length} utenti</p>
        </div>
        <Button onClick={() => setShowNew(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nuovo Utente
        </Button>
      </div>

      <div className="px-6 py-3 flex gap-3 items-center border-b border-slate-100">
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Ruolo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i ruoli</SelectItem>
            {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-6 text-center text-slate-400 text-sm">Caricamento...</div>
        ) : userList.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nessun utente trovato</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ruolo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Area</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ultimo accesso</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Attivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {userList.map((u) => {
                const roleInfo = ROLES.find((r) => r.value === u.role) ?? ROLES[2];
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-800">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{u.email}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-xs border ${roleInfo.color}`}>{roleInfo.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{u.area ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("it-IT") : "Mai"}
                    </td>
                    <td className="px-4 py-3">
                      <Switch
                        checked={u.isActive}
                        onCheckedChange={() => handleToggleActive(u.id, u.isActive)}
                        className="scale-90"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nuovo Utente</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label className="text-xs text-slate-600 mb-1 block">Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nome completo" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-slate-600 mb-1 block">Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@organizzazione.it" />
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Ruolo</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Area</Label>
              <Input value={form.area} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))} placeholder="Area di appartenenza" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Annulla</Button>
            <Button onClick={handleCreate} disabled={!form.name || !form.email || createUser.isPending}>
              {createUser.isPending ? "Salvataggio..." : "Crea Utente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
