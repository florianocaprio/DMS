import { Link, useLocation } from "wouter";
import logoUrl from "@assets/Logo_Original_tondo_1782541417598.png";
import {
  LayoutDashboard,
  Files,
  FolderOpen,
  FileText,
  GitMerge,
  PenTool,
  Search,
  Users,
  BookOpen,
  Bell,
  Settings,
  ClipboardList,
  Upload,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { useClerk } from "@clerk/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useGetCurrentUser } from "@workspace/api-client-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Protocolli", href: "/protocols", icon: Files },
  { name: "Documenti", href: "/documents", icon: FileText },
  { name: "Fascicoli", href: "/dossiers", icon: FolderOpen },
  { name: "Workflow", href: "/workflows", icon: GitMerge },
  { name: "Firme", href: "/signatures", icon: PenTool },
  { name: "Ricerca", href: "/search", icon: Search },
];

const adminNavigation = [
  { name: "Utenti", href: "/admin/users", icon: Users },
  { name: "Titolario", href: "/admin/classifications", icon: BookOpen },
  { name: "Audit Log", href: "/admin/audit-log", icon: ClipboardList },
  { name: "Import Regystrum", href: "/admin/import", icon: Upload },
  { name: "Integrità", href: "/admin/integrity", icon: ShieldCheck },
  { name: "Impostazioni", href: "/admin/settings", icon: Settings },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: user } = useGetCurrentUser();
  const { signOut } = useClerk();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-60 border-r border-border bg-card flex flex-col fixed inset-y-0 z-10">
        <div className="h-14 flex items-center px-4 border-b border-border">
          <div className="font-bold text-base flex items-center gap-2.5">
            <img src={logoUrl} alt="Angeli in Moto" className="w-7 h-7 rounded-md object-contain" />
            <span className="text-foreground">ProtocolloDigitale</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <div className="mb-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 px-2">Menu</p>
            <ul className="space-y-0.5">
              {navigation.map((item) => {
                const isActive =
                  item.href === "/"
                    ? location === "/"
                    : location.startsWith(item.href);
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-foreground/80 hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 px-2">Amministrazione</p>
            <ul className="space-y-0.5">
              {adminNavigation.map((item) => {
                const isActive = location.startsWith(item.href);
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-foreground/80 hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md">
            <Avatar className="h-7 w-7">
              <AvatarImage src={user?.avatarUrl ?? undefined} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-foreground truncate">{user?.name ?? "Utente"}</div>
              <div className="text-xs text-muted-foreground truncate">{user?.email ?? "—"}</div>
            </div>
            <button
              type="button"
              onClick={() => signOut({ redirectUrl: basePath || "/" })}
              title="Esci"
              aria-label="Esci"
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors flex-shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 ml-60 flex flex-col min-h-screen">
        <header className="h-12 border-b border-border bg-card/80 backdrop-blur flex items-center justify-between px-6 sticky top-0 z-10">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative max-w-sm w-full hidden md:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Link href="/search">
                <input
                  type="text"
                  readOnly
                  placeholder="Cerca protocolli, documenti..."
                  className="w-full pl-8 pr-4 py-1.5 bg-muted/60 border border-transparent rounded-md text-xs text-muted-foreground cursor-pointer hover:bg-muted transition-colors outline-none"
                />
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="relative p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors">
              <Bell className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 flex flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
