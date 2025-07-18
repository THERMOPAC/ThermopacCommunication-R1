import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, LayoutTemplate, Download, Eye, Edit } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

export default function DesignStandardsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all design standards
  const { data: standards = [], isLoading } = useQuery({
    queryKey: ['/api/design/standards'],
    staleTime: 5 * 60 * 1000,
  });

  // Create standard mutation
  const createStandardMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/design/standards', {
      method: 'POST',
      body: data,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/design/standards'] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Success",
        description: "Design standard created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create design standard",
        variant: "destructive",
      });
    },
  });

  // Filter standards based on search term and category
  const filteredStandards = standards.filter((standard: any) => {
    const matchesSearch = standard.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         standard.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         standard.standard_code?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || standard.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleCreateStandard = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    
    const data = {
      title: formData.get('title'),
      description: formData.get('description'),
      standard_code: formData.get('standard_code'),
      category: formData.get('category'),
      version: formData.get('version') || '1.0',
      is_active: true,
      content: formData.get('content'),
    };

    createStandardMutation.mutate(data);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'drawing_templates': return 'bg-blue-100 text-blue-800';
      case 'cad_standards': return 'bg-green-100 text-green-800';
      case 'design_guidelines': return 'bg-purple-100 text-purple-800';
      case 'material_standards': return 'bg-orange-100 text-orange-800';
      case 'safety_standards': return 'bg-red-100 text-red-800';
      case 'quality_standards': return 'bg-yellow-100 text-yellow-800';
      case 'regulatory_standards': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading design standards...</p>
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
          <h1 className="text-3xl font-bold text-gray-900">Design Standards</h1>
          <p className="text-gray-600">Manage design templates, guidelines, and standards</p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Standard
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Design Standard</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateStandard} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    name="title"
                    placeholder="Enter standard title"
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="standard_code">Standard Code</Label>
                  <Input
                    id="standard_code"
                    name="standard_code"
                    placeholder="e.g., DRW-STD-001"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Enter standard description"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select name="category" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="drawing_templates">Drawing Templates</SelectItem>
                      <SelectItem value="cad_standards">CAD Standards</SelectItem>
                      <SelectItem value="design_guidelines">Design Guidelines</SelectItem>
                      <SelectItem value="material_standards">Material Standards</SelectItem>
                      <SelectItem value="safety_standards">Safety Standards</SelectItem>
                      <SelectItem value="quality_standards">Quality Standards</SelectItem>
                      <SelectItem value="regulatory_standards">Regulatory Standards</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="version">Version</Label>
                  <Input
                    id="version"
                    name="version"
                    placeholder="e.g., 1.0"
                    defaultValue="1.0"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="content">Content/Guidelines</Label>
                <Textarea
                  id="content"
                  name="content"
                  placeholder="Enter detailed content, guidelines, or specifications"
                  rows={6}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createStandardMutation.isPending}>
                  {createStandardMutation.isPending ? 'Creating...' : 'Create Standard'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { category: 'drawing_templates', label: 'Drawing Templates', icon: LayoutTemplate },
          { category: 'cad_standards', label: 'CAD Standards', icon: LayoutTemplate },
          { category: 'design_guidelines', label: 'Design Guidelines', icon: LayoutTemplate },
          { category: 'material_standards', label: 'Material Standards', icon: LayoutTemplate },
        ].map(({ category, label, icon: Icon }) => (
          <Card key={category}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{label}</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {standards.filter((s: any) => s.category === category).length}
                  </p>
                </div>
                <Icon className="h-8 w-8 text-gray-600" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search standards by title, code, or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="drawing_templates">Drawing Templates</SelectItem>
                  <SelectItem value="cad_standards">CAD Standards</SelectItem>
                  <SelectItem value="design_guidelines">Design Guidelines</SelectItem>
                  <SelectItem value="material_standards">Material Standards</SelectItem>
                  <SelectItem value="safety_standards">Safety Standards</SelectItem>
                  <SelectItem value="quality_standards">Quality Standards</SelectItem>
                  <SelectItem value="regulatory_standards">Regulatory Standards</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Standards List */}
      <div className="grid gap-4">
        {filteredStandards.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <LayoutTemplate className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No design standards found</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || categoryFilter !== 'all' 
                  ? 'No standards match your current filters'
                  : 'Get started by creating your first design standard'
                }
              </p>
              {!searchTerm && categoryFilter === 'all' && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Standard
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredStandards.map((standard: any) => (
            <Card key={standard.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {standard.title}
                      </h3>
                      {standard.standard_code && (
                        <Badge variant="outline">
                          {standard.standard_code}
                        </Badge>
                      )}
                      <Badge className={getCategoryColor(standard.category)}>
                        {standard.category?.replace('_', ' ').toUpperCase()}
                      </Badge>
                      {standard.version && (
                        <Badge variant="secondary">
                          v{standard.version}
                        </Badge>
                      )}
                    </div>
                    
                    {standard.description && (
                      <p className="text-gray-600 text-sm mb-3">{standard.description}</p>
                    )}
                    
                    {standard.content && (
                      <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded-md mb-3">
                        <p className="line-clamp-3">{standard.content}</p>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>Created: {new Date(standard.created_at).toLocaleDateString()}</span>
                      {standard.updated_at && standard.updated_at !== standard.created_at && (
                        <span>Updated: {new Date(standard.updated_at).toLocaleDateString()}</span>
                      )}
                      <span className={`px-2 py-1 rounded text-xs ${
                        standard.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {standard.is_active ? 'Active' : 'Inactive'}
                      </span>
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
                      <Download className="h-4 w-4" />
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