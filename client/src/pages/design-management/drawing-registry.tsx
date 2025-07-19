import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Edit
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

export default function DrawingRegistryPage() {
  const [selectedTab, setSelectedTab] = useState('drawings');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedDrawing, setSelectedDrawing] = useState<DesignDrawing | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isVersionHistoryDialogOpen, setIsVersionHistoryDialogOpen] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch drawings with filters
  const { data: drawings = [], isLoading: drawingsLoading } = useQuery({
    queryKey: ['/api/design/drawings', searchTerm, categoryFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (categoryFilter) params.append('category', categoryFilter);
      if (statusFilter) params.append('status', statusFilter);
      
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="drawings">All Drawings</TabsTrigger>
            <TabsTrigger value="categories">By Category</TabsTrigger>
            <TabsTrigger value="projects">By Project</TabsTrigger>
          </TabsList>

          <TabsContent value="drawings" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                    <Input
                      placeholder="Search drawings..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Categories</SelectItem>
                      <SelectItem value="P&ID">P&ID</SelectItem>
                      <SelectItem value="Equipment_Layout">Equipment Layout</SelectItem>
                      <SelectItem value="Piping">Piping</SelectItem>
                      <SelectItem value="Electrical">Electrical</SelectItem>
                      <SelectItem value="Civil">Civil</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Status</SelectItem>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Draft">Draft</SelectItem>
                      <SelectItem value="Under Review">Under Review</SelectItem>
                      <SelectItem value="Archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => { setSearchTerm(''); setCategoryFilter(''); setStatusFilter(''); }}>
                    Clear Filters
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Drawings Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Drawing Registry ({drawings.length} drawings)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {drawingsLoading ? (
                  <div className="text-center py-8">Loading drawings...</div>
                ) : drawings.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No drawings found. Upload your first drawing to get started.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Drawing Number</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Current Version</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {drawings.map((drawing: DesignDrawing) => (
                        <TableRow key={drawing.id}>
                          <TableCell className="font-medium">
                            {drawing.drawingNumber}
                          </TableCell>
                          <TableCell>{drawing.drawingTitle}</TableCell>
                          <TableCell>
                            <Badge className={getCategoryBadgeColor(drawing.category)}>
                              {drawing.category}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div className="font-medium">{drawing.project?.projectName}</div>
                              <div className="text-gray-500">{drawing.project?.clientName}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusBadgeColor(drawing.status)}>
                              {drawing.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {drawing.currentVersion ? (
                              <div className="text-sm">
                                <div>v{drawing.currentVersion.version}.{drawing.currentVersion.revision}</div>
                                <div className="text-gray-500">{drawing.currentVersion.fileName}</div>
                              </div>
                            ) : (
                              <span className="text-gray-400">No versions</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {format(new Date(drawing.updatedAt), 'MMM dd, yyyy')}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {drawing.currentVersion && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => window.open(drawing.currentVersion!.fileUrl, '_blank')}
                                >
                                  <Eye className="w-3 h-3" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedDrawing(drawing);
                                  setIsVersionHistoryDialogOpen(true);
                                }}
                              >
                                <History className="w-3 h-3" />
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
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {['P&ID', 'Equipment_Layout', 'Piping', 'Electrical', 'Civil'].map((category) => {
                const categoryDrawings = drawings.filter((d: DesignDrawing) => d.category === category);
                return (
                  <Card key={category}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <FolderOpen className="w-5 h-5" />
                          {category.replace('_', ' ')}
                        </span>
                        <Badge variant="secondary">{categoryDrawings.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {categoryDrawings.length === 0 ? (
                        <p className="text-gray-500 text-sm">No drawings in this category</p>
                      ) : (
                        <div className="space-y-2">
                          {categoryDrawings.slice(0, 5).map((drawing: DesignDrawing) => (
                            <div key={drawing.id} className="flex items-center justify-between text-sm">
                              <div>
                                <div className="font-medium">{drawing.drawingNumber}</div>
                                <div className="text-gray-500 truncate">{drawing.drawingTitle}</div>
                              </div>
                              <Badge className={getStatusBadgeColor(drawing.status)} variant="outline">
                                {drawing.status}
                              </Badge>
                            </div>
                          ))}
                          {categoryDrawings.length > 5 && (
                            <div className="text-center">
                              <Button variant="link" size="sm" onClick={() => {
                                setCategoryFilter(category);
                                setSelectedTab('drawings');
                              }}>
                                View all {categoryDrawings.length} drawings
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="projects" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {designProjects.map((project: any) => {
                const projectDrawings = drawings.filter((d: DesignDrawing) => d.designProjectId === project.id);
                return (
                  <Card key={project.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <FolderOpen className="w-5 h-5" />
                          <div className="text-left">
                            <div className="text-sm font-medium">{project.designProjectName}</div>
                            <div className="text-xs text-gray-500">{project.projectName}</div>
                          </div>
                        </span>
                        <Badge variant="secondary">{projectDrawings.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {projectDrawings.length === 0 ? (
                        <p className="text-gray-500 text-sm">No drawings for this project</p>
                      ) : (
                        <div className="space-y-2">
                          {projectDrawings.slice(0, 3).map((drawing: DesignDrawing) => (
                            <div key={drawing.id} className="flex items-center justify-between text-sm">
                              <div>
                                <div className="font-medium">{drawing.drawingNumber}</div>
                                <div className="text-gray-500">{drawing.category}</div>
                              </div>
                              <Badge className={getStatusBadgeColor(drawing.status)} variant="outline">
                                {drawing.status}
                              </Badge>
                            </div>
                          ))}
                          {projectDrawings.length > 3 && (
                            <div className="text-center">
                              <Button variant="link" size="sm">
                                View all {projectDrawings.length} drawings
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
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