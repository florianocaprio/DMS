import { useListSignatures, useSignDocument, useCreateSignatureRequest, useListDocuments, useListUsers, getListSignaturesQueryKey, getListDocumentsQueryKey, getListUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBadge } from "@/components/shared/status-badges";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { PenLine, CheckCircle, XCircle, Clock, Plus, User } from "lucide-react";

export default function SignaturesPage() {
  const qc = useQueryClient();
  const { data: allSignatures } = useListSignatures({}, { query: { queryKey: getListSignaturesQueryKey() } });
  const { data: pendingForMe } = useListSignatures({ pendingForMe: true }, { query: { queryKey: getListSignaturesQueryKey({ pendingForMe: true }) } });
  const { data: documents } = useListDocuments({}, { query: { queryKey: getListDocumentsQueryKey() } });
  const { data: users } = useListUsers({}, { query: { queryKey: getListUsersQueryKey() } });
  const signDoc = useSignDocument();
  const createRequest = useCreateSignatureRequest();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ documentId: "", type: "internal", note: "", signatoryId: "" });

  function handleSign(id: number, action: "sign" | "reject") {
    signDoc.mutate(
      { id, data: { action } as Parameters<typeof signDoc.mutate>[0]["data"] },
      { onSuccess: () => qc.invalidateQueries({ queryKey: ["listSignatures"] }) }
    );
  }

  function handleCreate() {
    createRequest.mutate(
      {
        data: {
          documentId: Number(form.documentId),
          type: form.type,
          note: form.note,
          signatories: form.signatoryId ? [{ userId: Number(form.signatoryId), order: 1 }] : [],
        } as Parameters<typeof createRequest.mutate>[0]["data"],
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["listSignatures"] });
          setShowNew(false);
          setForm({ documentId: "", type: "internal", note: "", signatoryId: "" });
        },
      }
    );
  }

  const pendingList = (pendingForMe ?? []) as Array<{
    id: number; documentTitle?: string | null; status: string; type: string;
    signatories: Array<{ userId: number; userName: string; order: number; status: string; signedAt?: string | null }>;
    requestedByName: string; createdAt: string; expiresAt?: string | null;
  }>;

  const allList = (allSignatures ?? []) as Array<{
    id: number; documentTitle?: string | null; status: string; type: string;
    signatories: Array<{ userId: number; userName: string; order: number; status: string; signedAt?: string | null }>;
    requestedByName: string; createdAt: string; completedAt?: string | null;
  }>;

  const SignatoryChip = ({ s }: { s: { userName: string; status: string; signedAt?: string | null } }) => (
    <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${s.status === "signed" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : s.status === "rejected" ? "bg-red-50 border-red-200 text-red-700" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
      {s.status === "signed" ? <CheckCircle className="h-3 w-3" /> : s.status === "rejected" ? <XCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      {s.userName}
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Firme Digitali</h1>
          <p className="text-sm text-slate-500 mt-0.5">{pendingList.length} in attesa di firma</p>
        </div>
        <Button onClick={() => setShowNew(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Richiedi Firma
        </Button>
      </div>

      <Tabs defaultValue="pending" className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 border-b border-slate-100">
          <TabsList className="h-9 bg-transparent border-0 gap-0 p-0">
            <TabsTrigger value="pending" className="data-[state=active]:border-b-2 data-[state=active]:border-slate-900 rounded-none px-4 text-xs">
              Da firmare {pendingList.length > 0 && <Badge className="ml-1.5 h-4 text-xs">{pendingList.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="all" className="data-[state=active]:border-b-2 data-[state=active]:border-slate-900 rounded-none px-4 text-xs">
              Tutte
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="pending" className="flex-1 overflow-auto m-0 p-6">
          {pendingList.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <PenLine className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nessuna firma in attesa</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingList.map((s) => (
                <div key={s.id} className="border border-slate-200 rounded-lg p-4 bg-white">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="font-medium text-sm text-slate-900">{s.documentTitle ?? "Documento"}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Richiesta da {s.requestedByName} · {new Date(s.createdAt).toLocaleDateString("it-IT")}
                        {s.expiresAt && <span className="ml-2 text-amber-600">Scade il {new Date(s.expiresAt).toLocaleDateString("it-IT")}</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {s.signatories.map((sig, i) => <SignatoryChip key={i} s={sig} />)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs gap-1 bg-emerald-700 hover:bg-emerald-800 text-white" onClick={() => handleSign(s.id, "sign")}>
                        <CheckCircle className="h-3.5 w-3.5" />Firma
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-700 border-red-200" onClick={() => handleSign(s.id, "reject")}>
                        <XCircle className="h-3.5 w-3.5" />Rifiuta
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="flex-1 overflow-auto m-0 p-6">
          <div className="space-y-3">
            {allList.map((s) => (
              <div key={s.id} className="border border-slate-200 rounded-lg p-4 bg-white">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-sm text-slate-900">{s.documentTitle ?? "Documento"}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {s.requestedByName} · {new Date(s.createdAt).toLocaleDateString("it-IT")}
                      {s.completedAt && <span className="ml-2">Completata: {new Date(s.completedAt).toLocaleDateString("it-IT")}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {s.signatories.map((sig, i) => <SignatoryChip key={i} s={sig} />)}
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Richiedi Firma</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Documento *</Label>
              <Select value={form.documentId} onValueChange={(v) => setForm((f) => ({ ...f, documentId: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleziona documento" /></SelectTrigger>
                <SelectContent>
                  {(documents?.items ?? []).map((d: { id: number; title: string }) => <SelectItem key={d.id} value={String(d.id)}>{d.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Firmatario</Label>
              <Select value={form.signatoryId} onValueChange={(v) => setForm((f) => ({ ...f, signatoryId: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleziona utente" /></SelectTrigger>
                <SelectContent>
                  {(users ?? []).map((u: { id: number; name: string }) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Note</Label>
              <Textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} rows={2} placeholder="Note per il firmatario" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Annulla</Button>
            <Button onClick={handleCreate} disabled={!form.documentId || createRequest.isPending}>
              {createRequest.isPending ? "Invio..." : "Invia Richiesta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
