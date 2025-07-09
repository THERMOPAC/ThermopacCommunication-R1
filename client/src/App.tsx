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

// Sales and Marketing pages
import LeadsPage from "@/pages/leads-page";
import CampaignsPage from "@/pages/campaigns-page";
import MarketingDashboardPage from "@/pages/marketing-dashboard-page";
import MarketingToolsPage from "@/pages/marketing-tools-page";
import ROICalculatorPage from "@/pages/roi-calculator-page";

// Finance module pages
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

// Administration module pages
import AdministrationPage from "@/pages/admin/administration-page";
import UserManagementPage from "@/pages/admin/user-management-page";
import AttendanceManagementPage from "@/pages/admin/attendance-management-page";
import LeaveManagementPage from "@/pages/admin/leave-management-page";
import PayrollManagementPage from "@/pages/admin/payroll-management-new";
import WorkweekPolicyManagementPage from "@/pages/admin/workweek-policy-management-page";
import BusinessTripManagementPage from "@/pages/admin/business-trip-management";
import VisaManagementPage from "@/pages/admin/visa-management";
import TurnoverReportPage from "@/pages/finance/reports/turnover-page";
import OutstandingReportPage from "@/pages/finance/reports/outstanding-page";
import RemittancesReportPage from "@/pages/finance/reports/remittances-page";
import ReconciliationReportPage from "@/pages/finance/reports/reconciliation-page";
import PaymentAllocationPage from "@/pages/finance/payment-allocation-redesigned";
import BatchAdvanceAllocationPage from "@/pages/finance/batch-advance-allocation-page-fixed";
import InvoiceAgingDashboard from "@/pages/finance/reports/invoice-aging-dashboard";
import WriteOffManagementPage from "@/pages/finance/write-off-management";
import FinanceToolsPage from "@/pages/finance-tools-page";

// New Material Identification pages
import MaterialIdentificationCreatePage from "@/pages/material-identification-create-page";
import MaterialIdentificationListNewPage from "@/pages/material-identification-list-new-page";
import MaterialIdentificationViewNewPage from "@/pages/material-identification-view-new-page";
import MaterialIdentificationEditNewPage from "@/pages/material-identification-edit-new-page";
import MaterialIdentificationDirectUpdate from "@/pages/material-identification-direct-update";
import WpsPqrPage from "@/pages/wps-pqr-page";
import WpqrPage from "@/pages/wpqr-page";
import WelderManagementPage from "@/pages/welder-management-page";
import WelderCertificatesPage from "@/pages/welder-certificates-page";
import WelderTestPage from "@/pages/welder-test-page";
import CalibrationManagementPage from "@/pages/calibration-management-page";
import CalibrationTestPage from "@/pages/calibration-test-page";
import QualityAssurancePlanPage from "@/pages/quality-assurance-plan-page";
import CreateQAPPage from "@/pages/create-qap-page";
import ViewEditQAPPage from "@/pages/view-edit-qap-page";
import ProjectCommissioningPage from "@/pages/project-commissioning-page";
import DispatchShippingPage from "@/pages/dispatch-shipping-page";
import AfterSalesPage from "@/pages/after-sales-page";
import ProcurementPlanningPage from "@/pages/procurement-planning-page";
import ProcurementTrackingPage from "@/pages/procurement-tracking-page";
import TemplateManagementPage from "@/pages/template-management-page";
import ModulePermissionsPage from "@/pages/module-permissions-page";
import DiagnosticsPage from "@/pages/diagnostics-page";
import GcsDiagnosticPage from "@/pages/gcs-diagnostic-page";
import GcsTestPage from "@/pages/gcs-test-page";
import DesignToolsPage from "@/pages/design-tools-page";
import WorkLocationsPage from "@/pages/work-locations-page";
import AttendancePage from "@/pages/attendance-page";
import DwarPage from "@/pages/dwar-page";
import PayrollPage from "@/pages/payroll-page";
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

function VisaManagementWrapper() {
  return (
    <Layout>
      <VisaManagementPage />
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
      <ProtectedRoute path="/marketing-tools" component={MarketingToolsPage} />
      <ProtectedRoute path="/roi-calculator" component={ROICalculatorPage} />
      
      {/* Finance Module Routes */}
      <ProtectedRoute path="/finance" component={FinanceDashboardPage} />
      <ProtectedRoute path="/finance/dashboard" component={FinanceDashboardPage} />
      <ProtectedRoute path="/finance/invoices" component={InvoicesPage} />
      <ProtectedRoute path="/finance/invoices/new" component={() => <InvoiceCreatePage />} />
      <ProtectedRoute path="/finance/invoices/:id/edit" component={() => <InvoiceCreatePage isEditMode={true} />} />
      <ProtectedRoute path="/finance/invoices/:id/download" component={() => <InvoiceDetailPage download={true} />} />
      <ProtectedRoute path="/finance/invoices/:id/print" component={() => <InvoiceDetailPage print={true} />} />
      <ProtectedRoute path="/finance/invoices/view/:id" component={() => <InvoiceDetailPage />} />
      <ProtectedRoute path="/finance/invoices/:id" component={() => <InvoiceDetailPage />} />
      <ProtectedRoute path="/finance/payments" component={PaymentsPage} />
      <ProtectedRoute path="/finance/payments/new" component={() => <NewPaymentCreatePage />} />
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
      <ProtectedRoute path="/admin/leave" component={LeaveManagementPage} />
      <ProtectedRoute path="/admin/leave-management" component={LeaveManagementPage} />
      <ProtectedRoute path="/admin/payroll" component={PayrollManagementPage} />
      <ProtectedRoute path="/admin/payroll-management" component={PayrollManagementPage} />
      <ProtectedRoute path="/admin/workweek-policies" component={WorkweekPolicyManagementPage} />
      <ProtectedRoute path="/admin/workweek-policy-management" component={WorkweekPolicyManagementPage} />
      <ProtectedRoute path="/admin/business-trips" component={BusinessTripManagementPage} />
      <ProtectedRoute path="/admin/business-trip-management" component={BusinessTripManagementPage} />
      <ProtectedRoute path="/admin/visa-management" component={VisaManagementWrapper} />
      
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