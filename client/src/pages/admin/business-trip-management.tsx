import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  LineChart, 
  Line 
} from 'recharts';
import { 
  Plus, 
  Calendar, 
  MapPin, 
  Clock, 
  DollarSign, 
  FileText, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Plane,
  Hotel,
  Car,
  Receipt,
  Users,
  TrendingUp,
  Upload,
  Download,
  Trash2,
  Eye,
  Paperclip,
  MoreVertical,
  Edit,
  User,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Search,
  BarChart3,
  Filter,
  FileDown,
  RefreshCw,
  Target,
  CheckSquare,
  Send
} from 'lucide-react';

// Form schemas
const tripFormSchema = z.object({
  employeeId: z.string().min(1, 'Employee is required'),
  tripTitle: z.string().min(1, 'Trip title is required'),
  purpose: z.string().min(1, 'Purpose is required'),
  destination: z.string().min(1, 'Destination is required'),
  fromDate: z.string().min(1, 'From date is required'),
  toDate: z.string().min(1, 'To date is required'),
  estimatedTravelCost: z.string().default('0'),
  estimatedAccommodationCost: z.string().default('0'),
  estimatedMiscCost: z.string().default('0'),
  advanceRequested: z.string().default('0'),
  supportingDocumentUrl: z.string().optional(),
});

const approvalFormSchema = z.object({
  action: z.enum(['approve', 'reject']),
  comments: z.string().optional(),
  approvalType: z.enum(['manager', 'admin', 'finance']),
});

const documentUploadSchema = z.object({
  documentType: z.string().min(1, 'Document type is required'),
  description: z.string().optional(),
});

type TripFormData = z.infer<typeof tripFormSchema>;
type ApprovalFormData = z.infer<typeof approvalFormSchema>;
type DocumentUploadData = z.infer<typeof documentUploadSchema>;

