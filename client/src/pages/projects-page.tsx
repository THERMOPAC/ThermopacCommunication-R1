import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Package, Building2, Calendar, User, Edit, Save, Search, ArrowRight, Plus } from "lucide-react";
import Layout from "@/components/layout";
import { Helmet } from "react-helmet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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

export default function ProjectsPage() {
  const [location, navigate] = useLocation();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProjectItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [keepVisible, setKeepVisible] = useState(false);
  const [formData, setFormData] = useState({
    quantity: "",
    estimatedCost: "",
    actualCost: "",
    notes: "",
    status: ""
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);

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
    name: "",
    description: "",
    code: "",
    customerId: "",
    projectType: "",
    financialYear: currentFY,
    startDate: new Date().toISOString().split("T")[0],
    targetEndDate: "",
    priority: "Medium",
    status: "planning",
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
      setNewProjectData(d => {
        const selected = customers?.find(c => c.id.toString() === d.customerId);
        const autoName = selected ? `${selected.bpName} - ${selected.bpCode} - ${nextCodeData.nextCode}` : d.name;
        return { ...d, code: nextCodeData.nextCode, name: autoName };
      });
    }
  }, [nextCodeData, newProjectDialogOpen, customers]);

  const createProjectMutation = useMutation({
    mutationFn: async (data: typeof newProjectData) => {
      const payload = {
        ...data,
        customerId: data.customerId ? parseInt(data.customerId) : undefined,
      };
      return await apiRequest("POST", "/api/projects", payload);
    },
    onSuccess: (project) => {
      toast({ title: "Project created", description: `Project ${project.code} created successfully.` });
      queryClient.invalidateQueries({ queryKey: ["/api/design/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/next-code", currentFY] });
      setNewProjectDialogOpen(false);
      setNewProjectData({
        name: "", description: "", code: "", customerId: "", projectType: "",
        financialYear: currentFY,
        startDate: new Date().toISOString().split("T")[0],
        targetEndDate: "", priority: "Medium", status: "planning",
      });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create project", description: error.message, variant: "destructive" });
    },
  });

  // Parse URL parameters on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const projectParam = urlParams.get('project');
    const keepParam = urlParams.get('keep');
    
    if (projectParam) {
      setSelectedProjectId(projectParam);
    }
    
    if (keepParam === 'true') {
      setKeepVisible(true);
    }
  }, [location]);

  // Update URL when project filter changes
  const updateURL = (projectId: string, keep: boolean) => {
    const params = new URLSearchParams();
    if (projectId) {
      params.set('project', projectId);
      if (keep) {
        params.set('keep', 'true');
      }
    }
    
    const newUrl = params.toString() ? 
      `/projects?${params.toString()}` : 
      '/projects';
    
    window.history.replaceState({}, '', newUrl);
  };

  // Fetch all projects for the dropdown
  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ['/api/design/projects'],
  });

  // Fetch project items when a project is selected
  const { data: projectItems, isLoading: itemsLoading } = useQuery<ProjectItem[]>({
    queryKey: [`/api/projects/${selectedProjectId}/items`],
    enabled: !!selectedProjectId,
  });

  const selectedProject = projects?.find(p => p.id.toString() === selectedProjectId);

  // Fetch virtual components for the selected project
  const { data: virtualComponents } = useQuery<any[]>({
    queryKey: [`/api/projects/${selectedProjectId}/virtual-components`],
    enabled: !!selectedProjectId,
  });

  // Organize project items hierarchically (including virtual components)
  const organizedProjectItems = React.useMemo(() => {
    if (!projectItems || projectItems.length === 0) return [];

    // All project items are parent assemblies
    const parentAssemblies = projectItems;

    // Sort parent assemblies by item code (descending)
    const sortByItemCode = (a: ProjectItem, b: ProjectItem) => {
      const codeA = a.masterItem?.itemCode || '';
      const codeB = b.masterItem?.itemCode || '';
      return codeB.localeCompare(codeA); // Descending order
    };

    parentAssemblies.sort(sortByItemCode);

    // Create hierarchical structure: each parent followed by its virtual components
    const hierarchicalItems: (ProjectItem & { type?: string, isVirtual?: boolean })[] = [];

    parentAssemblies.forEach((parent: ProjectItem) => {
      // Add the parent assembly
      hierarchicalItems.push({ ...parent, type: 'parent' });

      // Find and add virtual components that belong to this parent
      if (virtualComponents && Array.isArray(virtualComponents)) {
        const relatedVirtualComponents = virtualComponents.filter((component: any) => 
          component.parent_item_id === parent.masterItem?.id
        );

        // Sort virtual components by component code
        relatedVirtualComponents.sort((a: any, b: any) => {
          const codeA = a.component_code || '';
          const codeB = b.component_code || '';
          return codeB.localeCompare(codeA); // Descending order
        });

        // Add virtual components as project items
        relatedVirtualComponents.forEach((component: any) => {
          const virtualItem: ProjectItem & { type?: string, isVirtual?: boolean } = {
            id: component.id + 10000, // Use unique numeric ID for virtual components
            projectId: parent.projectId,
            itemId: component.component_item_id,
            quantity: component.quantity || 1,
            status: 'Active', // Default status for virtual components
            masterItem: {
              id: component.component_item_id,
              itemCode: component.component_code,
              description: component.component_description,
              specification: '',
              uom: component.unit || 'Nos',
              makeOrBuy: 'Make',
              supplier: ''
            },
            type: 'component',
            isVirtual: true
          };
          hierarchicalItems.push(virtualItem);
        });
      }
    });

    return hierarchicalItems;
  }, [projectItems, virtualComponents]);

  // Filter project items based on search query
  const filteredProjectItems = projectItems?.filter(item => {
    if (!searchQuery) return true;
    
    const searchLower = searchQuery.toLowerCase();
    const itemCode = item.masterItem?.itemCode?.toLowerCase() || '';
    const description = item.masterItem?.description?.toLowerCase() || '';
    const status = item.status?.toLowerCase() || '';
    const makeOrBuy = item.masterItem?.makeOrBuy?.toLowerCase() || '';
    
    return itemCode.includes(searchLower) || 
           description.includes(searchLower) || 
           status.includes(searchLower) || 
           makeOrBuy.includes(searchLower);
  });

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'bg-green-500 text-white';
      case 'completed': return 'bg-blue-500 text-white';
      case 'on_hold': 
      case 'on hold': return 'bg-yellow-500 text-black';
      case 'cancelled': 
      case 'canceled': return 'bg-red-500 text-white';
      case 'not started': 
      case 'drawing received':
      case 'material received': return 'bg-gray-500 text-white';
      case 'under construction':
      case 'in progress': return 'bg-orange-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getMakeOrBuyColor = (makeOrBuy: string) => {
    switch (makeOrBuy?.toLowerCase()) {
      case 'make': return 'bg-blue-100 text-blue-800';
      case 'buy': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Mutation for updating project item
  const updateItemMutation = useMutation({
    mutationFn: async (data: { id: number; updates: any }) => {
      const response = await fetch(`/api/project-items/${data.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data.updates),
      });
      if (!response.ok) {
        throw new Error('Failed to update project item');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${selectedProjectId}/items`] });
      toast({
        title: "Success",
        description: "Project item updated successfully",
      });
      setEditDialogOpen(false);
      setEditingItem(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update project item",
        variant: "destructive",
      });
    },
  });

  const handleEditClick = (item: ProjectItem) => {
    setEditingItem(item);
    setFormData({
      quantity: item.quantity.toString(),
      estimatedCost: item.estimatedCost?.toString() || "",
      actualCost: item.actualCost?.toString() || "",
      notes: item.notes || "",
      status: item.status || "Not Started"
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;

    const updates = {
      quantity: parseFloat(formData.quantity) || 0,
      estimatedCost: formData.estimatedCost ? parseFloat(formData.estimatedCost) : null,
      actualCost: formData.actualCost ? parseFloat(formData.actualCost) : null,
      notes: formData.notes,
      status: formData.status
    };

    console.log('🔄 Updating project item:', { id: editingItem.id, updates });
    updateItemMutation.mutate({ id: editingItem.id, updates });
  };

  const handleViewDetails = (project: Project | undefined) => {
    if (!project) return;
    
    if (keepVisible && selectedProjectId) {
      navigate(`/projects/${project.id}?project=${selectedProjectId}&keep=true`);
    } else {
      navigate(`/projects/${project.id}`);
    }
  };

  return (
    <Layout>
      <Helmet>
        <title>Projects | THERMOPAC Communication System</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight pl-4">Projects</h1>
          <Button onClick={() => setNewProjectDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Project
          </Button>
        </div>

        <Dialog open={newProjectDialogOpen} onOpenChange={setNewProjectDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
              <DialogDescription>Fill in the details to create a new project. Default phases will be created automatically.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="np-customer">Select Customer *</Label>
                <Select value={newProjectData.customerId} onValueChange={(v) => {
                  const selected = customers?.find(c => c.id.toString() === v);
                  const autoName = selected ? `${selected.bpName} - ${selected.bpCode} - ${newProjectData.code}` : "";
                  setNewProjectData(d => ({ ...d, customerId: v, name: autoName }));
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customers && customers.length > 0 ? (
                      customers.map((c) => (
                        <SelectItem key={c.id} value={c.id.toString()}>
                          {c.bpName} ({c.bpCode})
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>No customers available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="np-name">Project Name *</Label>
                <Input id="np-name" value={newProjectData.name} readOnly className="bg-muted" placeholder="Auto-populated from Customer + Project Code" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="np-code">Project Code *</Label>
                  <Input id="np-code" value={codeFetching ? "Loading..." : newProjectData.code} readOnly className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="np-fy">Financial Year *</Label>
                  <Input id="np-fy" value={newProjectData.financialYear} readOnly className="bg-muted" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="np-type">Project Type *</Label>
                <Select value={newProjectData.projectType} onValueChange={(v) => setNewProjectData(d => ({ ...d, projectType: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select project type..." />
                  </SelectTrigger>
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
                <Label htmlFor="np-desc">Description *</Label>
                <Textarea id="np-desc" value={newProjectData.description} onChange={(e) => setNewProjectData(d => ({ ...d, description: e.target.value }))} placeholder="Brief project description" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="np-start">Start Date *</Label>
                  <Input id="np-start" type="date" value={newProjectData.startDate} onChange={(e) => setNewProjectData(d => ({ ...d, startDate: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="np-end">Target End Date *</Label>
                  <Input id="np-end" type="date" value={newProjectData.targetEndDate} onChange={(e) => setNewProjectData(d => ({ ...d, targetEndDate: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="np-priority">Priority</Label>
                <Select value={newProjectData.priority} onValueChange={(v) => setNewProjectData(d => ({ ...d, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewProjectDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => createProjectMutation.mutate(newProjectData)}
                disabled={createProjectMutation.isPending || !newProjectData.customerId || !newProjectData.name || !newProjectData.code || !newProjectData.projectType || !newProjectData.description || !newProjectData.startDate || !newProjectData.targetEndDate}
              >
                {createProjectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Project
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Available Projects Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Available Projects
            </CardTitle>
            <CardDescription>
              Select a project from the dropdown to view all associated items
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Project Dropdown */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Select Project</label>
                <Select value={selectedProjectId} onValueChange={(value) => {
                  setSelectedProjectId(value);
                  updateURL(value, keepVisible);
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={projectsLoading ? "Loading projects..." : "Choose a project..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {projectsLoading ? (
                      <SelectItem value="loading" disabled>
                        <div className="flex items-center">
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Loading projects...
                        </div>
                      </SelectItem>
                    ) : !projects || projects.length === 0 ? (
                      <SelectItem value="no-projects" disabled>
                        No projects available
                      </SelectItem>
                    ) : (
                      projects.map((project) => (
                        <SelectItem key={project.id} value={project.id.toString()}>
                          {project.projectName} ({project.projectCode}) – {project.customerName}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Keep Visible checkbox */}
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="keep-visible" 
                  checked={keepVisible}
                  onCheckedChange={(checked) => {
                    const isChecked = checked === true;
                    setKeepVisible(isChecked);
                    updateURL(selectedProjectId, isChecked);
                  }}
                />
                <Label htmlFor="keep-visible" className="text-sm font-medium">
                  Keep Visible
                </Label>
                <span className="text-xs text-gray-500">
                  (Maintain project filter when returning from project detail pages)
                </span>
              </div>
            </div>

            {/* Selected Project Info */}
            {selectedProject && (
              <Card className="bg-blue-50">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <h3 className="font-semibold text-lg">{selectedProject.projectName}</h3>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Building2 className="w-4 h-4" />
                          <span>{selectedProject.customerName}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {new Date(selectedProject.startDate).toLocaleDateString()} - 
                            {selectedProject.targetEndDate ? new Date(selectedProject.targetEndDate).toLocaleDateString() : 'TBD'}
                          </span>
                        </div>
                      </div>
                      {selectedProject.description && (
                        <p className="text-sm text-gray-600 mt-2">{selectedProject.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Select
                        value={selectedProject.status}
                        onValueChange={async (newStatus) => {
                          try {
                            await apiRequest("PUT", `/api/projects/${selectedProject.id}`, { status: newStatus });
                            queryClient.invalidateQueries({ queryKey: ["/api/design/projects"] });
                            toast({ title: "Status updated", description: `Project status changed to ${newStatus}` });
                          } catch (err: any) {
                            toast({ title: "Failed to update status", description: err.message, variant: "destructive" });
                          }
                        }}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="planning">Planning</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="on_hold">On Hold</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="canceled">Canceled</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" onClick={() => handleViewDetails(selectedProject)}>
                        <ArrowRight className="mr-1 h-4 w-4" /> View Details
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Project Items Table */}
            {selectedProjectId && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Project Items</h3>
                  <div className="flex items-center gap-4">
                    {projectItems && (
                      <Badge variant="outline" className="px-3 py-1">
                        {filteredProjectItems?.length || 0} of {projectItems.length} {projectItems.length === 1 ? 'item' : 'items'}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Search Field */}
                {projectItems && projectItems.length > 0 && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search items by code, name, status, or make/buy..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                )}

                {itemsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin mr-2" />
                    <span>Loading project items...</span>
                  </div>
                ) : !projectItems || projectItems.length === 0 ? (
                  <div className="text-center py-12 border rounded-lg">
                    <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Items Found</h3>
                    <p className="text-gray-600">
                      This project doesn't have any items associated with it yet.
                    </p>
                  </div>
                ) : !filteredProjectItems || filteredProjectItems.length === 0 ? (
                  <div className="text-center py-12 border rounded-lg">
                    <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Items Match Your Search</h3>
                    <p className="text-gray-600">
                      Try adjusting your search terms or clear the search to see all items.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setSearchQuery("")}
                      className="mt-4"
                    >
                      Clear Search
                    </Button>
                  </div>
                ) : searchQuery ? (
                  // Show table view when searching
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[4%]"></TableHead>
                          <TableHead>Item Code</TableHead>
                          <TableHead>Item Name</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>UOM</TableHead>
                          <TableHead>Make/Buy</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProjectItems.map((item) => (
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
                                    sessionStorage.setItem('editMasterItemId', item.masterItem.id.toString());
                                    const returnPath = window.location.pathname + window.location.search;
                                    console.log('Storing return path (projects page):', returnPath);
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
                            <TableCell className="font-medium">{item.masterItem?.itemCode || 'N/A'}</TableCell>
                            <TableCell>{item.masterItem?.description || 'N/A'}</TableCell>
                            <TableCell>{item.quantity.toLocaleString()}</TableCell>
                            <TableCell>{item.masterItem?.uom || 'N/A'}</TableCell>
                            <TableCell>
                              <Badge className={getMakeOrBuyColor(item.masterItem?.makeOrBuy || '')}>
                                {item.masterItem?.makeOrBuy || 'N/A'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={getStatusColor(item.status || 'Not Started')}>
                                {item.status || 'Not Started'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEditClick(item)}
                                  className="h-8 w-8 p-0"
                                  title="Edit Item"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  // Show hierarchical card view when not searching
                  <div className="space-y-3">
                    {organizedProjectItems.map((item, index) => {
                      const itemWithType = item as ProjectItem & { type?: string };
                      const isComponent = itemWithType.type === 'component';
                      
                      return (
                        <Card 
                          key={`${item.id}-${index}`} 
                          className={`transition-all duration-200 hover:shadow-md ${
                            isComponent ? 'ml-6 bg-purple-50/30 border-purple-200' : 'bg-green-50/30 border-green-200'
                          }`}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-3">
                                  <Badge className={isComponent ? 'bg-purple-500 hover:bg-purple-600' : 'bg-green-600 hover:bg-green-700'}>
                                    {isComponent ? '🟪 Component' : '🟩 Parent Assembly'}
                                  </Badge>
                                  <span className="font-medium text-gray-900">
                                    {item.masterItem?.itemCode || 'N/A'}
                                  </span>
                                </div>
                                
                                <div className="space-y-1">
                                  <p className="font-medium text-gray-900">
                                    {item.masterItem?.description || 'N/A'}
                                  </p>
                                  
                                  <div className="flex items-center gap-4 text-sm text-gray-600">
                                    <span>Qty: <strong>{item.quantity.toLocaleString()}</strong></span>
                                    <span>Unit: <strong>{item.masterItem?.uom || 'N/A'}</strong></span>
                                    <Badge className={getMakeOrBuyColor(item.masterItem?.makeOrBuy || '')}>
                                      {item.masterItem?.makeOrBuy || 'N/A'}
                                    </Badge>
                                    <Badge className={getStatusColor(item.status || 'Not Started')}>
                                      {item.status || 'Not Started'}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2 ml-4">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    console.log("Navigate to master item:", item);
                                    if (item.masterItem?.id) {
                                      // Store the master item ID and return page in sessionStorage
                                      sessionStorage.setItem('editMasterItemId', item.masterItem.id.toString());
                                      const returnPath = window.location.pathname + window.location.search;
                                      console.log('Storing return path (projects page):', returnPath);
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
                                  className="h-8 w-8 p-0"
                                  title="Edit in Master Items"
                                >
                                  <ArrowRight className="h-4 w-4 text-amber-500" />
                                </Button>
                                
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEditClick(item)}
                                  className="h-8 w-8 p-0"
                                  title="Edit Item"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Project Item Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit Project Item</DialogTitle>
              <DialogDescription>
                Update the details for this project item.
              </DialogDescription>
            </DialogHeader>
            {editingItem && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="item-code" className="text-right">
                    Item Code
                  </Label>
                  <Input
                    id="item-code"
                    value={editingItem.masterItem?.itemCode || 'N/A'}
                    className="col-span-3"
                    disabled
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="item-name" className="text-right">
                    Item Name
                  </Label>
                  <Input
                    id="item-name"
                    value={editingItem.masterItem?.description || 'N/A'}
                    className="col-span-3"
                    disabled
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="quantity" className="text-right">
                    Quantity *
                  </Label>
                  <Input
                    id="quantity"
                    type="number"
                    value={formData.quantity}
                    onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
                    className="col-span-3"
                    placeholder="Enter quantity"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="estimated-cost" className="text-right">
                    Estimated Cost
                  </Label>
                  <Input
                    id="estimated-cost"
                    type="number"
                    value={formData.estimatedCost}
                    onChange={(e) => setFormData(prev => ({ ...prev, estimatedCost: e.target.value }))}
                    className="col-span-3"
                    placeholder="Enter estimated cost"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="actual-cost" className="text-right">
                    Actual Cost
                  </Label>
                  <Input
                    id="actual-cost"
                    type="number"
                    value={formData.actualCost}
                    onChange={(e) => setFormData(prev => ({ ...prev, actualCost: e.target.value }))}
                    className="col-span-3"
                    placeholder="Enter actual cost"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="status" className="text-right">
                    Status
                  </Label>
                  <Select value={formData.status} onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Not Started">Not Started</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                      <SelectItem value="On Hold">On Hold</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="notes" className="text-right">
                    Notes
                  </Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    className="col-span-3"
                    placeholder="Enter any notes or comments"
                    rows={3}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSaveEdit} 
                disabled={updateItemMutation.isPending || !formData.quantity}
              >
                {updateItemMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}