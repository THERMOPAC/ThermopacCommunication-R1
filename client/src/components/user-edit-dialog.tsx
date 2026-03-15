import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SelectGroup, SelectLabel } from '@/components/ui/select';
import { roles, roleHierarchy, canManage } from '../../../shared/roles';

// Simplified form schema with proper types
const editUserSchema = z.object({
  firstName: z.string().optional(),
  middleName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email('Please enter a valid email'),
  mobileNumber: z.string().min(10, 'Please enter a valid mobile number'),
  countryCode: z.string().min(1, 'Country code is required'),
  role: z.enum(roles as [string, ...string[]]),
  jobTitle: z.string().optional(),
  department: z.string().optional(),
  branch: z.string().optional(),
  employeeCode: z.string().optional(),
  phone: z.string().optional(),
  fax: z.string().optional(),
  linkedVendor: z.string().optional(),
  epfNo: z.string().optional(),
  esicNo: z.string().optional(),
  stdCode: z.string().optional(),
  reportingManagerId: z.string().optional(), // Keep as string to avoid conversion issues
  workLocationId: z.string().optional(), // Keep as string to avoid conversion issues
  password: z.string().optional(), // Optional for updates
  // Duty Schedule fields
  dutyTimeIn: z.string().optional(),
  dutyTimeOut: z.string().optional(),
  allowedLateMinutes: z.number().optional(),
  earlyExitMinutes: z.number().optional(),
  // Work Time Policy
  workTimePolicy: z.enum(['Fixed', 'Flexible']).optional(),
  minimumDailyHours: z.number().optional(),
  halfDayMinimumHours: z.number().optional(),
});

type EditUserFormValues = z.infer<typeof editUserSchema>;

interface User {
  id: number;
  username: string;
  email: string;
  mobileNumber: string;
  countryCode: string;
  role: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  jobTitle?: string;
  department?: string;
  branch?: string;
  employeeCode?: string;
  phone?: string;
  fax?: string;
  linkedVendor?: string;
  epfNo?: string;
  esicNo?: string;
  stdCode?: string;
  reportingManagerId?: number;
  workLocationId?: number;
  isActive: boolean;
  // Duty Schedule fields
  dutyTimeIn?: string;
  dutyTimeOut?: string;
  allowedLateMinutes?: number;
  earlyExitMinutes?: number;
  // Work Time Policy
  workTimePolicy?: 'Fixed' | 'Flexible';
  minimumDailyHours?: number;
  halfDayMinimumHours?: number;
}

interface UserEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
}

