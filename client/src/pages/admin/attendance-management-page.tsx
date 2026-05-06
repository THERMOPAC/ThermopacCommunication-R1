import { useState, useMemo } from 'react';
import { fmtDate, fmtDateTime } from "@/lib/date-format";
import { useQuery, useMutation } from '@tanstack/react-query';
import { Helmet } from 'react-helmet';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Calendar, Clock, User, Search, Filter, Download, Users, AlertCircle, CheckCircle, FileText, RefreshCw, Pencil, RotateCcw, ShieldAlert } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from '@/hooks/use-toast';

interface AttendanceRecord {
  id: number;
  userId: number;
  userName: string;
  department: string;
  date: string;
  timeIn: string | null;
  timeOut: string | null;
  workHours: number | null;
  status: string;
  location: string;
  weeklyOffDays?: number[];
  // Override metadata
  statusSource?: string | null;
  adjustedBy?: number | null;
  adjustmentReason?: string | null;
  adjustmentDate?: string | null;
  originalPunchData?: {
    systemStatus?: string;
    checkInTime?: string | null;
    checkOutTime?: string | null;
    workingHours?: string | null;
    netWorkingHours?: string | null;
    capturedAt?: string;
  } | null;
}

const OVERRIDE_STATUSES = [
  { value: 'present', label: 'Present' },
  { value: 'half_day', label: 'Half Day' },
  { value: 'absent', label: 'Absent' },
  { value: 'on_leave', label: 'On Leave' },
  { value: 'weekly_off', label: 'Weekly Off' },
  { value: 'holiday', label: 'Holiday' },
];

