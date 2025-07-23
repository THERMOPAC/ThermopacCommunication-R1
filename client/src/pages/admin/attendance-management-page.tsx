import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
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
  const [selectedEmployee, setSelectedEmployee] = useState('all');

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
    <>
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
    </>
  );
}