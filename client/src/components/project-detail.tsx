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
  Building
} from "lucide-react";
import { ProjectItemsImport } from "@/components/project-items-import";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

interface ProjectDetailProps {
  id: string;
}

export default function ProjectDetail({ id }: ProjectDetailProps) {
  const [_, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [isItemsImportOpen, setIsItemsImportOpen] = useState(false);
  const [isEditProjectOpen, setIsEditProjectOpen] = useState(false);
  
  // Enhanced debugging for project ID handling
  console.log("Project ID from prop:", id);
  console.log("Project ID type:", typeof id);
  
  // Use the provided ID directly
  const projectId = id;
  
  // Add a visible message if there are issues with the ID
  useEffect(() => {
    console.log("Project Detail Component mounted with ID:", projectId);
  }, [projectId]);
  
  // Keep some basic sanity check to handle completely missing IDs
  if (!projectId) {
    useEffect(() => {
      toast({
        title: "Missing Project ID",
        description: "No project ID was provided. Redirecting to the projects list.",
        variant: "destructive"
      });
      navigate("/projects");
    }, []);
    
    // Return early to prevent any API calls with invalid ID
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Missing Project ID</h2>
          <p className="text-muted-foreground">Redirecting to projects list...</p>
        </div>
      </div>
    );
  }

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
      return response.json();
    }
  });

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

  function formatDate(dateString) {
    if (!dateString) return "Not set";
    try {
      const date = new Date(dateString);
      return format(date, 'MMM d, yyyy');
    } catch (e) {
      return dateString;
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

  // Form schema for editing project
  const editProjectSchema = z.object({
    name: z.string().min(1, "Project name is required"),
    description: z.string().min(1, "Project description is required"),
    status: z.enum(["planning", "active", "on_hold", "completed", "canceled"]),
    priority: z.enum(["High", "Medium", "Low"]),
    customerId: z.number().optional().nullable(),
  });

  // Form type for editing project
  type EditProjectValues = z.infer<typeof editProjectSchema>;

  // Initialize form with project data
  const form = useForm<EditProjectValues>({
    resolver: zodResolver(editProjectSchema),
    defaultValues: {
      name: project?.name || "",
      description: project?.description || "",
      status: project?.status || "planning",
      priority: project?.priority || "Medium",
      customerId: project?.customerId || null,
    },
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

  function onSubmit(data: EditProjectValues) {
    updateProjectMutation.mutate(data);
  }

  return (
    <div className="space-y-6">
      {/* Edit Project Dialog */}
      <Dialog open={isEditProjectOpen} onOpenChange={setIsEditProjectOpen}>
        <DialogContent className="sm:max-w-[600px]">
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
                      onValueChange={(value) => field.onChange(value ? parseInt(value) : null)} 
                      defaultValue={field.value?.toString() || ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">No Customer</SelectItem>
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
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={() => setIsEditProjectOpen(true)}>
              <Edit className="mr-2 h-4 w-4" /> Edit Project
            </Button>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Add Task
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="text-sm">Start Date</span>
                  </div>
                  <span className="font-medium">{formatDate(project.startDate)}</span>
                </div>
                <div className="flex justify-between">
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="text-sm">Target End</span>
                  </div>
                  <span className="font-medium">{formatDate(project.targetEndDate)}</span>
                </div>
                {project.actualEndDate && (
                  <div className="flex justify-between">
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                      <span className="text-sm">Actual End</span>
                    </div>
                    <span className="font-medium">{formatDate(project.actualEndDate)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Team</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center mb-2">
                <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-2xl font-bold">{members?.length || 0}</span>
                <span className="ml-2 text-sm text-muted-foreground">team members</span>
              </div>
              <div className="flex -space-x-2">
                {isLoadingMembers ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  members?.slice(0, 5).map((member, index) => (
                    <TooltipProvider key={index}>
                      <Tooltip>
                        <TooltipTrigger>
                          <Avatar className="h-8 w-8 border-2 border-background">
                            <AvatarFallback className="text-xs">
                              {getInitials(member.userName || 'User')}
                            </AvatarFallback>
                          </Avatar>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{member.userName}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {member.role.replace('_', ' ')}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))
                )}
                {members && members.length > 5 && (
                  <Avatar className="h-8 w-8 border-2 border-background">
                    <AvatarFallback className="text-xs bg-muted">
                      +{members.length - 5}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-bold">{calculateProgress(phases)}%</span>
                  <span className="text-sm text-muted-foreground">completed</span>
                </div>
                <Progress value={calculateProgress(phases)} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{phases?.filter(p => p.status === 'completed').length || 0} phases completed</span>
                  <span>Total: {phases?.length || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {project.client && (
                  <div className="flex justify-between">
                    <span className="text-sm">Client</span>
                    <span className="font-medium">{project.client}</span>
                  </div>
                )}
                {project.budget !== null && project.budget !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-sm">Budget</span>
                    <span className="font-medium">₹{project.budget.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <div className="flex items-center">
                    <ClipboardList className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="text-sm">Tasks</span>
                  </div>
                  <span className="font-medium">{tasks?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <div className="flex items-center">
                    <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="text-sm">Documents</span>
                  </div>
                  <span className="font-medium">{project.documentCount || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      <Tabs 
        defaultValue="overview" 
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="phases">Phases</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Project Phases</CardTitle>
                <CardDescription>Overview of project phases and their status</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingPhases ? (
                  <div className="flex justify-center p-4">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : phases?.length > 0 ? (
                  <div className="space-y-6">
                    {phases.map((phase, index) => (
                      <div key={phase.id} className="relative">
                        {index < phases.length - 1 && (
                          <div className="absolute left-4 top-8 h-full w-0.5 bg-gray-200 -z-10" />
                        )}
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-1">
                            {getPhaseStatusIcon(phase.status)}
                          </div>
                          <div className="flex-grow">
                            <div className="flex justify-between">
                              <h4 className="font-medium">{phase.name}</h4>
                              <Badge 
                                variant="outline" 
                                className={getStatusBadgeColor(phase.status)}
                              >
                                {phase.status.charAt(0).toUpperCase() + phase.status.slice(1)}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{phase.description}</p>
                            <div className="flex flex-wrap gap-4 mt-2 text-sm">
                              <div className="flex items-center">
                                <Calendar className="h-4 w-4 mr-1 text-muted-foreground" />
                                <span>{formatDate(phase.startDate)} - {formatDate(phase.targetEndDate)}</span>
                              </div>
                              {phase.phaseLeadName && (
                                <div className="flex items-center">
                                  <Users className="h-4 w-4 mr-1 text-muted-foreground" />
                                  <span>Lead: {phase.phaseLeadName}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-muted-foreground">No phases found for this project.</p>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center p-4">
                    <p className="text-muted-foreground">Activity logging will be added soon.</p>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Team Leads</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingMembers ? (
                    <div className="flex justify-center">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {members?.filter(m => 
                        m.role === 'project_manager' || m.role === 'phase_lead'
                      ).map(member => (
                        <div key={member.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>
                                {getInitials(member.userName || 'User')}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">{member.userName}</p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {member.role.replace('_', ' ')}
                              </p>
                            </div>
                          </div>
                          <Badge 
                            variant="outline" 
                            className={getRoleColor(member.role)}
                          >
                            {member.role === 'project_manager' ? 'PM' : 'Lead'}
                          </Badge>
                        </div>
                      ))}
                      {members?.filter(m => 
                        m.role === 'project_manager' || m.role === 'phase_lead'
                      ).length === 0 && (
                        <p className="text-sm text-muted-foreground text-center">
                          No project leaders assigned
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="phases">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Project Phases</CardTitle>
                <CardDescription>Manage and track project phases</CardDescription>
              </div>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" /> Add Phase
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingPhases ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : phases?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Phase</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Timeline</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Deliverables</TableHead>
                      <TableHead>Tasks</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {phases.map((phase) => (
                      <TableRow key={phase.id}>
                        <TableCell className="font-medium">
                          <div>
                            <p>{phase.name}</p>
                            <p className="text-xs text-muted-foreground">{phase.description}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={getStatusBadgeColor(phase.status)}
                          >
                            {phase.status.charAt(0).toUpperCase() + phase.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{formatDate(phase.startDate)}</div>
                            <div className="text-muted-foreground">to</div>
                            <div>{formatDate(phase.targetEndDate)}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {phase.phaseLeadName ? (
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-xs">
                                  {getInitials(phase.phaseLeadName)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm">{phase.phaseLeadName}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Not assigned</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {phase.deliverableCount || 0}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {phase.taskCount || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">View</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center p-8 border rounded-lg">
                  <p className="text-muted-foreground">No phases found for this project.</p>
                  <Button className="mt-4">Add first phase</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="team">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Project Team</CardTitle>
                <CardDescription>Manage team members and their roles</CardDescription>
              </div>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" /> Add Team Member
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingMembers ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : members?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead>Phase</TableHead>
                      <TableHead>Tasks</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>
                                {getInitials(member.userName || 'User')}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{member.userName}</p>
                              <p className="text-xs text-muted-foreground">{member.userEmail}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={getRoleColor(member.role)}
                          >
                            {member.role.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(member.assignedDate)}</TableCell>
                        <TableCell>
                          {member.phaseName ? (
                            <span>{member.phaseName}</span>
                          ) : (
                            <span className="text-muted-foreground text-sm">All phases</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {member.assignedTaskCount || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">Edit</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center p-8 border rounded-lg">
                  <p className="text-muted-foreground">No team members added to this project.</p>
                  <Button className="mt-4">Add first team member</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="tasks">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Project Tasks</CardTitle>
                <CardDescription>Manage and track project tasks</CardDescription>
              </div>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" /> Add Task
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingTasks ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : tasks?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead>Phase</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium">
                          <div>
                            <p>{task.title}</p>
                            <p className="text-xs text-muted-foreground">{task.description}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {task.assigneeName ? (
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-xs">
                                  {getInitials(task.assigneeName)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm">{task.assigneeName}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell>{task.phaseName || 'General'}</TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={getStatusBadgeColor(task.status)}
                          >
                            {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(task.dueDate)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">View</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center p-8 border rounded-lg">
                  <p className="text-muted-foreground">No tasks added to this project.</p>
                  <Button className="mt-4">Add first task</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="details">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Project Items</CardTitle>
                <CardDescription>Manage items for this project</CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setIsItemsImportOpen(true)}
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Import Project Items
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingItems ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : projectItems?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Code</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Specification</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>UOM</TableHead>
                      <TableHead>Make</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.itemCode}</TableCell>
                        <TableCell>{item.description}</TableCell>
                        <TableCell>{item.specification || '-'}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{item.uom}</TableCell>
                        <TableCell>{item.make || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {item.sourceType || 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">Edit</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center p-8 border rounded-lg">
                  <Boxes className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No items found for this project.</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    You can import items from an Excel file or add them manually.
                  </p>
                  <Button 
                    onClick={() => setIsItemsImportOpen(true)}
                    className="mr-2"
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-2" /> Import Items
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          <ProjectItemsImport 
            open={isItemsImportOpen}
            onOpenChange={setIsItemsImportOpen}
            projectId={project.id} // Use the numeric project.id instead of URL param
            projectCode={project.code}
            onImportComplete={() => {
              // Refetch project items after import is completed
              queryClient.invalidateQueries([`/api/projects/${projectId}/items`]);
              toast({
                title: "Items imported successfully",
                description: "The project items have been updated.",
              });
            }}
          />
        </TabsContent>
        
        <TabsContent value="documents">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Project Documents</CardTitle>
                <CardDescription>Manage project documents and files</CardDescription>
              </div>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" /> Upload Document
              </Button>
            </CardHeader>
            <CardContent>
              <div className="text-center p-8 border rounded-lg">
                <p className="text-muted-foreground">Document management will be implemented in a future update.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}