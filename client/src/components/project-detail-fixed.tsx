import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from 'date-fns';
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { 
  Avatar, 
  AvatarFallback 
} from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableHeader, 
  TableRow, 
  TableHead, 
  TableBody, 
  TableCell 
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  Calendar, 
  Clock, 
  Edit, 
  FileText, 
  Loader2, 
  ChevronLeft, 
  Users, 
  ClipboardList, 
  AlertTriangle, 
  CheckSquare, 
  Plus,
  AlertCircle,
  CheckCircle,
  XCircle,
  FileSpreadsheet,
  Boxes,
  Building,
  Milestone,
  Truck,
  Paperclip,
  FileUp,
  Upload,
  Info
} from "lucide-react";
import { ProjectItemsImport } from "@/components/project-items-import";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

interface ProjectDetailProps {
  id: string;
}

// Project item edit schema
const editItemSchema = z.object({
  itemCode: z.string().min(1, "Item Code is required"),
  description: z.string().min(1, "Description is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  uom: z.string().min(1, "Unit of Measure is required"),
  makeOrBuy: z.enum(["Make", "Buy"]),
  drawingNo: z.string().optional(),
});

type EditItemValues = z.infer<typeof editItemSchema>;

// Define schema outside the component
const editProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().min(1, "Project description is required"),
  status: z.enum(["planning", "active", "on_hold", "completed", "canceled"]),
  priority: z.enum(["High", "Medium", "Low"]),
  customerId: z.number().optional().nullable(),
  startDate: z.string().min(1, "Start date is required"),
  targetEndDate: z.string().min(1, "Target end date is required"),
  budget: z.number().optional(),
  // These fields are for display only (readonly in the edit form)
  code: z.string().optional(),
  financialYear: z.string().optional(),
  // Additional fields for logistics tab
  shippingAddress: z.string().optional(),
  deliveryMethod: z.enum(["standard", "express", "pickup"]).optional(),
  client: z.string().optional(),
  vendor: z.string().optional(),
});

// Form type for editing project
type EditProjectValues = z.infer<typeof editProjectSchema>;

