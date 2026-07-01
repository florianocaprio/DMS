import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Loader2, Lock, UserPlus } from "lucide-react";
import { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { LocalAuthProvider, useLocalAuth } from "@/lib/local-auth";
import logoUrl from "@assets/Logo_Original_tondo_1782541417598.png";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import ProtocolsPage from "@/pages/protocols/index";
import DocumentsPage from "@/pages/documents/index";
import DossiersPage from "@/pages/dossiers/index";
import WorkflowsPage from "@/pages/workflows/index";
import SignaturesPage from "@/pages/signatures/index";
import SearchPage from "@/pages/search/index";
import UsersPage from "@/pages/admin/users";
import ClassificationsPage from "@/pages/admin/classifications";
import SettingsPage from "@/pages/admin/settings";
import AuditLogPage from "@/pages/admin/audit-log";
import ImportPage from "@/pages/admin/import";
import DossierDetail from "@/pages/dossiers/detail";
import ProtocolDetail from "@/pages/protocols/detail";
import IntegrityPage from "@/pages/admin/integrity";
import { canAccessAdminItem } from "@/lib/roles";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function FullscreenLoader() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
}

function LoginScreen() {
  const { login } = useLocalAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      // On success the LocalAuthProvider state flips and the app renders.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accesso non riuscito");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-sm p-8 flex flex-col items-center text-center">
        <img src={logoUrl} alt="Angeli in Moto" className="w-16 h-16 rounded-xl object-contain mb-5" />
        <h1 className="text-xl font-bold text-foreground">ProtocolloDigitale</h1>
        <p className="text-sm text-muted-foreground mt-1.5 mb-7">
          Accedi per gestire protocolli, documenti e fascicoli.
        </p>

        <form onSubmit={onSubmit} className="w-full space-y-3 text-left">
          <div>
            <label htmlFor="username" className="block text-xs font-medium text-foreground mb-1">Nome utente</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="nome.utente"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-medium text-foreground mb-1">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !username || !password}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Accedi
          </button>
        </form>
      </div>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <Lock className="w-10 h-10 opacity-30" />
      <p className="text-sm">Accesso non autorizzato</p>
    </div>
  );
}

function AdminRoute({ item, children }: { item: string; children: React.ReactNode }) {
  const { user } = useLocalAuth();
  if (!canAccessAdminItem(user?.role, item)) return <AccessDenied />;
  return <>{children}</>;
}

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/protocols" component={ProtocolsPage} />
        <Route path="/protocols/:id">{(params) => <ProtocolDetail id={params.id} />}</Route>
        <Route path="/documents" component={DocumentsPage} />
        <Route path="/dossiers" component={DossiersPage} />
        <Route path="/dossiers/:id">{(params) => <DossierDetail id={params.id} />}</Route>
        <Route path="/workflows" component={WorkflowsPage} />
        <Route path="/signatures" component={SignaturesPage} />
        <Route path="/search" component={SearchPage} />
        <Route path="/admin/users"><AdminRoute item="users"><UsersPage /></AdminRoute></Route>
        <Route path="/admin/classifications"><AdminRoute item="classifications"><ClassificationsPage /></AdminRoute></Route>
        <Route path="/admin/settings"><AdminRoute item="settings"><SettingsPage /></AdminRoute></Route>
        <Route path="/admin/audit-log"><AdminRoute item="audit"><AuditLogPage /></AdminRoute></Route>
        <Route path="/admin/import"><AdminRoute item="import"><ImportPage /></AdminRoute></Route>
        <Route path="/admin/integrity"><AdminRoute item="integrity"><IntegrityPage /></AdminRoute></Route>
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function ChangePasswordScreen() {
  const { changePassword } = useLocalAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (newPassword.length < 8) {
      setError("La nuova password deve contenere almeno 8 caratteri");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Le password non coincidono");
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      // On success mustChangePassword flips to false and the app renders.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile aggiornare la password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-sm p-8 flex flex-col items-center text-center">
        <img src={logoUrl} alt="Angeli in Moto" className="w-16 h-16 rounded-xl object-contain mb-5" />
        <h1 className="text-xl font-bold text-foreground">Cambio password obbligatorio</h1>
        <p className="text-sm text-muted-foreground mt-1.5 mb-7">
          Per motivi di sicurezza imposta una nuova password prima di continuare.
        </p>
        <form onSubmit={onSubmit} className="w-full space-y-3 text-left">
          <div>
            <label htmlFor="cp-current" className="block text-xs font-medium text-foreground mb-1">Password attuale</label>
            <input
              id="cp-current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label htmlFor="cp-new" className="block text-xs font-medium text-foreground mb-1">Nuova password</label>
            <input
              id="cp-new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Almeno 8 caratteri"
            />
          </div>
          <div>
            <label htmlFor="cp-confirm" className="block text-xs font-medium text-foreground mb-1">Conferma nuova password</label>
            <input
              id="cp-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Ripeti la nuova password"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !currentPassword || !newPassword || !confirmPassword}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Aggiorna password
          </button>
        </form>
      </div>
    </div>
  );
}

