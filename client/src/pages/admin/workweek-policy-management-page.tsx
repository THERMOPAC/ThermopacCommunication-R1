import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Calendar, Clock, Users, MapPin, Building2, Plus, Edit, Trash2, Settings, Save, X } from 'lucide-react';


import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

// Types for workweek policies
interface WorkweekPolicy {
  id: number;
  name: string;
  description?: string;
  policyType: 'location' | 'department' | 'global';
  locationId?: number;
  locationName?: string;
  department?: string;
  workingDays: number[];
  startTime: string;
  endTime: string;
  breakDurationMinutes: number;
  weeklyHours: string;
  overtimeThresholdDaily: string;
  overtimeThresholdWeekly: string;
  overtimeRateMultiplier: string;
  halfDayHours: string;
  includesSaturdays: boolean;
  includesSundays: boolean;
  followsNationalHolidays: boolean;
  isActive: boolean;
  effectiveFrom: string;
  effectiveUntil?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: number;
  creatorName?: string;
}

interface WorkLocation {
  id: number;
  name: string;
  address: string;
  city: string;
  state: string;
  isActive: boolean;
}

interface EmployeeWorkweekAssignment {
  id: number;
  employeeId: number;
  employeeName: string;
  workweekPolicyId: number;
  policyName: string;
  customWorkingDays?: number[];
  customStartTime?: string;
  customEndTime?: string;
  customWeeklyHours?: string;
  assignedDate: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  assignedBy: number;
  assignedByName?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
}

// Form schemas
const workweekPolicySchema = z.object({
  name: z.string().min(1, 'Policy name is required'),
  description: z.string().optional(),
  policyType: z.enum(['location', 'department', 'global']),
  locationId: z.number().optional(),
  department: z.string().optional(),
  workingDays: z.array(z.number().min(0).max(6)).min(1, 'At least one working day is required'),
  startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format'),
  endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format'),
  breakDurationMinutes: z.number().min(0).max(480),
  weeklyHours: z.number().min(1).max(80),
  overtimeThresholdDaily: z.number().min(1).max(24),
  overtimeThresholdWeekly: z.number().min(1).max(168),
  overtimeRateMultiplier: z.number().min(1).max(5),
  halfDayHours: z.number().min(1).max(12),
  includesSaturdays: z.boolean(),
  includesSundays: z.boolean(),
  followsNationalHolidays: z.boolean(),
  isActive: z.boolean(),
  effectiveFrom: z.string(),
  effectiveUntil: z.string().optional(),
});

type WorkweekPolicyForm = z.infer<typeof workweekPolicySchema>;

const daysOfWeek = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
];

