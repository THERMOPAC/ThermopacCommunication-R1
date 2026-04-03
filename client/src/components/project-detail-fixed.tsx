import React, { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from 'date-fns';
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import FileStorage from "@/components/file-storage";
const CommercialChangesTab = lazy(() => import("@/components/commercial-changes-tab"));
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
import { Checkbox } from "@/components/ui/checkbox";
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
  Info,
  Trash2,
  MoreVertical,
  FolderPlus,
  ArrowRight
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  status: z.enum([
    "Not Started",
    "Drawing Received",
    "Material Received",
    "Under Construction",
    "Completed",
    "On Hold",
    "Cancelled"
  ]).default("Not Started"),
});

type EditItemValues = z.infer<typeof editItemSchema>;

const phaseFormSchema = z.object({
  name: z.string().min(1, "Phase name is required"),
  description: z.string().min(1, "Description is required"),
  startDate: z.string().min(1, "Start date is required"),
  targetEndDate: z.string().min(1, "Target end date is required"),
  status: z.enum(["pending", "in_progress", "completed", "blocked"]).default("pending"),
  notes: z.string().optional(),
});

type PhaseFormValues = z.infer<typeof phaseFormSchema>;

const deliverableFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  dueDate: z.string().min(1, "Due date is required"),
  status: z.enum(["pending", "in_progress", "submitted", "approved", "rejected"]).default("pending"),
  notes: z.string().optional(),
});

type DeliverableFormValues = z.infer<typeof deliverableFormSchema>;

const memberFormSchema = z.object({
  userId: z.number().min(1, "Please select a user"),
  role: z.enum(["project_manager", "phase_lead", "team_member", "consultant"]),
});

type MemberFormValues = z.infer<typeof memberFormSchema>;

const taskFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  assignedTo: z.number().optional(),
  dueDate: z.string().min(1, "Due date is required"),
  priority: z.enum(["High", "Medium", "Low"]).default("Medium"),
  status: z.enum(["pending", "in_progress", "completed"]).default("pending"),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

const editProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().min(1, "Project description is required"),
  status: z.enum(["planning", "active", "on_hold", "completed", "canceled"]),
  priority: z.enum(["High", "Medium", "Low"]),
  customerId: z.number().min(1, "Customer is required"),
  startDate: z.string().min(1, "Start date is required"),
  targetEndDate: z.string().min(1, "Target end date is required"),
  estimatedBudget: z.number().optional(),
  // Project code is read-only, but required for the form
  code: z.string().optional(),

  // Currency for project budget
  currency: z.enum(["USD", "EUR", "INR"]).default("USD"),
  // Project Items Search field
  projectItemsSearch: z.string().optional(),
  // Additional fields for logistics tab
  shippingAddress: z.string().optional(),
  deliveryMethod: z.enum(["standard", "express", "pickup"]).optional(),
  client: z.string().optional(),
  vendor: z.string().optional(),
});

// Form type for editing project
type EditProjectValues = z.infer<typeof editProjectSchema>;