export default function ProjectDetail({ id }: ProjectDetailProps) {
  const [_, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [isItemsImportOpen, setIsItemsImportOpen] = useState(false);
  const [isEditProjectOpen, setIsEditProjectOpen] = useState(false);
  const [isEditItemOpen, setIsEditItemOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  
  // Enhanced debugging for project ID handling
  console.log("Project ID from prop:", id);
  console.log("Project ID type:", typeof id);
  
  // Use the provided ID directly
  const projectId = id;
  
  // Initialize form with empty values first (will be updated later)
  const form = useForm<EditProjectValues>({
    resolver: zodResolver(editProjectSchema),
    defaultValues: {
      name: "",
      description: "",
      status: "planning",
      priority: "Medium",
      customerId: null,
      startDate: "",
      targetEndDate: "",
      budget: undefined,
      code: "",
      financialYear: "",
      shippingAddress: "",
      deliveryMethod: "standard",
      client: "",
      vendor: "",
    },
  });
  
  // Form for editing project items
  const itemForm = useForm<EditItemValues>({
    resolver: zodResolver(editItemSchema),
    defaultValues: {
      itemCode: "",
      description: "",
      quantity: 1,
      uom: "",
      makeOrBuy: "Buy",
      drawingNo: "",
    },
  });
  
  // Add a visible message if there are issues with the ID
  useEffect(() => {
    console.log("Project Detail Component mounted with ID:", projectId);
  }, [projectId]);
  
  // Handle missing project ID
  useEffect(() => {
    if (!projectId) {
      toast({
        title: "Missing Project ID",
        description: "No project ID was provided. Redirecting to the projects list.",
        variant: "destructive"
      });
      navigate("/projects");
    }
  }, [projectId, navigate, toast]);

  const { data: project, isLoading: isLoadingProject, error: projectError } = useQuery({
    queryKey: [`/api/projects/${projectId}`],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) {
        if (response.status === 400) {
          toast({
            title: "Invalid Project ID",
            description: "The project ID is not valid. Redirecting to the projects list.",
            variant: "destructive"
          });
          navigate("/projects");
          throw new Error("Invalid project ID");
        }
        throw new Error("Failed to fetch project details");
      }
      const data = await response.json();
      console.log("Project data received:", data);
      console.log("Project data start_date:", data.start_date);
      console.log("Project data target_end_date:", data.target_end_date);
      console.log("Project data client_name:", data.client_name);
      console.log("Project data financial_year:", data.financial_year);
      console.log("Project data startDate:", data.startDate);
      console.log("Project data targetEndDate:", data.targetEndDate);
      console.log("Project data customerId:", data.customerId);
      console.log("Project data financialYear:", data.financialYear);
      return data;
    },
    enabled: !!projectId
  });
  
  // Update form values when project data is loaded
  useEffect(() => {
    if (project) {
      form.reset({
        name: project.name || "",
        description: project.description || "",
        status: project.status || "planning",
        priority: project.priority || "Medium",
        customerId: project.customerId || null,
        startDate: project.startDate || "",
        targetEndDate: project.targetEndDate || "",
        budget: project.budget || undefined,
        code: project.code || "",
        financialYear: project.financialYear || "",
        shippingAddress: project.shippingAddress || "",
        deliveryMethod: project.deliveryMethod || "standard",
        client: project.client || "",
        vendor: project.vendor || "",
      });
    }
  }, [project, form]);

  const { data: phases, isLoading: isLoadingPhases } = useQuery({
    queryKey: [`/api/projects/${projectId}/phases`],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/phases`);
      if (!response.ok) {
        throw new Error("Failed to fetch project phases");
      }
      return response.json();
    },
    enabled: !!project
  });

  const { data: members, isLoading: isLoadingMembers } = useQuery({
    queryKey: [`/api/projects/${projectId}/members`],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/members`);
      if (!response.ok) {
        throw new Error("Failed to fetch project members");
      }
      return response.json();
    },
    enabled: !!project
  });

  const { data: tasks, isLoading: isLoadingTasks } = useQuery({
    queryKey: [`/api/projects/${projectId}/tasks`],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/tasks`);
      if (!response.ok) {
        throw new Error("Failed to fetch project tasks");
      }
      return response.json();
    },
    enabled: !!project
  });
  
  const { data: projectItems, isLoading: isLoadingItems } = useQuery({
    queryKey: [`/api/projects/${projectId}/items`],
    queryFn: async () => {
      console.log(`Fetching items for project ID: ${projectId}`);
      try {
        const response = await fetch(`/api/projects/${projectId}/items`);
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Error fetching project items: ${errorText}`);
          throw new Error("Failed to fetch project items");
        }
        const data = await response.json();
        console.log(`Successfully fetched ${data.length} project items`);
        return data;
      } catch (error) {
        console.error(`Exception in fetchProjectItems: ${error}`);
        throw error;
      }
    },
    enabled: !!project
  });
  
  // Fetch customers for use in edit form
  const { data: customers, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['/api/customers'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/customers');
        if (!response.ok) {
          throw new Error('Failed to fetch customers');
        }
        return await response.json();
      } catch (error) {
        console.error('Error fetching customers:', error);
        throw error;
      }
    }
  });

  // Submit handler for editing project
  const updateProjectMutation = useMutation({
    mutationFn: async (data: EditProjectValues) => {
      const res = await apiRequest("PUT", `/api/projects/${projectId}`, data);
      if (!res.ok) {
        throw new Error("Failed to update project");
      }
      return await res.json();
    },
    onSuccess: () => {
      setIsEditProjectOpen(false);
      toast({
        title: "Project updated",
        description: "Project details have been successfully updated.",
      });
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
    },
    onError: (error) => {
      toast({
        title: "Error updating project",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Mutation for updating a project item
  const updateProjectItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: any }) => {
      const res = await apiRequest("PUT", `/api/project-items/${id}`, data);
      if (!res.ok) {
        throw new Error("Failed to update project item");
      }
      return await res.json();
    },
    onSuccess: () => {
      setIsEditItemOpen(false);
      toast({
        title: "Item updated",
        description: "Project item has been successfully updated.",
      });
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/items`] });
    },
    onError: (error) => {
      toast({
        title: "Error updating project item",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Mutation for deleting a project item
  const deleteProjectItemMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/project-items/${id}`);
      if (!res.ok) {
        throw new Error("Failed to delete project item");
      }
      return await res.json();
    },
    onSuccess: () => {
      setIsDeleteConfirmOpen(false);
      toast({
        title: "Item deleted",
        description: "Project item has been successfully deleted.",
      });
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/items`] });
    },
    onError: (error) => {
      toast({
        title: "Error deleting project item",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function formatDate(dateString) {
    if (!dateString || dateString === "null" || dateString === "undefined") return "Not set";
    try {
      const date = new Date(dateString);
      // Check if date is valid
      if (isNaN(date.getTime())) return "Not set";
      
      return format(date, 'MMM d, yyyy');
    } catch (e) {
      console.error("Error formatting date:", e);
      return "Not set";
    }
  }

  function getStatusBadgeColor(status) {
    switch (status) {
      case "planning":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "active":
        return "bg-green-100 text-green-800 border-green-200";
      case "on_hold":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "completed":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "canceled":
        return "bg-red-100 text-red-800 border-red-200";
      case "pending":
        return "bg-gray-100 text-gray-800 border-gray-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  }

  function getPriorityBadgeColor(priority) {
    switch (priority) {
      case "High":
        return "bg-red-100 text-red-800 border-red-200";
      case "Medium":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "Low":
        return "bg-green-100 text-green-800 border-green-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  }

  function getInitials(name) {
    if (!name) return '?'; // Handle undefined or null names
    
    return name
      .split(' ')
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase();
  }

  function calculateProgress(phases) {
    if (!phases || phases.length === 0) return 0;
    
    const completedPhases = phases.filter(phase => phase.status === 'completed').length;
    return Math.round((completedPhases / phases.length) * 100);
  }

  function getRoleColor(role) {
    switch (role) {
      case "project_manager":
        return "bg-blue-100 text-blue-800";
      case "phase_lead":
        return "bg-purple-100 text-purple-800";
      case "team_member":
        return "bg-green-100 text-green-800";
      case "consultant":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  }

  function getPhaseStatusIcon(status) {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "active":
        return <Clock className="w-5 h-5 text-blue-500" />;
      case "on_hold":
        return <AlertCircle className="w-5 h-5 text-amber-500" />;
      case "canceled":
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  }

  function onSubmit(data: EditProjectValues) {
    // Create a copy of the data to avoid mutating the original
    const formattedData = { ...data };
    
    // Ensure dates are properly formatted as strings in YYYY-MM-DD format
    // which is exactly how the server is expecting them
    if (formattedData.startDate) {
      console.log("Start date before submission:", formattedData.startDate);
      // Keep as is - already in YYYY-MM-DD format from the date input
    }
    
    if (formattedData.targetEndDate) {
      console.log("Target end date before submission:", formattedData.targetEndDate);
      // Keep as is - already in YYYY-MM-DD format from the date input
    }
    
    // Don't add updatedAt field here - let the server handle it
    // to avoid any date formatting issues
    
    console.log("Submitting project update:", formattedData);
    updateProjectMutation.mutate(formattedData);
  }
  
  // Return early to prevent any API calls with invalid ID
  if (!projectId) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Missing Project ID</h2>
          <p className="text-muted-foreground">Redirecting to projects list...</p>
        </div>
      </div>
    );
  }

  if (isLoadingProject) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className="text-center p-4">
        <p className="text-red-600">Error loading project details</p>
        <Button variant="outline" onClick={() => navigate("/projects")}>
          Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Edit Item Dialog */}
      <Dialog open={isEditItemOpen} onOpenChange={setIsEditItemOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Project Item</DialogTitle>
            <DialogDescription>
              Update the project item quantity below. Item details are managed through the Item Master.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-3 text-sm text-blue-800">
            <p className="flex items-center gap-1">
              <Info className="h-4 w-4" /> Master item fields like Item Code, Description, UOM, Make/Buy, and Drawing No are read-only. 
              Only the quantity can be modified here. To edit item details, please use the Item Master section.
            </p>
          </div>
          <Form {...itemForm}>
            <form onSubmit={(e) => {
              e.preventDefault(); // Prevent form from submitting normally
              
              itemForm.handleSubmit((data) => {
                if (!selectedItem) return;
                
                // Only update the quantity, as other fields are on the master item
                // and should not be directly updated through the project item
                const itemData = {
                  quantity: Number(data.quantity)
                };
                
                console.log("Submitting project item update with data:", itemData);
                updateProjectItemMutation.mutate({ 
                  id: selectedItem.id, 
                  data: itemData 
                });
              })(e); // Pass the event to the handleSubmit function
            }} className="space-y-4">
              <FormField
                control={itemForm.control}
                name="itemCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Item Code</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter item code" 
                        {...field} 
                        disabled 
                        className="bg-muted cursor-not-allowed" 
                      />
                    </FormControl>
                    <FormDescription>
                      Item code cannot be modified here
                    </FormDescription>
                  </FormItem>
                )}
              />
              <FormField
                control={itemForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter item description" 
                        {...field} 
                        disabled 
                        className="bg-muted cursor-not-allowed" 
                      />
                    </FormControl>
                    <FormDescription>
                      Description cannot be modified here
                    </FormDescription>
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={itemForm.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="Enter quantity" 
                          {...field}
                          onChange={(e) => {
                            const value = e.target.value ? parseInt(e.target.value) : 1;
                            field.onChange(value);
                          }}
                          value={field.value?.toString() || '1'}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={itemForm.control}
                  name="uom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>UOM</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter unit of measure" 
                          {...field} 
                          disabled 
                          className="bg-muted cursor-not-allowed" 
                        />
                      </FormControl>
                      <FormDescription>
                        UOM cannot be modified here
                      </FormDescription>
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={itemForm.control}
                  name="makeOrBuy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Make/Buy</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                        disabled
                      >
                        <FormControl>
                          <SelectTrigger className="bg-muted cursor-not-allowed">
                            <SelectValue placeholder="Select make or buy" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Make">Make</SelectItem>
                          <SelectItem value="Buy">Buy</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Make/Buy cannot be modified here
                      </FormDescription>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={itemForm.control}
                  name="drawingNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Drawing No</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter drawing number" 
                          {...field} 
                          disabled 
                          className="bg-muted cursor-not-allowed" 
                        />
                      </FormControl>
                      <FormDescription>
                        Drawing No cannot be modified here
                      </FormDescription>
                    </FormItem>
                  )}
                />
              </div>
              
              <DialogFooter>
                <Button type="submit" disabled={updateProjectItemMutation.isPending}>
                  {updateProjectItemMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Project Item</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this item? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          {selectedItem && (
            <div className="py-4">
              <div className="grid grid-cols-2 mb-4">
                <div className="font-semibold">Item Code:</div>
                <div>{selectedItem.itemCode}</div>
              </div>
              <div className="grid grid-cols-2 mb-4">
                <div className="font-semibold">Description:</div>
                <div>{selectedItem.description}</div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => selectedItem && deleteProjectItemMutation.mutate(selectedItem.id)}
              disabled={deleteProjectItemMutation.isPending}
            >
              {deleteProjectItemMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Project Dialog */}
      <Dialog open={isEditProjectOpen} onOpenChange={setIsEditProjectOpen}>
        <DialogContent className="sm:max-w-screen-xl w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Project Details</DialogTitle>
            <DialogDescription>
              Update the project information below. Click save when you're done.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter project name" {...field} />
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
                        placeholder="Enter project description" 
                        {...field} 
                        className="min-h-[100px]"
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
                          <SelectItem value="planning">Planning</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="on_hold">On Hold</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="canceled">Canceled</SelectItem>
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
              
              <FormField
                control={form.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(value && value !== "none" ? parseInt(value) : null)} 
                      defaultValue={field.value?.toString() || "none"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No Customer</SelectItem>
                        {customers?.map((customer) => (
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
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="targetEndDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target End Date</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Budget Field */}
              <FormField
                control={form.control}
                name="budget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Budget</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="Enter project budget" 
                        {...field}
                        onChange={(e) => {
                          const value = e.target.value ? parseFloat(e.target.value) : undefined;
                          field.onChange(value);
                        }}
                        value={field.value?.toString() || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Project Code - Read Only */}
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Code</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        disabled 
                        className="bg-muted cursor-not-allowed"
                      />
                    </FormControl>
                    <FormDescription>
                      Project code cannot be modified
                    </FormDescription>
                  </FormItem>
                )}
              />

              {/* Financial Year - Read Only */}
              <FormField
                control={form.control}
                name="financialYear"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Financial Year</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        disabled 
                        className="bg-muted cursor-not-allowed"
                      />
                    </FormControl>
                    <FormDescription>
                      Financial year cannot be modified
                    </FormDescription>
                  </FormItem>
                )}
              />
              
              {/* Tabs for Project Details, Stages, Logistics, Attachments */}
              <Tabs defaultValue="project-details" className="w-full mt-6">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="project-details" className="flex items-center gap-1">
                    <ClipboardList className="h-4 w-4" /> Project Details
                  </TabsTrigger>
                  <TabsTrigger value="project-stages" className="flex items-center gap-1">
                    <Milestone className="h-4 w-4" /> Project Stages
                  </TabsTrigger>
                  <TabsTrigger value="logistics" className="flex items-center gap-1">
                    <Truck className="h-4 w-4" /> Logistics
                  </TabsTrigger>
                  <TabsTrigger value="attachments" className="flex items-center gap-1">
                    <Paperclip className="h-4 w-4" /> Attachments
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="project-details" className="space-y-4 mt-4">
                  {/* Project Items Section */}
                  <div className="space-y-3 border rounded-md p-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-medium">Project Items</h3>
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm"
                        onClick={() => setIsItemsImportOpen(true)}
                      >
                        <FileUp className="h-4 w-4 mr-2" />
                        Import Project Items
                      </Button>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item Code</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead>UOM</TableHead>
                            <TableHead>Make/Buy</TableHead>
                            <TableHead>Drawing No</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {projectItems && projectItems.length > 0 ? (
                            projectItems.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell>{item.masterItem?.itemCode || "N/A"}</TableCell>
                                <TableCell>{item.masterItem?.description || "N/A"}</TableCell>
                                <TableCell>{item.quantity}</TableCell>
                                <TableCell>{item.masterItem?.uom || "N/A"}</TableCell>
                                <TableCell>{item.masterItem?.makeOrBuy || "N/A"}</TableCell>
                                <TableCell>{item.masterItem?.drawingNo || "-"}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedItem(item);
                                        itemForm.reset({
                                          itemCode: item.masterItem?.itemCode || "",
                                          description: item.masterItem?.description || "",
                                          quantity: item.quantity || 1,
                                          uom: item.masterItem?.uom || "",
                                          makeOrBuy: (item.masterItem?.makeOrBuy as "Make" | "Buy") || "Buy",
                                          drawingNo: item.masterItem?.drawingNo || "",
                                        });
                                        setIsEditItemOpen(true);
                                      }}
                                    >
                                      <Edit className="h-4 w-4 mr-1" /> Edit
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                                No project items found. Use the Import button to add items.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="project-stages" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border rounded-md p-4">
                      <h3 className="text-sm font-medium mb-3">Design Phase</h3>
                      <p className="text-xs text-muted-foreground mb-2">Configure design phase details</p>
                      <div className="space-y-3">
                        <div className="flex justify-between text-xs">
                          <span>Status</span>
                          <Badge variant="outline" className="bg-blue-50 text-blue-800">Planning</Badge>
                        </div>
                        <Progress value={0} className="h-1" />
                      </div>
                    </div>
                    
                    <div className="border rounded-md p-4">
                      <h3 className="text-sm font-medium mb-3">Procurement Phase</h3>
                      <p className="text-xs text-muted-foreground mb-2">Configure procurement phase details</p>
                      <div className="space-y-3">
                        <div className="flex justify-between text-xs">
                          <span>Status</span>
                          <Badge variant="outline" className="bg-gray-50 text-gray-800">Not Started</Badge>
                        </div>
                        <Progress value={0} className="h-1" />
                      </div>
                    </div>
                    
                    <div className="border rounded-md p-4">
                      <h3 className="text-sm font-medium mb-3">Manufacturing Phase</h3>
                      <p className="text-xs text-muted-foreground mb-2">Configure manufacturing phase details</p>
                      <div className="space-y-3">
                        <div className="flex justify-between text-xs">
                          <span>Status</span>
                          <Badge variant="outline" className="bg-gray-50 text-gray-800">Not Started</Badge>
                        </div>
                        <Progress value={0} className="h-1" />
                      </div>
                    </div>
                    
                    <div className="border rounded-md p-4">
                      <h3 className="text-sm font-medium mb-3">Quality Phase</h3>
                      <p className="text-xs text-muted-foreground mb-2">Configure quality phase details</p>
                      <div className="space-y-3">
                        <div className="flex justify-between text-xs">
                          <span>Status</span>
                          <Badge variant="outline" className="bg-gray-50 text-gray-800">Not Started</Badge>
                        </div>
                        <Progress value={0} className="h-1" />
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="logistics" className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="shippingAddress"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Shipping Address</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Enter shipping address"
                                className="min-h-[100px]"
                                {...field}
                                value={field.value || ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="client"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Client Contact Person</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter client contact person name"
                                {...field}
                                value={field.value || ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="deliveryMethod"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Delivery Method</FormLabel>
                            <Select 
                              onValueChange={field.onChange} 
                              value={field.value || "standard"}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select delivery method" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="standard">Standard Shipping</SelectItem>
                                <SelectItem value="express">Express Shipping</SelectItem>
                                <SelectItem value="pickup">Customer Pickup</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="vendor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Vendor Contact</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter vendor contact information"
                                {...field}
                                value={field.value || ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="attachments" className="space-y-4 mt-4">
                  <div className="border-2 border-dashed rounded-lg p-8 text-center">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm mb-1">Drag & drop files here or click to browse</p>
                    <p className="text-xs text-muted-foreground mb-4">Upload project documentation, drawings, and other relevant files</p>
                    <Button type="button" variant="outline" size="sm">Browse Files</Button>
                  </div>
                  
                  <div className="rounded-md border">
                    <div className="p-4">
                      <h3 className="text-sm font-medium mb-3">Uploaded Attachments</h3>
                      <p className="text-xs text-muted-foreground">No attachments yet. Add files above.</p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
              
              {/* Add Project Items Import Dialog inside the Edit Project dialog */}
              <ProjectItemsImport 
                projectId={projectId} 
                projectCode={project?.code || ''}
                open={isItemsImportOpen}
                onOpenChange={setIsItemsImportOpen}
                onImportComplete={() => {
                  setIsItemsImportOpen(false);
                  // Invalidate the project items query to refresh the data
                  queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/items`] });
                }}
              />

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsEditProjectOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateProjectMutation.isPending}
                >
                  {updateProjectMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <div>
        <Button 
          variant="ghost" 
          className="mb-4" 
          onClick={() => navigate("/projects")}
        >
          <ChevronLeft className="mr-1 h-4 w-4" /> Back to Projects
        </Button>
        
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-3xl font-bold">{project.name}</h1>
              <Badge 
                variant="outline" 
                className={`ml-2 ${getStatusBadgeColor(project.status)}`}
              >
                {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
              </Badge>
              <Badge 
                variant="outline" 
                className={getPriorityBadgeColor(project.priority)}
              >
                {project.priority}
              </Badge>
            </div>
            <p className="text-gray-500 text-sm">Project Code: {project.code}</p>
            <p className="mt-2">{project.description}</p>
            <p className="text-muted-foreground text-sm mt-2">
              <span className="inline-flex items-center gap-1 mr-4">
                <Calendar className="h-4 w-4" /> Started: {formatDate(project.start_date)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-4 w-4" /> Target End: {formatDate(project.target_end_date)}
              </span>
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              <span className="inline-flex items-center gap-1 mr-4">
                <Building className="h-4 w-4" /> Customer: {project.client_name || "None"}
              </span>
              <span className="inline-flex items-center gap-1">
                <FileText className="h-4 w-4" /> Financial Year: {project.financial_year || "Not set"}
              </span>
            </p>
          </div>
          <div className="space-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline"
                    onClick={() => setIsEditProjectOpen(true)}
                  >
                    <Edit className="h-4 w-4 mr-1" /> Edit Project
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Edit project details
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="mt-6">
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="phases">Phases</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{calculateProgress(phases)}% Complete</span>
                      <span>{phases?.filter(p => p.status === 'completed').length || 0}/{phases?.length || 0} Phases</span>
                    </div>
                    <Progress value={calculateProgress(phases)} className="h-2" />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Tasks</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-green-50 border border-green-100 rounded-md p-3 text-center">
                        <p className="text-2xl font-bold text-green-700">
                          {tasks?.filter(t => t.status === 'completed').length || 0}
                        </p>
                        <p className="text-xs text-green-600">Completed</p>
                      </div>
                      <div className="bg-amber-50 border border-amber-100 rounded-md p-3 text-center">
                        <p className="text-2xl font-bold text-amber-700">
                          {tasks?.filter(t => t.status !== 'completed').length || 0}
                        </p>
                        <p className="text-xs text-amber-600">Pending</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Team</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {members?.map((member, index) => (
                      <TooltipProvider key={index}>
                        <Tooltip>
                          <TooltipTrigger>
                            <Avatar className="h-8 w-8 border border-gray-200">
                              <AvatarFallback className="text-xs">
                                {getInitials(member.username)}
                              </AvatarFallback>
                            </Avatar>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{member.username}</p>
                            <p className="text-xs text-muted-foreground">{member.role}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Updates</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative pl-6 border-l border-border space-y-4">
                  {project && (
                    <div className="relative">
                      <div className="absolute -left-[23px] bg-primary rounded-full h-4 w-4 border-4 border-background"></div>
                      <p className="font-medium">Project Created</p>
                      <p className="text-muted-foreground text-sm">{formatDate(project.created_at)}</p>
                    </div>
                  )}
                  {phases?.filter(p => p.status === 'completed').map((p) => (
                    <div className="relative" key={p.id}>
                      <div className="absolute -left-[23px] bg-green-500 rounded-full h-4 w-4 border-4 border-background"></div>
                      <p className="font-medium">{p.name} Phase Completed</p>
                      <p className="text-muted-foreground text-sm">{formatDate(p.updated_at)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="phases" className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Project Phases</h2>
              <Button>
                <Plus className="mr-1 h-4 w-4" /> Add Phase
              </Button>
            </div>
            
            <div className="grid gap-4">
              {phases?.map((phase, index) => (
                <Card key={index}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle>{phase.name}</CardTitle>
                          <Badge 
                            variant="outline" 
                            className={getStatusBadgeColor(phase.status)}
                          >
                            {phase.status.charAt(0).toUpperCase() + phase.status.slice(1)}
                          </Badge>
                        </div>
                        <CardDescription>Phase {index + 1} of {phases.length}</CardDescription>
                      </div>
                      {getPhaseStatusIcon(phase.status)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-2">{phase.description}</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
                      <div>
                        <p className="text-muted-foreground">Start Date</p>
                        <p>{formatDate(phase.start_date)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">End Date</p>
                        <p>{formatDate(phase.end_date)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Lead</p>
                        <p>
                          {members?.find(m => m.userId === phase.lead_id)?.username || 'Not assigned'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span>
                          {phase.deliverables_completed || 0}/{phase.deliverables_total || 0} Deliverables
                        </span>
                      </div>
                      <Progress value={phase.progress || 0} className="h-2" />
                    </div>
                  </CardContent>
                  <CardFooter className="border-t pt-4">
                    <div className="flex justify-end space-x-2 w-full">
                      <Button variant="outline" size="sm">
                        <ClipboardList className="mr-1 h-4 w-4" /> Deliverables
                      </Button>
                      <Button variant="outline" size="sm">
                        <Edit className="mr-1 h-4 w-4" /> Edit
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="team" className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Project Team</h2>
              <Button>
                <Plus className="mr-1 h-4 w-4" /> Add Member
              </Button>
            </div>
            
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Join Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members?.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>{getInitials(m.username)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{m.username}</p>
                              <p className="text-xs text-muted-foreground">{m.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getRoleColor(m.role)}>
                            {m.role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(m.joined_date)}</TableCell>
                        <TableCell>
                          <Badge variant={m.isActive ? "default" : "outline"} className={m.isActive ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-gray-100 text-gray-800"}>
                            {m.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="tasks" className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Project Tasks</h2>
              <Button>
                <Plus className="mr-1 h-4 w-4" /> Add Task
              </Button>
            </div>
            
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Assignee</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks?.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{task.title}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                              {task.description}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {task.assignedToName || "Unassigned"}
                        </TableCell>
                        <TableCell>{formatDate(task.dueDate)}</TableCell>
                        <TableCell>
                          <Badge variant={task.status === 'completed' ? "default" : "outline"} className={task.status === 'completed' ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-amber-100 text-amber-800"}>
                            {task.status === 'completed' ? "Completed" : "In Progress"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="details" className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Project Details</h2>
              <Button 
                variant="outline"
                onClick={() => setIsItemsImportOpen(true)}
              >
                <FileSpreadsheet className="mr-1 h-4 w-4" /> Import Project Items
              </Button>
            </div>
            
            {/* Project Items Import Dialog */}
            <ProjectItemsImport 
              projectId={projectId} 
              projectCode={project.code}
              open={isItemsImportOpen}
              onOpenChange={setIsItemsImportOpen}
              onImportComplete={() => {
                setIsItemsImportOpen(false);
                // Invalidate the project items query to refresh the data
                queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/items`] });
              }}
            />
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Project Items</CardTitle>
                <CardDescription>
                  {projectItems?.length || 0} items
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Code</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>UOM</TableHead>
                      <TableHead>Make/Buy</TableHead>
                      <TableHead>Drawing No</TableHead>
                      <TableHead>Created At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingItems ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : projectItems?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-4">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <Boxes className="h-10 w-10 mb-2" />
                            <p>No project items yet</p>
                            <p className="text-sm">Import items using the button above</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      projectItems?.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.masterItem?.itemCode || "N/A"}</TableCell>
                          <TableCell>{item.masterItem?.description || "N/A"}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.masterItem?.uom || "N/A"}</TableCell>
                          <TableCell>{item.masterItem?.makeOrBuy || "N/A"}</TableCell>
                          <TableCell>{item.masterItem?.drawingNo || "-"}</TableCell>
                          <TableCell>{formatDate(item.createdAt)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault(); // Prevent any default behavior
                                  e.stopPropagation(); // Stop event bubbling
                                  
                                  console.log("Edit item button clicked for item:", item);
                                  setSelectedItem(item);
                                  itemForm.reset({
                                    itemCode: item.masterItem?.itemCode || "",
                                    description: item.masterItem?.description || "",
                                    quantity: item.quantity || 1,
                                    uom: item.masterItem?.uom || "",
                                    makeOrBuy: (item.masterItem?.makeOrBuy as "Make" | "Buy") || "Buy",
                                    drawingNo: item.masterItem?.drawingNo || "",
                                  });
                                  setIsEditItemOpen(true);
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault(); // Prevent any default behavior
                                  e.stopPropagation(); // Stop event bubbling
                                  
                                  console.log("Delete item button clicked for item:", item);
                                  setSelectedItem(item);
                                  setIsDeleteConfirmOpen(true);
                                }}
                              >
                                <XCircle className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}