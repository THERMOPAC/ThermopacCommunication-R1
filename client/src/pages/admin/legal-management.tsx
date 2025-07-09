import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  FileText, 
  Scale, 
  AlertTriangle, 
  Shield, 
  Users, 
  BookOpen, 
  Calendar, 
  Plus,
  Edit,
  Trash2,
  Download,
  Search,
  Filter,
  Bell,
  TrendingUp,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Eye,
  FileCheck
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";

interface DashboardData {
  contracts: Array<{ status: string; count: number; totalValue: number }>;
  cases: Array<{ status: string; count: number; totalValue: number }>;
  compliance: Array<{ status: string; count: number }>;
  poshCases: Array<{ status: string; count: number }>;
  upcomingAlerts: Array<{
    id: number;
    alertType: string;
    alertTitle: string;
    alertDate: string;
    priority: string;
    status: string;
  }>;
  expiringContracts: Array<{
    id: number;
    contractNumber: string;
    title: string;
    partyName: string;
    endDate: string;
    status: string;
  }>;
  upcomingHearings: Array<{
    id: number;
    caseNumber: string;
    caseTitle: string;
    nextHearingDate: string;
    priority: string;
    courtName: string;
  }>;
}

interface Contract {
  id: number;
  contractNumber: string;
  title: string;
  partyName: string;
  contractType: string;
  status: string;
  startDate: string;
  endDate: string;
  contractValue: number;
  currency: string;
  createdAt: string;
}

interface LegalCase {
  id: number;
  caseNumber: string;
  caseTitle: string;
  caseType: string;
  caseStatus: string;
  courtName: string;
  opposingParty: string;
  filingDate: string;
  nextHearingDate: string;
  priority: string;
  caseValue: number;
  currency: string;
}

interface ComplianceItem {
  id: number;
  complianceType: string;
  regulationName: string;
  complianceRequirement: string;
  frequency: string;
  dueDate: string;
  completionDate: string;
  status: string;
  responsiblePersonName: string;
}

interface PoshCase {
  id: number;
  caseNumber: string;
  complaintDate: string;
  complainantName: string;
  respondentName: string;
  caseType: string;
  caseStatus: string;
  priority: string;
  incidentDate: string;
  incidentLocation: string;
}

interface LegalNotice {
  id: number;
  noticeNumber: string;
  noticeType: string;
  fromParty: string;
  toParty: string;
  subject: string;
  noticeDate: string;
  responseDueDate: string;
  status: string;
  priority: string;
}

interface ExternalCounsel {
  id: number;
  firmName: string;
  contactPerson: string;
  specialization: string;
  phone: string;
  email: string;
  rating: number;
  status: string;
  hourlyRate: number;
  currency: string;
}

interface PolicyTemplate {
  id: number;
  templateName: string;
  templateType: string;
  category: string;
  version: string;
  effectiveDate: string;
  reviewDate: string;
  approvalStatus: string;
  mandatory: boolean;
}

interface LegalAlert {
  id: number;
  alertType: string;
  alertTitle: string;
  alertDate: string;
  priority: string;
  status: string;
  alertMessage: string;
}

interface NdaAgreement {
  id: number;
  agreementNumber: string;
  title: string;
  description: string;
  partyName: string;
  partyType: string;
  partyContact: string;
  partyEmail: string;
  ndaType: string;
  disclosureScope: string;
  purpose: string;
  startDate: string;
  endDate: string;
  durationMonths: number;
  confidentialityLevel: string;
  status: string;
  breachIncidents: number;
  filePath: string;
  fileUrl: string;
  createdAt: string;
  updatedAt: string;
  createdByName: string;
  assignedToName: string;
}

interface ExclusivityAgreement {
  id: number;
  agreementNumber: string;
  title: string;
  description: string;
  partyName: string;
  partyType: string;
  partyContact: string;
  partyEmail: string;
  exclusivityType: string;
  exclusivityScope: string;
  exclusivityLevel: string;
  startDate: string;
  endDate: string;
  durationMonths: number;
  agreementValue: number;
  currency: string;
  status: string;
  breachIncidents: number;
  performanceScore: number;
  filePath: string;
  fileUrl: string;
  createdAt: string;
  updatedAt: string;
  createdByName: string;
  assignedToName: string;
}

