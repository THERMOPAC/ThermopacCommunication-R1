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
  Trash2,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';

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
  const deleteMutation = useMutation({
    mutationFn: async (drawingId: string) => {
      const response = await fetch(`/api/design/basic-drawings/${drawingId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete drawing');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/design/basic-drawings'] });
      toast({ title: "Success", description: "Drawing deleted successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete drawing",
        variant: "destructive"
      });
    }
  });

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
      const response = await fetch(`/api/design/basic-drawings/${drawing.id}/download`);
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = drawing.fileName || `${drawing.drawingType}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to download drawing",
        variant: "destructive"
      });
    }
  };

  const handleDelete = (drawingId: string) => {
    if (confirm('Are you sure you want to delete this drawing?')) {
      deleteMutation.mutate(drawingId);
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
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => handleDelete(drawing.id)}
                                      className="text-red-600 hover:text-red-700"
                                    >
                                      <Trash2 className="w-3 h-3" />
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
  const [selectedTab, setSelectedTab] = useState('basic-drawings');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
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

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="basic-drawings">Project Basic Drawings</TabsTrigger>
          </TabsList>


          <TabsContent value="basic-drawings" className="space-y-4">
            <ProjectBasicDrawingsSection />
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