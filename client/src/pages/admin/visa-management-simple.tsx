import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { insertVisaRecordSchema } from '@shared/schema';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Upload, 
  Download, 
  Filter,
  Users,
  AlertTriangle,
  Calendar,
  Globe,
  FileText,
  Clock
} from 'lucide-react';
import { z } from 'zod';

// Types
type InsertVisaRecord = z.infer<typeof insertVisaRecordSchema>;

interface Employee {
  id: number;
  username: string;
  role: string;
  department?: string;
}

interface VisaRecord {
  id: number;
  employeeId: number;
  employeeName: string;
  visaType: string;
  country: string;
  visaNumber: string;
  issueDate: string;
  expiryDate: string;
  status: string;
  daysToExpiry: number;
  quotaReference?: string;
  filePath?: string;
  fileUrl?: string;
  notes?: string;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

interface VisaOptions {
  countries: string[];
  visaTypes: string[];
}

interface DashboardData {
  totalActive: number;
  totalExpiringSoon: number;
  totalExpired: number;
  statusCounts: Array<{ status: string; count: number }>;
}

export default function VisaManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState<VisaRecord | null>(null);
  const [filters, setFilters] = useState({
    country: 'all',
    visaType: 'all',
    status: 'all',
    employeeId: 'all',
  });

  // Form schemas (exclude createdBy from client-side validation)
  const createFormSchema = insertVisaRecordSchema.omit({ createdBy: true });

  // Forms
  const form = useForm<z.infer<typeof createFormSchema>>({
    resolver: zodResolver(createFormSchema),
    defaultValues: {
      employeeId: 0,
      visaType: '',
      country: '',
      visaNumber: '',
      issueDate: '',
      expiryDate: '',
      quotaReference: '',
      notes: '',
    },
  });

  // Queries
  const { data: visaRecords = [], isLoading } = useQuery<VisaRecord[]>({
    queryKey: ['/api/visa/records'],
    queryFn: () => apiRequest('GET', '/api/visa/records'),
  });

  const { data: dashboardData, isLoading: dashboardLoading } = useQuery<DashboardData>({
    queryKey: ['/api/visa/dashboard'],
    queryFn: () => apiRequest('GET', '/api/visa/dashboard'),
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/visa/employees'],
    queryFn: () => apiRequest('GET', '/api/visa/employees'),
  });

