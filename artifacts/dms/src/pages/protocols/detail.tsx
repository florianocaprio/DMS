import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useListDossiers,
  getListDossiersQueryKey,
  useListUsers,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import {
  ProtocolTypeBadge,
  StatusBadge,
  PriorityBadge,
  ConfidentialityBadge,
} from "@/components/shared/status-badges";
import { FileAttachments } from "@/components/shared/FileAttachments";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Mail,
  Send,
  Building2,
  Lock,
  Plus,
  X,
  Edit2,
  Save,
  RefreshCw,
  FolderOpen,
  User,
  Calendar,
  Flag,
  Shield,
  Inbox,
  Ban,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Protocol {
  id: number;
  number: string;
  year: number;
  type: string;
  status: string;
  subject: string;
  description: string | null;
  sender: string | null;
  recipients: string[] | null;
  ccRecipients: string[] | null;
  channel: string | null;
  confidentiality: string;
  priority: string;
  dossierId: number | null;
  dossierTitle: string | null;
  classificationId: number | null;
  classificationCode: string | null;
  assignedToId: number | null;
  assignedToName: string | null;
  registeredById: number;
  registeredByName: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  notes: string | null;
  registeredAt: string;
  createdAt: string;
  updatedAt: string;
}

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

// ─── Helpers ───────────────────────────────────────────────────────────────────

const API = "/api";

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => ({ error: r.statusText }))) as { error?: string };
    throw new Error(err.error ?? r.statusText);
  }
  return r.json() as Promise<T>;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: it });
}

const PRIORITIES = [
  { value: "urgent", label: "Urgente" },
  { value: "high", label: "Alta" },
  { value: "normal", label: "Normale" },
  { value: "low", label: "Bassa" },
];

const CONFIDENTIALITIES = [
  { value: "normal", label: "Normale" },
  { value: "reserved", label: "Riservato" },
  { value: "secret", label: "Segreto" },
];

