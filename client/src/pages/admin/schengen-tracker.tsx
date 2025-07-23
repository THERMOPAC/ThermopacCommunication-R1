import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { CalendarDays, AlertTriangle, Download, Plus, Eye, Trash2, CheckCircle, XCircle, Clock, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { apiRequest } from '@/lib/queryClient';

// Validation schema for travel log
const travelLogSchema = z.object({
  employeeId: z.number(),
  country: z.string().min(1, 'Country is required'),
  entryDate: z.string().min(1, 'Entry date is required'),
  exitDate: z.string().optional(),
  purpose: z.string().optional(),
  notes: z.string().optional(),
  isBusinessTrip: z.boolean().default(false),
});

type TravelLogFormData = z.infer<typeof travelLogSchema>;

// Status color mapping
const getStatusColor = (status: string) => {
  switch (status) {
    case 'Safe': return 'bg-green-100 text-green-800';
    case 'Warning': return 'bg-yellow-100 text-yellow-800';
    case 'Critical': return 'bg-orange-100 text-orange-800';
    case 'Exceeded': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

export default function SchengenTracker() {
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState('dashboard');
  const queryClient = useQueryClient();

  // Fetch dashboard data
  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ['/api/schengen/dashboard'],
    enabled: selectedTab === 'dashboard',
  });

  // Fetch employees
  const { data: employees } = useQuery({
    queryKey: ['/api/schengen/employees'],
  });

  // Fetch countries
  const { data: countries } = useQuery({
    queryKey: ['/api/schengen/countries'],
  });

  // Fetch travel logs for selected employee
  const { data: travelLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['/api/schengen/travel-logs', selectedEmployee],
    enabled: !!selectedEmployee && selectedTab === 'travel-logs',
  });

  // Fetch alerts for selected employee
  const { data: alerts } = useQuery({
    queryKey: ['/api/schengen/alerts', selectedEmployee],
    enabled: !!selectedEmployee && selectedTab === 'alerts',
  });

  // Add travel log mutation
  const addTravelLogMutation = useMutation({
    mutationFn: (data: TravelLogFormData) => apiRequest('POST', '/api/schengen/travel-logs', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/schengen/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schengen/travel-logs'] });
      setIsAddDialogOpen(false);
    },
  });

  // Delete travel log mutation
  const deleteTravelLogMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/schengen/travel-logs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/schengen/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schengen/travel-logs'] });
    },
  });

  // Acknowledge alert mutation
  const acknowledgeAlertMutation = useMutation({
    mutationFn: (id: number) => apiRequest('PUT', `/api/schengen/alerts/${id}/acknowledge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/schengen/alerts'] });
    },
  });

  // Form for adding travel logs
  const form = useForm<TravelLogFormData>({
    resolver: zodResolver(travelLogSchema),
    defaultValues: {
      isBusinessTrip: false,
    },
  });

  const onSubmit = (data: TravelLogFormData) => {
    addTravelLogMutation.mutate(data);
  };

  // Export functionality
  const exportData = (format: 'csv' | 'xlsx') => {
    if (!dashboardData) return;
    
    const exportData = dashboardData.map((item: any) => ({
      Employee: item.employee.username,
      Department: item.employee.department || 'N/A',
      'Days Used': item.daysUsed,
      'Days Remaining': item.daysRemaining,
      Status: item.status,
      'Total Trips': item.totalTrips,
      'Last Trip Date': item.lastTripDate ? format(new Date(item.lastTripDate), 'yyyy-MM-dd') : 'N/A',
    }));

    const headers = Object.keys(exportData[0] || {});
    const csvContent = [
      headers.join(','),
      ...exportData.map(row => headers.map(header => `"${row[header]}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schengen-compliance-${format(new Date(), 'yyyy-MM-dd')}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Summary statistics
  const summaryStats = useMemo(() => {
    if (!dashboardData) return null;
    
    const stats = {
      total: dashboardData.length,
      safe: dashboardData.filter((item: any) => item.status === 'Safe').length,
      warning: dashboardData.filter((item: any) => item.status === 'Warning').length,
      critical: dashboardData.filter((item: any) => item.status === 'Critical').length,
      exceeded: dashboardData.filter((item: any) => item.status === 'Exceeded').length,
    };

    return stats;
  }, [dashboardData]);

  if (dashboardLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Schengen compliance data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 pl-4">EU 180-Day Rule Tracker</h1>
          <p className="text-gray-600 mt-1">Monitor Schengen area travel compliance for all employees</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => exportData('csv')} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Travel Log
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Travel Log</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="employeeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Employee</FormLabel>
                        <Select onValueChange={(value) => field.onChange(parseInt(value))}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select employee" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {employees?.map((emp: any) => (
                              <SelectItem key={emp.id} value={emp.id.toString()}>
                                {emp.username} {emp.department && `(${emp.department})`}
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
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country</FormLabel>
                        <Select onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select country" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {countries?.map((country: string) => (
                              <SelectItem key={country} value={country}>
                                {country}
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
                    name="entryDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Entry Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="exitDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Exit Date (Optional)</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="purpose"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Purpose (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Business meeting, tourism, etc." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isBusinessTrip"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Business Trip</FormLabel>
                          <div className="text-sm text-gray-600">
                            Mark if this is a business-related trip
                          </div>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Additional notes..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={addTravelLogMutation.isPending}>
                      {addTravelLogMutation.isPending ? 'Adding...' : 'Add Travel Log'}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      {summaryStats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <CalendarDays className="h-5 w-5 text-blue-600 mr-2" />
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Employees</p>
                  <p className="text-2xl font-bold">{summaryStats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                <div>
                  <p className="text-sm font-medium text-gray-600">Safe</p>
                  <p className="text-2xl font-bold text-green-600">{summaryStats.safe}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <Clock className="h-5 w-5 text-yellow-600 mr-2" />
                <div>
                  <p className="text-sm font-medium text-gray-600">Warning</p>
                  <p className="text-2xl font-bold text-yellow-600">{summaryStats.warning}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-orange-600 mr-2" />
                <div>
                  <p className="text-sm font-medium text-gray-600">Critical</p>
                  <p className="text-2xl font-bold text-orange-600">{summaryStats.critical}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <XCircle className="h-5 w-5 text-red-600 mr-2" />
                <div>
                  <p className="text-sm font-medium text-gray-600">Exceeded</p>
                  <p className="text-2xl font-bold text-red-600">{summaryStats.exceeded}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="travel-logs">Travel Logs</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Employee Compliance Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Days Used</TableHead>
                    <TableHead>Days Remaining</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total Trips</TableHead>
                    <TableHead>Last Trip</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboardData?.map((item: any) => (
                    <TableRow key={item.employee.id}>
                      <TableCell className="font-medium">
                        {item.employee.username}
                      </TableCell>
                      <TableCell>{item.employee.department || 'N/A'}</TableCell>
                      <TableCell>
                        <span className={item.daysUsed >= 80 ? 'text-red-600 font-semibold' : item.daysUsed >= 60 ? 'text-orange-600' : 'text-gray-900'}>
                          {item.daysUsed}
                        </span>
                      </TableCell>
                      <TableCell>{item.daysRemaining}</TableCell>
                      <TableCell>
                        <div className="w-full max-w-[100px]">
                          <Progress 
                            value={(item.daysUsed / 90) * 100} 
                            className="h-2"
                          />
                          <div className="text-xs text-gray-500 mt-1">
                            {Math.round((item.daysUsed / 90) * 100)}%
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(item.status)}>
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.totalTrips}</TableCell>
                      <TableCell>
                        {item.lastTripDate ? format(new Date(item.lastTripDate), 'MMM dd, yyyy') : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedEmployee(item.employee.id);
                            setSelectedTab('travel-logs');
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="travel-logs" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Travel Logs</h3>
              {selectedEmployee && (
                <p className="text-sm text-gray-600">
                  Viewing logs for: {employees?.find((emp: any) => emp.id === selectedEmployee)?.username}
                </p>
              )}
            </div>
            <Select onValueChange={(value) => setSelectedEmployee(parseInt(value))}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {employees?.map((emp: any) => (
                  <SelectItem key={emp.id} value={emp.id.toString()}>
                    {emp.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedEmployee ? (
            <Card>
              <CardContent className="p-6">
                {logsLoading ? (
                  <div className="text-center py-8">Loading travel logs...</div>
                ) : travelLogs?.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Country</TableHead>
                        <TableHead>Entry Date</TableHead>
                        <TableHead>Exit Date</TableHead>
                        <TableHead>Days</TableHead>
                        <TableHead>Purpose</TableHead>
                        <TableHead>Business Trip</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {travelLogs.map((log: any) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            <div className="flex items-center">
                              <MapPin className="h-4 w-4 mr-1 text-gray-400" />
                              {log.country}
                            </div>
                          </TableCell>
                          <TableCell>{format(new Date(log.entryDate), 'MMM dd, yyyy')}</TableCell>
                          <TableCell>
                            {log.exitDate ? format(new Date(log.exitDate), 'MMM dd, yyyy') : (
                              <Badge variant="outline" className="text-blue-600">Ongoing</Badge>
                            )}
                          </TableCell>
                          <TableCell>{log.daysInCountry}</TableCell>
                          <TableCell>{log.purpose || 'N/A'}</TableCell>
                          <TableCell>
                            {log.isBusinessTrip ? (
                              <Badge variant="outline" className="text-blue-600">Yes</Badge>
                            ) : (
                              <Badge variant="outline" className="text-gray-600">No</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteTravelLogMutation.mutate(log.id)}
                              disabled={deleteTravelLogMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No travel logs found for this employee
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                Select an employee to view their travel logs
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Compliance Alerts</h3>
            <Select onValueChange={(value) => setSelectedEmployee(parseInt(value))}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {employees?.map((emp: any) => (
                  <SelectItem key={emp.id} value={emp.id.toString()}>
                    {emp.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedEmployee ? (
            <Card>
              <CardContent className="p-6">
                {alerts?.length > 0 ? (
                  <div className="space-y-4">
                    {alerts.map((alert: any) => (
                      <div key={alert.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <AlertTriangle className={`h-5 w-5 ${
                                alert.alertType === 'exceeded_90' ? 'text-red-600' : 
                                alert.alertType === 'warning_80' ? 'text-orange-600' : 'text-yellow-600'
                              }`} />
                              <span className="font-semibold">
                                {alert.alertType === 'exceeded_90' ? 'Exceeded 90 Days' :
                                 alert.alertType === 'warning_80' ? 'Critical Warning (80+ days)' :
                                 'Warning (60+ days)'}
                              </span>
                              {alert.isAcknowledged && (
                                <Badge variant="outline" className="text-green-600">
                                  Acknowledged
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-600">
                              {alert.daysUsed} days used in Schengen area as of {format(new Date(alert.calculationDate), 'MMM dd, yyyy')}
                            </p>
                            {alert.isAcknowledged && (
                              <p className="text-xs text-gray-500 mt-1">
                                Acknowledged by {alert.acknowledgedBy} on {format(new Date(alert.acknowledgedAt), 'MMM dd, yyyy')}
                              </p>
                            )}
                          </div>
                          {!alert.isAcknowledged && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => acknowledgeAlertMutation.mutate(alert.id)}
                              disabled={acknowledgeAlertMutation.isPending}
                            >
                              Acknowledge
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No alerts found for this employee
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                Select an employee to view their alerts
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}