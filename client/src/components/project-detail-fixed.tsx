import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from 'date-fns';
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import DocumentControl from "@/components/document-control";
const CommercialChangesTab = lazy(() => import("@/components/commercial-changes-tab"));
const ExecutionDraftsTab = lazy(() => import("@/components/execution-drafts-tab"));
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
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
  ArrowRight,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  RefreshCw,
  Snowflake,
  TrendingUp,
  Clock,
  Lock,
  LockOpen,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  DollarSign,
  Percent,
  Camera,
  Download,
  Globe,
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
import ProjectItemDetailDialog from "@/components/project-item-detail-dialog";
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
  makeOrBuy: z.enum(["Make", "Buy", "Service"]),
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
  assignedTo: z.number().optional(),
});

type DeliverableFormValues = z.infer<typeof deliverableFormSchema>;

const memberFormSchema = z.object({
  userId: z.number().min(1, "Please select a user"),
  role: z.enum(["senior_manager", "project_manager", "phase_lead", "team_member", "consultant"]),
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
  // EPC discipline code for design data tag generation
  disciplineCode: z.string().optional(),
  // MDMT (Minimum Design Metal Temperature)
  mdmt: z.string().optional(),
});

// Form type for editing project
type EditProjectValues = z.infer<typeof editProjectSchema>;

