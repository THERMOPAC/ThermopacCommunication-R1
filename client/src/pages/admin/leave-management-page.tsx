import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { 
  CalendarDays, 
  Clock, 
  Plus, 
  Filter, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Users,
  Calendar,
  TrendingUp,
  UserCheck,
  Eye,
  Edit,
  Trash2,
  Heart,
  Plane,
  User,
  Download,
  Search
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { fmtDate } from '@/lib/date-utils';

// Form schemas
const leaveRequestSchema = z.object({
  leaveTypeId: z.number().min(1, 'Please select a leave type'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
  isHalfDay: z.boolean().default(false),
  halfDayPeriod: z.enum(['morning', 'afternoon']).optional(),
  emergencyContact: z.string().optional(),
  workHandoverNotes: z.string().optional(),
  employeeId: z.number().optional()
});

const leaveTypeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().min(1, 'Code is required'),
  description: z.string().optional(),
  maxDaysPerYear: z.string().default('0'),
  carryoverAllowed: z.boolean().default(false),
  maxCarryoverDays: z.string().default('0'),
  isPaid: z.boolean().default(true),
  requiresApproval: z.boolean().default(true),
  noticeDaysRequired: z.number().default(1),
  canBeHalfDay: z.boolean().default(true),
  sandwichApplicable: z.boolean().default(false),
  colorCode: z.string().default('#3B82F6')
});

const holidaySchema = z.object({
  name: z.string().min(1, 'Holiday name is required'),
  date: z.string().min(1, 'Date is required'),
  description: z.string().optional(),
  isOptional: z.boolean().default(false)
});

type LeaveRequestForm = z.infer<typeof leaveRequestSchema>;
type LeaveTypeForm = z.infer<typeof leaveTypeSchema>;
type HolidayForm = z.infer<typeof holidaySchema>;