export default function AttendanceManagementPage() {
  const { toast } = useToast();
  const [selectedDateRange, setSelectedDateRange] = useState('thisMonth');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isProcessingDwar, setIsProcessingDwar] = useState(false);

  // Override dialog state
  const [overrideTarget, setOverrideTarget] = useState<AttendanceRecord | null>(null);
  const [overrideStatus, setOverrideStatus] = useState('');
  const [overrideTimeIn, setOverrideTimeIn] = useState('');
  const [overrideTimeOut, setOverrideTimeOut] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideLockedAck, setOverrideLockedAck] = useState(false);

  // Revert dialog state
  const [revertTarget, setRevertTarget] = useState<AttendanceRecord | null>(null);
  const [revertReason, setRevertReason] = useState('');

  // Current session user
  const { data: sessionUser } = useQuery<any>({
    queryKey: ['/api/user'],
  });

  const canOverride = useMemo(() => {
    if (!sessionUser) return false;
    if (sessionUser.role === 'Superuser') return true;
    if (sessionUser.role === 'Manager' && sessionUser.department === 'Administration') return true;
    return false;
  }, [sessionUser]);

  // Apply override mutation
  const applyOverrideMutation = useMutation({
    mutationFn: async ({ recordId, payload }: { recordId: number; payload: any }) =>
      apiRequest('PATCH', `/api/admin/attendance/records/${recordId}/override`, payload),
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/attendance/records'] });
      setOverrideTarget(null);
      setOverrideStatus('');
      setOverrideTimeIn('');
      setOverrideTimeOut('');
      setOverrideReason('');
      setOverrideLockedAck(false);
      toast({
        title: 'Override Applied',
        description: data?.payrollPeriodWasLocked
          ? '⚠ Override saved. Payroll recalculation required for this period.'
          : 'Attendance record overridden successfully.',
      });
    },
    onError: async (error: any) => {
      const msg = error?.message || 'Failed to apply override';
      toast({ title: 'Override Failed', description: msg, variant: 'destructive' });
    },
  });

  // Revert override mutation
  const revertOverrideMutation = useMutation({
    mutationFn: async ({ recordId, reason }: { recordId: number; reason: string }) =>
      apiRequest('DELETE', `/api/admin/attendance/records/${recordId}/override`, { reason }),
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/attendance/records'] });
      setRevertTarget(null);
      setRevertReason('');
      toast({ title: 'Override Reverted', description: 'Record restored to system-calculated status.' });
    },
    onError: async (error: any) => {
      const msg = error?.message || 'Failed to revert override';
      toast({ title: 'Revert Failed', description: msg, variant: 'destructive' });
    },
  });

  // Open override dialog pre-populated from the record
  const openOverrideDialog = (record: AttendanceRecord) => {
    setOverrideTarget(record);
    setOverrideStatus('');
    setOverrideTimeIn(record.timeIn ? format(new Date(record.timeIn), 'HH:mm') : '');
    setOverrideTimeOut(record.timeOut ? format(new Date(record.timeOut), 'HH:mm') : '');
    setOverrideReason('');
    setOverrideLockedAck(false);
  };

  const submitOverride = () => {
    if (!overrideTarget) return;
    const dateStr = overrideTarget.date.substring(0, 10);
    const toISO = (dateStr: string, timeStr: string) =>
      timeStr ? new Date(`${dateStr}T${timeStr}:00`).toISOString() : null;
    applyOverrideMutation.mutate({
      recordId: overrideTarget.id,
      payload: {
        ...(overrideStatus && { status: overrideStatus }),
        ...(overrideTimeIn && { checkInTime: toISO(dateStr, overrideTimeIn) }),
        ...(overrideTimeOut && { checkOutTime: toISO(dateStr, overrideTimeOut) }),
        reason: overrideReason,
      },
    });
  };

  const submitRevert = () => {
    if (!revertTarget) return;
    revertOverrideMutation.mutate({ recordId: revertTarget.id, reason: revertReason });
  };

  // Query for attendance summary stats
  const { data: attendanceStats } = useQuery({
    queryKey: ['/api/admin/attendance/stats', selectedDateRange, selectedDepartment, selectedEmployee],
    queryFn: async () => {
      const params = new URLSearchParams({
        range: selectedDateRange,
        department: selectedDepartment,
        employee: selectedEmployee
      });
      const response = await fetch(`/api/admin/attendance/stats?${params}`);
      return response.json();
    }
  });

  // Query for attendance records
  const { data: attendanceRecords = [] } = useQuery<AttendanceRecord[]>({
    queryKey: ['/api/admin/attendance/records', selectedDateRange, selectedDepartment, selectedEmployee],
    queryFn: async () => {
      const params = new URLSearchParams({
        range: selectedDateRange,
        department: selectedDepartment,
        employee: selectedEmployee
      });
      const response = await fetch(`/api/admin/attendance/records?${params}`);
      return response.json();
    }
  });

  // Query for departments
  const { data: departments = [] } = useQuery({
    queryKey: ['/api/admin/departments'],
    queryFn: async () => {
      const response = await fetch('/api/admin/departments');
      return response.json();
    }
  });

  // Query for users (for employee dropdown)
  const { data: users = [] } = useQuery({
    queryKey: ['/api/admin/users'],
    queryFn: async () => {
      const response = await fetch('/api/admin/users');
      return response.json();
    }
  });

  // Group users by role with proper ordering and sorting
  const groupedUsers = useMemo(() => {
    if (!Array.isArray(users)) return {};
    
    const roleOrder = ['Superuser', 'General Manager', 'Senior Manager', 'Manager', 'Employee'];
    
    // Group users by role
    const groups = users.reduce((groups, user) => {
      const role = user.role || 'Employee';
      if (!groups[role]) {
        groups[role] = [];
      }
      groups[role].push(user);
      return groups;
    }, {} as Record<string, any[]>);
    
    // Sort employees alphabetically within each group
    Object.keys(groups).forEach(role => {
      groups[role].sort((a, b) => {
        const nameA = a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.username;
        const nameB = b.firstName && b.lastName ? `${b.firstName} ${b.lastName}` : b.username;
        return nameA.localeCompare(nameB);
      });
    });
    
    // Return groups in specified order
    const orderedGroups: Record<string, any[]> = {};
    roleOrder.forEach(role => {
      if (groups[role] && groups[role].length > 0) {
        orderedGroups[role] = groups[role];
      }
    });
    
    // Add any remaining roles not in the predefined order
    Object.keys(groups).forEach(role => {
      if (!roleOrder.includes(role) && groups[role].length > 0) {
        orderedGroups[role] = groups[role];
      }
    });
    
    return orderedGroups;
  }, [users]);

  const formatTime = (timeString: string) => {
    if (!timeString) return '-';
    try {
      const date = new Date(timeString);
      if (isNaN(date.getTime())) return '-';
      return format(date, 'HH:mm');
    } catch {
      return '-';
    }
  };

  // Safe format time for PDF (returns string, never throws)
  const safeFormatTime = (timeString: string | null | undefined): string => {
    if (!timeString) return '-';
    try {
      const date = new Date(timeString);
      if (isNaN(date.getTime())) return '-';
      return format(date, 'HH:mm');
    } catch {
      return '-';
    }
  };

  // Safe format date for PDF (returns string, never throws)
  const safeFormatDate = (dateString: string | null | undefined): string => fmtDate(dateString) === '—' ? '-' : fmtDate(dateString);

  const getStatusBadge = (status: string, record?: any) => {
    if (record && record.checkInTime && !record.checkOutTime) {
      const today = new Date().toISOString().split('T')[0];
      const recordDate = record.date ? new Date(record.date).toISOString().split('T')[0] : '';
      if (recordDate === today) {
        return <Badge className="bg-blue-100 text-blue-800">Checked In</Badge>;
      }
      return <Badge className="bg-orange-100 text-orange-800">No Check-Out</Badge>;
    }
    if (status === 'Absent' && record && !record.checkInTime && !record.checkOutTime) {
      return <Badge className="bg-red-100 text-red-800">No Check-In & Out</Badge>;
    }
    const statusConfig = {
      'Present': { variant: 'default', color: 'bg-green-100 text-green-800' },
      'Absent': { variant: 'destructive', color: 'bg-red-100 text-red-800' },
      'Late': { variant: 'secondary', color: 'bg-yellow-100 text-yellow-800' },
      'Half Day': { variant: 'outline', color: 'bg-orange-100 text-orange-800' },
      'Weekly Off': { variant: 'outline', color: 'bg-blue-100 text-blue-800' },
      'Holiday': { variant: 'outline', color: 'bg-purple-100 text-purple-800' },
      'On Leave': { variant: 'outline', color: 'bg-indigo-100 text-indigo-800' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig['Absent'];
    
    return (
      <Badge className={config.color}>
        {status}
      </Badge>
    );
  };

  // Inject synthetic Weekly Off rows for dates not covered by actual records
  const enrichWithWeeklyOff = (records: AttendanceRecord[]): AttendanceRecord[] => {
    if (!records.length) return records;
    const { start: rangeStart, end: rangeEnd } = getDateRangeBounds();

    // Group by userId
    const byEmployee: Record<number, AttendanceRecord[]> = {};
    records.forEach(r => {
      if (!byEmployee[r.userId]) byEmployee[r.userId] = [];
      byEmployee[r.userId].push(r);
    });

    const enriched: AttendanceRecord[] = [];
    Object.values(byEmployee).forEach(empRecords => {
      const empWeeklyOff: number[] = (empRecords[0]?.weeklyOffDays as number[]) ?? [0, 6];
      const covered = new Set(empRecords.map(r =>
        typeof r.date === 'string' ? r.date.substring(0, 10) : format(new Date(r.date), 'yyyy-MM-dd')
      ));

      const cursor = new Date(rangeStart);
      cursor.setHours(0, 0, 0, 0);
      const rangeEndDay = new Date(rangeEnd);
      rangeEndDay.setHours(23, 59, 59, 999);

      while (cursor <= rangeEndDay) {
        const dateStr = format(cursor, 'yyyy-MM-dd');
        if (!covered.has(dateStr) && empWeeklyOff.includes(cursor.getDay())) {
          empRecords.push({
            id: -1,
            userId: empRecords[0].userId,
            userName: empRecords[0].userName,
            department: empRecords[0].department,
            date: dateStr,
            timeIn: null,
            timeOut: null,
            workHours: 0,
            status: 'Weekly Off',
            weeklyOffDays: empWeeklyOff,
          } as unknown as AttendanceRecord);
        }
        cursor.setDate(cursor.getDate() + 1);
      }

      // Sort by date ascending
      empRecords.sort((a, b) => {
        const da = typeof a.date === 'string' ? a.date.substring(0, 10) : format(new Date(a.date), 'yyyy-MM-dd');
        const db2 = typeof b.date === 'string' ? b.date.substring(0, 10) : format(new Date(b.date), 'yyyy-MM-dd');
        return da.localeCompare(db2);
      });

      enriched.push(...empRecords);
    });

    return enriched;
  };

  const exportAttendance = () => {
    if (!attendanceRecords || attendanceRecords.length === 0) {
      toast({ title: "No Data", description: "No attendance records to export for the selected filters.", variant: "destructive" });
      return;
    }

    const fullRecords = enrichWithWeeklyOff([...attendanceRecords]);

    const headers = ["Employee", "Department", "Date", "Day", "Time In", "Time Out", "Work Hours", "Status"];
    const rows = fullRecords.map((r: AttendanceRecord) => {
      const dateStr = typeof r.date === 'string' ? r.date.substring(0, 10) : format(new Date(r.date), 'yyyy-MM-dd');
      const dayName = format(new Date(dateStr), 'EEEE');
      return [
        r.userName,
        r.department || "",
        dateStr,
        dayName,
        r.timeIn || "",
        r.timeOut || "",
        r.workHours != null && r.workHours !== 0 ? String(r.workHours) : "",
        r.status || "",
      ];
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance_export_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({ title: "Export Complete", description: `Exported ${fullRecords.length} records (incl. weekly offs).` });
  };

  // Get selected user details
  const selectedUserDetails = useMemo(() => {
    if (selectedEmployee === 'all' || !Array.isArray(users)) return null;
    return users.find((u: any) => u.id.toString() === selectedEmployee);
  }, [selectedEmployee, users]);

  // Compute actual start/end Date objects for the selected range
  const getDateRangeBounds = (): { start: Date; end: Date } => {
    const now = new Date();
    let start: Date;
    let end: Date = new Date(now);
    switch (selectedDateRange) {
      case 'yesterday': {
        start = new Date(now);
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setHours(23, 59, 59, 999);
        break;
      }
      case 'thisWeek': {
        start = startOfWeek(now);
        end = new Date(now);
        break;
      }
      case 'lastWeek': {
        const lw = new Date(now);
        lw.setDate(lw.getDate() - 7);
        start = startOfWeek(lw);
        end = endOfWeek(lw);
        break;
      }
      case 'thisMonth': {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now);
        break;
      }
      case 'lastMonth': {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      }
      default: { // today
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
      }
    }
    return { start, end };
  };

  // Get date range label for report
  const getDateRangeLabel = () => {
    const now = new Date();
    switch (selectedDateRange) {
      case 'today':
        return format(now, 'MMMM d, yyyy');
      case 'yesterday':
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return format(yesterday, 'MMMM d, yyyy');
      case 'thisWeek':
        return `${fmtDate(startOfWeek(now))} - ${fmtDate(endOfWeek(now))}`;
      case 'lastWeek':
        const lastWeekStart = startOfWeek(new Date(now.setDate(now.getDate() - 7)));
        return `${fmtDate(lastWeekStart)} - ${fmtDate(endOfWeek(lastWeekStart))}`;
      case 'thisMonth':
        return format(now, 'MMMM yyyy');
      case 'lastMonth':
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return format(lastMonth, 'MMMM yyyy');
      default:
        return selectedDateRange;
    }
  };

  // Generate PDF report for selected user (or all employees)
  const generateUserPdfReport = async () => {
    if (!Array.isArray(attendanceRecords) || attendanceRecords.length === 0) {
      toast({
        title: 'No Records',
        description: 'No attendance records found for the selected criteria.',
        variant: 'destructive',
      });
      return;
    }

    setIsGeneratingPdf(true);

    try {
      const isAllEmployees = selectedEmployee === 'all' || !selectedUserDetails;
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header banner
      doc.setFillColor(0, 51, 102);
      doc.rect(0, 0, pageWidth, 35, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('THERMOPAC', 14, 15);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('Attendance Report', 14, 25);
      doc.setFontSize(10);
      doc.text(`Generated: ${fmtDateTime(new Date())}`, pageWidth - 14, 15, { align: 'right' });

      doc.setTextColor(0, 0, 0);

      if (isAllEmployees) {
        // ── All-employees mode — employee-wise sections ──

        // Overall org summary on page 1
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Organisation Summary', 14, 50);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Period: ${getDateRangeLabel()}`, 14, 59);
        doc.text(`Department: ${selectedDepartment === 'all' ? 'All Departments' : selectedDepartment}`, 14, 67);

        const totalPresent = attendanceRecords.filter(r => r.status === 'Present').length;
        const totalLate    = attendanceRecords.filter(r => r.status === 'Late').length;
        const totalAbsent  = attendanceRecords.filter(r => r.status === 'Absent').length;
        const totalHalfDay = attendanceRecords.filter(r => r.status === 'Half Day').length;
        const totalLeave   = attendanceRecords.filter(r => r.status === 'On Leave').length;
        const totalHours   = attendanceRecords.reduce((sum, r) => sum + (r.workHours || 0), 0);

        doc.setFillColor(240, 240, 240);
        doc.rect(14, 72, pageWidth - 28, 18, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Totals:', 18, 81);
        doc.setFont('helvetica', 'normal');
        doc.text(`Present: ${totalPresent}`, 45, 81);
        doc.text(`Late: ${totalLate}`, 80, 81);
        doc.text(`Absent: ${totalAbsent}`, 110, 81);
        doc.text(`Half Day: ${totalHalfDay}`, 140, 81);
        doc.text(`On Leave: ${totalLeave}`, 18, 87);
        doc.text(`Total Hours: ${totalHours.toFixed(1)}h`, 65, 87);

        // Build per-employee summary table
        const employeeMap: Record<number, { name: string; dept: string; records: AttendanceRecord[] }> = {};
        attendanceRecords.forEach(r => {
          if (!employeeMap[r.userId]) {
            employeeMap[r.userId] = { name: r.userName || '-', dept: r.department || '-', records: [] };
          }
          employeeMap[r.userId].records.push(r);
        });
        const employees = Object.values(employeeMap).sort((a, b) => a.name.localeCompare(b.name));

        const summaryRows = employees.map(emp => {
          const p  = emp.records.filter(r => r.status === 'Present').length;
          const l  = emp.records.filter(r => r.status === 'Late').length;
          const a  = emp.records.filter(r => r.status === 'Absent').length;
          const hd = emp.records.filter(r => r.status === 'Half Day').length;
          const ol = emp.records.filter(r => r.status === 'On Leave').length;
          const hrs = emp.records.reduce((s, r) => s + (r.workHours || 0), 0);
          return [emp.name, emp.dept, p, l, a, hd, ol, `${hrs.toFixed(1)}h`];
        });

        autoTable(doc, {
          startY: 98,
          head: [['Employee', 'Department', 'Present', 'Late', 'Absent', 'Half Day', 'On Leave', 'Total Hrs']],
          body: summaryRows,
          theme: 'striped',
          headStyles: { fillColor: [0, 51, 102], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 35 },
            1: { cellWidth: 28 },
            2: { cellWidth: 17 },
            3: { cellWidth: 13 },
            4: { cellWidth: 17 },
            5: { cellWidth: 18 },
            6: { cellWidth: 18 },
            7: { cellWidth: 'auto' },
          },
          alternateRowStyles: { fillColor: [245, 245, 245] },
        });

        // One section per employee with their daily records
        employees.forEach(emp => {
          // Reuse shared enrichWithWeeklyOff to add synthetic Weekly Off rows
          const allEmpRecords = enrichWithWeeklyOff([...emp.records]);

          doc.addPage();
          // Employee header bar
          doc.setFillColor(0, 51, 102);
          doc.rect(0, 0, pageWidth, 22, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(13);
          doc.setFont('helvetica', 'bold');
          doc.text(emp.name, 14, 10);
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          doc.text(`${emp.dept}  |  Period: ${getDateRangeLabel()}`, 14, 18);

          // Per-employee mini-summary (include synthetic weekly offs)
          const ep   = allEmpRecords.filter(r => r.status === 'Present').length;
          const el   = allEmpRecords.filter(r => r.status === 'Late').length;
          const ea   = allEmpRecords.filter(r => r.status === 'Absent').length;
          const ehd  = allEmpRecords.filter(r => r.status === 'Half Day').length;
          const eol  = allEmpRecords.filter(r => r.status === 'On Leave').length;
          const ewo  = allEmpRecords.filter(r => r.status === 'Weekly Off').length;
          const eHrs = allEmpRecords.reduce((s, r) => s + (r.workHours || 0), 0);

          doc.setTextColor(0, 0, 0);
          doc.setFillColor(240, 240, 240);
          doc.rect(14, 27, pageWidth - 28, 14, 'F');
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.text(`Present: ${ep}`, 18, 35);
          doc.text(`Late: ${el}`, 46, 35);
          doc.text(`Absent: ${ea}`, 70, 35);
          doc.text(`Half Day: ${ehd}`, 96, 35);
          doc.text(`On Leave: ${eol}`, 124, 35);
          doc.text(`Weekly Off: ${ewo}`, 152, 35);
          doc.text(`Total Hrs: ${eHrs.toFixed(1)}h`, 18, 39);

          const empRows = allEmpRecords.map(r => {
            try {
              return [
                safeFormatDate(r.date),
                safeFormatTime(r.timeIn),
                safeFormatTime(r.timeOut),
                r.workHours ? `${Number(r.workHours).toFixed(1)}h` : '-',
                r.status || '-',
              ];
            } catch { return ['-', '-', '-', '-', '-']; }
          });

          autoTable(doc, {
            startY: 45,
            head: [['Date', 'Time In', 'Time Out', 'Hours', 'Status']],
            body: empRows,
            theme: 'striped',
            headStyles: { fillColor: [30, 80, 140], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { fontSize: 9 },
            columnStyles: {
              0: { cellWidth: 40 },
              1: { cellWidth: 30 },
              2: { cellWidth: 30 },
              3: { cellWidth: 25 },
              4: { cellWidth: 'auto' },
            },
            alternateRowStyles: { fillColor: [245, 245, 245] },
          });
        });

        // Page footers
        const pageCount = doc.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.setFontSize(8);
          doc.setTextColor(128, 128, 128);
          doc.text(`Page ${i} of ${pageCount} | THERMOPAC - Confidential`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
        }

        const dept = selectedDepartment === 'all' ? 'All' : selectedDepartment.replace(/\s+/g, '_');
        doc.save(`Attendance_Report_${dept}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
        toast({ title: 'PDF Generated', description: `Employee-wise report for ${employees.length} employees (${attendanceRecords.length} records) downloaded.` });

      } else {
        // ── Single-employee mode ──
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Employee Information', 14, 50);

        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        const userName = selectedUserDetails.firstName && selectedUserDetails.lastName
          ? `${selectedUserDetails.firstName} ${selectedUserDetails.lastName}`
          : selectedUserDetails.username;

        doc.text(`Name: ${userName}`, 14, 60);
        doc.text(`Username: ${selectedUserDetails.username}`, 14, 68);
        doc.text(`Role: ${selectedUserDetails.role || 'Employee'}`, 14, 76);
        doc.text(`Department: ${selectedUserDetails.department || 'N/A'}`, pageWidth / 2, 60);
        doc.text(`Email: ${selectedUserDetails.email || 'N/A'}`, pageWidth / 2, 68);
        doc.text(`Report Period: ${getDateRangeLabel()}`, pageWidth / 2, 76);

        doc.setFillColor(240, 240, 240);
        doc.rect(14, 85, pageWidth - 28, 25, 'F');

        const presentCount = attendanceRecords.filter(r => r.status === 'Present').length;
        const lateCount = attendanceRecords.filter(r => r.status === 'Late').length;
        const absentCount = attendanceRecords.filter(r => r.status === 'Absent').length;
        const halfDayCount = attendanceRecords.filter(r => r.status === 'Half Day').length;
        const totalHours = attendanceRecords.reduce((sum, r) => sum + (r.workHours || 0), 0);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Summary:', 18, 95);
        doc.setFont('helvetica', 'normal');
        doc.text(`Present: ${presentCount}`, 18, 103);
        doc.text(`Late: ${lateCount}`, 55, 103);
        doc.text(`Absent: ${absentCount}`, 85, 103);
        doc.text(`Half Day: ${halfDayCount}`, 120, 103);
        doc.text(`Total Hours: ${totalHours.toFixed(1)}h`, 160, 103);

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Attendance Records', 14, 125);

        const tableData = attendanceRecords.map((record) => {
          try {
            return [
              safeFormatDate(record.date),
              safeFormatTime(record.timeIn),
              safeFormatTime(record.timeOut),
              record.workHours ? `${Number(record.workHours).toFixed(1)}h` : '-',
              record.status || '-',
              record.location || '-',
            ];
          } catch {
            return ['-', '-', '-', '-', '-', '-'];
          }
        });

        autoTable(doc, {
          startY: 130,
          head: [['Date', 'Time In', 'Time Out', 'Hours', 'Status', 'Location']],
          body: tableData,
          theme: 'striped',
          headStyles: { fillColor: [0, 51, 102], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
          bodyStyles: { fontSize: 9 },
          columnStyles: {
            0: { cellWidth: 35 },
            1: { cellWidth: 25 },
            2: { cellWidth: 25 },
            3: { cellWidth: 20 },
            4: { cellWidth: 25 },
            5: { cellWidth: 'auto' },
          },
          alternateRowStyles: { fillColor: [245, 245, 245] },
        });

        const pageCount = doc.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.setFontSize(8);
          doc.setTextColor(128, 128, 128);
          doc.text(`Page ${i} of ${pageCount} | THERMOPAC - Confidential`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
        }

        doc.save(`Attendance_Report_${userName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
        toast({ title: 'PDF Generated', description: `Attendance report for ${userName} has been downloaded.` });
      }
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      toast({
        title: 'Error',
        description: `Failed to generate PDF report: ${error?.message || 'Unknown error'}`,
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Process historical DWAR compliance for current month
  const processHistoricalDwarCompliance = async () => {
    setIsProcessingDwar(true);
    try {
      const today = new Date();
      const monthStart = startOfMonth(today);
      const startDate = format(monthStart, 'yyyy-MM-dd');
      const endDate = format(today, 'yyyy-MM-dd');

      const result = await apiRequest('POST', '/api/attendance/process-historical-dwar', {
        startDate,
        endDate
      }) as { success: boolean; processed?: number; markedAbsent?: number; message?: string };

      if (result.success) {
        toast({
          title: 'DWAR Compliance Processed',
          description: `Checked ${result.processed} records, marked ${result.markedAbsent} as absent due to missing DWAR.`,
        });

        // Refresh attendance data
        queryClient.invalidateQueries({ queryKey: ['/api/admin/attendance/records'] });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/attendance/stats'] });
      } else {
        toast({
          title: 'Processing Failed',
          description: result.message || 'Failed to process DWAR compliance',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Error processing DWAR compliance:', error);
      toast({
        title: 'Error',
        description: 'Failed to process DWAR compliance. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessingDwar(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Attendance Management - THERMOPAC</title>
      </Helmet>

      <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 pl-4">Attendance Management</h1>
          <p className="text-gray-600 mt-1">Monitor and manage employee attendance records</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={processHistoricalDwarCompliance}
            variant="outline"
            className="flex items-center gap-2"
            disabled={isProcessingDwar}
            data-testid="button-process-dwar"
          >
            <RefreshCw className={`h-4 w-4 ${isProcessingDwar ? 'animate-spin' : ''}`} />
            {isProcessingDwar ? 'Processing...' : 'Process DWAR Compliance'}
          </Button>
          <Button 
            onClick={generateUserPdfReport} 
            variant={selectedEmployee !== 'all' ? 'default' : 'outline'}
            className="flex items-center gap-2"
            disabled={isGeneratingPdf}
            data-testid="button-generate-pdf"
          >
            <FileText className="h-4 w-4" />
            {isGeneratingPdf ? 'Generating...' : 'PDF Report'}
          </Button>
          <Button onClick={exportAttendance} variant="outline" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export Data
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{attendanceStats?.totalEmployees || 0}</div>
            <p className="text-xs text-muted-foreground">
              Active employees
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {selectedDateRange === 'today' ? 'Present Today' : 
               selectedDateRange === 'yesterday' ? 'Present Yesterday' :
               selectedDateRange === 'thisWeek' ? 'Present This Week' :
               selectedDateRange === 'lastWeek' ? 'Present Last Week' :
               selectedDateRange === 'thisMonth' ? 'Present This Month' :
               selectedDateRange === 'lastMonth' ? 'Present Last Month' : 'Present'}
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{attendanceStats?.presentToday || 0}</div>
            <p className="text-xs text-muted-foreground">
              {attendanceStats?.presentPercentage || 0}% attendance rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {selectedDateRange === 'today' ? 'Absent Today' : 
               selectedDateRange === 'yesterday' ? 'Absent Yesterday' :
               selectedDateRange === 'thisWeek' ? 'Absent This Week' :
               selectedDateRange === 'lastWeek' ? 'Absent Last Week' :
               selectedDateRange === 'thisMonth' ? 'Absent This Month' :
               selectedDateRange === 'lastMonth' ? 'Absent Last Month' : 'Absent'}
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{attendanceStats?.absentToday || 0}</div>
            <p className="text-xs text-muted-foreground">
              {selectedDateRange === 'today' || selectedDateRange === 'yesterday' ? 'Employees not checked in' : 'Days absent in period'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {selectedDateRange === 'today' ? 'Late Arrivals' : 
               selectedDateRange === 'yesterday' ? 'Late Yesterday' :
               selectedDateRange === 'thisWeek' ? 'Late This Week' :
               selectedDateRange === 'lastWeek' ? 'Late Last Week' :
               selectedDateRange === 'thisMonth' ? 'Late This Month' :
               selectedDateRange === 'lastMonth' ? 'Late Last Month' : 'Late Arrivals'}
            </CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{attendanceStats?.lateToday || 0}</div>
            <p className="text-xs text-muted-foreground">
              After 9:30 AM
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters & Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Date Range</label>
              <Select value={selectedDateRange} onValueChange={setSelectedDateRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="thisWeek">This Week</SelectItem>
                  <SelectItem value="lastWeek">Last Week</SelectItem>
                  <SelectItem value="thisMonth">This Month</SelectItem>
                  <SelectItem value="lastMonth">Last Month</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Department</label>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {Array.isArray(departments) && departments.map((dept: string) => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Search Employee</label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {Array.isArray(users) && users.length > 0 ? (
                    Object.entries(groupedUsers).map(([role, roleUsers]) => (
                      <SelectGroup key={role}>
                        <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400 py-2">
                          {role === 'Superuser' ? 'Superusers' :
                           role === 'General Manager' ? 'General Managers' :
                           role === 'Senior Manager' ? 'Senior Managers' :
                           role === 'Manager' ? 'Managers' :
                           role === 'Employee' ? 'Employees' : `${role}s`}
                        </SelectLabel>
                        {roleUsers.map((user: any) => (
                          <SelectItem key={user.id} value={user.id.toString()}>
                            {user.firstName && user.lastName 
                              ? `${user.firstName} ${user.lastName} (${user.username})`
                              : user.username
                            }
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))
                  ) : (
                    <SelectItem value="loading" disabled>Loading employees...</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setSelectedDateRange('today');
                  setSelectedDepartment('all');
                  setSelectedEmployee('all');
                }}
                className="w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Records Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Attendance Records
          </CardTitle>
          <CardDescription>
            Detailed attendance records for selected criteria
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <TooltipProvider>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 font-medium">Employee</th>
                  <th className="text-left p-3 font-medium">Department</th>
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Time In</th>
                  <th className="text-left p-3 font-medium">Time Out</th>
                  <th className="text-left p-3 font-medium">Work Hours</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  {canOverride && (
                    <th className="text-left p-3 font-medium">Payroll Impact</th>
                  )}
                  {canOverride && (
                    <th className="text-left p-3 font-medium">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {!Array.isArray(attendanceRecords) || attendanceRecords.length === 0 ? (
                  <tr>
                    <td colSpan={canOverride ? 9 : 7} className="text-center p-8 text-gray-500">
                      No attendance records found for the selected criteria
                    </td>
                  </tr>
                ) : (
                  attendanceRecords.map((record) => {
                    const isOverridden = record.statusSource === 'admin_override';
                    const origStatus = record.originalPunchData?.systemStatus;
                    const payrollImpact = isOverridden && origStatus && origStatus !== record.status.toLowerCase().replace(' ', '_');
                    return (
                      <tr key={record.id} className={`border-b hover:bg-gray-50 ${isOverridden ? 'bg-amber-50/40' : ''}`}>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                              <User className="h-4 w-4 text-blue-600" />
                            </div>
                            <span className="font-medium">{record.userName}</span>
                          </div>
                        </td>
                        <td className="p-3 text-gray-600">{record.department || '-'}</td>
                        <td className="p-3">{fmtDate(record.date)}</td>
                        <td className="p-3">{formatTime(record.timeIn)}</td>
                        <td className="p-3">{record.timeOut ? formatTime(record.timeOut) : '-'}</td>
                        <td className="p-3">
                          {record.workHours ? `${record.workHours.toFixed(1)}h` : '-'}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col gap-1">
                            {getStatusBadge(record.status, { checkInTime: record.timeIn, checkOutTime: record.timeOut })}
                            {isOverridden && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge className="w-fit bg-amber-100 text-amber-800 border border-amber-300 gap-1 cursor-default text-xs">
                                    <ShieldAlert className="h-3 w-3" />
                                    Admin Override
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p className="font-medium">Override applied</p>
                                  {origStatus && <p className="text-xs text-gray-500 mt-1">System status: {origStatus.replace('_', ' ')}</p>}
                                  {record.adjustmentReason && <p className="text-xs mt-1">Reason: {record.adjustmentReason}</p>}
                                  {record.adjustmentDate && <p className="text-xs text-gray-400">{fmtDate(record.adjustmentDate)}</p>}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </td>
                        {canOverride && (
                          <td className="p-3">
                            {isOverridden ? (
                              <Badge className="bg-orange-100 text-orange-700 border border-orange-200 text-xs">
                                Recalc. needed
                              </Badge>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>
                        )}
                        {canOverride && (
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-blue-600 hover:bg-blue-50"
                                    onClick={() => openOverrideDialog(record)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Apply Override</TooltipContent>
                              </Tooltip>
                              {isOverridden && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-red-600 hover:bg-red-50"
                                      onClick={() => { setRevertTarget(record); setRevertReason(''); }}
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Revert Override</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>
      </div>

      {/* ── Apply Override Dialog ─────────────────────────────────── */}
      <Dialog open={!!overrideTarget} onOpenChange={(open) => { if (!open) setOverrideTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              Apply Admin Override
            </DialogTitle>
          </DialogHeader>

          {overrideTarget && (
            <div className="space-y-4">
              <div className="rounded-md bg-gray-50 p-3 text-sm">
                <p><span className="font-medium">Employee:</span> {overrideTarget.userName}</p>
                <p><span className="font-medium">Date:</span> {fmtDate(overrideTarget.date)}</p>
                <p><span className="font-medium">Current Status:</span> {overrideTarget.status}
                  {overrideTarget.statusSource === 'admin_override' && (
                    <Badge className="ml-2 text-xs bg-amber-100 text-amber-800">Already overridden</Badge>
                  )}
                </p>
                {overrideTarget.originalPunchData?.systemStatus && (
                  <p className="text-gray-500 text-xs mt-1">System status: {overrideTarget.originalPunchData.systemStatus.replace('_', ' ')}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>New Status <span className="text-gray-400 text-xs">(optional — leave blank to keep current)</span></Label>
                <Select value={overrideStatus} onValueChange={setOverrideStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status…" />
                  </SelectTrigger>
                  <SelectContent>
                    {OVERRIDE_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Time In <span className="text-gray-400 text-xs">(optional)</span></Label>
                  <Input
                    type="time"
                    value={overrideTimeIn}
                    onChange={(e) => setOverrideTimeIn(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Time Out <span className="text-gray-400 text-xs">(optional)</span></Label>
                  <Input
                    type="time"
                    value={overrideTimeOut}
                    onChange={(e) => setOverrideTimeOut(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Reason <span className="text-red-500">*</span> <span className="text-gray-400 text-xs">(min 10 characters)</span></Label>
                <Textarea
                  rows={3}
                  placeholder="Explain why this override is necessary…"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
                <p className={`text-xs ${overrideReason.length < 10 ? 'text-gray-400' : 'text-green-600'}`}>
                  {overrideReason.length} / 10 min characters
                </p>
              </div>

              {sessionUser?.role !== 'Superuser' ? null : (
                <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-xs text-orange-800 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>If this date falls within a locked payroll period, the override will be applied and the period will be flagged for recalculation.</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOverrideTarget(null)}>Cancel</Button>
            <Button
              onClick={submitOverride}
              disabled={overrideReason.length < 10 || applyOverrideMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {applyOverrideMutation.isPending ? 'Applying…' : 'Apply Override'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Revert Override Dialog ─────────────────────────────────── */}
      <Dialog open={!!revertTarget} onOpenChange={(open) => { if (!open) setRevertTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-red-600" />
              Revert Admin Override
            </DialogTitle>
          </DialogHeader>

          {revertTarget && (
            <div className="space-y-4">
              <div className="rounded-md bg-gray-50 p-3 text-sm">
                <p><span className="font-medium">Employee:</span> {revertTarget.userName}</p>
                <p><span className="font-medium">Date:</span> {fmtDate(revertTarget.date)}</p>
                <p><span className="font-medium">Current (Override) Status:</span> {revertTarget.status}</p>
                {revertTarget.originalPunchData?.systemStatus && (
                  <p className="text-gray-500 text-xs mt-1">Will restore to: <strong>{revertTarget.originalPunchData.systemStatus.replace('_', ' ')}</strong></p>
                )}
              </div>

              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>This will restore the record to the original system-calculated values. This action is logged in the audit trail.</span>
              </div>

              <div className="space-y-2">
                <Label>Reason for Revert <span className="text-red-500">*</span></Label>
                <Textarea
                  rows={3}
                  placeholder="Explain why you are reverting this override…"
                  value={revertReason}
                  onChange={(e) => setRevertReason(e.target.value)}
                />
                <p className={`text-xs ${revertReason.length < 10 ? 'text-gray-400' : 'text-green-600'}`}>
                  {revertReason.length} / 10 min characters
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRevertTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={submitRevert}
              disabled={revertReason.length < 10 || revertOverrideMutation.isPending}
            >
              {revertOverrideMutation.isPending ? 'Reverting…' : 'Revert Override'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}