  const { data: visaOptions } = useQuery<VisaOptions>({
    queryKey: ['/api/visa/options'],
    queryFn: () => apiRequest('GET', '/api/visa/options'),
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: InsertVisaRecord) => {
      console.log('Form submitted with data:', data);
      console.log('Editing record:', editingRecord);
      console.log('Creating new record');
      console.log('Sending API request with data:', data);
      return apiRequest('POST', '/api/visa/records', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/visa'] });
      setShowAddDialog(false);
      form.reset();
      toast({
        title: 'Success',
        description: 'Visa record created successfully',
      });
    },
    onError: (error) => {
      console.log('Create mutation error:', error);
      toast({
        title: 'Error',
        description: 'Failed to create visa record',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: InsertVisaRecord }) => 
      apiRequest('PUT', `/api/visa/records/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/visa'] });
      setShowEditDialog(false);
      setEditingRecord(null);
      toast({
        title: 'Success',
        description: 'Visa record updated successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update visa record',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/visa/records/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/visa'] });
      toast({
        title: 'Success',
        description: 'Visa record deleted successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete visa record',
        variant: 'destructive',
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ visaRecordId, file }: { visaRecordId: number; file: File }) => {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('visaRecordId', visaRecordId.toString());
      return apiRequest('POST', '/api/visa/upload', formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/visa'] });
      toast({
        title: 'Success',
        description: 'Document uploaded successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to upload document',
        variant: 'destructive',
      });
    },
  });

  // Event handlers
  const onSubmit = (data: InsertVisaRecord) => {
    createMutation.mutate(data);
  };

  const handleEdit = (record: VisaRecord) => {
    setEditingRecord(record);
    form.setValue('employeeId', record.employeeId);
    form.setValue('visaType', record.visaType);
    form.setValue('country', record.country);
    form.setValue('visaNumber', record.visaNumber);
    form.setValue('issueDate', record.issueDate);
    form.setValue('expiryDate', record.expiryDate);
    form.setValue('quotaReference', record.quotaReference || '');
    form.setValue('notes', record.notes || '');
    setShowEditDialog(true);
  };

  const handleDelete = (id: number) => {
    if (window.confirm('Are you sure you want to delete this visa record?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleFileUpload = (visaRecordId: number, file: File) => {
    uploadMutation.mutate({ visaRecordId, file });
  };

  // Helper functions
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-green-100 text-green-800';
      case 'Expiring Soon': return 'bg-yellow-100 text-yellow-800';
      case 'Expired': return 'bg-red-100 text-red-800';
      case 'Cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getExpiryColor = (daysToExpiry: number) => {
    if (daysToExpiry < 0) return 'text-red-600';
    if (daysToExpiry <= 7) return 'text-red-500';
    if (daysToExpiry <= 30) return 'text-yellow-600';
    if (daysToExpiry <= 60) return 'text-orange-500';
    return 'text-green-600';
  };

  // Group employees by role
  const groupedEmployees = employees.reduce((acc, employee) => {
    const role = employee.role || 'Other';
    if (!acc[role]) acc[role] = [];
    acc[role].push(employee);
    return acc;
  }, {} as Record<string, Employee[]>);

  // Filter records
  const filteredRecords = visaRecords.filter(record => {
    if (filters.country !== 'all' && record.country !== filters.country) return false;
    if (filters.visaType !== 'all' && record.visaType !== filters.visaType) return false;
    if (filters.status !== 'all' && record.status !== filters.status) return false;
    if (filters.employeeId !== 'all' && record.employeeId.toString() !== filters.employeeId) return false;
    return true;
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Visa Management</h1>
        <p className="text-gray-600 mt-1">Track employee visa records and Schengen travel compliance</p>
      </div>

      <Tabs defaultValue="visa-records" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="visa-records" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Visa Records
          </TabsTrigger>
          <TabsTrigger value="schengen-tracker" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            EU 180-Day Rule Tracker
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visa-records" className="space-y-6">
          {/* Dashboard Statistics */}
          {!dashboardLoading && dashboardData && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Visas</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{dashboardData.totalActive}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">{dashboardData.totalExpiringSoon}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Expired</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{dashboardData.totalExpired}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Countries</CardTitle>
                  <Globe className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{visaOptions?.countries.length || 0}</div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Add New Record Button */}
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Visa Records</h2>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add New Visa Record
            </Button>
          </div>

          {/* Add Dialog */}
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add New Visa Record</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="employeeId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Employee</FormLabel>
                          <Select
                            value={field.value?.toString() || ''}
                            onValueChange={(value) => field.onChange(parseInt(value))}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select employee" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.entries(groupedEmployees).map(([role, roleEmployees]) => (
                                <div key={role}>
                                  <div className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50">
                                    {role}
                                  </div>
                                  {roleEmployees.map((employee) => (
                                    <SelectItem key={employee.id} value={employee.id.toString()}>
                                      {employee.username}
                                    </SelectItem>
                                  ))}
                                </div>
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
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select country" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-48">
                              {visaOptions?.countries.map((country) => (
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
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="visaType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Visa Type</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select visa type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {visaOptions?.visaTypes.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type}
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
                      name="visaNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Visa Number</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter visa number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="issueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Issue Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="expiryDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expiry Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="quotaReference"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quota Reference (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter quota reference" {...field} />
                        </FormControl>
                        <FormMessage />
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
                          <Textarea placeholder="Enter any additional notes" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending}>
                      {createMutation.isPending ? 'Creating...' : 'Create Record'}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          {/* Records Table */}
          <Card>
            <CardContent className="p-6">
              <div className="text-center py-8 text-gray-500">
                Simplified visa management interface. 
                {filteredRecords.length} visa records found.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schengen-tracker" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="h-5 w-5 mr-2" />
                EU 180-Day Rule Tracker
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                Monitor Schengen area travel compliance for employees
              </p>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-gray-500">
                EU 180-Day Rule Tracker functionality will be implemented here.
                <br />
                This will include Schengen travel log management and compliance monitoring.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
      />
    </div>
  );
}