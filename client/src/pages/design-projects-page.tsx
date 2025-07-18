import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Filter, Eye, Edit, Trash2, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";

// Form schema
const designProjectSchema = z.object({
  projectId: z.number().min(1, "Project is required"),
  designProjectName: z.string().min(1, "Design project name is required"),
  description: z.string().optional(),
  designPhase: z.string().min(1, "Design phase is required"),
  status: z.string().min(1, "Status is required"),
  designManagerId: z.number().min(1, "Design manager is required"),
  startDate: z.string().optional(),
  targetEndDate: z.string().optional(),
  clientApprovalRequired: z.boolean().default(false),
  clientContactInfo: z.string().optional(),
  overallProgress: z.number().min(0).max(100).default(0),
});

type DesignProjectForm = z.infer<typeof designProjectSchema>;

const designPhases = [
  "Conceptual",
  "Preliminary", 
  "Detailed",
  "Final",
  "As-Built"
];

const designStatuses = [
  "Draft",
  "In Progress",
  "Under Review", 
  "Approved",
  "On Hold",
  "Cancelled",
  "Completed"
];

export default function DesignProjectsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch design projects
  const { data: designProjects = [], isLoading } = useQuery({
    queryKey: ["/api/design-projects", { 
      search, 
      status: statusFilter === "all" ? "" : statusFilter, 
      designPhase: phaseFilter === "all" ? "" : phaseFilter,
      projectId: projectFilter === "all" ? "" : projectFilter
    }],
  });

  // Fetch projects for dropdown
  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
  });

  // Fetch users for design manager dropdown
  const { data: users = [] } = useQuery({
    queryKey: ["/api/users"],
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: DesignProjectForm) => apiRequest("/api/design-projects", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/design-projects"] });
      setShowCreateDialog(false);
      toast({ title: "Design project created successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error creating design project", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: DesignProjectForm }) => 
      apiRequest(`/api/design-projects/${id}`, "PUT", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/design-projects"] });
      setEditingProject(null);
      toast({ title: "Design project updated successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error updating design project", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/design-projects/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/design-projects"] });
      toast({ title: "Design project deleted successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error deleting design project", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const form = useForm<DesignProjectForm>({
    resolver: zodResolver(designProjectSchema),
    defaultValues: {
      projectId: 0,
      designProjectName: "",
      description: "",
      designPhase: "",
      status: "Draft",
      designManagerId: 0,
      startDate: "",
      targetEndDate: "",
      clientApprovalRequired: false,
      clientContactInfo: "",
      overallProgress: 0,
    },
  });

  const onSubmit = (data: DesignProjectForm) => {
    if (editingProject) {
      updateMutation.mutate({ id: editingProject.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openEditDialog = (project: any) => {
    setEditingProject(project);
    form.reset({
      projectId: project.projectId,
      designProjectName: project.designProjectName,
      description: project.description || "",
      designPhase: project.designPhase,
      status: project.status,
      designManagerId: project.designManagerId,
      startDate: project.startDate || "",
      targetEndDate: project.targetEndDate || "",
      clientApprovalRequired: project.clientApprovalRequired,
      clientContactInfo: project.clientContactInfo || "",
      overallProgress: project.overallProgress,
    });
    setShowCreateDialog(true);
  };

  const resetForm = () => {
    setEditingProject(null);
    form.reset({
      projectId: 0,
      designProjectName: "",
      description: "",
      designPhase: "",
      status: "Draft",
      designManagerId: 0,
      startDate: "",
      targetEndDate: "",
      clientApprovalRequired: false,
      clientContactInfo: "",
      overallProgress: 0,
    });
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "Completed": return "bg-green-100 text-green-800";
      case "In Progress": return "bg-blue-100 text-blue-800";
      case "Under Review": return "bg-yellow-100 text-yellow-800";
      case "On Hold": return "bg-gray-100 text-gray-800";
      case "Cancelled": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getPhaseBadgeColor = (phase: string) => {
    switch (phase) {
      case "Conceptual": return "bg-purple-100 text-purple-800";
      case "Preliminary": return "bg-blue-100 text-blue-800";
      case "Detailed": return "bg-orange-100 text-orange-800";
      case "Final": return "bg-green-100 text-green-800";
      case "As-Built": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Design Projects</h2>
          <p className="text-muted-foreground">
            Manage design projects linked to active business projects
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Design Project
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingProject ? "Edit Design Project" : "Create New Design Project"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="projectId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Linked Project *</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        value={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a project" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {projects.map((project: any) => (
                            <SelectItem key={project.id} value={project.id.toString()}>
                              {project.projectCode} - {project.projectName}
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
                  name="designProjectName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Design Project Name *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter design project name" />
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
                        <Textarea {...field} placeholder="Enter project description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="designPhase"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Design Phase *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select phase" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {designPhases.map((phase) => (
                              <SelectItem key={phase} value={phase}>
                                {phase}
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
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {designStatuses.map((status) => (
                              <SelectItem key={status} value={status}>
                                {status}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="designManagerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Design Manager *</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        value={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select design manager" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {users.map((user: any) => (
                            <SelectItem key={user.id} value={user.id.toString()}>
                              {user.firstName && user.lastName 
                                ? `${user.firstName} ${user.lastName}` 
                                : user.username}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
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
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="overallProgress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Overall Progress (%)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min="0" 
                          max="100" 
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2 pt-4">
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {editingProject ? "Update" : "Create"} Design Project
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowCreateDialog(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search by name, description, or project code..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="project-filter">Project</Label>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((project: any) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.projectCode} - {project.projectName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="status-filter">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {designStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="phase-filter">Phase</Label>
              <Select value={phaseFilter} onValueChange={setPhaseFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Phases" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Phases</SelectItem>
                  {designPhases.map((phase) => (
                    <SelectItem key={phase} value={phase}>
                      {phase}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Design Projects Table */}
      <Card>
        <CardHeader>
          <CardTitle>Design Projects ({designProjects.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-4">Loading design projects...</div>
          ) : designProjects.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No design projects found. Create your first design project to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Design Project</TableHead>
                  <TableHead>Linked Project</TableHead>
                  <TableHead>Phase</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Design Manager</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>Target End</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {designProjects.map((project: any) => (
                  <TableRow key={project.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{project.designProjectName}</div>
                        {project.description && (
                          <div className="text-sm text-muted-foreground truncate max-w-xs">
                            {project.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-medium">{project.projectCode}</div>
                          <div className="text-sm text-muted-foreground">
                            {project.projectName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {project.customerName}
                          </div>
                        </div>
                        <Link href={`/projects/${project.projectId}`}>
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getPhaseBadgeColor(project.designPhase)}>
                        {project.designPhase}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusBadgeColor(project.status)}>
                        {project.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {project.designManagerFirstName && project.designManagerLastName
                        ? `${project.designManagerFirstName} ${project.designManagerLastName}`
                        : project.designManagerName}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-200 rounded-full">
                          <div 
                            className="h-2 bg-blue-500 rounded-full" 
                            style={{ width: `${project.overallProgress}%` }}
                          />
                        </div>
                        <span className="text-sm">{project.overallProgress}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {project.startDate && format(new Date(project.startDate), "MMM dd, yyyy")}
                    </TableCell>
                    <TableCell>
                      {project.targetEndDate && format(new Date(project.targetEndDate), "MMM dd, yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(project)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this design project?")) {
                              deleteMutation.mutate(project.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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
}