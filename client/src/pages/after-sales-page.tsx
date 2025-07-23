import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, BarChart3, LineChart, UserCheck, Calendar, FileText, ClipboardCheck, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import Layout from "@/components/layout";

// Form schema for service request creation
const serviceRequestSchema = z.object({
  customer_id: z.string().min(1, "Customer is required"),
  project_id: z.string().optional(),
  request_type: z.string().min(1, "Request type is required"),
  subject: z.string().min(1, "Subject is required"),
  description: z.string().optional(),
  priority: z.string().default("Medium"),
  assigned_to: z.string().optional(),
});

type ServiceRequestFormValues = z.infer<typeof serviceRequestSchema>;

export default function AfterSalesPage() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isCreatingRequest, setIsCreatingRequest] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: dashboardData, isLoading: isDashboardLoading } = useQuery({
    queryKey: ['/api/after-sales/dashboard'],
    enabled: activeTab === "dashboard",
  });

  // Fetch customers for the dropdown
  const { data: customers } = useQuery({
    queryKey: ['/api/customers'],
    enabled: isCreatingRequest,
  });

  // Fetch projects for the dropdown
  const { data: projects } = useQuery({
    queryKey: ['/api/projects'],
    enabled: isCreatingRequest,
  });

  // Fetch users for assignment dropdown
  const { data: users } = useQuery({
    queryKey: ['/api/users'],
    enabled: isCreatingRequest,
  });

  // Group users by role with proper ordering and sorting
  const groupedUsers = React.useMemo(() => {
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

  // Form setup
  const form = useForm<ServiceRequestFormValues>({
    resolver: zodResolver(serviceRequestSchema),
    defaultValues: {
      priority: "Medium",
      request_type: "",
      subject: "",
      description: "",
    },
  });

  // Create service request mutation
  const createServiceRequestMutation = useMutation({
    mutationFn: async (values: ServiceRequestFormValues) => {
      const data = {
        ...values,
        customer_id: parseInt(values.customer_id),
        project_id: values.project_id && values.project_id !== "none" ? parseInt(values.project_id) : null,
        assigned_to: values.assigned_to && values.assigned_to !== "none" ? parseInt(values.assigned_to) : null,
      };
      
      const response = await fetch('/api/after-sales/service-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create service request');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Service request created successfully",
      });
      setIsCreatingRequest(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/after-sales/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/after-sales/service-requests'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create service request",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: ServiceRequestFormValues) => {
    createServiceRequestMutation.mutate(values);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight pl-4">After-Sales Service</h1>
          <div className="flex items-center gap-4">
            <Button variant="outline">Export Data</Button>
            <Button onClick={() => setIsCreatingRequest(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Service Request
            </Button>
          </div>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-6 gap-4 w-full md:w-fit">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="service-requests">Service Requests</TabsTrigger>
            <TabsTrigger value="followups">Customer Followups</TabsTrigger>
            <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
            <TabsTrigger value="contracts">Service Contracts</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>
          
          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-4">
            {isDashboardLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Active Service Requests</CardTitle>
                      <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">24</div>
                      <p className="text-xs text-muted-foreground">
                        +5.2% from last month
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Upcoming Service Activities</CardTitle>
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">12</div>
                      <p className="text-xs text-muted-foreground">
                        Next 7 days
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Active Contracts</CardTitle>
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">8</div>
                      <p className="text-xs text-muted-foreground">
                        Total value: ₹1.2M
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Open Opportunities</CardTitle>
                      <LineChart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">4</div>
                      <p className="text-xs text-muted-foreground">
                        Potential value: ₹3.8M
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                  <Card className="col-span-4">
                    <CardHeader>
                      <CardTitle>Service Request Overview</CardTitle>
                    </CardHeader>
                    <CardContent className="pl-2">
                      <div className="h-[300px] flex items-center justify-center">
                        <BarChart3 className="h-16 w-16 text-muted-foreground/50" />
                        <p className="text-muted-foreground ml-4">Service request statistics by status</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="col-span-3">
                    <CardHeader>
                      <CardTitle>Top Customers</CardTitle>
                      <CardDescription>
                        Customers with most service requests
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center">
                          <UserCheck className="mr-2 h-4 w-4 text-muted-foreground" />
                          <div className="ml-4 space-y-1">
                            <p className="text-sm font-medium leading-none">
                              Flukar Automation
                            </p>
                            <p className="text-sm text-muted-foreground">
                              8 service requests
                            </p>
                          </div>
                          <div className="ml-auto font-medium">High Priority</div>
                        </div>
                        <div className="flex items-center">
                          <UserCheck className="mr-2 h-4 w-4 text-muted-foreground" />
                          <div className="ml-4 space-y-1">
                            <p className="text-sm font-medium leading-none">
                              Afluena Oil
                            </p>
                            <p className="text-sm text-muted-foreground">
                              6 service requests
                            </p>
                          </div>
                          <div className="ml-auto font-medium">Medium</div>
                        </div>
                        <div className="flex items-center">
                          <UserCheck className="mr-2 h-4 w-4 text-muted-foreground" />
                          <div className="ml-4 space-y-1">
                            <p className="text-sm font-medium leading-none">
                              BIOFACTOR SA
                            </p>
                            <p className="text-sm text-muted-foreground">
                              5 service requests
                            </p>
                          </div>
                          <div className="ml-auto font-medium">Medium</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>
          
          {/* Service Requests Tab */}
          <TabsContent value="service-requests">
            <Card>
              <CardHeader>
                <CardTitle>Service Requests</CardTitle>
                <CardDescription>
                  Manage customer service requests, activities, and parts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Service requests list will be displayed here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Customer Followups Tab */}
          <TabsContent value="followups">
            <Card>
              <CardHeader>
                <CardTitle>Customer Followups</CardTitle>
                <CardDescription>
                  Track and manage customer followup activities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Customer followups will be displayed here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Business Opportunities Tab */}
          <TabsContent value="opportunities">
            <Card>
              <CardHeader>
                <CardTitle>Business Opportunities</CardTitle>
                <CardDescription>
                  Manage potential business opportunities with customers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Business opportunities will be displayed here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Service Contracts Tab */}
          <TabsContent value="contracts">
            <Card>
              <CardHeader>
                <CardTitle>Service Contracts</CardTitle>
                <CardDescription>
                  Manage service contracts, services, and deliveries
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Service contracts will be displayed here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Reports Tab */}
          <TabsContent value="reports">
            <Card>
              <CardHeader>
                <CardTitle>After-Sales Reports</CardTitle>
                <CardDescription>
                  Generate and view reports on after-sales activities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Reports will be displayed here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Service Request Creation Dialog */}
        <Dialog open={isCreatingRequest} onOpenChange={setIsCreatingRequest}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Create New Service Request</DialogTitle>
              <DialogDescription>
                Create a new service request for customer support and maintenance activities.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="customer_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select customer" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Array.isArray(customers) && customers.map((customer: any) => (
                              <SelectItem key={customer.id} value={customer.id.toString()}>
                                {customer.bpName}
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
                    name="project_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project (Optional)</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select project" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">No Project</SelectItem>
                            {Array.isArray(projects) && projects.map((project: any) => (
                              <SelectItem key={project.id} value={project.id.toString()}>
                                {project.name}
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
                    name="request_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Request Type *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Maintenance">Maintenance</SelectItem>
                            <SelectItem value="Repair">Repair</SelectItem>
                            <SelectItem value="Installation">Installation</SelectItem>
                            <SelectItem value="Training">Training</SelectItem>
                            <SelectItem value="Consultation">Consultation</SelectItem>
                            <SelectItem value="Inspection">Inspection</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Low">Low</SelectItem>
                            <SelectItem value="Medium">Medium</SelectItem>
                            <SelectItem value="High">High</SelectItem>
                            <SelectItem value="Critical">Critical</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subject *</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter subject" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter detailed description"
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="assigned_to"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assign To (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select assignee" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Unassigned</SelectItem>
                          {Object.entries(groupedUsers).map(([role, users]) => (
                            <SelectGroup key={role}>
                              <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">
                                {role}
                              </SelectLabel>
                              {users.map((user: any) => (
                                <SelectItem key={user.id} value={user.id.toString()}>
                                  {user.firstName && user.lastName 
                                    ? `${user.firstName} ${user.lastName}`
                                    : user.username
                                  }
                                  {user.department && ` • ${user.department}`}
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

                <div className="flex justify-end space-x-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreatingRequest(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createServiceRequestMutation.isPending}
                  >
                    {createServiceRequestMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create Request
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}