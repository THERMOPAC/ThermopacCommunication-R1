import { useState, useEffect, useMemo } from "react";
import { fmtDate } from "@/lib/date-format";
import { getProjectDisplayName } from "@/lib/project-utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Loader2, Package, Building2, Calendar, User, Edit, Save, Search,
  ArrowRight, Plus, ChevronDown, ChevronRight, Briefcase,
  Clock, CheckCircle2, PauseCircle, XCircle, AlertTriangle,
  FolderKanban, Hash, Wrench, ShoppingCart, BarChart3, ExternalLink,
  FlaskConical, EyeOff,
} from "lucide-react";
import Layout from "@/components/layout";
import { Helmet } from "react-helmet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useTestDataToggle } from "@/hooks/use-test-data-toggle";

interface Project {
  id: number;
  projectName: string;
  projectCode: string;
  customerName: string;
  customerId: number;
  status: string;
  startDate: string;
  targetEndDate: string;
  description: string;
  projectType?: string;
  priority?: string;
  // Governance v1 fields
  shortDescription?: string;
  projectDisplayName?: string;
}

interface ProjectItem {
  id: number;
  projectId: number;
  itemId: number;
  quantity: number;
  status: string;
  estimatedCost?: number;
  actualCost?: number;
  notes?: string;
  masterItem?: {
    id: number;
    itemCode: string;
    description: string;
    specification: string;
    uom: string;
    makeOrBuy: string;
    supplier: string;
  };
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; icon: any }> = {
  planning: { label: "Planning", bg: "bg-slate-100 text-slate-700 border-slate-300", icon: Clock },
  active: { label: "Active", bg: "bg-emerald-100 text-emerald-800 border-emerald-300", icon: CheckCircle2 },
  on_hold: { label: "On Hold", bg: "bg-amber-100 text-amber-800 border-amber-300", icon: PauseCircle },
  completed: { label: "Completed", bg: "bg-blue-100 text-blue-800 border-blue-300", icon: CheckCircle2 },
  canceled: { label: "Cancelled", bg: "bg-red-100 text-red-800 border-red-300", icon: XCircle },
  cancelled: { label: "Cancelled", bg: "bg-red-100 text-red-800 border-red-300", icon: XCircle },
};

const ITEM_STATUS_CONFIG: Record<string, string> = {
  "not started": "bg-gray-100 text-gray-700 border-gray-300",
  "in progress": "bg-blue-100 text-blue-700 border-blue-300",
  "active": "bg-emerald-100 text-emerald-700 border-emerald-300",
  "completed": "bg-green-100 text-green-800 border-green-300",
  "on hold": "bg-amber-100 text-amber-700 border-amber-300",
  "on_hold": "bg-amber-100 text-amber-700 border-amber-300",
  "canceled": "bg-red-100 text-red-700 border-red-300",
  "under construction": "bg-orange-100 text-orange-700 border-orange-300",
  "drawing received": "bg-indigo-100 text-indigo-700 border-indigo-300",
  "material received": "bg-teal-100 text-teal-700 border-teal-300",
};

const PRIORITY_CONFIG: Record<string, string> = {
  High: "bg-red-50 text-red-700 border-red-200",
  Medium: "bg-amber-50 text-amber-700 border-amber-200",
  Low: "bg-green-50 text-green-700 border-green-200",
};

