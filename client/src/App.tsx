import { QueryClientProvider } from "@tanstack/react-query";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";
import NotFound from "@/pages/not-found";
import { AuthPage } from "@/pages/auth-page";  // Changed to named import
import Dashboard from "@/pages/dashboard";
import ProfilePage from "@/pages/profile-page";
import { useAuth } from "@/hooks/use-auth";
import { PasswordManagement } from "@/components/password-management";

// SuperuserRoute component to protect routes that only superusers should access
function SuperuserRoute({
  path,
  component: Component,
}: {
  path: string;
  component: () => React.JSX.Element;
}) {
  const { user } = useAuth();

  if (user?.role !== "Superuser") {
    return <NotFound />;
  }

  return <ProtectedRoute path={path} component={Component} />;
}

function PasswordManagementPage() {
  return (
    <div className="container mx-auto py-8">
      <PasswordManagement />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <ProtectedRoute path="/" component={Dashboard} />
      <ProtectedRoute path="/tasks" component={Dashboard} />
      <ProtectedRoute path="/team" component={Dashboard} />
      <ProtectedRoute path="/messages" component={Dashboard} />
      <ProtectedRoute path="/profile" component={ProfilePage} />
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