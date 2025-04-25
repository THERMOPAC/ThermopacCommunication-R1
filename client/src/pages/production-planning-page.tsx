import React, { useState, useEffect } from "react";
import { Helmet } from "react-helmet";
import Layout from "@/components/layout";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
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
import { Plus, ClipboardList, Calendar as CalendarIcon, CheckCircle2, Hourglass, AlertTriangle, XCircle, Trash2, Loader2, Search, Info as InfoIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from "@/components/ui/command";

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
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  
  // Function to reset all work order generation states
  const resetWorkOrderGenerationState = () => {
    setIsGeneratingWorkOrders(false);
    setIsConfirmDialogOpen(false);
    setPreviewData(null);
  };
  
  // Function to clean up existing work orders for a project
  const cleanupWorkOrders = async () => {
    // Double-check user is a Superuser for additional security
    if (user?.role !== 'Superuser') {
      toast({
        title: "Permission Denied",
        description: "Only Superusers can clean up work orders",
        variant: "destructive",
      });
      return;
    }
    
    if (!selectedProject) return;
    
    if (!confirm("Are you sure you want to delete ALL work orders for this project? This action cannot be undone.")) {
      return;
    }
    
    try {
      setIsCleaningUp(true);
      
      const response = await fetch(
        `/api/production/work-orders/project/${selectedProject}/clean`,
        {
          method: 'DELETE',
        }
      );
      
      if (!response.ok) {
        let errorMessage = "Failed to clean up work orders";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          console.error("Error parsing error response:", e);
        }
        throw new Error(errorMessage);
      }
      
      // Handle empty responses or 204 No Content
      let result;
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        result = { message: "Work orders cleaned up successfully" };
      } else {
        result = await response.json();
      }
      
      toast({
        title: "Work Orders Cleaned Up",
        description: result.message || `Successfully deleted all work orders for the project`,
      });
      
      // Refresh the work orders list
      await refetchWorkOrders();
      
    } catch (error: any) {
      console.error("Error cleaning up work orders:", error);
      toast({
        title: "Error Cleaning Up Work Orders",
        description: error.message || "There was an error deleting work orders for this project.",
        variant: "destructive",
      });
    } finally {
      setIsCleaningUp(false);
    }
  };

  // State for searching
  const [searchTerm, setSearchTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [masterItems, setMasterItems] = useState<any[]>([]);
  const [projectItems, setProjectItems] = useState<any[]>([]);
  const [filteredWorkOrders, setFilteredWorkOrders] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isItemDetailOpen, setIsItemDetailOpen] = useState(false);
  
  // Fetch projects for dropdown
  const { data: projects = [], isLoading: isLoadingProjects } = useQuery<any[]>({
    queryKey: ['/api/projects'],
  });
  
  // Fetch master items
  const { data: allMasterItems = [], isLoading: isLoadingMasterItems } = useQuery<any[]>({
    queryKey: ['/api/master-items'],
  });
  
  // Update masterItems state when the data changes
  useEffect(() => {
    if (allMasterItems) {
      setMasterItems(allMasterItems);
    }
  }, [allMasterItems]);
  
  // Fetch project items when a project is selected
  const { 
    data: selectedProjectItems = [], 
    isLoading: isLoadingProjectItems,
    refetch: refetchProjectItems
  } = useQuery<any[]>({
    queryKey: ['/api/projects', selectedProject, 'items'],
    queryFn: async ({ queryKey }) => {
      const [_, projectId] = queryKey;
      if (!projectId) return [];
      
      const response = await fetch(`/api/projects/${projectId}/items`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch project items");
      }
      return response.json();
    },
    enabled: !!selectedProject,
  });
  
  // Update project items when data changes
  useEffect(() => {
    if (selectedProjectItems) {
      setProjectItems(selectedProjectItems);
    }
  }, [selectedProjectItems]);

  // Fetch work orders based on selected project
  const { 
    data: workOrders = [], 
    isLoading: isLoadingWorkOrders,
    refetch: refetchWorkOrders
  } = useQuery<any[]>({
    queryKey: ['/api/production/work-orders/project', selectedProject],
    queryFn: async ({ queryKey }) => {
      // Extract the projectId from queryKey and ensure it's a valid number
      const [_, projectId] = queryKey;
      if (!projectId) return [];
      
      const response = await fetch(`/api/production/work-orders/project/${projectId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch work orders");
      }
      return response.json();
    },
    enabled: !!selectedProject,
  });
  
  // Query for work order preview data
  const { 
    data: previewApiData, 
    isLoading: isLoadingPreview,
    refetch: refetchPreview
  } = useQuery<any>({
    queryKey: ['/api/production/work-orders/preview', selectedProject],
    queryFn: async ({ queryKey }) => {
      // Extract the projectId from queryKey and ensure it's a valid number
      const [_, projectId] = queryKey;
      if (!projectId) throw new Error("Project ID is required");
      
      const response = await fetch(`/api/production/work-orders/preview/${projectId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch preview data");
      }
      return response.json();
    },
    enabled: false, // We'll trigger this manually
  });
  
  // Get preview data before generating work orders
  const handleGenerateWorkOrdersClick = async () => {
    if (!selectedProject) return;
    
    try {
      const { data } = await refetchPreview();
      setPreviewData(data);
      setIsConfirmDialogOpen(true);
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not retrieve work order preview data",
        variant: "destructive"
      });
    }
  };
  
  // Simplified function to generate work orders - separate from mutation to reduce complexity
  const generateWorkOrders = async (projectId: number) => {
    if (!projectId || isNaN(projectId)) {
      toast({
        title: "Error",
        description: "Invalid project ID",
        variant: "destructive"
      });
      resetWorkOrderGenerationState();
      return;
    }

    try {
      setIsGeneratingWorkOrders(true);
      console.log("Generating work orders for project ID:", projectId);
      
      const response = await fetch(
        `/api/production/work-orders/generate-for-project/${projectId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            confirm: true,
            newComponentsOnly: true // Always skip components that already have work orders
          }),
        }
      );
      
      // Handle empty responses or 204 No Content
      let responseData;
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        responseData = { message: "Work orders processed successfully" };
      } else {
        responseData = await response.json();
      }
      
      if (!response.ok) {
        // Handle specific error types
        if (response.status === 409) {
          // Conflict error - work order number already exists
          throw new Error(responseData.details || responseData.error || "Work order conflict - try cleaning up existing orders first");
        } else {
          // Other errors
          let errorMessage = responseData.details || responseData.error || "Failed to generate work orders";
          throw new Error(errorMessage);
        }
      }
      
      // At this point we have successful data, so display success message
      let description = responseData.message || `Successfully created ${responseData.count || 'multiple'} work orders for the project`;
      
      // Add detailed information about the generated work orders
      if (responseData.parentCount > 0 || responseData.componentCount > 0) {
        description = `Successfully created ${responseData.count} work orders (${responseData.parentCount} parent item(s), ${responseData.componentCount} sub-assembly component(s))`;
      }
      
      // Add info about items skipped because they already have work orders
      if (responseData.skippedItems && responseData.skippedItems > 0) {
        description += `. ${responseData.skippedItems} component(s) were skipped as they already have work orders.`;
      }
      
      // Add info about cross-project components if any were detected
      if (responseData.crossProjectComponents && responseData.crossProjectComponents.count > 0) {
        description += ` ${responseData.crossProjectComponents.count} component(s) were skipped as they exist in related projects.`;
      }
      
      toast({
        title: "Work Orders Generated",
        description: description,
      });
      
      // Refresh the work orders list and reset states
      await refetchWorkOrders();
      resetWorkOrderGenerationState();
      
    } catch (error: any) {
      console.error("Error generating work orders:", error);
      toast({
        title: "Error Generating Work Orders",
        description: error.message || "There was an error generating work orders for this project. Please try again.",
        variant: "destructive",
      });
      resetWorkOrderGenerationState();
    }
  };

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
        return <Badge variant="outline" className="flex items-center gap-1 bg-amber-100 text-amber-800"><AlertTriangle className="h-3 w-3" /> On Hold</Badge>;
      case "completed":
        return <Badge variant="outline" className="flex items-center gap-1 bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>;
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
  
  // Function to filter work orders based on search term
  useEffect(() => {
    if (!selectedProject || !workOrders || searchTerm.trim() === '') {
      setFilteredWorkOrders([]);
      return;
    }
    
    const lowercaseSearch = searchTerm.toLowerCase();
    
    // Filter work orders by work order number, title, or associated items
    const filtered = workOrders.filter((workOrder: any) => {
      // Check work order number
      if (workOrder.workOrderNumber?.toLowerCase().includes(lowercaseSearch)) {
        return true;
      }
      
      // Check work order title
      if (workOrder.title?.toLowerCase().includes(lowercaseSearch)) {
        return true;
      }
      
      // Check associated items (if available in work order data)
      if (workOrder.items && Array.isArray(workOrder.items)) {
        return workOrder.items.some((item: any) => {
          const itemCode = item.itemCode?.toLowerCase() || '';
          const description = item.description?.toLowerCase() || '';
          return itemCode.includes(lowercaseSearch) || description.includes(lowercaseSearch);
        });
      }
      
      return false;
    });
    
    setFilteredWorkOrders(filtered);
  }, [searchTerm, selectedProject, workOrders]);

  return (
    <Layout>
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
              <div className="space-y-4">
                <div>
                  <Label htmlFor="project-filter">Select Project</Label>
                  <Select 
                    onValueChange={(value) => {
                      setSelectedProject(parseInt(value));
                      setSearchTerm(''); // Clear search term when project changes
                    }}
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
                  <div className="relative">
                    <Label htmlFor="work-order-search">Search Work Orders</Label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="work-order-search"
                        className="pl-8 w-full md:w-[300px]"
                        placeholder="Search by number, title, or item..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        disabled={isLoadingWorkOrders}
                      />
                    </div>
                  </div>
                )}
              </div>
              
              {selectedProject && (
                <div className="flex space-x-3">
                  {user?.role === 'Superuser' && (
                    <Button 
                      variant="destructive"
                      onClick={cleanupWorkOrders}
                      disabled={isCleaningUp || isGeneratingWorkOrders}
                      className="flex items-center"
                    >
                      {isCleaningUp ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4 mr-2" />
                      )}
                      Clean Up Existing Orders
                    </Button>
                  )}
                  
                  <Button
                    variant="outline"
                    onClick={handleGenerateWorkOrdersClick}
                    disabled={isGeneratingWorkOrders || isLoadingPreview || isCleaningUp}
                    className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700"
                  >
                    {isGeneratingWorkOrders || isLoadingPreview ? (
                      <>
                        <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-t-transparent border-white"></div>
                        {isLoadingPreview ? "Loading Preview..." : "Generating..."}
                      </>
                    ) : (
                      <>Create Work Orders for Project</>
                    )}
                  </Button>
                </div>
              )}
            </div>
            
            {/* Display filtered work orders when search term is present */}
            {selectedProject && searchTerm.trim() !== '' && (
              <div className="mb-6">
                <h3 className="text-lg font-medium mb-2">Search Results</h3>
                {isLoadingWorkOrders ? (
                  <div className="flex items-center h-12">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    <span>Loading work orders...</span>
                  </div>
                ) : filteredWorkOrders.length === 0 ? (
                  <div className="text-muted-foreground py-4 border border-border rounded-md text-center">
                    No work orders found matching "{searchTerm}"
                  </div>
                ) : (
                  <div className="border border-border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Work Order #</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Priority</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredWorkOrders.map((workOrder: any) => (
                          <TableRow 
                            key={workOrder.id} 
                            className="hover:bg-muted/50"
                          >
                            <TableCell className="font-medium">
                              {workOrder.workOrderNumber}
                              {workOrder.title && workOrder.title.includes('Components for') && (
                                <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                                  Assembly Parts
                                </span>
                              )}
                            </TableCell>
                            <TableCell>{workOrder.title}</TableCell>
                            <TableCell>{getStatusBadge(workOrder.status)}</TableCell>
                            <TableCell>{getPriorityBadge(workOrder.priority)}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => window.location.href = `/production/work-orders/${workOrder.id}`}
                                >
                                  View
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => window.location.href = `/production/work-orders/${workOrder.id}/edit`}
                                >
                                  Edit
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}

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
            ) : searchTerm.trim() !== '' ? null : (
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
                        <TableCell className="font-medium">
                          {workOrder.workOrderNumber}
                          {workOrder.title && workOrder.title.includes('Components for') && (
                            <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                              Assembly Parts
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{workOrder.title}</TableCell>
                        <TableCell>{getStatusBadge(workOrder.status)}</TableCell>
                        <TableCell>{getPriorityBadge(workOrder.priority)}</TableCell>
                        <TableCell>{format(new Date(workOrder.plannedStartDate), 'dd MMM yyyy')}</TableCell>
                        <TableCell>{format(new Date(workOrder.plannedEndDate), 'dd MMM yyyy')}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => window.location.href = `/production/work-orders/${workOrder.id}`}
                            >
                              View
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => window.location.href = `/production/work-orders/${workOrder.id}/edit`}
                            >
                              Edit
                            </Button>
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

      {/* Work Order Confirmation Dialog */}
      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent className="max-w-5xl w-full">
          <DialogHeader>
            <DialogTitle>Confirm Work Order Generation</DialogTitle>
            <DialogDescription>
              Please review the items that will be included in the work order(s).
            </DialogDescription>
          </DialogHeader>
          
          {previewData ? (
            <div className="space-y-4">
              <div className="border rounded-md p-4 bg-muted/30">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm text-muted-foreground">Project</Label>
                    <p className="font-medium">{previewData.project?.name || previewData.project?.code}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Total Items</Label>
                    <p className="font-medium">{previewData.itemCount || 0}</p>
                  </div>
                </div>
                
                {previewData.willCreateSeparateOrders && (
                  <div className="mt-4 p-2 bg-amber-50 border border-amber-200 rounded-md text-amber-800">
                    <AlertTriangle className="h-4 w-4 inline-block mr-2" />
                    <span className="text-sm">This will create separate work orders for parent and child items.</span>
                  </div>
                )}
                
                {previewData.crossProjectComponents && (
                  <div className="mt-4 p-2 bg-blue-50 border border-blue-200 rounded-md text-blue-800">
                    <InfoIcon className="h-4 w-4 inline-block mr-2" />
                    <span className="text-sm">
                      <strong>{previewData.crossProjectComponents.count}</strong> component(s) already have work orders in related project(s): <strong>{previewData.crossProjectComponents.projectCodes}</strong>. 
                      These components will be skipped to prevent duplication.
                    </span>
                  </div>
                )}
              </div>
              
              {previewData.parentCount > 0 && previewData.items && previewData.items.filter((item: any) => item.itemType === 'Parent').length > 0 && (
                <div className="border rounded-md p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="bg-blue-100 p-1 rounded-md">
                      <ClipboardList className="h-4 w-4 text-blue-800" />
                    </div>
                    <h3 className="text-lg font-medium">Parent Items Work Order</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <Label className="text-sm text-muted-foreground">Work Order Number</Label>
                      <p className="font-medium">{previewData.parentWorkOrderNumber}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Item Count</Label>
                      <p className="font-medium">{previewData.items.filter((item: any) => item.itemType === 'Parent').length || 0}</p>
                    </div>
                  </div>
                  
                  <div className="max-h-48 overflow-y-auto">
                    <Table className="w-full border">
                      <TableHeader>
                        <TableRow className="bg-blue-50">
                          <TableHead className="w-[5%]">#</TableHead>
                          <TableHead className="w-[20%]">Item Code</TableHead>
                          <TableHead className="w-[50%]">Description</TableHead>
                          <TableHead className="w-[15%]">Quantity</TableHead>
                          <TableHead className="w-[10%]">Unit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewData.items
                          .filter((item: any) => item.itemType === 'Parent')
                          .map((item: any, index: number) => (
                            <TableRow key={`parent-${index}`}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell className="font-medium">{item.itemCode}</TableCell>
                              <TableCell className="break-words">{item.description}</TableCell>
                              <TableCell>{item.quantity}</TableCell>
                              <TableCell>{item.unit}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
              
              {previewData.componentCount > 0 && previewData.items && previewData.items.filter((item: any) => item.itemType === 'Child').length > 0 && (
                <div className="border rounded-md p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="bg-purple-100 p-1 rounded-md">
                      <ClipboardList className="h-4 w-4 text-purple-800" />
                    </div>
                    <h3 className="text-lg font-medium">Sub-Assembly Components</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <Label className="text-sm text-muted-foreground">Work Order Format</Label>
                      <p className="font-medium">[Parent Work Order Number]-[Sequence]</p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Component Count</Label>
                      <p className="font-medium">{previewData.items.filter((item: any) => item.itemType === 'Child').length || 0}</p>
                    </div>
                  </div>
                  
                  <div className="max-h-48 overflow-y-auto">
                    <Table className="w-full border">
                      <TableHeader>
                        <TableRow className="bg-purple-50">
                          <TableHead className="w-[5%]">#</TableHead>
                          <TableHead className="w-[15%]">Item Code</TableHead>
                          <TableHead className="w-[40%]">Description</TableHead>
                          <TableHead className="w-[15%]">Parent Item</TableHead>
                          <TableHead className="w-[15%]">Quantity</TableHead>
                          <TableHead className="w-[10%]">Unit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewData.items
                          .filter((item: any) => item.itemType === 'Child')
                          .map((item: any, index: number) => (
                            <TableRow key={`child-${index}`}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell className="font-medium">{item.itemCode}</TableCell>
                              <TableCell className="break-words">{item.description}</TableCell>
                              <TableCell>{item.parentItemCode}</TableCell>
                              <TableCell>{item.quantity}</TableCell>
                              <TableCell>{item.unit}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
              
              {previewData.noItemsToDisplay && (
                <div>
                  <div className="p-4 border rounded border-dashed text-center bg-amber-50">
                    <AlertTriangle className="h-4 w-4 inline-block mr-2 text-amber-600" />
                    <p className="text-amber-800 inline-block">
                      No new items require work orders. All items in this project already have work orders.
                    </p>
                  </div>
                  {previewData.existingWorkOrderCount > 0 && (
                    <div className="mt-3 p-3 border rounded text-sm">
                      <p className="font-medium mb-2">Information:</p>
                      <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                        <li>This project already has {previewData.existingWorkOrderCount} work orders.</li>
                        <li>If you need to regenerate all work orders, first clean up existing work orders.</li>
                        <li>If you want to continue, click "Confirm & Generate Work Orders" to proceed.</li>
                      </ul>
                    </div>
                  )}
                </div>
              )}
              
              {previewData.items && previewData.items.length === 0 && !previewData.noItemsToDisplay && (
                <div className="p-4 border rounded border-dashed text-center">
                  <p className="text-muted-foreground">No items to display</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          )}
          
          <div className="my-4 border-t pt-3 border-muted">
            <div className="flex items-center">
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 w-full">
                <div className="flex items-start">
                  <InfoIcon className="h-5 w-5 text-blue-500 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Automatic Duplicate Prevention
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      The system will automatically identify and skip components that already have work orders in this project or related projects.
                      This prevents duplicate work orders when the same component is used in multiple parent items.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={resetWorkOrderGenerationState}
              disabled={isGeneratingWorkOrders}
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (selectedProject) {
                  generateWorkOrders(selectedProject);
                } else {
                  toast({
                    title: "Error",
                    description: "No project selected",
                    variant: "destructive"
                  });
                }
              }}
              disabled={isGeneratingWorkOrders || !previewData}
              className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700"
            >
              {isGeneratingWorkOrders ? (
                <>
                  <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-t-transparent border-white"></div>
                  Generating...
                </>
              ) : (
                <>Confirm & Generate Work Orders</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Item Detail Dialog */}
      <Dialog open={isItemDetailOpen} onOpenChange={setIsItemDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Item Details</DialogTitle>
            <DialogDescription>
              Information about the selected item
            </DialogDescription>
          </DialogHeader>
          
          {selectedItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Item Code</h4>
                  <p className="text-base font-medium">{selectedItem.itemCode}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Make/Buy</h4>
                  <Badge variant={selectedItem.makeOrBuy === 'Make' ? 'default' : 'outline'} className="mt-1">
                    {selectedItem.makeOrBuy}
                  </Badge>
                </div>
              </div>
              
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Description</h4>
                <p className="text-base">{selectedItem.description}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Project Quantity</h4>
                  <p className="text-base">{selectedItem.quantity}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Item ID</h4>
                  <p className="text-base text-muted-foreground">{selectedItem.masterItemId}</p>
                </div>
              </div>
              
              <DialogFooter className="mt-4">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setSelectedItem(null);
                    setIsItemDetailOpen(false);
                  }}
                >
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}