function RegisterAdminScreen() {
  const { registerAdmin } = useLocalAuth();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!name.trim()) {
      setError("Inserisci il tuo nome");
      return;
    }
    if (username.trim().length < 3) {
      setError("Il nome utente deve contenere almeno 3 caratteri");
      return;
    }
    if (password.length < 8) {
      setError("La password deve contenere almeno 8 caratteri");
      return;
    }
    if (password !== confirm) {
      setError("Le password non coincidono");
      return;
    }
    setSubmitting(true);
    try {
      // On success the auth context sets the session user and the app enters.
      await registerAdmin({ name: name.trim(), username: username.trim(), email: email.trim() || undefined, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile completare la registrazione");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-sm p-8 flex flex-col items-center text-center">
        <img src={logoUrl} alt="Angeli in Moto" className="w-16 h-16 rounded-xl object-contain mb-5" />
        <h1 className="text-xl font-bold text-foreground">Primo avvio</h1>
        <p className="text-sm text-muted-foreground mt-1.5 mb-6">
          Crea l'account amministratore per iniziare. Dopo l'accesso potrai configurare il resto del
          sistema e creare gli altri utenti.
        </p>

        <form onSubmit={onSubmit} className="w-full space-y-3 text-left">
          <div>
            <label htmlFor="rg-name" className="block text-xs font-medium text-foreground mb-1">Nome e cognome</label>
            <input
              id="rg-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Mario Rossi"
            />
          </div>
          <div>
            <label htmlFor="rg-username" className="block text-xs font-medium text-foreground mb-1">Nome utente</label>
            <input
              id="rg-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="admin"
            />
          </div>
          <div>
            <label htmlFor="rg-email" className="block text-xs font-medium text-foreground mb-1">
              Email <span className="text-muted-foreground font-normal">(facoltativa)</span>
            </label>
            <input
              id="rg-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="mario.rossi@esempio.it"
            />
          </div>
          <div>
            <label htmlFor="rg-password" className="block text-xs font-medium text-foreground mb-1">Password</label>
            <input
              id="rg-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Almeno 8 caratteri"
            />
          </div>
          <div>
            <label htmlFor="rg-confirm" className="block text-xs font-medium text-foreground mb-1">Conferma password</label>
            <input
              id="rg-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Ripeti la password"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !name || !username || !password || !confirm}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Crea amministratore e accedi
          </button>
        </form>
      </div>
    </div>
  );
}

function GatedApp() {
  const { user, loading, setupMode } = useLocalAuth();

  // Wait for the local-session probe before deciding which flow to show, so a
  // logged-in user never briefly sees the login screen.
  if (loading) return <FullscreenLoader />;

  // First run: no administrator exists yet. Show the registration screen (no
  // login required); the bootstrap endpoint enforces this server-side and logs
  // the new admin in once the account is created.
  if (setupMode && !user) return <RegisterAdminScreen />;

  if (user) {
    if (user.mustChangePassword) return <ChangePasswordScreen />;
    return <Router />;
  }

  return <LoginScreen />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LocalAuthProvider>
          <WouterRouter base={basePath}>
            <GatedApp />
          </WouterRouter>
        </LocalAuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
