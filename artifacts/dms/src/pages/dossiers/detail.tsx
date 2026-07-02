import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/status-badges";
import { useToast } from "@/hooks/use-toast";
import { useLocalAuth } from "@/lib/local-auth";
import DossierWorkflowTab from "./workflow-tab";
import {
  ArrowLeft,
  FolderOpen,
  FolderTree,
  Plus,
  FileText,
  Files,
  Edit2,
  Save,
  X,
  User,
  Calendar,
  Tag,
  Lock,
  RefreshCw,
  GitMerge,
  BookOpen,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Dossier {
  id: number;
  code: string;
  title: string;
  description: string | null;
  status: string;
  year: number;
  area: string | null;
  confidentiality: string;
  isDefault?: boolean;
  parentId: number | null;
  parentCode: string | null;
  parentTitle: string | null;
  depth: number;
  childCount: number;
  responsibleId: number | null;
  responsibleName: string | null;
  classificationId: number | null;
  classificationCode: string | null;
  classificationTitle: string | null;
  documentCount: number;
  protocolCount: number;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Document {
  id: number;
  title: string;
  type: string;
  status: string;
  subject: string;
  priority: string;
  version: number;
  createdByName: string;
  createdAt: string;
}

interface Protocol {
  id: number;
  number: string;
  type: string;
  status: string;
  subject: string;
  sender: string | null;
  priority: string;
  registeredAt: string | null;
  createdByName: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const API = "/api";

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText })) as { error?: string };
    throw new Error(err.error ?? r.statusText);
  }
  return r.json() as Promise<T>;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return format(new Date(d), "dd/MM/yyyy", { locale: it });
}

const STATUS_LABELS: Record<string, string> = {
  open: "Aperto",
  closed: "Chiuso",
  archived: "Archiviato",
};

const CONFIDENTIALITY_LABELS: Record<string, string> = {
  normal: "Normale",
  reserved: "Riservato",
  secret: "Segreto",
};

const TYPE_LABELS: Record<string, string> = {
  incoming: "Entrata",
  outgoing: "Uscita",
  internal: "Interno",
  reserved: "Riservato",
};

function canReopenDossier(role: string | null | undefined) {
  return role === "admin" || role === "protocol_manager";
}

// Max nesting levels of sub-fascicoli (mirrors the API MAX_SUB_LEVELS).
const MAX_SUB_LEVELS = 4;

// Soft green backgrounds, progressively darker as sub-fascicoli nest deeper.
// depth 0 (top-level / fascicolo principale) keeps the default page background.
const NEST_BG: Record<number, string> = {
  1: "#f0fdf4", // green-50
  2: "#dcfce7", // green-100
  3: "#bbf7d0", // green-200
  4: "#a7f3cf", // green-200/300
};

// ─── Component ─────────────────────────────────────────────────────────────────

type Tab = "documents" | "protocols" | "subdossiers" | "workflow";

interface SubDossier {
  id: number;
  code: string;
  title: string;
  status: string;
  documentCount: number;
  protocolCount: number;
}

interface Props {
  id: string;
}

