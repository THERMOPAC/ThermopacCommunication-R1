import { QueryClientProvider } from "@tanstack/react-query";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";

// Critical components loaded immediately
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";

// Only lazy load the two most problematic components
const DesignToolsPage = lazy(() => import("@/pages/design-tools-page"));
const MarketingToolsPage = lazy(() => import("@/pages/marketing-tools-page"));

// Import all other pages normally to avoid Suspense issues
import ProfilePage from "@/pages/profile-page";
import LeaderboardPage from "@/pages/leaderboard-page";
import RecurringTasksPage from "@/pages/recurring-tasks-page";
import EmailsPage from "@/pages/emails-page";
import MessagesPage from "@/pages/messages-page";
import ProjectsPage from "@/pages/projects-page";
import ProjectDetailPage from "@/pages/project-detail-page";
import ProjectDashboardPage from "@/pages/project-dashboard-page";
import CustomersPage from "@/pages/customers-page";
import ItemMasterPage from "@/pages/item-master-page";
import ProductionPlanningPage from "@/pages/production-planning-page";
import WorkOrderDetailPage from "@/pages/work-order-detail-page";
import WorkOrderEditPage from "@/pages/work-order-edit-page";
import ShopFloorPage from "@/pages/shop-floor-page";
import DailyProductionReportPage from "@/pages/daily-production-report-page";
import InspectionsPage from "@/pages/inspections-page";
import MaterialIdentificationPage from "@/pages/material-identification-page";
import MaterialIdentificationListPage from "@/pages/material-identification-list-page";
import MaterialIdentificationViewPage from "@/pages/material-identification-view-page";
import MaterialIdentificationEditPage from "@/pages/material-identification-edit-page";
import SpecialFixesPage from "@/pages/special-fixes-page";
import LeadsPage from "@/pages/leads-page";
import CampaignsPage from "@/pages/campaigns-page";
import MarketingDashboardPage from "@/pages/marketing-dashboard-page";
import ROICalculatorPage from "@/pages/roi-calculator-page";
import FinanceDashboardPage from "@/pages/finance/finance-dashboard-page";
import InvoicesPage from "@/pages/finance/invoices-page";
import InvoiceCreatePage from "@/pages/finance/invoice-create-page";
import InvoiceDetailPage from "@/pages/finance/invoice-detail-page";
import PaymentsPage from "@/pages/finance/payments-page";
import PaymentDetailPage from "@/pages/finance/payment-detail-enhanced";
import PaymentCreatePage from "@/pages/finance/payment-create-page";
import NewPaymentCreatePage from "@/pages/finance/new-payment-create";
import EditPaymentPage from "@/pages/finance/edit-payment-page";
import BrcPage from "@/pages/finance/brc-page";
import BrcManagementPage from "@/pages/finance/brc-management-page";
import AdministrationPage from "@/pages/admin/administration-page";
import UserManagementPage from "@/pages/admin/user-management-page";
import AttendanceManagementPage from "@/pages/admin/attendance-management-page";
import PayrollManagementPage from "@/pages/admin/payroll-management-new";
import TurnoverReportPage from "@/pages/finance/reports/turnover-page";
import OutstandingReportPage from "@/pages/finance/reports/outstanding-page";
import RemittancesReportPage from "@/pages/finance/reports/remittances-page";
import ReconciliationReportPage from "@/pages/finance/reports/reconciliation-page";
import PaymentAllocationPage from "@/pages/finance/payment-allocation-redesigned";
import BatchAdvanceAllocationPage from "@/pages/finance/batch-advance-allocation-page-fixed";
import InvoiceAgingDashboard from "@/pages/finance/reports/invoice-aging-dashboard";
import WriteOffManagementPage from "@/pages/finance/write-off-management";
import MaterialIdentificationCreatePage from "@/pages/material-identification-create-page";
import MaterialIdentificationListNewPage from "@/pages/material-identification-list-new-page";
import MaterialIdentificationViewNewPage from "@/pages/material-identification-view-new-page";
import MaterialIdentificationEditNewPage from "@/pages/material-identification-edit-new-page";
import WelderManagementPage from "@/pages/welder-management-page";
import WpqrPage from "@/pages/wpqr-page";
import WpsPqrPage from "@/pages/wps-pqr-page";
import AttendancePage from "@/pages/attendance-page";
import DiagnosticsPage from "@/pages/diagnostics-page";
import { useAuth } from "@/hooks/use-auth";
import { PasswordManagement } from "@/components/password-management";
import Layout from "@/components/layout";

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

// Safe lazy wrapper for specific components
function LazyComponent({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      {children}
    </Suspense>
  );
}

