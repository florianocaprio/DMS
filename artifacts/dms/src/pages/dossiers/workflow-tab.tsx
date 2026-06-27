import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDossierWorkflowRules,
  useListDossierWorkflowInstances,
  useListUsers,
  useListDossiers,
  useGetCurrentUser,
  useCreateDossierWorkflowRule,
  useDeleteDossierWorkflowRule,
  useUpdateDossierWorkflowRule,
  useActOnWorkflowInstance,
  getListDossierWorkflowRulesQueryKey,
  getListDossierWorkflowInstancesQueryKey,
  getListUsersQueryKey,
  getListDossiersQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/status-badges";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Users, UserCheck, PenTool, CheckCircle, XCircle, Eye,
  GitMerge, FileText, Files, Power, FolderInput, Copy,
} from "lucide-react";

type RuleType = "cc" | "approval" | "signature" | "move" | "copy";
type AppliesTo = "documents" | "protocols" | "both";

interface RuleConfig {
  userIds?: number[];
  approverId?: number;
  signatoryIds?: number[];
  requireAll?: boolean;
  notifyEmails?: string[];
  targetDossierId?: number;
}
interface Rule {
  id: number;
  type: string;
  name: string;
  appliesTo: string;
  config: RuleConfig;
  participantNames: string[];
  isActive: boolean;
}
interface Participant {
  userId: number;
  userName: string;
  status: string;
}
interface Instance {
  id: number;
  ruleName: string;
  type: string;
  targetType: string;
  targetId: number;
  targetTitle: string | null;
  status: string;
  signatureRequestId: number | null;
  participants: Participant[];
}

