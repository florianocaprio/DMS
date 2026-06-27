import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ClerkProvider,
  ClerkLoading,
  ClerkLoaded,
  Show,
  AuthenticateWithRedirectCallback,
  useUser,
  useClerk,
} from "@clerk/react";
import { useSignIn } from "@clerk/react/legacy";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { Loader2, Lock } from "lucide-react";
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

// Only members of this Google Workspace domain may use the application.
const ALLOWED_DOMAIN = "angeliinmoto.it";

// REQUIRED — resolve the key from window.location.hostname so the same build
// serves multiple Clerk custom domains. Do not inline the env var.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — empty in dev (Clerk hits dev FAPI directly), auto-set in prod.
// Do NOT gate on import.meta.env.PROD / NODE_ENV.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Clerk passes full paths to routerPush/routerReplace, but wouter's
// setLocation prepends the base — strip it to avoid doubling.
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

function FullscreenLoader() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function LoginScreen() {
  const { signIn, isLoaded } = useSignIn();
  const [loc] = useLocation();
  const { login } = useLocalAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onGoogle = () => {
    if (!isLoaded || !signIn) return;
    // Preserve the originally requested route so the user lands back on it after
    // the OAuth round-trip (loc is base-relative; prepend basePath for Clerk).
    const returnTo = `${basePath}${loc}` || "/";
    void signIn.authenticateWithRedirect({
      strategy: "oauth_google",
      redirectUrl: `${basePath}/sso-callback`,
      redirectUrlComplete: returnTo,
    });
  };

  const onLocalSubmit = async (e: React.FormEvent) => {
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

        <button
          type="button"
          onClick={onGoogle}
          disabled={!isLoaded}
          className="w-full inline-flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-sm font-medium text-foreground disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <GoogleIcon />
          Continua con Google
        </button>

        <div className="flex items-center gap-3 w-full my-5">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">oppure</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={onLocalSubmit} className="w-full space-y-3 text-left">
          <div>
            <label htmlFor="username" className="block text-xs font-medium text-foreground mb-1">Nome utente</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="admin"
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

        <p className="text-xs text-muted-foreground mt-5">
          L'accesso con Google è riservato agli account <span className="font-medium text-foreground">@{ALLOWED_DOMAIN}</span>
        </p>
      </div>
    </div>
  );
}

function AccessDenied({ email }: { email: string }) {
  const { signOut } = useClerk();
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-sm p-8 flex flex-col items-center text-center">
        <img src={logoUrl} alt="Angeli in Moto" className="w-14 h-14 rounded-xl object-contain mb-5" />
        <h1 className="text-lg font-bold text-foreground">Accesso non autorizzato</h1>
        <p className="text-sm text-muted-foreground mt-2 mb-1">
          L'account <span className="font-medium text-foreground">{email}</span> non appartiene al dominio
          consentito.
        </p>
        <p className="text-sm text-muted-foreground mb-7">
          L'accesso è riservato agli account <span className="font-medium text-foreground">@{ALLOWED_DOMAIN}</span>.
        </p>
        <button
          type="button"
          onClick={() => signOut({ redirectUrl: basePath || "/" })}
          className="w-full px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          Esci e cambia account
        </button>
      </div>
    </div>
  );
}

function DomainGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  if (!isLoaded) return <FullscreenLoader />;
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  if (!email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) {
    return <AccessDenied email={email || "sconosciuto"} />;
  }
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
        <Route path="/admin/users" component={UsersPage} />
        <Route path="/admin/classifications" component={ClassificationsPage} />
        <Route path="/admin/settings" component={SettingsPage} />
        <Route path="/admin/audit-log" component={AuditLogPage} />
        <Route path="/admin/import" component={ImportPage} />
        <Route path="/admin/integrity" component={IntegrityPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function GatedApp() {
  const { user: localUser, loading: localLoading } = useLocalAuth();

  // Wait for the local-session probe before deciding which flow to show, so a
  // logged-in local admin never briefly sees the Clerk login screen.
  if (localLoading) return <FullscreenLoader />;

  // A valid local session bypasses Clerk entirely (no domain guard — local
  // accounts are provisioned explicitly).
  if (localUser) return <Router />;

  return (
    <>
      <ClerkLoading>
        <FullscreenLoader />
      </ClerkLoading>
      <ClerkLoaded>
        <Show when="signed-out">
          <LoginScreen />
        </Show>
        <Show when="signed-in">
          <DomainGuard>
            <Router />
          </DomainGuard>
        </Show>
      </ClerkLoaded>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <Switch>
        <Route path="/sso-callback">
          <FullscreenLoader />
          {/* Fallback URLs only — the per-attempt redirectUrlComplete set in
              LoginScreen takes precedence, returning the user to their
              originally requested deep link. */}
          <AuthenticateWithRedirectCallback
            signInFallbackRedirectUrl={basePath || "/"}
            signUpFallbackRedirectUrl={basePath || "/"}
          />
        </Route>
        <Route>
          <GatedApp />
        </Route>
      </Switch>
    </ClerkProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LocalAuthProvider>
          <WouterRouter base={basePath}>
            <ClerkProviderWithRoutes />
          </WouterRouter>
        </LocalAuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
