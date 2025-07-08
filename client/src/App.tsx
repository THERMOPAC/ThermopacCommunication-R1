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

// Lazy load heavy components
const DesignToolsPage = lazy(() => import("@/pages/design-tools-page"));
const MarketingToolsPage = lazy(() => import("@/pages/marketing-tools-page"));
const InspectionsPage = lazy(() => import("@/pages/inspections-page"));
const FinanceToolsPage = lazy(() => import("@/pages/finance-tools-page"));

// Lazy load other pages
const ProfilePage = lazy(() => import("@/pages/profile-page"));
const LeaderboardPage = lazy(() => import("@/pages/leaderboard-page"));
const RecurringTasksPage = lazy(() => import("@/pages/recurring-tasks-page"));
const EmailsPage = lazy(() => import("@/pages/emails-page"));
const MessagesPage = lazy(() => import("@/pages/messages-page"));
const ProjectsPage = lazy(() => import("@/pages/projects-page"));
const ProjectDetailPage = lazy(() => import("@/pages/project-detail-page"));
const ProjectDashboardPage = lazy(() => import("@/pages/project-dashboard-page"));
const CustomersPage = lazy(() => import("@/pages/customers-page"));
const ItemMasterPage = lazy(() => import("@/pages/item-master-page"));
const ProductionPlanningPage = lazy(() => import("@/pages/production-planning-page"));
const WorkOrderDetailPage = lazy(() => import("@/pages/work-order-detail-page"));
const WorkOrderEditPage = lazy(() => import("@/pages/work-order-edit-page"));
const ShopFloorPage = lazy(() => import("@/pages/shop-floor-page"));
const DailyProductionReportPage = lazy(() => import("@/pages/daily-production-report-page"));
const MaterialIdentificationPage = lazy(() => import("@/pages/material-identification-page"));
const MaterialIdentificationListPage = lazy(() => import("@/pages/material-identification-list-page"));
const MaterialIdentificationViewPage = lazy(() => import("@/pages/material-identification-view-page"));
const MaterialIdentificationEditPage = lazy(() => import("@/pages/material-identification-edit-page"));
const SpecialFixesPage = lazy(() => import("@/pages/special-fixes-page"));

// Sales and Marketing pages (lazy loaded)
const LeadsPage = lazy(() => import("@/pages/leads-page"));
const CampaignsPage = lazy(() => import("@/pages/campaigns-page"));
const MarketingDashboardPage = lazy(() => import("@/pages/marketing-dashboard-page"));
const ROICalculatorPage = lazy(() => import("@/pages/roi-calculator-page"));

// Finance module pages (lazy loaded)
const FinanceDashboardPage = lazy(() => import("@/pages/finance/finance-dashboard-page"));
const InvoicesPage = lazy(() => import("@/pages/finance/invoices-page"));
const InvoiceCreatePage = lazy(() => import("@/pages/finance/invoice-create-page"));
const InvoiceDetailPage = lazy(() => import("@/pages/finance/invoice-detail-page"));
const PaymentsPage = lazy(() => import("@/pages/finance/payments-page"));
const PaymentDetailPage = lazy(() => import("@/pages/finance/payment-detail-enhanced"));
const PaymentCreatePage = lazy(() => import("@/pages/finance/payment-create-page"));
const NewPaymentCreatePage = lazy(() => import("@/pages/finance/new-payment-create"));
const EditPaymentPage = lazy(() => import("@/pages/finance/edit-payment-page"));
const BrcPage = lazy(() => import("@/pages/finance/brc-page"));
const BrcManagementPage = lazy(() => import("@/pages/finance/brc-management-page"));

// Administration module pages (lazy loaded)
const AdministrationPage = lazy(() => import("@/pages/admin/administration-page"));
const UserManagementPage = lazy(() => import("@/pages/admin/user-management-page"));
const AttendanceManagementPage = lazy(() => import("@/pages/admin/attendance-management-page"));
const PayrollManagementPage = lazy(() => import("@/pages/admin/payroll-management-new"));
// Finance reports and tools (lazy loaded)  
const TurnoverReportPage = lazy(() => import("@/pages/finance/reports/turnover-page"));
const OutstandingReportPage = lazy(() => import("@/pages/finance/reports/outstanding-page"));
const RemittancesReportPage = lazy(() => import("@/pages/finance/reports/remittances-page"));
const ReconciliationReportPage = lazy(() => import("@/pages/finance/reports/reconciliation-page"));
const PaymentAllocationPage = lazy(() => import("@/pages/finance/payment-allocation-redesigned"));
const BatchAdvanceAllocationPage = lazy(() => import("@/pages/finance/batch-advance-allocation-page-fixed"));
const InvoiceAgingDashboard = lazy(() => import("@/pages/finance/reports/invoice-aging-dashboard"));
const WriteOffManagementPage = lazy(() => import("@/pages/finance/write-off-management"));