const TYPE_META: Record<RuleType, { label: string; icon: typeof Users; color: string }> = {
  cc: { label: "Conoscenza", icon: Users, color: "bg-sky-50 text-sky-700 border-sky-200" },
  approval: { label: "Approvazione", icon: UserCheck, color: "bg-amber-50 text-amber-700 border-amber-200" },
  signature: { label: "Firma", icon: PenTool, color: "bg-purple-50 text-purple-700 border-purple-200" },
  move: { label: "Sposta", icon: FolderInput, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  copy: { label: "Copia", icon: Copy, color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
};

const APPLIES_LABEL: Record<string, string> = {
  documents: "Documenti",
  protocols: "Protocolli",
  both: "Documenti e protocolli",
};

const PART_STATUS_LABEL: Record<string, string> = {
  pending: "In attesa",
  approved: "Approvato",
  rejected: "Rifiutato",
  acknowledged: "Preso visione",
  signed: "Firmato",
};

export default function DossierWorkflowTab({ dossierId }: { dossierId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: rules } = useListDossierWorkflowRules(dossierId, {
    query: { queryKey: getListDossierWorkflowRulesQueryKey(dossierId) },
  });
  const { data: instances } = useListDossierWorkflowInstances(dossierId, {
    query: { queryKey: getListDossierWorkflowInstancesQueryKey(dossierId) },
  });
  const { data: users } = useListUsers(undefined, { query: { queryKey: getListUsersQueryKey() } });
  const { data: dossiers } = useListDossiers({}, { query: { queryKey: getListDossiersQueryKey() } });
  const { data: currentUser } = useGetCurrentUser();
  const currentUserId = currentUser?.id ?? 0;

  const createRule = useCreateDossierWorkflowRule();
  const deleteRule = useDeleteDossierWorkflowRule();
  const updateRule = useUpdateDossierWorkflowRule();
  const actOnInstance = useActOnWorkflowInstance();

  const [dialogOpen, setDialogOpen] = useState(false);

  const ruleList = (rules ?? []) as Rule[];
  const instanceList = (instances ?? []) as Instance[];
  const userList = (users ?? []) as Array<{ id: number; name: string }>;
  const dossierList = ((dossiers?.items ?? []) as Array<{ id: number; code: string; title: string }>)
    .filter((d) => d.id !== dossierId);

  function invalidate() {
    qc.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" &&
        (q.queryKey[0].includes("workflow-rules") || q.queryKey[0].includes("workflow-instances")),
    });
  }

  function handleToggle(rule: Rule) {
    updateRule.mutate(
      { id: rule.id, data: { isActive: !rule.isActive } },
      {
        onSuccess: () => invalidate(),
        onError: (e) => toast({ title: "Errore", description: String(e), variant: "destructive" }),
      },
    );
  }

  function handleDelete(id: number) {
    deleteRule.mutate(
      { id },
      {
        onSuccess: () => { invalidate(); toast({ title: "Regola eliminata" }); },
        onError: (e) => toast({ title: "Errore", description: String(e), variant: "destructive" }),
      },
    );
  }

  function handleAct(id: number, action: "approve" | "reject" | "acknowledge") {
    actOnInstance.mutate(
      { id, data: { action } },
      {
        onSuccess: () => { invalidate(); toast({ title: "Azione registrata" }); },
        onError: (e) => toast({ title: "Errore", description: String(e), variant: "destructive" }),
      },
    );
  }

  const pendingInstances = instanceList.filter((i) => i.status === "pending");
  const resolvedInstances = instanceList.filter((i) => i.status !== "pending");

  return (
    <div className="p-5 space-y-6">
      {/* ── Rules ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <GitMerge className="w-4 h-4 text-primary" /> Regole automatiche
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Si attivano automaticamente quando aggiungi documenti o protocolli a questo fascicolo.
            </p>
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Aggiungi regola
          </Button>
        </div>

        {ruleList.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-8 text-center">
            <GitMerge className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nessuna regola configurata per questo fascicolo</p>
          </div>
        ) : (
          <div className="space-y-2">
            {ruleList.map((r) => {
              const meta = TYPE_META[r.type as RuleType] ?? TYPE_META.cc;
              const Icon = meta.icon;
              return (
                <div key={r.id} className={`border border-border rounded-lg p-3.5 bg-card ${!r.isActive ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{r.name}</span>
                          <Badge variant="outline" className={`text-xs ${meta.color}`}>{meta.label}</Badge>
                          {!r.isActive && <Badge variant="outline" className="text-xs bg-slate-100 text-slate-500">Disattiva</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {APPLIES_LABEL[r.appliesTo] ?? r.appliesTo}
                          {r.participantNames.length > 0 && <> · {r.participantNames.join(", ")}</>}
                          {r.type === "signature" && r.config.requireAll === false && <> · una firma sufficiente</>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title={r.isActive ? "Disattiva" : "Attiva"} onClick={() => handleToggle(r)}>
                        <Power className={`w-3.5 h-3.5 ${r.isActive ? "text-emerald-600" : "text-muted-foreground"}`} />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" title="Elimina" onClick={() => handleDelete(r.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Active instances ── */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-3">In attesa di azione</h3>
        {pendingInstances.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna attività in attesa.</p>
        ) : (
          <div className="space-y-2">
            {pendingInstances.map((inst) => (
              <InstanceCard key={inst.id} inst={inst} onAct={handleAct} currentUserId={currentUserId} />
            ))}
          </div>
        )}
      </section>

      {/* ── Resolved instances ── */}
      {resolvedInstances.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-3">Concluse</h3>
          <div className="space-y-2">
            {resolvedInstances.map((inst) => (
              <InstanceCard key={inst.id} inst={inst} onAct={handleAct} currentUserId={currentUserId} />
            ))}
          </div>
        </section>
      )}

      {dialogOpen && (
        <AddRuleDialog
          dossierId={dossierId}
          users={userList}
          dossiers={dossierList}
          onClose={() => setDialogOpen(false)}
          onCreated={() => { invalidate(); setDialogOpen(false); }}
          createRule={createRule}
        />
      )}
    </div>
  );
}

// ─── Instance card ───────────────────────────────────────────────────────────