const LegalManagementPage: React.FC = () => {
  const [location] = useLocation();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Dashboard data query
  const { data: dashboardData, isLoading: dashboardLoading } = useQuery<DashboardData>({
    queryKey: ['/api/legal/dashboard'],
    enabled: activeTab === "dashboard"
  });

  // Contracts query
  const { data: contracts, isLoading: contractsLoading } = useQuery<Contract[]>({
    queryKey: ['/api/legal/contracts', { status: filterStatus, contractType: filterType, sortBy, sortOrder }],
    enabled: activeTab === "contracts"
  });

  // Legal Cases query
  const { data: legalCases, isLoading: casesLoading } = useQuery<LegalCase[]>({
    queryKey: ['/api/legal/cases', { status: filterStatus, caseType: filterType, sortBy, sortOrder }],
    enabled: activeTab === "cases"
  });

  // Compliance query
  const { data: compliance, isLoading: complianceLoading } = useQuery<ComplianceItem[]>({
    queryKey: ['/api/legal/compliance', { status: filterStatus, complianceType: filterType, sortBy, sortOrder }],
    enabled: activeTab === "compliance"
  });

  // POSH Cases query
  const { data: poshCases, isLoading: poshLoading } = useQuery<PoshCase[]>({
    queryKey: ['/api/legal/posh-cases', { status: filterStatus, caseType: filterType, sortBy, sortOrder }],
    enabled: activeTab === "posh"
  });

  // Legal Notices query
  const { data: legalNotices, isLoading: noticesLoading } = useQuery<LegalNotice[]>({
    queryKey: ['/api/legal/notices', { status: filterStatus, noticeType: filterType, sortBy, sortOrder }],
    enabled: activeTab === "notices"
  });

  // External Counsel query
  const { data: externalCounsel, isLoading: counselLoading } = useQuery<ExternalCounsel[]>({
    queryKey: ['/api/legal/external-counsel', { status: filterStatus, specialization: filterType, sortBy, sortOrder }],
    enabled: activeTab === "counsel"
  });

  // Policy Templates query
  const { data: policyTemplates, isLoading: templatesLoading } = useQuery<PolicyTemplate[]>({
    queryKey: ['/api/legal/policy-templates', { approvalStatus: filterStatus, templateType: filterType, sortBy, sortOrder }],
    enabled: activeTab === "templates"
  });

  // Legal Alerts query
  const { data: legalAlerts, isLoading: alertsLoading } = useQuery<LegalAlert[]>({
    queryKey: ['/api/legal/alerts', { status: filterStatus, alertType: filterType, sortBy, sortOrder }],
    enabled: activeTab === "alerts"
  });

  // NDA Agreements query
  const { data: ndaAgreements, isLoading: ndaLoading } = useQuery<NdaAgreement[]>({
    queryKey: ['/api/legal/nda-agreements', { status: filterStatus, partyType: filterType, sortBy, sortOrder }],
    enabled: activeTab === "nda"
  });

  // Exclusivity Agreements query
  const { data: exclusivityAgreements, isLoading: exclusivityLoading } = useQuery<ExclusivityAgreement[]>({
    queryKey: ['/api/legal/exclusivity-agreements', { status: filterStatus, partyType: filterType, sortBy, sortOrder }],
    enabled: activeTab === "exclusivity"
  });

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
      case 'approved':
      case 'completed':
      case 'resolved':
        return 'bg-green-100 text-green-800';
      case 'pending':
      case 'under review':
      case 'in progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'expired':
      case 'rejected':
      case 'cancelled':
      case 'overdue':
        return 'bg-red-100 text-red-800';
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high':
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD'
    }).format(amount);
  };

  const renderDashboard = () => {
    if (dashboardLoading) {
      return <div className="p-6">Loading dashboard...</div>;
    }

    return (
      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Contracts</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboardData?.contracts?.find(c => c.status === 'Active')?.count || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Total Value: {formatCurrency(
                  dashboardData?.contracts?.find(c => c.status === 'Active')?.totalValue || 0,
                  'USD'
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Cases</CardTitle>
              <Scale className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboardData?.cases?.find(c => c.status === 'Active')?.count || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Total Value: {formatCurrency(
                  dashboardData?.cases?.find(c => c.status === 'Active')?.totalValue || 0,
                  'USD'
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Compliance Items</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboardData?.compliance?.reduce((sum, item) => sum + item.count, 0) || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Pending: {dashboardData?.compliance?.find(c => c.status === 'Pending')?.count || 0}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">POSH Cases</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboardData?.poshCases?.reduce((sum, item) => sum + item.count, 0) || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Active: {dashboardData?.poshCases?.find(c => c.status === 'Active')?.count || 0}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Upcoming Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboardData?.upcomingAlerts?.length ? (
              <div className="space-y-3">
                {dashboardData.upcomingAlerts.map((alert) => (
                  <div key={alert.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="h-4 w-4 text-orange-500" />
                      <div>
                        <p className="font-medium">{alert.alertTitle}</p>
                        <p className="text-sm text-gray-600">{alert.alertType}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={getPriorityColor(alert.priority)}>
                        {alert.priority}
                      </Badge>
                      <span className="text-sm text-gray-500">
                        {format(new Date(alert.alertDate), 'MMM dd, yyyy')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No upcoming alerts</p>
            )}
          </CardContent>
        </Card>

        {/* Expiring Contracts & Upcoming Hearings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Expiring Contracts (30 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dashboardData?.expiringContracts?.length ? (
                <div className="space-y-3">
                  {dashboardData.expiringContracts.map((contract) => (
                    <div key={contract.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <div>
                        <p className="font-medium">{contract.contractNumber}</p>
                        <p className="text-sm text-gray-600">{contract.partyName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-red-600">
                          {format(new Date(contract.endDate), 'MMM dd, yyyy')}
                        </p>
                        <Badge className={getStatusColor(contract.status)}>
                          {contract.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No expiring contracts</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Upcoming Hearings (30 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dashboardData?.upcomingHearings?.length ? (
                <div className="space-y-3">
                  {dashboardData.upcomingHearings.map((hearing) => (
                    <div key={hearing.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                      <div>
                        <p className="font-medium">{hearing.caseNumber}</p>
                        <p className="text-sm text-gray-600">{hearing.courtName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-blue-600">
                          {format(new Date(hearing.nextHearingDate), 'MMM dd, yyyy')}
                        </p>
                        <Badge className={getPriorityColor(hearing.priority)}>
                          {hearing.priority}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No upcoming hearings</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderContracts = () => {
    if (contractsLoading) {
      return <div className="p-6">Loading contracts...</div>;
    }

    return (
      <div className="p-6 space-y-6">
        {/* Header with Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold">Contract Management</h2>
            <p className="text-gray-600">Manage all legal contracts and agreements</p>
          </div>
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add New Contract
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search contracts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
            />
          </div>
          <div className="flex gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Expired">Expired</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Service Agreement">Service Agreement</SelectItem>
                <SelectItem value="Purchase Order">Purchase Order</SelectItem>
                <SelectItem value="NDA">NDA</SelectItem>
                <SelectItem value="Employment">Employment</SelectItem>
                <SelectItem value="Vendor">Vendor</SelectItem>
                <SelectItem value="Lease">Lease</SelectItem>
                <SelectItem value="License">License</SelectItem>
                <SelectItem value="Partnership">Partnership</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Contracts Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contract Number</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Party Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts?.map((contract) => (
                  <TableRow key={contract.id}>
                    <TableCell className="font-medium">{contract.contractNumber}</TableCell>
                    <TableCell>{contract.title}</TableCell>
                    <TableCell>{contract.partyName}</TableCell>
                    <TableCell>{contract.contractType}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(contract.status)}>
                        {contract.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatCurrency(contract.contractValue, contract.currency)}</TableCell>
                    <TableCell>{format(new Date(contract.startDate), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>{format(new Date(contract.endDate), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderCases = () => {
    if (casesLoading) {
      return <div className="p-6">Loading legal cases...</div>;
    }

    return (
      <div className="p-6 space-y-6">
        {/* Header with Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold">Legal Cases & Litigation</h2>
            <p className="text-gray-600">Track all legal cases and litigation matters</p>
          </div>
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add New Case
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search cases..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
            />
          </div>
          <div className="flex gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="On Hold">On Hold</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Civil">Civil</SelectItem>
                <SelectItem value="Criminal">Criminal</SelectItem>
                <SelectItem value="Corporate">Corporate</SelectItem>
                <SelectItem value="Employment">Employment</SelectItem>
                <SelectItem value="Contract Dispute">Contract Dispute</SelectItem>
                <SelectItem value="Intellectual Property">Intellectual Property</SelectItem>
                <SelectItem value="Tax">Tax</SelectItem>
                <SelectItem value="Regulatory">Regulatory</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Cases Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case Number</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Court</TableHead>
                  <TableHead>Opposing Party</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Next Hearing</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {legalCases?.map((legalCase) => (
                  <TableRow key={legalCase.id}>
                    <TableCell className="font-medium">{legalCase.caseNumber}</TableCell>
                    <TableCell>{legalCase.caseTitle}</TableCell>
                    <TableCell>{legalCase.caseType}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(legalCase.caseStatus)}>
                        {legalCase.caseStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>{legalCase.courtName}</TableCell>
                    <TableCell>{legalCase.opposingParty}</TableCell>
                    <TableCell>
                      <Badge className={getPriorityColor(legalCase.priority)}>
                        {legalCase.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {legalCase.nextHearingDate ? format(new Date(legalCase.nextHearingDate), 'MMM dd, yyyy') : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderCompliance = () => {
    if (complianceLoading) {
      return <div className="p-6">Loading compliance items...</div>;
    }

    return (
      <div className="p-6 space-y-6">
        {/* Header with Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold">Compliance Register</h2>
            <p className="text-gray-600">Monitor regulatory compliance and requirements</p>
          </div>
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Compliance Item
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search compliance items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
            />
          </div>
          <div className="flex gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Compliant">Compliant</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Overdue">Overdue</SelectItem>
                <SelectItem value="Non-Compliant">Non-Compliant</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Labor Law">Labor Law</SelectItem>
                <SelectItem value="Environmental">Environmental</SelectItem>
                <SelectItem value="Health & Safety">Health & Safety</SelectItem>
                <SelectItem value="Tax">Tax</SelectItem>
                <SelectItem value="Corporate">Corporate</SelectItem>
                <SelectItem value="Data Protection">Data Protection</SelectItem>
                <SelectItem value="Industry Specific">Industry Specific</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Compliance Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Regulation</TableHead>
                  <TableHead>Requirement</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Responsible Person</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {compliance?.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.regulationName}</TableCell>
                    <TableCell>{item.complianceRequirement}</TableCell>
                    <TableCell>{item.complianceType}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(item.status)}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.frequency}</TableCell>
                    <TableCell>{format(new Date(item.dueDate), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>{item.responsiblePersonName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderPoshCases = () => {
    if (poshLoading) {
      return <div className="p-6">Loading POSH cases...</div>;
    }

    return (
      <div className="p-6 space-y-6">
        {/* Header with Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold">POSH Cases</h2>
            <p className="text-gray-600">Prevention of Sexual Harassment case management</p>
          </div>
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add New POSH Case
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search POSH cases..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
            />
          </div>
          <div className="flex gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
                <SelectItem value="Under Investigation">Under Investigation</SelectItem>
                <SelectItem value="Resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Harassment">Harassment</SelectItem>
                <SelectItem value="Discrimination">Discrimination</SelectItem>
                <SelectItem value="Hostile Work Environment">Hostile Work Environment</SelectItem>
                <SelectItem value="Retaliation">Retaliation</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* POSH Cases Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case Number</TableHead>
                  <TableHead>Complaint Date</TableHead>
                  <TableHead>Complainant</TableHead>
                  <TableHead>Respondent</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Incident Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {poshCases?.map((poshCase) => (
                  <TableRow key={poshCase.id}>
                    <TableCell className="font-medium">{poshCase.caseNumber}</TableCell>
                    <TableCell>{format(new Date(poshCase.complaintDate), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>{poshCase.complainantName}</TableCell>
                    <TableCell>{poshCase.respondentName}</TableCell>
                    <TableCell>{poshCase.caseType}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(poshCase.caseStatus)}>
                        {poshCase.caseStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getPriorityColor(poshCase.priority)}>
                        {poshCase.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>{format(new Date(poshCase.incidentDate), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderLegalNotices = () => {
    if (noticesLoading) {
      return <div className="p-6">Loading legal notices...</div>;
    }

    return (
      <div className="p-6 space-y-6">
        {/* Header with Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold">Legal Notices</h2>
            <p className="text-gray-600">Track legal notices and communications</p>
          </div>
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add New Notice
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search notices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
            />
          </div>
          <div className="flex gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Pending Response">Pending Response</SelectItem>
                <SelectItem value="Responded">Responded</SelectItem>
                <SelectItem value="Overdue">Overdue</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Legal Notice">Legal Notice</SelectItem>
                <SelectItem value="Demand Notice">Demand Notice</SelectItem>
                <SelectItem value="Cease and Desist">Cease and Desist</SelectItem>
                <SelectItem value="Termination Notice">Termination Notice</SelectItem>
                <SelectItem value="Breach Notice">Breach Notice</SelectItem>
                <SelectItem value="Court Notice">Court Notice</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Legal Notices Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Notice Number</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>From Party</TableHead>
                  <TableHead>To Party</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Response Due</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {legalNotices?.map((notice) => (
                  <TableRow key={notice.id}>
                    <TableCell className="font-medium">{notice.noticeNumber}</TableCell>
                    <TableCell>{notice.subject}</TableCell>
                    <TableCell>{notice.noticeType}</TableCell>
                    <TableCell>{notice.fromParty}</TableCell>
                    <TableCell>{notice.toParty}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(notice.status)}>
                        {notice.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getPriorityColor(notice.priority)}>
                        {notice.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>{format(new Date(notice.responseDueDate), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderExternalCounsel = () => {
    if (counselLoading) {
      return <div className="p-6">Loading external counsel...</div>;
    }

    return (
      <div className="p-6 space-y-6">
        {/* Header with Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold">External Counsel Directory</h2>
            <p className="text-gray-600">Manage external legal counsel and law firms</p>
          </div>
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add New Counsel
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search counsel..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
            />
          </div>
          <div className="flex gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
                <SelectItem value="Preferred">Preferred</SelectItem>
                <SelectItem value="Blacklisted">Blacklisted</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Specialization" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Specializations</SelectItem>
                <SelectItem value="Corporate Law">Corporate Law</SelectItem>
                <SelectItem value="Civil Litigation">Civil Litigation</SelectItem>
                <SelectItem value="Criminal Law">Criminal Law</SelectItem>
                <SelectItem value="Employment Law">Employment Law</SelectItem>
                <SelectItem value="Intellectual Property">Intellectual Property</SelectItem>
                <SelectItem value="Tax Law">Tax Law</SelectItem>
                <SelectItem value="Environmental Law">Environmental Law</SelectItem>
                <SelectItem value="Contract Law">Contract Law</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* External Counsel Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Firm Name</TableHead>
                  <TableHead>Contact Person</TableHead>
                  <TableHead>Specialization</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Hourly Rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {externalCounsel?.map((counsel) => (
                  <TableRow key={counsel.id}>
                    <TableCell className="font-medium">{counsel.firmName}</TableCell>
                    <TableCell>{counsel.contactPerson}</TableCell>
                    <TableCell>{counsel.specialization}</TableCell>
                    <TableCell>{counsel.phone}</TableCell>
                    <TableCell>{counsel.email}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="text-yellow-500">★</span>
                        <span>{counsel.rating}/5</span>
                      </div>
                    </TableCell>
                    <TableCell>{formatCurrency(counsel.hourlyRate, counsel.currency)}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(counsel.status)}>
                        {counsel.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderPolicyTemplates = () => {
    if (templatesLoading) {
      return <div className="p-6">Loading policy templates...</div>;
    }

    return (
      <div className="p-6 space-y-6">
        {/* Header with Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold">Policy Templates</h2>
            <p className="text-gray-600">Manage legal policy templates and documents</p>
          </div>
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add New Template
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
            />
          </div>
          <div className="flex gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
                <SelectItem value="Under Review">Under Review</SelectItem>
                <SelectItem value="Approved">Approved</SelectItem>
                <SelectItem value="Rejected">Rejected</SelectItem>
                <SelectItem value="Archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Policy">Policy</SelectItem>
                <SelectItem value="Procedure">Procedure</SelectItem>
                <SelectItem value="Guideline">Guideline</SelectItem>
                <SelectItem value="SOP">SOP</SelectItem>
                <SelectItem value="Manual">Manual</SelectItem>
                <SelectItem value="Code of Conduct">Code of Conduct</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Policy Templates Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Effective Date</TableHead>
                  <TableHead>Review Date</TableHead>
                  <TableHead>Mandatory</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policyTemplates?.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">{template.templateName}</TableCell>
                    <TableCell>{template.templateType}</TableCell>
                    <TableCell>{template.category}</TableCell>
                    <TableCell>{template.version}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(template.approvalStatus)}>
                        {template.approvalStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>{format(new Date(template.effectiveDate), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>{format(new Date(template.reviewDate), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>
                      {template.mandatory ? (
                        <Badge className="bg-red-100 text-red-800">Mandatory</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-800">Optional</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderAlerts = () => {
    if (alertsLoading) {
      return <div className="p-6">Loading alerts...</div>;
    }

    return (
      <div className="p-6 space-y-6">
        {/* Header with Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold">Legal Alerts</h2>
            <p className="text-gray-600">Monitor legal alerts and notifications</p>
          </div>
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add New Alert
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search alerts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
            />
          </div>
          <div className="flex gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Dismissed">Dismissed</SelectItem>
                <SelectItem value="Resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Contract Expiry">Contract Expiry</SelectItem>
                <SelectItem value="Hearing Reminder">Hearing Reminder</SelectItem>
                <SelectItem value="Compliance Due">Compliance Due</SelectItem>
                <SelectItem value="Document Review">Document Review</SelectItem>
                <SelectItem value="Renewal Notice">Renewal Notice</SelectItem>
                <SelectItem value="Payment Due">Payment Due</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Alerts Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alert Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Alert Date</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {legalAlerts?.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell className="font-medium">{alert.alertTitle}</TableCell>
                    <TableCell>{alert.alertType}</TableCell>
                    <TableCell>{format(new Date(alert.alertDate), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>
                      <Badge className={getPriorityColor(alert.priority)}>
                        {alert.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(alert.status)}>
                        {alert.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{alert.alertMessage}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderNdaAgreements = () => {
    if (ndaLoading) {
      return <div className="p-6">Loading NDA agreements...</div>;
    }

    return (
      <div className="p-6 space-y-6">
        {/* Header with Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold">NDA Agreements</h2>
            <p className="text-gray-600">Manage confidentiality and non-disclosure agreements</p>
          </div>
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add New NDA
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search NDAs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
            />
          </div>
          <div className="flex gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Expired">Expired</SelectItem>
                <SelectItem value="Terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Unilateral">Unilateral</SelectItem>
                <SelectItem value="Bilateral">Bilateral</SelectItem>
                <SelectItem value="Multilateral">Multilateral</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* NDA Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agreement Number</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Party Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ndaAgreements?.map((agreement) => (
                  <TableRow key={agreement.id}>
                    <TableCell className="font-medium">{agreement.agreementNumber}</TableCell>
                    <TableCell>{agreement.title}</TableCell>
                    <TableCell>{agreement.partyName}</TableCell>
                    <TableCell>{agreement.ndaType}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(agreement.status)}>
                        {agreement.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{agreement.startDate}</TableCell>
                    <TableCell>{agreement.endDate}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderExclusivityAgreements = () => {
    if (exclusivityLoading) {
      return <div className="p-6">Loading exclusivity agreements...</div>;
    }

    return (
      <div className="p-6 space-y-6">
        {/* Header with Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold">Exclusivity Agreements</h2>
            <p className="text-gray-600">Manage exclusive partnership and business agreements</p>
          </div>
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add New Exclusivity Agreement
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search exclusivity agreements..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
            />
          </div>
          <div className="flex gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Expired">Expired</SelectItem>
                <SelectItem value="Terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Supplier">Supplier</SelectItem>
                <SelectItem value="Customer">Customer</SelectItem>
                <SelectItem value="Partner">Partner</SelectItem>
                <SelectItem value="Distributor">Distributor</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Exclusivity Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agreement Number</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Party Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exclusivityAgreements?.map((agreement) => (
                  <TableRow key={agreement.id}>
                    <TableCell className="font-medium">{agreement.agreementNumber}</TableCell>
                    <TableCell>{agreement.title}</TableCell>
                    <TableCell>{agreement.partyName}</TableCell>
                    <TableCell>{agreement.exclusivityType}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(agreement.status)}>
                        {agreement.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{agreement.startDate}</TableCell>
                    <TableCell>{agreement.endDate}</TableCell>
                    <TableCell>{agreement.agreementValue} {agreement.currency}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Legal Management</h1>
                <p className="mt-1 text-sm text-gray-500">
                  Comprehensive legal management system for contracts, cases, compliance, and more
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export Report
                </Button>
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4 mr-2" />
                  Advanced Filter
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5 lg:grid-cols-10 mb-6">
              <TabsTrigger value="dashboard" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="contracts" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Contracts
              </TabsTrigger>
              <TabsTrigger value="cases" className="flex items-center gap-2">
                <Scale className="h-4 w-4" />
                Cases
              </TabsTrigger>
              <TabsTrigger value="compliance" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Compliance
              </TabsTrigger>
              <TabsTrigger value="posh" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                POSH
              </TabsTrigger>
              <TabsTrigger value="notices" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Notices
              </TabsTrigger>
              <TabsTrigger value="counsel" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Counsel
              </TabsTrigger>
              <TabsTrigger value="templates" className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Templates
              </TabsTrigger>
              <TabsTrigger value="nda" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                NDA
              </TabsTrigger>
              <TabsTrigger value="exclusivity" className="flex items-center gap-2">
                <FileCheck className="h-4 w-4" />
                Exclusivity
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard">{renderDashboard()}</TabsContent>
            <TabsContent value="contracts">{renderContracts()}</TabsContent>
            <TabsContent value="cases">{renderCases()}</TabsContent>
            <TabsContent value="compliance">{renderCompliance()}</TabsContent>
            <TabsContent value="posh">{renderPoshCases()}</TabsContent>
            <TabsContent value="notices">{renderLegalNotices()}</TabsContent>
            <TabsContent value="counsel">{renderExternalCounsel()}</TabsContent>
            <TabsContent value="templates">{renderPolicyTemplates()}</TabsContent>
            <TabsContent value="nda">{renderNdaAgreements()}</TabsContent>
            <TabsContent value="exclusivity">{renderExclusivityAgreements()}</TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
};

export default LegalManagementPage;