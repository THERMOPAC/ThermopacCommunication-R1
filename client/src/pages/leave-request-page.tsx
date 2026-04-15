import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Helmet } from "react-helmet";
import {
  Calendar,
  Clock,
  User,
  CheckCircle,
  XCircle,
  AlertCircle,
  Plus,
  FileText,
  CalendarDays,
  Users
} from "lucide-react";
import { format, differenceInDays, parseISO, addDays } from "date-fns";

interface LeaveType {
  id: number;
  name: string;
  code: string;
  maxDaysPerYear: string;
  colorCode: string;
  isPaid: boolean;
  requiresApproval: boolean;
  canBeHalfDay: boolean;
}

interface LeaveBalance {
  id: number;
  leaveTypeId: number;
  leaveTypeName: string;
  leaveTypeCode: string;
  colorCode: string;
  allocatedDays: string;
  usedDays: string;
  pendingDays: string;
  availableDays: number;
}

interface LeaveRequest {
  id: number;
  leaveTypeId: number;
  leaveTypeName: string;
  leaveTypeColor: string;
  startDate: string;
  endDate: string;
  totalDays: string;
  isHalfDay: boolean;
  halfDayPeriod: string | null;
  reason: string;
  status: string;
  appliedDate: string;
  managerId: number | null;
  managerName: string | null;
  managerApprovalStatus: string | null;
  managerApprovalDate: string | null;
  managerComments: string | null;
}