function InstanceCard({ inst, onAct, currentUserId }: { inst: Instance; onAct: (id: number, a: "approve" | "reject" | "acknowledge") => void; currentUserId: number }) {
  const meta = TYPE_META[inst.type as RuleType] ?? TYPE_META.cc;
  const Icon = meta.icon;
  const mine = inst.participants.find((p) => p.userId === currentUserId && p.status === "pending");
  const targetHref = inst.targetType === "document" ? `/documents/${inst.targetId}` : `/protocols/${inst.targetId}`;

  return (
    <div className="border border-border rounded-lg p-3.5 bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={`text-xs ${meta.color}`}>{meta.label}</Badge>
              {inst.targetType === "document" ? <FileText className="w-3.5 h-3.5 text-muted-foreground" /> : <Files className="w-3.5 h-3.5 text-muted-foreground" />}
              <Link href={targetHref} className="text-sm font-medium text-foreground hover:text-primary transition-colors line-clamp-1">
                {inst.targetTitle ?? `#${inst.targetId}`}
              </Link>
              <StatusBadge status={inst.status} />
            </div>
            <div className="text-xs text-muted-foreground mt-1">{inst.ruleName}</div>
            {/* participants */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {inst.participants.map((p) => (
                <span key={p.userId} className="inline-flex items-center gap-1 text-xs bg-muted/60 px-1.5 py-0.5 rounded border border-border/50">
                  <span className="text-muted-foreground">{p.userName}</span>
                  <span className={
                    p.status === "approved" || p.status === "signed" || p.status === "acknowledged" ? "text-emerald-600"
                    : p.status === "rejected" ? "text-red-600" : "text-amber-600"
                  }>· {PART_STATUS_LABEL[p.status] ?? p.status}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          {inst.type === "signature" ? (
            <Link href="/signatures">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                <PenTool className="w-3.5 h-3.5" /> Gestisci in Firme
              </Button>
            </Link>
          ) : mine ? (
            inst.type === "approval" ? (
              <>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => onAct(inst.id, "approve")}>
                  <CheckCircle className="w-3.5 h-3.5" /> Approva
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-700 border-red-200 hover:bg-red-50" onClick={() => onAct(inst.id, "reject")}>
                  <XCircle className="w-3.5 h-3.5" /> Rifiuta
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onAct(inst.id, "acknowledge")}>
                <Eye className="w-3.5 h-3.5" /> Presa visione
              </Button>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Add rule dialog ─────────────────────────────────────────────────────────

function parseEmails(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
}

function AddRuleDialog({
  dossierId, users, dossiers, onClose, onCreated, createRule,
}: {
  dossierId: number;
  users: Array<{ id: number; name: string }>;
  dossiers: Array<{ id: number; code: string; title: string }>;
  onClose: () => void;
  onCreated: () => void;
  createRule: ReturnType<typeof useCreateDossierWorkflowRule>;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<RuleType>("cc");
  const [name, setName] = useState("");
  const [appliesTo, setAppliesTo] = useState<AppliesTo>("both");
  const [selected, setSelected] = useState<number[]>([]);
  const [approverId, setApproverId] = useState<number | null>(null);
  const [requireAll, setRequireAll] = useState(true);
  const [notifyEmailsRaw, setNotifyEmailsRaw] = useState("");
  const [targetDossierId, setTargetDossierId] = useState<number | null>(null);

  const DEFAULT_NAMES: Record<RuleType, string> = {
    cc: "Invio in conoscenza al direttivo",
    approval: "Approvazione obbligatoria",
    signature: "Firma documenti",
    move: "Sposta in sottofascicolo",
    copy: "Copia in altro fascicolo",
  };

  function toggleUser(id: number) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function handleSubmit() {
    const finalName = name.trim() || DEFAULT_NAMES[type];
    const notifyEmails = parseEmails(notifyEmailsRaw);
    const badEmail = notifyEmails.find((e) => !e.includes("@"));
    if (badEmail) { toast({ title: `Email non valida: ${badEmail}`, variant: "destructive" }); return; }

    let config: RuleConfig;
    if (type === "cc") {
      if (selected.length === 0 && notifyEmails.length === 0) {
        toast({ title: "Seleziona un destinatario o inserisci un'email", variant: "destructive" }); return;
      }
      config = { userIds: selected, ...(notifyEmails.length > 0 && { notifyEmails }) };
    } else if (type === "approval") {
      if (!approverId) { toast({ title: "Seleziona un approvatore", variant: "destructive" }); return; }
      config = { approverId, ...(notifyEmails.length > 0 && { notifyEmails }) };
    } else if (type === "signature") {
      if (selected.length === 0) { toast({ title: "Seleziona almeno un firmatario", variant: "destructive" }); return; }
      config = { signatoryIds: selected, requireAll, ...(notifyEmails.length > 0 && { notifyEmails }) };
    } else {
      // move | copy
      if (!targetDossierId) { toast({ title: "Seleziona il fascicolo di destinazione", variant: "destructive" }); return; }
      config = { targetDossierId };
    }
    const effectiveAppliesTo: AppliesTo = type === "signature" ? "documents" : appliesTo;

    createRule.mutate(
      { id: dossierId, data: { type, name: finalName, appliesTo: effectiveAppliesTo, config: config as Record<string, unknown> } },
      {
        onSuccess: () => { toast({ title: "Regola creata" }); onCreated(); },
        onError: (e) => toast({ title: "Errore", description: String(e), variant: "destructive" }),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuova regola di workflow</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Type */}
          <div>
            <Label className="text-xs">Tipo di regola</Label>
            <div className="grid grid-cols-3 gap-2 mt-1.5">
              {(Object.keys(TYPE_META) as RuleType[]).map((t) => {
                const meta = TYPE_META[t];
                const Icon = meta.icon;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setType(t); setSelected([]); setApproverId(null); setTargetDossierId(null); }}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs transition-colors ${
                      type === t ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name */}
          <div>
            <Label className="text-xs">Nome</Label>
            <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder={DEFAULT_NAMES[type]} />
          </div>

          {/* Applies to (not for signature) */}
          {type !== "signature" && (
            <div>
              <Label className="text-xs">Si applica a</Label>
              <select
                className="w-full mt-1.5 border border-border rounded-md px-3 py-2 text-sm bg-background"
                value={appliesTo}
                onChange={(e) => setAppliesTo(e.target.value as AppliesTo)}
              >
                <option value="both">Documenti e protocolli</option>
                <option value="documents">Solo documenti</option>
                <option value="protocols">Solo protocolli</option>
              </select>
            </div>
          )}
          {type === "signature" && (
            <p className="text-xs text-muted-foreground">Le regole di firma si applicano solo ai documenti.</p>
          )}

          {/* Target dossier picker (move | copy) */}
          {(type === "move" || type === "copy") && (
            <div>
              <Label className="text-xs">
                {type === "move" ? "Sposta nel fascicolo" : "Copia nel fascicolo"}
              </Label>
              <select
                className="w-full mt-1.5 border border-border rounded-md px-3 py-2 text-sm bg-background"
                value={targetDossierId ?? ""}
                onChange={(e) => setTargetDossierId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Seleziona fascicolo…</option>
                {dossiers.map((d) => <option key={d.id} value={d.id}>{d.code} — {d.title}</option>)}
              </select>
              <p className="text-xs text-muted-foreground mt-1.5">
                {type === "move"
                  ? "Il contenuto verrà spostato (rimosso da questo fascicolo e aggiunto a quello scelto)."
                  : "Il contenuto resterà qui e verrà aggiunto anche al fascicolo scelto."}
              </p>
            </div>
          )}

          {/* Participants */}
          {type === "approval" ? (
            <div>
              <Label className="text-xs">Approvatore</Label>
              <select
                className="w-full mt-1.5 border border-border rounded-md px-3 py-2 text-sm bg-background"
                value={approverId ?? ""}
                onChange={(e) => setApproverId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Seleziona…</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          ) : (type === "cc" || type === "signature") ? (
            <div>
              <Label className="text-xs">{type === "cc" ? "Destinatari in conoscenza" : "Firmatari"}</Label>
              <div className="mt-1.5 max-h-40 overflow-y-auto border border-border rounded-md divide-y divide-border/50">
                {users.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                    <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggleUser(u.id)} className="rounded border-border" />
                    {u.name}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {/* notifyEmails (cc | approval | signature) */}
          {(type === "cc" || type === "approval" || type === "signature") && (
            <div>
              <Label className="text-xs">Email aggiuntive (notifica)</Label>
              <Input
                className="mt-1.5"
                value={notifyEmailsRaw}
                onChange={(e) => setNotifyEmailsRaw(e.target.value)}
                placeholder="mario@esempio.it, ufficio@esempio.it"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Indirizzi esterni a cui inviare una notifica via email (separati da virgola).
              </p>
            </div>
          )}

          {/* requireAll for signature */}
          {type === "signature" && selected.length > 1 && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={requireAll} onChange={(e) => setRequireAll(e.target.checked)} className="rounded border-border" />
              Richiedi tutte le firme (altrimenti una sola è sufficiente)
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={createRule.isPending}>Crea regola</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
