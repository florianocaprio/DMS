import { useListWorkflows, useListDocumentWorkflows, useCreateWorkflow, useStartDocumentWorkflow, useAdvanceWorkflowStep, useListWorkflowInstances, useActOnWorkflowInstance, getListWorkflowsQueryKey, getListDocumentWorkflowsQueryKey, getListWorkflowInstancesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { StatusBadge } from "@/components/shared/status-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { GitBranch, Play, CheckCircle, XCircle, Clock, Users, UserCheck, PenTool, Eye, FileText, Files, FolderOpen } from "lucide-react";

const CURRENT_USER_ID = 1;

const INST_TYPE_META: Record<string, { label: string; icon: typeof Users; color: string }> = {
  cc: { label: "Conoscenza", icon: Users, color: "bg-sky-50 text-sky-700 border-sky-200" },
  approval: { label: "Approvazione", icon: UserCheck, color: "bg-amber-50 text-amber-700 border-amber-200" },
  signature: { label: "Firma", icon: PenTool, color: "bg-purple-50 text-purple-700 border-purple-200" },
};

export default function WorkflowsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: workflows } = useListWorkflows({ query: { queryKey: getListWorkflowsQueryKey() } });
  const { data: docWorkflows } = useListDocumentWorkflows({}, { query: { queryKey: getListDocumentWorkflowsQueryKey() } });
  const { data: pendingInstances } = useListWorkflowInstances(
    { pendingForMe: true },
    { query: { queryKey: getListWorkflowInstancesQueryKey({ pendingForMe: true }) } },
  );
  const advanceStep = useAdvanceWorkflowStep();
  const actOnInstance = useActOnWorkflowInstance();

  function handleAdvance(id: number, outcome: string) {
    advanceStep.mutate(
      { id, data: { outcome } as Parameters<typeof advanceStep.mutate>[0]["data"] },
      { onSuccess: () => qc.invalidateQueries({ queryKey: ["listDocumentWorkflows"] }) }
    );
  }

  function handleAct(id: number, action: "approve" | "reject" | "acknowledge") {
    actOnInstance.mutate(
      { id, data: { action } },
      {
        onSuccess: () => {
          qc.invalidateQueries({
            predicate: (q) =>
              typeof q.queryKey[0] === "string" && q.queryKey[0].includes("workflow-instances"),
          });
          toast({ title: "Azione registrata" });
        },
        onError: (e) => toast({ title: "Errore", description: String(e), variant: "destructive" }),
      },
    );
  }

  const activeWorkflows = (docWorkflows ?? []).filter((dw: { status: string }) => dw.status === "in_progress");
  const completedWorkflows = (docWorkflows ?? []).filter((dw: { status: string }) => dw.status !== "in_progress");
  const dossierInbox = (pendingInstances ?? []) as Array<{
    id: number; ruleName: string; type: string; dossierId: number;
    targetType: string; targetId: number; targetTitle: string | null;
    status: string; signatureRequestId: number | null;
  }>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Workflow</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {activeWorkflows.length} attivi · {dossierInbox.length} da gestire · {(workflows ?? []).length} modelli
          </p>
        </div>
      </div>

      <Tabs defaultValue="fascicoli" className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 border-b border-slate-100">
          <TabsList className="h-9 bg-transparent border-0 gap-0 p-0">
            <TabsTrigger value="fascicoli" className="data-[state=active]:border-b-2 data-[state=active]:border-slate-900 rounded-none px-4 text-xs">
              Fascicoli {dossierInbox.length > 0 && <Badge className="ml-1.5 h-4 text-xs">{dossierInbox.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="active" className="data-[state=active]:border-b-2 data-[state=active]:border-slate-900 rounded-none px-4 text-xs">
              In corso <Badge className="ml-1.5 h-4 text-xs">{activeWorkflows.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="completed" className="data-[state=active]:border-b-2 data-[state=active]:border-slate-900 rounded-none px-4 text-xs">
              Completati
            </TabsTrigger>
            <TabsTrigger value="templates" className="data-[state=active]:border-b-2 data-[state=active]:border-slate-900 rounded-none px-4 text-xs">
              Modelli
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="fascicoli" className="flex-1 overflow-auto m-0 p-6">
          {dossierInbox.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nessuna attività in attesa dai fascicoli</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dossierInbox.map((inst) => {
                const meta = INST_TYPE_META[inst.type] ?? INST_TYPE_META.cc;
                const Icon = meta.icon;
                const targetHref = inst.targetType === "document" ? `/documents/${inst.targetId}` : `/protocols/${inst.targetId}`;
                return (
                  <div key={inst.id} className="border border-slate-200 rounded-lg p-4 bg-white">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-4 h-4 text-slate-500" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className={`text-xs ${meta.color}`}>{meta.label}</Badge>
                            {inst.targetType === "document" ? <FileText className="w-3.5 h-3.5 text-slate-400" /> : <Files className="w-3.5 h-3.5 text-slate-400" />}
                            <Link href={targetHref} className="text-sm font-medium text-slate-900 hover:text-primary transition-colors line-clamp-1">
                              {inst.targetTitle ?? `#${inst.targetId}`}
                            </Link>
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {inst.ruleName} ·{" "}
                            <Link href={`/dossiers/${inst.dossierId}`} className="hover:text-primary transition-colors">
                              Fascicolo #{inst.dossierId}
                            </Link>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        {inst.type === "signature" ? (
                          <Link href="/signatures">
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                              <PenTool className="h-3.5 w-3.5" /> Gestisci in Firme
                            </Button>
                          </Link>
                        ) : inst.type === "approval" ? (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => handleAct(inst.id, "approve")}>
                              <CheckCircle className="h-3.5 w-3.5" /> Approva
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-700 border-red-200 hover:bg-red-50" onClick={() => handleAct(inst.id, "reject")}>
                              <XCircle className="h-3.5 w-3.5" /> Rifiuta
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleAct(inst.id, "acknowledge")}>
                            <Eye className="h-3.5 w-3.5" /> Presa visione
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="active" className="flex-1 overflow-auto m-0 p-6">
          {activeWorkflows.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <GitBranch className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nessun workflow attivo</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(activeWorkflows as Array<{
                id: number; documentTitle?: string | null; workflowName: string;
                currentStep: number; totalSteps: number; status: string;
                currentStepName?: string | null; currentStepAction?: string | null;
                currentAssigneeName?: string | null; startedAt: string;
              }>).map((dw) => (
                <div key={dw.id} className="border border-slate-200 rounded-lg p-4 bg-white">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="font-medium text-sm text-slate-900">{dw.documentTitle ?? "Documento senza titolo"}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{dw.workflowName}</div>
                      {dw.currentStepName && (
                        <div className="mt-2 flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-amber-500" />
                          <span className="text-xs text-slate-700">Fase attuale: <span className="font-medium">{dw.currentStepName}</span></span>
                          {dw.currentAssigneeName && <span className="text-xs text-slate-500">· {dw.currentAssigneeName}</span>}
                        </div>
                      )}
                      <div className="mt-3 flex items-center gap-3">
                        <Progress value={(dw.currentStep / dw.totalSteps) * 100} className="h-1.5 flex-1" />
                        <span className="text-xs text-slate-500 whitespace-nowrap">Fase {dw.currentStep} di {dw.totalSteps}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => handleAdvance(dw.id, "approved")}>
                        <CheckCircle className="h-3.5 w-3.5" />Approva
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-700 border-red-200 hover:bg-red-50" onClick={() => handleAdvance(dw.id, "rejected")}>
                        <XCircle className="h-3.5 w-3.5" />Rifiuta
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="flex-1 overflow-auto m-0 p-6">
          {completedWorkflows.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">Nessun workflow completato</div>
          ) : (
            <div className="space-y-2">
              {(completedWorkflows as Array<{ id: number; documentTitle?: string | null; workflowName: string; status: string; completedAt?: string | null }>).map((dw) => (
                <div key={dw.id} className="flex items-center justify-between px-4 py-3 border border-slate-100 rounded-lg bg-white">
                  <div>
                    <span className="text-sm font-medium text-slate-700">{dw.documentTitle ?? "—"}</span>
                    <span className="text-xs text-slate-400 ml-2">— {dw.workflowName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={dw.status} />
                    {dw.completedAt && <span className="text-xs text-slate-400">{new Date(dw.completedAt).toLocaleDateString("it-IT")}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="templates" className="flex-1 overflow-auto m-0 p-6">
          {(!workflows || workflows.length === 0) ? (
            <div className="text-center py-12 text-slate-400">
              <GitBranch className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nessun modello di workflow</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(workflows as Array<{ id: number; name: string; description?: string | null; documentType?: string | null; isActive: boolean; steps: Array<{ name: string; action: string; order: number }> }>).map((wf) => (
                <div key={wf.id} className="border border-slate-200 rounded-lg p-4 bg-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-sm text-slate-900">{wf.name}</div>
                      {wf.description && <div className="text-xs text-slate-500 mt-0.5">{wf.description}</div>}
                      {wf.documentType && <div className="text-xs text-slate-400 mt-1">Tipo: {wf.documentType}</div>}
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {wf.steps.map((s, i) => (
                          <div key={i} className="flex items-center gap-1 text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                            <span className="font-medium text-slate-400">{s.order}.</span>{s.name}
                          </div>
                        ))}
                      </div>
                    </div>
                    <Badge className={wf.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500"}>
                      {wf.isActive ? "Attivo" : "Disattivo"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