function TypeIcon({ type }: { type: string }) {
  if (type === "incoming") return <Mail className="w-5 h-5 text-blue-600" />;
  if (type === "outgoing") return <Send className="w-5 h-5 text-emerald-600" />;
  if (type === "reserved") return <Lock className="w-5 h-5 text-red-600" />;
  return <Building2 className="w-5 h-5 text-slate-500" />;
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface Props {
  id: string;
}

export default function ProtocolDetail({ id }: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const protocolId = Number(id);

  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [memberships, setMemberships] = useState<DossierMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Membership management
  const [addDossierSel, setAddDossierSel] = useState<string>("");
  const [membBusy, setMembBusy] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    subject: "",
    description: "",
    sender: "",
    recipients: "",
    priority: "normal",
    confidentiality: "normal",
    assignedToId: "",
    notes: "",
  });

  // Cancel state
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const { data: dossiers } = useListDossiers({}, { query: { queryKey: getListDossiersQueryKey() } });
  const { data: users } = useListUsers({}, { query: { queryKey: getListUsersQueryKey({}) } });
  const userList = (users ?? []) as Array<{ id: number; name: string }>;

  function applyProtocol(p: Protocol) {
    setProtocol(p);
    setEditForm({
      subject: p.subject,
      description: p.description ?? "",
      sender: p.sender ?? "",
      recipients: (p.recipients ?? []).join(", "),
      priority: p.priority,
      confidentiality: p.confidentiality,
      assignedToId: p.assignedToId != null ? String(p.assignedToId) : "",
      notes: p.notes ?? "",
    });
  }

  async function loadMemberships() {
    const res = await fetch(`/api/protocols/${protocolId}/dossiers`);
    if (res.ok) setMemberships(await res.json());
  }

  // Initial load
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const p = await apiFetch<Protocol>(`/protocols/${protocolId}`);
        if (!active) return;
        applyProtocol(p);
        const att = await apiFetch<Attachment[]>(
          `/attachments?protocolId=${protocolId}&includeRemoved=true`,
        );
        if (!active) return;
        setAttachments(att);
        await loadMemberships();
      } catch (e) {
        if (!active) return;
        if (e instanceof Error && /not found|non trovato/i.test(e.message)) setNotFound(true);
        else toast({ title: "Errore caricamento", description: String(e), variant: "destructive" });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocolId]);

  async function handleAddMembership() {
    if (!addDossierSel) return;
    setMembBusy(true);
    try {
      await apiFetch(`/protocols/${protocolId}/dossiers`, {
        method: "POST",
        body: JSON.stringify({ dossierId: Number(addDossierSel) }),
      });
      setAddDossierSel("");
      await loadMemberships();
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    } finally {
      setMembBusy(false);
    }
  }

  async function handleRemoveMembership(dossierId: number) {
    setMembBusy(true);
    try {
      await apiFetch(`/protocols/${protocolId}/dossiers/${dossierId}`, { method: "DELETE" });
      await loadMemberships();
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    } finally {
      setMembBusy(false);
    }
  }

  async function handleSetPrimary(dossierId: number) {
    setMembBusy(true);
    try {
      await apiFetch(`/protocols/${protocolId}/dossiers`, {
        method: "POST",
        body: JSON.stringify({ dossierId, isPrimary: true }),
      });
      await loadMemberships();
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    } finally {
      setMembBusy(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await apiFetch<Protocol>(`/protocols/${protocolId}`, {
        method: "PATCH",
        body: JSON.stringify({
          subject: editForm.subject,
          description: editForm.description,
          sender: editForm.sender,
          recipients: editForm.recipients
            ? editForm.recipients.split(",").map((r) => r.trim()).filter(Boolean)
            : [],
          priority: editForm.priority,
          confidentiality: editForm.confidentiality,
          assignedToId: editForm.assignedToId ? Number(editForm.assignedToId) : null,
          notes: editForm.notes,
        }),
      });
      applyProtocol(updated);
      setEditing(false);
      toast({ title: "Protocollo aggiornato" });
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!cancelReason.trim()) return;
    setCancelling(true);
    try {
      const updated = await apiFetch<Protocol>(`/protocols/${protocolId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      applyProtocol(updated);
      setCancelOpen(false);
      setCancelReason("");
      toast({ title: "Protocollo annullato" });
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  }

  // ── Guards ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !protocol) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <Inbox className="w-12 h-12 text-muted-foreground/30" />
        <p className="text-muted-foreground">Protocollo non trovato</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/protocols")}>
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Torna ai protocolli
        </Button>
      </div>
    );
  }

  const availableDossiers = (dossiers?.items ?? []).filter(
    (d: { id: number }) => !memberships.some((m) => m.dossierId === d.id),
  ) as { id: number; code: string; title: string }[];

  const isRecipientType = protocol.type !== "incoming";

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-5 space-y-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm">
          <Link href="/protocols" className="text-muted-foreground hover:text-foreground transition-colors">
            Protocolli
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium font-mono text-xs">{protocol.number}</span>
        </div>

        {/* Header card */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <TypeIcon type={protocol.type} />
              </div>
              <div className="min-w-0">
                {editing ? (
                  <input
                    className="w-full border border-border rounded-md px-3 py-1.5 text-base font-semibold bg-background mb-1"
                    value={editForm.subject}
                    onChange={(e) => setEditForm((f) => ({ ...f, subject: e.target.value }))}
                  />
                ) : (
                  <h1 className="text-lg font-semibold text-foreground">{protocol.subject}</h1>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {protocol.number}
                  </span>
                  <ProtocolTypeBadge type={protocol.type} />
                  <StatusBadge status={protocol.status} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {editing ? (
                <>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? (
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Salva
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  {protocol.status !== "cancelled" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => setCancelOpen(true)}
                    >
                      <Ban className="w-3.5 h-3.5 mr-1.5" />
                      Annulla
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    <Edit2 className="w-3.5 h-3.5 mr-1.5" />
                    Modifica
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Description */}
          {editing ? (
            <textarea
              className="w-full mt-3 border border-border rounded-md px-3 py-2 text-sm bg-background resize-none"
              rows={2}
              value={editForm.description}
              onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Descrizione del protocollo"
            />
          ) : protocol.description ? (
            <p className="mt-3 text-sm text-muted-foreground">{protocol.description}</p>
          ) : null}

          {/* Cancel notice */}
          {protocol.status === "cancelled" && protocol.cancelReason && (
            <div className="mt-3 text-xs bg-red-50 border border-red-200 text-red-700 rounded-md px-3 py-2">
              <span className="font-medium">Annullato</span>
              {protocol.cancelledAt ? ` il ${fmtDate(protocol.cancelledAt)}` : ""}: {protocol.cancelReason}
            </div>
          )}

          {/* Meta grid */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3 pt-4 border-t border-border">
            {/* Sender / recipients */}
            <div className="flex items-start gap-2">
              <User className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">
                  {isRecipientType ? "Destinatari" : "Mittente"}
                </div>
                {editing ? (
                  <input
                    className="border border-border rounded px-1.5 py-0.5 text-xs bg-background w-full"
                    value={isRecipientType ? editForm.recipients : editForm.sender}
                    onChange={(e) =>
                      setEditForm((f) =>
                        isRecipientType
                          ? { ...f, recipients: e.target.value }
                          : { ...f, sender: e.target.value },
                      )
                    }
                    placeholder={isRecipientType ? "Separati da virgola" : "Nome mittente"}
                  />
                ) : (
                  <div className="text-xs font-medium">
                    {isRecipientType
                      ? protocol.recipients && protocol.recipients.length > 0
                        ? protocol.recipients.join(", ")
                        : "—"
                      : protocol.sender ?? "—"}
                  </div>
                )}
              </div>
            </div>

            {/* Priority */}
            <div className="flex items-start gap-2">
              <Flag className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground">Priorità</div>
                {editing ? (
                  <select
                    className="border border-border rounded px-1.5 py-0.5 text-xs bg-background"
                    value={editForm.priority}
                    onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value }))}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="mt-0.5">
                    <PriorityBadge priority={protocol.priority} />
                  </div>
                )}
              </div>
            </div>

            {/* Confidentiality */}
            <div className="flex items-start gap-2">
              <Shield className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground">Riservatezza</div>
                {editing ? (
                  <select
                    className="border border-border rounded px-1.5 py-0.5 text-xs bg-background"
                    value={editForm.confidentiality}
                    onChange={(e) => setEditForm((f) => ({ ...f, confidentiality: e.target.value }))}
                  >
                    {CONFIDENTIALITIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="mt-0.5">
                    <ConfidentialityBadge confidentiality={protocol.confidentiality} />
                  </div>
                )}
              </div>
            </div>

            {/* Assigned to */}
            <div className="flex items-start gap-2">
              <User className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Assegnato a</div>
                {editing ? (
                  <select
                    className="border border-border rounded px-1.5 py-0.5 text-xs bg-background w-full"
                    value={editForm.assignedToId}
                    onChange={(e) => setEditForm((f) => ({ ...f, assignedToId: e.target.value }))}
                  >
                    <option value="">Nessuno</option>
                    {userList.map((u) => (
                      <option key={u.id} value={String(u.id)}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-xs font-medium">{protocol.assignedToName ?? "—"}</div>
                )}
              </div>
            </div>

            {/* Registered */}
            <div className="flex items-start gap-2">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground">Registrato il</div>
                <div className="text-xs font-medium">{fmtDate(protocol.registeredAt)}</div>
                <div className="text-xs text-muted-foreground">da {protocol.registeredByName}</div>
              </div>
            </div>

            {/* Classification */}
            <div className="flex items-start gap-2">
              <FolderOpen className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground">Classificazione</div>
                <div className="text-xs font-medium">{protocol.classificationCode ?? "—"}</div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {editing ? (
            <div className="mt-3">
              <div className="text-xs text-muted-foreground mb-1">Note</div>
              <textarea
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background resize-none"
                rows={2}
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Note interne"
              />
            </div>
          ) : protocol.notes ? (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-xs text-muted-foreground mb-0.5">Note</div>
              <p className="text-sm text-muted-foreground">{protocol.notes}</p>
            </div>
          ) : null}
        </div>

        {/* Fascicoli (membership manager) */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-1.5 mb-3">
            <FolderOpen className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Fascicoli</h2>
            {memberships.length > 0 && (
              <span className="ml-1 bg-muted text-muted-foreground text-xs px-1.5 py-0.5 rounded-full">
                {memberships.length}
              </span>
            )}
          </div>

          {memberships.length === 0 ? (
            <p className="text-xs text-muted-foreground">Non archiviato in alcun fascicolo</p>
          ) : (
            <ul className="space-y-1.5">
              {memberships.map((m) => (
                <li
                  key={m.dossierId}
                  className="flex items-center gap-2 text-sm bg-muted/40 border border-border rounded-md px-3 py-2"
                >
                  <FolderOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/dossiers/${m.dossierId}`}
                      className="text-foreground hover:text-primary transition-colors truncate block"
                    >
                      <span className="font-mono text-xs text-muted-foreground">{m.dossierCode}</span>{" "}
                      {m.dossierTitle}
                    </Link>
                    {m.addedByName && (
                      <p className="text-[11px] text-muted-foreground">
                        {m.addedByName}
                        {m.addedAt ? ` · ${format(new Date(m.addedAt), "dd/MM/yyyy", { locale: it })}` : ""}
                      </p>
                    )}
                  </div>
                  {m.isPrimary ? (
                    <span className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium leading-none flex-shrink-0">
                      Principale
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSetPrimary(m.dossierId)}
                      disabled={membBusy}
                      className="text-[11px] text-muted-foreground hover:text-blue-700 flex-shrink-0"
                      title="Imposta come principale"
                    >
                      Rendi principale
                    </button>
                  )}
                  <button
                    onClick={() => handleRemoveMembership(m.dossierId)}
                    disabled={membBusy}
                    className="text-muted-foreground hover:text-red-600 flex-shrink-0"
                    title="Rimuovi dal fascicolo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2 mt-3">
            <Select value={addDossierSel} onValueChange={setAddDossierSel}>
              <SelectTrigger className="h-8 text-xs flex-1 max-w-sm">
                <SelectValue placeholder="Aggiungi a fascicolo" />
              </SelectTrigger>
              <SelectContent>
                {availableDossiers.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Nessun altro fascicolo disponibile
                  </div>
                ) : (
                  availableDossiers.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.code} — {d.title}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={!addDossierSel || membBusy}
              onClick={handleAddMembership}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Aggiungi
            </Button>
          </div>
        </div>

        {/* Allegati */}
        <div className="bg-card border border-border rounded-lg p-5">
          <FileAttachments
            protocolId={protocol.id}
            attachments={attachments}
            onAttachmentAdded={(a) => setAttachments((prev) => [...prev, a])}
            onAttachmentDeleted={(aid) =>
              setAttachments((prev) =>
                prev.map((a) =>
                  a.id === aid
                    ? { ...a, removedAt: new Date().toISOString(), removedByName: "Tu" }
                    : a,
                ),
              )
            }
            onAttachmentUpdated={(updated) =>
              setAttachments((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)))
            }
          />
        </div>
      </div>

      {/* Cancel dialog */}
      {cancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-md p-5">
            <h3 className="text-base font-semibold text-foreground mb-1">Annulla protocollo</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Indica il motivo dell'annullamento del protocollo {protocol.number}. L'operazione non è
              reversibile.
            </p>
            <textarea
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background resize-none"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motivo dell'annullamento"
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCancelOpen(false);
                  setCancelReason("");
                }}
              >
                Annulla
              </Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={!cancelReason.trim() || cancelling}
                onClick={handleCancel}
              >
                {cancelling ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                Conferma annullamento
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