// Quality management and other pages (lazy loaded)
const MaterialIdentificationCreatePage = lazy(() => import("@/pages/material-identification-create-page"));
const MaterialIdentificationListNewPage = lazy(() => import("@/pages/material-identification-list-new-page"));
const MaterialIdentificationViewNewPage = lazy(() => import("@/pages/material-identification-view-new-page"));
const MaterialIdentificationEditNewPage = lazy(() => import("@/pages/material-identification-edit-new-page"));
const MaterialIdentificationDirectUpdate = lazy(() => import("@/pages/material-identification-direct-update"));
const WpsPqrPage = lazy(() => import("@/pages/wps-pqr-page"));
const WpqrPage = lazy(() => import("@/pages/wpqr-page"));
const WelderManagementPage = lazy(() => import("@/pages/welder-management-page"));
const WelderCertificatesPage = lazy(() => import("@/pages/welder-certificates-page"));
const WelderTestPage = lazy(() => import("@/pages/welder-test-page"));
const CalibrationManagementPage = lazy(() => import("@/pages/calibration-management-page"));
const CalibrationTestPage = lazy(() => import("@/pages/calibration-test-page"));
const QualityAssurancePlanPage = lazy(() => import("@/pages/quality-assurance-plan-page"));
const CreateQAPPage = lazy(() => import("@/pages/create-qap-page"));
const ViewEditQAPPage = lazy(() => import("@/pages/view-edit-qap-page"));
const ProjectCommissioningPage = lazy(() => import("@/pages/project-commissioning-page"));
const DispatchShippingPage = lazy(() => import("@/pages/dispatch-shipping-page"));
const AfterSalesPage = lazy(() => import("@/pages/after-sales-page"));
const ProcurementPlanningPage = lazy(() => import("@/pages/procurement-planning-page"));
const ProcurementTrackingPage = lazy(() => import("@/pages/procurement-tracking-page"));
const TemplateManagementPage = lazy(() => import("@/pages/template-management-page"));
const ModulePermissionsPage = lazy(() => import("@/pages/module-permissions-page"));
const DiagnosticsPage = lazy(() => import("@/pages/diagnostics-page"));
const GcsDiagnosticPage = lazy(() => import("@/pages/gcs-diagnostic-page"));
const GcsTestPage = lazy(() => import("@/pages/gcs-test-page"));
const WorkLocationsPage = lazy(() => import("@/pages/work-locations-page"));
const AttendancePage = lazy(() => import("@/pages/attendance-page"));
const DwarPage = lazy(() => import("@/pages/dwar-page"));
const PayrollPage = lazy(() => import("@/pages/payroll-page"));

// Keep essential imports
import { useAuth } from "@/hooks/use-auth";
import { PasswordManagement } from "@/components/password-management";
import Layout from "@/components/layout";

// Loading spinner component for lazy loaded components
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-border" />
    </div>
  );
}

// Wrapper for lazy components with suspense
function LazyWrapper({ component: Component }: { component: React.ComponentType }) {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Component />
    </Suspense>
  );
}

