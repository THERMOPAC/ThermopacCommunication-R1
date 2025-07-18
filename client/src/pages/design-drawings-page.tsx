import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, FileText, Edit, Eye, Upload } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

export default function DesignDrawingsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedDrawing, setSelectedDrawing] = useState(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all design drawings
  const { data: drawings = [], isLoading } = useQuery({
    queryKey: ['/api/design/drawings'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch projects for dropdown
  const { data: projects = [] } = useQuery({
    queryKey: ['/api/design/projects-with-integration'],
    staleTime: 5 * 60 * 1000,
  });

  // Create drawing mutation
  const createDrawingMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/design/drawings', {
      method: 'POST',
      body: data,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/design/drawings'] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Success",
        description: "Drawing record created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create drawing record",
        variant: "destructive",
      });
    },
  });

  // Filter drawings based on search term and status
  const filteredDrawings = drawings.filter((drawing: any) => {
    const matchesSearch = drawing.drawing_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         drawing.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         drawing.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || drawing.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateDrawing = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    
    const data = {
      project_id: formData.get('project_id'),
      drawing_number: formData.get('drawing_number'),
      title: formData.get('title'),
      description: formData.get('description'),
      drawing_type: formData.get('drawing_type'),
      discipline: formData.get('discipline'),
      scale: formData.get('scale'),
      sheet_size: formData.get('sheet_size'),
      status: formData.get('status') || 'draft',
    };

    createDrawingMutation.mutate(data);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'in_review': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'revised': return 'bg-blue-100 text-blue-800';
      case 'obsolete': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading drawings...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Drawing Registry</h1>
          <p className="text-gray-600">Manage engineering drawings and documentation</p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add New Drawing
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Drawing Record</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateDrawing} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="project_id">Project</Label>
                  <Select name="project_id" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project: any) => (
                        <SelectItem key={project.id} value={project.id.toString()}>
                          {project.projectCode} - {project.projectName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="drawing_number">Drawing Number</Label>
                  <Input
                    id="drawing_number"
                    name="drawing_number"
                    placeholder="e.g., DWG-2025-001"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="title">Drawing Title</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="Enter drawing title"
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  name="description"
                  placeholder="Enter drawing description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="drawing_type">Drawing Type</Label>
                  <Select name="drawing_type" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="assembly">Assembly</SelectItem>
                      <SelectItem value="detail">Detail</SelectItem>
                      <SelectItem value="schematic">Schematic</SelectItem>
                      <SelectItem value="layout">Layout</SelectItem>
                      <SelectItem value="section">Section</SelectItem>
                      <SelectItem value="elevation">Elevation</SelectItem>
                      <SelectItem value="plan">Plan</SelectItem>
                      <SelectItem value="isometric">Isometric</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="discipline">Discipline</Label>
                  <Select name="discipline" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select discipline" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mechanical">Mechanical</SelectItem>
                      <SelectItem value="electrical">Electrical</SelectItem>
                      <SelectItem value="civil">Civil</SelectItem>
                      <SelectItem value="structural">Structural</SelectItem>
                      <SelectItem value="instrumentation">Instrumentation</SelectItem>
                      <SelectItem value="piping">Piping</SelectItem>
                      <SelectItem value="hvac">HVAC</SelectItem>
                      <SelectItem value="process">Process</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="scale">Scale</Label>
                  <Input
                    id="scale"
                    name="scale"
                    placeholder="e.g., 1:100"
                  />
                </div>

                <div>
                  <Label htmlFor="sheet_size">Sheet Size</Label>
                  <Select name="sheet_size">
                    <SelectTrigger>
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A0">A0</SelectItem>
                      <SelectItem value="A1">A1</SelectItem>
                      <SelectItem value="A2">A2</SelectItem>
                      <SelectItem value="A3">A3</SelectItem>
                      <SelectItem value="A4">A4</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createDrawingMutation.isPending}>
                  {createDrawingMutation.isPending ? 'Creating...' : 'Create Drawing'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search drawings by number, title, or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="revised">Revised</SelectItem>
                  <SelectItem value="obsolete">Obsolete</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Drawings List */}
      <div className="grid gap-4">
        {filteredDrawings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No drawings found</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || statusFilter !== 'all' 
                  ? 'No drawings match your current filters'
                  : 'Get started by creating your first drawing record'
                }
              </p>
              {!searchTerm && statusFilter === 'all' && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Drawing
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredDrawings.map((drawing: any) => (
            <Card key={drawing.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {drawing.drawing_number}
                      </h3>
                      <Badge className={getStatusColor(drawing.status)}>
                        {drawing.status?.replace('_', ' ').toUpperCase()}
                      </Badge>
                      {drawing.discipline && (
                        <Badge variant="outline">
                          {drawing.discipline}
                        </Badge>
                      )}
                    </div>
                    <p className="text-gray-900 font-medium mb-1">{drawing.title}</p>
                    {drawing.description && (
                      <p className="text-gray-600 text-sm mb-2">{drawing.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      {drawing.project_name && (
                        <span>Project: {drawing.project_name}</span>
                      )}
                      {drawing.drawing_type && (
                        <span>Type: {drawing.drawing_type}</span>
                      )}
                      {drawing.scale && (
                        <span>Scale: {drawing.scale}</span>
                      )}
                      {drawing.sheet_size && (
                        <span>Size: {drawing.sheet_size}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm">
                      <Upload className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}