interface ReportingManager {
  id: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

interface TeamLeaveRequest {
  id: number;
  employeeId: number;
  leaveTypeId: number;
  leaveTypeName: string;
  leaveTypeColor: string;
  startDate: string;
  endDate: string;
  totalDays: string;
  isHalfDay: boolean;
  halfDayPeriod: string | null;
  reason: string;
  status: string;
  appliedDate: string;
  managerApprovalStatus: string | null;
  employeeName: string;
  employeeFirstName: string | null;
  employeeEmail: string;
  employeeDisplayName: string;
}

export default function LeaveRequestPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [showNewRequestDialog, setShowNewRequestDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [selectedRequestForReject, setSelectedRequestForReject] = useState<number | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [activeTab, setActiveTab] = useState("my-requests");
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  
  const yearOptions = Array.from({ length: 2035 - (currentYear - 2) + 1 }, (_, i) => currentYear - 2 + i);

  const [formData, setFormData] = useState({
    leaveTypeId: "",
    startDate: "",
    endDate: "",
    isHalfDay: false,
    halfDayPeriod: "morning",
    reason: "",
    emergencyContact: "",
    workHandoverNotes: ""
  });

  const { data: leaveTypes = [] } = useQuery<LeaveType[]>({
    queryKey: ['/api/leave/types'],
  });

  const { data: leaveBalances = [] } = useQuery<LeaveBalance[]>({
    queryKey: ['/api/leave/my-balance', selectedYear],
    queryFn: async () => {
      const res = await fetch(`/api/leave/my-balance?year=${selectedYear}`);
      if (!res.ok) throw new Error('Failed to fetch balance');
      return res.json();
    }
  });

  const { data: myRequests = [] } = useQuery<LeaveRequest[]>({
    queryKey: ['/api/leave/my-requests', selectedYear],
    queryFn: async () => {
      const res = await fetch(`/api/leave/my-requests?year=${selectedYear}`);
      if (!res.ok) throw new Error('Failed to fetch requests');
      return res.json();
    }
  });

  const { data: reportingManager } = useQuery<ReportingManager>({
    queryKey: ['/api/leave/my-reporting-manager'],
  });

  const { data: companyHolidays = [] } = useQuery<any[]>({
    queryKey: ['/api/leave/company-holidays', selectedYear],
    queryFn: async () => {
      const res = await fetch(`/api/leave/company-holidays?year=${selectedYear}`);
      if (!res.ok) throw new Error('Failed to fetch holidays');
      return res.json();
    }
  });

  const { data: hasDirectReports } = useQuery<{ hasDirectReports: boolean }>({
    queryKey: ['/api/leave/has-direct-reports'],
  });

  const { data: teamRequests = [] } = useQuery<TeamLeaveRequest[]>({
    queryKey: ['/api/leave/team-requests', selectedYear],
    queryFn: async () => {
      const res = await fetch(`/api/leave/team-requests?year=${selectedYear}`);
      if (!res.ok) throw new Error('Failed to fetch team requests');
      return res.json();
    },
    enabled: hasDirectReports?.hasDirectReports === true,
  });

  const createRequestMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/leave/request', data);
    },
    onSuccess: () => {
      toast({
        title: 'Leave Request Submitted',
        description: 'Your leave request has been submitted for approval.',
      });
      setShowNewRequestDialog(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['/api/leave/my-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leave/my-balance'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit leave request',
        variant: 'destructive',
      });
    },
  });

  const cancelRequestMutation = useMutation({
    mutationFn: async (requestId: number) => {
      return await apiRequest('POST', `/api/leave/request/${requestId}/cancel`, {});
    },
    onSuccess: () => {
      toast({
        title: 'Request Cancelled',
        description: 'Your leave request has been cancelled.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/leave/my-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leave/my-balance'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel request',
        variant: 'destructive',
      });
    },
  });

  const approveRequestMutation = useMutation({
    mutationFn: async ({ requestId, comments }: { requestId: number; comments?: string }) => {
      return await apiRequest('POST', `/api/leave/request/${requestId}/approve`, { comments });
    },
    onSuccess: () => {
      toast({
        title: 'Request Approved',
        description: 'Leave request has been approved.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/leave/team-requests'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve request',
        variant: 'destructive',
      });
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: async ({ requestId, comments }: { requestId: number; comments: string }) => {
      return await apiRequest('POST', `/api/leave/request/${requestId}/reject`, { comments });
    },
    onSuccess: () => {
      toast({
        title: 'Request Rejected',
        description: 'Leave request has been rejected.',
      });
      setShowRejectDialog(false);
      setSelectedRequestForReject(null);
      setRejectComment("");
      queryClient.invalidateQueries({ queryKey: ['/api/leave/team-requests'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to reject request',
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setFormData({
      leaveTypeId: "",
      startDate: "",
      endDate: "",
      isHalfDay: false,
      halfDayPeriod: "morning",
      reason: "",
      emergencyContact: "",
      workHandoverNotes: ""
    });
  };

  const calculateDays = () => {
    if (!formData.startDate || !formData.endDate) return 0;
    if (formData.isHalfDay) return 0.5;
    const start = parseISO(formData.startDate);
    const end = parseISO(formData.endDate);
    return differenceInDays(end, start) + 1;
  };

  const selectedLeaveType = formData.leaveTypeId
    ? leaveTypes.find(t => t.id === parseInt(formData.leaveTypeId))
    : null;
  const selectedBalance = formData.leaveTypeId
    ? leaveBalances.find(b => b.leaveTypeId === parseInt(formData.leaveTypeId))
    : null;
  const availableDays = selectedBalance ? selectedBalance.availableDays : 0;
  const requestedDays = calculateDays();
  const isPaidLeave = selectedLeaveType?.isPaid ?? false;
  const hasZeroBalance = isPaidLeave && selectedLeaveType !== null && availableDays === 0;
  const hasInsufficientBalance = isPaidLeave && requestedDays > 0 && requestedDays > availableDays;
  const cannotSubmitDueToBalance = hasZeroBalance || hasInsufficientBalance;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.leaveTypeId || !formData.startDate || !formData.reason) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    if (cannotSubmitDueToBalance) {
      toast({
        title: 'Insufficient Leave Balance',
        description: hasZeroBalance
          ? `You have no ${selectedLeaveType?.name} balance available. Consider applying for Unpaid Leave.`
          : `You have ${availableDays} day${availableDays !== 1 ? 's' : ''} available but requested ${requestedDays}. Consider applying for Unpaid Leave.`,
        variant: 'destructive',
      });
      return;
    }

    const totalDays = calculateDays();
    createRequestMutation.mutate({
      ...formData,
      leaveTypeId: parseInt(formData.leaveTypeId),
      endDate: formData.isHalfDay ? formData.startDate : formData.endDate,
      totalDays
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      case 'canceled':
        return <Badge className="bg-gray-100 text-gray-800"><XCircle className="w-3 h-3 mr-1" />Cancelled</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800"><AlertCircle className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  const pendingRequests = myRequests.filter(r => r.status === 'pending');
  const approvedRequests = myRequests.filter(r => r.status === 'approved');
  const otherRequests = myRequests.filter(r => r.status !== 'pending' && r.status !== 'approved');
  
  const pendingTeamRequests = teamRequests.filter(r => r.managerApprovalStatus === 'pending');
  const processedTeamRequests = teamRequests.filter(r => r.managerApprovalStatus !== 'pending');

  return (
    <>
      <Helmet>
        <title>Leave Request - THERMOPAC</title>
      </Helmet>

      <div className="space-y-6 p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Leave Request</h1>
            <p className="text-gray-600 mt-1">Submit and track your leave requests</p>
          </div>
          <Button onClick={() => setShowNewRequestDialog(true)} data-testid="button-new-leave-request">
            <Plus className="w-4 h-4 mr-2" />
            New Leave Request
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Reporting Manager</p>
                  <p className="text-lg font-semibold">
                    {reportingManager 
                      ? (reportingManager.firstName || reportingManager.username)
                      : 'Not Assigned'}
                  </p>
                </div>
                <User className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Pending Requests</p>
                  <p className="text-2xl font-bold text-yellow-600">{pendingRequests.length}</p>
                </div>
                <AlertCircle className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Approved This Year</p>
                  <p className="text-2xl font-bold text-green-600">{approvedRequests.length}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Company Holidays</p>
                  <p className="text-2xl font-bold text-blue-600">{companyHolidays.length}</p>
                </div>
                <CalendarDays className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
            <TabsTrigger value="my-requests" data-testid="tab-my-requests">My Requests</TabsTrigger>
            {hasDirectReports?.hasDirectReports && (
              <TabsTrigger value="team-requests" data-testid="tab-team-requests" className="relative">
                Team Requests
                {pendingTeamRequests.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {pendingTeamRequests.length}
                  </span>
                )}
              </TabsTrigger>
            )}
            <TabsTrigger value="leave-balance" data-testid="tab-leave-balance">Leave Balance</TabsTrigger>
            <TabsTrigger value="holidays" data-testid="tab-holidays">Company Holidays</TabsTrigger>
            </TabsList>
            
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Year:</Label>
              <Select 
                value={selectedYear.toString()} 
                onValueChange={(value) => setSelectedYear(parseInt(value))}
              >
                <SelectTrigger className="w-[100px]" data-testid="select-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <TabsContent value="my-requests" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>My Leave Requests</CardTitle>
                <CardDescription>View and manage your leave requests</CardDescription>
              </CardHeader>
              <CardContent>
                {myRequests.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No leave requests found</p>
                    <Button 
                      variant="outline" 
                      className="mt-4"
                      onClick={() => setShowNewRequestDialog(true)}
                    >
                      Submit Your First Request
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {myRequests.map((request) => (
                      <Card key={request.id} className="p-4" data-testid={`leave-request-${request.id}`}>
                        <div className="flex justify-between items-start">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: request.leaveTypeColor || '#3B82F6' }}
                              />
                              <span className="font-medium">{request.leaveTypeName}</span>
                              {getStatusBadge(request.status)}
                            </div>
                            <div className="text-sm text-gray-600">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                {format(parseISO(request.startDate), 'MMM dd, yyyy')}
                                {request.startDate !== request.endDate && (
                                  <> - {format(parseISO(request.endDate), 'MMM dd, yyyy')}</>
                                )}
                                <span className="text-gray-400">|</span>
                                <span>{request.totalDays} day{parseFloat(request.totalDays) !== 1 ? 's' : ''}</span>
                                {request.isHalfDay && (
                                  <Badge variant="outline" className="text-xs">{request.halfDayPeriod} half</Badge>
                                )}
                              </div>
                            </div>
                            <p className="text-sm text-gray-500">{request.reason}</p>
                            
                            {request.managerName && (
                              <div className="text-xs text-gray-500 mt-2">
                                <span className="font-medium">Approver:</span> {request.managerName}
                                {request.managerApprovalStatus && (
                                  <span className="ml-2">
                                    ({request.managerApprovalStatus}
                                    {request.managerApprovalDate && 
                                      ` on ${format(parseISO(request.managerApprovalDate), 'MMM dd')}`
                                    })
                                  </span>
                                )}
                              </div>
                            )}
                            {request.managerComments && (
                              <div className="text-xs text-gray-500 italic">
                                "{request.managerComments}"
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {request.status === 'pending' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (confirm('Are you sure you want to cancel this request?')) {
                                    cancelRequestMutation.mutate(request.id);
                                  }
                                }}
                                data-testid={`button-cancel-request-${request.id}`}
                              >
                                Cancel
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {hasDirectReports?.hasDirectReports && (
            <TabsContent value="team-requests" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Team Leave Requests</CardTitle>
                  <CardDescription>Approve or reject leave requests from your team members</CardDescription>
                </CardHeader>
                <CardContent>
                  {teamRequests.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No leave requests from your team</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {pendingTeamRequests.length > 0 && (
                        <div>
                          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-yellow-500" />
                            Pending Approval ({pendingTeamRequests.length})
                          </h3>
                          <div className="space-y-3">
                            {pendingTeamRequests.map((request) => (
                              <Card key={request.id} className="p-4 border-l-4 border-yellow-500" data-testid={`team-request-${request.id}`}>
                                <div className="flex justify-between items-start">
                                  <div className="space-y-2 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-semibold text-lg">{request.employeeDisplayName}</span>
                                      <div 
                                        className="w-3 h-3 rounded-full" 
                                        style={{ backgroundColor: request.leaveTypeColor || '#3B82F6' }}
                                      />
                                      <span className="text-gray-600">{request.leaveTypeName}</span>
                                      {getStatusBadge('pending')}
                                    </div>
                                    <div className="text-sm text-gray-600">
                                      <div className="flex items-center gap-2">
                                        <Calendar className="w-4 h-4" />
                                        {format(parseISO(request.startDate), 'MMM dd, yyyy')}
                                        {request.startDate !== request.endDate && (
                                          <> - {format(parseISO(request.endDate), 'MMM dd, yyyy')}</>
                                        )}
                                        <span className="text-gray-400">|</span>
                                        <span className="font-medium">{request.totalDays} day{parseFloat(request.totalDays) !== 1 ? 's' : ''}</span>
                                        {request.isHalfDay && (
                                          <Badge variant="outline" className="text-xs">{request.halfDayPeriod} half</Badge>
                                        )}
                                      </div>
                                    </div>
                                    <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded">
                                      <strong>Reason:</strong> {request.reason}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      Applied on {format(parseISO(request.appliedDate), 'MMM dd, yyyy')}
                                    </p>
                                  </div>
                                  <div className="flex gap-2 ml-4">
                                    <Button
                                      size="sm"
                                      className="bg-green-600 hover:bg-green-700"
                                      onClick={() => {
                                        if (confirm(`Approve leave request from ${request.employeeDisplayName}?`)) {
                                          approveRequestMutation.mutate({ requestId: request.id });
                                        }
                                      }}
                                      disabled={approveRequestMutation.isPending}
                                      data-testid={`button-approve-${request.id}`}
                                    >
                                      <CheckCircle className="w-4 h-4 mr-1" />
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => {
                                        setSelectedRequestForReject(request.id);
                                        setShowRejectDialog(true);
                                      }}
                                      data-testid={`button-reject-${request.id}`}
                                    >
                                      <XCircle className="w-4 h-4 mr-1" />
                                      Reject
                                    </Button>
                                  </div>
                                </div>
                              </Card>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {processedTeamRequests.length > 0 && (
                        <div className="mt-6">
                          <h3 className="text-lg font-semibold mb-3 text-gray-600">
                            Previously Processed ({processedTeamRequests.length})
                          </h3>
                          <div className="space-y-3">
                            {processedTeamRequests.map((request) => (
                              <Card key={request.id} className="p-4 opacity-75" data-testid={`team-request-processed-${request.id}`}>
                                <div className="flex justify-between items-start">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{request.employeeDisplayName}</span>
                                      <span className="text-gray-600">{request.leaveTypeName}</span>
                                      {getStatusBadge(request.status)}
                                    </div>
                                    <div className="text-sm text-gray-600">
                                      {format(parseISO(request.startDate), 'MMM dd')}
                                      {request.startDate !== request.endDate && (
                                        <> - {format(parseISO(request.endDate), 'MMM dd')}</>
                                      )}
                                      <span className="ml-2">({request.totalDays} days)</span>
                                    </div>
                                  </div>
                                </div>
                              </Card>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          <TabsContent value="leave-balance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Leave Balance ({selectedYear})</CardTitle>
                <CardDescription>Your available leave days by type</CardDescription>
              </CardHeader>
              <CardContent>
                {leaveBalances.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No leave balance allocated yet</p>
                    <p className="text-sm mt-2">Please contact HR to allocate your leave balance</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {leaveBalances.map((balance) => (
                      <Card key={balance.id} className="p-4" data-testid={`leave-balance-${balance.leaveTypeId}`}>
                        <div className="flex items-center gap-3 mb-3">
                          <div 
                            className="w-4 h-4 rounded-full" 
                            style={{ backgroundColor: balance.colorCode || '#3B82F6' }}
                          />
                          <span className="font-medium">{balance.leaveTypeName}</span>
                          <Badge variant="outline" className="text-xs">{balance.leaveTypeCode}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-gray-500">Allocated</p>
                            <p className="font-semibold">{balance.allocatedDays} days</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Used</p>
                            <p className="font-semibold text-red-600">{balance.usedDays} days</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Pending</p>
                            <p className="font-semibold text-yellow-600">{balance.pendingDays} days</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Available</p>
                            <p className="font-semibold text-green-600">{balance.availableDays} days</p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="holidays" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Company Holidays ({currentYear})</CardTitle>
                <CardDescription>Official company holidays and observances</CardDescription>
              </CardHeader>
              <CardContent>
                {companyHolidays.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <CalendarDays className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No holidays defined for {currentYear}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {companyHolidays.map((holiday: any) => (
                      <Card key={holiday.id} className="p-4" data-testid={`holiday-${holiday.id}`}>
                        <div className="space-y-2">
                          <div className="flex justify-between items-start">
                            <h4 className="font-medium">{holiday.name}</h4>
                            {holiday.isOptional && (
                              <Badge variant="secondary" className="text-xs">Optional</Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">
                            {format(parseISO(holiday.date), 'EEEE, MMMM dd, yyyy')}
                          </p>
                          {holiday.description && (
                            <p className="text-xs text-gray-500">{holiday.description}</p>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={showNewRequestDialog} onOpenChange={setShowNewRequestDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New Leave Request</DialogTitle>
              <DialogDescription>
                Submit a new leave request for approval
                {reportingManager && (
                  <span className="block mt-1 text-blue-600">
                    Approver: {reportingManager.firstName || reportingManager.username}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="leaveType">Leave Type *</Label>
                <Select 
                  value={formData.leaveTypeId} 
                  onValueChange={(value) => setFormData({ ...formData, leaveTypeId: value })}
                >
                  <SelectTrigger data-testid="select-leave-type">
                    <SelectValue placeholder="Select leave type" />
                  </SelectTrigger>
                  <SelectContent>
                    {leaveTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id.toString()}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: type.colorCode }}
                          />
                          {type.name} ({type.code})
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedLeaveType && isPaidLeave && (
                  <div className={`mt-2 p-2 rounded-md flex items-center gap-2 text-sm border ${hasZeroBalance ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                    <span className="font-medium">{selectedLeaveType.name} Balance:</span>
                    <span className="font-bold">
                      {availableDays} day{availableDays !== 1 ? 's' : ''} available
                    </span>
                    {hasZeroBalance && (
                      <span className="ml-1 text-red-600">— No balance. Consider Unpaid Leave.</span>
                    )}
                  </div>
                )}
                {selectedLeaveType && !isPaidLeave && (
                  <div className="mt-2 p-2 rounded-md text-sm bg-gray-50 border border-gray-200 text-gray-600">
                    {selectedLeaveType.name} — no balance deduction (unpaid leave)
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isHalfDay"
                  checked={formData.isHalfDay}
                  onCheckedChange={(checked) => setFormData({ 
                    ...formData, 
                    isHalfDay: !!checked,
                    endDate: checked ? formData.startDate : formData.endDate
                  })}
                  data-testid="checkbox-half-day"
                />
                <Label htmlFor="isHalfDay">Half Day</Label>
              </div>

              {formData.isHalfDay && (
                <div>
                  <Label>Half Day Period</Label>
                  <Select 
                    value={formData.halfDayPeriod} 
                    onValueChange={(value) => setFormData({ ...formData, halfDayPeriod: value })}
                  >
                    <SelectTrigger data-testid="select-half-day-period">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="morning">Morning</SelectItem>
                      <SelectItem value="afternoon">Afternoon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startDate">Start Date *</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      startDate: e.target.value,
                      endDate: formData.isHalfDay ? e.target.value : formData.endDate
                    })}
                    data-testid="input-start-date"
                  />
                </div>
                {!formData.isHalfDay && (
                  <div>
                    <Label htmlFor="endDate">End Date *</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={formData.endDate}
                      min={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      data-testid="input-end-date"
                    />
                  </div>
                )}
              </div>

              {(formData.startDate && (formData.isHalfDay || formData.endDate)) && (
                <div className="bg-blue-50 p-3 rounded-md">
                  <p className="text-sm text-blue-800">
                    <strong>Total Days:</strong> {calculateDays()} day{calculateDays() !== 1 ? 's' : ''}
                  </p>
                </div>
              )}

              {selectedLeaveType && isPaidLeave && hasInsufficientBalance && (
                <div className="p-3 rounded-md bg-red-50 border border-red-200">
                  <p className="text-sm font-medium text-red-800">
                    Insufficient balance — you need {requestedDays} day{requestedDays !== 1 ? 's' : ''} but only {availableDays} available. Consider Unpaid Leave instead.
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor="reason">Reason *</Label>
                <Textarea
                  id="reason"
                  placeholder="Please provide a reason for your leave request"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  data-testid="input-reason"
                />
              </div>

              <div>
                <Label htmlFor="emergencyContact">Emergency Contact (Optional)</Label>
                <Input
                  id="emergencyContact"
                  placeholder="Phone number or email"
                  value={formData.emergencyContact}
                  onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                  data-testid="input-emergency-contact"
                />
              </div>

              <div>
                <Label htmlFor="workHandover">Work Handover Notes (Optional)</Label>
                <Textarea
                  id="workHandover"
                  placeholder="Notes about pending work or handover instructions"
                  value={formData.workHandoverNotes}
                  onChange={(e) => setFormData({ ...formData, workHandoverNotes: e.target.value })}
                  data-testid="input-work-handover"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowNewRequestDialog(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createRequestMutation.isPending || cannotSubmitDueToBalance}
                  data-testid="button-submit-leave-request"
                >
                  {createRequestMutation.isPending ? 'Submitting...' : cannotSubmitDueToBalance ? 'Insufficient Balance' : 'Submit Request'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Leave Request</DialogTitle>
              <DialogDescription>
                Please provide a reason for rejecting this leave request.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="rejectReason">Rejection Reason *</Label>
                <Textarea
                  id="rejectReason"
                  placeholder="Please explain why this request is being rejected..."
                  value={rejectComment}
                  onChange={(e) => setRejectComment(e.target.value)}
                  data-testid="input-reject-reason"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowRejectDialog(false);
                    setSelectedRequestForReject(null);
                    setRejectComment("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={!rejectComment.trim() || rejectRequestMutation.isPending}
                  onClick={() => {
                    if (selectedRequestForReject && rejectComment.trim()) {
                      rejectRequestMutation.mutate({
                        requestId: selectedRequestForReject,
                        comments: rejectComment.trim()
                      });
                    }
                  }}
                  data-testid="button-confirm-reject"
                >
                  {rejectRequestMutation.isPending ? 'Rejecting...' : 'Reject Request'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
