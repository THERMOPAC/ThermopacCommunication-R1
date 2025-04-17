import React, { useState } from "react";
import { Helmet } from "react-helmet";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle, 
  CardFooter 
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Form, 
  FormControl, 
  FormDescription, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Plus, ClipboardList, Calendar as CalendarIcon, CheckCircle2, Hourglass, AlertTriangle, XCircle } from "lucide-react";
import { format } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Placeholder schema for Work Order - will need to match the backend schema
const workOrderSchema = z.object({
  projectId: z.number().positive({ message: "Please select a project" }),
  projectCode: z.string().min(1, { message: "Project code is required" }),
  workOrderNumber: z.string().min(1, { message: "Work order number is required" }),
  title: z.string().min(1, { message: "Title is required" }),
  description: z.string().optional(),
  status: z.string().default("planned"),
  priority: z.string().default("Medium"),
  plannedStartDate: z.date({ required_error: "Start date is required" }),
  plannedEndDate: z.date({ required_error: "End date is required" }),
  productionLine: z.string().optional(),
  batchNumber: z.string().optional(),
  quantity: z.number().positive().optional(),
  supervisorId: z.number(),
});

type WorkOrderFormValues = z.infer<typeof workOrderSchema>;

export default function ProductionPlanningPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [isGeneratingWorkOrders, setIsGeneratingWorkOrders] = useState(false);

  // Fetch projects for dropdown
  const { data: projects, isLoading: isLoadingProjects } = useQuery({
    queryKey: ['/api/projects'],
  });

  // Fetch work orders based on selected project
  const { 
    data: workOrders, 
    isLoading: isLoadingWorkOrders,
    refetch: refetchWorkOrders
  } = useQuery({
    queryKey: ['/api/production/work-orders/project', selectedProject],
    enabled: !!selectedProject,
  });
  
  // Mutation for generating work orders for a project
  const generateWorkOrdersMutation = useMutation({
    mutationFn: async (projectId: number) => {
      const response = await apiRequest(
        'POST', 
        `/api/production/work-orders/generate-for-project/${projectId}`
      );
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Work Orders Generated",
        description: `Successfully created ${data.items?.length || 0} work order items for ${data.workOrder?.title || 'project'}`,
      });
      // Refresh the work orders list
      refetchWorkOrders();
      setIsGeneratingWorkOrders(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error Generating Work Orders",
        description: error.message || "There was an error generating work orders for this project.",
        variant: "destructive",
      });
      setIsGeneratingWorkOrders(false);
    }
  });

  // Form for creating new work order
  const form = useForm<WorkOrderFormValues>({
    resolver: zodResolver(workOrderSchema),
    defaultValues: {
      status: "planned",
      priority: "Medium",
      supervisorId: user?.id,
    },
  });

  const onSubmit = async (data: WorkOrderFormValues) => {
    try {
      // This would call the API
      console.log("Would submit:", data);
      
      toast({
        title: "Work Order Created",
        description: "Work order has been created successfully.",
      });
      
      setIsCreateDialogOpen(false);
      if (selectedProject) {
        refetchWorkOrders();
      }
    } catch (error) {
      console.error("Error creating work order:", error);
      toast({
        title: "Error Creating Work Order",
        description: "There was an error creating the work order. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Helper function to render status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "planned":
        return <Badge variant="outline" className="flex items-center gap-1"><Hourglass className="h-3 w-3" /> Planned</Badge>;
      case "in_progress":
        return <Badge variant="secondary" className="flex items-center gap-1"><Hourglass className="h-3 w-3" /> In Progress</Badge>;
      case "on_hold":
        return <Badge variant="warning" className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> On Hold</Badge>;
      case "completed":
        return <Badge variant="success" className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>;
      case "cancelled":
        return <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="h-3 w-3" /> Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Helper function to render priority badge
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "High":
        return <Badge variant="destructive">High</Badge>;
      case "Medium":
        return <Badge variant="secondary">Medium</Badge>;
      case "Low":
        return <Badge variant="outline">Low</Badge>;
      default:
        return <Badge variant="outline">{priority}</Badge>;
    }
  };

  return (
    <>
      <Helmet>
        <title>Production Planning | Thermopac</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">Production Planning</h1>
          <Button 
            onClick={() => setIsCreateDialogOpen(true)} 
            className="bg-gradient-to-r from-blue-600 to-indigo-600"
          >
            <Plus className="mr-2 h-4 w-4" /> Create Work Order
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Work Orders</CardTitle>
            <CardDescription>
              Manage production work orders for your projects.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center mb-6">
              <div>
                <Label htmlFor="project-filter">Select Project</Label>
                <Select 
                  onValueChange={(value) => setSelectedProject(parseInt(value))}
                  disabled={isLoadingProjects}
                >
                  <SelectTrigger className="w-full md:w-[300px]">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map((project: any) => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.code}: {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {selectedProject && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsGeneratingWorkOrders(true);
                    generateWorkOrdersMutation.mutate(selectedProject);
                  }}
                  disabled={isGeneratingWorkOrders || generateWorkOrdersMutation.isPending}
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700"
                >
                  {isGeneratingWorkOrders || generateWorkOrdersMutation.isPending ? (
                    <>
                      <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-t-transparent border-white"></div>
                      Generating...
                    </>
                  ) : (
                    <>Create Work Orders for Project</>
                  )}
                </Button>
              )}
            </div>

            {!selectedProject ? (
              <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg p-4">
                <ClipboardList className="h-16 w-16 text-gray-400 mb-2" />
                <h3 className="text-lg font-medium">No Project Selected</h3>
                <p className="text-muted-foreground mt-2">
                  Please select a project to view or create work orders.
                </p>
              </div>
            ) : isLoadingWorkOrders ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              </div>
            ) : workOrders?.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg p-4">
                <ClipboardList className="h-16 w-16 text-gray-400 mb-2" />
                <h3 className="text-lg font-medium">No Work Orders Found</h3>
                <p className="text-muted-foreground mt-2">
                  There are no work orders for this project yet. Create your first one!
                </p>
                <Button 
                  onClick={() => setIsCreateDialogOpen(true)} 
                  variant="outline" 
                  className="mt-4"
                >
                  <Plus className="mr-2 h-4 w-4" /> Create Work Order
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableCaption>List of work orders for the selected project.</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work Order #</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workOrders?.map((workOrder: any) => (
                      <TableRow key={workOrder.id}>
                        <TableCell className="font-medium">{workOrder.workOrderNumber}</TableCell>
                        <TableCell>{workOrder.title}</TableCell>
                        <TableCell>{getStatusBadge(workOrder.status)}</TableCell>
                        <TableCell>{getPriorityBadge(workOrder.priority)}</TableCell>
                        <TableCell>{format(new Date(workOrder.plannedStartDate), 'dd MMM yyyy')}</TableCell>
                        <TableCell>{format(new Date(workOrder.plannedEndDate), 'dd MMM yyyy')}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm">View</Button>
                            <Button variant="outline" size="sm">Edit</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Work Order Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create New Work Order</DialogTitle>
            <DialogDescription>
              Create a new work order for production planning and tracking.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="basic">Basic Information</TabsTrigger>
                  <TabsTrigger value="schedule">Schedule</TabsTrigger>
                  <TabsTrigger value="details">Production Details</TabsTrigger>
                </TabsList>
                
                {/* Basic Information Tab */}
                <TabsContent value="basic" className="space-y-4 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="projectId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Project</FormLabel>
                          <Select 
                            onValueChange={(value) => field.onChange(parseInt(value))}
                            defaultValue={selectedProject?.toString()}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a project" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {projects?.map((project: any) => (
                                <SelectItem key={project.id} value={project.id.toString()}>
                                  {project.code}: {project.name}
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
                      name="projectCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Project Code</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Enter project code" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="workOrderNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Work Order Number</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="WO-2023-001" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Title</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Enter work order title" />
                          </FormControl>
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
                          <Textarea 
                            {...field} 
                            placeholder="Enter work order description"
                            rows={3}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select 
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="planned">Planned</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="on_hold">On Hold</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
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
                          <Select 
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select priority" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Low">Low</SelectItem>
                              <SelectItem value="Medium">Medium</SelectItem>
                              <SelectItem value="High">High</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>
                
                {/* Schedule Tab */}
                <TabsContent value="schedule" className="space-y-4 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="plannedStartDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Planned Start Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={"outline"}
                                  className="pl-3 text-left font-normal flex justify-between"
                                >
                                  {field.value ? (
                                    format(field.value, "PPP")
                                  ) : (
                                    <span>Pick a date</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) => date < new Date("1900-01-01")}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="plannedEndDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Planned End Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={"outline"}
                                  className="pl-3 text-left font-normal flex justify-between"
                                >
                                  {field.value ? (
                                    format(field.value, "PPP")
                                  ) : (
                                    <span>Pick a date</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) => 
                                  date < new Date("1900-01-01") || 
                                  (form.getValues().plannedStartDate && date < form.getValues().plannedStartDate)
                                }
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="supervisorId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Production Supervisor</FormLabel>
                        <FormControl>
                          <Input 
                            type="hidden" 
                            {...field} 
                            value={user?.id} 
                          />
                        </FormControl>
                        <div className="p-2 border rounded-md bg-muted/50">
                          {user?.username} ({user?.role})
                        </div>
                        <FormDescription>
                          The current user is set as the supervisor by default.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
                
                {/* Production Details Tab */}
                <TabsContent value="details" className="space-y-4 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="productionLine"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Production Line</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Line A" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="batchNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Batch Number</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="BATCH-001" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quantity</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            type="number" 
                            min="1"
                            onChange={(e) => field.onChange(e.target.valueAsNumber)}
                            placeholder="Enter production quantity" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
              </Tabs>
              
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Create Work Order</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}