// Trip Reports Component
const TripReports = () => {
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  const [filters, setFilters] = useState({
    employeeId: '',
    status: '',
    destination: ''
  });
  const { toast } = useToast();

  // Fetch trip reports data
  const { data: reportsData, isLoading: reportsLoading, refetch } = useQuery({
    queryKey: ['/api/trips/reports', dateRange, filters],
    queryFn: () => apiRequest('GET', `/api/trips/reports?${new URLSearchParams({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      employeeId: filters.employeeId,
      status: filters.status,
      destination: filters.destination
    }).toString()}`),
    enabled: true
  });

  // Fetch employees for filter
  const { data: employees } = useQuery({
    queryKey: ['/api/admin/users'],
    queryFn: () => apiRequest('GET', '/api/admin/users')
  });

  // Memoized grouped employees for role-based dropdown in Reports tab
  const groupedEmployees = React.useMemo(() => {
    const roleOrder = ['Superuser', 'General Manager', 'Senior Manager', 'Manager', 'Employee'];
    const groups: Record<string, any[]> = {};
    
    employees?.forEach((employee: any) => {
      const role = employee.role || 'Employee';
      if (!groups[role]) {
        groups[role] = [];
      }
      groups[role].push(employee);
    });
    
    // Sort employees within each group alphabetically
    Object.values(groups).forEach(group => {
      group.sort((a, b) => {
        const nameA = a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.username;
        const nameB = b.firstName && b.lastName ? `${b.firstName} ${b.lastName}` : b.username;
        return nameA.localeCompare(nameB);
      });
    });
    
    return roleOrder.filter(role => groups[role]).map(role => ({
      role,
      employees: groups[role]
    }));
  }, [employees]);

  // Chart colors
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

  // Export functionality
  const exportToCSV = () => {
    if (!reportsData?.recentTrips) return;
    
    const headers = ['Trip Title', 'Employee', 'Destination', 'From Date', 'To Date', 'Status', 'Total Cost'];
    const rows = reportsData.recentTrips.map((trip: any) => [
      trip.tripTitle,
      trip.employeeName,
      trip.destination,
      trip.fromDate,
      trip.toDate,
      trip.status,
      trip.totalCost
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trip-reports-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({ employeeId: '', status: '', destination: '' });
    setDateRange({ startDate: '', endDate: '' });
    toast({ description: 'Filters cleared successfully' });
  };

  if (reportsLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading trip reports...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-6 w-6" />
                Trip Reports & Analytics
              </CardTitle>
              <CardDescription>
                Comprehensive analytics and insights for business trip management
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={refetch} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button onClick={exportToCSV} variant="outline" size="sm">
                <FileDown className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Date Range Filters */}
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
            
            {/* Employee Filter */}
            <div>
              <Label>Employee</Label>
              <Select value={filters.employeeId} onValueChange={(value) => setFilters(prev => ({ ...prev, employeeId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {groupedEmployees.map(({ role, employees: roleEmployees }) => (
                    <SelectGroup key={role}>
                      <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">
                        {role}s
                      </SelectLabel>
                      {roleEmployees.map((employee: any) => (
                        <SelectItem key={employee.id} value={employee.id.toString()}>
                          {employee.firstName && employee.lastName ? 
                            `${employee.firstName} ${employee.lastName}` : 
                            employee.username}
                          {employee.department && ` • ${employee.department}`}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Status Filter */}
            <div>
              <Label>Status</Label>
              <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="manager_approved">Manager Approved</SelectItem>
                  <SelectItem value="final_approved">Final Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Clear Filters Button */}
            <div className="flex items-end">
              <Button onClick={clearFilters} variant="outline" className="w-full">
                <Filter className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Statistics */}
      {reportsData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Plane className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Trips</p>
                  <p className="text-2xl font-bold">{reportsData.summary?.totalTrips || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <DollarSign className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Cost</p>
                  <p className="text-2xl font-bold">
                    ₹{(reportsData.costBreakdown?.totalCost || 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Target className="h-8 w-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Top Destination</p>
                  <p className="text-lg font-bold">{reportsData.topDestinations?.[0]?.destination || 'N/A'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-orange-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Active Travelers</p>
                  <p className="text-2xl font-bold">{reportsData.employeeSummary?.length || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Section */}
      {reportsData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly Trends Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Monthly Trip Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={reportsData.monthlyTrends || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="tripCount" stroke="#8884d8" strokeWidth={2} />
                  <Line type="monotone" dataKey="totalCost" stroke="#82ca9d" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Status Distribution Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Trip Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={reportsData.statusDistribution || []}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {(reportsData.statusDistribution || []).map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Top Destinations Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Top Destinations</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={reportsData.topDestinations?.slice(0, 8) || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="destination" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="tripCount" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Cost Breakdown Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Cost Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={[
                  { 
                    name: 'Travel', 
                    amount: reportsData.costBreakdown?.totalTravelCost || 0 
                  },
                  { 
                    name: 'Accommodation', 
                    amount: reportsData.costBreakdown?.totalAccommodationCost || 0 
                  },
                  { 
                    name: 'Miscellaneous', 
                    amount: reportsData.costBreakdown?.totalMiscCost || 0 
                  }
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="amount" fill="#82ca9d" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Employee Summary Table */}
      {reportsData?.employeeSummary && (
        <Card>
          <CardHeader>
            <CardTitle>Employee Travel Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Total Trips</TableHead>
                  <TableHead>Total Cost</TableHead>
                  <TableHead>Average Cost</TableHead>
                  <TableHead>Last Trip</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportsData.employeeSummary.map((employee: any, index: number) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{employee.employeeName}</TableCell>
                    <TableCell>{employee.tripCount}</TableCell>
                    <TableCell>₹{employee.totalCost?.toLocaleString()}</TableCell>
                    <TableCell>₹{employee.avgCost?.toLocaleString()}</TableCell>
                    <TableCell>{employee.lastTripDate ? new Date(employee.lastTripDate).toLocaleDateString() : 'N/A'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent Trips Table */}
      {reportsData?.recentTrips && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Trips ({reportsData.recentTrips.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trip Title</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>From Date</TableHead>
                  <TableHead>To Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportsData.recentTrips.map((trip: any) => (
                  <TableRow key={trip.id}>
                    <TableCell className="font-medium">{trip.tripTitle}</TableCell>
                    <TableCell>{trip.employeeName}</TableCell>
                    <TableCell>{trip.destination}</TableCell>
                    <TableCell>{new Date(trip.fromDate).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(trip.toDate).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant={
                        trip.status === 'final_approved' ? 'default' :
                        trip.status === 'manager_approved' ? 'secondary' :
                        trip.status === 'submitted' ? 'outline' :
                        trip.status === 'rejected' ? 'destructive' : 'secondary'
                      }>
                        {trip.status.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>₹{trip.totalCost?.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// Document type options
const documentTypeOptions = [
  { value: 'travel_booking', label: 'Travel Booking' },
  { value: 'hotel_confirmation', label: 'Hotel Confirmation' },
  { value: 'meeting_invitation', label: 'Meeting Invitation' },
  { value: 'visa_documents', label: 'Visa Documents' },
  { value: 'advance_payment_request', label: 'Advance Payment Request' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'expense_receipt', label: 'Expense Receipt' },
  { value: 'trip_report', label: 'Trip Report' },
];

// Countries list for destination dropdown
const countries = [
  { code: 'AF', name: 'Afghanistan' },
  { code: 'AL', name: 'Albania' },
  { code: 'DZ', name: 'Algeria' },
  { code: 'AS', name: 'American Samoa' },
  { code: 'AD', name: 'Andorra' },
  { code: 'AO', name: 'Angola' },
  { code: 'AI', name: 'Anguilla' },
  { code: 'AQ', name: 'Antarctica' },
  { code: 'AG', name: 'Antigua and Barbuda' },
  { code: 'AR', name: 'Argentina' },
  { code: 'AM', name: 'Armenia' },
  { code: 'AW', name: 'Aruba' },
  { code: 'AU', name: 'Australia' },
  { code: 'AT', name: 'Austria' },
  { code: 'AZ', name: 'Azerbaijan' },
  { code: 'BS', name: 'Bahamas' },
  { code: 'BH', name: 'Bahrain' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'BB', name: 'Barbados' },
  { code: 'BY', name: 'Belarus' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BZ', name: 'Belize' },
  { code: 'BJ', name: 'Benin' },
  { code: 'BM', name: 'Bermuda' },
  { code: 'BT', name: 'Bhutan' },
  { code: 'BO', name: 'Bolivia' },
  { code: 'BQ', name: 'Bonaire' },
  { code: 'BA', name: 'Bosnia and Herzegovina' },
  { code: 'BW', name: 'Botswana' },
  { code: 'BV', name: 'Bouvet Island' },
  { code: 'BR', name: 'Brazil' },
  { code: 'IO', name: 'British Indian Ocean Territory' },
  { code: 'BN', name: 'Brunei' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'BF', name: 'Burkina Faso' },
  { code: 'BI', name: 'Burundi' },
  { code: 'CV', name: 'Cape Verde' },
  { code: 'KH', name: 'Cambodia' },
  { code: 'CM', name: 'Cameroon' },
  { code: 'CA', name: 'Canada' },
  { code: 'KY', name: 'Cayman Islands' },
  { code: 'CF', name: 'Central African Republic' },
  { code: 'TD', name: 'Chad' },
  { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' },
  { code: 'CX', name: 'Christmas Island' },
  { code: 'CC', name: 'Cocos Islands' },
  { code: 'CO', name: 'Colombia' },
  { code: 'KM', name: 'Comoros' },
  { code: 'CG', name: 'Congo' },
  { code: 'CD', name: 'Congo (Democratic Republic)' },
  { code: 'CK', name: 'Cook Islands' },
  { code: 'CR', name: 'Costa Rica' },
  { code: 'CI', name: 'Côte d\'Ivoire' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CU', name: 'Cuba' },
  { code: 'CW', name: 'Curaçao' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'DK', name: 'Denmark' },
  { code: 'DJ', name: 'Djibouti' },
  { code: 'DM', name: 'Dominica' },
  { code: 'DO', name: 'Dominican Republic' },
  { code: 'EC', name: 'Ecuador' },
  { code: 'EG', name: 'Egypt' },
  { code: 'SV', name: 'El Salvador' },
  { code: 'GQ', name: 'Equatorial Guinea' },
  { code: 'ER', name: 'Eritrea' },
  { code: 'EE', name: 'Estonia' },
  { code: 'SZ', name: 'Eswatini' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'FK', name: 'Falkland Islands' },
  { code: 'FO', name: 'Faroe Islands' },
  { code: 'FJ', name: 'Fiji' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'GF', name: 'French Guiana' },
  { code: 'PF', name: 'French Polynesia' },
  { code: 'TF', name: 'French Southern Territories' },
  { code: 'GA', name: 'Gabon' },
  { code: 'GM', name: 'Gambia' },
  { code: 'GE', name: 'Georgia' },
  { code: 'DE', name: 'Germany' },
  { code: 'GH', name: 'Ghana' },
  { code: 'GI', name: 'Gibraltar' },
  { code: 'GR', name: 'Greece' },
  { code: 'GL', name: 'Greenland' },
  { code: 'GD', name: 'Grenada' },
  { code: 'GP', name: 'Guadeloupe' },
  { code: 'GU', name: 'Guam' },
  { code: 'GT', name: 'Guatemala' },
  { code: 'GG', name: 'Guernsey' },
  { code: 'GN', name: 'Guinea' },
  { code: 'GW', name: 'Guinea-Bissau' },
  { code: 'GY', name: 'Guyana' },
  { code: 'HT', name: 'Haiti' },
  { code: 'HM', name: 'Heard Island and McDonald Islands' },
  { code: 'VA', name: 'Holy See' },
  { code: 'HN', name: 'Honduras' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IS', name: 'Iceland' },
  { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IR', name: 'Iran' },
  { code: 'IQ', name: 'Iraq' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IM', name: 'Isle of Man' },
  { code: 'IL', name: 'Israel' },
  { code: 'IT', name: 'Italy' },
  { code: 'JM', name: 'Jamaica' },
  { code: 'JP', name: 'Japan' },
  { code: 'JE', name: 'Jersey' },
  { code: 'JO', name: 'Jordan' },
  { code: 'KZ', name: 'Kazakhstan' },
  { code: 'KE', name: 'Kenya' },
  { code: 'KI', name: 'Kiribati' },
  { code: 'KP', name: 'Korea (North)' },
  { code: 'KR', name: 'Korea (South)' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'KG', name: 'Kyrgyzstan' },
  { code: 'LA', name: 'Laos' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LB', name: 'Lebanon' },
  { code: 'LS', name: 'Lesotho' },
  { code: 'LR', name: 'Liberia' },
  { code: 'LY', name: 'Libya' },
  { code: 'LI', name: 'Liechtenstein' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MO', name: 'Macao' },
  { code: 'MK', name: 'Macedonia' },
  { code: 'MG', name: 'Madagascar' },
  { code: 'MW', name: 'Malawi' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'MV', name: 'Maldives' },
  { code: 'ML', name: 'Mali' },
  { code: 'MT', name: 'Malta' },
  { code: 'MH', name: 'Marshall Islands' },
  { code: 'MQ', name: 'Martinique' },
  { code: 'MR', name: 'Mauritania' },
  { code: 'MU', name: 'Mauritius' },
  { code: 'YT', name: 'Mayotte' },
  { code: 'MX', name: 'Mexico' },
  { code: 'FM', name: 'Micronesia' },
  { code: 'MD', name: 'Moldova' },
  { code: 'MC', name: 'Monaco' },
  { code: 'MN', name: 'Mongolia' },
  { code: 'ME', name: 'Montenegro' },
  { code: 'MS', name: 'Montserrat' },
  { code: 'MA', name: 'Morocco' },
  { code: 'MZ', name: 'Mozambique' },
  { code: 'MM', name: 'Myanmar' },
  { code: 'NA', name: 'Namibia' },
  { code: 'NR', name: 'Nauru' },
  { code: 'NP', name: 'Nepal' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NC', name: 'New Caledonia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'NI', name: 'Nicaragua' },
  { code: 'NE', name: 'Niger' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'NU', name: 'Niue' },
  { code: 'NF', name: 'Norfolk Island' },
  { code: 'MP', name: 'Northern Mariana Islands' },
  { code: 'NO', name: 'Norway' },
  { code: 'OM', name: 'Oman' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'PW', name: 'Palau' },
  { code: 'PS', name: 'Palestine' },
  { code: 'PA', name: 'Panama' },
  { code: 'PG', name: 'Papua New Guinea' },
  { code: 'PY', name: 'Paraguay' },
  { code: 'PE', name: 'Peru' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PN', name: 'Pitcairn' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'QA', name: 'Qatar' },
  { code: 'RE', name: 'Réunion' },
  { code: 'RO', name: 'Romania' },
  { code: 'RU', name: 'Russia' },
  { code: 'RW', name: 'Rwanda' },
  { code: 'BL', name: 'Saint Barthélemy' },
  { code: 'SH', name: 'Saint Helena' },
  { code: 'KN', name: 'Saint Kitts and Nevis' },
  { code: 'LC', name: 'Saint Lucia' },
  { code: 'MF', name: 'Saint Martin' },
  { code: 'PM', name: 'Saint Pierre and Miquelon' },
  { code: 'VC', name: 'Saint Vincent and the Grenadines' },
  { code: 'WS', name: 'Samoa' },
  { code: 'SM', name: 'San Marino' },
  { code: 'ST', name: 'Sao Tome and Principe' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'SN', name: 'Senegal' },
  { code: 'RS', name: 'Serbia' },
  { code: 'SC', name: 'Seychelles' },
  { code: 'SL', name: 'Sierra Leone' },
  { code: 'SG', name: 'Singapore' },
  { code: 'SX', name: 'Sint Maarten' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'SB', name: 'Solomon Islands' },
  { code: 'SO', name: 'Somalia' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'GS', name: 'South Georgia and the South Sandwich Islands' },
  { code: 'SS', name: 'South Sudan' },
  { code: 'ES', name: 'Spain' },
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'SD', name: 'Sudan' },
  { code: 'SR', name: 'Suriname' },
  { code: 'SJ', name: 'Svalbard and Jan Mayen' },
  { code: 'SE', name: 'Sweden' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'SY', name: 'Syria' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'TJ', name: 'Tajikistan' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'TH', name: 'Thailand' },
  { code: 'TL', name: 'Timor-Leste' },
  { code: 'TG', name: 'Togo' },
  { code: 'TK', name: 'Tokelau' },
  { code: 'TO', name: 'Tonga' },
  { code: 'TT', name: 'Trinidad and Tobago' },
  { code: 'TN', name: 'Tunisia' },
  { code: 'TR', name: 'Turkey' },
  { code: 'TM', name: 'Turkmenistan' },
  { code: 'TC', name: 'Turks and Caicos Islands' },
  { code: 'TV', name: 'Tuvalu' },
  { code: 'UG', name: 'Uganda' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'UM', name: 'United States Minor Outlying Islands' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'UZ', name: 'Uzbekistan' },
  { code: 'VU', name: 'Vanuatu' },
  { code: 'VE', name: 'Venezuela' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'VG', name: 'Virgin Islands (British)' },
  { code: 'VI', name: 'Virgin Islands (U.S.)' },
  { code: 'WF', name: 'Wallis and Futuna' },
  { code: 'EH', name: 'Western Sahara' },
  { code: 'YE', name: 'Yemen' },
  { code: 'ZM', name: 'Zambia' },
  { code: 'ZW', name: 'Zimbabwe' }
];

// Safe date formatting function
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'Not specified';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }
    return date.toLocaleDateString();
  } catch (error) {
    return 'Invalid date';
  }
};

// Status badge component
const StatusBadge = ({ status }: { status: string }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'submitted':
        return 'bg-yellow-100 text-yellow-800';
      case 'manager_approved':
        return 'bg-blue-100 text-blue-800';
      case 'final_approved':
        return 'bg-green-100 text-green-800';
      case 'concluded':
        return 'bg-blue-100 text-blue-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'draft':
        return 'Draft';
      case 'submitted':
        return 'Submitted';
      case 'manager_approved':
        return 'Manager Approved';
      case 'final_approved':
        return 'Final Approved';
      case 'concluded':
        return 'Concluded';
      case 'rejected':
        return 'Rejected';
      default:
        return status;
    }
  };

  return (
    <Badge className={getStatusColor(status)}>
      {getStatusText(status)}
    </Badge>
  );
};

// Trip request form component
const TripRequestForm = ({ onSuccess }: { onSuccess?: () => void }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [visaValidation, setVisaValidation] = useState<{
    valid: boolean;
    message: string;
    loading: boolean;
  }>({ valid: false, message: '', loading: false });
  
  // Get employees list for dropdown
  const { data: employees = [] } = useQuery({
    queryKey: ['/api/admin/users'],
    queryFn: () => apiRequest('GET', '/api/admin/users')
  });

  // Group employees by role for organized dropdown
  const groupedEmployees = React.useMemo(() => {
    const roleOrder = ['Superuser', 'General Manager', 'Senior Manager', 'Manager', 'Employee'];
    const groups: Record<string, any[]> = {};
    
    employees.forEach((employee: any) => {
      const role = employee.role || 'Employee';
      if (!groups[role]) {
        groups[role] = [];
      }
      groups[role].push(employee);
    });
    
    // Sort employees within each group alphabetically
    Object.values(groups).forEach(group => {
      group.sort((a, b) => {
        const nameA = a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.username;
        const nameB = b.firstName && b.lastName ? `${b.firstName} ${b.lastName}` : b.username;
        return nameA.localeCompare(nameB);
      });
    });
    
    return roleOrder.filter(role => groups[role]).map(role => ({
      role,
      employees: groups[role]
    }));
  }, [employees]);
  
  const form = useForm<TripFormData>({
    resolver: zodResolver(tripFormSchema),
    defaultValues: {
      employeeId: '',
      tripTitle: '',
      purpose: '',
      destination: '',
      fromDate: '',
      toDate: '',
      estimatedTravelCost: '0',
      estimatedAccommodationCost: '0',
      estimatedMiscCost: '0',
      advanceRequested: '0',
      supportingDocumentUrl: '',
    },
  });

  const createTripMutation = useMutation({
    mutationFn: (data: TripFormData) => apiRequest('POST', '/api/trips', data),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Trip request created successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/trips'] });
      form.reset();
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create trip request',
        variant: 'destructive',
      });
    },
  });

  // Function to check visa validity
  const checkVisaValidity = async (employeeId: string, destination: string, tripDate?: string) => {
    if (!employeeId || !destination) {
      setVisaValidation({ valid: false, message: '', loading: false });
      return;
    }

    setVisaValidation({ valid: false, message: '', loading: true });
    
    try {
      const params = new URLSearchParams({
        employeeId,
        destination,
        ...(tripDate && { tripDate })
      });
      
      const response = await apiRequest('GET', `/api/visa/check-validity?${params}`);
      
      setVisaValidation({
        valid: response.valid,
        message: response.message,
        loading: false
      });
    } catch (error) {
      console.error('Error checking visa validity:', error);
      setVisaValidation({
        valid: false,
        message: 'Error checking visa status',
        loading: false
      });
    }
  };

  // Watch for changes in employee and destination to trigger visa validation
  React.useEffect(() => {
    const employeeId = form.watch('employeeId');
    const destination = form.watch('destination');
    const fromDate = form.watch('fromDate');
    
    if (employeeId && destination) {
      checkVisaValidity(employeeId, destination, fromDate);
    } else {
      setVisaValidation({ valid: false, message: '', loading: false });
    }
  }, [form.watch('employeeId'), form.watch('destination'), form.watch('fromDate')]);

  const onSubmit = (data: TripFormData) => {
    // Add validation to prevent submission if no valid visa (for non-admin users)
    const user = (window as any).currentUser; // Assuming user context is available
    const isAdmin = user?.role === 'Superuser' || user?.role === 'General Manager';
    
    if (!visaValidation.valid && !isAdmin) {
      toast({
        title: 'Visa Required',
        description: 'A valid visa is required for this destination. Please contact HR to add visa records.',
        variant: 'destructive',
      });
      return;
    }
    
    createTripMutation.mutate(data);
  };

  const totalEstimatedCost = 
    parseFloat(form.watch('estimatedTravelCost') || '0') +
    parseFloat(form.watch('estimatedAccommodationCost') || '0') +
    parseFloat(form.watch('estimatedMiscCost') || '0');

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Employee Selection */}
        <FormField
          control={form.control}
          name="employeeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Employee *</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee for trip request" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {groupedEmployees.map((group) => (
                    <SelectGroup key={group.role}>
                      <SelectLabel className="text-blue-600 font-semibold">
                        {group.role}
                      </SelectLabel>
                      {group.employees.map((employee: any) => (
                        <SelectItem key={employee.id} value={employee.id.toString()}>
                          {employee.firstName && employee.lastName 
                            ? `${employee.firstName} ${employee.lastName}` 
                            : employee.username}
                          {employee.department && ` • ${employee.department}`}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="tripTitle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Trip Title</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Client Meeting in Mumbai" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="destination"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Destination Country *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select destination country" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {countries.map((country) => (
                      <SelectItem key={country.code} value={country.name}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="purpose"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Purpose of Travel</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Describe the purpose of your business trip..." 
                  rows={3}
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="fromDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>From Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="toDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>To Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Estimated Costs</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="estimatedTravelCost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Travel Cost (₹)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="estimatedAccommodationCost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Accommodation Cost (₹)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="estimatedMiscCost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Miscellaneous Cost (₹)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="font-medium">Total Estimated Cost:</span>
              <span className="text-lg font-bold text-blue-600">₹{totalEstimatedCost.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <FormField
          control={form.control}
          name="advanceRequested"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Advance Requested (₹)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" placeholder="0" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="supportingDocumentUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Supporting Document URL</FormLabel>
              <FormControl>
                <Input placeholder="https://..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-4">
          <Button type="button" variant="outline" onClick={() => form.reset()}>
            Reset
          </Button>
          <Button type="submit" disabled={createTripMutation.isPending}>
            {createTripMutation.isPending ? 'Creating...' : 'Create Trip Request'}
          </Button>
        </div>
      </form>
    </Form>
  );
};

// Trip dashboard component with comprehensive search and filter
const TripDashboard = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [destinationFilter, setDestinationFilter] = useState('all');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');
  const [viewingTrip, setViewingTrip] = useState<any>(null);
  const [editingTrip, setEditingTrip] = useState<any>(null);

  const { data: dashboard } = useQuery({
    queryKey: ['/api/trips/dashboard'],
    queryFn: () => apiRequest('GET', '/api/trips/dashboard'),
  });

  const { data: trips } = useQuery({
    queryKey: ['/api/trips/all'],
    queryFn: () => apiRequest('GET', '/api/trips/all'),
  });

  const { data: users } = useQuery({
    queryKey: ['/api/admin/users'],
    queryFn: () => apiRequest('GET', '/api/admin/users'),
  });

  // Memoized grouped users for role-based dropdown
  const groupedUsers = React.useMemo(() => {
    const roleOrder = ['Superuser', 'General Manager', 'Senior Manager', 'Manager', 'Employee'];
    const groups: Record<string, any[]> = {};
    
    users?.forEach((user: any) => {
      const role = user.role || 'Employee';
      if (!groups[role]) {
        groups[role] = [];
      }
      groups[role].push(user);
    });
    
    // Sort users within each group alphabetically
    Object.values(groups).forEach(group => {
      group.sort((a, b) => {
        const nameA = a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.username;
        const nameB = b.firstName && b.lastName ? `${b.firstName} ${b.lastName}` : b.username;
        return nameA.localeCompare(nameB);
      });
    });
    
    return roleOrder.filter(role => groups[role]).map(role => ({
      role,
      users: groups[role]
    }));
  }, [users]);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteTripMutation = useMutation({
    mutationFn: (tripId: number) => apiRequest('DELETE', `/api/trips/${tripId}`),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Trip request deleted successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/trips/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trips/dashboard'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const submitTripMutation = useMutation({
    mutationFn: (tripId: number) => apiRequest('POST', `/api/trips/${tripId}/submit`),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Trip submitted for approval successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/trips/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trips/dashboard'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit trip',
        variant: 'destructive',
      });
    },
  });

  const concludeTripMutation = useMutation({
    mutationFn: (tripId: number) => apiRequest('POST', `/api/trips/${tripId}/conclude`),
    onSuccess: (data: any) => {
      toast({
        title: 'Success',
        description: data.autoLinked 
          ? 'Trip concluded successfully and automatically linked to EU 180-Day Tracker'
          : 'Trip concluded successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/trips/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trips/dashboard'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to conclude trip',
        variant: 'destructive',
      });
    },
  });

  if (!dashboard) return <div>Loading dashboard...</div>;

  const statusCounts = dashboard.statusCounts || [];
  const upcomingTrips = dashboard.upcomingTrips || [];
  const pendingApprovals = dashboard.pendingApprovals || [];

  // Generate unique values for filter dropdowns
  const uniqueStatuses = ['all', ...new Set(trips?.map((trip: any) => trip.status).filter(Boolean) || [])];
  const uniqueEmployees = ['all', ...new Set(trips?.map((trip: any) => trip.employeeName).filter(Boolean) || [])];
  const uniqueDestinations = ['all', ...new Set(trips?.map((trip: any) => trip.destination).filter(Boolean) || [])];

  // Filter trips based on all criteria
  const filteredTrips = trips?.filter((trip: any) => {
    const matchesSearch = !searchQuery || 
      trip.tripTitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      trip.destination?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      trip.employeeName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      trip.purpose?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || trip.status === statusFilter;
    const matchesEmployee = employeeFilter === 'all' || trip.employeeName === employeeFilter;
    const matchesDestination = destinationFilter === 'all' || trip.destination === destinationFilter;

    const matchesFromDate = !fromDateFilter || new Date(trip.fromDate) >= new Date(fromDateFilter);
    const matchesToDate = !toDateFilter || new Date(trip.toDate) <= new Date(toDateFilter);

    return matchesSearch && matchesStatus && matchesEmployee && matchesDestination && matchesFromDate && matchesToDate;
  }) || [];

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || employeeFilter !== 'all' || destinationFilter !== 'all' || fromDateFilter || toDateFilter;

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setEmployeeFilter('all');
    setDestinationFilter('all');
    setFromDateFilter('');
    setToDateFilter('');
  };

  const handleView = (trip: any) => {
    setViewingTrip(trip);
  };

  const handleEdit = (trip: any) => {
    setEditingTrip(trip);
  };

  const handleDelete = (trip: any) => {
    if (window.confirm(`Are you sure you want to delete the trip "${trip.tripTitle}"?`)) {
      deleteTripMutation.mutate(trip.id);
    }
  };

  const handleSubmit = (trip: any) => {
    if (confirm(`Are you sure you want to submit the trip "${trip.tripTitle}" for approval? Once submitted, you cannot edit the trip details.`)) {
      submitTripMutation.mutate(trip.id);
    }
  };

  const handleConclude = (trip: any) => {
    if (confirm(`Are you sure you want to mark this trip "${trip.tripTitle}" as concluded? This action cannot be undone and will automatically create a travel entry in the EU 180-Day Tracker if the destination is in the Schengen Area.`)) {
      concludeTripMutation.mutate(trip.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and Filter Section - Top Priority */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search & Filter All Trip Requests
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search trips by title, destination, employee, or purpose..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Filters Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {/* Status Filter */}
            <div>
              <Label className="text-sm font-medium">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {uniqueStatuses.filter(status => status !== 'all').map((status: string) => (
                    <SelectItem key={status} value={status}>
                      {status.replace('_', ' ').toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Employee Filter */}
            <div>
              <Label className="text-sm font-medium">Employee</Label>
              <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {groupedUsers.map(({ role, users: roleUsers }) => (
                    <SelectGroup key={role}>
                      <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">
                        {role}s
                      </SelectLabel>
                      {roleUsers.map((user: any) => (
                        <SelectItem key={user.id} value={user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.username}>
                          {user.firstName && user.lastName ? 
                            `${user.firstName} ${user.lastName}` : 
                            user.username}
                          {user.department && ` • ${user.department}`}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Destination Filter */}
            <div>
              <Label className="text-sm font-medium">Destination</Label>
              <Select value={destinationFilter} onValueChange={setDestinationFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Destinations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Destinations</SelectItem>
                  {uniqueDestinations.filter(dest => dest !== 'all').map((destination: string) => (
                    <SelectItem key={destination} value={destination}>
                      {destination}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* From Date Filter */}
            <div>
              <Label className="text-sm font-medium">From Date (After)</Label>
              <Input
                type="date"
                value={fromDateFilter}
                onChange={(e) => setFromDateFilter(e.target.value)}
              />
            </div>

            {/* To Date Filter */}
            <div>
              <Label className="text-sm font-medium">To Date (Before)</Label>
              <Input
                type="date"
                value={toDateFilter}
                onChange={(e) => setToDateFilter(e.target.value)}
              />
            </div>
          </div>

          {/* Clear Filters & Results Summary */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-4">
              <p className="text-sm text-gray-600">
                Showing {filteredTrips.length} of {trips?.length || 0} trip requests
              </p>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear Filters
                </Button>
              )}
            </div>
            {filteredTrips.length === 0 && trips?.length > 0 && (
              <p className="text-sm text-amber-600">No trips match your current filters</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {statusCounts.map((status: any) => (
          <Card key={status.status}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 capitalize">{status.status.replace('_', ' ')}</p>
                  <p className="text-2xl font-bold">{status.count}</p>
                  {status.status === 'draft' && (
                    <p className="text-xs text-gray-500 mt-1">
                      Need to be submitted for approval
                    </p>
                  )}
                </div>
                <div className="text-blue-600">
                  {status.status === 'final_approved' && <CheckCircle className="h-8 w-8" />}
                  {status.status === 'rejected' && <XCircle className="h-8 w-8" />}
                  {status.status === 'submitted' && <Clock className="h-8 w-8" />}
                  {status.status === 'draft' && <FileText className="h-8 w-8" />}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* All Trip Requests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5" />
            All Trip Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredTrips.map((trip: any) => (
              <Card key={trip.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    {/* Trip Info - Single Line */}
                    <div className="flex items-center gap-6 flex-1">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-base truncate">{trip.tripTitle}</h3>
                      </div>
                      
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <MapPin className="h-4 w-4" />
                        <span className="whitespace-nowrap">{trip.destination}</span>
                      </div>
                      
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="h-4 w-4" />
                        <span className="whitespace-nowrap">
                          {formatDate(trip.fromDate)} - {formatDate(trip.toDate)}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <DollarSign className="h-4 w-4" />
                        <span className="whitespace-nowrap">
                          ₹{(parseFloat(trip.estimatedTravelCost) + parseFloat(trip.estimatedAccommodationCost) + parseFloat(trip.estimatedMiscCost)).toFixed(2)}
                        </span>
                      </div>
                      
                      <StatusBadge status={trip.status} />
                    </div>

                    {/* 3-Dot Actions Menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleView(trip)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEdit(trip)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        {trip.status === 'draft' && (
                          <DropdownMenuItem 
                            onClick={() => handleSubmit(trip)}
                            className="text-blue-600 focus:text-blue-600"
                          >
                            <Send className="mr-2 h-4 w-4" />
                            Submit for Approval
                          </DropdownMenuItem>
                        )}
                        {trip.status === 'final_approved' && (
                          <DropdownMenuItem 
                            onClick={() => handleConclude(trip)}
                            className="text-green-600 focus:text-green-600"
                          >
                            <CheckSquare className="mr-2 h-4 w-4" />
                            Conclude Trip
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem 
                          onClick={() => handleDelete(trip)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* View Trip Dialog */}
      {viewingTrip && (
        <Dialog open={!!viewingTrip} onOpenChange={() => setViewingTrip(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Trip Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Trip Title</Label>
                  <p className="text-sm text-gray-700">{viewingTrip.tripTitle}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Employee</Label>
                  <p className="text-sm text-gray-700">{viewingTrip.employeeName}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium">Destination</Label>
                  <p className="text-sm text-gray-700">{viewingTrip.destination}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">From Date</Label>
                  <p className="text-sm text-gray-700">{formatDate(viewingTrip.fromDate)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">To Date</Label>
                  <p className="text-sm text-gray-700">{formatDate(viewingTrip.toDate)}</p>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Purpose</Label>
                <p className="text-sm text-gray-700">{viewingTrip.purpose}</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium">Travel Cost</Label>
                  <p className="text-sm text-gray-700">₹{parseFloat(viewingTrip.estimatedTravelCost).toFixed(2)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Accommodation Cost</Label>
                  <p className="text-sm text-gray-700">₹{parseFloat(viewingTrip.estimatedAccommodationCost).toFixed(2)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Misc Cost</Label>
                  <p className="text-sm text-gray-700">₹{parseFloat(viewingTrip.estimatedMiscCost).toFixed(2)}</p>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Status</Label>
                <div className="mt-1">
                  <StatusBadge status={viewingTrip.status} />
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Trip Dialog */}
      {editingTrip && (
        <Dialog open={!!editingTrip} onOpenChange={() => setEditingTrip(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Trip Request</DialogTitle>
            </DialogHeader>
            <TripEditForm 
              trip={editingTrip} 
              onSuccess={() => setEditingTrip(null)} 
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

// Trip edit form component
const TripEditForm = ({ trip, onSuccess }: { trip: any; onSuccess?: () => void }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Get employees list for dropdown
  const { data: employees = [] } = useQuery({
    queryKey: ['/api/admin/users'],
    queryFn: () => apiRequest('GET', '/api/admin/users')
  });

  // Group employees by role for organized dropdown
  const groupedEmployees = React.useMemo(() => {
    const roleOrder = ['Superuser', 'General Manager', 'Senior Manager', 'Manager', 'Employee'];
    const groups: Record<string, any[]> = {};
    
    employees.forEach((employee: any) => {
      const role = employee.role || 'Employee';
      if (!groups[role]) {
        groups[role] = [];
      }
      groups[role].push(employee);
    });
    
    // Sort employees within each group alphabetically
    Object.values(groups).forEach(group => {
      group.sort((a, b) => {
        const nameA = a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.username;
        const nameB = b.firstName && b.lastName ? `${b.firstName} ${b.lastName}` : b.username;
        return nameA.localeCompare(nameB);
      });
    });
    
    return roleOrder.filter(role => groups[role]).map(role => ({
      role,
      employees: groups[role]
    }));
  }, [employees]);
  
  const form = useForm<TripFormData>({
    resolver: zodResolver(tripFormSchema),
    defaultValues: {
      employeeId: trip.employeeId?.toString() || '',
      tripTitle: trip.tripTitle || '',
      purpose: trip.purpose || '',
      destination: trip.destination || '',
      fromDate: trip.fromDate ? new Date(trip.fromDate).toISOString().split('T')[0] : '',
      toDate: trip.toDate ? new Date(trip.toDate).toISOString().split('T')[0] : '',
      estimatedTravelCost: trip.estimatedTravelCost?.toString() || '0',
      estimatedAccommodationCost: trip.estimatedAccommodationCost?.toString() || '0',
      estimatedMiscCost: trip.estimatedMiscCost?.toString() || '0',
      advanceRequested: trip.advanceRequested?.toString() || '0',
      supportingDocumentUrl: trip.supportingDocumentUrl || '',
    },
  });

  const updateTripMutation = useMutation({
    mutationFn: (data: TripFormData) => apiRequest('PUT', `/api/trips/${trip.id}`, data),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Trip request updated successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/trips/all'] });
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update trip request',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: TripFormData) => {
    updateTripMutation.mutate(data);
  };

  const totalEstimatedCost = 
    parseFloat(form.watch('estimatedTravelCost') || '0') +
    parseFloat(form.watch('estimatedAccommodationCost') || '0') +
    parseFloat(form.watch('estimatedMiscCost') || '0');

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Employee Selection */}
        <FormField
          control={form.control}
          name="employeeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Employee *</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee for trip request" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {groupedEmployees.map((group) => (
                    <SelectGroup key={group.role}>
                      <SelectLabel className="text-blue-600 font-semibold">
                        {group.role}
                      </SelectLabel>
                      {group.employees.map((employee: any) => (
                        <SelectItem key={employee.id} value={employee.id.toString()}>
                          {employee.firstName && employee.lastName 
                            ? `${employee.firstName} ${employee.lastName}` 
                            : employee.username}
                          {employee.department && ` • ${employee.department}`}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="tripTitle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Trip Title</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Client Meeting in Mumbai" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="destination"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Destination Country *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select destination country" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {countries.map((country) => (
                      <SelectItem key={country.code} value={country.name}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="purpose"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Purpose of Travel</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Describe the purpose of your business trip..." 
                  rows={3}
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="fromDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>From Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="toDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>To Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Estimated Costs</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="estimatedTravelCost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Travel Cost (₹)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="estimatedAccommodationCost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Accommodation Cost (₹)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="estimatedMiscCost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Miscellaneous Cost (₹)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
          <div className="bg-gray-50 p-4 rounded-md">
            <p className="text-sm font-medium">Total Estimated Cost: ₹{totalEstimatedCost.toFixed(2)}</p>
          </div>
        </div>

        <FormField
          control={form.control}
          name="advanceRequested"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Advance Payment Requested (₹)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" placeholder="0" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={onSuccess}>
            Cancel
          </Button>
          <Button type="submit" disabled={updateTripMutation.isPending}>
            {updateTripMutation.isPending ? 'Updating...' : 'Update Trip Request'}
          </Button>
        </div>
      </form>
    </Form>
  );
};

// Trip list component
const TripList = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingTrip, setEditingTrip] = useState<any>(null);
  const [viewingTrip, setViewingTrip] = useState<any>(null);
  
  // Filter and search states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [destinationFilter, setDestinationFilter] = useState('all');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');
  
  const { data: trips, isLoading } = useQuery({
    queryKey: ['/api/trips/all'],
    queryFn: () => apiRequest('GET', '/api/trips/all'),
  });

  // Get employees list for filter dropdown
  const { data: employees = [] } = useQuery({
    queryKey: ['/api/admin/users'],
    queryFn: () => apiRequest('GET', '/api/admin/users')
  });

  // Filter and search logic
  const filteredTrips = React.useMemo(() => {
    if (!trips) return [];
    
    return trips.filter((trip: any) => {
      // Search query filter (searches in title, destination, employee name)
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || 
        trip.tripTitle?.toLowerCase().includes(searchLower) ||
        trip.destination?.toLowerCase().includes(searchLower) ||
        trip.employeeName?.toLowerCase().includes(searchLower) ||
        trip.purpose?.toLowerCase().includes(searchLower);
      
      // Status filter
      const matchesStatus = statusFilter === 'all' || trip.status === statusFilter;
      
      // Employee filter
      const matchesEmployee = employeeFilter === 'all' || trip.employeeId?.toString() === employeeFilter;
      
      // Destination filter
      const matchesDestination = destinationFilter === 'all' || trip.destination === destinationFilter;
      
      // Date range filters
      let matchesFromDate = true;
      let matchesToDate = true;
      
      if (fromDateFilter && trip.fromDate) {
        matchesFromDate = new Date(trip.fromDate) >= new Date(fromDateFilter);
      }
      
      if (toDateFilter && trip.toDate) {
        matchesToDate = new Date(trip.toDate) <= new Date(toDateFilter);
      }
      
      return matchesSearch && matchesStatus && matchesEmployee && matchesDestination && matchesFromDate && matchesToDate;
    });
  }, [trips, searchQuery, statusFilter, employeeFilter, destinationFilter, fromDateFilter, toDateFilter]);

  // Get unique destinations for filter
  const uniqueDestinations = React.useMemo(() => {
    if (!trips) return [];
    const destinations = [...new Set(trips.map((trip: any) => trip.destination))];
    return destinations.filter(Boolean).sort();
  }, [trips]);

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setEmployeeFilter('all');
    setDestinationFilter('all');
    setFromDateFilter('');
    setToDateFilter('');
  };

  const deleteTripMutation = useMutation({
    mutationFn: (tripId: number) => apiRequest('DELETE', `/api/trips/${tripId}`),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Trip request deleted successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/trips/all'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete trip request',
        variant: 'destructive',
      });
    },
  });

  const submitTripMutation = useMutation({
    mutationFn: (tripId: number) => apiRequest('POST', `/api/trips/${tripId}/submit`),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Trip submitted for approval successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/trips/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trips/dashboard'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit trip',
        variant: 'destructive',
      });
    },
  });

  const concludeTripMutation = useMutation({
    mutationFn: (tripId: number) => apiRequest('POST', `/api/trips/${tripId}/conclude`),
    onSuccess: (data: any) => {
      toast({
        title: 'Success',
        description: data.autoLinked 
          ? 'Trip concluded successfully and automatically linked to EU 180-Day Tracker'
          : 'Trip concluded successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/trips/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trips/dashboard'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to conclude trip',
        variant: 'destructive',
      });
    },
  });

  const handleEdit = (trip: any) => {
    setEditingTrip(trip);
  };

  const handleView = (trip: any) => {
    setViewingTrip(trip);
  };

  const handleSubmit = (trip: any) => {
    if (confirm(`Are you sure you want to submit the trip "${trip.tripTitle}" for approval? Once submitted, you cannot edit the trip details.`)) {
      submitTripMutation.mutate(trip.id);
    }
  };

  const handleDelete = (trip: any) => {
    if (confirm(`Are you sure you want to delete the trip request "${trip.tripTitle}"?`)) {
      deleteTripMutation.mutate(trip.id);
    }
  };

  const handleConclude = (trip: any) => {
    if (confirm(`Are you sure you want to mark this trip "${trip.tripTitle}" as concluded? This action cannot be undone and will automatically create a travel entry in the EU 180-Day Tracker if the destination is in the Schengen Area.`)) {
      concludeTripMutation.mutate(trip.id);
    }
  };

  if (isLoading) return <div>Loading trips...</div>;

  return (
    <div className="space-y-6">
      {/* Search and Filter Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search & Filter Trip Requests
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Bar */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search by trip title, destination, employee name, or purpose..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            {(searchQuery || statusFilter !== 'all' || employeeFilter !== 'all' || destinationFilter !== 'all' || fromDateFilter || toDateFilter) && (
              <Button variant="outline" onClick={clearFilters} className="whitespace-nowrap">
                <X className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            )}
          </div>

          {/* Filter Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Status Filter */}
            <div>
              <Label className="text-sm font-medium">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="manager_approved">Manager Approved</SelectItem>
                  <SelectItem value="admin_approved">Admin Approved</SelectItem>
                  <SelectItem value="finance_approved">Finance Approved</SelectItem>
                  <SelectItem value="final_approved">Final Approved</SelectItem>
                  <SelectItem value="concluded">Concluded</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Employee Filter */}
            <div>
              <Label className="text-sm font-medium">Employee</Label>
              <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {employees.map((employee: any) => (
                    <SelectItem key={employee.id} value={employee.id.toString()}>
                      {employee.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Destination Filter */}
            <div>
              <Label className="text-sm font-medium">Destination</Label>
              <Select value={destinationFilter} onValueChange={setDestinationFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Destinations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Destinations</SelectItem>
                  {uniqueDestinations.map((destination: string) => (
                    <SelectItem key={destination} value={destination}>
                      {destination}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* From Date Filter */}
            <div>
              <Label className="text-sm font-medium">From Date (After)</Label>
              <Input
                type="date"
                value={fromDateFilter}
                onChange={(e) => setFromDateFilter(e.target.value)}
              />
            </div>

            {/* To Date Filter */}
            <div>
              <Label className="text-sm font-medium">To Date (Before)</Label>
              <Input
                type="date"
                value={toDateFilter}
                onChange={(e) => setToDateFilter(e.target.value)}
              />
            </div>
          </div>

          {/* Results Summary */}
          <div className="flex items-center justify-between pt-2 border-t">
            <p className="text-sm text-gray-600">
              Showing {filteredTrips.length} of {trips?.length || 0} trip requests
            </p>
            {filteredTrips.length === 0 && trips?.length > 0 && (
              <p className="text-sm text-amber-600">No trips match your current filters</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Trip List */}
      <div className="space-y-2">
        {filteredTrips?.map((trip: any) => (
          <Card key={trip.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                {/* Trip Info - Single Line */}
                <div className="flex items-center gap-6 flex-1">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-base truncate">{trip.tripTitle}</h3>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="h-4 w-4" />
                    <span className="whitespace-nowrap">{trip.destination}</span>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="h-4 w-4" />
                    <span className="whitespace-nowrap">
                      {formatDate(trip.fromDate)} - {formatDate(trip.toDate)}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <DollarSign className="h-4 w-4" />
                    <span className="whitespace-nowrap">
                      ₹{(parseFloat(trip.estimatedTravelCost) + parseFloat(trip.estimatedAccommodationCost) + parseFloat(trip.estimatedMiscCost)).toFixed(2)}
                    </span>
                  </div>
                  
                  <StatusBadge status={trip.status} />
                </div>

                {/* 3-Dot Actions Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleView(trip)}>
                      <Eye className="mr-2 h-4 w-4" />
                      View
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleEdit(trip)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    {trip.status === 'draft' && (
                      <DropdownMenuItem 
                        onClick={() => handleSubmit(trip)}
                        className="text-blue-600 focus:text-blue-600"
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Submit for Approval
                      </DropdownMenuItem>
                    )}
                    {trip.status === 'final_approved' && (
                      <DropdownMenuItem 
                        onClick={() => handleConclude(trip)}
                        className="text-green-600 focus:text-green-600"
                      >
                        <CheckSquare className="mr-2 h-4 w-4" />
                        Conclude Trip
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem 
                      onClick={() => handleDelete(trip)}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* View Trip Dialog */}
      {viewingTrip && (
        <Dialog open={!!viewingTrip} onOpenChange={() => setViewingTrip(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Trip Request Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Trip Title</Label>
                  <p className="text-sm text-gray-700">{viewingTrip.tripTitle}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Destination</Label>
                  <p className="text-sm text-gray-700">{viewingTrip.destination}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">From Date</Label>
                  <p className="text-sm text-gray-700">{formatDate(viewingTrip.fromDate)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">To Date</Label>
                  <p className="text-sm text-gray-700">{formatDate(viewingTrip.toDate)}</p>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Purpose</Label>
                <p className="text-sm text-gray-700">{viewingTrip.purpose}</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium">Travel Cost</Label>
                  <p className="text-sm text-gray-700">₹{parseFloat(viewingTrip.estimatedTravelCost).toFixed(2)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Accommodation Cost</Label>
                  <p className="text-sm text-gray-700">₹{parseFloat(viewingTrip.estimatedAccommodationCost).toFixed(2)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Misc Cost</Label>
                  <p className="text-sm text-gray-700">₹{parseFloat(viewingTrip.estimatedMiscCost).toFixed(2)}</p>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Status</Label>
                <div className="mt-1">
                  <StatusBadge status={viewingTrip.status} />
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Trip Dialog */}
      {editingTrip && (
        <Dialog open={!!editingTrip} onOpenChange={() => setEditingTrip(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Trip Request</DialogTitle>
            </DialogHeader>
            <TripEditForm 
              trip={editingTrip} 
              onSuccess={() => setEditingTrip(null)} 
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

// Document Upload Component
const DocumentUploadForm = ({ tripId, onSuccess }: { tripId: number; onSuccess?: () => void }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const form = useForm<DocumentUploadData>({
    resolver: zodResolver(documentUploadSchema),
    defaultValues: {
      documentType: '',
      description: '',
    },
  });

  const uploadDocument = useMutation({
    mutationFn: async (data: { file: File; documentType: string; description?: string }) => {
      const formData = new FormData();
      formData.append('file', data.file);
      formData.append('documentType', data.documentType);
      if (data.description) {
        formData.append('description', data.description);
      }

      const response = await fetch(`/api/trips/${tripId}/documents`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Document uploaded successfully',
      });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/documents`] });
      form.reset();
      setSelectedFile(null);
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setSelectedFile(file || null);
  };

  const onSubmit = (data: DocumentUploadData) => {
    if (!selectedFile) {
      toast({
        title: 'Error',
        description: 'Please select a file to upload',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    uploadDocument.mutate({
      file: selectedFile,
      documentType: data.documentType,
      description: data.description || undefined,
    }, {
      onSettled: () => setIsUploading(false),
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="documentType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Document Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select document type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {documentTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Brief description of the document" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="file">Select File</Label>
            <div className="flex items-center space-x-2">
              <Input
                id="file"
                type="file"
                onChange={handleFileChange}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.txt,.zip"
                className="flex-1"
              />
              <Upload className="h-4 w-4 text-gray-500" />
            </div>
            {selectedFile && (
              <div className="text-sm text-gray-600">
                Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
              </div>
            )}
            <div className="text-xs text-gray-500">
              Supported formats: PDF, DOC, DOCX, XLS, XLSX, Images, TXT, ZIP (Max 50MB)
            </div>
          </div>

          <Button 
            type="submit" 
            disabled={isUploading || !selectedFile || !form.watch('documentType')}
            className="w-full"
          >
            {isUploading ? (
              <>
                <Upload className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload Document
              </>
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
};

// Trip Documents List Component
const TripDocumentsList = ({ tripId }: { tripId: number }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: documents = [], isLoading } = useQuery({
    queryKey: [`/api/trips/${tripId}/documents`],
    queryFn: () => apiRequest('GET', `/api/trips/${tripId}/documents`),
  });

  const deleteDocument = useMutation({
    mutationFn: (documentId: number) => 
      apiRequest('DELETE', `/api/trip-documents/${documentId}`),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Document deleted successfully',
      });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/documents`] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete document',
        variant: 'destructive',
      });
    },
  });

  const downloadDocument = async (documentId: number) => {
    try {
      const response = await apiRequest('GET', `/api/trip-documents/${documentId}/download`);
      window.open(response.downloadUrl, '_blank');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to download document',
        variant: 'destructive',
      });
    }
  };

  const getDocumentIcon = (fileType: string) => {
    if (fileType?.includes('pdf')) return <FileText className="h-4 w-4 text-red-600" />;
    if (fileType?.includes('image')) return <Eye className="h-4 w-4 text-blue-600" />;
    if (fileType?.includes('document') || fileType?.includes('word')) return <FileText className="h-4 w-4 text-blue-600" />;
    if (fileType?.includes('sheet') || fileType?.includes('excel')) return <FileText className="h-4 w-4 text-green-600" />;
    return <Paperclip className="h-4 w-4 text-gray-600" />;
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return 'Unknown';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDocumentType = (type: string) => {
    return documentTypeOptions.find(opt => opt.value === type)?.label || type;
  };

  if (isLoading) {
    return <div className="text-center py-4">Loading documents...</div>;
  }

  if (!documents.length) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Paperclip className="h-12 w-12 mx-auto mb-4 text-gray-300" />
        <p>No documents uploaded yet</p>
        <p className="text-sm">Upload travel documents to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {documents.map((doc: any) => (
        <div key={doc.id} className="border rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3 flex-1">
              {getDocumentIcon(doc.fileType)}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-sm truncate">{doc.documentName}</h4>
                <div className="text-xs text-gray-500 mt-1 space-y-1">
                  <div>Type: {formatDocumentType(doc.documentType)}</div>
                  <div>Size: {formatFileSize(doc.fileSize)}</div>
                  <div>Uploaded by: {doc.uploadedByName}</div>
                  <div>Date: {formatDate(doc.uploadedAt)}</div>
                  {doc.description && (
                    <div className="text-gray-600">Description: {doc.description}</div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2 ml-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadDocument(doc.id)}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => deleteDocument.mutate(doc.id)}
                disabled={deleteDocument.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Trip Approvals Tab Component
const TripApprovalsTab = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Get all submitted trip requests that need approval
  const { data: pendingTrips = [], isLoading } = useQuery({
    queryKey: ['/api/trips/all'],
    queryFn: () => apiRequest('GET', '/api/trips/all'),
  });

  // Filter for trips that need approval (submitted status)
  const tripsAwaitingApproval = pendingTrips.filter((trip: any) => trip.status === 'submitted');

  const approveTripMutation = useMutation({
    mutationFn: ({ tripId, action, comments }: { tripId: number; action: 'approve' | 'reject'; comments?: string }) => 
      apiRequest('POST', `/api/trips/${tripId}/approve`, { action, comments, approvalType: 'admin' }),
    onSuccess: (data, variables) => {
      toast({
        title: 'Success',
        description: `Trip request ${variables.action === 'approve' ? 'approved' : 'rejected'} successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/trips/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trips/dashboard'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to process approval',
        variant: 'destructive',
      });
    },
  });

  const handleApproval = (tripId: number, action: 'approve' | 'reject', comments?: string) => {
    approveTripMutation.mutate({ tripId, action, comments });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading pending approvals...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Pending Trip Approvals ({tripsAwaitingApproval.length})
          </CardTitle>
          <CardDescription>
            Review and approve business trip requests from your team members
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tripsAwaitingApproval.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-600">No pending approvals</p>
              <p className="text-sm text-gray-500 mb-3">All submitted trip requests have been reviewed</p>
              <div className="bg-blue-50 p-3 rounded border border-blue-200 mt-4">
                <p className="text-xs text-blue-700">
                  <strong>Note:</strong> Draft trips (visible in Dashboard) must be submitted by employees before appearing here for approval.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {tripsAwaitingApproval.map((trip: any) => (
                <TripApprovalCard 
                  key={trip.id} 
                  trip={trip} 
                  onApproval={handleApproval}
                  isProcessing={approveTripMutation.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Trip Approval Card Component
const TripApprovalCard = ({ 
  trip, 
  onApproval, 
  isProcessing 
}: { 
  trip: any; 
  onApproval: (tripId: number, action: 'approve' | 'reject', comments?: string) => void;
  isProcessing: boolean;
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [rejectComments, setRejectComments] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  const totalCost = parseFloat(trip.estimatedTravelCost || '0') + 
                   parseFloat(trip.estimatedAccommodationCost || '0') + 
                   parseFloat(trip.estimatedMiscCost || '0');

  const tripDuration = (() => {
    try {
      const fromDate = new Date(trip.fromDate);
      const toDate = new Date(trip.toDate);
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return 0;
      return Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    } catch {
      return 0;
    }
  })();

  return (
    <Card className="border-l-4 border-l-yellow-400">
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">{trip.tripTitle}</h3>
              <p className="text-sm text-gray-600">
                Requested by: <span className="font-medium">{trip.employeeName}</span>
              </p>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {trip.destination}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {formatDate(trip.fromDate)} - {formatDate(trip.toDate)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {tripDuration} days
                </span>
              </div>
            </div>
            <StatusBadge status={trip.status} />
          </div>

          {/* Summary Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm text-blue-600 font-medium">Total Estimated Cost</p>
              <p className="text-lg font-bold text-blue-700">₹{totalCost.toLocaleString()}</p>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <p className="text-sm text-green-600 font-medium">Advance Requested</p>
              <p className="text-lg font-bold text-green-700">₹{parseFloat(trip.advanceRequested || '0').toLocaleString()}</p>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-sm text-gray-600 font-medium">Submitted</p>
              <p className="text-lg font-bold text-gray-700">{formatDate(trip.createdAt)}</p>
            </div>
          </div>

          {/* Purpose */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">Purpose of Travel:</p>
            <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded">{trip.purpose}</p>
          </div>

          {/* Details Toggle */}
          <div className="border-t pt-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowDetails(!showDetails)}
              className="mb-4"
            >
              {showDetails ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-2" />
                  Hide Details
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-2" />
                  Show Details
                </>
              )}
            </Button>

            {showDetails && (
              <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium">Cost Breakdown</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Travel Cost</p>
                    <p className="font-medium">₹{parseFloat(trip.estimatedTravelCost || '0').toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Accommodation</p>
                    <p className="font-medium">₹{parseFloat(trip.estimatedAccommodationCost || '0').toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Miscellaneous</p>
                    <p className="font-medium">₹{parseFloat(trip.estimatedMiscCost || '0').toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setShowRejectDialog(true)}
              disabled={isProcessing}
              className="text-red-600 border-red-300 hover:bg-red-50"
            >
              <X className="h-4 w-4 mr-2" />
              Reject
            </Button>
            <Button
              onClick={() => onApproval(trip.id, 'approve')}
              disabled={isProcessing}
              className="bg-green-600 hover:bg-green-700"
            >
              <Check className="h-4 w-4 mr-2" />
              Approve
            </Button>
          </div>
        </div>

        {/* Reject Dialog */}
        <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Trip Request</DialogTitle>
              <DialogDescription>
                Please provide a reason for rejecting this trip request. This will help the employee understand your decision.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="comments">Rejection Reason</Label>
                <Textarea
                  id="comments"
                  placeholder="Please explain why this trip request is being rejected..."
                  value={rejectComments}
                  onChange={(e) => setRejectComments(e.target.value)}
                  rows={4}
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    onApproval(trip.id, 'reject', rejectComments);
                    setShowRejectDialog(false);
                    setRejectComments('');
                  }}
                  disabled={isProcessing}
                >
                  Reject Trip
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

// Trip Documents Tab Component
const TripDocumentsTab = () => {
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);

  const { data: trips = [], isLoading } = useQuery({
    queryKey: ['/api/trips/all'],
    queryFn: () => apiRequest('GET', '/api/trips/all'),
  });

  if (isLoading) {
    return <div className="text-center py-8">Loading trips...</div>;
  }

  if (!trips.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trip Documents</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8 text-gray-500">
          <Paperclip className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p>No trips found</p>
          <p className="text-sm">Create a trip request first to upload documents</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Trip Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Trip to Manage Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {trips.map((trip: any) => (
              <div
                key={trip.id}
                className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                  selectedTripId === trip.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedTripId(trip.id)}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm truncate">{trip.tripTitle}</h4>
                    <StatusBadge status={trip.status} />
                  </div>
                  <div className="text-xs text-gray-500 space-y-1">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      <span>{trip.destination}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(trip.fromDate)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {!selectedTripId && (
            <div className="text-center mt-6 text-gray-500">
              <p>Select a trip above to manage its documents</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Trip Documents */}
      {selectedTripId && (
        <TripDetailsWithDocuments tripId={selectedTripId} />
      )}
    </div>
  );
};

// Trip Details with Documents Component
const TripDetailsWithDocuments = ({ tripId }: { tripId: number }) => {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  
  const { data: trip, isLoading: tripLoading } = useQuery({
    queryKey: [`/api/trips/${tripId}`],
    queryFn: () => apiRequest('GET', `/api/trips/${tripId}`),
  });

  if (tripLoading) {
    return <div className="text-center py-8">Loading trip details...</div>;
  }

  if (!trip) {
    return <div className="text-center py-8 text-gray-500">Trip not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Trip Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5" />
            {trip.tripTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-500" />
              <span>{trip.destination}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <span>{formatDate(trip.fromDate)} - {formatDate(trip.toDate)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500" />
              <span>{trip.employeeName}</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={trip.status} />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-sm text-gray-700">{trip.purpose}</p>
          </div>
        </CardContent>
      </Card>

      {/* Documents Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              Trip Documents
            </CardTitle>
            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Document
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Upload Trip Document</DialogTitle>
                </DialogHeader>
                <DocumentUploadForm 
                  tripId={tripId} 
                  onSuccess={() => setUploadDialogOpen(false)} 
                />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <TripDocumentsList tripId={tripId} />
        </CardContent>
      </Card>
    </div>
  );
};

// Main component
export default function BusinessTripManagement() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Business Trip Management</h1>
            <p className="text-gray-600 mt-2">Request, track, and manage business travel</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Request Trip
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Trip Request</DialogTitle>
              </DialogHeader>
              <TripRequestForm onSuccess={() => setIsCreateDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="request">My Trips</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="approvals">Approvals</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <TripDashboard />
          </TabsContent>

          <TabsContent value="request">
            <Card>
              <CardHeader>
                <CardTitle>My Trip Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <TripList />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents">
            <TripDocumentsTab />
          </TabsContent>

          <TabsContent value="approvals">
            <TripApprovalsTab />
          </TabsContent>

          <TabsContent value="reports">
            <TripReports />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}