export default function DossierDetail({ id }: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useLocalAuth();
  const dossierId = Number(id);

  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [children, setChildren] = useState<SubDossier[]>([]);
  const [tab, setTab] = useState<Tab>("documents");
  const [loading, setLoading] = useState(true);
  const [loadingTab, setLoadingTab] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Sub-dossier creation
  const [showNewChild, setShowNewChild] = useState(false);
  const [childTitle, setChildTitle] = useState("");
  const [creatingChild, setCreatingChild] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", description: "", area: "", status: "", confidentiality: "", parentId: "", classificationId: "" });
  const [saving, setSaving] = useState(false);
  const [allDossiers, setAllDossiers] = useState<{ id: number; code: string; title: string; status: string }[]>([]);
  const [allClassifications, setAllClassifications] = useState<{ id: number; code: string; title: string; isActive?: boolean }[]>([]);

  // Initial load
  useEffect(() => {
    (async () => {
      try {
        const d = await apiFetch<Dossier>(`/dossiers/${dossierId}`);
        setDossier(d);
        setEditForm({
          title: d.title,
          description: d.description ?? "",
          area: d.area ?? "",
          status: d.status,
          confidentiality: d.confidentiality,
          parentId: d.parentId != null ? String(d.parentId) : "",
          classificationId: d.classificationId != null ? String(d.classificationId) : "",
        });
        const docs = await apiFetch<Document[]>(`/dossiers/${dossierId}/documents`);
        setDocuments(docs);
      } catch (e) {
        if (e instanceof Error && e.message.includes("Not found")) setNotFound(true);
        else toast({ title: "Errore caricamento", description: String(e), variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [dossierId]);

  const loadTab = async (t: Tab) => {
    setTab(t);
    if (t === "workflow") return;
    setLoadingTab(true);
    try {
      if (t === "documents") {
        const docs = await apiFetch<Document[]>(`/dossiers/${dossierId}/documents`);
        setDocuments(docs);
      } else if (t === "protocols") {
        const prots = await apiFetch<Protocol[]>(`/dossiers/${dossierId}/protocols`);
        setProtocols(prots);
      } else {
        const subs = await apiFetch<SubDossier[]>(`/dossiers/${dossierId}/children`);
        setChildren(subs);
      }
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    } finally {
      setLoadingTab(false);
    }
  };

  const handleCreateChild = async () => {
    if (!childTitle.trim()) return;
    setCreatingChild(true);
    try {
      await apiFetch<Dossier>(`/dossiers`, {
        method: "POST",
        body: JSON.stringify({ title: childTitle.trim(), parentId: dossierId }),
      });
      setChildTitle("");
      setShowNewChild(false);
      const subs = await apiFetch<SubDossier[]>(`/dossiers/${dossierId}/children`);
      setChildren(subs);
      const refreshed = await apiFetch<Dossier>(`/dossiers/${dossierId}`);
      setDossier(refreshed);
      toast({ title: "Sotto-fascicolo creato" });
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    } finally {
      setCreatingChild(false);
    }
  };

  const startEditing = async () => {
    setEditing(true);
    if (allDossiers.length === 0) {
      try {
        const list = await apiFetch<{ items: { id: number; code: string; title: string; status: string }[] }>(`/dossiers?limit=500`);
        setAllDossiers(list.items ?? []);
      } catch {
        // selector falls back to "Nessuno" only
      }
    }
    if (allClassifications.length === 0) {
      try {
        setAllClassifications(await apiFetch<{ id: number; code: string; title: string; isActive?: boolean }[]>(`/classifications`));
      } catch {
        // selector falls back to "Nessuna" only
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { parentId, classificationId, ...rest } = editForm;
      const updated = await apiFetch<Dossier>(`/dossiers/${dossierId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...rest,
          parentId: parentId === "" ? null : Number(parentId),
          classificationId: classificationId === "" ? null : Number(classificationId),
        }),
      });
      setDossier(updated);
      setEditing(false);
      toast({ title: "Fascicolo aggiornato" });
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleReopen = async () => {
    setSaving(true);
    try {
      const updated = await apiFetch<Dossier>(`/dossiers/${dossierId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "open" }),
      });
      setDossier(updated);
      setEditForm((f) => ({ ...f, status: updated.status }));
      toast({ title: "Fascicolo riaperto" });
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Guards ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !dossier) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <FolderOpen className="w-12 h-12 text-muted-foreground/30" />
        <p className="text-muted-foreground">Fascicolo non trovato</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/dossiers")}>
          <ArrowLeft className="w-4 h-4 mr-1.5" />Torna ai fascicoli
        </Button>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const nestBg = dossier.depth > 0 ? NEST_BG[Math.min(dossier.depth, MAX_SUB_LEVELS)] : undefined;
  const atDepthLimit = dossier.depth >= MAX_SUB_LEVELS;
  const canReopen = canReopenDossier(user?.role);
  const canEditDossier = dossier.status !== "archived";
  const isOpenDossier = dossier.status === "open";
  const statusOptions = [
    { value: "open", label: "Aperto" },
    { value: "closed", label: "Chiuso" },
    { value: "archived", label: "Archiviato" },
  ].filter((option) => {
    if (dossier.isDefault) return option.value === "open";
    if (dossier.status === "closed" && option.value === "open" && !canReopen) return false;
    return true;
  });

  return (
    <div
      className="flex-1 overflow-y-auto transition-colors"
      style={nestBg ? { backgroundColor: nestBg } : undefined}
    >
      <div className="max-w-5xl mx-auto px-6 py-5 space-y-5">

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm">
          <Link href="/dossiers" className="text-muted-foreground hover:text-foreground transition-colors">Fascicoli</Link>
          <span className="text-muted-foreground">/</span>
          {dossier.parentId && (
            <>
              <Link href={`/dossiers/${dossier.parentId}`} className="text-muted-foreground hover:text-foreground transition-colors font-mono text-xs">
                {dossier.parentCode ?? dossier.parentTitle}
              </Link>
              <span className="text-muted-foreground">/</span>
            </>
          )}
          <span className="font-medium font-mono text-xs">{dossier.code}</span>
          {dossier.depth > 0 && (
            <span className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-100/70 px-2 py-0.5 text-[11px] font-medium text-green-800">
              <FolderTree className="w-3 h-3" />
              Sotto-fascicolo · livello {dossier.depth}
            </span>
          )}
        </div>

        {/* Header card */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <FolderOpen className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                {editing ? (
                  <input
                    className="w-full border border-border rounded-md px-3 py-1.5 text-base font-semibold bg-background mb-1"
                    value={editForm.title}
                    onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  />
                ) : (
                  <h1 className="text-lg font-semibold text-foreground">{dossier.title}</h1>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{dossier.code}</span>
                  {editing ? (
                    <select
                      className="border border-border rounded px-2 py-0.5 text-xs bg-background"
                      value={editForm.status}
                      onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                    >
                      {statusOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  ) : (
                    <StatusBadge status={dossier.status} />
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {editing ? (
                <>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                    Salva
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  {dossier.status === "closed" && canReopen && (
                    <Button size="sm" variant="outline" onClick={handleReopen} disabled={saving}>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Riapri
                    </Button>
                  )}
                  {canEditDossier && (
                    <Button size="sm" variant="outline" onClick={startEditing}>
                      <Edit2 className="w-3.5 h-3.5 mr-1.5" />Modifica
                    </Button>
                  )}
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
              onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Descrizione del fascicolo"
            />
          ) : dossier.description ? (
            <p className="mt-3 text-sm text-muted-foreground">{dossier.description}</p>
          ) : null}

          {/* Meta grid */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-border">
            <div className="flex items-start gap-2">
              <User className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground">Responsabile</div>
                <div className="text-xs font-medium">{dossier.responsibleName ?? "—"}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Tag className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground">Area</div>
                {editing ? (
                  <input
                    className="border border-border rounded px-1.5 py-0.5 text-xs bg-background w-full"
                    value={editForm.area}
                    onChange={e => setEditForm(f => ({ ...f, area: e.target.value }))}
                    placeholder="Area"
                  />
                ) : (
                  <div className="text-xs font-medium">{dossier.area ?? "—"}</div>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Lock className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground">Riservatezza</div>
                {editing ? (
                  <select
                    className="border border-border rounded px-1.5 py-0.5 text-xs bg-background"
                    value={editForm.confidentiality}
                    onChange={e => setEditForm(f => ({ ...f, confidentiality: e.target.value }))}
                  >
                    <option value="normal">Normale</option>
                    <option value="reserved">Riservato</option>
                    <option value="secret">Segreto</option>
                  </select>
                ) : (
                  <div className="text-xs font-medium">{CONFIDENTIALITY_LABELS[dossier.confidentiality] ?? dossier.confidentiality}</div>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <FolderTree className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Fascicolo padre</div>
                {editing ? (
                  <select
                    className="border border-border rounded px-1.5 py-0.5 text-xs bg-background w-full"
                    value={editForm.parentId}
                    onChange={e => setEditForm(f => ({ ...f, parentId: e.target.value }))}
                  >
                    <option value="">Nessuno</option>
                    {allDossiers
                      .filter(d => d.id !== dossier.id && d.status === "open")
                      .map(d => (
                        <option key={d.id} value={String(d.id)}>{d.code} — {d.title}</option>
                      ))}
                  </select>
                ) : dossier.parentId ? (
                  <Link href={`/dossiers/${dossier.parentId}`} className="text-xs font-medium hover:underline truncate block">
                    {dossier.parentCode} {dossier.parentTitle}
                  </Link>
                ) : (
                  <div className="text-xs font-medium">—</div>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <BookOpen className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Classificazione</div>
                {editing ? (
                  <select
                    className="border border-border rounded px-1.5 py-0.5 text-xs bg-background w-full"
                    value={editForm.classificationId}
                    onChange={e => setEditForm(f => ({ ...f, classificationId: e.target.value }))}
                  >
                    <option value="">Nessuna</option>
                    {allClassifications
                      .filter(c => c.isActive !== false)
                      .map(c => (
                        <option key={c.id} value={String(c.id)}>{c.code} - {c.title}</option>
                      ))}
                  </select>
                ) : (
                  <div className="text-xs font-medium">
                    {dossier.classificationCode
                      ? `${dossier.classificationCode}${dossier.classificationTitle ? ` - ${dossier.classificationTitle}` : ""}`
                      : "—"}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground">Aperto il</div>
                <div className="text-xs font-medium">{fmtDate(dossier.openedAt)}</div>
                {dossier.closedAt && (
                  <div className="text-xs text-muted-foreground">Chiuso: {fmtDate(dossier.closedAt)}</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => loadTab("documents")}
            className={`bg-card border rounded-lg p-4 text-left transition-colors ${tab === "documents" ? "border-primary" : "border-border hover:border-primary/40"}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Documenti</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{dossier.documentCount}</div>
          </button>
          <button
            onClick={() => loadTab("protocols")}
            className={`bg-card border rounded-lg p-4 text-left transition-colors ${tab === "protocols" ? "border-primary" : "border-border hover:border-primary/40"}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Files className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Protocolli</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{dossier.protocolCount}</div>
          </button>
          <button
            onClick={() => loadTab("subdossiers")}
            className={`bg-card border rounded-lg p-4 text-left transition-colors ${tab === "subdossiers" ? "border-primary" : "border-border hover:border-primary/40"}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <FolderTree className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Sotto-fascicoli</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{dossier.childCount}</div>
          </button>
        </div>

        {/* Tab content */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {/* Tab header */}
          <div className="flex border-b border-border">
            {([["documents", "Documenti", FileText], ["protocols", "Protocolli", Files], ["subdossiers", "Sotto-fascicoli", FolderTree], ["workflow", "Workflow", GitMerge]] as const).map(([t, label, Icon]) => (
              <button
                key={t}
                onClick={() => loadTab(t)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Documents tab */}
          {tab === "documents" && (
            loadingTab ? (
              <div className="p-8 text-center"><RefreshCw className="w-4 h-4 animate-spin text-muted-foreground mx-auto" /></div>
            ) : documents.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nessun documento in questo fascicolo</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Titolo</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipo</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stato</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Versione</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Creato da</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map(doc => (
                    <tr key={doc.id} className="border-t border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <Link href={`/documents/${doc.id}`} className="font-medium text-foreground hover:text-primary transition-colors line-clamp-1">
                          {doc.title}
                        </Link>
                        <div className="text-xs text-muted-foreground line-clamp-1">{doc.subject}</div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground capitalize">{doc.type}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={doc.status} /></td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">v{doc.version}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{doc.createdByName}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDate(doc.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {/* Protocols tab */}
          {tab === "protocols" && (
            loadingTab ? (
              <div className="p-8 text-center"><RefreshCw className="w-4 h-4 animate-spin text-muted-foreground mx-auto" /></div>
            ) : protocols.length === 0 ? (
              <div className="p-8 text-center">
                <Files className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nessun protocollo associato a questo fascicolo</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Numero</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipo</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Oggetto</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mitt./Dest.</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stato</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Data reg.</th>
                  </tr>
                </thead>
                <tbody>
                  {protocols.map(p => (
                    <tr key={p.id} className="border-t border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <Link href={`/protocols/${p.id}`} className="font-mono text-xs font-medium text-foreground hover:text-primary transition-colors">
                          {p.number}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={p.type} />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-xs">
                        <span className="line-clamp-1" title={p.subject}>{p.subject}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.sender ?? "—"}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDate(p.registeredAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {/* Sub-dossiers tab */}
          {tab === "subdossiers" && (
            <div>
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/40">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sotto-fascicoli</span>
                {!isOpenDossier ? (
                  <span className="text-xs text-muted-foreground">Disponibile solo per fascicoli aperti</span>
                ) : atDepthLimit ? (
                  <span className="text-xs text-muted-foreground">Limite di {MAX_SUB_LEVELS} livelli raggiunto</span>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setShowNewChild((v) => !v)}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Nuovo sotto-fascicolo
                  </Button>
                )}
              </div>
              {showNewChild && isOpenDossier && (
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/20">
                  <Input
                    value={childTitle}
                    onChange={(e) => setChildTitle(e.target.value)}
                    placeholder="Titolo del sotto-fascicolo"
                    className="flex-1"
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreateChild(); }}
                  />
                  <Button size="sm" onClick={handleCreateChild} disabled={creatingChild || !childTitle.trim()}>
                    {creatingChild ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Crea"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowNewChild(false); setChildTitle(""); }}>Annulla</Button>
                </div>
              )}
              {loadingTab ? (
                <div className="p-8 text-center"><RefreshCw className="w-4 h-4 animate-spin text-muted-foreground mx-auto" /></div>
              ) : children.length === 0 ? (
                <div className="p-8 text-center">
                  <FolderTree className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nessun sotto-fascicolo</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Codice</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Titolo</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stato</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Doc.</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Prot.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {children.map((c) => (
                      <tr key={c.id} className="border-t border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5">
                          <Link href={`/dossiers/${c.id}`} className="font-mono text-xs font-medium text-foreground hover:text-primary transition-colors">{c.code}</Link>
                        </td>
                        <td className="px-4 py-2.5">
                          <Link href={`/dossiers/${c.id}`} className="font-medium text-foreground hover:text-primary transition-colors line-clamp-1">{c.title}</Link>
                        </td>
                        <td className="px-4 py-2.5"><StatusBadge status={c.status} /></td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.documentCount}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.protocolCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Workflow tab */}
          {tab === "workflow" && <DossierWorkflowTab dossierId={dossierId} />}
        </div>
      </div>
    </div>
  );
}
