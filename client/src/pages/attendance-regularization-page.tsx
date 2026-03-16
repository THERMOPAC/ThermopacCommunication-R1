import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Plus, Clock, CheckCircle, XCircle, AlertCircle, MapPin,
  Calendar, FileText, Eye, Trash2, ClipboardCheck, History,
  ExternalLink, User, ArrowLeft, CalendarX, AlertTriangle
} from "lucide-react";
import { format, getMonth, getYear } from "date-fns";
import { useLocation } from "wouter";

const REQUEST_TYPE_LABELS: Record<string, string> = {
  outdoor_duty: 'Outdoor Duty',
  missed_checkin: 'Missed Check-In',
  missed_checkout: 'Missed Check-Out',
  full_day_regularization: 'Full Day Regularization',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={`${STATUS_COLORS[status] || 'bg-gray-100 text-gray-800'} font-medium`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function RequestTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    outdoor_duty: 'bg-blue-100 text-blue-800',
    missed_checkin: 'bg-orange-100 text-orange-800',
    missed_checkout: 'bg-purple-100 text-purple-800',
    full_day_regularization: 'bg-indigo-100 text-indigo-800',
  };
  return (
    <Badge className={`${colors[type] || 'bg-gray-100 text-gray-800'} font-medium`}>
      {REQUEST_TYPE_LABELS[type] || type}
    </Badge>
  );
}