function SuperuserRoute({
  path,
  component: Component,
}: {
  path: string;
  component: React.ComponentType;
}) {
  const { user } = useAuth();
  
  return (
    <Route path={path}>
      {user?.role === "Superuser" ? <Component /> : <Redirect to="/dashboard" />}
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
  const [location] = useLocation();
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!user && location !== "/auth") {
    return <Redirect to="/auth" />;
  }

  if (user && location === "/auth") {
    return <Redirect to="/dashboard" />;
  }

  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/" component={() => <Redirect to="/dashboard" />} />
      
      {/* Core Routes */}
      <ProtectedRoute path="/dashboard" component={Dashboard} />
      <ProtectedRoute path="/tasks" component={Dashboard} />
      <ProtectedRoute path="/team" component={Dashboard} />
      <ProtectedRoute path="/recommendations" component={Dashboard} />
      <ProtectedRoute path="/messages" component={MessagesPage} />
      <ProtectedRoute path="/emails" component={EmailsPage} />
      <SuperuserRoute path="/tools" component={DiagnosticsPage} />
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <ProtectedRoute path="/leaderboard" component={LeaderboardPage} />
      <ProtectedRoute path="/recurring-tasks" component={RecurringTasksPage} />

      {/* Sales and Marketing Routes */}
      <ProtectedRoute path="/leads" component={LeadsPage} />
      <ProtectedRoute path="/campaigns" component={CampaignsPage} />
      <ProtectedRoute path="/marketing-dashboard" component={MarketingDashboardPage} />
      <ProtectedRoute path="/marketing-tools" component={() => (
        <LazyComponent>
          <MarketingToolsPage />
        </LazyComponent>
      )} />
      <ProtectedRoute path="/roi-calculator" component={ROICalculatorPage} />
      
      {/* Finance Module Routes */}
      <ProtectedRoute path="/finance" component={FinanceDashboardPage} />
      <ProtectedRoute path="/finance/dashboard" component={FinanceDashboardPage} />
      <ProtectedRoute path="/finance/invoices" component={InvoicesPage} />
      <ProtectedRoute path="/finance/invoices/create" component={InvoiceCreatePage} />
      <ProtectedRoute path="/finance/invoices/:id" component={InvoiceDetailPage} />
      <ProtectedRoute path="/finance/payments" component={PaymentsPage} />
      <ProtectedRoute path="/finance/payments/create" component={PaymentCreatePage} />
      <ProtectedRoute path="/finance/payments/new" component={NewPaymentCreatePage} />
      <ProtectedRoute path="/finance/payments/:id" component={PaymentDetailPage} />
      <ProtectedRoute path="/finance/payments/:id/edit" component={EditPaymentPage} />
      <ProtectedRoute path="/finance/brc" component={BrcPage} />
      <ProtectedRoute path="/finance/brc-management" component={BrcManagementPage} />
      <ProtectedRoute path="/finance/turnover" component={TurnoverReportPage} />
      <ProtectedRoute path="/finance/outstanding" component={OutstandingReportPage} />
      <ProtectedRoute path="/finance/remittances" component={RemittancesReportPage} />
      <ProtectedRoute path="/finance/reconciliation" component={ReconciliationReportPage} />
      <ProtectedRoute path="/finance/payment-allocation" component={PaymentAllocationPage} />
      <ProtectedRoute path="/finance/batch-advance-allocation" component={BatchAdvanceAllocationPage} />
      <ProtectedRoute path="/finance/aging-dashboard" component={InvoiceAgingDashboard} />
      <ProtectedRoute path="/finance/write-offs" component={WriteOffManagementPage} />
      
      {/* Administration Routes */}
      <ProtectedRoute path="/admin" component={AdministrationPage} />
      <ProtectedRoute path="/admin/users" component={UserManagementPage} />
      <ProtectedRoute path="/admin/attendance-management" component={AttendanceManagementPage} />
      <ProtectedRoute path="/admin/payroll-management" component={PayrollManagementPage} />
      
      {/* Project Management Routes */}
      <ProtectedRoute path="/projects" component={ProjectsPage} />
      <ProtectedRoute path="/projects/:id" component={ProjectDetailPage} />
      <ProtectedRoute path="/projects/:id/dashboard" component={ProjectDashboardPage} />
      <ProtectedRoute path="/customers" component={CustomersPage} />
      <ProtectedRoute path="/items" component={ItemMasterPage} />
      
      {/* Production Management Routes */}
      <ProtectedRoute path="/production/planning" component={ProductionPlanningPage} />
      <ProtectedRoute path="/production/work-orders/:id" component={WorkOrderDetailPage} />
      <ProtectedRoute path="/production/work-orders/:id/edit" component={WorkOrderEditPage} />
      <ProtectedRoute path="/production/shop-floor" component={ShopFloorPage} />
      <ProtectedRoute path="/production/reports" component={DailyProductionReportPage} />
      
      {/* Quality Management Routes */}
      <ProtectedRoute path="/inspections" component={InspectionsPage} />
      <ProtectedRoute path="/material-identification" component={MaterialIdentificationPage} />
      <ProtectedRoute path="/material-identification/list" component={MaterialIdentificationListPage} />
      <ProtectedRoute path="/material-identification/:id" component={MaterialIdentificationViewPage} />
      <ProtectedRoute path="/material-identification/:id/edit" component={MaterialIdentificationEditPage} />
      <ProtectedRoute path="/material-identification/create" component={MaterialIdentificationCreatePage} />
      <ProtectedRoute path="/material-identification-new" component={MaterialIdentificationListNewPage} />
      <ProtectedRoute path="/material-identification-new/:id" component={MaterialIdentificationViewNewPage} />
      <ProtectedRoute path="/material-identification-new/:id/edit" component={MaterialIdentificationEditNewPage} />
      
      {/* Welder Management Routes */}
      <ProtectedRoute path="/welders" component={WelderManagementPage} />
      
      {/* WPQR Management Routes */}
      <ProtectedRoute path="/wpqr" component={WpqrPage} />
      
      {/* WPS & PQR Management Routes */}
      <ProtectedRoute path="/wps-pqr" component={WpsPqrPage} />
      
      {/* Design Tools Routes - Lazy loaded due to large file size */}
      <ProtectedRoute path="/design-tools" component={() => (
        <LazyComponent>
          <DesignToolsPage />
        </LazyComponent>
      )} />
      
      {/* Special Routes */}
      <ProtectedRoute path="/attendance" component={AttendancePage} />
      <ProtectedRoute path="/special-fixes" component={SpecialFixesPage} />
      <ProtectedRoute path="/password-management" component={PasswordManagementPage} />
      
      {/* Catch all route */}
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