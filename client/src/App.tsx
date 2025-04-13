import { QueryClientProvider } from "@tanstack/react-query";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import ProfilePage from "@/pages/profile-page";
import LeaderboardPage from "@/pages/leaderboard-page";
import RecurringTasksPage from "@/pages/recurring-tasks-page";
import EmailsPage from "@/pages/emails-page";
import MessagesPage from "@/pages/messages-page";
import ProjectsPage from "@/pages/projects-page";
import ProjectDetailPage from "@/pages/project-detail-page";
import CustomersPage from "@/pages/customers-page";
import ItemMasterPage from "@/pages/item-master-page";
import ProductionPlanningPage from "@/pages/production-planning-page";
import ShopFloorPage from "@/pages/shop-floor-page";
import InspectionsPage from "@/pages/inspections-page";
import QualityReportsPage from "@/pages/quality-reports-page";
import { useAuth } from "@/hooks/use-auth";
import { PasswordManagement } from "@/components/password-management";
import { Loader2 } from "lucide-react";
import Layout from "@/components/layout";

// SuperuserRoute component to protect routes that only superusers should access
function SuperuserRoute({
  path,
  component: Component,
}: {
  path: string;
  component: () => React.JSX.Element;
}) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  
  return (
    <Route path={path}>
      {isLoading ? (
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      ) : !user ? (
        <Redirect to="/auth" />
      ) : user.role !== "Superuser" ? (
        <NotFound />
      ) : (
        <Component />
      )}
    </Route>
  );
}

function PasswordManagementPage() {
  return (
    <Layout>
      <PasswordManagement />
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <ProtectedRoute path="/" component={Dashboard} />
      <ProtectedRoute path="/tasks" component={Dashboard} />
      <ProtectedRoute path="/team" component={Dashboard} />
      <ProtectedRoute path="/recommendations" component={Dashboard} />
      <ProtectedRoute path="/messages" component={MessagesPage} />
      <ProtectedRoute path="/emails" component={EmailsPage} />
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <ProtectedRoute path="/leaderboard" component={LeaderboardPage} />
      <ProtectedRoute path="/recurring-tasks" component={RecurringTasksPage} />
      <ProtectedRoute path="/projects" component={ProjectsPage} />
      <ProtectedRoute path="/projects/:id" component={ProjectDetailPage} />
      <ProtectedRoute path="/customers" component={CustomersPage} />
      <ProtectedRoute path="/item-master" component={ItemMasterPage} />
      <ProtectedRoute path="/production-planning" component={ProductionPlanningPage} />
      <ProtectedRoute path="/shop-floor" component={ShopFloorPage} />
      <ProtectedRoute path="/inspections" component={InspectionsPage} />
      <ProtectedRoute path="/quality-reports" component={QualityReportsPage} />
      <SuperuserRoute path="/users" component={Dashboard} />
      <SuperuserRoute path="/password-management" component={PasswordManagementPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;