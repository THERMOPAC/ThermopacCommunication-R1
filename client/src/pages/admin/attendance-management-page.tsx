import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet';
import Layout from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Clock, User, Search, Filter, Download, Users, AlertCircle, CheckCircle } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

interface AttendanceRecord {
  id: number;
  userId: number;
  userName: string;
  department: string;
  date: string;
  timeIn: string;
  timeOut: string | null;
  workHours: number | null;
  status: 'Present' | 'Absent' | 'Late' | 'Half Day';
  location: string;
}

export default function AttendanceManagementPage() {
  const [selectedDateRange, setSelectedDateRange] = useState('thisMonth');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Query for attendance summary stats
  const { data: attendanceStats } = useQuery({
    queryKey: ['/api/admin/attendance/stats', selectedDateRange],
    queryFn: async () => {
      const response = await fetch(`/api/admin/attendance/stats?range=${selectedDateRange}`);
      return response.json();
    }
  });

  // Query for attendance records
  const { data: attendanceRecords = [] } = useQuery<AttendanceRecord[]>({
    queryKey: ['/api/admin/attendance/records', selectedDateRange, selectedDepartment, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams({
        range: selectedDateRange,
        department: selectedDepartment,
        search: searchTerm
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

  const formatTime = (timeString: string) => {
    if (!timeString) return '-';
    return format(new Date(timeString), 'HH:mm');
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'Present': { variant: 'default', color: 'bg-green-100 text-green-800' },
      'Absent': { variant: 'destructive', color: 'bg-red-100 text-red-800' },
      'Late': { variant: 'secondary', color: 'bg-yellow-100 text-yellow-800' },
      'Half Day': { variant: 'outline', color: 'bg-orange-100 text-orange-800' }
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

  return (
    <Layout>
      <Helmet>
        <title>Attendance Management - THERMOPAC</title>
      </Helmet>

      <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Attendance Management</h1>
          <p className="text-gray-600 mt-1">Monitor and manage employee attendance records</p>
        </div>
        <Button onClick={exportAttendance} className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          Export Data
        </Button>
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
            <CardTitle className="text-sm font-medium">Present Today</CardTitle>
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
            <CardTitle className="text-sm font-medium">Absent Today</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{attendanceStats?.absentToday || 0}</div>
            <p className="text-xs text-muted-foreground">
              Employees not checked in
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Late Arrivals</CardTitle>
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
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setSelectedDateRange('today');
                  setSelectedDepartment('all');
                  setSearchTerm('');
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
                      <td className="p-3">{getStatusBadge(record.status)}</td>
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
    </Layout>
  );
}