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
import { Pencil, Plus, Users } from "lucide-react";
import { ROLE_OPTIONS, roleInfo } from "@/lib/roles";
import { useToast } from "@/hooks/use-toast";

type UserForm = {
  username: string;
  email: string;
  name: string;
  role: string;
  area: string;
  section: string;
  isActive: boolean;
  mustChangePassword: boolean;
};

type UserRow = {
  id: number;
  username?: string | null;
  email: string;
  name: string;
  role: string;
  area?: string | null;
  section?: string | null;
  isActive: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
};

const emptyForm: UserForm = {
  username: "",
  email: "",
  name: "",
  role: "protocol_operator",
  area: "",
  section: "",
  isActive: true,
  mustChangePassword: false,
};

export default function UsersPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filterRole, setFilterRole] = useState<string>("all");
  const [showNew, setShowNew] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [editForm, setEditForm] = useState<UserForm>(emptyForm);

  const params = { ...(filterRole !== "all" && { role: filterRole }) };
  const { data: users, isLoading } = useListUsers(params, { query: { queryKey: getListUsersQueryKey(params) } });
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  function handleCreate() {
    createUser.mutate(
      { data: cleanPayload(form) as Parameters<typeof createUser.mutate>[0]["data"] },
      {
        onSuccess: () => {
          invalidateUsers();
          setShowNew(false);
          setForm(emptyForm);
          toast({ title: "Utente creato" });
        },
        onError: (e) => toast({ title: "Errore creazione utente", description: getErrorMessage(e), variant: "destructive" }),
      }
    );
  }

  function handleToggleActive(id: number, isActive: boolean) {
    updateUser.mutate(
      { id, data: { isActive: !isActive } as Parameters<typeof updateUser.mutate>[0]["data"] },
      {
        onSuccess: () => {
          invalidateUsers();
          toast({ title: isActive ? "Utente disattivato" : "Utente riattivato" });
        },
        onError: (e) => toast({ title: "Errore aggiornamento", description: getErrorMessage(e), variant: "destructive" }),
      }
    );
  }

  function openEdit(user: UserRow) {
    setEditUser(user);
    setEditForm({
      username: user.username ?? "",
      email: user.email,
      name: user.name,
      role: user.role,
      area: user.area ?? "",
      section: user.section ?? "",
      isActive: user.isActive,
      mustChangePassword: Boolean(user.mustChangePassword),
    });
  }

  function handleUpdate() {
    if (!editUser) return;
    updateUser.mutate(
      { id: editUser.id, data: cleanPayload(editForm) as Parameters<typeof updateUser.mutate>[0]["data"] },
      {
        onSuccess: () => {
          invalidateUsers();
          setEditUser(null);
          toast({ title: "Utente aggiornato" });
        },
        onError: (e) => toast({ title: "Errore aggiornamento", description: getErrorMessage(e), variant: "destructive" }),
      },
    );
  }

  function invalidateUsers() {
    qc.invalidateQueries({
      predicate: (q) => JSON.stringify(q.queryKey).includes("/users") || JSON.stringify(q.queryKey).includes("listUsers"),
    });
  }

  const userList = (users ?? []) as UserRow[];

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
            {ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
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
                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {userList.map((u) => {
                const info = roleInfo(u.role);
                return (
                  <tr key={u.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openEdit(u)}>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-medium text-slate-800">{u.name}</span>
                          {u.username && <p className="text-[11px] text-slate-400 font-mono">{u.username}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{u.email}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-xs border ${info.color}`}>{info.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{u.area ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("it-IT") : "Mai"}
                    </td>
                    <td className="px-4 py-3">
                      <Switch
                        checked={u.isActive}
                        onCheckedChange={() => handleToggleActive(u.id, u.isActive)}
                        onClick={(e) => e.stopPropagation()}
                        className="scale-90"
                      />
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 text-xs"
                        onClick={(e) => { e.stopPropagation(); openEdit(u); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Modifica
                      </Button>
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
              <Label className="text-xs text-slate-600 mb-1 block">Username</Label>
              <Input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="nome.utente" />
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
                  {ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Area</Label>
              <Input value={form.area} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))} placeholder="Area di appartenenza" />
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Sezione</Label>
              <Input value={form.section} onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))} placeholder="Sezione" />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600 pt-6">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: Boolean(v) }))} />
              Attivo
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600 pt-6">
              <Switch checked={form.mustChangePassword} onCheckedChange={(v) => setForm((f) => ({ ...f, mustChangePassword: Boolean(v) }))} />
              Cambio password obbligatorio
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Annulla</Button>
            <Button onClick={handleCreate} disabled={!form.name || !form.email || createUser.isPending}>
              {createUser.isPending ? "Salvataggio..." : "Crea Utente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Modifica Utente</DialogTitle></DialogHeader>
          <UserFormFields form={editForm} onChange={setEditForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Annulla</Button>
            <Button onClick={handleUpdate} disabled={!editForm.name || !editForm.email || updateUser.isPending}>
              {updateUser.isPending ? "Salvataggio..." : "Salva modifiche"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserFormFields({ form, onChange }: { form: UserForm; onChange: (form: UserForm) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4 py-2">
      <div className="col-span-2">
        <Label className="text-xs text-slate-600 mb-1 block">Nome *</Label>
        <Input value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} placeholder="Nome completo" />
      </div>
      <div>
        <Label className="text-xs text-slate-600 mb-1 block">Username</Label>
        <Input value={form.username} onChange={(e) => onChange({ ...form, username: e.target.value })} placeholder="nome.utente" />
      </div>
      <div>
        <Label className="text-xs text-slate-600 mb-1 block">Email *</Label>
        <Input type="email" value={form.email} onChange={(e) => onChange({ ...form, email: e.target.value })} placeholder="email@organizzazione.it" />
      </div>
      <div>
        <Label className="text-xs text-slate-600 mb-1 block">Ruolo</Label>
        <Select value={form.role} onValueChange={(v) => onChange({ ...form, role: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs text-slate-600 mb-1 block">Area</Label>
        <Input value={form.area} onChange={(e) => onChange({ ...form, area: e.target.value })} placeholder="Area" />
      </div>
      <div>
        <Label className="text-xs text-slate-600 mb-1 block">Sezione</Label>
        <Input value={form.section} onChange={(e) => onChange({ ...form, section: e.target.value })} placeholder="Sezione" />
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600 pt-6">
        <Switch checked={form.isActive} onCheckedChange={(v) => onChange({ ...form, isActive: Boolean(v) })} />
        Attivo
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-600 pt-6">
        <Switch checked={form.mustChangePassword} onCheckedChange={(v) => onChange({ ...form, mustChangePassword: Boolean(v) })} />
        Cambio password obbligatorio
      </label>
    </div>
  );
}

function cleanPayload(form: UserForm) {
  return {
    username: form.username.trim() || null,
    email: form.email.trim(),
    name: form.name.trim(),
    role: form.role,
    area: form.area.trim() || null,
    section: form.section.trim() || null,
    isActive: form.isActive,
    mustChangePassword: form.mustChangePassword,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