export default function ProjectDetail({ id }: ProjectDetailProps) {
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const isSuperuser = currentUser?.role === 'Superuser';
  const [activeTab, setActiveTab] = useState("overview");
  const [isItemsImportOpen, setIsItemsImportOpen] = useState(false);
  const [isEditProjectOpen, setIsEditProjectOpen] = useState(false);
  const [isEditItemOpen, setIsEditItemOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isProjectItemDetailOpen, setIsProjectItemDetailOpen] = useState(false);
  const [detailProjectItem, setDetailProjectItem] = useState<any>(null);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [isLinkParentOpen, setIsLinkParentOpen] = useState(false);
  const [linkParentForItem, setLinkParentForItem] = useState<any>(null);
  const [linkParentSelectedId, setLinkParentSelectedId] = useState<string>("");

  // State for status update confirmation
  const [isStatusUpdateConfirmOpen, setIsStatusUpdateConfirmOpen] = useState(false);
  const [statusUpdateDetails, setStatusUpdateDetails] = useState<{itemId: number, status: string, oldStatus: string, itemCode: string} | null>(null);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancellationType, setCancellationType] = useState('');
  const [pendingCancelData, setPendingCancelData] = useState<EditProjectValues | null>(null);
  const [isReopenConfirmOpen, setIsReopenConfirmOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [pendingReopenData, setPendingReopenData] = useState<EditProjectValues | null>(null);
  
  const [isAddPhaseOpen, setIsAddPhaseOpen] = useState(false);
  const [isEditPhaseOpen, setIsEditPhaseOpen] = useState(false);
  const [editingPhase, setEditingPhase] = useState<any>(null);
  const [isDeliverablesOpen, setIsDeliverablesOpen] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<any>(null);
  const [isAddDeliverableOpen, setIsAddDeliverableOpen] = useState(false);
  const [editingDeliverable, setEditingDeliverable] = useState<any>(null);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isEditMemberOpen, setIsEditMemberOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<any>(null);
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
        estimatedBudget: project.estimatedBudget ? parseFloat(String(project.estimatedBudget)) : undefined,
        code: project.code || "",
        currency: project.currency || "USD",
        projectItemsSearch: "",
        shippingAddress: project.shippingAddress || "",
        deliveryMethod: project.deliveryMethod || "standard",
        client: project.client || "",
        vendor: project.vendor || "",
        disciplineCode: (project as any).disciplineCode || "",
        mdmt: (project as any).mdmt || "",
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

  const { rootItems, childrenMap } = useMemo(() => {
    const items = filteredProjectItems || [];
    const cMap: Record<number, any[]> = {};
    const roots: any[] = [];
    for (const item of items) {
      if (item.parentProjectItemId) {
        if (!cMap[item.parentProjectItemId]) cMap[item.parentProjectItemId] = [];
        cMap[item.parentProjectItemId].push(item);
      } else {
        roots.push(item);
      }
    }
    return { rootItems: roots, childrenMap: cMap };
  }, [filteredProjectItems]);

  const toggleExpand = useCallback((itemId: number) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);
  
  useEffect(() => {
    if (Object.keys(childrenMap).length > 0) {
      setExpandedItems(prev => {
        if (prev.size > 0) return prev;
        const next = new Set(prev);
        Object.keys(childrenMap).forEach(k => next.add(Number(k)));
        return next;
      });
    }
  }, [childrenMap]);

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

  // ── Cost Roll-up ────────────────────────────────────────────────────────────
  const [showCostRollup, setShowCostRollup] = useState(false);

  const costRollupQuery = useQuery({
    queryKey: [`/api/projects/${projectId}/cost-rollup`],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/cost-rollup`);
      if (!res.ok) throw new Error('Failed to compute cost roll-up');
      return res.json();
    },
    enabled: showCostRollup && !!projectId,
  });

  const freezeCostMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/cost-rollup/freeze`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || 'Freeze failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Costs frozen',
        description: `Rolled-up costs saved for ${data.itemCount} items. Project total: ${
          new Intl.NumberFormat('en-US', { style: 'currency', currency: project?.currency || 'USD' }).format(data.projectTotal)
        }`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/cost-rollup`] });
    },
    onError: (error: any) => {
      toast({ title: 'Freeze failed', description: error.message, variant: 'destructive' });
    },
  });

  // Cost Lock workflow
  const costLockQuery = useQuery({
    queryKey: [`/api/projects/${projectId}/cost-lock/status`],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/cost-lock/status`);
      if (!res.ok) throw new Error('Failed to fetch cost lock status');
      return res.json() as Promise<{
        status: string;
        submittedAt: string | null;
        submittedByName: string | null;
        reviewedAt: string | null;
        reviewedByName: string | null;
        note: string | null;
      }>;
    },
    enabled: !!projectId,
  });

  const [costLockNote, setCostLockNote] = useState('');
  const [showCostLockNoteInput, setShowCostLockNoteInput] = useState<'reject' | 'unlock' | null>(null);

  const invalidateLock = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/cost-lock/status`] });
  };

  const submitCostLockMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/cost-lock/submit`, { method: 'POST' });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Submit failed'); }
      return res.json();
    },
    onSuccess: () => { toast({ title: 'Submitted for approval', description: 'Cost roll-up is now pending manager approval.' }); invalidateLock(); },
    onError: (e: any) => toast({ title: 'Submit failed', description: e.message, variant: 'destructive' }),
  });

  const approveCostLockMutation = useMutation({
    mutationFn: async (note: string) => {
      const res = await fetch(`/api/projects/${projectId}/cost-lock/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Approve failed'); }
      return res.json();
    },
    onSuccess: () => { toast({ title: 'Cost approved & locked', description: 'The cost roll-up has been approved. Further freezes are blocked.' }); invalidateLock(); },
    onError: (e: any) => toast({ title: 'Approve failed', description: e.message, variant: 'destructive' }),
  });

  const rejectCostLockMutation = useMutation({
    mutationFn: async (note: string) => {
      const res = await fetch(`/api/projects/${projectId}/cost-lock/reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Reject failed'); }
      return res.json();
    },
    onSuccess: () => { toast({ title: 'Cost rejected', description: 'The cost submission has been rejected. Team can revise and re-submit.' }); invalidateLock(); setShowCostLockNoteInput(null); setCostLockNote(''); },
    onError: (e: any) => toast({ title: 'Reject failed', description: e.message, variant: 'destructive' }),
  });

  const unlockCostLockMutation = useMutation({
    mutationFn: async (note: string) => {
      const res = await fetch(`/api/projects/${projectId}/cost-lock/unlock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Unlock failed'); }
      return res.json();
    },
    onSuccess: () => { toast({ title: 'Cost unlocked', description: 'Cost approval has been revoked. Costs can be revised.' }); invalidateLock(); setShowCostLockNoteInput(null); setCostLockNote(''); },
    onError: (e: any) => toast({ title: 'Unlock failed', description: e.message, variant: 'destructive' }),
  });
  // ────────────────────────────────────────────────────────────────────────────

  // ── PRICING / COMMERCIAL LAYER ──────────────────────────────────────────────
  const pricingQuery = useQuery({
    queryKey: [`/api/projects/${projectId}/pricing`],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/pricing`);
      if (!res.ok) throw new Error('Failed to fetch pricing');
      return res.json() as Promise<{
        projectId: number;
        sellingCurrency: string;
        exchangeRate: string | null;
        exchangeRateFrozenAt: string | null;
        incoterms: string | null;
        paymentTerms: string | null;
        deliveryTerms: string | null;
        offerValidityDays: number;
        defaultMarginPercent: string | null;
        costLockStatus: string;
        baseCurrency: string;
        computedTotals: { totalSellingInr: number; totalSellingForeign: number | null };
        items: Array<{
          id: number; itemCode: string; description: string; quantity: string;
          rolledUpCost: string | null; marginPercent: string | null;
          sellingPriceInr: string | null; sellingPrice: string | null;
          pricingLockedAt: string | null; parentProjectItemId: number | null;
        }>;
      }>;
    },
    enabled: !!projectId,
  });

  const snapshotsQuery = useQuery({
    queryKey: [`/api/projects/${projectId}/pricing/snapshots`],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/pricing/snapshots`);
      if (!res.ok) throw new Error('Failed to fetch snapshots');
      return res.json() as Promise<Array<{
        id: number; snapshot_number: string; revision: number; status: string;
        selling_currency: string; exchange_rate: string;
        total_cost_inr: string; total_selling_inr: string; total_selling_foreign: string | null;
        incoterms: string | null; payment_terms: string | null; delivery_terms: string | null;
        offer_validity_days: number; notes: string | null;
        created_by_name: string | null; approved_by_name: string | null;
        created_at: string; approved_at: string | null;
      }>>;
    },
    enabled: !!projectId,
  });

  const invalidatePricing = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/pricing`] });
    queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/pricing/snapshots`] });
  };

  // Pricing local state
  const [pricingTermsForm, setPricingTermsForm] = useState({
    sellingCurrency: 'USD', exchangeRate: '', incoterms: '',
    paymentTerms: '', deliveryTerms: '', offerValidityDays: '30', defaultMarginPercent: '',
  });
  const [pricingTermsEditing, setPricingTermsEditing] = useState(false);
  const [itemMargins, setItemMargins] = useState<Record<number, string>>({});
  const [marginEditDirty, setMarginEditDirty] = useState(false);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<number | null>(null);
  const [snapshotNotes, setSnapshotNotes] = useState('');

  // Sync terms form from query data
  useEffect(() => {
    if (pricingQuery.data && !pricingTermsEditing) {
      const d = pricingQuery.data;
      setPricingTermsForm({
        sellingCurrency: d.sellingCurrency || 'USD',
        exchangeRate: d.exchangeRate || '',
        incoterms: d.incoterms || '',
        paymentTerms: d.paymentTerms || '',
        deliveryTerms: d.deliveryTerms || '',
        offerValidityDays: String(d.offerValidityDays ?? 30),
        defaultMarginPercent: d.defaultMarginPercent || '',
      });
    }
  }, [pricingQuery.data, pricingTermsEditing]);

  // Sync item margins from query data
  useEffect(() => {
    if (pricingQuery.data && !marginEditDirty) {
      const m: Record<number, string> = {};
      for (const item of pricingQuery.data.items) m[item.id] = item.marginPercent || '';
      setItemMargins(m);
    }
  }, [pricingQuery.data, marginEditDirty]);

  const saveTermsMutation = useMutation({
    mutationFn: async (data: typeof pricingTermsForm) => {
      const res = await apiRequest('PATCH', `/api/projects/${projectId}/pricing/terms`, {
        sellingCurrency: data.sellingCurrency,
        exchangeRate: data.exchangeRate ? parseFloat(data.exchangeRate) : undefined,
        incoterms: data.incoterms || null,
        paymentTerms: data.paymentTerms || null,
        deliveryTerms: data.deliveryTerms || null,
        offerValidityDays: parseInt(data.offerValidityDays) || 30,
        defaultMarginPercent: data.defaultMarginPercent ? parseFloat(data.defaultMarginPercent) : null,
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Save failed'); }
      return res.json();
    },
    onSuccess: () => { toast({ title: 'Terms saved' }); setPricingTermsEditing(false); invalidatePricing(); },
    onError: (e: any) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  const freezeExchangeRateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/projects/${projectId}/pricing/exchange-rate/freeze`, {});
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Freeze failed'); }
      return res.json();
    },
    onSuccess: () => { toast({ title: 'Exchange rate frozen' }); invalidatePricing(); },
    onError: (e: any) => toast({ title: 'Freeze failed', description: e.message, variant: 'destructive' }),
  });

  const saveItemMarginsMutation = useMutation({
    mutationFn: async (margins: Record<number, string>) => {
      const items = Object.entries(margins).map(([id, m]) => ({
        id: parseInt(id),
        marginPercent: m !== '' ? parseFloat(m) : null,
      }));
      const res = await apiRequest('PATCH', `/api/projects/${projectId}/pricing/items`, { items });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Save failed'); }
      return res.json();
    },
    onSuccess: () => { toast({ title: 'Pricing updated' }); setMarginEditDirty(false); invalidatePricing(); },
    onError: (e: any) => toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const applyDefaultMarginMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/projects/${projectId}/pricing/apply-default-margin`, {});
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Apply failed'); }
      return res.json();
    },
    onSuccess: (d: any) => {
      toast({ title: 'Default margin applied', description: `${d.appliedMargin}% applied to ${d.itemCount} items` });
      setMarginEditDirty(false); invalidatePricing();
    },
    onError: (e: any) => toast({ title: 'Apply failed', description: e.message, variant: 'destructive' }),
  });

  const createSnapshotMutation = useMutation({
    mutationFn: async (notes: string) => {
      const res = await apiRequest('POST', `/api/projects/${projectId}/pricing/snapshots`, { notes });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Snapshot failed'); }
      return res.json();
    },
    onSuccess: (d: any) => {
      toast({ title: 'Snapshot created', description: `${d.snapshot_number} saved successfully` });
      setSnapshotNotes(''); invalidatePricing();
    },
    onError: (e: any) => toast({ title: 'Snapshot failed', description: e.message, variant: 'destructive' }),
  });

  const downloadPriceSheet = async (snapshotId: number, snapshotNumber: string) => {
    const res = await fetch(`/api/projects/${projectId}/pricing/snapshots/${snapshotId}/price-sheet`);
    if (!res.ok) { toast({ title: 'Export failed', variant: 'destructive' }); return; }
    const data = await res.json();
    // Build CSV
    const rows: string[] = [];
    rows.push(`"THERMOPAC — COMMERCIAL PRICE SHEET"`);
    rows.push(`"Snapshot","${data.snapshotNumber}","Revision","${data.revision}","Status","${data.status}"`);
    rows.push(`"Project","${data.projectName}","Code","${data.projectCode}"`);
    rows.push(`"Customer","${data.customerName || ''}","Date","${new Date(data.createdAt).toLocaleDateString()}"`);
    rows.push(`"Currency","${data.sellingCurrency}","Exchange Rate","${data.exchangeRate}"`);
    rows.push(`"Incoterms","${data.incoterms || ''}","Validity (days)","${data.offerValidityDays || ''}"`);
    rows.push(`"Payment Terms","${data.paymentTerms || ''}"`);
    rows.push(`"Delivery Terms","${data.deliveryTerms || ''}"`);
    rows.push('');
    rows.push('"#","Item Code","Description","Qty","Cost (INR)","Margin %","Selling Price (INR)","Selling Price (FC)"');
    const items: any[] = data.items || [];
    items.forEach((item: any, idx: number) => {
      rows.push([
        idx + 1,
        `"${item.item_code || ''}"`,
        `"${(item.description || '').replace(/"/g, '""')}"`,
        item.quantity || '',
        item.rolled_up_cost || '',
        item.margin_percent || '',
        item.selling_price_inr || '',
        item.selling_price || '',
      ].join(','));
    });
    rows.push('');
    rows.push(`"Total Cost (INR)","${data.totalCostInr}","Total Selling (INR)","${data.totalSellingInr}","Total Selling (FC)","${data.totalSellingForeign || ''}"`);
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${snapshotNumber}-price-sheet.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  // ── END PRICING ─────────────────────────────────────────────────────────────

  // Mutation for updating a project item's parent (hierarchy)
  const setParentMutation = useMutation({
    mutationFn: async ({ childId, parentId }: { childId: number; parentId: number | null }) => {
      const res = await fetch(`/api/project-items/${childId}/parent`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentProjectItemId: parentId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || 'Failed to update parent');
      }
      return res.json();
    },
    onSuccess: () => {
      setIsLinkParentOpen(false);
      setLinkParentForItem(null);
      setLinkParentSelectedId("");
      toast({ title: 'Hierarchy updated', description: 'Item parent has been updated successfully.' });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/items`] });
    },
    onError: (error: any) => {
      toast({ title: 'Error updating hierarchy', description: error.message, variant: 'destructive' });
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
      return await apiRequest("POST", `/api/projects/${projectId}/phases`, {
        ...data,
        order: existingPhases.length + 1,
      });
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
      return await apiRequest("PUT", `/api/phases/${phaseId}`, data);
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
    mutationFn: async ({ phaseId, data, phaseLeadId }: { phaseId: number; data: DeliverableFormValues; phaseLeadId?: number }) => {
      return await apiRequest("POST", `/api/phases/${phaseId}/deliverables`, {
        ...data,
        projectId: parseInt(projectId),
        assignedTo: data.assignedTo || phaseLeadId || null,
      });
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

  const updateDeliverableMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return await apiRequest("PUT", `/api/deliverables/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Deliverable updated", description: "Deliverable has been updated." });
      queryClient.invalidateQueries({ queryKey: [`/api/phases/${selectedPhase?.id}/deliverables`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/phases`] });
      setEditingDeliverable(null);
    },
    onError: (error: any) => {
      toast({ title: "Error updating deliverable", description: error.message, variant: "destructive" });
    },
  });

  const editDeliverableRef = useRef<HTMLDivElement>(null);
  const handleEditDeliverable = (d: any) => {
    setEditingDeliverable(d);
    deliverableForm.reset({
      name: d.name || "",
      description: d.description || "",
      dueDate: d.due_date || d.dueDate || "",
      status: d.status || "pending",
      notes: d.notes || "",
      assignedTo: d.assigned_to || d.assignedTo || undefined,
    });
    setTimeout(() => editDeliverableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
  };

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
    enabled: isAddMemberOpen || isEditMemberOpen || isDeliverablesOpen,
  });

  const addMemberMutation = useMutation({
    mutationFn: async (data: MemberFormValues) => {
      return await apiRequest("POST", `/api/projects/${projectId}/members`, data);
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

  const updateMemberMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: number; data: { role: string; isActive?: boolean } }) => {
      await apiRequest("PUT", `/api/projects/${projectId}/members/${userId}`, data);
    },
    onSuccess: () => {
      toast({ title: "Member updated", description: "Team member updated successfully." });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/members`] });
      setIsEditMemberOpen(false);
      setEditingMember(null);
    },
    onError: (error: any) => {
      toast({ title: "Error updating member", description: error.message, variant: "destructive" });
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: async (memberUserId: number) => {
      return await apiRequest("DELETE", `/api/projects/${projectId}/members/${memberUserId}`);
    },
    onSuccess: () => {
      toast({ title: "Member removed", description: "Team member removed from project." });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/members`] });
    },
    onError: (error: any) => {
      toast({ title: "Error removing member", description: error.message, variant: "destructive" });
    },
  });

  const handleEditMember = (member: any) => {
    setEditingMember(member);
    memberForm.reset({ userId: member.userId, role: member.role });
    setIsEditMemberOpen(true);
  };

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
      return await apiRequest("PATCH", `/api/tasks/${taskId}`, data);
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
      case "senior_manager":
        return "bg-red-100 text-red-800";
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
    const formattedData = { ...data };

    if (formattedData.status === 'canceled' && project?.status !== 'canceled') {
      setPendingCancelData(formattedData);
      setCancelReason('');
      setIsCancelConfirmOpen(true);
      return;
    }

    if (project?.status === 'canceled' && formattedData.status && formattedData.status !== 'canceled') {
      setPendingReopenData(formattedData);
      setReopenReason('');
      setIsReopenConfirmOpen(true);
      return;
    }
    
    console.log("Submitting project update:", formattedData);
    updateProjectMutation.mutate(formattedData);
  }

  function confirmCancellation() {
    if (!pendingCancelData || cancelReason.trim().length < 10 || !cancellationType) return;
    const payload = { ...pendingCancelData, cancelReason: cancelReason.trim(), cancellationType };
    updateProjectMutation.mutate(payload as any);
    setIsCancelConfirmOpen(false);
    setPendingCancelData(null);
    setCancelReason('');
    setCancellationType('');
  }

  function confirmReopen() {
    if (!pendingReopenData || reopenReason.trim().length < 10) return;
    const payload = { ...pendingReopenData, reopenReason: reopenReason.trim() };
    updateProjectMutation.mutate(payload as any);
    setIsReopenConfirmOpen(false);
    setPendingReopenData(null);
    setReopenReason('');
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

      {/* Project Item Detail Dialog */}
      {isProjectItemDetailOpen && detailProjectItem && (
        <ProjectItemDetailDialog
          item={detailProjectItem}
          open={isProjectItemDetailOpen}
          onOpenChange={setIsProjectItemDetailOpen}
        />
      )}
      
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
      
      {/* Link as Sub-item Dialog */}
      <Dialog open={isLinkParentOpen} onOpenChange={(open) => {
        if (!open) { setIsLinkParentOpen(false); setLinkParentForItem(null); setLinkParentSelectedId(""); }
      }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Link as Sub-item</DialogTitle>
            <DialogDescription>
              Select a parent item for <strong>{linkParentForItem?.item?.itemCode || linkParentForItem?.item?.masterItem?.itemCode || "this item"}</strong>.
              The item will be nested under the chosen parent.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Parent Item</label>
              <Select value={linkParentSelectedId} onValueChange={setLinkParentSelectedId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a parent item…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— No parent (make root item) —</SelectItem>
                  {(projectItems || [])
                    .filter((pi: any) => {
                      if (!linkParentForItem?.item) return true;
                      const item = linkParentForItem.item;
                      // Exclude self
                      if (pi.id === item.id) return false;
                      // Exclude descendants to prevent cycles
                      const descendants = (() => {
                        const result = new Set<number>();
                        const stack = [item.id];
                        while (stack.length) {
                          const curr = stack.pop()!;
                          for (const c of (childrenMap[curr] || [])) {
                            result.add(c.id);
                            stack.push(c.id);
                          }
                        }
                        return result;
                      })();
                      return !descendants.has(pi.id);
                    })
                    .map((pi: any) => (
                      <SelectItem key={pi.id} value={String(pi.id)}>
                        {pi.itemCode || pi.masterItem?.itemCode || `Item #${pi.id}`}
                        {pi.masterItem?.description ? ` — ${pi.masterItem.description}` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsLinkParentOpen(false); setLinkParentForItem(null); setLinkParentSelectedId(""); }}>
              Cancel
            </Button>
            <Button
              disabled={!linkParentSelectedId || setParentMutation.isPending}
              onClick={() => {
                if (!linkParentForItem?.item) return;
                const parentId = linkParentSelectedId === "__none__" ? null : parseInt(linkParentSelectedId);
                setParentMutation.mutate({ childId: linkParentForItem.item.id, parentId });
              }}
            >
              {setParentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Project Cancellation Confirmation Dialog */}
      <Dialog open={isCancelConfirmOpen} onOpenChange={(open) => { if (!open) { setIsCancelConfirmOpen(false); setPendingCancelData(null); setCancelReason(''); setCancellationType(''); } }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Cancel Project
            </DialogTitle>
            <DialogDescription>
              Canceling this project will cascade to all child records. Draft/safe records will be <strong>canceled</strong>.
              Active/financial records (issued POs, released WOs, shipped dispatches, invoices) will be placed <strong>on hold</strong> for mandatory review — they will NOT be auto-canceled.
              A Superuser can reopen the project to restore safe records from the cancellation snapshot.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="text-sm font-medium">Project: <span className="font-bold">{project?.code} — {project?.clientName || project?.name}</span></div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Cancellation Type <span className="text-destructive">*</span></label>
              <select
                value={cancellationType}
                onChange={(e) => setCancellationType(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select cancellation type...</option>
                <option value="commercial">Commercial</option>
                <option value="technical">Technical</option>
                <option value="customer_request">Customer Request</option>
                <option value="force_majeure">Force Majeure</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Cancellation Reason <span className="text-destructive">*</span></label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Provide a detailed reason for cancellation (min 10 characters)..."
                rows={3}
                className="resize-none"
              />
              {cancelReason.length > 0 && cancelReason.trim().length < 10 && (
                <p className="text-xs text-destructive">Reason must be at least 10 characters.</p>
              )}
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 space-y-1">
              <div className="font-semibold">Impact Summary:</div>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Draft records (planning, BOMs, drawings, POs, WOs) → <strong>Canceled</strong></li>
                <li>Active/issued records (POs, WOs, inspections) → <strong>On Hold for Review</strong></li>
                <li>Released drawings → <strong>On Hold for Review</strong></li>
                <li>Financial records (invoices, billing) → <strong>On Hold for Review</strong></li>
                <li>A cancellation snapshot is saved for every affected record</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCancelConfirmOpen(false); setPendingCancelData(null); setCancelReason(''); setCancellationType(''); }}>
              Go Back
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancellation}
              disabled={cancelReason.trim().length < 10 || !cancellationType || updateProjectMutation.isPending}
            >
              {updateProjectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isReopenConfirmOpen} onOpenChange={(open) => { if (!open) { setIsReopenConfirmOpen(false); setPendingReopenData(null); setReopenReason(''); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-blue-700 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Reopen Project
            </DialogTitle>
            <DialogDescription>
              {pendingReopenData?.status === 'on_hold' ? (
                <>This will move the project to a <strong>frozen review state</strong>. No records will be restored yet. Restoration of draft-level records happens when the project is moved to Planning.</>
              ) : (
                <>This will <strong>restore draft-level records</strong> (tasks, BOMs, drawings, planning drafts, inspections, dispatch readiness, quality plans, commissioning, billing). <strong>POs, WOs, dispatch records, and invoices will NOT be restored</strong> and will require manual review.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="text-sm font-medium">Project: <span className="font-bold">{project?.code} — {project?.clientName || project?.name}</span></div>
            <div className="text-sm">Current Status: <span className="font-bold text-red-600">Canceled</span> → <span className="font-bold text-blue-600">{pendingReopenData?.status === 'on_hold' ? 'On Hold' : 'Planning'}</span></div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Reopen Reason <span className="text-destructive">*</span></label>
              <Textarea
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="Provide a detailed reason for reopening (min 10 characters)..."
                rows={3}
                className="resize-none"
              />
              {reopenReason.length > 0 && reopenReason.trim().length < 10 && (
                <p className="text-xs text-destructive">Reason must be at least 10 characters.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsReopenConfirmOpen(false); setPendingReopenData(null); setReopenReason(''); }}>
              Go Back
            </Button>
            <Button
              onClick={confirmReopen}
              disabled={reopenReason.trim().length < 10 || updateProjectMutation.isPending}
            >
              {updateProjectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Reopen
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
                      <Input placeholder="Enter project name" {...field} readOnly className="bg-muted cursor-not-allowed" />
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
                          {project?.status === 'canceled' ? (
                            isSuperuser ? (
                              <>
                                <SelectItem value="canceled">Canceled</SelectItem>
                                <SelectItem value="on_hold">On Hold</SelectItem>
                                <SelectItem value="planning">Planning</SelectItem>
                              </>
                            ) : (
                              <SelectItem value="canceled">Canceled</SelectItem>
                            )
                          ) : (
                            <>
                              <SelectItem value="planning">Planning</SelectItem>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="on_hold">On Hold</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="canceled">Canceled</SelectItem>
                            </>
                          )}
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
                    <FormControl>
                      <Input 
                        readOnly 
                        className="bg-muted cursor-not-allowed"
                        value={customers?.find(c => c.id === field.value)?.bpName || "No customer selected"}
                      />
                    </FormControl>
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
                    <FileText className="h-4 w-4" /> Document Control
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="project-details" className="space-y-4 mt-4">
                  {/* Discipline Code */}
                  <div className="border rounded-md p-4">
                    <FormField
                      control={form.control}
                      name="disciplineCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold">Project Discipline</FormLabel>
                          <div className="flex items-center gap-3">
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl className="max-w-xs">
                                <SelectTrigger className="max-w-xs">
                                  <SelectValue placeholder="Select discipline…" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="ASME SEC VIII Div-1">ASME SEC VIII Div-1</SelectItem>
                                <SelectItem value="ASME 31.3">ASME 31.3</SelectItem>
                                <SelectItem value="EN 13445">EN 13445</SelectItem>
                                <SelectItem value="PED 2014/68/EU">PED 2014/68/EU</SelectItem>
                                <SelectItem value="API 650">API 650</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Used to auto-generate tag numbers on Design Data Sheets for all drawings under this project.
                            </p>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* MDMT */}
                  <div className="border rounded-md p-4">
                    <FormField
                      control={form.control}
                      name="mdmt"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold">MDMT (Minimum Design Metal Temperature)</FormLabel>
                          <div className="flex items-center gap-3">
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl className="max-w-xs">
                                <SelectTrigger className="max-w-xs">
                                  <SelectValue placeholder="Select MDMT…" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="-29 Deg °C">-29 Deg °C</SelectItem>
                                <SelectItem value="0 Deg °C">0 Deg °C</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Used in Design Data Sheets for all equipment under this project.
                            </p>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Cost Lock Warning Banner */}
                  {costLockQuery.data?.status === 'approved' && (
                    <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-3">
                      <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Cost Approved &amp; Locked</p>
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                          All project item and BOM modifications are blocked.
                          {costLockQuery.data.reviewedByName && ` Approved by ${costLockQuery.data.reviewedByName}.`}
                          {' '}A Manager must unlock before any changes can be made.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* BOM Cost Roll-up Panel */}
                  <div className="border rounded-md p-4 space-y-3">
                    {/* Header row */}
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-sm font-medium">BOM Cost Roll-up</h3>
                        {costRollupQuery.data && (
                          <Badge variant="secondary" className="text-xs">
                            Total: {new Intl.NumberFormat('en-US', { style: 'currency', currency: project?.currency || 'USD' }).format(costRollupQuery.data.projectTotal)}
                          </Badge>
                        )}
                        {/* Freshness badge */}
                        {costRollupQuery.data && (() => {
                          const fs = costRollupQuery.data.freshnessStatus as string;
                          if (fs === 'never_frozen') return (
                            <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" /> Not frozen
                            </Badge>
                          );
                          if (fs === 'stale') return (
                            <Badge variant="outline" className="text-xs gap-1 text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/20">
                              <Clock className="h-3 w-3" /> Stale — changes since last freeze
                            </Badge>
                          );
                          return (
                            <Badge variant="outline" className="text-xs gap-1 text-green-600 border-green-300 bg-green-50 dark:bg-green-950/20">
                              <ShieldCheck className="h-3 w-3" /> Fresh
                            </Badge>
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => { setShowCostRollup(true); costRollupQuery.refetch(); }}
                          disabled={costRollupQuery.isFetching}
                        >
                          {costRollupQuery.isFetching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                          Compute Roll-up
                        </Button>
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          onClick={() => freezeCostMutation.mutate()}
                          disabled={freezeCostMutation.isPending || !costRollupQuery.data || costLockQuery.data?.status === 'approved'}
                          title={costLockQuery.data?.status === 'approved' ? 'Cost is approved-locked. Unlock first.' : undefined}
                        >
                          {freezeCostMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Snowflake className="h-4 w-4 mr-2" />}
                          Recalculate &amp; Freeze
                        </Button>
                      </div>
                    </div>

                    {showCostRollup && costRollupQuery.isError && (
                      <p className="text-xs text-destructive">Failed to compute roll-up. Please try again.</p>
                    )}

                    {showCostRollup && costRollupQuery.data && (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="min-w-[220px]">Item</TableHead>
                              <TableHead>Cost Basis</TableHead>
                              <TableHead className="text-right">Own Cost</TableHead>
                              <TableHead className="text-right">Rolled-up Cost</TableHead>
                              <TableHead className="text-right">Frozen Cost</TableHead>
                              <TableHead className="w-6" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(costRollupQuery.data.items as any[]).map((ri: any) => {
                              const pi = (projectItems || []).find((p: any) => p.id === ri.id);
                              const currency = project?.currency || 'USD';
                              const fmt = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(v);
                              const frozenCost = pi?.rolledUpCost ? parseFloat(pi.rolledUpCost) : null;
                              return (
                                <TableRow key={ri.id} className={ri.parentProjectItemId ? 'bg-muted/30' : ''}>
                                  <TableCell className="text-xs">
                                    {ri.parentProjectItemId && <CornerDownRight className="inline h-3 w-3 mr-1 text-muted-foreground" />}
                                    <span className="font-mono">{ri.itemCode || `#${ri.id}`}</span>
                                    {ri.description && <span className="ml-1 text-muted-foreground truncate max-w-[120px] inline-block align-bottom">{ri.description}</span>}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={ri.costBasis === 'bom_approved' ? 'default' : ri.costBasis === 'estimated' ? 'secondary' : 'outline'} className="text-xs">
                                      {ri.costBasis === 'bom_approved' ? 'BOM (approved)' : ri.costBasis === 'estimated' ? 'Estimated' : 'No cost'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right text-xs font-mono">{fmt(ri.ownCost)}</TableCell>
                                  <TableCell className="text-right text-xs font-mono font-semibold">{fmt(ri.rolledUpCost)}</TableCell>
                                  <TableCell className="text-right text-xs font-mono text-muted-foreground">
                                    {frozenCost !== null ? fmt(frozenCost) : <span className="italic">—</span>}
                                  </TableCell>
                                  <TableCell className="text-center px-1">
                                    {ri.isStale
                                      ? <Clock className="h-3 w-3 text-amber-500" title="Changed since last freeze" />
                                      : ri.rolledUpAt
                                        ? <ShieldCheck className="h-3 w-3 text-green-500" title="Up to date" />
                                        : null}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                            <TableRow className="border-t-2 font-semibold">
                              <TableCell colSpan={3} className="text-sm">Project Total</TableCell>
                              <TableCell className="text-right text-sm font-mono">
                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: project?.currency || 'USD' }).format(costRollupQuery.data.projectTotal)}
                              </TableCell>
                              <TableCell /><TableCell />
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {!showCostRollup && (
                      <p className="text-xs text-muted-foreground">
                        Click "Compute Roll-up" to see BOM-driven cost aggregation across all project items.
                        Use "Recalculate &amp; Freeze" to persist the values for approvals and reporting.
                      </p>
                    )}

                    {/* ── Cost Lock / Approval Workflow ── */}
                    <div className="border-t pt-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Lock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Cost Approval</span>
                          {/* Status badge */}
                          {(() => {
                            const s = costLockQuery.data?.status || 'unlocked';
                            if (s === 'unlocked') return <Badge variant="outline" className="text-xs gap-1 text-muted-foreground"><LockOpen className="h-3 w-3" /> Unlocked</Badge>;
                            if (s === 'pending_approval') return <Badge variant="outline" className="text-xs gap-1 text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/20"><ShieldAlert className="h-3 w-3" /> Pending Approval</Badge>;
                            if (s === 'approved') return <Badge variant="outline" className="text-xs gap-1 text-green-600 border-green-300 bg-green-50 dark:bg-green-950/20"><ShieldCheck className="h-3 w-3" /> Approved &amp; Locked</Badge>;
                            if (s === 'rejected') return <Badge variant="outline" className="text-xs gap-1 text-destructive border-destructive/30 bg-destructive/5"><ShieldOff className="h-3 w-3" /> Rejected</Badge>;
                            return null;
                          })()}
                        </div>

                        {/* Action buttons based on state */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {(costLockQuery.data?.status === 'unlocked' || costLockQuery.data?.status === 'rejected') && (
                            <Button
                              type="button" variant="outline" size="sm"
                              onClick={() => submitCostLockMutation.mutate()}
                              disabled={submitCostLockMutation.isPending}
                            >
                              {submitCostLockMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ShieldAlert className="h-3 w-3 mr-1" />}
                              Submit for Approval
                            </Button>
                          )}
                          {costLockQuery.data?.status === 'pending_approval' && (
                            <>
                              <Button
                                type="button" variant="default" size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => approveCostLockMutation.mutate('')}
                                disabled={approveCostLockMutation.isPending}
                              >
                                {approveCostLockMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
                                Approve
                              </Button>
                              <Button
                                type="button" variant="outline" size="sm"
                                className="border-destructive text-destructive hover:bg-destructive/10"
                                onClick={() => { setShowCostLockNoteInput('reject'); setCostLockNote(''); }}
                              >
                                <ShieldOff className="h-3 w-3 mr-1" /> Reject
                              </Button>
                            </>
                          )}
                          {costLockQuery.data?.status === 'approved' && (
                            <Button
                              type="button" variant="outline" size="sm"
                              onClick={() => { setShowCostLockNoteInput('unlock'); setCostLockNote(''); }}
                            >
                              <LockOpen className="h-3 w-3 mr-1" /> Unlock
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Note input for reject / unlock */}
                      {showCostLockNoteInput && (
                        <div className="flex gap-2 items-start mt-1">
                          <input
                            className="flex-1 border rounded px-2 py-1 text-xs"
                            placeholder={showCostLockNoteInput === 'reject' ? 'Reason for rejection (required)' : 'Reason for unlocking (required)'}
                            value={costLockNote}
                            onChange={e => setCostLockNote(e.target.value)}
                          />
                          <Button
                            type="button" size="sm" variant={showCostLockNoteInput === 'reject' ? 'destructive' : 'outline'}
                            disabled={(rejectCostLockMutation.isPending || unlockCostLockMutation.isPending) || !costLockNote.trim()}
                            onClick={() => {
                              if (showCostLockNoteInput === 'reject') rejectCostLockMutation.mutate(costLockNote);
                              else unlockCostLockMutation.mutate(costLockNote);
                            }}
                          >
                            {(rejectCostLockMutation.isPending || unlockCostLockMutation.isPending)
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : showCostLockNoteInput === 'reject' ? 'Confirm Reject' : 'Confirm Unlock'}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setShowCostLockNoteInput(null)}>Cancel</Button>
                        </div>
                      )}

                      {/* Audit trail */}
                      {costLockQuery.data && costLockQuery.data.status !== 'unlocked' && (
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          {costLockQuery.data.submittedByName && (
                            <p>Submitted by <strong>{costLockQuery.data.submittedByName}</strong>{costLockQuery.data.submittedAt ? ` on ${new Date(costLockQuery.data.submittedAt).toLocaleString()}` : ''}</p>
                          )}
                          {costLockQuery.data.reviewedByName && (
                            <p>Reviewed by <strong>{costLockQuery.data.reviewedByName}</strong>{costLockQuery.data.reviewedAt ? ` on ${new Date(costLockQuery.data.reviewedAt).toLocaleString()}` : ''}</p>
                          )}
                          {costLockQuery.data.note && (
                            <p className="italic">Note: {costLockQuery.data.note}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

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
                            <TableHead className="w-[3%]"></TableHead>
                            <TableHead className="min-w-[260px]">Item Code</TableHead>
                            <TableHead className="min-w-[300px]">Description</TableHead>
                            <TableHead>CodeBars</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead>UOM</TableHead>
                            <TableHead>Make/Buy</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(() => {
                            if (!filteredProjectItems || filteredProjectItems.length === 0) return null;

                            // Collect all descendant IDs to prevent circular selection
                            function getDescendantIds(itemId: number, cMap: Record<number, any[]>): Set<number> {
                              const result = new Set<number>();
                              const stack = [itemId];
                              while (stack.length) {
                                const curr = stack.pop()!;
                                for (const c of (cMap[curr] || [])) {
                                  result.add(c.id);
                                  stack.push(c.id);
                                }
                              }
                              return result;
                            }

                            function renderItemRow(item: any, depth: number): React.ReactNode {
                              const children = childrenMap[item.id] || [];
                              const hasChildren = children.length > 0;
                              const isExpanded = expandedItems.has(item.id);

                              return (
                                <React.Fragment key={item.id}>
                                  <TableRow>
                                    <TableCell className="w-6">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setDetailProjectItem(item);
                                          setIsProjectItemDetailOpen(true);
                                        }}
                                        className="h-6 w-6 p-0"
                                        title="View Project Item Details"
                                      >
                                        <ArrowRight className="h-4 w-4 text-amber-500" />
                                      </Button>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 20}px` }}>
                                        {hasChildren ? (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 p-0 shrink-0"
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleExpand(item.id); }}
                                          >
                                            {isExpanded
                                              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                          </Button>
                                        ) : depth > 0 ? (
                                          <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        ) : (
                                          <span className="w-5 shrink-0" />
                                        )}
                                        <span className={depth > 0 ? "text-muted-foreground" : ""}>
                                          {item.itemCode || item.masterItem?.itemCode || "N/A"}
                                        </span>
                                      </div>
                                    </TableCell>
                                    <TableCell className={depth > 0 ? "text-muted-foreground text-sm" : ""}>{item.description || item.masterItem?.description || item.notes || "N/A"}</TableCell>
                                    <TableCell className="font-mono text-xs">{(item as any).codeBars || "-"}</TableCell>
                                    <TableCell>{item.quantity}</TableCell>
                                    <TableCell>{item.uom || item.masterItem?.uom || "N/A"}</TableCell>
                                    <TableCell>{item.makeOrBuy || item.masterItem?.makeOrBuy || "N/A"}</TableCell>
                                    <TableCell>
                                      <Select
                                        value={item.status || "Not Started"}
                                        onValueChange={(newStatus) => {
                                          setSelectedItem(item);
                                          updateProjectItemStatus(item.id, newStatus);
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
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreVertical className="h-4 w-4" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem
                                            onClick={() => {
                                              setSelectedItem(item);
                                              itemForm.reset({
                                                itemCode: item.masterItem?.itemCode || "",
                                                description: item.masterItem?.description || "",
                                                quantity: item.quantity || 1,
                                                uom: item.masterItem?.uom || "",
                                                makeOrBuy: (item.masterItem?.makeOrBuy as "Make" | "Buy" | "Service") || "Buy",
                                                drawingNo: item.masterItem?.drawingNo || "",
                                              });
                                              setIsEditItemOpen(true);
                                            }}
                                          >
                                            <Edit className="h-4 w-4 mr-2" /> Edit
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem
                                            onClick={() => {
                                              setLinkParentForItem({ item, mode: 'link-parent' });
                                              setLinkParentSelectedId(item.parentProjectItemId?.toString() || "");
                                              setIsLinkParentOpen(true);
                                            }}
                                          >
                                            <CornerDownRight className="h-4 w-4 mr-2" /> Link as Sub-item
                                          </DropdownMenuItem>
                                          {item.parentProjectItemId && (
                                            <DropdownMenuItem
                                              onClick={() => setParentMutation.mutate({ childId: item.id, parentId: null })}
                                            >
                                              <ChevronLeft className="h-4 w-4 mr-2" /> Remove from Parent
                                            </DropdownMenuItem>
                                          )}
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem
                                            className="text-red-600 focus:text-red-600"
                                            onClick={() => {
                                              setSelectedItem(item);
                                              setIsDeleteConfirmOpen(true);
                                            }}
                                          >
                                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </TableCell>
                                  </TableRow>
                                  {isExpanded && hasChildren && children.map(child => renderItemRow(child, depth + 1))}
                                </React.Fragment>
                              );
                            }

                            return rootItems.map(item => renderItemRow(item, 0));
                          })()}
                          {(!filteredProjectItems || filteredProjectItems.length === 0) && (
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
                  <div onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
                    {project && (
                      <DocumentControl projectId={parseInt(projectId)} />
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
              <h1 className="text-3xl font-bold">{project.code} — {project.clientName || project.name}</h1>
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
            {project.projectOrigin === 'sales_offer' && project.sourceOrderNumber && (
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                  Source: Order #{project.sourceOrderNumber}
                  {project.sourceOfferRevision != null && ` (Rev ${project.sourceOfferRevision})`}
                </Badge>
              </div>
            )}
            <p className="mt-2">{project.description}</p>
            <p className="text-muted-foreground text-sm mt-2">
              <span className="inline-flex items-center gap-1 mr-4">
                <Calendar className="h-4 w-4" /> Started: {formatDate(project.startDate)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-4 w-4" /> Target End: {formatDate(project.targetEndDate)}
              </span>
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              <span className="inline-flex items-center gap-1 mr-4">
                <Building className="h-4 w-4" /> Customer: {project.clientName || "None"}
              </span>
              <span className="inline-flex items-center gap-1">
                <FileText className="h-4 w-4" /> Financial Year: {project.financialYear || "Not set"}
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
            <TabsTrigger value="document-control">Document Control</TabsTrigger>
            <TabsTrigger value="commercial">Commercial</TabsTrigger>
            <TabsTrigger value="pricing" className="flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" />Pricing
            </TabsTrigger>
            <TabsTrigger value="execution-drafts">Execution Drafts</TabsTrigger>
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
                          {tasks?.filter(t => !['completed', 'canceled'].includes(t.status)).length || 0}
                        </p>
                        <p className="text-xs text-amber-600">Active</p>
                      </div>
                      <div className="bg-red-50 border border-red-100 rounded-md p-3 text-center">
                        <p className="text-2xl font-bold text-red-700">
                          {tasks?.filter(t => t.status === 'canceled').length || 0}
                        </p>
                        <p className="text-xs text-red-600">Canceled</p>
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
                      <p className="text-muted-foreground text-sm">{formatDate(project.createdAt)}</p>
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
                        <p>{formatDate(phase.target_end_date)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Lead</p>
                        <p>
                          {(() => {
                            const leadId = phase.phase_lead_id || phase.lead_id;
                            if (!leadId) return 'Not assigned';
                            const lead = allUsers?.find((u: any) => u.id === leadId);
                            if (!lead) return 'Not assigned';
                            const displayName = lead.firstName && lead.lastName ? `${lead.firstName} ${lead.lastName}` : lead.username;
                            const roleLabel = lead.role || '';
                            const deptLabel = lead.department || '';
                            const tail = [roleLabel, deptLabel].filter(Boolean).join(', ');
                            return tail ? <>{displayName} <span className="text-muted-foreground text-xs">({tail})</span></> : displayName;
                          })()}
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
                    {members?.map((m: any) => {
                      const userName = m.user?.username || m.username || 'Unknown';
                      const userEmail = m.user?.email || m.email || '';
                      const userActive = m.user?.isActive ?? m.isActive ?? true;
                      const joinDate = m.joinedAt || m.joined_date || m.createdAt || m.created_at;
                      const memberRole = m.role || 'team_member';
                      const userObj = allUsers?.find((u: any) => u.id === (m.userId || m.user_id || m.user?.id));
                      const displayName = (userObj && userObj.firstName && userObj.lastName) ? `${userObj.firstName} ${userObj.lastName}` : userName;
                      const systemRole = userObj?.role || m.user?.role || '';
                      const department = userObj?.department || '';
                      return (
                        <TableRow key={m.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{displayName}</p>
                                <p className="text-xs text-muted-foreground">{userEmail}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Badge variant="outline" className={getRoleColor(memberRole)}>
                                {memberRole.split('_').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                              </Badge>
                              {systemRole && (
                                <p className="text-xs text-muted-foreground">{systemRole}{department ? ` — ${department}` : ''}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{formatDate(joinDate)}</TableCell>
                          <TableCell>
                            <Badge variant={userActive ? "default" : "outline"} className={userActive ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-gray-100 text-gray-800"}>
                              {userActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEditMember(m)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  if (window.confirm(`Remove ${displayName} from this project?`)) {
                                    deleteMemberMutation.mutate(m.userId || m.user_id || m.user?.id);
                                  }
                                }}
                                disabled={deleteMemberMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="tasks" className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Project Tasks</h2>
              {project?.status !== 'canceled' && (
                <Button onClick={handleAddTask}>
                  <Plus className="mr-1 h-4 w-4" /> Add Task
                </Button>
              )}
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
                          <Badge variant={task.status === 'completed' ? "default" : "outline"} className={
                            task.status === 'completed' ? "bg-green-100 text-green-800 hover:bg-green-100" :
                            task.status === 'canceled' ? "bg-red-100 text-red-800" :
                            task.status === 'blocked' ? "bg-gray-100 text-gray-800" :
                            task.status === 'in_progress' ? "bg-amber-100 text-amber-800" :
                            "bg-blue-100 text-blue-800"
                          }>
                            {task.status === 'completed' ? "Completed" :
                             task.status === 'canceled' ? "Canceled" :
                             task.status === 'blocked' ? "Blocked" :
                             task.status === 'in_progress' ? "In Progress" :
                             "Pending"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {project?.status !== 'canceled' && task.status !== 'canceled' && (
                            <Button variant="ghost" size="icon" onClick={() => handleEditTask(task)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
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
                  {Object.keys(childrenMap).length > 0 && ` (${rootItems.length} top-level)`}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table className="min-w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[3%]"></TableHead>
                      <TableHead className="w-[15%]">Item Code</TableHead>
                      <TableHead className="w-[22%]">Description</TableHead>
                      <TableHead className="w-[12%]">CodeBars</TableHead>
                      <TableHead className="w-[6%]">Quantity</TableHead>
                      <TableHead className="w-[5%]">UOM</TableHead>
                      <TableHead className="w-[6%]">Make/Buy</TableHead>
                      <TableHead className="w-[10%]">Status</TableHead>
                      <TableHead className="w-[18%] text-center">Actions</TableHead>
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
                      (() => {
                        const renderItemRow = (item: any, depth: number = 0) => {
                          const hasChildren = !!(childrenMap[item.id] && childrenMap[item.id].length > 0);
                          const isExpanded = expandedItems.has(item.id);
                          const children = hasChildren && isExpanded ? childrenMap[item.id] : [];
                          return (
                            <React.Fragment key={`item-${item.id}`}>
                              <TableRow className={depth > 0 ? "bg-muted/30" : ""}>
                                <TableCell className="w-6">
                                  <div className="flex items-center" style={{ paddingLeft: `${depth * 20}px` }}>
                                    {hasChildren ? (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          toggleExpand(item.id);
                                        }}
                                        className="h-6 w-6 p-0 mr-1"
                                        title={isExpanded ? "Collapse" : "Expand"}
                                      >
                                        {isExpanded ? (
                                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                        ) : (
                                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                        )}
                                      </Button>
                                    ) : depth > 0 ? (
                                      <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground mr-1" />
                                    ) : null}
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setDetailProjectItem(item);
                                        setIsProjectItemDetailOpen(true);
                                      }}
                                      className="h-6 w-6 p-0"
                                      title="View Project Item Details"
                                    >
                                      <ArrowRight className="h-4 w-4 text-amber-500" />
                                    </Button>
                                  </div>
                                </TableCell>
                                <TableCell className="truncate max-w-0">{item.itemCode || item.masterItem?.itemCode || "N/A"}</TableCell>
                                <TableCell className="truncate max-w-0">
                                  <div className="truncate" title={item.description || item.masterItem?.description || item.notes || "N/A"}>
                                    {item.description || item.masterItem?.description || item.notes || "N/A"}
                                  </div>
                                </TableCell>
                                <TableCell className="font-mono text-xs">{(item as any).codeBars || "-"}</TableCell>
                                <TableCell>{item.quantity}</TableCell>
                                <TableCell>{item.uom || item.masterItem?.uom || "N/A"}</TableCell>
                                <TableCell>{item.makeOrBuy || item.masterItem?.makeOrBuy || "N/A"}</TableCell>
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
                                        setSelectedItem(item);
                                        itemForm.reset({
                                          itemCode: item.masterItem?.itemCode || "",
                                          description: item.masterItem?.description || "",
                                          quantity: item.quantity || 1,
                                          uom: item.masterItem?.uom || "",
                                          makeOrBuy: (item.masterItem?.makeOrBuy as "Make" | "Buy" | "Service") || "Buy",
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
                                        setSelectedItem(item);
                                        setIsDeleteConfirmOpen(true);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                              {children.map((child: any) => renderItemRow(child, depth + 1))}
                            </React.Fragment>
                          );
                        };
                        return rootItems.map((item: any) => renderItemRow(item, 0));
                      })()
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="document-control" className="space-y-4">
            {project && (
              <DocumentControl projectId={parseInt(id)} />
            )}
          </TabsContent>

          <TabsContent value="commercial" className="space-y-4">
            <Suspense fallback={<Card><CardContent className="p-8 text-center"><div className="animate-pulse text-sm text-muted-foreground">Loading...</div></CardContent></Card>}>
              <CommercialChangesTab projectId={parseInt(id)} />
            </Suspense>
          </TabsContent>

          {/* ═══════════════════ PRICING TAB ═══════════════════ */}
          <TabsContent value="pricing" className="space-y-4">
            {pricingQuery.isLoading ? (
              <Card><CardContent className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></CardContent></Card>
            ) : pricingQuery.isError ? (
              <Card><CardContent className="p-6 text-center text-destructive text-sm">Failed to load pricing data.</CardContent></Card>
            ) : (() => {
              const pd = pricingQuery.data!;
              const isLocked = pd.costLockStatus === 'approved';
              const fmtInr = (v: number | string | null | undefined) =>
                v === null || v === undefined ? '—' :
                new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(parseFloat(String(v)));
              const fmtFc = (v: number | string | null | undefined) =>
                v === null || v === undefined ? '—' :
                new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(parseFloat(String(v)));

              return (
                <div className="space-y-5">
                  {/* Cost Lock gate banner */}
                  {!isLocked && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>Pricing is editable only after costs are <strong>approved &amp; locked</strong>. Margins can be entered now but selling prices will be computed once cost approval is in place.</span>
                    </div>
                  )}

                  {/* ── SECTION 1: Commercial Terms ─────────────────── */}
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          Commercial Terms
                        </CardTitle>
                        {!pricingTermsEditing ? (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPricingTermsEditing(true)}>
                            <Edit className="h-3 w-3 mr-1" />Edit
                          </Button>
                        ) : (
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setPricingTermsEditing(false); }}>Cancel</Button>
                            <Button size="sm" className="h-7 text-xs" disabled={saveTermsMutation.isPending}
                              onClick={() => saveTermsMutation.mutate(pricingTermsForm)}>
                              {saveTermsMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Save
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {/* Selling Currency */}
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Selling Currency</label>
                          {pricingTermsEditing ? (
                            <select className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
                              value={pricingTermsForm.sellingCurrency}
                              onChange={e => setPricingTermsForm(f => ({ ...f, sellingCurrency: e.target.value }))}>
                              {['USD','EUR','GBP','AED','SAR','QAR','KWD','OMR','SGD','JPY','INR'].map(c =>
                                <option key={c} value={c}>{c}</option>
                              )}
                            </select>
                          ) : (
                            <p className="text-sm font-medium">{pd.sellingCurrency || 'USD'}</p>
                          )}
                        </div>

                        {/* Exchange Rate */}
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Exchange Rate (INR per unit)</label>
                          {pricingTermsEditing ? (
                            <Input className="h-8 text-sm" type="number" step="0.0001" placeholder="e.g. 83.50"
                              value={pricingTermsForm.exchangeRate}
                              onChange={e => setPricingTermsForm(f => ({ ...f, exchangeRate: e.target.value }))} />
                          ) : (
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{pd.exchangeRate ? `1 ${pd.sellingCurrency} = ₹${parseFloat(pd.exchangeRate).toFixed(4)}` : '—'}</p>
                              {pd.exchangeRateFrozenAt ? (
                                <Badge variant="outline" className="text-xs gap-1 text-green-600 border-green-300 bg-green-50">
                                  <Snowflake className="h-3 w-3" />Frozen
                                </Badge>
                              ) : pd.exchangeRate ? (
                                <Badge variant="outline" className="text-xs gap-1 text-amber-600 border-amber-300 bg-amber-50">
                                  <Clock className="h-3 w-3" />Not frozen
                                </Badge>
                              ) : null}
                            </div>
                          )}
                          {!pricingTermsEditing && pd.exchangeRate && !pd.exchangeRateFrozenAt && (
                            <Button size="sm" variant="outline" className="h-6 text-xs mt-1" disabled={freezeExchangeRateMutation.isPending}
                              onClick={() => freezeExchangeRateMutation.mutate()}>
                              {freezeExchangeRateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Snowflake className="h-3 w-3 mr-1" />}
                              Freeze Rate
                            </Button>
                          )}
                        </div>

                        {/* Default Margin % */}
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Default Margin %</label>
                          {pricingTermsEditing ? (
                            <Input className="h-8 text-sm" type="number" step="0.01" placeholder="e.g. 15"
                              value={pricingTermsForm.defaultMarginPercent}
                              onChange={e => setPricingTermsForm(f => ({ ...f, defaultMarginPercent: e.target.value }))} />
                          ) : (
                            <p className="text-sm font-medium">{pd.defaultMarginPercent ? `${parseFloat(pd.defaultMarginPercent).toFixed(2)}%` : '—'}</p>
                          )}
                        </div>

                        {/* Incoterms */}
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Incoterms</label>
                          {pricingTermsEditing ? (
                            <select className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
                              value={pricingTermsForm.incoterms}
                              onChange={e => setPricingTermsForm(f => ({ ...f, incoterms: e.target.value }))}>
                              <option value="">— Select —</option>
                              {['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP'].map(t =>
                                <option key={t} value={t}>{t}</option>
                              )}
                            </select>
                          ) : (
                            <p className="text-sm font-medium">{pd.incoterms || '—'}</p>
                          )}
                        </div>

                        {/* Offer Validity */}
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Offer Validity (days)</label>
                          {pricingTermsEditing ? (
                            <Input className="h-8 text-sm" type="number" min={1}
                              value={pricingTermsForm.offerValidityDays}
                              onChange={e => setPricingTermsForm(f => ({ ...f, offerValidityDays: e.target.value }))} />
                          ) : (
                            <p className="text-sm font-medium">{pd.offerValidityDays} days</p>
                          )}
                        </div>
                      </div>

                      {/* Payment & Delivery Terms */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Payment Terms</label>
                          {pricingTermsEditing ? (
                            <Textarea className="text-sm min-h-[64px]" placeholder="e.g. 30% advance, 70% against delivery"
                              value={pricingTermsForm.paymentTerms}
                              onChange={e => setPricingTermsForm(f => ({ ...f, paymentTerms: e.target.value }))} />
                          ) : (
                            <p className="text-sm whitespace-pre-wrap">{pd.paymentTerms || <span className="text-muted-foreground italic">—</span>}</p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Delivery Terms</label>
                          {pricingTermsEditing ? (
                            <Textarea className="text-sm min-h-[64px]" placeholder="e.g. 12 weeks from order confirmation"
                              value={pricingTermsForm.deliveryTerms}
                              onChange={e => setPricingTermsForm(f => ({ ...f, deliveryTerms: e.target.value }))} />
                          ) : (
                            <p className="text-sm whitespace-pre-wrap">{pd.deliveryTerms || <span className="text-muted-foreground italic">—</span>}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* ── SECTION 2: Item-Level Pricing Table ─────────── */}
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Percent className="h-4 w-4 text-muted-foreground" />
                          Item Margins &amp; Selling Prices
                        </CardTitle>
                        <div className="flex gap-2 flex-wrap">
                          {pd.defaultMarginPercent && (
                            <Button size="sm" variant="outline" className="h-7 text-xs"
                              disabled={applyDefaultMarginMutation.isPending}
                              onClick={() => applyDefaultMarginMutation.mutate()}>
                              {applyDefaultMarginMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <TrendingUp className="h-3 w-3 mr-1" />}
                              Apply {parseFloat(pd.defaultMarginPercent).toFixed(1)}% to All
                            </Button>
                          )}
                          {marginEditDirty && (
                            <Button size="sm" className="h-7 text-xs"
                              disabled={saveItemMarginsMutation.isPending}
                              onClick={() => saveItemMarginsMutation.mutate(itemMargins)}>
                              {saveItemMarginsMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                              Save Margins
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="text-xs">
                              <TableHead className="min-w-[140px]">Item Code</TableHead>
                              <TableHead className="min-w-[220px]">Description</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead className="text-right">Cost (INR)</TableHead>
                              <TableHead className="text-right w-[110px]">Margin %</TableHead>
                              <TableHead className="text-right">Selling (INR)</TableHead>
                              <TableHead className="text-right">Selling ({pd.sellingCurrency})</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pd.items.map(item => {
                              const indent = item.parentProjectItemId ? 'pl-6 text-muted-foreground' : '';
                              const marginVal = itemMargins[item.id] ?? '';
                              const cost = parseFloat(item.rolledUpCost || '0');
                              const margin = marginVal !== '' ? parseFloat(marginVal) : null;
                              const sellingInr = (margin !== null && !isNaN(margin)) ? cost * (1 + margin / 100) : null;
                              const er = parseFloat(pd.exchangeRate || '0');
                              const sellingFc = sellingInr !== null && er > 0 ? sellingInr / er : null;
                              return (
                                <TableRow key={item.id} className="text-xs">
                                  <TableCell className={`font-mono ${indent}`}>{item.itemCode}</TableCell>
                                  <TableCell className={`max-w-[220px] truncate ${indent}`} title={item.description}>{item.description}</TableCell>
                                  <TableCell className="text-right">{parseFloat(item.quantity || '1').toFixed(2)}</TableCell>
                                  <TableCell className="text-right font-mono">{fmtInr(item.rolledUpCost)}</TableCell>
                                  <TableCell className="text-right">
                                    <Input
                                      type="number" step="0.01" min={0} max={999}
                                      className="h-6 w-[80px] text-xs text-right p-1"
                                      value={marginVal}
                                      placeholder="0.00"
                                      onChange={e => {
                                        setItemMargins(m => ({ ...m, [item.id]: e.target.value }));
                                        setMarginEditDirty(true);
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell className="text-right font-mono">
                                    {sellingInr !== null ? fmtInr(sellingInr) : <span className="text-muted-foreground">—</span>}
                                  </TableCell>
                                  <TableCell className="text-right font-mono">
                                    {sellingFc !== null ? fmtFc(sellingFc) : <span className="text-muted-foreground">—</span>}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Project Totals Footer */}
                      {pd.items.length > 0 && (() => {
                        const topItems = pd.items.filter(i => !i.parentProjectItemId);
                        const er = parseFloat(pd.exchangeRate || '0');
                        const liveSellingInr = topItems.reduce((sum, item) => {
                          const m = itemMargins[item.id];
                          if (m === '' || m === undefined) return sum + parseFloat(item.sellingPriceInr || '0');
                          const margin = parseFloat(m);
                          if (isNaN(margin)) return sum;
                          return sum + parseFloat(item.rolledUpCost || '0') * (1 + margin / 100);
                        }, 0);
                        const liveSellingFc = er > 0 ? liveSellingInr / er : null;
                        const totalCostInr = topItems.reduce((s, i) => s + parseFloat(i.rolledUpCost || '0'), 0);
                        const blendedMargin = totalCostInr > 0 ? ((liveSellingInr - totalCostInr) / totalCostInr) * 100 : null;
                        return (
                          <div className="border-t px-4 py-3 bg-muted/30 grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <p className="text-xs text-muted-foreground">Total Cost (INR)</p>
                              <p className="text-sm font-semibold font-mono">{fmtInr(totalCostInr)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Total Selling (INR)</p>
                              <p className="text-sm font-semibold font-mono text-emerald-700 dark:text-emerald-400">{fmtInr(liveSellingInr)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Total Selling ({pd.sellingCurrency})</p>
                              <p className="text-sm font-semibold font-mono">{liveSellingFc !== null ? fmtFc(liveSellingFc) : '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Blended Margin</p>
                              <p className={`text-sm font-semibold ${blendedMargin !== null && blendedMargin < 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}`}>
                                {blendedMargin !== null ? `${blendedMargin.toFixed(2)}%` : '—'}
                              </p>
                            </div>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>

                  {/* ── SECTION 3: Commercial Snapshots ─────────────── */}
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Camera className="h-4 w-4 text-muted-foreground" />
                          Commercial Snapshots
                          {snapshotsQuery.data && snapshotsQuery.data.length > 0 && (
                            <Badge variant="secondary" className="text-xs">{snapshotsQuery.data.length}</Badge>
                          )}
                        </CardTitle>
                        {isLocked && (
                          <div className="flex items-center gap-2">
                            <Input
                              className="h-7 text-xs w-56" placeholder="Optional notes for snapshot…"
                              value={snapshotNotes}
                              onChange={e => setSnapshotNotes(e.target.value)}
                            />
                            <Button size="sm" className="h-7 text-xs"
                              disabled={createSnapshotMutation.isPending}
                              onClick={() => createSnapshotMutation.mutate(snapshotNotes)}>
                              {createSnapshotMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Camera className="h-3 w-3 mr-1" />}
                              Take Snapshot
                            </Button>
                          </div>
                        )}
                      </div>
                      {!isLocked && (
                        <p className="text-xs text-muted-foreground mt-1">Snapshots can only be created once costs are approved &amp; locked.</p>
                      )}
                    </CardHeader>
                    <CardContent className="p-0">
                      {snapshotsQuery.isLoading ? (
                        <div className="p-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
                      ) : !snapshotsQuery.data || snapshotsQuery.data.length === 0 ? (
                        <div className="p-6 text-center text-sm text-muted-foreground italic">No snapshots yet.</div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow className="text-xs">
                              <TableHead>Snapshot #</TableHead>
                              <TableHead>Rev</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Currency</TableHead>
                              <TableHead className="text-right">Total Cost (INR)</TableHead>
                              <TableHead className="text-right">Total Selling (INR)</TableHead>
                              <TableHead className="text-right">Total Selling (FC)</TableHead>
                              <TableHead>Created By</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {snapshotsQuery.data.map(snap => (
                              <TableRow key={snap.id} className="text-xs">
                                <TableCell className="font-mono font-semibold">{snap.snapshot_number}</TableCell>
                                <TableCell>R{snap.revision}</TableCell>
                                <TableCell>
                                  <Badge variant={snap.status === 'approved' ? 'default' : 'outline'}
                                    className={`text-xs ${snap.status === 'approved' ? 'bg-green-100 text-green-700 border-green-300' : ''}`}>
                                    {snap.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>{snap.selling_currency}</TableCell>
                                <TableCell className="text-right font-mono">{fmtInr(snap.total_cost_inr)}</TableCell>
                                <TableCell className="text-right font-mono text-emerald-700 dark:text-emerald-400">{fmtInr(snap.total_selling_inr)}</TableCell>
                                <TableCell className="text-right font-mono">{snap.total_selling_foreign ? fmtFc(snap.total_selling_foreign) : '—'}</TableCell>
                                <TableCell>{snap.created_by_name || '—'}</TableCell>
                                <TableCell>{snap.created_at ? format(new Date(snap.created_at), 'dd MMM yy') : '—'}</TableCell>
                                <TableCell className="text-right">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                                          onClick={() => downloadPriceSheet(snap.id, snap.snapshot_number)}>
                                          <Download className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Export Price Sheet (CSV)</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
            })()}
          </TabsContent>
          {/* ═══════════════════════════════════════════════════════════ */}

          <TabsContent value="execution-drafts" className="space-y-4">
            <Suspense fallback={<Card><CardContent className="p-8 text-center"><div className="animate-pulse text-sm text-muted-foreground">Loading...</div></CardContent></Card>}>
              <ExecutionDraftsTab projectId={parseInt(id)} />
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
                  <FormControl><Input {...field} readOnly className="bg-muted" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={phaseForm.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Textarea {...field} readOnly className="bg-muted" /></FormControl>
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

      <Dialog open={isDeliverablesOpen} onOpenChange={(open) => { setIsDeliverablesOpen(open); if (!open) { setSelectedPhase(null); setIsAddDeliverableOpen(false); setEditingDeliverable(null); } }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
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
                    <form onSubmit={deliverableForm.handleSubmit((data) => createDeliverableMutation.mutate({ phaseId: selectedPhase?.id, data, phaseLeadId: selectedPhase?.phase_lead_id || selectedPhase?.lead_id }))} className="space-y-3">
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
              <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliverables.map((d: any) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <p className="font-medium">{d.name}</p>
                        <p className="text-xs text-muted-foreground">{d.description}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(d.dueDate || d.due_date)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {(() => {
                          const uid = d.assigned_to || d.assignedTo;
                          if (!uid) return <span className="text-muted-foreground text-xs">Unassigned</span>;
                          const u = allUsers?.find((u: any) => u.id === uid);
                          if (!u) return 'Unknown';
                          const name = u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.username;
                          const tail = [u.role, u.department].filter(Boolean).join(', ');
                          return tail ? <>{name} <span className="text-muted-foreground text-xs">({tail})</span></> : name;
                        })()}
                      </TableCell>
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
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => handleEditDeliverable(d)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {editingDeliverable && (
                <Card ref={editDeliverableRef} className="border-blue-200 bg-blue-50/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Edit Deliverable: {editingDeliverable.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Form {...deliverableForm}>
                      <form onSubmit={deliverableForm.handleSubmit((data) => updateDeliverableMutation.mutate({ id: editingDeliverable.id, data }))} className="space-y-3">
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
                        <FormField control={deliverableForm.control} name="assignedTo" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Assigned To</FormLabel>
                            <Select onValueChange={(val) => field.onChange(val ? Number(val) : undefined)} value={field.value?.toString() || ""}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Select assignee" /></SelectTrigger></FormControl>
                              <SelectContent>
                                {(() => {
                                  const users = allUsers?.filter((u: any) => u.isActive) || [];
                                  const hierarchy: Record<string, number> = { 'Superuser': 0, 'General Manager': 1, 'Senior Manager': 2, 'Manager': 3, 'Senior Executive': 4, 'Employee': 5 };
                                  const grouped: Record<string, any[]> = {};
                                  users.forEach((u: any) => {
                                    const r = u.role || 'Employee';
                                    if (!grouped[r]) grouped[r] = [];
                                    grouped[r].push(u);
                                  });
                                  return Object.keys(grouped)
                                    .sort((a, b) => (hierarchy[a] ?? 99) - (hierarchy[b] ?? 99))
                                    .map((role) => (
                                      <SelectGroup key={role}>
                                        <SelectLabel className="font-semibold text-blue-600">{role}s</SelectLabel>
                                        {grouped[role]
                                          .sort((a: any, b: any) => ((a.firstName || a.username) as string).localeCompare(b.firstName || b.username))
                                          .map((u: any) => (
                                            <SelectItem key={u.id} value={String(u.id)}>
                                              {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.username}
                                            </SelectItem>
                                          ))}
                                      </SelectGroup>
                                    ));
                                })()}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={deliverableForm.control} name="notes" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Notes</FormLabel>
                            <FormControl><Textarea {...field} placeholder="Notes" rows={2} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <div className="flex justify-end gap-2 pt-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setEditingDeliverable(null)}>Cancel</Button>
                          <Button type="submit" size="sm" disabled={updateDeliverableMutation.isPending}>
                            {updateDeliverableMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Changes
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              )}
              </>
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
                      {(() => {
                        const available = allUsers?.filter((u: any) => u.isActive && !members?.some((m: any) => m.userId === u.id)) || [];
                        const hierarchy: Record<string, number> = { 'Superuser': 0, 'General Manager': 1, 'Senior Manager': 2, 'Manager': 3, 'Senior Executive': 4, 'Employee': 5 };
                        const grouped: Record<string, any[]> = {};
                        available.forEach((u: any) => {
                          const r = u.role || 'Employee';
                          if (!grouped[r]) grouped[r] = [];
                          grouped[r].push(u);
                        });
                        const sortedRoles = Object.keys(grouped).sort((a, b) => (hierarchy[a] ?? 99) - (hierarchy[b] ?? 99));
                        return sortedRoles.map((role) => (
                          <SelectGroup key={role}>
                            <SelectLabel className="font-semibold text-blue-600">{role}s</SelectLabel>
                            {grouped[role]
                              .sort((a: any, b: any) => ((a.firstName || a.username) as string).localeCompare(b.firstName || b.username))
                              .map((u: any) => (
                                <SelectItem key={u.id} value={String(u.id)}>
                                  {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.username}
                                </SelectItem>
                              ))}
                          </SelectGroup>
                        ));
                      })()}
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
                      <SelectItem value="senior_manager">Senior Manager</SelectItem>
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

      <Dialog open={isEditMemberOpen} onOpenChange={(open) => { setIsEditMemberOpen(open); if (!open) setEditingMember(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Team Member</DialogTitle>
            <DialogDescription>Update role for "{editingMember?.username}".</DialogDescription>
          </DialogHeader>
          <Form {...memberForm}>
            <form onSubmit={memberForm.handleSubmit((data) => updateMemberMutation.mutate({ userId: editingMember?.userId, data: { role: data.role } }))} className="space-y-4">
              <FormField control={memberForm.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="senior_manager">Senior Manager</SelectItem>
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
                <Button type="button" variant="outline" onClick={() => setIsEditMemberOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={updateMemberMutation.isPending}>
                  {updateMemberMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
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