export default function ProjectDetail({ id }: ProjectDetailProps) {
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [isItemsImportOpen, setIsItemsImportOpen] = useState(false);
  const [isEditProjectOpen, setIsEditProjectOpen] = useState(false);
  const [isEditItemOpen, setIsEditItemOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  
  // State for status update confirmation
  const [isStatusUpdateConfirmOpen, setIsStatusUpdateConfirmOpen] = useState(false);
  const [statusUpdateDetails, setStatusUpdateDetails] = useState<{itemId: number, status: string, oldStatus: string, itemCode: string} | null>(null);
  
  const [isAddPhaseOpen, setIsAddPhaseOpen] = useState(false);
  const [isEditPhaseOpen, setIsEditPhaseOpen] = useState(false);
  const [editingPhase, setEditingPhase] = useState<any>(null);
  const [isDeliverablesOpen, setIsDeliverablesOpen] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<any>(null);
  const [isAddDeliverableOpen, setIsAddDeliverableOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [isEditTaskOpen, setIsEditTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  
  // Enhanced debugging for project ID handling
  console.log("Project ID from prop:", id);
  console.log("Project ID type:", typeof id);
  
  // Use the provided ID directly
  const projectId = id;

  // Handle Back to Projects navigation with Keep Visible functionality
  const handleBackToProjects = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const projectParam = urlParams.get('project');
    const keepParam = urlParams.get('keep');
    
    if (keepParam === 'true' && projectParam) {
      navigate(`/projects?project=${projectParam}&keep=true`);
    } else {
      navigate('/projects');
    }
  };
  
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
      estimatedBudget: undefined,
      code: "",
      currency: "USD",
      projectItemsSearch: "",
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
      status: "Not Started",
    },
  });
  
  // Query for fetching project key stages
  const keyStagesQuery = useQuery({
    queryKey: [`/api/projects/${projectId}/key-stages`],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/key-stages`);
      if (!response.ok) {
        throw new Error("Failed to fetch project key stages");
      }
      return await response.json();
    },
    enabled: !!projectId
  });

  // Mutation for toggling key stage completion
  const toggleKeyStageCompletionMutation = useMutation({
    mutationFn: async ({ stageId, isCompleted }: { stageId: number, isCompleted: boolean }) => {
      const endpoint = isCompleted 
        ? `/api/projects/${projectId}/key-stages/${stageId}/complete`
        : `/api/projects/${projectId}/key-stages/${stageId}/incomplete`;
        
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to update key stage completion status");
      }
      
      // Handle empty responses or 204 No Content
      return response.status === 204 || response.headers.get('content-length') === '0' 
        ? { id: stageId, isCompleted } // Return minimal data if no response
        : await response.json();
    },
    onSuccess: () => {
      // Refresh the key stages data
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/key-stages`] });
      
      toast({
        title: "Stage updated",
        description: "The project stage has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update stage",
        description: error.message || "An error occurred while updating the stage.",
        variant: "destructive"
      });
    }
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
      console.log("Loading form with estimatedBudget:", project.estimatedBudget);
      form.reset({
        name: project.name || "",
        description: project.description || "",
        status: project.status || "planning",
        priority: project.priority || "Medium",
        customerId: project.customerId || null,
        startDate: project.startDate || "",
        targetEndDate: project.targetEndDate || "",
        estimatedBudget: project.estimatedBudget || undefined,
        code: project.code || "",
        currency: project.currency || "USD",
        projectItemsSearch: "",
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

  // Watch the search term from the form
  const searchTerm = form.watch("projectItemsSearch");

  // Filter project items based on search term
  const filteredProjectItems = useMemo(() => {
    if (!projectItems || !searchTerm?.trim()) {
      return projectItems || [];
    }

    const searchLower = searchTerm.toLowerCase().trim();
    
    return projectItems.filter((item: any) => {
      // Check both direct properties and nested masterItem properties
      const itemCode = (item.itemCode || item.masterItem?.itemCode || "").toLowerCase();
      const description = (item.description || item.masterItem?.description || "").toLowerCase();
      const drawingNo = (item.drawingNo || item.masterItem?.drawingNo || "").toLowerCase();
      
      return itemCode.includes(searchLower) || 
             description.includes(searchLower) || 
             drawingNo.includes(searchLower);
    });
  }, [projectItems, searchTerm]);
  
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
      // Remove search field from data before sending to backend
      const { projectItemsSearch, ...projectData } = data;
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(projectData)
      });
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        throw new Error(errorText || "Failed to update project");
      }
      
      // Handle empty responses or 204 No Content
      return res.status === 204 || res.headers.get('content-length') === '0' 
        ? data // Return the original data if no content
        : await res.json();
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
      const res = await fetch(`/api/project-items/${id}`, {
        method: "PUT",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        throw new Error(errorText || "Failed to update project item");
      }
      
      // Handle empty responses or 204 No Content
      return res.status === 204 || res.headers.get('content-length') === '0' 
        ? data // Return the original data
        : await res.json();
    },
    onSuccess: () => {
      setIsEditItemOpen(false);
      toast({
        title: "Item updated",
        description: "Project item quantity has been successfully updated.",
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
      const res = await fetch(`/api/project-items/${id}`, {
        method: "DELETE",
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        throw new Error(errorText || "Failed to delete project item");
      }
      
      // For 204 No Content response, return empty object instead of trying to parse JSON
      return res.status === 204 ? {} : await res.json();
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
  
  // Update project item status
  const updateProjectItemStatusMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: number, status: string }) => {
      const res = await fetch(`/api/project-items/${itemId}`, {
        method: "PUT",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status })
      });
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        throw new Error(errorText || "Failed to update item status");
      }
      
      return res.status === 204 ? { status } : await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Status updated",
        description: `Item status has been changed to "${data.status}".`,
      });
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/items`] });
    },
    onError: (error) => {
      toast({
        title: "Error updating status",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Helper function to update project item status
  const updateProjectItemStatus = (itemId: number, status: string) => {
    // Find the item to get its current status and item code
    const item = projectItems?.find(item => item.id === itemId);
    if (item) {
      // Only show confirmation if status is changing
      if (item.status !== status) {
        setStatusUpdateDetails({
          itemId,
          status,
          oldStatus: item.status || 'Not Started',
          itemCode: item.masterItem?.itemCode || `Item #${itemId}`
        });
        setIsStatusUpdateConfirmOpen(true);
      }
    } else {
      // If we can't find the item for some reason, just update directly
      updateProjectItemStatusMutation.mutate({ itemId, status });
    }
  };

  const phaseForm = useForm<PhaseFormValues>({
    resolver: zodResolver(phaseFormSchema),
    defaultValues: {
      name: "",
      description: "",
      startDate: "",
      targetEndDate: "",
      status: "pending",
      notes: "",
    },
  });

  const deliverableForm = useForm<DeliverableFormValues>({
    resolver: zodResolver(deliverableFormSchema),
    defaultValues: {
      name: "",
      description: "",
      dueDate: "",
      status: "pending",
      notes: "",
    },
  });

  const { data: deliverables, isLoading: isLoadingDeliverables } = useQuery({
    queryKey: [`/api/phases/${selectedPhase?.id}/deliverables`],
    queryFn: async () => {
      const response = await fetch(`/api/phases/${selectedPhase.id}/deliverables`);
      if (!response.ok) throw new Error("Failed to fetch deliverables");
      return response.json();
    },
    enabled: !!selectedPhase?.id && isDeliverablesOpen,
  });

  const createPhaseMutation = useMutation({
    mutationFn: async (data: PhaseFormValues) => {
      const existingPhases = phases || [];
      const res = await apiRequest("POST", `/api/projects/${projectId}/phases`, {
        ...data,
        order: existingPhases.length + 1,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Phase created", description: "New phase added successfully." });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/phases`] });
      setIsAddPhaseOpen(false);
      phaseForm.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error creating phase", description: error.message, variant: "destructive" });
    },
  });

  const updatePhaseMutation = useMutation({
    mutationFn: async ({ phaseId, data }: { phaseId: number; data: Partial<PhaseFormValues> }) => {
      const res = await apiRequest("PUT", `/api/phases/${phaseId}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Phase updated", description: "Phase updated successfully." });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/phases`] });
      setIsEditPhaseOpen(false);
      setEditingPhase(null);
      phaseForm.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error updating phase", description: error.message, variant: "destructive" });
    },
  });

  const createDeliverableMutation = useMutation({
    mutationFn: async ({ phaseId, data }: { phaseId: number; data: DeliverableFormValues }) => {
      const res = await apiRequest("POST", `/api/phases/${phaseId}/deliverables`, {
        ...data,
        projectId: parseInt(projectId),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Deliverable created", description: "New deliverable added." });
      queryClient.invalidateQueries({ queryKey: [`/api/phases/${selectedPhase?.id}/deliverables`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/phases`] });
      setIsAddDeliverableOpen(false);
      deliverableForm.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error creating deliverable", description: error.message, variant: "destructive" });
    },
  });

  const handleAddPhase = () => {
    phaseForm.reset({
      name: "",
      description: "",
      startDate: new Date().toISOString().split('T')[0],
      targetEndDate: "",
      status: "pending",
      notes: "",
    });
    setIsAddPhaseOpen(true);
  };

  const handleEditPhase = (phase: any) => {
    setEditingPhase(phase);
    phaseForm.reset({
      name: phase.name || "",
      description: phase.description || "",
      startDate: phase.start_date || phase.startDate || "",
      targetEndDate: phase.target_end_date || phase.targetEndDate || "",
      status: phase.status || "pending",
      notes: phase.notes || "",
    });
    setIsEditPhaseOpen(true);
  };

  const handleViewDeliverables = (phase: any) => {
    setSelectedPhase(phase);
    setIsDeliverablesOpen(true);
  };

  const handleAddDeliverable = () => {
    deliverableForm.reset({
      name: "",
      description: "",
      dueDate: "",
      status: "pending",
      notes: "",
    });
    setIsAddDeliverableOpen(true);
  };

  const memberForm = useForm<MemberFormValues>({
    resolver: zodResolver(memberFormSchema),
    defaultValues: {
      userId: 0,
      role: "team_member",
    },
  });

  const { data: allUsers } = useQuery({
    queryKey: ['/api/users'],
    queryFn: async () => {
      const response = await fetch('/api/users');
      if (!response.ok) throw new Error("Failed to fetch users");
      return response.json();
    },
    enabled: isAddMemberOpen,
  });

  const addMemberMutation = useMutation({
    mutationFn: async (data: MemberFormValues) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/members`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Member added", description: "Team member added successfully." });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/members`] });
      setIsAddMemberOpen(false);
      memberForm.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error adding member", description: error.message, variant: "destructive" });
    },
  });

  const handleAddMember = () => {
    memberForm.reset({ userId: 0, role: "team_member" });
    setIsAddMemberOpen(true);
  };

  const taskForm = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      assignedTo: undefined,
      dueDate: "",
      priority: "Medium",
      status: "pending",
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: TaskFormValues) => {
      const now = new Date().toISOString();
      const taskRes = await apiRequest("POST", "/api/tasks", {
        title: data.title,
        description: data.description,
        assignedTo: data.assignedTo || null,
        dueDate: data.dueDate,
        startDate: now,
        finishDate: data.dueDate,
        priority: data.priority,
        status: data.status,
        createdAt: now,
      });
      const task = await taskRes.json();
      await apiRequest("POST", `/api/projects/${projectId}/tasks`, {
        taskId: task.id,
      });
      return task;
    },
    onSuccess: () => {
      toast({ title: "Task created", description: "New project task created." });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      setIsAddTaskOpen(false);
      taskForm.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error creating task", description: error.message, variant: "destructive" });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, data }: { taskId: number; data: Partial<TaskFormValues> }) => {
      const res = await apiRequest("PATCH", `/api/tasks/${taskId}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Task updated", description: "Task updated successfully." });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      setIsEditTaskOpen(false);
      setEditingTask(null);
      taskForm.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error updating task", description: error.message, variant: "destructive" });
    },
  });

  const handleAddTask = () => {
    taskForm.reset({
      title: "",
      description: "",
      assignedTo: undefined,
      dueDate: "",
      priority: "Medium",
      status: "pending",
    });
    setIsAddTaskOpen(true);
  };

  const handleEditTask = (task: any) => {
    setEditingTask(task);
    taskForm.reset({
      title: task.title || "",
      description: task.description || "",
      assignedTo: task.assignedTo || task.assigned_to || undefined,
      dueDate: task.dueDate || task.due_date || "",
      priority: task.priority || "Medium",
      status: task.status || "pending",
    });
    setIsEditTaskOpen(true);
  };

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
    switch (status?.toLowerCase()) {
      case "planning":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "active":
        return "bg-green-100 text-green-800 border-green-200";
      case "on_hold":
      case "on hold":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "completed":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "canceled":
      case "cancelled":
        return "bg-red-100 text-red-800 border-red-200";
      case "pending":
      case "not started":
      case "drawing received":
      case "material received":
        return "bg-gray-100 text-gray-800 border-gray-200";
      case "under construction":
      case "in progress":
        return "bg-orange-100 text-orange-800 border-orange-200";
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
    <div className="space-y-6 w-full">
      {/* Edit Item Dialog */}
      <Dialog 
        open={isEditItemOpen} 
        onOpenChange={(open) => {
          // Only close the dialog when the user explicitly clicks cancel,
          // not when the form is auto-submitted
          if (!open) {
            setIsEditItemOpen(false);
          } else {
            setIsEditItemOpen(true);
          }
        }}
      >
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
                
                // Only update the quantity and status, as other fields are on the master item
                // and should not be directly updated through the project item
                const itemData = {
                  quantity: Number(data.quantity),
                  status: data.status
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
              
              {/* Status Field */}
              <FormField
                control={itemForm.control}
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
                        <SelectItem value="Not Started">Not Started</SelectItem>
                        <SelectItem value="Drawing Received">Drawing Received</SelectItem>
                        <SelectItem value="Material Received">Material Received</SelectItem>
                        <SelectItem value="Under Construction">Under Construction</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                        <SelectItem value="On Hold">On Hold</SelectItem>
                        <SelectItem value="Cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Current status of this project item
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
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
      
      {/* Status Update Confirmation Dialog */}
      <Dialog
        open={isStatusUpdateConfirmOpen}
        onOpenChange={(open) => setIsStatusUpdateConfirmOpen(open)}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Confirm Status Change</DialogTitle>
            <DialogDescription>
              Are you sure you want to change the status of this item?
            </DialogDescription>
          </DialogHeader>
          
          {statusUpdateDetails && (
            <div className="py-4">
              <div className="grid grid-cols-2 mb-4">
                <div className="font-semibold">Item Code:</div>
                <div>{statusUpdateDetails.itemCode}</div>
              </div>
              <div className="grid grid-cols-2 mb-4">
                <div className="font-semibold">Current Status:</div>
                <div>
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-800">
                    {statusUpdateDetails.oldStatus}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 mb-4">
                <div className="font-semibold">New Status:</div>
                <div>
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">
                    {statusUpdateDetails.status}
                  </span>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsStatusUpdateConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (statusUpdateDetails) {
                  updateProjectItemStatusMutation.mutate({
                    itemId: statusUpdateDetails.itemId,
                    status: statusUpdateDetails.status
                  });
                  setIsStatusUpdateConfirmOpen(false);
                }
              }}
              disabled={updateProjectItemStatusMutation.isPending}
            >
              {updateProjectItemStatusMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog 
        open={isDeleteConfirmOpen} 
        onOpenChange={(open) => {
          // Only update state if dialog is closing via cancel button or opening, not during submission
          setIsDeleteConfirmOpen(open);
        }}
      >
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
      <Dialog 
        open={isEditProjectOpen} 
        onOpenChange={(open) => {
          // Only update state if the dialog is being opened
          // or if it's being closed via the cancel button, not auto-submission
          setIsEditProjectOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[90vw] md:max-w-[80vw] w-full max-h-[90vh] overflow-y-auto">
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
                    <FormLabel>Customer <span className="text-red-500">*</span></FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(value && value !== "none" ? parseInt(value) : null)} 
                      defaultValue={field.value?.toString() || "none"}
                      value={field.value?.toString() || "none"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Select a customer</SelectItem>
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
                      <FormLabel>Start Date <span className="text-red-500">*</span></FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          {...field} 
                          required
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
                      <FormLabel>Target End Date <span className="text-red-500">*</span></FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          {...field} 
                          required
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Budget and Currency in a Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="estimatedBudget"
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
                
                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select currency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="INR">INR</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
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

              {/* Project Items Search Field */}
              <FormField
                control={form.control}
                name="projectItemsSearch"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Items Search</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Search project items by code, description, or drawing number..." 
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Filter project items in the table below by typing keywords
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Tabs for Project Details, Stages, Logistics, Attachments */}
              <Tabs defaultValue="project-details" className="w-full mt-6">
                <TabsList className="grid w-full grid-cols-5">
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
                  <TabsTrigger value="files" className="flex items-center gap-1">
                    <FileText className="h-4 w-4" /> File Storage
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="project-details" className="space-y-4 mt-4">
                  {/* Project Items Section */}
                  <div className="space-y-3 border rounded-md p-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <h3 className="text-sm font-medium">Project Items</h3>
                        {searchTerm && (
                          <Badge variant="secondary">
                            {filteredProjectItems.length} of {projectItems?.length || 0} items shown
                          </Badge>
                        )}
                      </div>
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
                            <TableHead className="w-[4%]"></TableHead>
                            <TableHead>Item Code</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead>UOM</TableHead>
                            <TableHead>Make/Buy</TableHead>
                            <TableHead>Drawing No</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredProjectItems && filteredProjectItems.length > 0 ? (
                            filteredProjectItems.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell className="w-6">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      console.log("Navigate to master item:", item);
                                      if (item.masterItem?.id) {
                                        // Store the master item ID and return page in sessionStorage
                                        const returnPath = window.location.pathname + window.location.search;
                                        console.log('Storing return path:', returnPath);
                                        sessionStorage.setItem('editMasterItemId', item.masterItem.id.toString());
                                        sessionStorage.setItem('returnToPage', returnPath);
                                        // Navigate to Item Master page
                                        navigate("/item-master");
                                      } else {
                                        toast({
                                          title: "Error",
                                          description: "Could not find master item information",
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                    className="h-6 w-6 p-0"
                                    title="Edit in Master Items"
                                  >
                                    <ArrowRight className="h-4 w-4 text-amber-500" />
                                  </Button>
                                </TableCell>
                                <TableCell>{item.masterItem?.itemCode || "N/A"}</TableCell>
                                <TableCell>{item.masterItem?.description || "N/A"}</TableCell>
                                <TableCell>{item.quantity}</TableCell>
                                <TableCell>{item.masterItem?.uom || "N/A"}</TableCell>
                                <TableCell>{item.masterItem?.makeOrBuy || "N/A"}</TableCell>
                                <TableCell>{item.masterItem?.drawingNo || "-"}</TableCell>
                                <TableCell>
                                  <Select 
                                    value={item.status || "Not Started"}
                                    onValueChange={(newStatus) => {
                                      if (selectedItem?.id === item.id) {
                                        updateProjectItemStatus(item.id, newStatus);
                                      } else {
                                        setSelectedItem(item);
                                        updateProjectItemStatus(item.id, newStatus);
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="h-8 w-full">
                                      <SelectValue placeholder="Select status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Not Started">Not Started</SelectItem>
                                      <SelectItem value="Drawing Received">Drawing Received</SelectItem>
                                      <SelectItem value="Material Received">Material Received</SelectItem>
                                      <SelectItem value="Under Construction">Under Construction</SelectItem>
                                      <SelectItem value="Completed">Completed</SelectItem>
                                      <SelectItem value="On Hold">On Hold</SelectItem>
                                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-blue-600"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        console.log("Edit item clicked for item:", item);
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
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-red-600"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        console.log("Delete item clicked for item:", item);
                                        setSelectedItem(item);
                                        setIsDeleteConfirmOpen(true);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4 mr-1" /> Delete
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={9} className="text-center py-4 text-muted-foreground">
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
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-xl">Project Key Stages</CardTitle>
                      <CardDescription>
                        Track and update key project stages by checking them off as they are completed.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {keyStagesQuery.isLoading ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                      ) : keyStagesQuery.isError ? (
                        <div className="p-4 border rounded-lg bg-red-50 text-red-800">
                          <p className="font-medium">Error loading project key stages</p>
                          <p className="text-sm mt-1">Please refresh the page and try again.</p>
                        </div>
                      ) : keyStagesQuery.data && keyStagesQuery.data.length === 0 ? (
                        <div className="p-4 border rounded-lg bg-yellow-50 text-yellow-800">
                          <p className="font-medium">No key stages defined</p>
                          <p className="text-sm mt-1">Project key stages need to be set up.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {/* Group stages by design, procurement, manufacturing, quality phases */}
                            {[
                              { title: "Design Phase", stages: keyStagesQuery.data?.filter(stage => [1, 2, 3, 4, 5, 6, 7, 8].includes(stage.stage_number)) || [] },
                              { title: "Procurement Phase", stages: keyStagesQuery.data?.filter(stage => [9, 10, 11, 12, 13, 14, 15].includes(stage.stage_number)) || [] },
                              { title: "Manufacturing Phase", stages: keyStagesQuery.data?.filter(stage => [16, 17, 18, 19, 20, 21, 22].includes(stage.stage_number)) || [] },
                              { title: "Shipping & Commissioning", stages: keyStagesQuery.data?.filter(stage => [23, 24, 25, 26, 27].includes(stage.stage_number)) || [] },
                            ].map((group, groupIndex) => (
                              <Card key={groupIndex} className="overflow-hidden">
                                <CardHeader className="bg-muted/50 p-4">
                                  <CardTitle className="text-sm font-medium">{group.title}</CardTitle>
                                </CardHeader>
                                <CardContent className="p-4">
                                  {group.stages.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No stages defined</p>
                                  ) : (
                                    <div className="space-y-3">
                                      {group.stages.map((stage) => (
                                        <div key={stage.id} className="flex items-center space-x-2">
                                          <Checkbox 
                                            id={`stage-${stage.id}`}
                                            checked={stage.is_completed}
                                            onCheckedChange={(checked) => {
                                              const isChecked = !!checked;
                                              toggleKeyStageCompletionMutation.mutate({
                                                stageId: stage.id, 
                                                isCompleted: isChecked
                                              });
                                            }}
                                          />
                                          <label 
                                            htmlFor={`stage-${stage.id}`}
                                            className={`text-sm ${stage.is_completed ? 'line-through text-muted-foreground' : ''}`}
                                          >
                                            {stage.stage_name}
                                          </label>
                                          {stage.is_completed && (
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <span className="ml-auto">
                                                    <Badge variant="outline" className="bg-green-50 text-green-800">
                                                      <CheckCircle className="h-3 w-3 mr-1" />
                                                      Completed
                                                    </Badge>
                                                  </span>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  {stage.completed_by_name ? `Completed by ${stage.completed_by_name}` : 'Completed'} 
                                                  {stage.completed_date ? ` on ${new Date(stage.completed_date).toLocaleDateString()}` : ''}
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
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
                
                <TabsContent value="files" className="space-y-4 mt-4">
                  <div className="border rounded-md h-[600px]" onClick={(e) => {
                    // Prevent form submission when interacting with file storage
                    e.stopPropagation();
                    e.preventDefault();
                  }}>
                    {project && (
                      <FileStorage 
                        projectId={parseInt(projectId)}
                        projectCode={project.code}
                        financialYear={project.financialYear || project.financial_year}
                      />
                    )}
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
          onClick={handleBackToProjects}
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
            {project.project_origin === 'sales_offer' && project.source_order_number && (
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                  Source: Order #{project.source_order_number}
                  {project.source_offer_revision != null && ` (Rev ${project.source_offer_revision})`}
                </Badge>
              </div>
            )}
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
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="commercial">Commercial</TabsTrigger>
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
              <Button onClick={handleAddPhase}>
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
                      <Button variant="outline" size="sm" onClick={() => handleViewDeliverables(phase)}>
                        <ClipboardList className="mr-1 h-4 w-4" /> Deliverables
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleEditPhase(phase)}>
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
              <Button onClick={handleAddMember}>
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
              <Button onClick={handleAddTask}>
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
                          <Button variant="ghost" size="icon" onClick={() => handleEditTask(task)}>
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
                <Table className="min-w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[4%]"></TableHead>
                      <TableHead className="w-[13%]">Item Code</TableHead>
                      <TableHead className="w-[17%]">Description</TableHead>
                      <TableHead className="w-[7%]">Quantity</TableHead>
                      <TableHead className="w-[7%]">UOM</TableHead>
                      <TableHead className="w-[7%]">Make/Buy</TableHead>
                      <TableHead className="w-[10%]">Drawing No</TableHead>
                      <TableHead className="w-[12%]">Status</TableHead>
                      <TableHead className="w-[23%] text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingItems ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : projectItems?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-4">
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
                          <TableCell className="w-6">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log("Navigate to master item:", item);
                                if (item.masterItem?.id) {
                                  // Store the master item ID and return page in sessionStorage
                                  const returnPath = window.location.pathname + window.location.search;
                                  console.log('Storing return path (second instance):', returnPath);
                                  sessionStorage.setItem('editMasterItemId', item.masterItem.id.toString());
                                  sessionStorage.setItem('returnToPage', returnPath);
                                  // Navigate to Item Master page
                                  navigate("/item-master");
                                } else {
                                  toast({
                                    title: "Error",
                                    description: "Could not find master item information",
                                    variant: "destructive",
                                  });
                                }
                              }}
                              className="h-6 w-6 p-0"
                              title="Edit in Master Items"
                            >
                              <ArrowRight className="h-4 w-4 text-amber-500" />
                            </Button>
                          </TableCell>
                          <TableCell className="truncate max-w-0">{item.masterItem?.itemCode || "N/A"}</TableCell>
                          <TableCell className="truncate max-w-0">
                            <div className="truncate" title={item.masterItem?.description || "N/A"}>
                              {item.masterItem?.description || "N/A"}
                            </div>
                          </TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.masterItem?.uom || "N/A"}</TableCell>
                          <TableCell>{item.masterItem?.makeOrBuy || "N/A"}</TableCell>
                          <TableCell>{item.masterItem?.drawingNo || "-"}</TableCell>
                          <TableCell>
                            <Select 
                              defaultValue={item.status || "Not Started"} 
                              onValueChange={(value) => updateProjectItemStatus(item.id, value)}
                            >
                              <SelectTrigger className="h-8 w-full">
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Not Started">Not Started</SelectItem>
                                <SelectItem value="Drawing Received">Drawing Received</SelectItem>
                                <SelectItem value="Material Received">Material Received</SelectItem>
                                <SelectItem value="Under Construction">Under Construction</SelectItem>
                                <SelectItem value="Completed">Completed</SelectItem>
                                <SelectItem value="On Hold">On Hold</SelectItem>
                                <SelectItem value="Cancelled">Cancelled</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center justify-center space-x-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-blue-600"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  console.log("Edit item clicked");
                                  setSelectedItem(item);
                                  itemForm.reset({
                                    itemCode: item.masterItem?.itemCode || "",
                                    description: item.masterItem?.description || "",
                                    quantity: item.quantity || 1,
                                    uom: item.masterItem?.uom || "",
                                    makeOrBuy: (item.masterItem?.makeOrBuy as "Make" | "Buy") || "Buy",
                                    drawingNo: item.masterItem?.drawingNo || "",
                                    status: item.status || "Not Started",
                                  });
                                  setIsEditItemOpen(true);
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-red-600"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  console.log("Delete item clicked");
                                  setSelectedItem(item);
                                  setIsDeleteConfirmOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
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
          
          <TabsContent value="files" className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Project Files</h2>
              <div className="space-x-2">
                <Button variant="outline">
                  <FolderPlus className="mr-1 h-4 w-4" /> New Directory
                </Button>
                <Button>
                  <Upload className="mr-1 h-4 w-4" /> Upload File
                </Button>
              </div>
            </div>
            
            <Card className="border rounded-md h-[600px]">
              <CardContent className="p-0" onClick={(e) => {
                // Prevent form submission when interacting with file storage
                e.stopPropagation();
                e.preventDefault();
              }}>
                {project && (
                  <FileStorage 
                    projectId={parseInt(id)}
                    projectCode={project.code}
                    financialYear={project.financialYear || project.financial_year}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="commercial" className="space-y-4">
            <Suspense fallback={<Card><CardContent className="p-8 text-center"><div className="animate-pulse text-sm text-muted-foreground">Loading...</div></CardContent></Card>}>
              <CommercialChangesTab projectId={parseInt(id)} />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isAddPhaseOpen} onOpenChange={setIsAddPhaseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Phase</DialogTitle>
            <DialogDescription>Create a new project phase.</DialogDescription>
          </DialogHeader>
          <Form {...phaseForm}>
            <form onSubmit={phaseForm.handleSubmit((data) => createPhaseMutation.mutate(data))} className="space-y-4">
              <FormField control={phaseForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phase Name</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. Engineering & Design" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={phaseForm.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Textarea {...field} placeholder="Phase description" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={phaseForm.control} name="startDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={phaseForm.control} name="targetEndDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target End Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={phaseForm.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={phaseForm.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea {...field} placeholder="Optional notes" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddPhaseOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createPhaseMutation.isPending}>
                  {createPhaseMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Phase
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditPhaseOpen} onOpenChange={(open) => { setIsEditPhaseOpen(open); if (!open) setEditingPhase(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Phase</DialogTitle>
            <DialogDescription>Update phase details for "{editingPhase?.name}".</DialogDescription>
          </DialogHeader>
          <Form {...phaseForm}>
            <form onSubmit={phaseForm.handleSubmit((data) => updatePhaseMutation.mutate({ phaseId: editingPhase?.id, data }))} className="space-y-4">
              <FormField control={phaseForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phase Name</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={phaseForm.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Textarea {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={phaseForm.control} name="startDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={phaseForm.control} name="targetEndDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target End Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={phaseForm.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={phaseForm.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditPhaseOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={updatePhaseMutation.isPending}>
                  {updatePhaseMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeliverablesOpen} onOpenChange={(open) => { setIsDeliverablesOpen(open); if (!open) { setSelectedPhase(null); setIsAddDeliverableOpen(false); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Deliverables — {selectedPhase?.name}</DialogTitle>
            <DialogDescription>Manage deliverables for this phase.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={handleAddDeliverable}>
                <Plus className="mr-1 h-4 w-4" /> Add Deliverable
              </Button>
            </div>

            {isAddDeliverableOpen && (
              <Card className="border-dashed">
                <CardContent className="pt-4">
                  <Form {...deliverableForm}>
                    <form onSubmit={deliverableForm.handleSubmit((data) => createDeliverableMutation.mutate({ phaseId: selectedPhase?.id, data }))} className="space-y-3">
                      <FormField control={deliverableForm.control} name="name" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl><Input {...field} placeholder="Deliverable name" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={deliverableForm.control} name="description" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl><Textarea {...field} placeholder="Description" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={deliverableForm.control} name="dueDate" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Due Date</FormLabel>
                            <FormControl><Input type="date" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={deliverableForm.control} name="status" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Status</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="in_progress">In Progress</SelectItem>
                                <SelectItem value="submitted">Submitted</SelectItem>
                                <SelectItem value="approved">Approved</SelectItem>
                                <SelectItem value="rejected">Rejected</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setIsAddDeliverableOpen(false)}>Cancel</Button>
                        <Button type="submit" size="sm" disabled={createDeliverableMutation.isPending}>
                          {createDeliverableMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Add
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            )}

            {isLoadingDeliverables ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : !deliverables || deliverables.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p>No deliverables yet.</p>
                <p className="text-sm">Click "Add Deliverable" to create one.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliverables.map((d: any) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <p className="font-medium">{d.name}</p>
                        <p className="text-xs text-muted-foreground">{d.description}</p>
                      </TableCell>
                      <TableCell>{formatDate(d.dueDate || d.due_date)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          d.status === 'approved' ? 'bg-green-50 text-green-700' :
                          d.status === 'submitted' ? 'bg-blue-50 text-blue-700' :
                          d.status === 'in_progress' ? 'bg-amber-50 text-amber-700' :
                          d.status === 'rejected' ? 'bg-red-50 text-red-700' :
                          'bg-gray-50 text-gray-600'
                        }>
                          {d.status?.charAt(0).toUpperCase() + d.status?.slice(1).replace('_', ' ')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>Add a user to this project team.</DialogDescription>
          </DialogHeader>
          <Form {...memberForm}>
            <form onSubmit={memberForm.handleSubmit((data) => addMemberMutation.mutate(data))} className="space-y-4">
              <FormField control={memberForm.control} name="userId" render={({ field }) => (
                <FormItem>
                  <FormLabel>User</FormLabel>
                  <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value ? String(field.value) : ""}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select a user" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {allUsers?.filter((u: any) => !members?.some((m: any) => m.userId === u.id))
                        .map((u: any) => (
                          <SelectItem key={u.id} value={String(u.id)}>
                            {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.username} — {u.department || 'No dept'}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={memberForm.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="project_manager">Project Manager</SelectItem>
                      <SelectItem value="phase_lead">Phase Lead</SelectItem>
                      <SelectItem value="team_member">Team Member</SelectItem>
                      <SelectItem value="consultant">Consultant</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddMemberOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={addMemberMutation.isPending}>
                  {addMemberMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Member
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddTaskOpen} onOpenChange={setIsAddTaskOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Task</DialogTitle>
            <DialogDescription>Create a new task for this project.</DialogDescription>
          </DialogHeader>
          <Form {...taskForm}>
            <form onSubmit={taskForm.handleSubmit((data) => createTaskMutation.mutate(data))} className="space-y-4">
              <FormField control={taskForm.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl><Input {...field} placeholder="Task title" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={taskForm.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Textarea {...field} placeholder="Task description" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={taskForm.control} name="assignedTo" render={({ field }) => (
                <FormItem>
                  <FormLabel>Assign To</FormLabel>
                  <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value ? String(field.value) : ""}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select assignee" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {members?.map((m: any) => (
                        <SelectItem key={m.userId || m.id} value={String(m.userId || m.id)}>
                          {m.username || m.firstName || `User #${m.userId}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={taskForm.control} name="dueDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={taskForm.control} name="priority" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="High">High</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="Low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddTaskOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createTaskMutation.isPending}>
                  {createTaskMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Task
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditTaskOpen} onOpenChange={(open) => { setIsEditTaskOpen(open); if (!open) setEditingTask(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>Update task details.</DialogDescription>
          </DialogHeader>
          <Form {...taskForm}>
            <form onSubmit={taskForm.handleSubmit((data) => updateTaskMutation.mutate({ taskId: editingTask?.taskId || editingTask?.task_id || editingTask?.id, data }))} className="space-y-4">
              <FormField control={taskForm.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={taskForm.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Textarea {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={taskForm.control} name="assignedTo" render={({ field }) => (
                <FormItem>
                  <FormLabel>Assign To</FormLabel>
                  <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value ? String(field.value) : ""}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select assignee" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {members?.map((m: any) => (
                        <SelectItem key={m.userId || m.id} value={String(m.userId || m.id)}>
                          {m.username || m.firstName || `User #${m.userId}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={taskForm.control} name="dueDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={taskForm.control} name="priority" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="High">High</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="Low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={taskForm.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditTaskOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={updateTaskMutation.isPending}>
                  {updateTaskMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}