export default function LeaveManagementPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [allocationsYear, setAllocationsYear] = useState(new Date().getFullYear());
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterEmployee, setFilterEmployee] = useState('all');
  const [showNewRequestDialog, setShowNewRequestDialog] = useState(false);
  const [showNewLeaveDialog, setShowNewLeaveDialog] = useState(false);
  const [showNewTypeDialog, setShowNewTypeDialog] = useState(false);
  const [showNewHolidayDialog, setShowNewHolidayDialog] = useState(false);
  const [showEditHolidayDialog, setShowEditHolidayDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [selectedHoliday, setSelectedHoliday] = useState<any>(null);
  const [showEditUserAllocDialog, setShowEditUserAllocDialog] = useState(false);
  const [selectedUserForAlloc, setSelectedUserForAlloc] = useState<any>(null);
  const [showEditWeeklyOffDialog, setShowEditWeeklyOffDialog] = useState(false);
  const [selectedUserForWeeklyOff, setSelectedUserForWeeklyOff] = useState<any>(null);
  const [weeklyOffSelection, setWeeklyOffSelection] = useState<number[]>([0, 6]);
  const [showQuickAllocDialog, setShowQuickAllocDialog] = useState(false);
  const [quickAllocYear, setQuickAllocYear] = useState(new Date().getFullYear());
  const [quickAllocValues, setQuickAllocValues] = useState<Record<number, number>>({});
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [balancesYear, setBalancesYear] = useState(new Date().getFullYear());
  const [balancesSearch, setBalancesSearch] = useState('');
  const [balancesEmployee, setBalancesEmployee] = useState('all');

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch data
  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['/api/admin/leave-types'],
    queryFn: () => apiRequest('GET', '/api/admin/leave-types')
  });

  const { data: leaveRequests = [] } = useQuery({
    queryKey: ['/api/admin/leave-requests', selectedYear],
    queryFn: () => apiRequest('GET', `/api/admin/leave-requests?fromDate=${selectedYear}-01-01&toDate=${selectedYear}-12-31&limit=2000`)
  });

  const { data: dashboardData } = useQuery({
    queryKey: ['/api/admin/leave-dashboard'],
    queryFn: () => apiRequest('GET', '/api/admin/leave-dashboard')
  });

  const { data: users = [] } = useQuery({
    queryKey: ['/api/admin/users'],
    queryFn: () => apiRequest('GET', '/api/admin/users')
  });

  const { data: holidays = [] } = useQuery({
    queryKey: ['/api/admin/company-holidays', selectedYear],
    queryFn: () => apiRequest('GET', `/api/admin/company-holidays?year=${selectedYear}`)
  });

  const { data: allocationsData, isLoading: allocationsLoading } = useQuery({
    queryKey: ['/api/leave/admin/allocations', allocationsYear],
    queryFn: () => apiRequest('GET', `/api/leave/admin/allocations?year=${allocationsYear}`)
  });

  const { data: allBalancesData, isLoading: balancesLoading } = useQuery({
    queryKey: ['/api/leave/admin/all-balances', balancesYear],
    queryFn: () => apiRequest('GET', `/api/leave/admin/all-balances?year=${balancesYear}`)
  });

  // Mutations
  const leaveRequestMutation = useMutation({
    mutationFn: (data: LeaveRequestForm) => apiRequest('POST', '/api/admin/leave-requests', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leave-dashboard'] });
      setShowNewLeaveDialog(false);
      leaveRequestForm.reset();
      toast({ title: 'Leave request submitted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to submit leave request', variant: 'destructive' });
    }
  });

  const createRequestMutation = useMutation({
    mutationFn: (data: LeaveRequestForm) => apiRequest('POST', '/api/admin/leave-requests', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leave-dashboard'] });
      setShowNewRequestDialog(false);
      toast({ title: 'Leave request submitted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to submit leave request', variant: 'destructive' });
    }
  });

  const createTypeMutation = useMutation({
    mutationFn: (data: LeaveTypeForm) => apiRequest('POST', '/api/admin/leave-types', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leave-types'] });
      setShowNewTypeDialog(false);
      toast({ title: 'Leave type created successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to create leave type', variant: 'destructive' });
    }
  });

  const updateRequestStatusMutation = useMutation({
    mutationFn: ({ id, status, comments, approvalLevel }: any) => 
      apiRequest('PUT', `/api/admin/leave-requests/${id}/status`, { status, comments, approvalLevel }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leave-requests'] });
      toast({ title: 'Request status updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update request status', variant: 'destructive' });
    }
  });

  const createHolidayMutation = useMutation({
    mutationFn: (data: HolidayForm) => apiRequest('POST', '/api/admin/company-holidays', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/company-holidays'] });
      setShowNewHolidayDialog(false);
      holidayForm.reset();
      toast({ title: 'Holiday created successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to create holiday', variant: 'destructive' });
    }
  });

  const updateHolidayMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: HolidayForm }) => 
      apiRequest('PUT', `/api/admin/company-holidays/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/company-holidays'] });
      setShowEditHolidayDialog(false);
      setSelectedHoliday(null);
      editHolidayForm.reset();
      toast({ title: 'Holiday updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update holiday', variant: 'destructive' });
    }
  });

  const deleteHolidayMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/admin/company-holidays/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/company-holidays'] });
      toast({ title: 'Holiday deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete holiday', variant: 'destructive' });
    }
  });

  const updateAllocationMutation = useMutation({
    mutationFn: (data: { userId: number; leaveTypeId: number; year: number; allocatedDays: number }) => 
      apiRequest('POST', '/api/leave/admin/allocations', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leave/admin/allocations'], exact: false });
      toast({ title: 'Leave allocation updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update leave allocation', variant: 'destructive' });
    }
  });

  const updateWeeklyOffMutation = useMutation({
    mutationFn: ({ userId, weeklyOffDays }: { userId: number; weeklyOffDays: number[] }) => 
      apiRequest('PATCH', `/api/leave/admin/users/${userId}/weekly-off`, { weeklyOffDays }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leave/admin/allocations'], exact: false });
      setShowEditWeeklyOffDialog(false);
      setSelectedUserForWeeklyOff(null);
      toast({ title: 'Weekly off days updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update weekly off days', variant: 'destructive' });
    }
  });

  const bulkAllocationMutation = useMutation({
    mutationFn: (data: { year: number; allocations: { leaveTypeId: number; days: number }[]; overwriteExisting: boolean }) => 
      apiRequest('POST', '/api/leave/admin/allocations/bulk', data),
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/leave/admin/allocations'], exact: false });
      setShowQuickAllocDialog(false);
      setQuickAllocValues({});
      setOverwriteExisting(false);
      toast({ 
        title: 'Bulk allocation complete',
        description: `Created: ${response.created || 0}, Updated: ${response.updated || 0}, Skipped: ${response.skipped || 0}`
      });
    },
    onError: () => {
      toast({ title: 'Failed to bulk allocate leave', variant: 'destructive' });
    }
  });

  // Generate PDF for Company Holidays
  const generateHolidaysPdf = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('THERMOPAC', 105, 20, { align: 'center' });
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text(`Company Holidays - ${selectedYear}`, 105, 30, { align: 'center' });
    
    doc.setFontSize(10);
    doc.text(`Generated on: ${fmtDate(new Date())}`, 105, 38, { align: 'center' });
    
    // Sort holidays by date
    const sortedHolidays = [...holidays].sort((a: any, b: any) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    // Table data
    const tableData = sortedHolidays.map((holiday: any, index: number) => {
      return [
        (index + 1).toString(),
        holiday.name,
        fmtDate(holiday.date),
        holiday.isOptional ? 'Optional' : 'Mandatory',
        holiday.description || '-'
      ];
    });
    
    // Generate table
    autoTable(doc, {
      startY: 45,
      head: [['#', 'Holiday Name', 'Date', 'Type', 'Description']],
      body: tableData,
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 40 },
        2: { cellWidth: 50 },
        3: { halign: 'center', cellWidth: 25 },
        4: { cellWidth: 55 }
      },
      alternateRowStyles: {
        fillColor: [245, 247, 250]
      },
      margin: { left: 14, right: 14 }
    });
    
    // Footer with total count
    const finalY = (doc as any).lastAutoTable?.finalY || 100;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Holidays: ${holidays.length}`, 14, finalY + 10);
    
    const mandatoryCount = holidays.filter((h: any) => !h.isOptional).length;
    const optionalCount = holidays.filter((h: any) => h.isOptional).length;
    doc.setFont('helvetica', 'normal');
    doc.text(`Mandatory: ${mandatoryCount} | Optional: ${optionalCount}`, 14, finalY + 16);
    
    // Save
    doc.save(`Company_Holidays_${selectedYear}.pdf`);
    
    toast({
      title: 'PDF Generated',
      description: `Company Holidays list for ${selectedYear} has been downloaded.`
    });
  };

  // Forms
  const requestForm = useForm<LeaveRequestForm>({
    resolver: zodResolver(leaveRequestSchema),
    defaultValues: {
      isHalfDay: false,
      halfDayPeriod: 'morning'
    }
  });

  const leaveRequestForm = useForm<LeaveRequestForm>({
    resolver: zodResolver(leaveRequestSchema),
    defaultValues: {
      isHalfDay: false,
      halfDayPeriod: 'morning'
    }
  });

  const typeForm = useForm<LeaveTypeForm>({
    resolver: zodResolver(leaveTypeSchema),
    defaultValues: {
      carryoverAllowed: false,
      isPaid: true,
      requiresApproval: true,
      canBeHalfDay: true,
      sandwichApplicable: false,
      noticeDaysRequired: 1,
      colorCode: '#3B82F6'
    }
  });

  const holidayForm = useForm<HolidayForm>({
    resolver: zodResolver(holidaySchema),
    defaultValues: {
      isOptional: false
    }
  });

  const editHolidayForm = useForm<HolidayForm>({
    resolver: zodResolver(holidaySchema),
    defaultValues: {
      isOptional: false
    }
  });

  // Filtered data
  const filteredRequests = useMemo(() => {
    return leaveRequests.filter((request: any) => {
      if (filterStatus !== 'all' && request.status !== filterStatus) return false;
      if (filterEmployee !== 'all' && request.employeeId.toString() !== filterEmployee) return false;
      return true;
    });
  }, [leaveRequests, filterStatus, filterEmployee]);

  // Status badge variant
  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'approved': return 'default';
      case 'pending': return 'secondary';
      case 'rejected': return 'destructive';
      default: return 'outline';
    }
  };

  // Calculate days between dates
  const calculateDays = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  // Form submission handlers
  const onSubmitLeaveRequest = (data: LeaveRequestForm) => {
    leaveRequestMutation.mutate(data);
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight pl-4">Leave Management</h1>
            <p className="text-muted-foreground mt-2">
              Manage employee leave requests, balances, and policies
            </p>
          </div>
          <div className="flex space-x-2">
            <Dialog open={showNewRequestDialog} onOpenChange={setShowNewRequestDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  New Leave Request
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Submit Leave Request</DialogTitle>
                  <DialogDescription>
                    Fill out the form below to submit a new leave request
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={requestForm.handleSubmit((data) => createRequestMutation.mutate(data))} className="space-y-4">
                  <div>
                    <Label htmlFor="leaveTypeId">Leave Type</Label>
                    <Select
                      value={requestForm.watch('leaveTypeId')?.toString()}
                      onValueChange={(value) => requestForm.setValue('leaveTypeId', parseInt(value))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select leave type" />
                      </SelectTrigger>
                      <SelectContent>
                        {leaveTypes.map((type: any) => (
                          <SelectItem key={type.id} value={type.id.toString()}>
                            <div className="flex items-center space-x-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: type.colorCode }}
                              />
                              <span>{type.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="startDate">Start Date</Label>
                      <Input
                        id="startDate"
                        type="date"
                        {...requestForm.register('startDate')}
                      />
                    </div>
                    <div>
                      <Label htmlFor="endDate">End Date</Label>
                      <Input
                        id="endDate"
                        type="date"
                        {...requestForm.register('endDate')}
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isHalfDay"
                      checked={requestForm.watch('isHalfDay')}
                      onCheckedChange={(checked) => requestForm.setValue('isHalfDay', !!checked)}
                    />
                    <Label htmlFor="isHalfDay">Half Day Leave</Label>
                  </div>

                  {requestForm.watch('isHalfDay') && (
                    <div>
                      <Label>Half Day Period</Label>
                      <Select
                        value={requestForm.watch('halfDayPeriod')}
                        onValueChange={(value: 'morning' | 'afternoon') => requestForm.setValue('halfDayPeriod', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="morning">Morning</SelectItem>
                          <SelectItem value="afternoon">Afternoon</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="reason">Reason</Label>
                    <Textarea
                      id="reason"
                      placeholder="Please provide reason for leave"
                      {...requestForm.register('reason')}
                    />
                  </div>

                  <div>
                    <Label htmlFor="emergencyContact">Emergency Contact (Optional)</Label>
                    <Input
                      id="emergencyContact"
                      placeholder="Contact details during leave"
                      {...requestForm.register('emergencyContact')}
                    />
                  </div>

                  <div>
                    <Label htmlFor="workHandoverNotes">Work Handover Notes (Optional)</Label>
                    <Textarea
                      id="workHandoverNotes"
                      placeholder="Details about work handover arrangements"
                      {...requestForm.register('workHandoverNotes')}
                    />
                  </div>

                  <div className="flex justify-end space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowNewRequestDialog(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createRequestMutation.isPending}>
                      {createRequestMutation.isPending ? 'Submitting...' : 'Submit Request'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>

            <Button variant="outline" onClick={() => setShowNewTypeDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Leave Type
            </Button>
          </div>
        </div>

        {/* Statistics Cards */}
        {dashboardData && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboardData.pendingRequestsCount || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Awaiting approval
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Leave Types</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{leaveTypes.length}</div>
                <p className="text-xs text-muted-foreground">
                  Active leave types
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Holidays</CardTitle>
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{holidays.length}</div>
                <p className="text-xs text-muted-foreground">
                  Company holidays {selectedYear}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{leaveRequests.length}</div>
                <p className="text-xs text-muted-foreground">
                  All time requests
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="requests">Leave Requests</TabsTrigger>
            <TabsTrigger value="allocations">Allocations</TabsTrigger>
            <TabsTrigger value="balances">Leave Balances</TabsTrigger>
            <TabsTrigger value="types">Leave Types</TabsTrigger>
            <TabsTrigger value="holidays">Company Holidays</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Recent Requests */}
            {dashboardData?.recentRequests && (
              <Card>
                <CardHeader>
                  <CardTitle>Recent Leave Requests</CardTitle>
                  <CardDescription>
                    Latest leave requests across the organization
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {dashboardData.recentRequests.slice(0, 5).map((request: any) => (
                      <div key={request.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="space-y-1">
                          <p className="font-medium">{request.employeeName}</p>
                          <p className="text-sm text-muted-foreground">
                            {request.leaveType} • {request.startDate} to {request.endDate} • {request.totalDays} days
                          </p>
                        </div>
                        <Badge variant={getStatusVariant(request.status)}>
                          {request.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Leave Requests Tab */}
          <TabsContent value="requests" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Filters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Status</Label>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Employee</Label>
                    <Select value={filterEmployee} onValueChange={setFilterEmployee}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Employees</SelectItem>
                        {React.useMemo(() => {
                          const roleOrder = ['Superuser', 'General Manager', 'Senior Manager', 'Senior Executive', 'Manager', 'Employee'];
                          const groups: Record<string, any[]> = {};
                          
                          users?.forEach((user: any) => {
                            const role = user.role || 'Employee';
                            if (!groups[role]) {
                              groups[role] = [];
                            }
                            groups[role].push(user);
                          });
                          
                          // Sort alphabetically within each group
                          Object.values(groups).forEach(group => {
                            group.sort((a, b) => {
                              const nameA = a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.username;
                              const nameB = b.firstName && b.lastName ? `${b.firstName} ${b.lastName}` : b.username;
                              return nameA.localeCompare(nameB);
                            });
                          });
                          
                          // Roles in defined order first, then any remaining unlisted roles
                          const orderedRoles = [
                            ...roleOrder.filter(role => groups[role]),
                            ...Object.keys(groups).filter(role => !roleOrder.includes(role)).sort(),
                          ];
                          
                          return orderedRoles.map(role => (
                            <SelectGroup key={role}>
                              <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">{role}</SelectLabel>
                              {groups[role].map((user: any) => (
                                <SelectItem key={user.id} value={user.id.toString()}>
                                  {user.firstName && user.lastName 
                                    ? `${user.firstName} ${user.lastName}${user.department ? ` • ${user.department}` : ''}`
                                    : user.username
                                  }
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ));
                        }, [users])}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Year</Label>
                    <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2023">2023</SelectItem>
                        <SelectItem value="2024">2024</SelectItem>
                        <SelectItem value="2025">2025</SelectItem>
                        <SelectItem value="2026">2026</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Requests Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Leave Requests</CardTitle>
                  <CardDescription>
                    {filteredRequests.length} requests found
                  </CardDescription>
                </div>
                <Dialog open={showNewLeaveDialog} onOpenChange={setShowNewLeaveDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      New Leave Request
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Create New Leave Request</DialogTitle>
                      <DialogDescription>
                        Submit a new leave request. Note the different requirements for each leave type.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4">
                      {/* Leave Type Selection with Guidelines */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="p-3 border rounded-lg bg-orange-50 border-orange-200">
                          <div className="flex items-center space-x-2 mb-2">
                            <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                            <span className="font-medium text-orange-700">Casual Leave</span>
                          </div>
                          <div className="text-xs text-orange-600 space-y-1">
                            <p>• 1-day advance notice required</p>
                            <p>• Manager approval needed</p>
                            <p>• Max 8 days per year</p>
                          </div>
                        </div>
                        
                        <div className="p-3 border rounded-lg bg-red-50 border-red-200">
                          <div className="flex items-center space-x-2 mb-2">
                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                            <span className="font-medium text-red-700">Sick Leave</span>
                          </div>
                          <div className="text-xs text-red-600 space-y-1">
                            <p>• No advance notice required</p>
                            <p>• No approval needed</p>
                            <p>• Max 12 days per year</p>
                          </div>
                        </div>
                        
                        <div className="p-3 border rounded-lg bg-green-50 border-green-200">
                          <div className="flex items-center space-x-2 mb-2">
                            <div className="w-3 h-3 rounded-full bg-green-500"></div>
                            <span className="font-medium text-green-700">Annual Leave</span>
                          </div>
                          <div className="text-xs text-green-600 space-y-1">
                            <p>• 3-day advance notice required</p>
                            <p>• Manager approval needed</p>
                            <p>• Max 21 days per year</p>
                          </div>
                        </div>
                      </div>

                      <form onSubmit={leaveRequestForm.handleSubmit(onSubmitLeaveRequest)} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Employee</Label>
                            <Select
                              value={leaveRequestForm.watch('employeeId')?.toString() || ''}
                              onValueChange={(value) => leaveRequestForm.setValue('employeeId', parseInt(value))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select employee" />
                              </SelectTrigger>
                              <SelectContent>
                                {React.useMemo(() => {
                                  const roleOrder = ['Superuser', 'General Manager', 'Senior Manager', 'Senior Executive', 'Manager', 'Employee'];
                                  const groups: Record<string, any[]> = {};
                                  
                                  users?.forEach((user: any) => {
                                    const role = user.role || 'Employee';
                                    if (!groups[role]) {
                                      groups[role] = [];
                                    }
                                    groups[role].push(user);
                                  });
                                  
                                  // Sort alphabetically within each group
                                  Object.values(groups).forEach(group => {
                                    group.sort((a, b) => {
                                      const nameA = a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.username;
                                      const nameB = b.firstName && b.lastName ? `${b.firstName} ${b.lastName}` : b.username;
                                      return nameA.localeCompare(nameB);
                                    });
                                  });
                                  
                                  const orderedRoles = [
                                    ...roleOrder.filter(role => groups[role]),
                                    ...Object.keys(groups).filter(role => !roleOrder.includes(role)).sort(),
                                  ];
                                  
                                  return orderedRoles.map(role => (
                                    <SelectGroup key={role}>
                                      <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">{role}</SelectLabel>
                                      {groups[role].map((user: any) => (
                                        <SelectItem key={user.id} value={user.id.toString()}>
                                          {user.firstName && user.lastName 
                                            ? `${user.firstName} ${user.lastName}${user.department ? ` • ${user.department}` : ''}`
                                            : user.username
                                          }
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  ));
                                }, [users])}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label>Leave Type</Label>
                            <Select
                              value={leaveRequestForm.watch('leaveTypeId')?.toString() || ''}
                              onValueChange={(value) => leaveRequestForm.setValue('leaveTypeId', parseInt(value))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select leave type" />
                              </SelectTrigger>
                              <SelectContent>
                                {leaveTypes.map((type: any) => (
                                  <SelectItem key={type.id} value={type.id.toString()}>
                                    <div className="flex items-center space-x-2">
                                      <div 
                                        className="w-3 h-3 rounded-full" 
                                        style={{ backgroundColor: type.colorCode }}
                                      />
                                      <span>{type.name} ({type.code})</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label>Start Date</Label>
                            <Input
                              type="date"
                              {...leaveRequestForm.register('startDate')}
                            />
                          </div>

                          <div>
                            <Label>End Date</Label>
                            <Input
                              type="date"
                              {...leaveRequestForm.register('endDate')}
                            />
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="isHalfDay"
                            checked={leaveRequestForm.watch('isHalfDay')}
                            onCheckedChange={(checked) => leaveRequestForm.setValue('isHalfDay', !!checked)}
                          />
                          <Label htmlFor="isHalfDay">Half day leave</Label>
                        </div>

                        {leaveRequestForm.watch('isHalfDay') && (
                          <div>
                            <Label>Half Day Period</Label>
                            <Select
                              value={leaveRequestForm.watch('halfDayPeriod') || ''}
                              onValueChange={(value) => leaveRequestForm.setValue('halfDayPeriod', value as 'morning' | 'afternoon')}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select period" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="morning">Morning (9 AM - 1 PM)</SelectItem>
                                <SelectItem value="afternoon">Afternoon (2 PM - 6 PM)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        <div>
                          <Label>Reason for Leave</Label>
                          <Textarea
                            placeholder="Please provide detailed reason for your leave..."
                            {...leaveRequestForm.register('reason')}
                          />
                        </div>

                        <div>
                          <Label>Emergency Contact (Optional)</Label>
                          <Input
                            placeholder="Phone number to reach you during leave"
                            {...leaveRequestForm.register('emergencyContact')}
                          />
                        </div>

                        <div>
                          <Label>Work Handover Notes (Optional)</Label>
                          <Textarea
                            placeholder="Any work handover instructions or pending tasks..."
                            {...leaveRequestForm.register('workHandoverNotes')}
                          />
                        </div>

                        <div className="flex justify-end space-x-2">
                          <Button type="button" variant="outline" onClick={() => setShowNewLeaveDialog(false)}>
                            Cancel
                          </Button>
                          <Button type="submit" disabled={leaveRequestMutation.isPending}>
                            {leaveRequestMutation.isPending ? 'Creating...' : 'Submit Request'}
                          </Button>
                        </div>
                      </form>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Leave Type</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Applied Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequests.map((request: any) => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">
                          {request.employeeName}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: request.leaveTypeColor }}
                            />
                            <span>{request.leaveTypeName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {request.startDate} to {request.endDate}
                          {request.isHalfDay && (
                            <Badge variant="outline" className="ml-2">
                              Half Day ({request.halfDayPeriod})
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{request.totalDays}</TableCell>
                        <TableCell>{fmtDate(request.appliedDate)}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(request.status)}>
                            {request.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedRequest(request)}
                            >
                              <Eye className="w-3 h-3" />
                            </Button>
                            {request.status === 'pending' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-green-600 hover:text-green-700"
                                  onClick={() => updateRequestStatusMutation.mutate({
                                    id: request.id,
                                    status: 'approved',
                                    comments: 'Approved',
                                    approvalLevel: 2
                                  })}
                                >
                                  <CheckCircle className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => updateRequestStatusMutation.mutate({
                                    id: request.id,
                                    status: 'rejected',
                                    comments: 'Rejected',
                                    approvalLevel: 2
                                  })}
                                >
                                  <XCircle className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Leave Allocations Tab */}
          <TabsContent value="allocations" className="space-y-4">
            {/* Year Selector and Quick Allocations Button */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Label className="font-medium">Year:</Label>
                <Select value={allocationsYear.toString()} onValueChange={(value) => setAllocationsYear(parseInt(value))}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 13 }, (_, i) => 2023 + i).map(year => (
                      <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button 
                onClick={() => {
                  setQuickAllocYear(allocationsYear);
                  const defaultValues: Record<number, number> = {};
                  leaveTypes.forEach((lt: any) => {
                    // Annual Leave (id=1) defaults to 16, all others default to 0
                    defaultValues[lt.id] = lt.id === 1 ? 16 : 0;
                  });
                  setQuickAllocValues(defaultValues);
                  // Auto-check overwrite if records already exist for this year
                  const hasExistingRecords = allocationsData?.userAllocations?.some((ua: any) => 
                    ua.allocations?.some((a: any) => a.allocatedDays !== null && a.allocatedDays !== undefined)
                  );
                  setOverwriteExisting(!!hasExistingRecords);
                  setShowQuickAllocDialog(true);
                }}
                data-testid="button-quick-allocations"
              >
                <Plus className="w-4 h-4 mr-2" />
                Quick Leave Allocations
              </Button>
            </div>

            {/* Organization Summary Cards */}
            {allocationsData?.orgSummary && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-l-4 border-l-green-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Total Paid Leave Allocated</p>
                        <p className="text-2xl font-bold text-green-600">{allocationsData.orgSummary.totalPaidAllocated}</p>
                        <p className="text-xs text-muted-foreground">Across {allocationsData.orgSummary.totalUsers} employees</p>
                      </div>
                      <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                        <Calendar className="h-6 w-6 text-green-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-l-4 border-l-blue-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Paid Leave Used</p>
                        <p className="text-2xl font-bold text-blue-600">{allocationsData.orgSummary.totalPaidUsed}</p>
                        <p className="text-xs text-muted-foreground">Days consumed</p>
                      </div>
                      <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                        <UserCheck className="h-6 w-6 text-blue-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-l-4 border-l-orange-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Unpaid Leave Allocated</p>
                        <p className="text-2xl font-bold text-orange-600">{allocationsData.orgSummary.totalUnpaidAllocated}</p>
                        <p className="text-xs text-muted-foreground">LOP days available</p>
                      </div>
                      <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
                        <AlertCircle className="h-6 w-6 text-orange-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-l-4 border-l-red-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Unpaid Leave Used</p>
                        <p className="text-2xl font-bold text-red-600">{allocationsData.orgSummary.totalUnpaidUsed}</p>
                        <p className="text-xs text-muted-foreground">LOP days taken</p>
                      </div>
                      <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                        <XCircle className="h-6 w-6 text-red-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* User Allocations Table */}
            <Card>
              <CardHeader>
                <CardTitle>Employee Leave Allocations ({allocationsYear})</CardTitle>
                <CardDescription>
                  View and manage leave allocations for all employees. Paid vs Unpaid breakdown shown.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {allocationsLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[200px]">Employee</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead className="text-center">Weekly Off</TableHead>
                          {allocationsData?.leaveTypes?.map((lt: any) => (
                            <TableHead key={lt.id} className="text-center">
                              <div className="flex items-center justify-center space-x-1">
                                <div 
                                  className="w-2 h-2 rounded-full" 
                                  style={{ backgroundColor: lt.colorCode }}
                                />
                                <span>{lt.code}</span>
                                {lt.isPaid ? (
                                  <Badge variant="outline" className="text-xs px-1 text-green-600 border-green-200">P</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs px-1 text-red-600 border-red-200">U</Badge>
                                )}
                              </div>
                            </TableHead>
                          ))}
                          <TableHead className="text-center text-green-600">Total Paid</TableHead>
                          <TableHead className="text-center text-red-600">Total Unpaid</TableHead>
                          <TableHead className="text-center">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allocationsData?.users?.map((user: any) => {
                          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                          const offDays = (user.weeklyOffDays || [0, 6]).map((d: number) => dayNames[d]).join(', ');
                          
                          return (
                            <TableRow key={user.userId}>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                    <User className="h-4 w-4 text-primary" />
                                  </div>
                                  <div>
                                    <p className="font-medium">{user.fullName}</p>
                                    <p className="text-xs text-muted-foreground">{user.employeeCode || `ID: ${user.userId}`}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{user.department || 'N/A'}</Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary" className="text-xs">{offDays}</Badge>
                              </TableCell>
                              {user.allocations?.map((alloc: any) => (
                                <TableCell key={alloc.leaveTypeId} className="text-center">
                                  <div className="space-y-1">
                                    <div className="font-medium">{alloc.allocated}</div>
                                    <div className="text-xs text-muted-foreground">
                                      Used: {alloc.used}
                                    </div>
                                    <Progress 
                                      value={alloc.allocated > 0 ? (alloc.used / alloc.allocated) * 100 : 0} 
                                      className="h-1"
                                    />
                                  </div>
                                </TableCell>
                              ))}
                              <TableCell className="text-center">
                                <div className="space-y-1">
                                  <div className="font-bold text-green-600">{user.summary.totalPaidAllocated}</div>
                                  <div className="text-xs text-muted-foreground">
                                    Avail: {user.summary.totalPaidAvailable}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="space-y-1">
                                  <div className="font-bold text-red-600">{user.summary.totalUnpaidAllocated}</div>
                                  <div className="text-xs text-muted-foreground">
                                    Used: {user.summary.totalUnpaidUsed}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center space-x-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSelectedUserForAlloc(user);
                                      setShowEditUserAllocDialog(true);
                                    }}
                                    data-testid={`button-edit-alloc-${user.userId}`}
                                  >
                                    <Edit className="h-3 w-3 mr-1" />
                                    Leaves
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSelectedUserForWeeklyOff(user);
                                      setWeeklyOffSelection(user.weeklyOffDays || [0, 6]);
                                      setShowEditWeeklyOffDialog(true);
                                    }}
                                    data-testid={`button-edit-weekly-${user.userId}`}
                                  >
                                    <CalendarDays className="h-3 w-3 mr-1" />
                                    Weekly Off
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Legend */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-6 text-sm">
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="text-green-600 border-green-200">P</Badge>
                    <span>Paid Leave</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="text-red-600 border-red-200">U</Badge>
                    <span>Unpaid Leave (LOP)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-muted-foreground">Weekly Off: Days employee is not working (affects payroll calculation)</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Leave Balances Tab */}
          <TabsContent value="balances" className="space-y-4">
            {/* Year Selector, Employee Filter, and Search */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <Select value={balancesYear.toString()} onValueChange={(v) => setBalancesYear(parseInt(v))}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026, 2027].map(y => (
                      <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={balancesEmployee} onValueChange={setBalancesEmployee}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="All Employees" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees</SelectItem>
                    {(allBalancesData?.employees || []).map((emp: any) => (
                      <SelectItem key={emp.userId} value={emp.userId.toString()}>
                        {emp.name} {emp.employeeCode ? `(${emp.employeeCode})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">
                  {allBalancesData?.employees?.length || 0} employees
                </span>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or employee code..."
                  value={balancesSearch}
                  onChange={(e) => setBalancesSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Leave Type Summary Cards from DB */}
            {allBalancesData?.leaveTypes && (
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {allBalancesData.leaveTypes.filter((lt: any) => lt.isPaid !== false).slice(0, 4).map((lt: any) => {
                  const colorMap: Record<string, string> = {
                    CL: 'orange', SL: 'red', AL: 'green', EL: 'blue', ML: 'purple', PL: 'indigo', BL: 'pink'
                  };
                  const c = colorMap[lt.code] || 'blue';
                  return (
                    <Card key={lt.id} className={`border-l-4 border-l-${c}-500`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">{lt.name} ({lt.code})</p>
                            <p className="text-2xl font-bold">{parseFloat(lt.maxDaysPerYear || '0')} days</p>
                            <p className="text-xs text-muted-foreground">Per employee annually</p>
                          </div>
                          <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${lt.colorCode}20` }}>
                            <Calendar className="h-5 w-5" style={{ color: lt.colorCode }} />
                          </div>
                        </div>
                        <div className="mt-3 text-xs space-y-1">
                          <div className="flex justify-between">
                            <span>Approval Required:</span>
                            <span className="font-medium">{lt.requiresApproval ? 'Yes' : 'No'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Notice Period:</span>
                            <span className="font-medium">{lt.noticeDaysRequired > 0 ? `${lt.noticeDaysRequired} day${lt.noticeDaysRequired > 1 ? 's' : ''}` : 'None'}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Employee Leave Balances Table */}
            <Card>
              <CardHeader>
                <CardTitle>Employee Leave Balances ({balancesYear})</CardTitle>
                <CardDescription>
                  Current leave balances for all employees from database records
                </CardDescription>
              </CardHeader>
              <CardContent>
                {balancesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    <span className="ml-3 text-muted-foreground">Loading leave balances...</span>
                  </div>
                ) : !allBalancesData?.employees?.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No leave balance records found for {balancesYear}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {allBalancesData.employees
                      .filter((emp: any) => {
                        if (balancesEmployee !== 'all' && emp.userId.toString() !== balancesEmployee) return false;
                        if (!balancesSearch) return true;
                        const s = balancesSearch.toLowerCase();
                        return emp.name.toLowerCase().includes(s) || (emp.employeeCode || '').toLowerCase().includes(s);
                      })
                      .map((emp: any) => {
                        const paidBalances = emp.balances.filter((b: any) => b.isPaid !== false && (b.allocated > 0 || b.used > 0 || b.carryover > 0));
                        if (paidBalances.length === 0) return null;
                        
                        const colorMap: Record<string, { text: string; border: string; bg: string }> = {
                          CL: { text: 'text-orange-600', border: 'border-orange-200', bg: 'bg-orange-50' },
                          SL: { text: 'text-red-600', border: 'border-red-200', bg: 'bg-red-50' },
                          AL: { text: 'text-green-600', border: 'border-green-200', bg: 'bg-green-50' },
                          EL: { text: 'text-blue-600', border: 'border-blue-200', bg: 'bg-blue-50' },
                          ML: { text: 'text-purple-600', border: 'border-purple-200', bg: 'bg-purple-50' },
                          PL: { text: 'text-indigo-600', border: 'border-indigo-200', bg: 'bg-indigo-50' },
                          BL: { text: 'text-pink-600', border: 'border-pink-200', bg: 'bg-pink-50' },
                        };

                        return (
                          <Card key={emp.userId} className="p-4">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <User className="h-5 w-5 text-primary" />
                                  </div>
                                  <div>
                                    <h4 className="font-medium">{emp.name}</h4>
                                    <p className="text-sm text-muted-foreground">{emp.department || emp.role || 'Employee'}</p>
                                  </div>
                                </div>
                                <Badge variant="outline">{emp.employeeCode || `TPE-${emp.userId}`}</Badge>
                              </div>
                              
                              <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${Math.min(paidBalances.length, 4)}, minmax(0, 1fr))` }}>
                                {paidBalances.map((bal: any) => {
                                  const colors = colorMap[bal.leaveTypeCode] || { text: 'text-blue-600', border: 'border-blue-200', bg: 'bg-blue-50' };
                                  return (
                                    <div key={bal.leaveTypeId} className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className={`text-sm font-medium ${colors.text}`}>{bal.leaveTypeName}</span>
                                        <Badge variant="outline" className={`${colors.text} ${colors.border}`}>{bal.leaveTypeCode}</Badge>
                                      </div>
                                      <div className="text-xs space-y-1">
                                        <div className="flex justify-between">
                                          <span>Allocated:</span>
                                          <span className="font-medium">{bal.allocated.toFixed(1)} days</span>
                                        </div>
                                        {bal.carryover > 0 && (
                                          <div className="flex justify-between">
                                            <span>Carryover:</span>
                                            <span className="font-medium">{bal.carryover.toFixed(1)} days</span>
                                          </div>
                                        )}
                                        <div className="flex justify-between">
                                          <span>Used:</span>
                                          <span className="font-medium">{bal.used.toFixed(1)} days</span>
                                        </div>
                                        {bal.pending > 0 && (
                                          <div className="flex justify-between">
                                            <span>Pending:</span>
                                            <span className="font-medium text-amber-600">{bal.pending.toFixed(1)} days</span>
                                          </div>
                                        )}
                                        <div className="flex justify-between border-t pt-1">
                                          <span className="font-medium">Remaining:</span>
                                          <span className={`font-medium ${colors.text}`}>{bal.remaining.toFixed(1)} days</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </Card>
                        );
                      }).filter(Boolean)}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Leave Types Tab */}
          <TabsContent value="types" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Leave Types</CardTitle>
                <CardDescription>
                  Configure different types of leave available to employees
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {leaveTypes.map((type: any) => (
                    <Card key={type.id} className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div 
                              className="w-4 h-4 rounded-full" 
                              style={{ backgroundColor: type.colorCode }}
                            />
                            <h4 className="font-medium">{type.name}</h4>
                          </div>
                          <Badge variant="outline">{type.code}</Badge>
                        </div>
                        
                        <p className="text-sm text-muted-foreground">
                          {type.description || 'No description provided'}
                        </p>
                        
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span>Max Days/Year:</span>
                            <span>{type.maxDaysPerYear}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Carryover:</span>
                            <span>{type.carryoverAllowed ? `${type.maxCarryoverDays} days` : 'No'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Paid:</span>
                            <span>{type.isPaid ? 'Yes' : 'No'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Approval Required:</span>
                            <span>{type.requiresApproval ? 'Yes' : 'No'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Half Day Allowed:</span>
                            <span>{type.canBeHalfDay ? 'Yes' : 'No'}</span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Company Holidays Tab */}
          <TabsContent value="holidays" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <CardTitle>Company Holidays ({selectedYear})</CardTitle>
                    <CardDescription>
                      Manage company-wide holidays and observances
                    </CardDescription>
                  </div>
                  <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
                    <SelectTrigger className="w-32" data-testid="select-holiday-year">
                      <SelectValue placeholder="Select Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {[...Array(5)].map((_, i) => {
                        const year = new Date().getFullYear() - 1 + i;
                        return (
                          <SelectItem key={year} value={year.toString()} data-testid={`select-year-${year}`}>
                            {year}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={generateHolidaysPdf}
                    disabled={holidays.length === 0}
                    data-testid="button-download-holidays-pdf"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download PDF
                  </Button>
                  <Button onClick={() => setShowNewHolidayDialog(true)} data-testid="button-add-holiday">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Holiday
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {holidays.map((holiday: any) => (
                    <Card key={holiday.id} className="p-4">
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <h4 className="font-medium">{holiday.name}</h4>
                          <div className="flex items-center space-x-1">
                            {holiday.isOptional && (
                              <Badge variant="secondary" className="text-xs">Optional</Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedHoliday(holiday);
                                editHolidayForm.reset({
                                  name: holiday.name,
                                  date: holiday.date.split('T')[0],
                                  description: holiday.description || '',
                                  isOptional: holiday.isOptional
                                });
                                setShowEditHolidayDialog(true);
                              }}
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm('Are you sure you want to delete this holiday?')) {
                                  deleteHolidayMutation.mutate(holiday.id);
                                }
                              }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {fmtDate(holiday.date)}
                        </p>
                        {holiday.description && (
                          <p className="text-xs text-muted-foreground">
                            {holiday.description}
                          </p>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* New Leave Type Dialog */}
        <Dialog open={showNewTypeDialog} onOpenChange={setShowNewTypeDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Leave Type</DialogTitle>
              <DialogDescription>
                Create a new leave type for your organization
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={typeForm.handleSubmit((data) => createTypeMutation.mutate(data))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="Annual Leave"
                    {...typeForm.register('name')}
                  />
                </div>
                <div>
                  <Label htmlFor="code">Code</Label>
                  <Input
                    id="code"
                    placeholder="AL"
                    {...typeForm.register('code')}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Description of this leave type"
                  {...typeForm.register('description')}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="maxDaysPerYear">Max Days/Year</Label>
                  <Input
                    id="maxDaysPerYear"
                    type="number"
                    placeholder="21"
                    {...typeForm.register('maxDaysPerYear')}
                  />
                </div>
                <div>
                  <Label htmlFor="colorCode">Color</Label>
                  <Input
                    id="colorCode"
                    type="color"
                    {...typeForm.register('colorCode')}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="isPaid"
                    checked={typeForm.watch('isPaid')}
                    onCheckedChange={(checked) => typeForm.setValue('isPaid', !!checked)}
                  />
                  <Label htmlFor="isPaid">Paid Leave</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="requiresApproval"
                    checked={typeForm.watch('requiresApproval')}
                    onCheckedChange={(checked) => typeForm.setValue('requiresApproval', !!checked)}
                  />
                  <Label htmlFor="requiresApproval">Requires Approval</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="canBeHalfDay"
                    checked={typeForm.watch('canBeHalfDay')}
                    onCheckedChange={(checked) => typeForm.setValue('canBeHalfDay', !!checked)}
                  />
                  <Label htmlFor="canBeHalfDay">Can be Half Day</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sandwichApplicable"
                    checked={typeForm.watch('sandwichApplicable')}
                    onCheckedChange={(checked) => typeForm.setValue('sandwichApplicable', !!checked)}
                  />
                  <Label htmlFor="sandwichApplicable">
                    Sandwich Rule
                    <span className="ml-1 text-xs text-muted-foreground">(weekends/holidays inside leave range count as leave days)</span>
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="carryoverAllowed"
                    checked={typeForm.watch('carryoverAllowed')}
                    onCheckedChange={(checked) => typeForm.setValue('carryoverAllowed', !!checked)}
                  />
                  <Label htmlFor="carryoverAllowed">Allow Carryover</Label>
                </div>
              </div>

              {typeForm.watch('carryoverAllowed') && (
                <div>
                  <Label htmlFor="maxCarryoverDays">Max Carryover Days</Label>
                  <Input
                    id="maxCarryoverDays"
                    type="number"
                    placeholder="5"
                    {...typeForm.register('maxCarryoverDays')}
                  />
                </div>
              )}

              <div>
                <Label htmlFor="noticeDaysRequired">Notice Days Required</Label>
                <Input
                  id="noticeDaysRequired"
                  type="number"
                  placeholder="1"
                  {...typeForm.register('noticeDaysRequired', { valueAsNumber: true })}
                />
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowNewTypeDialog(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createTypeMutation.isPending}>
                  {createTypeMutation.isPending ? 'Creating...' : 'Create Leave Type'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Request Details Dialog */}
        {selectedRequest && (
          <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Leave Request Details</DialogTitle>
                <DialogDescription>
                  Request by {selectedRequest.employeeName}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Leave Type</Label>
                    <div className="flex items-center space-x-2 mt-1">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: selectedRequest.leaveTypeColor }}
                      />
                      <span className="text-sm">{selectedRequest.leaveTypeName}</span>
                    </div>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <div className="mt-1">
                      <Badge variant={getStatusVariant(selectedRequest.status)}>
                        {selectedRequest.status}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Start Date</Label>
                    <p className="text-sm mt-1">{selectedRequest.startDate}</p>
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <p className="text-sm mt-1">{selectedRequest.endDate}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Total Days</Label>
                    <p className="text-sm mt-1">{selectedRequest.totalDays}</p>
                  </div>
                  <div>
                    <Label>Applied Date</Label>
                    <p className="text-sm mt-1">{fmtDate(selectedRequest.appliedDate)}</p>
                  </div>
                </div>

                {selectedRequest.isHalfDay && (
                  <div>
                    <Label>Half Day Period</Label>
                    <p className="text-sm mt-1 capitalize">{selectedRequest.halfDayPeriod}</p>
                  </div>
                )}

                <div>
                  <Label>Reason</Label>
                  <p className="text-sm mt-1 p-2 bg-muted rounded">{selectedRequest.reason}</p>
                </div>

                {selectedRequest.emergencyContact && (
                  <div>
                    <Label>Emergency Contact</Label>
                    <p className="text-sm mt-1">{selectedRequest.emergencyContact}</p>
                  </div>
                )}

                {selectedRequest.workHandoverNotes && (
                  <div>
                    <Label>Work Handover Notes</Label>
                    <p className="text-sm mt-1 p-2 bg-muted rounded">{selectedRequest.workHandoverNotes}</p>
                  </div>
                )}

                {selectedRequest.status === 'pending' && (
                  <div className="flex space-x-2 pt-4">
                    <Button
                      className="flex-1"
                      onClick={() => {
                        updateRequestStatusMutation.mutate({
                          id: selectedRequest.id,
                          status: 'approved',
                          comments: 'Approved',
                          approvalLevel: 2
                        });
                        setSelectedRequest(null);
                      }}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => {
                        updateRequestStatusMutation.mutate({
                          id: selectedRequest.id,
                          status: 'rejected',
                          comments: 'Rejected',
                          approvalLevel: 2
                        });
                        setSelectedRequest(null);
                      }}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Add New Holiday Dialog */}
        <Dialog open={showNewHolidayDialog} onOpenChange={setShowNewHolidayDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Company Holiday</DialogTitle>
              <DialogDescription>
                Create a new company holiday for {selectedYear}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={holidayForm.handleSubmit((data) => createHolidayMutation.mutate(data))} className="space-y-4">
              <div>
                <Label htmlFor="holidayName">Holiday Name</Label>
                <Input
                  id="holidayName"
                  placeholder="e.g., Independence Day"
                  {...holidayForm.register('name')}
                />
              </div>

              <div>
                <Label htmlFor="holidayDate">Date</Label>
                <Input
                  id="holidayDate"
                  type="date"
                  {...holidayForm.register('date')}
                />
              </div>

              <div>
                <Label htmlFor="holidayDescription">Description (Optional)</Label>
                <Textarea
                  id="holidayDescription"
                  placeholder="Brief description of the holiday"
                  {...holidayForm.register('description')}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isOptional"
                  checked={holidayForm.watch('isOptional')}
                  onCheckedChange={(checked) => holidayForm.setValue('isOptional', !!checked)}
                />
                <Label htmlFor="isOptional">Optional Holiday</Label>
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowNewHolidayDialog(false);
                    holidayForm.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createHolidayMutation.isPending}>
                  {createHolidayMutation.isPending ? 'Creating...' : 'Create Holiday'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Holiday Dialog */}
        <Dialog open={showEditHolidayDialog} onOpenChange={setShowEditHolidayDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Holiday</DialogTitle>
              <DialogDescription>
                Update holiday information
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={editHolidayForm.handleSubmit((data) => {
              if (selectedHoliday) {
                updateHolidayMutation.mutate({ id: selectedHoliday.id, data });
              }
            })} className="space-y-4">
              <div>
                <Label htmlFor="editHolidayName">Holiday Name</Label>
                <Input
                  id="editHolidayName"
                  placeholder="e.g., Independence Day"
                  {...editHolidayForm.register('name')}
                />
              </div>

              <div>
                <Label htmlFor="editHolidayDate">Date</Label>
                <Input
                  id="editHolidayDate"
                  type="date"
                  {...editHolidayForm.register('date')}
                />
              </div>

              <div>
                <Label htmlFor="editHolidayDescription">Description (Optional)</Label>
                <Textarea
                  id="editHolidayDescription"
                  placeholder="Brief description of the holiday"
                  {...editHolidayForm.register('description')}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="editIsOptional"
                  checked={editHolidayForm.watch('isOptional')}
                  onCheckedChange={(checked) => editHolidayForm.setValue('isOptional', !!checked)}
                />
                <Label htmlFor="editIsOptional">Optional Holiday</Label>
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowEditHolidayDialog(false);
                    setSelectedHoliday(null);
                    editHolidayForm.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateHolidayMutation.isPending}>
                  {updateHolidayMutation.isPending ? 'Updating...' : 'Update Holiday'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Leave Allocations Dialog */}
        <Dialog open={showEditUserAllocDialog} onOpenChange={setShowEditUserAllocDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Leave Allocations - {selectedUserForAlloc?.fullName}</DialogTitle>
              <DialogDescription>
                Update leave allocation for {allocationsYear}. Changes take effect immediately.
              </DialogDescription>
            </DialogHeader>
            {selectedUserForAlloc && (
              <div className="space-y-4">
                {selectedUserForAlloc.allocations?.map((alloc: any) => (
                  <div key={alloc.leaveTypeId} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: alloc.colorCode }}
                      />
                      <div>
                        <p className="font-medium">{alloc.leaveTypeName}</p>
                        <p className="text-xs text-muted-foreground">
                          {alloc.isPaid ? 'Paid Leave' : 'Unpaid Leave'} • Used: {alloc.used} days
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Label className="text-sm">Allocated:</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        defaultValue={alloc.allocated}
                        className="w-20"
                        onBlur={(e) => {
                          const newValue = parseFloat(e.target.value) || 0;
                          if (newValue !== alloc.allocated) {
                            updateAllocationMutation.mutate({
                              userId: selectedUserForAlloc.userId,
                              leaveTypeId: alloc.leaveTypeId,
                              year: allocationsYear,
                              allocatedDays: newValue
                            });
                          }
                        }}
                        data-testid={`input-alloc-${alloc.leaveTypeId}`}
                      />
                      <span className="text-sm text-muted-foreground">days</span>
                    </div>
                  </div>
                ))}
                <div className="flex justify-end">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setShowEditUserAllocDialog(false);
                      setSelectedUserForAlloc(null);
                    }}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Weekly Off Days Dialog */}
        <Dialog open={showEditWeeklyOffDialog} onOpenChange={setShowEditWeeklyOffDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Weekly Off Days - {selectedUserForWeeklyOff?.fullName}</DialogTitle>
              <DialogDescription>
                Select which days of the week are off for this employee. This affects payroll calculations.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-7 gap-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                  <div key={day} className="flex flex-col items-center">
                    <Checkbox
                      id={`day-${index}`}
                      checked={weeklyOffSelection.includes(index)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setWeeklyOffSelection([...weeklyOffSelection, index].sort());
                        } else {
                          setWeeklyOffSelection(weeklyOffSelection.filter(d => d !== index));
                        }
                      }}
                      data-testid={`checkbox-day-${index}`}
                    />
                    <Label htmlFor={`day-${index}`} className="text-xs mt-1">{day}</Label>
                  </div>
                ))}
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm">
                  Selected off days: {weeklyOffSelection.length > 0 
                    ? weeklyOffSelection.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')
                    : 'None (works all days)'}
                </p>
              </div>
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowEditWeeklyOffDialog(false);
                    setSelectedUserForWeeklyOff(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (selectedUserForWeeklyOff) {
                      updateWeeklyOffMutation.mutate({
                        userId: selectedUserForWeeklyOff.userId,
                        weeklyOffDays: weeklyOffSelection
                      });
                    }
                  }}
                  disabled={updateWeeklyOffMutation.isPending}
                >
                  {updateWeeklyOffMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Quick Leave Allocations Dialog */}
        <Dialog open={showQuickAllocDialog} onOpenChange={setShowQuickAllocDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Quick Leave Allocations</DialogTitle>
              <DialogDescription>
                Allocate leave for all employees at once. Set default days for each leave type and apply to all active employees.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <Label className="font-medium">Year:</Label>
                <Select value={quickAllocYear.toString()} onValueChange={(value) => setQuickAllocYear(parseInt(value))}>
                  <SelectTrigger className="w-[120px]" data-testid="select-quick-alloc-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 13 }, (_, i) => 2023 + i).map(year => (
                      <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="font-medium">Leave Allocations</Label>
                {leaveTypes.map((lt: any) => (
                  <div key={lt.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: lt.colorCode }}
                      />
                      <div>
                        <p className="font-medium">{lt.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {lt.isPaid ? 'Paid Leave' : 'Unpaid Leave'} • Max: {lt.maxDaysPerYear} days/year
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Label className="text-sm">Days:</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        value={quickAllocValues[lt.id] ?? lt.maxDaysPerYear ?? 0}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setQuickAllocValues(prev => ({ ...prev, [lt.id]: val }));
                        }}
                        className="w-20"
                        data-testid={`input-quick-alloc-${lt.id}`}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg">
                <Checkbox
                  id="overwriteExisting"
                  checked={overwriteExisting}
                  onCheckedChange={(checked) => setOverwriteExisting(!!checked)}
                  data-testid="checkbox-overwrite-existing"
                />
                <Label htmlFor="overwriteExisting" className="text-sm">
                  Overwrite existing allocations (otherwise only creates new ones)
                </Label>
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowQuickAllocDialog(false);
                    setQuickAllocValues({});
                    setOverwriteExisting(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    const allocations = Object.entries(quickAllocValues)
                      .filter(([_, days]) => Number(days) >= 0)
                      .map(([leaveTypeId, days]) => ({
                        leaveTypeId: parseInt(leaveTypeId),
                        days: Number(days)
                      }));
                    
                    if (allocations.length === 0) {
                      toast({ title: 'Please configure leave type allocations', variant: 'destructive' });
                      return;
                    }

                    bulkAllocationMutation.mutate({
                      year: quickAllocYear,
                      allocations,
                      overwriteExisting
                    });
                  }}
                  disabled={bulkAllocationMutation.isPending}
                  data-testid="button-apply-quick-alloc"
                >
                  {bulkAllocationMutation.isPending ? 'Applying...' : 'Apply to All Employees'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}