export default function ProjectsPage() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProjectItem | null>(null);
  const [editProjectId, setEditProjectId] = useState<number | null>(null);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ quantity: "", estimatedCost: "", actualCost: "", notes: "", status: "" });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isSuperuser = user?.role === 'Superuser';
  const { showTestData, toggle: toggleTestData } = useTestDataToggle();

  const getIndianFinancialYear = () => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const startYear = month >= 3 ? year : year - 1;
    const endYear = startYear + 1;
    return `${String(startYear).slice(2)}${String(endYear).slice(2)}`;
  };
  const currentFY = getIndianFinancialYear();

  const [newProjectData, setNewProjectData] = useState({
    name: "", description: "", code: "", customerId: "", projectType: "",
    financialYear: currentFY, startDate: new Date().toISOString().split("T")[0],
    targetEndDate: "", durationMonths: "", priority: "Medium", status: "planning",
    mdmt: "",
    electricalVoltage: "", electricalFrequency: "", electricalPhase: "",
    shortDescription: "",
  });

  const { data: customers } = useQuery<{ id: number; bpName: string; bpCode: string }[]>({
    queryKey: ["/api/customers"],
  });

  const { data: nextCodeData, isFetching: codeFetching } = useQuery<{ nextCode: string }>({
    queryKey: ["/api/projects/next-code", currentFY],
    queryFn: async () => {
      const res = await fetch(`/api/projects/next-code/${encodeURIComponent(currentFY)}`);
      if (!res.ok) throw new Error("Failed to fetch next code");
      return res.json();
    },
    enabled: newProjectDialogOpen,
  });

  useEffect(() => {
    if (nextCodeData?.nextCode && newProjectDialogOpen) {
      setNewProjectData(d => ({ ...d, code: nextCodeData.nextCode }));
    }
  }, [nextCodeData, newProjectDialogOpen]);

  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/design/projects", { showTest: showTestData }],
    queryFn: () => fetch(`/api/design/projects?showTest=${showTestData}`, { credentials: 'include' }).then(r => r.json()),
  });

  const testFlagMutation = useMutation({
    mutationFn: async ({ id, isTest }: { id: number; isTest: boolean }) => {
      const res = await apiRequest('PATCH', `/api/projects/${id}/test-flag`, { isTest });
      return res.json();
    },
    onSuccess: (_data, { isTest }) => {
      toast({ title: isTest ? 'Marked as test data' : 'Unmarked from test data' });
      queryClient.invalidateQueries({ queryKey: ['/api/design/projects'] });
    },
    onError: (err: any) => {
      toast({ title: 'Failed to update test flag', description: err?.message || 'Unknown error', variant: 'destructive' });
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: typeof newProjectData) => {
      const payload = { ...data, customerId: data.customerId ? parseInt(data.customerId) : undefined };
      return await apiRequest("POST", "/api/projects", payload);
    },
    onSuccess: () => {
      toast({ title: "Project created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/design/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/next-code", currentFY] });
      setNewProjectDialogOpen(false);
      setNewProjectData({
        name: "", description: "", code: "", customerId: "", projectType: "",
        financialYear: currentFY, startDate: new Date().toISOString().split("T")[0],
        targetEndDate: "", durationMonths: "", priority: "Medium", status: "planning",
        mdmt: "",
        electricalVoltage: "", electricalFrequency: "", electricalPhase: "",
        shortDescription: "",
      });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create project", description: error.message, variant: "destructive" });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async (data: { id: number; updates: any }) => {
      const response = await fetch(`/api/project-items/${data.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.updates),
      });
      if (!response.ok) throw new Error("Failed to update project item");
      return response.json();
    },
    onSuccess: () => {
      if (editProjectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", editProjectId, "items"] });
      }
      toast({ title: "Project item updated successfully" });
      setEditDialogOpen(false);
      setEditingItem(null);
    },
    onError: () => {
      toast({ title: "Failed to update project item", variant: "destructive" });
    },
  });

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    return projects.filter(p => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          p.projectName?.toLowerCase().includes(q) ||
          p.projectCode?.toLowerCase().includes(q) ||
          p.customerName?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [projects, statusFilter, searchQuery]);

  const summaryStats = useMemo(() => {
    if (!projects) return { total: 0, planning: 0, active: 0, onHold: 0, completed: 0, cancelled: 0 };
    return {
      total: projects.length,
      planning: projects.filter(p => p.status === "planning").length,
      active: projects.filter(p => p.status === "active").length,
      onHold: projects.filter(p => p.status === "on_hold").length,
      completed: projects.filter(p => p.status === "completed").length,
      cancelled: projects.filter(p => p.status === "canceled" || p.status === "canceled").length,
    };
  }, [projects]);

  const toggleRow = (id: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleEditClick = (item: ProjectItem, projectId: number) => {
    setEditingItem(item);
    setEditProjectId(projectId);
    setFormData({
      quantity: item.quantity.toString(),
      estimatedCost: item.estimatedCost?.toString() || "",
      actualCost: item.actualCost?.toString() || "",
      notes: item.notes || "",
      status: item.status || "Not Started",
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    updateItemMutation.mutate({
      id: editingItem.id,
      updates: {
        quantity: parseFloat(formData.quantity) || 0,
        estimatedCost: formData.estimatedCost ? parseFloat(formData.estimatedCost) : null,
        actualCost: formData.actualCost ? parseFloat(formData.actualCost) : null,
        notes: formData.notes,
        status: formData.status,
      },
    });
  };

  const formatDate = (d: string) => {
    if (!d) return "—";
    return fmtDate(d);
  };

  const getDaysRemaining = (endDate: string) => {
    if (!endDate) return null;
    const diff = Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <Layout>
      <Helmet>
        <title>Projects | THERMOPAC QMS</title>
      </Helmet>
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-primary" /> Projects
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Manage projects, items, and assignments</p>
          </div>
          <div className="flex items-center gap-2">
            {isSuperuser && (
              <Button
                variant={showTestData ? "secondary" : "outline"}
                size="sm"
                onClick={toggleTestData}
                title={showTestData ? "Hide test data" : "Show test data"}
                className={showTestData ? "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200 text-xs h-8" : "text-xs h-8"}
              >
                {showTestData ? <EyeOff className="mr-1 h-3 w-3" /> : <FlaskConical className="mr-1 h-3 w-3" />}
                {showTestData ? "Hide Test" : "Show Test"}
              </Button>
            )}
            <Button size="sm" onClick={() => setNewProjectDialogOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New Project
            </Button>
          </div>
        </div>
        {isSuperuser && showTestData && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
            <FlaskConical className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Test data is visible. Click the flask icon on any project row to toggle its test status.</span>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { label: "Total", value: summaryStats.total, color: "", icon: Briefcase },
            { label: "Planning", value: summaryStats.planning, color: "text-slate-600", icon: Clock },
            { label: "Active", value: summaryStats.active, color: "text-emerald-600", icon: CheckCircle2 },
            { label: "On Hold", value: summaryStats.onHold, color: "text-amber-600", icon: PauseCircle },
            { label: "Completed", value: summaryStats.completed, color: "text-blue-600", icon: CheckCircle2 },
            { label: "Cancelled", value: summaryStats.cancelled, color: "text-red-600", icon: XCircle },
          ].map(({ label, value, color, icon: Icon }) => (
            <Card key={label} className="shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => {
              const filterMap: Record<string, string> = { Total: "all", Planning: "planning", Active: "active", "On Hold": "on_hold", Completed: "completed", Cancelled: "canceled" };
              setStatusFilter(filterMap[label] || "all");
            }}>
              <CardContent className="pt-2.5 pb-2 px-3">
                <div className="flex items-center justify-between">
                  <Icon className={`h-4 w-4 ${color || "text-muted-foreground"}`} />
                  <span className={`text-lg font-bold ${color}`}>{value}</span>
                </div>
                <div className="text-[9px] text-muted-foreground mt-0.5">{label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="pt-3 pb-2">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by name, code, or customer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="canceled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              {(searchQuery || statusFilter !== "all") && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setSearchQuery(""); setStatusFilter("all"); }}>
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {projectsLoading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground mt-2">Loading projects...</p>
            </CardContent>
          </Card>
        ) : filteredProjects.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="text-lg font-medium">No Projects Found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {projects?.length === 0 ? "Create your first project to get started." : "No projects match the current filters."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <TooltipProvider>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-6 px-1"></TableHead>
                        <TableHead className="text-[10px] font-semibold min-w-[180px]">Code</TableHead>
                        <TableHead className="text-[10px] font-semibold min-w-[200px]">Project Name</TableHead>
                        <TableHead className="text-[10px] font-semibold min-w-[120px]">Customer</TableHead>
                        <TableHead className="text-[10px] font-semibold text-center w-[80px]">Status</TableHead>
                        <TableHead className="text-[10px] font-semibold text-center w-[80px]">Priority</TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[80px]">Start</TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[80px]">End</TableHead>
                        <TableHead className="text-[10px] font-semibold text-center w-[80px]">Timeline</TableHead>
                        <TableHead className="text-[10px] font-semibold text-center w-[60px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProjects.map((project) => {
                        const isExpanded = expandedRows.has(project.id);
                        const statusCfg = STATUS_CONFIG[project.status] || STATUS_CONFIG.planning;
                        const StatusIcon = statusCfg.icon;
                        const daysRemaining = getDaysRemaining(project.targetEndDate);
                        const isOverdue = daysRemaining !== null && daysRemaining < 0 && project.status !== "completed" && project.status !== "canceled" && project.status !== "canceled";

                        return (
                          <TooltipProvider key={project.id}>
                            <TableRow
                              className={`cursor-pointer hover:bg-muted/30 transition-colors ${isExpanded ? "bg-muted/20" : ""} ${isOverdue ? "bg-red-50/30" : ""}`}
                              onClick={() => toggleRow(project.id)}
                            >
                              <TableCell className="px-1">
                                {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                              </TableCell>
                              <TableCell className="text-[10px] font-mono font-medium text-primary">
                                {project.projectCode}
                                {(project as any).isTest && (
                                  <Badge className="ml-1 text-[9px] px-1 py-0 bg-amber-100 text-amber-800 border border-amber-300">
                                    <FlaskConical className="inline h-2 w-2 mr-0.5" />Test
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="text-[11px] font-medium truncate max-w-[280px]" title={getProjectDisplayName(project)}>{getProjectDisplayName(project)}</div>
                                {project.projectType && <div className="text-[9px] text-muted-foreground">{project.projectType}</div>}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Building2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  <span className="text-[10px] truncate max-w-[120px]">{project.customerName}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className={`text-[9px] px-1.5 py-0 gap-0.5 ${statusCfg.bg}`}>
                                  <StatusIcon className="h-2.5 w-2.5" />
                                  {statusCfg.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                {project.priority && (
                                  <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${PRIORITY_CONFIG[project.priority] || ""}`}>
                                    {project.priority}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-center text-[10px] text-muted-foreground">{formatDate(project.startDate)}</TableCell>
                              <TableCell className="text-center text-[10px] text-muted-foreground">{formatDate(project.targetEndDate)}</TableCell>
                              <TableCell className="text-center">
                                {daysRemaining !== null && project.status !== "completed" && project.status !== "canceled" && project.status !== "canceled" ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${isOverdue ? "bg-red-100 text-red-700 border-red-300" : daysRemaining <= 30 ? "bg-amber-100 text-amber-700 border-amber-300" : "bg-green-100 text-green-700 border-green-300"}`}>
                                        {isOverdue ? `${Math.abs(daysRemaining)}d late` : `${daysRemaining}d left`}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-[10px]">
                                      Target: {formatDate(project.targetEndDate)}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : project.status === "completed" ? (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 bg-blue-50 text-blue-600 border-blue-200">Done</Badge>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-center gap-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => navigate(`/projects/${project.id}`)}>
                                        <ExternalLink className="h-3 w-3" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-[10px]">View Details</TooltipContent>
                                  </Tooltip>
                                  {isSuperuser && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost" size="icon"
                                          className={`h-6 w-6 ${(project as any).isTest ? "text-amber-600" : "text-muted-foreground opacity-30 hover:opacity-100"}`}
                                          onClick={() => testFlagMutation.mutate({ id: project.id, isTest: !(project as any).isTest })}
                                          disabled={testFlagMutation.isPending}
                                        >
                                          <FlaskConical className="h-3 w-3" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-[10px]">
                                        {(project as any).isTest ? "Unmark as test" : "Mark as test"}
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                            {isExpanded && <ExpandedProjectRow project={project} onEditItem={(item) => handleEditClick(item, project.id)} />}
                          </TooltipProvider>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TooltipProvider>
              </div>
            </CardContent>
          </Card>
        )}

        <Dialog open={newProjectDialogOpen} onOpenChange={setNewProjectDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
              <DialogDescription>Fill in the details to create a new project. Default phases will be created automatically.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select Customer *</Label>
                <Select value={newProjectData.customerId} onValueChange={(v) => {
                  setNewProjectData(d => ({ ...d, customerId: v }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Choose a customer..." /></SelectTrigger>
                  <SelectContent>
                    {customers && customers.length > 0 ? (
                      customers.map((c) => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.bpName} ({c.bpCode})</SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>No customers available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Short Description * <span className="text-xs text-muted-foreground font-normal">(e.g. "Used Engine Oil Refinery")</span></Label>
                <Input
                  value={newProjectData.shortDescription}
                  onChange={(e) => setNewProjectData(d => ({ ...d, shortDescription: e.target.value, name: e.target.value }))}
                  placeholder="Concise project title — becomes part of the canonical name"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Project Display Name (auto-computed)</Label>
                <div className="rounded-md border bg-muted/50 px-3 py-2 text-xs font-mono text-slate-700">
                  {[
                    newProjectData.code || '…',
                    customers?.find(c => c.id.toString() === newProjectData.customerId)?.bpName || '…',
                    newProjectData.shortDescription || '…',
                  ].join(' \u2014 ')}
                </div>
                <p className="text-[10px] text-muted-foreground">Format: Code — Customer — Short Description</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Project Code *</Label>
                  <Input value={codeFetching ? "Loading..." : newProjectData.code} readOnly className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label>Financial Year *</Label>
                  <Input value={newProjectData.financialYear} readOnly className="bg-muted" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Project Type *</Label>
                <Select value={newProjectData.projectType} onValueChange={(v) => setNewProjectData(d => ({ ...d, projectType: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select project type..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CPS System">CPS System</SelectItem>
                    <SelectItem value="Equipment">Equipment</SelectItem>
                    <SelectItem value="Grease Plant">Grease Plant</SelectItem>
                    <SelectItem value="Lube Blending Plant">Lube Blending Plant</SelectItem>
                    <SelectItem value="Re-refining Plant">Re-refining Plant</SelectItem>
                    <SelectItem value="Spares">Spares</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description *</Label>
                <Textarea value={newProjectData.description} onChange={(e) => setNewProjectData(d => ({ ...d, description: e.target.value }))} placeholder="Brief project description" rows={2} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Start Date *</Label>
                  <Input type="date" value={newProjectData.startDate} onChange={(e) => {
                    const startDate = e.target.value;
                    setNewProjectData(d => {
                      if (d.durationMonths && startDate) {
                        const start = new Date(startDate);
                        start.setMonth(start.getMonth() + parseInt(d.durationMonths));
                        start.setDate(start.getDate() - 1);
                        return { ...d, startDate, targetEndDate: start.toISOString().split("T")[0] };
                      }
                      return { ...d, startDate };
                    });
                  }} />
                </div>
                <div className="space-y-2">
                  <Label>Duration (Months) *</Label>
                  <Input type="number" min="1" max="60" placeholder="e.g. 12" value={newProjectData.durationMonths} onChange={(e) => {
                    const months = e.target.value;
                    setNewProjectData(d => {
                      if (months && d.startDate) {
                        const start = new Date(d.startDate);
                        start.setMonth(start.getMonth() + parseInt(months));
                        start.setDate(start.getDate() - 1);
                        return { ...d, durationMonths: months, targetEndDate: start.toISOString().split("T")[0] };
                      }
                      return { ...d, durationMonths: months, targetEndDate: "" };
                    });
                  }} />
                </div>
                <div className="space-y-2">
                  <Label>Target End Date</Label>
                  <Input type="date" value={newProjectData.targetEndDate} onChange={(e) => setNewProjectData(d => ({ ...d, targetEndDate: e.target.value, durationMonths: "" }))} />
                  <p className="text-xs text-muted-foreground">Auto-calculated from duration</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={newProjectData.priority} onValueChange={(v) => setNewProjectData(d => ({ ...d, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>MDMT (Minimum Design Metal Temperature)</Label>
                <Select value={newProjectData.mdmt} onValueChange={(v) => setNewProjectData(d => ({ ...d, mdmt: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select MDMT…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-29 Deg °C">-29 Deg °C</SelectItem>
                    <SelectItem value="0 Deg °C">0 Deg °C</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border rounded-md p-3 space-y-3 bg-muted/30">
              <p className="text-[11px] font-semibold text-primary uppercase tracking-wide">
                ⚡ Electrical Standards
              </p>
              <p className="text-xs text-muted-foreground">
                Auto-applied to motors and panels when buy lists are created from templates.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Voltage (V)</Label>
                  <Select value={newProjectData.electricalVoltage} onValueChange={(v) => setNewProjectData(d => ({ ...d, electricalVoltage: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="380">380 V</SelectItem>
                      <SelectItem value="415">415 V</SelectItem>
                      <SelectItem value="440">440 V</SelectItem>
                      <SelectItem value="480">480 V</SelectItem>
                      <SelectItem value="690">690 V</SelectItem>
                      <SelectItem value="240">240 V</SelectItem>
                      <SelectItem value="110">110 V</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Frequency (Hz)</Label>
                  <Select value={newProjectData.electricalFrequency} onValueChange={(v) => setNewProjectData(d => ({ ...d, electricalFrequency: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="50">50 Hz</SelectItem>
                      <SelectItem value="60">60 Hz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phase</Label>
                  <Select value={newProjectData.electricalPhase} onValueChange={(v) => setNewProjectData(d => ({ ...d, electricalPhase: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3Ph">3 Phase</SelectItem>
                      <SelectItem value="1Ph">1 Phase</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setNewProjectDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => createProjectMutation.mutate(newProjectData)}
                disabled={createProjectMutation.isPending || !newProjectData.customerId || !newProjectData.shortDescription || !newProjectData.code || !newProjectData.projectType || !newProjectData.description || !newProjectData.startDate || !newProjectData.targetEndDate}
              >
                {createProjectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Project
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Project Item</DialogTitle>
              <DialogDescription>Update details for this project item.</DialogDescription>
            </DialogHeader>
            {editingItem && (
              <div className="space-y-3 py-2">
                <div className="bg-muted/50 rounded-md p-2.5 space-y-1">
                  <div className="text-[10px] text-muted-foreground">Item</div>
                  <div className="text-sm font-medium">{editingItem.masterItem?.itemCode} — {editingItem.masterItem?.description}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Quantity *</Label>
                    <Input type="number" value={formData.quantity} onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Status</Label>
                    <Select value={formData.status} onValueChange={(v) => setFormData(prev => ({ ...prev, status: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Not Started">Not Started</SelectItem>
                        <SelectItem value="In Progress">In Progress</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                        <SelectItem value="On Hold">On Hold</SelectItem>
                        <SelectItem value="Cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Estimated Cost</Label>
                    <Input type="number" value={formData.estimatedCost} onChange={(e) => setFormData(prev => ({ ...prev, estimatedCost: e.target.value }))} className="h-8 text-sm" placeholder="₹" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Actual Cost</Label>
                    <Input type="number" value={formData.actualCost} onChange={(e) => setFormData(prev => ({ ...prev, actualCost: e.target.value }))} className="h-8 text-sm" placeholder="₹" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Notes</Label>
                  <Textarea value={formData.notes} onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))} rows={2} className="text-sm" />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSaveEdit} disabled={updateItemMutation.isPending || !formData.quantity}>
                {updateItemMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

function ExpandedProjectRow({ project, onEditItem }: { project: Project; onEditItem: (item: ProjectItem) => void }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [itemSearch, setItemSearch] = useState("");

  const { data: projectItems, isLoading } = useQuery<ProjectItem[]>({
    queryKey: ["/api/projects", project.id, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/items`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: virtualComponents } = useQuery<any[]>({
    queryKey: ["/api/projects", project.id, "virtual-components"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/virtual-components`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const filteredItems = useMemo(() => {
    if (!projectItems) return [];
    if (!itemSearch) return projectItems;
    const q = itemSearch.toLowerCase();
    return projectItems.filter(item =>
      item.masterItem?.itemCode?.toLowerCase().includes(q) ||
      item.masterItem?.description?.toLowerCase().includes(q) ||
      item.masterItem?.makeOrBuy?.toLowerCase().includes(q)
    );
  }, [projectItems, itemSearch]);

  const itemStats = useMemo(() => {
    if (!projectItems) return { total: 0, make: 0, buy: 0, components: 0 };
    return {
      total: projectItems.length,
      make: projectItems.filter(i => i.masterItem?.makeOrBuy?.toLowerCase() === "make").length,
      buy: projectItems.filter(i => i.masterItem?.makeOrBuy?.toLowerCase() === "buy").length,
      components: virtualComponents?.length || 0,
    };
  }, [projectItems, virtualComponents]);

  const handleStatusChange = async (newStatus: string) => {
    try {
      await apiRequest("PUT", `/api/projects/${project.id}`, { status: newStatus });
      queryClient.invalidateQueries({ queryKey: ["/api/design/projects"] });
      toast({ title: "Status updated", description: `Project status changed to ${newStatus}` });
    } catch (err: any) {
      toast({ title: "Failed to update status", description: err.message, variant: "destructive" });
    }
  };

  return (
    <TableRow>
      <TableCell colSpan={10} className="p-0 bg-muted/10">
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              {project.description && <p className="text-xs text-muted-foreground max-w-xl">{project.description}</p>}
              <div className="flex items-center gap-3 mt-1.5">
                <div className="flex items-center gap-3 text-[10px]">
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-0.5 bg-blue-50 text-blue-700 border-blue-200">
                    <Hash className="h-2.5 w-2.5" /> {itemStats.total} items
                  </Badge>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-0.5 bg-violet-50 text-violet-700 border-violet-200">
                    <Wrench className="h-2.5 w-2.5" /> {itemStats.make} Make
                  </Badge>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-0.5 bg-emerald-50 text-emerald-700 border-emerald-200">
                    <ShoppingCart className="h-2.5 w-2.5" /> {itemStats.buy} Buy
                  </Badge>
                  {itemStats.components > 0 && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-0.5 bg-purple-50 text-purple-700 border-purple-200">
                      {itemStats.components} Components
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={project.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[120px] h-7 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="canceled">Canceled</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => navigate(`/projects/${project.id}`)}>
                <ExternalLink className="h-3 w-3" /> Details
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="py-6 text-center">
              <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground mt-1">Loading items...</p>
            </div>
          ) : !projectItems || projectItems.length === 0 ? (
            <div className="py-6 text-center border rounded-md bg-background">
              <Package className="h-8 w-8 mx-auto text-muted-foreground mb-1.5" />
              <p className="text-xs text-muted-foreground">No items in this project yet.</p>
            </div>
          ) : (
            <>
              {projectItems.length > 5 && (
                <div className="relative max-w-xs">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input placeholder="Search items..." value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} className="pl-7 h-7 text-[10px]" />
                </div>
              )}
              <div className="border rounded-md overflow-hidden bg-background">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-[9px] font-semibold w-8"></TableHead>
                      <TableHead className="text-[9px] font-semibold">Item Code</TableHead>
                      <TableHead className="text-[9px] font-semibold">Description</TableHead>
                      <TableHead className="text-[9px] font-semibold text-center w-16">Qty</TableHead>
                      <TableHead className="text-[9px] font-semibold text-center w-14">UOM</TableHead>
                      <TableHead className="text-[9px] font-semibold text-center w-16">Class</TableHead>
                      <TableHead className="text-[9px] font-semibold text-center w-20">Status</TableHead>
                      <TableHead className="text-[9px] font-semibold text-center w-14">Edit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item) => (
                      <TableRow key={item.id} className="hover:bg-muted/20">
                        <TableCell className="px-1">
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => {
                            if (item.masterItem?.id) {
                              sessionStorage.setItem("editMasterItemId", item.masterItem.id.toString());
                              sessionStorage.setItem("returnToPage", "/projects");
                              navigate("/item-master");
                            }
                          }}>
                            <ArrowRight className="h-3 w-3 text-amber-500" />
                          </Button>
                        </TableCell>
                        <TableCell className="text-[10px] font-mono font-medium">{item.masterItem?.itemCode || "—"}</TableCell>
                        <TableCell className="text-[10px] truncate max-w-[200px] text-blue-600 font-medium">{item.masterItem?.description || "—"}</TableCell>
                        <TableCell className="text-[10px] text-center font-mono">{item.quantity?.toLocaleString()}</TableCell>
                        <TableCell className="text-[10px] text-center text-muted-foreground">{item.masterItem?.uom || "—"}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-[8px] px-1 py-0 ${item.masterItem?.makeOrBuy?.toLowerCase() === "buy" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : item.masterItem?.makeOrBuy?.toLowerCase() === "make" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                            {item.masterItem?.makeOrBuy || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-[8px] px-1 py-0 ${ITEM_STATUS_CONFIG[item.status?.toLowerCase()] || "bg-gray-100 text-gray-600 border-gray-300"}`}>
                            {item.status || "Not Started"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onEditItem(item)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