export function UserEditDialog({ open, onOpenChange, user }: UserEditDialogProps) {
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/users'],
    enabled: open,
  });

  // Get work locations
  const { data: workLocations = [] } = useQuery({
    queryKey: ['/api/work-locations/active'],
    enabled: open,
  });

  const form = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      firstName: '',
      middleName: '',
      lastName: '',
      email: '',
      mobileNumber: '',
      countryCode: '+91',
      role: 'Employee',
      jobTitle: '',
      department: '',
      branch: '',
      employeeCode: '',
      phone: '',
      fax: '',
      linkedVendor: '',
      epfNo: '',
      esicNo: '',
      stdCode: '',
      reportingManagerId: 'none',
      workLocationId: 'none',
      password: '',
      // Duty Schedule defaults
      dutyTimeIn: '09:00',
      dutyTimeOut: '18:00',
      allowedLateMinutes: 15,
      earlyExitMinutes: 15,
      // Work Time Policy defaults
      workTimePolicy: 'Fixed',
      minimumDailyHours: 8,
      halfDayMinimumHours: 4,
    },
  });

  const selectedRole = form.watch('role');

  const getEligibleManagers = (role: string | undefined) => {
    if (!role || !allUsers.length) return [];
    const managersByRole = allUsers.reduce((acc: Record<string, any[]>, manager: any) => {
      if (manager.id !== user?.id && canManage(manager.role, role)) {
        if (!acc[manager.role]) acc[manager.role] = [];
        acc[manager.role].push(manager);
      }
      return acc;
    }, {});
    return Object.entries(managersByRole).sort(
      ([roleA], [roleB]) => {
        const hierarchyA = (roleHierarchy as any)[roleA] !== undefined ? (roleHierarchy as any)[roleA] : 999;
        const hierarchyB = (roleHierarchy as any)[roleB] !== undefined ? (roleHierarchy as any)[roleB] : 999;
        return hierarchyA - hierarchyB;
      }
    );
  };

  // Reset form when user changes
  useEffect(() => {
    if (user && open) {
      form.reset({
        firstName: user.firstName || '',
        middleName: user.middleName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        mobileNumber: user.mobileNumber || '',
        countryCode: user.countryCode || '+91',
        role: user.role || 'Employee',
        jobTitle: user.jobTitle || '',
        department: user.department || '',
        branch: user.branch || '',
        employeeCode: user.employeeCode || '',
        phone: user.phone || '',
        fax: user.fax || '',
        linkedVendor: user.linkedVendor || '',
        epfNo: user.epfNo || '',
        esicNo: user.esicNo || '',
        stdCode: user.stdCode || '',
        reportingManagerId: user.reportingManagerId ? user.reportingManagerId.toString() : 'none',
        workLocationId: user.workLocationId ? user.workLocationId.toString() : 'none',
        password: '',
        // Duty Schedule fields
        dutyTimeIn: user.dutyTimeIn || '09:00',
        dutyTimeOut: user.dutyTimeOut || '18:00',
        allowedLateMinutes: user.allowedLateMinutes ?? 15,
        earlyExitMinutes: user.earlyExitMinutes ?? 15,
        // Work Time Policy fields
        workTimePolicy: (user.workTimePolicy as 'Fixed' | 'Flexible') || 'Fixed',
        minimumDailyHours: user.minimumDailyHours ?? 8,
        halfDayMinimumHours: user.halfDayMinimumHours ?? 4,
      });
    }
  }, [user, open, form]);

  const updateUserMutation = useMutation({
    mutationFn: async (data: EditUserFormValues) => {
      if (!user) throw new Error('No user selected');

      // Clean and prepare data for API
      const cleanedData: any = {
        firstName: data.firstName?.trim() || null,
        middleName: data.middleName?.trim() || null,
        lastName: data.lastName?.trim() || null,
        email: data.email.trim(),
        mobileNumber: data.mobileNumber.trim(),
        countryCode: data.countryCode.trim(),
        role: data.role,
        jobTitle: data.jobTitle?.trim() || null,
        department: data.department?.trim() || null,
        branch: data.branch?.trim() || null,
        employeeCode: data.employeeCode?.trim() || null,
        phone: data.phone?.trim() || null,
        fax: data.fax?.trim() || null,
        linkedVendor: data.linkedVendor?.trim() || null,
        epfNo: data.epfNo?.trim() || null,
        esicNo: data.esicNo?.trim() || null,
        stdCode: data.stdCode?.trim() || null,
        // Convert string IDs to numbers, handle empty strings and "none" values properly
        reportingManagerId: data.reportingManagerId && data.reportingManagerId !== '' && data.reportingManagerId !== 'none'
          ? parseInt(data.reportingManagerId) 
          : null,
        workLocationId: data.workLocationId && data.workLocationId !== '' && data.workLocationId !== 'none'
          ? parseInt(data.workLocationId) 
          : null,
        // Duty Schedule fields
        dutyTimeIn: data.dutyTimeIn || '09:00',
        dutyTimeOut: data.dutyTimeOut || '18:00',
        allowedLateMinutes: data.allowedLateMinutes ?? 15,
        earlyExitMinutes: data.earlyExitMinutes ?? 15,
        // Work Time Policy fields
        workTimePolicy: data.workTimePolicy || 'Fixed',
        minimumDailyHours: data.minimumDailyHours ?? 8,
        halfDayMinimumHours: data.halfDayMinimumHours ?? 4,
      };

      // Only include password if it's provided
      if (data.password && data.password.trim() !== '') {
        cleanedData.password = data.password.trim();
      }

      console.log('=== NEW EDIT USER REQUEST ===');
      console.log('User ID:', user.id);
      console.log('Clean data being sent:', cleanedData);
      console.log('===============================');

      return apiRequest('PUT', `/api/admin/users/${user.id}`, cleanedData);
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'User updated successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error('Update user error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update user',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: EditUserFormValues) => {
    updateUserMutation.mutate(data);
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>
            Update user information for {user.username}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Basic Information */}
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter first name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter last name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="Enter email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mobileNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobile Number *</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter mobile number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {roles.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
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
                name="department"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Accounts">Accounts</SelectItem>
                        <SelectItem value="Administration">Administration</SelectItem>
                        <SelectItem value="After Sales">After Sales</SelectItem>
                        <SelectItem value="Design">Design</SelectItem>
                        <SelectItem value="General">General</SelectItem>
                        <SelectItem value="Marketing">Marketing</SelectItem>
                        <SelectItem value="Production">Production</SelectItem>
                        <SelectItem value="Purchase">Purchase</SelectItem>
                        <SelectItem value="Quality Control">Quality Control</SelectItem>
                        <SelectItem value="Stores">Stores</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="jobTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter job title" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="employeeCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee Code</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter employee code" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="reportingManagerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reporting Manager</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select reporting manager" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No Manager</SelectItem>
                        {getEligibleManagers(selectedRole).map(([role, managers]: [string, any[]]) => (
                          <SelectGroup key={role}>
                            <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">
                              {role}s
                            </SelectLabel>
                            {managers.map((manager: any) => (
                              <SelectItem key={manager.id} value={manager.id.toString()}>
                                {manager.firstName && manager.lastName
                                  ? `${manager.firstName} ${manager.lastName} (${manager.username})`
                                  : manager.username
                                }
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
                name="workLocationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Work Location</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select work location" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No Location</SelectItem>
                        {workLocations?.map((location: any) => (
                          <SelectItem key={location.id} value={location.id.toString()}>
                            {location.name}
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
                name="password"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input 
                          type={showPassword ? "text" : "password"}
                          placeholder="Leave blank to keep current password"
                          {...field}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </FormControl>
                    <div className="text-xs text-muted-foreground">
                      Leave blank to keep current password
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Duty Schedule Section */}
            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-4">Duty Schedule</h3>
              
              {/* Work Time Policy */}
              <FormField
                control={form.control}
                name="workTimePolicy"
                render={({ field }) => (
                  <FormItem className="mb-4">
                    <FormLabel>Work Time Policy</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || 'Fixed'}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select policy" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Fixed">Fixed - Uses duty time with late/early rules</SelectItem>
                        <SelectItem value="Flexible">Flexible - Uses minimum daily hours only</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Fixed Policy Fields */}
              {form.watch('workTimePolicy') !== 'Flexible' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="dutyTimeIn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duty Time In</FormLabel>
                        <FormControl>
                          <Input 
                            type="time" 
                            {...field} 
                            value={field.value || '09:00'}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dutyTimeOut"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duty Time Out</FormLabel>
                        <FormControl>
                          <Input 
                            type="time" 
                            {...field}
                            value={field.value || '18:00'}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="allowedLateMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Allowed Late Minutes</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min={0}
                            max={120}
                            placeholder="15"
                            {...field}
                            value={field.value ?? 15}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                        <p className="text-xs text-muted-foreground">Minutes allowed after duty time in</p>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="earlyExitMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Early Exit Minutes</FormLabel>
                        <FormControl>
                          <Input 
                            type="number"
                            min={0}
                            max={120}
                            placeholder="15"
                            {...field}
                            value={field.value ?? 15}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                        <p className="text-xs text-muted-foreground">Minutes allowed before duty time out</p>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Flexible Policy Fields */}
              {form.watch('workTimePolicy') === 'Flexible' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="minimumDailyHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Minimum Daily Hours (Present)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min={1}
                            max={24}
                            step={0.5}
                            placeholder="8"
                            {...field}
                            value={field.value ?? 8}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 8)}
                          />
                        </FormControl>
                        <FormMessage />
                        <p className="text-xs text-muted-foreground">Hours required for Present status</p>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="halfDayMinimumHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Minimum Hours (Half Day)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number"
                            min={1}
                            max={24}
                            step={0.5}
                            placeholder="4"
                            {...field}
                            value={field.value ?? 4}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 4)}
                          />
                        </FormControl>
                        <FormMessage />
                        <p className="text-xs text-muted-foreground">Hours required for Half Day (below = Absent)</p>
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={updateUserMutation.isPending}
              >
                {updateUserMutation.isPending ? 'Updating...' : 'Update User'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}