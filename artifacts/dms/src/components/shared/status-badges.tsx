import { Badge } from "@/components/ui/badge";

export function ProtocolTypeBadge({ type }: { type: string }) {
  switch (type.toLowerCase()) {
    case "incoming":
    case "entrata":
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">Entrata</Badge>;
    case "outgoing":
    case "uscita":
      return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">Uscita</Badge>;
    case "reserved":
    case "riservato":
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">Riservato</Badge>;
    case "internal":
    case "interno":
      return <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 text-xs">Interno</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{type}</Badge>;
  }
}

export function StatusBadge({ status }: { status: string }) {
  switch (status.toLowerCase()) {
    case "draft":
    case "bozza":
      return <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-slate-200 text-xs">Bozza</Badge>;
    case "registered":
    case "protocollato":
      return <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 text-xs">Protocollato</Badge>;
    case "assigned":
    case "assegnato":
      return <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 text-xs">Assegnato</Badge>;
    case "in_progress":
    case "in lavorazione":
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">In lavorazione</Badge>;
    case "in_approval":
    case "in approvazione":
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">In approvazione</Badge>;
    case "in_signature":
    case "in firma":
      return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs">In firma</Badge>;
    case "completed":
    case "completato":
      return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">Completato</Badge>;
    case "archived":
    case "archiviato":
      return <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-200 text-xs">Archiviato</Badge>;
    case "cancelled":
    case "annullato":
      return <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-xs">Annullato</Badge>;
    case "rejected":
    case "rifiutato":
      return <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 text-xs">Rifiutato</Badge>;
    case "open":
    case "aperto":
      return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">Aperto</Badge>;
    case "closed":
    case "chiuso":
      return <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 text-xs">Chiuso</Badge>;
    case "pending":
    case "in attesa":
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">In attesa</Badge>;
    case "imported":
    case "importato":
      return <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 text-xs">Importato</Badge>;
    case "new":
    case "nuovo":
      return <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 text-xs">Nuovo</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

export function PriorityBadge({ priority }: { priority: string }) {
  switch (priority.toLowerCase()) {
    case "urgent":
    case "urgente":
      return <Badge className="bg-red-600 text-white border-red-700 text-xs font-bold">URGENTE</Badge>;
    case "high":
    case "alta":
      return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs">Alta</Badge>;
    case "normal":
    case "normale":
      return <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 text-xs">Normale</Badge>;
    case "low":
    case "bassa":
      return <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200 text-xs">Bassa</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{priority}</Badge>;
  }
}

export function ConfidentialityBadge({ confidentiality }: { confidentiality: string }) {
  switch (confidentiality.toLowerCase()) {
    case "reserved":
    case "riservato":
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">Riservato</Badge>;
    case "secret":
    case "segreto":
      return <Badge className="bg-red-700 text-white border-red-800 text-xs">Segreto</Badge>;
    default:
      return <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 text-xs">Normale</Badge>;
  }
}