export default function WorkweekPolicyManagementPage() {
  const [selectedPolicy, setSelectedPolicy] = useState<WorkweekPolicy | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('policies');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch workweek policies
  const { data: policies = [], isLoading: policiesLoading } = useQuery({
    queryKey: ['/api/admin/workweek-policies'],
    queryFn: () => apiRequest('GET', '/api/admin/workweek-policies')
  });

  // Fetch work locations
  const { data: locations = [], isLoading: locationsLoading } = useQuery({
    queryKey: ['/api/admin/work-locations'],
    queryFn: () => apiRequest('GET', '/api/admin/work-locations')
  });

  // Fetch employee assignments
  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ['/api/admin/employee-workweek-assignments'],
    queryFn: () => apiRequest('GET', '/api/admin/employee-workweek-assignments')
  });

  // Create policy mutation
  const createPolicyMutation = useMutation({
    mutationFn: (data: WorkweekPolicyForm) => 
      apiRequest('POST', '/api/admin/workweek-policies', data),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Workweek policy created successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/workweek-policies'] });
      setIsEditDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to create workweek policy',
        variant: 'destructive'
      });
    }
  });

  // Update policy mutation
  const updatePolicyMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<WorkweekPolicyForm> }) => 
      apiRequest('PUT', `/api/admin/workweek-policies/${id}`, data),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Workweek policy updated successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/workweek-policies'] });
      setIsEditDialogOpen(false);
      setSelectedPolicy(null);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to update workweek policy',
        variant: 'destructive'
      });
    }
  });

  // Delete policy mutation
  const deletePolicyMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/admin/workweek-policies/${id}`),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Workweek policy deleted successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/workweek-policies'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to delete workweek policy',
        variant: 'destructive'
      });
    }
  });

  // Form setup
  const form = useForm<WorkweekPolicyForm>({
    resolver: zodResolver(workweekPolicySchema),
    defaultValues: {
      name: '',
      description: '',
      policyType: 'global',
      workingDays: [1, 2, 3, 4, 5], // Monday to Friday
      startTime: '09:00',
      endTime: '18:00',
      breakDurationMinutes: 60,
      weeklyHours: 40,
      overtimeThresholdDaily: 8,
      overtimeThresholdWeekly: 40,
      overtimeRateMultiplier: 1.5,
      halfDayHours: 4,
      includesSaturdays: false,
      includesSundays: false,
      followsNationalHolidays: true,
      isActive: true,
      effectiveFrom: new Date().toISOString().split('T')[0],
    }
  });

  // Handle form submission
  const onSubmit = (data: WorkweekPolicyForm) => {
    if (selectedPolicy) {
      updatePolicyMutation.mutate({ id: selectedPolicy.id, data });
    } else {
      createPolicyMutation.mutate(data);
    }
  };

  // Handle edit
  const handleEdit = (policy: WorkweekPolicy) => {
    setSelectedPolicy(policy);
    form.reset({
      name: policy.name,
      description: policy.description || '',
      policyType: policy.policyType,
      locationId: policy.locationId,
      department: policy.department || '',
      workingDays: policy.workingDays,
      startTime: policy.startTime.substring(0, 5), // Remove seconds
      endTime: policy.endTime.substring(0, 5), // Remove seconds
      breakDurationMinutes: policy.breakDurationMinutes,
      weeklyHours: parseFloat(policy.weeklyHours),
      overtimeThresholdDaily: parseFloat(policy.overtimeThresholdDaily),
      overtimeThresholdWeekly: parseFloat(policy.overtimeThresholdWeekly),
      overtimeRateMultiplier: parseFloat(policy.overtimeRateMultiplier),
      halfDayHours: parseFloat(policy.halfDayHours),
      includesSaturdays: policy.includesSaturdays,
      includesSundays: policy.includesSundays,
      followsNationalHolidays: policy.followsNationalHolidays,
      isActive: policy.isActive,
      effectiveFrom: policy.effectiveFrom,
      effectiveUntil: policy.effectiveUntil || '',
    });
    setIsEditDialogOpen(true);
  };

  // Handle new policy
  const handleNew = () => {
    setSelectedPolicy(null);
    form.reset();
    setIsEditDialogOpen(true);
  };

  // Format working days for display
  const formatWorkingDays = (workingDays: number[]) => {
    return workingDays
      .sort()
      .map(day => daysOfWeek.find(d => d.value === day)?.short)
      .join(', ');
  };

  // Get policy type badge color
  const getPolicyTypeBadge = (type: string) => {
    switch (type) {
      case 'global': return 'bg-blue-100 text-blue-800';
      case 'location': return 'bg-green-100 text-green-800';
      case 'department': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 pl-4">Workweek Policy Management</h1>
            <p className="text-gray-600 mt-1">Configure working hours and policies for different locations and departments</p>
          </div>
          <Button onClick={handleNew} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Policy
          </Button>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Settings className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Policies</p>
                  <p className="text-2xl font-bold text-gray-900">{policies.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Users className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Active Assignments</p>
                  <p className="text-2xl font-bold text-gray-900">{assignments.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <MapPin className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Locations</p>
                  <p className="text-2xl font-bold text-gray-900">{locations.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-orange-100 rounded-lg">
                  <Building2 className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Departments</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {new Set(policies.filter(p => p.department).map(p => p.department)).size}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="policies">Workweek Policies</TabsTrigger>
            <TabsTrigger value="assignments">Employee Assignments</TabsTrigger>
          </TabsList>

          <TabsContent value="policies" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Workweek Policies
                </CardTitle>
              </CardHeader>
              <CardContent>
                {policiesLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="text-gray-500">Loading policies...</div>
                  </div>
                ) : policies.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No workweek policies found</p>
                    <Button onClick={handleNew} className="mt-4">
                      Create First Policy
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {policies.map((policy: WorkweekPolicy) => (
                      <div key={policy.id} className="border rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="font-semibold text-lg">{policy.name}</h3>
                              <Badge className={getPolicyTypeBadge(policy.policyType)}>
                                {policy.policyType}
                              </Badge>
                              {!policy.isActive && (
                                <Badge variant="secondary">Inactive</Badge>
                              )}
                            </div>
                            <p className="text-gray-600 mb-3">{policy.description}</p>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="font-medium text-gray-700">Working Days:</span>
                                <p className="text-gray-600">{formatWorkingDays(policy.workingDays)}</p>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Hours:</span>
                                <p className="text-gray-600">{policy.startTime.substring(0, 5)} - {policy.endTime.substring(0, 5)}</p>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Weekly Hours:</span>
                                <p className="text-gray-600">{policy.weeklyHours}h</p>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">OT Rate:</span>
                                <p className="text-gray-600">{policy.overtimeRateMultiplier}x</p>
                              </div>
                            </div>

                            {(policy.locationName || policy.department) && (
                              <div className="mt-3 flex items-center gap-4 text-sm">
                                {policy.locationName && (
                                  <div className="flex items-center gap-1">
                                    <MapPin className="h-4 w-4 text-gray-400" />
                                    <span className="text-gray-600">{policy.locationName}</span>
                                  </div>
                                )}
                                {policy.department && (
                                  <div className="flex items-center gap-1">
                                    <Building2 className="h-4 w-4 text-gray-400" />
                                    <span className="text-gray-600">{policy.department}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(policy)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deletePolicyMutation.mutate(policy.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assignments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Employee Assignments
                </CardTitle>
              </CardHeader>
              <CardContent>
                {assignmentsLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="text-gray-500">Loading assignments...</div>
                  </div>
                ) : assignments.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No employee assignments found</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {assignments.map((assignment: EmployeeWorkweekAssignment) => (
                      <div key={assignment.id} className="border rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="font-semibold text-lg">{assignment.employeeName}</h3>
                              <Badge variant="outline">{assignment.policyName}</Badge>
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                              <div>
                                <span className="font-medium text-gray-700">Assigned Date:</span>
                                <p className="text-gray-600">{new Date(assignment.assignedDate).toLocaleDateString()}</p>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Effective From:</span>
                                <p className="text-gray-600">{new Date(assignment.effectiveFrom).toLocaleDateString()}</p>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Assigned By:</span>
                                <p className="text-gray-600">{assignment.assignedByName}</p>
                              </div>
                            </div>

                            {assignment.notes && (
                              <div className="mt-3">
                                <span className="font-medium text-gray-700">Notes:</span>
                                <p className="text-gray-600">{assignment.notes}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit/Create Policy Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedPolicy ? 'Edit Workweek Policy' : 'Create New Workweek Policy'}
              </DialogTitle>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Basic Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Basic Information</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Policy Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter policy name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="policyType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Policy Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select policy type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="global">Global</SelectItem>
                              <SelectItem value="location">Location-based</SelectItem>
                              <SelectItem value="department">Department-based</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Enter policy description" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Conditional fields based on policy type */}
                  {form.watch('policyType') === 'location' && (
                    <FormField
                      control={form.control}
                      name="locationId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location</FormLabel>
                          <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={field.value?.toString()}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select location" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {locations.map((location: WorkLocation) => (
                                <SelectItem key={location.id} value={location.id.toString()}>
                                  {location.name} - {location.city}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {form.watch('policyType') === 'department' && (
                    <FormField
                      control={form.control}
                      name="department"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Department</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter department name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                {/* Working Schedule */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Working Schedule</h3>
                  
                  <FormField
                    control={form.control}
                    name="workingDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Working Days</FormLabel>
                        <div className="grid grid-cols-7 gap-2">
                          {daysOfWeek.map((day) => (
                            <div key={day.value} className="flex items-center space-x-2">
                              <Checkbox
                                id={`day-${day.value}`}
                                checked={field.value.includes(day.value)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    field.onChange([...field.value, day.value]);
                                  } else {
                                    field.onChange(field.value.filter(d => d !== day.value));
                                  }
                                }}
                              />
                              <Label htmlFor={`day-${day.value}`} className="text-sm">
                                {day.short}
                              </Label>
                            </div>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="startTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Time</FormLabel>
                          <FormControl>
                            <Input type="time" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="endTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Time</FormLabel>
                          <FormControl>
                            <Input type="time" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="breakDurationMinutes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Break Duration (minutes)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min="0" 
                              max="480"
                              {...field} 
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="weeklyHours"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Weekly Hours</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min="1" 
                              max="80" 
                              step="0.5"
                              {...field} 
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="halfDayHours"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Half Day Hours</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min="1" 
                              max="12" 
                              step="0.5"
                              {...field} 
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Overtime Configuration */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Overtime Configuration</h3>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="overtimeThresholdDaily"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Daily OT Threshold (hours)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min="1" 
                              max="24" 
                              step="0.5"
                              {...field} 
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="overtimeThresholdWeekly"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Weekly OT Threshold (hours)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min="1" 
                              max="168" 
                              step="0.5"
                              {...field} 
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="overtimeRateMultiplier"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>OT Rate Multiplier</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min="1" 
                              max="5" 
                              step="0.1"
                              {...field} 
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Holiday and Leave Settings */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Holiday and Leave Settings</h3>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="includesSaturdays"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Includes Saturdays</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="includesSundays"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Includes Sundays</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="followsNationalHolidays"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Follows National Holidays</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Status and Dates */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Status and Effective Dates</h3>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Active Policy</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="effectiveFrom"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Effective From</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="effectiveUntil"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Effective Until (Optional)</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsEditDialogOpen(false)}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createPolicyMutation.isPending || updatePolicyMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {createPolicyMutation.isPending || updatePolicyMutation.isPending ? 'Saving...' : 'Save Policy'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}