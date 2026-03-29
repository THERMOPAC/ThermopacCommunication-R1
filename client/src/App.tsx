import { Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";
import Layout from "@/components/layout";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import ResetPasswordPage from "@/pages/reset-password-page";
import Dashboard from "@/pages/dashboard";
import { PageLoader } from "@/loaders/lazy-utils";

import { useAuth } from "@/hooks/use-auth";
import { PasswordManagement } from "@/components/password-management";
import { Loader2 } from "lucide-react";

import * as Admin from "@/loaders/admin";
import * as Finance from "@/loaders/finance";
import * as SalesMarketing from "@/loaders/sales-marketing";
import * as ProjectsProduction from "@/loaders/projects-production";
import * as Quality from "@/loaders/quality";
import * as Design from "@/loaders/design";
import * as SAP from "@/loaders/sap";
import * as Agents from "@/loaders/agents";
import * as Employee from "@/loaders/employee";
import * as System from "@/loaders/system";

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
  return <Admin.VisaManagementPageNew />;
}

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <ProtectedRoute path="/" component={() => <Redirect to="/dashboard" />} />
      <ProtectedRoute path="/dashboard" component={Dashboard} />
      <ProtectedRoute path="/tasks" component={Dashboard} />
      <ProtectedRoute path="/team" component={Dashboard} />
      <ProtectedRoute path="/recommendations" component={Dashboard} />
      <ProtectedRoute path="/messages" component={() => <System.MessagesPage />} />
      <ProtectedRoute path="/alerts" component={() => <System.AlertsPage />} />
      <ProtectedRoute path="/emails" component={() => <System.EmailsPage />} />
      <SuperuserRoute path="/tools" component={() => <System.DiagnosticsPage />} />
      <ProtectedRoute path="/profile" component={() => <Employee.ProfilePage />} />
      <ProtectedRoute path="/leaderboard" component={() => <Employee.LeaderboardPage />} />
      <ProtectedRoute path="/recurring-tasks" component={() => <Employee.RecurringTasksPage />} />
      <ProtectedRoute path="/loans-advances" component={() => <Employee.LoansAdvancesPage />} />

      {/* Sales and Marketing Routes */}
      <ProtectedRoute path="/radar" component={() => <SalesMarketing.RadarPage />} />
      <ProtectedRoute path="/lead-generation" component={() => <SalesMarketing.LeadGenerationPage />} />
      <ProtectedRoute path="/leads" component={() => <SalesMarketing.LeadsPage />} />
      <ProtectedRoute path="/products" component={() => <SalesMarketing.ProductsPage />} />
      <ProtectedRoute path="/offer-templates" component={() => <SalesMarketing.OfferTemplatesPage />} />
      <ProtectedRoute path="/offers" component={() => <SalesMarketing.OffersPage />} />
      <ProtectedRoute path="/campaigns" component={() => <SalesMarketing.CampaignsPage />} />
      <ProtectedRoute path="/marketing-dashboard" component={() => <SalesMarketing.MarketingDashboardPage />} />
      <ProtectedRoute path="/marketing-tools" component={() => <SalesMarketing.MarketingToolsPage />} />
      <ProtectedRoute path="/roi-calculator" component={() => <SalesMarketing.ROICalculatorPage />} />
      
      {/* Agent Dashboard */}
      <ProtectedRoute path="/agent-dashboard" component={() => <Agents.AgentDashboardPage />} />
      <ProtectedRoute path="/worker-agents" component={() => <Agents.WorkerAgentsPage />} />
      
      {/* Finance Module Routes */}
      <ProtectedRoute path="/finance" component={() => <Finance.FinanceDashboardPage />} />
      <ProtectedRoute path="/finance/dashboard" component={() => <Finance.FinanceDashboardPage />} />
      <ProtectedRoute path="/finance/invoices" component={() => <Finance.InvoicesPage />} />
      <ProtectedRoute path="/finance/invoices/new" component={() => <Finance.InvoiceCreatePage />} />
      <ProtectedRoute path="/finance/invoices/:id/edit" component={() => <Finance.InvoiceCreatePage isEditMode={true} />} />
      <ProtectedRoute path="/finance/invoices/:id/download" component={() => <Finance.InvoiceDetailPage download={true} />} />
      <ProtectedRoute path="/finance/invoices/:id/print" component={() => <Finance.InvoiceDetailPage print={true} />} />
      <ProtectedRoute path="/finance/invoices/view/:id" component={() => <Finance.InvoiceDetailPage />} />
      <ProtectedRoute path="/finance/invoices/:id" component={() => <Finance.InvoiceDetailPage />} />
      <ProtectedRoute path="/finance/payments" component={() => <Finance.PaymentsPage />} />
      <ProtectedRoute path="/finance/payments/new" component={() => <Finance.NewPaymentCreatePage />} />
      <ProtectedRoute path="/finance/new-payment-create" component={() => <Finance.NewPaymentCreatePage />} />
      <ProtectedRoute path="/finance/payments/:id/edit-old" component={() => <Finance.PaymentCreatePage isEditMode={true} />} />
      <ProtectedRoute path="/finance/payments/:id/edit-new" component={() => <Finance.EditPaymentPage />} />
      <ProtectedRoute path="/finance/payments/:id/edit" component={() => <Finance.EditPaymentPage />} />
      <ProtectedRoute path="/finance/reports/reconciliation" component={() => <Finance.ReconciliationReportPage />} />
      <ProtectedRoute path="/finance/payment-allocation" component={() => <Finance.PaymentAllocationPage />} />
      <ProtectedRoute path="/finance/basic-allocation" component={() => <Finance.PaymentAllocationPage />} />
      <ProtectedRoute path="/finance/new-basic-allocation" component={() => <Finance.PaymentAllocationPage />} />
      <ProtectedRoute path="/finance/batch-advance-allocation" component={() => <Finance.BatchAdvanceAllocationPage />} />
      <ProtectedRoute path="/finance/payments/:id" component={() => <Finance.PaymentDetailPage />} />
      <ProtectedRoute path="/finance/brc" component={() => <Finance.BrcPage />} />
      <ProtectedRoute path="/brc" component={() => <Redirect to="/finance/brc-management" />} />
      <ProtectedRoute path="/finance/brc-management" component={() => <Finance.BrcManagementPage />} />
      <ProtectedRoute path="/finance/reports/turnover" component={() => <Finance.TurnoverReportPage />} />
      <ProtectedRoute path="/finance/reports/outstanding" component={() => <Finance.OutstandingReportPage />} />
      <ProtectedRoute path="/finance/reports/remittances" component={() => <Finance.RemittancesReportPage />} />
      <ProtectedRoute path="/finance/reports/invoice-aging" component={() => <Finance.InvoiceAgingDashboard />} />
      <ProtectedRoute path="/finance/write-offs" component={() => <Finance.WriteOffManagementPage />} />
      <ProtectedRoute path="/finance/write-off-management" component={() => <Finance.WriteOffManagementPage />} />
      <ProtectedRoute path="/finance/tools" component={() => <Finance.FinanceToolsPage />} />
      <ProtectedRoute path="/finance/gl-mapping" component={() => <Finance.GlMappingPage />} />
      <ProtectedRoute path="/finance/statutory/tds" component={() => <Finance.TdsCompliancePage />} />
      <ProtectedRoute path="/finance/statutory/pf" component={() => <Finance.PfCompliancePage />} />
      <ProtectedRoute path="/finance/statutory/esic" component={() => <Finance.EsicCompliancePage />} />
      <ProtectedRoute path="/finance/statutory/pt" component={() => <Finance.PtCompliancePage />} />
      <ProtectedRoute path="/finance/company-income-tax" component={() => <Finance.CompanyIncomeTaxPage />} />
      
      {/* Administration Module Routes */}
      <ProtectedRoute path="/admin" component={() => <Admin.AdministrationPage />} />
      <ProtectedRoute path="/admin/administration" component={() => <Layout><Admin.AdministrationPage /></Layout>} />
      <ProtectedRoute path="/admin/users" component={() => <Layout><Admin.UserManagementPage /></Layout>} />
      <ProtectedRoute path="/admin/user-management" component={() => <Layout><Admin.UserManagementPage /></Layout>} />
      <ProtectedRoute path="/admin/attendance" component={() => <Layout><Admin.AttendanceManagementPage /></Layout>} />
      <ProtectedRoute path="/admin/attendance-management" component={() => <Layout><Admin.AttendanceManagementPage /></Layout>} />
      <ProtectedRoute path="/admin/leave" component={() => <Layout><Admin.LeaveManagementPage /></Layout>} />
      <ProtectedRoute path="/admin/leave-management" component={() => <Layout><Admin.LeaveManagementPage /></Layout>} />
      <ProtectedRoute path="/admin/payroll" component={() => <Layout><Admin.PayrollManagementPage /></Layout>} />
      <ProtectedRoute path="/admin/payroll-management" component={() => <Layout><Admin.PayrollManagementPage /></Layout>} />
      <ProtectedRoute path="/admin/workweek-policies" component={() => <Layout><Admin.WorkweekPolicyManagementPage /></Layout>} />
      <ProtectedRoute path="/admin/workweek-policy-management" component={() => <Layout><Admin.WorkweekPolicyManagementPage /></Layout>} />
      <ProtectedRoute path="/admin/business-trips" component={() => <Layout><Admin.BusinessTripManagementPage /></Layout>} />
      <ProtectedRoute path="/admin/business-trip-management" component={() => <Layout><Admin.BusinessTripManagementPage /></Layout>} />
      <ProtectedRoute path="/admin/visa-management" component={() => <Layout><VisaManagementWrapper /></Layout>} />
      <ProtectedRoute path="/admin/legal-management" component={() => <Layout><Admin.LegalManagementPage /></Layout>} />
      <ProtectedRoute path="/admin/meetings-management" component={() => <Layout><Admin.MeetingsManagementPage /></Layout>} />
      <ProtectedRoute path="/admin/password-compliance" component={() => <Layout><Admin.PasswordCompliancePage /></Layout>} />
      <ProtectedRoute path="/google-calendar-settings" component={() => <Employee.GoogleCalendarSettingsPage />} />
      
      {/* Projects & Production Routes */}
      <ProtectedRoute path="/project-dashboard" component={() => <ProjectsProduction.ProjectDashboardPage />} />
      <ProtectedRoute path="/execution-control" component={() => <ProjectsProduction.ExecutionControlDashboard />} />
      <ProtectedRoute path="/projects" component={() => <ProjectsProduction.ProjectsPage />} />
      <ProtectedRoute path="/projects/:id" component={() => <ProjectsProduction.ProjectDetailPage />} />
      <ProtectedRoute path="/customers" component={() => <ProjectsProduction.CustomersPage />} />
      <ProtectedRoute path="/item-master" component={() => <ProjectsProduction.ItemMasterPage />} />
      <ProtectedRoute path="/design-tools" component={() => <Design.DesignToolsPage />} />
      
      {/* Design Management Module Routes */}
      <ProtectedRoute path="/design-management" component={() => <Layout><Design.DesignDashboardPage /></Layout>} />
      <ProtectedRoute path="/design-management/design-projects" component={() => <Layout><Design.DesignProjectsPage /></Layout>} />
      <ProtectedRoute path="/design-management/projects" component={() => <Layout><Design.DesignProjectsPage /></Layout>} />
      <ProtectedRoute path="/design-management/design-drawings" component={() => <Layout><Design.DrawingRegistryPage /></Layout>} />
      <ProtectedRoute path="/design-management/drawings" component={() => <Layout><Design.DrawingRegistryPage /></Layout>} />
      <ProtectedRoute path="/design-management/drawing-registry" component={() => <Layout><Design.DrawingRegistryPage /></Layout>} />
      <ProtectedRoute path="/design-management/design-reviews" component={() => <Layout><Design.ReviewApprovalPage /></Layout>} />
      <ProtectedRoute path="/design-management/reviews" component={() => <Layout><Design.ReviewApprovalPage /></Layout>} />
      <ProtectedRoute path="/design-management/design-transmittals" component={() => <Layout><Design.TransmittalsPage /></Layout>} />
      <ProtectedRoute path="/design-management/transmittals" component={() => <Layout><Design.TransmittalsPage /></Layout>} />
      <ProtectedRoute path="/design-management/design-standards" component={() => <Layout><Design.StandardsTemplatesPage /></Layout>} />
      <ProtectedRoute path="/design-management/standards" component={() => <Layout><Design.StandardsTemplatesPage /></Layout>} />
      <ProtectedRoute path="/design-management/design-reports" component={() => <Layout><Design.ReportsAnalyticsPage /></Layout>} />
      <ProtectedRoute path="/design-management/reports" component={() => <Layout><Design.ReportsAnalyticsPage /></Layout>} />
      <ProtectedRoute path="/procurement-planning" component={() => <ProjectsProduction.ProcurementPlanningPage />} />
      <ProtectedRoute path="/procurement-tracking" component={() => <ProjectsProduction.ProcurementTrackingPage />} />
      <ProtectedRoute path="/production-planning" component={() => <ProjectsProduction.ProductionPlanningPage />} />
      <ProtectedRoute path="/production/work-orders/details/:id" component={() => <ProjectsProduction.WorkOrderDetailPage />} />
      <ProtectedRoute path="/production/work-orders/edit/:id" component={() => <ProjectsProduction.WorkOrderEditPage />} />
      <ProtectedRoute path="/production/work-orders/:id" component={() => <ProjectsProduction.WorkOrderDetailPage />} />
      <ProtectedRoute path="/shop-floor" component={() => <ProjectsProduction.ShopFloorPage />} />
      <ProtectedRoute path="/daily-production-report" component={() => <ProjectsProduction.DailyProductionReportPage />} />
      <ProtectedRoute path="/production-team-management" component={() => <ProjectsProduction.ProductionTeamManagement />} />
      
      {/* Quality Routes */}
      <ProtectedRoute path="/wps-pqr" component={() => <Quality.WpsPqrPage />} />
      <ProtectedRoute path="/wpqr" component={() => <Quality.WpqrPage />} />
      <ProtectedRoute path="/quality/pma" component={() => <Quality.PMAPage />} />
      <ProtectedRoute path="/quality/test-procedures" component={() => <Quality.TestProceduresPage />} />
      <ProtectedRoute path="/welder-management" component={() => <Quality.WelderManagementPage />} />
      <ProtectedRoute path="/quality/welder-certificates/:welderId" component={() => <Quality.WelderCertificatesPage />} />
      <ProtectedRoute path="/welder-test" component={() => <Quality.WelderTestPage />} />
      <ProtectedRoute path="/calibration-management" component={() => <Quality.CalibrationManagementPage />} />
      <ProtectedRoute path="/quality/material-identification/new" component={() => <Quality.MaterialIdentificationCreatePage />} />
      <ProtectedRoute path="/quality/material-identification" component={() => <Quality.MaterialIdentificationListNewPage />} />
      <ProtectedRoute 
        path="/quality/material-identification/view/:id" 
        component={() => <Quality.MaterialIdentificationViewNewPage params={{ id: window.location.pathname.split('/').pop() || '' }} />} 
      />
      <ProtectedRoute 
        path="/quality/material-identification/edit/:id" 
        component={() => <Quality.MaterialIdentificationEditNewPage params={{ id: window.location.pathname.split('/').pop() || '' }} />} 
      />
      <ProtectedRoute 
        path="/quality/material-identification/direct-update/:id" 
        component={() => <Quality.MaterialIdentificationDirectUpdate />} 
      />
      <Route path="/quality/material-identification/:id">
        {(params) => <Redirect to={`/quality/material-identification/view/${params.id}`} />}
      </Route>
      <Route path="/material-identification/new">
        <Redirect to="/quality/material-identification/new" />
      </Route>
      <Route path="/material-identification">
        <Redirect to="/quality/material-identification" />
      </Route>
      <Route path="/material-identification/:id">
        {(params) => <Redirect to={`/quality/material-identification/view/${params.id}`} />}
      </Route>
      <ProtectedRoute path="/inspections" component={() => <Quality.InspectionsPage />} />
      <ProtectedRoute path="/quality/inspections" component={() => <Quality.InspectionsPage />} />
      <ProtectedRoute path="/quality-assurance-plan" component={() => <Quality.QualityAssurancePlanPage />} />
      <ProtectedRoute path="/quality-assurance-plan/form/:id?" component={() => <Quality.CreateQAPPage />} />
      <ProtectedRoute path="/quality-assurance-plan/view/:id" component={() => <Quality.ViewEditQAPPage />} />
      <ProtectedRoute path="/project-commissioning" component={() => <ProjectsProduction.ProjectCommissioningPage />} />
      <ProtectedRoute path="/dispatch-shipping" component={() => <ProjectsProduction.DispatchShippingPage />} />
      <ProtectedRoute path="/after-sales" component={() => <ProjectsProduction.AfterSalesPage />} />
      <ProtectedRoute path="/template-management" component={() => <System.TemplateManagementPage />} />
      <SuperuserRoute path="/users" component={Dashboard} />
      <SuperuserRoute path="/work-locations" component={() => <Layout><Admin.WorkLocationsPage /></Layout>} />
      <ProtectedRoute path="/attendance" component={() => <Layout><Employee.AttendancePage /></Layout>} />
      <ProtectedRoute path="/attendance/regularization" component={() => <Layout><Employee.AttendanceRegularizationPage /></Layout>} />
      <ProtectedRoute path="/dwar" component={() => <Layout><Employee.DwarPage /></Layout>} />
      <ProtectedRoute path="/leave-request" component={() => <Layout><Employee.LeaveRequestPage /></Layout>} />
      <ProtectedRoute path="/appraisals" component={() => <Layout><Employee.EmployeeAppraisalsPage /></Layout>} />

      <SuperuserRoute path="/password-management" component={PasswordManagementPage} />
      <SuperuserRoute path="/module-permissions" component={() => <System.ModulePermissionsPage />} />
      <SuperuserRoute path="/business-intelligence" component={() => <Layout><Agents.BusinessIntelligencePage /></Layout>} />
      <SuperuserRoute path="/llm-prompt-engine" component={() => <Layout><Agents.LLMPromptEnginePage /></Layout>} />
      <SuperuserRoute path="/active-alerts" component={() => <System.ActiveAlertsPage />} />
      <ProtectedRoute path="/google-calendar-settings" component={() => <Layout><Employee.GoogleCalendarSettingsPage /></Layout>} />
      
      {/* SAP B1 Integration Routes */}
      <ProtectedRoute path="/sap-integration" component={() => <Layout><SAP.SapIntegrationPage /></Layout>} />
      <ProtectedRoute path="/purchase-module" component={() => <Layout><SAP.PurchaseModule /></Layout>} />
      <ProtectedRoute path="/sap-b1/purchase" component={() => <Layout><SAP.PurchaseModule /></Layout>} />
      <ProtectedRoute path="/admin/sap-purchase" component={() => <Layout><SAP.PurchaseModule /></Layout>} />
      
      {/* SAP Purchasing Module Routes */}
      <ProtectedRoute path="/sap-purchasing/dashboard" component={() => <Layout><SAP.SapPurchasingDashboard /></Layout>} />
      <ProtectedRoute path="/sap-purchasing/orders" component={() => <Layout><SAP.SapPurchaseOrders /></Layout>} />
      <ProtectedRoute path="/sap-purchasing/quotations" component={() => <Layout><SAP.SapPurchaseQuotations /></Layout>} />
      <ProtectedRoute path="/sap-purchasing/receipts" component={() => <Layout><SAP.SapGoodsReceipts /></Layout>} />
      <ProtectedRoute path="/sap-purchasing/invoices" component={() => <Layout><SAP.SapPurchaseInvoices /></Layout>} />
      
      <SuperuserRoute path="/gcs-diagnostic" component={() => <System.GcsDiagnosticPage />} />
      <SuperuserRoute path="/gcs-test" component={() => <System.GcsTestPage />} />
      <SuperuserRoute path="/special-fixes" component={() => <System.SpecialFixesPage />} />
      <SuperuserRoute path="/calibration-test" component={() => <Quality.CalibrationTestPage />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>
          <Router />
        </Suspense>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
