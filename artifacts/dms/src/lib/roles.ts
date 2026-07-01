export const ROLE_OPTIONS = [
  { value: "admin", label: "Amministratore", color: "bg-purple-50 text-purple-700 border-purple-200" },
  { value: "protocol_manager", label: "Responsabile protocollo", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "protocol_operator", label: "Operatore protocollo", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "procedure_owner", label: "Responsabile procedimento", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "viewer", label: "Consultazione", color: "bg-slate-50 text-slate-600 border-slate-200" },
  { value: "auditor", label: "Auditor", color: "bg-zinc-50 text-zinc-600 border-zinc-200" },
  { value: "manager", label: "Responsabile (legacy)", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "collaborator", label: "Collaboratore (legacy)", color: "bg-slate-50 text-slate-600 border-slate-200" },
];

export function roleInfo(role?: string | null) {
  return ROLE_OPTIONS.find((r) => r.value === role) ?? ROLE_OPTIONS[7];
}

export function canAccessAdminItem(role: string | null | undefined, item: string): boolean {
  if (role === "admin") return true;
  if (item === "audit" && role === "auditor") return true;
  return false;
}
