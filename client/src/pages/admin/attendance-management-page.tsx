import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Calendar, Clock, User, Search, Filter, Download, Users, AlertCircle, CheckCircle, FileText, RefreshCw } from 'lucide-react';
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
  timeIn: string;
  timeOut: string | null;
  workHours: number | null;
  status: 'Present' | 'Absent' | 'Late' | 'Half Day' | 'Weekly Off' | 'Holiday';
  location: string;
  weeklyOffDays?: number[];
}

export default function AttendanceManagementPage() {
  const { toast } = useToast();
  const [selectedDateRange, setSelectedDateRange] = useState('thisMonth');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isProcessingDwar, setIsProcessingDwar] = useState(false);

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
  const safeFormatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '-';
      return format(date, 'MMM dd, yyyy');
    } catch {
      return '-';
    }
  };

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
      'Holiday': { variant: 'outline', color: 'bg-purple-100 text-purple-800' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig['Present'];
    
    return (
      <Badge className={config.color}>
        {status}
      </Badge>
    );
  };

  const exportAttendance = () => {
    // Export functionality would be implemented here
    console.log('Exporting attendance data...');
  };

  // Get selected user details
  const selectedUserDetails = useMemo(() => {
    if (selectedEmployee === 'all' || !Array.isArray(users)) return null;
    return users.find((u: any) => u.id.toString() === selectedEmployee);
  }, [selectedEmployee, users]);

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
        return `${format(startOfWeek(now), 'MMM d')} - ${format(endOfWeek(now), 'MMM d, yyyy')}`;
      case 'lastWeek':
        const lastWeekStart = startOfWeek(new Date(now.setDate(now.getDate() - 7)));
        return `${format(lastWeekStart, 'MMM d')} - ${format(endOfWeek(lastWeekStart), 'MMM d, yyyy')}`;
      case 'thisMonth':
        return format(now, 'MMMM yyyy');
      case 'lastMonth':
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return format(lastMonth, 'MMMM yyyy');
      default:
        return selectedDateRange;
    }
  };

  // Generate PDF report for selected user
  const generateUserPdfReport = async () => {
    if (selectedEmployee === 'all' || !selectedUserDetails) {
      toast({
        title: 'Select an Employee',
        description: 'Please select a specific employee to generate their attendance report.',
        variant: 'destructive',
      });
      return;
    }

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
      console.log('Starting PDF generation...');
      console.log('Selected user details:', selectedUserDetails);
      console.log('Attendance records count:', attendanceRecords?.length);
      
      const doc = new jsPDF();
      console.log('jsPDF instance created');
      
      const pageWidth = doc.internal.pageSize.getWidth();
      console.log('Page width:', pageWidth);
      
      // Header
      doc.setFillColor(0, 51, 102);
      doc.rect(0, 0, pageWidth, 35, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('THERMOPAC', 14, 15);
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('Attendance Report', 14, 25);
      
      // Report date
      doc.setFontSize(10);
      doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`, pageWidth - 14, 15, { align: 'right' });
      
      // Employee Details Section
      doc.setTextColor(0, 0, 0);
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
      
      // Summary Statistics
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
      
      // Attendance Records Table
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Attendance Records', 14, 125);
      
      console.log('Creating table data...');
      const tableData = attendanceRecords.map((record, index) => {
        try {
          return [
            safeFormatDate(record.date),
            safeFormatTime(record.timeIn),
            safeFormatTime(record.timeOut),
            record.workHours ? `${Number(record.workHours).toFixed(1)}h` : '-',
            record.status || '-',
            record.location || '-'
          ];
        } catch (e) {
          console.error(`Error processing record ${index}:`, record, e);
          return ['-', '-', '-', '-', '-', '-'];
        }
      });
      console.log('Table data created:', tableData.length, 'rows');
      
      console.log('autoTable available:', typeof autoTable);
      
      autoTable(doc, {
        startY: 130,
        head: [['Date', 'Time In', 'Time Out', 'Hours', 'Status', 'Location']],
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: [0, 51, 102],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9
        },
        bodyStyles: {
          fontSize: 9
        },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 25 },
          2: { cellWidth: 25 },
          3: { cellWidth: 20 },
          4: { cellWidth: 25 },
          5: { cellWidth: 'auto' }
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245]
        }
      });
      
      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(
          `Page ${i} of ${pageCount} | THERMOPAC - Confidential`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        );
      }
      
      // Save the PDF
      const fileName = `Attendance_Report_${userName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      doc.save(fileName);
      
      toast({
        title: 'PDF Generated',
        description: `Attendance report for ${userName} has been downloaded.`,
      });
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      console.error('Error name:', error?.name);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
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
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Employee</th>
                  <th className="text-left p-3 font-medium">Department</th>
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Time In</th>
                  <th className="text-left p-3 font-medium">Time Out</th>
                  <th className="text-left p-3 font-medium">Work Hours</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Location</th>
                </tr>
              </thead>
              <tbody>
                {!Array.isArray(attendanceRecords) || attendanceRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center p-8 text-gray-500">
                      No attendance records found for the selected criteria
                    </td>
                  </tr>
                ) : (
                  attendanceRecords.map((record) => (
                    <tr key={record.id} className="border-b hover:bg-gray-50">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <User className="h-4 w-4 text-blue-600" />
                          </div>
                          <span className="font-medium">{record.userName}</span>
                        </div>
                      </td>
                      <td className="p-3 text-gray-600">{record.department || '-'}</td>
                      <td className="p-3">{format(new Date(record.date), 'MMM dd, yyyy')}</td>
                      <td className="p-3">{formatTime(record.timeIn)}</td>
                      <td className="p-3">{record.timeOut ? formatTime(record.timeOut) : '-'}</td>
                      <td className="p-3">
                        {record.workHours ? `${record.workHours.toFixed(1)}h` : '-'}
                      </td>
                      <td className="p-3">{getStatusBadge(record.status, { checkInTime: record.timeIn, checkOutTime: record.timeOut })}</td>
                      <td className="p-3 text-gray-600">{record.location || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </div>
    </>
  );
}