export default function AttendanceRegularizationPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const userRole = (user as any)?.role || '';
  const isAdmin = ['Superuser', 'General Manager', 'Senior Manager'].includes(userRole);
  const isManager = isAdmin || userRole === 'Manager';

  const [activeTab, setActiveTab] = useState('my-requests');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showAuditDialog, setShowAuditDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState('all');

  const [newRequest, setNewRequest] = useState({
    requestDate: '',
    requestType: '',
    correctedCheckIn: '',
    correctedCheckOut: '',
    reason: '',
  });
  const [approveRemarks, setApproveRemarks] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const now = new Date();
  const { data: absentDays = [], isLoading: loadingAbsent } = useQuery<any[]>({
    queryKey: ['/api/attendance/regularization/absent-days', now.getMonth() + 1, now.getFullYear()],
    queryFn: async () => {
      const res = await fetch(`/api/attendance/regularization/absent-days?month=${now.getMonth() + 1}&year=${now.getFullYear()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: showNewDialog,
  });

  const { data: myRequests = [], isLoading: loadingMy } = useQuery<any[]>({
    queryKey: ['/api/attendance/regularization/my-requests', filterStatus],
    queryFn: async () => {
      const res = await fetch(`/api/attendance/regularization/my-requests?status=${filterStatus}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const { data: pendingApprovals = [], isLoading: loadingPending } = useQuery<any[]>({
    queryKey: ['/api/attendance/regularization/pending-approvals'],
    queryFn: async () => {
      const res = await fetch('/api/attendance/regularization/pending-approvals');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: isManager,
  });

  const { data: allRequests = [], isLoading: loadingAll } = useQuery<any[]>({
    queryKey: ['/api/attendance/regularization/all', filterStatus],
    queryFn: async () => {
      const res = await fetch(`/api/attendance/regularization/all?status=${filterStatus}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: isAdmin && activeTab === 'all-requests',
  });

  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/attendance/regularization', data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Request submitted', description: 'Your regularization request has been submitted for approval.' });
      queryClient.invalidateQueries({ queryKey: ['/api/attendance/regularization/my-requests'] });
      setShowNewDialog(false);
      setNewRequest({ requestDate: '', requestType: '', correctedCheckIn: '', correctedCheckOut: '', reason: '' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to submit request', variant: 'destructive' });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, remarks }: { id: number; remarks: string }) => {
      const res = await apiRequest('POST', `/api/attendance/regularization/${id}/approve`, { remarks });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Approved', description: 'Regularization request approved and attendance updated.' });
      queryClient.invalidateQueries({ queryKey: ['/api/attendance/regularization'] });
      setShowApproveDialog(false);
      setApproveRemarks('');
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to approve', variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, rejectionReason }: { id: number; rejectionReason: string }) => {
      const res = await apiRequest('POST', `/api/attendance/regularization/${id}/reject`, { rejectionReason });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Rejected', description: 'Regularization request has been rejected.' });
      queryClient.invalidateQueries({ queryKey: ['/api/attendance/regularization'] });
      setShowRejectDialog(false);
      setRejectReason('');
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to reject', variant: 'destructive' });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/attendance/regularization/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Cancelled', description: 'Your request has been cancelled.' });
      queryClient.invalidateQueries({ queryKey: ['/api/attendance/regularization/my-requests'] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to cancel', variant: 'destructive' });
    },
  });

  const needsCheckIn = !newRequest.requestType || newRequest.requestType === 'missed_checkin' || newRequest.requestType === 'outdoor_duty' || newRequest.requestType === 'full_day_regularization';
  const needsCheckOut = !newRequest.requestType || newRequest.requestType === 'missed_checkout' || newRequest.requestType === 'outdoor_duty' || newRequest.requestType === 'full_day_regularization';

  const pendingCount = pendingApprovals.length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/attendance')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardCheck className="h-6 w-6 text-blue-600" />
              Attendance Regularization
            </h1>
            <p className="text-sm text-muted-foreground">Submit and manage attendance correction requests</p>
          </div>
        </div>
        <Button onClick={() => setShowNewDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Request
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-100"><AlertCircle className="h-5 w-5 text-yellow-600" /></div>
              <div>
                <p className="text-2xl font-bold">{myRequests.filter((r: any) => r.status === 'pending').length}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100"><CheckCircle className="h-5 w-5 text-green-600" /></div>
              <div>
                <p className="text-2xl font-bold">{myRequests.filter((r: any) => r.status === 'approved').length}</p>
                <p className="text-xs text-muted-foreground">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100"><XCircle className="h-5 w-5 text-red-600" /></div>
              <div>
                <p className="text-2xl font-bold">{myRequests.filter((r: any) => r.status === 'rejected').length}</p>
                <p className="text-xs text-muted-foreground">Rejected</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {isManager && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100"><Clock className="h-5 w-5 text-blue-600" /></div>
                <div>
                  <p className="text-2xl font-bold">{pendingCount}</p>
                  <p className="text-xs text-muted-foreground">Awaiting Your Approval</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="my-requests">My Requests</TabsTrigger>
          {isManager && (
            <TabsTrigger value="pending-approvals" className="gap-1">
              Pending Approvals
              {pendingCount > 0 && <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">{pendingCount}</Badge>}
            </TabsTrigger>
          )}
          {isAdmin && <TabsTrigger value="all-requests">All Requests</TabsTrigger>}
        </TabsList>

        <TabsContent value="my-requests" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">My Regularization Requests</CardTitle>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loadingMy ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : myRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ClipboardCheck className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>No regularization requests found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Corrected Times</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Approver</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myRequests.map((req: any) => (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium">
                          {format(new Date(req.requestDate), 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell><RequestTypeBadge type={req.requestType} /></TableCell>
                        <TableCell className="text-sm">
                          {req.correctedCheckIn && <div>In: {format(new Date(req.correctedCheckIn), 'hh:mm a')}</div>}
                          {req.correctedCheckOut && <div>Out: {format(new Date(req.correctedCheckOut), 'hh:mm a')}</div>}
                          {!req.correctedCheckIn && !req.correctedCheckOut && <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">{req.reason}</TableCell>
                        <TableCell><StatusBadge status={req.status} /></TableCell>
                        <TableCell className="text-sm">{req.approverName || '—'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {req.status === 'pending' && (
                              <Button variant="ghost" size="sm" onClick={() => cancelMutation.mutate(req.id)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            )}
                            {req.status === 'rejected' && req.rejectionReason && (
                              <Button variant="ghost" size="sm" onClick={() => { setSelectedRequest(req); setShowAuditDialog(true); }}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isManager && (
          <TabsContent value="pending-approvals" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Pending Approval Requests</CardTitle>
                <CardDescription>Review and approve/reject attendance regularization requests from your team</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingPending ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : pendingApprovals.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p>No pending approvals</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Corrected Times</TableHead>
                        <TableHead>Original Data</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingApprovals.map((req: any) => {
                        const orig = req.originalData as any;
                        return (
                          <TableRow key={req.id}>
                            <TableCell>
                              <div className="font-medium">{req.employeeName}</div>
                              <div className="text-xs text-muted-foreground">{req.employeeCode}</div>
                            </TableCell>
                            <TableCell className="font-medium">
                              {format(new Date(req.requestDate), 'dd MMM yyyy')}
                            </TableCell>
                            <TableCell><RequestTypeBadge type={req.requestType} /></TableCell>
                            <TableCell className="text-sm">
                              {req.correctedCheckIn && <div className="text-green-700">In: {format(new Date(req.correctedCheckIn), 'hh:mm a')}</div>}
                              {req.correctedCheckOut && <div className="text-green-700">Out: {format(new Date(req.correctedCheckOut), 'hh:mm a')}</div>}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {orig?.status === 'no_record' ? (
                                <span className="italic">No record</span>
                              ) : (
                                <>
                                  {orig?.checkInTime && <div>In: {format(new Date(orig.checkInTime), 'hh:mm a')}</div>}
                                  {orig?.checkOutTime && <div>Out: {format(new Date(orig.checkOutTime), 'hh:mm a')}</div>}
                                  {orig?.status && <div>Status: {orig.status}</div>}
                                </>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-sm">{req.reason}</TableCell>
                            <TableCell className="text-sm">{format(new Date(req.createdAt), 'dd MMM, hh:mm a')}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700"
                                  onClick={() => { setSelectedRequest(req); setShowApproveDialog(true); }}
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" /> Approve
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => { setSelectedRequest(req); setShowRejectDialog(true); }}
                                >
                                  <XCircle className="h-4 w-4 mr-1" /> Reject
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="all-requests" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">All Regularization Requests</CardTitle>
                    <CardDescription>Complete audit view of all requests across the organization</CardDescription>
                  </div>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Filter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {loadingAll ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : allRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No requests found</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Applied</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Audit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allRequests.map((req: any) => (
                        <TableRow key={req.id}>
                          <TableCell>
                            <div className="font-medium">{req.employeeName}</div>
                            <div className="text-xs text-muted-foreground">{req.employeeCode}</div>
                          </TableCell>
                          <TableCell className="font-medium">{format(new Date(req.requestDate), 'dd MMM yyyy')}</TableCell>
                          <TableCell><RequestTypeBadge type={req.requestType} /></TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm">{req.reason}</TableCell>
                          <TableCell><StatusBadge status={req.status} /></TableCell>
                          <TableCell>
                            {req.appliedToAttendance ? (
                              <Badge className="bg-green-100 text-green-800">Yes</Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">No</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{format(new Date(req.createdAt), 'dd MMM yyyy')}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => { setSelectedRequest(req); setShowAuditDialog(true); }}>
                              <History className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-blue-600" />
              New Regularization Request
            </DialogTitle>
            <DialogDescription>Select an absent day to submit a correction request</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {absentDays.length > 0 && (
              <div>
                <Label className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <CalendarX className="h-4 w-4 text-red-500" />
                  Absent Days This Month ({absentDays.length})
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-1">
                  {absentDays.map((day: any) => {
                    const isSelected = newRequest.requestDate === day.date;
                    const reasonIcon = day.reason.includes('Missing check-in') ? 'missed_checkin'
                      : day.reason.includes('Missing check-out') ? 'missed_checkout'
                      : 'full_day_regularization';
                    return (
                      <div
                        key={day.date}
                        onClick={() => {
                          const suggestedType = day.reason.includes('Missing check-in') ? 'missed_checkin'
                            : day.reason.includes('Missing check-out') ? 'missed_checkout'
                            : 'full_day_regularization';
                          setNewRequest({ ...newRequest, requestDate: day.date, requestType: suggestedType });
                        }}
                        className={`cursor-pointer border rounded-lg p-3 transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-sm">{format(new Date(day.date + 'T00:00:00'), 'dd MMM yyyy')}</p>
                            <p className="text-xs text-muted-foreground">{day.dayName}</p>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              {day.reason}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {loadingAbsent && (
              <div className="text-center py-4 text-muted-foreground text-sm">Loading absent days...</div>
            )}
            {!loadingAbsent && absentDays.length === 0 && (
              <div className="text-center py-4 bg-green-50 rounded-lg">
                <CheckCircle className="h-8 w-8 mx-auto text-green-500 mb-1" />
                <p className="text-sm text-green-700 font-medium">No absent days this month!</p>
                <p className="text-xs text-green-600">You can still submit a request for outdoor duty using the date picker below.</p>
              </div>
            )}
            <div className="border-t pt-3">
              <Label className="text-sm text-muted-foreground">Or enter a date manually</Label>
              <Input
                type="date"
                value={newRequest.requestDate}
                onChange={(e) => setNewRequest({ ...newRequest, requestDate: e.target.value })}
                max={format(new Date(), 'yyyy-MM-dd')}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Request Type *</Label>
              <Select value={newRequest.requestType} onValueChange={(v) => setNewRequest({ ...newRequest, requestType: v })}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="outdoor_duty">Outdoor Duty (client visit, travel, site visit)</SelectItem>
                  <SelectItem value="missed_checkin">Missed Check-In</SelectItem>
                  <SelectItem value="missed_checkout">Missed Check-Out</SelectItem>
                  <SelectItem value="full_day_regularization">Full Day Regularization (no punches)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {needsCheckIn && newRequest.requestType && newRequest.requestType !== 'missed_checkout' && (
              <div>
                <Label>Corrected Check-In Time {newRequest.requestType !== 'missed_checkin' ? '' : '*'}</Label>
                <Input
                  type="datetime-local"
                  value={newRequest.correctedCheckIn}
                  onChange={(e) => setNewRequest({ ...newRequest, correctedCheckIn: e.target.value })}
                />
              </div>
            )}
            {needsCheckOut && newRequest.requestType && newRequest.requestType !== 'missed_checkin' && (
              <div>
                <Label>Corrected Check-Out Time {newRequest.requestType !== 'missed_checkout' ? '' : '*'}</Label>
                <Input
                  type="datetime-local"
                  value={newRequest.correctedCheckOut}
                  onChange={(e) => setNewRequest({ ...newRequest, correctedCheckOut: e.target.value })}
                />
              </div>
            )}
            <div>
              <Label>Reason *</Label>
              <Textarea
                value={newRequest.reason}
                onChange={(e) => setNewRequest({ ...newRequest, reason: e.target.value })}
                placeholder="Provide a detailed reason for this regularization request"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>Cancel</Button>
            <Button
              onClick={() => submitMutation.mutate(newRequest)}
              disabled={!newRequest.requestDate || !newRequest.requestType || !newRequest.reason || submitMutation.isPending}
            >
              {submitMutation.isPending ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Regularization</DialogTitle>
            <DialogDescription>
              Approving will update the attendance record for {selectedRequest?.employeeName} on {selectedRequest?.requestDate ? format(new Date(selectedRequest.requestDate), 'dd MMM yyyy') : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-lg text-sm space-y-1">
              <div><span className="font-medium">Type:</span> {REQUEST_TYPE_LABELS[selectedRequest?.requestType] || selectedRequest?.requestType}</div>
              <div><span className="font-medium">Reason:</span> {selectedRequest?.reason}</div>
              {selectedRequest?.correctedCheckIn && <div><span className="font-medium">Check-In:</span> {format(new Date(selectedRequest.correctedCheckIn), 'hh:mm a')}</div>}
              {selectedRequest?.correctedCheckOut && <div><span className="font-medium">Check-Out:</span> {format(new Date(selectedRequest.correctedCheckOut), 'hh:mm a')}</div>}
            </div>
            <div>
              <Label>Remarks (Optional)</Label>
              <Textarea
                value={approveRemarks}
                onChange={(e) => setApproveRemarks(e.target.value)}
                placeholder="Add any remarks..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => approveMutation.mutate({ id: selectedRequest.id, remarks: approveRemarks })}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? 'Approving...' : 'Confirm Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Regularization</DialogTitle>
            <DialogDescription>Please provide a reason for rejection</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-red-50 p-3 rounded-lg text-sm space-y-1">
              <div><span className="font-medium">Employee:</span> {selectedRequest?.employeeName}</div>
              <div><span className="font-medium">Date:</span> {selectedRequest?.requestDate ? format(new Date(selectedRequest.requestDate), 'dd MMM yyyy') : ''}</div>
              <div><span className="font-medium">Type:</span> {REQUEST_TYPE_LABELS[selectedRequest?.requestType] || selectedRequest?.requestType}</div>
            </div>
            <div>
              <Label>Rejection Reason *</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Provide a reason for rejecting this request"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => rejectMutation.mutate({ id: selectedRequest.id, rejectionReason: rejectReason })}
              disabled={!rejectReason || rejectMutation.isPending}
            >
              {rejectMutation.isPending ? 'Rejecting...' : 'Confirm Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAuditDialog} onOpenChange={setShowAuditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" /> Audit Trail
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-gray-50 p-3 rounded-lg text-sm space-y-1">
              <div><span className="font-medium">Date:</span> {selectedRequest?.requestDate ? format(new Date(selectedRequest.requestDate), 'dd MMM yyyy') : ''}</div>
              <div><span className="font-medium">Type:</span> {REQUEST_TYPE_LABELS[selectedRequest?.requestType] || selectedRequest?.requestType}</div>
              <div><span className="font-medium">Status:</span> <StatusBadge status={selectedRequest?.status || ''} /></div>
              {selectedRequest?.rejectionReason && (
                <div className="mt-2 p-2 bg-red-50 rounded text-red-700">
                  <span className="font-medium">Rejection Reason:</span> {selectedRequest.rejectionReason}
                </div>
              )}
              {selectedRequest?.approverRemarks && (
                <div className="mt-2 p-2 bg-green-50 rounded text-green-700">
                  <span className="font-medium">Approver Remarks:</span> {selectedRequest.approverRemarks}
                </div>
              )}
            </div>
            {selectedRequest?.originalData && (
              <div>
                <h4 className="font-medium text-sm mb-1">Original Attendance Data</h4>
                <div className="bg-yellow-50 p-3 rounded-lg text-sm space-y-1">
                  {(selectedRequest.originalData as any)?.status === 'no_record' ? (
                    <span className="italic text-muted-foreground">No attendance record existed</span>
                  ) : (
                    <>
                      {(selectedRequest.originalData as any)?.checkInTime && <div>Check-In: {format(new Date((selectedRequest.originalData as any).checkInTime), 'hh:mm a')}</div>}
                      {(selectedRequest.originalData as any)?.checkOutTime && <div>Check-Out: {format(new Date((selectedRequest.originalData as any).checkOutTime), 'hh:mm a')}</div>}
                      <div>Status: {(selectedRequest.originalData as any)?.status}</div>
                      {(selectedRequest.originalData as any)?.workingHours && <div>Working Hours: {(selectedRequest.originalData as any).workingHours}h</div>}
                    </>
                  )}
                </div>
              </div>
            )}
            {selectedRequest?.auditTrail && (
              <div>
                <h4 className="font-medium text-sm mb-1">Activity Log</h4>
                <div className="space-y-2">
                  {((selectedRequest.auditTrail as any[]) || []).map((entry: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm border-l-2 border-blue-300 pl-3 py-1">
                      <div>
                        <div className="font-medium capitalize">{entry.action}</div>
                        <div className="text-muted-foreground">{entry.byName} - {format(new Date(entry.at), 'dd MMM yyyy, hh:mm a')}</div>
                        {entry.details && <div className="text-xs mt-0.5">{entry.details}</div>}
                        {entry.remarks && <div className="text-xs mt-0.5 text-green-700">Remarks: {entry.remarks}</div>}
                        {entry.rejectionReason && <div className="text-xs mt-0.5 text-red-700">Reason: {entry.rejectionReason}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}