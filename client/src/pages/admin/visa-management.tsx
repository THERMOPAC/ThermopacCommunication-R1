import { useState, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import Layout from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { insertVisaRecordSchema, type InsertVisaRecord } from '@shared/schema';
import {
  Plus,
  Edit,
  Trash2,
  Upload,
  Download,
  Users,
  AlertTriangle,
  Calendar,
  Globe,
  Filter,
  FileText,
  Clock
} from 'lucide-react';

// Types
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

  // Group employees by role
  const groupedEmployees = useMemo(() => {
    const roleOrder = ['Superuser', 'General Manager', 'Senior Manager', 'Manager', 'Employee'];
    
    const groups = employees.reduce((groups, employee) => {
      const role = employee.role || 'Employee';
      if (!groups[role]) {
        groups[role] = [];
      }
      groups[role].push(employee);
      return groups;
    }, {} as Record<string, Employee[]>);

    Object.keys(groups).forEach(role => {
      groups[role].sort((a, b) => a.username.localeCompare(b.username));
    });

    const orderedGroups: Record<string, Employee[]> = {};
    roleOrder.forEach(role => {
      if (groups[role] && groups[role].length > 0) {
        orderedGroups[role] = groups[role];
      }
    });

    Object.keys(groups).forEach(role => {
      if (!roleOrder.includes(role) && groups[role].length > 0) {
        orderedGroups[role] = groups[role];
      }
    });

    return orderedGroups;
  }, [employees]);

  // State for file upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form
  const form = useForm<InsertVisaRecord>({
    resolver: zodResolver(insertVisaRecordSchema),
    mode: 'onChange',
    defaultValues: {
      employeeId: '' as any,
      visaType: '',
      country: '',
      visaNumber: '',
      issueDate: '',
      expiryDate: '',
      quotaReference: '',
      notes: '',
    },
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: InsertVisaRecord & { file?: File }) => {
      console.log('Sending API request with data:', data);
      
      // Create FormData for file upload
      const formData = new FormData();
      
      // Append all form fields
      Object.entries(data).forEach(([key, value]) => {
        if (key !== 'file' && value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });
      
      // Append file if present
      if (data.file) {
        formData.append('document', data.file);
      }
      
      return apiRequest('POST', '/api/visa/records', formData);
    },
    onSuccess: (response) => {
      console.log('Create mutation success:', response);
      queryClient.invalidateQueries({ queryKey: ['/api/visa/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/visa/records'] });
      toast({ 
        title: 'Success', 
        description: selectedFile ? 'Visa record and document uploaded successfully' : 'Visa record created successfully' 
      });
      setShowAddDialog(false);
      resetForm();
    },
    onError: (error: any) => {
      console.error('Create mutation error:', error);
      
      // Handle specific error cases
      let errorMessage = 'Failed to create visa record';
      
      if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      toast({ 
        title: 'Error', 
        description: errorMessage, 
        variant: 'destructive' 
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertVisaRecord> }) => 
      apiRequest('PUT', `/api/visa/records/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/visa/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/visa/records'] });
      toast({ title: 'Success', description: 'Visa record updated successfully' });
      setShowEditDialog(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to update visa record', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/visa/records/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/visa/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/visa/records'] });
      toast({ title: 'Success', description: 'Visa record deleted successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to delete visa record', variant: 'destructive' });
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
      queryClient.invalidateQueries({ queryKey: ['/api/visa/records'] });
      toast({ title: 'Success', description: 'Document uploaded successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to upload document', variant: 'destructive' });
    },
  });

  // Event handlers
  const onSubmit = (data: InsertVisaRecord) => {
    console.log('Form submitted with data:', data);
    console.log('Selected file:', selectedFile);
    console.log('Editing record:', editingRecord);
    
    if (editingRecord) {
      console.log('Updating existing record');
      updateMutation.mutate({ id: editingRecord.id, data });
    } else {
      console.log('Creating new record');
      createMutation.mutate({ ...data, file: selectedFile || undefined });
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: 'Invalid File Type',
          description: 'Please select a PDF, JPG, or PNG file.',
          variant: 'destructive',
        });
        return;
      }
      
      // Validate file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File Too Large',
          description: 'Please select a file smaller than 10MB.',
          variant: 'destructive',
        });
        return;
      }
      
      setSelectedFile(file);
    }
  };

  const resetForm = () => {
    form.reset();
    setSelectedFile(null);
    setEditingRecord(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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

  // Filter records
  const filteredRecords = visaRecords.filter(record => {
    if (filters.country !== 'all' && record.country !== filters.country) return false;
    if (filters.visaType !== 'all' && record.visaType !== filters.visaType) return false;
    if (filters.status !== 'all' && record.status !== filters.status) return false;
    if (filters.employeeId !== 'all' && record.employeeId.toString() !== filters.employeeId) return false;
    return true;
  });

  return (
    <Layout>
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

            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Filter className="h-5 w-5 mr-2" />
                  Filters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Select value={filters.country} onValueChange={(value) => setFilters(prev => ({ ...prev, country: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Countries" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Countries</SelectItem>
                      {visaOptions?.countries.map((country) => (
                        <SelectItem key={country} value={country}>
                          {country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filters.visaType} onValueChange={(value) => setFilters(prev => ({ ...prev, visaType: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Visa Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Visa Types</SelectItem>
                      {visaOptions?.visaTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Expiring Soon">Expiring Soon</SelectItem>
                      <SelectItem value="Expired">Expired</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filters.employeeId} onValueChange={(value) => setFilters(prev => ({ ...prev, employeeId: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Employees" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Employees</SelectItem>
                      {Object.entries(groupedEmployees).map(([role, roleEmployees]) => (
                        <SelectGroup key={role}>
                          <SelectLabel className="text-blue-600 font-medium">{role}</SelectLabel>
                          {roleEmployees.map((emp) => (
                            <SelectItem key={emp.id} value={emp.id.toString()}>
                              {emp.username} {emp.department && `(${emp.department})`}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Visa Records Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Visa Records</CardTitle>
                  <p className="text-sm text-gray-600 mt-1">
                    Showing {filteredRecords.length} of {visaRecords.length} visa records
                  </p>
                </div>
                <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Add New Visa Record
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-semibold">Add New Visa Record</DialogTitle>
                      <DialogDescription>
                        Create a new visa record for an employee with optional document upload to Google Cloud Storage
                      </DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        {/* File Upload Section - First Position for Maximum Visibility */}
                        <div className="border-2 border-blue-400 rounded-lg p-6 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-lg">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full">
                              <Upload className="h-6 w-6 text-blue-600" />
                            </div>
                            <div>
                              <h3 className="text-xl font-bold text-blue-800">📎 Visa Document Upload</h3>
                              <p className="text-sm text-blue-600">Upload visa copy to Google Cloud Storage (Optional)</p>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="flex items-center space-x-3">
                              <Input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={handleFileChange}
                                className="flex-1 border-blue-200 focus:border-blue-400 focus:ring-blue-200 text-base p-3"
                                ref={fileInputRef}
                              />
                              {selectedFile && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedFile(null);
                                    if (fileInputRef.current) {
                                      fileInputRef.current.value = '';
                                    }
                                  }}
                                  className="border-blue-200 text-blue-600 hover:bg-blue-50"
                                >
                                  Clear
                                </Button>
                              )}
                            </div>

                            {selectedFile && (
                              <div className="bg-green-50 border border-green-200 rounded-md p-3">
                                <p className="text-sm text-green-700 font-medium">
                                  ✓ File selected: {selectedFile.name}
                                </p>
                                <p className="text-xs text-green-600">
                                  Size: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                              </div>
                            )}

                            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                              <p className="text-sm text-blue-700 font-medium mb-1">Storage Path:</p>
                              <code className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                                thermopac_storage/Business_Visa/{'{Employee}'}/{'{Country}'}/{'{Visa Number}'}/{'{filename}'}
                              </code>
                              <p className="text-xs text-blue-600 mt-2">
                                Accepted formats: PDF, JPG, PNG • Maximum size: 10MB
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Basic Information */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="employeeId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Employee *</FormLabel>
                                <Select 
                                  value={field.value?.toString()} 
                                  onValueChange={(value) => field.onChange(parseInt(value))}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select employee" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {Object.entries(groupedEmployees).map(([role, roleEmployees]) => (
                                      <SelectGroup key={role}>
                                        <SelectLabel className="text-blue-600 font-medium">{role}</SelectLabel>
                                        {roleEmployees.map((emp) => (
                                          <SelectItem key={emp.id} value={emp.id.toString()}>
                                            {emp.username} {emp.department && `(${emp.department})`}
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
                          <FormField
                            control={form.control}
                            name="country"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Country *</FormLabel>
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select country" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
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

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="visaType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Visa Type *</FormLabel>
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
                                <FormLabel>Visa Number *</FormLabel>
                                <FormControl>
                                  <Input placeholder="Enter visa number" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>



                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="issueDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Issue Date *</FormLabel>
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
                                <FormLabel>Expiry Date *</FormLabel>
                                <FormControl>
                                  <Input type="date" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        {/* Additional Fields */}
                        <div className="grid grid-cols-1 gap-4">
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
                                  <Textarea 
                                    placeholder="Enter any additional notes about this visa record" 
                                    {...field} 
                                    rows={3}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="flex justify-end space-x-3 pt-4 border-t">
                          <Button 
                            type="button" 
                            variant="outline" 
                            onClick={() => {
                              setShowAddDialog(false);
                              resetForm();
                            }}
                          >
                            Cancel
                          </Button>
                          <Button 
                            type="submit" 
                            disabled={createMutation.isPending}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            {createMutation.isPending ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                Creating...
                              </>
                            ) : (
                              'Create Visa Record'
                            )}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8">Loading visa records...</div>
                ) : filteredRecords.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No visa records found. Add your first visa record to get started.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Employee</th>
                          <th className="text-left p-2">Country</th>
                          <th className="text-left p-2">Visa Type</th>
                          <th className="text-left p-2">Visa Number</th>
                          <th className="text-left p-2">Issue Date</th>
                          <th className="text-left p-2">Expiry Date</th>
                          <th className="text-left p-2">Status</th>
                          <th className="text-left p-2">Days to Expiry</th>
                          <th className="text-left p-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRecords.map((record) => (
                          <tr key={record.id} className="border-b hover:bg-gray-50">
                            <td className="p-2">
                              <div>
                                <div className="font-medium">{record.employeeName}</div>
                              </div>
                            </td>
                            <td className="p-2">{record.country}</td>
                            <td className="p-2">{record.visaType}</td>
                            <td className="p-2 font-mono text-sm">{record.visaNumber}</td>
                            <td className="p-2">{format(new Date(record.issueDate), 'MMM dd, yyyy')}</td>
                            <td className="p-2">{format(new Date(record.expiryDate), 'MMM dd, yyyy')}</td>
                            <td className="p-2">
                              <Badge className={getStatusColor(record.status)}>
                                {record.status}
                              </Badge>
                            </td>
                            <td className="p-2">
                              <span className={getExpiryColor(record.daysToExpiry)}>
                                {record.daysToExpiry < 0 ? 
                                  `${Math.abs(record.daysToExpiry)} days ago` : 
                                  `${record.daysToExpiry} days`
                                }
                              </span>
                            </td>
                            <td className="p-2">
                              <div className="flex space-x-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    console.log('Edit clicked for record:', record);
                                    setEditingRecord(record);
                                    form.reset({
                                      employeeId: record.employeeId,
                                      visaType: record.visaType,
                                      country: record.country,
                                      visaNumber: record.visaNumber,
                                      issueDate: record.issueDate,
                                      expiryDate: record.expiryDate,
                                      quotaReference: record.quotaReference || '',
                                      notes: record.notes || '',
                                    });
                                    setSelectedFile(null);
                                    if (fileInputRef.current) {
                                      fileInputRef.current.value = '';
                                    }
                                    setShowEditDialog(true);
                                  }}
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    fileInputRef.current?.click();
                                    fileInputRef.current!.onchange = (e) => {
                                      const file = (e.target as HTMLInputElement).files?.[0];
                                      if (file) handleFileUpload(record.id, file);
                                    };
                                  }}
                                >
                                  <Upload className="h-3 w-3" />
                                </Button>
                                {record.fileUrl && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.open(record.fileUrl, '_blank')}
                                  >
                                    <Download className="h-3 w-3" />
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDelete(record.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Edit Dialog */}
            <Dialog 
              open={showEditDialog} 
              onOpenChange={(open) => {
                setShowEditDialog(open);
                if (!open) {
                  resetForm();
                }
              }}
            >
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Edit Visa Record</DialogTitle>
                  <DialogDescription>
                    Update the visa record details
                  </DialogDescription>
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
                              value={field.value?.toString()} 
                              onValueChange={(value) => field.onChange(parseInt(value))}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select employee" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {Object.entries(groupedEmployees).map(([role, roleEmployees]) => (
                                  <SelectGroup key={role}>
                                    <SelectLabel className="text-blue-600">{role}s</SelectLabel>
                                    {roleEmployees.map((emp) => (
                                      <SelectItem key={emp.id} value={emp.id.toString()}>
                                        {emp.username} {emp.department && `(${emp.department})`}
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
                              <SelectContent>
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
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => {
                          setShowEditDialog(false);
                          resetForm();
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={updateMutation.isPending}>
                        {updateMutation.isPending ? 'Updating...' : 'Update Record'}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
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
    </Layout>
  );
}