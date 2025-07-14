import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import { Plus, Download, FileText, Eye, Edit, Trash2, Search, Filter, Globe, CreditCard, Clock, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import Layout from '@/components/layout';

// Form validation schema
const visaFormSchema = z.object({
  employeeId: z.number().min(1, 'Please select an employee'),
  visaType: z.string().min(1, 'Please select visa type'),
  country: z.string().min(1, 'Please select country'),
  visaNumber: z.string().min(1, 'Visa number is required'),
  issueDate: z.date(),
  expiryDate: z.date(),
  quotaReference: z.string().optional(),
  notes: z.string().optional()
});

type VisaFormValues = z.infer<typeof visaFormSchema>;

interface VisaRecord {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeDepartment: string;
  visaType: string;
  country: string;
  visaNumber: string;
  issueDate: string;
  expiryDate: string;
  status: string;
  quotaReference?: string;
  fileUrl?: string;
  notes?: string;
  createdAt: string;
  createdByName?: string;
  daysToExpiry: number;
}

interface Employee {
  id: number;
  username: string;
  department: string | null;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
}

interface VisaOptions {
  countries: string[];
  visaTypes: string[];
}

// Travel Log Form Schema with enhanced validation
const createTravelLogSchema = (visaRecords: VisaRecord[] = []) => z.object({
  employeeId: z.number().min(1, 'Please select an employee'),
  country: z.string().min(1, 'Please select a country'),
  entryDate: z.date(),
  exitDate: z.date().optional(),
  purpose: z.string().min(1, 'Purpose is required'),
  notes: z.string().optional(),
  isBusinessTrip: z.boolean().default(false)
}).refine((data) => {
  // Validate that exit date is after entry date
  if (data.exitDate && data.entryDate >= data.exitDate) {
    return false;
  }
  return true;
}, {
  message: "Exit date must be after entry date",
  path: ["exitDate"]
}).refine((data) => {
  // Validate that travel dates are within visa validity period
  const employeeVisa = visaRecords.find(visa => 
    visa.employeeId === data.employeeId && 
    visa.country === "Schengen Area (EU)" && 
    visa.status === "Active"
  );
  
  if (!employeeVisa) {
    return false;
  }
  
  const visaStart = new Date(employeeVisa.issueDate);
  const visaEnd = new Date(employeeVisa.expiryDate);
  const entryDate = data.entryDate;
  const exitDate = data.exitDate || new Date();
  
  // Check if entry date is within visa validity
  if (entryDate < visaStart || entryDate > visaEnd) {
    return false;
  }
  
  // Check if exit date is within visa validity
  if (exitDate > visaEnd) {
    return false;
  }
  
  return true;
}, {
  message: "Travel dates must be within your visa validity period",
  path: ["entryDate"]
}).refine((data) => {
  // Validate that entry date is not in the future
  const today = new Date();
  today.setHours(23, 59, 59, 999); // End of today
  
  if (data.entryDate > today) {
    return false;
  }
  return true;
}, {
  message: "Entry date cannot be in the future",
  path: ["entryDate"]
});

type TravelLogFormData = {
  employeeId: number;
  country: string;
  entryDate: Date;
  exitDate?: Date;
  purpose: string;
  notes?: string;
  isBusinessTrip: boolean;
};

// EU 180-Day Rule Tracker Component
function EU180DayTracker() {
  const [isAddTravelDialogOpen, setIsAddTravelDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: schengenData, isLoading: isSchengenLoading } = useQuery({
    queryKey: ['/api/schengen/dashboard'],
  });

  const { data: travelLog, isLoading: isTravelLoading } = useQuery({
    queryKey: ['/api/schengen/travel-log'],
  });

  // Fetch employees with active Schengen visas for dropdown
  const { data: employees } = useQuery({
    queryKey: ['/api/schengen/employees'],
  });

  // Fetch visa records for validation
  const { data: visaRecords } = useQuery({
    queryKey: ['/api/visa/records'],
  });

  // Add travel log mutation
  const addTravelLogMutation = useMutation({
    mutationFn: (data: TravelLogFormData) => apiRequest('POST', '/api/schengen/travel-logs', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/schengen/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schengen/travel-log'] });
      setIsAddTravelDialogOpen(false);
      travelForm.reset();
      toast({
        title: "Success",
        description: "Travel entry added successfully"
      });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || error.message || "Failed to add travel entry";
      const errorDetails = error.response?.data?.details;
      
      toast({
        title: "Cannot Add Travel Entry",
        description: errorDetails ? `${errorMessage}: ${errorDetails}` : errorMessage,
        variant: "destructive"
      });
    }
  });

  // Create dynamic schema with visa records
  const travelLogSchema = createTravelLogSchema(visaRecords);

  // Form for adding travel logs
  const travelForm = useForm<TravelLogFormData>({
    resolver: zodResolver(travelLogSchema),
    defaultValues: {
      isBusinessTrip: false,
    },
  });

  const onTravelSubmit = (data: TravelLogFormData) => {
    addTravelLogMutation.mutate(data);
  };

  if (isSchengenLoading || isTravelLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* EU Compliance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Safe Employees</p>
                <p className="text-2xl font-bold text-green-600">
                  {schengenData?.filter((emp: any) => emp.status === 'Safe').length || 0}
                </p>
              </div>
              <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                <Globe className="h-4 w-4 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Warning</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {schengenData?.filter((emp: any) => emp.status === 'Warning').length || 0}
                </p>
              </div>
              <div className="h-8 w-8 bg-yellow-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Critical</p>
                <p className="text-2xl font-bold text-red-600">
                  {schengenData?.filter((emp: any) => emp.status === 'Critical').length || 0}
                </p>
              </div>
              <div className="h-8 w-8 bg-red-100 rounded-full flex items-center justify-center">
                <Clock className="h-4 w-4 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Exceeded</p>
                <p className="text-2xl font-bold text-purple-600">
                  {schengenData?.filter((emp: any) => emp.status === 'Exceeded').length || 0}
                </p>
              </div>
              <div className="h-8 w-8 bg-purple-100 rounded-full flex items-center justify-center">
                <CreditCard className="h-4 w-4 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Travel Log Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>EU Travel Log & Compliance Status</CardTitle>
              <CardDescription>
                Monitor employee travel to Schengen Area countries and 90-day compliance
              </CardDescription>
            </div>
            <Dialog open={isAddTravelDialogOpen} onOpenChange={setIsAddTravelDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Travel Entry
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add EU Travel Entry</DialogTitle>
                  <DialogDescription>
                    Log your Schengen Area travel for compliance monitoring
                  </DialogDescription>
                </DialogHeader>
                <Form {...travelForm}>
                  <form onSubmit={travelForm.handleSubmit(onTravelSubmit)} className="space-y-4">
                    <FormField
                      control={travelForm.control}
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
                              <SelectGroup>
                                <SelectLabel>Employees</SelectLabel>
                                {employees?.map((employee: Employee) => (
                                  <SelectItem key={employee.id} value={employee.id.toString()}>
                                    {employee.username} - {employee.role}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={travelForm.control}
                      name="country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Schengen Country</FormLabel>
                          <Select onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select country" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectGroup>
                                <SelectLabel>Schengen Countries</SelectLabel>
                                {['Austria', 'Belgium', 'Croatia', 'Czech Republic', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Iceland', 'Italy', 'Latvia', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Norway', 'Poland', 'Portugal', 'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland'].map((country) => (
                                  <SelectItem key={country} value={country}>
                                    {country}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={travelForm.control}
                      name="entryDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Entry Date</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                              onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                              max={format(new Date(), 'yyyy-MM-dd')}
                            />
                          </FormControl>
                          <FormMessage />
                          <p className="text-sm text-muted-foreground">
                            Entry date must be within your visa validity period
                          </p>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={travelForm.control}
                      name="exitDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Exit Date (Optional)</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                              onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                            />
                          </FormControl>
                          <FormMessage />
                          <p className="text-sm text-muted-foreground">
                            Leave blank if still traveling. Must be after entry date and within visa validity.
                          </p>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={travelForm.control}
                      name="purpose"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Purpose</FormLabel>
                          <FormControl>
                            <Input placeholder="Business meeting, conference, etc." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={travelForm.control}
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
                      <Button type="button" variant="outline" onClick={() => setIsAddTravelDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={addTravelLogMutation.isPending}>
                        {addTravelLogMutation.isPending ? 'Adding...' : 'Add Travel Entry'}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-10 px-4 text-left align-middle font-medium">Employee</th>
                    <th className="h-10 px-4 text-left align-middle font-medium">Current Period</th>
                    <th className="h-10 px-4 text-left align-middle font-medium">Days Used</th>
                    <th className="h-10 px-4 text-left align-middle font-medium">Days Remaining</th>
                    <th className="h-10 px-4 text-left align-middle font-medium">Status</th>
                    <th className="h-10 px-4 text-left align-middle font-medium">Next Reset</th>
                  </tr>
                </thead>
                <tbody>
                  {travelLog?.employees?.map((employee: any) => (
                    <tr key={employee.employeeId} className="border-b">
                      <td className="p-4">{employee.employeeName}</td>
                      <td className="p-4">{employee.currentPeriod}</td>
                      <td className="p-4">
                        <span className={cn(
                          "font-medium",
                          employee.daysUsed > 80 ? "text-red-600" : 
                          employee.daysUsed > 60 ? "text-yellow-600" : "text-green-600"
                        )}>
                          {employee.daysUsed}/90
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={cn(
                          "font-medium",
                          employee.daysRemaining < 10 ? "text-red-600" : 
                          employee.daysRemaining < 30 ? "text-yellow-600" : "text-green-600"
                        )}>
                          {employee.daysRemaining}
                        </span>
                      </td>
                      <td className="p-4">
                        <Badge 
                          variant={
                            employee.complianceStatus === 'Safe' ? 'default' :
                            employee.complianceStatus === 'Warning' ? 'secondary' :
                            employee.complianceStatus === 'Critical' ? 'destructive' : 'outline'
                          }
                        >
                          {employee.complianceStatus}
                        </Badge>
                      </td>
                      <td className="p-4">{employee.nextReset}</td>
                    </tr>
                  ))}
                  {(!travelLog?.employees || travelLog.employees.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        No EU travel records found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Main Visa Records Component
function VisaRecordsTab() {
  const [searchTerm, setSearchTerm] = useState('');
  const [countryFilter, setCountryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [visaTypeFilter, setVisaTypeFilter] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<VisaRecord | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch visa records from API
  const { data: visaRecords = [], isLoading: isRecordsLoading, error: recordsError } = useQuery({
    queryKey: ['/api/visa/records'],
    staleTime: 30 * 1000, // 30 seconds
  });

  // Mock data for demo purposes (will be replaced by real API data)
  const _mockVisaRecords: VisaRecord[] = [
    {
      id: 1,
      employeeId: 1,
      employeeName: "John Smith",
      employeeDepartment: "Engineering",
      visaType: "Work Visa",
      country: "United States",
      visaNumber: "US202501234",
      issueDate: "2024-01-15",
      expiryDate: "2026-01-15",
      status: "Active",
      quotaReference: "Q2024-001",
      notes: "Standard work visa",
      createdAt: "2024-01-20T10:00:00Z",
      createdByName: "Admin",
      daysToExpiry: 370
    },
    {
      id: 2,
      employeeId: 2,
      employeeName: "Maria Garcia",
      employeeDepartment: "Sales",
      visaType: "Business Visa",
      country: "Germany",
      visaNumber: "DE202500987",
      issueDate: "2024-06-01",
      expiryDate: "2025-08-15",
      status: "Active",
      notes: "Business development visa",
      createdAt: "2024-06-05T14:30:00Z",
      createdByName: "HR Manager",
      daysToExpiry: 25
    },
    {
      id: 3,
      employeeId: 3,
      employeeName: "Ahmed Hassan",
      employeeDepartment: "IT",
      visaType: "Tourist Visa",
      country: "Canada",
      visaNumber: "CA202400456",
      issueDate: "2024-03-10",
      expiryDate: "2025-01-10",
      status: "Expired",
      notes: "Conference attendance",
      createdAt: "2024-03-15T09:15:00Z",
      createdByName: "Travel Coordinator",
      daysToExpiry: -180
    }
  ];

  // Fetch actual users from the database
  const { data: employees = [], isLoading: isEmployeesLoading, error: employeesError } = useQuery({
    queryKey: ['/api/admin/users'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });



  // Define comprehensive country list excluding individual Schengen countries
  const visaOptions: VisaOptions = {
    countries: [
      // Major non-EU countries
      "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", "Australia", 
      "Azerbaijan", "Bahrain", "Bangladesh", "Belarus", "Bosnia and Herzegovina", "Brazil", "Brunei", 
      "Cambodia", "Cameroon", "Canada", "Chile", "China", "Colombia", "Costa Rica", "Cuba", 
      "Dominican Republic", "Ecuador", "Egypt", "Ethiopia", "Georgia", "Ghana", "India", "Indonesia", 
      "Iran", "Iraq", "Israel", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kuwait", "Kyrgyzstan", 
      "Laos", "Lebanon", "Libya", "Malaysia", "Maldives", "Mexico", "Moldova", "Monaco", "Mongolia", 
      "Montenegro", "Morocco", "Myanmar", "Nepal", "New Zealand", "Nigeria", "North Korea", "North Macedonia", 
      "Oman", "Pakistan", "Panama", "Paraguay", "Peru", "Philippines", "Qatar", "Russia", "San Marino", 
      "Saudi Arabia", "Serbia", "Singapore", "South Africa", "South Korea", "Sri Lanka", "Sudan", 
      "Taiwan", "Tajikistan", "Thailand", "Tunisia", "Turkey", "Turkmenistan", "Ukraine", "United Arab Emirates", 
      "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vatican City", "Venezuela", "Vietnam", "Yemen",
      // Grouped Schengen Area (replaces individual EU countries)
      "Schengen Area (EU)"
    ],
    visaTypes: [
      "Work Visa", "Business Visa", "Tourist Visa", "Student Visa", 
      "Transit Visa", "Diplomatic Visa", "Family Reunion Visa", "Investor Visa"
    ]
  };

  // Loading and error states are handled by the useQuery hook above

  // Create visa record mutation
  const createMutation = useMutation({
    mutationFn: async (data: VisaFormValues) => {
      const formattedData = {
        ...data,
        issueDate: data.issueDate instanceof Date ? format(data.issueDate, 'yyyy-MM-dd') : data.issueDate,
        expiryDate: data.expiryDate instanceof Date ? format(data.expiryDate, 'yyyy-MM-dd') : data.expiryDate,
      };
      return apiRequest('POST', '/api/visa/records', formattedData);
    },
    onSuccess: () => {
      setIsCreateDialogOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/visa/records'] });
      toast({
        title: "Success",
        description: "Visa record created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create visa record",
        variant: "destructive",
      });
    },
  });

  const form = useForm<VisaFormValues>({
    resolver: zodResolver(visaFormSchema),
    defaultValues: {
      employeeId: 0,
      visaType: '',
      country: '',
      visaNumber: '',
      quotaReference: '',
      notes: ''
    },
  });

  const onSubmit = (values: VisaFormValues) => {
    createMutation.mutate(values);
  };

  const getStatusBadge = (status: string, daysToExpiry: number) => {
    if (daysToExpiry < 0) {
      return <Badge variant="destructive">Expired</Badge>;
    } else if (daysToExpiry <= 30) {
      return <Badge variant="secondary">Expiring Soon</Badge>;
    } else if (status === 'Active') {
      return <Badge variant="default">Active</Badge>;
    } else {
      return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Filter records based on search and filters
  const filteredRecords = visaRecords.filter((record: VisaRecord) => {
    const matchesSearch = searchTerm === '' || 
      record.employeeName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.visaNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.country?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCountry = countryFilter === 'all' || record.country === countryFilter;
    const matchesStatus = statusFilter === 'all' || record.status === statusFilter;
    const matchesVisaType = visaTypeFilter === 'all' || record.visaType === visaTypeFilter;
    
    return matchesSearch && matchesCountry && matchesStatus && matchesVisaType;
  });

  if (recordsError) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Visa Records</h2>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Visa Record
          </Button>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-red-600">
              <p className="text-lg font-medium">Failed to load visa records</p>
              <p className="text-sm text-muted-foreground mt-1">
                There was an error connecting to the visa management system. Please try refreshing the page.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Actions */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Visa Records</h2>
          <p className="text-muted-foreground">Manage employee visa records and track expiry dates</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Visa Record
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Records</p>
                <p className="text-2xl font-bold">{visaRecords.length}</p>
              </div>
              <FileText className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Visas</p>
                <p className="text-2xl font-bold text-green-600">
                  {visaRecords.filter((r: VisaRecord) => r.status === 'Active' && r.daysToExpiry > 0).length}
                </p>
              </div>
              <CreditCard className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Expiring Soon</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {visaRecords.filter((r: VisaRecord) => r.daysToExpiry <= 30 && r.daysToExpiry > 0).length}
                </p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Expired</p>
                <p className="text-2xl font-bold text-red-600">
                  {visaRecords.filter((r: VisaRecord) => r.daysToExpiry < 0).length}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by employee name, visa number, or country..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="All Countries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {visaOptions?.countries?.map((country) => (
                  <SelectItem key={country} value={country}>{country}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Expired">Expired</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={visaTypeFilter} onValueChange={setVisaTypeFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {visaOptions?.visaTypes?.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Visa Records Table */}
      <Card>
        <CardHeader>
          <CardTitle>Visa Records ({filteredRecords.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isRecordsLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-12 bg-gray-200 rounded mb-2"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="h-10 px-4 text-left align-middle font-medium">Employee</th>
                      <th className="h-10 px-4 text-left align-middle font-medium">Country</th>
                      <th className="h-10 px-4 text-left align-middle font-medium">Visa Type</th>
                      <th className="h-10 px-4 text-left align-middle font-medium">Visa Number</th>
                      <th className="h-10 px-4 text-left align-middle font-medium">Expiry Date</th>
                      <th className="h-10 px-4 text-left align-middle font-medium">Status</th>
                      <th className="h-10 px-4 text-left align-middle font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((record: VisaRecord) => (
                      <tr key={record.id} className="border-b hover:bg-muted/50">
                        <td className="p-4">
                          <div>
                            <div className="font-medium">{record.employeeName}</div>
                            <div className="text-sm text-muted-foreground">{record.employeeDepartment}</div>
                          </div>
                        </td>
                        <td className="p-4">{record.country}</td>
                        <td className="p-4">{record.visaType}</td>
                        <td className="p-4 font-mono text-sm">{record.visaNumber}</td>
                        <td className="p-4">
                          <div>
                            <div>{format(new Date(record.expiryDate), 'MMM dd, yyyy')}</div>
                            <div className="text-sm text-muted-foreground">
                              {record.daysToExpiry < 0 ? 
                                `Expired ${Math.abs(record.daysToExpiry)} days ago` :
                                `${record.daysToExpiry} days remaining`
                              }
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          {getStatusBadge(record.status, record.daysToExpiry)}
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedRecord(record);
                                setIsViewDialogOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                            {record.fileUrl && (
                              <Button variant="ghost" size="sm">
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredRecords.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-muted-foreground">
                          {searchTerm || countryFilter || statusFilter || visaTypeFilter
                            ? 'No visa records found matching your filters'
                            : 'No visa records found. Create your first visa record to get started.'
                          }
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Visa Record Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Visa Record</DialogTitle>
            <DialogDescription>
              Test
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                          {isEmployeesLoading ? (
                            <div className="p-2 text-sm text-muted-foreground">Loading employees...</div>
                          ) : employeesError ? (
                            <div className="p-2 text-sm text-muted-foreground">Error loading employees</div>
                          ) : !Array.isArray(employees) ? (
                            <div className="p-2 text-sm text-muted-foreground">Invalid data format</div>
                          ) : employees.length === 0 ? (
                            <div className="p-2 text-sm text-muted-foreground">No employees found</div>
                          ) : (
                            (() => {
                              // Group employees by role
                              const groupedEmployees = employees.reduce((groups: Record<string, any[]>, employee: any) => {
                                const role = employee.role || 'Employee';
                                if (!groups[role]) {
                                  groups[role] = [];
                                }
                                groups[role].push(employee);
                                return groups;
                              }, {});

                              // Sort roles: Superuser, General Manager, Senior Manager, Manager, Employee
                              const roleOrder = ['Superuser', 'General Manager', 'Senior Manager', 'Manager', 'Employee'];
                              const sortedRoles = Object.keys(groupedEmployees).sort((a, b) => {
                                const aIndex = roleOrder.indexOf(a);
                                const bIndex = roleOrder.indexOf(b);
                                return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
                              });

                              return sortedRoles.map((role) => (
                                <SelectGroup key={role}>
                                  <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">
                                    {role}s
                                  </SelectLabel>
                                  {groupedEmployees[role].map((employee: any) => (
                                    <SelectItem key={employee.id} value={employee.id.toString()}>
                                      {employee.username}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              ));
                            })()
                          )}
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
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select country" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {visaOptions?.countries?.map((country) => (
                            <SelectItem key={country} value={country}>{country}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="visaType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Visa Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select visa type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {visaOptions?.visaTypes?.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
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

                <FormField
                  control={form.control}
                  name="issueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Issue Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          value={field.value ? format(field.value, "yyyy-MM-dd") : ""}
                          onChange={(e) => {
                            const date = e.target.value ? new Date(e.target.value) : undefined;
                            field.onChange(date);
                          }}
                          max={format(new Date(), "yyyy-MM-dd")}
                          min="2000-01-01"
                        />
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
                        <Input
                          type="date"
                          value={field.value ? format(field.value, "yyyy-MM-dd") : ""}
                          onChange={(e) => {
                            const date = e.target.value ? new Date(e.target.value) : undefined;
                            field.onChange(date);
                          }}
                          min={format(new Date(), "yyyy-MM-dd")}
                          max={format(new Date(new Date().setFullYear(new Date().getFullYear() + 20)), "yyyy-MM-dd")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add any additional notes..."
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3 pt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create Visa Record'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* View Visa Record Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Visa Record Details</DialogTitle>
            <DialogDescription>
              Complete information for {selectedRecord?.employeeName}'s visa record
            </DialogDescription>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Employee</label>
                  <p className="font-medium">{selectedRecord.employeeName}</p>
                  <p className="text-sm text-muted-foreground">{selectedRecord.employeeDepartment}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Country</label>
                  <p className="font-medium">{selectedRecord.country}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Visa Type</label>
                  <p className="font-medium">{selectedRecord.visaType}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Visa Number</label>
                  <p className="font-mono text-sm">{selectedRecord.visaNumber}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Issue Date</label>
                  <p className="font-medium">{format(new Date(selectedRecord.issueDate), 'PPP')}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Expiry Date</label>
                  <p className="font-medium">{format(new Date(selectedRecord.expiryDate), 'PPP')}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedRecord.daysToExpiry < 0 ? 
                      `Expired ${Math.abs(selectedRecord.daysToExpiry)} days ago` :
                      `${selectedRecord.daysToExpiry} days remaining`
                    }
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <div className="mt-1">
                    {getStatusBadge(selectedRecord.status, selectedRecord.daysToExpiry)}
                  </div>
                </div>
                {selectedRecord.quotaReference && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Quota Reference</label>
                    <p className="font-medium">{selectedRecord.quotaReference}</p>
                  </div>
                )}
              </div>
              {selectedRecord.notes && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Notes</label>
                  <p className="mt-1 p-3 bg-muted rounded-md">{selectedRecord.notes}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Created</label>
                  <p className="text-sm">{format(new Date(selectedRecord.createdAt), 'PPP')}</p>
                  {selectedRecord.createdByName && (
                    <p className="text-sm text-muted-foreground">by {selectedRecord.createdByName}</p>
                  )}
                </div>
                {selectedRecord.fileUrl && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Document</label>
                    <div className="mt-1">
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function VisaManagementNew() {
  return (
    <Layout>
      <div className="flex-1 space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Visa Management</h1>
            <p className="text-muted-foreground">
              Comprehensive visa tracking and EU 180-day rule compliance monitoring
            </p>
          </div>
        </div>

        <Tabs defaultValue="records" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="records" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Visa Records
            </TabsTrigger>
            <TabsTrigger value="eu-tracker" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              EU 180-Day Rule Tracker
            </TabsTrigger>
          </TabsList>

          <TabsContent value="records" className="space-y-4">
            <VisaRecordsTab />
          </TabsContent>

          <TabsContent value="eu-tracker" className="space-y-4">
            <EU180DayTracker />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}