// SuperuserRoute component to protect routes that only superusers should access
function SuperuserRoute({
  path,
  component: Component,
}: {
  path: string;
  component: React.ComponentType;
}) {
  const { user, isLoading } = useAuth();
  
  return (
    <Route path={path}>
      {isLoading ? (
        <LoadingSpinner />
      ) : !user ? (
        <Redirect to="/auth" />
      ) : user.role !== "Superuser" ? (
        <NotFound />
      ) : (
        <LazyWrapper component={Component} />
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
      <ProtectedRoute path="/" component={() => <Redirect to="/dashboard" />} />
      <ProtectedRoute path="/dashboard" component={Dashboard} />
      <ProtectedRoute path="/tasks" component={Dashboard} />
      <ProtectedRoute path="/team" component={Dashboard} />
      <ProtectedRoute path="/recommendations" component={Dashboard} />
      <ProtectedRoute path="/messages" component={() => <LazyWrapper component={MessagesPage} />} />
      <ProtectedRoute path="/emails" component={() => <LazyWrapper component={EmailsPage} />} />
      <SuperuserRoute path="/tools" component={DiagnosticsPage} />
      <ProtectedRoute path="/profile" component={() => <LazyWrapper component={ProfilePage} />} />
      <ProtectedRoute path="/leaderboard" component={() => <LazyWrapper component={LeaderboardPage} />} />
      <ProtectedRoute path="/recurring-tasks" component={() => <LazyWrapper component={RecurringTasksPage} />} />

      {/* Sales and Marketing Routes */}
      <ProtectedRoute path="/leads" component={() => <LazyWrapper component={LeadsPage} />} />
      <ProtectedRoute path="/campaigns" component={() => <LazyWrapper component={CampaignsPage} />} />
      <ProtectedRoute path="/marketing-dashboard" component={() => <LazyWrapper component={MarketingDashboardPage} />} />
      <ProtectedRoute path="/marketing-tools" component={() => <LazyWrapper component={MarketingToolsPage} />} />
      <ProtectedRoute path="/roi-calculator" component={() => <LazyWrapper component={ROICalculatorPage} />} />
      
      {/* Finance Module Routes */}
      <ProtectedRoute path="/finance" component={() => <LazyWrapper component={FinanceDashboardPage} />} />
      <ProtectedRoute path="/finance/dashboard" component={() => <LazyWrapper component={FinanceDashboardPage} />} />
      <ProtectedRoute path="/finance/invoices" component={() => <LazyWrapper component={InvoicesPage} />} />
      <ProtectedRoute path="/finance/invoices/new" component={() => <LazyWrapper component={InvoiceCreatePage} />} />
      <ProtectedRoute path="/finance/invoices/:id/edit" component={() => <LazyWrapper component={() => <InvoiceCreatePage isEditMode={true} />} />} />
      <ProtectedRoute path="/finance/invoices/:id/download" component={() => <LazyWrapper component={() => <InvoiceDetailPage download={true} />} />} />
      <ProtectedRoute path="/finance/invoices/:id/print" component={() => <LazyWrapper component={() => <InvoiceDetailPage print={true} />} />} />
      <ProtectedRoute path="/finance/invoices/view/:id" component={() => <LazyWrapper component={InvoiceDetailPage} />} />
      <ProtectedRoute path="/finance/invoices/:id" component={() => <LazyWrapper component={InvoiceDetailPage} />} />
      <ProtectedRoute path="/finance/payments" component={() => <LazyWrapper component={PaymentsPage} />} />
      <ProtectedRoute path="/finance/payments/new" component={() => <LazyWrapper component={NewPaymentCreatePage} />} />
      <ProtectedRoute path="/finance/new-payment-create" component={() => <NewPaymentCreatePage />} />
      <ProtectedRoute path="/finance/payments/:id/edit-old" component={() => <PaymentCreatePage isEditMode={true} />} />
      <ProtectedRoute path="/finance/payments/:id/edit-new" component={() => <EditPaymentPage />} />
      <ProtectedRoute path="/finance/payments/:id/edit" component={() => <EditPaymentPage />} />
      <ProtectedRoute path="/finance/reports/reconciliation" component={ReconciliationReportPage} />
      <ProtectedRoute path="/finance/payment-allocation" component={PaymentAllocationPage} />
      <ProtectedRoute path="/finance/basic-allocation" component={PaymentAllocationPage} />
      <ProtectedRoute path="/finance/new-basic-allocation" component={PaymentAllocationPage} />
      <ProtectedRoute path="/finance/batch-advance-allocation" component={BatchAdvanceAllocationPage} />
      <ProtectedRoute path="/finance/payments/:id" component={() => <PaymentDetailPage />} />
      <ProtectedRoute path="/finance/brc" component={BrcPage} />
      <ProtectedRoute path="/brc" component={() => <Redirect to="/finance/brc-management" />} />
      <ProtectedRoute path="/finance/brc-management" component={BrcManagementPage} />
      <ProtectedRoute path="/finance/reports/turnover" component={TurnoverReportPage} />
      <ProtectedRoute path="/finance/reports/outstanding" component={OutstandingReportPage} />
      <ProtectedRoute path="/finance/reports/remittances" component={RemittancesReportPage} />
      <ProtectedRoute path="/finance/reports/invoice-aging" component={InvoiceAgingDashboard} />
      <ProtectedRoute path="/finance/write-offs" component={() => <WriteOffManagementPage />} />
      <ProtectedRoute path="/finance/write-off-management" component={() => <WriteOffManagementPage />} />
      <ProtectedRoute path="/finance/tools" component={FinanceToolsPage} />
      
      {/* Administration Module Routes */}
      <ProtectedRoute path="/admin" component={AdministrationPage} />
      <ProtectedRoute path="/admin/administration" component={AdministrationPage} />
      <ProtectedRoute path="/admin/users" component={UserManagementPage} />
      <ProtectedRoute path="/admin/user-management" component={UserManagementPage} />
      <ProtectedRoute path="/admin/attendance" component={AttendanceManagementPage} />
      <ProtectedRoute path="/admin/attendance-management" component={AttendanceManagementPage} />
      <ProtectedRoute path="/admin/payroll" component={PayrollManagementPage} />
      <ProtectedRoute path="/admin/payroll-management" component={PayrollManagementPage} />
      
      <ProtectedRoute path="/project-dashboard" component={ProjectDashboardPage} />
      <ProtectedRoute path="/projects" component={ProjectsPage} />
      <ProtectedRoute path="/projects/:id" component={ProjectDetailPage} />
      <ProtectedRoute path="/customers" component={CustomersPage} />
      <ProtectedRoute path="/item-master" component={ItemMasterPage} />
      <ProtectedRoute path="/design-tools" component={DesignToolsPage} />
      <ProtectedRoute path="/procurement-planning" component={ProcurementPlanningPage} />
      <ProtectedRoute path="/procurement-tracking" component={ProcurementTrackingPage} />
      <ProtectedRoute path="/production-planning" component={ProductionPlanningPage} />
      <ProtectedRoute path="/production/work-orders/details/:id" component={WorkOrderDetailPage} />
      <ProtectedRoute path="/production/work-orders/edit/:id" component={WorkOrderEditPage} />
      {/* Backward compatibility route */}
      <ProtectedRoute path="/production/work-orders/:id" component={WorkOrderDetailPage} />
      <ProtectedRoute path="/shop-floor" component={ShopFloorPage} />
      <ProtectedRoute path="/daily-production-report" component={DailyProductionReportPage} />
      <ProtectedRoute path="/wps-pqr" component={WpsPqrPage} />
      <ProtectedRoute path="/wpqr" component={WpqrPage} />
      <ProtectedRoute path="/welder-management" component={WelderManagementPage} />
      <ProtectedRoute path="/quality/welder-certificates/:welderId" component={WelderCertificatesPage} />
      <ProtectedRoute path="/welder-test" component={WelderTestPage} />
      <ProtectedRoute path="/calibration-management" component={CalibrationManagementPage} />
      {/* Material Identification routes with /quality prefix - NEW IMPLEMENTATION */}
      <ProtectedRoute path="/quality/material-identification/new" component={MaterialIdentificationCreatePage} />
      <ProtectedRoute path="/quality/material-identification" component={MaterialIdentificationListNewPage} />
      <ProtectedRoute 
        path="/quality/material-identification/view/:id" 
        component={() => <MaterialIdentificationViewNewPage params={{ id: window.location.pathname.split('/').pop() || '' }} />} 
      />
      <ProtectedRoute 
        path="/quality/material-identification/edit/:id" 
        component={() => <MaterialIdentificationEditNewPage params={{ id: window.location.pathname.split('/').pop() || '' }} />} 
      />
      
      {/* Test page for direct updates */}
      <ProtectedRoute 
        path="/quality/material-identification/direct-update/:id" 
        component={() => <MaterialIdentificationDirectUpdate />} 
      />
      
      {/* Legacy route for backward compatibility, redirects to view page */}
      <Route path="/quality/material-identification/:id">
        {(params) => <Redirect to={`/quality/material-identification/view/${params.id}`} />}
      </Route>
      
      {/* Redirects from old to new routes */}
      <Route path="/material-identification/new">
        <Redirect to="/quality/material-identification/new" />
      </Route>
      <Route path="/material-identification">
        <Redirect to="/quality/material-identification" />
      </Route>
      <Route path="/material-identification/:id">
        {(params) => <Redirect to={`/quality/material-identification/view/${params.id}`} />}
      </Route>
      <ProtectedRoute path="/inspections" component={InspectionsPage} />
      <ProtectedRoute path="/quality-assurance-plan" component={QualityAssurancePlanPage} />
      <ProtectedRoute path="/quality-assurance-plan/form/:id?" component={CreateQAPPage} />
      <ProtectedRoute path="/quality-assurance-plan/view/:id" component={ViewEditQAPPage} />
      <ProtectedRoute path="/project-commissioning" component={ProjectCommissioningPage} />
      <ProtectedRoute path="/dispatch-shipping" component={DispatchShippingPage} />
      <ProtectedRoute path="/after-sales" component={AfterSalesPage} />
      <ProtectedRoute path="/template-management" component={TemplateManagementPage} />
      <SuperuserRoute path="/users" component={Dashboard} />
      <SuperuserRoute path="/work-locations" component={() => <Layout><WorkLocationsPage /></Layout>} />
      <ProtectedRoute path="/attendance" component={() => <Layout><AttendancePage /></Layout>} />
      <ProtectedRoute path="/dwar" component={() => <Layout><DwarPage /></Layout>} />
      <ProtectedRoute path="/payroll" component={() => <Layout><PayrollPage /></Layout>} />
      <SuperuserRoute path="/password-management" component={PasswordManagementPage} />
      <SuperuserRoute path="/module-permissions" component={ModulePermissionsPage} />
      <SuperuserRoute path="/gcs-diagnostic" component={GcsDiagnosticPage} />
      <SuperuserRoute path="/gcs-test" component={GcsTestPage} />
      <SuperuserRoute path="/special-fixes" component={SpecialFixesPage} />
      <SuperuserRoute path="/calibration-test" component={CalibrationTestPage} />
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