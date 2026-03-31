import { usePagePermissions } from "@/hooks/use-page-permissions";
import { useAuth } from "@/hooks/use-auth";
import { Redirect, Route } from "wouter";
import { Loader2, ShieldAlert } from "lucide-react";

interface PageProtectedRouteProps {
  path: string;
  pageKey: string;
  component: () => React.JSX.Element;
}

export function PageProtectedRoute({ path, pageKey, component: Component }: PageProtectedRouteProps) {
  const { user } = useAuth();
  const { hasPageAccess, isLoading } = usePagePermissions();

  return (
    <Route path={path}>
      {() => {
        if (!user) return <Redirect to="/auth" />;

        if (isLoading) {
          return (
            <div className="flex items-center justify-center min-h-screen">
              <Loader2 className="h-8 w-8 animate-spin text-border" />
            </div>
          );
        }

        if (!hasPageAccess(pageKey)) {
          return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
              <ShieldAlert className="h-16 w-16 text-muted-foreground" />
              <h2 className="text-xl font-semibold">Access Restricted</h2>
              <p className="text-muted-foreground text-center max-w-md">
                You don't have permission to access this page. Contact your administrator if you believe this is an error.
              </p>
            </div>
          );
        }

        return <Component />;
      }}
    </Route>
  );
}
