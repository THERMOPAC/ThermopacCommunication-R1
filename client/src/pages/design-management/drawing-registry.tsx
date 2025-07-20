import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { 
  FileText, 
  Upload, 
  Search, 
  Filter, 
  Eye, 
  Download, 
  History, 
  FolderOpen,
  FileImage,
  Plus,
  Calendar,
  User,
  Edit,
  Settings,
  Zap,
  Building,
  Cog,
  Clock,
  RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';

// Backup interfaces
interface ProjectBackup {
  id: number;
  designProjectId: number;
  backupType: string;
  backupName: string;
  version: string;
  revision: string;
  fileName: string;
  fileUrl: string;
  filePath: string;
  fileSize?: number;
  uploadedBy: number;
  uploadDate: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  
  // Joined data
  project?: {
    designProjectName: string;
    projectName: string;
    clientName: string;
    projectCode: string;
  };
  uploader?: {
    username: string;
    firstName?: string;
    lastName?: string;
  };
}

// Types
interface DesignDrawing {
  id: number;
  designProjectId: number;
  drawingNumber: string;
  drawingTitle: string;
  category: string;
  disciplineCode: string;
  status: string;
  currentVersionId?: number;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  
  // Joined data
  project?: {
    designProjectName: string;
    projectName: string;
    clientName: string;
  };
  currentVersion?: {
    id: number;
    version: string;
    revision: string;
    fileName: string;
    fileUrl: string;
    uploadDate: string;
  };
  creator?: {
    username: string;
    firstName?: string;
    lastName?: string;
  };
}

interface DrawingVersion {
  id: number;
  drawingId: number;
  version: string;
  revision: string;
  fileName: string;
  fileUrl: string;
  filePath: string;
  fileSize?: number;
  fileType?: string;
  uploadedBy: number;
  uploadDate: string;
  versionNotes?: string;
  
  uploader?: {
    username: string;
    firstName?: string;
    lastName?: string;
  };
}

// Project Items Section Component for displaying parent and child items
function ProjectItemsSection({ selectedProjectId, showAllRevisions }: {
  selectedProjectId: number | null;
  showAllRevisions: boolean;
}) {
  const { toast } = useToast();
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItemForUpload, setSelectedItemForUpload] = useState<any>(null);
  const [formValues, setFormValues] = useState({
    drawingNumber: '',
    drawingTitle: '',
    discipline: 'Project_Drawings'
  });
  const queryClient = useQueryClient();

  // Auto-populate form when selectedItemForUpload changes
  React.useEffect(() => {
    if (selectedItemForUpload && isUploadDialogOpen) {
      setFormValues({
        drawingNumber: selectedItemForUpload.drawingNo || '',
        drawingTitle: selectedItemForUpload.description || '',
        discipline: 'Project_Drawings'
      });
    } else {
      setFormValues({
        drawingNumber: '',
        drawingTitle: '',
        discipline: 'Project_Drawings'
      });
    }
  }, [selectedItemForUpload, isUploadDialogOpen]);

  // Fetch project items with parent-child relationships
  const { data: projectItemsResponse, isLoading: itemsLoading } = useQuery({
    queryKey: ['/api/design/project-items', selectedProjectId, showAllRevisions],
    queryFn: async () => {
      if (!selectedProjectId) return { success: true, data: { parentItems: [], childItems: [], allItems: [], stats: {} } };
      console.log(`🔍 ProjectItemsSection API Call: projectId=${selectedProjectId}, showAllRevisions=${showAllRevisions}`);
      const response = await fetch(`/api/design/project-items?projectId=${selectedProjectId}&showAllRevisions=${showAllRevisions}`);
      if (!response.ok) throw new Error('Failed to fetch project items');
      const data = await response.json();
      console.log(`📊 ProjectItemsSection API Response:`, data);
      return data;
    },
    enabled: !!selectedProjectId
  });

  const projectItems = projectItemsResponse?.data || { parentItems: [], childItems: [], allItems: [], stats: {} };

  // Filter items based on search term (Item Code, Item Name/Description, Drawing Number)
  const filterItems = (items: any[]) => {
    if (!searchTerm.trim()) return items;
    
    const searchLower = searchTerm.toLowerCase().trim();
    return items.filter((item: any) => {
      const itemCode = item.itemCode?.toLowerCase() || '';
      const description = item.description?.toLowerCase() || '';
      const drawingNumber = item.drawingNumber?.toLowerCase() || '';
      
      return itemCode.includes(searchLower) || 
             description.includes(searchLower) || 
             drawingNumber.includes(searchLower);
    });
  };

  // Apply search filter to project items (backend handles revision visibility)
  const filteredProjectItems = {
    ...projectItems,
    parentItems: filterItems(projectItems.parentItems || []).map((parent: any) => ({
      ...parent,
      childComponents: parent.childComponents ? filterItems(parent.childComponents) : []
    })),
    allItems: filterItems(projectItems.allItems || []),
    stats: {
      ...projectItems.stats,
      totalItems: filterItems(projectItems.allItems || []).length,
      parentItems: filterItems(projectItems.parentItems || []).length
    }
  };

  // Group items by drawing number for Project Drawings display
  const groupedStandaloneItems = React.useMemo(() => {
    const allItems = (searchTerm ? filteredProjectItems.allItems : projectItems.allItems || []).filter((item: any) => !item.isParent && !item.isChild);
    
    // Group by drawing number
    const grouped = new Map<string, { mainItem: any; versions: any[] }>();
    
    allItems.forEach((item: any) => {
      const drawingNo = item.drawingNo || item.itemCode || '';
      
      if (!grouped.has(drawingNo)) {
        grouped.set(drawingNo, { mainItem: null, versions: [] });
      }
      
      const group = grouped.get(drawingNo)!;
      
      if (item.isVersion) {
        group.versions.push(item);
        // If this is a version and we don't have a main item yet, create one from the version data
        if (!group.mainItem) {
          group.mainItem = {
            id: item.originalId || item.projectItemId,
            projectItemId: item.projectItemId,
            itemCode: item.itemCode,
            description: item.description,
            makeOrBuy: item.makeOrBuy,
            specification: item.specification,
            unit: item.unit,
            estimatedCost: item.estimatedCost,
            supplier: item.supplier,
            drawingNo: item.drawingNo,
            revision: null,
            fileName: null,
            lastUpdated: null,
            isParent: false,
            isChild: false,
            childComponents: [],
            parentItemId: null
          };
        }
      } else {
        group.mainItem = item;
      }
    });
    
    // Sort versions by revision (R4, R3, R2, R1)
    Array.from(grouped.values()).forEach(group => {
      group.versions.sort((a, b) => {
        const revisionOrder = { 'R4': 4, 'R3': 3, 'R2': 2, 'R1': 1 };
        return (revisionOrder[b.revision as keyof typeof revisionOrder] || 0) - 
               (revisionOrder[a.revision as keyof typeof revisionOrder] || 0);
      });
    });
    
    return grouped;
  }, [searchTerm, filteredProjectItems.allItems, projectItems.allItems]);

  // Upload drawing mutation for Project Drawings
  const uploadProjectDrawingMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/design/drawings/upload', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to upload project drawing');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/design/drawings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/design/project-items'] });
      setIsUploadDialogOpen(false);
      toast({
        title: "Project Drawing Uploaded",
        description: data.message || "The project drawing has been successfully uploaded with automatic revision control.",
        variant: "default"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleProjectDrawingUpload = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    
    // Add the selected project ID as projectId (backend will handle design project lookup/creation)
    if (selectedProjectId) {
      formData.append('projectId', selectedProjectId.toString());
    }
    
    uploadProjectDrawingMutation.mutate(formData);
  };

  if (!selectedProjectId) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Project</h3>
          <p className="text-gray-500">Choose a project from the dropdown above to view project items and their relationships</p>
        </CardContent>
      </Card>
    );
  }

  if (itemsLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-gray-500">Loading project items...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Project Items Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-indigo-600" />
            Project Items Overview
          </CardTitle>
          <CardDescription>
            Comprehensive view of all project items including parent-child relationships
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{searchTerm ? filteredProjectItems.stats.totalItems : projectItems.stats.totalItems || 0}</div>
              <div className="text-sm text-gray-500">{searchTerm ? 'Filtered Items' : 'Total Items'}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{searchTerm ? filteredProjectItems.stats.parentItems : projectItems.stats.parentItems || 0}</div>
              <div className="text-sm text-gray-500">Parent Items</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{projectItems.stats.childItems || 0}</div>
              <div className="text-sm text-gray-500">Child Components</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{projectItems.stats.relationships || 0}</div>
              <div className="text-sm text-gray-500">Relationships</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* All Project Items in Single-Row Layout */}
      {projectItems.allItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-indigo-600" />
              Project Items & Components
            </CardTitle>
            <CardDescription>
              All project items including parent assemblies and child components
            </CardDescription>
          </CardHeader>
          
          {/* Search Field */}
          <div className="px-6 pb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type="text"
                placeholder="Search by Item Code, Item Name, or Drawing Number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            {searchTerm && (
              <div className="mt-2 text-sm text-gray-500">
                Showing {filteredProjectItems.allItems.length} of {projectItems.allItems.length} items
              </div>
            )}
          </div>
          <CardContent>
            <div className="space-y-2">
              {/* Parent Items */}
              {filteredProjectItems.parentItems.map((parentItem: any) => (
                <div key={`parent-${parentItem.id}`} className="flex items-center justify-between p-3 bg-green-50 rounded border border-green-200">
                  <div className="flex items-center gap-3">
                    <Cog className="w-4 h-4 text-green-600" />
                    <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                      Parent Assembly
                    </Badge>
                    <div>
                      <div className="font-medium text-gray-900">{parentItem.itemCode}</div>
                      <div className="text-sm text-gray-600">{parentItem.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-sm">
                      <span className="text-gray-500">Make/Buy:</span> <span className="font-medium">{parentItem.makeOrBuy || 'N/A'}</span>
                    </div>
                    {parentItem.revision && (
                      <div className="text-sm">
                        <span className="text-gray-500">Revision:</span> 
                        <span className="font-medium text-indigo-600">{parentItem.revision}</span>
                        {parentItem.allRevisions && parentItem.totalVersions > 1 && (
                          <span className="text-gray-400 ml-1">({parentItem.allRevisions})</span>
                        )}
                      </div>
                    )}
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" title="View Item Details">
                        <Eye className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="outline" title="Download Specifications">
                        <Download className="w-3 h-3" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          setSelectedItemForUpload(parentItem);
                          setIsUploadDialogOpen(true);
                        }}
                        title="Upload Drawing"
                        className="bg-indigo-50 hover:bg-indigo-100 border-indigo-200"
                      >
                        <Upload className="w-3 h-3 text-indigo-600" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Child Components */}
              {projectItems.parentItems.map((parentItem: any) => 
                parentItem.childComponents && parentItem.childComponents.map((child: any) => (
                  <div key={`child-${child.id}`} className="flex items-center justify-between p-3 bg-purple-50 rounded border border-purple-200 ml-6">
                    <div className="flex items-center gap-3">
                      <Cog className="w-4 h-4 text-purple-600" />
                      <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300">
                        Component
                      </Badge>
                      <div>
                        <div className="font-medium text-gray-900">{child.itemCode}</div>
                        <div className="text-sm text-gray-600">{child.description}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm">
                        <span className="text-gray-500">Qty:</span> <span className="font-medium">{child.quantity || 1}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-gray-500">Make/Buy:</span> <span className="font-medium">{child.makeOrBuy || 'N/A'}</span>
                      </div>
                      {child.revision && (
                        <div className="text-sm">
                          <span className="text-gray-500">Revision:</span> 
                          <span className="font-medium text-purple-600">{child.revision}</span>
                          {child.allRevisions && child.totalVersions > 1 && (
                            <span className="text-gray-400 ml-1">({child.allRevisions})</span>
                          )}
                        </div>
                      )}
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" title="View Component Details">
                          <Eye className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="outline" title="Download Specifications">
                          <Download className="w-3 h-3" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            setSelectedItemForUpload(child);
                            setIsUploadDialogOpen(true);
                          }}
                          title="Upload Drawing"
                          className="bg-indigo-50 hover:bg-indigo-100 border-indigo-200"
                        >
                          <Upload className="w-3 h-3 text-indigo-600" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {/* Group items by drawing number to show main item + individual version rows */}
              {Array.from(groupedStandaloneItems.entries()).map(([drawingNo, group]) => (
                <div key={`group-${drawingNo}`} className="space-y-2">
                  {/* Main Item */}
                  {group.mainItem && (
                    <div className="flex items-center justify-between p-3 rounded border bg-blue-50 border-blue-200">
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
                          Main Item
                        </Badge>
                        <div>
                          <div className="font-medium text-gray-900">
                            {group.mainItem.itemCode}
                          </div>
                          <div className="text-sm text-gray-600">
                            {group.mainItem.description}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          title="View Item Details"
                        >
                          <Eye className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedItemForUpload(group.mainItem);
                            setFormValues({
                              drawingNumber: group.mainItem.drawingNo || '',
                              drawingTitle: group.mainItem.description || '',
                              discipline: 'Project_Drawings'
                            });
                            setIsUploadDialogOpen(true);
                          }}
                          title="Upload Drawing"
                          className="bg-indigo-50 hover:bg-indigo-100 border-indigo-200"
                        >
                          <Upload className="w-3 h-3 text-indigo-600" />
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {/* Individual Version Rows - Each version as separate row */}
                  {group.versions.map((version: any) => {
                    console.log(`🎯 Rendering version item:`, {
                      id: version.id,
                      revision: version.revision,
                      fileName: version.fileName,
                      versionId: version.versionId,
                      isVersion: version.isVersion
                    });
                    
                    return (
                      <div key={`version-${version.versionId}`} className="flex items-center justify-between p-2 bg-gray-50 rounded border ml-6">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-500" />
                          <span className="text-sm font-medium">{version.fileName}</span>
                          <Badge variant="outline" className={`
                            ${version.revision === 'R4' ? 'bg-purple-100 text-purple-700 border-purple-300' :
                              version.revision === 'R3' ? 'bg-green-100 text-green-700 border-green-300' :
                              version.revision === 'R2' ? 'bg-yellow-100 text-yellow-700 border-yellow-300' :
                              version.revision === 'R1' ? 'bg-pink-100 text-pink-700 border-pink-300' :
                              'bg-indigo-100 text-indigo-700 border-indigo-300'}
                          `}>
                            {version.revision}
                          </Badge>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            title="View Drawing"
                          >
                            <Eye className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              window.open(`/api/design/versions/${version.versionId}/download`, '_blank');
                            }}
                            title={`Download ${version.revision} - ${version.fileName}`}
                          >
                            <Download className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {projectItems.allItems.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center">
            <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Project Items Found</h3>
            <p className="text-gray-500">This project doesn't have any items assigned yet.</p>
          </CardContent>
        </Card>
      )}
      
      {/* No Search Results State */}
      {projectItems.allItems.length > 0 && filteredProjectItems.allItems.length === 0 && searchTerm && (
        <Card>
          <CardContent className="p-6 text-center">
            <Search className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Found</h3>
            <p className="text-gray-500">
              No items match "{searchTerm}". Try searching by Item Code, Item Name, or Drawing Number.
            </p>
            <Button 
              variant="ghost" 
              onClick={() => setSearchTerm('')}
              className="mt-3"
            >
              Clear Search
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Upload Dialog for Project Drawings */}
      <Dialog open={isUploadDialogOpen} onOpenChange={(open) => {
        setIsUploadDialogOpen(open);
        if (!open) {
          setSelectedItemForUpload(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-indigo-600" />
              Upload Project Drawing
            </DialogTitle>
            <DialogDescription>
              Upload a new drawing file for this project with automatic revision control
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleProjectDrawingUpload} className="space-y-4">
            <div>
              <Label htmlFor="drawingNumber">Drawing Number *</Label>
              <Input
                id="drawingNumber"
                name="drawingNumber"
                placeholder="e.g., DWG-001, P&ID-101"
                value={formValues.drawingNumber}
                onChange={(e) => setFormValues(prev => ({ ...prev, drawingNumber: e.target.value }))}
                readOnly={!!selectedItemForUpload}
                required
                className={`w-full ${selectedItemForUpload ? 'bg-gray-50 cursor-not-allowed' : ''}`}
              />
              {selectedItemForUpload && (
                <p className="text-sm text-green-600 mt-1">Auto-populated from item data (read-only)</p>
              )}
            </div>
            <div>
              <Label htmlFor="drawingTitle">Drawing Title *</Label>
              <Input
                id="drawingTitle"
                name="drawingTitle"
                placeholder="e.g., Process Flow Diagram"
                value={formValues.drawingTitle}
                onChange={(e) => setFormValues(prev => ({ ...prev, drawingTitle: e.target.value }))}
                readOnly={!!selectedItemForUpload}
                required
                className={`w-full ${selectedItemForUpload ? 'bg-gray-50 cursor-not-allowed' : ''}`}
              />
              {selectedItemForUpload && (
                <p className="text-sm text-green-600 mt-1">Auto-populated from item description (read-only)</p>
              )}
            </div>

            <div>
              <Label htmlFor="discipline">Discipline</Label>
              <Select 
                name="discipline" 
                value={formValues.discipline} 
                onValueChange={(value) => setFormValues(prev => ({ ...prev, discipline: value }))}
                disabled={!!selectedItemForUpload}
              >
                <SelectTrigger className={selectedItemForUpload ? 'bg-gray-50 cursor-not-allowed' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Project_Drawings">Project Drawings</SelectItem>
                  <SelectItem value="Process_Engineering">Process Engineering</SelectItem>
                  <SelectItem value="Mechanical_Piping">Mechanical & Piping</SelectItem>
                  <SelectItem value="Civil_Structural">Civil & Structural</SelectItem>
                  <SelectItem value="Electrical_Instrumentation">Electrical & Instrumentation</SelectItem>
                </SelectContent>
              </Select>
              {selectedItemForUpload && (
                <p className="text-sm text-green-600 mt-1">Defaults to Project Drawings (read-only)</p>
              )}
            </div>
            <div>
              <Label htmlFor="file">Drawing File *</Label>
              <Input
                id="file"
                name="file"
                type="file"
                accept=".dwg,.dxf,.pdf,.png,.jpg,.jpeg"
                required
                className="w-full"
              />
              <p className="text-sm text-gray-500 mt-1">
                Supports: DWG, DXF, PDF, PNG, JPG (Max 50MB)
              </p>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsUploadDialogOpen(false);
                  setSelectedItemForUpload(null);
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={uploadProjectDrawingMutation.isPending}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              >
                {uploadProjectDrawingMutation.isPending ? 'Uploading...' : 'Upload'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Project Backup Section Component for displaying backups
function ProjectBackupSection({ selectedProjectId, showAllRevisions }: {
  selectedProjectId: number | null;
  showAllRevisions: boolean;
}) {
  const { toast } = useToast();
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadForm, setUploadForm] = useState({
    backupType: '3D Model',
    backupName: '',
    description: '',
    isPreFilled: false
  });
  const queryClient = useQueryClient();

  // Fetch project backups
  const { data: backupsResponse = { success: false, data: [] }, isLoading } = useQuery({
    queryKey: ['/api/design/backups', selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId) return { success: true, data: [] };
      const response = await fetch(`/api/design/backups?projectId=${selectedProjectId}`);
      if (!response.ok) throw new Error('Failed to fetch backups');
      return response.json();
    },
    enabled: !!selectedProjectId
  });

  const backups = backupsResponse?.data || [];

  // Filter backups by search term
  const filteredBackups = React.useMemo(() => {
    let filtered = backups;
    
    if (searchTerm) {
      filtered = filtered.filter((backup: ProjectBackup) =>
        (backup.backupName || backup.originalFileName || backup.fileName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        backup.backupType.toLowerCase().includes(searchTerm.toLowerCase()) ||
        backup.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    return filtered;
  }, [backups, searchTerm]);

  // Group backups by type and backup name for display
  const groupedBackups = React.useMemo(() => {
    const typeGroups: Record<string, Record<string, any[]>> = {};
    
    filteredBackups.forEach((backup: ProjectBackup) => {
      const backupType = backup.backupType;
      // Handle both backupName and originalFileName fields for compatibility
      const backupName = backup.backupName || backup.originalFileName || backup.fileName || 'Unknown';
      
      if (!typeGroups[backupType]) {
        typeGroups[backupType] = {};
      }
      
      if (!typeGroups[backupType][backupName]) {
        typeGroups[backupType][backupName] = [];
      }
      
      if (showAllRevisions) {
        // Show individual revisions
        typeGroups[backupType][backupName].push({
          ...backup,
          isVersion: true,
          versionId: backup.id,
          fileName: backup.fileName,
          revision: backup.revision
        });
      } else {
        // Show only latest version for each backup
        const existing = typeGroups[backupType][backupName][0];
        if (!existing || backup.revision > existing.revision) {
          typeGroups[backupType][backupName] = [{
            ...backup,
            isVersion: false
          }];
        }
      }
    });

    // Sort revisions within each backup group (highest revision first)
    Object.values(typeGroups).forEach(backupGroup => {
      Object.values(backupGroup).forEach(revisions => {
        revisions.sort((a, b) => {
          const aNum = parseInt(a.revision.replace('R', ''));
          const bNum = parseInt(b.revision.replace('R', ''));
          return bNum - aNum; // Descending order (R4, R3, R2, R1)
        });
      });
    });

    return typeGroups;
  }, [filteredBackups, showAllRevisions]);

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/design/backups', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Failed to upload backup');
      return response.json();
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['/api/design/backups'] });
      setIsUploadDialogOpen(false);
      setUploadForm({ backupType: '3D Model', backupName: '', description: '', isPreFilled: false });
      
      // Enhanced success message based on upload results
      const { data } = response;
      if (data && data.totalFiles > 1) {
        toast({ 
          title: "Success", 
          description: `${data.successCount} of ${data.totalFiles} files uploaded to ${data.revision}` 
        });
      } else {
        toast({ title: "Success", description: "Backup uploaded successfully" });
      }
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to upload backup",
        variant: "destructive"
      });
    }
  });

  const handleUpload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    formData.append('projectId', selectedProjectId?.toString() || '');
    
    uploadMutation.mutate(formData);
  };

  const getRevisionBadgeColor = (revision: string) => {
    switch (revision) {
      case 'R4': return 'bg-purple-100 text-purple-800';
      case 'R3': return 'bg-green-100 text-green-800';
      case 'R2': return 'bg-yellow-100 text-yellow-800';
      case 'R1': return 'bg-pink-100 text-pink-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const backupTypes = ['3D Model', 'PLC Program', 'SCADA'];
  
  const getBackupTypeIcon = (backupType: string) => {
    switch (backupType) {
      case '3D Model': return <Building className="w-4 h-4" />;
      case 'PLC Program': return <Cog className="w-4 h-4" />;
      case 'SCADA': return <Zap className="w-4 h-4" />;
      default: return <FileImage className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and Upload Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search backups by name, type, or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Button
              onClick={() => {
                setUploadForm({ backupType: '3D Model', backupName: '', description: '', isPreFilled: false });
                setIsUploadDialogOpen(true);
              }}
              disabled={!selectedProjectId}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Upload Backup
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Project Selection Warning */}
      {!selectedProjectId && (
        <Card>
          <CardContent className="p-6 text-center">
            <FileImage className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Project</h3>
            <p className="text-gray-500">Please select a project from the filter above to view project backups.</p>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && selectedProjectId && (
        <Card>
          <CardContent className="p-6 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full mx-auto mb-3"></div>
            <p className="text-gray-500">Loading project backups...</p>
          </CardContent>
        </Card>
      )}

      {/* Backup Groups Display by Type - Always Show All Types */}
      {selectedProjectId && !isLoading && (
        <div className="space-y-6">
          {backupTypes.map((backupType) => {
            const backupGroups = groupedBackups[backupType] || {};
            const hasBackups = Object.keys(backupGroups).length > 0;
            
            return (
              <Card key={backupType}>
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-purple-600">
                    {getBackupTypeIcon(backupType)}
                    {backupType}
                  </CardTitle>
                  <CardDescription>
                    {hasBackups 
                      ? `${Object.keys(backupGroups).length} backup${Object.keys(backupGroups).length !== 1 ? 's' : ''}`
                      : 'No backups uploaded yet'
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {hasBackups ? (
                    // Show existing backups
                    Object.entries(backupGroups).map(([backupName, items]) => (
                      <div key={backupName} className="space-y-2">
                        {/* Main Backup Item Header */}
                        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <div className="flex items-center gap-3">
                            <FileImage className="w-4 h-4 text-blue-600" />
                            <div>
                              <h4 className="font-medium text-blue-900">{backupName}</h4>
                              <p className="text-sm text-blue-700">
                                {items.length} version{items.length !== 1 ? 's' : ''} • Latest: {items[0].revision}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setUploadForm(prev => ({ 
                                  ...prev, 
                                  backupType: backupType, 
                                  backupName: backupName,
                                  isPreFilled: true
                                }));
                                setIsUploadDialogOpen(true);
                              }}
                              title={`Upload new version of ${backupName}`}
                              className="bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
                            >
                              <Upload className="w-3 h-3 mr-1" />
                              Upload
                            </Button>
                          </div>
                        </div>

                        {/* Individual Revisions */}
                        {items.map((backup: any, index: number) => (
                          <div key={backup.id} className={`flex items-center justify-between p-3 rounded-lg border ${
                            backup.isVersion ? 'ml-8 bg-gray-50' : 'bg-white'
                          }`}>
                            <div className="flex items-center gap-4">
                              <Badge className={getRevisionBadgeColor(backup.revision)}>
                                {backup.revision}
                              </Badge>
                              <div className="flex-1">
                                <div className="font-medium">{backup.fileName}</div>
                                <div className="text-sm text-gray-500">
                                  Uploaded {backup.uploadedAt ? format(new Date(backup.uploadedAt), 'MMM dd, yyyy') : 'Unknown date'} by {
                                    backup.uploader?.firstName && backup.uploader?.lastName 
                                      ? `${backup.uploader.firstName} ${backup.uploader.lastName}`
                                      : backup.uploader?.username || 'Unknown'
                                  }
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                title="View Backup"
                              >
                                <Eye className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  window.open(`/api/design/backups/${backup.id}/download`, '_blank');
                                }}
                                title={`Download ${backup.revision} - ${backup.fileName}`}
                              >
                                <Download className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))
                  ) : (
                    // Show empty state for this backup type
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-3">
                        <FileImage className="w-4 h-4 text-gray-500" />
                        <div>
                          <h4 className="font-medium text-gray-700">No {backupType} backups</h4>
                          <p className="text-sm text-gray-500">Upload your first {backupType.toLowerCase()} backup</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setUploadForm({ 
                              backupType: backupType, 
                              backupName: '', 
                              description: '', 
                              isPreFilled: false 
                            });
                            setIsUploadDialogOpen(true);
                          }}
                          className="bg-purple-600 hover:bg-purple-700"
                        >
                          <Upload className="w-3 h-3 mr-1" />
                          Upload
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled
                          title="No files to download"
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}



      {/* No Search Results State */}
      {selectedProjectId && !isLoading && Object.keys(groupedBackups).length === 0 && searchTerm && (
        <Card>
          <CardContent className="p-6 text-center">
            <Search className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Found</h3>
            <p className="text-gray-500">
              No backups match "{searchTerm}". Try searching by backup name, type, or description.
            </p>
            <Button 
              variant="ghost" 
              onClick={() => setSearchTerm('')}
              className="mt-3"
            >
              Clear Search
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-purple-600" />
              Upload Project Backup
            </DialogTitle>
            <DialogDescription>
              Upload a new backup file with automatic version control and GCS storage
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <Label htmlFor="backupType">Backup Type *</Label>
              <Select 
                name="backupType" 
                value={uploadForm.backupType} 
                onValueChange={(value) => setUploadForm(prev => ({ ...prev, backupType: value }))}
                disabled
              >
                <SelectTrigger className="bg-gray-50 cursor-not-allowed">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {backupTypes.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-500 mt-1">
                Auto-populated from selected backup section (read-only)
              </p>
            </div>
            <div>
              <Label htmlFor="file">Backup Files *</Label>
              <Input
                id="file"
                name="file"
                type="file"
                accept=".zip,.rar,.7z,.tar,.gz,.step,.stp,.iges,.igs,.dwg,.dxf"
                multiple
                required
              />
              <p className="text-sm text-gray-500 mt-1">
                Select multiple files to upload together under one revision (ZIP, RAR, 7Z, STEP, IGES, DWG, DXF - Max 500MB each)
              </p>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsUploadDialogOpen(false);
                  setUploadForm({ backupType: '3D Model', backupName: '', description: '', isPreFilled: false });
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={uploadMutation.isPending}
                className="flex-1 bg-purple-600 hover:bg-purple-700"
              >
                {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Discipline Section Component for individual discipline tabs
function DisciplineSection({ disciplineName, disciplineKey, icon: IconComponent, color, types, selectedProjectId, showAllRevisions }: {
  disciplineName: string;
  disciplineKey: string;
  icon: any;
  color: string;
  types: string[];
  selectedProjectId: number | null;
  showAllRevisions: boolean;
}) {
  const [uploadDialog, setUploadDialog] = useState<{ open: boolean, type: string }>({ 
    open: false, 
    type: '' 
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch design projects for project selection
  const { data: designProjects = [] } = useQuery({
    queryKey: ['/api/design/projects'],
    queryFn: async () => {
      const response = await fetch('/api/design/projects');
      if (!response.ok) throw new Error('Failed to fetch design projects');
      return response.json();
    }
  });

  // Fetch basic drawings for selected project
  const { data: basicDrawingsResponse, isLoading } = useQuery({
    queryKey: ['/api/design/basic-drawings', selectedProjectId, disciplineName],
    queryFn: async () => {
      if (!selectedProjectId) return { success: true, data: [] };
      const response = await fetch(`/api/design/basic-drawings?projectId=${selectedProjectId}`);
      if (!response.ok) throw new Error('Failed to fetch basic drawings');
      return response.json();
    },
    enabled: !!selectedProjectId
  });

  const basicDrawings = basicDrawingsResponse?.data || [];
  
  // Filter drawings for this discipline
  const filteredDrawings = React.useMemo(() => {
    let drawings = basicDrawings.filter((drawing: any) => 
      drawing.discipline === disciplineName
    );
    
    if (!showAllRevisions) {
      drawings = drawings.filter((drawing: any) => drawing.status === 'current');
    }
    
    return drawings;
  }, [basicDrawings, showAllRevisions, disciplineName]);

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (data: { formData: FormData, type: string }) => {
      const response = await fetch('/api/design/basic-drawings', {
        method: 'POST',
        body: data.formData,
      });
      if (!response.ok) throw new Error('Failed to upload drawing');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/design/basic-drawings'] });
      setUploadDialog({ open: false, type: '' });
      toast({ title: "Success", description: "Drawing uploaded successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to upload drawing",
        variant: "destructive"
      });
    }
  });


  const handleUpload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    formData.append('projectId', selectedProjectId?.toString() || '');
    formData.append('discipline', disciplineName);
    formData.append('drawingType', uploadDialog.type);
    // Auto-populate description with the specific drawing type
    formData.append('description', uploadDialog.type);
    
    uploadMutation.mutate({ 
      formData, 
      type: uploadDialog.type 
    });
  };

  const handleDownload = async (drawing: any) => {
    try {
      // Use direct URL navigation for downloads
      window.open(`/api/design/basic-drawings/${drawing.id}/download`, '_blank');
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to download drawing",
        variant: "destructive"
      });
    }
  };

  // Get drawings for a specific type
  const getDrawingsForType = (type: string) => {
    return filteredDrawings.filter((drawing: any) => 
      drawing.drawingType === type
    );
  };

  return (
    <div className="space-y-6">
      {/* Drawing Types Header */}
      <Card>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${color}`}>
            <IconComponent className="w-5 h-5" />
            {disciplineName}
          </CardTitle>
          <CardDescription>
            Manage {disciplineName.toLowerCase()} drawings for your projects
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Drawing Types */}
      {selectedProjectId && (
        <div className="space-y-4">
          {types.map((type) => {
            const drawings = getDrawingsForType(type);
            return (
              <Card key={type}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900">{type}</h4>
                    <Button
                      size="sm"
                      onClick={() => setUploadDialog({ 
                        open: true, 
                        type 
                      })}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Upload className="w-4 h-4 mr-1" />
                      Upload
                    </Button>
                  </div>
                  
                  {drawings.length > 0 ? (
                    <div className="space-y-2">
                      {drawings.map((drawing: any) => (
                        <div key={drawing.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-500" />
                            <span className="text-sm font-medium">{drawing.fileName || drawing.originalFileName}</span>
                            <Badge 
                              variant={drawing.status === 'current' ? 'default' : 'secondary'} 
                              className="text-xs"
                            >
                              {drawing.revision || 'R1'}
                            </Badge>
                            {drawing.status === 'superseded' && (
                              <Badge variant="outline" className="text-xs text-orange-600">
                                Superseded
                              </Badge>
                            )}
                            {drawing.status === 'archived' && (
                              <Badge variant="outline" className="text-xs text-gray-600">
                                Archived
                              </Badge>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => window.open(drawing.fileUrl, '_blank')}
                              title="View Drawing"
                            >
                              <Eye className="w-3 h-3" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleDownload(drawing)}
                              title="Download Drawing"
                            >
                              <Download className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 text-center py-4">
                      No drawings uploaded yet
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!selectedProjectId && (
        <Card>
          <CardContent className="text-center py-8">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">Select a project to manage {disciplineName.toLowerCase()} drawings</p>
          </CardContent>
        </Card>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialog.open} onOpenChange={(open) => setUploadDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload {disciplineName} Drawing</DialogTitle>
            <DialogDescription>
              Upload {uploadDialog.type}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <Label htmlFor="file">Drawing File</Label>
              <Input 
                name="file" 
                type="file" 
                accept=".dwg,.pdf,.png,.jpg,.jpeg" 
                required 
              />
              <p className="text-xs text-gray-500 mt-1">
                Supported formats: DWG, PDF, PNG, JPG
              </p>
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Input 
                name="description" 
                value={uploadDialog.type}
                readOnly
                className="bg-gray-50 cursor-not-allowed"
              />
              <p className="text-sm text-green-600 mt-1">Auto-populated from drawing type (read-only)</p>
            </div>
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setUploadDialog({ open: false, type: '' })}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={uploadMutation.isPending}>
                {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Project Basic Drawings Section Component
function ProjectBasicDrawingsSection() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [showAllRevisions, setShowAllRevisions] = useState<boolean>(false);
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>('process');
  const [uploadDialog, setUploadDialog] = useState<{ open: boolean, discipline: string, type: string }>({ 
    open: false, 
    discipline: '', 
    type: '' 
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch design projects for project selection
  const { data: designProjects = [] } = useQuery({
    queryKey: ['/api/design/projects'],
    queryFn: async () => {
      const response = await fetch('/api/design/projects');
      if (!response.ok) throw new Error('Failed to fetch design projects');
      return response.json();
    }
  });

  // Fetch basic drawings for selected project
  const { data: basicDrawingsResponse, isLoading } = useQuery({
    queryKey: ['/api/design/basic-drawings', selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId) return { success: true, data: [] };
      const response = await fetch(`/api/design/basic-drawings?projectId=${selectedProjectId}`);
      if (!response.ok) throw new Error('Failed to fetch basic drawings');
      return response.json();
    },
    enabled: !!selectedProjectId
  });

  const basicDrawings = basicDrawingsResponse?.data || [];
  
  // Filter drawings based on revision view mode
  const filteredDrawings = React.useMemo(() => {
    if (showAllRevisions) {
      return basicDrawings;
    } else {
      // Show only current revisions
      return basicDrawings.filter((drawing: any) => drawing.status === 'current');
    }
  }, [basicDrawings, showAllRevisions]);

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (data: { formData: FormData, discipline: string, type: string }) => {
      const response = await fetch('/api/design/basic-drawings', {
        method: 'POST',
        body: data.formData,
      });
      if (!response.ok) throw new Error('Failed to upload drawing');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/design/basic-drawings'] });
      setUploadDialog({ open: false, discipline: '', type: '' });
      toast({ title: "Success", description: "Drawing uploaded successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to upload drawing",
        variant: "destructive"
      });
    }
  });

  // Delete mutation
  const handleUpload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    formData.append('projectId', selectedProjectId);
    formData.append('discipline', uploadDialog.discipline);
    formData.append('drawingType', uploadDialog.type);
    
    uploadMutation.mutate({ 
      formData, 
      discipline: uploadDialog.discipline, 
      type: uploadDialog.type 
    });
  };

  const handleDownload = async (drawing: any) => {
    try {
      // Use direct URL navigation for downloads
      window.open(`/api/design/basic-drawings/${drawing.id}/download`, '_blank');
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to download drawing",
        variant: "destructive"
      });
    }
  };

  // Drawing disciplines and types
  const drawingDisciplines = {
    process: {
      name: "Process Engineering",
      icon: Settings,
      color: "text-blue-600",
      types: [
        "Process Flow Diagram (PFD)",
        "Piping and Instrumentation Diagram (P&ID)"
      ]
    },
    mechanical: {
      name: "Mechanical & Piping",
      icon: Cog,
      color: "text-green-600",
      types: [
        "Piping General Arrangement (GA) Drawing",
        "Piping Isometric Drawings"
      ]
    },
    civil: {
      name: "Civil & Structural",
      icon: Building,
      color: "text-orange-600",
      types: [
        "Plot Plan",
        "Foundation Layout Drawings"
      ]
    },
    electrical: {
      name: "Electrical & Instrumentation",
      icon: Zap,
      color: "text-purple-600",
      types: [
        "Single Line Diagram (SLD)",
        "Electrical Layout Drawings",
        "Cable Tray & Conduit Layouts",
        "Instrument Loop Diagrams",
        "Instrument Hook-up Drawings"
      ]
    }
  };

  // Get drawings for a specific discipline and type
  const getDrawingsForType = (discipline: string, type: string) => {
    return filteredDrawings.filter((drawing: any) => 
      drawing.discipline === discipline && drawing.drawingType === type
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            📘 Project Basic Drawing
          </CardTitle>
          <CardDescription>
            Structured drawing management organized by engineering disciplines
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="projectSelect">Select Project</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a project to manage basic drawings" />
                </SelectTrigger>
              <SelectContent>
                {designProjects.map((project: any) => (
                  <SelectItem key={project.id} value={project.id.toString()}>
                    {project.projectName} ({project.projectCode}) - {project.customerName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            </div>
            
            {selectedProjectId && (
              <div className="flex items-center space-x-2">
                <Switch
                  id="show-all-revisions"
                  checked={showAllRevisions}
                  onCheckedChange={setShowAllRevisions}
                />
                <Label htmlFor="show-all-revisions" className="cursor-pointer">
                  Show all revisions (including superseded)
                </Label>
                {!showAllRevisions && (
                  <Badge variant="secondary" className="text-xs">
                    <Clock className="w-3 h-3 mr-1" />
                    Current only
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Drawing Disciplines Tabs */}
      {selectedProjectId && (
        <Tabs value={selectedDiscipline} onValueChange={setSelectedDiscipline} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="process" className="flex items-center gap-1">
              <Settings className="w-4 h-4" />
              Process Engineering
            </TabsTrigger>
            <TabsTrigger value="mechanical" className="flex items-center gap-1">
              <Cog className="w-4 h-4" />
              Mechanical & Piping
            </TabsTrigger>
            <TabsTrigger value="civil" className="flex items-center gap-1">
              <Building className="w-4 h-4" />
              Civil & Structural
            </TabsTrigger>
            <TabsTrigger value="electrical" className="flex items-center gap-1">
              <Zap className="w-4 h-4" />
              Electrical & Instrumentation
            </TabsTrigger>
          </TabsList>

          {Object.entries(drawingDisciplines).map(([key, discipline]) => (
            <TabsContent key={key} value={key} className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className={`flex items-center gap-2 ${discipline.color}`}>
                    <discipline.icon className="w-5 h-5" />
                    {discipline.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {discipline.types.map((type) => {
                      const drawings = getDrawingsForType(discipline.name, type);
                      return (
                        <div key={type} className="bg-white p-4 rounded-lg border border-gray-200">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-medium text-gray-900">{type}</h4>
                            <Button
                              size="sm"
                              onClick={() => setUploadDialog({ 
                                open: true, 
                                discipline: discipline.name, 
                                type 
                              })}
                              className="bg-blue-600 hover:bg-blue-700"
                            >
                              <Upload className="w-4 h-4 mr-1" />
                              Upload
                            </Button>
                          </div>
                          
                          {drawings.length > 0 ? (
                            <div className="space-y-2">
                              {drawings.map((drawing: any) => (
                                <div key={drawing.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-gray-500" />
                                    <span className="text-sm font-medium">{drawing.fileName || drawing.originalFileName}</span>
                                    <Badge 
                                      variant={drawing.status === 'current' ? 'default' : 'secondary'} 
                                      className="text-xs"
                                    >
                                      {drawing.revision || 'R1'}
                                    </Badge>
                                    {drawing.status === 'superseded' && (
                                      <Badge variant="outline" className="text-xs text-orange-600">
                                        Superseded
                                      </Badge>
                                    )}
                                    {drawing.status === 'archived' && (
                                      <Badge variant="outline" className="text-xs text-gray-600">
                                        Archived
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex gap-1">
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => handleDownload(drawing)}
                                    >
                                      <Download className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500 text-center py-4">
                              No drawings uploaded yet
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      )}

      {!selectedProjectId && (
        <Card>
          <CardContent className="text-center py-8">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">Select a project to manage basic drawings</p>
          </CardContent>
        </Card>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialog.open} onOpenChange={(open) => setUploadDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Drawing</DialogTitle>
            <DialogDescription>
              Upload {uploadDialog.type} for {uploadDialog.discipline}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <Label htmlFor="file">Drawing File</Label>
              <Input 
                name="file" 
                type="file" 
                accept=".dwg,.pdf,.png,.jpg,.jpeg" 
                required 
              />
              <p className="text-xs text-gray-500 mt-1">
                Supported formats: DWG, PDF, PNG, JPG
              </p>
            </div>
            <div>
              <Label htmlFor="revisionReason">Revision Reason (Optional)</Label>
              <Input 
                name="revisionReason" 
                placeholder="Brief reason for new revision or changes made"
              />
            </div>
            <div>
              <Label htmlFor="description">Description (Optional)</Label>
              <Input 
                name="description" 
                placeholder="Brief description of the drawing"
              />
            </div>
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setUploadDialog({ open: false, discipline: '', type: '' })}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={uploadMutation.isPending}>
                {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function DrawingRegistryPage() {
  const [selectedTab, setSelectedTab] = useState('project-basic-drawings');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [showAllRevisions, setShowAllRevisions] = useState(false);
  const [selectedDrawing, setSelectedDrawing] = useState<DesignDrawing | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isVersionHistoryDialogOpen, setIsVersionHistoryDialogOpen] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch drawings with filters
  const { data: drawings = [], isLoading: drawingsLoading } = useQuery({
    queryKey: ['/api/design/drawings', searchTerm, categoryFilter, statusFilter, selectedProjectId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (categoryFilter && categoryFilter !== 'all') params.append('category', categoryFilter);
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      if (selectedProjectId && selectedProjectId !== 'all') params.append('projectId', selectedProjectId);
      
      const response = await fetch(`/api/design/drawings?${params}`);
      if (!response.ok) throw new Error('Failed to fetch drawings');
      return response.json();
    }
  });

  // Fetch design projects for dropdown
  const { data: designProjects = [] } = useQuery({
    queryKey: ['/api/design/projects'],
    queryFn: async () => {
      const response = await fetch('/api/design/projects');
      if (!response.ok) throw new Error('Failed to fetch design projects');
      return response.json();
    }
  });

  // Fetch versions for selected drawing
  const { data: versions = [] } = useQuery({
    queryKey: ['/api/design/drawings', selectedDrawing?.id, 'versions'],
    queryFn: async () => {
      if (!selectedDrawing) return [];
      const response = await fetch(`/api/design/drawings/${selectedDrawing.id}/versions`);
      if (!response.ok) throw new Error('Failed to fetch versions');
      return response.json();
    },
    enabled: !!selectedDrawing
  });

  // Upload drawing mutation
  const uploadDrawingMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/design/drawings/upload', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to upload drawing');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/design/drawings'] });
      setIsUploadDialogOpen(false);
      toast({
        title: "Drawing Uploaded",
        description: "The drawing has been successfully uploaded to the registry."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleUploadSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    uploadDrawingMutation.mutate(formData);
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'draft': return 'bg-yellow-100 text-yellow-800';
      case 'archived': return 'bg-gray-100 text-gray-800';
      case 'under review': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryBadgeColor = (category: string) => {
    switch (category.toLowerCase()) {
      case 'p&id': return 'bg-purple-100 text-purple-800';
      case 'equipment_layout': return 'bg-orange-100 text-orange-800';
      case 'piping': return 'bg-blue-100 text-blue-800';
      case 'electrical': return 'bg-yellow-100 text-yellow-800';
      case 'civil': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container py-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Drawing Registry</h1>
            <p className="text-gray-600 mt-1">Central repository for CAD drawings and technical documents</p>
          </div>
          <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Upload className="w-4 h-4 mr-2" />
                Upload Drawing
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Upload New Drawing</DialogTitle>
                <DialogDescription>
                  Upload a CAD drawing file to the registry with version control
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleUploadSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="designProjectId">Design Project</Label>
                  <Select name="designProjectId" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select design project" />
                    </SelectTrigger>
                    <SelectContent>
                      {designProjects.map((project: any) => (
                        <SelectItem key={project.id} value={project.id.toString()}>
                          {project.designProjectName} - {project.projectName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="drawingNumber">Drawing Number</Label>
                  <Input name="drawingNumber" placeholder="e.g., WPC-P&ID-001" required />
                </div>
                <div>
                  <Label htmlFor="drawingTitle">Drawing Title</Label>
                  <Input name="drawingTitle" placeholder="e.g., Main Process Flow Diagram" required />
                </div>
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select name="category" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="P&ID">P&ID</SelectItem>
                      <SelectItem value="Equipment_Layout">Equipment Layout</SelectItem>
                      <SelectItem value="Piping">Piping</SelectItem>
                      <SelectItem value="Electrical">Electrical</SelectItem>
                      <SelectItem value="Civil">Civil</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="disciplineCode">Discipline Code</Label>
                  <Select name="disciplineCode" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select discipline" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PROC">Process</SelectItem>
                      <SelectItem value="MECH">Mechanical</SelectItem>
                      <SelectItem value="ELEC">Electrical</SelectItem>
                      <SelectItem value="INST">Instrumentation</SelectItem>
                      <SelectItem value="CIVIL">Civil</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="file">Drawing File</Label>
                  <Input name="file" type="file" accept=".dwg,.pdf,.png,.jpg,.jpeg" required />
                  <p className="text-xs text-gray-500 mt-1">Supported formats: DWG, PDF, PNG, JPG</p>
                </div>
                <div>
                  <Label htmlFor="versionNotes">Version Notes (Optional)</Label>
                  <Input name="versionNotes" placeholder="Initial version, updated dimensions, etc." />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsUploadDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={uploadDrawingMutation.isPending}>
                    {uploadDrawingMutation.isPending ? 'Uploading...' : 'Upload'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Global Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <Label htmlFor="project-filter" className="text-sm font-medium text-gray-700 mb-2 block">
                  Select Project
                </Label>
                <Select 
                  value={selectedProjectId?.toString() || "all"} 
                  onValueChange={(value) => setSelectedProjectId(value === "all" ? null : parseInt(value))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select project to filter drawings">
                      {selectedProjectId ? 
                        (() => {
                          const selectedProject = designProjects.find((p: any) => p.id === selectedProjectId);
                          return selectedProject ? 
                            `${selectedProject.designProjectName || selectedProject.projectName} (${selectedProject.projectCode}) – ${selectedProject.customerName || selectedProject.projectName}` :
                            "Select project to filter drawings";
                        })() : 
                        "Select project to filter drawings"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {designProjects.map((project: any) => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.designProjectName || project.projectName} ({project.projectCode}) – {project.customerName || project.projectName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <Label htmlFor="revision-toggle" className="text-sm font-medium text-gray-700">
                  Show All Revisions
                </Label>
                <Switch 
                  id="revision-toggle"
                  checked={showAllRevisions} 
                  onCheckedChange={setShowAllRevisions}
                />
                <span className="text-sm text-gray-500">
                  {showAllRevisions ? "All Revisions" : "Current Only"}
                </span>
              </div>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedProjectId(null);
                    setShowAllRevisions(false);
                    setSearchTerm('');
                    setCategoryFilter('all');
                    setStatusFilter('all');
                    queryClient.invalidateQueries({ queryKey: ['/api/design/drawings'] });
                    toast({
                      title: "Filters Reset",
                      description: "All filters have been cleared and data refreshed.",
                    });
                  }}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="project-basic-drawings" className="flex items-center gap-1">
              <FileText className="w-4 h-4" />
              Project Basic Drawings
            </TabsTrigger>
            <TabsTrigger value="process-engineering" className="flex items-center gap-1">
              <Settings className="w-4 h-4" />
              Process Engineering
            </TabsTrigger>
            <TabsTrigger value="mechanical-piping" className="flex items-center gap-1">
              <Cog className="w-4 h-4" />
              Mechanical & Piping
            </TabsTrigger>
            <TabsTrigger value="civil-structural" className="flex items-center gap-1">
              <Building className="w-4 h-4" />
              Civil & Structural
            </TabsTrigger>
            <TabsTrigger value="electrical-instrumentation" className="flex items-center gap-1">
              <Zap className="w-4 h-4" />
              Electrical & Instrumentation
            </TabsTrigger>
            <TabsTrigger value="project-drawings" className="flex items-center gap-1">
              <FolderOpen className="w-4 h-4" />
              Project Drawings
            </TabsTrigger>
            <TabsTrigger value="project-backup" className="flex items-center gap-1">
              <FileImage className="w-4 h-4" />
              Project Backup
            </TabsTrigger>
          </TabsList>

          <TabsContent value="project-basic-drawings" className="space-y-4">
            <DisciplineSection 
              disciplineName="Project Basic Drawings"
              disciplineKey="basic"
              icon={FileText}
              color="text-blue-600"
              selectedProjectId={selectedProjectId}
              showAllRevisions={showAllRevisions}
              types={[
                "General Arrangement Drawing",
                "Process Flow Diagram",
                "3D STEP_A",
                "3D eDrawings_A",
                "3D STEP_B",
                "3D eDrawings_B",
                "3D STEP_C",
                "3D eDrawings_C"
              ]}
            />
          </TabsContent>

          <TabsContent value="process-engineering" className="space-y-4">
            <DisciplineSection 
              disciplineName="Process Engineering"
              disciplineKey="process"
              icon={Settings}
              color="text-blue-600"
              selectedProjectId={selectedProjectId}
              showAllRevisions={showAllRevisions}
              types={[
                "Process Flow Diagram (PFD)",
                "Piping and Instrumentation Diagram (P&ID)"
              ]}
            />
          </TabsContent>

          <TabsContent value="mechanical-piping" className="space-y-4">
            <DisciplineSection 
              disciplineName="Mechanical & Piping"
              disciplineKey="mechanical"
              icon={Cog}
              color="text-green-600"
              selectedProjectId={selectedProjectId}
              showAllRevisions={showAllRevisions}
              types={[
                "Piping General Arrangement (GA) Drawing",
                "Piping Isometric Drawings"
              ]}
            />
          </TabsContent>

          <TabsContent value="civil-structural" className="space-y-4">
            <DisciplineSection 
              disciplineName="Civil & Structural"
              disciplineKey="civil"
              icon={Building}
              color="text-orange-600"
              selectedProjectId={selectedProjectId}
              showAllRevisions={showAllRevisions}
              types={[
                "Plot Plan",
                "Foundation Layout Drawings"
              ]}
            />
          </TabsContent>

          <TabsContent value="electrical-instrumentation" className="space-y-4">
            <DisciplineSection 
              disciplineName="Electrical & Instrumentation"
              disciplineKey="electrical"
              icon={Zap}
              color="text-purple-600"
              selectedProjectId={selectedProjectId}
              showAllRevisions={showAllRevisions}
              types={[
                "Single Line Diagram (SLD)",
                "Electrical Layout Drawings",
                "Cable Tray & Conduit Layouts",
                "Instrument Loop Diagrams",
                "Instrument Hook-up Drawings"
              ]}
            />
          </TabsContent>

          <TabsContent value="project-drawings" className="space-y-4">
            <ProjectItemsSection 
              selectedProjectId={selectedProjectId}
              showAllRevisions={showAllRevisions}
            />
          </TabsContent>

          <TabsContent value="project-backup" className="space-y-4">
            <ProjectBackupSection 
              selectedProjectId={selectedProjectId}
              showAllRevisions={showAllRevisions}
            />
          </TabsContent>

        </Tabs>

        {/* Version History Dialog */}
        <Dialog open={isVersionHistoryDialogOpen} onOpenChange={setIsVersionHistoryDialogOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Version History - {selectedDrawing?.drawingNumber}</DialogTitle>
              <DialogDescription>
                {selectedDrawing?.drawingTitle}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-96 overflow-y-auto">
              {versions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No versions available for this drawing.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version</TableHead>
                      <TableHead>File Name</TableHead>
                      <TableHead>Uploaded By</TableHead>
                      <TableHead>Upload Date</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {versions.map((version: DrawingVersion) => (
                      <TableRow key={version.id}>
                        <TableCell className="font-medium">
                          v{version.version}.{version.revision}
                        </TableCell>
                        <TableCell>{version.fileName}</TableCell>
                        <TableCell>
                          {version.uploader?.firstName && version.uploader?.lastName 
                            ? `${version.uploader.firstName} ${version.uploader.lastName}`
                            : version.uploader?.username
                          }
                        </TableCell>
                        <TableCell>
                          {format(new Date(version.uploadDate), 'MMM dd, yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {version.versionNotes || 'No notes'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(version.fileUrl, '_blank')}
                            >
                              <Eye className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const link = document.createElement('a');
                                link.href = version.fileUrl;
                                link.download = version.fileName;
                                link.click();
                              }}
                            >
                              <Download className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}