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
import { Loader2, Package, Building2, Calendar, User, Edit, Save, Search, ArrowRight } from "lucide-react";
import Layout from "@/components/layout";
import { Helmet } from "react-helmet";
import { useToast } from "@/hooks/use-toast";

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
        </div>
        
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
                    <Badge className={getStatusColor(selectedProject.status)}>
                      {selectedProject.status}
                    </Badge>
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
                ) : (
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
                                    // Store the master item ID in sessionStorage
                                    sessionStorage.setItem('editMasterItemId', item.masterItem.id.toString());
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