import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import ProtocolsPage from "@/pages/protocols/index";
import DocumentsPage from "@/pages/documents/index";
import DossiersPage from "@/pages/dossiers/index";
import TasksPage from "@/pages/tasks/index";
import WorkflowsPage from "@/pages/workflows/index";
import SignaturesPage from "@/pages/signatures/index";
import SearchPage from "@/pages/search/index";
import UsersPage from "@/pages/admin/users";
import ClassificationsPage from "@/pages/admin/classifications";
import SettingsPage from "@/pages/admin/settings";
import AuditLogPage from "@/pages/admin/audit-log";
import ImportPage from "@/pages/admin/import";
import IntegrityPage from "@/pages/admin/integrity";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/protocols" component={ProtocolsPage} />
        <Route path="/documents" component={DocumentsPage} />
        <Route path="/dossiers" component={DossiersPage} />
        <Route path="/tasks" component={TasksPage} />
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
